import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Columns2, Columns3, Columns4, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';

import { SUBTABS, fetchDiscover, fetchSearch, fetchGamePosters } from './discoverApi';
import SortFilterPanel from '../shared/components/SortFilterPanel/SortFilterPanel';
import { AuthContext } from '../shared/context/auth-context';
import './Discover.css';

const SUPPORTED_TYPES = ['movie', 'tv', 'game', 'board'];

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
    const auth = useContext(AuthContext);
    const [searchParams, setSearchParams] = useSearchParams();
    const subtabs = SUBTABS[collectionType];

    const urlTab = searchParams.get('tab');
    const urlQuery = searchParams.get('q') || '';
    const initialSubtab = subtabs.some(t => t.key === urlTab) ? urlTab : subtabs[0].key;

    const viewKey = `choice-champ:discover-view:${collectionType}`;

    const [activeSubtab, setActiveSubtab] = useState(initialSubtab);
    const [query, setQuery] = useState(urlQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(urlQuery);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterAnchor, setFilterAnchor] = useState(null);
    const [searchModeActive, setSearchModeActive] = useState(urlQuery.length > 0);
    const [viewValue, setViewValue] = useState(() => {
        const saved = localStorage.getItem(viewKey);
        const parsed = saved ? parseInt(saved, 10) : 2;
        return [2, 3, 4].includes(parsed) ? parsed : 2;
    });
    const inputRef = useRef(null);

    const viewOptions = [
        { value: 2, label: '2 columns', icon: Columns2 },
        { value: 3, label: '3 columns', icon: Columns3 },
        { value: 4, label: '4 columns', icon: Columns4 },
    ];

    const handleViewChange = (v) => {
        setViewValue(v);
        localStorage.setItem(viewKey, String(v));
    };

    const trimmedQuery = debouncedQuery.trim();
    const isSearching = trimmedQuery.length > 0;
    const hasMultipleSubtabs = subtabs.length > 1;

    useEffect(() => {
        const id = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(id);
    }, [query]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        if (activeSubtab === subtabs[0].key) next.delete('tab'); else next.set('tab', activeSubtab);
        if (trimmedQuery) next.set('q', trimmedQuery); else next.delete('q');
        if (next.toString() !== searchParams.toString()) {
            setSearchParams(next, { replace: true });
        }
    }, [activeSubtab, trimmedQuery, subtabs, searchParams, setSearchParams]);

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
            ? fetchSearch(collectionType, trimmedQuery)
            : fetchDiscover(collectionType, activeSubtab);

        request
            .then(data => {
                if(cancelled) return;
                const results = data.results || [];
                setItems(results);
                setIsLoading(false);

                if(collectionType === 'game' && results.length > 0) {
                    fetchGamePosters(results)
                        .then(posters => {
                            if(cancelled) return;
                            setItems(prev => prev.map(item => (
                                posters[item.id] ? { ...item, poster: posters[item.id] } : item
                            )));
                        })
                        .catch(err => console.log('poster upgrade skipped:', err.message));
                }
            })
            .catch(err => {
                if(cancelled) return;
                setError(err);
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [activeSubtab, collectionType, trimmedQuery, isSearching, searchModeActive]);

    const openItem = (item) => {
        const search = item.poster
            ? `?p=${encodeURIComponent(item.poster)}`
            : '';
        navigate(`/items/${collectionType}/${item.id}${search}`);
    };

    const enterSearch = () => {
        setSearchModeActive(true);
        auth.showFooterHandler(false);
    };

    const exitSearch = () => {
        setSearchModeActive(false);
        setQuery('');
        auth.showFooterHandler(true);
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

    useEffect(() => {
        return () => auth.showFooterHandler(true);
    }, [auth]);

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
                            placeholder='Search'
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoComplete='off'
                        />
                        {query && (
                            <button
                                type='button'
                                className='discover-search-clear'
                                onClick={() => setQuery('')}
                                aria-label='Clear text'
                                style={{ color }}
                            >
                                <X size={14} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
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
        <div className='discover-spinner' style={{ borderTopColor: color }} />
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
