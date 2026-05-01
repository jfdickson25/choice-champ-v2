import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

// Theme states the user can choose in Settings:
//   - 'system' (default) — follow OS prefers-color-scheme
//   - 'dark'             — force dark
//   - 'light'            — force light
//
// `resolved` is always 'dark' or 'light' (never 'system'); use it to
// branch behavior that needs to know what's actually painted.
//
// The actual data-theme attribute on <html> is initially set by the
// pre-paint script in index.html so the splash + body paint in the
// right theme on cold start. This provider keeps that attribute in
// sync after mount, persists user choice to localStorage, and listens
// for OS preference changes when the user is on 'system'.

const STORAGE_KEY = 'choice-champ:theme';

function readStoredTheme() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'system' || v === 'dark' || v === 'light') return v;
    } catch { /* private mode, etc. */ }
    return 'system';
}

function readSystemTheme() {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const ThemeContext = createContext({
    theme: 'system',
    resolved: 'dark',
    setTheme: () => {},
});

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(readStoredTheme);
    const [systemTheme, setSystemTheme] = useState(readSystemTheme);

    // Watch OS preference changes — only relevant when the user is on
    // 'system'. We update systemTheme regardless so flipping back to
    // 'system' immediately reflects the current OS setting without a
    // remount.
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia('(prefers-color-scheme: light)');
        const handler = (e) => setSystemTheme(e.matches ? 'light' : 'dark');
        // Safari < 14 only supports addListener; modern browsers use addEventListener.
        if (mql.addEventListener) mql.addEventListener('change', handler);
        else mql.addListener(handler);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', handler);
            else mql.removeListener(handler);
        };
    }, []);

    const resolved = theme === 'system' ? systemTheme : theme;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', resolved);
    }, [resolved]);

    const setTheme = useCallback((next) => {
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
        setThemeState(next);
    }, []);

    const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
