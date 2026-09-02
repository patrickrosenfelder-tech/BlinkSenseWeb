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

## Privacy and early access behavior

The early-access controls are intentionally not connected to a form, analytics provider, or endpoint. They display an in-page message saying that enrollment is not active, so no data is collected or sent. Configure a consent-appropriate collection workflow before changing this behavior.
