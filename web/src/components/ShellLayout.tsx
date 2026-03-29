import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logout } from "../lib/api";
import type { UserSummary } from "../lib/types";

export function ShellLayout({
  currentUser,
  lastEventAt,
  children,
}: {
  currentUser: UserSummary;
  lastEventAt: number | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="brand-badge">
          <p className="eyebrow">Dashboard</p>
          <h1>Green Ring</h1>
          <p className="muted">
            Private voice-first hangout space for the people who were there in 2008.
          </p>
        </div>

        <nav className="main-nav">
          <NavItem href="/">Parties</NavItem>
          {currentUser.role === "owner" ? <NavItem href="/settings">Invites</NavItem> : null}
        </nav>

        <div className="status-card">
          <p className="eyebrow">Signed in as</p>
          <h2>{currentUser.display_name}</h2>
          <p className="muted">@{currentUser.username}</p>
          <div className="status-row">
            <span className="presence-dot online" />
            <span>Connected</span>
          </div>
          <p className="tiny-copy">
            {lastEventAt ? `Realtime sync ${timeAgo(lastEventAt)}` : "Awaiting live sync"}
          </p>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
        </button>
      </aside>

      <main className="shell-main">{children}</main>
    </div>
  );
}

function NavItem({ href, children }: { href: string; children: ReactNode }) {
  return (
    <NavLink
      to={href}
      className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
    >
      {children}
    </NavLink>
  );
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
