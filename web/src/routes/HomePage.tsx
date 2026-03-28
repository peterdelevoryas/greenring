import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, createParty, getHome, joinParty, leaveParty } from "../lib/api";
import { applyJoinedParty, applyLeftParty } from "../lib/home-state";
import type { HomeResponse, PartySummary, UserSummary } from "../lib/types";

export function HomePage({ currentUser }: { currentUser: UserSummary }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const homeQuery = useQuery({
    queryKey: ["home"],
    queryFn: getHome,
  });
  const [partyName, setPartyName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentPresence = homeQuery.data?.roster.find((entry) => entry.user.id === currentUser.id);
  const activePartyId = currentPresence?.active_party_id ?? null;

  const createPartyMutation = useMutation({
    mutationFn: createParty,
    onSuccess: (party) => {
      setPartyName("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["home"] });
      navigate(`/party/${party.id}`);
    },
    onError: handleError,
  });

  const joinPartyMutation = useMutation({
    mutationFn: joinParty,
    onSuccess: (party) => {
      setError(null);
      queryClient.setQueryData<HomeResponse>(["home"], (current) => (
        applyJoinedParty(current, currentUser.id, party)
      ));
      queryClient.invalidateQueries({ queryKey: ["home"] });
      navigate(`/party/${party.id}`);
    },
    onError: handleError,
  });

  const leavePartyMutation = useMutation({
    mutationFn: leaveParty,
    onSuccess: (_, partyId) => {
      setError(null);
      queryClient.setQueryData<HomeResponse>(["home"], (current) => (
        applyLeftParty(current, currentUser.id, partyId)
      ));
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: handleError,
  });

  function handleError(mutationError: unknown) {
    if (mutationError instanceof ApiError) {
      setError(mutationError.message);
      return;
    }
    setError("Request failed.");
  }

  function handleCreateParty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createPartyMutation.mutate({ name: partyName });
  }

  if (homeQuery.isLoading) {
    return <section className="content-card">Loading roster...</section>;
  }

  if (homeQuery.isError || !homeQuery.data) {
    return (
      <section className="content-card">
        <h2>Could not load your roster</h2>
        <p className="error-text">Refresh the page or check whether the API is running.</p>
      </section>
    );
  }

  const activeParty = homeQuery.data.parties.find((party) => party.id === activePartyId) ?? null;

  return (
    <div className="dashboard-grid">
      <section className="content-card hero-card">
        <div>
          <p className="eyebrow">Party Center</p>
          <h2>{activeParty ? `You are in ${activeParty.name}` : "No active party"}</h2>
          <p className="muted">
            {activeParty
              ? `${activeParty.active_members.length} people are active in voice right now.`
              : "Spin up a room, join one in progress, or just keep the roster open while everyone trickles in."}
          </p>
        </div>
        {activeParty ? (
          <Link className="primary-button" to={`/party/${activeParty.id}`}>
            Open Party Room
          </Link>
        ) : null}
      </section>

      <section className="content-card create-card">
        <div className="glass-header compact">
          <p className="eyebrow">Create Party</p>
          <h2>Start a room</h2>
        </div>
        <form className="inline-form" onSubmit={handleCreateParty}>
          <input
            value={partyName}
            onChange={(event) => setPartyName(event.target.value)}
            placeholder="Halo 3 throwback"
          />
          <button className="primary-button" type="submit" disabled={createPartyMutation.isPending}>
            {createPartyMutation.isPending ? "Creating..." : "Create"}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="content-card party-list-card">
        <div className="glass-header compact">
          <p className="eyebrow">Parties</p>
          <h2>Persistent rooms</h2>
        </div>

        <div className="party-list">
          {homeQuery.data.parties.map((party) => (
            <PartyCard
              activePartyId={activePartyId}
              isJoining={joinPartyMutation.isPending && joinPartyMutation.variables === party.id}
              isLeaving={leavePartyMutation.isPending && leavePartyMutation.variables === party.id}
              key={party.id}
              onJoin={() => joinPartyMutation.mutate(party.id)}
              onLeave={() => leavePartyMutation.mutate(party.id)}
              party={party}
            />
          ))}
          {homeQuery.data.parties.length === 0 ? (
            <div className="empty-state">
              <p>No parties yet.</p>
              <p className="muted">Create the first hangout room to get the dashboard moving.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="content-card roster-card">
        <div className="glass-header compact">
          <p className="eyebrow">Roster</p>
          <h2>Friend presence</h2>
        </div>

        <ul className="roster-list">
          {homeQuery.data.roster.map((entry) => {
            const linkedParty = entry.active_party_id
              ? homeQuery.data.parties.find((party) => party.id === entry.active_party_id)
              : null;

            return (
              <li className="roster-row" key={entry.user.id}>
                <div>
                  <div className="roster-name">
                    <span className={`presence-dot ${entry.status}`} />
                    <strong>{entry.user.display_name}</strong>
                  </div>
                  <p className="muted">@{entry.user.username}</p>
                </div>
                <div className="roster-meta">
                  {linkedParty ? (
                    <span className="party-pill">In {linkedParty.name}</span>
                  ) : (
                    <span className="party-pill idle">Idle</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PartyCard({
  activePartyId,
  isJoining,
  isLeaving,
  onJoin,
  onLeave,
  party,
}: {
  activePartyId: string | null;
  isJoining: boolean;
  isLeaving: boolean;
  onJoin: () => void;
  onLeave: () => void;
  party: PartySummary;
}) {
  const isCurrent = activePartyId === party.id;

  return (
    <article className={`party-card ${isCurrent ? "current" : ""}`}>
      <div className="party-card-header">
        <div>
          <p className="eyebrow">Party Room</p>
          <h3>{party.name}</h3>
        </div>
        <span className="party-pill">
          {party.active_members.length}/{party.voice_limit}
        </span>
      </div>

      <p className="muted">
        {party.last_message_preview ?? "No room chat yet. Fire the first message."}
      </p>

      <div className="party-members">
        {party.active_members.length > 0
          ? party.active_members.map((member) => (
              <span className="member-chip" key={member.user.id}>
                {member.user.display_name}
              </span>
            ))
          : <span className="member-chip idle">Nobody active</span>}
      </div>

      <div className="party-actions">
        <Link className="secondary-button" to={`/party/${party.id}`}>
          Open Room
        </Link>
        {isCurrent ? (
          <button className="ghost-button" type="button" onClick={onLeave} disabled={isLeaving}>
            {isLeaving ? "Leaving..." : "Leave"}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onJoin} disabled={isJoining}>
            {isJoining ? "Joining..." : "Join"}
          </button>
        )}
      </div>
    </article>
  );
}
