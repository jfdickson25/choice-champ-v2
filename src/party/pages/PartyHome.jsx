import React, { useContext, useEffect, useState } from 'react';

import { AuthContext } from '../../shared/context/auth-context';
import SegmentedToggle from '../../shared/components/SegmentedToggle/SegmentedToggle';
import MultiColorText from '../../shared/components/MultiColorText';
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
                <h1 className='party-home-title'>
                    <PartyPopperWheel size={28} strokeWidth={2} />
                    <MultiColorText>Party Time!</MultiColorText>
                </h1>
                <SegmentedToggle
                    options={VIEW_OPTIONS}
                    value={view}
                    onChange={setView}
                    activeColor={collectionTypeColor}
                />
            </div>

            <div className='party-home-body'>
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
