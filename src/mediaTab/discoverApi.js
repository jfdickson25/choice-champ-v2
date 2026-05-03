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
        { key: 'bestsellers',   label: 'Bestsellers' },
        { key: 'new_releases',  label: 'New Releases' },
        { key: 'mystery',       label: 'Mystery' },
        { key: 'romance',       label: 'Romance' },
        { key: 'scifi_fantasy', label: 'Sci-Fi & Fantasy' },
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

// `filters` (optional): Advanced Search params. Shape:
//   { genres: number[]|string[], minRating, yearFrom, yearTo,
//     author, publisher, sort: 'popularity'|'rating'|'newest' }
// Each field is conditionally appended; the backend ignores empties.
export async function fetchSearch(type, query, page = 1, { platform, filters } = {}) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('page', String(page));
    if (platform && platform !== 'all') params.set('platform', platform);
    if (filters) {
        if (filters.genres?.length) params.set('genres', filters.genres.join(','));
        if (filters.minRating) params.set('min_rating', String(filters.minRating));
        if (filters.yearFrom) params.set('year_from', String(filters.yearFrom));
        if (filters.yearTo)   params.set('year_to',   String(filters.yearTo));
        if (filters.author)    params.set('author',    filters.author);
        if (filters.publisher) params.set('publisher', filters.publisher);
        if (filters.sort)      params.set('sort',      filters.sort);
    }
    const res = await fetch(`${BACKEND_URL}/media/discover/${type}/search?${params}`);
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
