#!/usr/bin/env bash
# One-command server setup for Oracle Cloud Always Free (Ubuntu 22.04 / 24.04, ARM or x86).
#
# Start with a free DuckDNS subdomain (HTTPS by Caddy + Let's Encrypt):
#   sudo bash temple-directory/deploy/server/setup.sh --mode duckdns \
#        --domain angalamman.duckdns.org --email you@example.com
#
# Later, switch to your own domain through Cloudflare Tunnel (closes ports 80/443):
#   sudo bash /opt/temple-directory/current/deploy/server/setup.sh --mode cloudflare
#
# Safe to re-run. Existing data, passwords and configuration are never overwritten.
# Secrets (DuckDNS token, tunnel token) are prompted for, or read from the
# DUCKDNS_TOKEN / TUNNEL_TOKEN environment variables — never pass them as arguments.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MODE=""
DOMAIN=""
ACME_EMAIL=""
TEMPLE_NAME="Sri Angalamman kovil"
TIMEZONE="Asia/Kolkata"
GENERATED_ADMIN_PASSWORD=""
GENERATED_VIEWER_PASSWORD=""

usage() {
  cat <<'EOF'
Usage: sudo bash setup.sh --mode duckdns --domain NAME.duckdns.org --email YOU@EXAMPLE.COM [options]
       sudo bash setup.sh --mode cloudflare [--domain directory.yourtemple.org] [options]

Options:
  --temple-name "Name"   Shown on the login page (first install only). Default: Sri Angalamman kovil
  --timezone Zone        Server timezone for logs and backup schedule. Default: Asia/Kolkata
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    [[ $# -ge 2 || $1 == -h || $1 == --help ]] || die "Missing value for $1"
    case "$1" in
      --mode) MODE=$2; shift 2 ;;
      --domain) DOMAIN=${2,,}; shift 2 ;;
      --email) ACME_EMAIL=$2; shift 2 ;;
      --temple-name) TEMPLE_NAME=$2; shift 2 ;;
      --timezone) TIMEZONE=$2; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) usage; die "Unknown option: $1" ;;
    esac
  done

  case "$MODE" in
    duckdns)
      [[ $DOMAIN =~ ^[a-z0-9][a-z0-9-]{0,62}\.duckdns\.org$ ]] || die "--domain must look like yourname.duckdns.org"
      [[ $ACME_EMAIL =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "--email is required (Let's Encrypt sends certificate expiry notices there)"
      ;;
    cloudflare)
      [[ -z $DOMAIN || $DOMAIN =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]] || die "--domain is not a valid hostname"
      ;;
    *) usage; die "--mode must be 'duckdns' or 'cloudflare'" ;;
  esac
  [[ $TEMPLE_NAME =~ ^[^\"\\\$\`]{2,80}$ ]] || die "--temple-name must be 2-80 characters without quotes, backslashes, \$ or backticks"
}

check_system() {
  log "Checking the server"
  [[ -r /etc/os-release ]] || die "Cannot detect the operating system"
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ ${ID:-} == ubuntu ]] || die "This kit supports Ubuntu 22.04 or 24.04 (found ${PRETTY_NAME:-unknown})"
  command -v systemctl >/dev/null || die "systemd is required"
  ok "${PRETTY_NAME} on $(uname -m)"
}

install_base_packages() {
  log "Installing base packages and security updates"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get upgrade -y -qq
  apt-get install -y -qq curl ca-certificates gnupg sqlite3 openssl unattended-upgrades >/dev/null
  if ! command -v netfilter-persistent >/dev/null; then
    echo 'iptables-persistent iptables-persistent/autosave_v4 boolean true' | debconf-set-selections
    echo 'iptables-persistent iptables-persistent/autosave_v6 boolean true' | debconf-set-selections
    apt-get install -y -qq iptables-persistent >/dev/null
  fi
  timedatectl set-timezone "$TIMEZONE" 2>/dev/null || warn "Could not set timezone to $TIMEZONE"
  ok "Base packages ready (timezone $(timedatectl show -p Timezone --value 2>/dev/null || echo unknown))"
}

ensure_swap() {
  local mem_kb
  mem_kb=$(awk '/MemTotal/ { print $2 }' /proc/meminfo)
  if (( mem_kb < 2 * 1024 * 1024 )) && ! swapon --show | grep -q .; then
    log "Adding 2 GB swap (this VM has less than 2 GB RAM)"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Swap enabled"
  fi
}

