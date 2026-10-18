# Kimaki fork: handoff (bun-only, self-hosted, trim)

## Context

This is `HT2Knock/kimaki`, a personal fork of `remorses/kimaki`. The user runs
Kimaki for one job: drive OpenCode sessions on `knockon` from Discord, mostly
from an iPhone 7. The use case is written down in
`~/Documents/T2Knock/JT-notes/tech/remote_agent_iphone7.md` (the setup) and
`~/Documents/T2Knock/JT-notes/routines/daily-workout-coach.md` (a Kimaki
routine). Read those before deciding what to cut.

The setup today: Discord → Kimaki on `knockon` → OpenCode managed service
(`serve --service` on `127.0.0.1:49374`). The bot runs in **gateway mode**: the
author's shared bot through `discord-gateway.kimaki.dev`. Routines (scheduled
prompts) are in use, and notifications arrive in Discord threads.

The fork is **Bun only**. Upstream also carries the hosted service (gateway
proxy, kimaki.dev), a Slack bridge, voice calls and a realtime SDK. Those are not
part of this use case.

Two goals, in order:

1. Trim the repo to the used subset (`plans/fork-feature-trim.md`).
2. Move the running bot to the fork on Bun (next steps).

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

## Decisions from the user (2026-10-18)

- Voice calls: **never used; remove.**
- Voice messages and TTS: not in use yet, but **keep them**.
- Handoff: **keep the commits local**; the next session runs on this machine.

## Decision: gateway or self-hosted

**Self-hosted, on knockon.** The bot uses the author's shared bot today.
Self-hosted (own Discord app) removes the external dependency and the gateway
branch in `credentials.ts`, at the cost of a one-time Discord app setup.
Everything else in `plans/fork-feature-trim.md` is removable either way.

## Where to run things

Three separate questions, often confused:

| question | options | affects |
| --- | --- | --- |
| Credential mode | gateway (author's bot) or self-hosted (own Discord app) | who owns the Discord app; the repo's gateway branch |
| Bot host | knockon, `t2knock-lab`, a VPS | where the bot process runs |
| Agent host | knockon or elsewhere | where OpenCode and the project files live |

Verified facts:

- The bot is light (~70 MB RSS, ~0.06 s start). It is not what loads knockon;
  OpenCode is. Moving the bot to `t2knock-lab` frees little.
- Another local machine does not fix a bad internet link. The path to Discord is
  the internet from wherever the bot runs. Only a host outside the region (a
  VPS) changes that, and then the bot-to-OpenCode hop is WAN.
- `!cmd` and all agent tools run on the OpenCode host (`session.shell`), so they
  follow OpenCode.
- The bot reaches OpenCode through a service file
  (`{ id, version, url, pid, password }`); the client builds basic auth from it
  (`Service.discover` then `Service.headers`). So a remote URL plus password is
  plausible: write the file on the bot host pointing at knockon's Tailscale URL
  and the service password.
- Not supported without work: custom worktrees (`worktrees.ts` runs `git` with
  `cwd: projectDirectory` on the bot host), local path checks, and
  `Service.ensure` may try to replace a service whose version mismatches.
- `plans/remote-opencode-servers.md` covers exactly these gaps, but it is V1
  (Prisma + hrana) and not ported to V2. Treat it as a roadmap.

## Self-hosted switch: what survives

Fear to answer: "hosting my own bot removes Kimaki from the server and I lose
all the projects and setup."

- Channels, threads and history live in **Discord**, not in Kimaki. Installing a
  different bot app does not delete them.
- The channel-to-project and thread-to-session mapping lives in the local SQLite
  `~/.kimaki/kimaki.db` (`channel_directories`, `thread_sessions`) and persists.
  `onboarding.ts` treats existing project mappings as already configured, so it
  does not create a new default channel or touch the existing ones.
- What changes is the **bot user** that replies. Name the new app "Kimaki" and
  give it the same avatar and it looks the same. The old app can stay in the
  server during the switch; run one bot at a time (two would both answer). Remove
  the old app once the new one works, which also removes its slash commands.
- Steps: create a Discord app, enable Message Content Intent, reset the token,
  then run `kimaki --restart-onboarding` (self-hosted asks for the token) or set
  `KIMAKI_BOT_TOKEN`. Open the install URL to add the new bot.
- Loss: the free Whisper transcription in `voice.ts` is gateway-only, so voice
  messages would need an OpenAI or Gemini key.

## Discord needs outbound only

The bot uses discord.js over the **outbound** Gateway WebSocket
(`GatewayIntentBits` in `main.ts`). Slash commands and buttons arrive on that
same socket. There is no inbound port and no interactions webhook, so no public
endpoint and no tunnel are needed; the only local listener is the lock server on
`127.0.0.1`. The bot works from behind NAT or CGNAT, and discord.js reconnects
and resumes on a dropped link. `opentunnel`/`traforo` is for exposing the
OpenCode service to remote machines, which one host does not need.

## Recommendation

knockon hosts everything: the bot, OpenCode and the project files.
`t2knock-lab` stays out (old hardware, and it shares knockon's internet). Go
self-hosted on knockon.

## Pointers

- `AGENTS.md` — repo rules and entry points.
- `plans/fork-feature-trim.md` — keep/remove analysis with sizes.
- `decisions.tsv` — one row per decision, with evidence.
- `~/Documents/T2Knock/JT-notes/tech/remote_agent_iphone7.md` — the setup.
- `~/Documents/T2Knock/JT-notes/routines/daily-workout-coach.md` — a live routine.
