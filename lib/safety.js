// Local, regex-level classification of destructive commands. The command is
// still delivered to the prompt — clai never blocks or asks for confirmation —
// but a one-line warning goes to stderr so it appears above the prompt.
const RULES = [
  [/\brm\s+(-\S*\s+)*-\S*r/, "recursive delete — double-check the path before running"],
  [/\bdd\b[^|;&]*\bof=\/dev\//, "writes directly to a raw device — this can destroy a disk"],
  [/\bmkfs(\.\w+)?\b/, "formats a filesystem — all data on the target is erased"],
  [/>\s*\/dev\/(sd|disk|nvme|hd)/, "redirects output onto a raw device"],
  [/git\s+push\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b)/, "force-push rewrites remote history"],
  [/git\s+reset\s+--hard/, "discards all uncommitted changes"],
  [/git\s+checkout\s+(--\s+)?\./, "overwrites uncommitted changes in tracked files"],
  [/git\s+clean\b[^|;&]*-\S*f/, "permanently deletes untracked files"],
  [/chmod\s+(-\S+\s+)*777\b/, "makes files writable by everyone"],
  [/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?\w*sh\b/, "pipes a remote script straight into a shell — review the URL first"],
  [/:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, "fork bomb — this will freeze the machine"],
  [/\b(shutdown|reboot|halt)\b/, "powers off or restarts the machine"],
  [/\bkill(all)?\s+(-9\s+)?-1\b/, "kills every process you own"],
  [/\bdrop\s+(table|database)\b/i, "drops a database object — data is not recoverable"],
  [/\btruncate\b[^|;&]*-s\s*0/, "empties files in place"],
];

export function dangerWarning(command) {
  for (const [pattern, warning] of RULES) {
    if (pattern.test(command)) return warning;
  }
  return null;
}
