// Local dev entry point. In production on Vercel, api/[...slug].js imports
// the Express app directly without calling listen().
const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
