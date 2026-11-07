// Free voices: the phone's own text-to-speech and speech recognition.
const Voice = (() => {
  const synth = window.speechSynthesis;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let voices = [];
  const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) { loadVoices(); synth.addEventListener?.("voiceschanged", loadVoices); }

  function getVoices() { if (!voices.length) loadVoices(); return voices; }

  // Text ready to be read out: optionally drop *actions*, strip markdown symbols.
  function clean(text, skipActions) {
    let t = text;
    if (skipActions) t = t.replace(/\*[^*]+\*/g, " ");
    return t.replace(/[*_~`#>]/g, "").replace(/\(OOC:[^)]*\)/gi, "").replace(/\s+/g, " ").trim();
  }

  // Split into sentence-sized pieces (iOS stops reading very long utterances).
  function pieces(text) {
    const out = [];
    const parts = text.match(/[^.!?…؟\n]+[.!?…؟]*["'”»)]*\s*/g) || [text];
    let cur = "";
    for (const p of parts) {
      if ((cur + p).length > 220 && cur) { out.push(cur.trim()); cur = ""; }
      cur += p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // A speaker that can be fed a reply while it is still being written.
  // feed(fullTextSoFar) speaks finished sentences; end() speaks the rest; done is a promise.
  function speaker(opts) {
    const queue = [];
    let spoken = 0, ended = false, speaking = false, stopped = false, resolve;
    const done = new Promise(r => (resolve = r));
    const voice = getVoices().find(v => v.voiceURI === opts.voiceURI);

    function next() {
      if (stopped) return;
      if (!queue.length) { speaking = false; if (ended) resolve(); return; }
      speaking = true;
      const u = new SpeechSynthesisUtterance(queue.shift());
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = +opts.rate || 1;
      u.pitch = +opts.pitch || 1;
      u.onend = u.onerror = next;
      synth.speak(u);
    }
    function add(text) {
      const t = clean(text, opts.skipActions);
      if (!t) return;
      queue.push(...pieces(t));
      if (!speaking) next();
    }
    return {
      done,
      feed(full) {
        if (!synth || stopped) return;
        const rest = full.slice(spoken);
        const m = rest.match(/^[\s\S]*[.!?…؟\n]["'”»)*]*\s/);
        if (m && m[0].trim().length > 20) { add(m[0]); spoken += m[0].length; }
      },
      end(full) {
        if (!synth) { resolve(); return; }
        if (full !== undefined && !stopped) add(full.slice(spoken));
        spoken = full ? full.length : spoken;
        ended = true;
        if (!speaking) resolve();
      },
      stop() { stopped = true; queue.length = 0; synth && synth.cancel(); resolve(); },
    };
  }

  let current;
  function say(text, opts) {
    stop();
    current = speaker(opts);
    current.end(text);
    return current.done;
  }
  function stop() { if (current) current.stop(); current = null; synth && synth.cancel(); }

  // One listen: resolves with the final words ("" if nothing heard).
  function listen({ lang, onInterim }) {
    let rec;
    const p = new Promise((resolve, reject) => {
      if (!SR) return reject(new Error("Speech recognition is not supported in this browser. On iPhone use Safari; on Android use Chrome."));
      rec = new SR();
      rec.lang = lang || navigator.language || "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let final = "", interim = "";
      rec.onresult = e => {
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
        }
        onInterim && onInterim((final + " " + interim).trim());
      };
      rec.onerror = e => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        reject(new Error(e.error === "not-allowed" ? "Microphone permission was denied." : "Mic error: " + e.error));
      };
      rec.onend = () => resolve((final || interim).trim());
      rec.start();
    });
    p.abort = () => { try { rec && rec.abort(); } catch {} };
    return p;
  }

  return { supported: { tts: !!synth, stt: !!SR }, getVoices, speaker, say, stop, listen, clean };
})();
