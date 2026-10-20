#!/usr/bin/env bash
# Build an unsigned double-click .pkg. pkgbuild/productbuild and ad hoc
# codesign exist only on macOS. On any other OS this script stops and
# explains how to run it on a Mac or from the manual GitHub Actions workflow.
#
#   scripts/build-pkg.sh mac-arm64
#   scripts/build-pkg.sh mac-x64
#   scripts/build-pkg.sh mac-universal
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_LOCATION="/Library/Application Support/Adobe/CEP/extensions/xImporter"

usage() {
  echo "usage: scripts/build-pkg.sh [mac-arm64|mac-x64|mac-universal|--self-test]" >&2
}

need_macos() {
  echo "pkgbuild, productbuild, and ad hoc codesign require macOS. No .pkg was built on $(uname -s)." >&2
  echo "The package is unsigned (no Developer ID and no notarization)." >&2
  echo "On a Mac, after the binaries are fetched:" >&2
  echo "  scripts/fetch-binaries.sh mac-arm64" >&2
  echo "  scripts/fetch-binaries.sh mac-x64" >&2
  echo "  scripts/build-pkg.sh mac-arm64" >&2
  echo "  scripts/build-pkg.sh mac-x64" >&2
  echo "  scripts/build-pkg.sh mac-universal" >&2
  echo "Or run the GitHub Actions workflow \"mac installers\" by hand (workflow_dispatch). It does not run on push or on merge." >&2
  echo "The first time someone opens the pkg: right-click > Open. On macOS 15 or later, System Settings > Privacy & Security > Open Anyway." >&2
  exit 2
}

copy_tree() {
  local repo="$1"
  local target="$2"
  local stage="$3"
  local name src
  mkdir -p "$stage/bin/$target"
  if [[ ! -d "$stage/CSXS" ]]; then
    cp -R "$repo/panel/CSXS" "$repo/panel/client" "$repo/panel/host" "$repo/panel/node" "$stage/"
    cp "$repo/panel/.debug" "$stage/.debug"
    rm -f "$stage/node/"*.test.js
  fi
  for name in yt-dlp ffmpeg deno; do
    src="$repo/panel/bin/$target/$name"
    if [[ ! -f "$src" ]]; then
      echo "missing $src" >&2
      echo "run: scripts/fetch-binaries.sh $target" >&2
      return 1
    fi
    cp "$src" "$stage/bin/$target/$name"
    chmod 755 "$stage/bin/$target/$name"
    if command -v codesign >/dev/null 2>&1; then
      xattr -dr com.apple.quarantine "$stage/bin/$target/$name" || true
      codesign -s - --force "$stage/bin/$target/$name"
    fi
  done
}

host_arches() {
  case "$1" in
    mac-arm64) printf '%s\n' "arm64" ;;
    mac-x64) printf '%s\n' "x86_64" ;;
    mac-universal) printf '%s\n' "arm64,x86_64" ;;
    *) return 1 ;;
  esac
}

build_pkg() {
  local target="$1"
  local version stage script_dir res_dir work component dist_xml out arches
  version="$(node -p "require(process.argv[1]).version" "$ROOT/package.json")"
  arches="$(host_arches "$target")"
  work="$(mktemp -d)"
  stage="$work/root"
  script_dir="$work/scripts"
  res_dir="$work/resources"
  mkdir -p "$stage" "$script_dir" "$res_dir" "$ROOT/dist"
  if [[ "$target" == "mac-universal" ]]; then
    copy_tree "$ROOT" mac-arm64 "$stage"
    copy_tree "$ROOT" mac-x64 "$stage"
  else
    copy_tree "$ROOT" "$target" "$stage"
  fi
  cp "$ROOT/packaging/macos/postinstall" "$script_dir/postinstall"
  chmod 755 "$script_dir/postinstall"
  cp "$ROOT/packaging/macos/welcome.html" "$res_dir/welcome.html"
  component="$work/xImporter-component.pkg"
  dist_xml="$work/distribution.xml"
  out="$ROOT/dist/xImporter-${version}-${target}.pkg"
  cat > "$dist_xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>xImporter ${version}</title>
    <welcome file="welcome.html" mime-type="text/html"/>
    <options customize="never" require-scripts="false" hostArchitectures="${arches}"/>
    <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
    <choices-outline>
        <line choice="ximporter"/>
    </choices-outline>
    <choice id="ximporter" visible="false" title="xImporter">
        <pkg-ref id="com.ximporter.panel"/>
    </choice>
    <pkg-ref id="com.ximporter.panel" version="${version}" onConclusion="none">xImporter-component.pkg</pkg-ref>
</installer-gui-script>
EOF
  pkgbuild \
    --root "$stage" \
    --scripts "$script_dir" \
    --identifier "com.ximporter.panel" \
    --version "$version" \
    --install-location "$INSTALL_LOCATION" \
    "$component"
  productbuild \
    --distribution "$dist_xml" \
    --package-path "$work" \
    --resources "$res_dir" \
    "$out"
  rm -rf "$work"
  echo "$out"
  echo "Unsigned package. First open: right-click the pkg > Open."
  echo "macOS 15+: System Settings > Privacy & Security > Open Anyway."
}

self_test() {
  local post out status
  post="$ROOT/packaging/macos/postinstall"
  for needle in "codesign -s - --force" "codesign -v" "xattr -dr com.apple.quarantine" "PlayerDebugMode -string 1" "com.adobe.CSXS.11" "com.adobe.CSXS.12" "chmod 755"; do
    if ! grep -q -- "$needle" "$post"; then
      echo "postinstall missing: $needle" >&2
      exit 1
    fi
  done
  if ! grep -q "pkgbuild" "$ROOT/scripts/build-pkg.sh" || ! grep -q "productbuild" "$ROOT/scripts/build-pkg.sh"; then
    echo "build-pkg.sh must call pkgbuild and productbuild" >&2
    exit 1
  fi
  if ! grep -q "workflow_dispatch" "$ROOT/.github/workflows/installers.yml"; then
    echo "installers workflow must be workflow_dispatch" >&2
    exit 1
  fi
  if grep -E '^on:|^  push:|^  pull_request:' "$ROOT/.github/workflows/installers.yml" | head -n 20 | grep -q 'push:\|pull_request:'; then
    echo "installers workflow must not run on push or pull_request" >&2
    exit 1
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "self-test ok"
    return 0
  fi
  set +e
  out="$(bash "$ROOT/scripts/build-pkg.sh" mac-arm64 2>&1)"
  status=$?
  set -e
  if [[ "$status" -ne 2 ]]; then
    echo "expected exit 2 off macOS, got $status" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  if [[ "$out" != *"No .pkg was built"* || "$out" != *"Open Anyway"* ]]; then
    echo "macOS guidance was not printed" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  echo "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

TARGET="${1:-}"
if [[ "$TARGET" != "mac-arm64" && "$TARGET" != "mac-x64" && "$TARGET" != "mac-universal" ]]; then
  usage
  exit 2
fi
if [[ $# -gt 1 ]]; then
  usage
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]] || ! command -v pkgbuild >/dev/null 2>&1 || ! command -v productbuild >/dev/null 2>&1; then
  need_macos
fi

build_pkg "$TARGET"
