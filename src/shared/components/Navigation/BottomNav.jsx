import React, { useState, useTransition, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { MEDIA_TYPE_ORDER, MEDIA_TYPES } from '../../lib/mediaTypes';
import './BottomNav.css';

const ICON_SIZE = 32;
const ICON_STROKE = 1.75;

// nudgeY shifts certain icons down a few pixels so their optical centers
// align with the others. RetroTv's body sits high (antennae fill the
// upper space) and Gamepad2's grip is bottom-heavy — both feel "too
// high" when sized identically with Clapperboard / Dices / BookOpen.
const NUDGE_Y = { tv: 3, game: 3 };

const tabs = MEDIA_TYPE_ORDER.map(key => ({
    key,
    to: `/collections/${key}`,
    Icon: MEDIA_TYPES[key].Icon,
    color: MEDIA_TYPES[key].color,
    nudgeY: NUDGE_Y[key],
}));

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
                const iconStyle = {
                    ...(tab.nudgeY ? { transform: `translateY(${tab.nudgeY}px)` } : {}),
                    ...(isLoading && !isActive ? { opacity: 0.6 } : {}),
                };
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
