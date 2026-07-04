# clai

Natural language → shell command, right on your prompt.

```
$ ai kill process on port 8001
$ lsof -ti:8001 | xargs kill -9█        ← pre-filled, editable; hit Enter to run
```

No copy-paste, no execution behind your back — the command lands in your input
buffer and *you* press Enter.

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

## Other commands

```sh
ai config              # show current provider/model (key masked)
ai setup               # reconfigure any time
clai shell-init zsh    # print the integration function
```
