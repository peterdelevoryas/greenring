import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Room, RoomEvent, Track, type AudioCaptureOptions } from "livekit-client";

import {
  getHome,
  issueVoiceToken,
  joinParty as joinPartyRequest,
  leaveParty as leavePartyRequest,
} from "./lib/api";
import { applyJoinedParty, applyLeftParty } from "./lib/home-state";
import type { HomeResponse, PartySummary, UserSummary } from "./lib/types";

type VoiceState = "idle" | "connecting" | "connected";

interface PartySessionContextValue {
  home: HomeResponse | undefined;
  homeError: boolean;
  homeLoading: boolean;
  activeParty: PartySummary | null;
  activePartyId: string | null;
  connectingVoicePartyId: string | null;
  joiningPartyId: string | null;
  leavingPartyId: string | null;
  remoteParticipants: string[];
  voiceError: string | null;
  voiceIsolationEnabled: boolean;
  voiceIsolationPending: boolean;
  voicePartyId: string | null;
  voiceState: VoiceState;
  connectVoice: (partyId: string) => Promise<void>;
  disconnectVoice: () => Promise<void>;
  joinParty: (partyId: string) => Promise<PartySummary>;
  leaveParty: (partyId: string) => Promise<void>;
  setVoiceIsolationEnabled: (enabled: boolean) => Promise<void>;
}

const PartySessionContext = createContext<PartySessionContextValue | null>(null);
const VOICE_ISOLATION_STORAGE_KEY = "greenring.voice-isolation-enabled";

function buildMicrophoneCaptureOptions(voiceIsolationEnabled: boolean): AudioCaptureOptions {
  return {
    autoGainControl: true,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    voiceIsolation: voiceIsolationEnabled,
  };
}

function readVoiceIsolationPreference() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(VOICE_ISOLATION_STORAGE_KEY) !== "off";
}

