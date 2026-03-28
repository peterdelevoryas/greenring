CREATE TABLE users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invites (
    id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_by UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE parties (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE party_memberships (
    id UUID PRIMARY KEY,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ NULL
);

CREATE INDEX party_memberships_party_id_idx ON party_memberships (party_id);
CREATE INDEX party_memberships_user_id_idx ON party_memberships (user_id);
CREATE INDEX party_memberships_active_idx ON party_memberships (party_id, user_id) WHERE left_at IS NULL;

CREATE TABLE party_messages (
    id UUID PRIMARY KEY,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX party_messages_party_id_created_at_idx ON party_messages (party_id, created_at);
