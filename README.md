# Stage

A private AI app that installs on your phone: a smart, frank **Assistant** for any question, plus **characters** for roleplay, each with their own personality, picture, memory and voice. Chat by text or talk hands-free like a phone call. **It costs nothing to run.**

Everything (characters, chats, keys) is saved only on your device. There is no server and no account.

## AI: works the moment you open it

Settings → **AI** has three choices. All are free.

| Choice | What it is | Setup |
|---|---|---|
| **Built-in** (default) | An open model (Hermes 3) that runs **on your device** in the browser. No key, no account, chats never leave the device, works offline after the first download. | None. It downloads once with your first message: about 4.9 GB on a laptop (8B), 2.3 GB on a phone (3B). Needs WebGPU: Chrome or Edge on most laptops and Android, Safari on a recent iPhone. |
| **Cloud** | Smarter free models through Stage's own server (a Supabase Edge Function, `supabase/functions/stage-ai`). No key on any device. Used automatically on devices that can't run Built-in. | One time, by the owner: put a free OpenRouter key in Supabase as the secret `OPENROUTER_API_KEY` (see below). Only free models are allowed, so it can't cost money. |
| **Own key** | OpenRouter, Google Gemini or any OpenAI-compatible server, with your own key. | Paste your key. |

The app adds no filters of its own. How open a character is depends on the model.

### Switching on Cloud (once)
1. Make a free key at https://openrouter.ai/keys (sign in with Google, no card).
2. Open https://supabase.com/dashboard/project/hamzzogevroexssapgcr/functions/secrets
3. Add a secret named `OPENROUTER_API_KEY` with the key as its value, and save.

The relay only answers this site (`mohammedjaffarcr7-hue.github.io` and `localhost:8765`) and only allows `:free` models.

## Free voices

Stage uses your phone's built-in voices and speech recognition, so they're free.

- **Better voices:** iPhone: Settings → Accessibility → Spoken Content → Voices → download an *Enhanced* or *Premium* voice. Android: Settings → Text-to-speech → install more voices. They then show up in each character's **Voice** list.
- **Talk mode:** tap the phone icon in a chat. Speak, the character answers out loud, then listens again. Tap the picture to interrupt. Works in Safari (iPhone) and Chrome (Android).
- Set the language you speak in under Settings → Voice (for example Arabic).

## Put it online (free) and install

1. Repository **Settings → Pages → Deploy from a branch → `main` / root**.
2. Open `https://<you>.github.io/<repo>/` on your phone.
   - iPhone (Safari): **Share → Add to Home Screen**.
   - Android (Chrome): **⋮ → Install app**.

After changing any file, bump `VERSION` in `sw.js` so installed phones pick up the update.

## Smart features

- **Assistant:** a general chatbot that answers directly and frankly, with formatted answers (lists, tables, code). Give it your own instructions by tapping its name.
- **Memory:** every character has a *Memory* box for facts they must never forget. Long chats are summarised automatically, so older events aren't lost.
- **Thinking models:** the hidden reasoning some free models write is removed from replies.

## Tips

- Write rich personalities: looks, way of talking, goals, secrets. Use `{{user}}` for you and `{{char}}` for the character.
- *Asterisks* are actions. Tap a message to read it aloud, edit, delete, get a new reply (‹ › flips between versions) or continue it.
- The roleplay instructions sent to the AI are editable in Settings.
- **Back up** in Settings to move everything to another phone.

## Files

```
index.html              the app
css/app.css             styles
js/app.js               screens, chat, assistant, memory, talk mode
js/ai.js                Built-in / Cloud / own-key AI connections
js/local.js             built-in AI (runs the model on the device)
js/local-worker.js      runs the built-in model off the main thread
vendor/web-llm.js       WebLLM 0.2.86 (Apache-2.0), the on-device AI engine
supabase/functions/     the Cloud relay (Supabase Edge Function)
js/voice.js             phone voices and speech recognition
js/db.js                on-device storage
sw.js                   offline cache (bump VERSION on each update)
manifest.webmanifest    install name, colours, icons
icons/                  app icons (icon.svg is the source)
DESIGN.md               the design system
```
