import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle } from 'lucide-react';
import Showdown from 'showdown';

import Loading from '../../shared/components/Loading';
import { AuthContext } from '../../shared/context/auth-context';
import { BACKEND_URL } from '../../shared/config';
import { api } from '../../shared/lib/api';
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
    const collectionId = searchParams.get('cid');
    const mongoItemId = searchParams.get('mid');
    const initialWatched = searchParams.get('w') === '1';

    const color = TYPE_COLORS[collectionType] || '#FCB016';
    const isPlayed = collectionType === 'game' || collectionType === 'board';
    const watchedLabel = isPlayed ? 'Played' : 'Watched';
    const unwatchedLabel = isPlayed ? 'Unplayed' : 'Unwatched';

    const [watched, setWatched] = useState(initialWatched);
    const [details, setDetails] = useState({});
    const [providers, setProviders] = useState({});
    const [collectionList, setCollectionList] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [loadingCollections, setLoadingCollections] = useState(false);

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
        api(`/collections/items/${addCollectionId}`, {
            method: 'POST',
            body: JSON.stringify([{ title: details.title, id: tempId, poster: details.poster }])
        })
        .then(data => {
            setCollectionList(prev => {
                const next = [...prev];
                if(next[index]) next[index].itemId = data.newItems[0]._id;
                return next;
            });
        })
        .catch(err => console.log(err));
    };

    const removeFromCollection = (removeCollectionId, removeItemId) => {
        api(`/collections/items/${removeCollectionId}/${removeItemId}`, { method: 'DELETE' })
            .catch(err => console.log(err));
    };

    const toggleCollection = (collection, index) => {
        const next = [...collectionList];
        if(collection.exists) {
            next[index].exists = false;
            removeFromCollection(next[index].collectionId, next[index].itemId);
        } else {
            next[index].exists = true;
            addToCollection(next[index].collectionId, index);
        }
        setCollectionList(next);
    };

    const toggleWatched = () => {
        if(!collectionId || !mongoItemId) return;
        const nextWatched = !watched;
        setWatched(nextWatched);
        api(`/collections/items/${collectionId}/${mongoItemId}`, {
            method: 'POST',
            body: JSON.stringify({ watched: nextWatched })
        }).catch(err => console.log(err));
    };

    const hasCollectionContext = Boolean(collectionId && mongoItemId);
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
                    {details.poster && (
                        <div className='item-details-poster-wrap'>
                            <img className='item-details-poster' src={details.poster} alt={`${details.title} poster`} />
                        </div>
                    )}
                    <h1 className='item-details-title' style={{ color }}>{details.title}</h1>

                    {hasCollectionContext && (
                        <section className='item-details-section'>
                            <div className='item-details-card'>
                                <div className='item-details-row item-details-watched-row'>
                                    <span className='item-details-row-label'>Status</span>
                                    <div className='item-details-watched-control'>
                                        <span className='item-details-watched-state'>
                                            {watched ? watchedLabel : unwatchedLabel}
                                        </span>
                                        <button
                                            type='button'
                                            role='switch'
                                            aria-checked={watched}
                                            aria-label={`Toggle ${watchedLabel.toLowerCase()}`}
                                            className={`item-details-watched-switch ${watched ? 'is-on' : ''}`}
                                            style={watched ? { backgroundColor: color } : undefined}
                                            onClick={toggleWatched}
                                        >
                                            <span className='item-details-watched-knob' />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

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

                    {collectionList.length > 0 && (
                        <section className='item-details-section'>
                            <h2 className='item-details-section-title'>My Collections</h2>
                            <div className='item-details-card'>
                                {collectionList.map((collection, index) => (
                                    <button
                                        type='button'
                                        key={collection.collectionId}
                                        className='item-details-collection-row'
                                        onClick={() => toggleCollection(collection, index)}
                                    >
                                        <span className='item-details-collection-name'>{collection.name}</span>
                                        {collection.exists ? (
                                            <span className='item-details-collection-checked' style={{ backgroundColor: color }}>
                                                <Check size={14} strokeWidth={3} color='#111' />
                                            </span>
                                        ) : (
                                            <Circle size={22} strokeWidth={1.5} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </React.Fragment>
            )}
        </div>
    );
};

export default ItemDetails;
