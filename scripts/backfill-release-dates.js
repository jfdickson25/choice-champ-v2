#!/usr/bin/env node
/*
 * One-off backfill: fill collection_items.release_date for rows added
 * before the column existed. Hits /media/getInfo on the deployed backend
 * (it already parses release dates per source API) then writes the
 * normalized DATE back via the service-role Supabase client.
 *
 * Usage:
 *   BACKEND_URL=https://your-deploy.vercel.app node scripts/backfill-release-dates.js
 *
 * Env (loaded from server/.env via dotenv):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Safe to re-run — only touches rows where release_date IS NULL.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const { createClient } = require('@supabase/supabase-js');

const BACKEND_URL = process.env.BACKEND_URL || 'https://choice-champ-v2.vercel.app';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REQUEST_DELAY_MS = 200;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const normalizeReleaseDate = (raw, mediaType) => {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    if (mediaType === 'board') {
        const m = s.match(/^(\d{4})/);
        return m ? `${m[1]}-01-01` : null;
    }
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

async function fetchReleaseDate(mediaType, itemId) {
    const res = await fetch(`${BACKEND_URL}/media/getInfo/${mediaType}/${itemId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body?.media?.details?.releaseDate ?? null;
}

async function main() {
    console.log(`Backfill source: ${BACKEND_URL}`);
    const { data: rows, error } = await supabase
        .from('collection_items')
        .select('id, item_id, media_type, title')
        .is('release_date', null);
    if (error) throw error;

    console.log(`Found ${rows.length} item rows missing release_date.`);
    if (rows.length === 0) return;

    let filled = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
        const tag = `${row.media_type}/${row.item_id} (${row.title || '?'})`;
        try {
            const raw = await fetchReleaseDate(row.media_type, row.item_id);
            const normalized = normalizeReleaseDate(raw, row.media_type);
            if (!normalized) {
                console.log(`  · skip ${tag} — source returned no usable date`);
                skipped++;
                continue;
            }
            const { error: upErr } = await supabase
                .from('collection_items')
                .update({ release_date: normalized })
                .eq('id', row.id);
            if (upErr) throw upErr;
            console.log(`  ✓ ${tag} → ${normalized}`);
            filled++;
        } catch (err) {
            console.log(`  ! ${tag} — ${err.message}`);
            failed++;
        }
        await sleep(REQUEST_DELAY_MS);
    }

    console.log(`\nDone. Filled: ${filled}  Skipped: ${skipped}  Failed: ${failed}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
