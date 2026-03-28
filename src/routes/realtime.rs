use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
    routing::get,
};
use axum_extra::extract::CookieJar;

use crate::{auth, error::AppResult, routes::parties, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/events", get(events))
}

async fn events(
    State(state): State<AppState>,
    jar: CookieJar,
    ws: WebSocketUpgrade,
) -> AppResult<Response> {
    let user = auth::require_user_from_jar(&state, &jar).await?;

    Ok(ws.on_upgrade(move |socket| handle_socket(state, user, socket)))
}

async fn handle_socket(
    state: AppState,
    user: crate::models::db::UserRecord,
    mut socket: WebSocket,
) {
    let mut events = state.events.subscribe();
    let connected_presence = state.presence.connect(user.id).await;
    parties::emit_presence_for_user(&state, &user, Some(connected_presence)).await;

    loop {
        tokio::select! {
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        tracing::debug!(?error, "websocket closed with error");
                        break;
                    }
                }
            }
            outbound = events.recv() => {
                match outbound {
                    Ok(event) => {
                        match serde_json::to_string(&event) {
                            Ok(payload) => {
                                if socket.send(Message::Text(payload.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(error) => tracing::error!(?error, "failed to serialize websocket event"),
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::warn!(skipped, "websocket client lagged behind realtime events");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    let disconnect = state.presence.disconnect(user.id).await;
    if disconnect.became_offline {
        if let Err(error) = parties::finalize_disconnect(&state, &user).await {
            tracing::error!(?error, "failed to finalize disconnect");
        }
    } else {
        parties::emit_presence_for_user(&state, &user, Some(disconnect.presence)).await;
    }
}
