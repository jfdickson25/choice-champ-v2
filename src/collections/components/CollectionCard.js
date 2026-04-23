import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

import './CollectionCard.css';

const MAX_PREVIEW_POSTERS = 4;

const CollectionCard = ({ collection, collectionsType, color, interactive = true, onSelect, selected }) => {
    const items = Array.isArray(collection.items) ? collection.items : [];
    const previewItems = items.filter(item => item && item.poster).slice(0, MAX_PREVIEW_POSTERS);
    const itemCount = items.length;

    const content = (
        <>
            <div className='collection-card-accent' style={{ backgroundColor: color }} />
            <div className='collection-card-content'>
                <div className='collection-card-name'>{collection.name}</div>
                <div className='collection-card-meta'>
                    {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Empty'}
                </div>
            </div>
            {previewItems.length > 0 && (
                <div className='collection-card-posters'>
                    {previewItems.map((item, i) => (
                        <img
                            key={item._id || item.itemId || i}
                            src={item.poster}
                            alt=''
                            className='collection-card-poster'
                            loading='lazy'
                        />
                    ))}
                </div>
            )}
            {onSelect && (
                <span
                    className={`collection-card-check ${selected ? 'is-selected' : ''}`}
                    style={selected && color ? { backgroundColor: color, borderColor: color } : undefined}
                    aria-hidden='true'
                >
                    {selected && <Check size={14} strokeWidth={3} color='#000' />}
                </span>
            )}
        </>
    );

    if (onSelect) {
        return (
            <button
                type='button'
                className={`collection-card collection-card-selectable ${selected ? 'collection-card-selected' : ''}`}
                style={selected && color ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
                onClick={() => onSelect(collection._id)}
                aria-pressed={!!selected}
            >
                {content}
            </button>
        );
    }

    if (interactive) {
        return (
            <Link
                to={`/collections/${collectionsType}/${collection._id}`}
                className='collection-card'
            >
                {content}
            </Link>
        );
    }

    return <div className='collection-card collection-card-static'>{content}</div>;
};

export default CollectionCard;
