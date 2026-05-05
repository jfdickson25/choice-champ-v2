const express = require('express');
const router = express();
const convert = require('xml-js');
require('dotenv').config();

const { supabase } = require('../../lib/supabase');

const SGDB_NO_MATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SGDB_LOOKUP_TIMEOUT_MS = 1500;

async function lookupSgdbPoster(title) {
    const token = process.env.STEAM_GRID_DB_API_TOKEN;
    if(!token) return null;

    const searchRes = await fetch(
        `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if(!searchRes.ok) throw new Error(`SGDB search ${searchRes.status}`);
    const searchData = await searchRes.json();
    const sgdbId = searchData.data && searchData.data[0] && searchData.data[0].id;
    if(!sgdbId) return null;

    const gridQuery = new URLSearchParams({
        dimensions: '600x900,660x930,342x482',
        mimes: 'image/png,image/jpeg,image/webp',
        types: 'static'
    });
    const gridsRes = await fetch(
        `https://www.steamgriddb.com/api/v2/grids/game/${sgdbId}?${gridQuery}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if(!gridsRes.ok) throw new Error(`SGDB grids ${gridsRes.status}`);
    const gridsData = await gridsRes.json();
    const firstGrid = gridsData.data && gridsData.data[0];
    return firstGrid ? firstGrid.url : null;
}

// Drop adult/explicit games from RAWG results. ESRB "adults-only"
// (AO) is rare and almost always adult-content-focused. Mature (M) is
// kept — that's GTA, Call of Duty, Last of Us, etc. The tag list
// catches unrated indie/Steam titles whose tags clearly mark them as
// explicit. Tags are user-contributed (scraped from Steam) so the
// list is conservative — only unambiguous slugs that don't double as
// neutral descriptors.
const EXPLICIT_GAME_TAG_SLUGS = new Set([
    'nudity',
    'sexual-content',
    'hentai',
    'nsfw',
    'erotic',
    'adult',
]);
function looksLikeRawgGame(item) {
    if (item?.esrb_rating?.slug === 'adults-only') return false;
    if (hasExplicitTitleWord(item?.name)) return false;
    if (Array.isArray(item?.tags)) {
        for (const t of item.tags) {
            if (t && EXPLICIT_GAME_TAG_SLUGS.has(t.slug)) return false;
        }
    }
    return true;
}

// Drop low-engagement RAWG noise from search results. RAWG indexes
// thousands of itch.io / amateur jam games that bury legit hits —
// e.g., a search for "limbo" returns a couple dozen "Limbo (itch)" /
// "Limbo Train" / "Limbo Cat" entries with zero adds, zero ratings,
// and itch as their only store. Real games consistently have non-
// trivial `added` (RAWG's user-list popularity) and/or ratings_count.
//
// Applied only at the search call site. Discover feeds (popular /
// top_rated / new / upcoming) rely on RAWG's own sorting and a
// blanket engagement floor there would drop legit upcoming releases
// that haven't accumulated adds yet.
function hasRealRawgEngagement(item) {
    const added = Number(item?.added) || 0;
    const ratingsCount = Number(item?.ratings_count) || 0;

    // No engagement at all → garbage.
    if (added === 0 && ratingsCount === 0) return false;

    const stores = Array.isArray(item?.stores) ? item.stores : [];
    const isItchStore = (s) => s?.store?.slug === 'itch' || s?.store?.name === 'itch.io';
    const onlyItch = stores.length > 0 && stores.every(isItchStore);
    const noStores = stores.length === 0;

    // Itch-only or no-store releases need real-people popularity.
    // Self-uploads ("Inside Scoop v0.0.1": 1 add, 1 rating, itch only)
    // were sneaking through the prior "needs >0 ratings" rule, so
    // require either ≥10 adds OR ≥3 ratings to count as legit.
    if ((onlyItch || noStores) && added < 10 && ratingsCount < 3) return false;

    // Multi-store but tiny + zero ratings = orphan listing.
    if (added < 10 && ratingsCount === 0) return false;

    return true;
}

async function getSgdbPoster(rawgId, title) {
    if(!rawgId || !title) return null;

    const { data: cached } = await supabase
        .from('game_image_cache')
        .select('poster_url, updated_at')
        .eq('rawg_id', rawgId)
        .maybeSingle();

    if(cached) {
        if(cached.poster_url) return cached.poster_url;
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if(age < SGDB_NO_MATCH_TTL_MS) return null;
    }

    try {
        const posterUrl = await lookupSgdbPoster(title);
        await supabase
            .from('game_image_cache')
            .upsert({ rawg_id: rawgId, title, poster_url: posterUrl, updated_at: new Date().toISOString() });
        return posterUrl;
    } catch(err) {
        console.log('SGDB lookup failed for', rawgId, title, err.message);
        return null;
    }
}

// OMDb response cache (Supabase `omdb_cache` table, keyed by IMDb
// id, shared globally across all users). Detail-page opens hit this
// helper instead of OMDb directly — fresh rows are served from
// Supabase (~30ms), stale rows trigger a single OMDb refresh and
// upsert on the next view, OMDb failures fall back to whatever
// stale row we have so the UI never goes blank. 7-day TTL is the
// balance between API quota relief and rating-drift staleness.
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
            // OMDb has no entry — return whatever stale data we have,
            // or null if we've never cached this id before.
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
        // OMDb / network failure — stale beats nothing.
        return omdbRowToShape(cached);
    }
}

function getSgdbPosterWithTimeout(rawgId, title) {
    return Promise.race([
        getSgdbPoster(rawgId, title),
        new Promise(resolve => setTimeout(() => resolve(null), SGDB_LOOKUP_TIMEOUT_MS))
    ]);
}

// =====================================================================
// Books — Apple iTunes Search API.
//
// Switched from Google Books after extensive testing showed Google's
// API surfaces companion / fan / regional editions above the
// canonical books for popular series (Harry Potter, Stormlight, etc.)
// and serves placeholder cover artwork due to publisher restrictions.
// iTunes only catalogs books sold via Apple Books — narrower than
// Google but the canonical popular books are virtually all there with
// real cover artwork and userRatingCount sorts canonical entries to
// the top automatically.
//
// Trade-offs: no ISBN search, no pageCount metadata, smaller catalog
// for self-published / niche / out-of-print titles. For our use case
// (collection management for casual readers) the cleaner search wins.
// =====================================================================

// Apple's CDN serves artwork at templated dimensions — the trailing
// /100x100bb.jpg can be swapped for any size up to ~1200x1200. Bump
// to 600x600 for crisp rendering in the poster grid.
function upgradeITunesArtwork(url) {
    if (!url) return null;
    return url.replace(/\/\d+x\d+bb\.jpg$/, '/600x600bb.jpg');
}

// Map an iTunes search/lookup result to our standard shape. iTunes
// sometimes returns rating fields as undefined for books with no
// reviews — coerce to null so the response matches other media types.
function iTunesItemToResult(item) {
    return {
        id: String(item.trackId),
        title: item.trackName || item.trackCensoredName || '',
        poster: upgradeITunesArtwork(item.artworkUrl100),
        rating: item.averageUserRating != null ? Number(item.averageUserRating).toFixed(1) : null,
        releaseDate: item.releaseDate || null,
    };
}

// Detect non-Latin scripts in a string. iTunes's country=US store
// happily returns titles in Cyrillic / CJK / Arabic / Devanagari /
// etc. and we don't currently expose a language setting, so drop
// anything outside the Latin alphabet for now. Range list covers the
// scripts most likely to slip through; obvious omissions like Greek
// and accented Latin (é, ñ, ö) are intentional — those usually still
// read fine to an English-reading user.
//
// TODO: replace with a per-user language preference once we add a
// settings UI for it.
const NON_LATIN_RE = /[Ѐ-ӿԀ-ԯ֐-׿؀-ۿ܀-ݏऀ-ॿঀ-৿฀-๿぀-ヿ㐀-鿿가-힯]/;
function hasNonLatinScript(...strings) {
    return strings.some(s => typeof s === 'string' && NON_LATIN_RE.test(s));
}

