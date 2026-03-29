use std::{env, net::SocketAddr};

use anyhow::{Context, bail};

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub cors_origin: String,
    pub session_cookie_name: String,
    pub session_cookie_secure: bool,
    pub session_ttl_hours: i64,
    pub livekit_api_key: String,
    pub livekit_api_secret: String,
    pub livekit_ws_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let bind_addr = env::var("APP_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:3000".to_string())
            .parse()
            .context("APP_BIND_ADDR must be a valid socket address")?;

        let database_url = env::var("DATABASE_URL")
            .context("DATABASE_URL is required, e.g. postgres://postgres:postgres@localhost:5432/greenring")?;

        let cors_origin =
            env::var("APP_CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());
        let session_cookie_name =
            env::var("SESSION_COOKIE_NAME").unwrap_or_else(|_| "greenring_session".to_string());
        let session_cookie_secure = read_bool("SESSION_COOKIE_SECURE", false)?;
        let session_ttl_hours = read_i64("SESSION_TTL_HOURS", 24 * 30)?;
        if session_ttl_hours <= 0 {
            bail!("SESSION_TTL_HOURS must be positive");
        }

        let livekit_api_key = env::var("LIVEKIT_API_KEY").unwrap_or_else(|_| "devkey".to_string());
        let livekit_api_secret =
            env::var("LIVEKIT_API_SECRET").unwrap_or_else(|_| "secret".to_string());
        let livekit_ws_url =
            env::var("LIVEKIT_WS_URL").unwrap_or_else(|_| "ws://localhost:7880".to_string());

        Ok(Self {
            bind_addr,
            database_url,
            cors_origin,
            session_cookie_name,
            session_cookie_secure,
            session_ttl_hours,
            livekit_api_key,
            livekit_api_secret,
            livekit_ws_url,
        })
    }
}

fn read_bool(key: &str, default: bool) -> anyhow::Result<bool> {
    match env::var(key) {
        Ok(value) => match value.to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Ok(true),
            "0" | "false" | "no" | "off" => Ok(false),
            _ => bail!("{key} must be a boolean-like value"),
        },
        Err(env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(error).with_context(|| format!("failed to read {key}")),
    }
}

fn read_i64(key: &str, default: i64) -> anyhow::Result<i64> {
    match env::var(key) {
        Ok(value) => value
            .parse::<i64>()
            .with_context(|| format!("{key} must be an integer")),
        Err(env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(error).with_context(|| format!("failed to read {key}")),
    }
}
