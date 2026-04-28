
import { BACKEND_URL } from '../../shared/config';
import { api } from '../../shared/lib/api';
import { supabase } from '../../shared/lib/supabase';
import React, { useEffect, useState, useRef, useContext }  from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../shared/components/FormElements/Button';
import Confetti from 'react-confetti';
import Loading from '../../shared/components/Loading';
import { AuthContext } from '../../shared/context/auth-context';
import { X, Dices, Flag, Minus, Plus, Star, SlidersHorizontal, Columns2, Columns3, Columns4 } from 'lucide-react';
import SortFilterPanel from '../../shared/components/SortFilterPanel/SortFilterPanel';

import './Party.css';
import PlaceholderImg from '../../shared/components/PlaceholderImg';

const MAX_RUNNER_UPS = 8;

const VIEW_STORAGE_KEY = 'choice-champ:party-view';

const VIEW_OPTIONS = [
    { value: 2, label: '2 columns', icon: Columns2 },
    { value: 3, label: '3 columns', icon: Columns3 },
    { value: 4, label: '4 columns', icon: Columns4 },
];

const COLOR_BY_MEDIA = {
    movie: '#FCB016',
    tv:    '#F04C53',
    game:  '#2482C5',
    board: '#45B859',
};

const Party = () => {
    const auth = useContext(AuthContext);
    let navigate = useNavigate();
    // Get the party code and user type from the url
    const { code } = useParams();

    const [collectionItems, setCollectionItems] = useState([]);
    const [mediaType, setMediaType] = useState('');
    const [votesNeeded, setVotesNeeded] = useState(1);
    const [secretMode, setSecretMode] = useState(false);
    const [superChoiceMode, setSuperChoiceMode] = useState(false);
    const [ready, setReady] = useState(false);
    // State to track the number of users that have clicked the voting finished button
    const [usersReadyCount, setUsersReadyCount] = useState(0);
    // State to track the total number of users in the party, this is grabbed from the backend
    // party object. Users may leave, so if anyone reloads the page, the totalUsers will be reset to
    // an incorrect value.
    const [totalUsers, setTotalUsers] = useState(0);
    const [runnerUps, setRunnerUps] = useState([]);
    const [providers, setProviders] = useState([]);
    const [userType, setUserType] = useState('guest');

    const [slideDown, setSlideDown] = useState(false);
    const [randomSelected, setRandomSelected] = useState(false);
    const [finishEarly, setFinishEarly] = useState(false);
    const [finished, setFinished] = useState(false);

    const [viewValue, setViewValue] = useState(() => {
        const saved = localStorage.getItem(VIEW_STORAGE_KEY);
        const parsed = saved ? parseInt(saved, 10) : 2;
        return [2, 3, 4].includes(parsed) ? parsed : 2;
    });
    const [filterAnchor, setFilterAnchor] = useState(null);

    const handleViewChange = (v) => {
        setViewValue(v);
        localStorage.setItem(VIEW_STORAGE_KEY, String(v));
    };

    const partyColor = COLOR_BY_MEDIA[mediaType] || '#FCB016';

    const collectionPointRef = useRef(collectionItems);
    const votesNeededRef = useRef(votesNeeded);
    const usersReadyCountRef = useRef(usersReadyCount);
    const totalUsersRef = useRef(totalUsers);
    const mediaTypeRef = useRef(mediaType);
    const channelRef = useRef(null);
  
    // Log the collections passed from the previous page using useEffect
    useEffect(() => {
        auth.showFooterHandler(false);
        // Make a fetch request to the backend to get all the collectionItems for the party
        api(`/party/${code}?userId=${auth.userId}`)
        .catch(err => { console.log(err); return null; })
        .then(body => {
            if(!body || !body.party) {
                navigate('/party');
                return;
            }

            if(body.owner) {
                setUserType('owner');
            }

            let items = body.party.items.map(item => {
                return {
                    id: item._id,
                    itemId: item.itemId,
                    title: item.title,
                    poster: item.poster,
                    watched: item.watched,
                    votes: 0,
                    superChoice: false,
                    tempSuperChoice: false,
                    holdSuperChoice: false,
                    voted: false
                }
            });

            // Find if there are any duplicate itemIds and remove them
            items = items.filter((item, index, self) => {
                return index === self.findIndex((t) => (
                    t.itemId === item.itemId
                ));
            });

            // If body.party.IncludeWatched is false then filter out the items that have been watched
            if(!body.party.includeWatched) {
                items = items.filter(item => !item.watched);
            }

            // Randomize the order of the items
            items = items.sort(() => Math.random() - 0.5);

            setMediaType(body.party.mediaType);
            mediaTypeRef.current = body.party.mediaType;
            setSecretMode(body.party.secretMode);
            setSuperChoiceMode(body.party.superChoice);
            setCollectionItems(items);
            collectionPointRef.current = items;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const presenceKey = auth.userId || `guest-${Math.random().toString(36).slice(2, 10)}`;
        const channel = supabase.channel(`party:${code}`, {
            config: { presence: { key: presenceKey }, broadcast: { self: false } },
        });

        channel.on('presence', { event: 'sync' }, () => {
            const count = Object.keys(channel.presenceState()).length;
            setTotalUsers(count);
            totalUsersRef.current = count;
        });

        channel.on('broadcast', { event: 'vote-increment' }, ({ payload }) => {
            const item = collectionPointRef.current.find(i => i.id === payload.id);
            if (!item) return;
            item.votes += 1;
            setCollectionItems([...collectionPointRef.current]);
        });

        channel.on('broadcast', { event: 'vote-decrement' }, ({ payload }) => {
            const item = collectionPointRef.current.find(i => i.id === payload.id);
            if (!item) return;
            item.votes -= 1;
            setCollectionItems([...collectionPointRef.current]);
        });

        channel.on('broadcast', { event: 'votes-needed' }, ({ payload }) => {
            setVotesNeeded(payload.n);
            votesNeededRef.current = payload.n;
        });

        channel.on('broadcast', { event: 'super-choice' }, ({ payload }) => {
            const item = collectionPointRef.current.find(i => i.id === payload.id);
            if (!item) return;
            item.holdSuperChoice = true;
            setCollectionItems([...collectionPointRef.current]);
        });

        channel.on('broadcast', { event: 'remove-super-choice' }, ({ payload }) => {
            const item = collectionPointRef.current.find(i => i.id === payload.id);
            if (!item) return;
            item.holdSuperChoice = false;
            setCollectionItems([...collectionPointRef.current]);
        });

        channel.on('broadcast', { event: 'random-selected' }, async ({ payload }) => {
            const id = payload.id;
            if(ready) {
                setReady(false);
            }

            setRandomSelected(true);

            // Set the rest of the items that are not the random item to be the runner ups
            const runnerUpsTemp = collectionPointRef.current.filter(item => item.id !== id).slice(0, MAX_RUNNER_UPS);
            setRunnerUps(runnerUpsTemp);

            setTimeout(() => {
                setSlideDown(true);
                setTimeout(() => {
                    // Find the item with the id and set it to the state
                    const item = collectionPointRef.current.find(item => item.id === id);

                    // Scroll user back to the top of the page
                    window.scrollTo(0, 0);
                    setRandomSelected(false);

                    // Grab the watch options for the winner but only if the media type is movie or tv
                    if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                        fetch(`${BACKEND_URL}/media/getInfo/${mediaTypeRef.current}/${item.itemId}`,
                        {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => response.json())
                        .then(body => {
                            setProviders(body.media.providers);
                        });
                    }

                    setCollectionItems([item]);
                    collectionPointRef.current = [item];
                }, 2000);
            }, 1000);
        });

        channel.on('broadcast', { event: 'finish-early' }, () => {
            setFinishEarly(true);

            setTimeout(() => {
                setSlideDown(true);
                setFinished(true);
            }, 1500);
        });

        channel.on('broadcast', { event: 'user-ready' }, async () => {
            usersReadyCountRef.current += 1;
            setUsersReadyCount(usersReadyCountRef.current);

            // If the usersReadyCount is equal to the totalUsers then filter all the items that have
            // less votes than the votesNeeded. Reset the votes and voted for all filtered items
            if(usersReadyCountRef.current === totalUsersRef.current) {
                // Filter out the items that have been voted for
                const filteredItems = collectionPointRef.current.filter(item => (item.votes >= votesNeededRef.current || item.holdSuperChoice || item.tempSuperChoice));

                if (filteredItems.length === 0) {
                    alert('No item reached the votes needed. Continue voting.');
                    setReady(false);
                    usersReadyCountRef.current = 0;
                    setUsersReadyCount(usersReadyCountRef.current);
                    return;
                } else {
                    if (filteredItems.length === 1) {
                        // Set runners up to the remaining items
                        const runnerUpsTemp = collectionPointRef.current.filter(item => item.votes < votesNeededRef.current).slice(0, MAX_RUNNER_UPS);
                        setRunnerUps(runnerUpsTemp);

                    }

                    setTimeout(() => {
                        // Set slideDown to true to slide down the ready overlay
                        setSlideDown(true);
                        setTimeout(() => {
                            // Check to make sure there are items left in the collection
                            if (filteredItems.length === 0) {
                                setReady(false);
                                return;
                            } else if(filteredItems.length === 1) {
                                // Scroll user back to the top of the page
                                window.scrollTo(0, 0);

                                // Grab the watch options for the winner but only if the media type is movie or tv
                                if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                                    fetch(`${BACKEND_URL}/media/getInfo/${mediaTypeRef.current}/${filteredItems[0].itemId}`,
                                    {
                                        method: 'GET',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    })
                                    .then(response => response.json())
                                    .then(body => {
                                        setProviders(body.media.providers);
                                    });
                                }
                            } else {
                                // Reset votes and voted for all filtered items
                                filteredItems.forEach(item => {
                                    if(item.tempSuperChoice || item.holdSuperChoice) {
                                        item.superChoice = true;
                                        item.holdSuperChoice = false;
                                        item.tempSuperChoice = false;
                                    }

                                    item.votes = 0;
                                    item.voted = false;
                                });

                                // Scroll user back to the top of the page
                                window.scrollTo(0, 0);

                                setUsersReadyCount(0);
                                usersReadyCountRef.current = 0;
                            }

                            // No matter what set the collection items to the filtered items
                            setCollectionItems(filteredItems);
                            collectionPointRef.current = filteredItems;

                            // Set ready to false whether there is one or more items left in the collection
                            setReady(false);
                            setSlideDown(false);
                        }, 2000);
                    }, 1000);
                }
            }
        });

        channel.on('broadcast', { event: 'user-not-ready' }, () => {
            usersReadyCountRef.current -= 1;
            setUsersReadyCount(usersReadyCountRef.current);
        });

        channel.on('broadcast', { event: 'party-deleted' }, () => {
            navigate('/party');
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') channel.track({ joined_at: new Date().toISOString() });
        });
        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, auth.userId]);

    const changeCount = (id) => {
        // Find the item with the id and increment vote by one and save it to the state
        const item = collectionItems.find(item => item.id === id);
        // Only increment if the user has not voted
        if (item.voted && !item.tempSuperChoice && !item.superChoice) {
            // If superChoice mode is not enabled then decrement the vote count
            // the other else if statements won't hit if superChoice mode is disabled
            // since tempSuperChoice and superChoice will always be false
            if(!superChoiceMode) {
                item.voted = false;
                item.votes -= 1;
                setCollectionItems([...collectionItems]);
                collectionPointRef.current = [...collectionItems];
                channelRef.current?.send({ type: 'broadcast', event: 'vote-decrement', payload: { id } });
            } else {
                item.tempSuperChoice = true;
                setCollectionItems([...collectionItems]);
                collectionPointRef.current = [...collectionItems];
                channelRef.current?.send({ type: 'broadcast', event: 'super-choice', payload: { id } });
            }
        } else if (item.voted && item.superChoice) {
            item.votes -= 1;
            item.voted = false;
            setCollectionItems([...collectionItems]);
            collectionPointRef.current = [...collectionItems];
            channelRef.current?.send({ type: 'broadcast', event: 'vote-decrement', payload: { id } });
        } else if (item.tempSuperChoice && !item.superChoice) {
            item.votes -= 1;
            item.voted = false;
            item.tempSuperChoice = false;
            setCollectionItems([...collectionItems]);
            collectionPointRef.current = [...collectionItems];
            channelRef.current?.send({ type: 'broadcast', event: 'vote-decrement', payload: { id } });
            channelRef.current?.send({ type: 'broadcast', event: 'remove-super-choice', payload: { id } });
        } else {
            item.voted = true;
            item.votes += 1;
            setCollectionItems([...collectionItems]);
            collectionPointRef.current = [...collectionItems];
            channelRef.current?.send({ type: 'broadcast', event: 'vote-increment', payload: { id } });
        }
    }

    const userReady = async () => {
        if(userType === 'owner' && votesNeededRef.current === '') {
            alert('Please enter a number for the votes needed.');
            return;
        } else {
            // Set the user to ready
            setReady(true);
            // Increase usersReadyCount by one
            usersReadyCountRef.current += 1;
            setUsersReadyCount(usersReadyCountRef.current)

            // If the usersReadyCount is equal to the totalUsers then filter all the items that have
            // less votes than the votesNeeded. Reset the votes and voted for all filtered items
            if(usersReadyCountRef.current === totalUsersRef.current) {
                // Filter out the items that have been voted for
                const filteredItems = collectionItems.filter(item => (item.votes >= votesNeededRef.current) || item.holdSuperChoice || item.tempSuperChoice);

                if (filteredItems.length === 0) {
                    alert('No item reached the votes needed. Continue voting.');
                    setReady(false);
                    usersReadyCountRef.current = 0;
                    setUsersReadyCount(usersReadyCountRef.current);
                    // Still emit so other users will be reset
                    channelRef.current?.send({ type: 'broadcast', event: 'user-ready', payload: {} });
                    return;
                } else {
                    if (filteredItems.length === 1) {
                        // Set runners up to the remaining items
                        const runnerUpsTemp = collectionItems.filter(item => item.votes < votesNeededRef.current).slice(0, MAX_RUNNER_UPS);
                        setRunnerUps(runnerUpsTemp);

                    }

                    setTimeout(() => {
                        // Set slideDown to true to slide down the ready overlay
                        setSlideDown(true);
                        setTimeout(() => {
                            if(filteredItems.length === 1) {
                                // Scroll user back to the top of the page
                                window.scrollTo(0, 0);

                                // Make a fetch request to delete the party from the database
                                api(`/party/${code}`, { method: 'DELETE' }).catch(err => console.log(err));

                                // Grab the watch options for the winner but only if the media type is movie or tv
                                if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                                    fetch(`${BACKEND_URL}/media/getInfo/${mediaTypeRef.current}/${filteredItems[0].itemId}`,
                                    {
                                        method: 'GET',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        }
                                    })
                                    .then(response => response.json())
                                    .then(body => {
                                        setProviders(body.media.providers);
                                    });
                                }
                            } else {
                                // Reset votes and voted for all filtered items
                                filteredItems.forEach(item => {
                                    if(item.tempSuperChoice || item.holdSuperChoice) {
                                        item.superChoice = true;
                                        item.tempSuperChoice = false;
                                        item.holdSuperChoice = false;
                                    }

                                    item.votes = 0;
                                    item.voted = false;
                                });

                                // Scroll user back to the top of the page
                                window.scrollTo(0, 0);

                                setUsersReadyCount(0);
                                usersReadyCountRef.current = 0;
                            }

                            setCollectionItems(filteredItems);
                            collectionPointRef.current = filteredItems;

                            setReady(false);
                            setSlideDown(false);
                        }, 2000);
                    }, 1000);
                }
            }

            // Emit event that the user is ready
            channelRef.current?.send({ type: 'broadcast', event: 'user-ready', payload: {} });
        }
    }

    const userNotReady = () => {
        // Set the user to not ready
        setReady(false);

        // Decrease usersReadyCount by one
        usersReadyCountRef.current -= 1;
        setUsersReadyCount(usersReadyCountRef.current);

        channelRef.current?.send({ type: 'broadcast', event: 'user-not-ready', payload: {} });
    }

    const navToParty = async () => {
        if(userType === 'owner' && collectionItems.length > 1) {
            await api(`/party/${code}`, { method: 'DELETE' }).catch(err => console.log(err));
            await channelRef.current?.send({ type: 'broadcast', event: 'party-deleted', payload: {} });
        }
        navigate('/party');
    }

    const selectRandom = async () => {
        // Don't do anything if there is only one item in the collection
        if (collectionItems.length === 1) {
            return;
        }

        setRandomSelected(true);

        // Randomly select on of the items in the collection and remove the rest
        const randomIndex = Math.floor(Math.random() * collectionItems.length);
        const randomItem = collectionItems[randomIndex];
        // Reset votes and voted for all filtered items
        randomItem.votes = 0;
        randomItem.voted = false;

        // Set the rest of the items that are not the random item to be the runner ups
        const runnerUpsTemp = collectionItems.filter(item => item.id !== randomItem.id).slice(0, MAX_RUNNER_UPS);
        setRunnerUps(runnerUpsTemp);

        setTimeout(() => {
            setSlideDown(true);
            setTimeout(() => {
                setCollectionItems([randomItem]);
                collectionPointRef.current = [randomItem];

                // Grab the watch options for the winner but only if the media type is movie or tv
                if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                    fetch(`${BACKEND_URL}/media/getInfo/${mediaTypeRef.current}/${randomItem.itemId}`,
                    {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    })
                    .then(response => response.json())
                    .then(body => {
                        setProviders(body.media.providers);
                    });
                }

                // Scroll user back to the top of the page
                window.scrollTo(0, 0);
                setRandomSelected(false);

                api(`/party/${code}`, { method: 'DELETE' }).catch(err => console.log(err));
            }, 2000);
        }, 1000);

        channelRef.current?.send({ type: 'broadcast', event: 'random-selected', payload: { id: randomItem.id } });
    }

    const selectFlag = () => {
        channelRef.current?.send({ type: 'broadcast', event: 'finish-early', payload: {} });
        setFinishEarly(true);

        setTimeout(() => {
            setSlideDown(true);
            setFinished(true);
        }, 1500);
    }

