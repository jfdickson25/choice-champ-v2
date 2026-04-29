import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    shapeIncomingItems,
    filterByVotesAndSuperChoice,
    computeRunnerUps,
    isWinnerDeclared,
    resetForNextRound,
    canAdvanceRound,
} from './voting.mjs';

const raw = (overrides = {}) => ({
    _id: 'a1',
    itemId: 'tmdb-123',
    title: 'Test Movie',
    poster: 'p.jpg',
    watched: false,
    ...overrides,
});

const voting = (overrides = {}) => ({
    id: 'a1',
    itemId: 'tmdb-123',
    title: 'Test Movie',
    poster: 'p.jpg',
    watched: false,
    votes: 0,
    superChoice: false,
    tempSuperChoice: false,
    holdSuperChoice: false,
    voted: false,
    ...overrides,
});

// ─── shapeIncomingItems ───────────────────────────────────────────

test('shapeIncomingItems handles empty/non-array input', () => {
    assert.deepEqual(shapeIncomingItems([]), []);
    assert.deepEqual(shapeIncomingItems(null), []);
    assert.deepEqual(shapeIncomingItems(undefined), []);
});

test('shapeIncomingItems seeds voting state to zero', () => {
    const out = shapeIncomingItems([raw()]);
    assert.equal(out.length, 1);
    assert.equal(out[0].votes, 0);
    assert.equal(out[0].voted, false);
    assert.equal(out[0].superChoice, false);
    assert.equal(out[0].tempSuperChoice, false);
    assert.equal(out[0].holdSuperChoice, false);
});

test('shapeIncomingItems dedupes by itemId', () => {
    const out = shapeIncomingItems([
        raw({ _id: 'a1', itemId: 'tmdb-1' }),
        raw({ _id: 'a2', itemId: 'tmdb-1' }), // dup
        raw({ _id: 'a3', itemId: 'tmdb-2' }),
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(i => i.itemId), ['tmdb-1', 'tmdb-2']);
});

test('shapeIncomingItems drops watched items when includeWatched=false', () => {
    const out = shapeIncomingItems([
        raw({ itemId: 'tmdb-1', watched: false }),
        raw({ itemId: 'tmdb-2', watched: true }),
        raw({ itemId: 'tmdb-3', watched: false }),
    ], { includeWatched: false });
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(i => i.itemId), ['tmdb-1', 'tmdb-3']);
});

test('shapeIncomingItems keeps watched items by default', () => {
    const out = shapeIncomingItems([
        raw({ itemId: 'tmdb-1', watched: false }),
        raw({ itemId: 'tmdb-2', watched: true }),
    ]);
    assert.equal(out.length, 2);
});

// ─── filterByVotesAndSuperChoice ──────────────────────────────────

test('filterByVotesAndSuperChoice keeps items at or above threshold', () => {
    const items = [
        voting({ itemId: 'a', votes: 0 }),
        voting({ itemId: 'b', votes: 2 }),
        voting({ itemId: 'c', votes: 3 }),
    ];
    const out = filterByVotesAndSuperChoice(items, 2);
    assert.deepEqual(out.map(i => i.itemId), ['b', 'c']);
});

test('filterByVotesAndSuperChoice keeps super-choice items even with zero votes', () => {
    const items = [
        voting({ itemId: 'a', votes: 0 }),
        voting({ itemId: 'b', votes: 0, holdSuperChoice: true }),
        voting({ itemId: 'c', votes: 0, tempSuperChoice: true }),
    ];
    const out = filterByVotesAndSuperChoice(items, 1);
    assert.deepEqual(out.map(i => i.itemId), ['b', 'c']);
});

test('filterByVotesAndSuperChoice handles non-array input', () => {
    assert.deepEqual(filterByVotesAndSuperChoice(null, 1), []);
});

// ─── computeRunnerUps ─────────────────────────────────────────────

test('computeRunnerUps returns items below threshold without super choice', () => {
    const items = [
        voting({ itemId: 'a', votes: 0 }),
        voting({ itemId: 'b', votes: 3 }),
        voting({ itemId: 'c', votes: 1 }),
    ];
    const out = computeRunnerUps(items, 2);
    assert.deepEqual(out.map(i => i.itemId), ['a', 'c']);
});

test('computeRunnerUps mirrors legacy "votes < threshold" check', () => {
    // Pinning historical Party.jsx behavior — super-choice items
    // below threshold DO appear here. See voting.mjs for rationale.
    const items = [
        voting({ itemId: 'a', votes: 0, tempSuperChoice: true }),
        voting({ itemId: 'b', votes: 0, holdSuperChoice: true }),
        voting({ itemId: 'c', votes: 0 }),
    ];
    const out = computeRunnerUps(items, 1);
    assert.deepEqual(out.map(i => i.itemId), ['a', 'b', 'c']);
});

