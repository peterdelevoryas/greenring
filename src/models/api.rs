use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserSummary {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PresenceStatus {
    Online,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendPresence {
    pub user: UserSummary,
    pub status: PresenceStatus,
    pub active_party_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyMemberSummary {
    pub user: UserSummary,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartySummary {
    pub id: Uuid,
    pub name: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub voice_limit: u8,
    pub active_members: Vec<PartyMemberSummary>,
    pub message_count: i64,
    pub last_message_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeResponse {
    pub current_user: UserSummary,
    pub roster: Vec<FriendPresence>,
    pub parties: Vec<PartySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyMessage {
    pub id: Uuid,
    pub party_id: Uuid,
    pub author: UserSummary,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageListResponse {
    pub messages: Vec<PartyMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteSummary {
    pub id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub redeemed_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub redeemed_by: Option<UserSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteListResponse {
    pub invites: Vec<InviteSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub user: UserSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveKitJoinGrant {
    pub token: String,
    pub ws_url: String,
    pub room_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemInviteRequest {
    pub code: String,
    pub username: String,
    pub display_name: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInviteRequest {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePartyRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresenceUpdatedPayload {
    pub presence: FriendPresence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyUpdatedPayload {
    pub party: PartySummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyJoinedPayload {
    pub party_id: Uuid,
    pub user: UserSummary,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyLeftPayload {
    pub party_id: Uuid,
    pub user_id: Uuid,
    pub left_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageCreatedPayload {
    pub message: PartyMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteCreatedPayload {
    pub invite: InviteSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteRevokedPayload {
    pub invite_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerEvent {
    #[serde(rename = "presence.updated")]
    PresenceUpdated(PresenceUpdatedPayload),
    #[serde(rename = "party.created")]
    PartyCreated(PartyUpdatedPayload),
    #[serde(rename = "party.updated")]
    PartyUpdated(PartyUpdatedPayload),
    #[serde(rename = "party.joined")]
    PartyJoined(PartyJoinedPayload),
    #[serde(rename = "party.left")]
    PartyLeft(PartyLeftPayload),
    #[serde(rename = "message.created")]
    MessageCreated(MessageCreatedPayload),
    #[serde(rename = "invite.created")]
    InviteCreated(InviteCreatedPayload),
    #[serde(rename = "invite.revoked")]
    InviteRevoked(InviteRevokedPayload),
}
