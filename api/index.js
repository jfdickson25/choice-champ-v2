// Vercel Function wrapper for the Express backend.
// vercel.json rewrites /api/* to this file; Vercel preserves the original URL
// in req.url (e.g. /api/user/me), so we strip the /api prefix before Express
// sees it (routes are mounted at root).
const app = require('../server/app');

module.exports = (req, res) => {
    if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
    else if (req.url === '/api') req.url = '/';
    return app(req, res);
};
