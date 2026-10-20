#!/usr/bin/env bash
# Download the Apple Silicon binaries for the milestone 1 spike.
# Pins are the vendor checksums fetched when this script was written.
# On macOS the script also clears quarantine and ad-hoc signs each binary.
# It does not use a paid certificate, notarization, or Authenticode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/panel/bin/mac-arm64"

# yt-dlp 2026.08.19 official universal2 executable.
# SHA-256 from SHA2-256SUMS on that GitHub release. Do not lipo -thin this file.
YT_DLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_macos"
YT_DLP_SHA256="0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202"

# Deno 2.9.7 official aarch64-apple-darwin zip, plus the inner binary hash.
DENO_URL="https://github.com/denoland/deno/releases/download/v2.9.7/deno-aarch64-apple-darwin.zip"
DENO_ZIP_SHA256="5cd46d6268f6f78f5d88bdc7159d20bd44cdaa4b3303474839f87ec6fe7ae25c"
DENO_BIN_SHA256="b73737579d5a84c160e3316487594783fa5c15f4e13252a6a07050b755317f1a"

# Martin Riedl static FFmpeg 9.0.2 release, macOS arm64.
# ffmpeg.org does not publish macOS binaries. This build includes x264 (GPL).
FFMPEG_URL="https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip"
FFMPEG_ZIP_SHA256="c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

verify_sha256() {
  local file="$1"
  local expected="$2"
  local actual
  actual="$(sha256_file "$file" | tr '[:upper:]' '[:lower:]')"
  expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"
  if [[ "$actual" != "$expected" ]]; then
    echo "checksum mismatch for $file" >&2
    echo "expected $expected" >&2
    echo "actual   $actual" >&2
    return 1
  fi
  echo "checksum ok $(basename "$file")"
}

prepare_executable() {
  local file="$1"
  chmod +x "$file"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    xattr -dr com.apple.quarantine "$file" || true
    codesign -s - --force "$file"
  else
    echo "not macOS ($(uname -s)): skipped xattr -dr com.apple.quarantine and codesign -s - for $(basename "$file")"
  fi
}

extract_member() {
  local zip_path="$1"
  local member_name="$2"
  local dest_dir="$3"
  python3 - "$zip_path" "$member_name" "$dest_dir" <<'PY'
import sys
import zipfile

zip_path, member_name, dest_dir = sys.argv[1:]
with zipfile.ZipFile(zip_path) as archive:
    matches = [
        name for name in archive.namelist()
        if name.split("/")[-1] == member_name and not name.endswith("/")
    ]
    if len(matches) != 1:
        sys.stderr.write("expected one %s in zip, found %s\n" % (member_name, matches))
        sys.exit(1)
    info = archive.getinfo(matches[0])
    info.filename = member_name
    archive.extract(info, dest_dir)
PY
}

download() {
  curl --fail --location --retry 3 --retry-delay 2 --output "$2" "$1"
}

self_test() {
  local tmp bin
  tmp="$(mktemp)"
  printf 'ximporter' > "$tmp"
  verify_sha256 "$tmp" "901f614a39969249edc592031fcc964c277991fd4893f995142479fc81e1b383"
  if verify_sha256 "$tmp" "0000000000000000000000000000000000000000000000000000000000000000" 2>/dev/null; then
    echo "self-test failed: a bad checksum was accepted" >&2
    rm -f "$tmp"
    exit 1
  fi
  rm -f "$tmp"

  bin="$(mktemp)"
  printf '#!/bin/sh\necho ok\n' > "$bin"
  prepare_executable "$bin"
  if [[ ! -x "$bin" ]]; then
    echo "self-test failed: chmod +x did not stick" >&2
    rm -f "$bin"
    exit 1
  fi
  rm -f "$bin"
  echo "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

if [[ $# -ne 0 ]]; then
  echo "usage: scripts/fetch-binaries.sh [--self-test]" >&2
  exit 2
fi

mkdir -p "$DEST"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "downloading yt-dlp"
download "$YT_DLP_URL" "$WORK/yt-dlp_macos"
verify_sha256 "$WORK/yt-dlp_macos" "$YT_DLP_SHA256"
cp "$WORK/yt-dlp_macos" "$DEST/yt-dlp"
prepare_executable "$DEST/yt-dlp"

echo "downloading deno"
download "$DENO_URL" "$WORK/deno.zip"
verify_sha256 "$WORK/deno.zip" "$DENO_ZIP_SHA256"
mkdir -p "$WORK/deno-out"
extract_member "$WORK/deno.zip" "deno" "$WORK/deno-out"
verify_sha256 "$WORK/deno-out/deno" "$DENO_BIN_SHA256"
cp "$WORK/deno-out/deno" "$DEST/deno"
prepare_executable "$DEST/deno"

echo "downloading ffmpeg"
download "$FFMPEG_URL" "$WORK/ffmpeg.zip"
verify_sha256 "$WORK/ffmpeg.zip" "$FFMPEG_ZIP_SHA256"
mkdir -p "$WORK/ffmpeg-out"
extract_member "$WORK/ffmpeg.zip" "ffmpeg" "$WORK/ffmpeg-out"
cp "$WORK/ffmpeg-out/ffmpeg" "$DEST/ffmpeg"
prepare_executable "$DEST/ffmpeg"

echo "installed into $DEST"
if command -v file >/dev/null 2>&1; then
  file "$DEST/yt-dlp" "$DEST/ffmpeg" "$DEST/deno"
fi
echo "On the Mac, also run: file, lipo -archs, and codesign -v. See docs/testing.md."
