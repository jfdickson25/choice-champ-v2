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

const Collection = lazy(() => import('./collection/pages/Collection'));
const ItemDetails = lazy(() => import('./collection/pages/ItemDetails'));
const Auth = lazy(() => import('./user/pages/Auth'));
const PasswordReset = lazy(() => import('./user/pages/PasswordReset'));
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
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    // Track the visual viewport only while a text input is focused, and
    // freeze the computed inset once the keyboard is up. Otherwise iOS's
    // address bar animations during scroll would change window.innerHeight
    // and jitter anything positioned off --cc-keyboard-inset.
    let focused = false;
    let keyboardOpen = false;

    const reset = () => {
      keyboardOpen = false;
      root.style.setProperty('--cc-keyboard-inset', '0px');
      root.classList.remove('cc-keyboard-open');
    };

    const update = () => {
      if (!focused) return;
      const inset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      const isOpen = inset > 40;
      if (isOpen && !keyboardOpen) {
        keyboardOpen = true;
        root.style.setProperty('--cc-keyboard-inset', `${inset}px`);
        root.classList.add('cc-keyboard-open');
      } else if (!isOpen && keyboardOpen) {
        reset();
      }
    };

    const isTextInput = (el) => !!el && (
      el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
    );

    const onFocusIn = (e) => {
      if (!isTextInput(e.target)) return;
      focused = true;
      update();
    };

    const onFocusOut = () => {
      focused = false;
      reset();
    };

    reset();
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv.addEventListener('resize', update);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv.removeEventListener('resize', update);
      root.style.removeProperty('--cc-keyboard-inset');
      root.classList.remove('cc-keyboard-open');
    };
  }, []);

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

  const authValue = useMemo(
    () => ({ isLoggedIn, userId, username, logout, showFooterHandler }),
    [isLoggedIn, userId, username, logout, showFooterHandler]
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
      <Suspense fallback={<Loading color='#FCB016' className='page-loading' size={100} />}>
        <Routes>
          <Route path="/welcome/info" element={<Welcome />} exact />
          <Route path="/collections/:type" element={<MediaTabByType />} exact />
          <Route path="/collections/:type/:id" element={<Collection />} exact />
          <Route path="/items/:type/:itemId" element={<ItemDetails />} exact />
          <Route path="/party" element={<PartyHome />} exact />
          <Route path="/party/wait/:code" element={<PartyWait />} exact />
          <Route path="/party/:code" element={<Party />} exact />
          <Route path="/profile" element={<Profile />} exact />
          <Route path="/profile/attribution" element={<Attribution />} exact />
          <Route path="/profile/contact" element={<Contact />} exact />
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
          {loading && <Loading color='#FCB016' className='page-loading' size={100} />}
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
