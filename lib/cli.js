import os from "node:os";
import { loadConfig, configPath } from "./config.js";
import { generateCommand } from "./providers.js";
import { runSetup } from "./setup.js";
import { shellInit } from "./shell.js";
import { gatherContext } from "./context.js";
import { editHints } from "./memory.js";
import { cacheKey, cacheGet, cacheSet } from "./cache.js";
import { dangerWarning } from "./safety.js";

const HELP = `clai — natural language to shell command

Usage:
  ai <what you want to do>     print the shell command for it
  ai fix [hint]                fix the last command you ran (wrong flag,
                               typo, missing sudo — the corrected command
                               lands on your prompt)
  ai setup                     choose provider (Claude, OpenAI, Gemini,
                               OpenRouter, Ollama, custom) and model
  ai config                    show current configuration
  ai shell-init <zsh|bash>     print shell integration

Install the shell integration (recommended):
  echo 'eval "$(clai shell-init zsh)"' >> ~/.zshrc

With it installed you also get:
  - Ctrl-G: type plain English on your prompt and press Ctrl-G to
    transform it into a command in place
  - context awareness: commands use your real files, git branch, and
    npm/make targets
  - learning: when you edit a suggestion before running it, clai
    remembers your preference

Example:
  ai kill process on port 8001
  → lsof -ti:8001 | xargs kill -9     (pre-filled on your prompt — hit Enter)
`;

function systemPrompt() {
  const platform = { darwin: "macOS", linux: "Linux", win32: "Windows" }[
    process.platform
  ] || process.platform;
  const shell = (process.env.SHELL || "").split("/").pop() || "sh";
  return [
    "You translate a natural-language request into a single shell command.",
    `Environment: ${platform} (${os.release()}), shell: ${shell}.`,
    "Rules:",
    "- Output ONLY the command. No markdown, no code fences, no explanation, no leading `$`.",
    "- Use tools available by default on this OS; prefer the most standard idiom.",
    "- When the environment context below names real files, scripts, branches, or tools, use those exact names instead of placeholders.",
    "- If the request is ambiguous, pick the most common interpretation.",
    "- If it genuinely cannot be done as a shell command, output: echo \"<short reason>\"",
  ].join("\n");
}

function fixRequest(argv) {
  const lastCmd = (process.env.CLAI_LAST_CMD || "").trim();
  const lastStatus = (process.env.CLAI_LAST_STATUS || "").trim();
  if (!lastCmd) {
    throw new Error(
      "nothing to fix — `ai fix` needs the shell integration (see `ai --help`) and a previously run command"
    );
  }
  const hint = argv.slice(1).join(" ");
  return [
    "The user's last command was:",
    `  ${lastCmd}`,
    lastStatus && lastStatus !== "0"
      ? `It failed with exit code ${lastStatus}.`
      : "It did not do what they wanted.",
    "Output a corrected command that does what they intended.",
    hint ? `Hint from the user: ${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function run(argv) {
  const [first] = argv;

  if (argv.length === 0 || first === "--help" || first === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (first === "--version") {
    process.stdout.write("clai 0.2.0\n");
    return;
  }
  if (first === "setup") {
    await runSetup();
    return;
  }
  if (first === "shell-init") {
    process.stdout.write(shellInit(argv[1] || "zsh"));
    return;
  }
  if (first === "config") {
    const cfg = loadConfig();
    if (!cfg) {
      process.stdout.write(`No config yet — run \`ai setup\`.\n`);
      return;
    }
    const masked = { ...cfg };
    if (masked.apiKey) masked.apiKey = masked.apiKey.slice(0, 8) + "…";
    process.stdout.write(
      `${configPath()}\n${JSON.stringify(masked, null, 2)}\n`
    );
    return;
  }

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("not configured yet — run `ai setup` first");
  }

  const fixing = first === "fix";
  const request = fixing ? fixRequest(argv) : argv.join(" ");

  const context = await gatherContext();
  const system = [systemPrompt(), context, editHints()]
    .filter(Boolean)
    .join("\n\n");

  // Cache repeated requests; the key covers the context, so a hit means the
  // environment is unchanged too. `fix` is never cached (it must react to
  // the specific failure, and failures deserve a fresh look).
  const key =
    !fixing && !process.env.CLAI_NO_CACHE
      ? cacheKey(cfg, request, context)
      : null;
  let command = key ? cacheGet(key) : null;
  const fromCache = command != null;

  if (!command) command = await generateCommand(cfg, system, request);
  if (!command) throw new Error("the model returned an empty response");
  if (key && !fromCache) cacheSet(key, command);

  const warning = dangerWarning(command);
  if (warning) {
    const msg = `⚠ clai: ${warning}`;
    process.stderr.write(
      (process.stderr.isTTY ? `\x1b[33m${msg}\x1b[0m` : msg) + "\n"
    );
  }

  process.stdout.write(command + "\n");
}
