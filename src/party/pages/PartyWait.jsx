import React, { useEffect, useState, useContext, useRef } from 'react';
import { api } from '../../shared/lib/api';
import { supabase } from '../../shared/lib/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Trophy, Dices, Flag, Star } from 'lucide-react';
import { AuthContext } from '../../shared/context/auth-context';

import Loading from '../../shared/components/Loading';
import Button from '../../shared/components/FormElements/Button';

import './PartyWait.css';

const MEDIA_COLORS = {
    movie: '#FCB016',
    tv:    '#F04C53',
    game:  '#2482C5',
    board: '#45B859',
};

const PartyWait = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const { code } = useParams();

    const [memberCount, setMemberCount] = useState(0);
    const [userType, setUserType] = useState('guest');
    const [superChoiceEnabled, setSuperChoiceEnabled] = useState(false);
    const [mediaType, setMediaType] = useState('');
    const channelRef = useRef(null);

    useEffect(() => {
        auth.showFooterHandler(false);
        api(`/party/${code}?userId=${auth.userId}`)
            .then(body => {
                setMediaType(body.party.mediaType);
                if(body.party.superChoice) setSuperChoiceEnabled(true);
                if(body.owner) setUserType('owner');
            })
            .catch(err => console.log(err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Realtime channel for the waiting room. Presence tracks who's here;
    // broadcast handles state transitions (start, party-deleted).
    useEffect(() => {
        const presenceKey = auth.userId || `guest-${Math.random().toString(36).slice(2, 10)}`;
        const channel = supabase.channel(`party-wait:${code}`, {
            config: { presence: { key: presenceKey }, broadcast: { self: false } },
        });

        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            setMemberCount(Object.keys(state).length);
        });

        channel.on('broadcast', { event: 'start' }, () => {
            navigate(`/party/${code}`);
        });

        channel.on('broadcast', { event: 'deleted' }, () => {
            navigate('/party');
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') channel.track({ joined_at: new Date().toISOString() });
        });
        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, [code, auth.userId, navigate]);

    const routeToParty = async () => {
        await channelRef.current?.send({ type: 'broadcast', event: 'start', payload: {} });
        navigate(`/party/${code}`);
    };

    const navBack = async () => {
        if(userType === 'owner') {
            await api(`/party/${code}`, { method: 'DELETE' }).catch(err => console.log(err));
            await channelRef.current?.send({ type: 'broadcast', event: 'deleted', payload: {} });
        }
        navigate('/party');
    };

    const accentColor = MEDIA_COLORS[mediaType] || '#A855F7';
    const showTips = userType === 'owner' || superChoiceEnabled;

    return (
        <div className='content party-wait'>
            <div className='party-wait-sticky-header'>
                <button className='icon-btn' onClick={navBack} aria-label='Cancel party'>
                    <X size={22} strokeWidth={2} />
                </button>
                <h1 className='party-wait-header-title'>Party Lobby</h1>
                <span className='party-wait-header-spacer' />
            </div>

            <div className='party-wait-hero'>
                <Trophy size={72} strokeWidth={1.5} color={accentColor} />
            </div>

            <div className='party-wait-card'>
                <div className='party-wait-row'>
                    <span className='party-wait-row-label'>Party Code</span>
                    <span className='party-wait-row-value' style={{ color: accentColor }}>{code}</span>
                </div>
                <div className='party-wait-row'>
                    <span className='party-wait-row-label'>Members</span>
                    <span className='party-wait-row-value'>{memberCount}</span>
                </div>
            </div>

            {showTips && (
                <section className='party-wait-tips-section'>
                    <h2 className='party-wait-tips-title'>Tips</h2>
                    <div className='party-wait-tips-card'>
                        {userType === 'owner' && (
                            <div className='party-wait-tip'>
                                <Dices size={22} strokeWidth={1.75} color={accentColor} />
                                <p>Tap this icon during voting to randomly select a winner from the remaining items.</p>
                            </div>
                        )}
                        {userType === 'owner' && (
                            <div className='party-wait-tip'>
                                <Flag size={22} strokeWidth={1.75} color={accentColor} />
                                <p>End voting early. Remaining items can be exported to a new collection.</p>
                            </div>
                        )}
                        {superChoiceEnabled && (
                            <div className='party-wait-tip'>
                                <Star size={22} strokeWidth={1.75} color={accentColor} />
                                <p>Super Choice is on. Double-tap an item to star it — starred items always advance to the next round (one per party).</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {userType === 'owner' && (
                <Button
                    className='party-wait-start-btn'
                    onClick={routeToParty}
                    backgroundColor={accentColor}
                    color='#111'
                >
                    Start Party
                </Button>
            )}

            <div className='party-wait-status'>
                <Loading color={accentColor} type='beat' size={14} speed={0.5} />
                <span className='party-wait-status-text'>
                    {userType === 'owner' ? 'Ready when you are' : 'Waiting for the host to start…'}
                </span>
            </div>
        </div>
    );
};

export default PartyWait;
