# Temple Directory

A small web application for a Kula Deivam (family deity) temple to keep a register of devotees, their families and donors.

*Crafted with devotion — N3X GLOBAL SOLUTIONS*

## What it does

| Area | Admin | Viewer |
|------|:-----:|:------:|
| Directory: search by name, phone, city, pincode, gothram or family member name; filter; sort; page through results | ✅ | ✅ |
| View a devotee's full record: contact, address, raasi/natchathram, family, donations | ✅ | ✅ |
| Add, edit and delete devotees, family members and donations | ✅ | — |
| **Pooja lookup**: raasi, natchathram and gothram for a whole family by name or phone (addresses stay hidden) | ✅ | ✅ |
| **Mailing**: view addresses for chosen devotees or everyone shown | ✅ | ✅ |
| Mailing: print address labels and download a CSV | ✅ | optional (`VIEWER_CAN_EXPORT`) |
| Settings: change passwords, export the full directory, download a database backup | ✅ | — |

### Fields recorded

Name, father's name, gender, phone (**unique**), alternate phone, email, date of birth, address, city, state, pincode, native place, raasi, natchathram, caste, gothram, member type (Devotee / Donor / Trustee / Volunteer), notes. Each record can also hold:

- **Family members**, added one row at a time: name, relation, raasi and natchathram
- **Donations**, added one row at a time: date, amount, purpose, payment mode and receipt number

### Validation rules

- Phone numbers are stored in one standard format (`+91 98765-43210`, `09876543210` and `9876543210` are all the same number). If a number is already registered, saving is blocked and the form shows who the number belongs to.
- The natchathram list only offers stars that fall in the chosen raasi. The server enforces the same rule.
- Pincode must be 6 digits. Email, dates and amounts are also checked.

## Running it

Requires **Node.js 22.13 or newer**. It was tested on Node 24. There is no separate database server: all data lives in one SQLite file.

```bash
npm install
cp .env.example .env    # then set TEMPLE_NAME and the passwords
npm start
```

Open http://localhost:3000. Because the server listens on `0.0.0.0` by default, other computers or phones on the same temple Wi-Fi can open it at `http://<this-computer's-IP>:3000`.

**First run:** the `admin` and `viewer` accounts are created from `ADMIN_PASSWORD` and `VIEWER_PASSWORD`. If either is left empty, a random password is generated and **printed once in the console**. Write it down, then change it under **Settings**.

### Configuration (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEMPLE_NAME` | Sri Angalamman kovil | Shown on the login page and in the header |
| `TEMPLE_TAGLINE` | Devotee & Donor Directory | Subtitle |
| `PORT` / `HOST` | 3000 / 0.0.0.0 | Where the server listens |
| `DB_PATH` | ./data/temple-directory.db | Location of the database file |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | admin / *generated* | Used on first run only |
| `VIEWER_USERNAME` / `VIEWER_PASSWORD` | viewer / *generated* | Used on first run only |
| `SESSION_HOURS` | 12 | How long a sign-in lasts |
| `SECURE_COOKIES` | false | Set to `true` when served over HTTPS |
| `TRUST_PROXY` | false | Number of reverse proxies in front of the app (e.g. `1` behind nginx or Caddy) |
| `VIEWER_CAN_EXPORT` | false | Lets the viewer print labels and download mailing CSVs |
| `API_RATE_LIMIT` | 600 | API requests per minute from one client IP |
| `EXPORT_RATE_LIMIT` | 20 | CSV exports and backups per minute from one client IP |

## Hosting online

To host it for free on Oracle Cloud with HTTPS, nightly backups and one-command updates, follow **[deploy/README.md](deploy/README.md)**.

## Backups

Go to **Settings → Download database backup** to get a complete copy of the database. Do this weekly and keep the copy off the computer (a pen drive or a cloud folder).

To restore, stop the server, replace the file at `DB_PATH` with the backup, and start the server again.

**Settings → Export full directory (CSV)** produces a spreadsheet that opens in Excel with Tamil text intact.

## Security notes

- Passwords are hashed with scrypt. Sessions are stored in the database, so signing out or changing a password takes effect immediately.
- Cookies are HttpOnly and `SameSite=Strict`. Every change request must also carry a custom header, which blocks cross-site request forgery.
- Repeated failed sign-ins are rate-limited, and a failed sign-in takes the same time whether or not the username exists.
- All API traffic is rate-limited per client, with a stricter limit on exports and backups.
- When served over HTTPS (`SECURE_COOKIES=true`), an HSTS header tells browsers to always use HTTPS.
- A strict Content-Security-Policy is set. All user data is rendered as text, never as HTML.
- CSV exports neutralise spreadsheet formula injection.
- For internet-facing use, put the app behind HTTPS and set `SECURE_COOKIES=true` and `TRUST_PROXY=1`. Plain HTTP is only suitable on a trusted temple network: anyone on the same Wi-Fi who can capture traffic could steal a signed-in session.

## Development

```bash
npm run dev             # restart on file changes
npm test                # unit + API integration tests
npm run test:coverage   # with a coverage report
```

```
server.js                entry point
src/
  app.js                 Express app wiring
  config.js  db.js       environment settings and SQLite schema
  constants.js           raasi / natchathram / states reference data
  validation.js          input validation and phone normalisation
  criteria.js  csv.js    query parsing and CSV output
  auth/                  passwords, sessions, users, middleware
  repositories/          SQL for devotees, family members and donations
  routes/                auth, devotees, reports (mailing, pooja, export, backup)
public/
  index.html  css/  img/
  js/main.js             router and app shell
  js/views/              login, directory, detail, form, mailing, pooja, settings
tests/                   node:test suites
```
