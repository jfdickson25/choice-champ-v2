import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDownAZ, faClock, faEye, faGamepad, faChessPawn, faXmark } from '@fortawesome/free-solid-svg-icons';

import edit from '../../shared/assets/img/edit.png';
import editing from '../../shared/assets/img/editing.png';
import searchIcon from '../../shared/assets/img/search.svg';
import back from '../../shared/assets/img/back.svg';
import removeImg from '../../shared/assets/img/remove.png';

import './Collection.css';
import PlaceholderImg from '../../shared/components/PlaceholderImg';

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

    // Grab filter query parameters from the url
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const filter = params.get('filter');
    const hash = params.get('hash');

    const [items, setItems] = useState([]);
    const [isEdit, setIsEdit] = useState(false);
    const [shareCode, setShareCode] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [currentCollectionName, setCurrentCollectionName] = useState('');
    const [collectionName, setCollectionName] = useState('');
    const [showAlphabetical, setShowAlphabetical] = useState(() => {
        if(filter === 'alphabetical') {
            return true;
        } else {
            return false;
        }
    });
    const [showWatched, setShowWatched] = useState(() => {
        if(filter === 'watched') {
            return true;
        } else {
            return false;
        }
    });
    const [navingBack, setNavingBack] = useState(false);
    const [navingAdd, setNavingAdd] = useState(false);
    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

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
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${collectionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            setItems(data.items);
            itemsRef.current = data.items;
            setShareCode(data.shareCode);
            setCurrentCollectionName(data.name);
            setCollectionName(data.name);

            // Check if there is a filter in the url if there is set the filter
            if(filter === 'alphabetical') {
                setShowAlphabetical(true);
            } else if(filter === 'watched') {
                setShowWatched(true);
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

    /************************************************************
     * Logic for setting edit state and removing items
     ***********************************************************/
    const isEditHandler = () => {
        if(isEdit) {
            // Check to make sure the collection name is not empty
            if(collectionName !== '') {
                // If collection name has changed make a fetch post request to update the collection name
                if(collectionName !== currentCollectionName) {
                    fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/name/${collectionId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: collectionName
                        })
                    })
                    .then(res => {
                        setIsEdit(false);
                        setCurrentCollectionName(collectionName);
                    });
                } else {
                    setIsEdit(false);
                }
            } else {
                alert('Collection name cannot be empty');
            }
        } else {
            setIsEdit(true);
        }
    }

    const removeItem = (id) => {
        // Make a fetch delete request to remove an item from a collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${collectionId}/${id}`, {
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
        setNavingBack(true);
        setTimeout(() => {
            setNavingBack(false);
            navigate(`/collections/${collectionType}`);
        }, 1000);
    }

    const navAdd = () => {
        setNavingAdd(true);
        setTimeout(() => {
            setNavingAdd(false);
            navigate(`/collections/${collectionType}/${collectionId}/add`);
        }, 1000);
    }

    const navDetails = (id) => {
        // Check if filter for alphabetical or watched is on
        if(showAlphabetical || showWatched) {
            navigate(`/collections/${collectionType}/${collectionId}/details/${id}?filter=${showAlphabetical ? 'alphabetical' : 'watched'}`);
        } else {
            navigate(`/collections/${collectionType}/${collectionId}/details/${id}`);
        }
    }

    const updateWatched = (id, watched) => {
        // Make a fetch post request to update the watched status of an item
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${collectionId}/${id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                watched: !watched
            })
        })
        .then(res => {
            // Update the item with the given id to be watched
            setItems(items.map(item => {
                if(item._id === id && item.watched === false) {
                    item.watched = true;
                    item.timestamp = Math.floor(Date.now() / 1000);
                } else if(item._id === id && item.watched === true) {
                    item.watched = false;
                    // Remove the timestamp if the item is unwatched
                    item.timestamp = undefined;
                }

                return item;
            }));

            itemsRef.current = items;

            // Emit to the server that an item has been watched
            socket.emit('watched-remote-item', id, collectionId);
        });
    }

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
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            return item.title.toLowerCase().includes(query.toLowerCase());
        })
    }, [items, query]);

    return (
        <React.Fragment>
            <div className='content'>
                { 
                    /* 
                        Q: What is the difference between a link and navlink?
                        A: A link is used to navigate to a different page. 
                           A navlink is used to navigate to a different page
                           but it also allows you to style the link based on
                           if it is active or not.
                    */ 
                }
                {
                    navingBack ? 
                    (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
                    (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
                }
                { isEdit 
                    ? (<input className='title' style={{gridColumn:"5/14", marginBottom: "10px"}} value={collectionName} onChange={e => setCollectionName(e.target.value)} />)
                    : (<h2 className={`title color-${collectionType}`}>{collectionName}</h2>)
                }

                <img src={ isEdit ? editing :  edit } className="edit clickable" alt='Edit icon' onClick={isEditHandler} style={isEdit ? {animation: 'button-press .75s'} : null} />
                <div className='share-code'>share code: {shareCode}</div>
                {
                    navingAdd ?
                    <button 
                        className={`add-btn backgroundColor-${collectionType} backgroundColorPressed-${collectionType}`}
                        style={{animation: 'button-press .75s'}}>Add { collectionType === 'movie' ? 'Movie' : collectionType === 'game' || collectionType === 'board' ? 'Game' : 'Show'}</button>
                    :
                    <button 
                        className={`add-btn backgroundColor-${collectionType} clickable`}
                        onClick={navAdd}>Add { collectionType === 'movie' ? 'Movie' : collectionType === 'game' || collectionType === 'board' ? 'Game' : 'Show'}</button>
                }
                <div className='search-bar-container'>
                    <img src={searchIcon} alt='Search icon' className='search-icon' />
                    <input className='search-bar' placeholder='Search Collection' value={query} onChange={e => setQuery(e.target.value)}/>
                    {
                        query !== '' &&
                        <FontAwesomeIcon icon={faXmark} size="lg" className='clear-search clickable' onClick={() => setQuery('')} />
                    }
                </div>
                <FontAwesomeIcon icon={faClock} size="xl" onClick={() => {
                    setShowAlphabetical(false);
                    setShowWatched(false);
                }} className={!showAlphabetical && !showWatched ? `active-categorize active-${collectionType} category-icon clickable` : 'category-icon clickable'} id='category-clock' />
                <FontAwesomeIcon icon={faArrowDownAZ} size="xl" onClick={() => {
                    setShowAlphabetical(true);
                    setShowWatched(false);
                }} className={showAlphabetical ? `active-categorize active-${collectionType} category-icon clickable` : 'category-icon clickable'} id='category-alph' />
                <FontAwesomeIcon icon={collectionType === 'game' ? faGamepad : collectionType === 'board' ? faChessPawn :faEye} size="xl" onClick={() => {
                    setShowWatched(true);
                    setShowAlphabetical(false);
                }} className={showWatched ? `active-categorize active-${collectionType} category-icon clickable` : 'category-icon clickable'} id='category-watch'/>
                <span id='chrono-label' className={!showAlphabetical && !showWatched ? `category-label category-label-active-${collectionType}` : 'category-label'}>recent</span>
                <span id='alph-label' className={(showAlphabetical) ? `category-label category-label-active-${collectionType}` : 'category-label'}>a-z</span>
                <span id='watched-label' className={(showWatched) ? `category-label category-label-active-${collectionType}` : 'category-label'}>
                    { collectionType === 'game' || collectionType === 'board' ? 'played' : 'watched'}
                </span> 
                {
                    isLoading ? <Loading color={collectionTypeColor} type='beat' className='list-loading' size={20} /> : 
                        (
                            <div className='collection-content'>
                                {
                                    (filteredItems.length === 0 && query === '' && !showWatched) && <p className='no-items'>No items in this collection</p>
                                }
                                {
                                    (filteredItems.length === 0 && query !== '') && <p className='no-items'>No items match search</p>
                                }
                                {
                                    // Logic to check if we should show the items in alphabetical order or not
                                    showAlphabetical && !showWatched ? (
                                        [...filteredItems].sort((a, b) => a.title.localeCompare(b.title)).map(item => (
                                           // Only show if the item is not watched
                                           !item.watched ?
                                                (<div className='item-section' id={item.itemId} key={item.itemId} onClick={ !isEdit ? () => { navDetails(item.itemId) } : null } >
                                                    { 
                                                        !isEdit ? 
                                                            <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img clickable' src={item.poster} />
                                                            :
                                                            <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img' src={item.poster} />
                                                    }
                                                    { isEdit ? (<img src={removeImg} alt={`${item.title} poster`} className='item-action clickable' onClick={() => { removeItem(item._id) }} />) : null }
                                                    { isEdit ? (
                                                        <FontAwesomeIcon icon={collectionType === 'game' ? faGamepad : collectionType === 'board' ? faChessPawn :faEye} size="xl" 
                                                        className='item-action-watched clickable' onClick={() => {updateWatched(item._id)}} /> 
                                                    ) : null }
                                                </div>
                                                )
                                            :   null
                                        )) 
                                    ) : (
                                        /* 
                                            Received help from this article: https://bobbyhadz.com/blog/react-map-array-reverse 
                                            We use the spread operator here because we want to make a copy of filteredItems. We don't want
                                            to modify it
                                        */ 
                                        [...filteredItems].reverse().map(item => (
                                            // Only show if the item is not watched
                                            !item.watched && !showWatched ?
                                                (<div className='item-section' id={item.itemId} key={item.itemId} onClick={ !isEdit ? () => { navDetails(item.itemId) } : null } >
                                                    { 
                                                        !isEdit ? 
                                                            <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img clickable' src={item.poster} />
                                                            :
                                                            <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img' src={item.poster} />
                                                    }
                                                    { isEdit ? (<img src={removeImg} alt={`${item.title} poster`} className='item-action clickable' onClick={() => { removeItem(item._id) }} />) : null }
                                                    { isEdit ? (
                                                        <FontAwesomeIcon icon={collectionType === 'game' ? faGamepad : collectionType === 'board' ? faChessPawn :faEye} size="xl" 
                                                        className='item-action-watched clickable' onClick={() => {updateWatched(item._id)}} /> 
                                                    ) : null }
                                                </div>
                                                )
                                            :   null
                                        ))
                                    )
                                }
                                {
                                    // Logic to check if we should show the items in alphabetical order or not
                                    showWatched && (
                                        [...filteredItems].filter(item => item.watched).length === 0 && query === '' ? (
                                            
                                                collectionType === 'game' || collectionType === 'board' ? 
                                                <p className='no-items'>No played items</p>
                                                :
                                                <p className='no-items'>No watched items</p>
                                        )
                                        : 
                                        (
                                            [...filteredItems]
                                                .filter(item => item.watched)
                                                .sort((a, b) => a.timestamp - b.timestamp)
                                                .reverse().map(item => (
                                                    <div className='item-section' id={item.itemId} key={item.itemId} onClick={ !isEdit ? () => { navDetails(item.itemId) } : null } >
                                                        { 
                                                            !isEdit ? 
                                                            <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img clickable' src={item.poster} />
                                                            :
                                                            <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img' src={item.poster} />
                                                        }
                                                        { isEdit ? (<img src={removeImg} alt={`${item.title} poster`} className='item-action clickable' onClick={() => { removeItem(item._id) }} />) : null }
                                                        { isEdit ? (
                                                            <FontAwesomeIcon icon={collectionType === 'game' ? faGamepad : collectionType === 'board' ? faChessPawn :faEye} size="xl" 
                                                            className={`item-action-watched color-${collectionType} clickable`} onClick={() => {updateWatched(item._id, item.watched)}} /> 
                                                        ) : null }
                                                    </div>
                                            ))
                                        )
                                    )
                                }
                            </div>
                        )
                }
            </div>
        </React.Fragment>
    );
}

export default Collection;