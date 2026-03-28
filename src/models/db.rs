use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::models::api::{InviteSummary, PartyMessage, UserSummary};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRecord {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

impl UserRecord {
    pub fn summary(&self) -> UserSummary {
        UserSummary {
            id: self.id,
            username: self.username.clone(),
            display_name: self.display_name.clone(),
            role: self.role.clone(),
        }
    }

    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LoginUserRecord {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub password_hash: String,
    pub role: String,
}

impl LoginUserRecord {
    pub fn into_user(self) -> UserRecord {
        UserRecord {
            id: self.id,
            username: self.username,
            display_name: self.display_name,
            role: self.role,
        }
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PartyRecord {
    pub id: Uuid,
    pub name: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PartyStatsRow {
    pub message_count: i64,
    pub last_message_preview: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CurrentMembershipRow {
    pub user_id: Uuid,
    pub party_id: Uuid,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PartyMessageRow {
    pub id: Uuid,
    pub party_id: Uuid,
    pub user_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

impl PartyMessageRow {
    pub fn into_api(self) -> PartyMessage {
        PartyMessage {
            id: self.id,
            party_id: self.party_id,
            author: UserSummary {
                id: self.user_id,
                username: self.username,
                display_name: self.display_name,
                role: self.role,
            },
            body: self.body,
            created_at: self.created_at,
        }
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct InviteRecord {
    pub id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub redeemed_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct InviteListRow {
    pub id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub redeemed_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub redeemed_user_id: Option<Uuid>,
    pub redeemed_username: Option<String>,
    pub redeemed_display_name: Option<String>,
    pub redeemed_role: Option<String>,
}

impl InviteListRow {
    pub fn into_summary(self) -> InviteSummary {
        let redeemed_by = match (
            self.redeemed_user_id,
            self.redeemed_username,
            self.redeemed_display_name,
            self.redeemed_role,
        ) {
            (Some(id), Some(username), Some(display_name), Some(role)) => Some(UserSummary {
                id,
                username,
                display_name,
                role,
            }),
            _ => None,
        };

        InviteSummary {
            id: self.id,
            code: self.code,
            created_at: self.created_at,
            redeemed_at: self.redeemed_at,
            revoked_at: self.revoked_at,
            redeemed_by,
        }
    }
}
