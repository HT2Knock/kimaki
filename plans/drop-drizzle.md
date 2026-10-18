# Drop Drizzle for Bun.SQL

Purpose: replace `drizzle-orm` with the SQL client that Bun ships, so the fork
has no query builder and no beta dependency.

Decision (user, 2026-10-18): the downstream delta is accepted. Bun ships the
driver, so the extra dependency is not needed.

## Status: done on branch `drop-drizzle` (2026-10-18)

Applied as planned, with these choices:

- `src/rows.ts` is new: one row type per table, the `TableName` constants, and the
  datetime boundary (`parseRows` / `parseFirst` / `toDate` / `toDbDate`). Read
  paths pass query results through it, so row fields stay `Date` like Drizzle's
  driver made them; write paths use `toDbDate`.
- `src/db.ts` opens `Bun.SQL` (`sqlite://<path>`) and keeps the `openDb` contract,
  the WAL and `busy_timeout` pragmas, the required-table check and
  `DbNotMigratedError`.
- `src/migrations.ts` **stays on `bun:sqlite`**: it is already raw SQL, and the V1
  import is the riskiest path. `ATTACH ... mode=ro` is unchanged.
- Every UPDATE and upsert `DO UPDATE` sets `updated_at = $now` by hand, because
  Drizzle's `$onUpdate` did that implicitly.
- The 10 nested `with:` relation queries became `LEFT JOIN`s or two queries.
  Dynamic `where`/`orderBy` and dynamic `set` objects use `db.unsafe` with bound
  `?` values; column names and table names come from code, never from data.
- `src/schema.ts` and `scripts/generate-schema-sql.ts` are deleted. `SCHEMA_SQL`
  in `src/schema-sql.ts` is hand-maintained and mirrors `src/rows.ts`.
- Type convention: Bun's tag takes the row **array** type, so reads are
  `db<Row[]>`, writes with no `RETURNING` are `db<unknown[]>`.

Verified:

- `bun install` exits 0; `bun.lock` has no `drizzle` entry; `kimaki/package.json`
  has neither package.
- `cd kimaki && bun run build` is clean.
- `bun run test -u` and `bun run test` are 182 of 182 across 51 files, and no
  snapshot changed (the second run had no `-u`).
- Read-only check against a `.backup` copy of the live knockon database:
  `kimaki project list` and `kimaki routine list` print the real rows, so the new
  client opens the existing `~/.kimaki/kimaki.db` and the LEFT JOIN + date
  parsing paths work on real data.

Not done here: the running bot still uses the previous build. Deploy after the
user checks the branch (see `plans/fork-handoff.md`). Two items from the "Done
when" list are also still open: a bot turn on knockon, and one attempt at the
next upstream sync to measure the merge cost.

Cost: the next upstream sync will conflict on the query code in the files
upstream edits most. That is the accepted delta.

### How to repeat the live check

```bash
ssh knockon 'sqlite3 ~/.kimaki/kimaki.db ".backup /tmp/kimaki-live-copy.db"'
mkdir -p /tmp/kimaki-livedb && scp knockon:/tmp/kimaki-live-copy.db /tmp/kimaki-livedb/kimaki.db
cd kimaki && KIMAKI_DATA_DIR=/tmp/kimaki-livedb bun src/cli.ts project list
KIMAKI_DATA_DIR=/tmp/kimaki-livedb bun src/cli.ts routine list
```

`.backup` is the SQLite backup API: it does not write to the live file, so the
running bot is untouched. `--data-dir` works too.

### Known property kept from Drizzle

`toDbDate` writes ISO (`…T…Z`), while `CURRENT_TIMESTAMP` defaults and the V1
import write `YYYY-MM-DD HH:MM:SS`. SQLite compares both as text, so a
same-day comparison between a mixed pair sorts by the space-versus-`T`. Drizzle
did the same thing (its `toDriver` always wrote ISO), so this is not a
regression here. It is not covered by a test.


## Verified on this machine (2026-10-18)

`Bun.SQL` SQLite works on Bun 1.4.2 (Mac) and 1.4.3 (knockon). Confirmed with
small scripts:

- `new SQL("sqlite:///abs/path.db")` and `new SQL(":memory:")` open a database.
- Tagged templates run parameterized queries:
  `await db\`SELECT * FROM t WHERE v = ${"a"}\`` returns `[{...}]`.
- `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` work.
- `ATTACH DATABASE ${"file:/path?mode=ro"} AS v1` works with a bound parameter.
  The V1 import in `migrations.ts` needs this.
