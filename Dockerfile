FROM rust:1.94-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/xbox-party-chat /usr/local/bin/xbox-party-chat

EXPOSE 3000

CMD ["xbox-party-chat", "serve"]
