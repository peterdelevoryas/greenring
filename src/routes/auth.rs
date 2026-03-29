use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;

use crate::{
    auth,
    error::{AppError, AppResult},
    models::api::{LoginRequest, SessionResponse, UpdateProfileRequest},
    routes::parties,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route("/profile", post(update_profile))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<LoginRequest>,
) -> AppResult<(CookieJar, Json<SessionResponse>)> {
    let user = auth::authenticate_user(&state, &request.username, &request.password).await?;
    let session_id = auth::create_session(&state, user.id).await?;

    let jar = jar.add(auth::build_session_cookie(&state, session_id));

    Ok((
        jar,
        Json(SessionResponse {
            user: user.summary(),
        }),
    ))
}

async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<(CookieJar, StatusCode)> {
    if let Some(session_id) = auth::session_id_from_jar(&state, &jar) {
        auth::invalidate_session(&state, session_id).await?;
    }

    let jar = jar.remove(auth::build_logout_cookie(&state));
    Ok((jar, StatusCode::NO_CONTENT))
}

async fn me(State(state): State<AppState>, jar: CookieJar) -> AppResult<Json<SessionResponse>> {
    let user = auth::require_user_from_jar(&state, &jar).await?;

    Ok(Json(SessionResponse {
        user: user.summary(),
    }))
}

async fn update_profile(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<UpdateProfileRequest>,
) -> AppResult<Json<SessionResponse>> {
    let current_user = auth::require_user_from_jar(&state, &jar).await?;
    auth::validate_username(&request.username)?;
    let next_username = auth::normalize_username(&request.username);

    if next_username != current_user.username {
        let username_taken = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM users
                WHERE username = $1 AND id <> $2
            )
            "#,
        )
        .bind(&next_username)
        .bind(current_user.id)
        .fetch_one(&state.db)
        .await?;

        if username_taken {
            return Err(AppError::conflict("that username is already taken"));
        }
    }

    let user = sqlx::query_as::<_, crate::models::db::UserRecord>(
        r#"
        UPDATE users
        SET username = $2
        WHERE id = $1
        RETURNING id, username, display_name, role
        "#,
    )
    .bind(current_user.id)
    .bind(next_username)
    .fetch_one(&state.db)
    .await?;

    parties::emit_presence_for_user(&state, &user, None).await;

    Ok(Json(SessionResponse {
        user: user.summary(),
    }))
}
