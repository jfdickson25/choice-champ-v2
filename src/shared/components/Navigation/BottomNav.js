import React, { useState, useTransition, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clapperboard, Gamepad2, Dices, PartyPopper } from 'lucide-react';

import RetroTv from '../Icons/RetroTv';
import './BottomNav.css';

const ICON_SIZE = 32;
const ICON_STROKE = 1.75;

const tabs = [
    { to: '/collections/movie', Icon: Clapperboard, color: '#FCB016', key: 'movie' },
    { to: '/collections/tv',    Icon: RetroTv,      color: '#F04C53', key: 'tv' },
    { to: '/party',             Icon: PartyPopper,  color: '#A855F7', key: 'party' },
    { to: '/collections/board', Icon: Dices,        color: '#45B859', key: 'board' },
    { to: '/collections/game',  Icon: Gamepad2,     color: '#2482C5', key: 'game' },
];

const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isPending, startTransition] = useTransition();
    const [committedPath, setCommittedPath] = useState(location.pathname);
    const [clickedPath, setClickedPath] = useState(null);

    useEffect(() => {
        if (!isPending) {
            setCommittedPath(location.pathname);
            setClickedPath(null);
        }
    }, [isPending, location.pathname]);

    const handleClick = (e, to) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (committedPath === to) return;
        setClickedPath(to);
        startTransition(() => navigate(to));
    };

    return (
        <nav className='bottom-nav'>
            {tabs.map(tab => {
                const isActive = committedPath === tab.to || committedPath.startsWith(tab.to + '/');
                const isLoading = clickedPath === tab.to;
                const isHighlighted = isActive || isLoading;
                const iconStyle = isLoading && !isActive ? { opacity: 0.6 } : undefined;
                return (
                    <a
                        key={tab.key}
                        href={tab.to}
                        onClick={(e) => handleClick(e, tab.to)}
                        className={`bottom-nav-tab ${isHighlighted ? 'bottom-nav-tab-highlighted' : ''}`}
                        style={isHighlighted ? { color: tab.color } : undefined}
                    >
                        <span
                            className='bottom-nav-indicator'
                            style={{
                                backgroundColor: tab.color,
                                opacity: isActive ? 1 : (isLoading ? 0.45 : 0),
                            }}
                        />
                        <tab.Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} style={iconStyle} />
                    </a>
                );
            })}
        </nav>
    );
};

export default BottomNav;
