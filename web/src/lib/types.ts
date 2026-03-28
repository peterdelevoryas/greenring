export type PresenceStatus = "online" | "offline";

export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
  role: string;
}

export interface FriendPresence {
  user: UserSummary;
  status: PresenceStatus;
  active_party_id: string | null;
}

export interface PartyMemberSummary {
  user: UserSummary;
  joined_at: string;
}

export interface PartySummary {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  voice_limit: number;
  active_members: PartyMemberSummary[];
  message_count: number;
  last_message_preview: string | null;
}

export interface PartyMessage {
  id: string;
  party_id: string;
  author: UserSummary;
  body: string;
  created_at: string;
}

export interface InviteSummary {
  id: string;
  code: string;
  created_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  redeemed_by: UserSummary | null;
}

export interface HomeResponse {
  current_user: UserSummary;
  roster: FriendPresence[];
  parties: PartySummary[];
}

export interface SessionResponse {
  user: UserSummary;
}

export interface MessageListResponse {
  messages: PartyMessage[];
}

export interface InviteListResponse {
  invites: InviteSummary[];
}

export interface LiveKitJoinGrant {
  token: string;
  ws_url: string;
  room_name: string;
}

export type ServerEvent =
  | {
      type: "presence.updated";
      payload: { presence: FriendPresence };
    }
  | {
      type: "party.created" | "party.updated";
      payload: { party: PartySummary };
    }
  | {
      type: "party.joined";
      payload: { party_id: string; user: UserSummary; joined_at: string };
    }
  | {
      type: "party.left";
      payload: { party_id: string; user_id: string; left_at: string };
    }
  | {
      type: "message.created";
      payload: { message: PartyMessage };
    }
  | {
      type: "invite.created";
      payload: { invite: InviteSummary };
    }
  | {
      type: "invite.revoked";
      payload: { invite_id: string };
    };
