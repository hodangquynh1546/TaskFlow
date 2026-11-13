#!/bin/bash
# Builds TaskFlow.app (Apple Silicon): web build + self-contained API + PostgreSQL + Electron shell.
# Usage: scripts/build.sh            build only (result: desktop/dist/mac-arm64/TaskFlow.app)
#        scripts/build.sh --install  also replace ~/Applications/TaskFlow.app
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
RES="$HERE/resources"
export PATH="/opt/homebrew/bin:/usr/local/share/dotnet:$PATH"

step() { printf '\n== %s\n' "$*"; }

step "Web build (Angular)"
(cd "$REPO/frontend" && npm run build)
rm -rf "$RES/web" && mkdir -p "$RES/web"
cp -R "$REPO/frontend/dist/taskflow/browser/." "$RES/web/"

step "API (.NET, self-contained for macOS arm64)"
rm -rf "$RES/api" && mkdir -p "$RES/api"
dotnet publish "$REPO/backend/src/TaskManagement.API/TaskManagement.API.csproj" -c Release -r osx-arm64 --self-contained true \
  -p:UseAppHost=true -p:DebugType=None -p:DebugSymbols=false -o "$RES/api" >/dev/null
rm -f "$RES/api/appsettings.Development.json"
du -sh "$RES/api" | awk '{print "API bundle: " $1}'

step "PostgreSQL"
"$HERE/scripts/fetch-postgres.sh"

step "Electron app"
(cd "$HERE" && npx electron-builder --mac dir --arm64)
APP="$HERE/dist/mac-arm64/TaskFlow.app"
[ -d "$APP" ] || { echo "The build did not produce $APP" >&2; exit 1; }

step "Signing (ad hoc)"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP" && echo "signature ok"
du -sh "$APP" | awk '{print "TaskFlow.app: " $1}'

if [ "${1:-}" = "--install" ]; then
  step "Installing to ~/Applications"
  # The Docker-based launcher uses the same app name; the real app replaces it.
  [ -x "$REPO/scripts/taskflow" ] && "$REPO/scripts/taskflow" uninstall || true
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/TaskFlow.app"
  cp -R "$APP" "$HOME/Applications/TaskFlow.app"
  echo "Installed: $HOME/Applications/TaskFlow.app"
fi