// ─── isWinnerDeclared ─────────────────────────────────────────────

test('isWinnerDeclared is true for exactly one item', () => {
    assert.equal(isWinnerDeclared([voting()]), true);
});

test('isWinnerDeclared is false for zero or multiple items', () => {
    assert.equal(isWinnerDeclared([]), false);
    assert.equal(isWinnerDeclared([voting(), voting({ itemId: 'b' })]), false);
});

test('isWinnerDeclared handles non-array input', () => {
    assert.equal(isWinnerDeclared(null), false);
    assert.equal(isWinnerDeclared(undefined), false);
});

// ─── resetForNextRound ────────────────────────────────────────────

test('resetForNextRound zeroes votes and voted on every item', () => {
    const items = [
        voting({ itemId: 'a', votes: 3, voted: true }),
        voting({ itemId: 'b', votes: 5, voted: false }),
    ];
    const out = resetForNextRound(items);
    assert.equal(out[0].votes, 0);
    assert.equal(out[0].voted, false);
    assert.equal(out[1].votes, 0);
    assert.equal(out[1].voted, false);
});

test('resetForNextRound promotes temp/holdSuperChoice into sticky superChoice', () => {
    const items = [
        voting({ itemId: 'a', tempSuperChoice: true }),
        voting({ itemId: 'b', holdSuperChoice: true }),
        voting({ itemId: 'c' }), // no super choice
    ];
    const out = resetForNextRound(items);
    assert.equal(out[0].superChoice, true);
    assert.equal(out[0].tempSuperChoice, false);
    assert.equal(out[0].holdSuperChoice, false);
    assert.equal(out[1].superChoice, true);
    assert.equal(out[1].tempSuperChoice, false);
    assert.equal(out[1].holdSuperChoice, false);
    assert.equal(out[2].superChoice, false);
});

test('resetForNextRound preserves a previously sticky superChoice', () => {
    const items = [voting({ itemId: 'a', superChoice: true })];
    const out = resetForNextRound(items);
    assert.equal(out[0].superChoice, true);
});

test('resetForNextRound returns NEW objects (no input mutation)', () => {
    const items = [voting({ itemId: 'a', votes: 3 })];
    const out = resetForNextRound(items);
    assert.notEqual(out[0], items[0]);
    assert.equal(items[0].votes, 3); // input unchanged
});

// ─── canAdvanceRound ──────────────────────────────────────────────

test('canAdvanceRound is true once every present user has tapped ready', () => {
    assert.equal(canAdvanceRound(3, 3), true);
    assert.equal(canAdvanceRound(4, 3), true); // host counted twice from a glitch — still advance
});

test('canAdvanceRound is false when any user is still pending', () => {
    assert.equal(canAdvanceRound(2, 3), false);
});

test('canAdvanceRound returns false for missing/zero user counts', () => {
    assert.equal(canAdvanceRound(0, 0), false);
    assert.equal(canAdvanceRound(undefined, 1), false);
    assert.equal(canAdvanceRound(1, undefined), false);
});

// ─── End-to-end round mechanics ───────────────────────────────────

test('integration: typical round arrives at a winner', () => {
    // 3 candidates, 2 votes needed, only one item gets enough.
    const items = [
        voting({ itemId: 'a', votes: 2 }),
        voting({ itemId: 'b', votes: 1 }),
        voting({ itemId: 'c', votes: 0 }),
    ];
    const advanced = filterByVotesAndSuperChoice(items, 2);
    const losers = computeRunnerUps(items, 2);
    assert.equal(isWinnerDeclared(advanced), true);
    assert.deepEqual(advanced.map(i => i.itemId), ['a']);
    assert.deepEqual(losers.map(i => i.itemId), ['b', 'c']);
});

test('integration: super-choice item advances even without enough votes', () => {
    const items = [
        voting({ itemId: 'a', votes: 5 }),                       // crushed it
        voting({ itemId: 'b', votes: 0, tempSuperChoice: true }),// nominated
        voting({ itemId: 'c', votes: 1 }),                       // squeaked low
    ];
    const advanced = filterByVotesAndSuperChoice(items, 2);
    assert.deepEqual(advanced.map(i => i.itemId), ['a', 'b']);
    // Both move on to the next round; reset clears votes and promotes
    // the super-choice flag to sticky.
    const next = resetForNextRound(advanced);
    assert.equal(next.find(i => i.itemId === 'b').superChoice, true);
    assert.equal(next.find(i => i.itemId === 'b').tempSuperChoice, false);
    assert.equal(next[0].votes, 0);
});

test('integration: no item meets the threshold and there are no super choices → empty advance set', () => {
    const items = [
        voting({ itemId: 'a', votes: 1 }),
        voting({ itemId: 'b', votes: 1 }),
    ];
    assert.deepEqual(filterByVotesAndSuperChoice(items, 2), []);
});
