-- Add a per-item completion timestamp so the Collection detail page
-- can offer a "Recently Watched" sort. Backfills existing already-
-- watched rows with their added_at so they have a sensible default
-- order; future toggles populate with the actual moment of completion.

ALTER TABLE public.collection_items
    ADD COLUMN completed_at TIMESTAMPTZ;

UPDATE public.collection_items
    SET completed_at = added_at
    WHERE complete = true;

-- Index for the new sort dimension.
CREATE INDEX idx_collection_items_completed_at
    ON public.collection_items(collection_id, completed_at DESC);
