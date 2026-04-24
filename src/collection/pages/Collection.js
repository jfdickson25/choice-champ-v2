import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { BACKEND_URL } from '../../shared/config';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import { ArrowLeft, Check, MoreVertical, Pencil, Share2, ListOrdered, Trash, ArrowDownAZ, ArrowDownZA, ArrowDownWideNarrow, ArrowUpWideNarrow, Eye, Gamepad2, Dices, SlidersHorizontal, Layers, EyeOff, GripVertical, Search, X, Columns2, Columns3, Columns4, Clapperboard } from 'lucide-react';
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

    const [items, setItems] = useState([]);
    const [isEdit, setIsEdit] = useState(false);
    const [shareCode, setShareCode] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [collectionName, setCollectionName] = useState('');
    const [sortValue, setSortValue] = useState(() =>
        localStorage.getItem(`choice-champ:custom-order:${collectionId}`) ? 'custom' : 'recent'
    );
    const [filterValue, setFilterValue] = useState('all');
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

    const openKebab = (e) => setKebabAnchor(e.currentTarget);
    const closeKebab = () => setKebabAnchor(null);
    const openSort = (e) => setSortAnchor(e.currentTarget);
    const closeSort = () => setSortAnchor(null);

    const handleShare = () => { setShareOpen(true); closeKebab(); };
    const handleManage = () => { setIsEdit(true); closeKebab(); };
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
        fetch(`${BACKEND_URL}/collections/${collectionType}/${auth.userId}/${collectionId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        }).then(() => {
            socket.emit('leave-room', collectionId);
            setDeleteOpen(false);
            navigate(`/collections/${collectionType}`);
        });
    };
    const handleRenameCancel = () => setRenameOpen(false);
    const handleRenameSave = () => {
        const trimmed = renameDraft.trim();
        if (!trimmed) return;
        if (trimmed === collectionName) {
            setRenameOpen(false);
            return;
        }
        fetch(`${BACKEND_URL}/collections/name/${collectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmed }),
        }).then(() => {
            setCollectionName(trimmed);
            setRenameOpen(false);
        });
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
        { value: 'custom', label: 'Custom',       icon: GripVertical },
        { value: 'recent', label: 'Date Added ↓', icon: ArrowDownWideNarrow },
        { value: 'oldest', label: 'Date Added ↑', icon: ArrowUpWideNarrow },
        { value: 'abc',    label: 'A–Z',          icon: ArrowDownAZ },
        { value: 'zyx',    label: 'Z–A',          icon: ArrowDownZA },
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

        // Make a fetch get request to get all the items in a collection
        fetch(`${BACKEND_URL}/collections/items/${collectionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            let ordered = data.items;
            const savedOrderRaw = localStorage.getItem(customOrderKey);
            if (savedOrderRaw) {
                try {
                    const savedOrder = JSON.parse(savedOrderRaw);
                    const byId = new Map(data.items.map(i => [i._id, i]));
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

            // Give a little time for the items to load
            setTimeout(() => {
                setIsLoading(false);

                // If there is a hash in the url, scroll to that element
                if(hash) {
                    // Add a little more time for the items to load
                    setTimeout(() => {
                            // If there is a hash in the url, scroll to that element
                            const element = document.getElementById(hash);
                            element.scrollIntoView({ behavior: "smooth" });
                    }, 500);
                }
            }, 500);

            // Join room with the collection id
            socket.emit('join-room', collectionId);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth, collectionId, socket]);

    useEffect(() => {
        socket.on('remove-item', (id) => {
            // Find item with the id and remove it from the list
            itemsRef.current = itemsRef.current.filter(item => item._id !== id);
            setItems(itemsRef.current);
        });

        socket.on('watched-item', (id) => {
            // Update the item with the given id to be watched
            itemsRef.current = itemsRef.current.map(item => {
                if(item._id === id && item.watched === false) {
                    item.watched = true;
                } else if(item._id === id && item.watched === true) {
                    item.watched = false;
                }

                return item;
            });

            setItems(itemsRef.current);
        });

        socket.on('add-item', (newItem) => {
            // Add the new item to the list
            itemsRef.current = [...itemsRef.current, newItem];
            setItems(itemsRef.current);
        });

        return () => {
            socket.off('remove-item');
            socket.off('watched-item');
            socket.off('add-item');
        }
    }, [socket]);

    const exitManage = () => setIsEdit(false);

    const removeItem = (id) => {
        // Make a fetch delete request to remove an item from a collection
        fetch(`${BACKEND_URL}/collections/items/${collectionId}/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            itemsRef.current = itemsRef.current.filter(item => item._id !== id);
            setItems(itemsRef.current);
            // Emit to the server that an item has been removed
            socket.emit('remove-remote-item', id, collectionId);
        });
    }

    const navBack = () => {
        socket.emit('leave-room', collectionId);
        navigate(`/collections/${collectionType}`);
    }

    const openDetails = (item) => {
        const params = new URLSearchParams({
            cid: collectionId,
            mid: item._id,
            w: item.watched ? '1' : '0',
        });
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
    const [query, setQuery] = useState('');

    // Q: Why do we use useMemo here?
    // A: useMemo is used to optimize the filtering of items. It will only filter the items
    // when the query changes. This is important because if we didn't use useMemo the items
    // would be filtered on every render. This would be a waste of resources.
    const manageItems = useMemo(() => {
        if (!query) return items;
        return items.filter(i => i.title.toLowerCase().includes(query.toLowerCase()));
    }, [items, query]);

    const addedAt = (item) => {
        // MongoDB ObjectId: first 8 hex chars encode creation time in seconds.
        // Fall back to item.timestamp (set on watch) for any non-ObjectId shape.
        const id = item && item._id;
        if (typeof id === 'string' && id.length >= 8) {
            const secs = parseInt(id.substring(0, 8), 16);
            if (!Number.isNaN(secs)) return secs;
        }
        return item.timestamp || 0;
    };

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
                <div className='collection-sticky-header'>
                    <div className='collection-top-row'>
                        <button className='icon-btn' onClick={navBack} aria-label='Back'>
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>
                        <div className='collection-top-row-right'>
                            {!isEdit && (
                                <button className='icon-btn sort-btn' onClick={openSort} aria-label='Sort and filter'>
                                    <SlidersHorizontal size={20} strokeWidth={2.5} />
                                    {isFiltering && (
                                        <span className='sort-btn-badge' style={{ backgroundColor: collectionTypeColor }} />
                                    )}
                                </button>
                            )}
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
                            <div className='collection-title-block'>
                                <div className='collection-title-row'>
                                    <TypeIcon size={26} strokeWidth={1.75} color={collectionTypeColor} />
                                    <h2 className={`collection-title color-${collectionType}`}>{collectionName}</h2>
                                </div>
                                <p className='collection-subtitle'>{subtitle}</p>
                            </div>
                        );
                    })()}
                </div>

                {isLoading ? (
                    <div className='collection-loading'>
                        <Loading color={collectionTypeColor} type='beat' size={20} />
                    </div>
                ) : isEdit ? (
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
                ) : sortedItems.length === 0 ? (
                    <div className='collection-empty'>{emptyMessage}</div>
                ) : (
                    <div
                        className='collection-grid'
                        style={{ gridTemplateColumns: `repeat(${viewValue}, minmax(0, 1fr))` }}
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

                <div className='floating-search'>
                    <Search size={18} strokeWidth={2} className='floating-search-icon' aria-hidden='true' />
                    <input
                        className='floating-search-input'
                        placeholder='Search'
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    {query !== '' && (
                        <button
                            type='button'
                            className='floating-search-clear'
                            onClick={() => setQuery('')}
                            aria-label='Clear search'
                            style={{ color: collectionTypeColor }}
                        >
                            <X size={18} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
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
                PaperProps={{ className: 'share-dialog-paper' }}
            >
                <div className='share-dialog'>
                    <h3>Share this collection</h3>
                    <p>Send this code to someone you'd like to share with:</p>
                    <div className='share-code-display'>{shareCode}</div>
                    <button className='share-copy-btn' onClick={handleCopyCode}>
                        {copied ? 'Copied!' : 'Copy code'}
                    </button>
                </div>
            </Dialog>

            <Dialog
                open={renameOpen}
                onClose={handleRenameCancel}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'share-dialog-paper' }}
            >
                <div className='rename-dialog'>
                    <h3>Rename collection</h3>
                    <input
                        className='rename-input'
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSave(); }}
                        autoFocus
                    />
                    <div className='rename-actions'>
                        <button className='rename-cancel-btn' onClick={handleRenameCancel}>Cancel</button>
                        <button
                            className='rename-save-btn'
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
                PaperProps={{ className: 'share-dialog-paper' }}
            >
                <div className='rename-dialog'>
                    <h3>Delete collection?</h3>
                    <p className='delete-warning'>
                        This will permanently delete <strong>{collectionName}</strong> and all its items. This cannot be undone.
                    </p>
                    <p className='delete-instructions'>Type <strong>DELETE</strong> to confirm.</p>
                    <input
                        className='rename-input'
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && deleteConfirm === 'DELETE') handleDeleteConfirm(); }}
                        placeholder='DELETE'
                        autoFocus
                    />
                    <div className='rename-actions'>
                        <button className='rename-cancel-btn' onClick={handleDeleteCancel}>Cancel</button>
                        <button
                            className='delete-confirm-btn'
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