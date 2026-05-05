-- OMDb response cache. Keyed by IMDb id (which TMDB exposes via
-- /external_ids on movie + tv detail responses), shared globally
-- across all users. The /getInfo handler reads from here on every
-- detail-page open and only hits OMDb when the cached row is older
-- than ~7 days, dropping OMDb quota usage by ~90% for a steady
-- audience and shaving an upstream roundtrip off most page loads.

CREATE TABLE public.omdb_cache (
    imdb_id          TEXT PRIMARY KEY,
    imdb_rating      TEXT,
    rotten_tomatoes  TEXT,
    metacritic       TEXT,
    awards           TEXT,
    rated            TEXT,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role inherits ALL via the default-privileges grants from
-- 20260424170951_service_role_grants.sql, so no extra GRANTs needed
-- here. RLS is left disabled — only the backend (service_role) ever
-- reads / writes this table.
