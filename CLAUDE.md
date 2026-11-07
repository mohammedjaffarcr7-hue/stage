# Stage

Static PWA, no build step, no server. All data stays on the device (IndexedDB).
- Must stay free to run: free AI tiers (OpenRouter free models, Gemini free tier, custom OpenAI-compatible) and the browser's built-in speech APIs.
- Check UI changes in a real browser (Playwright) at 390 px and 1280 px.
- Bump `VERSION` in `sw.js` on every deploy.
