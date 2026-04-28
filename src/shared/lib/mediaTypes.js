import { BookOpen, Clapperboard, Dices, Gamepad2 } from 'lucide-react';
import RetroTv from '../components/Icons/RetroTv';

// Single source of truth for the five media types. Multiple components
// were each carrying a near-duplicate map (BottomNav tabs, MediaTab
// header, Profile stats grid, etc.) which had drifted slightly over
// time — this consolidates them.
//
// `comingSoon: true` lets MediaTab render a placeholder until the
// type's API and Discover branches are wired up.
export const MEDIA_TYPES = {
    book:  { title: 'Books',       noun: 'book',  action: 'read',    color: '#A855F7', Icon: BookOpen },
    tv:    { title: 'TV Shows',    noun: 'show',  action: 'watched', color: '#F04C53', Icon: RetroTv },
    movie: { title: 'Movies',      noun: 'movie', action: 'watched', color: '#FCB016', Icon: Clapperboard },
    board: { title: 'Board Games', noun: 'game',  action: 'played',  color: '#45B859', Icon: Dices },
    game:  { title: 'Video Games', noun: 'game',  action: 'played',  color: '#2482C5', Icon: Gamepad2 },
};

// Display order in BottomNav (left → right) and anywhere else that
// renders all five. Movies is centered as the most-tapped default.
export const MEDIA_TYPE_ORDER = ['book', 'tv', 'movie', 'board', 'game'];

// Convenience getters with a sensible fallback for unknown types so
// MediaTab doesn't crash on a typo'd URL.
const FALLBACK = { title: '', noun: 'item', action: 'tracked', color: '#FCB016', Icon: null };
export const getMediaType = (key) => MEDIA_TYPES[key] || { ...FALLBACK, title: key || '' };

// Past-tense verb for "the user has done <action> with this item",
// e.g. Watched / Played / Read. Capitalized for use as a UI label.
export const watchedLabelFor = (key) => {
    const action = getMediaType(key).action;
    return action.charAt(0).toUpperCase() + action.slice(1);
};

// Negation of the past-tense verb — "Unwatched" / "Unplayed" / "Unread".
// Used as filter labels alongside watchedLabelFor.
export const unwatchedLabelFor = (key) => {
    const action = getMediaType(key).action;
    return 'Un' + action;
};

// "Rate this movie" / "Rate this show" / "Rate this game" / "Rate this book".
// Pulls the noun from MEDIA_TYPES so the phrasing reads naturally.
export const rateLabelFor = (key) => `Rate this ${getMediaType(key).noun}`;
