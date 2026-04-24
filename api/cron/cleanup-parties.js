// Scheduled via vercel.json → runs once daily.
// Deletes parties whose last_activity_at is older than 24h.
// party_items rows cascade via the FK.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = async (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('parties')
        .delete()
        .lt('last_activity_at', cutoff)
        .select('id');

    if (error) {
        console.error('[cron/cleanup-parties]', error.message);
        return res.status(500).json({ error: error.message });
    }

    const count = data?.length || 0;
    console.log(`[cron/cleanup-parties] deleted ${count} stale parties`);
    res.status(200).json({ deleted: count });
};
