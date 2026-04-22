import React, { useRef, useState, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import Button from '../../shared/components/FormElements/Button';
import { AuthContext } from '../../shared/context/auth-context';

import back from '../../shared/assets/img/back.svg';

import './JoinParty.css';

const JoinParty = (props) => {
    const auth = useContext(AuthContext);

    // Enum for the error state 0 = no error, 1 = join code must be 4 digits, 2 = party does not exist
    const [errorMessage, setErrorMessage] = useState('');
    const [navingBack, setNavingBack] = useState(false);

    let navigate = useNavigate();
    const inputRef = useRef();

    useEffect(() => {
        auth.showFooterHandler(true);
    }, []);

    const navToPartyWait = () => {
        // Grab the join code from the input and validate it is 4 digits if it is 4 digits, navigate to the party page if it is not 4 digits, display an error message
        const joinCode = inputRef.current.value;

        if(joinCode.length === 4) {
            fetch(`https://choice-champ-backend-181ffd005e9f.herokuapp.com/party/exists/${joinCode}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if(data.code) {
                    // Navigate to the party page
                    navigate(`/party/wait/${data.code}`);
                }
                else {
                    // Display an error message
                    setErrorMessage(data.errorMsg);
                }
            })
            .catch(err => {
                console.log(err);
            });
        }
        else {
            // Display an error message
            setErrorMessage('Join code must be 4 digits');
        }
    }

    const changeHandler = (event) => {
        const value = event.target.value;

        inputRef.current.value = value;
    }

    const navBack = () => {
        setNavingBack(true);

        setTimeout(() => {
            setNavingBack(false);
            navigate('/party');
        }, 1000);
    }

  return (
    <div className='content'>
        {
            navingBack ? 
            (<img src={back} alt="Back symbol" className="top-left clickable" style={{animation: 'button-press .75s'}} />) :
            (<img src={back} alt="Back symbol" className="top-left clickable" onClick={navBack} />)
        }
        <h2 className='title'>Join Party</h2>
        <img src={`${process.env.PUBLIC_URL}/img/Choice-Champ-Join-Party-Img.png`} className="join-img" alt='Join Code Image'/>
        <div id='join-party-page'>
            <input type="number" min="0" max="9999" placeholder="Join Code" ref={inputRef} onChange={changeHandler} />
            <Button className="join-btn" onClick={navToPartyWait}>Join Party</Button>
            <p className='join-party-error-msg'>{errorMessage}</p>
        </div>
    </div>
  )
}

export default JoinParty;