import React from 'react';
import { Play } from 'lucide-react';
import './TrailerButton.css';

const TrailerButton = ({ trailer, accentColor }) => {
    if (!trailer?.key) return null;

    // youtu.be deeplink. On iOS / Android with the YouTube app
    // installed, the OS opens the app; otherwise it falls back to the
    // mobile web player. Opening in a new tab keeps the user's
    // ItemDetails state intact so coming back doesn't refetch.
    const url = `https://www.youtube.com/watch?v=${trailer.key}`;

    return (
        <a
            className='trailer-button'
            href={url}
            target='_blank'
            rel='noopener noreferrer'
            style={{ backgroundColor: accentColor }}
            aria-label={`Watch trailer: ${trailer.name}`}
        >
            <Play size={18} fill='#111' stroke='#111' />
            <span>Watch Trailer</span>
        </a>
    );
};

export default TrailerButton;
