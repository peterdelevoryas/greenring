import type {
  HomeResponse,
  InviteListResponse,
  LiveKitJoinGrant,
  MessageListResponse,
  PartyMessage,
  PartySummary,
  SessionResponse,
} from "./types";

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBase = configuredBase && configuredBase.length > 0
  ? configuredBase
  : window.location.origin;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getApiBaseUrl() {
  return apiBase;
}

export function getRealtimeUrl() {
  const url = new URL("/ws/events", apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(new URL(path, apiBase), {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const errorBody = (await response
      .json()
      .catch(() => ({ error: response.statusText }))) as { error?: string };
    throw new ApiError(response.status, errorBody.error ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getSession(): Promise<SessionResponse | null> {
  try {
    return await request<SessionResponse>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function login(input: { username: string; password: string }) {
  return request<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function redeemInvite(input: {
  code: string;
  username: string;
  display_name: string;
  password: string;
}) {
  return request<SessionResponse>("/invites/redeem", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getHome() {
  return request<HomeResponse>("/parties");
}

export function createParty(input: { name: string }) {
  return request<PartySummary>("/parties", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function joinParty(partyId: string) {
  return request<PartySummary>(`/parties/${partyId}/join`, { method: "POST" });
}

export function leaveParty(partyId: string) {
  return request<void>(`/parties/${partyId}/leave`, { method: "POST" });
}

export function getPartyMessages(partyId: string) {
  return request<MessageListResponse>(`/parties/${partyId}/messages`);
}

export function sendPartyMessage(partyId: string, body: string) {
  return request<PartyMessage>(`/parties/${partyId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function issueVoiceToken(partyId: string) {
  return request<LiveKitJoinGrant>(`/parties/${partyId}/livekit-token`, {
    method: "POST",
  });
}

export function getInvites() {
  return request<InviteListResponse>("/invites");
}

export function createInvite() {
  return request<{ code: string; id: string; created_at: string }>("/invites", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function revokeInvite(inviteId: string) {
  return request<void>(`/invites/${inviteId}/revoke`, {
    method: "POST",
  });
}
