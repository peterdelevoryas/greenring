use axum::{Json, Router, extract::State, http::StatusCode, routing::post};
use axum_extra::extract::CookieJar;

use crate::{
    auth,
    error::{AppError, AppResult},
    models::api::{PresenceStatus, UpdatePresenceRequest},
    routes::parties,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/status", post(update_status))
}

async fn update_status(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<UpdatePresenceRequest>,
) -> AppResult<StatusCode> {
    let user = auth::require_user_from_jar(&state, &jar).await?;
    if state.presence.get(user.id).await.is_none() {
        return Ok(StatusCode::NO_CONTENT);
    }

    let next_status = match request.status {
        PresenceStatus::Online | PresenceStatus::Away => request.status,
        PresenceStatus::Offline => {
            return Err(AppError::bad_request(
                "presence status cannot be set to offline explicitly",
            ));
        }
    };

    let presence = state.presence.set_status(user.id, next_status).await;
    parties::emit_presence_for_user(&state, &user, Some(presence)).await;

    Ok(StatusCode::NO_CONTENT)
}