// Foreign-language editions written in Latin script (Spanish,
// Portuguese, Italian, Czech, Swedish, etc.) bypass the Cyrillic/CJK
// filter because they use the same alphabet. Three signals layered:
//
//   1. Hard non-English letters — characters that essentially never
//      appear in English (ã/õ/ç in Portuguese, ě/ů/ř/š/ž in Czech,
//      ł/ą/ć in Polish, å/ø/æ in Scandinavian, ß in German). A single
//      occurrence is enough.
//   2. Diacritics density — "Café Society" has 1 non-ASCII Latin
//      char and reads fine; "Mistborn: Poselství práva" has multiple
//      and is clearly not English. 2+ Latin Extended chars trip it.
//   3. Stop-word match — Italian / Spanish / Portuguese / German
//      titles often contain function words ("il", "el", "der",
//      "della") that essentially never appear in English titles. A
//      whole-word match drops those even when there are no diacritics
//      ("Mistborn Era Due - 1. La legge delle lande").
const HARD_NON_ENGLISH_RE = /[ãõçěůřščžýňąłćśżźåøæßĐđŁł]/i;
const LATIN_EXTENDED_RE = /[À-ɏ]/g;
const NON_ENGLISH_STOPWORDS = new Set([
    // Italian
    'il', 'lo', 'gli', 'della', 'delle', 'dell', 'degli', 'nello', 'nella',
    // Spanish / Portuguese
    'el', 'los', 'las', 'del', 'una', 'uno', 'que', 'para', 'con',
    'da', 'do', 'dos', 'das', 'no', 'na', 'nos', 'nas',
    // French (skipping bare "le" / "la" / "les" — too common in English names)
    'des', 'aux', 'leur', 'pour',
    // Swedish / Norwegian / Danish
    'och', 'eller', 'med', 'som',
    // German
    'der', 'die', 'das', 'mit', 'für', 'und',
    // Czech / Slovak / Polish
    'jest', 'pro', 'při',
]);
// High-confidence non-English words for body-text scanning. Verbs,
// demonstratives, and prepositions that essentially never appear in
// English text — distinct from NON_ENGLISH_STOPWORDS above, which is
// articles tuned for short titles. Words that *could* appear in
// English are deliberately excluded:
//   • "le", "la", "el", "il", "der", "das" — common in English proper
//     nouns ("La Mer", "Der Spiegel", "El Niño").
//   • "von", "comme", "ela", "elle" — names / brands.
//   • "ale", "non", "todo" — real English words.
const NON_ENGLISH_BODY_WORDS = new Set([
    // Spanish
    'muy', 'pero', 'tiene', 'tienen', 'todos', 'todas', 'siempre', 'mientras',
    'aunque', 'desde', 'hasta', 'mucho', 'mucha', 'muchos', 'muchas',
    'puede', 'pueden', 'porque', 'entonces', 'después', 'despues', 'sobre',
    'fueron', 'estos', 'estas', 'eres', 'somos',
    // Italian
    'molto', 'molta', 'molti', 'molte', 'anche', 'questo', 'questa',
    'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'essere',
    'mentre', 'quando', 'senza', 'soltanto', 'tutto', 'tutti', 'tutte',
    'tutta', 'ancora', 'allora', 'mai',
    // Portuguese
    'muito', 'muita', 'muitos', 'muitas', 'isso', 'isto', 'esse', 'essa',
    'esses', 'essas', 'aquele', 'aquela', 'aqueles', 'aquelas', 'depois',
    // French (skipping "le"/"la"/"les"/"comme"/"pour" — too many English false positives)
    'aussi', 'avec', 'sans', 'dans', 'leur', 'leurs', 'alors', 'toujours',
    'ils', 'ses', 'nos', 'vos', 'dont', 'cette', 'ceux', 'celles',
    // German
    'ist', 'sind', 'nicht', 'auch', 'haben', 'werden', 'sehr', 'eine',
    'einen', 'einer', 'wenn', 'dann', 'aber', 'vom', 'zum', 'zur', 'beim',
    'nach', 'zwischen', 'gegen', 'sondern', 'weil', 'doch',
    // Czech / Slovak / Polish
    'jest', 'jsou', 'byla', 'bylo', 'byly', 'která', 'které', 'který',
    'jeden', 'jedna', 'jedno',
]);

