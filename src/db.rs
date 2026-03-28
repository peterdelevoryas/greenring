use sqlx::{PgPool, postgres::PgPoolOptions};

use crate::{
    auth::{
        hash_password, normalize_username, validate_display_name, validate_password,
        validate_username,
    },
    error::{AppError, AppResult},
    models::db::UserRecord,
};

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub async fn bootstrap_owner(
    pool: &PgPool,
    username: &str,
    display_name: &str,
    password: &str,
) -> AppResult<UserRecord> {
    validate_username(username)?;
    validate_display_name(display_name)?;
    validate_password(password)?;

    let existing_users = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    if existing_users > 0 {
        return Err(AppError::conflict(
            "owner bootstrap is only available before any account exists",
        ));
    }

    let username = normalize_username(username);
    let password_hash = hash_password(password)?;

    let owner = sqlx::query_as::<_, UserRecord>(
        r#"
        INSERT INTO users (id, username, display_name, password_hash, role)
        VALUES ($1, $2, $3, $4, 'owner')
        RETURNING id, username, display_name, role
        "#,
    )
    .bind(uuid::Uuid::new_v4())
    .bind(username)
    .bind(display_name.trim())
    .bind(password_hash)
    .fetch_one(pool)
    .await?;

    Ok(owner)
}
