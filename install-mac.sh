#!/usr/bin/env bash
# Copy this folder's panel into the per-user CEP extensions directory.
# Sets PlayerDebugMode, clears quarantine, ad-hoc signs the bundled binaries,
# checks those signatures, and creates ~/Movies/xImporter.
# No paid certificate, notarization, or Authenticode.
set -euo pipefail

binaries_in() {
  local dest="$1"
  local name folder
  for folder in mac-arm64 mac-x64; do
    for name in yt-dlp ffmpeg deno; do
      if [[ -f "$dest/bin/$folder/$name" ]]; then
        printf '%s\n' "$dest/bin/$folder/$name"
      fi
    done
  done
}

chmod_binaries() {
  local dest="$1"
  local bin found=0
  while IFS= read -r bin; do
    chmod +x "$bin"
    found=1
  done < <(binaries_in "$dest")
  if [[ "$found" -ne 1 ]]; then
    echo "no yt-dlp, ffmpeg, or deno under $dest/bin" >&2
    return 1
  fi
}

sign_and_verify() {
  local dest="$1"
  local bin
  while IFS= read -r bin; do
    codesign -s - --force "$bin"
    codesign -v "$bin"
    echo "codesign ok $(basename "$(dirname "$bin")")/$(basename "$bin")"
  done < <(binaries_in "$dest")
}

install_panel() {
  local source_root="$1"
  local home_dir="$2"
  local do_macos="$3"
  local panel="$source_root/panel"
  local dest="$home_dir/Library/Application Support/Adobe/CEP/extensions/xImporter"

  if [[ ! -f "$panel/CSXS/manifest.xml" ]]; then
    echo "missing $panel/CSXS/manifest.xml" >&2
    return 1
  fi

  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -R "$panel" "$dest"

  if [[ "$do_macos" == "1" ]]; then
    # CEP reads a string. An integer 1 is ignored by some Premiere versions.
    defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1
    defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1
    xattr -dr com.apple.quarantine "$dest" || true
    chmod_binaries "$dest"
    sign_and_verify "$dest"
  else
    chmod_binaries "$dest"
  fi

  mkdir -p "$home_dir/Movies/xImporter"

  echo "Panel: $dest"
  echo "Downloads: $home_dir/Movies/xImporter"
  echo "Listo. Cierra Premiere Pro por completo y ábrelo de nuevo."
  echo "Ventana > Extensiones > xImporter"
}

self_test() {
  local tmp home src dest
  tmp="$(mktemp -d)"
  home="$tmp/home"
  src="$tmp/src"
  mkdir -p "$src/panel/CSXS" "$src/panel/bin/mac-x64" "$home"
  echo '<manifest/>' > "$src/panel/CSXS/manifest.xml"
  printf 'yt' > "$src/panel/bin/mac-x64/yt-dlp"
  printf 'ff' > "$src/panel/bin/mac-x64/ffmpeg"
  printf 'dn' > "$src/panel/bin/mac-x64/deno"
  install_panel "$src" "$home" 0
  dest="$home/Library/Application Support/Adobe/CEP/extensions/xImporter"
  [[ -f "$dest/CSXS/manifest.xml" ]]
  [[ -x "$dest/bin/mac-x64/yt-dlp" ]]
  [[ -x "$dest/bin/mac-x64/ffmpeg" ]]
  [[ -x "$dest/bin/mac-x64/deno" ]]
  [[ -d "$home/Movies/xImporter" ]]
  rm -rf "$tmp"
  echo "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

if [[ $# -ne 0 ]]; then
  echo "usage: ./install-mac.sh" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-mac.sh must be run on macOS." >&2
  exit 1
fi

install_panel "$(cd "$(dirname "$0")" && pwd)" "$HOME" 1
