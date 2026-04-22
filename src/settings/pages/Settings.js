import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../../shared/context/auth-context';
import Button from '../../shared/components/FormElements/Button';

import edit from '../../shared/assets/img/edit.png';
import editing from '../../shared/assets/img/editing.png';
import circle from '../../shared/assets/img/circle.png';
import check from '../../shared/assets/img/check.png';
import back from '../../shared/assets/img/back.svg';
import removeImg from '../../shared/assets/img/remove.png';
import movieNight from '../../welcome/assets/img/movie-night.svg';
import watch from '../../welcome/assets/img/watch.svg';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faChevronLeft, faChevronRight, faStar, faFlagCheckered, faCircleInfo, faImage } from '@fortawesome/free-solid-svg-icons';

import './Settings.css';
import { Dialog } from '@mui/material';

const Settings = () => {
    const auth = useContext(AuthContext);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showFlaticonModal, setShowFlaticonModal] = useState(false);
    const [showStorySetModal, setShowStorySetModal] = useState(false);

    useEffect(() => {
        auth.showFooterHandler(true);
    }, []);

    const openDeleteModal = () => {
        setShowDeleteModal(true);
    }

    const handleClose = () => {
        setShowDeleteModal(false);
    }

    const openFlaticonModal = () => {
        setShowFlaticonModal(true);
    }

    const handleCloseFlaticon = () => {
        setShowFlaticonModal(false);
    }

    const openStorySetModal = () => {
        setShowStorySetModal(true);
    }

    const handleCloseStorySet = () => {
        setShowStorySetModal(false);
    }

    const deleteAccount = () => {
        fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/user/${auth.userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }

        })
        .then(res => {
            auth.logout(); 
        });
    }

    return (
        <React.Fragment>
            <div className="content">
                <div className='settings-attribution'>
                    <h1 className='settings-header'>Attribution</h1>
                    <img 
                        src='https://play-lh.googleusercontent.com/XXqfqs9irPSjphsMPcC-c6Q4-FY5cd8klw4IdI2lof_Ie-yXaFirqbNDzK2kJ808WXJk=w240-h480-rw' 
                        className='settings-attribution-logo' 
                    />
                    <p className='settings-attribution-text'>
                        This product uses TMDB API but is not endorsed or certified by TMDB. All movie and TV show data is provided by TMDB.
                    </p>
                    <img 
                        src='https://external-preview.redd.it/DGvb3twMxWmxD9UYoAR5gMnAerP0aftUTz0eMXVH-7I.jpg?auto=webp&s=a1b8547e2079191a18ab4d7c44d96d4ed977f2c3' 
                        className='settings-attribution-logo' 
                    />
                    <p className='settings-attribution-text'>This product uses Giant Bomb API but is not endorsed or certified by Giant Bomb. All video game data is provided by Giant Bomb</p>
                    <img 
                        src='https://images.squarespace-cdn.com/content/v1/5902292fd482e9284cf47b8d/1567633051478-PRQ3UHYD6YFJSP80U3YV/BGG.jpeg'
                        className='settings-attribution-logo' 
                    />
                    <p className='settings-attribution-text'>This product uses BoardGameGeek but is not endorsed or certified by BoardGameGeek. All board game data is provided by BoardGameGeek</p>
                    <img 
                        src='data:image/png;base64,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' 
                        className='settings-attribution-logo clickable'
                        onClick={openFlaticonModal}
                    />
                    <p className='settings-attribution-text'>
                        Many of the icons for this application were used from flaticon. For an exteded list of all icons please press the flaticon image to the left.
                    </p>
                    <img 
                        src='data:image/png;base64,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' 
                        className='settings-attribution-logo clickable' 
                        onClick={openStorySetModal}
                    />
                    <p className='settings-attribution-text'>All illustrated imagery was used from Storyset. For an extensive list of all the illustrations used please press the image to the left.</p>
                    <h1 className='settings-header'>Reach out</h1>
                    <p id='email'>forrestdev25@gmail.com</p>
                    <p id='settings-attribution-text'>If you have any questions, comments, or requests please feel free to reach out to me at the email above.</p>
                </div>
                <Button className='btn-logout clickable' onClick={auth.logout}>Logout</Button>
                <Button className='btn-delete-settings clickable' onClick={openDeleteModal} backgroundColor='#b31212'>Delete Account</Button>
            </div>
            <Dialog open={showDeleteModal} onClose={handleClose} fullWidth maxWidth='lg'>
                <div className='dialog-content'>
                    <div className='dialog-sub-content'>
                        <h2 className='modal-header'>Are you sure you want to delete your account?</h2>
                        <div className='dialog-buttons'>
                            <Button className='btn-cancel clickable' onClick={handleClose}>Cancel</Button>
                            <Button className='btn-delete clickable' onClick={deleteAccount} backgroundColor='#b31212'>Delete</Button>
                        </div>
                    </div>
                </div>
            </Dialog>
            <Dialog open={showStorySetModal} onClose={handleCloseStorySet} fullWidth maxWidth='lg' scroll='body'>
                <div className='dialog-content'>
                    <div className='dialog-sub-content'>
                        <h2 className='modal-header'>Storyset Attribution</h2>
                        <div className='storyset-link'>
                            <img src={movieNight} />
                            <a href="https://storyset.com/people">People illustrations by Storyset</a>
                        </div>
                        <div className='storyset-link'>
                            <img src={watch} />
                            <a href="https://storyset.com/people">People illustrations by Storyset</a>
                        </div>
                    </div>
                </div>
            </Dialog>
            <Dialog open={showFlaticonModal} onClose={handleCloseFlaticon} fullWidth maxWidth='lg' scroll='body'>
                <div className='dialog-content'>
                    <div className='dialog-sub-content'>
                        <h2 className='modal-header'>Flaticon Attribution</h2>
                        <div className='flaticon-link'>
                            <img src={back} />
                            <a href="https://www.flaticon.com/free-icons/back-button" title="back button icons">Back button icons created by The Chohans - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faPlus} />
                            <a href="https://www.flaticon.com/free-icons/read-more" title="read more icons">Read more icons created by Bharat Icons - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <img src={edit} />
                            <a href="https://www.flaticon.com/free-icons/edit" title="edit icons">Edit icons created by iconixar - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <img src={back} />
                            <a href="https://www.flaticon.com/free-icons/back-button" title="back button icons">Back button icons created by The Chohans - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faPlus} />
                            <a href="https://www.flaticon.com/free-icons/read-more" title="read more icons">Read more icons created by Bharat Icons - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <img src={circle} />
                            <a href="https://www.flaticon.com/free-icons/circle" title="circle icons">Circle icons created by Freepik - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faChevronLeft} />
                            <a href="https://www.flaticon.com/free-icons/back" title="back icons">Back icons created by Arkinasi - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faChevronRight} />
                            <a href="https://www.flaticon.com/free-icons/back" title="back icons">Back icons created by Arkinasi - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <img src={editing} />
                            <a href="https://www.flaticon.com/free-icons/edit" title="edit icons">Edit icons created by iconixar - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <img src={removeImg} />
                            <a href="https://www.flaticon.com/free-icons/delete" title="delete icons">Delete icons created by Pixel perfect - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <img src={check} />
                            <a href="https://www.flaticon.com/free-icons/yes" title="yes icons">Yes icons created by juicy_fish - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faStar} />
                            <a href="https://www.flaticon.com/free-icons/rating" title="rating icons">Rating icons created by Corner Pixel - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faFlagCheckered} />
                            <a href="https://www.flaticon.com/free-icons/finish" title="finish icons">Finish icons created by Freepik - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faCircleInfo} />
                            <a href="https://www.flaticon.com/free-icons/information" title="information icons">Information icons created by Anggara - Flaticon</a>
                        </div>
                        <div className='flaticon-link'>
                            <FontAwesomeIcon icon={faImage} />
                            <a href="https://www.flaticon.com/free-icons/image-placeholder" title="image placeholder icons">Image placeholder icons created by HideMaru - Flaticon</a>
                        </div>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    );
}

export default Settings;