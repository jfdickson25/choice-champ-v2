import { BACKEND_URL } from '../config';
import { supabase } from './supabase';

// Authenticated fetch helper. Injects the Supabase JWT as a Bearer token.
// Throws if the response is not ok; returns parsed JSON on success.
export async function api(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.errMsg || `Request failed (${res.status})`);
        err.status = res.status;
        err.body = body;
        throw err;
    }
    return body;
}
