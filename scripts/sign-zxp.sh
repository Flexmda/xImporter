#!/usr/bin/env bash
# Build a self-signed ZXP with Adobe ZXPSignCmd.
# The .p12 is created in dist/certs/ and is gitignored. Do not commit it.
#
#   ZXPSIGNCMD=/path/to/ZXPSignCmd scripts/sign-zxp.sh mac-x64
#   scripts/sign-zxp.sh mac-arm64
#   scripts/sign-zxp.sh win-x64
#
# ZXPSignCmd 4.1.3 ships for macOS and Windows only:
#   https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD/4.1.3
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/dist/certs"
CERT_FILE="$CERT_DIR/ximporter-self.p12"
PASSWORD_FILE="$CERT_DIR/password.txt"

usage() {
  echo "usage: scripts/sign-zxp.sh [mac-arm64|mac-x64|win-x64|--self-test]" >&2
}

missing_tool() {
  echo "ZXPSignCmd was not found, so no .zxp was signed." >&2
  echo "Adobe ships ZXPSignCmd for macOS and Windows only (CEP-Resources ZXPSignCMD/4.1.3). There is no Linux build." >&2
  echo "On a Mac, download the macOS binary, then:" >&2
  echo "  chmod +x ZXPSignCmd" >&2
  echo "  xattr -dr com.apple.quarantine ZXPSignCmd" >&2
  echo "  ZXPSIGNCMD=\$PWD/ZXPSignCmd scripts/sign-zxp.sh mac-x64" >&2
  echo "On Windows, ZXPSIGNCMD can point at ZXPSignCmd.exe from the x64 folder." >&2
  echo "The self-signed .p12 is written to dist/certs/ximporter-self.p12 and must not be committed." >&2
  exit 2
}

find_tool() {
  if [[ "${ZXPSIGN_FORCE_MISSING:-}" == "1" ]]; then
    return 1
  fi
  if [[ -n "${ZXPSIGNCMD:-}" && -x "${ZXPSIGNCMD}" ]]; then
    printf '%s\n' "$ZXPSIGNCMD"
    return 0
  fi
  if command -v ZXPSignCmd >/dev/null 2>&1; then
    command -v ZXPSignCmd
    return 0
  fi
  local candidate
  for candidate in "$ROOT/tools/ZXPSignCmd" "$ROOT/tools/ZXPSignCmd.exe"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

bin_names() {
  if [[ "$1" == "win-x64" ]]; then
    printf '%s\n' yt-dlp.exe ffmpeg.exe deno.exe
  else
    printf '%s\n' yt-dlp ffmpeg deno
  fi
}

stage_extension() {
  local target="$1"
  local stage="$2"
  local bin_name src_bin
  mkdir -p "$stage/bin/$target"
  cp -R "$ROOT/panel/CSXS" "$ROOT/panel/client" "$ROOT/panel/host" "$ROOT/panel/node" "$stage/"
  cp "$ROOT/panel/.debug" "$stage/.debug"
  rm -f "$stage/node/"*.test.js
  while IFS= read -r bin_name; do
    src_bin="$ROOT/panel/bin/$target/$bin_name"
    if [[ ! -f "$src_bin" ]]; then
      echo "missing $src_bin" >&2
      echo "run: scripts/fetch-binaries.sh $target" >&2
      return 1
    fi
    cp "$src_bin" "$stage/bin/$target/$bin_name"
    chmod +x "$stage/bin/$target/$bin_name" || true
  done < <(bin_names "$target")
}

ensure_cert() {
  local tool="$1"
  mkdir -p "$CERT_DIR"
  if [[ -f "$CERT_FILE" && -f "$PASSWORD_FILE" ]]; then
    return 0
  fi
  local password
  password="$(openssl rand -base64 18 | tr -d '\n')"
  printf '%s\n' "$password" > "$PASSWORD_FILE"
  chmod 600 "$PASSWORD_FILE"
  # Country, state, org, common name, password, output. No paid certificate.
  "$tool" -selfSignedCert US CA xImporter xImporter "$password" "$CERT_FILE"
}

self_test() {
  local out status
  set +e
  out="$(ZXPSIGN_FORCE_MISSING=1 bash "$ROOT/scripts/sign-zxp.sh" mac-x64 2>&1)"
  status=$?
  set -e
  if [[ "$status" -ne 2 ]]; then
    echo "expected exit 2 when ZXPSignCmd is missing, got $status" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  if [[ "$out" != *"ZXPSignCmd was not found"* ]]; then
    echo "missing-tool message was not printed" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  if [[ "$out" != *"dist/certs/ximporter-self.p12"* ]]; then
    echo "message should name the gitignored cert path" >&2
    exit 1
  fi
  if ! grep -q -- "-selfSignedCert" "$ROOT/scripts/sign-zxp.sh"; then
    echo "sign-zxp.sh does not call -selfSignedCert" >&2
    exit 1
  fi
  if ! grep -q -- "-sign" "$ROOT/scripts/sign-zxp.sh"; then
    echo "sign-zxp.sh does not call -sign" >&2
    exit 1
  fi
  if ! git -C "$ROOT" check-ignore -q "dist/certs/ximporter-self.p12"; then
    echo "dist/certs/ximporter-self.p12 is not gitignored" >&2
    exit 1
  fi
  echo "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

TARGET="${1:-}"
if [[ "$TARGET" != "mac-arm64" && "$TARGET" != "mac-x64" && "$TARGET" != "win-x64" ]]; then
  usage
  exit 2
fi
if [[ $# -gt 1 ]]; then
  usage
  exit 2
fi

TOOL="$(find_tool || true)"
if [[ -z "$TOOL" ]]; then
  missing_tool
fi

VERSION="$(node -p "require(process.argv[1]).version" "$ROOT/package.json")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
stage_extension "$TARGET" "$STAGE"
mkdir -p "$ROOT/dist"
ensure_cert "$TOOL"
PASSWORD="$(tr -d '\r\n' < "$PASSWORD_FILE")"
OUT="$ROOT/dist/xImporter-${VERSION}-${TARGET}.zxp"
# Timestamp when the network allows it. A self-signed cert without TSA still signs.
if ! "$TOOL" -sign "$STAGE" "$OUT" "$CERT_FILE" "$PASSWORD" -tsa http://timestamp.digicert.com; then
  echo "timestamp server failed; signing again without TSA" >&2
  "$TOOL" -sign "$STAGE" "$OUT" "$CERT_FILE" "$PASSWORD"
fi
echo "$OUT"
echo "Cert (do not commit): $CERT_FILE"
