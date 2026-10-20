#!/usr/bin/env bash
# Build dist/xImporter-<version>-<target>.zip
#   scripts/package.sh              # target follows the host CPU
#   scripts/package.sh mac-x64
#   scripts/package.sh mac-arm64
#   scripts/package.sh win-x64
# A Mac zip contains panel/ (that target's binaries only), install-mac.sh, and INSTALAR.txt.
# A Windows zip contains panel/, setup-dev.bat, and INSTALAR.txt.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

host_target() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) printf '%s\n' win-x64; return 0 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) printf '%s\n' mac-arm64 ;;
    x86_64|amd64) printf '%s\n' mac-x64 ;;
    *)
      echo "unsupported host architecture: $(uname -m). Pass mac-arm64, mac-x64, or win-x64." >&2
      return 1
      ;;
  esac
}

arch_label() {
  case "$1" in
    mac-x64) printf '%s\n' "Mac Intel (x86_64)" ;;
    mac-arm64) printf '%s\n' "Mac Apple Silicon (arm64)" ;;
    win-x64) printf '%s\n' "Windows x64" ;;
    *) return 1 ;;
  esac
}

bin_arch() {
  case "$1" in
    mac-x64) printf '%s\n' x86_64 ;;
    mac-arm64) printf '%s\n' arm64 ;;
    win-x64) printf '%s\n' x86_64 ;;
    *) return 1 ;;
  esac
}

bin_file_names() {
  if [[ "$1" == "win-x64" ]]; then
    printf '%s\n' yt-dlp.exe ffmpeg.exe deno.exe
  else
    printf '%s\n' yt-dlp ffmpeg deno
  fi
}

read_version() {
  local repo="$1"
  node -p "require(process.argv[1]).version" "$repo/package.json"
}

build_zip() {
  local repo="$1"
  local target="$2"
  local out_dir="$3"
  local version label cpu stage name bin_name src_bin

  version="$(read_version "$repo")"
  label="$(arch_label "$target")"
  cpu="$(bin_arch "$target")"
  name="xImporter-${version}-${target}"
  stage="$(mktemp -d)"
  mkdir -p "$stage/$name/panel/bin/$target" "$out_dir"

  cp -R "$repo/panel/CSXS" "$repo/panel/client" "$repo/panel/host" "$repo/panel/node" "$stage/$name/panel/"
  cp "$repo/panel/.debug" "$stage/$name/panel/.debug"
  rm -f "$stage/$name/panel/node/"*.test.js

  while IFS= read -r bin_name; do
    src_bin="$repo/panel/bin/$target/$bin_name"
    if [[ ! -f "$src_bin" ]]; then
      echo "missing $src_bin" >&2
      echo "run: scripts/fetch-binaries.sh $target" >&2
      rm -rf "$stage"
      return 1
    fi
    cp "$src_bin" "$stage/$name/panel/bin/$target/$bin_name"
    chmod +x "$stage/$name/panel/bin/$target/$bin_name"
  done < <(bin_file_names "$target")

  if [[ "$target" == "win-x64" ]]; then
    cp "$repo/scripts/setup-dev.bat" "$stage/$name/setup-dev.bat"
    sed \
      -e "s/@@VERSION@@/${version}/g" \
      -e "s/@@TARGET@@/${target}/g" \
      -e "s/@@ARCH_LABEL@@/${label}/g" \
      -e "s/@@BIN_ARCH@@/${cpu}/g" \
      "$repo/packaging/INSTALAR-WIN.txt" > "$stage/$name/INSTALAR.txt"
  else
    cp "$repo/install-mac.sh" "$stage/$name/install-mac.sh"
    chmod +x "$stage/$name/install-mac.sh"
    sed \
      -e "s/@@VERSION@@/${version}/g" \
      -e "s/@@TARGET@@/${target}/g" \
      -e "s/@@ARCH_LABEL@@/${label}/g" \
      -e "s/@@BIN_ARCH@@/${cpu}/g" \
      "$repo/packaging/INSTALAR.txt" > "$stage/$name/INSTALAR.txt"
  fi

  python3 - "$stage/$name" "$out_dir/$name.zip" <<'PY'
import os
import sys
import zipfile

folder, zip_path = sys.argv[1:]
parent = os.path.dirname(folder)
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for dirpath, _dirnames, filenames in os.walk(folder):
        for filename in filenames:
            full = os.path.join(dirpath, filename)
            arcname = os.path.relpath(full, parent)
            info = zipfile.ZipInfo.from_file(full, arcname)
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(full, "rb") as handle:
                archive.writestr(info, handle.read())
PY
  rm -rf "$stage"
  echo "$out_dir/$name.zip"
}

