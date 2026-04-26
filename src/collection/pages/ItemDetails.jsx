import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Info, Plus } from 'lucide-react';
import { Popover } from '@mui/material';
import Showdown from 'showdown';

import Loading from '../../shared/components/Loading';
import { AuthContext } from '../../shared/context/auth-context';
import { BACKEND_URL } from '../../shared/config';
import { api } from '../../shared/lib/api';
import { broadcast } from '../../shared/lib/realtime';
import './ItemDetails.css';

const TYPE_COLORS = {
    movie: '#FCB016',
    tv:    '#F04C53',
    game:  '#2482C5',
    board: '#45B859',
};

const ItemDetails = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const { type: collectionType, itemId } = useParams();
    const [searchParams] = useSearchParams();
    // Poster URL passed from the source view (Discover or Collection grid)
    // so the detail view displays exactly what the user just tapped on,
    // sidestepping any TMDB poster-path drift between endpoints.
    const passedPoster = searchParams.get('p') || null;

    const color = TYPE_COLORS[collectionType] || '#FCB016';
    const isPlayed = collectionType === 'game' || collectionType === 'board';
    const watchedLabel = isPlayed ? 'Played' : 'Watched';
    const unwatchedLabel = isPlayed ? 'Unplayed' : 'Unwatched';

    const [globallyWatched, setGloballyWatched] = useState(false);
    const [details, setDetails] = useState({});
    const [providers, setProviders] = useState({});
    const [collectionList, setCollectionList] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [loadingCollections, setLoadingCollections] = useState(false);
    const [hintAnchor, setHintAnchor] = useState(null);

    // Fetch the user's global watched/played status for this item.
    useEffect(() => {
        if (!itemId) return;
        let cancelled = false;
        api(`/user/watched/${collectionType}/${itemId}`)
            .then(data => { if (!cancelled) setGloballyWatched(Boolean(data?.completed)); })
            .catch(err => console.log(err));
        return () => { cancelled = true; };
    }, [collectionType, itemId]);

    useEffect(() => {
        auth.showFooterHandler(false);
        return () => auth.showFooterHandler(true);
    }, [auth]);

    useEffect(() => {
        if(!itemId) return;
        let cancelled = false;
        setLoadingDetails(true);
        setLoadingCollections(true);

        fetch(`${BACKEND_URL}/media/getInfo/${collectionType}/${itemId}`)
            .then(res => res.json())
            .then(data => {
                if(cancelled) return;
                if(collectionType === 'board') {
                    data.media.details.overview = new Showdown.Converter().makeHtml(data.media.details.overview);
                }
                if(collectionType === 'game') {
                    data.media.details.title = data.media.details.name;
                    data.media.details.name = undefined;
                }
                setDetails(data.media.details);
                if(collectionType === 'movie' || collectionType === 'tv') {
                    setProviders(data.media.providers);
                } else if(collectionType === 'game') {
                    setProviders({ platforms: data.media.providers.platforms });
                } else {
                    setProviders({});
                }
                setLoadingDetails(false);
            })
            .catch(err => {
                console.log(err);
                if(!cancelled) setLoadingDetails(false);
            });

        api(`/collections/collectionList/${collectionType}/${itemId}/${auth.userId}`)
            .then(data => {
                if(cancelled) return;
                setCollectionList([...data.collections]);
                setLoadingCollections(false);
            })
            .catch(err => {
                console.log(err);
                if(!cancelled) setLoadingCollections(false);
            });

        return () => { cancelled = true; };
    }, [itemId, collectionType, auth.userId]);

    const addToCollection = (addCollectionId, index) => {
        let tempId = itemId;
        if(collectionType !== 'board' && collectionType !== 'game') {
            tempId = parseInt(tempId);
        }
        // Prefer the poster the user actually saw and tapped on (passedPoster)
        // so the stored item matches the grid's image. Falls back to the
        // fetched detail poster only when the page was opened directly.
        const posterToStore = passedPoster || details.poster;
        api(`/collections/items/${addCollectionId}`, {
            method: 'POST',
            body: JSON.stringify([{ title: details.title, id: tempId, poster: posterToStore }])
        })
        .then(data => {
            const newItem = data.newItems[0];
            setCollectionList(prev => {
                const next = [...prev];
                if(next[index]) {
                    next[index].itemId = newItem._id;
                    next[index].complete = false;
                }
                return next;
            });
            broadcast(`collection:${addCollectionId}`, 'add', { item: newItem });
        })
        .catch(err => console.log(err));
    };

    const removeFromCollection = (removeCollectionId, removeItemId) => {
        api(`/collections/items/${removeCollectionId}/${removeItemId}`, { method: 'DELETE' })
            .then(() => broadcast(`collection:${removeCollectionId}`, 'remove', { id: removeItemId }))
            .catch(err => console.log(err));
    };

    const toggleCollection = (collection, index) => {
        const next = [...collectionList];
        if(collection.exists) {
            next[index] = { ...next[index], exists: false, complete: false };
            removeFromCollection(collection.collectionId, collection.itemId);
        } else {
            next[index] = { ...next[index], exists: true };
            addToCollection(collection.collectionId, index);
        }
        setCollectionList(next);
    };

    // Per-collection completion toggle on the My Collections row.
    // Updates collection_items.complete (group-shared) and broadcasts so
    // other members watching the collection see the change live.
    const toggleCollectionComplete = (collection, index) => {
        if (!collection.exists || !collection.itemId) return;
        const nextComplete = !collection.complete;
        setCollectionList(prev => {
            const arr = [...prev];
            arr[index] = { ...arr[index], complete: nextComplete };
            return arr;
        });
        api(`/collections/items/${collection.collectionId}/${collection.itemId}`, {
            method: 'POST',
            body: JSON.stringify({ watched: nextComplete })
        })
        .then(() => broadcast(`collection:${collection.collectionId}`, 'watched', { id: collection.itemId }))
        .catch(err => {
            console.log(err);
            // Roll back optimistic update on failure.
            setCollectionList(prev => {
                const arr = [...prev];
                if (arr[index]) arr[index] = { ...arr[index], complete: !nextComplete };
                return arr;
            });
        });
    };

    // Global watched/played toggle (per-user, across all collections).
    const toggleGlobalWatched = () => {
        const next = !globallyWatched;
        setGloballyWatched(next);
        api(`/user/watched/${collectionType}/${itemId}`, {
            method: 'POST',
            body: JSON.stringify({ completed: next })
        }).catch(err => {
            console.log(err);
            setGloballyWatched(!next);
        });
    };

    const isLoading = loadingDetails || loadingCollections;

    const infoRows = [];
    if(collectionType === 'movie') {
        infoRows.push({ label: 'Runtime', value: details.runtime > 0 ? `${details.runtime} minute${details.runtime === 1 ? '' : 's'}` : 'N/A' });
        infoRows.push({ label: 'Rating', value: details.rating != null ? `${details.rating} / 10` : 'N/A' });
    } else if(collectionType === 'tv') {
        infoRows.push({ label: 'Seasons', value: details.runtime > 0 ? `${details.runtime} season${details.runtime === 1 ? '' : 's'}` : 'N/A' });
        infoRows.push({ label: 'Rating', value: details.rating != null ? `${details.rating} / 10` : 'N/A' });
    } else if(collectionType === 'game') {
        infoRows.push({ label: 'Avg Playtime', value: details.runtime > 0 ? `${details.runtime} hour${details.runtime === 1 ? '' : 's'}` : 'N/A' });
        infoRows.push({ label: 'Rating', value: details.rating != null ? `${details.rating} / 10` : 'N/A' });
    } else if(collectionType === 'board') {
        infoRows.push({ label: 'Play Time', value: details.runtime ? `${details.runtime} minute${details.runtime === '1' || details.runtime === 1 ? '' : 's'}` : 'N/A' });
        infoRows.push({ label: 'Players', value: (details.minPlayers && details.maxPlayers) ? `${details.minPlayers}–${details.maxPlayers}` : 'N/A' });
    }

    return (
        <div className='content item-details-page'>
            <div className='item-details-topbar'>
                <button className='icon-btn' onClick={() => navigate(-1)} aria-label='Back'>
                    <ArrowLeft size={22} strokeWidth={1.75} />
                </button>
            </div>

            {isLoading ? (
                <div className='item-details-loading'>
                    <Loading color={color} type='beat' size={20} />
                </div>
            ) : (
                <React.Fragment>
                    {(passedPoster || details.poster) && (
                        <div className='item-details-poster-wrap'>
                            <img
                                className='item-details-poster'
                                src={passedPoster || details.poster}
                                alt={`${details.title} poster`}
                            />
                        </div>
                    )}
                    <h1 className='item-details-title' style={{ color }}>{details.title}</h1>

                    <section className='item-details-section'>
                        <div className='item-details-card'>
                            <div className='item-details-row item-details-watched-row'>
                                <span className='item-details-row-label'>Status</span>
                                <div className='item-details-watched-control'>
                                    <span className='item-details-watched-state'>
                                        {globallyWatched ? watchedLabel : unwatchedLabel}
                                    </span>
                                    <button
                                        type='button'
                                        role='switch'
                                        aria-checked={globallyWatched}
                                        aria-label={`Toggle ${watchedLabel.toLowerCase()}`}
                                        className={`item-details-watched-switch ${globallyWatched ? 'is-on' : ''}`}
                                        style={globallyWatched ? { backgroundColor: color } : undefined}
                                        onClick={toggleGlobalWatched}
                                    >
                                        <span className='item-details-watched-knob' />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {infoRows.length > 0 && (
                        <section className='item-details-section'>
                            <div className='item-details-card'>
                                {infoRows.map(({ label, value }) => (
                                    <div key={label} className='item-details-row'>
                                        <span className='item-details-row-label'>{label}</span>
                                        <span className='item-details-row-value'>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {collectionList.length > 0 && (
                        <section className='item-details-section'>
                            <div className='item-details-section-header'>
                                <h2 className='item-details-section-title'>My Collections</h2>
                                <button
                                    type='button'
                                    className='item-details-section-hint-button'
                                    onClick={(e) => setHintAnchor(e.currentTarget)}
                                    aria-label={`What does the ${watchedLabel.toLowerCase()} toggle do?`}
                                >
                                    <span className='item-details-section-hint'>{watchedLabel}</span>
                                    <Info size={14} strokeWidth={2} className='item-details-section-hint-icon' />
                                </button>
                            </div>
                            <Popover
                                open={Boolean(hintAnchor)}
                                anchorEl={hintAnchor}
                                onClose={() => setHintAnchor(null)}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                                PaperProps={{ className: 'item-details-hint-paper' }}
                            >
                                <p className='item-details-hint-text'>
                                    Tracks whether this item has been {watchedLabel.toLowerCase()} within the specific collection. Visible to everyone who shares that collection.
                                </p>
                            </Popover>
                            <div className='item-details-card'>
                                {collectionList.map((collection, index) => (
                                    <div key={collection.collectionId} className='item-details-collection-row'>
                                        <button
                                            type='button'
                                            className='item-details-collection-toggle'
                                            onClick={() => toggleCollection(collection, index)}
                                            aria-label={collection.exists ? `Remove from ${collection.name}` : `Add to ${collection.name}`}
                                        >
                                            {collection.exists ? (
                                                <span className='item-details-collection-checked' style={{ backgroundColor: color }}>
                                                    <Check size={14} strokeWidth={3} color='#111' />
                                                </span>
                                            ) : (
                                                <span className='item-details-collection-plus'>
                                                    <Plus size={16} strokeWidth={2.5} />
                                                </span>
                                            )}
                                        </button>
                                        <span className='item-details-collection-name'>{collection.name}</span>
                                        {collection.exists && (
                                            <button
                                                type='button'
                                                role='switch'
                                                aria-checked={collection.complete}
                                                aria-label={`Toggle ${watchedLabel.toLowerCase()} for ${collection.name}`}
                                                className={`item-details-watched-switch ${collection.complete ? 'is-on' : ''}`}
                                                style={collection.complete ? { backgroundColor: color } : undefined}
                                                onClick={() => toggleCollectionComplete(collection, index)}
                                            >
                                                <span className='item-details-watched-knob' />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {details.overview && (
                        <section className='item-details-section'>
                            <h2 className='item-details-section-title'>Overview</h2>
                            <div className='item-details-card item-details-overview-card'>
                                <div
                                    className='item-details-overview'
                                    dangerouslySetInnerHTML={{ __html: details.overview || '' }}
                                />
                            </div>
                        </section>
                    )}

                    {(collectionType === 'movie' || collectionType === 'tv') && (
                        <section className='item-details-section'>
                            <h2 className='item-details-section-title'>Stream</h2>
                            <div className='item-details-card'>
                                {providers.stream ? (
                                    <div className='item-details-providers'>
                                        {providers.stream.map(provider => (
                                            <img
                                                key={provider.provider_name}
                                                className='item-details-provider'
                                                src={`https://image.tmdb.org/t/p/w500${provider.logo_path}`}
                                                alt={provider.provider_name}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className='item-details-none'>Not available to stream</div>
                                )}
                            </div>
                        </section>
                    )}

                    {collectionType === 'game' && providers.platforms && (
                        <section className='item-details-section'>
                            <h2 className='item-details-section-title'>Platforms</h2>
                            <div className='item-details-card'>
                                <div className='item-details-platforms'>
                                    {providers.platforms.map(p => p.name).join(', ')}
                                </div>
                            </div>
                        </section>
                    )}
                </React.Fragment>
            )}
        </div>
    );
};

export default ItemDetails;
