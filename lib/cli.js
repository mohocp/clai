import os from "node:os";
import { loadConfig, configPath } from "./config.js";
import { generateCommand } from "./providers.js";
import { runSetup } from "./setup.js";
import { shellInit } from "./shell.js";

const HELP = `clai — natural language to shell command

Usage:
  ai <what you want to do>     print the shell command for it
  ai setup                     choose provider (Claude, OpenAI, Gemini,
                               OpenRouter, Ollama, custom) and model
  ai config                    show current configuration
  ai shell-init <zsh|bash>     print shell integration (pre-fills your prompt)

Install the shell integration (recommended):
  echo 'eval "$(clai shell-init zsh)"' >> ~/.zshrc

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
    "- If the request is ambiguous, pick the most common interpretation.",
    "- If it genuinely cannot be done as a shell command, output: echo \"<short reason>\"",
  ].join("\n");
}

export async function run(argv) {
  const [first] = argv;

  if (argv.length === 0 || first === "--help" || first === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (first === "--version") {
    process.stdout.write("clai 0.1.0\n");
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

  const request = argv.join(" ");
  const command = await generateCommand(cfg, systemPrompt(), request);
  if (!command) throw new Error("the model returned an empty response");
  process.stdout.write(command + "\n");
}
