import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, getPartyMessages, sendPartyMessage } from "../lib/api";
import { usePartySession } from "../party-session";
import { UserAvatar } from "../components/UserAvatar";
import { UserIdentity } from "../components/UserIdentity";

export function PartyPage() {
  const { partyId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    voicePartyId,
    voiceState,
  } = usePartySession();
  const messagesQuery = useQuery({
    queryKey: ["messages", partyId],
    queryFn: () => getPartyMessages(partyId),
    enabled: Boolean(partyId),
  });

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendMessageMutation = useMutation({
    mutationFn: (body: string) => sendPartyMessage(partyId, body),
    onSuccess: () => {
      setDraft("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["messages", partyId] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: handleError,
  });

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessageMutation.mutate(draft);
  }

  if (homeLoading || messagesQuery.isLoading) {
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
      <section className="content-card party-room-main">
        <div className="glass-header">
          <p className="eyebrow">Active Room</p>
          <h2>{party.name}</h2>
          <p className="muted">
            Persistent text history with a voice lane that now stays live while you browse the rest of the dashboard.
          </p>
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

        <div className="message-feed">
          {messagesQuery.data?.messages.map((message) => (
            <article className="message-card" key={message.id}>
              <header className="message-header">
                <UserIdentity
                  user={message.author}
                  size="sm"
                  subtitle={formatTimestamp(message.created_at)}
                />
              </header>
              <p>{message.body}</p>
            </article>
          ))}
          {messagesQuery.data?.messages.length === 0 ? (
            <div className="empty-state">
              <p>No messages yet.</p>
              <p className="muted">Drop the first “who’s on?” and get the room going.</p>
            </div>
          ) : null}
        </div>

        <form className="message-form" onSubmit={handleSubmit}>
          <textarea
            disabled={!isInParty}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={isInParty ? "Write to the room..." : "Join the party to chat"}
          />
          <button className="primary-button" type="submit" disabled={!isInParty || sendMessageMutation.isPending}>
            {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
          </button>
        </form>
      </section>

      <aside className="party-room-sidebar">
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
            Mic cleanup is enabled with echo cancellation, noise suppression, and voice isolation when the browser supports it.
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

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