node_is_supported() {
  command -v node >/dev/null && node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1);'
}

install_node() {
  log "Installing Node.js 24"
  if node_is_supported; then
    ok "Node.js $(node --version) already installed"
    return
  fi
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh >/dev/null
  rm -f /tmp/nodesource_setup.sh
  apt-get install -y -qq nodejs >/dev/null
  node_is_supported || die "Node.js installation failed"
  ok "Node.js $(node --version)"
}

create_app_user_and_dirs() {
  log "Creating the '$APP_USER' service account and folders"
  id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
  install -d -m 0755 -o root -g root "$APP_ROOT" "$APP_ROOT/releases"
  install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR" "$BACKUP_DIR"
  install -d -m 0750 -o root -g "$APP_USER" "$CONFIG_DIR"
  ok "App code: $APP_ROOT   Data: $DATA_DIR   Config: $CONFIG_DIR"
}

write_app_config() {
  log "Writing application configuration"
  if [[ -f $ENV_FILE ]]; then
    ok "Keeping existing $ENV_FILE"
  else
    (umask 027 && cat > "$ENV_FILE" <<EOF
# Temple Directory production settings. Restart after editing:
#   sudo systemctl restart temple-directory
TEMPLE_NAME="$TEMPLE_NAME"
TEMPLE_TAGLINE="Devotee & Donor Directory"
PORT=3000
# Only reachable from this machine; Caddy or Cloudflare Tunnel faces the internet.
HOST=127.0.0.1
DB_PATH=$DB_FILE
ADMIN_USERNAME=admin
VIEWER_USERNAME=viewer
SESSION_HOURS=12
SECURE_COOKIES=true
TRUST_PROXY=1
VIEWER_CAN_EXPORT=false
# Devotee registration form: false = each form waits for an admin to approve it
PUBLIC_FORM_AUTO_APPROVE=false
PUBLIC_FORM_RATE_LIMIT=20
API_RATE_LIMIT=600
EXPORT_RATE_LIMIT=20
EOF
    )
    ok "Created $ENV_FILE"
  fi
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"

  if [[ ! -f $BACKUP_ENV ]]; then
    (umask 027 && cat > "$BACKUP_ENV" <<EOF
# Nightly backup settings (see deploy/README.md → "Google Drive backups")
DB_PATH=$DB_FILE
BACKUP_DIR=$BACKUP_DIR
KEEP_LOCAL_DAYS=14
# Set after configuring rclone, e.g. RCLONE_REMOTE=gdrive-crypt:
RCLONE_REMOTE=
KEEP_REMOTE_DAYS=60
EOF
    )
  fi
  chown root:"$APP_USER" "$BACKUP_ENV"
  chmod 0640 "$BACKUP_ENV"

  if [[ -f $DB_FILE ]]; then
    ok "Existing database found — accounts and passwords are unchanged"
  elif [[ ! -f $FIRST_RUN_ENV ]]; then
    GENERATED_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
    GENERATED_VIEWER_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
    (umask 077 && printf 'ADMIN_PASSWORD=%s\nVIEWER_PASSWORD=%s\n' "$GENERATED_ADMIN_PASSWORD" "$GENERATED_VIEWER_PASSWORD" > "$FIRST_RUN_ENV")
    ok "Generated first-run passwords (shown at the end)"
  fi
}

port_rule() {
  local action=$1 port=$2
  iptables "$action" INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT -m comment --comment temple-directory
}

open_web_ports() {
  local port reject_line
  for port in 80 443; do
    if ! port_rule -C "$port" 2>/dev/null; then
      # Oracle's Ubuntu image ends INPUT with a REJECT rule; insert above it.
      reject_line=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
      if [[ -n $reject_line ]]; then
        iptables -I INPUT "$reject_line" -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT -m comment --comment temple-directory
      else
        port_rule -A "$port"
      fi
    fi
  done
  netfilter-persistent save >/dev/null 2>&1
  ok "Server firewall allows ports 80 and 443"
}

close_web_ports() {
  local port
  for port in 80 443; do
    while port_rule -C "$port" 2>/dev/null; do port_rule -D "$port"; done
  done
  netfilter-persistent save >/dev/null 2>&1
  ok "Ports 80 and 443 closed — only SSH is reachable directly"
}

