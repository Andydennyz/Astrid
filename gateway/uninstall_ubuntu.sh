#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf '\nAstrid gateway uninstallation stopped: %s\n' "$1" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
  fail "Run this uninstaller as root or install sudo for the Ubuntu administrator account."
fi

echo "This removes only the Astrid RouterOS gateway from this Ubuntu host:"
echo "  - Stops and disables astrid-router-gateway"
echo "  - Deletes /opt/astrid-router-gateway"
echo "  - Deletes /etc/astrid-router-gateway, including its token, router passwords, and CA certificate"
echo "  - Removes the astrid-gateway service account and group"
echo "It does not change RouterOS, WireGuard, or Astrid's workspace gateway credential."
echo
read -r -p 'Type "UNINSTALL ASTRID GATEWAY" to continue: ' confirmation
if [ "$confirmation" != "UNINSTALL ASTRID GATEWAY" ]; then
  echo "Uninstallation cancelled; no changes were made."
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Administrator access is required. Enter the Ubuntu account's sudo password (not the gateway token or RouterOS password)."
  sudo -v ||
    fail "Ubuntu did not accept the sudo password. The gateway has not been uninstalled. Verify this account can use sudo with: sudo -v"
fi

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

command -v systemctl >/dev/null 2>&1 ||
  fail "systemctl is not available; this uninstaller requires an Ubuntu systemd host."

if systemctl cat astrid-router-gateway.service >/dev/null 2>&1; then
  run_root systemctl disable --now astrid-router-gateway.service
fi

run_root rm -f /etc/systemd/system/astrid-router-gateway.service
run_root rm -rf /opt/astrid-router-gateway /etc/astrid-router-gateway
run_root systemctl daemon-reload

if id astrid-gateway >/dev/null 2>&1; then
  run_root userdel astrid-gateway
fi
if getent group astrid-gateway >/dev/null 2>&1; then
  run_root groupdel astrid-gateway ||
    fail "Could not remove the astrid-gateway group. Check whether another account still uses it."
fi

echo
echo "Astrid Ubuntu gateway uninstalled."
echo "Before installing it again, create or rotate the one-time gateway credential in Astrid."
