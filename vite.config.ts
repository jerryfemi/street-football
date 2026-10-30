import { defineConfig } from 'vite';

export default defineConfig({
  // './' so the build works from any sub-path (itch.io, GitHub Pages, Firebase Hosting folder)
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    // three.js alone is ~700 kB minified; that's expected for a 3D game.
    chunkSizeWarningLimit: 1000,
  },
});
