import React, { useRef, useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import _ from 'lodash';

import { Dialog } from '@mui/material';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCircleInfo } from '@fortawesome/free-solid-svg-icons';

import './Search.css';

import circle from '../../shared/assets/img/circle.png';
import check from '../../shared/assets/img/check.png';
import searchIcon from '../../shared/assets/img/search.svg';
import back from '../../shared/assets/img/back.svg';
import PlaceholderImg from '../../shared/components/PlaceholderImg'

const Search = ({ socket }) => {
    const auth = useContext(AuthContext);
    let navigate = useNavigate();

    const imageNotFound = `${process.env.PUBLIC_URL}/img/image-not-found.svg`;

    /************************************************************
     * Initial load and data needed. Here we grab the info we need
     * from the params and set edit and our movies list
     ***********************************************************/
    // Grab the collection name and id from the parameters
    let collectionType = useParams().type;
    let collectionId = useParams().id;

    const [items, setItems] = useState([]);
    const [collection, setCollection] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [navingBack, setNavingBack] = useState(false);
    const [noMatch, setNoMatch] = useState(false);
    const [open, setOpen] = useState(false);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [activeSearch, setActiveSearch] = useState(false);
    const [collectionName, setCollectionName] = useState('');
    const searchRef = useRef('');

    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

    const [activeItem, setActiveItem] = useState({});

    // Create a ref of collection
    const collectionRef = useRef(collection);

    const notify = () => toast.success(`Item saved to ${collectionName} collection`, {
        position: "bottom-center",
        autoClose: 1500,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
    });

    const notifyRemove = () => toast(`Item removed from ${collectionName} collection`, {
        position: "bottom-center",
        autoClose: 1500,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
    });

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

        // Get all the items in the collection to check if any items in the search are already in the collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${collectionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            setCollectionName(data.name);
            // Verify that data.items is not undefined
            if(data.items) {
                // Set collection to the items in the collection but only the id
                collectionRef.current = data.items.map(item => {
                    return {
                        itemId: item.itemId,
                        mongoId: item._id
                    }
                });

                setCollection(collectionRef.current);
            }
        });
    }, [auth, collectionType, collectionId]);

    const updateList = (search) => {
        if (search === '' || search === undefined || search === null) {
            setItems([]);
            setNoMatch(false);
            setIsLoading(false);
            setActiveSearch(false);
            return;
        }

        // Make a fetch request to get all movies that match the search
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/${collectionType}/${search}/1`)
        .then(res => res.json())
        .then(res => {
            if(res.media.results.length === 0) {
                setItems([]);
                setIsLoading(false);
                setNoMatch(true);
                return;
            }

            // Reset the items to populate with updated value
            setItems([]);

            res.media.results.forEach(mediaItem => {

                // Make sure the item is not already in the collection
                let inCollection = false;

                // Check if item exists in collection ref
                collectionRef.current.forEach(item => {
                    if(collectionType !== 'game' && item.itemId === mediaItem.id) {
                        inCollection = true;
                    } else if (collectionType === 'game' && item.itemId === mediaItem.guid) {
                        inCollection = true;
                    }
                });

                if (collectionType === 'movie') {

                    if (mediaItem.poster_path === null || mediaItem.poster_path === undefined || mediaItem.poster_path === '') {
                        mediaItem.poster_path = imageNotFound;
                    } else {
                        mediaItem.poster_path = `https://image.tmdb.org/t/p/w500${mediaItem.poster_path}`;
                    }

                    setItems(prevState => [...prevState, {
                        id: mediaItem.id,
                        title: mediaItem.title,
                        poster: mediaItem.poster_path,
                        selected: false,
                        inCollection: inCollection,
                        loadingUpdate: false
                    }]);

                    setIsLoading(false);
                } else if (collectionType === 'tv') {

                    if (mediaItem.poster_path === null || mediaItem.poster_path === undefined || mediaItem.poster_path === '') {
                        mediaItem.poster_path = imageNotFound;
                    } else {
                        mediaItem.poster_path = `https://image.tmdb.org/t/p/w500${mediaItem.poster_path}`;
                    }

                    setItems(prevState => [...prevState, {
                        id: mediaItem.id,
                        title: mediaItem.name,
                        poster: `https://image.tmdb.org/t/p/w500${mediaItem.poster_path}`,
                        selected: false,
                        inCollection: inCollection,
                        loadingUpdate: false
                    }]);

                    setIsLoading(false);
                } else if (collectionType === 'game') {

                    if (mediaItem.image.original_url === null || mediaItem.image.original_url === undefined || mediaItem.image.original_url === '') {
                        mediaItem.image.original_url = imageNotFound;
                    }
                    
                    setItems(prevState => [...prevState, {
                        id: mediaItem.guid,
                        title: mediaItem.name,
                        poster: mediaItem.image.original_url,
                        selected: false,
                        inCollection: inCollection,
                        loadingUpdate: false
                    }]);

                    setIsLoading(false);
                } else if (collectionType === 'board') {
                    setItems(prevState => [...prevState, {
                        id: mediaItem.id,
                        title: mediaItem.name,
                        selected: false,
                        inCollection: inCollection,
                        loadingUpdate: false
                    }]);

                    setIsLoading(false);
                }
            });
        })
        .catch(err => {
            console.log(err);
            setIsLoading(false);
        });
    };

    // useRef is used to create a mutable ref object whose .current property is initialized 
    // to the passed argument (initialValue). The returned object will persist for the full lifetime of the component.
    // Debounce is a function to limit the number of times a function can be called in a given time period
    let debounced = useRef(_.debounce(updateList, 2000, {'search' : ''})).current;

    // Functions for handling change to input
    const changeHandler = (event) => {
        setActiveSearch(true)
        setIsLoading(true);
        setNoMatch(false);
        // Debounce example from web dev simplified (TODO: Watch rest on throttle)
        // https://www.youtube.com/watch?v=cjIswDCKgu0
        debounced(event.target.value);
    }

    const removeItem = (itemId, board) => {
        // Find the collection item with the itemId and remove it from the collection
        const collectionItem = collectionRef.current.find(item => item.itemId === itemId);

        if(!board) {
            // Find the item with the id and set loadingUpdate to true
            const loadingSetItems = items.map(item => {
                if(item.id === itemId) {
                    item.loadingUpdate = true;
                }
                return item;
            });
            setItems(loadingSetItems);
        } else {
            setActiveItem({
                ...activeItem,
                loadingUpdate: true
            });
        }

        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${collectionId}/${collectionItem.mongoId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if(!board) {
                // Find the item with the id and set inCollection to false
                const updatedItems = items.map(item => {
                    if(item.id === itemId) {
                        item.inCollection = false;
                        item.loadingUpdate = false;
                    }
                    return item;
                });

                setItems(updatedItems);
            } else {
                setActiveItem({
                    ...activeItem,
                    collectionStatus: false,
                    loadingUpdate: false
                });

                 // Find the item with the id and set inCollection to false
                 const updatedItems = items.map(item => {
                    if(item.id === itemId) {
                        item.inCollection = false;
                    }
                    return item;
                });

                setItems(updatedItems);
            }

            // Remove the item from the collection
            const updatedCollection = collectionRef.current.filter(item => item.itemId !== itemId);
            collectionRef.current = updatedCollection;
            setCollection(collectionRef.current);

            notifyRemove();

            // Emit to the server that an item has been removed
            socket.emit('remove-remote-item', collectionItem.mongoId, collectionId);
        });
    }

    const addItem = (itemId, itemTitle, itemPoster, board) => {

        if(!board) {
            // Find the item with the id and set loadingUpdate to true
            const loadingSetItems = items.map(item => {
                if(item.id === itemId) {
                    item.loadingUpdate = true;
                }
                return item;
            });
            setItems(loadingSetItems);
        } else {
            setActiveItem({
                ...activeItem,
                loadingUpdate: true
            });
        }

        // Make a fetch post request to add an item to a collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${collectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{
                title: itemTitle,
                id: itemId,
                poster: itemPoster
            }])
        })
        .then(res => res.json())
        .then(data => {
            collectionRef.current.push({itemId: itemId, mongoId: data.newItems[0]._id});
            setCollection(collectionRef.current);

            socket.emit('add-remote-item', {title: itemTitle, itemId: itemId, poster: itemPoster, _id: data.newItems[0]._id, watched: false}, collectionId);

            if(!board) {
                // Update the items inCollection value
                const updatedItems = items.map(item => {
                    if(item.id === itemId) {
                        item.inCollection = true;
                        item.loadingUpdate = false;
                    }
                    return item;
                });
                setItems(updatedItems);
            } else {
                setActiveItem({
                    ...activeItem,
                    collectionStatus: true,
                    loadingUpdate: false
                });

                // Update the items inCollection value
                const updatedItems = items.map(item => {
                    if(item.id === itemId) {
                        item.inCollection = true;
                    }
                    return item;
                });
                setItems(updatedItems);
            }

            notify();
        });
    }

    const getActiveItem = (itemId, status) => {
        setLoadingInfo(true);
        setOpen(true);
        
        // Get all the items in the collection to check if any items in the search are already in the collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${collectionType}/${itemId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            if(collectionType === 'board') { 
                setActiveItem({
                    id: itemId,
                    title: data.media.details.title,
                    poster: data.media.details.poster,
                    maxPlayers: data.media.details.maxPlayers,
                    minPlayers: data.media.details.minPlayers,
                    playingTime: data.media.details.runtime,
                    collectionStatus: status,
                    loadingUpdate: false
                });
            } else if(collectionType === 'movie' || collectionType === 'tv') {
                setActiveItem({
                    id: itemId,
                    title: data.media.details.title,
                    poster: data.media.details.poster,
                    watchTime: data.media.details.runtime,
                    rating: data.media.details.rating,
                    providers: data.media.providers.stream,
                    overview: data.media.details.overview
                });
            } else if(collectionType === 'game') {
                setActiveItem({
                    id: itemId,
                    title: data.media.details.name,
                    poster: data.media.details.poster,
                    runtime: data.media.details.runtime,
                    platforms: data.media.providers.platforms,
                    overview: data.media.details.overview
                });
            
            }

            setLoadingInfo(false);
        });
    }

    const navBack = () => {
        setNavingBack(true);
        setTimeout(() => {
            setNavingBack(false);
            navigate(`/collections/${collectionType}/${collectionId}`);
        }, 1000);
    }

    return (
        <div className='content'>
            <ToastContainer />
            {
                navingBack ? 
                (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
                (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
            }
            <h2 className={`title color-${collectionType}`}>{collectionName}</h2>
            <div className='search-bar-container'>
                <img src={searchIcon} alt='Search icon' className='search-icon' />
                <input className='search-bar' id='search' placeholder='Search' onChange={changeHandler} ref={searchRef} />
                {
                    activeSearch &&
                    <FontAwesomeIcon icon={faXmark} size="lg" className='clear-search clickable' onClick={() => { searchRef.current.value = ''; updateList(''); setActiveSearch(false) }} />
                }
            </div>
            { noMatch && <p className='no-match'>No matches found</p>}
            {
                isLoading ? <Loading color={collectionTypeColor} type='sync' className='list-loading' size={15} speed={.5} /> :
                (<div className='collection-content'>
                    {items.map(item => (
                        <div className={`item-section ${ (item.inCollection && collectionType !== 'board') ? collectionType + '-outline' : null }`} key={item.id} onClick={() => {
                            if(!item.loadingUpdate && collectionType !== 'board') {
                                if(!item.inCollection) {
                                        addItem(item.id, item.title, item.poster, false);
                                } else {
                                    removeItem(item.id, false);
                                }
                            } else if (collectionType === 'board') {
                                getActiveItem(item.id, item.inCollection);
                                setOpen(true);
                            }
                        }}>

                            { 
                                collectionType !== 'board' ?
                                <PlaceholderImg voted={null} finished={null} alt={`${item.title} poster`} collectionColor={collectionTypeColor} classNames='item-img clickable' src={item.poster} />
                                :
                                <div className='board-img-search' />
                            }
                            { collectionType === 'board' && ( <p className='item-title'>{item.title}</p> ) }                      
                            {
                                collectionType !== "board" && (
                                    <React.Fragment>
                                    {
                                        item.loadingUpdate &&
                                        (
                                            <Loading color={collectionTypeColor} type='beat' size={15} speed={.5} className='loading-save' />
                                        )
                                    }
                                    <FontAwesomeIcon icon={faCircleInfo} onClick={(e) => { e.stopPropagation(); getActiveItem(item.id, item.inCollection); setOpen(true); }} className='more-info clickable' />
                                    </React.Fragment>
                                )
                            }
                        </div>
                    ))}
                </div>)
            }
            <Dialog open={open} onClose={() => { setOpen(false) }} fullWidth maxWidth='lg'>
                <div className='dialog-content'>
                    {
                        loadingInfo ?
                        (<Loading color={collectionTypeColor} type='beat' className='board-details-loading' size={20} />) :
                        (
                            <React.Fragment>
                            <div id='status-icon'>
                                {
                                    collectionType === 'board' ?
                                    (
                                        activeItem.loadingUpdate ? 
                                        (
                                            <Loading color={collectionTypeColor} type='beat' size={15} speed={.5} className='loading-save-modal' />
                                        ) :
                                        (
                                            activeItem.collectionStatus ? 
                                                (<img src={check} alt={`${activeItem.title} saved`} className='item-action-board clickable' onClick={ () => { removeItem(activeItem.id, true ) }} />) :
                                                (<img id={activeItem.id} src={circle} alt={`${activeItem.title} unselected`} className='item-action-board clickable' onClick={ () => { addItem(activeItem.id, activeItem.title, activeItem.poster, true)} } />)
                                        )
                                    ) : null
                                }
                            </div>
                            <img src={activeItem.poster} alt={`${activeItem.title} poster`} className='modal-poster' style={ collectionType !== 'board' ? { marginTop: '30px'} : null} />
                                <div className={`modal-header color-${collectionType}`}>
                                    { activeItem.title }
                                </div>
                                <div className='modal-details'>
                                    {
                                        collectionType === 'board' ?
                                        (
                                            <React.Fragment>
                                                <p><span className={`label color-${collectionType}`}>Min Players:</span> {activeItem.minPlayers}</p>
                                                <p><span className={`label color-${collectionType}`}>Max Players:</span> {activeItem.maxPlayers}</p>
                                                <p><span className={`label color-${collectionType}`}>Play Time:</span> {activeItem.playingTime} min</p>
                                            </React.Fragment>
                                        ) : (
                                            collectionType === 'game' ?
                                            (
                                                <React.Fragment>
                                                    <p><span className={`label color-${collectionType}`}>Platforms:</span> {
                                                        activeItem.platforms && (
                                                            activeItem.platforms.map((platform, index) => (
                                                                (<span key={platform.name}>
                                                                    {
                                                                        index === activeItem.platforms.length - 1 ? (
                                                                            platform.name
                                                                        ) : 
                                                                            platform.name + ', '
                                                                    }
                                                                </span>)
                                                            ))
                                                        )
                                                    }
                                                    </p>
                                                    <p><span className={`label color-${collectionType}`}>Overview:</span><br /> {activeItem.overview}</p>
                                                </React.Fragment>
                                            ) : (
                                                <React.Fragment>
                                                    {
                                                        collectionType === 'tv' ? (
                                                            <p><span className={`label color-${collectionType}`}>Seasons:</span> {
                                                                activeItem.watchTime > 1 ? (
                                                                    activeItem.watchTime + ' seasons'
                                                                ) : activeItem.watchTime + ' season'
                                                            }</p>
                                                        ) : (
                                                            <p><span className={`label color-${collectionType}`}>Watch Time:</span> {activeItem.watchTime} min</p>
                                                        )
                                                    }
                                                    <p><span className={`label color-${collectionType}`}>Rating:</span> {activeItem.rating}</p>
                                                    <React.Fragment>
                                                    <span className={`label color-${collectionType}`}>Stream:</span>
                                                    {
                                                        activeItem.providers ?
                                                        (
                                                            <div className='details-provider-list'>
                                                                {
                                                                    activeItem.providers.map(provider => (
                                                                            <img key={provider.provider_name} className='provider-img' src={`https://image.tmdb.org/t/p/w500${provider.logo_path}`} alt={provider.provider_name} />)
                                                                    )
                                                                }
                                                            </div>
                                                        ) : (
                                                            <div className='providers-not-available'>Not available to stream</div>
                                                        )
                                                    }
                                                </React.Fragment>
                                                    <p><span className={`label color-${collectionType}`}>Overview:</span><br /> {activeItem.overview}</p>
                                                </React.Fragment>
                                            )
                                        )
                                    }
                                </div>
                            </React.Fragment>
                        )
                    }
                </div>
            </Dialog>
        </div>
    );
}

export default Search;