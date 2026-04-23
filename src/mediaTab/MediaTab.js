import React, { useContext, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../shared/config';
import { useNavigate, useParams } from 'react-router-dom';
import { MoreVertical, Check, Plus, GripVertical, User } from 'lucide-react';
import { Dialog, Menu, MenuItem } from '@mui/material';

import SegmentedToggle from '../shared/components/SegmentedToggle/SegmentedToggle';
import Collections from '../collections/pages/Collections';
import Discover from './Discover';
import Button from '../shared/components/FormElements/Button';
import { AuthContext } from '../shared/context/auth-context';

import './MediaTab.css';

const TYPE_CONFIG = {
    movie: { title: 'Movies',      color: '#FCB016' },
    tv:    { title: 'TV Shows',    color: '#F04C53' },
    game:  { title: 'Video Games', color: '#2482C5' },
    board: { title: 'Board Games', color: '#45B859' },
};

const VIEW_OPTIONS = [
    { value: 'discover', label: 'Discover' },
    { value: 'collections', label: 'Collections' },
];

const VIEW_STORAGE_KEY = 'choice-champ:tab-view';

const getSavedView = (type) => {
    try {
        const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || '{}');
        return saved[type] === 'collections' ? 'collections' : 'discover';
    } catch {
        return 'discover';
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

const MediaTab = () => {
    const { type } = useParams();
    const navigate = useNavigate();
    const auth = useContext(AuthContext);
    const config = TYPE_CONFIG[type] || { title: type, color: '#FCB016' };
    const orderKey = `choice-champ:collections-order:${type}`;

    const [view, setView] = useState(() => getSavedView(type));
    const [collections, setCollections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReorder, setIsReorder] = useState(false);

    const [kebabAnchor, setKebabAnchor] = useState(null);
    const openKebab = (e) => setKebabAnchor(e.currentTarget);
    const closeKebab = () => setKebabAnchor(null);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [nameError, setNameError] = useState(false);
    const [nameErrorText, setNameErrorText] = useState('');
    const [joinError, setJoinError] = useState('');
    const inputCollectionRef = useRef();
    const inputJoinRef = useRef();

    useEffect(() => {
        auth.showFooterHandler(true);
    }, [auth]);

    useEffect(() => {
        setIsLoading(true);
        fetch(`${BACKEND_URL}/collections/${type}/${auth.userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        })
            .then(res => res.json())
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
            });
    }, [auth.userId, type, orderKey]);

    const handleViewChange = (newView) => {
        setView(newView);
        persistView(type, newView);
    };

    const handleNewCollection = () => {
        setDialogOpen(true);
        closeKebab();
    };

    const handleGoToProfile = () => {
        closeKebab();
        navigate('/profile');
    };

    const handleReorderStart = () => {
        setIsReorder(true);
        setView('collections');
        persistView(type, 'collections');
        closeKebab();
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
        fetch(`${BACKEND_URL}/collections/${auth.userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: nameValue, type }),
        })
            .then(res => res.json())
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
        fetch(`${BACKEND_URL}/collections/join/${codeValue}/${type}/${auth.userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        })
            .then(res => res.json())
            .then(data => {
                if (data.errMsg) {
                    setJoinError(data.errMsg);
                    return;
                }
                setCollections(prev => [...prev, data.collection]);
                handleCloseDialog();
            })
            .catch(err => console.log(err));
    };

    const handleReorder = (newOrder) => {
        setCollections(newOrder);
        try {
            localStorage.setItem(orderKey, JSON.stringify(newOrder.map(c => c._id)));
        } catch {}
    };

    return (
        <div className='media-tab'>
            <div className='media-tab-sticky-header'>
                <div className='media-tab-top-row'>
                    {isReorder ? (
                        <button className='icon-btn' onClick={exitReorder} aria-label='Done'>
                            <Check size={24} strokeWidth={3} />
                        </button>
                    ) : (
                        <button className='icon-btn' onClick={openKebab} aria-label='More'>
                            <MoreVertical size={22} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
                <h1 className='media-tab-title' style={{ color: config.color }}>{config.title}</h1>
                {!isReorder && (
                    <SegmentedToggle
                        options={VIEW_OPTIONS}
                        value={view}
                        onChange={handleViewChange}
                        activeColor={config.color}
                    />
                )}
            </div>

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
                    <Discover collectionType={type} color={config.color} />
                ) : (
                    <Collections
                        collections={collections}
                        isLoading={isLoading}
                        color={config.color}
                    />
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
                <MenuItem onClick={handleGoToProfile} className='collection-menu-item'>
                    <User size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Profile
                </MenuItem>
                {view === 'collections' && (
                    <MenuItem onClick={handleNewCollection} className='collection-menu-item'>
                        <Plus size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                        New collection
                    </MenuItem>
                )}
                {view === 'collections' && (
                    <MenuItem onClick={handleReorderStart} className='collection-menu-item'>
                        <GripVertical size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                        Reorder
                    </MenuItem>
                )}
            </Menu>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth='lg'>
                <div className='dialog-content'>
                    <div className='dialog-sub-content'>
                        <input
                            className='text-input'
                            type='text'
                            placeholder='collection name'
                            ref={inputCollectionRef}
                        />
                        <Button backgroundColor={config.color} onClick={handleAddCollection}>Create Collection</Button>
                        {nameError && <p className='error' style={{ textAlign: 'center' }}>{nameErrorText}</p>}
                        <p className='or'>OR</p>
                        <input
                            className='text-input'
                            type='number'
                            min={10000}
                            max={99999}
                            placeholder='share code'
                            ref={inputJoinRef}
                        />
                        <Button backgroundColor={config.color} onClick={handleJoinCollection}>Join Collection</Button>
                        <p className='error' style={{ textAlign: 'center' }}>{joinError}</p>
                    </div>
                </div>
            </Dialog>
        </div>
    );
};

export default MediaTab;
