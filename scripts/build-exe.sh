#!/usr/bin/env bash
# Unsigned NSIS installer for Windows x64. No Authenticode.
#   scripts/build-exe.sh
# SmartScreen will warn. The person installing chooses More info > Run anyway.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  echo "usage: scripts/build-exe.sh [--self-test]" >&2
}

need_nsis() {
  echo "makensis (NSIS) was not found, so no .exe was built." >&2
  echo "Install NSIS and run: scripts/build-exe.sh" >&2
  echo "The installer is unsigned. SmartScreen shows \"Windows protected your PC\". Choose More info, then Run anyway." >&2
  exit 2
}

vi_version() {
  local version="$1"
  if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s.0\n' "$version"
    return 0
  fi
  if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s\n' "$version"
    return 0
  fi
  echo "unsupported version for NSIS: $version" >&2
  return 1
}

stage_panel() {
  local repo="$1"
  local stage="$2"
  local name src
  mkdir -p "$stage/bin/win-x64"
  cp -R "$repo/panel/CSXS" "$repo/panel/client" "$repo/panel/host" "$repo/panel/node" "$stage/"
  cp "$repo/panel/.debug" "$stage/.debug"
  rm -f "$stage/node/"*.test.js
  for name in yt-dlp.exe ffmpeg.exe deno.exe; do
    src="$repo/panel/bin/win-x64/$name"
    if [[ ! -f "$src" ]]; then
      echo "missing $src" >&2
      echo "run: scripts/fetch-binaries.sh win-x64" >&2
      return 1
    fi
    cp "$src" "$stage/bin/win-x64/$name"
  done
}

file_commands() {
  local stage="$1"
  local rel dir
  while IFS= read -r -d '' file; do
    rel="${file#"$stage"/}"
    dir="$(dirname "$rel")"
    if [[ "$dir" == "." ]]; then
      printf 'SetOutPath "$INSTDIR"\n'
    else
      printf 'SetOutPath "$INSTDIR/%s"\n' "$dir"
    fi
    printf 'File "%s"\n' "$file"
  done < <(find "$stage" -type f -print0)
}

render_nsi() {
  local stage="$1"
  local out="$2"
  local version="$3"
  local vi="$4"
  local dest="$5"
  local files
  files="$(file_commands "$stage")"
  # Paths come from mktemp and have no NSIS metacharacters.
  FILES="$files" OUT_PATH="$out" VERSION_VALUE="$version" VI_VALUE="$vi" \
    DEST_NSI="$dest" TEMPLATE="$ROOT/packaging/windows/ximporter.nsi" \
    python3 - <<'PY'
import os
text = open(os.environ["TEMPLATE"], encoding="utf-8").read()
text = text.replace("@@OUT@@", os.environ["OUT_PATH"])
text = text.replace("@@VERSION@@", os.environ["VERSION_VALUE"])
text = text.replace("@@VI_VERSION@@", os.environ["VI_VALUE"])
text = text.replace("@@FILES@@", os.environ["FILES"].rstrip() + "\n")
open(os.environ["DEST_NSI"], "w", encoding="utf-8").write(text)
PY
}

compile_installer() {
  local repo="$1"
  local out="$2"
  local extra="${3:-}"
  local version work stage nsi vi
  version="$(node -p "require(process.argv[1]).version" "$repo/package.json")"
  vi="$(vi_version "$version")"
  work="$(mktemp -d)"
  stage="$work/panel"
  nsi="$work/ximporter.nsi"
  stage_panel "$repo" "$stage"
  mkdir -p "$(dirname "$out")"
  render_nsi "$stage" "$out" "$version" "$vi" "$nsi"
  if [[ -n "$extra" ]]; then
    makensis "$extra" "$nsi"
  else
    makensis "$nsi"
  fi
  rm -rf "$work"
  echo "$out"
}

self_test() {
  local tmp repo out needle
  if ! command -v makensis >/dev/null 2>&1; then
    echo "makensis is not installed; installer script was not compiled here." >&2
    if ! grep -q "PlayerDebugMode" "$ROOT/packaging/windows/ximporter.nsi"; then
      exit 1
    fi
    echo "self-test ok"
    return 0
  fi
  tmp="$(mktemp -d)"
  repo="$tmp/repo"
  out="$tmp/xImporter-9.9.9-win-x64.exe"
  mkdir -p "$repo/panel/CSXS" "$repo/panel/client" "$repo/panel/host" "$repo/panel/node" "$repo/panel/bin/win-x64"
  printf '%s\n' '{"name":"ximporter","version":"9.9.9","private":true}' > "$repo/package.json"
  printf '%s\n' '<ExtensionManifest Version="11.0"/>' > "$repo/panel/CSXS/manifest.xml"
  printf '%s\n' '<debug/>' > "$repo/panel/.debug"
  printf '%s\n' 'panel' > "$repo/panel/client/index.html"
  printf '%s\n' 'function importDownloadedFile(){}' > "$repo/panel/host/import.jsx"
  printf '%s\n' 'module.exports = {}' > "$repo/panel/node/engine.js"
  printf '%s\n' 'test("skip", function() {})' > "$repo/panel/node/engine.test.js"
  printf 'yt' > "$repo/panel/bin/win-x64/yt-dlp.exe"
  printf 'ff' > "$repo/panel/bin/win-x64/ffmpeg.exe"
  printf 'dn' > "$repo/panel/bin/win-x64/deno.exe"
  compile_installer "$repo" "$out" -DXIP_UNCOMPRESSED >/dev/null
  if ! grep -q "WriteUninstaller" "$ROOT/packaging/windows/ximporter.nsi"; then
    echo "installer template has no uninstaller" >&2
    exit 1
  fi
  python3 - "$out" <<'PY'
import sys
path = sys.argv[1]
data = open(path, "rb").read()
if not data.startswith(b"MZ"):
    sys.stderr.write("installer is not a PE executable\n")
    sys.exit(1)
needles = [
    "PlayerDebugMode",
    "Software\\Adobe\\CSXS.11",
    "Software\\Adobe\\CSXS.12",
    "Uninstall-xImporter.exe",
    "Adobe\\CEP\\extensions\\xImporter",
    "ExtensionManifest",
    "yt-dlp.exe",
]
for needle in needles:
    raw = needle.encode("utf-8")
    wide = needle.encode("utf-16le")
    if raw not in data and wide not in data:
        sys.stderr.write("missing from exe: %s\n" % needle)
        sys.exit(1)
print("exe ok")
PY
  rm -rf "$tmp"
  echo "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

if [[ $# -gt 0 ]]; then
  usage
  exit 2
fi

if ! command -v makensis >/dev/null 2>&1; then
  need_nsis
fi

version="$(node -p "require(process.argv[1]).version" "$ROOT/package.json")"
mkdir -p "$ROOT/dist"
compile_installer "$ROOT" "$ROOT/dist/xImporter-${version}-win-x64.exe"
echo "Unsigned installer. SmartScreen: More info > Run anyway."
