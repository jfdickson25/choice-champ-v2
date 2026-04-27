const express = require('express');
const router = express();
const convert = require('xml-js');

const { supabase } = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

// Map a collection_items DB row to the legacy response shape the frontend expects.
const itemToLegacy = (row) => ({
    _id: row.id,
    title: row.title,
    poster: row.poster,
    watched: row.complete,
    itemId: row.item_id,
    timestamp: row.added_at ? Math.floor(new Date(row.added_at).getTime() / 1000) : null,
    completedAt: row.completed_at ? Math.floor(new Date(row.completed_at).getTime() / 1000) : null,
});

// Map a collections DB row (with nested items) to the legacy shape.
const collectionToLegacy = (c) => ({
    _id: c.id,
    owner: c.owner_id,
    shareCode: c.share_code,
    name: c.name,
    type: c.type,
    items: (c.collection_items || []).map(itemToLegacy),
});

const generateShareCode = async () => {
    for (let i = 0; i < 20; i++) {
        const code = String(Math.floor(10000 + Math.random() * 90000));
        const { count } = await supabase
            .from('collections')
            .select('id', { count: 'exact', head: true })
            .eq('share_code', code);
        if (!count) return code;
    }
    throw new Error('Failed to generate unique share code');
};

router.use(requireAuth);

