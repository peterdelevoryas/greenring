use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use crate::{
    config::Config,
    models::api::{PresenceStatus, ServerEvent},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: sqlx::PgPool,
    pub events: broadcast::Sender<ServerEvent>,
    pub presence: PresenceStore,
}

impl AppState {
    pub fn new(config: Config, db: sqlx::PgPool) -> Self {
        let (events, _) = broadcast::channel(256);

        Self {
            config: Arc::new(config),
            db,
            events,
            presence: PresenceStore::default(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct PresenceStore {
    inner: Arc<RwLock<HashMap<Uuid, PresenceEntry>>>,
}

#[derive(Debug, Clone)]
struct PresenceEntry {
    connection_count: usize,
    active_party_id: Option<Uuid>,
    joined_at: Option<DateTime<Utc>>,
    status: PresenceStatus,
}

#[derive(Debug, Clone)]
pub struct PresenceSnapshot {
    pub status: PresenceStatus,
}

#[derive(Debug, Clone)]
pub struct DisconnectOutcome {
    pub presence: PresenceSnapshot,
    pub became_offline: bool,
}

impl PresenceStore {
    pub async fn connect(&self, user_id: Uuid) -> PresenceSnapshot {
        let mut guard = self.inner.write().await;
        let entry = guard.entry(user_id).or_insert(PresenceEntry {
            connection_count: 0,
            active_party_id: None,
            joined_at: None,
            status: PresenceStatus::Online,
        });
        entry.connection_count += 1;
        entry.status = PresenceStatus::Online;

        snapshot(entry)
    }

    pub async fn disconnect(&self, user_id: Uuid) -> DisconnectOutcome {
        let mut guard = self.inner.write().await;
        let Some(entry) = guard.get_mut(&user_id) else {
            return DisconnectOutcome {
                presence: PresenceSnapshot {
                    status: PresenceStatus::Offline,
                },
                became_offline: false,
            };
        };

        if entry.connection_count > 0 {
            entry.connection_count -= 1;
        }
        let became_offline = entry.connection_count == 0;

        if became_offline {
            guard.remove(&user_id);
            DisconnectOutcome {
                presence: PresenceSnapshot {
                    status: PresenceStatus::Offline,
                },
                became_offline: true,
            }
        } else {
            DisconnectOutcome {
                presence: snapshot(entry),
                became_offline: false,
            }
        }
    }

    pub async fn set_active_party(
        &self,
        user_id: Uuid,
        active_party_id: Option<Uuid>,
    ) -> PresenceSnapshot {
        let mut guard = self.inner.write().await;
        let entry = guard.entry(user_id).or_insert(PresenceEntry {
            connection_count: 0,
            active_party_id: None,
            joined_at: None,
            status: PresenceStatus::Online,
        });

        entry.active_party_id = active_party_id;
        entry.joined_at = active_party_id.map(|_| Utc::now());
        if entry.connection_count > 0 {
            entry.status = PresenceStatus::Online;
        }

        snapshot(entry)
    }

    pub async fn set_status(&self, user_id: Uuid, status: PresenceStatus) -> PresenceSnapshot {
        let mut guard = self.inner.write().await;
        let Some(entry) = guard.get_mut(&user_id) else {
            return PresenceSnapshot {
                status: PresenceStatus::Offline,
            };
        };

        if entry.connection_count > 0 {
            entry.status = status;
        }

        snapshot(entry)
    }

    pub async fn get(&self, user_id: Uuid) -> Option<PresenceSnapshot> {
        let guard = self.inner.read().await;
        guard.get(&user_id).map(snapshot)
    }

    pub async fn all(&self) -> HashMap<Uuid, PresenceSnapshot> {
        let guard = self.inner.read().await;
        guard
            .iter()
            .map(|(user_id, entry)| (*user_id, snapshot(entry)))
            .collect()
    }
}

fn snapshot(entry: &PresenceEntry) -> PresenceSnapshot {
    let online = entry.connection_count > 0;

    PresenceSnapshot {
        status: if online {
            entry.status.clone()
        } else {
            PresenceStatus::Offline
        },
    }
}

#[cfg(test)]
mod tests {
    use super::PresenceStore;
    use uuid::Uuid;

    #[tokio::test]
    async fn presence_tracks_active_party_and_disconnects() {
        let store = PresenceStore::default();
        let user_id = Uuid::new_v4();
        let party_id = Uuid::new_v4();

        let initial = store.connect(user_id).await;
        assert_eq!(initial.status, crate::models::api::PresenceStatus::Online);

        let with_party = store.set_active_party(user_id, Some(party_id)).await;
        assert_eq!(
            with_party.status,
            crate::models::api::PresenceStatus::Online
        );

        let disconnect = store.disconnect(user_id).await;
        assert!(disconnect.became_offline);
        assert_eq!(
            disconnect.presence.status,
            crate::models::api::PresenceStatus::Offline
        );
    }

    #[tokio::test]
    async fn presence_tracks_away_status_for_connected_users() {
        let store = PresenceStore::default();
        let user_id = Uuid::new_v4();

        store.connect(user_id).await;
        let away = store
            .set_status(user_id, crate::models::api::PresenceStatus::Away)
            .await;
        assert_eq!(away.status, crate::models::api::PresenceStatus::Away);

        let online = store
            .set_status(user_id, crate::models::api::PresenceStatus::Online)
            .await;
        assert_eq!(online.status, crate::models::api::PresenceStatus::Online);
    }
}
