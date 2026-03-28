use std::time::Duration;

use livekit_api::access_token::{AccessToken, VideoGrants};
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{
        api::LiveKitJoinGrant,
        db::{PartyRecord, UserRecord},
    },
};

pub fn issue_join_grant(
    config: &Config,
    user: &UserRecord,
    party: &PartyRecord,
) -> AppResult<LiveKitJoinGrant> {
    let room_name = room_name_for_party(party.id);
    let identity = format!("user-{}", user.id);

    let token = AccessToken::with_api_key(&config.livekit_api_key, &config.livekit_api_secret)
        .with_identity(&identity)
        .with_name(&user.display_name)
        .with_grants(VideoGrants {
            room_join: true,
            room: room_name.clone(),
            can_publish: true,
            can_subscribe: true,
            can_publish_data: true,
            ..Default::default()
        })
        .with_ttl(Duration::from_secs(30 * 60))
        .to_jwt()
        .map_err(|error| {
            tracing::error!(?error, "failed to issue livekit token");
            AppError::internal("failed to issue voice token")
        })?;

    Ok(LiveKitJoinGrant {
        token,
        ws_url: config.livekit_ws_url.clone(),
        room_name,
    })
}

pub fn room_name_for_party(party_id: Uuid) -> String {
    format!("party-{party_id}")
}

#[cfg(test)]
mod tests {
    use livekit_api::access_token::TokenVerifier;

    use super::*;
    use crate::models::db::{PartyRecord, UserRecord};
    use chrono::Utc;

    #[test]
    fn livekit_grant_targets_party_room() {
        let config = Config {
            bind_addr: "127.0.0.1:3000".parse().unwrap(),
            database_url: "postgres://ignored".to_string(),
            cors_origin: "http://localhost:5173".to_string(),
            session_cookie_name: "xpc_session".to_string(),
            session_cookie_secure: false,
            session_ttl_hours: 24,
            livekit_api_key: "test-key".to_string(),
            livekit_api_secret: "super-secret".to_string(),
            livekit_ws_url: "ws://localhost:7880".to_string(),
        };
        let user = UserRecord {
            id: Uuid::new_v4(),
            username: "player1".to_string(),
            display_name: "Player One".to_string(),
            role: "member".to_string(),
        };
        let party = PartyRecord {
            id: Uuid::new_v4(),
            name: "Nostalgia".to_string(),
            created_by: user.id,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let grant = issue_join_grant(&config, &user, &party).unwrap();
        let claims =
            TokenVerifier::with_api_key(&config.livekit_api_key, &config.livekit_api_secret)
                .verify(&grant.token)
                .unwrap();

        assert_eq!(claims.video.room, room_name_for_party(party.id));
        assert!(claims.video.room_join);
        assert_eq!(grant.ws_url, config.livekit_ws_url);
    }
}
