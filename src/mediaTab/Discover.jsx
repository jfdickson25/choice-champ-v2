import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Columns2, Columns3, Columns4, Search as SearchIcon, SlidersHorizontal, X, Filter } from 'lucide-react';

import { SUBTABS, fetchDiscover, fetchSearch, fetchGamePosters } from './discoverApi';
import SortFilterPanel from '../shared/components/SortFilterPanel/SortFilterPanel';
import AdvancedSearchSheet, { EMPTY_FILTERS, filtersAreEmpty } from './components/AdvancedSearchSheet/AdvancedSearchSheet';
import { GENRES_FOR_TYPE, SORT_OPTIONS_FOR_TYPE } from './components/AdvancedSearchSheet/genres';
import { AuthContext } from '../shared/context/auth-context';
import Loading from '../shared/components/Loading';
import './Discover.css';

// Phase 1 Advanced Search: covers movie / tv / game / book.
// Board games stay on plain keyword search until phase 2.
const ADVANCED_SEARCH_TYPES = new Set(['movie', 'tv', 'game', 'book']);

const SUPPORTED_TYPES = ['movie', 'tv', 'game', 'board', 'book'];

const SEARCH_PLACEHOLDER = {
    movie: 'Search for a movie',
    tv:    'Search for a TV show',
    game:  'Search for a video game',
    board: 'Search for a board game',
    book:  'Search for a book or ISBN',
};

const Discover = ({ collectionType, color, onSearchingChange }) => {
    if(!SUPPORTED_TYPES.includes(collectionType)) {
        return (
            <div className='discover'>
                <ComingSoon collectionType={collectionType} color={color} />
            </div>
        );
    }
    return <DiscoverFeed collectionType={collectionType} color={color} onSearchingChange={onSearchingChange} />;
};

