mod app;
mod auth;
mod config;
mod db;
mod error;
mod livekit;
mod models;
mod routes;
mod state;

use anyhow::Context;
use clap::{Parser, Subcommand};

use crate::config::Config;

#[derive(Debug, Parser)]
#[command(author, version, about = "Xbox Party Chat backend service")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    Serve,
    BootstrapOwner {
        #[arg(long)]
        username: String,
        #[arg(long)]
        display_name: String,
        #[arg(long)]
        password: String,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let cli = Cli::parse();
    let config = Config::from_env()?;
    let pool = db::create_pool(&config.database_url)
        .await
        .context("failed to connect to postgres")?;
    db::run_migrations(&pool)
        .await
        .context("failed to run database migrations")?;

    match cli.command.unwrap_or(Command::Serve) {
        Command::Serve => app::serve(config, pool).await,
        Command::BootstrapOwner {
            username,
            display_name,
            password,
        } => {
            let owner = db::bootstrap_owner(&pool, &username, &display_name, &password).await?;
            println!(
                "Bootstrapped owner account: {} ({})",
                owner.display_name, owner.username
            );
            Ok(())
        }
    }
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "xbox_party_chat=debug,tower_http=info,axum=info".into());

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .compact()
        .init();
}
