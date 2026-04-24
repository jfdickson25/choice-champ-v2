import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';

import { SUBTABS, fetchDiscover, fetchSearch, fetchGamePosters } from './discoverApi';
import './Discover.css';

const SUPPORTED_TYPES = ['movie', 'tv', 'game', 'board'];

const Discover = ({ collectionType, color }) => {
    if(!SUPPORTED_TYPES.includes(collectionType)) {
        return (
            <div className='discover'>
                <ComingSoon collectionType={collectionType} color={color} />
            </div>
        );
    }
    return <DiscoverFeed collectionType={collectionType} color={color} />;
};

const DiscoverFeed = ({ collectionType, color }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const subtabs = SUBTABS[collectionType];

    const urlTab = searchParams.get('tab');
    const urlQuery = searchParams.get('q') || '';
    const initialSubtab = subtabs.some(t => t.key === urlTab) ? urlTab : subtabs[0].key;

    const [activeSubtab, setActiveSubtab] = useState(initialSubtab);
    const [query, setQuery] = useState(urlQuery);
    const [debouncedQuery, setDebouncedQuery] = useState(urlQuery);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const trimmedQuery = debouncedQuery.trim();
    const isSearching = trimmedQuery.length > 0;

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
    }, [activeSubtab, collectionType, trimmedQuery, isSearching]);

    const openItem = (item) => {
        navigate(`/items/${collectionType}/${item.id}`);
    };

    return (
        <div className='discover'>
            {!isSearching && subtabs.length > 1 && (
                <div className='discover-toolbar'>
                    <div className='discover-subtabs'>
                        {subtabs.map(tab => {
                            const isActive = tab.key === activeSubtab;
                            return (
                                <button
                                    key={tab.key}
                                    className={`discover-subtab ${isActive ? 'discover-subtab-active' : ''}`}
                                    style={isActive ? { color, borderColor: color } : undefined}
                                    onClick={() => setActiveSubtab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className='floating-search'>
                <SearchIcon size={18} strokeWidth={2} className='floating-search-icon' aria-hidden='true' />
                <input
                    className='floating-search-input'
                    type='text'
                    placeholder='Search'
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete='off'
                />
                {query && (
                    <button
                        type='button'
                        className='floating-search-clear'
                        onClick={() => setQuery('')}
                        aria-label='Clear search'
                        style={{ color }}
                    >
                        <X size={18} strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {isLoading && <DiscoverSkeleton color={color} />}
            {error && <DiscoverError error={error} color={color} />}
            {!isLoading && !error && items.length === 0 && (
                <p className='discover-empty'>
                    {isSearching ? `No results for "${trimmedQuery}"` : 'No results available right now.'}
                </p>
            )}
            {!isLoading && !error && items.length > 0 && (
                <div className='discover-grid'>
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