const isOwnerVoting = userType === 'owner' && collectionItems.length > 1 && !finished;

  return (
    <div className='content party-voting'>
        { (collectionItems.length === 1 || finished) && ( <Confetti height={Math.max( document.body.scrollHeight, document.body.offsetHeight, document.documentElement.clientHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight ) } width={window.innerWidth} style={{zIndex: -1}}/> )}

        <div className='party-voting-sticky-header'>
            <div className='party-voting-top-row'>
                <button className='icon-btn' onClick={navToParty} aria-label='Cancel party'>
                    <X size={22} strokeWidth={2} />
                </button>
                {isOwnerVoting && (
                    <div className='party-voting-actions'>
                        <button className='icon-btn' onClick={selectFlag} aria-label='End voting early'>
                            <Flag size={22} strokeWidth={2} />
                        </button>
                        <button className='icon-btn' onClick={selectRandom} aria-label='Random pick'>
                            <Dices size={22} strokeWidth={2} />
                        </button>
                    </div>
                )}
            </div>

            {isOwnerVoting && totalUsers > 1 && (
                <div className='party-voting-votes-needed'>
                    <span className='party-voting-votes-label'>Votes Needed</span>
                    <div className='party-voting-votes-stepper'>
                        <button
                            type='button'
                            className='party-voting-votes-step'
                            onClick={() => {
                                const next = Math.max(1, Number(votesNeeded) - 1);
                                setVotesNeeded(next);
                                votesNeededRef.current = next;
                                channelRef.current?.send({ type: 'broadcast', event: 'votes-needed', payload: { n: next } });
                            }}
                            disabled={Number(votesNeeded) <= 1}
                            aria-label='Decrease votes needed'
                        >
                            <Minus size={20} strokeWidth={3} />
                        </button>
                        <span className='party-voting-votes-value'>{votesNeeded}</span>
                        <button
                            type='button'
                            className='party-voting-votes-step'
                            onClick={() => {
                                const next = Math.min(totalUsers, Number(votesNeeded) + 1);
                                setVotesNeeded(next);
                                votesNeededRef.current = next;
                                channelRef.current?.send({ type: 'broadcast', event: 'votes-needed', payload: { n: next } });
                            }}
                            disabled={Number(votesNeeded) >= totalUsers}
                            aria-label='Increase votes needed'
                        >
                            <Plus size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
            )}
        </div>
        {
            finished && (
                <div className='finished-title'>CHOICE CHAMPIONS!</div>
            )
        }

        {collectionItems.length > 1 && !finished && !ready && !randomSelected && !finishEarly && (
            <button
                type='button'
                className='floating-filter'
                onClick={(e) => setFilterAnchor(e.currentTarget)}
                aria-label='View options'
                style={{ color: partyColor }}
            >
                <SlidersHorizontal size={20} strokeWidth={2.5} />
            </button>
        )}

        <SortFilterPanel
            anchorEl={filterAnchor}
            open={Boolean(filterAnchor)}
            onClose={() => setFilterAnchor(null)}
            viewOptions={VIEW_OPTIONS}
            viewValue={viewValue}
            onViewChange={handleViewChange}
            activeColor={partyColor}
        />

        <div
            className='collection-content-other'
            style={collectionItems.length > 1 ? { gridTemplateColumns: `repeat(${viewValue}, minmax(0, 1fr))` } : undefined}
        >
            { 
                collectionItems.length === 1 ? (
                    <div className='winner'>
                        <p className='winner-banner'>
                            CHOICE CHAMPION!
                        </p>
                        <img
                            className='winner-img'
                            src={collectionItems[0].poster}
                            alt={`${collectionItems[0].title} poster`}
                        />
                        {
                            (mediaType === 'movie' || mediaType === 'tv') ? (
                                <div className='winner-details-card'>
                                    <p className='winner-title'>{collectionItems[0].title}</p>
                                    <div className='details-provider-title'>
                                        <span>Stream</span>
                                    </div>
                                    <div className='details-provider-seperator'></div>
                                    {
                                        providers.stream ? (
                                            <div className='details-provider-list'>
                                                {providers.stream.map(provider => (
                                                    <div className='details-provider-item' key={provider.provider_name}>
                                                        <img className='provider-img' src={`https://image.tmdb.org/t/p/w500${provider.logo_path}`} alt={provider.provider_name} />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className='providers-not-available'>Not available to stream</div>
                                        )
                                    }
                                </div>
                            ) : <p className='winner-title'>{collectionItems[0].title}</p>
                        }
                        <div className='winner-divider'></div>
                        <div className='runner-up-section'>
                            <p className='sub-title-runners-up'>
                                Runner Ups
                            </p>
                            {
                                    runnerUps.length > 0 && (
                                        <div className='runner-up-watchable'>
                                            {runnerUps.map(item => (
                                                <div key={item.id} className='runner-up-watchable-item'>
                                                    <img src={item.poster} alt={`${item.title} poster`} className='runner-up-watchable-img' />
                                                    {item.superChoice && (
                                                        <Star className='runner-up-super-choice' fill='currentColor' />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )
                                }
                        </div>
                    </div>
                ) : [...collectionItems].reverse().map(item => (
                    <div className='party-item-section clickable' key={item.id} onClick={() => { if(!finished) { changeCount(item.id) }}}>
                        <PlaceholderImg
                            classNames='party-item-img'
                            src={item.poster}
                            collectionColor={
                                (mediaType === 'movie' ? '#FCB016' : mediaType === 'tv' ? '#45B859' : mediaType === 'game' ? '#2482C5' : '#3a9b4c')
                            }
                            voted={item.voted}
                            finished={finished}
                        />
                        { (item.votes > 0 && !secretMode) && <div className='item-votes'>{item.votes}</div> }
                        { 
                            ((item.tempSuperChoice || item.superChoice) && superChoiceMode) &&
                                <Star
                                    fill='currentColor'
                                    className={
                                        item.superChoice ? 'item-super-choice' :
                                        item.tempSuperChoice ? 'item-temp-super-choice' : null
                                    }
                                />

                        }
                    </div>
                ))
            }
        </div>
        { 
            (collectionItems.length > 1) && ( 
                !ready ? ( (!randomSelected && !finishEarly) ? <Button className='finish-voting-btn' onClick={userReady} backgroundColor='#000' color='#fff'>Ready</Button> : null )
                : <div 
                    className='ready-overlay' 
                    onClick={ totalUsers > 1 ? userNotReady : null} 
                    style={ 
                        // If slide down is true translate the overlay down 100vh make the transition smooth over 2 seconds
                        slideDown ? { transform: 'translateY(100vh)', transition: 'transform 2s ease-in-out' } : null
                    }
                >
                    {totalUsers === 1 
                        ? 
                            <React.Fragment>
                            <h1 className='ready-text' style={{marginBottom: '30px'}}>Filtering Items</h1>
                            <Loading color='#FCB016' type='beat' className='ready-loading' size={20} speed={.5} />
                            </React.Fragment>
                        : 
                            <React.Fragment>
                            <h1 className='ready-text'>Ready!</h1>
                            <p className='waiting-text'>Waiting on other party members...</p>
                            <p className='waiting-text-cancel'>Click to return to voting</p>
                            <Loading color='#FCB016' type='beat' className='ready-loading' size={20} speed={.5} />
                            </React.Fragment>
                    }
                </div> 
            ) 
        }
        {
            randomSelected && (
                <div 
                    className='ready-overlay'
                    style={ 
                        // If slide down is true translate the overlay down 100vh make the transition smooth over 2 seconds
                        slideDown ? { transform: 'translateY(100vh)', transition: 'transform 2s ease-in-out' } : null
                    }
                >
                    <Dices size={96} strokeWidth={1.5} color='#FCB016' className='random-selected-dice' />
                </div>
            )
        }
        {
            finishEarly && (
                <div 
                    className='ready-overlay'
                    style={ 
                        // If slide down is true translate the overlay down 100vh make the transition smooth over 2 seconds
                        slideDown ? { transform: 'translateY(100vh)', transition: 'transform 2s ease-in-out' } : null
                    }
                >
                    <Flag className='flag-selected' />
                </div>
            )
        }
    </div>
  )
}

export default Party;