import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  createInvite,
  getInvites,
  revokeInvite,
  updateAvatar,
  updateProfile,
} from "../lib/api";
import { fetchGamerpicOptions } from "../lib/gamerpics";
import type { SessionResponse, UserSummary } from "../lib/types";
import { UserAvatar } from "../components/UserAvatar";
import { UserIdentity } from "../components/UserIdentity";

export function SettingsPage({ currentUser }: { currentUser: UserSummary }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(currentUser.username);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [selectedAvatarKey, setSelectedAvatarKey] = useState<string | null>(currentUser.avatar_key);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: getInvites,
    enabled: currentUser.role === "owner",
  });

  const gamerpicQuery = useQuery({
    queryKey: ["gamerpics", "xbox-360-dashboard"],
    queryFn: fetchGamerpicOptions,
  });
  const selectedGamerpic = gamerpicQuery.data?.find((option) => option.key === selectedAvatarKey) ?? null;

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

  const updateAvatarMutation = useMutation({
    mutationFn: updateAvatar,
    onSuccess: (session) => {
      setAvatarError(null);
      setAvatarNotice(session.user.avatar_key ? "Gamerpic updated." : "Gamerpic cleared.");
      setSelectedAvatarKey(session.user.avatar_key);
      queryClient.setQueryData<SessionResponse>(["session"], session);
      queryClient.invalidateQueries({ queryKey: ["home"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (mutationError) => {
      setAvatarNotice(null);
      if (mutationError instanceof ApiError) {
        setAvatarError(mutationError.message);
        return;
      }
      setAvatarError("Could not update your gamerpic.");
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

  useEffect(() => {
    setUsername(currentUser.username);
    setSelectedAvatarKey(currentUser.avatar_key);
  }, [currentUser.avatar_key, currentUser.username]);

  function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileNotice(null);
    updateProfileMutation.mutate({ username });
  }

  function handleAvatarSave(nextAvatarKey: string | null) {
    setAvatarError(null);
    setAvatarNotice(null);
    updateAvatarMutation.mutate({ avatar_key: nextAvatarKey });
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

      <section className="content-card">
        <div className="glass-header">
          <p className="eyebrow">Gamerpic</p>
          <h2>Xbox 360 dashboard avatar</h2>
          <p className="muted">
            Pick a preset image from the bundled dashboard pack. No uploads, no cropper, just the classic set.
          </p>
        </div>

        <div className="avatar-picker-summary">
          <UserAvatar
            user={{
              ...currentUser,
              avatar_url: selectedGamerpic?.url ?? currentUser.avatar_url,
            }}
            size="lg"
            className="avatar-preview"
          />
          <div>
            <strong>{currentUser.display_name}</strong>
            <p className="muted">
              {selectedAvatarKey
                ? selectedAvatarKey === currentUser.avatar_key
                  ? "Current gamerpic selected."
                  : "Previewing a dashboard gamerpic."
                : "No gamerpic selected yet."}
            </p>
          </div>
        </div>

        <div className="avatar-picker-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => handleAvatarSave(selectedAvatarKey)}
            disabled={
              updateAvatarMutation.isPending
              || selectedAvatarKey === currentUser.avatar_key
              || gamerpicQuery.isLoading
            }
          >
            {updateAvatarMutation.isPending ? "Saving..." : "Save Gamerpic"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => handleAvatarSave(null)}
            disabled={updateAvatarMutation.isPending || currentUser.avatar_key === null}
          >
            Remove
          </button>
        </div>

        {avatarError ? <p className="error-text">{avatarError}</p> : null}
        {avatarNotice ? <p className="muted">{avatarNotice}</p> : null}

        {gamerpicQuery.isLoading ? <p className="muted">Loading gamerpic pack...</p> : null}
        {gamerpicQuery.isError ? (
          <p className="error-text">Could not load the bundled gamerpic pack yet.</p>
        ) : null}

        {gamerpicQuery.data ? (
          <div className="gamerpic-picker">
            {gamerpicQuery.data.map((option) => {
              const isSelected = option.key === selectedAvatarKey;
              const isCurrent = option.key === currentUser.avatar_key;

              return (
                <button
                  className={`gamerpic-option ${isSelected ? "selected" : ""} ${isCurrent ? "current" : ""}`}
                  key={option.key}
                  aria-pressed={isSelected}
                  type="button"
                  onClick={() => setSelectedAvatarKey(option.key)}
                >
                  <img alt="" className="gamerpic-option-image" src={option.url} />
                  <span className="gamerpic-option-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
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
                    {invite.redeemed_by ? null : (
                      <p className="muted">
                        {invite.revoked_at ? "Revoked" : "Ready to use"}
                      </p>
                    )}
                    {invite.redeemed_by ? (
                      <UserIdentity user={invite.redeemed_by} size="sm" subtitle="Redeemed" />
                    ) : null}
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
