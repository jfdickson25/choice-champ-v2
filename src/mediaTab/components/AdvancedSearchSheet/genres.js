// Genre / category presets for the AdvancedSearchSheet, hardcoded
// per-API since /genres endpoints exist but rarely change. The id
// values are what the backend forwards to the upstream API.

// TMDB movie genres — https://api.themoviedb.org/3/genre/movie/list
export const MOVIE_GENRES = [
    { id: 28,    label: 'Action' },
    { id: 12,    label: 'Adventure' },
    { id: 16,    label: 'Animation' },
    { id: 35,    label: 'Comedy' },
    { id: 80,    label: 'Crime' },
    { id: 99,    label: 'Documentary' },
    { id: 18,    label: 'Drama' },
    { id: 10751, label: 'Family' },
    { id: 14,    label: 'Fantasy' },
    { id: 36,    label: 'History' },
    { id: 27,    label: 'Horror' },
    { id: 10402, label: 'Music' },
    { id: 9648,  label: 'Mystery' },
    { id: 10749, label: 'Romance' },
    { id: 878,   label: 'Sci-Fi' },
    { id: 53,    label: 'Thriller' },
    { id: 10752, label: 'War' },
    { id: 37,    label: 'Western' },
];

// TMDB TV genres — https://api.themoviedb.org/3/genre/tv/list
export const TV_GENRES = [
    { id: 10759, label: 'Action & Adventure' },
    { id: 16,    label: 'Animation' },
    { id: 35,    label: 'Comedy' },
    { id: 80,    label: 'Crime' },
    { id: 99,    label: 'Documentary' },
    { id: 18,    label: 'Drama' },
    { id: 10751, label: 'Family' },
    { id: 10762, label: 'Kids' },
    { id: 9648,  label: 'Mystery' },
    { id: 10764, label: 'Reality' },
    { id: 10765, label: 'Sci-Fi & Fantasy' },
    { id: 10767, label: 'Talk' },
    { id: 10768, label: 'War & Politics' },
    { id: 37,    label: 'Western' },
];

// RAWG genres — uses slugs not numeric ids in the API.
export const GAME_GENRES = [
    { id: 'action',                   label: 'Action' },
    { id: 'adventure',                label: 'Adventure' },
    { id: 'role-playing-games-rpg',   label: 'RPG' },
    { id: 'shooter',                  label: 'Shooter' },
    { id: 'strategy',                 label: 'Strategy' },
    { id: 'puzzle',                   label: 'Puzzle' },
    { id: 'platformer',               label: 'Platformer' },
    { id: 'simulation',               label: 'Simulation' },
    { id: 'racing',                   label: 'Racing' },
    { id: 'sports',                   label: 'Sports' },
    { id: 'fighting',                 label: 'Fighting' },
    { id: 'arcade',                   label: 'Arcade' },
    { id: 'indie',                    label: 'Indie' },
    { id: 'casual',                   label: 'Casual' },
    { id: 'family',                   label: 'Family' },
    { id: 'massively-multiplayer',    label: 'MMO' },
    { id: 'card',                     label: 'Card' },
    { id: 'board-games',              label: 'Board' },
    { id: 'educational',              label: 'Educational' },
];

// iTunes Books — using human-readable labels passed through as the
// search term against attribute=genreIndex on the backend. Just a
// curated short list of common categories.
export const BOOK_GENRES = [
    { id: 'Fiction',          label: 'Fiction' },
    { id: 'Mystery',          label: 'Mystery' },
    { id: 'Romance',          label: 'Romance' },
    { id: 'Sci-Fi & Fantasy', label: 'Sci-Fi & Fantasy' },
    { id: 'Biography',        label: 'Biography' },
    { id: 'History',          label: 'History' },
    { id: 'Self-Improvement', label: 'Self-Help' },
    { id: 'Business',         label: 'Business' },
    { id: 'Cooking',          label: 'Cooking' },
    { id: 'Children',         label: 'Children' },
    { id: 'Young Adult',      label: 'Young Adult' },
    { id: 'Comics',           label: 'Comics' },
];

export const GENRES_FOR_TYPE = {
    movie: MOVIE_GENRES,
    tv:    TV_GENRES,
    game:  GAME_GENRES,
    book:  BOOK_GENRES,
};

// Min-rating slider config — different scales per type so the
// sheet's slider matches the upstream API's native range.
export const MIN_RATING_CONFIG = {
    movie: { min: 0, max: 10,  step: 0.5, label: 'Min Rating (TMDB)' },
    tv:    { min: 0, max: 10,  step: 0.5, label: 'Min Rating (TMDB)' },
    game:  { min: 0, max: 100, step: 5,   label: 'Min Metacritic' },
    book:  { min: 0, max: 5,   step: 0.5, label: 'Min Rating' },
};

export const SORT_OPTIONS_FOR_TYPE = {
    movie: [
        { value: 'popularity', label: 'Popularity' },
        { value: 'rating',     label: 'Rating' },
        { value: 'newest',     label: 'Newest' },
    ],
    tv: [
        { value: 'popularity', label: 'Popularity' },
        { value: 'rating',     label: 'Rating' },
        { value: 'newest',     label: 'Newest' },
    ],
    game: [
        { value: 'popularity', label: 'Popularity' },
        { value: 'rating',     label: 'Rating' },
        { value: 'newest',     label: 'Newest' },
    ],
    book: null, // iTunes search doesn't expose a useful sort param
};
