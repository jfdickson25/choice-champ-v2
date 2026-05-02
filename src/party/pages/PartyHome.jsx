import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { AuthContext } from '../../shared/context/auth-context';
import SegmentedToggle from '../../shared/components/SegmentedToggle/SegmentedToggle';
import PartyPopperWheel from '../../shared/components/Icons/PartyPopperWheel';
import { CreateParty } from './CreateParty';
import JoinParty from './JoinParty';
import { MEDIA_TYPES } from '../../shared/lib/mediaTypes';

import './PartyHome.css';

const VIEW_OPTIONS = [
    { value: 'create', label: 'Create Party' },
    { value: 'join',   label: 'Join Party' },
];

const PartyHome = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const [view, setView] = useState('create');
    const [online, setOnline] = useState(true);
    // Active media type is owned by PartyHome so the Create / Join
    // toggle and the embedded CreateParty form can share it. The
    // toggle's active pill paints in the media color, the CreateParty
    // form drives changes via setActiveMediaType, and the value
    // persists when the user toggles to Join and back.
    const [activeMediaType, setActiveMediaType] = useState('movie');
    const collectionTypeColor = MEDIA_TYPES[activeMediaType]?.color || MEDIA_TYPES.movie.color;

    useEffect(() => {
        auth.showFooterHandler(true);
        if (!navigator.onLine) setOnline(false);
    }, [auth]);

    if(!online) {
        return (
            <div className='content'>
                <div className='offline-msg'>No internet</div>
            </div>
        );
    }

    return (
        <div className='content party-home'>
            <div className='party-home-sticky-header'>
                <div className='party-home-top-row'>
                    <button className='icon-btn' onClick={() => navigate(-1)} aria-label='Back'>
                        <ArrowLeft size={22} strokeWidth={1.75} />
                    </button>
                    <div className='party-home-title-block'>
                        <PartyPopperWheel size={18} strokeWidth={2} />
                        <h1 className='party-home-title'>Party Time!</h1>
                    </div>
                    <span className='party-home-header-spacer' />
                </div>
            </div>

            <div className='party-home-body'>
                <div className='party-home-toggle-wrap'>
                    <SegmentedToggle
                        options={VIEW_OPTIONS}
                        value={view}
                        onChange={setView}
                        activeColor={collectionTypeColor}
                    />
                </div>
                {view === 'create'
                    ? <CreateParty
                        activeMediaType={activeMediaType}
                        setActiveMediaType={setActiveMediaType}
                        collectionTypeColor={collectionTypeColor}
                    />
                    : <JoinParty embedded collectionTypeColor={collectionTypeColor} />}
            </div>
        </div>
    );
};

export default PartyHome;
