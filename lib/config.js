import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function configDir() {
  return (
    process.env.CLAI_CONFIG_DIR || path.join(os.homedir(), ".config", "clai")
  );
}

export function configPath() {
  return path.join(configDir(), "config.json");
}

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`could not read ${configPath()}: ${err.message}`);
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(configDir(), { recursive: true });
  // 0600 — the file may contain an API key
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", {
    mode: 0o600,
  });
}
