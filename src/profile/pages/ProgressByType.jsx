import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';

import Loading from '../../shared/components/Loading';
import { AuthContext } from '../../shared/context/auth-context';
import { api } from '../../shared/lib/api';
import { getMediaType, watchedLabelFor, unwatchedLabelFor } from '../../shared/lib/mediaTypes';
import SegmentedToggle from '../../shared/components/SegmentedToggle/SegmentedToggle';
import './ProgressByType.css';

const SORT_OPTIONS = [
    { value: 'progress', label: 'Closest to done' },
    { value: 'recent',   label: 'Most recent' },
    { value: 'alpha',    label: 'A → Z' },
];

const VIEW_OPTIONS = [
    { value: 'group', label: 'Group' },
    { value: 'you',   label: 'You' },
];

// Pull the right completion flag for the active view ("Group" reads
// the shared collection_items.complete column; "You" reads each
// item's userComplete which the backend derives from watched_media).
const completeFor = (item, view) => view === 'you' ? !!item.userComplete : !!item.complete;
const completeCountFor = (collection, view) =>
    view === 'you' ? (collection.userComplete || 0) : (collection.complete || 0);

const sortCollections = (collections, sort, view) => {
    const arr = [...collections];
    switch (sort) {
        case 'alpha':
            return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        case 'recent':
            // Most-recent first; rely on created_at as a proxy for activity.
            return arr.sort((a, b) => {
                const at = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bt - at;
            });
        case 'progress':
        default:
            // Highest completion percentage first; empty collections fall
            // to the bottom so "what's almost done" sits at the top.
            return arr.sort((a, b) => {
                const ap = a.total > 0 ? completeCountFor(a, view) / a.total : -1;
                const bp = b.total > 0 ? completeCountFor(b, view) / b.total : -1;
                return bp - ap;
            });
    }
};

