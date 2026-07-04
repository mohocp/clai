import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

// Repeated requests skip the network entirely. The key includes the gathered
// context, so a cached command is only reused when the environment (cwd,
// directory contents, git state) that produced it is unchanged — "delete the
// newest file" can never serve a stale answer.

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

function cachePath() {
  return path.join(configDir(), "cache.json");
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), "utf8"));
  } catch {
    return {};
  }
}

export function cacheKey(cfg, request, context) {
  return crypto
    .createHash("sha256")
    .update([cfg.provider, cfg.model, request, context].join("\x1f"))
    .digest("hex")
    .slice(0, 32);
}

export function cacheGet(key) {
  const entry = load()[key];
  if (entry && Date.now() - entry.ts < TTL_MS) return entry.command;
  return null;
}

export function cacheSet(key, command) {
  const cache = load();
  cache[key] = { command, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => cache[a].ts - cache[b].ts);
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
  }
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(cache), { mode: 0o600 });
  } catch {
    // caching is best effort
  }
}
