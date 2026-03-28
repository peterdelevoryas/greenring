use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use chrono::Utc;
use rand::{Rng, distributions::Alphanumeric, thread_rng};
use uuid::Uuid;

use crate::{
    auth,
    error::{AppError, AppResult},
    models::{
        api::{
            CreateInviteRequest, InviteCreatedPayload, InviteListResponse, InviteRevokedPayload,
            InviteSummary, RedeemInviteRequest, ServerEvent, SessionResponse,
        },
        db::{InviteListRow, InviteRecord},
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_invites).post(create_invite))
        .route("/redeem", post(redeem_invite))
        .route("/{invite_id}/revoke", post(revoke_invite))
}

async fn list_invites(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<Json<InviteListResponse>> {
    let user = require_owner(&state, &jar).await?;
    let _ = user;

    let invites = sqlx::query_as::<_, InviteListRow>(
        r#"
        SELECT
            i.id,
            i.code,
            i.created_at,
            i.redeemed_at,
            i.revoked_at,
            u.id AS redeemed_user_id,
            u.username AS redeemed_username,
            u.display_name AS redeemed_display_name,
            u.role AS redeemed_role
        FROM invites i
        LEFT JOIN users u ON u.id = i.redeemed_by
        ORDER BY i.created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(InviteListRow::into_summary)
    .collect();

    Ok(Json(InviteListResponse { invites }))
}

async fn create_invite(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(_request): Json<CreateInviteRequest>,
) -> AppResult<(StatusCode, Json<InviteSummary>)> {
    let user = require_owner(&state, &jar).await?;

    let mut invite: Option<InviteRecord> = None;
    for _ in 0..5 {
        let code = generate_invite_code();
        let created = sqlx::query_as::<_, InviteRecord>(
            r#"
            INSERT INTO invites (id, code, created_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (code) DO NOTHING
            RETURNING id, code, created_at, redeemed_at, revoked_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(code)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await?;

        if let Some(row) = created {
            invite = Some(row);
            break;
        }
    }

    let Some(invite) = invite else {
        return Err(AppError::internal("failed to create an invite code"));
    };

    let invite_summary = InviteSummary {
        id: invite.id,
        code: invite.code,
        created_at: invite.created_at,
        redeemed_at: invite.redeemed_at,
        revoked_at: invite.revoked_at,
        redeemed_by: None,
    };

    broadcast(
        &state,
        ServerEvent::InviteCreated(InviteCreatedPayload {
            invite: invite_summary.clone(),
        }),
    );

    Ok((StatusCode::CREATED, Json(invite_summary)))
}

async fn revoke_invite(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(invite_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let _user = require_owner(&state, &jar).await?;

    let updated = sqlx::query(
        r#"
        UPDATE invites
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = $1 AND redeemed_at IS NULL
        "#,
    )
    .bind(invite_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::not_found(
            "invite was not found or can no longer be revoked",
        ));
    }

    broadcast(
        &state,
        ServerEvent::InviteRevoked(InviteRevokedPayload { invite_id }),
    );

    Ok(StatusCode::NO_CONTENT)
}

async fn redeem_invite(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<RedeemInviteRequest>,
) -> AppResult<(CookieJar, Json<SessionResponse>)> {
    auth::validate_username(&request.username)?;
    auth::validate_display_name(&request.display_name)?;
    auth::validate_password(&request.password)?;

    let normalized_username = auth::normalize_username(&request.username);

    let invite = sqlx::query_as::<_, InviteRecord>(
        r#"
        SELECT id, code, created_at, redeemed_at, revoked_at
        FROM invites
        WHERE code = $1
        "#,
    )
    .bind(request.code.trim().to_ascii_uppercase())
    .fetch_optional(&state.db)
    .await?;

    let Some(invite) = invite else {
        return Err(AppError::not_found("invite code was not found"));
    };
    if invite.revoked_at.is_some() {
        return Err(AppError::conflict("invite code has been revoked"));
    }
    if invite.redeemed_at.is_some() {
        return Err(AppError::conflict("invite code has already been redeemed"));
    }

    let existing_user =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = $1")
            .bind(&normalized_username)
            .fetch_one(&state.db)
            .await?;
    if existing_user > 0 {
        return Err(AppError::conflict("username is already taken"));
    }

    let password_hash = auth::hash_password(&request.password)?;
    let mut transaction = state.db.begin().await?;

    let user = sqlx::query_as::<_, crate::models::db::UserRecord>(
        r#"
        INSERT INTO users (id, username, display_name, password_hash, role)
        VALUES ($1, $2, $3, $4, 'member')
        RETURNING id, username, display_name, role
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(normalized_username)
    .bind(request.display_name.trim())
    .bind(password_hash)
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query(
        r#"
        UPDATE invites
        SET redeemed_by = $1, redeemed_at = $2
        WHERE id = $3
        "#,
    )
    .bind(user.id)
    .bind(Utc::now())
    .bind(invite.id)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;

    let session_id = auth::create_session(&state, user.id).await?;
    let jar = jar.add(auth::build_session_cookie(&state, session_id));

    Ok((
        jar,
        Json(SessionResponse {
            user: user.summary(),
        }),
    ))
}

async fn require_owner(
    state: &AppState,
    jar: &CookieJar,
) -> AppResult<crate::models::db::UserRecord> {
    let user = auth::require_user_from_jar(state, jar).await?;
    if !user.is_owner() {
        return Err(AppError::forbidden("owner privileges required"));
    }

    Ok(user)
}

fn generate_invite_code() -> String {
    let raw: String = thread_rng()
        .sample_iter(&Alphanumeric)
        .take(10)
        .map(char::from)
        .collect::<String>()
        .to_ascii_uppercase();

    format!("XPC-{}-{}", &raw[0..5], &raw[5..10])
}

fn broadcast(state: &AppState, event: ServerEvent) {
    let _ = state.events.send(event);
}
