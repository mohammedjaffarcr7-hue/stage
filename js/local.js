// Built-in AI: an open model that runs entirely on this device (WebGPU), with no key, account or server.
// The model downloads once and is then cached by the browser.
const Local = (() => {
  const LIB = new URL("vendor/web-llm.js", document.baseURI).href; // @mlc-ai/web-llm 0.2.86
  const MODELS = [
    { id: "Hermes-3-Llama-3.1-8B", name: "Hermes 3 · 8B", note: "Best for laptops and roleplay", size: "4.9 GB" },
    { id: "Hermes-3-Llama-3.2-3B", name: "Hermes 3 · 3B", note: "Best for phones", size: "2.3 GB" },
    { id: "Qwen3.5-9B", name: "Qwen 3.5 · 9B", note: "Smartest; needs a strong laptop", size: "6.4 GB" },
    { id: "Llama-3.2-1B-Instruct", name: "Llama 3.2 · 1B", note: "For older phones; basic", size: "0.9 GB" },
  ];
  const supported = typeof navigator !== "undefined" && !!navigator.gpu;
  const isPhone = () => matchMedia("(pointer: coarse)").matches || (navigator.deviceMemory && navigator.deviceMemory < 8);
  const defaultModel = () => (isPhone() ? "Hermes-3-Llama-3.2-3B" : "Hermes-3-Llama-3.1-8B");
  const known = id => MODELS.some(m => m.id === id);

  // WebGPU can exist without a usable graphics chip; check for a real adapter once.
  let readyP;
  function ready() {
    if (!supported) return Promise.resolve(false);
    if (!readyP) readyP = navigator.gpu.requestAdapter().then(a => !!a).catch(() => false);
    return readyP;
  }

  let f16p;
  function hasF16() {
    if (!f16p) f16p = navigator.gpu.requestAdapter().then(a => !!(a && a.features.has("shader-f16"))).catch(() => false);
    return f16p;
  }
  async function fullId(base) { return `${base}-${(await hasF16()) ? "q4f16_1" : "q4f32_1"}-MLC`; }

  let lib, engine, loadedId = null, loading = null, progressCb = null;

  async function load(base, onProgress) {
    if (!(await ready())) throw new Error("This device can't run the built-in AI (no WebGPU graphics). Switch to Cloud in Settings.");
    const id = await fullId(base);
    progressCb = onProgress;
    if (loadedId === id) return engine;
    if (loading && loading.id === id) return loading.p;
    const p = (async () => {
      lib = lib || await import(LIB);
      const report = r => progressCb && progressCb({ progress: r.progress || 0, text: r.text || "" });
      if (!engine) {
        const worker = new Worker(new URL("js/local-worker.js", document.baseURI), { type: "module" });
        engine = await lib.CreateWebWorkerMLCEngine(worker, id, { initProgressCallback: report });
      } else {
        engine.setInitProgressCallback?.(report);
        await engine.reload(id);
      }
      loadedId = id;
      return engine;
    })();
    loading = { id, p };
    try { return await p; }
    catch (e) {
      const msg = String(e && e.message || e);
      if (/memory|OOM|allocate|device lost/i.test(msg)) throw new Error("This device ran out of memory for that model. Pick a smaller built-in model in Settings.");
      if (/Failed to fetch|NetworkError|network error|ERR_/i.test(msg)) throw new Error("The built-in AI couldn't download. Check your internet and try again.");
      throw e;
    }
    finally { loading = null; }
  }

  async function isCached(base) {
    try { lib = lib || await import(LIB); return await lib.hasModelInCache(await fullId(base)); } catch { return false; }
  }

  // One request at a time: the model can only do one thing at once.
  let chain = Promise.resolve();
  function chat(opts) {
    const run = () => generate(opts);
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  async function generate({ model, messages, temperature, max_tokens, onToken, onStatus, signal }) {
    const eng = await load(known(model) ? model : defaultModel(), p => {
      if (!onStatus) return;
      const pct = Math.round(p.progress * 100);
      onStatus(/Loading model from cache/i.test(p.text) ? `Waking up the built-in AI… ${pct}%` : `Downloading the built-in AI (first time only)… ${pct}%`);
    });
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    onStatus && onStatus("");
    const stop = () => eng.interruptGenerate();
    signal && signal.addEventListener("abort", stop);
    let full = "";
    try {
      const chunks = await eng.chat.completions.create({ messages, temperature, max_tokens, stream: true });
      for await (const c of chunks) {
        const t = c.choices && c.choices[0] && c.choices[0].delta && c.choices[0].delta.content;
        if (t) { full += t; onToken(full); }
      }
    } finally { signal && signal.removeEventListener("abort", stop); }
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    return full;
  }

  return { MODELS, supported, ready, defaultModel, known, load, isCached, chat };
})();
