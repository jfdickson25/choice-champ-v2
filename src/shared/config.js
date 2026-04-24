// Single source of truth for the backend URL.
// - Dev: .env.local sets VITE_BACKEND_URL=http://localhost:5050
// - Prod (Vercel): no env var set; falls back to same-origin /api, which
//   Vercel routes to api/index.js (the Express app).
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';
