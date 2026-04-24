#!/usr/bin/env node
/*
 * Migrate a Mongo user's owned collections to Supabase.
 *
 * Modes:
 *   - If a Supabase auth user with MIGRATE_EMAIL already exists, reuse their UUID.
 *   - Otherwise, create one via Admin API (inviteUserByEmail sends a set-password email).
 *
 * For each migrated collection, also adds cross-membership for any OTHER
 * already-migrated Supabase users (via the KNOWN_USERS map below) who had
 * that collection in their Mongo collection arrays.
 *
 * Usage:
 *   MIGRATE_USERNAME=jfdickson MIGRATE_EMAIL=jfdickson25@gmail.com \
 *     node scripts/migrate-user-data.js
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

// Mongo _id → Supabase UUID for users already migrated. When we migrate a new
// user and one of their collections was shared with someone in this map,
// that person gets added as a collection_member automatically.
const KNOWN_USERS = {
    '643b828f270b5fbc90be1220': '6546972d-9d13-4b29-a71b-3e212ca01f75', // Daniel (danieldickson89@gmail.com)
    '644578bafbb5cae4dee6bae0': '26693c67-6e1d-4e96-86b8-e3c259891a10', // Jordan (jfdickson25@gmail.com)
    '64e6ca05f61f2867e6b5044f': 'db6eceb0-720f-47ee-b7e5-fc078121eea8', // Seth   (sethford09@gmail.com)
    '643b82b9270b5fbc90be1290': 'cf0e6cd1-ae58-423c-9ac3-0139dcd30541', // Kyle   (kyledickson7@gmail.com) — no invite email sent (rate limited)
    '643b3ed1270b5fbc90bdf49a': '23c76767-602b-4a50-a84d-a2f0055de893', // Molly  (mollyfalck97@gmail.com)
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const objectIdToDate = (oid) => {
    if (typeof oid !== 'string' || oid.length < 8) return null;
    const secs = parseInt(oid.substring(0, 8), 16);
    return Number.isNaN(secs) ? null : new Date(secs * 1000);
};

const userHasCollection = (mongoUser, collectionId) => {
    const arrays = [
        mongoUser.movieCollections, mongoUser.tvCollections,
        mongoUser.videoGameCollections, mongoUser.boardGameCollections,
    ];
    return arrays.some(arr => Array.isArray(arr) && arr.includes(collectionId));
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

    // Find or create the Supabase auth user.
    const { data: authList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    let supabaseUserId = authList.users.find(u => u.email === MIGRATE_EMAIL)?.id;

    if (supabaseUserId) {
        console.log(`Reusing existing Supabase user: ${MIGRATE_EMAIL} (${supabaseUserId})`);
    } else {
        console.log(`Creating Supabase user for ${MIGRATE_EMAIL}...`);
        try {
            const { data, error } = await supabase.auth.admin.inviteUserByEmail(MIGRATE_EMAIL, {
                data: { username: MIGRATE_USERNAME },
            });
            if (error) throw error;
            supabaseUserId = data.user.id;
            console.log(`  ✓ created (${supabaseUserId}); invite email sent`);
        } catch (err) {
            const isRateLimit = /rate limit/i.test(err.message || '');
            if (!isRateLimit) throw err;
            console.log(`  ⚠  email rate limit hit; creating user without invite`);
            const { data, error } = await supabase.auth.admin.createUser({
                email: MIGRATE_EMAIL,
                email_confirm: true,
                user_metadata: { username: MIGRATE_USERNAME },
            });
            if (error) throw error;
            supabaseUserId = data.user.id;
            console.log(`  ✓ created (${supabaseUserId}); NO email — send invite later`);
        }
    }

    const owned = collections.filter(c => c.owner === mongoUserId);
    console.log(`Mongo user:  ${mongoUser.username} (${mongoUserId})`);
    console.log(`Collections: ${owned.length}`);
    console.log(`Items total: ${owned.reduce((s, c) => s + (c.items || []).length, 0)}`);

    let migratedCollections = 0;
    let migratedItems = 0;
    let crossMemberships = 0;

    for (const c of owned) {
        // Idempotency: skip if share code already exists.
        const { data: existing } = await supabase
            .from('collections')
            .select('id')
            .eq('share_code', String(c.shareCode))
            .maybeSingle();
        if (existing) {
            console.log(`  ⏭  ${c.name} [${c.type}] — already migrated (share ${c.shareCode})`);
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
        if (colErr) throw new Error(`Collection insert failed (${c.name}): ${colErr.message}`);

        // Owner self-membership.
        const memberships = [{
            collection_id: newCol.id,
            user_id: supabaseUserId,
            joined_at: collectionCreatedAt.toISOString(),
        }];

        // Cross-memberships: other Mongo users who had this collection AND
        // are already migrated to Supabase.
        for (const otherMongoUser of users) {
            if (otherMongoUser._id === mongoUserId) continue;
            if (!KNOWN_USERS[otherMongoUser._id]) continue;
            if (userHasCollection(otherMongoUser, c._id)) {
                memberships.push({
                    collection_id: newCol.id,
                    user_id: KNOWN_USERS[otherMongoUser._id],
                    joined_at: collectionCreatedAt.toISOString(),
                });
                crossMemberships++;
            }
        }

        const { error: memErr } = await supabase.from('collection_members').insert(memberships);
        if (memErr) throw new Error(`Members insert failed (${c.name}): ${memErr.message}`);

        const itemRows = (c.items || []).map(item => ({
            collection_id: newCol.id,
            item_id: String(item.itemId),
            media_type: c.type,
            title: item.title,
            poster: item.poster || null,
            complete: Boolean(item.watched),
            added_at: (objectIdToDate(item._id) || collectionCreatedAt).toISOString(),
        }));

        if (itemRows.length > 0) {
            const { error: itemErr } = await supabase.from('collection_items').insert(itemRows);
            if (itemErr) throw new Error(`Items insert failed (${c.name}): ${itemErr.message}`);
        }

        migratedCollections++;
        migratedItems += itemRows.length;
        console.log(`  ✓ ${c.name} [${c.type}] — ${itemRows.length} items, ${memberships.length} member(s)`);
    }

    console.log(`\n──────────────────────────`);
    console.log(`Migrated ${migratedCollections} collections, ${migratedItems} items.`);
    console.log(`Cross-memberships added: ${crossMemberships}`);
    console.log(`\nNew Supabase user: ${MIGRATE_EMAIL} → ${supabaseUserId}`);
    console.log(`Add this to KNOWN_USERS for future migrations:`);
    console.log(`    '${mongoUserId}': '${supabaseUserId}',`);
}

main().catch(err => {
    console.error('\n✗ Migration failed:', err.message || err);
    process.exit(1);
});
