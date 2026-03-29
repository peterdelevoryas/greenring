import { UserAvatar } from "./UserAvatar";

type IdentityUser = {
  display_name: string;
  username: string;
  avatar_url: string | null;
};

export function UserIdentity({
  user,
  subtitle,
  size = "md",
  className = "",
}: {
  user: IdentityUser;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={`user-identity ${className}`.trim()}>
      <UserAvatar user={user} size={size} />
      <div className="user-identity-copy">
        <strong className="user-identity-name">{user.display_name}</strong>
        <p className="muted user-identity-subtitle">@{user.username}{subtitle ? ` · ${subtitle}` : ""}</p>
      </div>
    </div>
  );
}
