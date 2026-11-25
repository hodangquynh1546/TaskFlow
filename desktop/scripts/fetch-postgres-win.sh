#!/bin/bash
# Prepares the PostgreSQL bundle for the Windows app (x64): downloads the pinned build, verifies it, and puts the Visual C++
# runtime next to the programs. Nothing here runs PostgreSQL. Runs on macOS, to build the Windows installer from a Mac.
#
# Source: the "embedded-postgres-binaries" project (EnterpriseDB builds of PostgreSQL, published on Maven Central).
set -euo pipefail

VERSION="16.15.0"
SHA1="5e395127a6561e24b16130748187561361f5365f"   # value published by Maven Central next to the jar
ARTIFACT="embedded-postgres-binaries-windows-amd64"
URL="https://repo1.maven.org/maven2/io/zonky/test/postgres/${ARTIFACT}/${VERSION}/${ARTIFACT}-${VERSION}.jar"

# The programs need VCRUNTIME140.dll, which a clean Windows does not always have. Microsoft allows shipping these DLLs with
# an app ("app-local deployment"); they come out of Microsoft's own Visual C++ Redistributable, whose hash is pinned here.
VCREDIST_URL="https://aka.ms/vs/17/release/vc_redist.x64.exe"
VCREDIST_SHA256="cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$HERE/.cache"
OUT="$HERE/resources-win/postgres"
JAR="$CACHE/${ARTIFACT}-${VERSION}.jar"
VCREDIST="$CACHE/vc_redist.x64.exe"

command -v 7zz >/dev/null || { echo "7zz is needed to unpack the Visual C++ runtime: brew install sevenzip" >&2; exit 1; }
mkdir -p "$CACHE"

if [ ! -f "$JAR" ]; then
  echo "Downloading PostgreSQL ${VERSION} for Windows..."
  curl -fsSL -o "$JAR" "$URL"
fi
echo "$SHA1  $JAR" | shasum -c - >/dev/null || { echo "Checksum mismatch for $JAR; refusing to use it." >&2; rm -f "$JAR"; exit 1; }

if [ ! -f "$VCREDIST" ]; then
  echo "Downloading the Visual C++ Redistributable..."
  curl -fsSL -o "$VCREDIST" "$VCREDIST_URL"
fi
echo "$VCREDIST_SHA256  $VCREDIST" | shasum -a 256 -c - >/dev/null || {
  echo "The Visual C++ Redistributable is not the pinned one (Microsoft publishes new versions at the same address)." >&2
  echo "Check the new file, then update VCREDIST_SHA256 in $0." >&2
  rm -f "$VCREDIST"
  exit 1
}

# Directories from the archive can come out read-only, which would stop rm from emptying them on the next run.
[ -d "$OUT" ] && chmod -R u+w "$OUT"
rm -rf "$OUT"
WORK="$(mktemp -d "$CACHE/pgwin-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
unzip -q "$JAR" -d "$WORK/jar"
mkdir -p "$OUT"
tar -xJf "$WORK"/jar/*.txz -C "$OUT"

# Programs and libraries only used by pgAdmin's tools, ECPG and tests; the server, initdb and pg_ctl do not load them.
rm -f "$OUT"/bin/wx*.dll "$OUT"/bin/testplug.dll "$OUT"/bin/libecpg*.dll "$OUT"/bin/libpgtypes.dll

echo "Unpacking the Visual C++ runtime..."
# vc_redist.x64.exe is a Burn bundle: its payload is an attached cabinet, which holds cabinets of the files themselves.
python3 - "$VCREDIST" "$WORK" <<'PY'
import struct, sys
data = open(sys.argv[1], 'rb').read()
i = 0
found = 0
while True:
    i = data.find(b'MSCF', i)
    if i < 0:
        break
    size = struct.unpack_from('<I', data, i + 8)[0]
    if data[i + 4:i + 8] == b'\0\0\0\0' and 0 < size <= len(data) - i:
        open(f'{sys.argv[2]}/c{found}.cab', 'wb').write(data[i:i + size])
        found += 1
        i += size
    else:
        i += 4
if not found:
    sys.exit('no cabinet found in the Visual C++ Redistributable')
PY
for cab in "$WORK"/c*.cab; do 7zz x -y "$cab" -o"$WORK/payload" >/dev/null 2>&1 || true; done
RUNTIME_CAB=""
for part in "$WORK"/payload/a*; do
  # (captured first: `grep -q` closing the pipe early would fail the pipeline under pipefail)
  listing="$(7zz l "$part" 2>/dev/null || true)"
  case "$listing" in *vcruntime140.dll_amd64*) RUNTIME_CAB="$part"; break ;; esac
done
[ -n "$RUNTIME_CAB" ] || { echo "The x64 runtime was not found in the Redistributable." >&2; exit 1; }
7zz x -y "$RUNTIME_CAB" -o"$WORK/runtime" >/dev/null
for dll in vcruntime140 vcruntime140_1 msvcp140; do
  cp "$WORK/runtime/${dll}.dll_amd64" "$OUT/bin/${dll}.dll"
done

for needed in postgres.exe initdb.exe pg_ctl.exe libpq.dll vcruntime140.dll icuuc67.dll; do
  [ -f "$OUT/bin/$needed" ] || { echo "Missing from the bundle: bin/$needed" >&2; exit 1; }
done
du -sh "$OUT" | awk '{print "PostgreSQL bundle (Windows): " $1}'
