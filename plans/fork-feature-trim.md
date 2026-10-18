# Kimaki fork: feature trim

Purpose: pick what this fork keeps from upstream. The fork serves **one
self-hosted user** who wants the Discord agent orchestration. Everything aimed
at the hosted, multi-tenant, multi-platform product is an **orphan** here.

Read with `plans/fork-handoff.md`. Sizes are tracked lines of code (submodules
count as one gitlink). Removing a feature also removes its e2e files, and each
e2e file starts its own OpenCode service, so the suite gets faster too.

## Remove (orphans for a self-hosted, Discord-only user)

| group | items | size | also removes |
| --- | --- | --- | --- |
| Hosted plane | `website/`, `db/`, `fly-admin/`, `kimaki-demo/`, `gateway-proxy/` (Rust submodule) | ~19k LOC + a service | kimaki gateway code in `credentials.ts`, `onboarding.ts`, `remote-send.ts`, `gateway-replay.e2e`, `KIMAKI_GATEWAY_*` |
| Slack plane | `discord-slack-bridge/`, `slack-digital-twin/` | ~19k LOC | `slop/*slack*` specs |
| Realtime infra | `realtime/`, `libsqlproxy/` | ~8.8k LOC | nothing in kimaki (not imported) |
| Other OpenCode plugins | `opencode-auto-mode/`, `opencode-fallback/`, `opencode-cached-provider/`, `opencode-injection-guard/` | ~4.7k LOC | nothing in kimaki (published separately) |

Start here: these four groups are the bulk (~52k LOC), touch no kimaki runtime
code except the gateway branch, and are the most clearly unused.

## Decide (depends on your habits)

| item | size | keep if | remove impact |
| --- | --- | --- | --- |
| Voice calls: `voice-call.ts`, `live-call.ts`, `voice-agent.ts`, `voice-call.e2e` | ~2k LOC | you talk to the bot in a voice channel | drop `@discordjs/voice`, `werift`, `opusscript`, `prism-media`, `realtime` |
| Voice messages: `voice.ts`, `voice-openai.e2e`, `voice-attachments.e2e` | ~1.1k LOC | you send voice notes | drop OpenAI/Gemini transcription; the free Whisper path is gateway-only anyway |
| Strada analytics: `analytics.ts` + tests | ~0.5k LOC | you want install metrics | drop `@strada.sh/sdk`, `KIMAKI_STRADA_*`; removes telemetry |
| Tunnel: `kimaki tunnel` + `kimaki-tunnel` skill | small | you expose a local server with `traforo` | drop the `traforo` workspace dep |
| Docs | in `website/` | you want them offline | deleting `website/` takes the docs with it; keep the docs folder if so |
| `kimaki profile cpu/heap` | small | you profile the bot | none |

## Keep (the orchestration you use)

- Bot and CLI core: `ingress.ts`, `sessions.ts`, `prompt.ts`, `event-loop.ts`,
  `thread-reducer.ts`, `effects.ts`, `slash-commands.ts`, `commands/*`,
  `cli/*`, `lock-server.ts`, `autostart.ts`.
- Sessions: fork, resume, undo/redo, compact, diff, cwd, title, archive.
- Interaction: `permissions.ts`, `questions.ts`, `queue.ts`.
- Git worktrees: `worktrees.ts`.
- Routines and sleeps: `scheduler.ts`, `sleeps.ts`.
- Agent UI and files: `agent-ui.ts`, `file-edit-log.ts`, `upload-to-discord`.
- Login and subscriptions: `login` command, `plugin/anthropic/`.
- Formatting and tests: `format-parts.ts`, `markdown/`, `discord-digital-twin`
  (test dep), `opencode-deterministic-provider` (test dep), `errore` (runtime
  dep).
- Builtin skills `kimaki-debug` (keep `kimaki-tunnel` only if you keep the
  tunnel).

## Notes

- Removing a group is a delete plus a `package.json` and import sweep. The check
  is the one in `plans/fork-handoff.md` step 1.
- The gateway branch is the only removal that edits kimaki runtime code
  (`credentials.ts` has ~40 gateway references; `onboarding.ts` and `cli/bot.ts`
  carry the rest). Expect a real refactor there, not a delete.
- The test suite shrinks by about 6 files when voice and gateway go (3 voice
  e2e, `gateway-replay.e2e`, `onboarding.e2e`, `onboarding-cli.e2e`), which is
  the main knockon speed-up available.
