use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use uuid::Uuid;

use crate::{
    auth,
    error::{AppError, AppResult},
    livekit,
    models::{
        api::{
            CreateMessageRequest, CreatePartyRequest, FriendPresence, HomeResponse,
            LiveKitJoinGrant, MessageCreatedPayload, MessageListResponse, PartyJoinedPayload,
            PartyLeftPayload, PartyMemberSummary, PartySummary, PartyUpdatedPayload,
            PresenceStatus, PresenceUpdatedPayload, ProfileUpdatedPayload, ServerEvent,
        },
        db::{CurrentMembershipRow, PartyMessageRow, PartyRecord, PartyStatsRow, UserRecord},
    },
    state::{AppState, PresenceSnapshot},
};

const VOICE_LIMIT: u8 = 8;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(home).post(create_party))
        .route("/{party_id}/join", post(join_party))
        .route("/{party_id}/leave", post(leave_party))
        .route(
            "/{party_id}/messages",
            get(list_messages).post(post_message),
        )
        .route("/{party_id}/livekit-token", post(issue_livekit_token))
}

async fn home(State(state): State<AppState>, jar: CookieJar) -> AppResult<Json<HomeResponse>> {
    let current_user = auth::require_user_from_jar(&state, &jar).await?;
    let response = build_home_response(&state, &current_user).await?;

    Ok(Json(response))
}

