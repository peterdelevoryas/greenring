use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;

use crate::{
    auth,
    error::AppResult,
    models::api::{LoginRequest, SessionResponse},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
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
