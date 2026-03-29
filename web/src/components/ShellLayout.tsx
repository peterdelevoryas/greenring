import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, logout } from "../lib/api";
import type { PresenceStatus, UserSummary } from "../lib/types";
import { usePartySession } from "../party-session";
import { UserAvatar } from "./UserAvatar";
import { UserIdentity } from "./UserIdentity";

export function ShellLayout({
  currentUser,
  lastEventAt,
  children,
}: {
  currentUser: UserSummary;
  lastEventAt: number | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    activeParty,
    connectVoice,
    connectingVoicePartyId,
    disconnectVoice,
    home,
    leaveParty,
    leavingPartyId,
    remoteParticipants,
    setVoiceIsolationEnabled,
    voicePartyId,
    voiceIsolationEnabled,
    voiceIsolationPending,
    voiceState,
  } = usePartySession();
  const [partyError, setPartyError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const logoutMutation = useMutation({
    mutationFn: logout,
  });
  const currentPresence = home?.roster.find((entry) => entry.user.id === currentUser.id) ?? null;
  const currentStatus = currentPresence?.status ?? "online";
  const isVoiceConnected = activeParty && voiceState === "connected" && voicePartyId === activeParty.id;
  const isVoiceConnecting = activeParty && connectingVoicePartyId === activeParty.id;

  function handleError(error: unknown) {
    if (error instanceof ApiError) {
      setPartyError(error.message);
      return;
    }
    if (error instanceof Error) {
      setPartyError(error.message);
      return;
    }
    setPartyError("Request failed.");
  }

  async function handleJoinVoice() {
    if (!activeParty) {
      return;
    }

    try {
      setPartyError(null);
      await connectVoice(activeParty.id);
    } catch (error) {
      handleError(error);
    }
  }

  async function handleLeaveParty() {
    if (!activeParty) {
      return;
    }

    try {
      setPartyError(null);
      await leaveParty(activeParty.id);
    } catch (error) {
      handleError(error);
    }
  }

  async function handleToggleVoiceIsolation() {
    try {
      setPartyError(null);
      await setVoiceIsolationEnabled(!voiceIsolationEnabled);
    } catch (error) {
      handleError(error);
    }
  }

  async function handleSignOut() {
    try {
      setLogoutError(null);
      await disconnectVoice();
      await logoutMutation.mutateAsync();
      queryClient.setQueryData(["session"], null);
      queryClient.removeQueries({ queryKey: ["home"] });
      queryClient.removeQueries({ queryKey: ["messages"] });
      queryClient.removeQueries({ queryKey: ["invites"] });
      navigate("/login", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setLogoutError(error.message);
        return;
      }
      if (error instanceof Error) {
        setLogoutError(error.message);
        return;
      }
      setLogoutError("Could not sign out.");
    }
  }

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="brand-badge">
          <div className="brand-lockup">
            <img alt="" className="brand-mark" src="/greenring-mark.svg" />
            <div>
              <p className="eyebrow">Dashboard</p>
              <h1>Green Ring</h1>
            </div>
          </div>
          <p className="muted">Private voice-first hangout space for the people who were there in 2008.</p>
        </div>

        <nav className="main-nav">
          <NavItem href="/">Parties</NavItem>
          <NavItem href="/settings">Settings</NavItem>
        </nav>

        <div className="status-card">
          <p className="eyebrow">Signed in as</p>
          <UserIdentity user={currentUser} size="lg" />
          <div className="status-row">
            <span className={`presence-dot ${currentStatus}`} />
            <span>{presenceLabel(currentStatus)}</span>
          </div>
          <p className="tiny-copy">
            {lastEventAt ? `Realtime sync ${timeAgo(lastEventAt)}` : "Awaiting live sync"}
          </p>
        </div>

        <div className="status-card party-session-card">
          <p className="eyebrow">Current Party</p>
          {activeParty ? (
            <>
              <div className="party-card-header">
                <h2>{activeParty.name}</h2>
                <span className="party-pill">
                  {activeParty.active_members.length}/{activeParty.voice_limit}
                </span>
              </div>
              <p className="muted">
                {isVoiceConnected
                  ? "Voice stays live while you browse the rest of the site."
                  : "Stay in the room while you move between settings, roster, and messages."}
              </p>
              <div className="party-members compact">
                {activeParty.active_members.length > 0
                  ? activeParty.active_members.slice(0, 4).map((member) => (
                      <span className="member-chip member-chip--avatar" key={member.user.id}>
                        <UserAvatar user={member.user} size="xs" />
                        <span>{member.user.display_name}</span>
                      </span>
                    ))
                  : <span className="member-chip idle">Nobody active yet</span>}
              </div>
              <div className="party-actions">
                <NavLink className="secondary-button" to={`/party/${activeParty.id}`}>
                  Open Room
                </NavLink>
                {isVoiceConnected ? (
                  <button className="ghost-button" type="button" onClick={() => void disconnectVoice()}>
                    Leave Voice
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleJoinVoice()}
                    disabled={Boolean(isVoiceConnecting)}
                  >
                    {isVoiceConnecting ? "Connecting..." : "Join Voice"}
                  </button>
                )}
              </div>
              <div className="party-actions compact-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void handleLeaveParty()}
                  disabled={leavingPartyId === activeParty.id}
                >
                  {leavingPartyId === activeParty.id ? "Leaving Party..." : "Leave Party"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleToggleVoiceIsolation()}
                  disabled={voiceIsolationPending}
                >
                  {voiceIsolationPending
                    ? "Applying..."
                    : `Voice Isolation: ${voiceIsolationEnabled ? "On" : "Off"}`}
                </button>
              </div>
              <p className="tiny-copy">
                {voiceIsolationEnabled
                  ? "Voice isolation is on for your microphone when the browser supports it."
                  : "Voice isolation is off for your microphone. Echo cancellation and noise suppression still stay enabled."}
              </p>
              {remoteParticipants.length > 0 ? (
                <p className="tiny-copy">Listening with {remoteParticipants.join(", ")}</p>
              ) : null}
            </>
          ) : (
            <p className="muted">
              Join a party once, then move around the dashboard without losing your place.
            </p>
          )}

          {partyError ? <p className="error-text">{partyError}</p> : null}
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={() => void handleSignOut()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
        </button>
        {logoutError ? <p className="error-text">{logoutError}</p> : null}
      </aside>

      <main className="shell-main">{children}</main>
    </div>
  );
}

function NavItem({ href, children }: { href: string; children: ReactNode }) {
  return (
    <NavLink
      to={href}
      className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
    >
      {children}
    </NavLink>
  );
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function presenceLabel(status: PresenceStatus) {
  switch (status) {
    case "away":
      return "Away";
    case "offline":
      return "Offline";
    default:
      return "Connected";
  }
}
