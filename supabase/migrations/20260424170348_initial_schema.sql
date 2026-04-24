-- Choice Champ v2 — Postgres schema
-- Run this in the Supabase SQL Editor after the project is provisioned.
-- RLS policies are defined separately in supabase/rls.sql.

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE media_type AS ENUM ('movie', 'tv', 'game', 'board');

CREATE TYPE party_state AS ENUM ('waiting', 'active', 'ended');

-- ============================================================
-- Profiles (extends auth.users)
-- ============================================================

CREATE TABLE public.profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username   TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row whenever a new auth user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Collections
-- ============================================================

CREATE TABLE public.collections (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    share_code TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    type       media_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_owner ON public.collections(owner_id);

-- ============================================================
-- Collection members (M2M)
-- Replaces Mongo's user.{movie,tv,videoGame,boardGame}Collections[] arrays.
-- The owner is also inserted here on collection creation (simplifies queries).
-- ============================================================

CREATE TABLE public.collection_members (
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, user_id)
);

CREATE INDEX idx_collection_members_user ON public.collection_members(user_id);

-- ============================================================
-- Collection items
-- `complete` is the group-level "we finished watching/playing this as a collection" flag.
-- This replaces Mongo's items[].watched.
-- ============================================================

CREATE TABLE public.collection_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    item_id       TEXT NOT NULL,
    media_type    media_type NOT NULL,
    title         TEXT NOT NULL,
    poster        TEXT,
    complete      BOOLEAN NOT NULL DEFAULT false,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (collection_id, item_id, media_type)
);

CREATE INDEX idx_collection_items_collection ON public.collection_items(collection_id);

-- ============================================================
-- Watched media — per-user global status
-- `completed = true` means watched (movie/tv) or played (game/board) for this user.
-- The UI renders the label based on media_type.
-- ============================================================

CREATE TABLE public.watched_media (
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    media_type media_type NOT NULL,
    item_id    TEXT NOT NULL,
    completed  BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, media_type, item_id)
);

-- ============================================================
-- Parties (persistent; cleanup via cron — see supabase/cron.sql)
-- ============================================================

CREATE TABLE public.parties (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code             TEXT UNIQUE NOT NULL,
    host_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    collection_id    UUID REFERENCES public.collections(id) ON DELETE SET NULL,
    media_type       media_type NOT NULL,
    secret_mode      BOOLEAN NOT NULL DEFAULT false,
    include_watched  BOOLEAN NOT NULL DEFAULT true,
    super_choice     BOOLEAN NOT NULL DEFAULT false,
    member_count     INT NOT NULL DEFAULT 1,
    state            party_state NOT NULL DEFAULT 'waiting',
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parties_code          ON public.parties(code);
CREATE INDEX idx_parties_last_activity ON public.parties(last_activity_at);

-- Snapshot of items seeded into the party at start.
-- `watched` is the snapshot of the group's completion state at party-creation time
-- (used to filter already-watched items when include_watched = false).
CREATE TABLE public.party_items (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
    item_id  TEXT NOT NULL,
    title    TEXT NOT NULL,
    poster   TEXT,
    watched  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (party_id, item_id)
);

CREATE INDEX idx_party_items_party ON public.party_items(party_id);

-- ============================================================
-- Caches & stats
-- ============================================================

-- Caches SteamGridDB poster URLs keyed by RAWG game id.
CREATE TABLE public.game_image_cache (
    rawg_id    INT PRIMARY KEY,
    title      TEXT,
    poster_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lifetime counters (single-row table). Currently: total parties ever created.
CREATE TABLE public.app_stats (
    id                 INT PRIMARY KEY DEFAULT 1,
    party_count_total  BIGINT NOT NULL DEFAULT 0,
    CHECK (id = 1)
);

INSERT INTO public.app_stats (id, party_count_total) VALUES (1, 0);

-- ============================================================
-- Grants
-- Required because "Automatically expose new tables" is disabled on this project.
-- The `authenticated` role is the default for signed-in users via supabase-js.
-- Actual access is further restricted by RLS policies (supabase/rls.sql).
-- `service_role` bypasses RLS by default and is used from the backend.
-- `anon` gets nothing — every meaningful action requires auth.
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT                   ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Default privileges so future tables auto-grant to authenticated too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT                  ON SEQUENCES TO authenticated;
