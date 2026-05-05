#!/usr/bin/env node
/*
 * One-off backfill: fill collection_items.imdb_id for movie / tv rows
 * added before the column existed (commit-pending). Hits TMDB's
 * /external_ids endpoint per item, persists the imdb_id, then pings
 * OMDb to pre-warm the omdb_cache table so the first sort-by-IMDb
 * after this runs already has rating data.
 *
 * Usage:
 *   node scripts/backfill-imdb-ids.js
 *
 * Env (loaded from server/.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   MOVIE_DB_API_KEY     — required (TMDB external_ids lookups)
 *   OMDB_API_KEY         — optional; if missing the OMDb pre-warm is skipped
 *
 * Safe to re-run — only touches movie/tv rows where imdb_id IS NULL.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_KEY = process.env.MOVIE_DB_API_KEY;
const OMDB_KEY = process.env.OMDB_API_KEY;
const REQUEST_DELAY_MS = 150;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
    process.exit(1);
}
if (!TMDB_KEY) {
    console.error('Missing MOVIE_DB_API_KEY in server/.env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchImdbId(mediaType, itemId) {
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${itemId}/external_ids?api_key=${TMDB_KEY}`);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    return data?.imdb_id || null;
}

async function warmOmdbCache(imdbId) {
    if (!OMDB_KEY) return false;
    try {
        // Skip if already cached.
        const { data: existing } = await supabase
            .from('omdb_cache')
            .select('imdb_id')
            .eq('imdb_id', imdbId)
            .maybeSingle();
        if (existing) return true;

        const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`);
        const parsed = await res.json();
        if (parsed?.Response !== 'True') return false;

        const rt = parsed.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || null;
        const cleanOrNull = (v) => v && v !== 'N/A' ? v : null;
        await supabase.from('omdb_cache').upsert({
            imdb_id: imdbId,
            imdb_rating: cleanOrNull(parsed.imdbRating),
            rotten_tomatoes: rt,
            metacritic: cleanOrNull(parsed.Metascore),
            awards: cleanOrNull(parsed.Awards),
            rated: cleanOrNull(parsed.Rated),
            fetched_at: new Date().toISOString(),
        }, { onConflict: 'imdb_id' });
        return true;
    } catch (_) {
        return false;
    }
}

async function main() {
    const { data: rows, error } = await supabase
        .from('collection_items')
        .select('id, item_id, media_type, title')
        .in('media_type', ['movie', 'tv'])
        .is('imdb_id', null);
    if (error) throw error;

    console.log(`Found ${rows.length} movie/tv rows missing imdb_id.`);
    if (rows.length === 0) return;

    // Dedupe — if the same TMDB title sits in N collections we only
    // need to look up its imdb_id once, then bulk-update all rows.
    const byKey = new Map();
    for (const row of rows) {
        const key = `${row.media_type}:${row.item_id}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(row);
    }
    console.log(`Unique TMDB ids to look up: ${byKey.size}`);

    let filled = 0;
    let warmed = 0;
    let failed = 0;
    const titlesPerKey = (key) => byKey.get(key)[0]?.title || '?';

    for (const [key, group] of byKey) {
        const [mediaType, tmdbId] = key.split(':');
        const tag = `${mediaType}/${tmdbId} (${titlesPerKey(key)})`;
        try {
            const imdbId = await fetchImdbId(mediaType, tmdbId);
            if (!imdbId) {
                console.log(`  · skip ${tag} — TMDB has no IMDb id`);
                continue;
            }
            const ids = group.map(r => r.id);
            const { error: upErr } = await supabase
                .from('collection_items')
                .update({ imdb_id: imdbId })
                .in('id', ids);
            if (upErr) throw upErr;
            filled += ids.length;
            console.log(`  ✓ ${tag} → ${imdbId} (${ids.length} row${ids.length === 1 ? '' : 's'})`);

            const didWarm = await warmOmdbCache(imdbId);
            if (didWarm) warmed++;
        } catch (err) {
            console.log(`  ! ${tag} — ${err.message}`);
            failed++;
        }
        await sleep(REQUEST_DELAY_MS);
    }

    console.log(`\nDone. Filled: ${filled} rows  OMDb warmed: ${warmed} ids  Failed: ${failed}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
