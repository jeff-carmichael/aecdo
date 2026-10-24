#!/bin/sh
# Install the aecdo CLI from GitHub Releases.
#
#   curl -sSL https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.sh | sh
#
# Environment overrides:
#   AECDO_VERSION      release tag to install, e.g. v0.3.1 (default: latest)
#   AECDO_INSTALL_DIR  destination directory (default: /usr/local/bin)

set -eu

REPO="jeff-carmichael/aecdo"
BIN="aecdo"
VERSION="${AECDO_VERSION:-latest}"
INSTALL_DIR="${AECDO_INSTALL_DIR:-/usr/local/bin}"

info() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

download() {
  if has curl; then
    curl -fsSL "$1" -o "$2"
  elif has wget; then
    wget -q "$1" -O "$2"
  else
    fail "curl or wget is required"
  fi
}

detect_target() {
  os=$(uname -s)
  arch=$(uname -m)

  case "$os" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    MINGW* | MSYS* | CYGWIN*) fail "Windows is not supported by this script; download aecdo-windows-x64.zip from https://github.com/$REPO/releases" ;;
    *) fail "unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "unsupported architecture: $arch" ;;
  esac

  # A shell running under Rosetta reports x86_64 on Apple Silicon; prefer the native build.
  if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
    arch=arm64
  fi

  if [ "$os" = linux ] && { [ -f /etc/alpine-release ] || ldd --version 2>&1 | grep -qi musl; }; then
    fail "musl-based Linux (e.g. Alpine) is not supported yet; install with npm instead"
  fi

  echo "$os-$arch"
}

verify_checksum() {
  file=$1
  sums=$2
  name=$(basename "$file")
  expected=$(grep " $name\$" "$sums" | awk '{print $1}')
  [ -n "$expected" ] || fail "no checksum listed for $name"

  if has sha256sum; then
    actual=$(sha256sum "$file" | awk '{print $1}')
  elif has shasum; then
    actual=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    info "warning: sha256sum/shasum not found, skipping checksum verification"
    return 0
  fi

  [ "$expected" = "$actual" ] || fail "checksum mismatch for $name (expected $expected, got $actual)"
}

main() {
  target=$(detect_target)
  asset="$BIN-$target.tar.gz"

  if [ "$VERSION" = latest ]; then
    base="https://github.com/$REPO/releases/latest/download"
  else
    base="https://github.com/$REPO/releases/download/$VERSION"
  fi

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM

  info "Downloading $asset ($VERSION)..."
  download "$base/$asset" "$tmp/$asset" || fail "could not download $base/$asset"
  download "$base/checksums.txt" "$tmp/checksums.txt" || fail "could not download checksums.txt"
  verify_checksum "$tmp/$asset" "$tmp/checksums.txt"

  tar -xzf "$tmp/$asset" -C "$tmp"
  [ -f "$tmp/$BIN" ] || fail "archive did not contain $BIN"
  chmod +x "$tmp/$BIN"

  sudo=""
  if [ ! -d "$INSTALL_DIR" ]; then
    mkdir -p "$INSTALL_DIR" 2>/dev/null || sudo="sudo"
  fi
  if [ -z "$sudo" ] && [ ! -w "$INSTALL_DIR" ]; then
    sudo="sudo"
  fi
  if [ -n "$sudo" ]; then
    has sudo || fail "$INSTALL_DIR is not writable and sudo is not available; set AECDO_INSTALL_DIR to a writable directory"
    info "Installing to $INSTALL_DIR requires elevated permissions; you may be prompted for your password."
    $sudo mkdir -p "$INSTALL_DIR"
  fi

  $sudo mv "$tmp/$BIN" "$INSTALL_DIR/$BIN"

  info "Installed $BIN to $INSTALL_DIR/$BIN"
  "$INSTALL_DIR/$BIN" --version || true

  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *) info "note: $INSTALL_DIR is not on your PATH" ;;
  esac
}

main "$@"