router
    // Join a collection by share code.
    .get('/join/:shareCode/:mediaType/:userId', async (req, res) => {
        const userId = req.user.id;
        const { shareCode, mediaType } = req.params;

        const { data: collection, error: cErr } = await supabase
            .from('collections')
            .select('*, collection_items(*)')
            .eq('share_code', shareCode)
            .maybeSingle();
        if (cErr) return res.status(500).json({ errMsg: cErr.message });
        if (!collection) return res.status(404).json({ errMsg: 'No collection with that share code found' });
        if (collection.type !== mediaType) return res.status(400).json({ errMsg: 'Collection type does not match' });

        const { count } = await supabase
            .from('collection_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('collection_id', collection.id)
            .eq('user_id', userId);
        if (count) return res.status(400).json({ errMsg: 'You already have this collection' });

        const { error: memErr } = await supabase
            .from('collection_members')
            .insert({ collection_id: collection.id, user_id: userId });
        if (memErr) return res.status(500).json({ errMsg: memErr.message });

        res.status(201).json({ collection: collectionToLegacy(collection) });
    })
    // Get items in a specific collection.
    .get('/items/:id', async (req, res) => {
        const userId = req.user.id;
        const collectionId = req.params.id;

        const { data: collection, error } = await supabase
            .from('collections')
            .select('*, collection_items(*)')
            .eq('id', collectionId)
            .maybeSingle();
        if (error) return res.status(500).json({ errMsg: error.message });
        if (!collection) return res.status(404).json({ errMsg: 'Collection not found' });

        const itemRows = collection.collection_items || [];

        // Per-user personal ratings live on watched_media keyed by
        // (user, media_type, item_id). Pull the requesting user's
        // ratings for just this collection's items in one query so
        // the Collection grid can offer a "sort by rating" option.
        let ratingByItemId = {};
        if (itemRows.length > 0) {
            const itemIds = [...new Set(itemRows.map(r => String(r.item_id)))];
            const { data: ratings } = await supabase
                .from('watched_media')
                .select('item_id, rating')
                .eq('user_id', userId)
                .eq('media_type', collection.type)
                .in('item_id', itemIds);
            ratingByItemId = Object.fromEntries(
                (ratings || [])
                    .filter(r => r.rating != null)
                    .map(r => [String(r.item_id), Number(r.rating)])
            );
        }

        res.json({
            items: itemRows.map(row => ({
                ...itemToLegacy(row),
                userRating: ratingByItemId[String(row.item_id)] ?? null,
            })),
            shareCode: collection.share_code,
            name: collection.name,
        });
    })
    // Add items to a collection. Board-game items require a BGG XML lookup.
    .post('/items/:id', async (req, res) => {
        const collectionId = req.params.id;

        const { data: collection, error: cErr } = await supabase
            .from('collections')
            .select('id, type')
            .eq('id', collectionId)
            .maybeSingle();
        if (cErr) return res.status(500).json({ errMsg: cErr.message });
        if (!collection) return res.status(404).json({ errMsg: 'Collection not found' });

        const inserts = [];
        for (const item of req.body) {
            if (collection.type === 'board') {
                const details = await fetch(`https://boardgamegeek.com/xmlapi/boardgame/${item.id}`, {
                    headers: { Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}` },
                });
                const xml = await details.text();
                const parsed = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }));
                let name;
                const nameNode = parsed.boardgames.boardgame.name;
                if (Array.isArray(nameNode)) {
                    for (const n of nameNode) {
                        if (n._attributes?.primary === 'true') name = n._text;
                    }
                } else {
                    name = nameNode._text;
                }
                inserts.push({
                    collection_id: collectionId,
                    item_id: String(item.id),
                    media_type: collection.type,
                    title: name,
                    poster: parsed.boardgames.boardgame.image?._text,
                    complete: false,
                });
            } else {
                inserts.push({
                    collection_id: collectionId,
                    item_id: String(item.id),
                    media_type: collection.type,
                    title: item.title,
                    poster: item.poster,
                    complete: false,
                });
            }
        }

        const { data: newRows, error: insErr } = await supabase
            .from('collection_items')
            .insert(inserts)
            .select();
        if (insErr) return res.status(500).json({ errMsg: insErr.message });

        res.json({ newItems: newRows.map(itemToLegacy) });
    })
    // Update an item's stored poster URL. Used by ItemDetails when it
    // notices the latest poster from the source API differs from the
    // poster we stored at add-time (lazy, on-demand refresh per item).
    .post('/items/:collectionId/:itemId/poster', async (req, res) => {
        const { itemId } = req.params;
        const poster = typeof req.body?.poster === 'string' ? req.body.poster : null;
        if (!poster) return res.status(400).json({ errMsg: 'poster is required' });
        const { error } = await supabase
            .from('collection_items')
            .update({ poster })
            .eq('id', itemId);
        if (error) return res.status(500).json({ errMsg: error.message });
        res.json({ poster });
    })
    // Toggle an item's "complete" flag (legacy: watched). Stamps
    // completed_at so we can sort "Recently Watched" client-side, or
    // clears it if the user is un-marking the item.
    .post('/items/:collectionId/:itemId', async (req, res) => {
        const { itemId } = req.params;
        const watched = Boolean(req.body.watched);
        const { data, error } = await supabase
            .from('collection_items')
            .update({
                complete: watched,
                completed_at: watched ? new Date().toISOString() : null,
            })
            .eq('id', itemId)
            .select('completed_at')
            .maybeSingle();
        if (error) return res.status(500).json({ errMsg: error.message });
        const completedAt = data && data.completed_at
            ? Math.floor(new Date(data.completed_at).getTime() / 1000)
            : null;
        res.json({ msg: 'Item Updated', completedAt });
    })
    // Delete an item from a collection.
    .delete('/items/:collectionId/:itemId', async (req, res) => {
        const { itemId } = req.params;
        const { error } = await supabase
            .from('collection_items')
            .delete()
            .eq('id', itemId);
        if (error) return res.status(500).json({ errMsg: error.message });
        res.send('Item removed');
    })
    // List the members of a collection (owner badge included). Auth-
    // gated to actual members so we don't leak a roster to outsiders
    // who happened to know the collection's id.
    .get('/members/:collectionId', async (req, res) => {
        const userId = req.user.id;
        const { collectionId } = req.params;

        const { data: own, error: ownErr } = await supabase
            .from('collection_members')
            .select('user_id')
            .eq('collection_id', collectionId)
            .eq('user_id', userId)
            .maybeSingle();
        if (ownErr) return res.status(500).json({ errMsg: ownErr.message });
        if (!own) return res.status(403).json({ errMsg: 'Not a member of this collection' });

        const { data: collection, error: cErr } = await supabase
            .from('collections')
            .select('owner_id')
            .eq('id', collectionId)
            .maybeSingle();
        if (cErr) return res.status(500).json({ errMsg: cErr.message });
        if (!collection) return res.status(404).json({ errMsg: 'Collection not found' });

        const { data: rows, error } = await supabase
            .from('collection_members')
            .select('user_id, joined_at, profiles(id, username)')
            .eq('collection_id', collectionId);
        if (error) return res.status(500).json({ errMsg: error.message });

        const members = (rows || []).map(r => ({
            id: r.user_id,
            username: r.profiles?.username || 'Unknown',
            isOwner: r.user_id === collection.owner_id,
            joinedAt: r.joined_at,
        }));
        // Owner first, then everyone else by join order.
        members.sort((a, b) => {
            if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
            const at = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const bt = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return at - bt;
        });
        // joinedAt was only needed for sorting; don't expose it.
        res.json({ members: members.map(({ id, username, isOwner }) => ({ id, username, isOwner })) });
    })
    // Rename a collection.
    .post('/name/:id', async (req, res) => {
        const { error } = await supabase
            .from('collections')
            .update({ name: req.body.name })
            .eq('id', req.params.id);
        if (error) return res.status(500).json({ errMsg: error.message });
        res.send('Success');
    })
    // List all of my collections that can contain this item + flag which already do.
    .get('/collectionList/:mediaType/:itemId/:userId', async (req, res) => {
        const userId = req.user.id;
        const { mediaType, itemId } = req.params;

        const { data: memberships, error: mErr } = await supabase
            .from('collection_members')
            .select('collections!inner(id, name, type, collection_items(id, item_id, complete, completed_at))')
            .eq('user_id', userId)
            .eq('collections.type', mediaType);
        if (mErr) return res.status(500).json({ errMsg: mErr.message });

        const collections = (memberships || []).map(m => {
            const c = m.collections;
            const hit = (c.collection_items || []).find(i => String(i.item_id) === String(itemId));
            return {
                name: c.name,
                collectionId: c.id,
                exists: Boolean(hit),
                itemId: hit ? hit.id : undefined,
                complete: hit ? Boolean(hit.complete) : false,
                completedAt: hit && hit.completed_at
                    ? Math.floor(new Date(hit.completed_at).getTime() / 1000)
                    : null,
            };
        });

        res.json({ collections });
    })
    // List all of my collections of a given media type.
    .get('/:type/:userId', async (req, res) => {
        const userId = req.user.id;
        const { type } = req.params;

        const { data: memberships, error } = await supabase
            .from('collection_members')
            .select('collections!inner(*, collection_items(*))')
            .eq('user_id', userId)
            .eq('collections.type', type);
        if (error) return res.status(500).json({ errMsg: error.message });

        const collections = (memberships || []).map(m => collectionToLegacy(m.collections));
        res.json({ collections });
    })
    // Create a new collection.
    .post('/:userId', async (req, res) => {
        const userId = req.user.id;
        const { name, type } = req.body;

        let shareCode;
        try {
            shareCode = await generateShareCode();
        } catch (err) {
            return res.status(500).json({ errMsg: err.message });
        }

        const { data: newCollection, error: cErr } = await supabase
            .from('collections')
            .insert({ owner_id: userId, share_code: shareCode, name, type })
            .select()
            .single();
        if (cErr) return res.status(500).json({ errMsg: cErr.message });

        const { error: memErr } = await supabase
            .from('collection_members')
            .insert({ collection_id: newCollection.id, user_id: userId });
        if (memErr) return res.status(500).json({ errMsg: memErr.message });

        res.status(201).json({ collection: collectionToLegacy({ ...newCollection, collection_items: [] }) });
    })
    // Remove a collection from my list. If I'm the only member, the collection
    // and its items are deleted (via cascade). Otherwise just my membership goes.
    .delete('/:type/:userId/:id', async (req, res) => {
        const userId = req.user.id;
        const { id: collectionId } = req.params;

        const { data: collection, error: cErr } = await supabase
            .from('collections')
            .select('owner_id')
            .eq('id', collectionId)
            .maybeSingle();
        if (cErr) return res.status(500).json({ errMsg: cErr.message });
        if (!collection) return res.status(404).json({ errMsg: 'Collection not found' });

        const { error: memErr } = await supabase
            .from('collection_members')
            .delete()
            .eq('collection_id', collectionId)
            .eq('user_id', userId);
        if (memErr) return res.status(500).json({ errMsg: memErr.message });

        const { count } = await supabase
            .from('collection_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('collection_id', collectionId);

        if (!count) {
            const { error: delErr } = await supabase
                .from('collections')
                .delete()
                .eq('id', collectionId);
            if (delErr) return res.status(500).json({ errMsg: delErr.message });
        }

        res.status(201).send('Collection removed');
    });

module.exports = router;
