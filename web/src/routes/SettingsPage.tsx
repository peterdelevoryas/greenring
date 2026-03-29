import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  createInvite,
  getInvites,
  revokeInvite,
  updateProfile,
} from "../lib/api";
import type { SessionResponse, UserSummary } from "../lib/types";

export function SettingsPage({ currentUser }: { currentUser: UserSummary }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(currentUser.username);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: getInvites,
    enabled: currentUser.role === "owner",
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (session) => {
      setProfileError(null);
      setProfileNotice("Username updated.");
      setUsername(session.user.username);
      queryClient.setQueryData<SessionResponse>(["session"], session);
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (mutationError) => {
      setProfileNotice(null);
      if (mutationError instanceof ApiError) {
        setProfileError(mutationError.message);
        return;
      }
      setProfileError("Could not update your profile.");
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileNotice(null);
    updateProfileMutation.mutate({ username });
  }

  return (
    <div className="settings-grid">
      <section className="content-card">
        <div className="glass-header">
          <p className="eyebrow">Profile</p>
          <h2>Account handle</h2>
          <p className="muted">
            Change the username people use to sign in. Display name stays the same in this build.
          </p>
        </div>

        <form className="stack-form" onSubmit={handleProfileSubmit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="player1"
            />
          </label>

          {profileError ? <p className="error-text">{profileError}</p> : null}
          {profileNotice ? <p className="muted">{profileNotice}</p> : null}

          <button
            className="primary-button"
            type="submit"
            disabled={updateProfileMutation.isPending || username.trim() === currentUser.username}
          >
            {updateProfileMutation.isPending ? "Saving..." : "Save Username"}
          </button>
        </form>
      </section>

      {currentUser.role === "owner" ? (
        <section className="content-card">
          <div className="glass-header">
            <p className="eyebrow">Invite Codes</p>
            <h2>Grow the roster carefully</h2>
            <p className="muted">
              Each code is single-use and keeps the app private without adding third-party identity.
            </p>
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={() => createInviteMutation.mutate()}
            disabled={createInviteMutation.isPending}
          >
            {createInviteMutation.isPending ? "Minting..." : "Create Invite"}
          </button>

          {createInviteMutation.error instanceof ApiError ? (
            <p className="error-text">{createInviteMutation.error.message}</p>
          ) : null}
        </section>
      ) : null}

      {currentUser.role === "owner" ? (
        <section className="content-card">
          <div className="glass-header compact">
            <p className="eyebrow">Current Codes</p>
            <h2>
              {invitesQuery.data?.invites.length ?? 0}
              {" "}
              total
            </h2>
          </div>

          {invitesQuery.isLoading ? <p className="muted">Loading invites...</p> : null}
          {invitesQuery.isError ? (
            <p className="error-text">The invite endpoint returned an error.</p>
          ) : null}

          {invitesQuery.data ? (
            <div className="invite-list">
              {invitesQuery.data.invites.map((invite) => (
                <article className="invite-card" key={invite.id}>
                  <div>
                    <strong>{invite.code}</strong>
                    <p className="muted">
                      {invite.redeemed_by
                        ? `Redeemed by ${invite.redeemed_by.display_name}`
                        : invite.revoked_at
                          ? "Revoked"
                          : "Ready to use"}
                    </p>
                  </div>

                  {!invite.redeemed_at && !invite.revoked_at ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => revokeInviteMutation.mutate(invite.id)}
                      disabled={revokeInviteMutation.isPending}
                    >
                      Revoke
                    </button>
                  ) : null}
                </article>
              ))}

              {invitesQuery.data.invites.length === 0 ? (
                <div className="empty-state">
                  <p>No invites created yet.</p>
                  <p className="muted">Generate the first code to bring someone into the group.</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
