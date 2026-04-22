import React, { useEffect, useRef, useState, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Dialog } from '@mui/material';
import Loading from '../../shared/components/Loading';

import edit from '../../shared/assets/img/edit.png';
import editing from '../../shared/assets/img/editing.png';
import back from '../../shared/assets/img/back.svg';
import removeImg from '../../shared/assets/img/remove.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

import './Collections.css';
import { AuthContext } from '../../shared/context/auth-context';
import Button from '../../shared/components/FormElements/Button';

const Collections = props => {
    const auth = useContext(AuthContext);
    let navigate = useNavigate();

    /************************************************************
     * Initial load and data needed. Here we grab the info we need
     * from the params and set edit and our collections list
     ***********************************************************/
    // Grab the type from the parameters
    let collectionsType = useParams().type;

    // Variable for title depending on the category
    const [title, setTitle] = useState('');
    // State for collections
    const [collections, setCollections] = useState([]);
    const [isEdit, setIsEdit] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // State for error messages
    const [nameError, setNameError] = useState(null);
    const [nameErrorText, setNameErrorText] = useState('');
    const [joinError, setJoinError] = useState('');
    const [navingBack, setNavingBack] = useState(false);
    const [pressingBtn, setPressingBtn] = useState(false);
    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

    // Empty array will only run on the initial render
    useEffect(() => {
        auth.showFooterHandler(true);
        
        // Set the title depending on the type
        if(collectionsType === 'movie') {
            setTitle('Movie Collections')
            setCollectionTypeColor('#FCB016');
        } else if(collectionsType === 'tv') {
            setTitle('TV Collections')
            setCollectionTypeColor('#FF4D4D');
        } else if(collectionsType === 'game') {
            setTitle('Game Collections')
            setCollectionTypeColor('#2482C5');
        } else if(collectionsType === 'board') {
            setTitle('Board Game Collections')
            setCollectionTypeColor('#45B859');
        }
        
        // Make a fetch post request to collections with the userId and setCollections to the response
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/${collectionsType}/${auth.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            setCollections(data.collections);
            setIsLoading(false);
        });
    }, [auth, collectionsType]);

    /************************************************************
     * Logic for setting edit state and removing movies
     ***********************************************************/
     const isEditHandler = () => isEdit ? setIsEdit(false) : setIsEdit(true);

     const handleRemoveCollection = (id) => {
            // Send a fetch delete request to collections with the userId and the collection id
            fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/${collectionsType}/${auth.userId}/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(data => {
                // Remove the collection from the collections array
                setCollections(collections.filter(collection => collection._id !== id));
            })
            .catch(err => {
                console.log(err);
            }
        )
     }


    /************************************************************
     * Logic for our dialog, including adding new categories
     ***********************************************************/
    // Modal state and functions
    const [open, setOpen] = useState(false);
    // Modal input state and function
    const inputCollectionRef = useRef();
    const inputJoinRef = useRef();
    const handleOpen = () => setOpen(true);

    const handleClose = () => {
        // Reset the value in the input
        inputCollectionRef.current.value = '';
        inputJoinRef.current.value = null;
        setNameError(false);
        setJoinError('');
        setOpen(false);
    }

    const changeCollectionHandler = (event) => {
        const value = event.target.value;

        inputCollectionRef.current.value = value;
    }

    const changeJoinCodeHandler = (event) => {
        const value = event.target.value;

        inputJoinRef.current.value = value;
    }

    const handleAddCollection = () => {

        // Only add if the input is not empty and the collection does not already exist
        if(inputCollectionRef.current.value === '') {
            setNameError(true);
            setNameErrorText('Collection must have a name');
            return;
        } else if (collections.find(collection => collection.name === inputCollectionRef.current.value)) {
            setNameError(true);
            setNameErrorText('Collection with that name already exists');
            return;
        }

        // Send a fetch post request to collections with the userId and the new collection name
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/${auth.userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: inputCollectionRef.current.value,
                type: collectionsType
            })
        })
        .then(res => res.json())
        .then(data => {
            // Add the new collection to the collections array
            setCollections([...collections, data.collection]);
        })
        .catch(err => {
            console.log(err);
        });


        // Close the modal
        handleClose();
    }

    const handleJoinCollection = () => {

        // Check that the code is five digits long
        if(inputJoinRef.current.value.length !== 5) {
            setJoinError('Code must be 5 digits long');
            return;
        }

        // Send a fetch post request to collections with the userId and the new collection name
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/join/${inputJoinRef.current.value}/${collectionsType}/${auth.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.errMsg) {
                setJoinError(data.errMsg);
                return;
            } else {
                // Add the new collection to the collections array
                setCollections([...collections, data.collection]);
                // Close the modal
                handleClose();
            }
        })
        .catch(err => {
            console.log(err);
        });
    }

    const navBack = () => {
        setNavingBack(true);
        setTimeout(() => {
            setNavingBack(false);
            navigate('/collections');
        }, 1000);
    }

    const moveLeft = (id) => {
        // Find the collection with the id parameter
        const collection = collections.find(collection => collection._id === id);
        // Move the collection to the left in the collections array
        const index = collections.indexOf(collection);
        if(index === 0) {
            return;
        }
        const newCollections = [...collections];
        newCollections.splice(index, 1);
        newCollections.splice(index - 1, 0, collection);
        setCollections(newCollections);

        // Send a fetch post request with the userId and the collection id to move the collection left
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/moveLeft/${collectionsType}/${auth.userId}/${id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(data => {
            setCollections(newCollections);
        })
        .catch(err => {
            console.log(err);
        });
    }

    const moveRight = (id) => {
        // Find the collection with the id parameter
        const collection = collections.find(collection => collection._id === id);
        // Move the collection to the right in the collections array
        const index = collections.indexOf(collection);
        if(index === collections.length - 1) {
            return;
        }
        const newCollections = [...collections];
        newCollections.splice(index, 1);
        newCollections.splice(index + 1, 0, collection);
        setCollections(newCollections);

        // Send a fetch post with the userId and collection id to move the collection to the right
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/collections/moveRight/${collectionsType}/${auth.userId}/${id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(data => {
            setCollections(newCollections);
        })
        .catch(err => {
            console.log(err);
        });
    }

    return (
        <React.Fragment>
            <div className='content'>
                {
                    navingBack ? 
                    (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
                    (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
                }
                <h2 className={`title color-${collectionsType}`}>{title}</h2>
                <img src={ isEdit ? editing :  edit } className="edit clickable" alt='Edit icon' onClick={isEditHandler} style={isEdit ? {animation: 'button-press .75s'} : null} />
                {
                    pressingBtn ?
                    <button 
                        className={`add-btn backgroundColor-${collectionsType} backgroundColorPressed-${collectionsType}`}
                        style={{animation: 'button-press .75s'}}>Add Collection</button>
                    :
                    <button 
                        className={`add-btn backgroundColor-${collectionsType} clickable`}
                        onClick={() => {
                            setPressingBtn(true);
                            setTimeout(() => {
                                handleOpen();
                                setPressingBtn(false);
                            }, 750);
                        }}>Add Collection</button>
                }

                {
                    isLoading ? <Loading color={collectionTypeColor} type='beat' className='list-loading' size={20} /> : 
                    (<div className='collections-content'>
                        {
                            collections.length > 0 ? collections.map((collection, index) => (
                                isEdit ? (
                                    <div className='collections-item' key={collection._id}>
                                        <img className='remove' alt="Remove Icon" onClick={() => { handleRemoveCollection(collection._id) }} src={removeImg} />
                                        { index !== 0 && <FontAwesomeIcon className='left' onClick={() => { moveLeft(collection._id) }} icon={faChevronLeft} /> }
                                        <div className={`collection-text-${collectionsType} collection-text`}>
                                            {collection.name}
                                        </div>
                                        { index !== collections.length - 1 && <FontAwesomeIcon className='right' onClick={ () => { moveRight(collection._id) } } icon={faChevronRight} /> }
                                    </div>
                                ) : (
                                    <Link to={`/collections/${collectionsType}/${collection._id}`} className='collections-item' key={collection._id} >
                                        <div className={`collection-text-${collectionsType} collection-text`}>
                                            {collection.name}
                                        </div>
                                    </Link>
                                )
                            )) : <div className='no-collections-txt'>No Collections</div>
                        }
                    </div>)
                }
            </div>
            <Dialog open={open} onClose={handleClose} fullWidth maxWidth='lg'>
                <div className='dialog-content'>
                    <div className='dialog-sub-content'>
                        <input type="text" placeholder={"collection name"} onChange={changeCollectionHandler} ref={inputCollectionRef}/>
                        <Button backgroundColor={collectionTypeColor} onClick={handleAddCollection}>Create Collection</Button>
                        {nameError && <p className='error' style={{textAlign: 'center'}}>{nameErrorText}</p>}
                        <p className='or'>OR</p>
                        <input type="number" min={10000} max={99999} placeholder={"share code"} onChange={changeJoinCodeHandler} ref={inputJoinRef}/>
                        <Button backgroundColor={collectionTypeColor} onClick={handleJoinCollection}>Join Collection</Button>
                        <p className='error' style={{textAlign: 'center'}}>{joinError}</p>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    );
}

export default Collections;