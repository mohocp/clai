import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

// Tools worth mentioning to the model — only non-universal ones, so the
// context line stays short. Universal tools (curl, tar, ssh…) are assumed.
const TOOL_CANDIDATES = [
  "docker", "kubectl", "helm", "brew", "npm", "pnpm", "yarn", "bun",
  "python3", "pip3", "go", "cargo", "java", "make", "cmake",
  "rg", "fd", "jq", "yq", "ffmpeg", "magick", "gh", "aws", "gcloud", "az",
  "terraform", "psql", "mysql", "sqlite3", "redis-cli", "code", "ollama",
];

const MAX_DIR_ENTRIES = 30;

function dirEntries(cwd) {
  try {
    const ents = fs
      .readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.name !== ".DS_Store");
    const shown = ents
      .slice(0, MAX_DIR_ENTRIES)
      .map((e) => (e.isDirectory() ? e.name + "/" : e.name));
    const more = ents.length - shown.length;
    return shown.join(", ") + (more > 0 ? `  (+${more} more)` : "");
  } catch {
    return "";
  }
}

function gitRoot(cwd) {
  let dir = cwd;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function gitBranch(root) {
  try {
    let gitPath = path.join(root, ".git");
    if (fs.statSync(gitPath).isFile()) {
      // worktree/submodule: .git is a file containing "gitdir: <path>"
      const m = fs.readFileSync(gitPath, "utf8").match(/gitdir: (.+)/);
      if (!m) return "";
      gitPath = path.resolve(root, m[1].trim());
    }
    const head = fs.readFileSync(path.join(gitPath, "HEAD"), "utf8").trim();
    const m = head.match(/ref: refs\/heads\/(.+)/);
    return m ? m[1] : `${head.slice(0, 8)} (detached)`;
  } catch {
    return "";
  }
}

// Async with a hard timeout — `git status` can be slow in huge repos and
// context gathering must never hold up the request.
function gitStatusSummary(cwd) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain"],
      { cwd, timeout: 300 },
      (err, stdout) => {
        if (err) return resolve("");
        const lines = stdout.split("\n").filter(Boolean);
        if (lines.length === 0) return resolve("clean");
        const files = lines.slice(0, 5).map((l) => l.slice(3).trim());
        const more = lines.length > 5 ? ", …" : "";
        resolve(
          `${lines.length} changed file${lines.length === 1 ? "" : "s"} (${files.join(", ")}${more})`
        );
      }
    );
  });
}

function npmScripts(cwd) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"), "utf8")
    );
    return Object.keys(pkg.scripts || {}).slice(0, 12).join(", ");
  } catch {
    return "";
  }
}

function makeTargets(cwd) {
  try {
    const text = fs.readFileSync(path.join(cwd, "Makefile"), "utf8");
    const targets = [...text.matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)]
      .map((m) => m[1])
      .filter((t) => !t.startsWith("."));
    return [...new Set(targets)].slice(0, 10).join(", ");
  } catch {
    return "";
  }
}

function installedTools() {
  const names = new Set();
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    try {
      for (const entry of fs.readdirSync(dir)) names.add(entry);
    } catch {
      // unreadable PATH entry — skip
    }
  }
  return TOOL_CANDIDATES.filter((t) => names.has(t)).join(", ");
}

// A small, curated snapshot of the user's environment so the model can name
// real files, scripts, and tools. Deliberately excludes file contents and
// environment variables. Never throws, never takes longer than ~300ms.
export async function gatherContext(cwd = process.cwd()) {
  try {
    const root = gitRoot(cwd);
    const status = root ? await gitStatusSummary(cwd) : "";

    const lines = [`cwd: ${cwd}`];
    const entries = dirEntries(cwd);
    if (entries) lines.push(`directory contents: ${entries}`);
    if (root) {
      const branch = gitBranch(root);
      lines.push(
        `git: repo at ${root}` +
          (branch ? `, branch ${branch}` : "") +
          (status ? `, ${status}` : "")
      );
    }
    const scripts = npmScripts(cwd);
    if (scripts) lines.push(`package.json scripts: ${scripts}`);
    const targets = makeTargets(cwd);
    if (targets) lines.push(`Makefile targets: ${targets}`);
    const tools = installedTools();
    if (tools) lines.push(`notable tools installed: ${tools}`);

    return (
      "Environment context (gathered automatically — use it to name real files, scripts, and tools when relevant):\n" +
      lines.map((l) => `- ${l}`).join("\n")
    );
  } catch {
    return "";
  }
}
