#!/usr/bin/env bash
# Download yt-dlp, ffmpeg, and Deno for one Mac target.
#   scripts/fetch-binaries.sh                 # host CPU: mac-arm64, mac-x64, or win-x64
#   scripts/fetch-binaries.sh mac-arm64
#   scripts/fetch-binaries.sh mac-x64
#   scripts/fetch-binaries.sh win-x64
# Pins are the vendor checksums recorded for these releases.
# On macOS the script also clears quarantine and ad-hoc signs each binary.
# It does not use a paid certificate, notarization, or Authenticode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# yt-dlp 2026.08.19 official universal2 executable (x86_64 + arm64).
# Same file for both targets. Do not lipo -thin it.
YT_DLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_macos"
YT_DLP_SHA256="0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202"

host_target() {
  local sys machine
  sys="$(uname -s)"
  machine="$(uname -m)"
  case "$sys" in
    MINGW*|MSYS*|CYGWIN*) printf '%s\n' win-x64; return ;;
  esac
  case "$machine" in
    arm64|aarch64) printf '%s\n' mac-arm64 ;;
    x86_64|amd64) printf '%s\n' mac-x64 ;;
    *)
      echo "unsupported host architecture: $sys $machine. Pass mac-arm64, mac-x64, or win-x64." >&2
      return 1
      ;;
  esac
}

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
  local tmp bin detected
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

  detected="$(host_target)"
  case "$detected" in
    mac-arm64|mac-x64|win-x64) ;;
    *)
      echo "self-test failed: host target '$detected'" >&2
      exit 1
      ;;
  esac
  echo "host target $detected"
  echo "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  TARGET="$(host_target)"
elif [[ "$TARGET" != "mac-arm64" && "$TARGET" != "mac-x64" && "$TARGET" != "win-x64" ]]; then
  echo "usage: scripts/fetch-binaries.sh [mac-arm64|mac-x64|win-x64|--self-test]" >&2
  exit 2
fi

if [[ $# -gt 1 ]]; then
  echo "usage: scripts/fetch-binaries.sh [mac-arm64|mac-x64|win-x64|--self-test]" >&2
  exit 2
fi

# macOS targets share the universal yt-dlp binary. Windows uses yt-dlp.exe.
YT_DLP_NAME="yt-dlp"
DENO_MEMBER="deno"
FFMPEG_MEMBER="ffmpeg"
case "$TARGET" in
  mac-arm64)
    DENO_URL="https://github.com/denoland/deno/releases/download/v2.9.7/deno-aarch64-apple-darwin.zip"
    DENO_ZIP_SHA256="5cd46d6268f6f78f5d88bdc7159d20bd44cdaa4b3303474839f87ec6fe7ae25c"
    DENO_BIN_SHA256="b73737579d5a84c160e3316487594783fa5c15f4e13252a6a07050b755317f1a"
    FFMPEG_URL="https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip"
    FFMPEG_ZIP_SHA256="c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924"
    ;;
  mac-x64)
    DENO_URL="https://github.com/denoland/deno/releases/download/v2.9.7/deno-x86_64-apple-darwin.zip"
    DENO_ZIP_SHA256="95daaff11c116a52ad54785e7914c8e9c9cdcaba793c5ed929c74ca2d8e6259a"
    DENO_BIN_SHA256="325cf9c4b7156f4efd96ad22177a276a4bf4384147d4c9d9f40f9caee28e5719"
    FFMPEG_URL="https://ffmpeg.martin-riedl.de/download/macos/amd64/1789931006_9.0.2/ffmpeg.zip"
    FFMPEG_ZIP_SHA256="7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4"
    ;;
  win-x64)
    YT_DLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe"
    YT_DLP_SHA256="66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a"
    YT_DLP_NAME="yt-dlp.exe"
    DENO_URL="https://github.com/denoland/deno/releases/download/v2.9.7/deno-x86_64-pc-windows-msvc.zip"
    DENO_ZIP_SHA256="a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238"
    DENO_BIN_SHA256="e020f3e232bd16e33768dee528e5983349c962952051ced0a5d58ad42f5d9b33"
    DENO_MEMBER="deno.exe"
    FFMPEG_URL="https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip"
    FFMPEG_ZIP_SHA256="60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba"
    FFMPEG_MEMBER="ffmpeg.exe"
    ;;
esac

DEST="$ROOT/panel/bin/$TARGET"
mkdir -p "$DEST"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "target $TARGET"

echo "downloading yt-dlp"
download "$YT_DLP_URL" "$WORK/yt-dlp_macos"
verify_sha256 "$WORK/yt-dlp_macos" "$YT_DLP_SHA256"
cp "$WORK/yt-dlp_macos" "$DEST/$YT_DLP_NAME"
prepare_executable "$DEST/$YT_DLP_NAME"

echo "downloading deno"
download "$DENO_URL" "$WORK/deno.zip"
verify_sha256 "$WORK/deno.zip" "$DENO_ZIP_SHA256"
mkdir -p "$WORK/deno-out"
extract_member "$WORK/deno.zip" "$DENO_MEMBER" "$WORK/deno-out"
verify_sha256 "$WORK/deno-out/$DENO_MEMBER" "$DENO_BIN_SHA256"
cp "$WORK/deno-out/$DENO_MEMBER" "$DEST/$DENO_MEMBER"
prepare_executable "$DEST/$DENO_MEMBER"

echo "downloading ffmpeg"
download "$FFMPEG_URL" "$WORK/ffmpeg.zip"
verify_sha256 "$WORK/ffmpeg.zip" "$FFMPEG_ZIP_SHA256"
mkdir -p "$WORK/ffmpeg-out"
extract_member "$WORK/ffmpeg.zip" "$FFMPEG_MEMBER" "$WORK/ffmpeg-out"
cp "$WORK/ffmpeg-out/$FFMPEG_MEMBER" "$DEST/$FFMPEG_MEMBER"
prepare_executable "$DEST/$FFMPEG_MEMBER"

echo "installed into $DEST"
if command -v file >/dev/null 2>&1; then
  file "$DEST/$YT_DLP_NAME" "$DEST/$FFMPEG_MEMBER" "$DEST/$DENO_MEMBER"
fi
echo "On the Mac, also run: file, lipo -archs, and codesign -v. See docs/testing.md."
