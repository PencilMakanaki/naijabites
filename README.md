# NaijaBites (work in progress)

**Milestone M1: foundation (M1a backend + M1b React skeleton).** This is a development build, not the
finished product. It has the server, the MySQL setup, secure sign-in, and a React app that shows the
NaijaBites look (top bar, hero, markets) with a working sign-in pop-up and an administrator page.
The catalogue, cart, checkout, vendors and riders arrive in the next milestones (see the Build Roadmap).

## What works at this stage

- `GET  /api/v1/health` and `/api/v1/ready` (checks the database)
- `GET  /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- Sign-in protections: CSRF tokens, request limits, account lock after 5 wrong passwords,
  hashed session tokens, old-app passwords accepted and upgraded quietly
- Database: users, roles, sessions, settings and an append-only audit log, with rollback files
- A command that creates the first administrator

Registration, password reset, the storefront and everything else come in M2 onwards.

## What you need

- **Node.js 22 or newer** (https://nodejs.org)
- **Docker Desktop** for a ready-made MySQL 8.4, or your own MySQL 8 (see below)

## First-time setup (Windows PowerShell, from this folder)

1. `copy .env.example .env`
2. Make a secret and paste it after `CSRF_SECRET=` in `.env`:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
3. `docker compose up -d` then `docker compose ps` (wait until the database says healthy)
4. `npm install`
5. `npm test` (expect all tests to pass)
6. `npm run db:migrate` (expect four "Applying ..." lines, then "Done.")
7. `npm run admin:create` (asks for a name, email and password; the password stays hidden)
8. `npm run dev`
9. Open http://localhost:3000/api/v1/health in your browser. You should see `{"data":{"status":"ok"}}`.
   Then http://localhost:3000/api/v1/ready should say `ready`.

Useful commands: `npm run db:status` (what is applied), `npm run db:rollback` (undo the newest migration).

## Running the screens (M1b)

You need two terminal windows, both in this folder.

1. First run `npm install` once more (the project gained a `client` part), then `npm test`.
2. Window 1: `npm run dev` (the server, as before).
3. Window 2: `npm run dev:web` (the screens). It prints a link, normally http://localhost:5173.
4. Open http://localhost:5173. You should see the NaijaBites top bar, hero and markets.
5. Click **Staff sign-in** at the bottom (or open http://localhost:5173/signin?area=admin), sign in with the
   administrator account, and you land on the administrator page. **Sign out** returns you to the site.

Production-style run (one address for everything): `npm run build`, then `npm run dev` and open
http://localhost:3000. The server now serves the built screens as well.

## Automated checks

`npm test` runs every automated test: validation rules, money helpers, passwords, tokens, email templates,
form checks, the server calling code, and a suite that runs the real server routes against an in-memory
stand-in for the database (sign-up, sign-in, confirmation, resets, devices, request limits, CSRF).
`npm run smoke:login` and `npm run smoke:accounts` do the same against your real running server and MySQL.

## Accounts (M2a)

Sign-up, email confirmation, forgot and reset password, change password and email, profile and
"where you are signed in" now work. In development no email provider is set up, so the emails are
written to the **server window** (look for `EMAIL NOT SENT`), including the links to click.

To test everything in one go (the server must be running):

1. `npm install` (a new email package was added), then `npm run db:migrate` (one new table).
2. `npm run smoke:accounts`, expect every line to say PASS.
3. In the browser, open http://localhost:5173/signup and create an account.

## The storefront (M2b)

The home page now shows real meals from the database: the six markets, search, Load more, product
pop-ups with their own shareable addresses, vendor pages, the About page and the menu.

1. `npm install`, then `npm run db:migrate` (creates the catalogue tables and the six markets).
2. `npm run seed:dev` adds sample vendors and meals ported from the original demo menu (development
   only; it refuses to run in production). Safe to run again.
3. Start the server (`npm run dev`), then `npm run smoke:catalogue`. Expect every line to say PASS.
4. `npm run dev:web` and open http://localhost:5173. Meal photos are the original hotlinked pictures, so they
   need an internet connection. Real vendors upload their own pictures in M4.

Adding to the cart and ordering open in M3. Until then product pop-ups say so, and livestock shows
"Request a quote" instead of a cart.

## Using your own MySQL 8 instead of Docker

Run this as an administrator, change the passwords, and use the same values in `.env`
(set `DB_PORT=3306`):

```sql
CREATE DATABASE naijabites CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'naijabites_migrator'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON naijabites.* TO 'naijabites_migrator'@'localhost';
CREATE USER 'naijabites_app'@'localhost' IDENTIFIED BY 'choose-another-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON naijabites.* TO 'naijabites_app'@'localhost';
SET GLOBAL log_bin_trust_function_creators = 1;
```

The last line lets the migration create the audit-log protection triggers while binary logging is on.

## Troubleshooting

| Message | What to do |
|---|---|
| `Invalid settings. Check your .env file` | The list below it says which value is missing or wrong |
| `ECONNREFUSED` or the database is not reachable | Docker is not running, or `DB_PORT` does not match (Docker setup uses 3307) |
| `Access denied for user` | The passwords in `.env` must match the database users |
| `You do not have the SUPER privilege and binary logging is enabled` | Run `SET GLOBAL log_bin_trust_function_creators = 1;` as a MySQL administrator, then migrate again |
| `csrf_failed` on a POST | Open the site at exactly the address in `APP_ORIGIN`, and fetch `/api/v1/auth/csrf` first |
| Port 3000 already in use | Change `PORT` and `APP_ORIGIN` in `.env` |

## Folders

- `server/` the API (`src/` code, `migrations/` database changes, `test/` tests)
- `shared/` validation rules and money helpers used by both the server and (later) the browser
- `docker/` local database setup

## Safety notes

- Never share or commit `.env`. The passwords in `docker-compose.yml` are for your own computer only.
- Production uses different, strong passwords set on the host, never these.
- This build has not been security reviewed yet. That happens in M6, before any real customer.

## Delivery dispatch and tracking (M3.14)

- Prospective riders apply at `/rider-portal` after signing in as a customer.
- Administrators review rider applications at `/admin/riders`; only approved riders receive the rider role.
- Administrators assign paid active orders to approved riders at `/admin/deliveries`.
- Riders sign in at `/signin?area=rider` and manage assigned work at `/rider/deliveries`.
- Customers can follow delivery events at `/orders/:id/tracking` after payment confirmation.
- Apply database migrations with `npm run db:migrate` before using the new workflow.

See `M3.14_DELIVERY_DISPATCH_NOTES.md` for API routes, transition rules and verification status.
