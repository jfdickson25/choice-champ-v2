import React, { useRef, useState, useContext, useEffect } from 'react'
import { api } from '../../shared/lib/api';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../../shared/components/FormElements/Button';
import { AuthContext } from '../../shared/context/auth-context';

import './JoinParty.css';

const JoinParty = ({ embedded = false }) => {
    const auth = useContext(AuthContext);
    const [errorMessage, setErrorMessage] = useState('');

    const navigate = useNavigate();
    const inputRef = useRef();

    useEffect(() => {
        if(!embedded) auth.showFooterHandler(true);
    }, [auth, embedded]);

    const navToPartyWait = () => {
        const joinCode = inputRef.current.value;

        if(joinCode.length === 4) {
            api(`/party/exists/${joinCode}`)
                .then(data => navigate(`/party/wait/${data.code}`))
                .catch(err => setErrorMessage(err.body?.errorMsg || 'No party found with that code'));
        } else {
            setErrorMessage('Join code must be 4 digits');
        }
    }

    const changeHandler = (event) => {
        const next = event.target.value.replace(/\D/g, '').slice(0, 4);
        if(next !== event.target.value) event.target.value = next;
        inputRef.current.value = next;
    }

    const navBack = () => navigate('/');

    const form = (
        <div className='join-party'>
            <p className='join-party-subtitle'>Enter a 4-digit code to join a session</p>

            <img src="/img/Choice-Champ-Join-Party-Img.png" className="join-img" alt='Join Code'/>

            <div className='join-party-form'>
                <input className='text-input' type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="Join Code" ref={inputRef} onChange={changeHandler} />
                <Button className="join-btn" backgroundColor="#000" color="#fff" onClick={navToPartyWait}>Join Party</Button>
                {errorMessage && <p className='join-party-error-msg'>{errorMessage}</p>}
            </div>
        </div>
    );

    if(embedded) {
        return form;
    }

    return (
        <div className='content join-party-standalone'>
            <div className='page-topbar'>
                <button className="icon-btn" onClick={navBack} aria-label="Back">
                    <ArrowLeft size={22} strokeWidth={1.75} />
                </button>
            </div>

            <header className='join-party-header'>
                <h1 className='join-party-title'>Join Party</h1>
            </header>

            {form}
        </div>
    );
}

export default JoinParty;
