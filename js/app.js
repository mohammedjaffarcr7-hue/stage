// Stage: private AI roleplay with voices. Everything stays on this device.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $("#app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DEFAULT_RULES =
`You are {{char}} in an ongoing, interactive roleplay with {{user}}. Stay fully in character at all times and never mention being an AI.
Write only {{char}}'s replies: actions and descriptions in *asterisks*, speech as plain text. Never speak or act for {{user}}.
Be vivid, creative and proactive: react to what {{user}} says and does, move the story forward, and keep {{char}}'s personality, way of speaking and memories consistent.
Keep replies to a natural length for a conversation unless the scene calls for more. Reply in the language {{user}} writes in.`;

  const DEFAULTS = {
    provider: "openrouter",
    keys: { openrouter: "", gemini: "", custom: "" },
    models: { openrouter: "", gemini: "gemini-2.5-flash", custom: "" },
    customBase: "",
    temperature: 0.9,
    maxTokens: 700,
    contextChars: 30000,
    userName: "",
    userPersona: "",
    rules: DEFAULT_RULES,
    autoSpeak: true,
    skipActions: false,
    sttLang: "",
    geminiFilter: "BLOCK_NONE",
  };

  const SAMPLES = [
    {
      name: "Captain Rhea Voss", tagline: "Smuggler captain of the starship Kestrel", hue: 18,
      persona: "Rhea is a sharp-tongued, fearless smuggler in her thirties who runs the battered starship Kestrel on the edges of known space. She is sarcastic and quick to laugh, fiercely loyal to her crew, and allergic to authority. She hides a soft heart behind dry jokes, drinks bad coffee, and always has a plan B (and C).",
      scenario: "{{user}} has just been hired as the newest member of the Kestrel's crew, minutes before an illegal cargo run.",
      greeting: "*Rhea looks you up and down from the cargo ramp, a mug of something steaming in her hand.* So you're the new hire. Can you fly, fight, or fix things? Because in about ten minutes we're going to need all three.",
      examples: "{{char}}: Rule one on my ship: nobody dies. Rule two: if you're going to break rule one, do it quietly.",
    },
    {
      name: "Detective Sam Okoro", tagline: "Tired noir detective in a rain-soaked city", hue: 210,
      persona: "Sam Okoro is a weary, observant private detective in 1940s Port Ash, a city where it never stops raining. Sam talks in short, dry sentences, notices everything, trusts nobody at first, and has a strict personal code. Under the cynicism is someone who still wants to help.",
      scenario: "{{user}} walks into Sam's office late at night with a case nobody else will take.",
      greeting: "*The office smells of cold coffee and wet coats. Sam doesn't look up from the file.* Door was locked for a reason. *A pause, then the file closes.* But you got past it, so you must want something badly. Sit. Talk.",
      examples: "",
    },
  ];

  let S = { ...DEFAULTS };   // settings
  let busy = null;          // AbortController while the AI is writing

  // ---------- helpers ----------
  const fill = (t, ch) => String(t || "").replace(/\{\{char\}\}/gi, ch ? ch.name : "").replace(/\{\{user\}\}/gi, S.userName || "the visitor");

  function format(text) {
    let h = esc(text);
    h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\*([^*\n]+)\*/g, '<em class="act">$1</em>');
    return h.replace(/\n/g, "<br>");
  }

  function avatar(ch, cls = "") {
    if (ch.avatar) return `<span class="av ${cls}" style="background-image:url('${ch.avatar}')" aria-hidden="true"></span>`;
    const ini = (ch.name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    return `<span class="av ${cls}" style="--h:${ch.hue ?? 200}" aria-hidden="true">${esc(ini)}</span>`;
  }

  let toastT;
  function toast(msg, ms = 3200) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
  }

  const ago = ts => {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return "now";
    if (d < 3600) return Math.floor(d / 60) + "m";
    if (d < 86400) return Math.floor(d / 3600) + "h";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  async function saveSettings() { await DB.put("kv", S, "settings"); }
  const keyReady = () => S.provider === "custom" ? !!S.customBase : !!S.keys[S.provider];

  function resizeImage(file, size = 320) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const k = Math.max(size / img.width, size / img.height);
        const w = img.width * k, h = img.height * k;
        c.getContext("2d").drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        URL.revokeObjectURL(img.src);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- routing ----------
  const go = h => { if (location.hash === h) route(); else location.hash = h; };
  addEventListener("hashchange", route);

  async function route() {
    Voice.stop();
    if (busy) busy.abort();
    const [, view, id] = (location.hash || "#/").split("/");
    window.scrollTo(0, 0);
    if (view === "chat" && id) return viewChat(id);
    if (view === "char") return viewEditor(id);
    if (view === "settings") return viewSettings();
    if (view === "open" && id) return openChar(id);
    return viewHome();
  }

  // ---------- home ----------
  async function viewHome() {
    const chars = (await DB.all("chars")).sort((a, b) => (b.lastUsed || b.created) - (a.lastUsed || a.created));
    const chats = await DB.all("chats");
    const last = {};
    chats.forEach(c => { if (!last[c.charId] || c.updated > last[c.charId].updated) last[c.charId] = c; });

    app.innerHTML = `
      <header class="bar">
        <h1 class="brand">Stage</h1>
        <a class="icon-btn" href="#/settings" aria-label="Settings">${ICON.gear}</a>
      </header>
      <main class="page">
        ${keyReady() ? "" : `<a class="notice" href="#/settings"><strong>Connect a free AI to start.</strong> Takes a minute, no card needed. <span aria-hidden="true">→</span></a>`}
        <ul class="char-list">
          ${chars.map(ch => {
            const lc = last[ch.id];
            const lm = lc && lc.messages[lc.messages.length - 1];
            const preview = lm ? Voice.clean(fill(lm.content, ch), false) : ch.tagline;
            return `<li><a class="char-row" href="#/open/${ch.id}">
              ${avatar(ch)}
              <span class="char-meta"><span class="char-name">${esc(ch.name)}</span><span class="char-sub" dir="auto">${esc(preview || "")}</span></span>
              ${lc ? `<span class="char-time">${ago(lc.updated)}</span>` : ""}
            </a></li>`;
          }).join("")}
        </ul>
        ${chars.length ? "" : `<p class="empty">No characters yet. Create one, or add two samples to try.</p>
          <button class="btn ghost wide" id="addSamples">Add sample characters</button>`}
        <a class="btn primary wide" href="#/char/new">${ICON.plus} New character</a>
      </main>`;
    $("#addSamples")?.addEventListener("click", async () => {
      for (const s of SAMPLES) await DB.put("chars", { ...s, id: uid(), avatar: "", voiceURI: "", rate: 1, pitch: 1, model: "", created: Date.now() });
      viewHome();
    });
  }

  // ---------- character editor ----------
  async function viewEditor(id) {
    const isNew = !id || id === "new";
    const ch = isNew
      ? { id: uid(), name: "", tagline: "", persona: "", scenario: "", greeting: "", examples: "", avatar: "", hue: Math.floor(Math.random() * 360), voiceURI: "", rate: 1, pitch: 1, model: "", created: Date.now() }
      : await DB.get("chars", id);
    if (!ch) return go("#/");

    app.innerHTML = `
      <header class="bar">
        <a class="icon-btn" href="${isNew ? "#/" : "#/open/" + ch.id}" aria-label="Back">${ICON.back}</a>
        <h1>${isNew ? "New character" : "Edit character"}</h1>
        <button class="btn primary sm" id="save">Save</button>
      </header>
      <main class="page form">
        <div class="avatar-pick">
          <label class="av-upload" aria-label="Choose picture">
            <span id="avPrev">${avatar(ch, "xl")}</span>
            <input type="file" accept="image/*" id="avFile" hidden>
            <span class="av-edit">Photo</span>
          </label>
          ${ch.avatar ? `<button class="link" id="avClear">Remove photo</button>` : ""}
        </div>

        <label class="field"><span>Name</span><input id="f_name" value="${esc(ch.name)}" placeholder="e.g. Luna" autocomplete="off" required></label>
        <label class="field"><span>Short description <small>shown in your list</small></span><input id="f_tagline" value="${esc(ch.tagline)}" placeholder="e.g. A witty vampire bartender"></label>
        <label class="field"><span>Personality and background</span>
          <textarea id="f_persona" rows="6" dir="auto" placeholder="Who are they? How do they look, talk and behave? What do they want? The more detail, the better they play.">${esc(ch.persona)}</textarea></label>
        <label class="field"><span>Scenario <small>optional</small></span>
          <textarea id="f_scenario" rows="3" dir="auto" placeholder="Where and how does the story start? Use {{user}} for you.">${esc(ch.scenario)}</textarea></label>
        <label class="field"><span>First message <small>optional</small></span>
          <textarea id="f_greeting" rows="4" dir="auto" placeholder="How they open the conversation. Use *asterisks* for actions.">${esc(ch.greeting)}</textarea></label>
        <label class="field"><span>Example lines <small>optional</small></span>
          <textarea id="f_examples" rows="3" dir="auto" placeholder="{{char}}: A line that shows how they speak.">${esc(ch.examples)}</textarea></label>

        <h2 class="section">Voice</h2>
        ${Voice.supported.tts ? `
        <label class="field"><span>Voice</span><select id="f_voice"></select></label>
        <p class="hint">Tip: better free voices can be downloaded on your phone. iPhone: Settings → Accessibility → Spoken Content → Voices (pick an "Enhanced" or "Premium" one). Android: Settings → Text-to-speech.</p>
        <div class="row2">
          <label class="field"><span>Speed <output id="o_rate">${(+ch.rate).toFixed(1)}</output></span><input type="range" id="f_rate" min="0.5" max="1.8" step="0.1" value="${ch.rate}"></label>
          <label class="field"><span>Pitch <output id="o_pitch">${(+ch.pitch).toFixed(1)}</output></span><input type="range" id="f_pitch" min="0.5" max="1.8" step="0.1" value="${ch.pitch}"></label>
        </div>
        <button class="btn ghost" id="preview">${ICON.speaker} Hear this voice</button>` : `<p class="hint">This browser has no voices.</p>`}

        <details class="adv">
          <summary>Advanced</summary>
          <label class="field"><span>Model for this character <small>leave empty to use the one in Settings</small></span>
            <input id="f_model" value="${esc(ch.model)}" placeholder="${esc(S.models[S.provider] || "default")}" autocomplete="off" spellcheck="false"></label>
        </details>

        ${isNew ? "" : `<button class="btn danger wide" id="del">Delete character</button>`}
      </main>`;

    // voices
    const sel = $("#f_voice");
    if (sel) {
      const fillVoices = () => {
        const vs = Voice.getVoices().slice().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
        sel.innerHTML = `<option value="">Phone default</option>` + vs.map(v =>
          `<option value="${esc(v.voiceURI)}" ${v.voiceURI === ch.voiceURI ? "selected" : ""}>${esc(v.name)} · ${esc(v.lang)}</option>`).join("");
      };
      fillVoices();
      speechSynthesis.addEventListener?.("voiceschanged", fillVoices, { once: true });
      $("#f_rate").oninput = e => $("#o_rate").textContent = (+e.target.value).toFixed(1);
      $("#f_pitch").oninput = e => $("#o_pitch").textContent = (+e.target.value).toFixed(1);
      $("#preview").onclick = () => {
        const name = $("#f_name").value.trim() || "your character";
        const line = Voice.clean(fill($("#f_greeting").value, { name }), S.skipActions) || `Hi, I'm ${name}. Nice to meet you.`;
        Voice.say(line.slice(0, 220), { voiceURI: sel.value, rate: $("#f_rate").value, pitch: $("#f_pitch").value });
      };
    }

    $("#avFile").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { ch.avatar = await resizeImage(f); $("#avPrev").innerHTML = avatar(ch, "xl"); } catch { toast("Could not read that image."); }
    };
    $("#avClear")?.addEventListener("click", () => { ch.avatar = ""; $("#avPrev").innerHTML = avatar(ch, "xl"); });

    $("#save").onclick = async () => {
      const name = $("#f_name").value.trim();
      if (!name) { $("#f_name").focus(); return toast("Give your character a name."); }
      Object.assign(ch, {
        name, tagline: $("#f_tagline").value.trim(), persona: $("#f_persona").value.trim(), scenario: $("#f_scenario").value.trim(),
        greeting: $("#f_greeting").value.trim(), examples: $("#f_examples").value.trim(), model: $("#f_model").value.trim(),
      });
      if (sel) Object.assign(ch, { voiceURI: sel.value, rate: +$("#f_rate").value, pitch: +$("#f_pitch").value });
      await DB.put("chars", ch);
      go("#/open/" + ch.id);
    };
    $("#del")?.addEventListener("click", async () => {
      if (!confirm(`Delete ${ch.name} and all chats with them?`)) return;
      for (const c of await DB.byIndex("chats", "charId", ch.id)) await DB.del("chats", c.id);
      await DB.del("chars", ch.id);
      go("#/");
    });
  }

  // ---------- chats ----------
  function newChat(ch) {
    const chat = { id: uid(), charId: ch.id, created: Date.now(), updated: Date.now(), messages: [] };
    if (ch.greeting) chat.messages.push({ id: uid(), role: "assistant", content: ch.greeting, alts: [ch.greeting], idx: 0 });
    return chat;
  }

  async function openChar(charId) {
    const ch = await DB.get("chars", charId);
    if (!ch) return go("#/");
    const chats = (await DB.byIndex("chats", "charId", charId)).sort((a, b) => b.updated - a.updated);
    let chat = chats[0];
    if (!chat) { chat = newChat(ch); await DB.put("chats", chat); }
    location.replace("#/chat/" + chat.id);
  }

  function buildMessages(ch, chat, upto) {
    const parts = [fill(S.rules || DEFAULT_RULES, ch)];
    if (ch.persona) parts.push(`About ${ch.name}:\n${fill(ch.persona, ch)}`);
    if (ch.scenario) parts.push(`Scenario:\n${fill(ch.scenario, ch)}`);
    if (S.userPersona) parts.push(`About ${S.userName || "the user"}:\n${fill(S.userPersona, ch)}`);
    if (ch.examples) parts.push(`Examples of how ${ch.name} talks:\n${fill(ch.examples, ch)}`);
    const sys = { role: "system", content: parts.join("\n\n") };
    const hist = chat.messages.slice(0, upto ?? chat.messages.length);
    const out = [];
    let budget = +S.contextChars || 30000;
    for (let i = hist.length - 1; i >= 0; i--) {
      const m = hist[i];
      const content = fill(m.content, ch);
      budget -= content.length;
      if (budget < 0 && out.length) break;
      out.unshift({ role: m.role, content });
    }
    return [sys, ...out];
  }

  async function pickModel(ch) {
    if (ch.model) return ch.model;
    if (S.models[S.provider]) return S.models[S.provider];
    if (S.provider !== "openrouter") throw new Error("Choose a model in Settings first.");
    const list = await AI.listModels(S);
    const pref = ["deepseek", "llama-3.3-70b", "mistral", "qwen", "gemma"];
    const m = pref.map(p => list.find(x => x.id.includes(p))).find(Boolean) || list[0];
    if (!m) throw new Error("No free models are available right now.");
    S.models.openrouter = m.id; await saveSettings();
    return m.id;
  }

  // Ask the AI for the reply at position `index` (a new message, or a regeneration).
  async function generate(ch, chat, { index, mode = "new", onToken, onSpeaker } = {}) {
    if (!keyReady()) throw new Error("Connect a free AI in Settings first.");
    const model = await pickModel(ch);
    let msgs;
    if (mode === "continue") {
      msgs = buildMessages(ch, chat, index + 1);
      msgs.push({ role: "user", content: `(Continue ${ch.name}'s last reply exactly where it stopped. Do not repeat it.)` });
    } else msgs = buildMessages(ch, chat, index);
    busy = new AbortController();
    try {
      const text = await AI.chat({ settings: S, model, messages: msgs, signal: busy.signal, onToken: t => { onToken && onToken(t); onSpeaker && onSpeaker.feed(t); } });
      return text.trim();
    } finally { busy = null; }
  }

  async function viewChat(chatId) {
    const chat = await DB.get("chats", chatId);
    if (!chat) return go("#/");
    const ch = await DB.get("chars", chat.charId);
    if (!ch) return go("#/");
    ch.lastUsed = Date.now(); DB.put("chars", ch);
    let autoSpeak = S.autoSpeak;
    let openMsg = null;

    app.innerHTML = `
      <header class="bar chat-bar">
        <a class="icon-btn" href="#/" aria-label="Back">${ICON.back}</a>
        <a class="chat-who" href="#/char/${ch.id}">${avatar(ch, "sm")}<span><span class="char-name">${esc(ch.name)}</span><span class="char-sub">${esc(ch.tagline || "Tap to edit")}</span></span></a>
        <button class="icon-btn" id="spk" aria-label="Read replies aloud" aria-pressed="${autoSpeak}">${autoSpeak ? ICON.speaker : ICON.mute}</button>
        <button class="icon-btn" id="call" aria-label="Talk by voice">${ICON.phone}</button>
        <button class="icon-btn" id="menuBtn" aria-label="Chat menu" aria-expanded="false">${ICON.dots}</button>
      </header>
      <div class="menu" id="menu" hidden>
        <button data-a="new">${ICON.plus} New chat</button>
        <button data-a="list">${ICON.list} All chats with ${esc(ch.name)}</button>
        <a href="#/char/${ch.id}">${ICON.edit} Edit character</a>
      </div>
      <main class="msgs" id="msgs" aria-live="polite"></main>
      <form class="composer" id="composer">
        ${Voice.supported.stt ? `<button type="button" class="icon-btn" id="dict" aria-label="Dictate">${ICON.mic}</button>` : ""}
        <textarea id="input" rows="1" dir="auto" placeholder="Message ${esc(ch.name)}…" enterkeyhint="send" aria-label="Message"></textarea>
        <button class="send" id="send" aria-label="Send">${ICON.send}</button>
      </form>`;

    const msgsEl = $("#msgs"), input = $("#input"), sendBtn = $("#send");
    const nearBottom = () => msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120;
    const toBottom = () => { msgsEl.scrollTop = msgsEl.scrollHeight; };
    const save = () => { chat.updated = Date.now(); return DB.put("chats", chat); };
    const voiceOpts = () => ({ voiceURI: ch.voiceURI, rate: ch.rate, pitch: ch.pitch, skipActions: S.skipActions });

    function msgHTML(m, i) {
      const last = i === chat.messages.length - 1;
      const isAI = m.role === "assistant";
      const alts = m.alts && m.alts.length > 1;
      return `<div class="msg ${isAI ? "ai" : "me"} ${openMsg === m.id ? "open" : ""}" data-i="${i}">
        ${isAI ? avatar(ch, "xs") : ""}
        <div class="bubble-wrap">
          <div class="bubble" dir="auto" tabindex="0">${format(fill(m.content, ch)) || '<span class="typing"><i></i><i></i><i></i></span>'}</div>
          <div class="acts">
            ${isAI ? `<button data-a="speak" aria-label="Read aloud">${ICON.speaker}</button>` : ""}
            <button data-a="copy" aria-label="Copy">${ICON.copy}</button>
            <button data-a="edit" aria-label="Edit">${ICON.edit}</button>
            <button data-a="del" aria-label="Delete">${ICON.trash}</button>
            ${isAI && last ? `
              ${alts ? `<button data-a="prev" aria-label="Previous version">‹</button><span class="alt-n">${m.idx + 1}/${m.alts.length}</span><button data-a="next" aria-label="Next version">›</button>` : ""}
              <button data-a="regen" aria-label="New reply">${ICON.regen}</button>
              <button data-a="cont" aria-label="Continue">${ICON.cont}</button>` : ""}
          </div>
        </div>
      </div>`;
    }
    function render(keepScroll) {
      const st = msgsEl.scrollTop;
      msgsEl.innerHTML = (ch.scenario ? `<p class="scene" dir="auto">${format(fill(ch.scenario, ch))}</p>` : "") +
        chat.messages.map(msgHTML).join("") +
        (chat.messages.length ? "" : `<p class="empty">Say something to start the story.</p>`);
      if (keepScroll) msgsEl.scrollTop = st; else toBottom();
    }
    function setBusy(on) {
      sendBtn.innerHTML = on ? ICON.stop : ICON.send;
      sendBtn.setAttribute("aria-label", on ? "Stop" : "Send");
      sendBtn.classList.toggle("stop", on);
    }
    function bubble(i) { return $(`.msg[data-i="${i}"] .bubble`, msgsEl); }

    // Run one AI reply into message index i.
    async function runReply(i, mode = "new", speakIt = autoSpeak) {
      const m = chat.messages[i];
      const base = mode === "continue" ? m.content : "";
      const spk = speakIt ? Voice.speaker(voiceOpts()) : null;
      setBusy(true);
      try {
        const text = await generate(ch, chat, {
          index: i, mode,
          onSpeaker: spk && { feed: t => spk.feed(t) },
          onToken: t => {
            const stick = nearBottom();
            const b = bubble(i); if (b) b.innerHTML = format(fill(base + (base ? " " : "") + t, ch));
            if (stick) toBottom();
          },
        });
        const full = mode === "continue" ? (base + " " + text).trim() : text;
        if (!full) throw new Error("The model sent an empty reply. Try again or pick another model.");
        m.content = full;
        if (mode === "continue") m.alts[m.idx] = full;
        else if (mode === "regen") { m.alts.push(full); m.idx = m.alts.length - 1; }
        else { m.alts = [full]; m.idx = 0; }
        spk && spk.end(text);
        await save();
      } catch (e) {
        spk && spk.stop();
        if (mode === "new" && !m.content) chat.messages.splice(i, 1);
        else m.content = m.alts[m.idx];
        if (e.name !== "AbortError") toast(e.message, 6000);
        await save();
      } finally { setBusy(false); render(true); }
    }

    async function send(text) {
      text = text.trim();
      if (!text) return;
      chat.messages.push({ id: uid(), role: "user", content: text, alts: [text], idx: 0 });
      chat.messages.push({ id: uid(), role: "assistant", content: "", alts: [], idx: 0 });
      openMsg = null;
      render();
      await runReply(chat.messages.length - 1);
    }

    $("#composer").onsubmit = e => {
      e.preventDefault();
      if (busy) { busy.abort(); return; }
      const t = input.value; input.value = ""; grow();
      send(t);
    };
    const grow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; };
    input.oninput = grow;
    input.onkeydown = e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover)").matches) { e.preventDefault(); $("#composer").requestSubmit(); }
    };

    // Message actions
    msgsEl.onclick = async e => {
      const msg = e.target.closest(".msg"); if (!msg) return;
      const i = +msg.dataset.i, m = chat.messages[i];
      const btn = e.target.closest("button[data-a]");
      if (!btn) { if (e.target.closest(".bubble")) { openMsg = openMsg === m.id ? null : m.id; $$(".msg.open", msgsEl).forEach(x => x !== msg && x.classList.remove("open")); msg.classList.toggle("open", openMsg === m.id); } return; }
      if (busy) return toast("Wait for the reply to finish.");
      const a = btn.dataset.a;
      if (a === "speak") Voice.say(fill(m.content, ch), voiceOpts());
      if (a === "copy") { try { await navigator.clipboard.writeText(fill(m.content, ch)); toast("Copied"); } catch { toast("Could not copy"); } }
      if (a === "del") { chat.messages.splice(i, 1); await save(); render(true); }
      if (a === "edit") editMessage(i);
      if (a === "prev" || a === "next") {
        m.idx = (m.idx + (a === "next" ? 1 : -1) + m.alts.length) % m.alts.length;
        m.content = m.alts[m.idx]; await save(); render(true);
      }
      if (a === "regen") { m.content = ""; render(true); await runReply(i, "regen"); }
      if (a === "cont") await runReply(i, "continue");
    };

    function editMessage(i) {
      const m = chat.messages[i];
      const wrap = $(`.msg[data-i="${i}"] .bubble-wrap`, msgsEl);
      wrap.innerHTML = `<textarea class="edit-box" dir="auto" rows="4">${esc(m.content)}</textarea>
        <div class="edit-acts"><button class="btn sm ghost" data-e="cancel">Cancel</button><button class="btn sm primary" data-e="save">Save</button></div>`;
      const ta = $("textarea", wrap); ta.focus(); ta.style.height = ta.scrollHeight + "px";
      wrap.onclick = async e => {
        e.stopPropagation();
        const b = e.target.closest("[data-e]"); if (!b) return;
        if (b.dataset.e === "save") { m.content = ta.value; if (m.alts && m.alts.length) m.alts[m.idx] = ta.value; else { m.alts = [ta.value]; m.idx = 0; } await save(); }
        render(true);
      };
    }

    // Header buttons
    $("#spk").onclick = async () => {
      autoSpeak = !autoSpeak; S.autoSpeak = autoSpeak; await saveSettings();
      $("#spk").innerHTML = autoSpeak ? ICON.speaker : ICON.mute;
      $("#spk").setAttribute("aria-pressed", autoSpeak);
      if (!autoSpeak) Voice.stop();
      toast(autoSpeak ? "Replies will be read aloud" : "Replies are silent");
    };
    const menu = $("#menu"), menuBtn = $("#menuBtn");
    const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); };
    menuBtn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute("aria-expanded", String(!menu.hidden)); };
    document.onclick = e => { if (!menu.contains(e.target)) closeMenu(); };
    menu.onclick = async e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      closeMenu();
      if (a === "new") { const c = newChat(ch); await DB.put("chats", c); go("#/chat/" + c.id); }
      if (a === "list") chatList(ch, chat.id);
    };

    // Dictation (one phrase into the box)
    $("#dict")?.addEventListener("click", async () => {
      const b = $("#dict");
      if (b.classList.contains("on")) return;
      b.classList.add("on");
      const before = input.value;
      try {
        const t = await Voice.listen({ lang: S.sttLang, onInterim: t => { input.value = (before + " " + t).trim(); grow(); } });
        input.value = (before + " " + t).trim(); grow(); input.focus();
      } catch (err) { toast(err.message, 5000); }
      b.classList.remove("on");
    });

    $("#call").onclick = () => talkMode(ch, chat, { render, runReply, voiceOpts });

    render();
  }

  // Sheet listing the chats with one character
  async function chatList(ch, currentId) {
    const chats = (await DB.byIndex("chats", "charId", ch.id)).sort((a, b) => b.updated - a.updated);
    const sheet = document.createElement("div");
    sheet.className = "sheet-bg";
    sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Chats">
      <header class="sheet-head"><h2>Chats with ${esc(ch.name)}</h2><button class="icon-btn" data-x aria-label="Close">✕</button></header>
      <ul class="chat-list">${chats.map(c => {
        const lm = c.messages[c.messages.length - 1];
        return `<li class="${c.id === currentId ? "cur" : ""}"><a href="#/chat/${c.id}"><span class="char-sub" dir="auto">${esc(lm ? Voice.clean(fill(lm.content, ch)).slice(0, 90) : "Empty chat")}</span>
          <small>${c.messages.length} messages · ${ago(c.updated)}</small></a>
          <button class="icon-btn" data-del="${c.id}" aria-label="Delete chat">${ICON.trash}</button></li>`;
      }).join("")}</ul></div>`;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.onclick = async e => {
      if (e.target === sheet || e.target.closest("[data-x]") || e.target.closest("a")) return close();
      const d = e.target.closest("[data-del]")?.dataset.del;
      if (d && confirm("Delete this chat?")) {
        await DB.del("chats", d); close();
        if (d === currentId) go("#/open/" + ch.id); else chatList(ch, currentId);
      }
    };
  }

  // ---------- talk mode: hands-free voice conversation ----------
  function talkMode(ch, chat, { render, runReply }) {
    if (!Voice.supported.stt) return toast("Voice input isn't supported in this browser. On iPhone use Safari; on Android use Chrome.", 6000);
    if (!keyReady()) return toast("Connect a free AI in Settings first.");
    const el = $("#talk");
    let active = true, paused = false, listening = null, misses = 0;
    $("#talkAvatar").innerHTML = avatar(ch, "xxl");
    $("#talkName").textContent = ch.name;
    const status = t => { $("#talkStatus").textContent = t; el.dataset.state = t.split(" ")[0].toLowerCase().replace(/[^a-z]/g, ""); };
    const text = t => { $("#talkText").textContent = t; };
    el.hidden = false;
    // Unlock speech on iOS inside this tap.
    try { speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); } catch {}

    const end = () => {
      active = false; listening && listening.abort(); Voice.stop(); if (busy) busy.abort();
      el.hidden = true; render(true);
    };
    $("#talkEnd").onclick = $("#talkClose").onclick = end;
    $("#talkMute").textContent = "Pause mic";
    $("#talkMute").onclick = () => {
      paused = !paused;
      $("#talkMute").textContent = paused ? "Resume mic" : "Pause mic";
      if (paused) { listening && listening.abort(); status("Paused"); } else loop();
    };
    // Tap the avatar to interrupt the character and talk.
    $("#talkAvatar").onclick = () => { if (el.dataset.state === "speaking") Voice.stop(); };

    async function loop() {
      while (active && !paused) {
        status("Listening…"); text("");
        let heard = "";
        try {
          listening = Voice.listen({ lang: S.sttLang, onInterim: t => text(t) });
          heard = await listening;
        } catch (e) { toast(e.message, 6000); return end(); }
        listening = null;
        if (!active || paused) return;
        if (!heard) { if (++misses >= 4) { paused = true; $("#talkMute").textContent = "Resume mic"; status("Paused"); return; } continue; }
        misses = 0;
        text(heard);
        chat.messages.push({ id: uid(), role: "user", content: heard, alts: [heard], idx: 0 });
        chat.messages.push({ id: uid(), role: "assistant", content: "", alts: [], idx: 0 });
        render();
        status("Thinking…");
        const i = chat.messages.length - 1;
        // Speak while the reply streams in.
        const spk = Voice.speaker({ voiceURI: ch.voiceURI, rate: ch.rate, pitch: ch.pitch, skipActions: S.skipActions });
        let started = false;
        try {
          const reply = await generate(ch, chat, {
            index: i,
            onSpeaker: { feed: t => { spk.feed(t); if (!started) { started = true; status("Speaking…"); } } },
            onToken: t => text(Voice.clean(fill(t, ch), false)),
          });
          if (!reply) throw new Error("The model sent an empty reply.");
          const m = chat.messages[i]; m.content = reply; m.alts = [reply]; m.idx = 0;
          chat.updated = Date.now(); await DB.put("chats", chat);
          status("Speaking…");
          spk.end(reply);
          await spk.done;
        } catch (e) {
          spk.stop();
          if (!chat.messages[i].content) chat.messages.splice(i, 1);
          if (e.name !== "AbortError") { toast(e.message, 6000); status("Problem: tap Resume"); paused = true; $("#talkMute").textContent = "Resume mic"; }
          render();
          return;
        }
        render();
      }
    }
    loop();
  }

  // ---------- settings ----------
  async function viewSettings() {
    const P = AI.PROVIDERS;
    app.innerHTML = `
      <header class="bar">
        <a class="icon-btn" href="#/" aria-label="Back">${ICON.back}</a>
        <h1>Settings</h1>
        <span class="icon-btn" style="visibility:hidden" aria-hidden="true"></span>
      </header>
      <main class="page form">
        <h2 class="section">AI</h2>
        <div class="seg" role="radiogroup" aria-label="AI service">
          ${Object.entries(P).map(([k, p]) => `<label><input type="radio" name="prov" value="${k}" ${S.provider === k ? "checked" : ""}><span>${esc(p.name.split(" (")[0])}</span></label>`).join("")}
        </div>
        <div id="provBox"></div>

        <div class="row2">
          <label class="field"><span>Creativity <output id="o_temp">${S.temperature}</output></span><input type="range" id="s_temp" min="0" max="1.5" step="0.05" value="${S.temperature}"></label>
          <label class="field"><span>Max reply length</span>
            <select id="s_max">${[250, 400, 700, 1000, 1500, 2500].map(n => `<option value="${n}" ${+S.maxTokens === n ? "selected" : ""}>${n} tokens</option>`).join("")}</select></label>
        </div>

        <h2 class="section">You</h2>
        <label class="field"><span>Your name in stories</span><input id="s_user" value="${esc(S.userName)}" placeholder="e.g. Mohammed" autocomplete="off"></label>
        <label class="field"><span>About you <small>optional, characters will know this</small></span>
          <textarea id="s_persona" rows="3" dir="auto" placeholder="How you look, who you are in the stories…">${esc(S.userPersona)}</textarea></label>

        <h2 class="section">Voice</h2>
        <label class="check"><input type="checkbox" id="s_auto" ${S.autoSpeak ? "checked" : ""}> Read replies aloud automatically</label>
        <label class="check"><input type="checkbox" id="s_skip" ${S.skipActions ? "checked" : ""}> Don't read *actions* aloud, only speech</label>
        <label class="field"><span>Language you speak in <small>for the microphone</small></span>
          <select id="s_lang">
            ${[["", "Phone language"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["ar-SA", "Arabic (Saudi)"], ["ar-AE", "Arabic (UAE)"], ["ar-EG", "Arabic (Egypt)"], ["fr-FR", "French"], ["es-ES", "Spanish"], ["de-DE", "German"], ["hi-IN", "Hindi"], ["ur-PK", "Urdu"], ["tr-TR", "Turkish"]]
              .map(([v, n]) => `<option value="${v}" ${S.sttLang === v ? "selected" : ""}>${n}</option>`).join("")}
          </select></label>
        ${Voice.supported.stt ? "" : `<p class="hint">This browser can't hear you. Use Safari on iPhone or Chrome on Android for voice chat.</p>`}

        <details class="adv">
          <summary>Roleplay instructions</summary>
          <p class="hint">Sent to the AI before every chat. {{char}} is the character's name, {{user}} is yours.</p>
          <textarea id="s_rules" rows="9" dir="auto">${esc(S.rules)}</textarea>
          <button class="link" id="resetRules">Reset to default</button>
          <label class="field"><span>Memory <small>how much of the chat the AI rereads</small></span>
            <select id="s_ctx">${[[12000, "Short (cheaper, faster)"], [30000, "Normal"], [60000, "Long"], [120000, "Very long"]].map(([v, n]) => `<option value="${v}" ${+S.contextChars === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        </details>

        <h2 class="section">Your data</h2>
        <p class="hint">Characters, chats and keys are saved only on this device. Back up to move them to another phone.</p>
        <div class="btn-row">
          <button class="btn ghost" id="exp">Back up</button>
          <label class="btn ghost">Restore<input type="file" id="imp" accept="application/json,.json" hidden></label>
        </div>
        <button class="btn danger wide" id="wipe">Erase everything</button>
      </main>`;

    const box = $("#provBox");
    function renderProv() {
      const p = S.provider, info = P[p];
      const help = {
        openrouter: `<ol class="steps"><li>Open <a href="${info.keyUrl}" target="_blank" rel="noopener">openrouter.ai/keys</a> and sign in (Google works, no card).</li><li>Tap <b>Create key</b>, copy it and paste it below.</li><li>Only models marked <b>free</b> are listed, so it costs nothing. Free models have a daily message limit.</li></ol>`,
        gemini: `<ol class="steps"><li>Open <a href="${info.keyUrl}" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with Google.</li><li>Tap <b>Create API key</b>, copy it and paste it below.</li><li>The free tier has a daily limit. Google may use free-tier chats to improve its products.</li></ol>`,
        custom: `<p class="hint">Any OpenAI-compatible server: for example Groq (free key at console.groq.com, address <code>https://api.groq.com/openai/v1</code>), or a model on your own computer with Ollama (<code>http://your-computer:11434/v1</code>) or LM Studio.</p>`,
      }[p];
      box.innerHTML = `${help}
        ${p === "custom" ? `<label class="field"><span>Server address</span><input id="s_base" value="${esc(S.customBase)}" placeholder="https://…/v1" autocomplete="off" spellcheck="false" inputmode="url"></label>` : ""}
        <label class="field"><span>API key ${p === "custom" ? "<small>if the server needs one</small>" : ""}</span>
          <input id="s_key" type="password" value="${esc(S.keys[p])}" placeholder="Paste key" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span>Model</span>
          <span class="combo"><input id="s_model" list="modelList" value="${esc(S.models[p])}" placeholder="${p === "openrouter" ? "Picked for you if empty" : "Model name"}" autocomplete="off" spellcheck="false">
          <button class="btn ghost sm" id="loadModels" type="button">Load list</button></span>
          <datalist id="modelList"></datalist></label>
        <select id="modelSel" class="model-sel" hidden aria-label="Available models"></select>
        ${p === "gemini" ? `<label class="field"><span>Google's content filter</span>
          <select id="s_gf">${[["BLOCK_NONE", "Off (fewest refusals)"], ["BLOCK_ONLY_HIGH", "Low"], ["BLOCK_MEDIUM_AND_ABOVE", "Medium"]].map(([v, n]) => `<option value="${v}" ${S.geminiFilter === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>` : ""}
        <button class="btn ghost" id="test" type="button" style="margin-bottom:20px">Test connection</button>`;

      $("#s_key").onchange = async e => { S.keys[p] = e.target.value.trim(); await saveSettings(); };
      $("#s_model").onchange = async e => { S.models[p] = e.target.value.trim(); await saveSettings(); };
      $("#s_base")?.addEventListener("change", async e => { S.customBase = e.target.value.trim(); await saveSettings(); });
      $("#s_gf")?.addEventListener("change", async e => { S.geminiFilter = e.target.value; await saveSettings(); });
      $("#loadModels").onclick = async () => {
        const b = $("#loadModels"); b.disabled = true; b.textContent = "Loading…";
        try {
          const list = await AI.listModels(S);
          const sel = $("#modelSel");
          sel.innerHTML = `<option value="">Choose from ${list.length} models…</option>` + list.map(m => `<option value="${esc(m.id)}" ${m.id === S.models[p] ? "selected" : ""}>${esc(m.name)}</option>`).join("");
          $("#modelList").innerHTML = list.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
          sel.hidden = false;
          sel.onchange = async () => { if (!sel.value) return; $("#s_model").value = sel.value; S.models[p] = sel.value; await saveSettings(); toast("Model saved"); };
        } catch (e) { toast(e.message, 5000); }
        b.disabled = false; b.textContent = "Load list";
      };
      $("#test").onclick = async () => {
        const b = $("#test"); b.disabled = true; b.textContent = "Testing…";
        try {
          if (!keyReady()) throw new Error(p === "custom" ? "Add the server address first." : "Paste your key first.");
          const model = await pickModel({});
          $("#s_model").value = S.models[p] || model;
          const reply = await AI.chat({ settings: { ...S, maxTokens: 30 }, model, messages: [{ role: "user", content: "Reply with just the word: ready" }], onToken: () => {} });
          toast(`Working. ${model} says: ${reply.trim().slice(0, 40)}`, 5000);
        } catch (e) { toast(e.message, 7000); }
        b.disabled = false; b.textContent = "Test connection";
      };
    }
    renderProv();

    $$('input[name="prov"]').forEach(r => r.onchange = async () => { S.provider = r.value; await saveSettings(); renderProv(); });
    $("#s_temp").oninput = e => $("#o_temp").textContent = e.target.value;
    $("#s_temp").onchange = async e => { S.temperature = +e.target.value; await saveSettings(); };
    $("#s_max").onchange = async e => { S.maxTokens = +e.target.value; await saveSettings(); };
    $("#s_user").onchange = async e => { S.userName = e.target.value.trim(); await saveSettings(); };
    $("#s_persona").onchange = async e => { S.userPersona = e.target.value.trim(); await saveSettings(); };
    $("#s_auto").onchange = async e => { S.autoSpeak = e.target.checked; await saveSettings(); };
    $("#s_skip").onchange = async e => { S.skipActions = e.target.checked; await saveSettings(); };
    $("#s_lang").onchange = async e => { S.sttLang = e.target.value; await saveSettings(); };
    $("#s_rules").onchange = async e => { S.rules = e.target.value.trim() || DEFAULT_RULES; await saveSettings(); };
    $("#s_ctx").onchange = async e => { S.contextChars = +e.target.value; await saveSettings(); };
    $("#resetRules").onclick = async () => { S.rules = DEFAULT_RULES; $("#s_rules").value = DEFAULT_RULES; await saveSettings(); toast("Reset"); };

    $("#exp").onclick = async () => {
      const incKeys = confirm("Include your API keys in the backup? Press Cancel to leave them out.");
      const settings = JSON.parse(JSON.stringify(S));
      if (!incKeys) settings.keys = { openrouter: "", gemini: "", custom: "" };
      const data = { app: "stage", version: 1, exported: new Date().toISOString(), settings, chars: await DB.all("chars"), chats: await DB.all("chats") };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      a.download = `stage-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $("#imp").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== "stage") throw new Error();
        if (!confirm(`Add ${data.chars.length} characters and ${data.chats.length} chats from this backup?`)) return;
        for (const c of data.chars) await DB.put("chars", c);
        for (const c of data.chats) await DB.put("chats", c);
        const keys = { ...S.keys };
        Object.entries(data.settings.keys || {}).forEach(([k, v]) => { if (v) keys[k] = v; });
        S = { ...DEFAULTS, ...data.settings, keys };
        await saveSettings();
        toast("Restored"); viewSettings();
      } catch { toast("That file isn't a Stage backup."); }
    };
    $("#wipe").onclick = async () => {
      if (!confirm("Erase all characters, chats, keys and settings on this device?")) return;
      await DB.clear("chars"); await DB.clear("chats"); await DB.clear("kv");
      S = JSON.parse(JSON.stringify(DEFAULTS)); go("#/");
    };
  }

  // ---------- icons ----------
  const svg = p => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    send: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
    speaker: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
    mute: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>'),
    dots: svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    regen: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
    cont: svg('<path d="M5 12h.01M12 12h.01M19 12h.01"/>'),
  };

  // ---------- start ----------
  (async () => {
    const saved = await DB.get("kv", "settings");
    S = JSON.parse(JSON.stringify(DEFAULTS));
    if (saved) S = { ...S, ...saved, keys: { ...S.keys, ...saved.keys }, models: { ...S.models, ...saved.models } };
    route();
  })();
})();
