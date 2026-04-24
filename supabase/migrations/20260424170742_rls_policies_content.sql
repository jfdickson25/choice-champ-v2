-- Choice Champ v2 — Row Level Security policies
-- Depends on: 20260424170348_initial_schema.sql

-- ============================================================
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================

-- True if the current user is a member (incl. owner) of the given collection.
CREATE OR REPLACE FUNCTION public.is_collection_member(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.collection_members
        WHERE collection_id = cid AND user_id = auth.uid()
    );
$$;

-- True if the current user is the owner of the given collection.
CREATE OR REPLACE FUNCTION public.is_collection_owner(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.collections
        WHERE id = cid AND owner_id = auth.uid()
    );
$$;

-- ============================================================
-- Enable RLS on every table
-- (automatic RLS is on for new tables, but being explicit for safety)
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watched_media      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_image_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_stats          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- Any authenticated user can read any profile (needed to render
-- usernames in shared collections and parties).
-- Only owning user can update their own row. No direct INSERT
-- (trigger handles it). No DELETE via RLS (rely on auth.users cascade).
-- ============================================================

CREATE POLICY "profiles: read all authenticated"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "profiles: self update"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================================
-- collections
-- ============================================================

CREATE POLICY "collections: members can read"
    ON public.collections FOR SELECT
    TO authenticated
    USING (public.is_collection_member(id));

CREATE POLICY "collections: owner can insert"
    ON public.collections FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "collections: owner can update"
    ON public.collections FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "collections: owner can delete"
    ON public.collections FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

-- ============================================================
-- collection_members
-- A user joining via share code inserts their own membership row.
-- Users can see membership rows for collections they belong to.
-- Users can remove themselves; owner can remove anyone from their collection.
-- ============================================================

CREATE POLICY "members: readable by collection members"
    ON public.collection_members FOR SELECT
    TO authenticated
    USING (public.is_collection_member(collection_id));

CREATE POLICY "members: self insert"
    ON public.collection_members FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "members: self or owner delete"
    ON public.collection_members FOR DELETE
    TO authenticated
    USING (user_id = auth.uid() OR public.is_collection_owner(collection_id));

-- ============================================================
-- collection_items
-- Any member of the collection has full CRUD on items.
-- `complete` toggling is an UPDATE; adding/removing items is INSERT/DELETE.
-- ============================================================

CREATE POLICY "items: members can read"
    ON public.collection_items FOR SELECT
    TO authenticated
    USING (public.is_collection_member(collection_id));

CREATE POLICY "items: members can insert"
    ON public.collection_items FOR INSERT
    TO authenticated
    WITH CHECK (public.is_collection_member(collection_id));

CREATE POLICY "items: members can update"
    ON public.collection_items FOR UPDATE
    TO authenticated
    USING (public.is_collection_member(collection_id))
    WITH CHECK (public.is_collection_member(collection_id));

CREATE POLICY "items: members can delete"
    ON public.collection_items FOR DELETE
    TO authenticated
    USING (public.is_collection_member(collection_id));

-- ============================================================
-- watched_media — strictly per-user
-- ============================================================

CREATE POLICY "watched: self all"
    ON public.watched_media FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- parties
-- Parties are joinable by anyone with the code, so SELECT is open to
-- all authenticated users. INSERT/UPDATE/DELETE restricted to the host.
-- Live participation is tracked via Supabase Realtime Presence, not a DB table.
-- ============================================================

CREATE POLICY "parties: read all authenticated"
    ON public.parties FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "parties: host can insert"
    ON public.parties FOR INSERT
    TO authenticated
    WITH CHECK (host_id = auth.uid());

CREATE POLICY "parties: host can update"
    ON public.parties FOR UPDATE
    TO authenticated
    USING (host_id = auth.uid())
    WITH CHECK (host_id = auth.uid());

CREATE POLICY "parties: host can delete"
    ON public.parties FOR DELETE
    TO authenticated
    USING (host_id = auth.uid());

-- ============================================================
-- party_items
-- Readable by any authenticated user (they'd need the party code to
-- find the party anyway). Mutations tied to the party's host.
-- ============================================================

CREATE POLICY "party_items: read all authenticated"
    ON public.party_items FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "party_items: host can insert"
    ON public.party_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_id AND host_id = auth.uid()
        )
    );

CREATE POLICY "party_items: host can update"
    ON public.party_items FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_id AND host_id = auth.uid()
        )
    );

CREATE POLICY "party_items: host can delete"
    ON public.party_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.parties
            WHERE id = party_id AND host_id = auth.uid()
        )
    );

-- ============================================================
-- game_image_cache — server-side cache
-- Readable by any authenticated user; writes are service_role only
-- (service_role bypasses RLS, so no write policy is needed here).
-- ============================================================

CREATE POLICY "game_cache: read all authenticated"
    ON public.game_image_cache FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- app_stats — lifetime counters
-- Read-only for clients; writes happen from the backend via service_role.
-- ============================================================

CREATE POLICY "app_stats: read all authenticated"
    ON public.app_stats FOR SELECT
    TO authenticated
    USING (true);
