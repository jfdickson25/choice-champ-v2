import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@mui/material';
import { LogOut, ChevronRight } from 'lucide-react';

import { api } from '../../shared/lib/api';
import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';
import { MEDIA_TYPES, MEDIA_TYPE_ORDER } from '../../shared/lib/mediaTypes';

import './Profile.css';

const memberSinceFromIso = (iso) => {
    if(!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
};

// "Member since April 2026" — month-and-year is unambiguous and
// doesn't need to fight with day-of-month arithmetic. The previous
// "Member for X years, Y months" formulation broke when the current
// day-of-month was earlier than the signup day-of-month: it would
// decrement months back to 0 and fall through to "Member since
// today" even for accounts weeks old.
const MEMBER_SINCE_FORMATTER = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
});

const formatMemberFor = (since) => {
    if(!since) return null;
    return `Member since ${MEMBER_SINCE_FORMATTER.format(since)}`;
};

// Profile shows the same five types as the bottom nav, sorted in the
// same display order so the stats grid mirrors what the user sees in
// the nav. Pulls everything (label, icon, color, verb) from the shared
// MEDIA_TYPES config — no need for a duplicate map.
const MEDIA_STATS = MEDIA_TYPE_ORDER.map(key => ({
    key,
    label:  MEDIA_TYPES[key].title,
    action: MEDIA_TYPES[key].action,
    color:  MEDIA_TYPES[key].color,
    Icon:   MEDIA_TYPES[key].Icon,
}));

const pluralize = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const Profile = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [logoutOpen, setLogoutOpen] = useState(false);

    useEffect(() => {
        auth.showFooterHandler(true);
    }, [auth]);

    useEffect(() => {
        if(!auth.userId) return;
        api('/user/me')
            .then(body => setStats(body))
            .catch(err => console.log(err));
    }, [auth.userId]);

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

                {stats === null ? (
                    <div className='profile-loading'>
                        <Loading color='#FCB016' type='beat' size={20} />
                    </div>
                ) : (
                <React.Fragment>
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
                    <div className='profile-progress'>
                        {stats && (stats.collections?.length ?? 0) === 0 && (
                            <p className='profile-progress-empty'>No collections yet</p>
                        )}
                        {MEDIA_STATS.map(({ key, label, action, color, Icon }) => {
                            const collections = (stats?.collections || []).filter(c => c.type === key);
                            if (collections.length === 0) return null;
                            return (
                                <div key={key} className='profile-progress-group'>
                                    <div className='profile-progress-group-head'>
                                        <Icon size={20} strokeWidth={1.75} color={color} />
                                        <span className='profile-progress-group-label'>{label}</span>
                                    </div>
                                    <div className='profile-progress-list'>
                                        {collections.map(c => {
                                            const isEmpty = c.total === 0;
                                            const isComplete = !isEmpty && c.complete === c.total;
                                            return (
                                                <button
                                                    key={c.id}
                                                    type='button'
                                                    className='profile-progress-row'
                                                    onClick={() => navigate(`/collections/${c.type}/${c.id}`)}
                                                >
                                                    <span className='profile-progress-row-name'>{c.name}</span>
                                                    <span
                                                        className='profile-progress-row-detail'
                                                        style={isComplete ? { color } : undefined}
                                                    >
                                                        {isEmpty
                                                            ? 'Empty'
                                                            : `${c.complete} of ${c.total} ${action}`}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
                </React.Fragment>
                )}

                <section className='profile-section'>
                    <div className='profile-link-list'>
                        <button
                            type='button'
                            className='profile-link-row'
                            onClick={() => navigate('/profile/settings')}
                        >
                            <span>Settings</span>
                            <ChevronRight size={20} strokeWidth={1.75} />
                        </button>
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
            </div>

            <Dialog
                open={logoutOpen}
                onClose={() => setLogoutOpen(false)}
                fullWidth
                maxWidth='xs'
                PaperProps={{ className: 'cc-dialog-paper' }}
            >
                <div className='cc-dialog'>
                    <h3 className='cc-dialog-title'>Log out?</h3>
                    <p className='cc-dialog-subtitle'>You'll need to sign in again to get back to your collections.</p>
                    <div className='cc-dialog-actions'>
                        <button type='button' className='cc-dialog-btn cc-dialog-btn-secondary' onClick={() => setLogoutOpen(false)}>Cancel</button>
                        <button type='button' className='cc-dialog-btn cc-dialog-btn-danger' onClick={auth.logout}>Log out</button>
                    </div>
                </div>
            </Dialog>

        </React.Fragment>
    );
};

export default Profile;
