# clai

Natural language → shell command, right on your prompt.

```
$ ai kill process on port 8001
$ lsof -ti:8001 | xargs kill -9█        ← pre-filled, editable; hit Enter to run
```

No copy-paste, no execution behind your back — the command lands in your input
buffer and *you* press Enter.

clai is context-aware: each request quietly includes your current directory
listing, git branch/status, npm scripts, Makefile targets, and which tools you
have installed — so "convert these to webp" names your actual files and
"deploy" finds your real `make deploy` target. (Never file contents, never
environment variables.)

## Install

One command (requires Node.js 18+):

```sh
curl -fsSL https://raw.githubusercontent.com/mohocp/clai/main/install.sh | sh
```

or, with npm:

```sh
npm install -g mohocp/clai
```

## Configure

```sh
clai setup
```

Setup also offers to add the shell integration to your `~/.zshrc` /
`~/.bashrc` for you — that's what makes commands land **pre-filled on your
prompt** instead of just being printed. Say yes, restart your shell, done.

Pick a provider and model interactively:

| Provider   | Notes |
|------------|-------|
| Claude     | `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-fable-5` |
| OpenAI     | `gpt-5.1`, `gpt-5.1-mini`, or any custom id |
| Gemini     | `gemini-2.5-flash`, `gemini-2.5-pro`, … |
| OpenRouter | any model on OpenRouter with one key |
| Ollama     | local models, discovered from the running daemon, free |
| Custom     | any OpenAI-compatible endpoint (base URL + model) |

API keys can be pasted during setup (stored in `~/.config/clai/config.json`,
mode 0600) or left blank to read from the usual env vars
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`).

## Use

```sh
ai kill process on port 8001
ai find all files larger than 500mb in my home folder
ai undo the last git commit but keep the changes
ai convert all pngs in this folder to webp
```

- **zsh**: the command is pushed onto your prompt with `print -z` — review,
  edit, Enter.
- **bash**: the command appears pre-filled on an editable line — Enter runs it,
  Ctrl-C aborts.
- Without shell integration, `clai <request>` just prints the command.

### `ai fix` — repair the last command

Typo'd a flag, forgot `sudo`, wrong subcommand? Just type:

```sh
$ git pusj
zsh: command not found: git pusj
$ ai fix
$ git push█                            ← corrected, pre-filled
```

You can add a hint: `ai fix it should go to the staging remote`.

### Ctrl-G — transform in place

Type plain English directly on your prompt and press **Ctrl-G**; the line
transforms into the command where it stands. Same as `ai …` minus the prefix.

> Note: this rebinds Ctrl-G, which is `send-break` (abort line) in stock zsh
> and the readline abort in bash. If you rely on that, rebind the widget after
> the integration loads, e.g. `bindkey '^Xa' _clai_transform` in zsh.

### Learns your style

If you edit a pre-filled suggestion before running it (say, you always change
`kill -9` to `kill -15`), clai records the edit locally
(`~/.config/clai/edits.tsv`) and feeds recent edits back as examples — the
suggestions drift toward how *you* work. Delete the file to forget.

### Safety warnings

Destructive commands (`rm -rf`, `dd of=/dev/…`, force-push, pipe-to-shell…)
still land on your prompt — clai never blocks or nags — but a one-line warning
prints above it so you look twice before Enter.

### Speed

Repeated requests are served from a local cache (`~/.config/clai/cache.json`,
24 h TTL) — the cache key includes the environment context, so a hit is only
possible when your directory and git state are unchanged. Set `CLAI_NO_CACHE=1`
to bypass. For lowest latency pick a fast model in `ai setup`
(`claude-haiku-4-5`, `gemini-2.5-flash`, `gpt-5.1-mini`).

## Other commands

```sh
ai fix                 # fix the last command you ran
ai config              # show current provider/model (key masked)
ai setup               # reconfigure any time
clai shell-init zsh    # print the integration function
```

## Privacy & local files

Each request sends your words plus a small environment snapshot (cwd, file
*names* in the current directory, git branch/status summary, npm script and
Makefile target names, which common tools are installed) to the provider you
configured — never file contents, never environment variables. Prefer nothing
leave your machine? Pick Ollama in `ai setup`.

Everything clai stores lives in `~/.config/clai/`:

| File          | Purpose                                  |
|---------------|------------------------------------------|
| `config.json` | provider, model, API key (mode 0600)     |
| `cache.json`  | recent request → command cache           |
| `edits.tsv`   | your edits to suggestions (for learning) |

Delete any of them at any time; clai regenerates what it needs.
