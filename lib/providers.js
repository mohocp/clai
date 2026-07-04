export const PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    keyEnv: "ANTHROPIC_API_KEY",
    needsKey: true,
    models: [
      { id: "claude-opus-4-8", note: "most capable Opus — recommended" },
      { id: "claude-sonnet-5", note: "great speed/intelligence balance" },
      { id: "claude-haiku-4-5", note: "fastest and cheapest" },
      { id: "claude-fable-5", note: "Anthropic's most capable model" },
    ],
  },
  openai: {
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    needsKey: true,
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-5.1", note: "flagship" },
      { id: "gpt-5.1-mini", note: "fast and cheap" },
    ],
  },
  gemini: {
    label: "Gemini (Google)",
    keyEnv: "GEMINI_API_KEY",
    needsKey: true,
    models: [
      { id: "gemini-2.5-flash", note: "fast and cheap" },
      { id: "gemini-2.5-pro", note: "most capable" },
      { id: "gemini-3-pro-preview", note: "newest, preview" },
    ],
  },
  openrouter: {
    label: "OpenRouter (any model, one key)",
    keyEnv: "OPENROUTER_API_KEY",
    needsKey: true,
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "anthropic/claude-haiku-4.5", note: "fast Claude via OpenRouter" },
      { id: "openai/gpt-5.1-mini", note: "fast GPT via OpenRouter" },
      { id: "qwen/qwen3-coder", note: "open model, strong at shell/code" },
    ],
  },
  ollama: {
    label: "Ollama (local, free)",
    needsKey: false,
    baseUrl: "http://localhost:11434/v1",
    models: [], // discovered live from the Ollama daemon during setup
  },
  custom: {
    label: "Custom (any OpenAI-compatible endpoint)",
    needsKey: false,
    models: [],
  },
};

function resolveKey(cfg) {
  const def = PROVIDERS[cfg.provider] || {};
  const key = cfg.apiKey || (def.keyEnv && process.env[def.keyEnv]) || "";
  if (!key && def.needsKey) {
    throw new Error(
      `no API key for ${cfg.provider} — run \`ai setup\` or export ${def.keyEnv}`
    );
  }
  return key;
}

async function readError(res) {
  let detail = "";
  try {
    const data = await res.json();
    detail =
      data?.error?.message || data?.error || data?.message || JSON.stringify(data);
  } catch {
    detail = await res.text().catch(() => "");
  }
  return `${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`;
}

async function callClaude(cfg, system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": resolveKey(cfg),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${await readError(res)}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error("the model declined this request");
  }
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function callGemini(cfg, system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": resolveKey(cfg),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${await readError(res)}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

// OpenAI, OpenRouter, Ollama, and custom endpoints all speak the
// OpenAI-compatible /chat/completions shape.
async function callOpenAICompat(cfg, system, user) {
  const base = (cfg.baseUrl || PROVIDERS[cfg.provider]?.baseUrl || "").replace(
    /\/+$/,
    ""
  );
  if (!base) throw new Error("no base URL configured — run `ai setup`");
  const key = resolveKey(cfg);
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  if (cfg.provider === "openrouter") headers["x-title"] = "clai";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const hint =
      cfg.provider === "ollama"
        ? " (is the Ollama daemon running? try `ollama serve`)"
        : "";
    throw new Error(`API error: ${await readError(res)}${hint}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

export async function generateCommand(cfg, system, user) {
  let raw;
  if (cfg.provider === "claude") raw = await callClaude(cfg, system, user);
  else if (cfg.provider === "gemini") raw = await callGemini(cfg, system, user);
  else raw = await callOpenAICompat(cfg, system, user);
  return cleanCommand(raw);
}

export function cleanCommand(text) {
  let out = (text || "").trim();
  // strip markdown fences if the model wrapped the command anyway
  const fence = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();
  // strip a leading "$ " prompt marker
  out = out.replace(/^\$\s+/, "");
  return out;
}

// Ask a running Ollama daemon which models are installed (used by setup).
export async function listOllamaModels(baseUrl) {
  const root = baseUrl.replace(/\/v1\/?$/, "");
  const res = await fetch(`${root}/api/tags`);
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}
