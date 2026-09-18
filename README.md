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
| **Registration link**: share a form with devotees and review what they send | ✅ | — |

### Fields recorded

Name, father's name, gender, phone (**unique**), alternate phone, email, date of birth, occupation, hundiyal wanted (Yes/No), address, city, state, pincode, native place, raasi, natchathram, caste, gothram, member type (Devotee / Donor / Trustee / Volunteer), notes. Each record can also hold:

- **Family members**, added one row at a time: name, relation, phone (optional), raasi and natchathram
- **Donations**, added one row at a time: date, amount, purpose, payment mode and receipt number

### Tamil birthday

The Tamil birthday is worked out automatically from the English date of birth. For example, 17/02/2002 is **Maasi 5, Vishu year**.

- **Where it appears:** under the date-of-birth field while typing, on the record page, and in the full CSV export. The Pooja Lookup card shows only the Tamil birth month, so the full date of birth stays private.
- **How it's calculated:** from the Sun's actual position, using the Lahiri reckoning that Tamil panchangams use. It follows the Tamil rule: if the Sun enters the new rasi before sunset, that day is day 1 of the month; otherwise day 1 is the next day.
- **Accuracy:**
  - It was checked against Tamil New Year and Thai Pongal dates for 2023–2026.
  - The month is always reliable.
  - The day number can differ by one from a printed panchangam only when the month changes within minutes of sunset.

The directory can also be searched by occupation or by a family member's phone number, and filtered by occupation or hundiyal. The hundiyal filter works on the Mailing page too, so you can list everyone who wants a hundiyal.

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
| `PUBLIC_FORM_AUTO_APPROVE` | false | `true` adds devotees straight from the public form, with no review |
| `PUBLIC_FORM_RATE_LIMIT` | 20 | Public form submissions per hour from one internet connection |
| `PUBLIC_FORM_MAX_PENDING` | 500 | Most forms that may wait for review at once |
| `API_RATE_LIMIT` | 600 | API requests per minute from one client IP |
| `EXPORT_RATE_LIMIT` | 20 | CSV exports and backups per minute from one client IP |

## Devotee registration link

Devotees can fill in their own details instead of the office typing them.

1. Go to **Settings → Devotee registration form** and press **Share on WhatsApp**, or **Copy** the link and paste it anywhere (WhatsApp group, SMS, notice board).
2. A devotee opens the link on their phone and fills in the form. They see only the form — no directory, no donations, no notes, and no sign-in.
3. Their form arrives under **Registrations**, and the tab shows how many are waiting.
4. You check the details and press **Add to directory**, or **Do not add**. Approved forms create the devotee record; rejected ones are kept in the "Not added" list.

**Safety of the link**

- The link contains a long secret code. Anyone who has it can open the form, but nothing else.
- Submissions never enter the directory on their own — an admin approves each one. (Set `PUBLIC_FORM_AUTO_APPROVE=true` if you would rather they go straight in.)
- Every submission gets the same thank-you, so nobody can use the form to check whether a particular phone number belongs to a temple devotee. If the number is already in the directory, **you** see a warning on the review card and can update the existing record instead.
- **Turn the link off** closes the form to everyone; **Create a new link** replaces it, so an old link that reached the wrong people stops working.
- Submissions are limited per internet connection, only so many forms may wait for review at once, and a hidden trap field catches spam bots.
- Behind a reverse proxy or Cloudflare, set `TRUST_PROXY` (the deploy kit sets `TRUST_PROXY=1`), otherwise every devotee looks like the same visitor and they share one submission limit.

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
