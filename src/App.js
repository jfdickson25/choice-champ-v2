import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { BACKEND_URL } from './shared/config';
import {
  BrowserRouter as Router,
  Route,
  Navigate,
  Routes,
  useParams
} from 'react-router-dom';

import io from 'socket.io-client';

import Loading from './shared/components/Loading';
import BottomNav from './shared/components/Navigation/BottomNav';

import { AuthContext } from './shared/context/auth-context';

// Lazy loading is a way to load a component only when it is needed. 
// This is useful for components that are not needed right away, but are needed later on. 
// This can help with performance by only loading what is needed at the time.
const Collection = lazy(() => import('./collection/pages/Collection'));
const Search = lazy(() => import('./collection/pages/Search'));
const Auth = lazy(() => import('./user/pages/Auth'));
const Welcome = lazy(() => import('./welcome/pages/Welcome'));
const PartyHome = lazy(() => import('./party/pages/PartyHome'));
const PartyWait = lazy(() => import('./party/pages/PartyWait'));
const Party = lazy(() => import('./party/pages/Party'));
const JoinParty = lazy(() => import('./party/pages/JoinParty'));
const Profile = lazy(() => import('./profile/pages/Profile'));
const Attribution = lazy(() => import('./profile/pages/Attribution'));
const Contact = lazy(() => import('./profile/pages/Contact'));
const MediaTab = lazy(() => import('./mediaTab/MediaTab'));

const MediaTabByType = () => {
  const { type } = useParams();
  return <MediaTab key={type} />;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState(null);
  const [socket, setSocket] = useState(null);

  const [loading, setLoading] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [animateInstallPrompt, setAnimateInstallPrompt] = useState(false); // Used to animate the install prompt when it is shown
  let defeferredPrompt = useRef(null);

  const [showFooter, setShowFooter] = useState(false);

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    const storedUsername = localStorage.getItem('username');
    const neverShowAppInstallBanner = localStorage.getItem('neverShowAppInstallBanner');

    if(storedUserId) {
      fetch(`${BACKEND_URL}/user/${storedUserId}`)
      .then(response => {
        if(response.status === 200) {
          return response.json();
        }
        return null;
      })
      .then(body => {
        if(body) {
          setUserId(storedUserId);
          setUsername(body.username);
          localStorage.setItem('username', body.username);
          setIsLoggedIn(true);
          setLoading(false);

          if(!neverShowAppInstallBanner) {
            window.addEventListener('beforeinstallprompt', (e) => {
              // Prevent the mini-infobar from appearing on mobile
              e.preventDefault();
              // Stash the event so it can be triggered later.
              defeferredPrompt.current = e;

              setShowInstallPrompt(true);

              setTimeout(() => {
                setAnimateInstallPrompt(true);
              }, 1000);
            });
          }
        }
      })
      .catch(err => {
        console.log(err);
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        setLoading(false);
      });

      if(storedUsername) {
        setUsername(storedUsername);
      }
    } else {
      setIsLoggedIn(false);
      setLoading(false);

      if(!neverShowAppInstallBanner) {
        window.addEventListener('beforeinstallprompt', (e) => {
          // Prevent the mini-infobar from appearing on mobile
          e.preventDefault();
          // Stash the event so it can be triggered later.
          defeferredPrompt.current = e;

          setShowInstallPrompt(true);

          setTimeout(() => {
            setAnimateInstallPrompt(true);
          }, 1000);
        });
      }
    }
  }, []);

  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const login = useCallback(() => {
    setIsLoggedIn(true);
  }, [])

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setUserId(null);
    setUsername(null);
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
  }, []);

  const userIdSetter = useCallback((id) => {
    setUserId(id);
  }, []);

  const usernameSetter = useCallback((name) => {
    setUsername(name);
    if(name) {
      localStorage.setItem('username', name);
    } else {
      localStorage.removeItem('username');
    }
  }, []);

  const showFooterHandler = useCallback((show) => {
    setShowFooter(show);
  }, []);

  const authValue = useMemo(
    () => ({ isLoggedIn, userId, username, userIdSetter, usernameSetter, login, logout, showFooterHandler }),
    [isLoggedIn, userId, username, userIdSetter, usernameSetter, login, logout, showFooterHandler]
  );

  const installApp = () => {
    setShowInstallPrompt(false);

    defeferredPrompt.current.prompt();
    defeferredPrompt.current.userChoice.then((choiceResult) => {
      if(choiceResult.outcome === 'accepted') {
        neverShowInstallPrompt();
      } else {
        console.log('User dismissed the install prompt');
      }
    });
  }

  const neverShowInstallPrompt = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('neverShowAppInstallBanner', true);
  }

  let routes;
  if(isLoggedIn) {
    routes = (
      // Using Suspense inside a switch caused issues with redirecting. Solution found in this stack overflow article:
      // https://stackoverflow.com/questions/62193855/react-lazy-loaded-route-makes-redirecting-non-matching-routes-to-404-not-work
      <Suspense fallback={<Loading color='#FCB016' className='page-loading' size={100} />}>
        <Routes>
          <Route path="/welcome/info" element={<Welcome />} exact />
          <Route path="/collections/:type" element={<MediaTabByType />} exact />
          <Route path="/collections/:type/:id" element={<Collection socket={socket} />} exact />
          <Route path="/collections/:type/:id/add" element={<Search socket={socket} />} exact />
          <Route path="/party" element={<PartyHome />} exact />
          <Route path="/party/wait/:code" element={<PartyWait socket={socket} />} exact />
          <Route path="/party/:code" element={<Party socket={socket} />} exact />
          <Route path="/profile" element={<Profile />} exact />
          <Route path="/profile/attribution" element={<Attribution />} exact />
          <Route path="/profile/contact" element={<Contact />} exact />
          <Route path="*" element={<Navigate to="/collections/movie" />} />
        </Routes>
      </Suspense>
    )
  } else {
    routes = (
      <Suspense fallback={<Loading color='#FCB016' />}>
        <Routes>
            <Route path="/" element={<Auth />} exact />
            <Route path="/party/joinParty" element={<JoinParty />} exact />
            <Route path="/party/wait/:code" element={<PartyWait socket={socket} />} exact />
            <Route path="/party/:code" element={<Party socket={socket} />} exact />
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    )
  }

  let footer;

  if(showFooter && isLoggedIn) {
    footer = <BottomNav />
  }


  return (
    <AuthContext.Provider value={authValue}>
      <Router>
        <main>
          {loading && <Loading color='#FCB016' className='page-loading' size={100} />}
          {!loading && routes}
          {
            (!loading && showInstallPrompt) && (
              <div id='download-banner' 
                // If the install prompt is being animated, use transform to translateX 100vw with a transition of 2s
                // Otherwise, use display: none
                style={animateInstallPrompt && !isLoggedIn ? { transform: 'translateX(100vw)', transition: 'transform .5s ease-in-out', top: '0', bottom: 'unset' } : (isLoggedIn ? { transform: 'translateX(100vw)', transition: 'transform .5s ease-in-out', top: 'unset' } : null )}
              >
                  <p id="install-prompt">Install Choice Champ?</p>
                  <p id="install-yes" onClick={installApp}>YES</p>
                  <p id="install-later" onClick={() => {setShowInstallPrompt(false)}}>LATER</p>
                  <p id="install-never" onClick={neverShowInstallPrompt}>NEVER</p>
              </div>
            )
          }
          {!loading && footer}
        </main>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
