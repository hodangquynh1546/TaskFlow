#!/bin/bash
# Builds the Windows installer (64-bit): web build + self-contained API + PostgreSQL + Electron shell, packed with NSIS.
# Runs on macOS. Result: release/TaskFlow-Setup-<version>-x64.exe and release/HUONG-DAN-CAI-DAT-WINDOWS.txt
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
RES="$HERE/resources"
RESW="$HERE/resources-win"
OUT="$REPO/release"
VERSION="$(node -p "require('$HERE/package.json').version")"
export PATH="/opt/homebrew/bin:/usr/local/share/dotnet:$PATH"

step() { printf '\n== %s\n' "$*"; }

step "Web build (Angular)"
(cd "$REPO/frontend" && npm run build)
rm -rf "$RES/web" && mkdir -p "$RES/web"
cp -R "$REPO/frontend/dist/taskflow/browser/." "$RES/web/"

step "API (.NET, self-contained for Windows x64)"
mkdir -p "$RESW"
chmod -R u+w "$RESW/api" 2>/dev/null || true
rm -rf "$RESW/api" && mkdir -p "$RESW/api"
dotnet publish "$REPO/backend/src/TaskManagement.API/TaskManagement.API.csproj" -c Release -r win-x64 --self-contained true \
  -p:UseAppHost=true -p:DebugType=None -p:DebugSymbols=false -o "$RESW/api" >/dev/null
rm -f "$RESW/api/appsettings.Development.json"
[ -f "$RESW/api/TaskManagement.API.exe" ] || { echo "The API build did not produce TaskManagement.API.exe" >&2; exit 1; }
du -sh "$RESW/api" | awk '{print "API bundle: " $1}'

step "PostgreSQL (Windows)"
"$HERE/scripts/fetch-postgres-win.sh"

step "Electron app and installer (NSIS)"
(cd "$HERE" && npx electron-builder --config electron-builder.win.yml --win nsis --x64)
INSTALLER="$HERE/dist-win/TaskFlow-Setup-${VERSION}-x64.exe"
[ -f "$INSTALLER" ] || { echo "The build did not produce $INSTALLER" >&2; exit 1; }

step "Release"
mkdir -p "$OUT"
cp "$INSTALLER" "$OUT/"
"$HERE/scripts/write-guide-win.sh" "$OUT/HUONG-DAN-CAI-DAT-WINDOWS.txt" "$VERSION"
du -sh "$OUT/TaskFlow-Setup-${VERSION}-x64.exe" | awk '{print "Installer: " $1}'
shasum -a 256 "$OUT/TaskFlow-Setup-${VERSION}-x64.exe"
