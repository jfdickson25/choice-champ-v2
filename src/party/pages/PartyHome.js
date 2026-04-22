import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/auth-context';

import './PartyHome.css';
import Button from '../../shared/components/FormElements/Button';

const PartyHome = props => {
    const auth = useContext(AuthContext);
    const [online, setOnline] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        auth.showFooterHandler(true);
        if (!navigator.onLine) {
            setOnline(false);
        }
    }, [auth]);

    const navCreateParty = () => {
        navigate('/party/createParty');
    }

    const navJoinParty = () => {
        navigate('/party/joinParty');
    }

    return (
        <React.Fragment>
            <div className='content'>
                { online ? (
                    <React.Fragment>
                        <img src={`${process.env.PUBLIC_URL}/img/Choice-Champ-Party-Home-Img.png`} className="party-img" alt='Movie night'/>
                        <div className='party-home'>
                            <Button className="party-btn" type="button" onClick={navCreateParty}>Create Party</Button>
                        </div>
                        <div className='party-home'>
                            <Button className="party-btn" type="button" onClick={navJoinParty}>Join Party</Button>
                        </div>
                    </React.Fragment>
                ) : <div className='offline-msg'>No internet</div>
                }
            </div>
        </React.Fragment>
    );
}

export default PartyHome;