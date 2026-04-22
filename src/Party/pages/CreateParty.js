import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import circle from '../../shared/assets/img/circle.png';
import check from '../../shared/assets/img/check.png';
import back from '../../shared/assets/img/back.svg';

import './CreateParty.css';
import Button from '../../shared/components/FormElements/Button';

import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import { set } from 'react-hook-form';

const CreateParty = props => {
    const auth = useContext(AuthContext);

    const [collections, setCollections] = useState([]);
    const [mediaType, setMediaType] = useState('movie');
    const [selectAlert, setSelectAlert] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [secretMode, setSecretMode] = useState(false);
    const [includeWatched, setIncludeWatched] = useState(false);
    const [superChoice, setSuperChoice] = useState(false);
    const [navingBack, setNavingBack] = useState(false);
    const [activeMediaType, setActiveMediaType] = useState('movie');
    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

    const [pressingMovie, setPressingMovie] = useState(false);
    const [pressingTv, setPressingTv] = useState(false);
    const [pressingGame, setPressingGame] = useState(false);
    const [pressingBoard, setPressingBoard] = useState(false);

    let navigate = useNavigate();

    useEffect(() => {
        auth.showFooterHandler(true);
        // Make a fetch post request to collections with the userId and setCollections to the response
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/movie/${auth.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            setCollections(data.collections);
            setIsLoading(false);
        })
    }, []);

    const addRemoveItem = (itemId) => {
        if(selectAlert) {
            setSelectAlert(false);
        }

        // Find the item in the array and toggle the selected value
        const updatedCollections = collections.map(collection => {
            if(collection._id === itemId) {
                collection.selected = !collection.selected;
            }
            return collection;
        });

        setCollections(updatedCollections);
    }

    const navToPartyWait = () => {
        const selectedCollections = collections.filter(collection => collection.selected);

        if (selectedCollections.length === 0) {
            setSelectAlert(true);
            return;
        }

        const collectionIds = selectedCollections.map(collection => collection._id);

        fetch('https://choice-champ-backend-181ffd005e9f.herokuapp.com/party', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                    collections: collectionIds,
                    mediaType: mediaType,
                    secretMode: secretMode,
                    includeWatched: includeWatched,
                    superChoice: superChoice,
                    owner: auth.userId
            })
        })
        .then(res => {
            return res.json();
        })
        .then(data => {
            // Route to the party page
            navigate(`/party/wait/${data.partyCode}`);
        });
    }

    const navBack = () => {
        setNavingBack(true);
        setTimeout(() => {
            setNavingBack(false);
            navigate('/party');
        }, 1000);
    }

    const mediaTypeHandler = (type) => {

        setIsLoading(true);
        setMediaType(type);

        // Make a fetch post request to collections with the userId and setCollections to the response
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/${type}/${auth.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            setSelectAlert(false);
            setCollections(data.collections);
            setIsLoading(false);
        })
    }

    return (
        <React.Fragment>
            <div className='content'>
                {
                    navingBack ? 
                    (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
                    (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
                }
                <h2 className='title'>Create Party</h2>
                <div className='create-divider'></div>
                <p className='option-text'>Secret Mode</p>
                <img className='option-img' src={ secretMode ? check : circle } onClick={() => { setSecretMode(!secretMode) }} />
                <p className='option-subtext'>Party members will not see each other's votes</p>                
                <p className='option-text'>Include Watched</p>
                <img className='option-img' src={ includeWatched ? check : circle } onClick={() => { setIncludeWatched(!includeWatched) }} />
                <p className='option-subtext'>Include items that have been marked as watched/played</p>  
                <p className='option-text'>Super Choice Mode</p>
                <img className='option-img' src={ superChoice ? check : circle } onClick={() => { setSuperChoice(!superChoice) }} />
                <p className='option-subtext'>
                    Super choice mode allows for more passionate voting. Double tap to star a choice to ensure it moves on to the next round.
                    All party members will see the star in subsequent rounds and it cannot be starred again.
                </p>
                <button 
                    className={`media-type-btn ${ activeMediaType === 'movie' ? 'active-movie-fill' : 'movie'}`} 
                    style={ pressingMovie ? {animation: 'button-press .75s', marginTop: '30px'} : { marginTop: '30px' }} 
                    onClick={() => { 
                        setActiveMediaType('movie');
                        setCollectionTypeColor('#FCB016');
                        setPressingMovie(true);
                        mediaTypeHandler('movie') 
                        setTimeout(() => {
                            setPressingMovie(false);
                        }, 750);
                    }}
                >
                        Movies
                </button>
                <button 
                    className={`media-type-btn ${ activeMediaType === 'tv' ? 'active-tv-fill' : 'tv'}`} 
                    style={ pressingTv ? {animation: 'button-press .75s'} : null}
                    onClick={() => { 
                        setActiveMediaType('tv');
                        setCollectionTypeColor('#FF4D4D');
                        setPressingTv(true);
                        mediaTypeHandler('tv');
                        setTimeout(() => {
                            setPressingTv(false);
                        }, 750); 
                    }}
                >
                    TV Shows
                </button>
                <button 
                    className={`media-type-btn ${ activeMediaType === 'game' ? 'active-game-fill' : 'game'}`} 
                    style={ pressingGame ? {animation: 'button-press .75s'} : null}
                    onClick={() => { 
                        setActiveMediaType('game');
                        setCollectionTypeColor('#2482C5');
                        setPressingGame(true);
                        mediaTypeHandler('game');
                        setTimeout(() => {
                            setPressingGame(false);
                        }, 750);
                    }}
                >
                    Video Games
                </button>
                <button 
                    className={`media-type-btn ${ activeMediaType === 'board' ? 'active-board-fill' : 'board'}`} 
                    style={ pressingBoard ? {animation: 'button-press .75s', marginBottom: '30px'} : { marginBottom: '30px' }}
                    onClick={() => { 
                        setActiveMediaType('board');
                        setCollectionTypeColor('#45B859');
                        setPressingBoard(true);
                        mediaTypeHandler('board');
                        setTimeout(() => {
                            setPressingBoard(false);
                        }, 750);
                    }}
                >
                    Board Games
                </button>
                
                <div className='create-party-collections'>
                    
                { isLoading ? <Loading color={collectionTypeColor} type='beat' className='list-loading-create' size={20} /> : 
                        collections.length > 0 ?
                            collections.map(collection => (   
                                collection.items.length > 0 &&
                                <div key={collection._id} className={`create-party-collection ${collection.selected ? `active-${collection.type}-fill` : ''}`} onClick={() => { addRemoveItem(collection._id) }}>
                                    <div className={`create-party-collection-name`}>{collection.name}</div>
                                </div>
                        ))
                        : <div className='no-collections-found'>No collections found for this media type</div>
                }
                </div>
                <Button type="button" className='create-party-btn' onClick={navToPartyWait}>Create Party</Button>
                { selectAlert && <div className='select-alert'>Please select at least one collection</div> }
            </div>
        </React.Fragment>
    );
}

export default CreateParty;