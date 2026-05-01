import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, X, User } from 'lucide-react';

import Loading from '../../shared/components/Loading';
import { AuthContext } from '../../shared/context/auth-context';
import { BACKEND_URL } from '../../shared/config';
import './CastDetail.css';

const CastDetail = () => {
    const auth = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const { personId } = useParams();
    // Originator chains through every drill (item -> cast -> credit -> ...)
    // so the X button always returns to the original entry point.
    const originator = location.state?.originator || null;

    const [person, setPerson] = useState(null);
    const [filmography, setFilmography] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bioExpanded, setBioExpanded] = useState(false);

    useEffect(() => {
        auth.showFooterHandler(false);
        return () => auth.showFooterHandler(true);
    }, [auth]);

    useEffect(() => {
        if (!personId) return;
        let cancelled = false;
        setLoading(true);

        fetch(`${BACKEND_URL}/media/person/${personId}`)
            .then(res => res.json())
            .then(data => {
                if (cancelled) return;
                setPerson(data.person || null);
                setFilmography(Array.isArray(data.filmography) ? data.filmography : []);
                setLoading(false);
            })
            .catch(err => {
                console.log(err);
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [personId]);

    const openCredit = (credit) => {
        const inheritedOriginator = originator || `${location.pathname}${location.search}`;
        navigate(`/items/${credit.type}/${credit.id}`, {
            state: { originator: inheritedOriginator },
        });
    };

    const subtitle = person ? [
        person.knownFor,
        person.placeOfBirth,
    ].filter(Boolean).join(' · ') : '';

    return (
        <div className='content cast-detail-page'>
            <div className='floating-topbar'>
                <button className='icon-btn icon-btn-floating' onClick={() => navigate(-1)} aria-label='Back'>
                    <ArrowLeft size={22} strokeWidth={1.75} />
                </button>
                {originator ? (
                    <button
                        className='icon-btn icon-btn-floating'
                        onClick={() => navigate(originator)}
                        aria-label='Close and return to original page'
                    >
                        <X size={22} strokeWidth={1.75} />
                    </button>
                ) : <span />}
            </div>

            {loading ? (
                <div className='cast-detail-loading'>
                    <Loading type='beat' size={20} />
                </div>
            ) : person ? (
                <React.Fragment>
                    <div className='cast-detail-hero'>
                        <div className='cast-detail-avatar-wrap'>
                            {person.profile ? (
                                <img className='cast-detail-avatar' src={person.profile} alt={person.name} />
                            ) : (
                                <div className='cast-detail-avatar cast-detail-avatar-fallback'>
                                    <User size={56} strokeWidth={1.5} />
                                </div>
                            )}
                        </div>
                        <h1 className='cast-detail-name'>{person.name}</h1>
                        {subtitle && <p className='cast-detail-subtitle'>{subtitle}</p>}
                    </div>

                    {person.biography && (
                        <section className='cast-detail-section'>
                            <h2 className='cast-detail-section-title'>Biography</h2>
                            <div className='cast-detail-card'>
                                <p className={`cast-detail-bio ${bioExpanded ? 'is-expanded' : ''}`}>
                                    {person.biography}
                                </p>
                                {person.biography.length > 240 && (
                                    <button
                                        type='button'
                                        className='cast-detail-bio-toggle'
                                        onClick={() => setBioExpanded(v => !v)}
                                    >
                                        {bioExpanded ? 'Show less' : 'Read more'}
                                    </button>
                                )}
                            </div>
                        </section>
                    )}

                    {filmography.length > 0 && (
                        <section className='cast-detail-section'>
                            <h2 className='cast-detail-section-title'>Filmography</h2>
                            <div className='cast-detail-grid'>
                                {filmography.map(credit => (
                                    <button
                                        key={`${credit.type}-${credit.id}`}
                                        type='button'
                                        className='cast-detail-credit'
                                        onClick={() => openCredit(credit)}
                                        aria-label={`Open ${credit.title}`}
                                    >
                                        <div className='cast-detail-credit-poster-wrap'>
                                            {credit.poster ? (
                                                <img
                                                    className='cast-detail-credit-poster'
                                                    src={credit.poster}
                                                    alt={credit.title}
                                                    loading='lazy'
                                                />
                                            ) : (
                                                <div className='cast-detail-credit-poster cast-detail-credit-poster-fallback' />
                                            )}
                                        </div>
                                        <div className='cast-detail-credit-title' title={credit.title}>{credit.title}</div>
                                        {(credit.character || credit.year) && (
                                            <div className='cast-detail-credit-meta'>
                                                {credit.character && <span className='cast-detail-credit-character'>{credit.character}</span>}
                                                {credit.character && credit.year && <span className='cast-detail-credit-dot'> · </span>}
                                                {credit.year && <span className='cast-detail-credit-year'>{credit.year}</span>}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </React.Fragment>
            ) : (
                <div className='cast-detail-empty'>Couldn't load this person.</div>
            )}
        </div>
    );
};

export default CastDetail;
