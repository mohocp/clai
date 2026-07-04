import fs from "node:fs";
import path from "node:path";
import { configDir } from "./config.js";

// The shell integration appends a "<suggested>\t<actually ran>\n" line to
// edits.tsv whenever the user edits a pre-filled command before running it.
// Feeding recent edits back as few-shot examples personalizes suggestions
// (e.g. a user who always changes `kill -9` to `kill -15` stops having to).

const MAX_KEEP = 100;
const HINT_COUNT = 5;

export function editsPath() {
  return path.join(configDir(), "edits.tsv");
}

export function editHints() {
  let text;
  try {
    text = fs.readFileSync(editsPath(), "utf8");
  } catch {
    return "";
  }
  let lines = text.split("\n").filter(Boolean);

  // compact the log opportunistically so it never grows unbounded
  if (lines.length > MAX_KEEP * 2) {
    lines = lines.slice(-MAX_KEEP);
    try {
      fs.writeFileSync(editsPath(), lines.join("\n") + "\n", { mode: 0o600 });
    } catch {
      // best effort
    }
  }

  const pairs = lines
    .slice(-HINT_COUNT)
    .map((l) => l.split("\t"))
    .filter((p) => p.length >= 2 && p[0] && p[1] && p[0] !== p[1]);
  if (pairs.length === 0) return "";

  return (
    "This user edited earlier suggestions before running them — match their preferences:\n" +
    pairs
      .map(([suggested, ran]) => `- suggested: ${suggested}\n  they ran:  ${ran}`)
      .join("\n")
  );
}
