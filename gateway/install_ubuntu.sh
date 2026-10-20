#!/usr/bin/env bash
(
set -Eeuo pipefail

ASTRID_GATEWAY_REVISION="e3ee61409d102daeadd05e6527f58a36bd283431"
ASTRID_GATEWAY_BASE_URL="https://raw.githubusercontent.com/Andydennyz/Astrid/${ASTRID_GATEWAY_REVISION}/gateway"
# Update the pinned revision when either gateway source file changes.
ASTRID_GATEWAY_TMP="$(mktemp -d)"

cleanup() {
  rm -f \
    "${ASTRID_GATEWAY_TMP}/router_gateway.py" \
    "${ASTRID_GATEWAY_TMP}/astrid-router-gateway.service" \
    "${ASTRID_GATEWAY_TMP}/config.json"
  rmdir "$ASTRID_GATEWAY_TMP"
}
trap cleanup EXIT

fail() {
  printf '\nAstrid gateway installation stopped: %s\n' "$1" >&2
  exit 1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
  fail "Run this installer as root or install sudo for the Ubuntu administrator account."
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Administrator access is required. Enter the Ubuntu account's sudo password (not the gateway token or RouterOS password)."
  sudo -v ||
    fail "Ubuntu did not accept the sudo password. No system changes have been made. Verify this account can use sudo with: sudo -v"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is missing. Checking Ubuntu time synchronization before using apt..."
  command -v timedatectl >/dev/null 2>&1 ||
    fail "Python 3 is missing and timedatectl is unavailable. Install Python 3 and synchronize Ubuntu's clock before running the installer again."

  if ! timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -qx "yes"; then
    run_root timedatectl set-ntp true ||
      fail "Could not enable network time synchronization. Enable NTP for this Ubuntu host and run the installer again."

    for attempt in $(seq 1 36); do
      if timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -qx "yes"; then
        break
      fi
      sleep 5
    done
  fi

  if ! timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -qx "yes"; then
    echo "Ubuntu time synchronization diagnostics:" >&2
    timedatectl status >&2 || true
    timedatectl timesync-status >&2 || true
    fail "Ubuntu's clock is not synchronized. Check the VM host clock and allow NTP (UDP 123) to reach its time server, then rerun. The installer has not run apt."
  fi

  echo "Installing Python 3..."
  run_root apt-get update ||
    fail "Ubuntu package indexes could not be updated. The clock is synchronized; check this host's package-mirror network access and rerun."
  run_root apt-get install -y python3 ||
    fail "Ubuntu could not install Python 3."
fi

command -v systemctl >/dev/null 2>&1 ||
  fail "systemctl is not available; install the gateway on an Ubuntu systemd host."

echo "Downloading the pinned Astrid gateway worker and service definition..."
export ASTRID_GATEWAY_BASE_URL ASTRID_GATEWAY_TMP
if ! python3 - <<'PY'
import os
import hashlib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

base_url = os.environ["ASTRID_GATEWAY_BASE_URL"]
destination = Path(os.environ["ASTRID_GATEWAY_TMP"])
files = {
    "router_gateway.py": "a340685a0ea9e1f2d6847a98ab2f28fc7c772b19980ab11556cd33ef3f2a0085",
    "astrid-router-gateway.service": "fcd5afbcf476c01b587f1d57a20f87939fc85f04589c6b226b85da16aa4d4beb",
}

for filename, expected_sha256 in files.items():
    url = f"{base_url}/{filename}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            final_url = urllib.parse.urlparse(response.geturl())
            if final_url.scheme != "https" or final_url.hostname != "raw.githubusercontent.com":
                raise RuntimeError("GitHub redirected the download to an unexpected host")
            content = response.read(2 * 1024 * 1024 + 1)
    except (urllib.error.URLError, TimeoutError) as error:
        raise SystemExit(f"Could not download {filename}: {error}") from error

    if not content or len(content) > 2 * 1024 * 1024:
        raise SystemExit(f"Downloaded {filename} was empty or exceeded the size limit")
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise SystemExit(f"Downloaded {filename} did not match the pinned SHA-256 checksum")
    (destination / filename).write_bytes(content)
PY
then
  fail "Could not download the pinned Astrid gateway files. Check outbound HTTPS access to raw.githubusercontent.com."
fi

getent group astrid-gateway >/dev/null 2>&1 ||
  run_root groupadd --system astrid-gateway
id astrid-gateway >/dev/null 2>&1 ||
  run_root useradd --system --gid astrid-gateway --no-create-home \
    --home-dir /nonexistent --shell /usr/sbin/nologin astrid-gateway
run_root usermod --gid astrid-gateway --home /nonexistent \
  --shell /usr/sbin/nologin astrid-gateway

run_root install -d -o astrid-gateway -g astrid-gateway -m 0750 \
  /opt/astrid-router-gateway/gateway \
  /etc/astrid-router-gateway
run_root install -o astrid-gateway -g astrid-gateway -m 0644 \
  "${ASTRID_GATEWAY_TMP}/router_gateway.py" \
  /opt/astrid-router-gateway/gateway/router_gateway.py
run_root install -o root -g root -m 0644 \
  "${ASTRID_GATEWAY_TMP}/astrid-router-gateway.service" \
  /etc/systemd/system/astrid-router-gateway.service
run_root systemctl daemon-reload

CONFIG_PATH="/etc/astrid-router-gateway/config.json"
if [ ! -f "$CONFIG_PATH" ]; then
  if [ ! -r /dev/tty ]; then
    fail "No interactive terminal is available for the first-time prompts. Download this installer to a file, then run it with bash from your Ubuntu terminal."
  fi
  exec 3</dev/tty
  echo
  echo "Enter the connection details shown in Astrid Step 1."
  read -r -u 3 -p "Convex site URL: " CONVEX_SITE_URL ||
    fail "Could not read the Convex site URL from the terminal."
  read -r -u 3 -p "Workspace ID: " WORKSPACE_ID ||
    fail "Could not read the workspace ID from the terminal."
  read -r -s -u 3 -p "One-time gateway credential (input hidden): " GATEWAY_TOKEN ||
    fail "Could not read the gateway credential from the terminal."
  echo
  exec 3<&-
    CONFIG_OUTPUT_PATH="${ASTRID_GATEWAY_TMP}/config.json"
    export CONVEX_SITE_URL WORKSPACE_ID GATEWAY_TOKEN CONFIG_OUTPUT_PATH

  python3 - <<'PY'
import json
import os
import re
import urllib.parse
from pathlib import Path

config_path = Path(os.environ["CONFIG_OUTPUT_PATH"])
convex_site_url = os.environ.get("CONVEX_SITE_URL", "").strip()
workspace_id = os.environ.get("WORKSPACE_ID", "").strip()
gateway_token = os.environ.get("GATEWAY_TOKEN", "").strip()
parsed_url = urllib.parse.urlparse(convex_site_url)

if (
    parsed_url.scheme != "https"
    or not parsed_url.netloc
    or parsed_url.username
    or parsed_url.password
    or parsed_url.query
    or parsed_url.fragment
):
    raise SystemExit("Enter the HTTPS Convex site URL shown in Astrid.")
if not workspace_id:
    raise SystemExit("Workspace ID cannot be empty.")
if not re.fullmatch(r"[0-9a-f]{64}", gateway_token):
    raise SystemExit("Gateway credential must be the 64-character value from Astrid.")

config = {
    "convex_site_url": f"{parsed_url.scheme}://{parsed_url.netloc}",
    "workspace_id": workspace_id,
    "gateway_token": gateway_token,
    "poll_interval_seconds": 3,
    "request_timeout_seconds": 20,
    "ca_bundle": "/etc/astrid-router-gateway/router-ca.pem",
    "routers": {},
}
with config_path.open("w", encoding="utf-8") as output:
    json.dump(config, output, indent=2)
    output.write("\n")
os.chmod(config_path, 0o600)
PY
  run_root install -o astrid-gateway -g astrid-gateway -m 0600 \
    "$CONFIG_OUTPUT_PATH" "$CONFIG_PATH"
else
  run_root chown astrid-gateway:astrid-gateway "$CONFIG_PATH"
  run_root chmod 0600 "$CONFIG_PATH"
  echo
  echo "Existing gateway configuration found; keeping its credentials and router entries unchanged."
fi

run_root systemctl enable astrid-router-gateway
run_root systemctl restart astrid-router-gateway
run_root systemctl is-active --quiet astrid-router-gateway ||
  fail "The gateway service did not start. Check it with: sudo journalctl -u astrid-router-gateway -n 50 --no-pager"

echo
echo "Astrid gateway worker installed and running."
echo "The worker is polling Astrid. Add the router API credentials and CA certificate in Step 3."
echo "To view gateway logs: sudo journalctl -u astrid-router-gateway -f"
)
