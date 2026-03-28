import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, login } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      queryClient.setQueryData(["session"], session);
      queryClient.invalidateQueries({ queryKey: ["home"] });
      navigate("/", { replace: true });
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiError) {
        setError(mutationError.message);
        return;
      }
      setError("Login failed.");
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    loginMutation.mutate({ username, password });
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Private Party Network</p>
        <h1>The old hangout, rebuilt.</h1>
        <p className="lead">
          Voice rooms, roster presence, and the 2008 Xbox dashboard energy without the server sprawl.
        </p>
      </section>

      <section className="auth-card">
        <div className="glass-header">
          <p className="eyebrow">Sign In</p>
          <h2>Rejoin the party</h2>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="player1"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in..." : "Enter Party Chat"}
          </button>
        </form>

        <p className="muted">
          Need an invite? <Link to="/redeem">Redeem an invite code</Link>
        </p>
      </section>
    </main>
  );
}
