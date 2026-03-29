use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum_extra::extract::{
    CookieJar,
    cookie::{Cookie, SameSite},
};
use chrono::{Duration, Utc};
use time::Duration as CookieDuration;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::db::{LoginUserRecord, UserRecord},
    state::AppState,
};

pub async fn authenticate_user(
    state: &AppState,
    username: &str,
    password: &str,
) -> AppResult<UserRecord> {
    let username = normalize_username(username);
    let user = sqlx::query_as::<_, LoginUserRecord>(
        r#"
        SELECT id, username, display_name, password_hash, role, avatar_key
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(username)
    .fetch_optional(&state.db)
    .await?;

    let Some(user) = user else {
        return Err(AppError::unauthorized("invalid username or password"));
    };

    if !verify_password(&user.password_hash, password)? {
        return Err(AppError::unauthorized("invalid username or password"));
    }

    Ok(user.into_user())
}

pub async fn create_session(state: &AppState, user_id: Uuid) -> AppResult<Uuid> {
    let session_id = Uuid::new_v4();
    let now = Utc::now();
    let expires_at = now + Duration::hours(state.config.session_ttl_hours);

    sqlx::query(
        r#"
        INSERT INTO sessions (id, user_id, created_at, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .bind(now)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(session_id)
}

pub async fn require_user_from_jar(state: &AppState, jar: &CookieJar) -> AppResult<UserRecord> {
    maybe_user_from_jar(state, jar)
        .await?
        .ok_or_else(|| AppError::unauthorized("authentication required"))
}

pub async fn maybe_user_from_jar(
    state: &AppState,
    jar: &CookieJar,
) -> AppResult<Option<UserRecord>> {
    let Some(cookie) = jar.get(&state.config.session_cookie_name) else {
        return Ok(None);
    };

    let Ok(session_id) = Uuid::parse_str(cookie.value()) else {
        return Ok(None);
    };

    let user = sqlx::query_as::<_, UserRecord>(
        r#"
        SELECT u.id, u.username, u.display_name, u.role, u.avatar_key
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > NOW()
        "#,
    )
    .bind(session_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(user)
}

pub async fn invalidate_session(state: &AppState, session_id: Uuid) -> AppResult<()> {
    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(session_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

pub fn build_session_cookie(state: &AppState, session_id: Uuid) -> Cookie<'static> {
    Cookie::build((
        state.config.session_cookie_name.clone(),
        session_id.to_string(),
    ))
    .path("/")
    .http_only(true)
    .same_site(SameSite::Lax)
    .secure(state.config.session_cookie_secure)
    .max_age(CookieDuration::hours(state.config.session_ttl_hours))
    .build()
}

pub fn build_logout_cookie(state: &AppState) -> Cookie<'static> {
    Cookie::build((state.config.session_cookie_name.clone(), String::new()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.session_cookie_secure)
        .max_age(CookieDuration::seconds(0))
        .build()
}

pub fn session_id_from_jar(state: &AppState, jar: &CookieJar) -> Option<Uuid> {
    jar.get(&state.config.session_cookie_name)
        .and_then(|cookie| Uuid::parse_str(cookie.value()).ok())
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| {
            tracing::error!(?error, "failed to hash password");
            AppError::internal("failed to hash password")
        })
}

pub fn verify_password(hash: &str, password: &str) -> AppResult<bool> {
    let parsed_hash = PasswordHash::new(hash).map_err(|error| {
        tracing::error!(?error, "invalid password hash");
        AppError::internal("stored password hash is invalid")
    })?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub fn normalize_username(input: &str) -> String {
    input.trim().to_ascii_lowercase()
}

pub fn validate_username(username: &str) -> AppResult<()> {
    let username = normalize_username(username);
    if !(3..=24).contains(&username.len()) {
        return Err(AppError::bad_request(
            "username must be between 3 and 24 characters",
        ));
    }

    if !username
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '_' || char == '-')
    {
        return Err(AppError::bad_request(
            "username may only contain letters, numbers, dashes, and underscores",
        ));
    }

    Ok(())
}

pub fn validate_display_name(display_name: &str) -> AppResult<()> {
    let display_name = display_name.trim();
    if display_name.is_empty() || display_name.len() > 32 {
        return Err(AppError::bad_request(
            "display name must be between 1 and 32 characters",
        ));
    }

    Ok(())
}

pub fn validate_password(password: &str) -> AppResult<()> {
    if password.len() < 8 {
        return Err(AppError::bad_request(
            "password must be at least 8 characters",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{hash_password, normalize_username, validate_username, verify_password};

    #[test]
    fn username_normalization_is_lowercase() {
        assert_eq!(normalize_username("  PDel_01 "), "pdel_01");
    }

    #[test]
    fn password_hash_verifies() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password(&hash, "correct horse battery staple").unwrap());
        assert!(!verify_password(&hash, "wrong").unwrap());
    }

    #[test]
    fn username_validation_rejects_symbols() {
        assert!(validate_username("bad!name").is_err());
    }
}
