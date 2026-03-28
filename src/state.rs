use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use crate::{config::Config, models::api::ServerEvent};

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
}

#[derive(Debug, Clone)]
pub struct PresenceSnapshot {
    pub online: bool,
    pub active_party_id: Option<Uuid>,
    pub joined_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct DisconnectOutcome {
    pub presence: PresenceSnapshot,
    pub previous_active_party_id: Option<Uuid>,
    pub became_offline: bool,
}

impl PresenceStore {
    pub async fn connect(&self, user_id: Uuid) -> PresenceSnapshot {
        let mut guard = self.inner.write().await;
        let entry = guard.entry(user_id).or_insert(PresenceEntry {
            connection_count: 0,
            active_party_id: None,
            joined_at: None,
        });
        entry.connection_count += 1;

        snapshot(entry)
    }

    pub async fn disconnect(&self, user_id: Uuid) -> DisconnectOutcome {
        let mut guard = self.inner.write().await;
        let Some(entry) = guard.get_mut(&user_id) else {
            return DisconnectOutcome {
                presence: PresenceSnapshot {
                    online: false,
                    active_party_id: None,
                    joined_at: None,
                },
                previous_active_party_id: None,
                became_offline: false,
            };
        };

        let previous_active_party_id = entry.active_party_id;
        if entry.connection_count > 0 {
            entry.connection_count -= 1;
        }
        let became_offline = entry.connection_count == 0;

        if became_offline {
            guard.remove(&user_id);
            DisconnectOutcome {
                presence: PresenceSnapshot {
                    online: false,
                    active_party_id: None,
                    joined_at: None,
                },
                previous_active_party_id,
                became_offline: true,
            }
        } else {
            DisconnectOutcome {
                presence: snapshot(entry),
                previous_active_party_id,
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
        });

        entry.active_party_id = active_party_id;
        entry.joined_at = active_party_id.map(|_| Utc::now());

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
        online,
        active_party_id: if online { entry.active_party_id } else { None },
        joined_at: if online { entry.joined_at } else { None },
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
        assert!(initial.online);
        assert_eq!(initial.active_party_id, None);

        let with_party = store.set_active_party(user_id, Some(party_id)).await;
        assert_eq!(with_party.active_party_id, Some(party_id));

        let disconnect = store.disconnect(user_id).await;
        assert!(disconnect.became_offline);
        assert_eq!(disconnect.previous_active_party_id, Some(party_id));
        assert!(!disconnect.presence.online);
    }
}
