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

1. Copy `.env.local.example` to `.env.local`.
2. Start the local services stack:

```bash
./scripts/local-services.sh up .env.local
```

3. Bootstrap the owner account:

```bash
./scripts/bootstrap-owner.sh .env.local owner "Party Owner" "change-me-now"
```

4. Start the backend:

```bash
./scripts/run-local-api.sh .env.local
```

5. Start the frontend:

```bash
npm install
bash ./scripts/run-local-web.sh
```

The local services stack exposes Postgres on `127.0.0.1:5432`, Redis on `127.0.0.1:6379`, and LiveKit on `127.0.0.1:7880`, so the backend can run directly on your machine while Vite proxies API and websocket traffic to `http://127.0.0.1:3000`.

## Local E2E

1. Copy `.env.e2e.example` to `.env.e2e`.
2. Install frontend dependencies and a browser for Playwright:

```bash
cd web
npm install
npx playwright install chromium
```

3. Run the smoke suite:

```bash
cd web
npm run test:e2e
```

The Playwright harness will:
- reset a dedicated local Postgres volume
- start the local Docker services stack under a separate compose project
- bootstrap an `owner` account with password `change-me-now`
- start the Rust API and Vite dev server
- run a smoke flow that logs in, creates and joins a party, navigates to Settings, creates an invite, and verifies the party still shows as active when returning to the dashboard

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
