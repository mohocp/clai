const ZSH = `# clai shell integration (zsh) — add to ~/.zshrc:  eval "$(clai shell-init zsh)"
ai() {
  if [[ $# -eq 0 || "$1" == setup || "$1" == config || "$1" == shell-init || "$1" == --help || "$1" == -h || "$1" == --version ]]; then
    command clai "$@"
    return
  fi
  local cmd
  cmd="$(command clai "$@")" || return 1
  [[ -n "$cmd" ]] && print -z -- "$cmd"
}
`;

const BASH = `# clai shell integration (bash) — add to ~/.bashrc:  eval "$(clai shell-init bash)"
ai() {
  if [[ $# -eq 0 || "$1" == setup || "$1" == config || "$1" == shell-init || "$1" == --help || "$1" == -h || "$1" == --version ]]; then
    command clai "$@"
    return
  fi
  local cmd line
  cmd="$(command clai "$@")" || return 1
  [[ -n "$cmd" ]] || return 0
  # bash can't push into the prompt buffer from a function, so present the
  # command pre-filled and editable; Enter runs it, Ctrl-C aborts.
  read -e -i "$cmd" -p "$ " line && eval "$line"
}
`;

export function shellInit(shell) {
  if (shell === "zsh") return ZSH;
  if (shell === "bash") return BASH;
  throw new Error(`unsupported shell "${shell}" (supported: zsh, bash)`);
}
