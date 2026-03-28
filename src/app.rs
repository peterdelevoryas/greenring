use anyhow::Context;
use axum::{
    Json, Router,
    http::{
        HeaderValue, Method,
        header::{CONTENT_TYPE, COOKIE},
    },
    routing::get,
};
use serde_json::json;
use sqlx::PgPool;
use tokio::net::TcpListener;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{config::Config, routes, state::AppState};

pub async fn serve(config: Config, db: PgPool) -> anyhow::Result<()> {
    let state = AppState::new(config, db);
    let router = build_router(state.clone())?;

    let listener = TcpListener::bind(state.config.bind_addr)
        .await
        .with_context(|| format!("failed to bind {}", state.config.bind_addr))?;

    tracing::info!(address = %state.config.bind_addr, "xbox party chat listening");

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server exited unexpectedly")
}

fn build_router(state: AppState) -> anyhow::Result<Router> {
    let cors_origin = HeaderValue::from_str(&state.config.cors_origin)
        .with_context(|| format!("invalid CORS origin: {}", state.config.cors_origin))?;

    let cors = CorsLayer::new()
        .allow_origin(cors_origin)
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([CONTENT_TYPE, COOKIE]);

    Ok(Router::new()
        .route("/health", get(health))
        .nest("/auth", routes::auth::router())
        .nest("/invites", routes::invites::router())
        .nest("/parties", routes::parties::router())
        .nest("/ws", routes::realtime::router())
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http()))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}
