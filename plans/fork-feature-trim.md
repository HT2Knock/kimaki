# Kimaki fork: feature trim

Purpose: pick what this fork keeps. The use case lives in
`~/Documents/T2Knock/JT-notes/tech/remote_agent_iphone7.md` and
`~/Documents/T2Knock/JT-notes/routines/daily-workout-coach.md`. In one line:
drive OpenCode sessions on `knockon` from Discord (mostly an iPhone 7), with
scheduled routines, for one user.

Leading idea: anything that serves other users, other chat platforms, or the
hosted service is an **orphan** in this fork.

Read with `plans/fork-handoff.md`. Sizes are tracked lines of code (a submodule
counts as one gitlink). Removing a feature removes its e2e files, and each e2e
file starts its own OpenCode service, so the suite gets faster too.

## Remove (orphans)

| group | items | size | notes |
| --- | --- | --- | --- |
| Hosted service | `website/`, `db/`, `fly-admin/`, `kimaki-demo/`, `gateway-proxy/` (Rust submodule) | ~19k LOC + a service | the author's infrastructure; the fork never runs it, even in gateway mode |
| Slack | `discord-slack-bridge/`, `slack-digital-twin/` | ~19k LOC | Discord only |
| Not imported by kimaki | `realtime/`, `libsqlproxy/` | ~8.8k LOC | kimaki does not import them |
| Other OpenCode plugins | `opencode-auto-mode/`, `opencode-fallback/`, `opencode-cached-provider/`, `opencode-injection-guard/` | ~4.7k LOC | published separately; keep only those you use |
| Voice calls | `voice-call.ts`, `live-call.ts`, `voice-agent.ts`, `voice-call.e2e` | ~2k LOC | decided: never used; also drops `@discordjs/voice`, `werift`, `opusscript`, `prism-media`, `realtime` |
| Tunnel | `kimaki tunnel` + `kimaki-tunnel` skill | small | drop the `traforo` workspace dep only if you do not use it; `traforo` is a kimaki runtime dep |
| Strada analytics | `analytics.ts` + tests | ~0.5k LOC | drops `@strada.sh/sdk`, `KIMAKI_STRADA_*`; removes telemetry |

Start here: the first four groups are ~52k LOC and touch no kimaki runtime code.

## Keep (the orchestration in use)

- Bot and CLI core: `ingress.ts`, `sessions.ts`, `prompt.ts`, `event-loop.ts`,
  `thread-reducer.ts`, `effects.ts`, `slash-commands.ts`, `commands/*`,
  `cli/*`, `lock-server.ts`, `autostart.ts`.
- Sessions: fork, resume, undo/redo, compact, diff, cwd, title, archive.
- Interaction: `permissions.ts`, `questions.ts`, `queue.ts`.
- **Routines and sleeps**: `scheduler.ts`, `sleeps.ts` — the daily workout coach
  runs on these.
- Git worktrees: `worktrees.ts`.
- Notifications and files from the phone: `agent-ui.ts`, `file-edit-log.ts`,
  `upload-to-discord`.
- Login and subscriptions: `login`, `plugin/anthropic/`.
- Voice messages (`voice.ts`) and TTS — the user wants both (from Discord).
- Formatting and tests: `format-parts.ts`, `markdown/`, `discord-digital-twin`
  (test dep), `opencode-deterministic-provider` (test dep), `errore` (runtime
  dep).

## Decide: gateway or self-hosted

- **Gateway** (today): keeps the gateway branch in `credentials.ts` (~40 refs),
  `onboarding.ts`, `cli/bot.ts`, the `KIMAKI_GATEWAY_*` env, and an external
  dependency on the author's shared bot at `discord-gateway.kimaki.dev`.
- **Self-hosted**: removes all of that and needs a one-time own Discord app.
- The hosted **packages** (`website/`, `db/`, `gateway-proxy/`) go either way;
  the fork does not run them.

Note: the free Whisper transcription path in `voice.ts` is gateway-only. Under
self-hosted, voice messages need an OpenAI or Gemini key.

## Notes

- The gateway removal is a refactor, not a delete: `credentials.ts` resolves two
  credential modes, and `onboarding.ts` branches on them.
- Removing voice calls and the gateway e2e files drops about 6 of the 51 test
  files, which is the main knockon speed-up available.
- Everything here is a recommendation. Delete in groups and run the check in
  `plans/fork-handoff.md` step 1 after each group.
