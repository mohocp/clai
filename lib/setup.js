import readline from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
    process.stdout.write(`\nSaved ${provider} / ${cfg.model} to ${configPath()}\n`);

    const restartNeeded = await offerShellIntegration(rl);
    process.stdout.write(
      restartNeeded
        ? `\nRestart your shell (\`exec $SHELL\`), then try:  ai kill process on port 8001\n`
        : `\nTry it:  ai kill process on port 8001\n`
    );
  } finally {
    rl.close();
  }
}

// Offer to append `eval "$(clai shell-init <shell>)"` to the shell rc file so
// generated commands land pre-filled on the prompt. Returns true if added.
async function offerShellIntegration(rl) {
  const shell = (process.env.SHELL || "").split("/").pop();
  const rcFile = { zsh: ".zshrc", bash: ".bashrc" }[shell];
  if (!rcFile) return false;

  const rcPath = path.join(os.homedir(), rcFile);
  let current = "";
  try {
    current = fs.readFileSync(rcPath, "utf8");
  } catch {
    // no rc file yet — we'll create it if the user says yes
  }
  if (current.includes("clai shell-init")) return false; // already installed

  const answer = (
    await rl.question(
      `\nAdd shell integration to ~/${rcFile}? This makes \`ai <request>\`\n` +
        `pre-fill the command on your prompt instead of just printing it. [Y/n]: `
    )
  ).trim().toLowerCase();
  if (answer === "n" || answer === "no") {
    process.stdout.write(
      `Skipped. You can add it later:  echo 'eval "$(clai shell-init ${shell})"' >> ~/${rcFile}\n`
    );
    return false;
  }

  const block = `\n# clai — pre-fill AI-generated commands on the prompt\neval "$(clai shell-init ${shell})"\n`;
  fs.appendFileSync(rcPath, block);
  process.stdout.write(`Added to ~/${rcFile}\n`);
  return true;
}
