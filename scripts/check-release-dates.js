#!/usr/bin/env node
/*
 * Diagnostic: report release_date coverage on collection_items, broken
 * down by media_type and (optionally) collection name or id. Read-only.
 *
 * Usage:
 *   node scripts/check-release-dates.js
 *   node scripts/check-release-dates.js "Daniel"           # name substring
 *   node scripts/check-release-dates.js b9435a13-...       # collection id
 *
 * Substring match (case-insensitive) handles the smart-vs-straight
 * apostrophe trap on iOS — typing "Daniel" matches "Daniel's Favs"
 * regardless of which apostrophe iOS substituted at rename time.
 *
 * Env (loaded from server/.env via dotenv):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
    const filterArg = process.argv[2];
    const filterIsId = filterArg && UUID_RE.test(filterArg);

    let query = supabase
        .from('collection_items')
        .select('id, title, media_type, release_date, collection_id, collections!inner(name)');
    if (filterIsId) {
        query = query.eq('collection_id', filterArg);
    } else if (filterArg) {
        query = query.ilike('collections.name', `%${filterArg}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const filterDesc = filterIsId
        ? ` (collection id=${filterArg})`
        : filterArg
        ? ` (collection name contains "${filterArg}")`
        : '';
    console.log(`\nTotal rows: ${rows.length}${filterDesc}`);
    if (rows.length === 0) {
        if (filterArg) console.log('  No items matched.');
        return;
    }

    const byType = {};
    for (const r of rows) {
        const t = r.media_type;
        byType[t] = byType[t] || { total: 0, filled: 0 };
        byType[t].total++;
        if (r.release_date) byType[t].filled++;
    }

    console.log('\nrelease_date coverage by media_type:');
    for (const [t, s] of Object.entries(byType)) {
        const pct = ((s.filled / s.total) * 100).toFixed(0);
        console.log(`  ${t.padEnd(8)}  ${s.filled}/${s.total}  (${pct}%)`);
    }

    const missing = rows.filter(r => !r.release_date);
    if (missing.length > 0) {
        console.log(`\nFirst ${Math.min(10, missing.length)} rows missing release_date:`);
        for (const r of missing.slice(0, 10)) {
            console.log(`  · [${r.media_type}] ${r.title}`);
        }
        if (missing.length > 10) console.log(`  ... and ${missing.length - 10} more`);
        console.log('\nRun:  node scripts/backfill-release-dates.js');
    } else {
        console.log('\nAll rows have release_date set.');
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