const DiscoverFeed = ({ collectionType, color, onSearchingChange }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const auth = useContext(AuthContext);
    const [searchParams, setSearchParams] = useSearchParams();
    const subtabs = SUBTABS[collectionType];

    const urlTab = searchParams.get('tab');
    const urlQuery = searchParams.get('q') || '';
    const initialSubtab = subtabs.some(t => t.key === urlTab) ? urlTab : subtabs[0].key;

    const viewKey = `choice-champ:discover-view:${collectionType}`;
    const platformKey = `choice-champ:discover-platform:${collectionType}`;

    const [activeSubtab, setActiveSubtab] = useState(initialSubtab);
    const [query, setQuery] = useState(urlQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(urlQuery);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterAnchor, setFilterAnchor] = useState(null);
    // Hydrate Advanced Search filters from URL params so navigating
    // into ItemDetails and tapping back (or hitting the X-close after
    // a deep similar/cast drill) restores the filtered grid the user
    // had set up. Genre IDs are numeric for movie/tv (TMDB) and
    // string-slug for game/book (RAWG/iTunes) — re-cast accordingly.
    const initialFilters = (() => {
        const rawGenres = (searchParams.get('genres') || '').split(',').filter(Boolean);
        const isNumericGenre = collectionType === 'movie' || collectionType === 'tv';
        const genres = isNumericGenre
            ? rawGenres.map(g => parseInt(g, 10)).filter(Number.isFinite)
            : rawGenres;
        const minRating = parseFloat(searchParams.get('min_rating')) || 0;
        const yearFrom  = searchParams.get('year_from') || '';
        const yearTo    = searchParams.get('year_to')   || '';
        const author    = searchParams.get('author')    || '';
        const publisher = searchParams.get('publisher') || '';
        const sort      = searchParams.get('sort')      || '';
        const any = genres.length || minRating || yearFrom || yearTo || author || publisher || sort;
        return any ? { genres, minRating, yearFrom, yearTo, author, publisher, sort } : EMPTY_FILTERS;
    })();
    const hasInitialFilters = !filtersAreEmpty(initialFilters);
    const [searchModeActive, setSearchModeActive] = useState(urlQuery.length > 0 || hasInitialFilters);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState(initialFilters);
    const filtersOn = !filtersAreEmpty(activeFilters);
    const supportsAdvanced = ADVANCED_SEARCH_TYPES.has(collectionType);
    const [viewValue, setViewValue] = useState(() => {
        const saved = localStorage.getItem(viewKey);
        const parsed = saved ? parseInt(saved, 10) : 2;
        return [2, 3, 4].includes(parsed) ? parsed : 2;
    });
    const [platform, setPlatform] = useState(() => {
        if (collectionType !== 'game') return 'all';
        const saved = localStorage.getItem(platformKey);
        // Migrate users who had brand-level options saved (the prior
        // values: 'playstation', 'xbox', 'nintendo') onto the new
        // current-gen-specific equivalents.
        const legacyMigration = { playstation: 'ps5', xbox: 'xbox-series', nintendo: 'switch' };
        const migrated = legacyMigration[saved] || saved;
        return ['all', 'pc', 'ps5', 'xbox-series', 'switch'].includes(migrated) ? migrated : 'all';
    });
    const inputRef = useRef(null);

    const viewOptions = [
        { value: 2, label: '2 columns', icon: Columns2 },
        { value: 3, label: '3 columns', icon: Columns3 },
        { value: 4, label: '4 columns', icon: Columns4 },
    ];

    // Game-only: current-gen platform filter, mapped server-side to
    // RAWG's specific `platforms` IDs (PS5, Xbox Series S/X, Switch).
    // Switch 2 games show under "Nintendo Switch" until RAWG splits
    // them into a separate platform.
    const platformOptions = collectionType === 'game' ? [
        { value: 'all',          label: 'All platforms' },
        { value: 'pc',           label: 'PC' },
        { value: 'ps5',          label: 'PS5' },
        { value: 'xbox-series',  label: 'Xbox Series X/S' },
        { value: 'switch',       label: 'Nintendo Switch' },
    ] : [];

    const handleViewChange = (v) => {
        setViewValue(v);
        localStorage.setItem(viewKey, String(v));
    };

    const handlePlatformChange = (v) => {
        setPlatform(v);
        localStorage.setItem(platformKey, v);
    };

    const trimmedQuery = debouncedQuery.trim();
    // Require at least 2 chars before hitting the search APIs. A single
    // letter matches thousands of irrelevant titles and burns a request
    // against RAWG / BGG / TMDB free-tier quotas for no real value.
    // Filters-only also counts as searching — Advanced Search lets the
    // user discover by genre/year/rating without typing anything.
    const isSearching = trimmedQuery.length >= 2 || filtersOn;
    const hasMultipleSubtabs = subtabs.length > 1;

    useEffect(() => {
        // 500ms debounce on Discover search input. The fetch hits live
        // third-party APIs (TMDB, RAWG, BGG) on each query change and
        // each of those have free-tier quotas worth conserving — wait
        // for the user to pause typing before firing.
        const id = setTimeout(() => setDebouncedQuery(query), 500);
        return () => clearTimeout(id);
    }, [query]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        if (activeSubtab === subtabs[0].key) next.delete('tab'); else next.set('tab', activeSubtab);
        if (trimmedQuery) next.set('q', trimmedQuery); else next.delete('q');
        // Mirror Advanced Search filters into the URL too. Each empty
        // value is dropped so the URL stays clean when the user clears
        // filters one at a time via the chip strip.
        const f = activeFilters || EMPTY_FILTERS;
        if (f.genres && f.genres.length) next.set('genres', f.genres.join(',')); else next.delete('genres');
        if (f.minRating)  next.set('min_rating', String(f.minRating));   else next.delete('min_rating');
        if (f.yearFrom)   next.set('year_from',  String(f.yearFrom));    else next.delete('year_from');
        if (f.yearTo)     next.set('year_to',    String(f.yearTo));      else next.delete('year_to');
        if (f.author)     next.set('author',     f.author);              else next.delete('author');
        if (f.publisher)  next.set('publisher',  f.publisher);           else next.delete('publisher');
        if (f.sort)       next.set('sort',       f.sort);                else next.delete('sort');
        if (next.toString() !== searchParams.toString()) {
            setSearchParams(next, { replace: true });
        }
    }, [activeSubtab, trimmedQuery, subtabs, activeFilters, searchParams, setSearchParams]);

    useEffect(() => {
        let cancelled = false;

        // In search mode without a query, show a blank slate — the user is
        // about to search the whole catalog, not browse the trending feed.
        if (searchModeActive && !isSearching) {
            setItems([]);
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        const request = isSearching
            ? fetchSearch(collectionType, trimmedQuery, 1, { platform, filters: activeFilters })
            : fetchDiscover(collectionType, activeSubtab, 1, { platform });

        request
            .then(async data => {
                if(cancelled) return;
                const results = data.results || [];

                // For video games, RAWG returns the lower-quality default
                // image and we then upgrade to SteamGridDB posters. The
                // SGDB lookup is usually fast enough that swapping images
                // mid-render reads as flickery — keep the loader up until
                // the upgraded posters are merged in, then commit once.
                if(collectionType === 'game' && results.length > 0) {
                    try {
                        const posters = await fetchGamePosters(results);
                        if(cancelled) return;
                        const upgraded = results.map(item => (
                            posters[item.id] ? { ...item, poster: posters[item.id] } : item
                        ));
                        setItems(upgraded);
                    } catch(err) {
                        console.log('poster upgrade skipped:', err.message);
                        if(cancelled) return;
                        setItems(results);
                    }
                } else {
                    setItems(results);
                }

                setIsLoading(false);
            })
            .catch(err => {
                if(cancelled) return;
                setError(err);
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [activeSubtab, collectionType, trimmedQuery, isSearching, searchModeActive, platform, activeFilters]);

    const openItem = (item) => {
        const search = item.poster
            ? `?p=${encodeURIComponent(item.poster)}`
            : '';
        navigate(`/items/${collectionType}/${item.id}${search}`, {
            state: { originator: `${location.pathname}${location.search}` },
        });
    };

    const enterSearch = () => {
        setSearchModeActive(true);
    };

    const exitSearch = () => {
        setSearchModeActive(false);
        setQuery('');
        // Wipe any Advanced Search filters when leaving search mode —
        // Advanced Search is a one-off "find me a thing" tool, not a
        // sticky preference. Saves users from confused empty-result
        // grids when they open search again later.
        setActiveFilters(EMPTY_FILTERS);
        inputRef.current?.blur();
    };

    // Auto-focus the input when entering search mode. iOS opens the
    // keyboard for programmatic focus calls that follow a user gesture
    // synchronously through React's commit phase, so this runs as soon
    // as the input mounts.
    useEffect(() => {
        if (searchModeActive) inputRef.current?.focus();
    }, [searchModeActive]);

    // Tell parent (MediaTab) whether to suppress its own sticky header.
    useEffect(() => {
        onSearchingChange?.(searchModeActive);
    }, [searchModeActive, onSearchingChange]);

    // Drive the footer off searchModeActive so its visibility stays
    // consistent on remount — e.g. when the user taps a search result,
    // visits ItemDetails, then comes back. URL state restores
    // searchModeActive=true, and this effect re-hides the footer.
    useEffect(() => {
        auth.showFooterHandler(!searchModeActive);
        return () => auth.showFooterHandler(true);
    }, [searchModeActive, auth]);

    return (
        <div className='discover'>
            {searchModeActive && (
                <div
                    className='discover-search-sticky-header'
                    style={{ borderBottomColor: color }}
                >
                    <div className='discover-search-input-wrap' style={{ borderColor: color }}>
                        <SearchIcon size={18} strokeWidth={2} style={{ color }} aria-hidden='true' />
                        <input
                            ref={inputRef}
                            className='discover-search-input'
                            type='text'
                            placeholder={SEARCH_PLACEHOLDER[collectionType] || 'Search'}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoComplete='off'
                        />
                        {query && (
                            <button
                                type='button'
                                className='discover-search-clear'
                                // onMouseDown preventDefault keeps focus on
                                // the input so the user can keep typing
                                // immediately after clearing.
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    setQuery('');
                                    inputRef.current?.focus();
                                }}
                                aria-label='Clear text'
                                style={{ color }}
                            >
                                <X size={14} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                    {supportsAdvanced && (
                        <button
                            type='button'
                            className='discover-search-advanced'
                            onClick={() => setAdvancedOpen(true)}
                            aria-label='Advanced filters'
                            style={{ color }}
                        >
                            <SlidersHorizontal size={20} strokeWidth={2} />
                            {filtersOn && <span className='discover-search-advanced-dot' style={{ backgroundColor: color }} />}
                        </button>
                    )}
                    <button
                        type='button'
                        className='discover-search-cancel'
                        onClick={exitSearch}
                        style={{ color }}
                    >
                        Cancel
                    </button>
                </div>
            )}

            {searchModeActive && filtersOn && (
                <ActiveFilterChips
                    filters={activeFilters}
                    mediaType={collectionType}
                    color={color}
                    onChange={setActiveFilters}
                />
            )}

            {supportsAdvanced && (
                <AdvancedSearchSheet
                    open={advancedOpen}
                    onClose={() => setAdvancedOpen(false)}
                    onApply={(f) => { setActiveFilters(f); setAdvancedOpen(false); }}
                    onReset={() => { setActiveFilters(EMPTY_FILTERS); setAdvancedOpen(false); }}
                    mediaType={collectionType}
                    color={color}
                    initialFilters={activeFilters}
                />
            )}

            {!searchModeActive && (
                <button
                    type='button'
                    className='floating-filter'
                    onClick={(e) => setFilterAnchor(e.currentTarget)}
                    aria-label='Filter'
                    style={{ color }}
                >
                    <SlidersHorizontal size={20} strokeWidth={2.5} />
                </button>
            )}

            {!searchModeActive && (
                <button
                    type='button'
                    className='floating-search-btn'
                    onClick={enterSearch}
                    aria-label='Search'
                    style={{ color }}
                >
                    <SearchIcon size={20} strokeWidth={2.5} />
                </button>
            )}

            <SortFilterPanel
                anchorEl={filterAnchor}
                open={Boolean(filterAnchor)}
                onClose={() => setFilterAnchor(null)}
                filterOptions={hasMultipleSubtabs ? subtabs.map(t => ({ value: t.key, label: t.label })) : []}
                filterValue={activeSubtab}
                onFilterChange={(v) => { setActiveSubtab(v); setFilterAnchor(null); }}
                filterLabel='Category'
                platformOptions={platformOptions}
                platformValue={platform}
                onPlatformChange={handlePlatformChange}
                platformLabel='Platform'
                viewOptions={viewOptions}
                viewValue={viewValue}
                onViewChange={handleViewChange}
                activeColor={color}
            />

            {isLoading && <DiscoverSkeleton color={color} />}
            {error && <DiscoverError error={error} color={color} />}
            {!isLoading && !error && items.length === 0 && (
                <p className='discover-empty'>
                    {searchModeActive && !isSearching
                        ? 'Type to search'
                        : isSearching
                            ? `No results for "${trimmedQuery}"`
                            : 'No results available right now.'}
                </p>
            )}
            {!isLoading && !error && items.length > 0 && (
                <div
                    className='discover-grid'
                    style={{ gridTemplateColumns: `repeat(${viewValue}, minmax(0, 1fr))` }}
                >
                    {items.map(item => (
                        <button
                            key={item.id}
                            type='button'
                            className='discover-card'
                            onClick={() => openItem(item)}
                            aria-label={item.title}
                        >
                            {item.poster
                                ? <img src={item.poster} alt={`${item.title} poster`} className='discover-poster' />
                                : <div className='discover-poster discover-poster-placeholder'>{item.title || 'No image'}</div>}
                        </button>
                    ))}
                </div>
            )}

        </div>
    );
};

const DiscoverSkeleton = ({ color }) => (
    <div className='discover-skeleton'>
        <Loading color={color} type='beat' size={20} />
    </div>
);

const DiscoverError = ({ error }) => (
    <div className='discover-error'>
        <p className='discover-error-title'>Could not load content</p>
        <p className='discover-error-text'>
            {error.message || 'Something went wrong loading this feed.'}
        </p>
    </div>
);

// Strip of removable chips showing the user's active Advanced Search
// filters. Tapping the X on a chip clears just that filter and the
// search re-runs against the remaining ones.
const ActiveFilterChips = ({ filters, mediaType, color, onChange }) => {
    const genreList = GENRES_FOR_TYPE[mediaType] || [];
    const sortOpts  = SORT_OPTIONS_FOR_TYPE[mediaType] || [];
    const labelForGenre = (id) => genreList.find(g => g.id === id)?.label || String(id);
    const labelForSort  = (v)  => sortOpts.find(s => s.value === v)?.label || v;
    const chips = [];

    if (filters.author) {
        chips.push({ key: 'author', text: `By ${filters.author}`, clear: () => onChange({ ...filters, author: '' }) });
    }
    if (filters.publisher) {
        chips.push({ key: 'publisher', text: filters.publisher, clear: () => onChange({ ...filters, publisher: '' }) });
    }
    (filters.genres || []).forEach(id => {
        chips.push({
            key: `genre-${id}`,
            text: labelForGenre(id),
            clear: () => onChange({ ...filters, genres: filters.genres.filter(g => g !== id) }),
        });
    });
    if (filters.minRating > 0) {
        chips.push({
            key: 'min-rating',
            text: `Rating ≥ ${filters.minRating}`,
            clear: () => onChange({ ...filters, minRating: 0 }),
        });
    }
    if (filters.yearFrom || filters.yearTo) {
        const lo = filters.yearFrom || '';
        const hi = filters.yearTo   || '';
        const text = lo && hi ? `${lo}–${hi}` : lo ? `From ${lo}` : `Until ${hi}`;
        chips.push({
            key: 'year',
            text,
            clear: () => onChange({ ...filters, yearFrom: '', yearTo: '' }),
        });
    }
    if (filters.sort) {
        chips.push({
            key: 'sort',
            text: `Sort: ${labelForSort(filters.sort)}`,
            clear: () => onChange({ ...filters, sort: '' }),
        });
    }

    if (chips.length === 0) return null;

    return (
        <div className='discover-active-filters'>
            {chips.map(c => (
                <button
                    key={c.key}
                    type='button'
                    className='discover-active-filter-chip'
                    onClick={c.clear}
                    style={{ borderColor: color, color }}
                    aria-label={`Remove filter: ${c.text}`}
                >
                    <span>{c.text}</span>
                    <X size={12} strokeWidth={2.5} />
                </button>
            ))}
        </div>
    );
};

const ComingSoon = ({ collectionType, color }) => {
    const label = collectionType === 'game' ? 'video games' : collectionType;
    return (
        <div className='discover-placeholder'>
            <p className='discover-placeholder-title' style={{ color }}>Discover — {label}</p>
            <p className='discover-placeholder-subtext'>Coming soon.</p>
        </div>
    );
};

export default Discover;