- Array expansion: `IN ${db(["a", "c"])}` works. A plain JS array in
  `IN (${["a", "c"]})` fails with "Binding expected string, ...".
- `await db.unsafe("SELECT ... IN (?, ?)", ["a", "c"])` works, positional and
  named.
- `await db.begin(async (tx) => { ... })` and `db.transaction(fn)` work.
- Results type as `any` by default; pass a type argument:
  `await db<Row>\`SELECT ...\``.
- The API has no `.run()`, `.get()`, or `.all()`. Those belong to `bun:sqlite`
  (`Database`). With `Bun.SQL`, await the query and take `rows[0]` for one row.
  `Query<T>` also has `.values()`, `.raw()`, `.execute()`, `.simple()`.
- `await db.close()` closes the connection.

## Scope

Measured in `kimaki/src`:

| item | count |
| --- | --- |
| query call sites, non-test | 51 across 19 files |
| query call sites, including tests | 89 |
| tables | 14 |
| nested relation queries (`with:`) | 10 |
| `inferSelect`/`inferInsert` uses | 5 |
| transactions | 1 |

`SCHEMA_SQL` in `src/schema-sql.ts` is the generated DDL string. `bun run
generate` runs `drizzle-kit export` on `src/schema.ts`. Migrations
(`migrations.ts`) are already raw SQL; they stay raw.

## Approach

Do this on a branch off `bun-runtime` (suggest `drop-drizzle`). Keep the running
bot on the current build until the suite is green; deploy after.

1. Add `src/rows.ts` with a row type per table and the table name constants.
   Derive them from `src/schema.ts` before deleting it.
2. Rewrite `src/db.ts` to open `Bun.SQL` and keep the `openDb` contract
   (`migrate`, the required-table check, `DbNotMigratedError`). Keep the WAL and
   `busy_timeout` pragmas.
3. Move `migrations.ts` to `Bun.SQL` (the `ATTACH` path works) or keep
   `bun:sqlite` there. One client is cleaner; verify the V1 import test
   (`legacy.e2e.test.ts`) either way.
4. Convert call sites file by file, smallest first (`sleeps.ts`,
   `session-events.ts`, `lock-routes.ts`, then the larger `sessions.ts`,
   `scheduler.ts`, `prompt.ts`). Run that file's tests after each.
5. Rewrite the 10 nested relation queries as an explicit JOIN or two queries.
   Use `db(array)` for `IN` lists and `db.unsafe` for dynamic `where`/`orderBy`.
6. Replace the one transaction with `db.begin`.
7. Keep `SCHEMA_SQL` as the hand-maintained DDL (14 `CREATE TABLE`, 4 indexes).
   Delete `scripts/generate-schema-sql.ts`, `drizzle-orm`, and `drizzle-kit`,
   or keep the script until the new DDL is settled.
8. `bun install`, `cd kimaki && bun run build`, `bun run test -u`, inspect the
   snapshot diff.

## Gotchas

- Dynamic `where` and `orderBy` are what Drizzle bought. Compose fragments by
  hand, and keep every user value as a bound parameter. Never interpolate text.
- `as any` is banned in this repo. Type each result with `db<Row>` or fix the
  row type. The 5 `inferSelect` uses become explicit row types.
- `bun run test -u` rewrites snapshots. Inspect the diff; do not accept it blind.
- `Bun.SQL` may pick a different default `journal_mode`; set WAL and
  `busy_timeout` on open, as the current code does.
- Keep the V1 import read-only (`mode=ro` in the `ATTACH`).

## Done when

- `bun install` exits 0 and neither `drizzle-orm` nor `drizzle-kit` is in the
  tree.
- `cd kimaki && bun run build` is clean.
- `bun run test -u` is green, and the snapshot diff is reviewed.
- `kimaki project list` and a bot turn work on knockon against the existing
  `~/.kimaki/kimaki.db`.
- The next upstream sync is attempted once to see the real merge cost.

## Risks

- This is the largest permanent downstream delta in the fork so far, in the
  files upstream edits most. The next upstream merge will conflict on query
  code. That is the accepted cost.
- Removing `drizzle-orm@1.0.0-beta.22` removes a beta dependency. That is the
  main upside next to the smaller tree.
- Performance should stay equal or improve. `bun:sqlite` already gave the speed;
  Drizzle added about 29us per simple query. `Bun.SQL` should be near raw.
