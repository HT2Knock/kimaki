# Bun runtime port plan

> Superseded in part by a follow-up (commit `08d60bdf`): the user asked for Bun
> only, so the "Node stays supported" scope below no longer holds. See
> `plans/bun-runtime-port-report.md`.

Branch: `bun-runtime` in `HT2Knock/kimaki`.
Base commit: `e8aceec5`.

## Goal

Run Kimaki's own process (bot + CLI) on Bun, and prove it with the existing test
suite. Node stays supported, because the published npm package is installed by
users who may not have Bun.

## Finish condition

From a clean clone, on Bun 1.4.x:

```
cd kimaki && bun run bun:check
```

exits 0. `bun:check` runs the `kimaki` suite with the bot and every CLI child
process on Bun, and asserts the running bot reports a Bun runtime. The suite is
the real artifact: it covers Discord, SQLite, the OpenCode client, markdown,
queueing, scheduling and voice.

## Not in scope

- Replacing the package manager. `pnpm` stays; the lockfile and workspace are
  independent of the runtime.
- The Rust `gateway-proxy` and the Cloudflare `website`.
- Rewriting the published-package install path for Bun-only users.
- Porting `vitest` itself. The suite runs under Bun; the runner stays vitest.

## Runtime coupling to remove

Every place that assumes "the current process is Node":

| Site | Current assumption | Port |
| --- | --- | --- |
| `kimaki/src/cli.ts` | `#!/usr/bin/env node` | kept: an npm install runs on Node for users without Bun. `bun dist/cli.js` works. Making Bun the default is an open product call, see the report |
| `kimaki/src/cli/bot.ts` | re-spawns `process.execPath` with `process.execArgv` | spawn the current runtime explicitly |
| `kimaki/src/test/harness.ts` | `process.execPath --import tsx src/cli.ts` | one helper that builds the run command per runtime |
| `kimaki/src/autostart.ts` | writes a `.command` that runs `process.execPath` | same helper |
| `kimaki/vitest.config.ts` | externalises `zod`, breaks under Bun | inline the deps whose interop differs |
| `kimaki/package.json` | `bin` points at `dist/cli.js` | keep, but make the shebang runtime-neutral |

The first four go behind one small module so the rule lives in one place.

## Design

Add `kimaki/src/runtime.ts`:

- `runtimeName(): 'bun' | 'node'`, from `process.versions`.
- `runEntryCommand(entry, args)`: the argv to run a TypeScript or JavaScript
  entrypoint on the current runtime. Bun runs TypeScript directly; Node needs
  `--import tsx`.
- `runtimeExecutable()`: `process.execPath`, but named so callers stop reading
  it as "node".

Callers in `cli/bot.ts`, `autostart.ts` and `test/harness.ts` use it. Tests get
a `KIMAKI_TEST_RUNTIME` switch so the same suite can be run either way.

## Order of work

1. Baseline: run the full suite on Node, record the result per file.
2. Recon: list every Node assumption, confirm the table above.
3. Add `runtime.ts` and move the four call sites onto it. Suite must stay green
   on Node.
4. Fix the Bun-only interop failures, one file at a time, with the Bun run as
   the check.
5. Add the Bun suite command and the runtime assertion.
6. Verify on the Mac as a second platform.
7. Push the branch, write the report.

## Stop conditions

- 40 iterations, or 8 hours of wall clock, whichever comes first.
- Stop early and report if a native dependency cannot load on Bun, or if a
  failure needs a product decision rather than an experiment.

## Risks

- Native modules (`@discordjs/opus`, the libSQL client) may not load on Bun.
  Bun implements Node-API, so they may work unchanged. This is the top unknown
  and it is tested early.
- The OpenCode server is a separate binary that Kimaki does not control. Its
  plugin code loads in the OpenCode process, so it keeps its own runtime.
