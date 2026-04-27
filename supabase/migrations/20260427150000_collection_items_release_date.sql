-- Source-API release date for an item, captured at add-time so the
-- Collection grid can sort chronologically without on-the-fly API
-- lookups. Nullable; existing rows backfilled by
-- scripts/backfill-release-dates.js. Board games store yearpublished
-- as YYYY-01-01 (full date precision isn't available from BGG).

ALTER TABLE public.collection_items
    ADD COLUMN release_date DATE;

CREATE INDEX idx_collection_items_release_date
    ON public.collection_items(collection_id, release_date);
