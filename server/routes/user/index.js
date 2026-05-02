const express = require('express');
const router = express();

const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

// All /user endpoints below assume Supabase Auth has already created the
// auth.users row. The handle_new_user DB trigger mirrors it into profiles.
// Sign-in / sign-up / password management happen frontend-direct via supabase-js.

router
    // GET /user/me — current user's profile, collection counts, and a
    // per-collection progress breakdown so the Profile page can show
    // each collection's completion separately instead of just a
    // rolled-up media-type aggregate.
    .get('/me', requireAuth, async (req, res) => {
        const userId = req.user.id;

        const [{ data: profile, error: profileErr }, { data: memberships, error: memErr }] = await Promise.all([
            supabase.from('profiles').select('id, username, created_at').eq('id', userId).maybeSingle(),
            supabase
                .from('collection_members')
                .select('collections(id, name, type, created_at)')
                .eq('user_id', userId),
        ]);

        if (profileErr) return res.status(500).json({ errMsg: profileErr.message });
        if (memErr)     return res.status(500).json({ errMsg: memErr.message });
        if (!profile)   return res.status(404).json({ errMsg: 'Profile not found' });

        const collections = (memberships || [])
            .map(m => m.collections)
            .filter(Boolean)
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                created_at: c.created_at,
                complete: 0,
                total: 0,
            }));

        const counts = { movie: 0, tv: 0, game: 0, board: 0, book: 0 };
        collections.forEach(c => { if (counts[c.type] !== undefined) counts[c.type]++; });

        if (collections.length > 0) {
            const ids = collections.map(c => c.id);
            const { data: items, error: itemsErr } = await supabase
                .from('collection_items')
                .select('collection_id, complete')
                .in('collection_id', ids);
            if (itemsErr) return res.status(500).json({ errMsg: itemsErr.message });

            const byId = new Map(collections.map(c => [c.id, c]));
            (items || []).forEach(it => {
                const c = byId.get(it.collection_id);
                if (!c) return;
                c.total++;
                if (it.complete) c.complete++;
            });
        }

        // Stable client-side ordering: oldest collection first within
        // each type. Lets the Profile page render predictable lists
        // and keeps "first-created" at the top.
        collections.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            const at = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
            return at - bt;
        });

        res.json({
            _id: profile.id,
            username: profile.username,
            created_at: profile.created_at,
            counts,
            collections,
        });
    })
    // GET /user/progress/:type — full per-type breakdown for the new
    // ProgressByType page. Returns each collection with its items
    // (title, poster, complete) so the frontend can render the
    // accordion of progress cards + watched/unwatched poster grids
    // without further round-trips.
    .get('/progress/:type', requireAuth, async (req, res) => {
        const userId = req.user.id;
        const type = req.params.type;
        const VALID_TYPES = new Set(['movie', 'tv', 'game', 'board', 'book']);
        if (!VALID_TYPES.has(type)) return res.status(400).json({ errMsg: 'Invalid type' });

        const { data: memberships, error: memErr } = await supabase
            .from('collection_members')
            .select('collections(id, name, type, created_at)')
            .eq('user_id', userId);
        if (memErr) return res.status(500).json({ errMsg: memErr.message });

        const collections = (memberships || [])
            .map(m => m.collections)
            .filter(c => c && c.type === type)
            .map(c => ({
                id: c.id,
                name: c.name,
                created_at: c.created_at,
                total: 0,
                complete: 0,
                userComplete: 0,
                items: [],
            }));

        if (collections.length > 0) {
            const ids = collections.map(c => c.id);
            const [
                { data: items, error: itemsErr },
                { data: watched, error: watchedErr },
            ] = await Promise.all([
                supabase
                    .from('collection_items')
                    .select('id, collection_id, title, poster, complete, item_id')
                    .in('collection_id', ids),
                // Per-user personal completion flags. Independent from
                // collection_items.complete (the shared/group flag) so we
                // can render a "Group / You" toggle that flips the lens
                // without re-fetching.
                supabase
                    .from('watched_media')
                    .select('item_id')
                    .eq('user_id', userId)
                    .eq('media_type', type)
                    .eq('completed', true),
            ]);
            if (itemsErr) return res.status(500).json({ errMsg: itemsErr.message });
            if (watchedErr) return res.status(500).json({ errMsg: watchedErr.message });

            const watchedItemIds = new Set((watched || []).map(w => String(w.item_id)));
            const byId = new Map(collections.map(c => [c.id, c]));
            (items || []).forEach(it => {
                const c = byId.get(it.collection_id);
                if (!c) return;
                const userComplete = watchedItemIds.has(String(it.item_id));
                c.total++;
                if (it.complete) c.complete++;
                if (userComplete) c.userComplete++;
                c.items.push({
                    id: it.id,
                    itemId: it.item_id,
                    title: it.title,
                    poster: it.poster,
                    complete: !!it.complete,
                    userComplete,
                });
            });
        }

        // Sort collections oldest-first within the type so the page
        // ordering matches what the user already sees on Profile.
        collections.sort((a, b) => {
            const at = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
            return at - bt;
        });

        // Roll up the page-level summary for both the Group lens
        // (collection_items.complete) and the You lens (watched_media)
        // so the client can flip between them without recomputing.
        const summary = collections.reduce((acc, c) => {
            acc.totalCollections += 1;
            acc.totalItems += c.total;
            acc.completeItems += c.complete;
            acc.userCompleteItems += c.userComplete;
            return acc;
        }, { totalCollections: 0, totalItems: 0, completeItems: 0, userCompleteItems: 0 });

        res.json({ type, summary, collections });
    })
    // POST /user/username — change the signed-in user's display name.
    // Surfaces a clean 409 on uniqueness violations so the Settings UI
    // can show "username already taken" without parsing the raw error.
    .post('/username', requireAuth, async (req, res) => {
        const userId = req.user.id;
        const username = (req.body?.username || '').trim();
        if (!username) return res.status(400).json({ errMsg: 'Username is required' });
        if (username.length > 30) return res.status(400).json({ errMsg: 'Username must be 30 characters or fewer' });

        const { error } = await supabase
            .from('profiles')
            .update({ username })
            .eq('id', userId);
        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ errMsg: 'That username is already taken' });
            }
            return res.status(500).json({ errMsg: error.message });
        }
        res.json({ username });
    })

    // DELETE /user/me — deletes the Supabase auth user; ON DELETE CASCADE on profiles
    // removes the profile row, and collection owner_id cascade removes owned rows.
    // Collections where the user is only a member (not owner) stay intact — the
    // collection_members FK cascade removes just their membership.
    .delete('/me', requireAuth, async (req, res) => {
        const userId = req.user.id;
        const { error } = await supabase.auth.admin.deleteUser(userId);
        if (error) return res.status(500).json({ errMsg: error.message });
        res.json({ ok: true });
    })

    // ------------------------------------------------------------------
    // Per-user global watched/played status (watched_media table).
    // Independent from collection_items.complete (which is the shared
    // group-completion flag inside a single collection).
    // ------------------------------------------------------------------
    .get('/watched/:mediaType/:itemId', requireAuth, async (req, res) => {
        const userId = req.user.id;
        const { mediaType, itemId } = req.params;
        const { data, error } = await supabase
            .from('watched_media')
            .select('completed, rating')
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('item_id', String(itemId))
            .maybeSingle();
        if (error) return res.status(500).json({ errMsg: error.message });
        res.json({
            completed: Boolean(data?.completed),
            rating: data?.rating != null ? Number(data.rating) : null,
        });
    })
    .post('/watched/:mediaType/:itemId', requireAuth, async (req, res) => {
        const userId = req.user.id;
        const { mediaType, itemId } = req.params;
        const completed = Boolean(req.body?.completed);
        // Partial upsert: only `completed` is in the payload, so PostgREST
        // leaves `rating` untouched on conflict (and defaults to NULL on
        // a fresh insert).
        const { error } = await supabase
            .from('watched_media')
            .upsert(
                { user_id: userId, media_type: mediaType, item_id: String(itemId), completed, updated_at: new Date().toISOString() },
                { onConflict: 'user_id,media_type,item_id' }
            );
        if (error) return res.status(500).json({ errMsg: error.message });
        res.json({ completed });
    })
    // Per-user personal rating on a 1.0–10.0 scale, stored at one
    // decimal place. `null` clears the rating. Independent of the
    // watched flag — sharing a row in watched_media but updated via
    // a partial upsert that doesn't disturb `completed`.
    .post('/rating/:mediaType/:itemId', requireAuth, async (req, res) => {
        const userId = req.user.id;
        const { mediaType, itemId } = req.params;
        const raw = req.body?.rating;
        let rating = null;
        if (raw !== null && raw !== undefined) {
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 1 || n > 10) {
                return res.status(400).json({ errMsg: 'rating must be between 1.0 and 10.0' });
            }
            rating = Math.round(n * 10) / 10;
        }
        const { error } = await supabase
            .from('watched_media')
            .upsert(
                { user_id: userId, media_type: mediaType, item_id: String(itemId), rating, updated_at: new Date().toISOString() },
                { onConflict: 'user_id,media_type,item_id' }
            );
        if (error) return res.status(500).json({ errMsg: error.message });
        res.json({ rating });
    });

module.exports = router;
