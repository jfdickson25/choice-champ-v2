// Single source of truth for the backend URL.
// - Dev: .env.local sets REACT_APP_BACKEND_URL=http://localhost:5050
// - Prod (Vercel): no env var set; falls back to same-origin /api, which
//   Vercel routes to api/[...slug].js (the Express app).
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '/api';
