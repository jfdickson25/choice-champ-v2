import React, { useEffect, useState, useContext } from 'react';
import { BACKEND_URL } from '../../shared/config';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Gamepad2, Dices } from 'lucide-react';

import './CreateParty.css';
import Button from '../../shared/components/FormElements/Button';
import ToggleSwitch from '../../shared/components/ToggleSwitch/ToggleSwitch';
import RetroTv from '../../shared/components/Icons/RetroTv';
import CollectionCard from '../../collections/components/CollectionCard';

import { AuthContext } from '../../shared/context/auth-context';
import Loading from '../../shared/components/Loading';

const MEDIA_TYPES = [
    { key: 'movie', label: 'Movies',      color: '#FCB016', Icon: Clapperboard },
    { key: 'tv',    label: 'TV Shows',    color: '#F04C53', Icon: RetroTv },
    { key: 'board', label: 'Board Games', color: '#45B859', Icon: Dices },
    { key: 'game',  label: 'Video Games', color: '#2482C5', Icon: Gamepad2 },
];

const CreateParty = props => {
    const auth = useContext(AuthContext);

    const [collections, setCollections] = useState([]);
    const [mediaType, setMediaType] = useState('movie');
    const [selectAlert, setSelectAlert] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [secretMode, setSecretMode] = useState(false);
    const [includeWatched, setIncludeWatched] = useState(false);
    const [superChoice, setSuperChoice] = useState(false);
    const [activeMediaType, setActiveMediaType] = useState('movie');
    const [collectionTypeColor, setCollectionTypeColor] = useState('#FCB016');

    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${BACKEND_URL}/collections/movie/${auth.userId}`)
            .then(res => res.json())
            .then(data => {
                setCollections(data.collections);
                setIsLoading(false);
            });
    }, [auth.userId]);

    const loadCollections = (type) => {
        setIsLoading(true);
        setMediaType(type);
        fetch(`${BACKEND_URL}/collections/${type}/${auth.userId}`)
            .then(res => res.json())
            .then(data => {
                setSelectAlert(false);
                setCollections(data.collections);
                setIsLoading(false);
            });
    };

    const selectMediaType = (type) => {
        if(type === activeMediaType) return;
        const media = MEDIA_TYPES.find(m => m.key === type);
        setActiveMediaType(type);
        setCollectionTypeColor(media.color);
        loadCollections(type);
    };

    const toggleCollectionSelection = (collectionId) => {
        if(selectAlert) setSelectAlert(false);
        setCollections(prev =>
            prev.map(collection =>
                collection._id === collectionId
                    ? { ...collection, selected: !collection.selected }
                    : collection
            )
        );
    };

    const navToPartyWait = () => {
        const selected = collections.filter(c => c.selected);
        if(selected.length === 0) {
            setSelectAlert(true);
            return;
        }
        fetch(`${BACKEND_URL}/party`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collections: selected.map(c => c._id),
                mediaType,
                secretMode,
                includeWatched,
                superChoice,
                owner: auth.userId
            })
        })
        .then(res => res.json())
        .then(data => navigate(`/party/wait/${data.partyCode}`));
    };

    const nonEmptyCollections = collections.filter(c => Array.isArray(c.items) && c.items.length > 0);

    return (
        <div className='create-party'>
            <section className='create-party-section'>
                <h2 className='create-party-section-title'>Options</h2>
                <div className='create-options-card'>
                    <div className='create-option'>
                        <div className='create-option-row'>
                            <p className='create-option-text'>Secret Mode</p>
                            <ToggleSwitch
                                checked={secretMode}
                                onChange={setSecretMode}
                                activeColor={collectionTypeColor}
                                ariaLabel='Secret Mode'
                            />
                        </div>
                        <p className='create-option-subtext'>Party members will not see each other's votes</p>
                    </div>
                    <div className='create-option'>
                        <div className='create-option-row'>
                            <p className='create-option-text'>Include Watched</p>
                            <ToggleSwitch
                                checked={includeWatched}
                                onChange={setIncludeWatched}
                                activeColor={collectionTypeColor}
                                ariaLabel='Include Watched'
                            />
                        </div>
                        <p className='create-option-subtext'>Include items that have been marked as watched/played</p>
                    </div>
                    <div className='create-option'>
                        <div className='create-option-row'>
                            <p className='create-option-text'>Super Choice Mode</p>
                            <ToggleSwitch
                                checked={superChoice}
                                onChange={setSuperChoice}
                                activeColor={collectionTypeColor}
                                ariaLabel='Super Choice Mode'
                            />
                        </div>
                        <p className='create-option-subtext'>
                            Double-tap a choice to star it. Starred choices always advance to the next round.
                        </p>
                    </div>
                </div>
            </section>

            <section className='create-party-section'>
                <h2 className='create-party-section-title'>Media Type</h2>
                <div className='create-media-grid'>
                    {MEDIA_TYPES.map(({ key, label, color, Icon }) => {
                        const isActive = activeMediaType === key;
                        return (
                            <button
                                key={key}
                                type='button'
                                className={`create-media-tile ${isActive ? 'is-active' : ''}`}
                                style={isActive
                                    ? { backgroundColor: color, borderColor: color }
                                    : { borderColor: 'rgba(255, 255, 255, 0.12)' }}
                                onClick={() => selectMediaType(key)}
                            >
                                <Icon
                                    size={28}
                                    strokeWidth={1.75}
                                    color={isActive ? '#111' : color}
                                />
                                <span
                                    className='create-media-tile-label'
                                    style={{ color: isActive ? '#111' : '#fff' }}
                                >
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className='create-party-section'>
                <h2 className='create-party-section-title'>Collections</h2>
                {isLoading ? (
                    <div className='create-collections-loading'>
                        <Loading color={collectionTypeColor} type='beat' size={20} />
                    </div>
                ) : nonEmptyCollections.length > 0 ? (
                    <div className='create-collections-list'>
                        {nonEmptyCollections.map(collection => (
                            <CollectionCard
                                key={collection._id}
                                collection={collection}
                                collectionsType={activeMediaType}
                                color={collectionTypeColor}
                                onSelect={toggleCollectionSelection}
                                selected={!!collection.selected}
                            />
                        ))}
                    </div>
                ) : (
                    <p className='create-collections-empty'>No collections found for this media type</p>
                )}
            </section>

            <Button
                type='button'
                className='create-party-submit'
                onClick={navToPartyWait}
                backgroundColor='#000'
                color='#fff'
            >
                Create Party
            </Button>
            {selectAlert && <p className='create-party-alert'>Please select at least one collection</p>}
        </div>
    );
};

export { CreateParty };

export default CreateParty;
