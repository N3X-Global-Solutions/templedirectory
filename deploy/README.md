# Deploying Temple Directory on Oracle Cloud (free)

This guide puts the app online at a free, secure `https://yourname.duckdns.org` address. The server costs ₹0 on Oracle Cloud's Always Free tier. Follow the steps in order on your Windows PC. It takes about an hour the first time.

```
 Devotees' phones / office PCs
            │  HTTPS (padlock)
            ▼
 yourname.duckdns.org ──► Oracle Cloud VM (Ubuntu, free)
                            ├─ Caddy       HTTPS certificate, ports 80/443
                            ├─ Temple app  127.0.0.1:3000 only, sandboxed
                            └─ Nightly backups (Google Drive later)
```

Later you can [move to your own domain with Cloudflare Tunnel](#upgrade-to-your-own-domain-with-cloudflare-tunnel), which closes ports 80/443 entirely.

---

## What the setup script does for you

- Installs Node.js 24, Caddy and security updates, and sets the timezone to Asia/Kolkata.
- Runs the app as a locked-down `temple` service account. The app only listens on the server itself, and Caddy faces the internet.
- Generates strong first sign-in passwords, shows them once, and removes them from the server.
- Opens only ports 80/443 in the server firewall. SSH becomes key-only, with no root login.
- Turns on automatic daily security updates, including Node.js and Caddy.
- Takes a nightly database backup with an integrity check and keeps 14 days on the server.
- Lets you update later with one command, with automatic rollback if the new version fails.

---

## Step 1 — Create an SSH key on your PC

Open **PowerShell** and run:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\oracle-temple -C "temple-server"
```

Press Enter twice to skip the passphrase, or set one for extra safety. This creates two files:

- `oracle-temple` is your **private key**. Never share it, and keep a copy somewhere safe: without it you cannot log in to the server.
- `oracle-temple.pub` is the **public key**. You will upload it to Oracle.

## Step 2 — Create the Oracle Cloud account

1. Sign up at <https://signup.oraclecloud.com>. A card is needed for identity verification; the Always Free tier is not charged.
2. **Home region:** choose **India South (Hyderabad)** or **India West (Mumbai)**. This cannot be changed later.
3. After the account is active, go to **Billing & Cost Management → Upgrade and Manage Payment** and upgrade to **Pay As You Go**.
   - Always Free resources stay free after the upgrade.
   - It stops Oracle from reclaiming an "idle" free VM, and this app is idle most of the time.
4. As a safety net, go to **Billing & Cost Management → Budgets** and create a budget of **₹100** with an email alert. You will hear about any charge immediately.

## Step 3 — Create the server

1. Go to **Compute → Instances → Create instance**.
2. **Name:** `temple-directory`.
3. **Image:** click *Change image*, then choose **Canonical Ubuntu 24.04**.
4. **Shape:** click *Change shape*, then choose **Ampere → VM.Standard.A1.Flex** with **1 OCPU and 6 GB memory**. It is marked "Always Free-eligible".
   - If you see *"Out of capacity"*, try another availability domain, or pick **VM.Standard.E2.1.Micro** (AMD). The app runs fine on it, and setup adds swap automatically.
5. **Networking:** keep *Create new virtual cloud network* and *Assign a public IPv4 address*.
6. **SSH keys:** choose *Upload public key files* and select `oracle-temple.pub`.
7. Click **Create**. When it shows *Running*, copy the **Public IP address**.

**Open ports 80 and 443 in Oracle's network firewall.** Setup cannot do this from inside the server.

1. On the instance page, click the **Subnet** link, then **Security Lists → Default Security List → Add Ingress Rules**.
2. Add a rule with **Source CIDR** `0.0.0.0/0`, **IP Protocol** TCP and **Destination Port Range** `80`.
3. Add a second rule, the same but with port `443`.

## Step 4 — Get a free DuckDNS subdomain

1. Go to <https://www.duckdns.org> and sign in with Google or GitHub.
2. Type a name, for example `angalamman`, and click **add domain**. Your address is now `angalamman.duckdns.org`.
3. Paste the server's public IP into the *current ip* box and click **update ip**.
4. Copy your **token** (the long code at the top). Setup asks for it; keep it private.

## Step 5 — Package and upload the app

In PowerShell, from the project folder:

```powershell
cd "D:\temple directory"
powershell -ExecutionPolicy Bypass -File deploy\package.ps1
```

This runs the tests and creates `dist\temple-directory-<date>.tar.gz`. Your data, `.env` and `node_modules` are never included. Upload the file, replacing `SERVER_IP` and the file name:

```powershell
scp -i $HOME\.ssh\oracle-temple "dist\temple-directory-20260914-0200.tar.gz" ubuntu@SERVER_IP:~
```

If asked *"Are you sure you want to continue connecting?"*, type `yes`.

## Step 6 — Run setup on the server

```powershell
ssh -i $HOME\.ssh\oracle-temple ubuntu@SERVER_IP
```

Now on the server:

```bash
tar xzf temple-directory-*.tar.gz
sudo bash temple-directory/deploy/server/setup.sh \
  --mode duckdns \
  --domain angalamman.duckdns.org \
  --email your-email@example.com \
  --temple-name "Sri Angalamman kovil"
```

- When prompted, paste the DuckDNS token. Nothing appears while you paste; that is normal.
- The email is used by Let's Encrypt for certificate notices only.
- Setup takes 3–6 minutes. At the end it prints the **admin and viewer passwords once**. Write them down now.

## Step 7 — First sign-in

1. Open `https://angalamman.duckdns.org` and check that the browser shows a padlock.
2. Sign in as **admin** with the printed password.
3. Go to **Settings** and change the admin password, then set a new viewer password.
4. Add a test devotee, view it, then delete it.

You're live. 🎉

---

## Everyday commands (on the server)

| Task | Command |
|------|---------|
| Is the app running? | `sudo systemctl status temple-directory` |
| Live app log | `sudo journalctl -u temple-directory -f` |
| Web server (Caddy) log | `sudo journalctl -u caddy -n 50` |
| Take a backup now | `sudo systemctl start temple-backup@manual` |
| List backups | `sudo bash /opt/temple-directory/current/deploy/server/restore.sh` |
| Restart the app | `sudo systemctl restart temple-directory` |
| Change settings (temple name, viewer export…) | `sudo nano /etc/temple-directory/temple.env`, then restart the app |

## Updating to a new version

On your PC, build and upload the new package as in Step 5. Then on the server:

```bash
rm -rf temple-directory
tar xzf temple-directory-<new-date>.tar.gz
sudo bash temple-directory/deploy/server/update.sh
```

The update does four things:

1. Backs up the database.
2. Installs the new version next to the old one.
3. Restarts the app and checks that it is healthy.
4. **Rolls back automatically** if it isn't.

The last 3 versions are kept in `/opt/temple-directory/releases`.

## Restoring a backup

```bash
sudo bash /opt/temple-directory/current/deploy/server/restore.sh                     # list backups
sudo bash /opt/temple-directory/current/deploy/server/restore.sh /var/lib/temple-directory/backups/temple-directory-20260914-023000-nightly.db.gz
```

- It checks the backup is valid and shows how many devotees it contains.
- It asks you to type `RESTORE`.
- It saves the current database first, so a restore can itself be undone.

---

## Google Drive backups

Set this up whenever you are ready. Until then, backups stay on the server for 14 days, which does **not** protect against losing the server itself.

Backups are **encrypted before upload**, so Google cannot read devotee data. rclone gets `drive.file` access, which means it can only see the files it creates.

**1. Install rclone on the server:**

```bash
curl -fsSL https://rclone.org/install.sh | sudo bash
sudo -u temple mkdir -p /var/lib/temple-directory/.config/rclone
```

**2. Authorise Google Drive on your Windows PC.** The server has no browser.

1. Download rclone for Windows from <https://rclone.org/downloads/> and unzip it.
2. In that folder, run `.\rclone.exe authorize "drive"`.
3. Sign in with the temple's Google account in the browser that opens.
4. Copy the token that PowerShell prints (the whole `{...}` line).

**3. Create the remotes on the server:**

```bash
sudo -u temple RCLONE_CONFIG=/var/lib/temple-directory/.config/rclone/rclone.conf rclone config
```

First remote (Google Drive):

| Prompt | Answer |
|--------|--------|
| New remote | `n` |
| name | `gdrive` |
| Storage | `drive` |
| client_id / client_secret | *(leave blank)* |
| scope | `drive.file` (the option that says "only files created by rclone") |
| service_account_file | *(blank)* |
| Edit advanced config | `n` |
| Use web browser to authenticate | `n`, then paste the token from step 2 |
| Configure as Shared Drive | `n` |
| Keep this remote | `y` |

Second remote (encryption):

| Prompt | Answer |
|--------|--------|
| New remote | `n` |
| name | `gdrive-crypt` |
| Storage | `crypt` |
| remote | `gdrive:temple-directory-backups` |
| filename_encryption | `standard` |
| directory_name_encryption | `true` |
| Password | `g` (generate), length `128`, then `y` to use it |
| Salt password | `g`, `128`, `y` |
| Keep this remote | `y`, then `q` to quit |

> ⚠️ **Write both generated passwords down and store them offline** (for example in the trustees' locker). Without them the Drive backups **cannot be decrypted**, even by you.

**4. Turn on uploads and test:**

```bash
sudo sed -i 's/^RCLONE_REMOTE=.*/RCLONE_REMOTE=gdrive-crypt:/' /etc/temple-directory/backup.env
sudo systemctl start temple-backup@manual
sudo journalctl -u temple-backup@manual -n 5 --no-pager      # should say "Copied off-site"
```

You should see a `temple-directory-backups` folder in Google Drive with scrambled file names. Drive keeps 60 days of backups (`KEEP_REMOTE_DAYS` in `backup.env`).

**Restoring from Drive:**

```bash
sudo -u temple RCLONE_CONFIG=/var/lib/temple-directory/.config/rclone/rclone.conf rclone ls gdrive-crypt:
sudo -u temple RCLONE_CONFIG=/var/lib/temple-directory/.config/rclone/rclone.conf rclone copy gdrive-crypt:temple-directory-XXXX.db.gz /var/lib/temple-directory/backups/
sudo bash /opt/temple-directory/current/deploy/server/restore.sh /var/lib/temple-directory/backups/temple-directory-XXXX.db.gz
```

---

## Upgrade to your own domain with Cloudflare Tunnel

When the temple buys a domain (a `.org` is about ₹900 a year), switch to Cloudflare. Visitors get a nicer address, **no ports are open on the server**, and Cloudflare Access can require an emailed one-time code before anyone even sees the login page.

> Cloudflare renames menus from time to time, so labels below may differ slightly.

1. **Add the domain to Cloudflare** (Free plan) and change the nameservers at your registrar to the two Cloudflare gives you. Cloudflare Registrar sells `.org` and `.com` at cost, but not `.in`; buy a `.in` elsewhere and point its nameservers to Cloudflare.
2. **Create the tunnel:**
   1. Go to **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it `temple-directory`, and copy the install command it shows (it contains the token).
   2. Under **Public Hostname**, set subdomain `directory`, your domain, service type **HTTP** and URL `localhost:3000`.
3. **On the server**, run setup again in Cloudflare mode and paste the command or token when asked:
   ```bash
   sudo bash /opt/temple-directory/current/deploy/server/setup.sh --mode cloudflare --domain directory.yourtemple.org
   ```
   This connects the tunnel, stops Caddy and DuckDNS, and closes ports 80/443. If the token is wrong it stops and changes nothing, so the old address keeps working.
4. **Require an email code:** go to **Zero Trust → Access → Applications → Add → Self-hosted**, set the domain `directory.yourtemple.org`, and add a policy **Allow → Emails** listing the trustees' and staff email addresses. Login method: **One-time PIN**.
5. **In Oracle**, delete the port 80 and 443 ingress rules from Step 3. You can also delete the DuckDNS subdomain.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Setup ends with *"not reachable yet"* | Almost always the Oracle Security List is missing TCP 80/443 (Step 3). Add the rules, then `sudo systemctl restart caddy` and wait a minute. |
| Browser warns about the certificate | Caddy could not get a certificate yet. Check `sudo journalctl -u caddy -n 50`: the domain must point at the server IP and ports 80/443 must be open. |
| `ssh: Connection timed out` | Wrong IP, or the instance is stopped. Check it is *Running* in the Oracle console. |
| `Permission denied (publickey)` | Use `-i $HOME\.ssh\oracle-temple` and the user `ubuntu`. |
| App won't start | `sudo journalctl -u temple-directory -n 50` shows the reason. |
| Forgot the admin password | Restore is not needed. Run `sudo systemctl stop temple-directory`, delete the admin account with `sudo -u temple sqlite3 /var/lib/temple-directory/temple-directory.db "DELETE FROM users WHERE role='admin';"`, add `ADMIN_PASSWORD=NewStrongPass123` to `/etc/temple-directory/first-run.env` (mode 600), start the app, sign in, change the password under Settings, and delete that file. |
| Update failed | It rolled back automatically. Read the printed log, fix the problem, and package again. |

## Where things live on the server

| Path | What |
|------|------|
| `/opt/temple-directory/current` | Running app version (read-only to the app) |
| `/var/lib/temple-directory/temple-directory.db` | **The database** |
| `/var/lib/temple-directory/backups/` | Local backups (14 days) |
| `/etc/temple-directory/temple.env` | App settings |
| `/etc/temple-directory/backup.env` | Backup settings |
| `/etc/temple-directory/duckdns.env` | DuckDNS token (root only) |
| `/etc/cloudflared/temple-tunnel.env` | Tunnel token (root only, Cloudflare mode) |
| `/etc/caddy/Caddyfile` | HTTPS / reverse proxy (DuckDNS mode) |

## How this kit was tested

The kit ran end to end in an Ubuntu 24.04 container set up like Oracle's image: the same `ubuntu` user and the same default firewall that rejects everything except SSH. What was checked:

- **Fresh install:** 33 checks, including services, sandboxing, file permissions, passwords never appearing in logs or config, firewall ordering, SSH hardening and admin sign-in.
- **Everyday operations:** 29 checks covering re-running setup, backups, updating, automatic rollback from a broken release, restore and cancelled restore, and a failed switch to Cloudflare leaving the site untouched.
- **Reboot recovery:** 5 checks.
- **Scripts:** ShellCheck-clean.

Real DuckDNS, Let's Encrypt and Cloudflare connections can only be tested on the actual server.
