import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, redeemInvite } from "../lib/api";

export function RedeemInvitePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    username: "",
    display_name: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);

  const redeemMutation = useMutation({
    mutationFn: redeemInvite,
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
      setError("Invite redemption failed.");
    },
  });

  function handleChange(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    redeemMutation.mutate(form);
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Invite Gate</p>
        <h1>Bring your own gamertag energy.</h1>
        <p className="lead">
          This network stays small on purpose. Redeem your code, claim your account, and get into the roster.
        </p>
      </section>

      <section className="auth-card">
        <div className="glass-header">
          <p className="eyebrow">Redeem Invite</p>
          <h2>Create your account</h2>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          <label>
            <span>Invite code</span>
            <input
              value={form.code}
              onChange={(event) => handleChange("code", event.target.value.toUpperCase())}
              placeholder="XPC-ABCDE-12345"
            />
          </label>

          <label>
            <span>Username</span>
            <input
              value={form.username}
              onChange={(event) => handleChange("username", event.target.value)}
              placeholder="player1"
            />
          </label>

          <label>
            <span>Display name</span>
            <input
              value={form.display_name}
              onChange={(event) => handleChange("display_name", event.target.value)}
              placeholder="Player One"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => handleChange("password", event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={redeemMutation.isPending}>
            {redeemMutation.isPending ? "Claiming seat..." : "Join the Network"}
          </button>
        </form>

        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
