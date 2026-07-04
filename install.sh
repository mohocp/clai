#!/bin/sh
# clai installer — curl -fsSL https://raw.githubusercontent.com/mohocp/clai/main/install.sh | sh
set -e

REPO="mohocp/clai"
DIR="${CLAI_HOME:-$HOME/.local/share/clai}"
BIN_DIR="$HOME/.local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "clai requires Node.js 18+ — install it from https://nodejs.org and re-run." >&2
  exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)'; then
  echo "clai requires Node.js 18+ (found $(node --version))." >&2
  exit 1
fi

echo "Installing clai to $DIR ..."
rm -rf "$DIR"
mkdir -p "$DIR" "$BIN_DIR"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" \
  | tar -xz -C "$DIR" --strip-components=1
chmod +x "$DIR/bin/clai.js"
ln -sf "$DIR/bin/clai.js" "$BIN_DIR/clai"

echo "Installed: $BIN_DIR/clai"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: $BIN_DIR is not on your PATH — add it to your shell rc file." ;;
esac

echo
echo "Next step:  clai setup"
echo "(it picks your AI provider and can add the shell integration for you)"
