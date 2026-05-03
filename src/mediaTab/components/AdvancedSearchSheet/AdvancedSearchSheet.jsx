import React, { useState, useEffect } from 'react';
import { SwipeableDrawer } from '@mui/material';
import { X } from 'lucide-react';

import { GENRES_FOR_TYPE, MIN_RATING_CONFIG, SORT_OPTIONS_FOR_TYPE } from './genres';
import './AdvancedSearchSheet.css';

// Empty filter shape — used to seed the form state and recognize
// "no active filters" so the parent can show / hide the active-
// filters strip in Discover.
export const EMPTY_FILTERS = {
    genres: [],
    minRating: 0,
    yearFrom: '',
    yearTo: '',
    author: '',
    publisher: '',
    sort: '',
};

export const filtersAreEmpty = (f) => {
    if (!f) return true;
    return (
        (!f.genres || f.genres.length === 0) &&
        (!f.minRating || f.minRating <= 0) &&
        !f.yearFrom &&
        !f.yearTo &&
        !f.author &&
        !f.publisher &&
        !f.sort
    );
};

// Per-type Advanced Search bottom sheet. Parent owns the live
// `activeFilters` state and re-runs the search whenever the user
// hits Apply. Reset clears the form. Cancel discards local edits.
const AdvancedSearchSheet = ({
    open,
    onClose,
    onApply,
    onReset,
    mediaType,
    color = '#FCB016',
    initialFilters,
}) => {
    const [filters, setFilters] = useState(initialFilters || EMPTY_FILTERS);

    // Reset local form whenever the sheet re-opens so it always
    // mirrors whatever filters are currently active in the parent.
    useEffect(() => {
        if (open) setFilters(initialFilters || EMPTY_FILTERS);
    }, [open, initialFilters]);

    const genreList = GENRES_FOR_TYPE[mediaType] || [];
    const ratingCfg = MIN_RATING_CONFIG[mediaType];
    const sortOpts  = SORT_OPTIONS_FOR_TYPE[mediaType];

    const showAuthor    = mediaType === 'book';
    const showPublisher = mediaType === 'game';

    const toggleGenre = (id) => {
        setFilters(prev => {
            const next = new Set(prev.genres || []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { ...prev, genres: [...next] };
        });
    };

    const handleApply = () => {
        // Normalize numeric fields to numbers (or null). The parent
        // can rely on getting cleaned data without re-parsing.
        const clean = {
            genres: filters.genres || [],
            minRating: Number(filters.minRating) || 0,
            yearFrom: filters.yearFrom ? parseInt(filters.yearFrom, 10) || '' : '',
            yearTo:   filters.yearTo   ? parseInt(filters.yearTo, 10)   || '' : '',
            author: filters.author?.trim() || '',
            publisher: filters.publisher?.trim() || '',
            sort: filters.sort || '',
        };
        onApply?.(clean);
    };

    const handleReset = () => {
        setFilters(EMPTY_FILTERS);
        onReset?.();
    };

    return (
        <SwipeableDrawer
            anchor='bottom'
            open={open}
            onOpen={() => {}}
            onClose={onClose}
            disableSwipeToOpen
            PaperProps={{ className: 'adv-search-sheet' }}
        >
            <div className='adv-search-grabber' />
            <div className='adv-search-header'>
                <h2 className='adv-search-title'>Advanced Search</h2>
                <button
                    type='button'
                    className='icon-btn'
                    onClick={onClose}
                    aria-label='Close'
                >
                    <X size={20} strokeWidth={1.75} />
                </button>
            </div>

            <div className='adv-search-body'>
                {showAuthor && (
                    <div className='adv-search-field'>
                        <label className='adv-search-label' htmlFor='adv-search-author'>Author</label>
                        <input
                            id='adv-search-author'
                            type='text'
                            className='adv-search-input'
                            value={filters.author}
                            onChange={(e) => setFilters(p => ({ ...p, author: e.target.value }))}
                            placeholder='e.g. Brandon Sanderson'
                        />
                    </div>
                )}

                {showPublisher && (
                    <div className='adv-search-field'>
                        <label className='adv-search-label' htmlFor='adv-search-publisher'>Publisher</label>
                        <input
                            id='adv-search-publisher'
                            type='text'
                            className='adv-search-input'
                            value={filters.publisher}
                            onChange={(e) => setFilters(p => ({ ...p, publisher: e.target.value }))}
                            placeholder='e.g. Nintendo'
                        />
                    </div>
                )}

                {genreList.length > 0 && (
                    <div className='adv-search-field'>
                        <span className='adv-search-label'>Genres</span>
                        <div className='adv-search-chips'>
                            {genreList.map(g => {
                                const isActive = filters.genres?.includes(g.id);
                                return (
                                    <button
                                        key={g.id}
                                        type='button'
                                        className={`adv-search-chip ${isActive ? 'is-active' : ''}`}
                                        onClick={() => toggleGenre(g.id)}
                                        style={isActive ? { borderColor: color, color, backgroundColor: 'transparent' } : undefined}
                                    >
                                        {g.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {ratingCfg && (
                    <div className='adv-search-field'>
                        <span className='adv-search-label'>
                            {ratingCfg.label}
                            {filters.minRating > 0 && (
                                <span className='adv-search-rating-value' style={{ color }}>
                                    {' '}≥ {filters.minRating}
                                </span>
                            )}
                        </span>
                        <input
                            type='range'
                            className='adv-search-slider'
                            min={ratingCfg.min}
                            max={ratingCfg.max}
                            step={ratingCfg.step}
                            value={filters.minRating || 0}
                            onChange={(e) => setFilters(p => ({ ...p, minRating: parseFloat(e.target.value) }))}
                            style={{ accentColor: color }}
                        />
                    </div>
                )}

                <div className='adv-search-field'>
                    <span className='adv-search-label'>Year</span>
                    <div className='adv-search-year-row'>
                        <input
                            type='number'
                            inputMode='numeric'
                            className='adv-search-input adv-search-year-input'
                            placeholder='From'
                            value={filters.yearFrom}
                            onChange={(e) => setFilters(p => ({ ...p, yearFrom: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        />
                        <span className='adv-search-year-sep'>–</span>
                        <input
                            type='number'
                            inputMode='numeric'
                            className='adv-search-input adv-search-year-input'
                            placeholder='To'
                            value={filters.yearTo}
                            onChange={(e) => setFilters(p => ({ ...p, yearTo: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        />
                    </div>
                </div>

                {sortOpts && sortOpts.length > 0 && (
                    <div className='adv-search-field'>
                        <span className='adv-search-label'>Sort</span>
                        <div className='adv-search-chips'>
                            {sortOpts.map(opt => {
                                const isActive = filters.sort === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type='button'
                                        className={`adv-search-chip ${isActive ? 'is-active' : ''}`}
                                        onClick={() => setFilters(p => ({ ...p, sort: isActive ? '' : opt.value }))}
                                        style={isActive ? { borderColor: color, color, backgroundColor: 'transparent' } : undefined}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className='adv-search-actions'>
                <button
                    type='button'
                    className='adv-search-btn adv-search-btn-secondary'
                    onClick={handleReset}
                >
                    Reset
                </button>
                <button
                    type='button'
                    className='adv-search-btn adv-search-btn-primary'
                    onClick={handleApply}
                    style={{ backgroundColor: color, color: '#111' }}
                >
                    Apply
                </button>
            </div>
        </SwipeableDrawer>
    );
};

export default AdvancedSearchSheet;
