#!/usr/bin/env bash
# Points <subdomain>.duckdns.org at this server's public IP (DuckDNS detects the IP itself).
# The token is passed to curl through stdin so it never shows up in process listings.
set -euo pipefail
: "${DUCKDNS_SUBDOMAIN:?DUCKDNS_SUBDOMAIN is not set}"
: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN is not set}"

response=$(printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' "$DUCKDNS_SUBDOMAIN" "$DUCKDNS_TOKEN" \
  | curl -fsS --max-time 20 --config -)

if [[ $response != OK ]]; then
  echo "DuckDNS update failed (response: ${response:-empty}). Check the subdomain and token." >&2
  exit 1
fi
echo "DuckDNS: $DUCKDNS_SUBDOMAIN.duckdns.org updated"
