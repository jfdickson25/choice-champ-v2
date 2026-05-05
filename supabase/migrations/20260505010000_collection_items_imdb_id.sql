-- IMDb id lookup column on collection_items so the Collection page
-- can sort by IMDb rating: enrich on load via the omdb_cache table
-- (commit 61c515c) instead of a per-item OMDb roundtrip.
--
-- Movie / tv items get imdb_id stamped on add (the add-items handler
-- now hits TMDB external_ids to grab it). Other media types stay
-- NULL — they don't have an IMDb id concept.
--
-- A one-off backfill script populates pre-existing rows.

ALTER TABLE public.collection_items
    ADD COLUMN imdb_id TEXT;