read_secret() {
  local prompt=$1 value
  read -rsp "  $prompt: " value </dev/tty
  echo >&2
  printf '%s' "$value"
}

setup_duckdns() {
  log "Configuring DuckDNS for $DOMAIN"
  local subdomain=${DOMAIN%.duckdns.org}
  local token=${DUCKDNS_TOKEN:-}

  if [[ -z $token && -f $DUCKDNS_ENV ]] && grep -q "^DUCKDNS_SUBDOMAIN=$subdomain$" "$DUCKDNS_ENV"; then
    ok "Keeping existing DuckDNS token"
  else
    [[ -n $token ]] || token=$(read_secret "Paste your DuckDNS token (input hidden)")
    [[ $token =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || die "That does not look like a DuckDNS token (copy it from duckdns.org)"
    (umask 077 && printf 'DUCKDNS_SUBDOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$subdomain" "$token" > "$DUCKDNS_ENV")
  fi

  systemctl start temple-duckdns.service || die "DuckDNS update failed — check the token and subdomain on duckdns.org"
  systemctl enable --now temple-duckdns.timer >/dev/null 2>&1
  ok "$DOMAIN now points at this server (refreshed every 15 minutes)"
}

install_caddy() {
  if command -v caddy >/dev/null; then return; fi
  log "Installing Caddy (automatic HTTPS)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
}

setup_caddy() {
  install_caddy
  log "Configuring Caddy for https://$DOMAIN"
  cat > /etc/caddy/Caddyfile <<EOF
# Managed by temple-directory setup.sh — changes are overwritten on re-run.
{
	email $ACME_EMAIL
}

$DOMAIN {
	encode zstd gzip
	header -Server
	reverse_proxy 127.0.0.1:3000
	# Access log goes to the journal: sudo journalctl -u caddy
	log
}
EOF
  # Validate as the caddy user so nothing it creates ends up owned by root.
  runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    || die "Caddy configuration is invalid: sudo caddy validate --config /etc/caddy/Caddyfile"
  systemctl enable caddy >/dev/null 2>&1
  systemctl restart caddy
  sleep 2
  if ! systemctl is-active --quiet caddy; then
    journalctl -u caddy -n 20 --no-pager || true
    die "Caddy did not start. The log above shows why."
  fi
  ok "Caddy is running for $DOMAIN (the certificate is issued automatically once the domain is reachable)"
}

install_cloudflared() {
  if command -v cloudflared >/dev/null; then return; fi
  log "Installing cloudflared"
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq
  apt-get install -y -qq cloudflared >/dev/null
}

setup_cloudflare() {
  install_cloudflared
  log "Configuring Cloudflare Tunnel"
  local token=${TUNNEL_TOKEN:-}
  install -d -m 0755 /etc/cloudflared
  if [[ -z $token && -f $TUNNEL_ENV ]]; then
    ok "Keeping existing tunnel token"
  else
    [[ -n $token ]] || token=$(read_secret "Paste the tunnel token or the whole 'cloudflared service install ...' command (input hidden)")
    token=${token##* }
    [[ $token =~ ^[A-Za-z0-9_=+/-]{80,}$ ]] || die "That does not look like a Cloudflare tunnel token"
    (umask 077 && printf 'TUNNEL_TOKEN=%s\n' "$token" > "$TUNNEL_ENV")
  fi
  systemctl enable temple-cloudflared.service >/dev/null 2>&1
  systemctl restart temple-cloudflared.service || true
  sleep 3
  if ! systemctl is-active --quiet temple-cloudflared.service; then
    systemctl disable --now temple-cloudflared.service >/dev/null 2>&1 || true
    journalctl -u temple-cloudflared -n 15 --no-pager || true
    die "Tunnel did not start (check the token). Nothing else was changed — the site still runs as before."
  fi
  ok "Tunnel connected to Cloudflare"

  # Nothing needs to reach this server directly any more.
  systemctl disable --now caddy >/dev/null 2>&1 || true
  systemctl disable --now temple-duckdns.timer >/dev/null 2>&1 || true
  close_web_ports
}

harden_ssh() {
  log "Hardening SSH"
  local login_user=${SUDO_USER:-ubuntu}
  local keys
  keys="$(getent passwd "$login_user" | cut -d: -f6)/.ssh/authorized_keys"
  if [[ ! -s $keys ]]; then
    warn "No SSH key found for '$login_user' — skipping SSH hardening so you are not locked out"
    return
  fi
  # Named 01- so it wins over cloud-init defaults (sshd uses the first value it reads).
  cat > /etc/ssh/sshd_config.d/01-temple-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
X11Forwarding no
MaxAuthTries 4
EOF
  sshd -t || { rm -f /etc/ssh/sshd_config.d/01-temple-hardening.conf; die "SSH config test failed; change reverted"; }
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  ok "SSH: keys only, no root login"
}

configure_auto_updates() {
  log "Enabling automatic security updates"
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  cat > /etc/apt/apt.conf.d/52temple-directory-upgrades <<'EOF'
// Also keep Node.js, Caddy and cloudflared patched.
Unattended-Upgrade::Origins-Pattern {
        "site=deb.nodesource.com";
        "site=dl.cloudsmith.io";
        "site=pkg.cloudflare.com";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
EOF
  ok "Daily updates; reboots at 03:30 when a kernel update needs it"
}

start_app() {
  log "Starting Temple Directory"
  systemctl enable temple-directory >/dev/null 2>&1
  systemctl restart temple-directory
  if ! wait_for_health; then
    journalctl -u temple-directory -n 40 --no-pager || true
    die "The app did not start. The log above shows why."
  fi
  ok "App is healthy on 127.0.0.1:3000"

  if [[ -f $FIRST_RUN_ENV ]] && [[ "$(db_query 'SELECT COUNT(*) FROM users;')" -ge 2 ]]; then
    rm -f "$FIRST_RUN_ENV"
    systemctl restart temple-directory
    wait_for_health || die "App failed to restart after removing first-run passwords"
    ok "First-run passwords removed from the server configuration"
  fi

  systemctl enable --now temple-backup.timer >/dev/null 2>&1
  ok "Nightly backup scheduled (02:30)"
}

check_public_access() {
  [[ -n $DOMAIN ]] || return 0
  log "Checking https://$DOMAIN from the internet"
  for _ in {1..12}; do
    if curl -fsS --max-time 10 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
      ok "https://$DOMAIN is live with a valid certificate"
      return 0
    fi
    sleep 5
  done
  if [[ $MODE == duckdns ]]; then
    warn "https://$DOMAIN is not reachable yet. Most often the Oracle VCN Security List is missing"
    warn "ingress rules for TCP 80 and 443 (see deploy/README.md, step 3). Then run: sudo systemctl restart caddy"
  else
    warn "https://$DOMAIN is not reachable yet. Check the tunnel's Public Hostname points to http://localhost:3000"
  fi
}

print_summary() {
  log "Done"
  [[ -n $DOMAIN ]] && echo "  Open:            https://$DOMAIN"
  echo "  App status:      sudo systemctl status temple-directory"
  echo "  App logs:        sudo journalctl -u temple-directory -f"
  echo "  Backup now:      sudo systemctl start temple-backup@manual"
  echo "  Backups folder:  $BACKUP_DIR"
  if [[ -n $GENERATED_ADMIN_PASSWORD ]]; then
    printf '\n  \033[1;33mFirst sign-in passwords — shown only once. Write them down, then change them under Settings.\033[0m\n'
    echo "    admin  : $GENERATED_ADMIN_PASSWORD"
    echo "    viewer : $GENERATED_VIEWER_PASSWORD"
  fi
  echo
}

main() {
  require_root
  parse_args "$@"
  check_system
  install_base_packages
  ensure_swap
  install_node
  create_app_user_and_dirs
  write_app_config
  if [[ "$(readlink -f "$RELEASE_DIR")" == "$(current_release)" ]]; then
    ok "Using the installed release at $APP_ROOT/current"
  else
    install_release
  fi
  install_systemd_units
  start_app

  case "$MODE" in
    duckdns)
      systemctl disable --now temple-cloudflared.service >/dev/null 2>&1 || true
      setup_duckdns
      open_web_ports
      setup_caddy
      ;;
    cloudflare)
      setup_cloudflare
      ;;
  esac

  harden_ssh
  configure_auto_updates
  check_public_access
  print_summary
}

main "$@"
