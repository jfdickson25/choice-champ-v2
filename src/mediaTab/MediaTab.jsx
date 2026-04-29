import React, { useContext, useEffect, useRef, useState } from 'react';
import { api } from '../shared/lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Plus, GripVertical, User } from 'lucide-react';
import { Dialog } from '@mui/material';

import SegmentedToggle from '../shared/components/SegmentedToggle/SegmentedToggle';
import Collections from '../collections/pages/Collections';
import Discover from './Discover';
import Button from '../shared/components/FormElements/Button';
import PartyPopperWheel from '../shared/components/Icons/PartyPopperWheel';
import { AuthContext } from '../shared/context/auth-context';
import { getMediaType } from '../shared/lib/mediaTypes';

import './MediaTab.css';

const VIEW_OPTIONS = [
    { value: 'discover', label: 'Discover' },
    { value: 'collections', label: 'Collections' },
];

const VIEW_STORAGE_KEY = 'choice-champ:tab-view';

const getSavedView = (type) => {
    try {
        const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || '{}');
        return saved[type] === 'discover' ? 'discover' : 'collections';
    } catch {
        return 'collections';
    }
};

const persistView = (type, view) => {
    try {
        const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || '{}');
        saved[type] = view;
        localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(saved));
    } catch {
        /* localStorage unavailable — not worth breaking the UI over */
    }
};

// Stub for media types whose API + Discover branches haven't shipped
// yet. Renders the type's title in its color, a "coming soon" message,
// and lets BottomNav stay visible so the user can tab elsewhere. Safe
// to early-return *before* MediaTab's hooks since App.jsx mounts this
// with `key={type}`, so the type never changes within an instance.
const ComingSoonTab = ({ config }) => {
    const auth = useContext(AuthContext);
    useEffect(() => {
        auth.showFooterHandler(true);
    }, [auth]);
    const Icon = config.Icon;
    return (
        <div className='media-tab'>
            <div className='media-tab-coming-soon'>
                {Icon && <Icon size={64} strokeWidth={1.5} color={config.color} />}
                <h1 style={{ color: config.color }}>{config.title}</h1>
                <p>Coming soon.</p>
            </div>
        </div>
    );
};

