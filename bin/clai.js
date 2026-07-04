#!/usr/bin/env node
import { run } from "../lib/cli.js";

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`clai: ${err.message}\n`);
  process.exit(1);
});
