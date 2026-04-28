import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import './PartyFab.css';

// Floating action button that hovers above the bottom nav on every
// screen except Party itself. Replaces what used to be the centered
// Party tab in BottomNav now that Books takes a tab slot. The button
// face is a five-color wheel matching the brand mark — the colors
// correspond to the five media types. Tap → /party.
const PartyFab = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Hide on every Party route. /party (home), /party/wait/:code,
    // /party/:code, /party/joinParty — anything starting with /party.
    if (location.pathname === '/party' || location.pathname.startsWith('/party/')) {
        return null;
    }

    return (
        <button
            type='button'
            className='party-fab'
            onClick={() => navigate('/party')}
            aria-label='Start a party'
        >
            <span className='party-fab-wheel' aria-hidden='true' />
            <span className='party-fab-pointer' aria-hidden='true' />
        </button>
    );
};

export default PartyFab;
