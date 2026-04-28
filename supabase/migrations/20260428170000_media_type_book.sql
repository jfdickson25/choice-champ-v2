-- Books Phase A.2: extend the media_type enum so collections /
-- collection_items / watched_media can carry book rows once the
-- backend Books API ships in Phase B.
--
-- ALTER TYPE ... ADD VALUE is idempotent in spirit (Postgres errors
-- if the value already exists), so wrap in a guarded DO block to
-- make this safe to re-run against a DB where it already landed.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'media_type' AND e.enumlabel = 'book'
    ) THEN
        ALTER TYPE media_type ADD VALUE 'book';
    END IF;
END$$;
