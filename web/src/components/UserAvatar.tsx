import { useEffect, useState } from "react";

type AvatarUser = {
  display_name: string;
  username: string;
  avatar_url: string | null;
};

export function UserAvatar({
  user,
  size = "md",
  className = "",
}: {
  user: AvatarUser;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [imageErrored, setImageErrored] = useState(false);
  const avatarUrl = user.avatar_url?.trim() ?? "";
  const initials = buildInitials(user.display_name || user.username);

  useEffect(() => {
    setImageErrored(false);
  }, [avatarUrl]);

  const shouldRenderImage = avatarUrl.length > 0 && !imageErrored;

  return (
    <span className={`avatar avatar--${size} ${className}`.trim()}>
      {shouldRenderImage ? (
        <img
          alt=""
          className="avatar-image"
          draggable={false}
          loading="lazy"
          onError={() => setImageErrored(true)}
          src={avatarUrl}
        />
      ) : (
        <span aria-hidden="true" className="avatar-fallback">
          {initials}
        </span>
      )}
    </span>
  );
}

function buildInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
