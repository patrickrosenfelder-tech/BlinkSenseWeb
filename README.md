# BlinkSense landing page

A responsive, static marketing site for BlinkSense, an on-device awareness companion for focused screen work. The content deliberately avoids diagnosis, treatment, or medical-performance claims.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`).

## Verify and make a production build

```bash
npm run lint
npm run build
npm run preview
```

`npm run build` writes deployable static files to `dist/`. Upload that directory to any static host (for example, Netlify, Vercel static hosting, Cloudflare Pages, or an object-storage/CDN setup). No site has been published or configured by this repository.

## Pages and static assets

- `index.html` — landing page (`src/main.js`, `src/vision-demo.js`, `src/style.css`)
- `privacy/index.html`, `imprint/index.html` — legal pages served at `/privacy` and `/imprint` (see `vite.config.js` and `vercel.json` for the multi-page build and clean URLs)
- `public/` — favicons, web manifest, `robots.txt`, `sitemap.xml`, the Open Graph card (`og-image.jpg`), self-hosted DM Mono fonts, and web app screenshots

The site has no forms, cookies, or analytics. Primary calls to action link to the web app and to the device test builds.
