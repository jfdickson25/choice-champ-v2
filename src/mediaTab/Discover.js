import React, { useEffect, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

import { SUBTABS, fetchDiscover, fetchSearch } from './discoverApi';
import ItemDetailsModal from '../collection/components/ItemDetailsModal';
import './Discover.css';

const SUPPORTED_TYPES = ['movie', 'tv', 'board'];

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
    const subtabs = SUBTABS[collectionType];
    const [activeSubtab, setActiveSubtab] = useState(subtabs[0].key);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);

    const trimmedQuery = debouncedQuery.trim();
    const isSearching = trimmedQuery.length > 0;

    useEffect(() => {
        const id = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(id);
    }, [query]);

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
                setItems(data.results || []);
                setIsLoading(false);
            })
            .catch(err => {
                if(cancelled) return;
                setError(err);
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [activeSubtab, collectionType, trimmedQuery, isSearching]);

    const openItem = (item) => {
        setSelectedItem({ itemId: item.id, title: item.title, poster: item.poster });
    };

    return (
        <div className='discover'>
            <div className='discover-toolbar'>
                <div className='discover-search'>
                    <SearchIcon size={18} strokeWidth={2} className='discover-search-icon' aria-hidden='true' />
                    <input
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
                            aria-label='Clear search'
                            style={{ color }}
                        >
                            <X size={18} strokeWidth={2.5} />
                        </button>
                    )}
                </div>

                {!isSearching && subtabs.length > 1 && (
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

            <ItemDetailsModal
                open={selectedItem !== null}
                item={selectedItem}
                collectionType={collectionType}
                onClose={() => setSelectedItem(null)}
            />
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
