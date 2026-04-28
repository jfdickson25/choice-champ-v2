import React, { useContext, useEffect, useState } from 'react';

import { AuthContext } from '../../shared/context/auth-context';
import SegmentedToggle from '../../shared/components/SegmentedToggle/SegmentedToggle';
import MultiColorText from '../../shared/components/MultiColorText';
import PartyPopperWheel from '../../shared/components/Icons/PartyPopperWheel';
import { CreateParty } from './CreateParty';
import JoinParty from './JoinParty';

import './PartyHome.css';

const VIEW_OPTIONS = [
    { value: 'create', label: 'Create Party' },
    { value: 'join',   label: 'Join Party' },
];

const PartyHome = () => {
    const auth = useContext(AuthContext);
    const [view, setView] = useState('create');
    const [online, setOnline] = useState(true);

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
                    activeColor='#000'
                />
            </div>

            <div className='party-home-body'>
                {view === 'create' ? <CreateParty /> : <JoinParty embedded />}
            </div>
        </div>
    );
};

export default PartyHome;
