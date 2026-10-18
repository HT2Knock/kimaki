# Kimaki fork: handoff (bun-only, self-hosted, trim)

## Context

This is `HT2Knock/kimaki`, a personal fork of `remorses/kimaki`. The user runs
Kimaki for its Discord agent orchestration. Upstream targets many installs
(hosted gateway, kimaki.dev onboarding, a Slack bridge, voice calls); the fork's
use case is smaller: **one user, self-hosted** (own Discord app), **macOS and
knockon**, **Bun only**.

Two goals, in order:

1. Trim the repo to the used subset (`plans/fork-feature-trim.md`).
2. Move the running bot to the fork on Bun (this document, next steps).

## State

Branch `bun-runtime`, based on upstream `e8aceec5`. **Not pushed.**

| commit | what |
| --- | --- |
| `48db9673` … `c13fd82d` | first Bun port: `runtime.ts`, digital-twin TLS |
| `08d60bdf` | Bun only: shebang, no tsx, scripts on bun |
| `9bbbf826` | SQLite on `bun:sqlite` |
| `80008116` | tests on `bun test` |
| `03e5331d` | install with `bun install` |
| `52266416`, `4af727ef` | decision log |

Verified on this machine: `kimaki` build clean; `bun run test` in `kimaki/` is
182 tests across 51 files in ~36s; `bun install --frozen-lockfile` exits 0.
The decision trail is `decisions.tsv`; the user-facing summary is
`.changeset/bun-runtime-support.md`. Repo rules are in `AGENTS.md`.

Caveats to carry forward:

- `bun.lock` was migrated from `pnpm-lock.yaml`, so it **pins the old resolved
  versions**. Deleting it re-resolves to latest; that already broke `goke` and
  `discord-api-types` once.
- `bun install` runs `@opencode/cli`'s postinstall, which calls `node`. Node is
  a build-time need only; the bot and CLI run on Bun.
- The `traforo` and `opencode-injection-guard` submodules still call `pnpm` in
  their own scripts. Left alone on purpose: a submodule change needs its own
  commit and push.

## Next steps

### 1. Trim to the used subset

Read `plans/fork-feature-trim.md`, pick the groups to remove, delete them.

Done when: `bun install` exits 0, `cd kimaki && bun run build` is clean,
`bun run test` in `kimaki/` is green, and no kept file imports a removed package.

### 2. Move the running bot to the fork

Confirm with the user which install path they want: a global `bun link`, a
`bun install -g` of the fork, or running from the clone. Then keep the existing
data dir (`~/.kimaki`; the SQLite format is unchanged), start the fork's bot, and
let it rewrite the OpenCode plugin shim (it points the shim at `dist/` on start).

Done when: `kimaki status` reports `runtime: bun` and a Discord message gets a
reply.

### 3. Close the deferred items

Push `bun-runtime` (or hand off again with a `wip/` snapshot), decide the
submodule scripts, and decide whether Node-for-install is acceptable.

## Open questions for the user

- Which optional features are in use: voice calls, voice messages, TTS,
  `kimaki tunnel`?
- Self-hosted only, or keep the gateway path?
- Keep the docs site (it lives in `website/`)?

## Pointers

- `AGENTS.md` — repo rules and entry points.
- `plans/fork-feature-trim.md` — keep/remove analysis with sizes.
- `decisions.tsv` — one row per decision, with evidence.
