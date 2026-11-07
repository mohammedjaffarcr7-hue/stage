// Stage cloud relay: lets the app use free OpenRouter models without a key on the device.
// The key lives only on the server, as the secret OPENROUTER_API_KEY.
// Only ":free" models are allowed, so this can never cost money.
// Deployed with JWT verification on: callers send the project's anon key.
const ALLOWED = ["https://mohammedjaffarcr7-hue.github.io", "http://localhost:8765"];
const API = "https://openrouter.ai/api/v1";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!ALLOWED.includes(origin)) return json(403, { error: { message: "This server only answers the Stage app." } });

  // Tidy the saved key: stray spaces, quotes, line breaks or a "Bearer " prefix are common paste mistakes.
  const key = (Deno.env.get("OPENROUTER_API_KEY") ?? "").replace(/^\s*(Bearer\s+)?["']?|["']?\s*$/g, "").replace(/\s+/g, "");
  if (!key) return json(503, { error: { message: "Cloud mode isn't switched on yet: the server has no OPENROUTER_API_KEY." } });
  if (!key.startsWith("sk-or-")) {
    return json(503, { error: { message: `The saved OPENROUTER_API_KEY doesn't look like an OpenRouter key (it should start with "sk-or-v1-"; it starts with "${key.slice(0, 3)}…" and is ${key.length} characters long).` } });
  }

  const path = new URL(req.url).pathname.replace(/^.*\/stage-ai/, "");

  if (req.method === "GET" && path === "/models") {
    const r = await fetch(API + "/models");
    const j = await r.json();
    const data = (j.data ?? [])
      .filter((m: { id: string }) => m.id.endsWith(":free"))
      .map((m: { id: string; name: string; context_length?: number; created?: number }) =>
        ({ id: m.id, name: m.name, context_length: m.context_length ?? 0, created: m.created ?? 0 }));
    return json(200, { data });
  }

  if (req.method === "POST" && path === "/chat/completions") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(400, { error: { message: "Bad request" } }); }
    if (typeof body.model !== "string" || !body.model.endsWith(":free")) {
      return json(400, { error: { message: "Only free models are allowed." } });
    }
    const r = await fetch(API + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, "X-Title": "Stage", "HTTP-Referer": ALLOWED[0] },
      body: JSON.stringify({ ...body, max_tokens: Math.min(Number(body.max_tokens) || 700, 2500) }),
    });
    if (r.status === 401) {
      return json(401, { error: { message: `OpenRouter refused the saved key (${key.length} characters, starts "${key.slice(0, 9)}…"). Make a new key at openrouter.ai/keys and replace OPENROUTER_API_KEY in Supabase.` } });
    }
    return new Response(r.body, {
      status: r.status,
      headers: { ...cors, "content-type": r.headers.get("content-type") ?? "application/json" },
    });
  }

  return json(404, { error: { message: "Not found" } });
});
