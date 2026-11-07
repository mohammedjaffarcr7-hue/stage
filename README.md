# Stage

A private AI roleplay app that installs on your phone. Create characters with their own personality, picture and voice, chat with them, or talk hands-free like a phone call. **It costs nothing to run.**

Everything (characters, chats, keys) is saved only on your device. There is no server and no account.

## Free AI: pick one

| Service | Cost | How |
|---|---|---|
| **OpenRouter** (default) | Free models, no card | Sign in at https://openrouter.ai/keys → Create key → paste it in **Settings**. Tap **Load list** to see the free models. |
| **Google Gemini** | Free tier, no card | https://aistudio.google.com/apikey → Create API key → paste it in Settings. The content filter can be set to Off there. |
| **Custom** | Free | Any OpenAI-compatible server: Groq (free key at console.groq.com, address `https://api.groq.com/openai/v1`), or a model on your own computer with Ollama / LM Studio. |

Free models have daily limits. If one says "limit reached", wait or switch to another free model. Each character can also use its own model (Edit character → Advanced).

How open a character is depends on the model you pick. The app adds no filters of its own.

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

## Tips

- Write rich personalities: looks, way of talking, goals, secrets. Use `{{user}}` for you and `{{char}}` for the character.
- *Asterisks* are actions. Tap a message to read it aloud, edit, delete, get a new reply (‹ › flips between versions) or continue it.
- The roleplay instructions sent to the AI are editable in Settings.
- **Back up** in Settings to move everything to another phone.

## Files

```
index.html              the app
css/app.css             styles
js/app.js               screens, chat, talk mode
js/ai.js                OpenRouter / Gemini / custom AI connections
js/voice.js             phone voices and speech recognition
js/db.js                on-device storage
sw.js                   offline cache (bump VERSION on each update)
manifest.webmanifest    install name, colours, icons
icons/                  app icons (icon.svg is the source)
```
