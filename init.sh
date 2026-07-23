#!/usr/bin/env bash

set -Eeuo pipefail

skip_server=false

case "${1:-}" in
  "")
    ;;
  --skip-server|-SkipServer)
    skip_server=true
    ;;
  --help|-h)
    cat <<'EOF'
Usage:
  bash ./init.sh                 Initialize, verify, and start Hexo
  bash ./init.sh --skip-server   Initialize and verify without starting Hexo
EOF
    exit 0
    ;;
  *)
    echo "Unknown argument: $1" >&2
    echo "Run 'bash ./init.sh --help' for usage." >&2
    exit 2
    ;;
esac

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command '$1' was not found. Install it and add it to PATH." >&2
    exit 1
  fi
}

run_checked() {
  printf '> '
  printf '%q ' "$@"
  printf '\n'
  "$@"
}

require_command git
require_command node
require_command npm

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$repository_root"

if ! git_top_level="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "This script must be run from a Git working tree." >&2
  exit 1
fi

git_top_level="$(cd -- "$git_top_level" && pwd -P)"
if [[ "$git_top_level" != "$repository_root" ]]; then
  echo "The script location is not the Git repository root: $repository_root" >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "source" ]]; then
  echo "Current branch is '$current_branch'. Run 'git switch source' first." >&2
  exit 1
fi

if [[ ! -f "$repository_root/package-lock.json" ]]; then
  echo "package-lock.json is missing; deterministic npm installation is unavailable." >&2
  exit 1
fi

printf 'Repository: %s\n' "$repository_root"
printf 'Branch:     %s\n' "$current_branch"
printf 'Node:       %s\n' "$(node --version)"
printf 'npm:        %s\n' "$(npm --version)"

printf '\n[1/3] Initializing Git submodules...\n'
run_checked git submodule sync --recursive
run_checked git submodule update --init --recursive

printf '\n[2/3] Installing npm dependencies...\n'
run_checked npm ci

printf '\n[3/3] Verifying the Hexo build...\n'
run_checked npm run build

printf '\nInitialization completed successfully.\n'

if [[ "$skip_server" == true ]]; then
  echo "Run 'npm run server' when you are ready to start Hexo."
else
  echo "Starting Hexo at http://localhost:4000/ (press Ctrl+C to stop)..."
  run_checked npm run server
fi
