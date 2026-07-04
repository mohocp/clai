// The shell integration is where most of clai's intelligence hooks in:
//   - `ai <words>` pre-fills the generated command on the prompt
//   - preexec/precmd hooks remember the last command + exit status so
//     `ai fix` knows what to repair
//   - when the user edits a pre-filled suggestion before running it, the
//     (suggested, ran) pair is appended to edits.tsv for personalization
//   - Ctrl-G transforms plain English typed on the prompt into a command
//     in place
// Everything is best-effort and must never break the user's shell.

const ZSH = `# clai shell integration (zsh) — add to ~/.zshrc:  eval "$(clai shell-init zsh)"
typeset -g _clai_last_cmd='' _clai_last_status='' _clai_suggested=''
typeset -gi _clai_track=0

_clai_log_edit() { # $1 = suggested command, $2 = command actually run
  local dir="\${XDG_CONFIG_HOME:-$HOME/.config}/clai"
  mkdir -p "$dir" 2>/dev/null || return
  printf '%s\\t%s\\n' "\${1//$'\\t'/ }" "\${2//$'\\t'/ }" >> "$dir/edits.tsv" 2>/dev/null
}

_clai_preexec() {
  local cmd=$1
  [[ -n $cmd ]] || return 0   # no history line — nothing to learn or track
  if [[ -n $_clai_suggested ]]; then
    # user ran something after a suggestion: if it's a variation of the
    # suggestion (shares its first word), record the edit for learning
    if [[ $cmd != "$_clai_suggested" && $cmd == *"\${_clai_suggested%% *}"* ]]; then
      _clai_log_edit "$_clai_suggested" "$cmd"
    fi
    _clai_suggested=''
  fi
  # don't let ai/clai invocations overwrite the command \`ai fix\` should fix
  if [[ $cmd == ai || $cmd == ai\\ * || $cmd == clai || $cmd == clai\\ * ]]; then
    _clai_track=0
  else
    _clai_last_cmd=$cmd
    _clai_track=1
  fi
}

_clai_precmd() {
  local st=$?
  (( _clai_track )) && _clai_last_status=$st
  _clai_track=0
}

# our precmd must run first so $? is still the user command's exit status
if [[ -z \${precmd_functions[(r)_clai_precmd]} ]]; then
  precmd_functions=(_clai_precmd $precmd_functions)
fi
autoload -Uz add-zsh-hook
add-zsh-hook preexec _clai_preexec

ai() {
  case "$1" in
    ''|setup|config|shell-init|--help|-h|--version)
      command clai "$@"
      return
      ;;
  esac
  local cmd
  cmd="$(CLAI_LAST_CMD=$_clai_last_cmd CLAI_LAST_STATUS=$_clai_last_status command clai "$@")" || return 1
  [[ -n $cmd ]] || return 1
  _clai_suggested=$cmd
  print -z -- "$cmd"
}

# Ctrl-G: transform the English already typed on the prompt into a command
_clai_transform() {
  [[ -n $BUFFER ]] || return 0
  local req=$BUFFER out err
  err="$(mktemp "\${TMPDIR:-/tmp}/clai.XXXXXX")" || return 0
  zle -M 'clai: thinking…'
  out="$(CLAI_LAST_CMD=$_clai_last_cmd CLAI_LAST_STATUS=$_clai_last_status command clai "$req" 2>"$err")"
  if [[ -n $out ]]; then
    _clai_suggested=$out
    BUFFER=$out
    CURSOR=\${#BUFFER}
    if [[ -s $err ]]; then zle -M "$(<"$err")"; else zle -M ''; fi
  else
    zle -M "clai: $(head -n1 "$err")"
  fi
  rm -f "$err"
  zle redisplay
}
zle -N _clai_transform
bindkey '^G' _clai_transform
`;

const BASH = `# clai shell integration (bash) — add to ~/.bashrc:  eval "$(clai shell-init bash)"
_clai_last_cmd='' _clai_last_status='' _clai_suggested=''

_clai_log_edit() { # $1 = suggested command, $2 = command actually run
  local dir="\${XDG_CONFIG_HOME:-$HOME/.config}/clai"
  mkdir -p "$dir" 2>/dev/null || return
  printf '%s\\t%s\\n' "\${1//$'\\t'/ }" "\${2//$'\\t'/ }" >> "$dir/edits.tsv" 2>/dev/null
}

# runs before each prompt: remember the last command + exit status for
# \`ai fix\`, and learn from edits of Ctrl-G suggestions
_clai_prompt() {
  local st=$?
  local cmd
  cmd="$(HISTTIMEFORMAT= builtin history 1 2>/dev/null | sed 's/^ *[0-9]* *//')"
  [[ -z $cmd || $cmd == ai || $cmd == ai\\ * || $cmd == clai || $cmd == clai\\ * ]] && return
  if [[ -n $_clai_suggested ]]; then
    if [[ $cmd != "$_clai_suggested" && $cmd == *"\${_clai_suggested%% *}"* ]]; then
      _clai_log_edit "$_clai_suggested" "$cmd"
    fi
    _clai_suggested=''
  fi
  _clai_last_cmd=$cmd
  _clai_last_status=$st
}
case ";\${PROMPT_COMMAND:-};" in
  *";_clai_prompt;"*) ;;
  *) PROMPT_COMMAND="_clai_prompt\${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
esac

ai() {
  case "$1" in
    ''|setup|config|shell-init|--help|-h|--version)
      command clai "$@"
      return
      ;;
  esac
  local cmd line st
  cmd="$(CLAI_LAST_CMD=$_clai_last_cmd CLAI_LAST_STATUS=$_clai_last_status command clai "$@")" || return 1
  [[ -n $cmd ]] || return 0
  # bash can't push into the prompt buffer from a function, so present the
  # command pre-filled and editable; Enter runs it, Ctrl-C aborts.
  read -e -i "$cmd" -p "$ " line || return
  [[ -n $line ]] || return 0
  if [[ $line != "$cmd" && $line == *"\${cmd%% *}"* ]]; then
    _clai_log_edit "$cmd" "$line"
  fi
  eval "$line"
  st=$?
  _clai_last_cmd=$line
  _clai_last_status=$st
  return $st
}

# Ctrl-G: transform the English already typed on the prompt into a command
_clai_transform() {
  [[ -n $READLINE_LINE ]] || return
  local out
  out="$(CLAI_LAST_CMD=$_clai_last_cmd CLAI_LAST_STATUS=$_clai_last_status command clai "$READLINE_LINE" 2>/dev/null)"
  if [[ -n $out ]]; then
    _clai_suggested=$out
    READLINE_LINE=$out
    READLINE_POINT=\${#out}
  fi
}
if [[ $- == *i* ]]; then
  bind -x '"\\C-g": _clai_transform' 2>/dev/null
fi
`;

export function shellInit(shell) {
  if (shell === "zsh") return ZSH;
  if (shell === "bash") return BASH;
  throw new Error(`unsupported shell "${shell}" (supported: zsh, bash)`);
}
