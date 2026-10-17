# Bun runtime port: results

Branch `bun-runtime` in this fork, based on `remorses/kimaki` at `e8aceec5`.
The decision trail is `decisions.tsv` in the repo root.

## Finish condition

```
cd kimaki && bun run bun:check
```

Runs the Kimaki suite on Bun, with the bot and every CLI child process on Bun,
and asserts the running process is Bun (`KIMAKI_EXPECT_RUNTIME=bun`).

## Result

| Machine | Runtime | Files | Tests | Duration |
| --- | --- | --- | --- | --- |
| Mac (10 CPU) | Bun 1.4.2 | 51/51 | 186/186 | 37.2s |
| Mac (10 CPU) | Node 26.11 | 51/51 | 186/186 | 47.9s |
| knockon (4 CPU) | Node, before any change | 47/50 | 176/179 | 310s |
| knockon (4 CPU) | Bun | 48/51 | 183/186 | 217s |

`bun run bun:check` exits 0 on the Mac. That needs `critique` on PATH: one test
(`session diff`) spawns it. Install it anywhere on PATH, for example
`npm i --prefix /tmp/kimaki-critique critique` then add
`/tmp/kimaki-critique/node_modules/.bin` to PATH.

## Reproducing the knockon failures

knockon shows three extra failures in a full run. None is a Bun regression:

| Test | Evidence it is not the port |
| --- | --- |
| `gateway-replay` reconnect | passes alone on Bun, and on Node before the change |
| `voice-call` finished threads | passes alone on Bun, passes on the Mac on both runtimes |
| `catalog-refresh` bulk write | fails alone on **Node** as well, before and after the change, with the same assertion |

knockon has 4 CPUs and `vitest.config.ts` caps parallel files at a third of
them, so a full run is load-sensitive. `catalog-refresh` fails on this machine
on both runtimes, so it is a Linux/knockon environment issue that predates this
branch.

## CLI startup

Best of five, idle Mac, after `pnpm build`:

| Command | Start | Peak RSS |
| --- | --- | --- |
| `node dist/cli.js --help` | 0.10s | 71 MB |
| `bun dist/cli.js --help` | 0.03s | 52 MB |
| `node --import tsx src/cli.ts --help` | 0.06s | 42 MB |
| `bun src/cli.ts --help` | 0.03s | 52 MB |

`AGENTS.md` asks for about 0.06s and 70 MB. Bun is about 3x faster to start the
published entry and uses less memory.

## What changed

- `kimaki/src/runtime.ts`: `runtimeName`, `runtimeExecutable`, `runtimePath`,
  `entryArgv`, `evalArgv`, `isTypeScriptEntry`. Bun runs TypeScript directly;
  Node needs the tsx loader.
- `kimaki/src/autostart.ts`, `kimaki/src/cli/bot.ts`: spawn through the module.
- `kimaki/src/test/harness.ts`: `cliCommand()` and `cliShellCommand()` replace
  14 hand-written `process.execPath --import tsx src/cli.ts` spawns across the
  e2e tests.
- `kimaki/vitest.config.ts`: inline `zod`. Under Bun an externalised import of
  it resolves to a namespace without `z`, which threw at import time.
- `kimaki/src/lock-routes.ts`, `kimaki/src/cli/bot.ts`: `kimaki status` reports
  the runtime; `cli-lock.e2e.test.ts` asserts it equals the runtime under test.
- `discord-digital-twin/src/voice.ts`: `trustCertificate()` also sets
  `NODE_TLS_REJECT_UNAUTHORIZED=0` on Bun, and `stop()` restores it. Bun's `ws`
  client ignores `tls.setDefaultCACertificates`, so every voice join failed with
  `TLS handshake failed`. Real Discord voice uses a public chain both runtimes
  trust, so this is scoped to the twin.

## Reproducing the TLS finding

```bash
cd kimaki
# needs an openssl binary
bun -e "
const { execFile } = await import('node:child_process')
const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
const tls = (await import('node:tls')).default
const { promisify } = await import('node:util')
const { WebSocketServer, WebSocket } = await import('ws')
const https = (await import('node:https')).default
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p-'))
await promisify(execFile)('openssl', ['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',dir+'/k','-out',dir+'/c','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'])
const cert = fs.readFileSync(dir+'/c','utf8')
const server = https.createServer({ key: fs.readFileSync(dir+'/k','utf8'), cert })
new WebSocketServer({ server })
await new Promise((r) => server.listen(0,'127.0.0.1',r))
tls.setDefaultCACertificates([...tls.getCACertificates('default'), cert])
const ws = new WebSocket('wss://127.0.0.1:' + server.address().port)
ws.on('open', () => { console.log('OPEN'); process.exit(0) })
ws.on('error', (e) => { console.log('ERROR', e.message); process.exit(0) })
"
```

Bun prints `ERROR ... TLS handshake failed`; Node prints `OPEN`. With
`NODE_TLS_REJECT_UNAUTHORIZED=0` set before the connection, Bun prints `OPEN`.

## Open decision for the maintainer

`kimaki/src/cli.ts` still starts with `#!/usr/bin/env node`, and the npm `bin`
still points at `dist/cli.js`. So a global install or `npx kimaki` launches
Node, and Kimaki then keeps whatever runtime started it. Bun is used when the
user runs `bun dist/cli.js` or `bun src/cli.ts`.

Making Bun the default launcher is a product call, not an experiment: it would
change the runtime for every user who happens to have Bun installed. Ask before
changing it. The change itself is small: a launcher that prefers `bun` when it
is on PATH, else `node`, or a `#!/usr/bin/env -S bun` shebang for a Bun-only
build.
