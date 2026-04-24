import { createContext } from 'react';

export const AuthContext = createContext({
    isLoggedIn: false,
    userId: null,
    username: null,
    logout: () => {},
    showFooterHandler: () => {},
});
