import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { BACKEND_URL } from '../../shared/config';
import { api } from '../../shared/lib/api';
import { supabase } from '../../shared/lib/supabase';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import { ArrowLeft, Check, MoreVertical, Pencil, Share2, ListOrdered, Trash, ArrowDownAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpWideNarrow, Eye, Gamepad2, Dices, SlidersHorizontal, Layers, EyeOff, GripVertical, Search, Users, X, Columns2, Columns3, Columns4, Clapperboard, Star, Calendar } from 'lucide-react';
import RetroTv from '../../shared/components/Icons/RetroTv';
import { Menu, MenuItem, Dialog } from '@mui/material';

import './Collection.css';
import PlaceholderImg from '../../shared/components/PlaceholderImg';
import ManageItemRow from '../components/ManageItemRow';
import SortFilterPanel from '../../shared/components/SortFilterPanel/SortFilterPanel';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

const Collection = ({ socket }) => {
    const auth = useContext(AuthContext);
    let navigate = useNavigate();
    /************************************************************
     * Initial load and data needed. Here we grab the info we need
     * from the params and set edit and our items list
     ***********************************************************/
    // Grab the collection type, name and id from the parameters
    let collectionType = useParams().type;
    let collectionId = useParams().id;

    // Grab query parameters from the url
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const hash = params.get('hash');

    const customOrderKey = `choice-champ:custom-order:${collectionId}`;
    const viewCountKey = `choice-champ:view-count:${collectionId}`;

    // URL-backed filter + query state so navigating into ItemDetails
    // and using the back button restores what the user had set,
    // matching the Discover pattern. Sort + view stay in localStorage
    // because those are sticky preferences, not session state.
    const [searchParams, setSearchParams] = useSearchParams();
    const urlFilter = searchParams.get('filter');
    const urlQuery = searchParams.get('q') || '';

    const [items, setItems] = useState([]);
    const [isEdit, setIsEdit] = useState(false);
    const [shareCode, setShareCode] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [collectionName, setCollectionName] = useState('');
    const [sortValue, setSortValue] = useState(() =>
        localStorage.getItem(`choice-champ:custom-order:${collectionId}`) ? 'custom' : 'recent'
    );
    const [filterValue, setFilterValue] = useState(
        ['watched', 'unwatched'].includes(urlFilter) ? urlFilter : 'all'
    );
    const [viewValue, setViewValue] = useState(() => {
        const saved = localStorage.getItem(`choice-champ:view-count:${collectionId}`);
        const parsed = saved ? parseInt(saved, 10) : 2;
        return [2, 3, 4].includes(parsed) ? parsed : 2;
    });
    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

    const [kebabAnchor, setKebabAnchor] = useState(null);
    const [sortAnchor, setSortAnchor] = useState(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameDraft, setRenameDraft] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [membersOpen, setMembersOpen] = useState(false);
    const [members, setMembers] = useState(null);

    const openKebab = (e) => setKebabAnchor(e.currentTarget);
    const closeKebab = () => setKebabAnchor(null);
    const openSort = (e) => setSortAnchor(e.currentTarget);
    const closeSort = () => setSortAnchor(null);

    const handleShare = () => { setShareOpen(true); closeKebab(); };
    const handleManage = () => { setIsEdit(true); closeKebab(); };
    const handleMembers = () => {
        closeKebab();
        setMembers(null);
        setMembersOpen(true);
        api(`/collections/members/${collectionId}`)
            .then(data => setMembers(Array.isArray(data?.members) ? data.members : []))
            .catch(err => {
                console.log(err);
                setMembers([]);
            });
    };
    const handleRename = () => {
        setRenameDraft(collectionName);
        setRenameOpen(true);
        closeKebab();
    };
    const handleDelete = () => {
        setDeleteConfirm('');
        setDeleteOpen(true);
        closeKebab();
    };
    const handleDeleteCancel = () => setDeleteOpen(false);
    const handleDeleteConfirm = () => {
        if (deleteConfirm !== 'DELETE') return;
        api(`/collections/${collectionType}/${auth.userId}/${collectionId}`, { method: 'DELETE' })
            .then(() => {
                setDeleteOpen(false);
                navigate(`/collections/${collectionType}`);
            })
            .catch(err => console.log(err));
    };
    const handleRenameCancel = () => setRenameOpen(false);
    const handleRenameSave = () => {
        const trimmed = renameDraft.trim();
        if (!trimmed) return;
        if (trimmed === collectionName) {
            setRenameOpen(false);
            return;
        }
        api(`/collections/name/${collectionId}`, {
            method: 'POST',
            body: JSON.stringify({ name: trimmed }),
        })
            .then(() => {
                setCollectionName(trimmed);
                setRenameOpen(false);
            })
            .catch(err => console.log(err));
    };
    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(shareCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {}
    };

    const watchedLabel = (collectionType === 'game' || collectionType === 'board') ? 'Played' : 'Watched';
    const unwatchedLabel = (collectionType === 'game' || collectionType === 'board') ? 'Unplayed' : 'Unwatched';
    const WatchedIcon = collectionType === 'game' ? Gamepad2 : collectionType === 'board' ? Dices : Eye;

    const isFiltering = filterValue !== 'all';

    const sortOptions = [
        { value: 'custom',       label: 'Custom',           icon: GripVertical },
        { value: 'recent',       label: 'Date Added ↓',     icon: ArrowDownWideNarrow },
        { value: 'oldest',       label: 'Date Added ↑',     icon: ArrowUpWideNarrow },
        { value: 'release-desc', label: 'Release Date ↓',   icon: Calendar },
        { value: 'release-asc',  label: 'Release Date ↑',   icon: Calendar },
        { value: 'watched',      label: 'Recently Watched', icon: Eye },
        { value: 'rating-desc',  label: 'Rating ↓',         icon: Star },
        { value: 'rating-asc',   label: 'Rating ↑',         icon: Star },
        { value: 'abc',          label: 'A–Z',              icon: ArrowDownAZ },
        { value: 'zyx',          label: 'Z–A',              icon: ArrowDownZA },
    ];
    const viewOptions = [
        { value: 2, label: '2 columns', icon: Columns2 },
        { value: 3, label: '3 columns', icon: Columns3 },
        { value: 4, label: '4 columns', icon: Columns4 },
    ];

    const handleViewChange = (v) => {
        setViewValue(v);
        localStorage.setItem(viewCountKey, String(v));
    };
    const filterOptions = [
        { value: 'all',       label: 'All',          icon: Layers },
        { value: 'unwatched', label: unwatchedLabel, icon: EyeOff },
        { value: 'watched',   label: watchedLabel,   icon: WatchedIcon },
    ];

    const itemsRef = useRef(items);

    useEffect(() => {
        auth.showFooterHandler(true);

        if(collectionType === 'movie') {
            setCollectionTypeColor('#FCB016');
        } else if (collectionType === 'tv') {
            setCollectionTypeColor('#FF4D4D');
        } else if (collectionType === 'game') {
            setCollectionTypeColor('#2482C5');
        } else if (collectionType === 'board') {
            setCollectionTypeColor('#45B859');
        }

        api(`/collections/items/${collectionId}`)
        .then(data => {
            let ordered = Array.isArray(data?.items) ? data.items : [];
            const savedOrderRaw = localStorage.getItem(customOrderKey);
            if (savedOrderRaw) {
                try {
                    const savedOrder = JSON.parse(savedOrderRaw);
                    const byId = new Map(ordered.map(i => [i._id, i]));
                    const result = [];
                    for (const id of savedOrder) {
                        const item = byId.get(id);
                        if (item) { result.push(item); byId.delete(id); }
                    }
                    for (const item of byId.values()) result.push(item);
                    ordered = result;
                } catch {}
            }
            setItems(ordered);
            itemsRef.current = ordered;
            setShareCode(data.shareCode);
            setCollectionName(data.name);

            if(collectionType === 'game' && ordered.length > 0) {
                const payload = ordered.map(i => ({ id: i.itemId, title: i.title }));
                fetch(`${BACKEND_URL}/media/game-posters`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                    .then(res => res.json())
                    .then(({ posters = {} }) => {
                        const next = itemsRef.current.map(item => (
                            posters[item.itemId] ? { ...item, poster: posters[item.itemId] } : item
                        ));
                        itemsRef.current = next;
                        setItems(next);
                    })
                    .catch(err => console.log('poster upgrade skipped:', err.message));
            }

            // Render the grid in the DOM (still hidden behind the loader
            // while isLoading is true). Wait two frames for layout, then
            // jump-scroll to the hash item under the still-visible loader,
            // then drop the loader so the grid reveals already in place
            // — no visible scroll-from-top animation.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (hash) {
                        const element = document.getElementById(hash);
                        if (element) element.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                    setIsLoading(false);
                });
            });

        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth, collectionId]);

    // Supabase Realtime channel for cross-member collection sync.
    // Replaces the previous Socket.IO room keyed on collectionId.
    const channelRef = useRef(null);
    useEffect(() => {
        if (!collectionId) return;
        const channel = supabase.channel(`collection:${collectionId}`, {
            config: { broadcast: { self: false } },
        });

        channel.on('broadcast', { event: 'remove' }, ({ payload }) => {
            itemsRef.current = itemsRef.current.filter(item => item._id !== payload.id);
            setItems(itemsRef.current);
        });

        channel.on('broadcast', { event: 'watched' }, ({ payload }) => {
            itemsRef.current = itemsRef.current.map(item => {
                if (item._id !== payload.id) return item;
                // New broadcasts carry the explicit watched + completedAt
                // values from the server. Older broadcasts (rare, only
                // from a tab on a previous deploy) just signal a toggle —
                // fall back to flipping the local watched flag.
                const watched = typeof payload.watched === 'boolean'
                    ? payload.watched
                    : !item.watched;
                const completedAt = 'completedAt' in payload
                    ? payload.completedAt
                    : item.completedAt;
                return { ...item, watched, completedAt };
            });
            setItems(itemsRef.current);
        });

        channel.on('broadcast', { event: 'add' }, ({ payload }) => {
            itemsRef.current = [...itemsRef.current, payload.item];
            setItems(itemsRef.current);
        });

        channel.on('broadcast', { event: 'poster' }, ({ payload }) => {
            itemsRef.current = itemsRef.current.map(item => (
                item._id === payload.id ? { ...item, poster: payload.poster } : item
            ));
            setItems(itemsRef.current);
        });

        channel.subscribe();
        channelRef.current = channel;
        return () => { supabase.removeChannel(channel); channelRef.current = null; };
    }, [collectionId]);

    // Mirror filter + query into the URL so navigating to ItemDetails
    // and tapping back restores both. Defaults are dropped from the
    // URL to keep the bar clean.
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        if (filterValue === 'all') next.delete('filter'); else next.set('filter', filterValue);
        const trimmed = query.trim();
        if (trimmed) next.set('q', trimmed); else next.delete('q');
        if (next.toString() !== searchParams.toString()) {
            setSearchParams(next, { replace: true });
        }
    }, [filterValue, query, searchParams, setSearchParams]);

    // Personal rating changes from ItemDetails (same tab, same user).
    // Not broadcast through Supabase since ratings are per-user — other
    // collection members shouldn't see them — and the only place a stale
    // userRating matters is when this list re-sorts after the user comes
    // back from rating something on the details page.
    useEffect(() => {
        const handler = (e) => {
            const detail = e.detail || {};
            if (detail.mediaType !== collectionType) return;
            const targetId = String(detail.itemId);
            const next = (detail.rating == null || Number.isFinite(Number(detail.rating)))
                ? (detail.rating == null ? null : Number(detail.rating))
                : null;
            itemsRef.current = itemsRef.current.map(item => (
                String(item.itemId) === targetId ? { ...item, userRating: next } : item
            ));
            setItems(itemsRef.current);
        };
        window.addEventListener('cc:user-rating', handler);
        return () => window.removeEventListener('cc:user-rating', handler);
    }, [collectionType]);

    const exitManage = () => setIsEdit(false);

    const removeItem = (id) => {
        api(`/collections/items/${collectionId}/${id}`, { method: 'DELETE' })
        .then(() => {
            itemsRef.current = itemsRef.current.filter(item => item._id !== id);
            setItems(itemsRef.current);
            channelRef.current?.send({ type: 'broadcast', event: 'remove', payload: { id } });
        })
        .catch(err => console.log(err));
    }

    const navBack = () => {
        // Honor the user's actual entry point — Profile, MediaTab, deep
        // link, etc. — by walking one step back through history. Falls
        // back to the MediaTab list when the page was opened directly
        // (no prior history entry from this app), so the button never
        // looks broken.
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate(`/collections/${collectionType}`);
        }
    }

    const openDetails = (item) => {
        // Stamp the current Collection URL with this item's hash so back
        // navigation from ItemDetails lands on a URL we can read to scroll
        // the user back to exactly where they were in the grid.
        const collectionParams = new URLSearchParams(window.location.search);
        collectionParams.set('hash', item.itemId);
        navigate(`${window.location.pathname}?${collectionParams.toString()}`, { replace: true });

        const params = new URLSearchParams({
            cid: collectionId,
            mid: item._id,
            w: item.watched ? '1' : '0',
        });
        if (item.poster) params.set('p', item.poster);
        navigate(`/items/${collectionType}/${item.itemId}?${params.toString()}`);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = items.findIndex(i => i._id === active.id);
        const newIndex = items.findIndex(i => i._id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const next = arrayMove(items, oldIndex, newIndex);
        setItems(next);
        itemsRef.current = next;
        localStorage.setItem(customOrderKey, JSON.stringify(next.map(i => i._id)));
        if (sortValue !== 'custom') setSortValue('custom');
    };


    /************************************************************
     * Logic for creating a query from the search bar. I received
     * help and direction from this youtube video Web dev simplified
     * https://youtu.be/E1cklb4aeXA
     ***********************************************************/
    const [query, setQuery] = useState(urlQuery);
    const [searchModeActive, setSearchModeActive] = useState(urlQuery.length > 0);
    const searchInputRef = useRef(null);

    const enterSearch = () => {
        setSearchModeActive(true);
        auth.showFooterHandler(false);
    };

    const exitSearch = () => {
        setSearchModeActive(false);
        setQuery('');
        auth.showFooterHandler(true);
        searchInputRef.current?.blur();
    };

    useEffect(() => {
        if (searchModeActive) searchInputRef.current?.focus();
    }, [searchModeActive]);

    // Restore footer on unmount in case the user navigated away while in
    // search mode (which had toggled the footer off).
    useEffect(() => {
        return () => auth.showFooterHandler(true);
    }, [auth]);

    // Q: Why do we use useMemo here?
    // A: useMemo is used to optimize the filtering of items. It will only filter the items
    // when the query changes. This is important because if we didn't use useMemo the items
    // would be filtered on every render. This would be a waste of resources.
    const manageItems = useMemo(() => {
        if (!query) return items;
        return items.filter(i => i.title.toLowerCase().includes(query.toLowerCase()));
    }, [items, query]);

    // collection_items now use UUIDs (post-Mongo), so we trust the
    // server-provided `timestamp` (Unix seconds, derived from added_at).
    const addedAt = (item) => item?.timestamp || 0;

    const sortedItems = useMemo(() => {
        let result = items.filter(i => i.title.toLowerCase().includes(query.toLowerCase()));

        if (filterValue === 'watched')        result = result.filter(i => i.watched);
        else if (filterValue === 'unwatched') result = result.filter(i => !i.watched);

        if (sortValue === 'custom') {
            // items array is already in the user's saved custom order; preserve it
        } else if (sortValue === 'abc') {
            result = [...result].sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortValue === 'zyx') {
            result = [...result].sort((a, b) => b.title.localeCompare(a.title));
        } else if (sortValue === 'oldest') {
            result = [...result].sort((a, b) => addedAt(a) - addedAt(b));
        } else if (sortValue === 'watched') {
            // Recently watched first, never-watched items at the bottom
            // ordered by date added so they're not in arbitrary order.
            result = [...result].sort((a, b) => {
                const ca = a?.completedAt || 0;
                const cb = b?.completedAt || 0;
                if (ca !== cb) return cb - ca;
                return addedAt(b) - addedAt(a);
            });
        } else if (sortValue === 'release-desc' || sortValue === 'release-asc') {
            // Release date sorts lexicographically since releaseDate is
            // a 'YYYY-MM-DD' string from the server (board games store
            // YYYY-01-01 since BGG only gives a year). Items missing a
            // release date fall to the bottom either direction.
            const dir = sortValue === 'release-desc' ? -1 : 1;
            result = [...result].sort((a, b) => {
                const ra = a?.releaseDate || null;
                const rb = b?.releaseDate || null;
                if (!ra && !rb) return addedAt(b) - addedAt(a);
                if (!ra) return 1;
                if (!rb) return -1;
                if (ra !== rb) return ra < rb ? dir : -dir;
                return addedAt(b) - addedAt(a);
            });
        } else if (sortValue === 'rating-desc' || sortValue === 'rating-asc') {
            // Personal rating first, unrated items always at the bottom
            // (ordered by date added) regardless of sort direction —
            // surfacing unrated items at the top of an "ascending" list
            // would defeat the point of asking to see your low-rated stuff.
            const dir = sortValue === 'rating-desc' ? -1 : 1;
            result = [...result].sort((a, b) => {
                const ra = a?.userRating;
                const rb = b?.userRating;
                if (ra == null && rb == null) return addedAt(b) - addedAt(a);
                if (ra == null) return 1;
                if (rb == null) return -1;
                if (ra !== rb) return (ra - rb) * dir;
                return addedAt(b) - addedAt(a);
            });
        } else { /* recent / newest first */
            result = [...result].sort((a, b) => addedAt(b) - addedAt(a));
        }

        return result;
    }, [items, query, sortValue, filterValue]);

    const emptyMessage = (() => {
        if (query !== '') return 'No items match search';
        if (filterValue === 'watched') return (collectionType === 'game' || collectionType === 'board') ? 'No played items' : 'No watched items';
        if (filterValue === 'unwatched') return 'No items in this collection';
        return 'No items in this collection';
    })();

    return (
        <React.Fragment>
            <div className='collection-page'>
                {searchModeActive ? (
                    <div
                        className='collection-search-sticky-header'
                        style={{ borderBottomColor: collectionTypeColor }}
                    >
                        <div
                            className='collection-search-input-wrap'
                            style={{ borderColor: collectionTypeColor }}
                        >
                            <Search size={18} strokeWidth={2} style={{ color: collectionTypeColor }} aria-hidden='true' />
                            <input
                                ref={searchInputRef}
                                className='collection-search-input'
                                type='text'
                                placeholder={collectionName ? `Search ${collectionName}` : 'Search this collection'}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                autoComplete='off'
                            />
                            {query !== '' && (
                                <button
                                    type='button'
                                    className='collection-search-clear'
                                    // onMouseDown preventDefault keeps focus
                                    // on the input so the user can keep
                                    // typing immediately after clearing.
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setQuery('');
                                        searchInputRef.current?.focus();
                                    }}
                                    aria-label='Clear text'
                                    style={{ color: collectionTypeColor }}
                                >
                                    <X size={14} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                        <button
                            type='button'
                            className='collection-search-cancel'
                            onClick={exitSearch}
                            style={{ color: collectionTypeColor }}
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                <div className='collection-sticky-header'>
                    {(() => {
                        const TypeIcon = collectionType === 'movie' ? Clapperboard
                            : collectionType === 'tv' ? RetroTv
                            : collectionType === 'game' ? Gamepad2
                            : Dices;
                        const total = items.length;
                        const watchedCount = items.filter(i => i.watched).length;
                        const noun = collectionType === 'tv' ? 'show'
                            : collectionType === 'movie' ? 'movie'
                            : 'game';
                        const verb = (collectionType === 'game' || collectionType === 'board') ? 'played' : 'watched';
                        const subtitle = total === 0
                            ? 'Empty collection'
                            : `${total} ${noun}${total === 1 ? '' : 's'}${watchedCount > 0 ? ` · ${watchedCount} ${verb}` : ''}`;
                        return (
                            <div className='collection-top-row'>
                                <button className='icon-btn' onClick={navBack} aria-label='Back'>
                                    <ArrowLeft size={22} strokeWidth={2.5} />
                                </button>
                                <div className='collection-title-block' data-ready={!isLoading}>
                                    <div className='collection-title-row'>
                                        <TypeIcon size={22} strokeWidth={1.75} color={collectionTypeColor} />
                                        <h2 className={`collection-title color-${collectionType}`}>{collectionName}</h2>
                                    </div>
                                    <p className='collection-subtitle'>{subtitle}</p>
                                </div>
                                <div className='collection-top-row-right'>
                                    {isEdit ? (
                                        <button className='icon-btn' onClick={exitManage} aria-label='Done'>
                                            <Check size={24} strokeWidth={3} />
                                        </button>
                                    ) : (
                                        <button className='icon-btn' onClick={openKebab} aria-label='More'>
                                            <MoreVertical size={22} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
                )}

                {isLoading && (
                    <div className='collection-loading'>
                        <Loading color={collectionTypeColor} type='beat' size={20} />
                    </div>
                )}

                {!isLoading && isEdit && (
                    manageItems.length === 0 ? (
                        <div className='collection-empty'>
                            {query !== '' ? 'No items match search' : 'No items in this collection'}
                        </div>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={manageItems.map(i => i._id)} strategy={verticalListSortingStrategy}>
                                <div className='manage-list'>
                                    {manageItems.map(item => (
                                        <ManageItemRow key={item._id} item={item} onRemove={removeItem} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )
                )}

                {!isLoading && !isEdit && sortedItems.length === 0 && (
                    <div className='collection-empty'>{emptyMessage}</div>
                )}

                {/* Always render the grid when items are available, even
                    while isLoading is true — visibility:hidden keeps it in
                    layout (so scroll positions are computable) without
                    showing it under the loader. The loading effect flips
                    it visible right after the scroll-into-view jump. */}
                {!isEdit && sortedItems.length > 0 && (
                    <div
                        className='collection-grid'
                        style={{
                            gridTemplateColumns: `repeat(${viewValue}, minmax(0, 1fr))`,
                            visibility: isLoading ? 'hidden' : 'visible',
                        }}
                    >
                        {sortedItems.map(item => (
                            <div
                                className='collection-item'
                                id={item.itemId}
                                key={item.itemId}
                                onClick={() => openDetails(item)}
                            >
                                <PlaceholderImg
                                    voted={null}
                                    finished={null}
                                    alt={`${item.title} poster`}
                                    collectionColor={collectionTypeColor}
                                    classNames='collection-item-img'
                                    src={item.poster}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {!isEdit && !searchModeActive && (
                    <button
                        type='button'
                        className='floating-filter'
                        onClick={openSort}
                        aria-label='Sort and filter'
                        style={{ color: collectionTypeColor }}
                    >
                        <SlidersHorizontal size={20} strokeWidth={2.5} />
                        {isFiltering && (
                            <span className='floating-filter-badge' style={{ backgroundColor: collectionTypeColor }} />
                        )}
                    </button>
                )}

                {!isEdit && !searchModeActive && (
                    <button
                        type='button'
                        className='floating-search-btn'
                        onClick={enterSearch}
                        aria-label='Search'
                        style={{ color: collectionTypeColor }}
                    >
                        <Search size={20} strokeWidth={2.5} />
                    </button>
                )}
            </div>
            <Menu
                anchorEl={kebabAnchor}
                open={Boolean(kebabAnchor)}
                onClose={closeKebab}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ className: 'collection-menu-paper' }}
            >
                <MenuItem onClick={handleRename} className='collection-menu-item'>
                    <Pencil size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Rename
                </MenuItem>
                <MenuItem onClick={handleManage} className='collection-menu-item'>
                    <ListOrdered size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Manage items
                </MenuItem>
                <MenuItem onClick={handleShare} className='collection-menu-item'>
                    <Share2 size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Share code
                </MenuItem>
                <MenuItem onClick={handleMembers} className='collection-menu-item'>
                    <Users size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Members
                </MenuItem>
                <MenuItem onClick={handleDelete} className='collection-menu-item collection-menu-item-danger'>
                    <Trash size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Delete
                </MenuItem>
            </Menu>

            <SortFilterPanel
                anchorEl={sortAnchor}
                open={Boolean(sortAnchor)}
                onClose={closeSort}
                sortOptions={sortOptions}
                sortValue={sortValue}
                onSortChange={setSortValue}
                filterOptions={filterOptions}
                filterValue={filterValue}
                onFilterChange={setFilterValue}
                viewOptions={viewOptions}
                viewValue={viewValue}
                onViewChange={handleViewChange}
                activeColor={collectionTypeColor}
            />

            <Dialog
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Share this collection</h3>
                    <p className='cc-dialog-subtitle'>Send this code to someone you'd like to share with:</p>
                    <div className='share-code-display'>{shareCode}</div>
                    <button
                        type='button'
                        className='cc-dialog-btn cc-dialog-btn-primary'
                        style={{ background: collectionTypeColor, marginTop: 4 }}
                        onClick={handleCopyCode}
                    >
                        {copied ? 'Copied!' : 'Copy code'}
                    </button>
                </div>
            </Dialog>

            <Dialog
                open={membersOpen}
                onClose={() => setMembersOpen(false)}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Members</h3>
                    {members === null && (
                        <div className='members-loading'>
                            <Loading color={collectionTypeColor} type='beat' size={20} />
                        </div>
                    )}
                    {members && members.length === 0 && (
                        <p className='cc-dialog-subtitle'>No members found.</p>
                    )}
                    {members && members.length > 0 && (
                        <ul className='members-list'>
                            {members.map(m => (
                                <li key={m.id} className='members-row'>
                                    <span className='members-name'>{m.username}</span>
                                    {m.isOwner && (
                                        <span
                                            className='members-badge'
                                            style={{ backgroundColor: collectionTypeColor }}
                                        >
                                            Owner
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className='cc-dialog-actions'>
                        <button
                            type='button'
                            className='cc-dialog-btn cc-dialog-btn-secondary'
                            onClick={() => setMembersOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                open={renameOpen}
                onClose={handleRenameCancel}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Rename collection</h3>
                    <input
                        className='cc-dialog-input'
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSave(); }}
                        autoFocus
                    />
                    <div className='cc-dialog-actions'>
                        <button type='button' className='cc-dialog-btn cc-dialog-btn-secondary' onClick={handleRenameCancel}>Cancel</button>
                        <button
                            type='button'
                            className='cc-dialog-btn cc-dialog-btn-primary'
                            style={{ background: collectionTypeColor }}
                            onClick={handleRenameSave}
                            disabled={!renameDraft.trim() || renameDraft.trim() === collectionName}
                        >
                            Save
                        </button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                open={deleteOpen}
                onClose={handleDeleteCancel}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Delete collection?</h3>
                    <p className='cc-dialog-subtitle'>
                        This will permanently delete <strong>{collectionName}</strong> and all its items. This cannot be undone.
                    </p>
                    <input
                        className='cc-dialog-input'
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && deleteConfirm === 'DELETE') handleDeleteConfirm(); }}
                        placeholder='DELETE'
                        autoFocus
                    />
                    <p className='cc-dialog-hint'>Type <strong>DELETE</strong> to confirm.</p>
                    <div className='cc-dialog-actions'>
                        <button type='button' className='cc-dialog-btn cc-dialog-btn-secondary' onClick={handleDeleteCancel}>Cancel</button>
                        <button
                            type='button'
                            className='cc-dialog-btn cc-dialog-btn-danger'
                            onClick={handleDeleteConfirm}
                            disabled={deleteConfirm !== 'DELETE'}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    );
}

export default Collection;