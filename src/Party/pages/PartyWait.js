import React, { useEffect, useState, useContext, useRef }  from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';

import Loading from '../../shared/components/Loading';
import Button from '../../shared/components/FormElements/Button';

import back from '../../shared/assets/img/back.svg';
import dice from '../../shared/assets/img/dices.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faFlag, faTrophy } from '@fortawesome/free-solid-svg-icons';

import './PartyWait.css';

const PartyWait = ({ socket }) => {
    // Bring in the authentication context to decide whether to show the footer or not
    const auth = useContext(AuthContext);
    // History allows us to redirect the user to another page
    let navigate = useNavigate();
  
    // Get the party code and user type from the url
    const { code } = useParams();

    // Variable to store the number of members in the party
    const [memberCount, setMemberCount] = useState(0);
    const [navingBack, setNavingBack] = useState(false);
    const [userType, setUserType] = useState('guest');
    const [superChoiceEnabled, setSuperChoiceEnabled] = useState(false);
    // Using useRef to store the memberCount so that it doesn't get reset on re-render
    const memberCountRef = useRef(memberCount);

    const [mediaType, setMediaType] = useState('');

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
            // Increase the member count by 1 for this user the other users will
            // be updated with the member-increment socket event
            let memberCount = body.party.memberCount + 1;

            setMediaType(body.party.mediaType);

            if(body.party.superChoice) {
                setSuperChoiceEnabled(true);
            }

            if(body.owner) {
                setUserType('owner');
            }

            memberCountRef.current = memberCount;
            setMemberCount(memberCountRef.current);

            // Join the party room. This will restrict the same movie getting voted in different parties
            socket.emit('join-room', `waiting${code}`);

            // Emit event to increment the member count for the other users
            socket.emit('member-remote-increment', `waiting${code}`);

            // Make a post request to the backend to add the user to the party
            // This is because users who join will get the member count from the backend fetch request
            fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/add-member/${code}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    partyCode: code,
                })
            });
        });
    }, []);

    useEffect(() => {
        socket.on('member-increment', () => {
            // Q: Why do we set both the memberCountRef and the memberCount?
            // A: Because if we only set the memberCountRef, the memberCount will not be updated
            // and the memberCount will be 0 on re-render
            memberCountRef.current += 1;
            setMemberCount(memberCountRef.current);
        });

        socket.on('member-decrement', () => {
            memberCountRef.current -= 1;
            setMemberCount(memberCountRef.current);
        });

        socket.on('start-party', () => {
            // Emit event to leave the party room
            socket.emit('leave-room', `waiting${code}`);
            navigate(`/party/${code}`);
        });

        socket.on('party-deleted', () => {
            socket.emit('leave-room', `waiting${code}`);
            // Redirect to the party page
            navigate('/party');
        });

        return () => {
            // Q: Why do we remove the socket events?
            // A: Because if we don't remove the socket events, they will be added again
            // on re-render and we will have multiple socket events for the same event
            socket.off('member-increment');
            socket.off('member-decrement');
            socket.off('start-party');
            socket.off('party-deleted');
        }
    }, []);

    const routeToParty = () => {
        // Emit event to start the party and route others to the party page
        socket.emit('start-remote-party', `waiting${code}`);
        // Emit event to leave the party room
        socket.emit('leave-room', `waiting${code}`);

        // Route to the party page
        navigate(`/party/${code}`);
    }

    const navBack = async () => {
        if(userType === 'owner') {
            // Make a fetch request to the backend delete the party
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
                    // Emit event to delete the party for the other users so they can be redirected to the
                    // party page
                    socket.emit('party-remote-deleted', `waiting${code}`);
                    socket.emit('leave-room', `waiting${code}`);
                    navigate('/party');
                }, 1000);
            });
        }
        else {
            socket.emit('leave-room', `waiting${code}`);
            // For guests if they leave decrement the member count for the other users
            socket.emit('member-remote-decrement', `waiting${code}`);

            // Make a post request to the backend to remove the user from the party
            await fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/remove-member/${code}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    partyCode: code,
                })
            });

            setNavingBack(true);
            
            setTimeout(() => {
                setNavingBack(false);
                navigate('/party');
            }, 1000);
        }
    }


  return (
    <div className='content' style={{paddingBottom: '0px'}}>
        {
            navingBack ? 
            (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
            (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
        }
        <FontAwesomeIcon
            icon={faTrophy}
            id="waiting-img"
            style={{ color:
                mediaType === 'movie' ? '#FCB016' :
                mediaType === 'tv' ? '#F04C53' :
                mediaType === 'game' ? '#2482C5' :
                mediaType === 'board' ? '#45B859' : undefined
            }}
        />
        <div className='party-wait-code'>
            Party Code: {code}
        </div>

        <Loading color='#FCB016' type='propagate' className='list-loading' size={15} speed={.25} />
        <div className='party-wait-count'>
            Party Count <span className='party-wait-count-num'>{memberCount}</span>
        </div> 

        { 
            userType === 'owner' &&
                <React.Fragment>
                    <Button className='party-wait-start-btn' onClick={routeToParty}>
                        Start Party
                    </Button>
                    <div className='tip-section'>
                        <p id="tips-title">TIPS</p>
                    </div>
                    <div className="tip-section">
                        <img src={dice} alt="Dice symbol" className="party-wait-icon" />
                        <p className='party-wait-start-text'>
                            Select this icon for a random item to be chosen as the winner
                        </p>
                    </div>
                    <div className="tip-section">
                        <FontAwesomeIcon icon={faFlag} className="party-wait-icon" />
                        <p className='party-wait-start-text'>
                            Select this icon to end voting early. Remaining items can be exported to create a new collection
                        </p>
                    </div>
                </React.Fragment>
        }
        {
            (userType === 'guest' && superChoiceEnabled) &&
            (
                <div className='tip-section'>
                    <p id="tips-title">TIPS</p>
                </div>
            )
        }
        {
            superChoiceEnabled &&
                <div className="tip-section">
                    <FontAwesomeIcon icon={faStar} className="party-wait-icon" />
                    <p className='party-wait-start-text'>
                        Super choices have been enabled. Double tap an item to star it and ensure
                        it moves on to the next round. Party items can only be starred once per choice party.
                    </p>
                </div>
        }
        {
            ((userType === 'guest' && superChoiceEnabled) || userType == 'owner') &&
            (
                <div className='tip-section' style={{height: '20px'}}></div>
            )
        }
    </div>
  )
}

export default PartyWait;