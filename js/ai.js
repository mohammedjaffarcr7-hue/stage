// AI providers. All of them can be used for free:
//  - Built-in: an open model running on this device (see local.js). No key.
//  - Cloud: free OpenRouter models through Stage's own Supabase relay. No key on the device.
//  - OpenRouter: free key (no card), models whose id ends in ":free".
//  - Google Gemini: free key from Google AI Studio.
//  - Custom: any OpenAI-compatible server (Groq free tier, Ollama / LM Studio on your computer, etc.).
const AI = (() => {
  // Stage's relay (supabase/functions/stage-ai). The anon key is public by design.
  const CLOUD = {
    base: "https://hamzzogevroexssapgcr.supabase.co/functions/v1/stage-ai",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbXp6b2dldnJvZXhzc2FwZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5OTQ0MjgsImV4cCI6MjEwOTU3MDQyOH0.huMfR3qFOKqT9l6O9jHv1EkAwJJi7O25TaVwv3xfvYM",
  };
  const cloudHeaders = () => ({ Authorization: "Bearer " + CLOUD.anon, apikey: CLOUD.anon });

  const PROVIDERS = {
    local: { name: "Built-in" },
    cloud: { name: "Cloud" },
    openrouter: { name: "OpenRouter (free models)", base: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
    gemini: { name: "Google Gemini (free tier)", base: "https://generativelanguage.googleapis.com/v1beta", keyUrl: "https://aistudio.google.com/apikey" },
    custom: { name: "Custom (OpenAI-compatible)", base: "", keyUrl: "" },
  };

  async function listModels(s) {
    if (s.provider === "local") return Local.MODELS.map(m => ({ id: m.id, name: `${m.name} (${m.size})` }));
    if (s.provider === "cloud") {
      const r = await fetch(CLOUD.base + "/models", { headers: cloudHeaders() });
      if (!r.ok) throw await httpError(r);
      return (await r.json()).data;
    }
    if (s.provider === "openrouter") {
      const r = await fetch(PROVIDERS.openrouter.base + "/models");
      if (!r.ok) throw new Error("Could not load models (" + r.status + ")");
      const j = await r.json();
      return j.data
        .filter(m => m.id.endsWith(":free") || (m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0))
        .map(m => ({ id: m.id, name: m.name || m.id }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (s.provider === "gemini") {
      if (!s.keys.gemini) throw new Error("Add your Gemini key first");
      const r = await fetch(PROVIDERS.gemini.base + "/models?pageSize=200&key=" + encodeURIComponent(s.keys.gemini));
      if (!r.ok) throw new Error("Could not load models (" + r.status + ")");
      const j = await r.json();
      return (j.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini|gemma/.test(m.name))
        .map(m => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name }));
    }
    const base = (s.customBase || "").replace(/\/$/, "");
    if (!base) throw new Error("Add the server address first");
    const r = await fetch(base + "/models", { headers: s.keys.custom ? { Authorization: "Bearer " + s.keys.custom } : {} });
    if (!r.ok) throw new Error("Could not load models (" + r.status + ")");
    const j = await r.json();
    return (j.data || []).map(m => ({ id: m.id, name: m.id }));
  }

  // Reads a server-sent-events stream and calls onData for each JSON "data:" line.
  async function readSSE(resp, onData) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try { onData(JSON.parse(data)); } catch (e) { if (e.isAIError) throw e; }
      }
    }
  }

  // Best free models first: big, smart chat models, then smaller ones.
  // Ranking uses name patterns because the free list changes often.
  const RANK = [
    /deepseek.*(v3|chat)/, /qwen3.*(235|480|coder)/, /kimi|moonshot/, /glm-4/, /deepseek/, /llama-4-maverick/, /gemini/,
    /gpt-oss-120b/, /qwen3/, /llama-3\.3-70b/, /mistral-(medium|large|small-3)/, /hermes|nous/, /llama-4/, /gemma-3-27b/, /qwen/, /mistral/,
  ];
  function rankFree(list) {
    const score = m => { const i = RANK.findIndex(r => r.test(m.id.toLowerCase())); return i < 0 ? RANK.length : i; };
    const slow = m => /(^|[-/])r1|reason|think/i.test(m.id) ? 1 : 0; // reasoning models are slow to start talking
    return list.slice().sort((a, b) => slow(a) - slow(b) || score(a) - score(b));
  }

  async function errorText(r) {
    let t = "";
    try { t = await r.text(); const j = JSON.parse(t); t = (j.error && (j.error.message || j.error)) || j.message || t; } catch {}
    if (r.url.startsWith(CLOUD.base)) {
      if (r.status === 503) return "Cloud mode isn't switched on yet. Use Built-in for now, or finish the one-time Cloud setup (see Settings).";
      if (r.status === 429) return "The free cloud limit is used up for now. Try again later, or switch to Built-in in Settings.";
    }
    if (r.status === 401 || r.status === 403) return "The key was refused. Check it in Settings. " + t;
    if (r.status === 429) return "Free limit reached for now. Wait a minute or pick another free model. " + t;
    return "Error " + r.status + ": " + String(t).slice(0, 300);
  }
  async function httpError(r) {
    const e = new Error(await errorText(r));
    e.status = r.status;
    e.retry = r.status === 429 || r.status === 404 || r.status === 400 || r.status >= 500; // worth trying another model
    return e;
  }

  // messages: [{role: "system"|"user"|"assistant", content}]
  async function chat({ settings: s, model, messages, onToken, onStatus, signal }) {
    const temperature = +s.temperature;
    const max_tokens = +s.maxTokens;
    if (s.provider === "local") return Local.chat({ model, messages, temperature, max_tokens: Math.min(max_tokens, 700), onToken, onStatus, signal });
    let full = "";
    const push = t => { if (t) { full += t; onToken(full); } };

    if (s.provider === "gemini") {
      const sys = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
      const contents = [];
      for (const m of messages.filter(m => m.role !== "system")) {
        const role = m.role === "assistant" ? "model" : "user";
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts[0].text += "\n\n" + m.content;
        else contents.push({ role, parts: [{ text: m.content }] });
      }
      if (!contents.length || contents[0].role !== "user") contents.unshift({ role: "user", parts: [{ text: "(Begin.)" }] });
      const th = s.geminiFilter || "BLOCK_NONE";
      const body = {
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature, maxOutputTokens: max_tokens },
        safetySettings: ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"]
          .map(category => ({ category, threshold: th })),
      };
      const url = `${PROVIDERS.gemini.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(s.keys.gemini || "")}`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      if (!r.ok) throw await httpError(r);
      let blocked = "";
      await readSSE(r, j => {
        if (j.promptFeedback && j.promptFeedback.blockReason) blocked = j.promptFeedback.blockReason;
        const c = j.candidates && j.candidates[0];
        if (!c) return;
        (c.content && c.content.parts || []).forEach(p => { if (!p.thought) push(p.text); });
        if (c.finishReason && !["STOP", "MAX_TOKENS"].includes(c.finishReason)) blocked = c.finishReason;
      });
      if (!full && blocked) throw new Error("The model would not answer (" + blocked + "). Try another model or rephrase.");
      return full;
    }

    const cloud = s.provider === "cloud";
    const base = cloud ? CLOUD.base : s.provider === "openrouter" ? PROVIDERS.openrouter.base : (s.customBase || "").replace(/\/$/, "");
    const key = s.keys[s.provider];
    const headers = { "Content-Type": "application/json", ...(cloud ? cloudHeaders() : {}) };
    if (key && !cloud) headers.Authorization = "Bearer " + key;
    if (s.provider === "openrouter") { headers["X-Title"] = "Stage"; headers["HTTP-Referer"] = location.origin; }
    const r = await fetch(base + "/chat/completions", {
      method: "POST", headers, signal,
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
    });
    if (!r.ok) throw await httpError(r);
    await readSSE(r, j => {
      if (j.error) { const e = new Error(j.error.message || "Model error"); e.isAIError = true; e.retry = true; throw e; }
      const d = j.choices && j.choices[0] && j.choices[0].delta;
      if (d) push(d.content);
    });
    return full;
  }

  return { PROVIDERS, listModels, chat, rankFree };
})();
