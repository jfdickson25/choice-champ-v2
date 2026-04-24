import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// Vite config for the Choice Champ CRA → Vite migration.
// - Dev server on :3000 (matches prior CRA + Supabase Auth redirect allowlist)
// - Build output goes to /build so Vercel's existing config keeps working
// - SWC plugin handles JSX-in-.js files natively (CRA convention)
export default defineConfig({
    plugins: [react()],
    server: { port: 3000, open: false },
    build: { outDir: 'build' },
    esbuild: {
        loader: 'jsx',
        include: /src\/.*\.jsx?$/,
        exclude: [],
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: { '.js': 'jsx' },
        },
    },
});