function looksNonEnglish(title, description = '') {
    if (!title) return false;
    const desc = String(description).replace(/<[^>]*>/g, ' ').trim();

    // Hard non-English letters anywhere — single occurrence is enough
    // since these characters essentially never appear in English.
    if (HARD_NON_ENGLISH_RE.test(title)) return true;
    if (HARD_NON_ENGLISH_RE.test(desc)) return true;

    // Title diacritic density — 2+ Latin Extended chars in the title
    // alone is a strong signal (catches "Mistborn: Poselství práva"
    // without flagging single-diacritic English borrows like "Café").
    const titleDiacritics = (title.match(LATIN_EXTENDED_RE) || []).length;
    if (titleDiacritics >= 2) return true;

    // Title stopword check — a single non-English article in the title
    // is enough ("La Legge Delle Lande").
    const titleLower = title.toLowerCase();
    for (const word of titleLower.split(/[\s\-:.,;()'"!?]+/)) {
        if (NON_ENGLISH_STOPWORDS.has(word)) return true;
    }

    // Description body-word check — any high-confidence non-English
    // word in the description body drops the entry. Tuned conservatively
    // so a single hit is enough; words that could legitimately appear
    // in English (proper-noun articles, brand names, English homographs)
    // are excluded from the list above.
    const descLower = desc.toLowerCase();
    for (const word of descLower.split(/[\s\-:.,;()'"!?]+/)) {
        if (NON_ENGLISH_BODY_WORDS.has(word)) return true;
    }

    return false;
}

// Publishers that produce book summaries / study guides — useful in
// some contexts but mostly noise when a user is looking for the
// actual novel. Match case-insensitively against artistName.
const SUMMARY_PUBLISHERS = new Set([
    'bookcaps',
    'bookrags',
    'sparknotes',
    'cliffsnotes',
    'cliffs notes',
    'hyperink',
    'bright summaries',
    'brightsummaries.com',
    'trivia-on-books',
    'trivia on books',
    'speed reads',
    'speedreads',
    'quickread',
    'quick read',
    'worth books',
    'supersummary',
    'litcharts',
    'snap summaries',
    'maxhelp publishing',
    'readtrepreneur publishing',
    '50minutes.com',
]);
function isSummaryPublisher(artistName) {
    return SUMMARY_PUBLISHERS.has((artistName || '').trim().toLowerCase());
}

// Shared title-keyword blocklist applied across Books, Movies, TV,
// and Games. Words that essentially never appear in mainstream titles
// — whole-word match keeps "Sex and the City" / "Sex Education" /
// "The Sexy Brutale" / "Adult Material" / "Young Adult" all safe
// since those titles don't contain any blocked term. Words like
// `erotic` and `erotica` catch the bulk of TMDB's softcore catalog
// ("Erotic Ghost Story", "The Erotic Diary of Misty Mundae"),
// `hentai` / `nsfw` / `xxx` / `porn` catch unambiguous explicit
// content across all sources, and `futanari` / `futa` / `eroge` /
// `smut` / `threesome` / `menage` / `milf` / `dilf` catch the
// genre-specific stuff that publishers use to self-describe.
const EXPLICIT_TITLE_WORDS_RE = /\b(?:erotica|erotic|xxx|hentai|nsfw|porn|pornographic|threesome|menage|ménage|futanari|futa|milf|dilf|smut|smutty|eroge)\b/i;
function hasExplicitTitleWord(title) {
    return EXPLICIT_TITLE_WORDS_RE.test(String(title || ''));
}

// iTunes ebook genres that mark the entry as adult/explicit content.
// The URL `explicit=No` parameter does NOT filter these out for books
// (verified live — it only affects music), so we have to do it post-
// fetch by inspecting each item's genres array.
const EXPLICIT_BOOK_GENRES = new Set(['Erotica', 'Erotic Romance']);
function isExplicitBook(item) {
    if (!Array.isArray(item.genres)) return false;
    return item.genres.some(g => EXPLICIT_BOOK_GENRES.has(g));
}

// Drop entries without a usable cover or title. iTunes's `media=ebook`
// filter is already strict — the catalog is curated, not crawled —
// but the US store still sells foreign-language editions, book-summary
// products, and adult content mixed in with the original works.
function looksLikeITunesBook(item) {
    if (!item.trackName) return false;
    if (!item.artworkUrl100) return false;
    if (hasNonLatinScript(item.trackName, item.artistName)) return false;
    if (isSummaryPublisher(item.artistName)) return false;
    if (isExplicitBook(item)) return false;
    if (hasExplicitTitleWord(item.trackName)) return false;
    if (looksNonEnglish(item.trackName, item.description)) return false;
    return true;
}

// Sort iTunes results by review count desc — `userRatingCount` is a
// strong signal of "canonical / well-known edition" since popular
// books accumulate orders of magnitude more reviews than companion or
// fan-written books. Used by genre tabs and the NYT-bridge match
// picker, where there's no query string to anchor relevance against.
function sortByReviews(items) {
    return [...items].sort((a, b) => {
        const ra = Number(a.userRatingCount) || 0;
        const rb = Number(b.userRatingCount) || 0;
        return rb - ra;
    });
}

// Search-result ranking: title-relevance tier first, review count as
// tiebreaker. Pure review sort works for "Harry Potter" (all matches
// are popular) but buries specific titles like "Wind and Truth" under
// more-reviewed siblings ("The Way of Kings"). Tiering pulls the exact
// match to the top regardless of popularity, then the review count
// breaks ties within a tier — matches the pattern we use for video
// and board game search.
function rankBookSearchResults(query, items) {
    const queryLower = String(query || '').trim().toLowerCase();
    if (!queryLower) return sortByReviews(items);
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wholeWordRe = new RegExp(`\\b${escapeRe(queryLower)}\\b`);
    const rankMatch = (title) => {
        const t = (title || '').toLowerCase();
        if (t.startsWith(queryLower)) return 0;   // exact + starts-with
        if (wholeWordRe.test(t)) return 1;        // whole-word
        if (t.includes(queryLower)) return 2;     // contains
        return 3;                                  // matched in author/desc
    };
    return [...items].sort((a, b) => {
        const tierA = rankMatch(a.trackName);
        const tierB = rankMatch(b.trackName);
        if (tierA !== tierB) return tierA - tierB;
        const ra = Number(a.userRatingCount) || 0;
        const rb = Number(b.userRatingCount) || 0;
        return rb - ra;
    });
}

// NYT Books API → iTunes bridge.
//
// NYT exposes weekly bestseller lists with rich metadata (title,
// author, description, ISBN, cover image) but its book IDs aren't
// usable elsewhere in our pipeline. iTunes doesn't support ISBN
// lookup for ebooks, so we bridge by `<title> <author>` text search
// and pick the top-rated match. Books that don't resolve to an iTunes
// entry are skipped (mostly very-recent titles not yet on Apple Books).
async function fetchNytBestsellers(listName) {
    const apiKey = process.env.NYT_API_KEY;
    if (!apiKey) throw new Error('NYT_API_KEY not configured');
    const r = await fetch(`https://api.nytimes.com/svc/books/v3/lists/current/${listName}.json?api-key=${apiKey}`);
    if (!r.ok) throw new Error(`NYT ${r.status}`);
    const data = await r.json();
    const books = (data && data.results && data.results.books) || [];

    const enriched = await Promise.all(books.map(async (b) => {
        const term = `${b.title || ''} ${b.author || ''}`.trim();
        if (!term) return null;
        try {
            const itRes = await fetch(`https://itunes.apple.com/search?media=ebook&attribute=titleTerm&term=${encodeURIComponent(term)}&limit=5&country=US`);
            if (!itRes.ok) return null;
            const itData = await itRes.json();
            const candidates = (itData.results || []).filter(looksLikeITunesBook);
            if (candidates.length === 0) return null;
            // Prefer the most-reviewed match — usually the canonical
            // edition. Falls back to first result if all are unrated.
            const best = sortByReviews(candidates)[0];
            const result = iTunesItemToResult(best);
            // NYT covers are reliably high-quality and pre-trimmed;
            // prefer the NYT image when present.
            if (b.book_image) result.poster = b.book_image;
            return result;
        } catch (_) {
            return null;
        }
    }));
    return enriched.filter(Boolean);
}

router
    .get('/getInfo/:type/:id', async (req, res, next) => {
        const id = req.params.id;
        const type = req.params.type;

        try {
        if(type === 'movie' || type === 'tv') {
            const tmdbKey = process.env.MOVIE_DB_API_KEY;
            const [detailsRes, providersRes, creditsRes, recommendationsRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbKey}&language=en-US&append_to_response=external_ids,release_dates,content_ratings,videos`),
                fetch(`https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${tmdbKey}&language=en-US`),
                fetch(`https://api.themoviedb.org/3/${type}/${id}/credits?api_key=${tmdbKey}&language=en-US`),
                fetch(`https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${tmdbKey}&language=en-US`),
            ]);
            const [detailsData, providersData, creditsData, recommendationsData] = await Promise.all([
                detailsRes.json(),
                providersRes.json(),
                creditsRes.json(),
                recommendationsRes.json(),
            ]);

            let providersObj = {};

            if(providersData.results.US) {
                // Remove provier_id, and display_priority from each provider
                if(providersData.results.US.buy) {
                    providersData.results.US.buy.forEach(provider => {
                        delete provider.provider_id;
                        delete provider.display_priority;
                    });

                    providersObj.buy = providersData.results.US.buy;
                }

                if(providersData.results.US.rent) {
                    providersData.results.US.rent.forEach(provider => {
                        delete provider.provider_id;
                        delete provider.display_priority;
                    });

                    providersObj.rent = providersData.results.US.rent;
                }

                if(providersData.results.US.flatrate) {
                    providersData.results.US.flatrate.forEach(provider => {
                        delete provider.provider_id;
                        delete provider.display_priority;
                    });

                    providersObj.stream = providersData.results.US.flatrate;
                }
            }

            let title;
            let runtime;
            let releaseDate;

            if(type === 'movie') {
                title = detailsData.title;
                runtime = detailsData.runtime;
                releaseDate = detailsData.release_date;

            } else {
                title = detailsData.name;
                runtime = detailsData.number_of_seasons;
                releaseDate = detailsData.first_air_date;
            }

            // MPAA / TV Parental Guidelines from TMDB. Movies live in
            // release_dates.results[*].release_dates[*].certification;
            // TV in content_ratings.results[*].rating. Both keyed by
            // ISO country — we want US.
            let mpaaRating = null;
            if(type === 'movie') {
                const usReleases = detailsData.release_dates?.results?.find(r => r.iso_3166_1 === 'US');
                const cert = usReleases?.release_dates?.find(rd => rd.certification && rd.certification.trim());
                if(cert) mpaaRating = cert.certification;
            } else {
                const usRating = detailsData.content_ratings?.results?.find(r => r.iso_3166_1 === 'US');
                if(usRating?.rating) mpaaRating = usRating.rating;
            }

            // OMDb enrichment (conditional on TMDB exposing an IMDb id).
            // Routes through getOmdbCached() so fresh rows in the
            // omdb_cache table skip the upstream call entirely; stale
            // rows refresh once on this view and stamp a new fetched_at.
            const imdbId = detailsData.external_ids?.imdb_id;
            const omdbData = await getOmdbCached(imdbId);

            const valueOrNull = (v) => (v && v !== 'N/A' ? v : null);
            const rtScore = omdbData?.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || null;

            // Pick the best YouTube trailer. TMDB returns videos in
            // creation order; preference is type=Trailer + official=true,
            // then type=Trailer, then any Teaser as a last resort.
            const ytVideos = (detailsData.videos?.results || []).filter(v => v.site === 'YouTube');
            const trailer = ytVideos.find(v => v.type === 'Trailer' && v.official)
                || ytVideos.find(v => v.type === 'Trailer')
                || ytVideos.find(v => v.type === 'Teaser')
                || null;

            // Director (movies) / Creators (TV). For movies we filter
            // crew by job === 'Director'; multi-director films exist
            // (Coen brothers, Russos) so join with " & " when present.
            // For TV, TMDB returns created_by directly on details.
            let director = null;
            let creators = [];
            if(type === 'movie') {
                const directors = (creditsData?.crew || [])
                    .filter(c => c.job === 'Director')
                    .map(c => c.name);
                if(directors.length > 0) director = directors.join(' & ');
            } else {
                creators = (detailsData.created_by || []).map(c => c.name);
            }

            // TV-specific enrichment from TMDB. episode_run_time is an
            // array of common runtimes; first entry is the most-common
            // / canonical episode length for the show.
            const tvStatus = type === 'tv' ? (detailsData.status || null) : null;
            const tvEpisodeCount = type === 'tv' ? (detailsData.number_of_episodes || null) : null;
            const tvEpisodeRuntime = type === 'tv' && Array.isArray(detailsData.episode_run_time) && detailsData.episode_run_time.length > 0
                ? detailsData.episode_run_time[0]
                : null;

            const response = {
                details: {
                    title: title,
                    overview: detailsData.overview,
                    tagline: detailsData.tagline || null,
                    poster: `https://image.tmdb.org/t/p/w500${detailsData.poster_path}`,
                    backdrop: detailsData.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detailsData.backdrop_path}` : null,
                    releaseDate: releaseDate,
                    year: releaseDate ? releaseDate.slice(0, 4) : null,
                    runtime: runtime,
                    rating: detailsData.vote_average != null ? detailsData.vote_average.toFixed(1) : null,
                    mpaaRating,
                    genres: Array.isArray(detailsData.genres) ? detailsData.genres.map(g => g.name) : [],
                    director,
                    creators,
                    trailer: trailer ? { key: trailer.key, name: trailer.name || 'Trailer' } : null,
                    awards: valueOrNull(omdbData?.Awards),
                    tvStatus,
                    tvEpisodeCount,
                    tvEpisodeRuntime,
                    ratings: {
                        tmdb: detailsData.vote_average != null ? detailsData.vote_average.toFixed(1) : null,
                        imdb: valueOrNull(omdbData?.imdbRating),
                        rottenTomatoes: rtScore,
                        metacritic: valueOrNull(omdbData?.Metascore),
                    },
                },
                providers: providersObj,
                cast: Array.isArray(creditsData?.cast)
                    ? creditsData.cast.slice(0, 15).map(c => ({
                        id: c.id,
                        name: c.name,
                        character: c.character || null,
                        profile: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
                    }))
                    : [],
                similar: Array.isArray(recommendationsData?.results)
                    ? recommendationsData.results.slice(0, 12).map(r => ({
                        id: r.id,
                        title: r.title || r.name,
                        poster: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
                        rating: r.vote_average != null && r.vote_average > 0 ? r.vote_average.toFixed(1) : null,
                        type: r.media_type || (r.title ? 'movie' : 'tv'),
                    }))
                    : [],
            }

            res.send({media: response});
        } else if(type === 'game') {
            const rawgRes = await fetch(`https://api.rawg.io/api/games/${id}?key=${process.env.RAWG_API_KEY}`);
            const data = await rawgRes.json();

            const sgdbPoster = await getSgdbPosterWithTimeout(data.id, data.name);

            const response = {
                details: {
                    name: data.name,
                    overview: data.description_raw || '',
                    poster: sgdbPoster || data.background_image || null,
                    releaseDate: data.released,
                    runtime: data.playtime || null,
                    rating: data.rating != null && data.rating > 0 ? (data.rating * 2).toFixed(1) : null
                },
                providers: {
                    platforms: (data.platforms || []).map(p => ({ name: p.platform && p.platform.name }))
                }
            }

            res.send({media: response});
        } else if (type === 'board') {
            const details = await fetch(`https://boardgamegeek.com/xmlapi/boardgame/${id}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                    }
                }
            );

            const data = await details.text();

            const dataJson = convert.xml2json(data, {compact: true, spaces: 4});

            const dataParsed = JSON.parse(dataJson);

            let name;

            // Find the name object that has the primary attribute
            if(dataParsed.boardgames.boardgame.name.length > 1) {
                for(let i = 0; i < dataParsed.boardgames.boardgame.name.length; i++) {
                    if(dataParsed.boardgames.boardgame.name[i]._attributes.primary === 'true') {
                        name = dataParsed.boardgames.boardgame.name[i]._text;
                    }
                }
            } else {
                name = dataParsed.boardgames.boardgame.name._text;
            }

            const boardGame = {
                title: name,
                overview: dataParsed.boardgames.boardgame.description._text,
                poster: dataParsed.boardgames.boardgame.image._text,
                releaseDate: dataParsed.boardgames.boardgame.yearpublished._text,
                runtime: dataParsed.boardgames.boardgame.playingtime._text,
                minPlayers: dataParsed.boardgames.boardgame.minplayers._text,
                maxPlayers: dataParsed.boardgames.boardgame.maxplayers._text
            }

            res.send({media: {
                details: boardGame
            }});
        } else if(type === 'book') {
            // iTunes lookup by trackId — same shape as a single search
            // result. No API key required.
            const r = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`);
            if(!r.ok) {
                return res.status(502).send({ errMsg: `iTunes getInfo ${r.status}` });
            }
            const data = await r.json();
            const item = (data.results || [])[0];
            if (!item) {
                return res.status(404).send({ errMsg: 'Book not found' });
            }

            // iTunes ebooks don't expose page count, so we can't
            // populate the "Pages" infoRow. Authors come back as a
            // single comma-joined string in artistName — split into
            // an array to match the contract ItemDetails expects.
            const authors = (item.artistName || '')
                .split(/\s*(?:,|&|\band\b)\s*/)
                .filter(Boolean);

            res.send({ media: {
                details: {
                    title: item.trackName || item.trackCensoredName || '',
                    authors,
                    overview: item.description || '',
                    poster: upgradeITunesArtwork(item.artworkUrl100),
                    releaseDate: item.releaseDate || null,
                    runtime: null,
                    pageCount: null,
                    categories: Array.isArray(item.genres) ? item.genres.filter(g => g !== 'Books') : [],
                    rating: item.averageUserRating != null ? Number(item.averageUserRating).toFixed(1) : null,
                    ratingCount: item.userRatingCount || null,
                }
            }});
        }
        } catch(err) {
            console.log(`getInfo failed for ${type}/${id}:`, err.message);
            res.status(502).send({ errMsg: `Failed to fetch ${type} details from upstream API` });
        }
    })
    .get('/discover/:type/:feed', async (req, res, next) => {
        const { type, feed } = req.params;
        const page = parseInt(req.query.page, 10) || 1;

        const tmdbFeeds = {
            movie: {
                trending: '/trending/movie/week',
                popular: '/movie/popular',
                top_rated: '/movie/top_rated',
                upcoming: '/movie/upcoming'
            },
            tv: {
                trending: '/trending/tv/week',
                popular: '/tv/popular',
                top_rated: '/tv/top_rated',
                on_air: '/tv/on_the_air'
            }
        };

        try {
            if(type === 'movie' || type === 'tv') {
                if(feed === 'search') {
                    const q = (req.query.q || '').trim();
                    // Advanced Search filters — all optional. When any is
                    // present, the route either layers them onto a
                    // text-search response (post-fetch) or uses TMDB's
                    // /discover endpoint when there's no keyword.
                    const genres = (req.query.genres || '').trim();
                    const minRating = parseFloat(req.query.min_rating) || 0;
                    const yearFrom = parseInt(req.query.year_from, 10) || null;
                    const yearTo   = parseInt(req.query.year_to, 10) || null;
                    const sort     = (req.query.sort || '').trim();
                    const hasFilters = genres || minRating > 0 || yearFrom || yearTo || sort;

                    if(!q && !hasFilters) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }

                    const tmdbKey = process.env.MOVIE_DB_API_KEY;
                    const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
                    const releaseField = type === 'movie' ? 'release_date' : 'first_air_date';
                    const titleField = type === 'movie' ? 'title' : 'name';

                    let url;
                    if(q) {
                        // Text search — fuzzy keyword via /search. Filters
                        // are applied post-fetch since TMDB /search doesn't
                        // accept genre/rating/year params.
                        url = `https://api.themoviedb.org/3/search/${type}?api_key=${tmdbKey}&query=${encodeURIComponent(q)}&include_adult=false&page=${page}`;
                    } else {
                        // Filters only — /discover natively supports the
                        // full filter set for sorting + pagination.
                        const params = new URLSearchParams({
                            api_key: tmdbKey,
                            include_adult: 'false',
                            language: 'en-US',
                            page: String(page),
                        });
                        // TMDB joins comma-separated ids as AND but pipe
                        // as OR. Advanced Search picks "any selected
                        // genre" semantics, so map our comma list to a
                        // pipe-joined value before sending.
                        if(genres) params.set('with_genres', genres.replace(/,/g, '|'));
                        if(minRating > 0) {
                            params.set('vote_average.gte', String(minRating));
                            // 500-vote floor cleanly separates "broadly-
                            // received" titles from niche long-tail with
                            // inflated superfan averages. Tradeoff: legit
                            // small-audience indies / foreign / catalog
                            // re-releases under 500 votes drop out of
                            // rating-filtered results too. Tune down to
                            // ~200 if the search starts to feel sparse.
                            params.set('vote_count.gte', '500');
                        }
                        if(yearFrom) params.set(`${dateField}.gte`, `${yearFrom}-01-01`);
                        if(yearTo)   params.set(`${dateField}.lte`, `${yearTo}-12-31`);
                        const sortMap = {
                            popularity: 'popularity.desc',
                            rating: 'vote_average.desc',
                            newest: `${dateField}.desc`,
                        };
                        params.set('sort_by', sortMap[sort] || sortMap.popularity);
                        url = `https://api.themoviedb.org/3/discover/${type}?${params}`;
                    }

                    const tmdbRes = await fetch(url);
                    const data = await tmdbRes.json();

                    let results = (data.results || [])
                        .filter(item => !hasExplicitTitleWord(item[titleField]));

                    // Post-fetch filtering when text + filters are both
                    // present (TMDB /search ignores the discover params).
                    if(q && hasFilters) {
                        if(genres) {
                            const wanted = new Set(genres.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean));
                            results = results.filter(it => Array.isArray(it.genre_ids) && it.genre_ids.some(g => wanted.has(g)));
                        }
                        if(minRating > 0) {
                            // Same vote_count floor as the discover path
                            // applies to the post-fetch text-search filter.
                            results = results.filter(it =>
                                (it.vote_average || 0) >= minRating
                                && (it.vote_count || 0) >= 500
                            );
                        }
                        if(yearFrom || yearTo) {
                            const lo = yearFrom || 0;
                            const hi = yearTo   || 9999;
                            results = results.filter(it => {
                                const y = parseInt((it[releaseField] || '').slice(0, 4), 10);
                                return y && y >= lo && y <= hi;
                            });
                        }
                    }

                    const mapped = results.map(item => ({
                        id: item.id,
                        title: item[titleField],
                        poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                        rating: item.vote_average,
                        releaseDate: item[releaseField],
                    }));

                    return res.send({
                        results: mapped,
                        page: data.page || page,
                        totalPages: data.total_pages || 1,
                    });
                }

                const path = tmdbFeeds[type][feed];
                if(!path) {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type '${type}'` });
                }

                const tmdbRes = await fetch(`https://api.themoviedb.org/3${path}?api_key=${process.env.MOVIE_DB_API_KEY}&language=en-US&include_adult=false&page=${page}`);
                const data = await tmdbRes.json();

                const results = (data.results || [])
                    .filter(item => !hasExplicitTitleWord(type === 'movie' ? item.title : item.name))
                    .map(item => ({
                        id: item.id,
                        title: type === 'movie' ? item.title : item.name,
                        poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                        rating: item.vote_average,
                        releaseDate: type === 'movie' ? item.release_date : item.first_air_date
                    }));

                return res.send({
                    results,
                    page: data.page || page,
                    totalPages: data.total_pages || 1
                });
            } else if(type === 'game') {
                const pageSize = 20;

                // RAWG specific platform IDs for current-gen filtering:
                //   4   = PC
                //   187 = PlayStation 5
                //   186 = Xbox Series S/X
                //   7   = Nintendo Switch (includes Switch 2 — RAWG
                //                          hasn't split that out yet)
                // Using `platforms` (not `parent_platforms`) so we can
                // be specific about generations rather than rolling
                // every legacy console into the brand bucket.
                const PLATFORM_IDS = { pc: 4, ps5: 187, 'xbox-series': 186, switch: 7 };
                const platformId = PLATFORM_IDS[req.query.platform];
                const platformParam = platformId ? `&platforms=${platformId}` : '';

                // Collapse re-releases ("Game: Deluxe Edition", "Game –
                // Game of the Year Cut", etc.) onto their base title so
                // we don't show the same game three times. Trusts RAWG's
                // popularity ordering and keeps the first occurrence.
                // Doesn't touch DLCs ("Game: Shadow of the X") — those
                // still surface separately as their own products.
                const stripEditionSuffix = (name) => (name || '')
                    // "<Game> [: | - ] <Adj> Edition / Cut / Version"
                    // Word "edition" / "cut" / "version" required so we
                    // don't accidentally strip real titles starting
                    // with words like "Special" or "Standard".
                    .replace(
                        /[\s:\-–—]+(?:the\s+)?(?:complete|deluxe|ultimate|definitive|gold|premium|legendary|game of the year|goty|enhanced|anniversary|royal|extended|special|standard)\s+(?:edition|cut|version)\b.*$/i,
                        ''
                    )
                    // Standalone re-release keywords: "Director's Cut",
                    // "Remastered". Each must have a separator before it
                    // so we don't strip into the middle of a title.
                    .replace(/[\s:\-–—]+director'?s\s+cut\b.*$/i, '')
                    .replace(/\s+remastered?\b.*$/i, '')
                    .trim()
                    .toLowerCase();
                const dedupeEditions = (items) => {
                    const seen = new Set();
                    const out = [];
                    for (const item of items) {
                        const base = stripEditionSuffix(item.name);
                        if (seen.has(base)) continue;
                        seen.add(base);
                        out.push(item);
                    }
                    return out;
                };

                if(feed === 'search') {
                    const q = (req.query.q || '').trim();
                    // Advanced Search filters for games. RAWG accepts
                    // genres, publishers, dates, metacritic, ordering
                    // alongside `search`, so we just bolt them on.
                    const genres     = (req.query.genres || '').trim();
                    const publisher  = (req.query.publisher || '').trim();
                    const minRating  = parseInt(req.query.min_rating, 10) || 0; // Metacritic 0-100
                    const yearFrom   = parseInt(req.query.year_from, 10) || null;
                    const yearTo     = parseInt(req.query.year_to, 10) || null;
                    const sort       = (req.query.sort || '').trim();
                    const hasFilters = genres || publisher || minRating > 0 || yearFrom || yearTo || sort;

                    if(!q && !hasFilters) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }

                    // Fetch a wider candidate pool (40 — RAWG's max page
                    // size) so the local re-rank below has more title
                    // matches to surface. Drop ordering=-added so RAWG's
                    // own relevance sort applies. Avoid search_precise —
                    // it tightens token matching enough that legitimate
                    // matches ("Animal Crossing: New Horizons") can fall
                    // off the page entirely; the local rerank handles
                    // fuzzy noise just fine.
                    const candidatePoolSize = 40;
                    const filterParams = new URLSearchParams();
                    if(genres) filterParams.set('genres', genres);
                    if(publisher) filterParams.set('publishers', publisher);
                    if(minRating > 0) filterParams.set('metacritic', `${minRating},100`);
                    if(yearFrom || yearTo) {
                        const lo = yearFrom ? `${yearFrom}-01-01` : '1900-01-01';
                        const hi = yearTo   ? `${yearTo}-12-31`   : '2099-12-31';
                        filterParams.set('dates', `${lo},${hi}`);
                    }
                    const sortMap = {
                        popularity: '-added',
                        rating: '-rating',
                        newest: '-released',
                    };
                    if(sort && sortMap[sort]) filterParams.set('ordering', sortMap[sort]);
                    const filterStr = filterParams.toString();
                    const filterParam = filterStr ? `&${filterStr}` : '';
                    const searchParam = q ? `&search=${encodeURIComponent(q)}` : '';
                    const rawgRes = await fetch(`https://api.rawg.io/api/games?key=${process.env.RAWG_API_KEY}${searchParam}${platformParam}${filterParam}&page=1&page_size=${candidatePoolSize}`);
                    const data = await rawgRes.json();

                    const safeItems = (data.results || [])
                        .filter(looksLikeRawgGame)
                        .filter(hasRealRawgEngagement);
                    const results = dedupeEditions(safeItems).map(item => ({
                        id: item.id,
                        title: item.name,
                        poster: item.background_image || null,
                        rating: item.rating != null && item.rating > 0 ? (item.rating * 2).toFixed(1) : null,
                        releaseDate: item.released
                    }));

                    // Re-rank by title relevance only when there's a
                    // keyword. With filters alone, respect whatever
                    // ordering RAWG returned (which honors the
                    // user-selected sort).
                    let ranked = results;
                    if(q) {
                        const queryLower = q.toLowerCase();
                        const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const wholeWordRe = new RegExp(`\\b${escapeRe(queryLower)}\\b`);
                        const rankMatch = (title) => {
                            const t = (title || '').toLowerCase();
                            if (t.startsWith(queryLower)) return 0;   // exact + starts-with
                            if (wholeWordRe.test(t)) return 1;        // whole-word
                            if (t.includes(queryLower)) return 2;     // contains
                            return 3;                                  // RAWG fuzzy hit
                        };
                        const releaseTimestamp = (r) => {
                            if (!r.releaseDate) return -Infinity;
                            const t = Date.parse(r.releaseDate);
                            return Number.isFinite(t) ? t : -Infinity;
                        };
                        ranked = results
                            .map((r, i) => ({ r, i, tier: rankMatch(r.title), ts: releaseTimestamp(r) }))
                            .sort((a, b) => (a.tier - b.tier) || (b.ts - a.ts) || (a.i - b.i))
                            .map(({ r }) => r);
                    }

                    return res.send({
                        results: ranked,
                        page: 1,
                        totalPages: 1
                    });
                }

                const today = new Date().toISOString().slice(0, 10);
                const monthsAgo = new Date();
                monthsAgo.setMonth(monthsAgo.getMonth() - 6);
                const sixMonthsAgo = monthsAgo.toISOString().slice(0, 10);
                const yearAhead = new Date();
                yearAhead.setFullYear(yearAhead.getFullYear() + 1);
                const yearFromNow = yearAhead.toISOString().slice(0, 10);

                const feedQueries = {
                    popular: `ordering=-added`,
                    top_rated: `ordering=-rating`,
                    new: `dates=${sixMonthsAgo},${today}&ordering=-released`,
                    upcoming: `dates=${today},${yearFromNow}&ordering=released`
                };

                const queryString = feedQueries[feed];
                if(!queryString) {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type 'game'. Supported: popular, top_rated, new, upcoming, search.` });
                }

                const rawgRes = await fetch(`https://api.rawg.io/api/games?key=${process.env.RAWG_API_KEY}&${queryString}${platformParam}&page=${page}&page_size=${pageSize}`);
                const data = await rawgRes.json();

                const safeItems = (data.results || []).filter(looksLikeRawgGame);
                const results = dedupeEditions(safeItems).map(item => ({
                    id: item.id,
                    title: item.name,
                    poster: item.background_image || null,
                    rating: item.rating != null && item.rating > 0 ? (item.rating * 2).toFixed(1) : null,
                    releaseDate: item.released
                }));

                return res.send({
                    results,
                    page,
                    totalPages: data.count ? Math.ceil(data.count / pageSize) : 1
                });
            } else if(type === 'board') {
                // Batch-fetch BGG /thing for a list of game IDs and return
                // a Map of id → full-resolution <image> URL. The /hot and
                // /search endpoints only return small thumbnails which
                // look blurry in our poster grid; /thing has the original.
                // BGG caps /thing at 20 IDs per request, so chunk and run
                // chunks in parallel. Failures fall back silently — caller
                // uses thumbnails.
                const BGG_THING_CHUNK = 20;
                const fetchBoardImages = async (ids) => {
                    const map = new Map();
                    if (!ids.length) return map;
                    const chunks = [];
                    for (let i = 0; i < ids.length; i += BGG_THING_CHUNK) {
                        chunks.push(ids.slice(i, i + BGG_THING_CHUNK));
                    }
                    await Promise.all(chunks.map(async (chunkIds) => {
                        try {
                            const thingRes = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${chunkIds.join(',')}`, {
                                headers: { Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}` }
                            });
                            const thingXml = await thingRes.text();
                            const thingParsed = JSON.parse(convert.xml2json(thingXml, { compact: true, spaces: 4 }));
                            const rawThings = thingParsed.items && thingParsed.items.item ? thingParsed.items.item : [];
                            const things = Array.isArray(rawThings) ? rawThings : [rawThings];
                            for (const t of things) {
                                const id = t._attributes && t._attributes.id;
                                const image = t.image && t.image._text;
                                if (id && image) map.set(String(id), image);
                            }
                        } catch (err) {
                            console.log('BGG /thing chunk failed:', err.message);
                        }
                    }));
                    return map;
                };

                if(feed === 'search') {
                    const q = req.query.q || '';
                    if(!q.trim()) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }
                    // BGG's xmlapi2 search silently drops some games — e.g.
                    // "Quest" (id 316287) doesn't show up in the v2 result
                    // set even though its primary title matches the query.
                    // The legacy xmlapi (v1) returns it. v1 also returns
                    // expansions/accessories mixed in (no type filter), but
                    // the rerank below floats real matches to the top so
                    // the extra noise sinks.
                    const bggRes = await fetch(`https://boardgamegeek.com/xmlapi/search?search=${encodeURIComponent(q)}`, {
                        headers: {
                            Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                        }
                    });
                    const xml = await bggRes.text();
                    const parsed = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }));

                    const rawItems = parsed.boardgames && parsed.boardgames.boardgame ? parsed.boardgames.boardgame : [];
                    const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];
                    const ids = itemArray
                        .map(item => item._attributes && item._attributes.objectid)
                        .filter(Boolean);
                    const imageMap = await fetchBoardImages(ids);

                    // v1 schema differs from v2: <boardgame objectid="...">,
                    // <name primary="true">Title</name>, <yearpublished>YYYY
                    // </yearpublished>. An item can have multiple <name>
                    // tags when the search matched both a primary and an
                    // alternate; xml-js gives back an array in that case —
                    // prefer the primary so we don't mislabel a game by its
                    // foreign-language alt title.
                    const pickTitle = (nameNode) => {
                        if (!nameNode) return null;
                        if (Array.isArray(nameNode)) {
                            const primary = nameNode.find(n => n._attributes && n._attributes.primary === 'true');
                            return (primary || nameNode[0])._text || null;
                        }
                        return nameNode._text || null;
                    };
                    const results = itemArray.map(item => {
                        const id = item._attributes && item._attributes.objectid;
                        return {
                            id,
                            title: pickTitle(item.name),
                            poster: imageMap.get(String(id)) || null,
                            rating: null,
                            releaseDate: item.yearpublished && item.yearpublished._text || null
                        };
                    });

                    // BGG returns search results alphabetically, which buries
                    // matches like "Wingspan" deep in the W's. Re-rank by how
                    // closely each title matches the query so exact / starts-
                    // with hits float to the top, then fall back to alpha.
                    // The whole-word tier uses a word-boundary regex (not a
                    // split-on-whitespace check) so punctuation in titles like
                    // "Catan: Cities & Knights" doesn't sink a query for
                    // "catan" into the contains-tier.
                    const queryLower = q.trim().toLowerCase();
                    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wholeWordRe = new RegExp(`\\b${escapeRe(queryLower)}\\b`);
                    const rankMatch = (title) => {
                        const t = (title || '').toLowerCase();
                        if (t === queryLower) return 0;                                  // exact
                        if (t.startsWith(queryLower)) return 1;                          // starts with
                        if (wholeWordRe.test(t)) return 2;                               // whole-word match
                        if (t.includes(queryLower)) return 3;                            // contains
                        return 4;                                                        // BGG fuzzy hit
                    };
                    results.sort((a, b) => {
                        const diff = rankMatch(a.title) - rankMatch(b.title);
                        if (diff !== 0) return diff;
                        return (a.title || '').localeCompare(b.title || '');
                    });

                    return res.send({
                        results,
                        page: 1,
                        totalPages: 1
                    });
                }

                if(feed !== 'hot') {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type 'board'. Supported: hot, search.` });
                }

                const bggRes = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', {
                    headers: {
                        Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                    }
                });
                const xml = await bggRes.text();
                const parsed = JSON.parse(convert.xml2json(xml, { compact: true, spaces: 4 }));

                const rawItems = parsed.items && parsed.items.item ? parsed.items.item : [];
                const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];
                const hotIds = itemArray
                    .map(item => item._attributes && item._attributes.id)
                    .filter(Boolean);
                const hotImageMap = await fetchBoardImages(hotIds);

                const results = itemArray.map(item => {
                    const id = item._attributes && item._attributes.id;
                    const thumbUrl = item.thumbnail && item.thumbnail._attributes && item.thumbnail._attributes.value || null;
                    return {
                        id,
                        title: item.name && item.name._attributes && item.name._attributes.value,
                        poster: hotImageMap.get(String(id)) || thumbUrl,
                        rating: null,
                        releaseDate: item.yearpublished && item.yearpublished._attributes && item.yearpublished._attributes.value || null
                    };
                });

                return res.send({
                    results,
                    page: 1,
                    totalPages: 1
                });
            } else if(type === 'book') {
                if(feed === 'search') {
                    const q      = (req.query.q || '').trim();
                    // Advanced Search filters for books. iTunes natively
                    // supports authorTerm via the attribute param; genres,
                    // year, and rating all get post-fetch filtering since
                    // the iTunes search API can only target one attribute
                    // per request and we want them composable.
                    const author    = (req.query.author || '').trim();
                    const genres    = (req.query.genres || '').trim();
                    const yearFrom  = parseInt(req.query.year_from, 10) || null;
                    const yearTo    = parseInt(req.query.year_to, 10) || null;
                    const minRating = parseFloat(req.query.min_rating) || 0; // 1-5 scale
                    const hasFilters = author || genres || yearFrom || yearTo || minRating > 0;

                    if(!q && !hasFilters) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }

                    // Pick the most-targeted iTunes attribute. Author
                    // search returns better candidates than free-text
                    // term when the user is filtering specifically on
                    // an author. Title takes priority, then author,
                    // then genre as the seed search.
                    let url;
                    if(q) {
                        url = `https://itunes.apple.com/search?media=ebook&attribute=titleTerm&term=${encodeURIComponent(q)}&limit=50&country=US`;
                    } else if(author) {
                        url = `https://itunes.apple.com/search?media=ebook&attribute=authorTerm&term=${encodeURIComponent(author)}&limit=50&country=US`;
                    } else if(genres) {
                        // Use the first selected genre as the seed via
                        // genreIndex; remaining genres get applied as a
                        // post-fetch OR filter below.
                        const seed = genres.split(',')[0].trim();
                        url = `https://itunes.apple.com/search?media=ebook&attribute=genreIndex&term=${encodeURIComponent(seed)}&limit=50&country=US`;
                    } else {
                        // Filters without text, author, or genre — fall
                        // back to a broad-term search seeded with a
                        // likely word so iTunes returns something to
                        // filter against.
                        url = `https://itunes.apple.com/search?media=ebook&term=${encodeURIComponent('book')}&limit=50&country=US`;
                    }
                    const r = await fetch(url);
                    if(!r.ok) {
                        return res.status(502).send({ errMsg: `iTunes search ${r.status}` });
                    }
                    const data = await r.json();
                    let items = (data.results || []).filter(looksLikeITunesBook);

                    // Post-fetch filters
                    if(q && author) {
                        const authorLower = author.toLowerCase();
                        items = items.filter(it => (it.artistName || '').toLowerCase().includes(authorLower));
                    }
                    if(genres) {
                        // OR semantics — matches any selected genre.
                        // Match case-insensitively + by substring so
                        // "Sci-Fi & Fantasy" still matches when iTunes
                        // tags an item with the longer "Science Fiction
                        // & Fantasy" wording.
                        const wanted = genres.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                        items = items.filter(it => {
                            const itemGenres = (it.genres || []).map(g => String(g).toLowerCase());
                            return itemGenres.some(g => wanted.some(w => g.includes(w) || w.includes(g)));
                        });
                    }
                    if(yearFrom || yearTo) {
                        const lo = yearFrom || 0;
                        const hi = yearTo   || 9999;
                        items = items.filter(it => {
                            const y = parseInt((it.releaseDate || '').slice(0, 4), 10);
                            return y && y >= lo && y <= hi;
                        });
                    }
                    if(minRating > 0) {
                        items = items.filter(it => (Number(it.averageUserRating) || 0) >= minRating);
                    }

                    const ranked = q ? rankBookSearchResults(q, items) : items;
                    const results = ranked.map(iTunesItemToResult);
                    return res.send({ results, page: 1, totalPages: 1 });
                }

                // Bestsellers — Apple Books "Top Paid Books" RSS feed,
                // hydrated via bulk lookup so each entry has cover /
                // reviews / release date. Replaces the previous NYT
                // bridge — Apple's chart updates daily and stays inside
                // the same data source as the rest of the books flow,
                // so add-to-collection works without an ID translation.
                if(feed === 'bestsellers') {
                    const rssRes = await fetch('https://itunes.apple.com/us/rss/topebooks/limit=25/json');
                    if(!rssRes.ok) {
                        return res.status(502).send({ errMsg: `iTunes RSS ${rssRes.status}` });
                    }
                    const rss = await rssRes.json();
                    const entries = (rss && rss.feed && rss.feed.entry) || [];
                    const ids = entries
                        .map(e => e && e.id && e.id.attributes && e.id.attributes['im:id'])
                        .filter(Boolean);
                    if (ids.length === 0) {
                        return res.send({ results: [], page: 1, totalPages: 1 });
                    }
                    const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${ids.join(',')}&country=US`);
                    if (!lookupRes.ok) {
                        return res.status(502).send({ errMsg: `iTunes lookup ${lookupRes.status}` });
                    }
                    const lookupData = await lookupRes.json();
                    // Bulk lookup permutes results; preserve the chart's
                    // ranking by re-ordering against the RSS id list.
                    const byId = new Map((lookupData.results || []).map(x => [String(x.trackId), x]));
                    const ordered = ids.map(id => byId.get(String(id))).filter(Boolean);
                    const results = ordered.filter(looksLikeITunesBook).map(iTunesItemToResult);
                    return res.send({ results, page: 1, totalPages: 1 });
                }

                // Genre tabs + new_releases. genreIndex attribute scopes
                // the search to that Apple Books category, then we sort
                // by reviews (or release date for new_releases) to
                // surface popular / recent titles within the category.
                const feedConfigs = {
                    new_releases:  { term: 'fiction',          sort: 'date' },
                    mystery:       { term: 'Mystery',          sort: 'reviews' },
                    romance:       { term: 'Romance',          sort: 'reviews' },
                    scifi_fantasy: { term: 'Sci-Fi & Fantasy', sort: 'reviews' },
                };
                const cfg = feedConfigs[feed];
                if(!cfg) {
                    return res.status(400).send({ errMsg: `Invalid feed '${feed}' for type 'book'. Supported: search, bestsellers, new_releases, mystery, romance, scifi_fantasy.` });
                }

                const url = `https://itunes.apple.com/search?media=ebook&attribute=genreIndex&term=${encodeURIComponent(cfg.term)}&limit=50&country=US`;
                const r = await fetch(url);
                if(!r.ok) {
                    return res.status(502).send({ errMsg: `iTunes discover ${r.status}` });
                }
                const data = await r.json();
                const items = (data.results || []).filter(looksLikeITunesBook);
                const sorted = cfg.sort === 'date'
                    ? [...items].sort((a, b) => (Date.parse(b.releaseDate || 0) || 0) - (Date.parse(a.releaseDate || 0) || 0))
                    : sortByReviews(items);
                const results = sorted.map(iTunesItemToResult);

                return res.send({ results, page: 1, totalPages: 1 });
            } else {
                return res.status(400).send({ errMsg: `Invalid type '${type}'. Supported: movie, tv, game, board, book.` });
            }
        } catch(err) {
            console.log(err);
            return res.status(500).send({ errMsg: 'Failed to fetch discover content' });
        }
    })
    .post('/game-posters', async (req, res) => {
        const items = Array.isArray(req.body) ? req.body : [];
        const result = {};

        if(items.length === 0) {
            return res.send({ posters: result });
        }

        const rawgIds = items.map(i => parseInt(i.id, 10)).filter(Boolean);
        const titleById = new Map(items.map(i => [parseInt(i.id, 10), i.title]));

        try {
            const { data: cached = [] } = await supabase
                .from('game_image_cache')
                .select('rawg_id, poster_url, updated_at')
                .in('rawg_id', rawgIds);
            const cacheMap = new Map((cached || []).map(c => [c.rawg_id, c]));
            const now = Date.now();
            const uncachedIds = [];

            for(const id of rawgIds) {
                const entry = cacheMap.get(id);
                if(!entry) { uncachedIds.push(id); continue; }
                if(entry.poster_url) { result[id] = entry.poster_url; continue; }
                if(now - new Date(entry.updated_at).getTime() > SGDB_NO_MATCH_TTL_MS) {
                    uncachedIds.push(id);
                } else {
                    result[id] = null;
                }
            }

            if(uncachedIds.length > 0) {
                await Promise.allSettled(uncachedIds.map(async (id) => {
                    const poster = await getSgdbPosterWithTimeout(id, titleById.get(id));
                    result[id] = poster;
                }));
            }

            for(const id of rawgIds) {
                if(!(id in result)) result[id] = null;
            }

            res.send({ posters: result });
        } catch(err) {
            console.log('game-posters failed:', err.message);
            res.send({ posters: result });
        }
    })
    .get('/:type/:title/:page', async (req, res, next) => {
        const title = req.params.title;
        const page = req.params.page;
        const type = req.params.type;

        let responseJson;

        if(type === 'movie' || type === 'tv') {
            let response = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${process.env.MOVIE_DB_API_KEY}&query=${title}&include_adult=false&page=${page}`);
            responseJson = await response.json();
            responseJson.results = (responseJson.results || []).filter(
                item => !hasExplicitTitleWord(type === 'movie' ? item.title : item.name)
            );
            // Sort results by popularity
            responseJson.results.sort((a, b) => {
                return b.popularity - a.popularity;
            });
        } else if (type === 'board') {
            // Limit search to 20 results
            const resp = await fetch(
                `https://boardgamegeek.com/xmlapi2/search?query=${title}&type=boardgame`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.BOARD_GAME_GEEK_API_TOKEN}`
                    }
                }
            );
            
            let data = await resp.text();

            const dataJson = convert.xml2json(data, {compact: true, spaces: 4});

            const dataParsed = JSON.parse(dataJson);

            const boardGames = [];

            // Handle no results
            if(dataParsed.items.item === undefined) {
                responseJson = {
                    results: []
                }
                res.send({media: responseJson});
                return;
            }
            // Handle single result
            else if(dataParsed.items.item !== undefined && dataParsed.items.item.length === undefined) {
                boardGames.push({
                    id: dataParsed.items.item._attributes.id,
                    name: dataParsed.items.item.name._attributes.value
                });
            } else {
                // Populate boardGames array with all results and only their id and name
                for(let i = 0; i < dataParsed.items.item.length; i++) {
                    // If the name attribute matches the search term, add it to the beginning of the array
                    if(dataParsed.items.item[i].name._attributes.value.toLowerCase() === title.toLowerCase()) {
                        boardGames.unshift({
                            id: dataParsed.items.item[i]._attributes.id,
                            name: dataParsed.items.item[i].name._attributes.value
                        });
                    } else {
                        boardGames.push({
                            id: dataParsed.items.item[i]._attributes.id,
                            name: dataParsed.items.item[i].name._attributes.value
                        });
                    }
                }
            }

            responseJson = {
                results: boardGames
            }
        } else {
            res.status(400).send({errMsg: 'Invalid type'});
            next();
        }

        res.send({media: responseJson});
    });

