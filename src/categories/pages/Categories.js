import React, { useContext, useEffect } from 'react';
import Category from '../components/Category';
import { AuthContext } from '../../shared/context/auth-context';

import './Categories.css';

// DONE
const CollectionsHome = props => {
    const auth = useContext(AuthContext);

    useEffect(() => {
        auth.showFooterHandler(true);
    }, []);

    return (
        <React.Fragment>
            <div className="content" style={{paddingBottom: '0px'}}>
                <img src="/Logo/choice-champ-title.png" id="choice-champ-header" />
                <div id="categories">
                    <Category id="movie" title="MOVIES" />
                    <Category id="tv" title="TV" />
                    <Category id="game" title="GAMES" />
                    <Category id="board" title="BOARD" />
                </div>
            </div>
        </React.Fragment>
    );
}

export default CollectionsHome;