const MediaTabFull = ({ type, config }) => {
    const navigate = useNavigate();
    const auth = useContext(AuthContext);
    const orderKey = `choice-champ:collections-order:${type}`;

    const [view, setView] = useState(() => getSavedView(type));
    const [collections, setCollections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReorder, setIsReorder] = useState(false);
    const [isDiscoverSearching, setIsDiscoverSearching] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [nameError, setNameError] = useState(false);
    const [nameErrorText, setNameErrorText] = useState('');
    const [joinError, setJoinError] = useState('');
    const inputCollectionRef = useRef();
    const inputJoinRef = useRef();

    // Footer state when the Collections view is showing — Discover
    // owns the footer state for itself (it hides while searching).
    // Skipping this when view === 'discover' avoids the parent-after-
    // child effect order race: an unconditional showFooterHandler(true)
    // here would otherwise overwrite Discover's hidden-while-searching
    // call on every remount (e.g. back-from-ItemDetails into a search).
    useEffect(() => {
        if (view !== 'discover') auth.showFooterHandler(true);
    }, [auth, view]);

    useEffect(() => {
        setIsLoading(true);
        api(`/collections/${type}/${auth.userId}`)
            .then(data => {
                let ordered = Array.isArray(data.collections) ? data.collections : [];
                const savedOrderRaw = localStorage.getItem(orderKey);
                if (savedOrderRaw) {
                    try {
                        const savedOrder = JSON.parse(savedOrderRaw);
                        const byId = new Map(ordered.map(c => [c._id, c]));
                        const result = [];
                        for (const id of savedOrder) {
                            const c = byId.get(id);
                            if (c) { result.push(c); byId.delete(id); }
                        }
                        for (const c of byId.values()) result.push(c);
                        ordered = result;
                    } catch {}
                }
                setCollections(ordered);
                setIsLoading(false);
            })
            .catch(err => {
                console.log(err);
                setIsLoading(false);
            });
    }, [auth.userId, type, orderKey]);

    const handleViewChange = (newView) => {
        setView(newView);
        persistView(type, newView);
    };

    const handleNewCollection = () => {
        setDialogOpen(true);
    };

    const handleReorderStart = () => {
        setIsReorder(true);
        setView('collections');
        persistView(type, 'collections');
    };

    const exitReorder = () => setIsReorder(false);

    const handleCloseDialog = () => {
        if (inputCollectionRef.current) inputCollectionRef.current.value = '';
        if (inputJoinRef.current) inputJoinRef.current.value = '';
        setNameError(false);
        setJoinError('');
        setDialogOpen(false);
    };

    const handleAddCollection = () => {
        const nameValue = inputCollectionRef.current?.value || '';
        if (nameValue === '') {
            setNameError(true);
            setNameErrorText('Collection must have a name');
            return;
        }
        if (collections.find(c => c.name === nameValue)) {
            setNameError(true);
            setNameErrorText('Collection with that name already exists');
            return;
        }
        api(`/collections/${auth.userId}`, {
            method: 'POST',
            body: JSON.stringify({ name: nameValue, type }),
        })
            .then(data => {
                setCollections(prev => [...prev, data.collection]);
            })
            .catch(err => console.log(err));

        handleCloseDialog();
    };

    const handleJoinCollection = () => {
        const codeValue = inputJoinRef.current?.value || '';
        if (codeValue.length !== 5) {
            setJoinError('Code must be 5 digits long');
            return;
        }
        api(`/collections/join/${codeValue}/${type}/${auth.userId}`)
            .then(data => {
                setCollections(prev => [...prev, data.collection]);
                handleCloseDialog();
            })
            .catch(err => {
                setJoinError(err.message || 'Unable to join collection');
            });
    };

    const handleReorder = (newOrder) => {
        setCollections(newOrder);
        try {
            localStorage.setItem(orderKey, JSON.stringify(newOrder.map(c => c._id)));
        } catch {}
    };

    return (
        <div className='media-tab'>
            {!isDiscoverSearching && (
            <div className='media-tab-sticky-header'>
                <div className='media-tab-top-row'>
                    <button className='icon-btn' onClick={() => navigate('/profile')} aria-label='Profile'>
                        <User size={22} strokeWidth={2} />
                    </button>
                    <div className='media-tab-title-block'>
                        {config.Icon && <config.Icon size={30} strokeWidth={1.75} color={config.color} />}
                        <div className='media-tab-title-text'>
                            <h1 className='media-tab-title' style={{ color: config.color }}>{config.title}</h1>
                            {(() => {
                                const count = collections.length;
                                const totalItems = collections.reduce((s, c) => s + (Array.isArray(c.items) ? c.items.length : 0), 0);
                                const text = isLoading
                                    ? ' '
                                    : count === 0
                                        ? 'No collections yet'
                                        : `${count} ${count === 1 ? 'collection' : 'collections'}${totalItems > 0 ? ` · ${totalItems} ${config.noun}${totalItems === 1 ? '' : 's'}` : ''}`;
                                return <p className='media-tab-subtitle' data-ready={!isLoading}>{text}</p>;
                            })()}
                        </div>
                    </div>
                    <button className='icon-btn' onClick={() => navigate('/party')} aria-label='Start a party'>
                        <PartyPopperWheel size={22} strokeWidth={2} />
                    </button>
                </div>
                {!isReorder && (
                    <SegmentedToggle
                        options={VIEW_OPTIONS}
                        value={view}
                        onChange={handleViewChange}
                        activeColor={config.color}
                    />
                )}
            </div>
            )}

            <div className='media-tab-content'>
                {isReorder ? (
                    <Collections
                        collections={collections}
                        isLoading={isLoading}
                        color={config.color}
                        isReorder
                        onReorder={handleReorder}
                    />
                ) : view === 'discover' ? (
                    <Discover
                        key={type}
                        collectionType={type}
                        color={config.color}
                        onSearchingChange={setIsDiscoverSearching}
                    />
                ) : (
                    <Collections
                        collections={collections}
                        isLoading={isLoading}
                        color={config.color}
                    />
                )}
            </div>

            {view === 'collections' && (
                <div className='floating-actions'>
                    <button
                        type='button'
                        className='floating-action'
                        onClick={handleNewCollection}
                        aria-label='New collection'
                        style={{ color: config.color, visibility: isReorder ? 'hidden' : 'visible' }}
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                    {isReorder ? (
                        <button
                            type='button'
                            className='floating-action'
                            onClick={exitReorder}
                            aria-label='Done reordering'
                            style={{ color: config.color }}
                        >
                            <Check size={20} strokeWidth={2.5} />
                        </button>
                    ) : (
                        <button
                            type='button'
                            className='floating-action'
                            onClick={handleReorderStart}
                            aria-label='Reorder collections'
                            style={{ color: config.color }}
                        >
                            <GripVertical size={20} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            )}

            <Dialog
                open={dialogOpen}
                onClose={handleCloseDialog}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Add a Collection</h3>

                    <div className='cc-dialog-section'>
                        <input
                            className='cc-dialog-input'
                            type='text'
                            placeholder='Collection name'
                            ref={inputCollectionRef}
                        />
                        <button
                            type='button'
                            className='cc-dialog-btn cc-dialog-btn-primary'
                            style={{ background: config.color }}
                            onClick={handleAddCollection}
                        >
                            Create Collection
                        </button>
                        {nameError && <p className='cc-dialog-error'>{nameErrorText}</p>}
                    </div>

                    <div className='cc-dialog-divider'>OR</div>

                    <div className='cc-dialog-section'>
                        <input
                            className='cc-dialog-input'
                            type='number'
                            min={10000}
                            max={99999}
                            placeholder='Share code'
                            ref={inputJoinRef}
                        />
                        <button
                            type='button'
                            className='cc-dialog-btn cc-dialog-btn-primary'
                            style={{ background: config.color }}
                            onClick={handleJoinCollection}
                        >
                            Join Collection
                        </button>
                        {joinError && <p className='cc-dialog-error'>{joinError}</p>}
                    </div>
                </div>
            </Dialog>
        </div>
    );
};

// Thin dispatcher: pick the placeholder or the full implementation based
// on whether the type's API has shipped yet. App.jsx mounts this with
// `key={type}`, so the chosen branch is stable for an instance and React
// won't see a hook-order change.
const MediaTab = () => {
    const { type } = useParams();
    const config = getMediaType(type);
    if (config.comingSoon) return <ComingSoonTab config={config} />;
    return <MediaTabFull type={type} config={config} />;
};

export default MediaTab;
