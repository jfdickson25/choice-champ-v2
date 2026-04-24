const express = require('express');
const router = express();

const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

// All /user endpoints below assume Supabase Auth has already created the
// auth.users row. The handle_new_user DB trigger mirrors it into profiles.
// Sign-in / sign-up / password management happen frontend-direct via supabase-js.

router
    // GET /user/me — current user's profile + collection counts + completion progress
    .get('/me', requireAuth, async (req, res) => {
        const userId = req.user.id;

        const [{ data: profile, error: profileErr }, { data: memberships, error: memErr }] = await Promise.all([
            supabase.from('profiles').select('id, username, created_at').eq('id', userId).maybeSingle(),
            supabase
                .from('collection_members')
                .select('collection_id, collections(id, type)')
                .eq('user_id', userId),
        ]);

        if (profileErr) return res.status(500).json({ errMsg: profileErr.message });
        if (memErr)     return res.status(500).json({ errMsg: memErr.message });
        if (!profile)   return res.status(404).json({ errMsg: 'Profile not found' });

        const collectionsByType = { movie: [], tv: [], game: [], board: [] };
        (memberships || []).forEach(m => {
            const c = m.collections;
            if (c && collectionsByType[c.type]) collectionsByType[c.type].push(c.id);
        });

        const progress = { movie: { watched: 0, total: 0 }, tv: { watched: 0, total: 0 }, game: { watched: 0, total: 0 }, board: { watched: 0, total: 0 } };

        const allCollectionIds = Object.values(collectionsByType).flat();
        if (allCollectionIds.length > 0) {
            const { data: items, error: itemsErr } = await supabase
                .from('collection_items')
                .select('collection_id, media_type, complete')
                .in('collection_id', allCollectionIds);
            if (itemsErr) return res.status(500).json({ errMsg: itemsErr.message });

            (items || []).forEach(it => {
                const bucket = progress[it.media_type];
                if (!bucket) return;
                bucket.total++;
                if (it.complete) bucket.watched++;
            });
        }

        res.json({
            _id: profile.id,
            username: profile.username,
            created_at: profile.created_at,
            counts: {
                movie: collectionsByType.movie.length,
                tv:    collectionsByType.tv.length,
                game:  collectionsByType.game.length,
                board: collectionsByType.board.length,
            },
            progress,
        });
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
    });

module.exports = router;
