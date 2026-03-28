import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Room, RoomEvent, Track } from "livekit-client";

import {
  ApiError,
  getHome,
  getPartyMessages,
  issueVoiceToken,
  joinParty,
  leaveParty,
  sendPartyMessage,
} from "../lib/api";
import { applyJoinedParty, applyLeftParty } from "../lib/home-state";
import type { HomeResponse, UserSummary } from "../lib/types";

type VoiceState = "idle" | "connecting" | "connected";

export function PartyPage({ currentUser }: { currentUser: UserSummary }) {
  const { partyId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const homeQuery = useQuery({
    queryKey: ["home"],
    queryFn: getHome,
  });
  const messagesQuery = useQuery({
    queryKey: ["messages", partyId],
    queryFn: () => getPartyMessages(partyId),
    enabled: Boolean(partyId),
  });

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<string[]>([]);
  const audioMountRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);

  const currentPresence = homeQuery.data?.roster.find((entry) => entry.user.id === currentUser.id);
  const isInParty = currentPresence?.active_party_id === partyId;
  const party = homeQuery.data?.parties.find((entry) => entry.id === partyId) ?? null;

  const joinMutation = useMutation({
    mutationFn: joinParty,
    onSuccess: (party) => {
      setError(null);
      queryClient.setQueryData<HomeResponse>(["home"], (current) => (
        applyJoinedParty(current, currentUser.id, party)
      ));
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: handleError,
  });

  const leaveMutation = useMutation({
    mutationFn: leaveParty,
    onSuccess: (_, leftPartyId) => {
      setError(null);
      queryClient.setQueryData<HomeResponse>(["home"], (current) => (
        applyLeftParty(current, currentUser.id, leftPartyId)
      ));
      queryClient.invalidateQueries({ queryKey: ["home"] });
      void disconnectVoice();
    },
    onError: handleError,
  });

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

  useEffect(() => {
    return () => {
      void disconnectVoice();
    };
  }, [partyId]);

  useEffect(() => {
    if (!isInParty && roomRef.current) {
      void disconnectVoice();
    }
  }, [isInParty]);

  function handleError(mutationError: unknown) {
    if (mutationError instanceof ApiError) {
      setError(mutationError.message);
      return;
    }
    setError("Request failed.");
  }

  async function connectVoice() {
    try {
      setVoiceError(null);
      setVoiceState("connecting");
      const grant = await issueVoiceToken(partyId);
      const room = new Room();

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElement.autoplay = true;
          audioMountRef.current?.appendChild(audioElement);
        }
        syncRemoteParticipants(room);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((node) => node.remove());
        syncRemoteParticipants(room);
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        syncRemoteParticipants(room);
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        syncRemoteParticipants(room);
      });

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setVoiceState("idle");
        setRemoteParticipants([]);
        audioMountRef.current?.replaceChildren();
      });

      await room.connect(grant.ws_url, grant.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = room;
      syncRemoteParticipants(room);
      setVoiceState("connected");
    } catch (connectionError) {
      setVoiceState("idle");
      if (connectionError instanceof Error) {
        setVoiceError(connectionError.message);
      } else {
        setVoiceError("Voice connection failed.");
      }
    }
  }

  async function disconnectVoice() {
    const room = roomRef.current;
    if (!room) {
      setVoiceState("idle");
      setRemoteParticipants([]);
      audioMountRef.current?.replaceChildren();
      return;
    }

    roomRef.current = null;
    room.disconnect();
    setVoiceState("idle");
    setRemoteParticipants([]);
    audioMountRef.current?.replaceChildren();
  }

  function syncRemoteParticipants(room: Room) {
    setRemoteParticipants(
      Array.from(room.remoteParticipants.values())
        .map((participant) => participant.name || participant.identity)
        .sort((left, right) => left.localeCompare(right)),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessageMutation.mutate(draft);
  }

  if (homeQuery.isLoading || messagesQuery.isLoading) {
    return <section className="content-card">Loading party room...</section>;
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
            Persistent text history with a LiveKit-backed voice lane for the people currently hanging out.
          </p>
        </div>

        <div className="party-room-toolbar">
          {isInParty ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => leaveMutation.mutate(partyId)}
              disabled={leaveMutation.isPending}
            >
              {leaveMutation.isPending ? "Leaving Party..." : "Leave Party"}
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={() => joinMutation.mutate(partyId)}
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending ? "Joining Party..." : "Join Party"}
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
              <header>
                <strong>{message.author.display_name}</strong>
                <span className="muted">{formatTimestamp(message.created_at)}</span>
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
            <h2>{voiceState === "connected" ? "Connected" : "Microphone idle"}</h2>
          </div>

          <p className="muted">
            {isInParty
              ? "Join voice to publish your mic and subscribe to everyone already in the room."
              : "You need to join the party before connecting audio."}
          </p>

          <div className="party-actions">
            {voiceState === "connected" ? (
              <button className="ghost-button" type="button" onClick={() => void disconnectVoice()}>
                Leave Voice
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => void connectVoice()}
                disabled={!isInParty || voiceState === "connecting"}
              >
                {voiceState === "connecting" ? "Connecting..." : "Join Voice"}
              </button>
            )}
          </div>

          {voiceError ? <p className="error-text">{voiceError}</p> : null}

          <div className="audio-hidden" ref={audioMountRef} />

          <div className="voice-members">
            <p className="eyebrow">Remote listeners</p>
            {remoteParticipants.length > 0 ? (
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
                  <span className="member-chip" key={member.user.id}>
                    {member.user.display_name}
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
