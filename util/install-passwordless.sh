#!/usr/bin/env sh
set -eu

SERVICE_NAME="gnomevantage-noroot.service"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SERVICE_SOURCE="${SCRIPT_DIR}/${SERVICE_NAME}"
SERVICE_TARGET="/etc/systemd/system/${SERVICE_NAME}"

if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root."
    echo "Use: sudo $0"
    exit 1
fi

if [ ! -f "${SERVICE_SOURCE}" ]; then
    echo "Service file not found: ${SERVICE_SOURCE}"
    exit 1
fi

echo "Installing ${SERVICE_NAME}..."
cp "${SERVICE_SOURCE}" "${SERVICE_TARGET}"

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo "Password-less mode enabled successfully."