async fn create_party(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<CreatePartyRequest>,
) -> AppResult<(StatusCode, Json<PartySummary>)> {
    let user = auth::require_user_from_jar(&state, &jar).await?;
    validate_party_name(&request.name)?;

    let party = sqlx::query_as::<_, PartyRecord>(
        r#"
        INSERT INTO parties (id, name, created_by)
        VALUES ($1, $2, $3)
        RETURNING id, name, created_by, created_at, updated_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(request.name.trim())
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    let summary = build_party_summary(&state, &party).await?;
    broadcast(
        &state,
        ServerEvent::PartyCreated(PartyUpdatedPayload {
            party: summary.clone(),
        }),
    );

    Ok((StatusCode::CREATED, Json(summary)))
}

async fn join_party(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(party_id): Path<Uuid>,
) -> AppResult<Json<PartySummary>> {
    let user = auth::require_user_from_jar(&state, &jar).await?;
    let party = fetch_party(&state, party_id).await?;
    let current_membership = fetch_current_membership_for_user(&state, user.id).await?;
    let previous_party_id = current_membership
        .as_ref()
        .map(|membership| membership.party_id);

    if previous_party_id == Some(party_id) {
        return Ok(Json(build_party_summary(&state, &party).await?));
    }

    if active_member_count(&state, party_id).await >= VOICE_LIMIT as usize {
        return Err(AppError::conflict("party is full"));
    }

    if let Some(old_party_id) = previous_party_id {
        leave_active_party_internal(&state, &user, old_party_id).await?;
    }

    sqlx::query(
        r#"
        INSERT INTO party_memberships (id, party_id, user_id, joined_at, left_at)
        VALUES ($1, $2, $3, $4, NULL)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(party.id)
    .bind(user.id)
    .bind(Utc::now())
    .execute(&state.db)
    .await?;

    let presence = state
        .presence
        .set_active_party(user.id, Some(party.id))
        .await;
    touch_party(&state, party.id).await?;

    emit_presence_for_user(&state, &user, Some(presence)).await;
    broadcast(
        &state,
        ServerEvent::PartyJoined(PartyJoinedPayload {
            party_id: party.id,
            user: user.summary(),
            joined_at: Utc::now(),
        }),
    );
    emit_party_updated(&state, party.id).await?;

    Ok(Json(build_party_summary(&state, &party).await?))
}

async fn leave_party(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(party_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let user = auth::require_user_from_jar(&state, &jar).await?;
    let current_membership = fetch_current_membership_for_user(&state, user.id).await?;

    if current_membership
        .as_ref()
        .map(|membership| membership.party_id)
        != Some(party_id)
    {
        return Err(AppError::conflict("you are not currently in that party"));
    }

    leave_active_party_internal(&state, &user, party_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_messages(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(party_id): Path<Uuid>,
) -> AppResult<Json<MessageListResponse>> {
    let _user = auth::require_user_from_jar(&state, &jar).await?;
    fetch_party(&state, party_id).await?;

    let messages = sqlx::query_as::<_, PartyMessageRow>(
        r#"
        SELECT
            m.id,
            m.party_id,
            m.user_id,
            m.body,
            m.created_at,
            u.username,
            u.display_name,
            u.role,
            u.avatar_key
        FROM party_messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.party_id = $1
        ORDER BY m.created_at ASC
        LIMIT 100
        "#,
    )
    .bind(party_id)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(PartyMessageRow::into_api)
    .collect();

    Ok(Json(MessageListResponse { messages }))
}

async fn post_message(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(party_id): Path<Uuid>,
    Json(request): Json<CreateMessageRequest>,
) -> AppResult<(StatusCode, Json<crate::models::api::PartyMessage>)> {
    let user = auth::require_user_from_jar(&state, &jar).await?;
    let body = request.body.trim();
    validate_message_body(body)?;
    fetch_party(&state, party_id).await?;

    if fetch_current_membership_for_user(&state, user.id)
        .await?
        .as_ref()
        .map(|membership| membership.party_id)
        != Some(party_id)
    {
        return Err(AppError::conflict("join the party before sending messages"));
    }

    let row = sqlx::query_as::<_, PartyMessageRow>(
        r#"
        INSERT INTO party_messages (id, party_id, user_id, body)
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            party_id,
            user_id,
            body,
            created_at,
            $5 AS username,
            $6 AS display_name,
            $7 AS role,
            $8 AS avatar_key
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(party_id)
    .bind(user.id)
    .bind(body)
    .bind(&user.username)
    .bind(&user.display_name)
    .bind(&user.role)
    .bind(&user.avatar_key)
    .fetch_one(&state.db)
    .await?;

    touch_party(&state, party_id).await?;
    let message = row.into_api();

    broadcast(
        &state,
        ServerEvent::MessageCreated(MessageCreatedPayload {
            message: message.clone(),
        }),
    );
    emit_party_updated(&state, party_id).await?;

    Ok((StatusCode::CREATED, Json(message)))
}

async fn issue_livekit_token(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(party_id): Path<Uuid>,
) -> AppResult<Json<LiveKitJoinGrant>> {
    let user = auth::require_user_from_jar(&state, &jar).await?;
    let party = fetch_party(&state, party_id).await?;

    if fetch_current_membership_for_user(&state, user.id)
        .await?
        .as_ref()
        .map(|membership| membership.party_id)
        != Some(party_id)
    {
        return Err(AppError::conflict(
            "join the party before requesting a voice token",
        ));
    }

    let grant = livekit::issue_join_grant(&state.config, &user, &party)?;

    Ok(Json(grant))
}

pub async fn emit_presence_for_user(
    state: &AppState,
    user: &UserRecord,
    presence: Option<PresenceSnapshot>,
) {
    let presence = match presence {
        Some(presence) => Some(presence),
        None => state.presence.get(user.id).await,
    };
    let active_party_id = fetch_current_membership_for_user(state, user.id)
        .await
        .ok()
        .flatten()
        .map(|membership| membership.party_id);
    broadcast(
        state,
        ServerEvent::PresenceUpdated(PresenceUpdatedPayload {
            presence: build_friend_presence(user, presence.as_ref(), active_party_id),
        }),
    );
}

pub async fn emit_profile_updated(state: &AppState, user: &UserRecord) {
    broadcast(
        state,
        ServerEvent::ProfileUpdated(ProfileUpdatedPayload {
            user: user.summary(),
        }),
    );
}

pub async fn finalize_disconnect(state: &AppState, user: &UserRecord) -> AppResult<()> {
    if let Some(membership) = fetch_current_membership_for_user(state, user.id).await? {
        leave_active_party_internal(state, user, membership.party_id).await?;
    }

    emit_presence_for_user(state, user, None).await;
    Ok(())
}

async fn leave_active_party_internal(
    state: &AppState,
    user: &UserRecord,
    party_id: Uuid,
) -> AppResult<()> {
    let left_at = Utc::now();

    sqlx::query(
        r#"
        UPDATE party_memberships
        SET left_at = COALESCE(left_at, $1)
        WHERE user_id = $2 AND party_id = $3 AND left_at IS NULL
        "#,
    )
    .bind(left_at)
    .bind(user.id)
    .bind(party_id)
    .execute(&state.db)
    .await?;

    let presence = state.presence.set_active_party(user.id, None).await;
    touch_party(state, party_id).await?;

    emit_presence_for_user(state, user, Some(presence)).await;
    broadcast(
        state,
        ServerEvent::PartyLeft(PartyLeftPayload {
            party_id,
            user_id: user.id,
            left_at,
        }),
    );
    emit_party_updated(state, party_id).await?;

    Ok(())
}

async fn emit_party_updated(state: &AppState, party_id: Uuid) -> AppResult<()> {
    let party = fetch_party(state, party_id).await?;
    let summary = build_party_summary(state, &party).await?;
    broadcast(
        state,
        ServerEvent::PartyUpdated(PartyUpdatedPayload { party: summary }),
    );
    Ok(())
}

async fn build_home_response(
    state: &AppState,
    current_user: &UserRecord,
) -> AppResult<HomeResponse> {
    let users = fetch_users(state).await?;
    let presence = state.presence.all().await;
    let current_memberships = fetch_current_memberships(state).await?;
    let roster = users
        .iter()
        .map(|user| {
            build_friend_presence(
                user,
                presence.get(&user.id),
                current_memberships
                    .get(&user.id)
                    .map(|membership| membership.party_id),
            )
        })
        .collect();

    let parties = sqlx::query_as::<_, PartyRecord>(
        r#"
        SELECT id, name, created_by, created_at, updated_at
        FROM parties
        ORDER BY updated_at DESC, created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let mut party_summaries = Vec::with_capacity(parties.len());
    for party in parties {
        party_summaries.push(
            build_party_summary_with_cache(state, &party, &users, &current_memberships).await?,
        );
    }

    Ok(HomeResponse {
        current_user: current_user.summary(),
        roster,
        parties: party_summaries,
    })
}

async fn build_party_summary(state: &AppState, party: &PartyRecord) -> AppResult<PartySummary> {
    let users = fetch_users(state).await?;
    let current_memberships = fetch_current_memberships(state).await?;
    build_party_summary_with_cache(state, party, &users, &current_memberships).await
}

async fn build_party_summary_with_cache(
    state: &AppState,
    party: &PartyRecord,
    users: &[UserRecord],
    current_memberships: &HashMap<Uuid, CurrentMembershipRow>,
) -> AppResult<PartySummary> {
    let user_lookup: HashMap<Uuid, UserRecord> =
        users.iter().cloned().map(|user| (user.id, user)).collect();
    let mut active_members = current_memberships
        .iter()
        .filter_map(|(user_id, membership)| {
            if membership.party_id == party.id {
                user_lookup.get(user_id).map(|user| PartyMemberSummary {
                    user: user.summary(),
                    joined_at: membership.joined_at,
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    active_members.sort_by_key(|member| member.joined_at);

    let stats = sqlx::query_as::<_, PartyStatsRow>(
        r#"
        SELECT
            (SELECT COUNT(*) FROM party_messages WHERE party_id = $1) AS message_count,
            (SELECT body FROM party_messages WHERE party_id = $1 ORDER BY created_at DESC LIMIT 1) AS last_message_preview
        "#,
    )
    .bind(party.id)
    .fetch_one(&state.db)
    .await?;

    Ok(PartySummary {
        id: party.id,
        name: party.name.clone(),
        created_by: party.created_by,
        created_at: party.created_at,
        updated_at: party.updated_at,
        voice_limit: VOICE_LIMIT,
        active_members,
        message_count: stats.message_count,
        last_message_preview: stats.last_message_preview,
    })
}

fn build_friend_presence(
    user: &UserRecord,
    presence: Option<&PresenceSnapshot>,
    active_party_id: Option<Uuid>,
) -> FriendPresence {
    let status = match presence {
        Some(snapshot) => snapshot.status.clone(),
        _ => PresenceStatus::Offline,
    };

    FriendPresence {
        user: user.summary(),
        status,
        active_party_id,
    }
}

async fn active_member_count(state: &AppState, party_id: Uuid) -> usize {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(DISTINCT user_id)
        FROM party_memberships
        WHERE party_id = $1 AND left_at IS NULL
        "#,
    )
    .bind(party_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or_default() as usize
}

async fn fetch_users(state: &AppState) -> AppResult<Vec<UserRecord>> {
    let users = sqlx::query_as::<_, UserRecord>(
        r#"
        SELECT id, username, display_name, role, avatar_key
        FROM users
        ORDER BY LOWER(display_name), LOWER(username)
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(users)
}

async fn fetch_party(state: &AppState, party_id: Uuid) -> AppResult<PartyRecord> {
    sqlx::query_as::<_, PartyRecord>(
        r#"
        SELECT id, name, created_by, created_at, updated_at
        FROM parties
        WHERE id = $1
        "#,
    )
    .bind(party_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::not_found("party was not found"))
}

async fn fetch_current_memberships(
    state: &AppState,
) -> AppResult<HashMap<Uuid, CurrentMembershipRow>> {
    let memberships = sqlx::query_as::<_, CurrentMembershipRow>(
        r#"
        SELECT DISTINCT ON (user_id)
            user_id,
            party_id,
            joined_at
        FROM party_memberships
        WHERE left_at IS NULL
        ORDER BY user_id, joined_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(memberships
        .into_iter()
        .map(|membership| (membership.user_id, membership))
        .collect())
}

async fn fetch_current_membership_for_user(
    state: &AppState,
    user_id: Uuid,
) -> AppResult<Option<CurrentMembershipRow>> {
    sqlx::query_as::<_, CurrentMembershipRow>(
        r#"
        SELECT user_id, party_id, joined_at
        FROM party_memberships
        WHERE user_id = $1 AND left_at IS NULL
        ORDER BY joined_at DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(Into::into)
}

async fn touch_party(state: &AppState, party_id: Uuid) -> AppResult<()> {
    sqlx::query("UPDATE parties SET updated_at = NOW() WHERE id = $1")
        .bind(party_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

fn validate_party_name(name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() || name.len() > 40 {
        return Err(AppError::bad_request(
            "party name must be between 1 and 40 characters",
        ));
    }
    Ok(())
}

fn validate_message_body(body: &str) -> AppResult<()> {
    if body.is_empty() || body.len() > 500 {
        return Err(AppError::bad_request(
            "message body must be between 1 and 500 characters",
        ));
    }
    Ok(())
}

fn broadcast(state: &AppState, event: ServerEvent) {
    let _ = state.events.send(event);
}
