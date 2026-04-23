import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, User, PartyPopper } from 'lucide-react';
import { Menu, MenuItem } from '@mui/material';

import { AuthContext } from '../../shared/context/auth-context';
import SegmentedToggle from '../../shared/components/SegmentedToggle/SegmentedToggle';
import { CreateParty } from './CreateParty';
import JoinParty from './JoinParty';

import './PartyHome.css';

const VIEW_OPTIONS = [
    { value: 'create', label: 'Create Party' },
    { value: 'join',   label: 'Join Party' },
];

const PARTY_COLOR = '#A855F7';

const PartyHome = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const [view, setView] = useState('create');
    const [online, setOnline] = useState(true);
    const [kebabAnchor, setKebabAnchor] = useState(null);

    useEffect(() => {
        auth.showFooterHandler(true);
        if (!navigator.onLine) setOnline(false);
    }, [auth]);

    const openKebab = (e) => setKebabAnchor(e.currentTarget);
    const closeKebab = () => setKebabAnchor(null);

    const handleGoToProfile = () => {
        closeKebab();
        navigate('/profile');
    };

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
                    <button className='icon-btn' onClick={openKebab} aria-label='More'>
                        <MoreVertical size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <h1 className='party-home-title' style={{ color: PARTY_COLOR }}>
                    <PartyPopper size={26} strokeWidth={1.75} color={PARTY_COLOR} />
                    Party Time!
                </h1>
                <SegmentedToggle
                    options={VIEW_OPTIONS}
                    value={view}
                    onChange={setView}
                    activeColor={PARTY_COLOR}
                />
            </div>

            <div className='party-home-body'>
                {view === 'create' ? <CreateParty /> : <JoinParty embedded />}
            </div>

            <Menu
                anchorEl={kebabAnchor}
                open={Boolean(kebabAnchor)}
                onClose={closeKebab}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ className: 'collection-menu-paper' }}
            >
                <MenuItem onClick={handleGoToProfile} className='collection-menu-item'>
                    <User size={18} strokeWidth={2} style={{ marginRight: 12 }} />
                    Profile
                </MenuItem>
            </Menu>
        </div>
    );
};

export default PartyHome;
