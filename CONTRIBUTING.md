# Contributing to ScrowPay

Thanks for considering a contribution. Whether you're fixing a bug, adding a new service, or improving docs, the rules below keep the codebase consistent.

---

## Ground rules

1. **No build step.** Vanilla JS, no React, no bundlers, no transpilers. The browser runs the files exactly as committed. If you reach for npm, stop and ask first.
2. **One class per file.** Every service file exports a single class and attaches it to `window.<ServiceName>`.
3. **JSDoc every public method.** Type hints + a one-line description + an example for non-obvious cases.
4. **Top-of-file architecture comment.** Every service starts with a `/* */` block explaining what it owns, what it depends on, and any non-obvious decisions.
5. **Never commit secrets.** `.env`, `frontend/env.js`, `frontend/gemini-config.js`, and `frontend/cloudinary-config.js` are gitignored. If you change `.env.example`, never put a real value in it.

---

## Project structure

See the [root README § Project structure](README.md#-project-structure) for the file layout, and [frontend/README.md](frontend/README.md) for a service-by-service index.

---

## Adding a new frontend service

1. Create `frontend/MyNewService.js` with a top-of-file doc block:
   ```js
   /**
    * MyNewService — one-sentence description of what it owns.
    *
    * Responsibilities:
    *   - Bullet
    *   - Bullet
    *
    * Depends on:
    *   - TursoDBService (DB access)
    *   - <anything else>
    */
   class MyNewService {
     constructor(deps) { ... }
   }
   if (typeof window !== 'undefined') window.MyNewService = MyNewService;
   ```
2. Add a `<script src="MyNewService.js"></script>` line in **the right tier** of `dashboard.html`. See [frontend/README.md § Service load order](frontend/README.md#service-load-order) for the tiers.
3. If the service touches the DB, put any new tables in `TursoDBService.initializeSchema()` so the schema auto-creates. Migrations must be **idempotent** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` only when column doesn't already exist).
4. Update `frontend/README.md` to add a row for your service.

---

## Modifying the state machine

The transaction lifecycle is defined in `StateMachineService.js`. To add a new state or transition:

1. Add the state to the `CHECK(state IN (...))` constraint in `TursoDBService.initializeSchema()` — and write a one-shot migration to update the existing constraint if needed.
2. Add the new transition rule to the `TRANSITIONS` map.
3. Implement the side-effect handler (e.g. `_onDisputeResolved`).
4. Update the **notifications** for both participants via `NotifyFlow`.
5. Update [APP_GUIDE.md § 6](APP_GUIDE.md) (state diagram).

---

## Modifying the schema

All schema changes live in `frontend/turso-db-service.js` inside `initializeSchema()`. Rules:

- Use `CREATE TABLE IF NOT EXISTS`.
- For new columns, check column existence first using `PRAGMA table_info(<table>)` and add with `ALTER TABLE ... ADD COLUMN ...` only if missing.
- Never write destructive migrations (no `DROP COLUMN`, no `DROP TABLE`).
- Document the new column in [APP_GUIDE.md § 10](APP_GUIDE.md).

---

## Commit messages

Loose conventional-commit style is preferred but not enforced:

```
feat(face-verify): wire withdrawal trigger
fix(admin): correct state-name typo in STATE_COLORS
docs(readme): refresh project structure
```

If the change is non-trivial, prefer a short body explaining **why**, not what.

---

## Code style

- **Indentation**: 2 spaces.
- **Quotes**: single quotes for JS, double quotes inside HTML attributes.
- **Semicolons**: required.
- **Arrow functions** for callbacks; `function` declarations for top-level utilities (they hoist, which we sometimes rely on).
- **No emojis** in code unless they're part of UI copy. Console logs may use `✅` / `⚠️` / `❌` as severity prefixes — that's a pre-existing convention.
- **No `console.log` for happy-path noise.** Use `console.log` for boot messages and progress, `console.warn` for recoverable issues, `console.error` for failures.

---

## Documentation expectations

If you change behaviour visible to the user or to another developer, update:

- The relevant `.md` file (README / APP_GUIDE / frontend-README / DEPLOYMENT)
- The top-of-file architecture comment in the service you touched
- Any inline JSDoc that referenced the old behaviour

Empty / undocumented changes will be flagged in review.

---

## Tests

The Python AI engine has tests (`ai-engine/test_api.py`, `ai-engine/test_model.py`). Run them with:

```bash
cd ai-engine
pip install -r requirements.txt
pytest
```

The frontend doesn't have a test suite yet (a Vitest setup is on the roadmap). For now, every PR should include a **manual test script** in the description — list the steps a reviewer should take to verify the change works.

---

## Reviewing your own work before opening a PR

- [ ] Page loads without console errors
- [ ] No new ESLint-style issues (we don't run ESLint but follow the existing patterns)
- [ ] Schema migrations are idempotent — re-running the app twice shouldn't error
- [ ] Secrets are not in the diff (`git diff` + grep for `sk_`, `re_`, `eyJ`, etc.)
- [ ] If you touched `dashboard.html`, the service load order is preserved
- [ ] If you added a service, `frontend/README.md` is updated
- [ ] If you changed the schema, `APP_GUIDE.md § 10` is updated

---

## Questions?

Open an issue or drop a comment on a relevant PR. Thanks for keeping the codebase clean.
