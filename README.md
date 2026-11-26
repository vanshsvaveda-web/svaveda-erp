# SvaVeda ERP

Reconstructed application source with the batched Google Sheets sync worker. Live integration verification and deployment are pending.

Run `npm ci` and `npm run build`. For a Vercel build, set `SVAVEDA_VERCEL_BUILD=1`. Configure runtime credentials and the owner email hash through deployment environment variables.

### Phone and installed-app experience

The workspace has a phone bottom bar (Home, Work, Sales, Chat, More), card-style records, full-screen forms, and touch-sized actions. Theme follows the device unless changed with the theme button; the device preference is stored locally and applies to sign-in too.

Use **Install app** or Chrome's install / Add to Home screen menu to open SvaVeda as a standalone app. Installation availability depends on the browser and device. The manifest, PNG icons and service worker are served publicly so installation works before sign-in. Authentication and workspace permissions still apply inside the installed app.

The service worker stores only public icons, the offline notice, and versioned JS/CSS. Signed-in HTML, credentials and API responses are never added to the offline cache. Saving, sign-in and synchronization require connectivity; offline navigation shows a reconnect screen.

Validate after a Vercel-targeted build with `node scripts/test-mobile-app.mjs` (manifest/icon delivery, sign-in CSP, and service worker privacy/offline behavior).
