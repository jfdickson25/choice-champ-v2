import { BACKEND_URL } from '../shared/config';

export const SUBTABS = {
    movie: [
        { key: 'trending',  label: 'Trending' },
        { key: 'popular',   label: 'Popular' },
        { key: 'top_rated', label: 'Top Rated' },
        { key: 'upcoming',  label: 'Upcoming' },
    ],
    tv: [
        { key: 'trending',  label: 'Trending' },
        { key: 'popular',   label: 'Popular' },
        { key: 'top_rated', label: 'Top Rated' },
        { key: 'on_air',    label: 'On Air' },
    ],
    game: [
        { key: 'popular',   label: 'Popular' },
        { key: 'top_rated', label: 'Top Rated' },
        { key: 'new',       label: 'New' },
        { key: 'upcoming',  label: 'Upcoming' },
    ],
    board: [
        { key: 'hot', label: 'Hot' },
    ],
    book: [
        { key: 'new_releases', label: 'New Releases' },
        { key: 'fiction',      label: 'Fiction' },
        { key: 'nonfiction',   label: 'Nonfiction' },
    ],
};

async function handleDiscoverResponse(res) {
    if(!res.ok) {
        const err = new Error(`Discover request failed (${res.status})`);
        err.status = res.status;
        try {
            const body = await res.json();
            if(body && body.errMsg) err.message = body.errMsg;
        } catch(_) {}
        throw err;
    }
    return res.json();
}

// Optional `platform` (game type only): pc | playstation | xbox | nintendo
export async function fetchDiscover(type, feed, page = 1, { platform } = {}) {
    const platformParam = platform && platform !== 'all' ? `&platform=${platform}` : '';
    const res = await fetch(`${BACKEND_URL}/media/discover/${type}/${feed}?page=${page}${platformParam}`);
    return handleDiscoverResponse(res);
}

export async function fetchSearch(type, query, page = 1, { platform } = {}) {
    const platformParam = platform && platform !== 'all' ? `&platform=${platform}` : '';
    const res = await fetch(`${BACKEND_URL}/media/discover/${type}/search?q=${encodeURIComponent(query)}&page=${page}${platformParam}`);
    return handleDiscoverResponse(res);
}

export async function fetchGamePosters(items) {
    const payload = items.map(i => ({ id: i.id, title: i.title }));
    const res = await fetch(`${BACKEND_URL}/media/game-posters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(`game-posters ${res.status}`);
    const data = await res.json();
    return data.posters || {};
}
