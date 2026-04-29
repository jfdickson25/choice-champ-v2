// Pure voting / round logic extracted from Party.jsx so the trickiest
// part of the codebase has a unit-test boundary that doesn't require
// mounting React, mocking Supabase realtime, or stubbing fetch. Every
// function here returns new objects rather than mutating its inputs,
// so tests can compare deep-equal without worrying about side effects.

// Coerce raw collection_items rows into the in-memory shape Party.jsx
// uses while voting. Dedupes by itemId (the same item can be in
// multiple selected collections), optionally drops anything the user
// has already watched, and seeds the voting state to zero.
//
// Caller still applies a random sort after this returns — that's
// nondeterministic and intentionally not part of the pure pipeline.
export function shapeIncomingItems(rawItems, { includeWatched = true } = {}) {
    if (!Array.isArray(rawItems)) return [];
    const seen = new Set();
    const shaped = [];
    for (const item of rawItems) {
        if (!item || seen.has(item.itemId)) continue;
        if (!includeWatched && item.watched) continue;
        seen.add(item.itemId);
        shaped.push({
            id: item._id,
            itemId: item.itemId,
            title: item.title,
            poster: item.poster,
            watched: item.watched,
            votes: 0,
            superChoice: false,
            tempSuperChoice: false,
            holdSuperChoice: false,
            voted: false,
        });
    }
    return shaped;
}

// Items that survive a round: enough votes to cross the threshold OR
// any super-choice flag set (tempSuperChoice from this round, or
// holdSuperChoice carried in from the previous round).
export function filterByVotesAndSuperChoice(items, votesNeeded) {
    if (!Array.isArray(items)) return [];
    return items.filter(item =>
        item.votes >= votesNeeded ||
        item.holdSuperChoice ||
        item.tempSuperChoice
    );
}

// Items that didn't reach the vote threshold — used to populate the
// runner-up list when a winner has been declared. Mirrors the
// historical Party.jsx behavior of checking only the vote count.
//
// Edge case worth noting: when a super-choice item with zero votes
// is the lone winner, it would also satisfy `votes < threshold` and
// appear in this list. In practice the runner-up list is only
// computed when exactly one item advanced, so the only way that
// edge case trips is when the lone winner advanced via super-choice
// alone — preserving the original behavior here intentionally so
// this extraction is a pure no-op refactor.
export function computeRunnerUps(items, votesNeeded) {
    if (!Array.isArray(items)) return [];
    return items.filter(item => item.votes < votesNeeded);
}

// True if the round is decisive — exactly one item advanced and we
// can declare a winner.
export function isWinnerDeclared(filteredItems) {
    return Array.isArray(filteredItems) && filteredItems.length === 1;
}

// Reset items for the next round: zero out votes/voted, and promote
// any super-choice flags to a sticky superChoice=true so the user
// sees a star on subsequent rounds. Returns NEW objects (no mutation).
export function resetForNextRound(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        const wasSuperChoice = item.tempSuperChoice || item.holdSuperChoice;
        return {
            ...item,
            votes: 0,
            voted: false,
            superChoice: wasSuperChoice ? true : item.superChoice,
            tempSuperChoice: false,
            holdSuperChoice: false,
        };
    });
}

// Predicate for when the host can advance the round — every present
// user has tapped Ready/Finish.
export function canAdvanceRound(usersReady, totalUsers) {
    if (typeof usersReady !== 'number' || typeof totalUsers !== 'number') return false;
    if (totalUsers <= 0) return false;
    return usersReady >= totalUsers;
}
