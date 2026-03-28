import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, createInvite, getInvites, revokeInvite } from "../lib/api";
import type { UserSummary } from "../lib/types";

export function SettingsPage({ currentUser }: { currentUser: UserSummary }) {
  const queryClient = useQueryClient();
  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: getInvites,
    enabled: currentUser.role === "owner",
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

  if (currentUser.role !== "owner") {
    return (
      <section className="content-card">
        <h2>Owner tools only</h2>
        <p className="muted">
          Invite management stays restricted to the owner account in this build.
        </p>
      </section>
    );
  }

  if (invitesQuery.isLoading) {
    return <section className="content-card">Loading invites...</section>;
  }

  if (invitesQuery.isError || !invitesQuery.data) {
    return (
      <section className="content-card">
        <h2>Could not load invites</h2>
        <p className="error-text">The invite endpoint returned an error.</p>
      </section>
    );
  }

  return (
    <div className="settings-grid">
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

      <section className="content-card">
        <div className="glass-header compact">
          <p className="eyebrow">Current Codes</p>
          <h2>{invitesQuery.data.invites.length} total</h2>
        </div>

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
      </section>
    </div>
  );
}
