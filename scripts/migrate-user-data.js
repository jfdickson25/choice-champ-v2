#!/usr/bin/env node
/*
 * One-off migration script: bring a Mongo user's owned collections (and their
 * items) over to the Supabase schema. Skips collections owned by others.
 *
 * Usage:
 *   MIGRATE_USERNAME=danield MIGRATE_EMAIL=danieldickson89@gmail.com \
 *     node scripts/migrate-user-data.js
 *
 * Requires /server/.env to contain SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * The Supabase user must already exist (sign up first, then run this).
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const { createClient } = require('@supabase/supabase-js');

const MIGRATE_USERNAME = process.env.MIGRATE_USERNAME;
const MIGRATE_EMAIL = process.env.MIGRATE_EMAIL;

if (!MIGRATE_USERNAME || !MIGRATE_EMAIL) {
    console.error('Set MIGRATE_USERNAME and MIGRATE_EMAIL env vars.');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

// Mongo ObjectId → Date. First 4 bytes (8 hex) = seconds since epoch.
const objectIdToDate = (oid) => {
    if (typeof oid !== 'string' || oid.length < 8) return null;
    const secs = parseInt(oid.substring(0, 8), 16);
    return Number.isNaN(secs) ? null : new Date(secs * 1000);
};

async function main() {
    const usersFile = glob.sync(path.join(__dirname, '..', 'mongodbjson', 'users-*.json'))[0];
    const colsFile  = glob.sync(path.join(__dirname, '..', 'mongodbjson', 'collections-*.json'))[0];
    if (!usersFile || !colsFile) throw new Error('Mongo export files not found in /mongodbjson');

    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const collections = JSON.parse(fs.readFileSync(colsFile, 'utf8'));

    const mongoUser = users.find(u => u.username === MIGRATE_USERNAME);
    if (!mongoUser) throw new Error(`No Mongo user with username "${MIGRATE_USERNAME}"`);
    const mongoUserId = mongoUser._id;

    // Find the matching Supabase auth user by email.
    const { data: authList, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) throw authErr;
    const authUser = authList.users.find(u => u.email === MIGRATE_EMAIL);
    if (!authUser) throw new Error(`No Supabase auth user with email "${MIGRATE_EMAIL}" — sign up first`);
    const supabaseUserId = authUser.id;

    console.log(`Mongo user:    ${mongoUser.username} (${mongoUserId})`);
    console.log(`Supabase user: ${MIGRATE_EMAIL} (${supabaseUserId})`);

    const owned = collections.filter(c => c.owner === mongoUserId);
    console.log(`Collections owned: ${owned.length}`);
    const totalItems = owned.reduce((sum, c) => sum + (c.items || []).length, 0);
    console.log(`Total items:       ${totalItems}`);

    let migratedCollections = 0;
    let migratedItems = 0;

    for (const c of owned) {
        console.log(`\n→ ${c.name} [${c.type}] (${(c.items || []).length} items, share=${c.shareCode})`);

        // Skip if already migrated (share_code unique check).
        const { data: existing } = await supabase
            .from('collections')
            .select('id')
            .eq('share_code', String(c.shareCode))
            .maybeSingle();
        if (existing) {
            console.log(`   already migrated (share_code ${c.shareCode}) — skipping`);
            continue;
        }

        const collectionCreatedAt = objectIdToDate(c._id) || new Date();

        const { data: newCol, error: colErr } = await supabase
            .from('collections')
            .insert({
                owner_id: supabaseUserId,
                share_code: String(c.shareCode),
                name: c.name,
                type: c.type,
                created_at: collectionCreatedAt.toISOString(),
            })
            .select()
            .single();
        if (colErr) throw new Error(`Collection insert failed: ${colErr.message}`);

        const { error: memErr } = await supabase
            .from('collection_members')
            .insert({ collection_id: newCol.id, user_id: supabaseUserId, joined_at: collectionCreatedAt.toISOString() });
        if (memErr) throw new Error(`Member insert failed: ${memErr.message}`);

        const itemRows = (c.items || []).map(item => {
            const addedAt = objectIdToDate(item._id) || collectionCreatedAt;
            return {
                collection_id: newCol.id,
                item_id: String(item.itemId),
                media_type: c.type,
                title: item.title,
                poster: item.poster || null,
                complete: Boolean(item.watched),
                added_at: addedAt.toISOString(),
            };
        });

        if (itemRows.length > 0) {
            const { error: itemErr } = await supabase.from('collection_items').insert(itemRows);
            if (itemErr) throw new Error(`Items insert failed: ${itemErr.message}`);
        }

        migratedCollections++;
        migratedItems += itemRows.length;
        console.log(`   ✓ ${itemRows.length} items`);
    }

    console.log(`\n──────────────────────────`);
    console.log(`Migrated ${migratedCollections} collections, ${migratedItems} items.`);
}

main().catch(err => {
    console.error('\n✗ Migration failed:', err.message || err);
    process.exit(1);
});
