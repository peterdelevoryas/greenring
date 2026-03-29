FROM rust:1.94-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY src ./src
COPY web/public/gamerpics/xbox-360-dashboard/manifest.json ./web/public/gamerpics/xbox-360-dashboard/manifest.json

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/greenring /usr/local/bin/greenring

EXPOSE 3000

CMD ["greenring", "serve"]
