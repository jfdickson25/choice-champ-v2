
import React, { useEffect, useState, useRef, useContext }  from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../shared/components/FormElements/Button';
import Confetti from 'react-confetti';
import Loading from '../../shared/components/Loading';
import { AuthContext } from '../../shared/context/auth-context';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faFlagCheckered } from '@fortawesome/free-solid-svg-icons';
import back from '../../shared/assets/img/back.svg';
import dice from '../../shared/assets/img/dices.png';

import './Party.css';
import PlaceholderImg from '../../shared/components/PlaceholderImg';

const Party = ({ socket }) => {
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
    const [navingBack, setNavingBack] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionSaving, setNewCollectionSaving] = useState(false);
    const [newCollectionCreated, setNewCollectionCreated] = useState(false);

    // Variables for watch dropdowns
    const [activeRunnerup, setActiveRunnerup] = useState({});
    const [loadingRunnerUpProviders, setLoadingRunnerUpProviders] = useState(false);

    const collectionPointRef = useRef(collectionItems);
    const votesNeededRef = useRef(votesNeeded);
    const usersReadyCountRef = useRef(usersReadyCount);
    const totalUsersRef = useRef(totalUsers);
    const mediaTypeRef = useRef(mediaType);
  
    // Log the collections passed from the previous page using useEffect
    useEffect(() => {
        auth.showFooterHandler(false);
        // Make a fetch request to the backend to get all the collectionItems for the party
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/${code}?userId=${auth.userId}`,
        {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(body => {
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
            setTotalUsers(body.party.memberCount);
            totalUsersRef.current = body.party.memberCount;
            setCollectionItems(items);
            collectionPointRef.current = items;
          
            // Join the party room. This will restrict the same movie getting voted in different parties
            socket.emit('join-room', code);
        });
    }, []);

    useEffect(() => {
        socket.on('vote-increment', (id) => {
            // Find item with the id and increment the vote count
            const item = collectionPointRef.current.find(item => item.id == id);
            item.votes += 1;
            setCollectionItems([...collectionPointRef.current]);
        });

        socket.on('vote-decrement', (id) => {
            // Find item with the id and decrement the vote count
            const item = collectionPointRef.current.find(item => item.id == id);
            item.votes -= 1;
            setCollectionItems([...collectionPointRef.current]);
        });

        socket.on('votes-needed', (votesNeeded) => {
            setVotesNeeded(votesNeeded);
            votesNeededRef.current = votesNeeded;
        });

        socket.on('super-choice', (id) => {
            // Find item with the id and set holdSuperChoice to true
            const item = collectionPointRef.current.find(item => item.id == id);

            item.holdSuperChoice = true;
            setCollectionItems([...collectionPointRef.current]);
        });

        socket.on('remove-super-choice', (id) => {
            // Find item with the id and set holdSuperChoice to false
            const item = collectionPointRef.current.find(item => item.id == id);
            
            item.holdSuperChoice = false;
            setCollectionItems([...collectionPointRef.current]);
        });

        socket.on('random-selected', async (id) => {
            socket.emit('leave-room', code);

            if(ready) {
                setReady(false);
            }

            setRandomSelected(true);

            // Set the rest of the items that are not the random item to be the runner ups
            const runnerUpsTemp = collectionPointRef.current.filter(item => item.id !== id);
            setRunnerUps(runnerUpsTemp);

            if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                // Make a fetch request for the first item in the runnerUps array and add a provider property to it
                let response = await fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${runnerUpsTemp[0].itemId}`);

                let body = await response.json();
                runnerUpsTemp[0].providers = body.media.providers;
                runnerUpsTemp[0].active = true;

                setActiveRunnerup(runnerUpsTemp[0]);
            }

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
                        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${item.itemId}`,
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

        socket.on('finish-early', () => {
            socket.emit('leave-room', code);
            setFinishEarly(true);

            setTimeout(() => {
                setSlideDown(true);
                setFinished(true);
            }, 1500);
        });

        socket.on('user-ready', async () => {
            usersReadyCountRef.current += 1;
            setUsersReadyCount(usersReadyCountRef.current);

            // If the usersReadyCount is equal to the totalUsers then filter all the items that have
            // less votes than the votesNeeded. Reset the votes and voted for all filtered items
            if(usersReadyCountRef.current == totalUsersRef.current) {
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
                        const runnerUpsTemp = collectionPointRef.current.filter(item => item.votes < votesNeededRef.current);
                        setRunnerUps(runnerUpsTemp);

                        if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                            // Make a fetch request for the first item in the runnerUps array and add a provider property to it
                            let response = await fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${runnerUpsTemp[0].itemId}`);

                            let body = await response.json();
                            runnerUpsTemp[0].providers = body.media.providers;
                            runnerUpsTemp[0].active = true;

                            setActiveRunnerup(runnerUpsTemp[0]);
                        }
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
                                    fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${filteredItems[0].itemId}`,
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

        socket.on('user-not-ready', () => {
            usersReadyCountRef.current -= 1;
            setUsersReadyCount(usersReadyCountRef.current);
        });

        socket.on('party-member-left', () => {
            setTotalUsers(totalUsersRef.current - 1);
            totalUsersRef.current -= 1;
        });

        socket.on('party-deleted', () => {
            socket.emit('leave-room', code);
            // Redirect to the party page
            navigate('/party');
        });

        return () => {
            socket.off('vote-increment');
            socket.off('vote-decrement');
            socket.off('votes-needed');
            socket.off('vote-selected');
            socket.off('random-selected');
            socket.off('party-deleted');
            socket.off('clear-votes');
            socket.off('user-ready');
            socket.off('user-not-ready');
            socket.off('party-member-left');
            socket.off('super-choice');
            socket.off('remove-super-choice');
        }
    }, []);

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
                socket.emit('vote-remote-decrement', id, code);
            } else {
                item.tempSuperChoice = true;
                setCollectionItems([...collectionItems]);
                collectionPointRef.current = [...collectionItems];
                socket.emit('super-choice-remote', id, code);
            }
        } else if (item.voted && item.superChoice) {
            item.votes -= 1;
            item.voted = false;
            setCollectionItems([...collectionItems]);
            collectionPointRef.current = [...collectionItems];
            socket.emit('vote-remote-decrement', id, code);
        } else if (item.tempSuperChoice && !item.superChoice) {
            item.votes -= 1;
            item.voted = false;
            item.tempSuperChoice = false;
            setCollectionItems([...collectionItems]);
            collectionPointRef.current = [...collectionItems];
            socket.emit('vote-remote-decrement', id, code);
            socket.emit('remove-super-choice-remote', id, code);
        } else {
            item.voted = true;        
            item.votes += 1;
            setCollectionItems([...collectionItems]);
            collectionPointRef.current = [...collectionItems];
            socket.emit('vote-remote-increment', id, code);
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
            if(usersReadyCountRef.current == totalUsersRef.current) {
                // Filter out the items that have been voted for
                const filteredItems = collectionItems.filter(item => (item.votes >= votesNeededRef.current) || item.holdSuperChoice || item.tempSuperChoice);

                if (filteredItems.length === 0) {
                    alert('No item reached the votes needed. Continue voting.');
                    setReady(false);
                    usersReadyCountRef.current = 0;
                    setUsersReadyCount(usersReadyCountRef.current);
                    // Still emit so other users will be reset
                    socket.emit('user-ready-remote', code);
                    return;
                } else {
                    if (filteredItems.length === 1) {
                        // Set runners up to the remaining items
                        const runnerUpsTemp = collectionItems.filter(item => item.votes < votesNeededRef.current);
                        setRunnerUps(runnerUpsTemp);

                        if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                            // Make a fetch request for the first item in the runnerUps array and add a provider property to it
                            let response = await fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${runnerUpsTemp[0].itemId}`);

                            let body = await response.json();
                            runnerUpsTemp[0].providers = body.media.providers;
                            runnerUpsTemp[0].active = true;

                            setActiveRunnerup(runnerUpsTemp[0]);
                        }
                    }

                    setTimeout(() => {
                        // Set slideDown to true to slide down the ready overlay
                        setSlideDown(true);
                        setTimeout(() => {
                            if(filteredItems.length === 1) {
                                // Scroll user back to the top of the page
                                window.scrollTo(0, 0);

                                // Make a fetch request to delete the party from the database
                                fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/${code}`,
                                {
                                    method: 'DELETE',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                });

                                // Grab the watch options for the winner but only if the media type is movie or tv
                                if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                                    fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${filteredItems[0].itemId}`,
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

            // Emit event to the server that the user is ready
            socket.emit('user-ready-remote', code);
        }
    }

    const userNotReady = () => {
        // Set the user to not ready
        setReady(false);

        // Decrease usersReadyCount by one
        usersReadyCountRef.current -= 1;
        setUsersReadyCount(usersReadyCountRef.current);

        // Emit event to the server that the user is not ready
        socket.emit('user-not-ready-remote', code);
    }

    const navToParty = () => {
        if(userType === 'owner' && collectionItems.length > 1) {
            // Make a fetch request to the backend to get all the collectionItems for the party
            fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/${code}`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                setNavingBack(true);

                setTimeout(() => {
                    setNavingBack(false);
                    socket.emit('leave-room', code);
                    socket.emit('party-remote-deleted', code);
                    // Redirect to the home page
                    navigate('/party');
                }, 1000);
            });
        }
        else {
            setNavingBack(true);

            setTimeout(() => {
                setNavingBack(false);
                socket.emit('user-leave-party', code);
                socket.emit('leave-room', code);
                navigate('/party');
            }, 1000);

        }
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
        const runnerUpsTemp = collectionItems.filter(item => item.id !== randomItem.id);
        setRunnerUps(runnerUpsTemp);

        if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
            // Make a fetch request for the first item in the runnerUps array and add a provider property to it
            let response = await fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${runnerUpsTemp[0].itemId}`);

            let body = await response.json();
            runnerUpsTemp[0].providers = body.media.providers;

            runnerUpsTemp[0].active = true;

            setActiveRunnerup(runnerUpsTemp[0]);
        }

        setTimeout(() => {
            setSlideDown(true);
            setTimeout(() => {
                setCollectionItems([randomItem]);
                collectionPointRef.current = [randomItem];

                // Grab the watch options for the winner but only if the media type is movie or tv
                if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                    fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${randomItem.itemId}`,
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

                fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/${code}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }, 2000);
        }, 1000);

        socket.emit('random-remote-selected', randomItem.id, code);
    }

    const selectFlag = () => {
        socket.emit('finish-early-remote', code);
        socket.emit('leave-room', code);
        setFinishEarly(true);

        setTimeout(() => {
            setSlideDown(true);
            setFinished(true);
        }, 1500);
    }

    const changeActiveRunnerUp = (id) => {

        const item = runnerUps.find(item => item.itemId === id);
        const activeItem = runnerUps.find(item => item.active === true);

        if(item.itemId === activeItem.itemId) {
            return;
        } else {
            if(item.providers) {
                setActiveRunnerup(item);
                activeItem.active = false;
                item.active = true;
                setRunnerUps([...runnerUps]);
                return;
            } else {
                activeItem.active = false;
                item.active = true;
                setLoadingRunnerUpProviders(true);
                fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${mediaTypeRef.current}/${item.itemId}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(body => {
                    item.providers = body.media.providers;
                    setActiveRunnerup(item);
                    setRunnerUps([...runnerUps]);
                    setLoadingRunnerUpProviders(false);
                });
            
            }
        }
    }

    const exportFinished = () => {
        setNewCollectionSaving(true);

        // Send new collection name to the backend
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/${auth.userId}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: newCollectionName,
                type: mediaType,
            })
        }).then(response => response.json())
        .then(body => {
            let items = collectionItems.map(item => {
                return {
                    id: item.itemId,
                    title: item.title,
                    poster: item.poster
                }
            });

            // Add all the items to the collection
            fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${body.collection._id}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([...items])
            })
            .then(response => {
                setNewCollectionSaving(false);
                setNewCollectionCreated(true);
            });
        });
    }

  return (
    <div className='content'>
        { (collectionItems.length === 1 || finished) && ( <Confetti height={Math.max( document.body.scrollHeight, document.body.offsetHeight, document.documentElement.clientHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight ) } width={window.innerWidth} style={{zIndex: -1}}/> )}
        {
            navingBack ? 
            (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
            (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navToParty} />)
        }
        { (userType === 'owner' && collectionItems.length > 1 && !finished) ? (
            <div className='votes-needed-section'>
                <p className='votes-needed-title'>Votes Needed</p>
                <input 
                    type='number'
                    className='votes-needed-input'
                    value={votesNeeded}
                    min={1}
                    onChange={e => {
                        // Check if e.target.value is a number
                        if (e.target.value === '' ) {
                            setVotesNeeded(e.target.value);
                            votesNeededRef.current = e.target.value;
                        } else if(isNaN(e.target.value)) {
                            setVotesNeeded(1);
                            votesNeededRef.current = 1;
                            socket.emit('votes-needed-remote', 1, code);
                        } else if(e.target.value > totalUsersRef.current) {
                            setVotesNeeded(totalUsersRef.current);
                            votesNeededRef.current = totalUsersRef.current;
                            socket.emit('votes-needed-remote', totalUsersRef.current, code);
                        } else if(e.target.value < 1) {
                            setVotesNeeded(1);
                            votesNeededRef.current = 1;
                            socket.emit('votes-needed-remote', 1, code);
                        } else {
                            setVotesNeeded(e.target.value);
                            votesNeededRef.current = e.target.value;
                            socket.emit('votes-needed-remote', e.target.value, code);
                        }
                    }}
                />
            </div>)
            : <div className='guest-banner'></div>
        }
        { (userType === 'owner' && collectionItems.length > 1 && !finished) && (
            <div className='flag-section party-icon-section clickable'>
                <FontAwesomeIcon icon={faFlagCheckered} className="flag clickable" onClick={selectFlag} />
            </div>
        )}
        { (userType === 'owner' && collectionItems.length > 1 && !finished) && (
            <div className='dice-section party-icon-section clickable'>
                <img src={dice} className="dice" alt='Dice' onClick={selectRandom} />
            </div>
        ) }
        {
            finished && (
                <div className='finished-title'>CHOICE CHAMPIONS!</div>
            )
        }
        {
            (finished && userType === 'owner' && !newCollectionCreated && !newCollectionSaving) && (
                <div id="export-section">
                    <input id='collection-name' type='text' placeholder='Collection Name' value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} />
                    <Button className='export-btn' onClick={exportFinished}>Create Collection</Button>
                </div>
            )
        }
        {
            newCollectionSaving && (
                // Loading spinner
                <div className='collection-saving'>
                    <Loading color='#FCB016' type='beat' className='collection-saving-loading' size={20} speed={.5} />
                </div>
            )
        }
        {
            newCollectionCreated && (
                <div className='collection-created'>
                    Collection <b style={{color: '#FCB016'}}>{newCollectionName}</b> has been created!
                </div>
            )
        }
        <div className='collection-content-other'>
            { 
                collectionItems.length === 1 ? (
                    <div className='winner'>
                        <p className='winner-banner'>
                            CHOICE CHAMPION!
                        </p>
                        <img
                            className='winner-img'
                            src={collectionItems[0].poster}
                        />
                        {
                            (mediaType === 'movie' || mediaType === 'tv') ? (
                                <React.Fragment>
                                    <p className='sub-title-where-to-watch'>
                                        Where to Watch
                                    </p>
                                    <p className='winner-title'>{collectionItems[0].title}</p>
                                    <div className='providers-list'>
                                        <div className='details-provider-title'>
                                            <span>Stream</span>
                                        </div>
                                        <div className='details-provider-seperator'></div>
                                        { 
                                            providers.stream ?
                                            (
                                                <div className='details-provider-list'>
                                                    {
                                                        providers.stream.map(provider => (
                                                            (<div className='details-provider-item' key={provider.provider_name}>
                                                                <img className='provider-img' src={`https://image.tmdb.org/t/p/w500${provider.logo_path}`} alt={provider.provider_name} />
                                                            </div>)
                                                        ))
                                                    }
                                                </div>
                                            ) : (
                                                <div className='providers-not-available'>Not available to stream</div>
                                            )
                                        }
                                    </div>
                                </React.Fragment>
                            ) : <p className='winner-title'>{collectionItems[0].title}</p>
                        }
                        <div className='winner-divider'></div>
                        <div className='runner-up-section'>
                            <p className='sub-title-runners-up'>
                                Runner Ups
                            </p>
                            {
                                    runnerUps.length > 0 && (
                                        <React.Fragment>
                                            {
                                                (mediaType === 'movie' || mediaType === 'tv') ? (
                                                    <React.Fragment>
                                                        <p className='sub-title-where-to-watch'>
                                                            Where to Watch
                                                        </p>
                                                        <div className='runner-up-active-title'>{activeRunnerup.title}</div>
                                                        <React.Fragment>
                                                            { 
                                                                !loadingRunnerUpProviders ? (
                                                                    <div className='providers-list'>
                                                                        <div className='details-provider-title'>
                                                                            <span>Stream</span>
                                                                        </div>
                                                                        <div className='details-provider-seperator'></div>
                                                                        { 
                                                                            activeRunnerup.providers.stream ?
                                                                            (
                                                                                <div className='details-provider-list'>
                                                                                    {
                                                                                        activeRunnerup.providers.stream.map(provider => (
                                                                                            (<div className='details-provider-item' key={provider.provider_name}>
                                                                                                <img className='provider-img' src={`https://image.tmdb.org/t/p/w500${provider.logo_path}`} alt={provider.provider_name} />
                                                                                            </div>)
                                                                                        ))
                                                                                    }
                                                                                </div>
                                                                            ) : (
                                                                                <div className='providers-not-available'>Not available to stream</div>
                                                                            )
                                                                        }
                                                                    </div> 
                                                                ) : <Loading color='#FCB016' type='beat' className='runner-up-providers-loading' size={20} speed={.5} />
                                                            }
                                                        </React.Fragment>
                                                    </React.Fragment>
                                                ) : null
                                            }
                                            <div className='runner-up-watchable'>
                                                {
                                                    runnerUps.map(item => (
                                                        <div key={item.id} className='runner-up-watchable-item' 
                                                        onClick={() => { 
                                                            if(mediaTypeRef.current === 'movie' || mediaTypeRef.current === 'tv') {
                                                                changeActiveRunnerUp(item.itemId) 
                                                            }
                                                        }}>
                                                            <img src={item.poster} className='runner-up-watchable-img' style={item.active ? {border: 'solid 5px #FCB016'} : null } />
                                                            { 
                                                                item.superChoice &&
                                                                    <FontAwesomeIcon
                                                                        icon={faStar}
                                                                        className='runner-up-super-choice'
                                                                    />
                                                            }
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </React.Fragment>
                                    )
                                }
                        </div>
                    </div>
                ) : [...collectionItems].reverse().map(item => (
                    <div className='item-section clickable' key={item.id} onClick={() => { if(!finished) { changeCount(item.id) }}}>
                        <PlaceholderImg 
                            classNames='item-img'
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
                                <FontAwesomeIcon
                                    icon={faStar}
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
                !ready ? ( (!randomSelected && !finishEarly) ? <Button className='finish-voting-btn' onClick={userReady}>Ready</Button> : null )
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
                            <Loading color='#FCB016' type='sync' className='ready-loading' size={20} speed={.5} />
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
                    <img src={dice} className='random-selected-dice' alt='Dice' />
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
                    <FontAwesomeIcon icon={faFlagCheckered} className='flag-selected' />
                </div>
            )
        }
    </div>
  )
}

export default Party;