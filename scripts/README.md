# Operations scripts

Small utilities for common one-off admin tasks. All scripts read
credentials from the project's `.env` file — never hard-coded — so
you can swap Turso databases or rotate tokens without editing code.

---

## `make-admin.ps1` / `make-admin.bat` / `make-admin.sh`

Promote a user to admin (`users.is_admin = 1`) so they can access
`/admin.html`.

### How it works

1. Reads `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` from `../.env`
2. Looks up the user by `id` (preferred) or phone number
3. Confirms the user exists and isn't already an admin
4. Sends an `UPDATE users SET is_admin = 1 ...` to Turso's HTTP API
5. Verifies the change by re-reading the row

### Windows — PowerShell (recommended)

```powershell
# From the project root - by user id (most reliable):
.\scripts\make-admin.ps1 -UserId 1
```

Or by phone number:

```powershell
.\scripts\make-admin.ps1 -PhoneNumber "+2348012345678"
```

Or edit `$DEFAULT_PHONE` at the top of `make-admin.ps1` and run with no args:

```powershell
.\scripts\make-admin.ps1
```

> **Tip:** If a phone-number lookup fails even though the user exists,
> the stored value almost certainly has an invisible character
> (CR, NBSP, zero-width space) from however signup wrote it. The
> script will list nearby/recent users so you can read off the `id`,
> then re-run with `-UserId <n>` to bypass phone matching entirely.

### Windows — double-click

Open `scripts\` in Explorer and double-click **`make-admin.bat`**.
It uses whatever phone number is set in `$DEFAULT_PHONE` inside
`make-admin.ps1`. To pass a different number or user id, run from cmd:

```cmd
scripts\make-admin.bat +2348012345678
scripts\make-admin.bat --id 1
```

### macOS / Linux / WSL

```bash
chmod +x scripts/make-admin.sh

# By phone number:
./scripts/make-admin.sh +2348012345678

# Or by user id (most reliable):
./scripts/make-admin.sh --id 1
```

Requires `curl` and `jq` (preinstalled on macOS; `apt install jq` on
Debian/Ubuntu).

### Output

A successful run looks like this:

```
═══════════════════════════════════════════════════════
  ScrowPay — Grant Admin
═══════════════════════════════════════════════════════
Phone number : +2348012345678
Env file     : C:\Users\you\Scrowpay\.env

→ Reading .env...
Turso URL    : https://my-db.turso.io

→ Looking up user...

Found user:
  ID         : 1
  Name       : John Doe
  Phone      : +2348012345678
  is_admin   : 0 (before)

→ Setting is_admin = 1...
→ Verifying...

✅ Success! User is now an admin.
```

### When it fails

| Error | Meaning | Fix |
|---|---|---|
| `Cannot find .env file` | Wrong working dir | Run from project root, or use `-EnvFile <path>` |
| `TURSO_DATABASE_URL is missing or still placeholder` | `.env` not filled in | Open `.env` and put the real values from your Turso dashboard |
| `No user found with phone_number = ...` | Wrong number, wrong DB, hidden char in stored phone, or you haven't signed up yet | Re-run with `-UserId <n>` using the id printed in the "recent users" list; or sign up first / fix `.env` |
| `401 Unauthorized` from Turso | Token expired or wrong | Generate a fresh token in the Turso dashboard and update `.env` |

### Changing the Turso database

You don't need to touch the script. Just update `.env`:

```bash
TURSO_DATABASE_URL=libsql://new-db-name.turso.io
TURSO_AUTH_TOKEN=eyJ...new-token...
```

Re-run the script and it'll talk to the new database.

### Changing the default phone number

Open `make-admin.ps1` (or `.sh`) and edit the `DEFAULT_PHONE` constant
near the top. That's the only place phone numbers are hard-coded.

---

## Future scripts

The pattern is reusable. To add another operations script:

1. Read `.env` for `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (or any
   other secret you need)
2. Convert `libsql://...` to `https://...`
3. POST to `{HTTPS_URL}/v2/pipeline` with the typed-statement body:

   ```json
   {
     "requests": [
       {"type": "execute", "stmt": {"sql": "...", "args": [...]}},
       {"type": "close"}
     ]
   }
   ```

4. Authorization header: `Bearer <TURSO_AUTH_TOKEN>`

Ideas for future scripts (not built yet):

- `reset-user-pin.ps1` — wipes a user's PIN so they can reset
- `list-disputes.ps1` — quick CLI view of pending disputes without
  opening the admin UI
- `seed-test-data.ps1` — creates a couple of fake transactions for
  demo recording

---

## `test-dispute-helper.js`

Backdates a transaction's `shipped_at` timestamp to enable immediate
dispute testing without waiting for the delivery timeline.

### Why this exists

The dispute functionality requires transactions to be in `In_Transit`
state. While there's no hard UI restriction on when you can click the
dispute button, for realistic testing you may want the transaction to
appear as if it was shipped days ago. This script modifies the
`shipped_at` timestamp so you can test disputes immediately.

### Usage

1. Open `scripts/test-dispute-helper.js` in your editor
2. Update the configuration at the top:
   ```javascript
   const TRANSACTION_ID = 'TXN-your-transaction-id-here';
   const DAYS_AGO = 2; // How many days to backdate
   const TURSO_DATABASE_URL = 'your-turso-url-here';
   const TURSO_AUTH_TOKEN = 'your-turso-token-here';
   ```

3. Run the script:
   ```bash
   node scripts/test-dispute-helper.js
   ```

### What it does

- Updates the `shipped_at` timestamp to X days in the past
- Allows you to test dispute functionality immediately
- Useful for development, testing, and demos

### Alternative: Browser Console Method

If you don't want to use Node.js, you can run this directly in your
browser console while on the dashboard page. See `TESTING_DISPUTES.md`
in the project root for the full command.

### Requirements

- Node.js 14+ (for fetch API support)
- Turso database credentials (URL and auth token)
