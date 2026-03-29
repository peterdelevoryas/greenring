import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../lib/api";
import { usePartySession } from "../party-session";
import { PartyTextChat } from "../components/PartyTextChat";
import { UserAvatar } from "../components/UserAvatar";

export function PartyPage() {
  const { partyId = "" } = useParams();
  const navigate = useNavigate();
  const {
    activePartyId,
    connectingVoicePartyId,
    connectVoice,
    disconnectVoice,
    home,
    homeError,
    homeLoading,
    joinParty,
    joiningPartyId,
    leaveParty,
    leavingPartyId,
    remoteParticipants,
    voiceError,
    voiceIsolationEnabled,
    voiceIsolationPending,
    voicePartyId,
    voiceState,
    setVoiceIsolationEnabled,
  } = usePartySession();
  const [error, setError] = useState<string | null>(null);

  const isInParty = activePartyId === partyId;
  const isVoiceConnected = voiceState === "connected" && voicePartyId === partyId;
  const isVoiceConnecting = voiceState === "connecting" && connectingVoicePartyId === partyId;
  const party = home?.parties.find((entry) => entry.id === partyId) ?? null;

  function handleError(mutationError: unknown) {
    if (mutationError instanceof ApiError) {
      setError(mutationError.message);
      return;
    }
    if (mutationError instanceof Error) {
      setError(mutationError.message);
      return;
    }
    setError("Request failed.");
  }

  async function handleJoinParty() {
    try {
      setError(null);
      await joinParty(partyId);
    } catch (mutationError) {
      handleError(mutationError);
    }
  }

  async function handleLeaveParty() {
    try {
      setError(null);
      await leaveParty(partyId);
    } catch (mutationError) {
      handleError(mutationError);
    }
  }

  async function handleJoinVoice() {
    try {
      setError(null);
      await connectVoice(partyId);
    } catch {}
  }

  async function handleToggleVoiceIsolation() {
    try {
      setError(null);
      await setVoiceIsolationEnabled(!voiceIsolationEnabled);
    } catch (mutationError) {
      handleError(mutationError);
    }
  }

  if (homeLoading) {
    return <section className="content-card">Loading party room...</section>;
  }

  if (homeError || !home) {
    return (
      <section className="content-card">
        <h2>Could not load this party room</h2>
        <p className="error-text">Refresh the page or check whether the API is running.</p>
      </section>
    );
  }

  if (!party) {
    return (
      <section className="content-card">
        <h2>Party not found</h2>
        <p className="muted">
          That room may have been deleted or you may have landed on a stale URL.
        </p>
        <button className="primary-button" onClick={() => navigate("/")}>
          Back to Dashboard
        </button>
      </section>
    );
  }

  return (
    <div className="party-room-grid">
      <PartyTextChat
        currentUser={home.current_user}
        isInParty={isInParty}
        isVoiceConnected={isVoiceConnected}
        isVoiceConnecting={isVoiceConnecting}
        onConnectVoice={() => connectVoice(partyId)}
        onDisconnectVoice={disconnectVoice}
        onLeaveParty={() => leaveParty(partyId)}
        onNavigateToParties={() => navigate("/")}
        partyId={party.id}
        partyName={party.name}
      />

      <aside className="party-room-sidebar">
        <div className="content-card">
          <div className="glass-header compact">
            <p className="eyebrow">Room Controls</p>
            <h2>Stay in Party</h2>
            <p className="muted">{party.name}</p>
          </div>

          <div className="party-room-toolbar">
            {isInParty ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => void handleLeaveParty()}
                disabled={leavingPartyId === partyId}
              >
                {leavingPartyId === partyId ? "Leaving Party..." : "Leave Party"}
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => void handleJoinParty()}
                disabled={joiningPartyId === partyId}
              >
                {joiningPartyId === partyId ? "Joining Party..." : "Join Party"}
              </button>
            )}
            <Link className="secondary-button" to="/">
              Back to Parties
            </Link>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <section className="content-card voice-card">
          <div className="glass-header compact">
            <p className="eyebrow">Voice Lane</p>
            <h2>{isVoiceConnected ? "Connected" : "Microphone idle"}</h2>
          </div>

          <p className="muted">
            {isInParty
              ? "Join voice to publish your mic and stay connected while you move around the site."
              : "Jump straight into voice. Green Ring will join the party first, then connect your mic."}
          </p>
          <p className="tiny-copy">
            {voiceIsolationEnabled
              ? "Voice isolation is on by default. Echo cancellation and noise suppression stay enabled whenever the browser supports them."
              : "Voice isolation is off. Echo cancellation and noise suppression still stay enabled."}
          </p>

          <div className="party-actions">
            {isVoiceConnected ? (
              <button className="ghost-button" type="button" onClick={() => void disconnectVoice()}>
                Leave Voice
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => void handleJoinVoice()}
                disabled={isVoiceConnecting}
              >
                {isVoiceConnecting
                  ? "Connecting..."
                  : isInParty
                    ? "Join Voice"
                    : "Join Party + Voice"}
              </button>
            )}
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

          {voiceError ? <p className="error-text">{voiceError}</p> : null}

          <div className="voice-members">
            <p className="eyebrow">Remote listeners</p>
            {isVoiceConnected && remoteParticipants.length > 0 ? (
              remoteParticipants.map((participant) => (
                <span className="member-chip" key={participant}>
                  {participant}
                </span>
              ))
            ) : (
              <span className="member-chip idle">No remote participants connected</span>
            )}
          </div>
        </section>

        <section className="content-card roster-card">
          <div className="glass-header compact">
            <p className="eyebrow">Current Members</p>
            <h2>{party.active_members.length} active now</h2>
          </div>

          <div className="party-members stack">
            {party.active_members.length > 0
              ? party.active_members.map((member) => (
                  <span className="member-chip member-chip--avatar" key={member.user.id}>
                    <UserAvatar user={member.user} size="xs" />
                    <span>{member.user.display_name}</span>
                  </span>
                ))
              : <span className="member-chip idle">Nobody has joined yet</span>}
          </div>
        </section>
      </aside>
    </div>
  );
}
