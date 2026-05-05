const { supabase } = require('./supabase');

// 7-day TTL is the balance between OMDb quota relief and rating-
// drift staleness. Tune up to be cheaper, tune down for fresher.
const OMDB_FRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function omdbRowToShape(row) {
    if (!row) return null;
    return {
        imdbRating: row.imdb_rating,
        Metascore: row.metacritic,
        Awards: row.awards,
        Rated: row.rated,
        Ratings: row.rotten_tomatoes
            ? [{ Source: 'Rotten Tomatoes', Value: row.rotten_tomatoes }]
            : [],
    };
}

// Looks up OMDb data for an IMDb id, falling back to a single
// upstream OMDb fetch + upsert when the cache is missing or stale
// (>7 days). Returns null when no IMDb id is provided / OMDb has no
// entry / OMDb fails and the cache is empty.
async function getOmdbCached(imdbId) {
    if (!imdbId || !process.env.OMDB_API_KEY) return null;

    const { data: cached } = await supabase
        .from('omdb_cache')
        .select('*')
        .eq('imdb_id', imdbId)
        .maybeSingle();

    const isFresh = cached
        && cached.fetched_at
        && Date.now() - new Date(cached.fetched_at).getTime() < OMDB_FRESH_TTL_MS;

    if (isFresh) return omdbRowToShape(cached);

    try {
        const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`);
        const parsed = await res.json();
        if (parsed?.Response !== 'True') {
            return omdbRowToShape(cached);
        }

        const rt = parsed.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || null;
        await supabase
            .from('omdb_cache')
            .upsert({
                imdb_id: imdbId,
                imdb_rating: parsed.imdbRating && parsed.imdbRating !== 'N/A' ? parsed.imdbRating : null,
                rotten_tomatoes: rt,
                metacritic: parsed.Metascore && parsed.Metascore !== 'N/A' ? parsed.Metascore : null,
                awards: parsed.Awards && parsed.Awards !== 'N/A' ? parsed.Awards : null,
                rated: parsed.Rated && parsed.Rated !== 'N/A' ? parsed.Rated : null,
                fetched_at: new Date().toISOString(),
            }, { onConflict: 'imdb_id' });

        return parsed;
    } catch (_) {
        return omdbRowToShape(cached);
    }
}

// Pulls just the imdb_rating column for a list of imdb_ids — used
// by the Collection page when it needs to sort/show ratings without
// caring about the rest of the OMDb shape. Items missing from the
// cache get an empty entry; callers map their item to null and
// sort to the bottom of the rating-sorted list.
async function lookupImdbRatings(imdbIds) {
    const ids = Array.from(new Set((imdbIds || []).filter(Boolean).map(String)));
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
        .from('omdb_cache')
        .select('imdb_id, imdb_rating')
        .in('imdb_id', ids);
    if (error) return new Map();

    return new Map((data || []).map(r => [r.imdb_id, r.imdb_rating]));
}

module.exports = {
    OMDB_FRESH_TTL_MS,
    omdbRowToShape,
    getOmdbCached,
    lookupImdbRatings,
};
