# Green Ring

Private, invite-only hangout app for a close friend group, built around the 2008 Xbox Party Chat aesthetic.

## What is in this repo

- Rust backend with `axum`, `sqlx`, cookie sessions, realtime WebSocket events, invite-only accounts, persistent party rooms, and LiveKit token issuance.
- React + TypeScript + Vite frontend with a retro Xbox-inspired shell, presence roster, persistent room text chat, owner invite management, and browser voice hookup via LiveKit.
- Docker assets for a single-VPS deployment using `postgres`, `redis`, `livekit`, `api`, `web`, and `caddy`.

## Repo layout

- [src/main.rs](src/main.rs): backend entrypoint and CLI.
- [migrations/0001_initial.sql](migrations/0001_initial.sql): initial Postgres schema.
- [web/src/App.tsx](web/src/App.tsx): frontend app shell and route split.
- [deploy/docker-compose.yml](deploy/docker-compose.yml): single-host deployment stack.

## Local development

1. Copy `.env.example` to `.env` and adjust values for local dev.
2. Start Postgres and Redis locally, or use Docker Compose for those services.
3. Run the backend migrations and bootstrap the owner account:

```bash
cargo run -- bootstrap-owner --username owner --display-name "Party Owner" --password "change-me-now"
```

4. Start the backend:

```bash
cargo run
```

5. Start the frontend:

```bash
cd web
npm install
npm run dev
```

For local Vite development, set `APP_CORS_ORIGIN=http://localhost:5173` and `LIVEKIT_WS_URL=ws://localhost:7880` in `.env`.

## Docker deployment

1. Copy `.env.example` to `.env`.
2. Replace the placeholder secrets and domain values.
3. Bring the stack up:

```bash
docker compose -f deploy/docker-compose.yml up --build -d
```

4. Bootstrap the owner account inside the running API container:

```bash
docker compose -f deploy/docker-compose.yml exec api \
  greenring bootstrap-owner \
  --username owner \
  --display-name "Party Owner" \
  --password "change-me-now"
```

5. Open `https://<APP_DOMAIN>` and sign in.

## Verification

- Backend: `cargo test`
- Frontend: `cd web && npm run build`

## Secrets and public repos

- This repo is intended to be safe to publish publicly as long as only source files and `.env.example` placeholders are committed.
- Keep real deployment values in `.env` or `deploy/.env` on the server. Do not commit live database URLs, API secrets, owner passwords, or private keys.
- If you need to share secrets with collaborators, use a shared password manager vault for a small group or an encrypted secrets workflow such as `sops` + `age` if you want secrets to live alongside the repo without being plaintext.

## Notes

- LiveKit self-hosting guidance used for the deploy defaults: [Deploying LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/) and [Ports and firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/).
- The included Compose stack is a practical starting point for a small private deployment, not a hardened production reference.
