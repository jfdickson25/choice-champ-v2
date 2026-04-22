import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import Showdown from 'showdown';

import './Details.css';
import circle from '../../shared/assets/img/circle.png';
import check from '../../shared/assets/img/check.png';
import back from '../../shared/assets/img/back.svg';

const Details = () => {
    const auth = useContext(AuthContext);
    let navigate = useNavigate();

    /************************************************************
     * Initial load and data needed. Here we grab the info we need
     * from the params and set edit and our movies list
     ***********************************************************/
    // Grab the collection name and id from the parameters
    let collectionType = useParams().type;
    let collectionId = useParams().collectionId;
    let itemId = useParams().itemId;


    // Grab filter query parameters from the url
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const filter = params.get('filter');

    const [details, setDetails] = useState({});
    const [providers, setProviders] = useState({}); // List of providers to watch
    const [loading, setLoading] = useState(false); // Loading state for when we are fetching data
    const [navingBack, setNavingBack] = useState(false);
    const [collectionList, setCollectionList] = useState([]);
    const [loadingCollectionList, setLoadingCollectionList] = useState(false);
    const [currentCollectionExists, setCurrentCollectionExists] = useState(true);
    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

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

        setLoading(true);
        setLoadingCollectionList(true);
        // Get all the items in the collection to check if any items in the search are already in the collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/media/getInfo/${collectionType}/${itemId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            // Remove all the html tags from the overview string
            // This is specifically for board games because the overview is in html
            if(collectionType === 'board') {
                data.media.details.overview = new Showdown.Converter().makeHtml(data.media.details.overview);
            }

            if(collectionType === 'game') {
                data.media.details.title = data.media.details.name;
                data.media.details.name = undefined;
            }

            setDetails(data.media.details);

            if(collectionType !== 'board' || collectionType !== 'game') {
                // Set the providers to the providers object
                setProviders(data.media.providers);
            } 
            
            if (collectionType === 'game') {
                setProviders({
                    platforms: data.media.providers.platforms
                });
            }

            setLoading(false);
        });

        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/collectionList/${collectionType}/${itemId}/${auth.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            setCollectionList([...data.collections]);
            setLoadingCollectionList(false);
        });
    }, []);

    const navBack = () => {
        setNavingBack(true);
        setTimeout(() => {
            setNavingBack(false);
            if(currentCollectionExists) {
                if(filter) {
                    navigate(`/collections/${collectionType}/${collectionId}?hash=${itemId}&filter=${filter}`);
                } else {
                    navigate(`/collections/${collectionType}/${collectionId}?hash=${itemId}`);
                }
            } else {
                navigate(`/collections/${collectionType}/${collectionId}`);
            }
        }, 1000);
    }

    const addToCollection = (addCollectionId, index) => {

        let tempId = itemId;

        // For collections that are not games or board games, we need to parse the id to an int
        // this is because we grab the id from the url and it is a string
        if(collectionType !== 'board' && collectionType !== 'game') {
            tempId = parseInt(tempId);
        }

        // Make a fetch post request to add an item to a collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${addCollectionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{
                title: details.title,
                id: tempId,
                poster: details.poster
            }])
        })
        .then(res => res.json())
        .then(data => {
            // Create a temp collection list to update the collection list
            // Update the collection list with the new item id
            let tempCollection = [...collectionList];
            tempCollection[index].itemId = data.newItems[0]._id;
            setCollectionList([...tempCollection]);
        });
    }

    const removeFromCollection = (removeCollectionId, removeItemId) => {
        // Make a fetch delete request to remove an item from a collection
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/items/${removeCollectionId}/${removeItemId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    return (
        <div className='content'>
            {
                navingBack ? 
                (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
                (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
            }
            { 
                loading || loadingCollectionList ? <Loading color={collectionTypeColor} type='beat' className='list-loading' size={20} /> : 
                <React.Fragment>
                    <div id="content-details">
                        <img
                            className='details-img'
                            src={details.poster}
                        />
                        <div className={`details-title color-${collectionType}`}>{details.title}</div>
                        {
                            collectionType !== 'game' &&
                                <div className='details-section'>
                                    <span className={`details-section-title color-${collectionType}`}>
                                        { collectionType === 'board' && ' Play Time:' } 
                                        { collectionType === 'movie' && ' Runtime:' }
                                        { collectionType === 'tv' && ' Seasons:' }
                                    </span> 
                                    {
                                        details.runtime > 0 ? details.runtime : 'N/A'
                                    }
                                    { (collectionType === 'movie' || collectionType === 'board') && ' minute' } 
                                    { collectionType === 'tv' && ' season' }
                                    { details.runtime > 1 && 's' }
                                </div>
                        }
                        {
                            collectionType === 'board' && (
                                <React.Fragment>
                                    <div className='details-section'>
                                        <span className={`details-section-title color-${collectionType}`}>Min Players:</span> {details.minPlayers}
                                    </div>
                                    <div className='details-section'>
                                        <span className={`details-section-title color-${collectionType}`}>Max Players:</span> {details.maxPlayers}
                                    </div>
                                </React.Fragment>
                            )
                        }
                        {
                            (collectionType === 'movie' || collectionType === 'tv') && (
                                <React.Fragment>
                                    <div className='details-section'>
                                        <span className={`details-section-title color-${collectionType}`}>Rating: </span>
                                        {details.rating} / 10
                                    </div>
                                </React.Fragment>
                            )
                        }
                        <div className='details-section'>
                            <div className={`details-section-title color-${collectionType}`}>Overview:</div>
                            <div className='details-overview' dangerouslySetInnerHTML={{ __html: details.overview }}></div>
                        </div>

                        { 
                            
                            (collectionType === 'movie' || collectionType === 'tv') && 
                            (
                                <React.Fragment>
                                    <div className={`details-provider-title color-${collectionType}`}>Stream:</div>
                                    { 
                                        // Q: How can I check to see if the providers.stream array is empty?
                                        // A: Use providers.stream.length
                                        providers.stream ?
                                        (
                                            <div className='details-provider-list-section'>
                                                {
                                                    providers.stream.map(provider => (
                                                        <img key={provider.provider_name} className='provider-img-section' src={`https://image.tmdb.org/t/p/w500${provider.logo_path}`} alt={provider.provider_name} />
                                                    ))
                                                }
                                            </div>
                                        ) : (
                                            <div className='providers-not-available'>Not available to stream</div>
                                        )
                                    }
                                </React.Fragment>
                            )
                        }
                        { 
                            
                            (collectionType === 'game') && 
                            (
                                <React.Fragment>
                                    <div className='details-provider-title'>Platforms</div>
                                    <div className='details-platforms'>
                                        {
                                            providers.platforms && (
                                                providers.platforms.map((platform, index) => (
                                                    (<span key={platform.name}>
                                                        {
                                                            index === providers.platforms.length - 1 ? (
                                                                platform.name
                                                            ) : 
                                                                platform.name + ', '
                                                        }
                                                    </span>)
                                                ))
                                            )
                                        }
                                    </div>
                                        
                                </React.Fragment>
                            )
                        }
                    
                        <div className='collections-list'>
                            <div className={`collections-list-title color-${collectionType}`}>Collections:</div>
                            {
                                collectionList.map((collection, index) => (
                                    <div className='collection-item' key={collection._id} onClick={() => { 
                                        let tempCollectionList = [...collectionList];

                                        if(collection.exists) {
                                            tempCollectionList[index].exists = false;
                                            if(tempCollectionList[index].collectionId === collectionId) {
                                                setCurrentCollectionExists(false); 
                                            }

                                            removeFromCollection(tempCollectionList[index].collectionId, tempCollectionList[index].itemId);
                                        } else {
                                            tempCollectionList[index].exists = true;
                                            if(tempCollectionList[index].collectionId === collectionId) {
                                                setCurrentCollectionExists(true); 
                                            }

                                            addToCollection(tempCollectionList[index].collectionId, index); 
                                        }

                                        setCollectionList([...tempCollectionList]);
                                    }}>
                                        <div className='collection-item-title'>{collection.name}</div>
                                        <img src={ collection.exists ? check : circle} className='colleciton-item-status' />
                                    </div>
                                ))
                            }
                        </div>
                </div>
                </React.Fragment>
            }
        </div>
    );
}

export default Details;