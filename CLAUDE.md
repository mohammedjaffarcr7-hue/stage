# Stage

Static PWA, no build step, no server. All data stays on the device (IndexedDB).
- Must stay free to run and work with no setup: Cloud (Supabase Edge Function `stage-ai`, free OpenRouter models only) is the default; Built-in AI (WebLLM in the browser) is an opt-in offline mode with a crash guard; own keys are optional. Voices use the browser's built-in speech APIs.
- Supabase project `hamzzogevroexssapgcr` (shared with Daftar). Deploy the relay with JWT verification on.
- Design: follow `DESIGN.md` ("Ember"). One accent colour, no gradients or drop shadows, no violet.
- Check UI changes in a real browser (Playwright) at 390 px and 1280 px, with English and Arabic text.
- Bump `VERSION` in `sw.js` on every deploy.
