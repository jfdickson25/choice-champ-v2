import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@mui/material';
import {
    LogOut,
    ChevronRight,
    Clapperboard,
    Gamepad2,
    Dices
} from 'lucide-react';

import { api } from '../../shared/lib/api';
import { AuthContext } from '../../shared/context/auth-context';
import RetroTv from '../../shared/components/Icons/RetroTv';
import Button from '../../shared/components/FormElements/Button';

import './Profile.css';

const memberSinceFromIso = (iso) => {
    if(!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
};

const formatMemberFor = (since) => {
    if(!since) return null;
    const now = new Date();
    let years = now.getFullYear() - since.getFullYear();
    let months = now.getMonth() - since.getMonth();
    if(now.getDate() < since.getDate()) months -= 1;
    if(months < 0) {
        years -= 1;
        months += 12;
    }
    if(years <= 0 && months <= 0) return 'Member since today';
    const parts = [];
    if(years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
    if(months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
    return `Member for ${parts.join(', ')}`;
};

const MEDIA_STATS = [
    { key: 'movie', label: 'Movies',       action: 'watched', color: '#FCB016', Icon: Clapperboard },
    { key: 'tv',    label: 'TV Shows',     action: 'watched', color: '#F04C53', Icon: RetroTv },
    { key: 'board', label: 'Board Games',  action: 'played',  color: '#45B859', Icon: Dices },
    { key: 'game',  label: 'Video Games',  action: 'played',  color: '#2482C5', Icon: Gamepad2 },
];

const pluralize = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const Profile = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');

    useEffect(() => {
        auth.showFooterHandler(true);
    }, [auth]);

    useEffect(() => {
        if(!auth.userId) return;
        api('/user/me')
            .then(body => setStats(body))
            .catch(err => console.log(err));
    }, [auth.userId]);

    const closeDeleteDialog = () => {
        setDeleteOpen(false);
        setDeleteConfirm('');
    };

    const deleteAccount = () => {
        api('/user/me', { method: 'DELETE' })
            .then(() => auth.logout())
            .catch(err => console.log(err));
    };

    const canDelete = auth.username && deleteConfirm === auth.username;
    const memberSince = memberSinceFromIso(stats?.created_at);
    const memberFor = formatMemberFor(memberSince);

    return (
        <React.Fragment>
            <div className='content profile-content'>
                <div className='profile-topbar'>
                    <button
                        type='button'
                        className='icon-btn'
                        onClick={() => setLogoutOpen(true)}
                        aria-label='Logout'
                    >
                        <LogOut size={22} strokeWidth={1.75} />
                    </button>
                </div>

                <header className='profile-header'>
                    <h1 className='profile-username'>{auth.username || 'Your Profile'}</h1>
                    {memberFor && <p className='profile-member-for'>{memberFor}</p>}
                </header>

                <section className='profile-section'>
                    <h2 className='profile-section-title'>Collection Stats</h2>
                    <div className='profile-stat-grid'>
                        {MEDIA_STATS.map(({ key, label, color, Icon }) => {
                            const count = stats?.counts?.[key];
                            return (
                                <div key={key} className='profile-stat-card'>
                                    <div className='profile-stat-head'>
                                        <Icon size={22} strokeWidth={1.75} color={color} />
                                        <span className='profile-stat-heading'>{label}</span>
                                    </div>
                                    <span className='profile-stat-sub'>
                                        {count === undefined || count === null ? '—' : pluralize(count, 'collection')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className='profile-section'>
                    <h2 className='profile-section-title'>Progress</h2>
                    <div className='profile-activity'>
                        {MEDIA_STATS.map(({ key, label, action, color, Icon }) => {
                            const p = stats?.progress?.[key];
                            const hasData = p && p.total > 0;
                            return (
                                <div key={key} className='profile-activity-row'>
                                    <Icon size={22} strokeWidth={1.75} color={color} />
                                    <div className='profile-activity-text'>
                                        <span className='profile-activity-title'>{label}</span>
                                        <span className='profile-activity-detail'>
                                            {hasData
                                                ? `${p.watched} of ${p.total} ${action}`
                                                : (p ? `No items yet` : '—')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className='profile-section'>
                    <div className='profile-link-list'>
                        <button
                            type='button'
                            className='profile-link-row'
                            onClick={() => navigate('/profile/attribution')}
                        >
                            <span>Attributions</span>
                            <ChevronRight size={20} strokeWidth={1.75} />
                        </button>
                        <button
                            type='button'
                            className='profile-link-row'
                            onClick={() => navigate('/profile/contact')}
                        >
                            <span>Contact</span>
                            <ChevronRight size={20} strokeWidth={1.75} />
                        </button>
                    </div>
                </section>

                <section className='profile-section profile-danger-section'>
                    <button
                        type='button'
                        className='profile-danger-link'
                        onClick={() => setDeleteOpen(true)}
                    >
                        Delete Account
                    </button>
                </section>
            </div>

            <Dialog open={logoutOpen} onClose={() => setLogoutOpen(false)} fullWidth maxWidth='xs'>
                <div className='profile-confirm'>
                    <h2>Log out?</h2>
                    <p>You'll need to sign in again to get back to your collections.</p>
                    <div className='profile-confirm-buttons'>
                        <Button onClick={() => setLogoutOpen(false)}>Cancel</Button>
                        <Button onClick={auth.logout} backgroundColor='#b31212'>Log out</Button>
                    </div>
                </div>
            </Dialog>

            <Dialog open={deleteOpen} onClose={closeDeleteDialog} fullWidth maxWidth='xs'>
                <div className='profile-confirm'>
                    <h2>Delete account?</h2>
                    <p>This permanently removes your account and any collections only you own. This can't be undone.</p>
                    <p className='profile-confirm-prompt'>
                        Type <strong>{auth.username}</strong> to confirm.
                    </p>
                    <input
                        className='profile-confirm-input'
                        type='text'
                        autoComplete='off'
                        autoCapitalize='off'
                        autoCorrect='off'
                        spellCheck='false'
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder={auth.username || ''}
                    />
                    <div className='profile-confirm-buttons'>
                        <Button onClick={closeDeleteDialog}>Cancel</Button>
                        <Button
                            onClick={deleteAccount}
                            backgroundColor={canDelete ? '#b31212' : '#5a2222'}
                            disabled={!canDelete}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    );
};

export default Profile;
