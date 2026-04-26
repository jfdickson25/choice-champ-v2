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
        const collectionId = req.params.id;

        const { data: collection, error } = await supabase
            .from('collections')
            .select('*, collection_items(*)')
            .eq('id', collectionId)
            .maybeSingle();
        if (error) return res.status(500).json({ errMsg: error.message });
        if (!collection) return res.status(404).json({ errMsg: 'Collection not found' });

        res.json({
            items: (collection.collection_items || []).map(itemToLegacy),
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
    // Refresh poster URLs for every item in a collection from the
    // upstream source APIs. Manual user action — bound to the kebab
    // menu's "Refresh posters" entry. Returns the updated items plus
    // a summary of how many actually changed.
    .post('/refresh-posters/:collectionId', async (req, res) => {
        const { collectionId } = req.params;

        const { data: collection, error: cErr } = await supabase
            .from('collections')
            .select('id, type, collection_items(id, item_id)')
            .eq('id', collectionId)
            .maybeSingle();
        if (cErr) return res.status(500).json({ errMsg: cErr.message });
        if (!collection) return res.status(404).json({ errMsg: 'Collection not found' });

        const items = collection.collection_items || [];
        if (items.length === 0) return res.json({ updated: 0, items: [] });

        const type = collection.type;
        const freshById = new Map();

        if (type === 'board') {
            const ids = items.map(i => i.item_id).filter(Boolean);
            const CHUNK = 20;
            const chunks = [];
            for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
            await Promise.all(chunks.map(async (chunkIds) => {
                try {
                    const r = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${chunkIds.join(',')}`, {
                        headers: { Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}` },
                    });
                    const xml = await r.text();
                    const parsed = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }));
                    const raw = parsed.items && parsed.items.item ? parsed.items.item : [];
                    const things = Array.isArray(raw) ? raw : [raw];
                    for (const t of things) {
                        const id = t._attributes && t._attributes.id;
                        const image = t.image && t.image._text;
                        if (id && image) freshById.set(String(id), image);
                    }
                } catch (err) {
                    console.log('refresh BGG chunk failed:', err.message);
                }
            }));
        } else if (type === 'movie' || type === 'tv') {
            await Promise.all(items.map(async (it) => {
                try {
                    const r = await fetch(`https://api.themoviedb.org/3/${type}/${it.item_id}?api_key=${process.env.MOVIE_DB_API_KEY}`);
                    if (!r.ok) return;
                    const data = await r.json();
                    if (data.poster_path) freshById.set(String(it.item_id), `https://image.tmdb.org/t/p/w500${data.poster_path}`);
                } catch (err) {
                    console.log('refresh TMDB failed:', err.message);
                }
            }));
        } else if (type === 'game') {
            // Reuse the cached SteamGridDB poster table; fall back to RAWG's
            // background_image for entries without a SGDB hit.
            const ids = items.map(i => parseInt(i.item_id, 10)).filter(Number.isFinite);
            const { data: cached } = await supabase
                .from('game_image_cache')
                .select('rawg_id, poster_url')
                .in('rawg_id', ids);
            const cachedMap = new Map((cached || []).map(c => [String(c.rawg_id), c.poster_url]));
            await Promise.all(items.map(async (it) => {
                const fromCache = cachedMap.get(String(it.item_id));
                if (fromCache) {
                    freshById.set(String(it.item_id), fromCache);
                    return;
                }
                try {
                    const r = await fetch(`https://api.rawg.io/api/games/${it.item_id}?key=${process.env.RAWG_API_KEY}`);
                    if (!r.ok) return;
                    const data = await r.json();
                    if (data.background_image) freshById.set(String(it.item_id), data.background_image);
                } catch (err) {
                    console.log('refresh RAWG failed:', err.message);
                }
            }));
        }

        // Apply updates only where the poster actually changed.
        const updates = [];
        for (const it of items) {
            const fresh = freshById.get(String(it.item_id));
            if (fresh) updates.push({ id: it.id, poster: fresh });
        }

        let updated = 0;
        await Promise.all(updates.map(async (u) => {
            const { error: uErr } = await supabase
                .from('collection_items')
                .update({ poster: u.poster })
                .eq('id', u.id);
            if (!uErr) updated++;
        }));

        // Return the refreshed item rows so the frontend can swap them in
        // without a second round-trip.
        const { data: refreshed, error: rErr } = await supabase
            .from('collection_items')
            .select('*')
            .eq('collection_id', collectionId);
        if (rErr) return res.status(500).json({ errMsg: rErr.message });

        res.json({
            updated,
            items: (refreshed || []).map(itemToLegacy),
        });
    })
    // Toggle an item's "complete" flag (legacy: watched).
    .post('/items/:collectionId/:itemId', async (req, res) => {
        const { itemId } = req.params;
        const { error } = await supabase
            .from('collection_items')
            .update({ complete: Boolean(req.body.watched) })
            .eq('id', itemId);
        if (error) return res.status(500).json({ errMsg: error.message });
        res.json({ msg: 'Item Updated' });
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
            .select('collections!inner(id, name, type, collection_items(id, item_id, complete))')
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