router.get('/person/:id', async (req, res, next) => {
    const id = req.params.id;
    const tmdbKey = process.env.MOVIE_DB_API_KEY;

    try {
        const [personRes, creditsRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/person/${id}?api_key=${tmdbKey}&language=en-US`),
            fetch(`https://api.themoviedb.org/3/person/${id}/combined_credits?api_key=${tmdbKey}&language=en-US`),
        ]);
        const [personData, creditsData] = await Promise.all([
            personRes.json(),
            creditsRes.json(),
        ]);

        // Combined cast credits — dedupe (same person can be billed
        // both as cast and crew for the same project), sort by
        // popularity, cap to 40 so prolific actors stay browsable.
        const seen = new Set();
        const filmography = (Array.isArray(creditsData?.cast) ? creditsData.cast : [])
            .filter(c => {
                const mediaType = c.media_type === 'tv' ? 'tv' : 'movie';
                const dedupeKey = `${mediaType}:${c.id}`;
                if (seen.has(dedupeKey)) return false;
                seen.add(dedupeKey);
                return true;
            })
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 40)
            .map(c => {
                const mediaType = c.media_type === 'tv' ? 'tv' : 'movie';
                const date = mediaType === 'movie' ? c.release_date : c.first_air_date;
                return {
                    id: c.id,
                    title: c.title || c.name,
                    poster: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : null,
                    type: mediaType,
                    character: c.character || null,
                    year: date ? date.slice(0, 4) : null,
                    rating: c.vote_average != null && c.vote_average > 0 ? c.vote_average.toFixed(1) : null,
                };
            });

        const response = {
            person: {
                id: personData.id,
                name: personData.name,
                profile: personData.profile_path ? `https://image.tmdb.org/t/p/w500${personData.profile_path}` : null,
                biography: personData.biography || null,
                knownFor: personData.known_for_department || null,
                birthday: personData.birthday || null,
                placeOfBirth: personData.place_of_birth || null,
            },
            filmography,
        };

        res.send(response);
    } catch (err) {
        next(err);
    }
});


module.exports = router;