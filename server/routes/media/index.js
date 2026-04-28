const express = require('express');
const router = express();
const convert = require('xml-js');
require('dotenv').config();

const { supabase } = require('../../lib/supabase');

const SGDB_NO_MATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SGDB_LOOKUP_TIMEOUT_MS = 1500;

async function lookupSgdbPoster(title) {
    const token = process.env.STEAM_GRID_DB_API_TOKEN;
    if(!token) return null;

    const searchRes = await fetch(
        `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if(!searchRes.ok) throw new Error(`SGDB search ${searchRes.status}`);
    const searchData = await searchRes.json();
    const sgdbId = searchData.data && searchData.data[0] && searchData.data[0].id;
    if(!sgdbId) return null;

    const gridQuery = new URLSearchParams({
        dimensions: '600x900,660x930,342x482',
        mimes: 'image/png,image/jpeg,image/webp',
        types: 'static'
    });
    const gridsRes = await fetch(
        `https://www.steamgriddb.com/api/v2/grids/game/${sgdbId}?${gridQuery}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if(!gridsRes.ok) throw new Error(`SGDB grids ${gridsRes.status}`);
    const gridsData = await gridsRes.json();
    const firstGrid = gridsData.data && gridsData.data[0];
    return firstGrid ? firstGrid.url : null;
}

async function getSgdbPoster(rawgId, title) {
    if(!rawgId || !title) return null;

    const { data: cached } = await supabase
        .from('game_image_cache')
        .select('poster_url, updated_at')
        .eq('rawg_id', rawgId)
        .maybeSingle();

    if(cached) {
        if(cached.poster_url) return cached.poster_url;
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if(age < SGDB_NO_MATCH_TTL_MS) return null;
    }

    try {
        const posterUrl = await lookupSgdbPoster(title);
        await supabase
            .from('game_image_cache')
            .upsert({ rawg_id: rawgId, title, poster_url: posterUrl, updated_at: new Date().toISOString() });
        return posterUrl;
    } catch(err) {
        console.log('SGDB lookup failed for', rawgId, title, err.message);
        return null;
    }
}

function getSgdbPosterWithTimeout(rawgId, title) {
    return Promise.race([
        getSgdbPoster(rawgId, title),
        new Promise(resolve => setTimeout(() => resolve(null), SGDB_LOOKUP_TIMEOUT_MS))
    ]);
}

router
    .get('/getInfo/:type/:id', async (req, res, next) => {
        const id = req.params.id;
        const type = req.params.type;

        try {
        if(type === 'movie' || type === 'tv') {
            const details = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${process.env.MOVIE_DB_API_KEY}&language=en-US`);
            const detailsData = await details.json();

            const providers = await fetch(`https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${process.env.MOVIE_DB_API_KEY}&language=en-US`);
            const providersData = await providers.json();

            let providersObj = {};

            if(providersData.results.US) {
                // Remove provier_id, and display_priority from each provider
                if(providersData.results.US.buy) {
                    providersData.results.US.buy.forEach(provider => {
                        delete provider.provider_id;
                        delete provider.display_priority;
                    });

                    providersObj.buy = providersData.results.US.buy;
                }

                if(providersData.results.US.rent) {
                    providersData.results.US.rent.forEach(provider => {
                        delete provider.provider_id;
                        delete provider.display_priority;
                    });

                    providersObj.rent = providersData.results.US.rent;
                }

                if(providersData.results.US.flatrate) {
                    providersData.results.US.flatrate.forEach(provider => {
                        delete provider.provider_id;
                        delete provider.display_priority;
                    });

                    providersObj.stream = providersData.results.US.flatrate;
                }
            }

            let title;
            let runtime;
            let releaseDate;

            if(type === 'movie') {
                title = detailsData.title;
                runtime = detailsData.runtime;
                releaseDate = detailsData.release_date;

            } else {
                title = detailsData.name;
                runtime = detailsData.number_of_seasons;
                releaseDate = detailsData.first_air_date;
            }

            const response = {
                details: {
                    title: title,
                    overview: detailsData.overview,
                    poster: `https://image.tmdb.org/t/p/w500${detailsData.poster_path}`,
                    releaseDate: releaseDate,
                    runtime: runtime,
                    rating: detailsData.vote_average.toFixed(1)
                },
                providers: providersObj
            }

            res.send({media: response});
        } else if(type === 'game') {
            const rawgRes = await fetch(`https://api.rawg.io/api/games/${id}?key=${process.env.RAWG_API_KEY}`);
            const data = await rawgRes.json();

            const sgdbPoster = await getSgdbPosterWithTimeout(data.id, data.name);

            const response = {
                details: {
                    name: data.name,
                    overview: data.description_raw || '',
                    poster: sgdbPoster || data.background_image || null,
                    releaseDate: data.released,
                    runtime: data.playtime || null,
                    rating: data.rating != null && data.rating > 0 ? (data.rating * 2).toFixed(1) : null
                },
                providers: {
                    platforms: (data.platforms || []).map(p => ({ name: p.platform && p.platform.name }))
                }
            }

            res.send({media: response});
        } else if (type === 'board') {
            const details = await fetch(`https://boardgamegeek.com/xmlapi/boardgame/${id}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                    }
                }
            );

            const data = await details.text();

            const dataJson = convert.xml2json(data, {compact: true, spaces: 4});

            const dataParsed = JSON.parse(dataJson);

            let name;

            // Find the name object that has the primary attribute
            if(dataParsed.boardgames.boardgame.name.length > 1) {
                for(let i = 0; i < dataParsed.boardgames.boardgame.name.length; i++) {
                    if(dataParsed.boardgames.boardgame.name[i]._attributes.primary === 'true') {
                        name = dataParsed.boardgames.boardgame.name[i]._text;
                    }
                }
            } else {
                name = dataParsed.boardgames.boardgame.name._text;
            }

            const boardGame = {
                title: name,
                overview: dataParsed.boardgames.boardgame.description._text,
                poster: dataParsed.boardgames.boardgame.image._text,
                releaseDate: dataParsed.boardgames.boardgame.yearpublished._text,
                runtime: dataParsed.boardgames.boardgame.playingtime._text,
                minPlayers: dataParsed.boardgames.boardgame.minplayers._text,
                maxPlayers: dataParsed.boardgames.boardgame.maxplayers._text
            }

            res.send({media: {
                details: boardGame
            }});
        }
        } catch(err) {
            console.log(`getInfo failed for ${type}/${id}:`, err.message);
            res.status(502).send({ errMsg: `Failed to fetch ${type} details from upstream API` });
        }
    })
    .get('/discover/:type/:feed', async (req, res, next) => {
        const { type, feed } = req.params;
        const page = parseInt(req.query.page, 10) || 1;

        const tmdbFeeds = {
            movie: {
                trending: '/trending/movie/week',
                popular: '/movie/popular',
                top_rated: '/movie/top_rated',
                upcoming: '/movie/upcoming'
            },
            tv: {
                trending: '/trending/tv/week',
                popular: '/tv/popular',
                top_rated: '/tv/top_rated',
                on_air: '/tv/on_the_air'
            }
        };

        try {
            if(type === 'movie' || type === 'tv') {
                if(feed === 'search') {
                    const q = req.query.q || '';
                    if(!q.trim()) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${process.env.MOVIE_DB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false&page=${page}`);
                    const data = await tmdbRes.json();

                    const results = (data.results || []).map(item => ({
                        id: item.id,
                        title: type === 'movie' ? item.title : item.name,
                        poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                        rating: item.vote_average,
                        releaseDate: type === 'movie' ? item.release_date : item.first_air_date
                    }));

                    return res.send({
                        results,
                        page: data.page || page,
                        totalPages: data.total_pages || 1
                    });
                }

                const path = tmdbFeeds[type][feed];
                if(!path) {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type '${type}'` });
                }

                const tmdbRes = await fetch(`https://api.themoviedb.org/3${path}?api_key=${process.env.MOVIE_DB_API_KEY}&language=en-US&page=${page}`);
                const data = await tmdbRes.json();

                const results = (data.results || []).map(item => ({
                    id: item.id,
                    title: type === 'movie' ? item.title : item.name,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                    rating: item.vote_average,
                    releaseDate: type === 'movie' ? item.release_date : item.first_air_date
                }));

                return res.send({
                    results,
                    page: data.page || page,
                    totalPages: data.total_pages || 1
                });
            } else if(type === 'game') {
                const pageSize = 20;

                // RAWG specific platform IDs for current-gen filtering:
                //   4   = PC
                //   187 = PlayStation 5
                //   186 = Xbox Series S/X
                //   7   = Nintendo Switch (includes Switch 2 — RAWG
                //                          hasn't split that out yet)
                // Using `platforms` (not `parent_platforms`) so we can
                // be specific about generations rather than rolling
                // every legacy console into the brand bucket.
                const PLATFORM_IDS = { pc: 4, ps5: 187, 'xbox-series': 186, switch: 7 };
                const platformId = PLATFORM_IDS[req.query.platform];
                const platformParam = platformId ? `&platforms=${platformId}` : '';

                // Collapse re-releases ("Game: Deluxe Edition", "Game –
                // Game of the Year Cut", etc.) onto their base title so
                // we don't show the same game three times. Trusts RAWG's
                // popularity ordering and keeps the first occurrence.
                // Doesn't touch DLCs ("Game: Shadow of the X") — those
                // still surface separately as their own products.
                const stripEditionSuffix = (name) => (name || '')
                    // "<Game> [: | - ] <Adj> Edition / Cut / Version"
                    // Word "edition" / "cut" / "version" required so we
                    // don't accidentally strip real titles starting
                    // with words like "Special" or "Standard".
                    .replace(
                        /[\s:\-–—]+(?:the\s+)?(?:complete|deluxe|ultimate|definitive|gold|premium|legendary|game of the year|goty|enhanced|anniversary|royal|extended|special|standard)\s+(?:edition|cut|version)\b.*$/i,
                        ''
                    )
                    // Standalone re-release keywords: "Director's Cut",
                    // "Remastered". Each must have a separator before it
                    // so we don't strip into the middle of a title.
                    .replace(/[\s:\-–—]+director'?s\s+cut\b.*$/i, '')
                    .replace(/\s+remastered?\b.*$/i, '')
                    .trim()
                    .toLowerCase();
                const dedupeEditions = (items) => {
                    const seen = new Set();
                    const out = [];
                    for (const item of items) {
                        const base = stripEditionSuffix(item.name);
                        if (seen.has(base)) continue;
                        seen.add(base);
                        out.push(item);
                    }
                    return out;
                };

                if(feed === 'search') {
                    const q = req.query.q || '';
                    if(!q.trim()) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }
                    // Fetch a wider candidate pool (40 — RAWG's max page
                    // size) so the local re-rank below has more title
                    // matches to surface. Drop ordering=-added so RAWG's
                    // own relevance sort applies. Avoid search_precise —
                    // it tightens token matching enough that legitimate
                    // matches ("Animal Crossing: New Horizons") can fall
                    // off the page entirely; the local rerank handles
                    // fuzzy noise just fine.
                    const candidatePoolSize = 40;
                    const rawgRes = await fetch(`https://api.rawg.io/api/games?key=${process.env.RAWG_API_KEY}&search=${encodeURIComponent(q)}${platformParam}&page=1&page_size=${candidatePoolSize}`);
                    const data = await rawgRes.json();

                    const results = dedupeEditions(data.results || []).map(item => ({
                        id: item.id,
                        title: item.name,
                        poster: item.background_image || null,
                        rating: item.rating != null && item.rating > 0 ? (item.rating * 2).toFixed(1) : null,
                        releaseDate: item.released
                    }));

                    // Re-rank by how closely each title matches the query.
                    // Note this is intentionally one tier looser than the
                    // board-game search: exact match and starts-with are
                    // bucketed together so that for a series, the newest
                    // entry wins regardless of whether it's titled exactly
                    // "Animal Crossing" or "Animal Crossing: New Horizons".
                    // (Board games keep them separate because the "exact"
                    // hit is usually the base game, which you want before
                    // its expansions.)
                    const queryLower = q.trim().toLowerCase();
                    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wholeWordRe = new RegExp(`\\b${escapeRe(queryLower)}\\b`);
                    const rankMatch = (title) => {
                        const t = (title || '').toLowerCase();
                        if (t.startsWith(queryLower)) return 0;   // exact + starts-with
                        if (wholeWordRe.test(t)) return 1;        // whole-word
                        if (t.includes(queryLower)) return 2;     // contains
                        return 3;                                  // RAWG fuzzy hit
                    };
                    // Within the same tier, prefer newer releases — for
                    // "Animal Crossing" the user wants New Horizons (2020)
                    // before Wild World (2005). Missing release dates sort
                    // last within their tier. Falls back to RAWG's order
                    // (popularity) for items without dates.
                    const releaseTimestamp = (r) => {
                        if (!r.releaseDate) return -Infinity;
                        const t = Date.parse(r.releaseDate);
                        return Number.isFinite(t) ? t : -Infinity;
                    };
                    const ranked = results
                        .map((r, i) => ({ r, i, tier: rankMatch(r.title), ts: releaseTimestamp(r) }))
                        .sort((a, b) => (a.tier - b.tier) || (b.ts - a.ts) || (a.i - b.i))
                        .map(({ r }) => r);

                    return res.send({
                        results: ranked,
                        page: 1,
                        totalPages: 1
                    });
                }

                const today = new Date().toISOString().slice(0, 10);
                const monthsAgo = new Date();
                monthsAgo.setMonth(monthsAgo.getMonth() - 6);
                const sixMonthsAgo = monthsAgo.toISOString().slice(0, 10);
                const yearAhead = new Date();
                yearAhead.setFullYear(yearAhead.getFullYear() + 1);
                const yearFromNow = yearAhead.toISOString().slice(0, 10);

                const feedQueries = {
                    popular: `ordering=-added`,
                    top_rated: `ordering=-rating`,
                    new: `dates=${sixMonthsAgo},${today}&ordering=-released`,
                    upcoming: `dates=${today},${yearFromNow}&ordering=released`
                };

                const queryString = feedQueries[feed];
                if(!queryString) {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type 'game'. Supported: popular, top_rated, new, upcoming, search.` });
                }

                const rawgRes = await fetch(`https://api.rawg.io/api/games?key=${process.env.RAWG_API_KEY}&${queryString}${platformParam}&page=${page}&page_size=${pageSize}`);
                const data = await rawgRes.json();

                const results = dedupeEditions(data.results || []).map(item => ({
                    id: item.id,
                    title: item.name,
                    poster: item.background_image || null,
                    rating: item.rating != null && item.rating > 0 ? (item.rating * 2).toFixed(1) : null,
                    releaseDate: item.released
                }));

                return res.send({
                    results,
                    page,
                    totalPages: data.count ? Math.ceil(data.count / pageSize) : 1
                });
            } else if(type === 'board') {
                // Batch-fetch BGG /thing for a list of game IDs and return
                // a Map of id → full-resolution <image> URL. The /hot and
                // /search endpoints only return small thumbnails which
                // look blurry in our poster grid; /thing has the original.
                // BGG caps /thing at 20 IDs per request, so chunk and run
                // chunks in parallel. Failures fall back silently — caller
                // uses thumbnails.
                const BGG_THING_CHUNK = 20;
                const fetchBoardImages = async (ids) => {
                    const map = new Map();
                    if (!ids.length) return map;
                    const chunks = [];
                    for (let i = 0; i < ids.length; i += BGG_THING_CHUNK) {
                        chunks.push(ids.slice(i, i + BGG_THING_CHUNK));
                    }
                    await Promise.all(chunks.map(async (chunkIds) => {
                        try {
                            const thingRes = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${chunkIds.join(',')}`, {
                                headers: { Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}` }
                            });
                            const thingXml = await thingRes.text();
                            const thingParsed = JSON.parse(convert.xml2json(thingXml, { compact: true, spaces: 4 }));
                            const rawThings = thingParsed.items && thingParsed.items.item ? thingParsed.items.item : [];
                            const things = Array.isArray(rawThings) ? rawThings : [rawThings];
                            for (const t of things) {
                                const id = t._attributes && t._attributes.id;
                                const image = t.image && t.image._text;
                                if (id && image) map.set(String(id), image);
                            }
                        } catch (err) {
                            console.log('BGG /thing chunk failed:', err.message);
                        }
                    }));
                    return map;
                };

                if(feed === 'search') {
                    const q = req.query.q || '';
                    if(!q.trim()) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }
                    const bggRes = await fetch(`https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(q)}&type=boardgame`, {
                        headers: {
                            Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                        }
                    });
                    const xml = await bggRes.text();
                    const parsed = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }));

                    const rawItems = parsed.items && parsed.items.item ? parsed.items.item : [];
                    const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];
                    const ids = itemArray
                        .map(item => item._attributes && item._attributes.id)
                        .filter(Boolean);
                    const imageMap = await fetchBoardImages(ids);

                    const results = itemArray.map(item => {
                        const id = item._attributes && item._attributes.id;
                        return {
                            id,
                            title: item.name && item.name._attributes && item.name._attributes.value,
                            poster: imageMap.get(String(id)) || null,
                            rating: null,
                            releaseDate: item.yearpublished && item.yearpublished._attributes && item.yearpublished._attributes.value || null
                        };
                    });

                    // BGG returns search results alphabetically, which buries
                    // matches like "Wingspan" deep in the W's. Re-rank by how
                    // closely each title matches the query so exact / starts-
                    // with hits float to the top, then fall back to alpha.
                    // The whole-word tier uses a word-boundary regex (not a
                    // split-on-whitespace check) so punctuation in titles like
                    // "Catan: Cities & Knights" doesn't sink a query for
                    // "catan" into the contains-tier.
                    const queryLower = q.trim().toLowerCase();
                    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wholeWordRe = new RegExp(`\\b${escapeRe(queryLower)}\\b`);
                    const rankMatch = (title) => {
                        const t = (title || '').toLowerCase();
                        if (t === queryLower) return 0;                                  // exact
                        if (t.startsWith(queryLower)) return 1;                          // starts with
                        if (wholeWordRe.test(t)) return 2;                               // whole-word match
                        if (t.includes(queryLower)) return 3;                            // contains
                        return 4;                                                        // BGG fuzzy hit
                    };
                    results.sort((a, b) => {
                        const diff = rankMatch(a.title) - rankMatch(b.title);
                        if (diff !== 0) return diff;
                        return (a.title || '').localeCompare(b.title || '');
                    });

                    return res.send({
                        results,
                        page: 1,
                        totalPages: 1
                    });
                }

                if(feed !== 'hot') {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type 'board'. Supported: hot, search.` });
                }

                const bggRes = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', {
                    headers: {
                        Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                    }
                });
                const xml = await bggRes.text();
                const parsed = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }));

                const rawItems = parsed.items && parsed.items.item ? parsed.items.item : [];
                const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];
                const hotIds = itemArray
                    .map(item => item._attributes && item._attributes.id)
                    .filter(Boolean);
                const hotImageMap = await fetchBoardImages(hotIds);

                const results = itemArray.map(item => {
                    const id = item._attributes && item._attributes.id;
                    const thumbUrl = item.thumbnail && item.thumbnail._attributes && item.thumbnail._attributes.value || null;
                    return {
                        id,
                        title: item.name && item.name._attributes && item.name._attributes.value,
                        poster: hotImageMap.get(String(id)) || thumbUrl,
                        rating: null,
                        releaseDate: item.yearpublished && item.yearpublished._attributes && item.yearpublished._attributes.value || null
                    };
                });

                return res.send({
                    results,
                    page: 1,
                    totalPages: 1
                });
            } else {
                return res.status(400).send({ errMsg: `Invalid type '${type}'. Supported: movie, tv, game, board.` });
            }
        } catch(err) {
            console.log(err);
            return res.status(500).send({ errMsg: 'Failed to fetch discover content' });
        }
    })
    .post('/game-posters', async (req, res) => {
        const items = Array.isArray(req.body) ? req.body : [];
        const result = {};

        if(items.length === 0) {
            return res.send({ posters: result });
        }

        const rawgIds = items.map(i => parseInt(i.id, 10)).filter(Boolean);
        const titleById = new Map(items.map(i => [parseInt(i.id, 10), i.title]));

        try {
            const { data: cached = [] } = await supabase
                .from('game_image_cache')
                .select('rawg_id, poster_url, updated_at')
                .in('rawg_id', rawgIds);
            const cacheMap = new Map((cached || []).map(c => [c.rawg_id, c]));
            const now = Date.now();
            const uncachedIds = [];

            for(const id of rawgIds) {
                const entry = cacheMap.get(id);
                if(!entry) { uncachedIds.push(id); continue; }
                if(entry.poster_url) { result[id] = entry.poster_url; continue; }
                if(now - new Date(entry.updated_at).getTime() > SGDB_NO_MATCH_TTL_MS) {
                    uncachedIds.push(id);
                } else {
                    result[id] = null;
                }
            }

            if(uncachedIds.length > 0) {
                await Promise.allSettled(uncachedIds.map(async (id) => {
                    const poster = await getSgdbPosterWithTimeout(id, titleById.get(id));
                    result[id] = poster;
                }));
            }

            for(const id of rawgIds) {
                if(!(id in result)) result[id] = null;
            }

            res.send({ posters: result });
        } catch(err) {
            console.log('game-posters failed:', err.message);
            res.send({ posters: result });
        }
    })
    .get('/:type/:title/:page', async (req, res, next) => {
        const title = req.params.title;
        const page = req.params.page;
        const type = req.params.type;

        let responseJson;

        if(type === 'movie' || type === 'tv') {
            let response = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${process.env.MOVIE_DB_API_KEY}&query=${title}&include_adult=false&page=${page}`);
            responseJson = await response.json();
            // Sort results by popularity
            responseJson.results.sort((a, b) => {
                return b.popularity - a.popularity;
            });
        } else if (type === 'board') {
            // Limit search to 20 results
            const resp = await fetch(
                `https://boardgamegeek.com/xmlapi2/search?query=${title}&type=boardgame`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                    }
                }
            );
            
            let data = await resp.text();

            const dataJson = convert.xml2json(data, {compact: true, spaces: 4});

            const dataParsed = JSON.parse(dataJson);

            const boardGames = [];

            // Handle no results
            if(dataParsed.items.item === undefined) {
                responseJson = {
                    results: []
                }
                res.send({media: responseJson});
                return;
            }
            // Handle single result
            else if(dataParsed.items.item !== undefined && dataParsed.items.item.length === undefined) {
                boardGames.push({
                    id: dataParsed.items.item._attributes.id,
                    name: dataParsed.items.item.name._attributes.value
                });
            } else {
                // Populate boardGames array with all results and only their id and name
                for(let i = 0; i < dataParsed.items.item.length; i++) {
                    // If the name attribute matches the search term, add it to the beginning of the array
                    if(dataParsed.items.item[i].name._attributes.value.toLowerCase() === title.toLowerCase()) {
                        boardGames.unshift({
                            id: dataParsed.items.item[i]._attributes.id,
                            name: dataParsed.items.item[i].name._attributes.value
                        });
                    } else {
                        boardGames.push({
                            id: dataParsed.items.item[i]._attributes.id,
                            name: dataParsed.items.item[i].name._attributes.value
                        });
                    }
                }
            }

            responseJson = {
                results: boardGames
            }
        } else {
            res.status(400).send({errMsg: 'Invalid type'});
            next();
        }

        res.send({media: responseJson});
    });


module.exports = router;