const ProgressByType = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const { type } = useParams();
    const config = getMediaType(type);
    const watchedLabel = watchedLabelFor(type);
    const unwatchedLabel = unwatchedLabelFor(type);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState('progress');
    const [view, setView] = useState('group');
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        auth.showFooterHandler(true);
    }, [auth]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api(`/user/progress/${type}`)
            .then(body => {
                if (cancelled) return;
                setData(body);
                setLoading(false);
            })
            .catch(err => {
                console.log(err);
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [type]);

    const sortedCollections = useMemo(() => {
        if (!data?.collections) return [];
        return sortCollections(data.collections, sort, view);
    }, [data, sort, view]);

    const summaryText = useMemo(() => {
        if (!data?.summary) return '';
        const { totalCollections, totalItems, completeItems, userCompleteItems } = data.summary;
        const completed = view === 'you' ? (userCompleteItems || 0) : completeItems;
        if (totalItems === 0) return `${totalCollections} ${totalCollections === 1 ? 'collection' : 'collections'} · No items yet`;
        const pct = Math.round((completed / totalItems) * 100);
        return `${totalCollections} ${totalCollections === 1 ? 'collection' : 'collections'} · ${pct}% complete · ${completed} of ${totalItems} ${config.action}`;
    }, [data, config.action, view]);

    const openItem = (collection, item) => {
        const params = new URLSearchParams({ cid: collection.id, mid: item.id });
        if (item.poster) params.set('p', item.poster);
        navigate(`/items/${type}/${item.itemId}?${params.toString()}`, {
            state: { originator: `${location.pathname}${location.search}` },
        });
    };

    return (
        <div className='progress-page'>
            <div className='progress-sticky-header'>
                <button className='icon-btn' onClick={() => navigate('/profile')} aria-label='Back'>
                    <ArrowLeft size={22} strokeWidth={1.75} />
                </button>
                <h1 className='progress-header-title' style={{ color: config.color }}>
                    {config.title} Progress
                </h1>
                <span className='progress-header-spacer' />
            </div>

            <div className='progress-content'>
                {loading ? (
                    <div className='progress-loading'>
                        <Loading color={config.color} type='beat' size={20} />
                    </div>
                ) : !data || data.collections.length === 0 ? (
                    <p className='progress-empty'>No collections yet</p>
                ) : (
                    <React.Fragment>
                        <div className='progress-view-toggle'>
                            <SegmentedToggle
                                options={VIEW_OPTIONS}
                                value={view}
                                onChange={setView}
                                activeColor={config.color}
                            />
                        </div>

                        <p className='progress-summary'>{summaryText}</p>

                        <div className='progress-sort-row' role='radiogroup' aria-label='Sort'>
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type='button'
                                    role='radio'
                                    aria-checked={sort === opt.value}
                                    className={`progress-sort-pill ${sort === opt.value ? 'is-active' : ''}`}
                                    onClick={() => setSort(opt.value)}
                                    style={sort === opt.value ? { borderColor: config.color, color: config.color } : undefined}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <div className='progress-list'>
                            {sortedCollections.map(c => {
                                const isOpen = expandedId === c.id;
                                const completeCount = completeCountFor(c, view);
                                const pct = c.total > 0 ? Math.round((completeCount / c.total) * 100) : 0;
                                const watchedItems = c.items.filter(i => completeFor(i, view));
                                const unwatchedItems = c.items.filter(i => !completeFor(i, view));
                                return (
                                    <div key={c.id} className={`progress-card ${isOpen ? 'is-open' : ''}`}>
                                        <button
                                            type='button'
                                            className='progress-card-head'
                                            onClick={() => setExpandedId(isOpen ? null : c.id)}
                                            aria-expanded={isOpen}
                                        >
                                            <div className='progress-card-row'>
                                                <span className='progress-card-name'>{c.name}</span>
                                                <span className='progress-card-count'>
                                                    {c.total === 0 ? 'Empty' : `${completeCount} / ${c.total}`}
                                                </span>
                                                <ChevronDown
                                                    size={18}
                                                    strokeWidth={2}
                                                    className='progress-card-chevron'
                                                />
                                            </div>
                                            <div className='progress-card-bar'>
                                                <div
                                                    className='progress-card-bar-fill'
                                                    style={{ width: `${pct}%`, backgroundColor: config.color }}
                                                />
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className='progress-card-body'>
                                                {c.total === 0 ? (
                                                    <p className='progress-card-empty'>No items in this collection yet</p>
                                                ) : (
                                                    <React.Fragment>
                                                        <ProgressItemSection
                                                            label={`${watchedLabel} (${watchedItems.length})`}
                                                            items={watchedItems}
                                                            color={config.color}
                                                            emptyText={`Nothing ${watchedLabel.toLowerCase()} yet`}
                                                            collection={c}
                                                            onOpenItem={openItem}
                                                        />
                                                        <ProgressItemSection
                                                            label={`${unwatchedLabel} (${unwatchedItems.length})`}
                                                            items={unwatchedItems}
                                                            color={config.color}
                                                            emptyText='All caught up!'
                                                            collection={c}
                                                            onOpenItem={openItem}
                                                        />
                                                    </React.Fragment>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

const INITIAL_VISIBLE = 12;

const ProgressItemSection = ({ label, items, color, emptyText, collection, onOpenItem }) => {
    const [showAll, setShowAll] = useState(false);
    if (items.length === 0) {
        return (
            <div className='progress-section'>
                <h3 className='progress-section-title'>{label}</h3>
                <p className='progress-section-empty'>{emptyText}</p>
            </div>
        );
    }
    const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
    const hiddenCount = items.length - visible.length;
    return (
        <div className='progress-section'>
            <h3 className='progress-section-title'>{label}</h3>
            <div className='progress-grid'>
                {visible.map(item => (
                    <button
                        key={item.id}
                        type='button'
                        className='progress-thumb'
                        onClick={() => onOpenItem(collection, item)}
                        aria-label={`Open ${item.title}`}
                    >
                        {item.poster ? (
                            <img src={item.poster} alt={item.title} loading='lazy' />
                        ) : (
                            <div className='progress-thumb-fallback'>{item.title}</div>
                        )}
                    </button>
                ))}
            </div>
            {hiddenCount > 0 && (
                <button
                    type='button'
                    className='progress-show-all'
                    onClick={() => setShowAll(true)}
                    style={{ color }}
                >
                    Show all {items.length}
                </button>
            )}
        </div>
    );
};

export default ProgressByType;