self_test() {
  local tmp repo out zip
  tmp="$(mktemp -d)"
  repo="$tmp/repo"
  out="$tmp/dist"
  mkdir -p "$repo/panel/CSXS" "$repo/panel/client" "$repo/panel/host" "$repo/panel/node" \
    "$repo/panel/bin/mac-x64" "$repo/panel/bin/mac-arm64" "$repo/packaging"
  printf '%s\n' '{"name":"ximporter","version":"9.9.9","private":true}' > "$repo/package.json"
  printf '%s\n' '<ExtensionManifest Version="11.0"/>' > "$repo/panel/CSXS/manifest.xml"
  printf '%s\n' '<debug/>' > "$repo/panel/.debug"
  printf '%s\n' 'console.log(1)' > "$repo/panel/client/main.js"
  printf '%s\n' 'function importDownloadedFile(){}' > "$repo/panel/host/import.jsx"
  printf '%s\n' 'module.exports = {}' > "$repo/panel/node/engine.js"
  printf '%s\n' 'test("skip", function() {})' > "$repo/panel/node/engine.test.js"
  printf 'yt-intel' > "$repo/panel/bin/mac-x64/yt-dlp"
  printf 'ff-intel' > "$repo/panel/bin/mac-x64/ffmpeg"
  printf 'dn-intel' > "$repo/panel/bin/mac-x64/deno"
  printf 'yt-arm' > "$repo/panel/bin/mac-arm64/yt-dlp"
  cp "$ROOT/install-mac.sh" "$repo/install-mac.sh"
  cp "$ROOT/packaging/INSTALAR.txt" "$repo/packaging/INSTALAR.txt"

  zip="$(build_zip "$repo" mac-x64 "$out")"
  python3 - "$zip" <<'PY'
import sys
import zipfile

path = sys.argv[1]
with zipfile.ZipFile(path) as archive:
    names = set(archive.namelist())
    required = [
        "xImporter-9.9.9-mac-x64/install-mac.sh",
        "xImporter-9.9.9-mac-x64/INSTALAR.txt",
        "xImporter-9.9.9-mac-x64/panel/CSXS/manifest.xml",
        "xImporter-9.9.9-mac-x64/panel/.debug",
        "xImporter-9.9.9-mac-x64/panel/bin/mac-x64/yt-dlp",
        "xImporter-9.9.9-mac-x64/panel/bin/mac-x64/ffmpeg",
        "xImporter-9.9.9-mac-x64/panel/bin/mac-x64/deno",
        "xImporter-9.9.9-mac-x64/panel/node/engine.js",
    ]
    missing = [name for name in required if name not in names]
    if missing:
        sys.stderr.write("missing from zip: %s\n" % missing)
        sys.exit(1)
    banned = [name for name in names if "mac-arm64" in name or name.endswith("engine.test.js")]
    if banned:
        sys.stderr.write("unexpected in zip: %s\n" % banned)
        sys.exit(1)
    text = archive.read("xImporter-9.9.9-mac-x64/INSTALAR.txt").decode("utf-8")
    for needle in ("Descomprime", "mac-x64", "Mac Intel (x86_64)", "x86_64 arm64", "xImporter-9.9.9-mac-x64"):
        if needle not in text:
            sys.stderr.write("INSTALAR.txt missing %s\n" % needle)
            sys.exit(1)
    if "@@" in text:
        sys.stderr.write("INSTALAR.txt still has placeholders\n")
        sys.exit(1)
    info = archive.getinfo("xImporter-9.9.9-mac-x64/install-mac.sh")
    mode = (info.external_attr >> 16) & 0o777
    if mode & 0o111 == 0:
        sys.stderr.write("install-mac.sh is not executable in the zip (mode %o)\n" % mode)
        sys.exit(1)
print("zip ok")
PY

  mkdir -p "$repo/scripts" "$repo/panel/bin/win-x64"
  printf 'yt' > "$repo/panel/bin/win-x64/yt-dlp.exe"
  printf 'ff' > "$repo/panel/bin/win-x64/ffmpeg.exe"
  printf 'dn' > "$repo/panel/bin/win-x64/deno.exe"
  cp "$ROOT/scripts/setup-dev.bat" "$repo/scripts/setup-dev.bat"
  cp "$ROOT/packaging/INSTALAR-WIN.txt" "$repo/packaging/INSTALAR-WIN.txt"
  zip="$(build_zip "$repo" win-x64 "$out")"
  python3 - "$zip" <<'PY'
import sys
import zipfile

path = sys.argv[1]
with zipfile.ZipFile(path) as archive:
    names = set(archive.namelist())
    required = [
        "xImporter-9.9.9-win-x64/setup-dev.bat",
        "xImporter-9.9.9-win-x64/INSTALAR.txt",
        "xImporter-9.9.9-win-x64/panel/bin/win-x64/yt-dlp.exe",
        "xImporter-9.9.9-win-x64/panel/bin/win-x64/ffmpeg.exe",
        "xImporter-9.9.9-win-x64/panel/bin/win-x64/deno.exe",
    ]
    missing = [name for name in required if name not in names]
    if missing:
        sys.stderr.write("missing from win zip: %s\n" % missing)
        sys.exit(1)
    banned = [name for name in names if "mac-x64" in name or "mac-arm64" in name or name.endswith("install-mac.sh")]
    if banned:
        sys.stderr.write("unexpected in win zip: %s\n" % banned)
        sys.exit(1)
    text = archive.read("xImporter-9.9.9-win-x64/INSTALAR.txt").decode("utf-8")
    for needle in ("Descomprime", "PlayerDebugMode", "APPDATA", "Windows x64", "win-x64"):
        if needle not in text:
            sys.stderr.write("Windows INSTALAR.txt missing %s\n" % needle)
            sys.exit(1)
    if "@@" in text:
        sys.stderr.write("Windows INSTALAR.txt still has placeholders\n")
        sys.exit(1)
    bat = archive.read("xImporter-9.9.9-win-x64/setup-dev.bat").decode("utf-8")
    for needle in ("PlayerDebugMode", "REG_SZ", "CSXS.11", "CSXS.12"):
        if needle not in bat:
            sys.stderr.write("setup-dev.bat missing %s\n" % needle)
            sys.exit(1)
print("win zip ok")
PY
  rm -rf "$tmp"
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
  echo "usage: scripts/package.sh [mac-arm64|mac-x64|win-x64|--self-test]" >&2
  exit 2
fi

if [[ $# -gt 1 ]]; then
  echo "usage: scripts/package.sh [mac-arm64|mac-x64|win-x64|--self-test]" >&2
  exit 2
fi

build_zip "$ROOT" "$TARGET" "$ROOT/dist"