export function PartySessionProvider({
  children,
  currentUser,
}: {
  children: ReactNode;
  currentUser: UserSummary;
}) {
  const queryClient = useQueryClient();
  const homeQuery = useQuery({
    queryKey: ["home"],
    queryFn: getHome,
  });
  const joinMutation = useMutation({
    mutationFn: joinPartyRequest,
  });
  const leaveMutation = useMutation({
    mutationFn: leavePartyRequest,
  });

  const [joiningPartyId, setJoiningPartyId] = useState<string | null>(null);
  const [leavingPartyId, setLeavingPartyId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceIsolationEnabled, setVoiceIsolationEnabledState] = useState(readVoiceIsolationPreference);
  const [voiceIsolationPending, setVoiceIsolationPending] = useState(false);
  const [voicePartyId, setVoicePartyId] = useState<string | null>(null);
  const [connectingVoicePartyId, setConnectingVoicePartyId] = useState<string | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<string[]>([]);

  const roomRef = useRef<Room | null>(null);
  const audioMountRef = useRef<HTMLDivElement | null>(null);

  const activePartyId = homeQuery.data?.roster.find((entry) => entry.user.id === currentUser.id)?.active_party_id ?? null;
  const activeParty = homeQuery.data?.parties.find((party) => party.id === activePartyId) ?? null;

  useEffect(() => {
    if (!activePartyId && roomRef.current) {
      void disconnectVoice();
      return;
    }

    if (roomRef.current && voicePartyId && activePartyId && activePartyId !== voicePartyId) {
      void disconnectVoice();
    }
  }, [activePartyId, voicePartyId]);

  useEffect(() => (
    () => {
      roomRef.current?.disconnect();
      roomRef.current = null;
    }
  ), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      VOICE_ISOLATION_STORAGE_KEY,
      voiceIsolationEnabled ? "on" : "off",
    );
  }, [voiceIsolationEnabled]);

  async function joinParty(partyId: string) {
    setJoiningPartyId(partyId);
    setVoiceError(null);

    try {
      const party = await joinMutation.mutateAsync(partyId);
      queryClient.setQueryData<HomeResponse>(["home"], (current) => (
        applyJoinedParty(current, currentUser.id, party)
      ));
      queryClient.invalidateQueries({ queryKey: ["home"] });
      return party;
    } finally {
      setJoiningPartyId(null);
    }
  }

  async function leaveParty(partyId: string) {
    setLeavingPartyId(partyId);
    setVoiceError(null);

    try {
      await leaveMutation.mutateAsync(partyId);
      queryClient.setQueryData<HomeResponse>(["home"], (current) => (
        applyLeftParty(current, currentUser.id, partyId)
      ));
      queryClient.invalidateQueries({ queryKey: ["home"] });

      if (voicePartyId === partyId) {
        await disconnectVoice();
      }
    } finally {
      setLeavingPartyId(null);
    }
  }

  async function connectVoice(partyId: string) {
    setVoiceError(null);
    setConnectingVoicePartyId(partyId);
    let room: Room | null = null;

    try {
      if (activePartyId !== partyId) {
        await joinParty(partyId);
      }

      if (roomRef.current && voicePartyId === partyId && voiceState === "connected") {
        return;
      }

      if (roomRef.current && voicePartyId && voicePartyId !== partyId) {
        await disconnectVoice();
      }

      setVoiceState("connecting");
      const grant = await issueVoiceToken(partyId);
      const nextRoom = new Room({
        audioCaptureDefaults: buildMicrophoneCaptureOptions(voiceIsolationEnabled),
      });
      room = nextRoom;

      nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (roomRef.current !== nextRoom) {
          return;
        }

        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElement.autoplay = true;
          audioMountRef.current?.appendChild(audioElement);
        }
        syncRemoteParticipants(nextRoom);
      });

      nextRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (roomRef.current !== nextRoom) {
          return;
        }

        track.detach().forEach((node) => node.remove());
        syncRemoteParticipants(nextRoom);
      });

      nextRoom.on(RoomEvent.ParticipantConnected, () => {
        if (roomRef.current !== nextRoom) {
          return;
        }

        syncRemoteParticipants(nextRoom);
      });

      nextRoom.on(RoomEvent.ParticipantDisconnected, () => {
        if (roomRef.current !== nextRoom) {
          return;
        }

        syncRemoteParticipants(nextRoom);
      });

      nextRoom.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== nextRoom) {
          return;
        }

        roomRef.current = null;
        setVoicePartyId(null);
        setVoiceState("idle");
        setRemoteParticipants([]);
        audioMountRef.current?.replaceChildren();
      });

      await nextRoom.connect(grant.ws_url, grant.token);
      roomRef.current = nextRoom;
      await nextRoom.localParticipant.setMicrophoneEnabled(
        true,
        buildMicrophoneCaptureOptions(voiceIsolationEnabled),
      );
      setVoicePartyId(partyId);
      syncRemoteParticipants(nextRoom);
      setVoiceState("connected");
    } catch (connectionError) {
      room?.disconnect();
      if (roomRef.current === room) {
        roomRef.current = null;
      }
      setVoicePartyId(null);
      setVoiceState("idle");
      setRemoteParticipants([]);
      audioMountRef.current?.replaceChildren();

      if (connectionError instanceof Error) {
        setVoiceError(connectionError.message);
      } else {
        setVoiceError("Voice connection failed.");
      }

      throw connectionError;
    } finally {
      setConnectingVoicePartyId(null);
    }
  }

  async function disconnectVoice() {
    const room = roomRef.current;
    roomRef.current = null;
    setVoicePartyId(null);
    setVoiceState("idle");
    setVoiceError(null);
    setRemoteParticipants([]);
    audioMountRef.current?.replaceChildren();
    room?.disconnect();
  }

  async function setVoiceIsolationEnabled(enabled: boolean) {
    if (enabled === voiceIsolationEnabled) {
      return;
    }

    const previous = voiceIsolationEnabled;
    setVoiceError(null);
    setVoiceIsolationEnabledState(enabled);

    const room = roomRef.current;
    if (!room || voiceState !== "connected") {
      return;
    }

    setVoiceIsolationPending(true);

    try {
      const microphoneTrack = room.localParticipant
        .getTrackPublication(Track.Source.Microphone)
        ?.audioTrack;

      if (microphoneTrack) {
        await microphoneTrack.restartTrack(buildMicrophoneCaptureOptions(enabled));
      }
    } catch (voiceIsolationError) {
      setVoiceIsolationEnabledState(previous);
      if (voiceIsolationError instanceof Error) {
        setVoiceError(voiceIsolationError.message);
      } else {
        setVoiceError("Could not update voice isolation.");
      }
      throw voiceIsolationError;
    } finally {
      setVoiceIsolationPending(false);
    }
  }

  function syncRemoteParticipants(room: Room) {
    setRemoteParticipants(
      Array.from(room.remoteParticipants.values())
        .map((participant) => participant.name || participant.identity)
        .sort((left, right) => left.localeCompare(right)),
    );
  }

  return (
    <PartySessionContext.Provider
      value={{
        home: homeQuery.data,
        homeError: homeQuery.isError,
        homeLoading: homeQuery.isLoading,
        activeParty,
        activePartyId,
        connectingVoicePartyId,
        joiningPartyId,
        leavingPartyId,
        remoteParticipants,
        voiceError,
        voiceIsolationEnabled,
        voiceIsolationPending,
        voicePartyId,
        voiceState,
        connectVoice,
        disconnectVoice,
        joinParty,
        leaveParty,
        setVoiceIsolationEnabled,
      }}
    >
      {children}
      <div className="audio-hidden" ref={audioMountRef} />
    </PartySessionContext.Provider>
  );
}

export function usePartySession() {
  const context = useContext(PartySessionContext);

  if (!context) {
    throw new Error("usePartySession must be used within a PartySessionProvider");
  }

  return context;
}
