import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Navigate,
  Routes,
  useParams
} from 'react-router-dom';

import Loading from './shared/components/Loading';
import BottomNav from './shared/components/Navigation/BottomNav';
import ErrorBoundary from './shared/components/ErrorBoundary';

import { AuthContext } from './shared/context/auth-context';
import { supabase } from './shared/lib/supabase';

// After a deploy, the user's still-open tab references the previous
// content-hashed chunk filenames. When they navigate to a not-yet-
// loaded lazy route, the browser tries to fetch the old chunk URL.
// Vercel's SPA fallback returns index.html, which the browser refuses
// to execute as a module ('text/html' is not a valid JavaScript MIME
// type). Catch that failure and hard-reload so the new index.html is
// picked up. The sessionStorage guard prevents an infinite reload loop
// if the failure is for some other reason; it's cleared on next
// successful mount so the next deploy can trigger a reload again.
const RELOAD_GUARD_KEY = 'cc:chunk-reload-attempted';

const lazyWithReload = (loader) =>
  lazy(async () => {
    try {
      return await loader();
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        window.location.reload();
        // Keep Suspense pending while the page reloads.
        return new Promise(() => {});
      }
      throw err;
    }
  });

const Collection = lazyWithReload(() => import('./collection/pages/Collection'));
const ItemDetails = lazyWithReload(() => import('./collection/pages/ItemDetails'));
const Auth = lazyWithReload(() => import('./user/pages/Auth'));
const PasswordReset = lazyWithReload(() => import('./user/pages/PasswordReset'));
const PartyHome = lazyWithReload(() => import('./party/pages/PartyHome'));
const PartyWait = lazyWithReload(() => import('./party/pages/PartyWait'));
const Party = lazyWithReload(() => import('./party/pages/Party'));
const JoinParty = lazyWithReload(() => import('./party/pages/JoinParty'));
const Profile = lazyWithReload(() => import('./profile/pages/Profile'));
const Attribution = lazyWithReload(() => import('./profile/pages/Attribution'));
const Contact = lazyWithReload(() => import('./profile/pages/Contact'));
const Settings = lazyWithReload(() => import('./profile/pages/Settings'));
const MediaTab = lazyWithReload(() => import('./mediaTab/MediaTab'));

const MediaTabByType = () => {
  const { type } = useParams();
  return <MediaTab key={type} />;
};

function App() {
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState(null);

  const [loading, setLoading] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [animateInstallPrompt, setAnimateInstallPrompt] = useState(false);
  let defeferredPrompt = useRef(null);

  const [showFooter, setShowFooter] = useState(false);

  const isLoggedIn = userId !== null;

  const applyProfile = useCallback(async (session) => {
    if (!session) {
      setUserId(null);
      setUsername(null);
      return;
    }
    setUserId(session.user.id);
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .maybeSingle();
    setUsername(profile?.username ?? session.user.email);
  }, []);

  useEffect(() => {
    // The app mounted successfully, so any prior chunk-load failure has
    // been resolved. Clear the guard so the next stale-deploy crash can
    // trigger another reload.
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      applyProfile(session).finally(() => mounted && setLoading(false));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyProfile(session);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applyProfile]);


  useEffect(() => {
    const neverShowAppInstallBanner = localStorage.getItem('neverShowAppInstallBanner');
    if (neverShowAppInstallBanner) return;
    const handler = (e) => {
      e.preventDefault();
      defeferredPrompt.current = e;
      setShowInstallPrompt(true);
      setTimeout(() => setAnimateInstallPrompt(true), 1000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const showFooterHandler = useCallback((show) => {
    setShowFooter(show);
  }, []);

  // Re-pull the user's profile from Supabase. Used after Settings
  // updates the username so the rest of the app sees the change
  // without waiting for the next sign-in.
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await applyProfile(session);
  }, [applyProfile]);

  const authValue = useMemo(
    () => ({ isLoggedIn, userId, username, logout, showFooterHandler, refreshProfile }),
    [isLoggedIn, userId, username, logout, showFooterHandler, refreshProfile]
  );

  const installApp = () => {
    setShowInstallPrompt(false);
    defeferredPrompt.current.prompt();
    defeferredPrompt.current.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        neverShowInstallPrompt();
      } else {
        console.log('User dismissed the install prompt');
      }
    });
  };

  const neverShowInstallPrompt = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('neverShowAppInstallBanner', true);
  };

  let routes;
  if (isLoggedIn) {
    routes = (
      <Suspense fallback={<Loading color='#FCB016' className='page-loading' />}>
        <Routes>
          <Route path="/collections/:type" element={<MediaTabByType />} exact />
          <Route path="/collections/:type/:id" element={<Collection />} exact />
          <Route path="/items/:type/:itemId" element={<ItemDetails />} exact />
          <Route path="/party" element={<PartyHome />} exact />
          <Route path="/party/wait/:code" element={<PartyWait />} exact />
          <Route path="/party/:code" element={<Party />} exact />
          <Route path="/profile" element={<Profile />} exact />
          <Route path="/profile/attribution" element={<Attribution />} exact />
          <Route path="/profile/contact" element={<Contact />} exact />
          <Route path="/profile/settings" element={<Settings />} exact />
          <Route path="/password-reset" element={<PasswordReset />} exact />
          <Route path="*" element={<Navigate to="/collections/movie" />} />
        </Routes>
      </Suspense>
    );
  } else {
    routes = (
      <Suspense fallback={<Loading color='#FCB016' />}>
        <Routes>
            <Route path="/" element={<Auth />} exact />
            <Route path="/password-reset" element={<PasswordReset />} exact />
            <Route path="/party/joinParty" element={<JoinParty />} exact />
            <Route path="/party/wait/:code" element={<PartyWait />} exact />
            <Route path="/party/:code" element={<Party />} exact />
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    );
  }

  let footer;
  if (showFooter && isLoggedIn) {
    footer = <BottomNav />;
  }

  return (
    <AuthContext.Provider value={authValue}>
      <Router>
        <main>
          {loading && <Loading color='#FCB016' className='page-loading' />}
          {!loading && <ErrorBoundary>{routes}</ErrorBoundary>}
          {
            (!loading && showInstallPrompt) && (
              <div id='download-banner'
                style={animateInstallPrompt && !isLoggedIn ? { transform: 'translateX(100vw)', transition: 'transform .5s ease-in-out', top: '0', bottom: 'unset' } : (isLoggedIn ? { transform: 'translateX(100vw)', transition: 'transform .5s ease-in-out', top: 'unset' } : null)}
              >
                  <p id="install-prompt">Install Choice Champ?</p>
                  <p id="install-yes" onClick={installApp}>YES</p>
                  <p id="install-later" onClick={() => { setShowInstallPrompt(false); }}>LATER</p>
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
