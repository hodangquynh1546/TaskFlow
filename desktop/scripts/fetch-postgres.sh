#!/bin/bash
# Prepares the PostgreSQL bundle for the app: downloads the pinned build, verifies it, keeps only Apple Silicon code,
# de-duplicates identical libraries and signs everything ad hoc. Nothing here runs PostgreSQL.
#
# Source: the "embedded-postgres-binaries" project (EnterpriseDB builds of PostgreSQL, published on Maven Central).
set -euo pipefail

VERSION="16.15.0"
SHA1="7e137ea36717602291e32ff5da93507374e273a2"   # value published by Maven Central next to the jar
ARTIFACT="embedded-postgres-binaries-darwin-arm64v8"
URL="https://repo1.maven.org/maven2/io/zonky/test/postgres/${ARTIFACT}/${VERSION}/${ARTIFACT}-${VERSION}.jar"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$HERE/.cache"
OUT="$HERE/resources/postgres"
JAR="$CACHE/${ARTIFACT}-${VERSION}.jar"

mkdir -p "$CACHE"
if [ ! -f "$JAR" ]; then
  echo "Downloading PostgreSQL ${VERSION}..."
  curl -fsSL -o "$JAR" "$URL"
fi
echo "$SHA1  $JAR" | shasum -c - >/dev/null || { echo "Checksum mismatch for $JAR; refusing to use it." >&2; rm -f "$JAR"; exit 1; }

rm -rf "$OUT"
WORK="$(mktemp -d "$CACHE/pg-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
unzip -q "$JAR" -d "$WORK"
mkdir -p "$OUT"
tar -xJf "$WORK"/*.txz -C "$OUT"

echo "Keeping Apple Silicon code only..."
while IFS= read -r file; do
  if lipo -info "$file" 2>/dev/null | grep -q "Architectures in the fat file"; then
    lipo -thin arm64 -output "$file.thin" "$file"
    mv "$file.thin" "$file"
    chmod +x "$file"
  fi
done < <(find "$OUT" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \))

echo "Removing duplicate libraries..."
# Identical files sort next to each other by checksum; keep the first and point the rest at it (macOS bash has no
# associative arrays, hence the sort).
prev_sum=""
prev_file=""
while read -r sum file; do
  if [ "$sum" = "$prev_sum" ]; then
    rm "$file"
    ln -s "$(basename "$prev_file")" "$file"
  else
    prev_sum="$sum"
    prev_file="$file"
  fi
done < <(find "$OUT/lib" -maxdepth 1 -type f -name '*.dylib' -print0 | xargs -0 shasum | sort)

echo "Signing (ad hoc)..."
find "$OUT" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \) -print0 | xargs -0 -n1 codesign --force --sign - >/dev/null 2>&1

du -sh "$OUT" | awk '{print "PostgreSQL bundle: " $1}'
