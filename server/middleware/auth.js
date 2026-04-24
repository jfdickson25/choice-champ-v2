const { supabase } = require('../lib/supabase');

// Verifies the Supabase JWT from the Authorization header.
// On success, attaches the Supabase user to req.user and calls next().
async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ errMsg: 'Missing auth token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        return res.status(401).json({ errMsg: 'Invalid or expired token' });
    }

    req.user = data.user;
    next();
}

module.exports = { requireAuth };
