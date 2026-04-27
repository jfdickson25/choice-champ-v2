import React, { useEffect, useState } from 'react';
import { Dialog } from '@mui/material';
import { Plus, Check, Search as SearchIcon } from 'lucide-react';

import Loading from '../../shared/components/Loading';
import { fetchSearch } from '../../mediaTab/discoverApi';

import './AddItemsSheet.css';

const TYPE_LABEL = {
    movie: 'movie',
    tv:    'TV show',
    game:  'video game',
    board: 'board game',
};

const SEARCH_DEBOUNCE_MS = 500;
const MIN_SEARCH_LENGTH = 2;

const AddItemsSheet = ({
    open,
    onClose,
    mediaType,
    color,
    existingItemIds,
    onAdd,
    onRemove,
}) => {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Per-item in-flight set so a tap doesn't double-fire and we can
    // visually disable cards mid-request without disturbing layout.
    const [pendingIds, setPendingIds] = useState(() => new Set());

    // Debounce — same 500ms / 2-char minimum as Discover, since we hit the
    // same upstream APIs (TMDB/RAWG/BGG free-tier quotas worth conserving).
    useEffect(() => {
        const id = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [query]);

    // Fetch results only once the user has typed at least MIN_SEARCH_LENGTH
    // characters — same blank-until-query behavior Discover uses in search
    // mode. Avoids hitting upstream APIs (and burning quota) for users
    // who open the sheet just to dismiss it.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const trimmed = debouncedQuery.trim();
        const isSearching = trimmed.length >= MIN_SEARCH_LENGTH;

        if (!isSearching) {
            setItems([]);
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        fetchSearch(mediaType, trimmed)
            .then(data => {
                if (cancelled) return;
                // Backend returns { results, page, totalPages } for /discover
                // and /discover/.../search — match what Discover already does.
                setItems(Array.isArray(data?.results) ? data.results : []);
                setLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                setError(err.message || 'Failed to load');
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [open, mediaType, debouncedQuery]);

    // Reset transient state when the sheet closes so the next open is clean.
    useEffect(() => {
        if (!open) {
            setQuery('');
            setDebouncedQuery('');
            setItems([]);
            setError(null);
            setPendingIds(new Set());
        }
    }, [open]);

    const markPending = (id, isPending) => {
        setPendingIds(prev => {
            const next = new Set(prev);
            if (isPending) next.add(String(id)); else next.delete(String(id));
            return next;
        });
    };

    const handleToggle = async (item) => {
        const sourceId = String(item.id);
        if (pendingIds.has(sourceId)) return;
        const isAdded = existingItemIds.has(sourceId);
        markPending(sourceId, true);
        try {
            if (isAdded) {
                await onRemove(item.id);
            } else {
                await onAdd(item);
            }
        } catch (err) {
            console.log(err);
        } finally {
            markPending(sourceId, false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen
            PaperProps={{ className: 'add-items-sheet-paper' }}
        >
            <div className='add-items-sheet'>
                <header className='add-items-sheet-header' style={{ borderBottomColor: color }}>
                    <div className='add-items-sheet-search-wrap'>
                        <SearchIcon size={18} strokeWidth={2} className='add-items-sheet-search-icon' />
                        <input
                            type='text'
                            className='add-items-sheet-search'
                            placeholder={`Search for a ${TYPE_LABEL[mediaType] || 'item'}`}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoComplete='off'
                            autoFocus
                        />
                    </div>
                    <button
                        type='button'
                        className='add-items-sheet-done'
                        onClick={onClose}
                        style={{ color }}
                    >
                        Done
                    </button>
                </header>

                <div className='add-items-sheet-body'>
                    {loading && (
                        <div className='add-items-sheet-loading'>
                            <Loading color={color} type='beat' size={20} />
                        </div>
                    )}
                    {!loading && error && (
                        <div className='add-items-sheet-empty'>{error}</div>
                    )}
                    {!loading && !error && items.length === 0 && (
                        <div className='add-items-sheet-empty'>
                            {debouncedQuery.trim().length >= MIN_SEARCH_LENGTH
                                ? `No results for "${debouncedQuery.trim()}"`
                                : 'Type to search'}
                        </div>
                    )}
                    {!loading && !error && items.length > 0 && (
                        <div className='add-items-sheet-grid'>
                            {items.map(item => {
                                const sourceId = String(item.id);
                                const isAdded = existingItemIds.has(sourceId);
                                const isPending = pendingIds.has(sourceId);
                                return (
                                    <button
                                        key={sourceId}
                                        type='button'
                                        className={`add-items-sheet-card ${isAdded ? 'is-added' : ''} ${isPending ? 'is-pending' : ''}`}
                                        onClick={() => handleToggle(item)}
                                        aria-label={isAdded ? `Remove ${item.title}` : `Add ${item.title}`}
                                    >
                                        {item.poster ? (
                                            <img src={item.poster} alt='' loading='lazy' />
                                        ) : (
                                            <div className='add-items-sheet-placeholder'>{item.title}</div>
                                        )}
                                        <span
                                            className='add-items-sheet-badge'
                                            style={isAdded ? { backgroundColor: color, color: '#111' } : undefined}
                                        >
                                            {isAdded ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={3} />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Dialog>
    );
};

export default AddItemsSheet;
