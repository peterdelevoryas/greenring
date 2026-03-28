import type { HomeResponse, PartySummary } from "./types";

function upsertParty(parties: PartySummary[], nextParty: PartySummary) {
  const otherParties = parties.filter((party) => party.id !== nextParty.id);
  return [nextParty, ...otherParties];
}

export function applyJoinedParty(
  home: HomeResponse | undefined,
  currentUserId: string,
  joinedParty: PartySummary,
) {
  if (!home) {
    return home;
  }

  const nextRoster = home.roster.map((entry) => (
    entry.user.id === currentUserId
      ? { ...entry, active_party_id: joinedParty.id }
      : entry
  ));

  const previousPartyId = home.roster.find((entry) => entry.user.id === currentUserId)?.active_party_id;
  const nextParties = upsertParty(
    home.parties.map((party) => {
      if (party.id === previousPartyId && previousPartyId !== joinedParty.id) {
        return {
          ...party,
          active_members: party.active_members.filter((member) => member.user.id !== currentUserId),
        };
      }

      return party;
    }),
    joinedParty,
  );

  return {
    ...home,
    roster: nextRoster,
    parties: nextParties,
  };
}

export function applyLeftParty(
  home: HomeResponse | undefined,
  currentUserId: string,
  partyId: string,
) {
  if (!home) {
    return home;
  }

  return {
    ...home,
    roster: home.roster.map((entry) => (
      entry.user.id === currentUserId
        ? { ...entry, active_party_id: null }
        : entry
    )),
    parties: home.parties.map((party) => (
      party.id === partyId
        ? {
            ...party,
            active_members: party.active_members.filter((member) => member.user.id !== currentUserId),
          }
        : party
    )),
  };
}
