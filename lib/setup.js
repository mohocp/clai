import readline from "node:readline";
import { PROVIDERS, listOllamaModels } from "./providers.js";
import { saveConfig, configPath, loadConfig } from "./config.js";

// readline/promises drops lines that arrive while no question is pending,
// which breaks piped input (`printf 'a\nb\n' | clai setup`). Queue lines
// instead so answers are consumed in order regardless of arrival timing.
function makePrompter() {
  const iface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true,
  });
  const lines = [];
  const waiters = [];
  let closed = false;
  iface.on("line", (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else lines.push(line);
  });
  iface.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  return {
    async question(prompt) {
      process.stdout.write(prompt);
      if (lines.length) return lines.shift();
      if (closed) throw new Error("input closed before setup finished");
      const line = await new Promise((resolve) => waiters.push(resolve));
      if (line === null) throw new Error("input closed before setup finished");
      return line;
    },
    close: () => iface.close(),
  };
}

async function menu(rl, title, options, def = 1) {
  process.stdout.write(`\n${title}\n`);
  options.forEach((opt, i) => {
    process.stdout.write(`  ${i + 1}) ${opt}\n`);
  });
  for (;;) {
    const answer = (await rl.question(`Choice [${def}]: `)).trim();
    if (answer === "") return def - 1;
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
    process.stdout.write(`Please enter a number between 1 and ${options.length}.\n`);
  }
}

export async function runSetup() {
  const rl = makePrompter();

  try {
    const existing = loadConfig();
    process.stdout.write("clai setup — pick the AI that turns your words into commands\n");
    if (existing) {
      process.stdout.write(
        `(current: ${existing.provider} / ${existing.model})\n`
      );
    }

    const providerIds = Object.keys(PROVIDERS);
    const idx = await menu(
      rl,
      "Select a provider:",
      providerIds.map((id) => PROVIDERS[id].label)
    );
    const provider = providerIds[idx];
    const def = PROVIDERS[provider];
    const cfg = { provider };

    // --- model ---
    let models = def.models.map((m) => `${m.id} — ${m.note}`);

    if (provider === "ollama") {
      cfg.baseUrl =
        (await rl.question(`Ollama URL [${def.baseUrl}]: `)).trim() ||
        def.baseUrl;
      try {
        const installed = await listOllamaModels(cfg.baseUrl);
        models = installed;
        if (models.length === 0) {
          process.stdout.write(
            "No models installed — pull one first, e.g. `ollama pull qwen3`.\n"
          );
        }
      } catch {
        process.stdout.write(
          "Could not reach the Ollama daemon — you can still type a model name.\n"
        );
        models = [];
      }
    }

    if (provider === "custom") {
      for (;;) {
        cfg.baseUrl = (
          await rl.question("Base URL (OpenAI-compatible, e.g. https://host/v1): ")
        ).trim();
        if (cfg.baseUrl) break;
        process.stdout.write("A base URL is required for a custom provider.\n");
      }
    }

    if (models.length > 0) {
      const mIdx = await menu(rl, "Select a model:", [
        ...models,
        "other (type a model id)",
      ]);
      if (mIdx < models.length) {
        cfg.model = models[mIdx].split(" — ")[0];
      }
    }
    while (!cfg.model) {
      cfg.model = (await rl.question("Model id: ")).trim();
    }

    // --- API key ---
    if (provider !== "ollama") {
      const envHint = def.keyEnv ? ` (blank = use $${def.keyEnv})` : " (blank = none)";
      const key = (await rl.question(`API key${envHint}: `)).trim();
      if (key) cfg.apiKey = key;
      if (!key && def.needsKey && !process.env[def.keyEnv]) {
        process.stdout.write(
          `Note: $${def.keyEnv} is not set right now — \`ai\` will fail until it is.\n`
        );
      }
    }

    saveConfig(cfg);
    process.stdout.write(
      `\nSaved ${provider} / ${cfg.model} to ${configPath()}\n` +
        `Try it:  ai kill process on port 8001\n`
    );
  } finally {
    rl.close();
  }
}
