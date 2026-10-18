# Kimaki fork: maintenance and runtime research

Purpose: the known-good practices for this scenario, and which to apply here.
Scenario: a personal fork of an active upstream (`remorses/kimaki`, about one
release per week), Bun only, self-hosted on `knockon`, one user. The fork takes
upstream changes, trims the orphan workspaces, and runs the bot from the clone.

Read with `plans/fork-handoff.md` and `plans/fork-feature-trim.md`.

## 1. The fork shape decides the maintenance cost

Finding: merge difficulty grows with the number of upstream changes since the
last sync and with the size of the downstream delta (GitHub, "friendly fork"
post; Linux kernel rebase rules).

Recommendation: keep the downstream delta a small, ordered patch series on top
of an upstream release tag, and rebase it onto each new tag.

- Add the upstream remote and fetch its tags:
  `git remote add upstream https://github.com/remorses/kimaki.git`
- Base the fork on `kimaki@1.2.0`, a tested release, not on `e8aceec5`, a demo
  commit after that release.
- Move the branch with
  `git rebase --onto kimaki@1.2.0 <old-base> bun-runtime`.
- The fork has no other consumers, so rebase and force-push are safe. There is
  no shared branch to protect. If the old state must stay reachable without a
  force-push, use the history-preserving rebase (`git merge -s ours`, then
  `git rebase --onto`). For one user, plain rebase is simpler.

Enable the tools that make repeated rebases small:

- `git config rerere.enabled true` records a conflict resolution and replays it
  on the next rebase. Not set in this clone today.
- `git config merge.conflictStyle diff3` shows the common ancestor inside the
  conflict. Not set in this clone today.
- `git range-diff <old-tag>..<old-branch> <new-tag>..<new-branch>` reviews what
  the rebase changed.
- `git show --remerge-diff <merge>` reviews what a merge resolution changed.

Tradeoff: a merge-based fork keeps history and needs no force-push, but the
downstream patch set is hard to see. A rebase-based fork shows the patch set
clearly. The GitHub post rates merge as the easiest start and rebase as better
when fixes must be cherry-picked to supported versions. For a single-user fork,
rebase is the better fit.

Upstream what is generic. The Bun runtime, `bun test`, and `bun install`
changes are useful to everyone and are not fork-specific. Sending them upstream
removes them from the patch series. The trim and the self-hosted change stay
downstream.

Cadence: sync on each upstream release, about weekly. Conflicts then stay small.
The kernel docs warn that a reparented series is effectively new code, so run
the suite after each sync.

## 2. Trim without a recurring merge cost

The trim has two kinds, with different merge costs.

### 2a. Whole orphan workspaces: exclude, do not delete

Finding: git cannot resolve a delete/modify conflict with `-X ours`. When the
fork deletes a file and upstream changes it, every merge reports `deleted by us`
and the path must be removed again. Git `rerere` does not track submodule
conflicts. A 52k-line deletion makes every upstream merge larger.

Better: keep the files, and remove the workspaces from install and build. Write
the kept workspaces as an explicit allowlist in the `workspaces` field:

```json
"workspaces": [
  "./kimaki",
  "./errore",
  "./traforo",
  "./traforo/website",
  "./discord-digital-twin",
  "./opencode-deterministic-provider"
]
```

`bun install` then does not install the orphan workspaces or their exclusive
dependencies. The files stay untouched, so upstream merges do not conflict on
them, because the fork never changed those paths. The change is reversible: add
a path back to the list.

Do not use negative globs such as `"!./website"`. The Bun docs on `main`
describe them, but **Bun 1.4.2, the version on this machine, ignores them**. A
scratch project with `["./*", "!./b"]` still installed workspace `b`. Use the
allowlist, or upgrade Bun after a test.

This change was applied and verified on 2026-10-18:

- `bun install` links 6 workspaces, down from 17. Installed packages fall from
  1636 to 1012, and `bun.lock` loses 791 lines.
- The root `prepare` script builds only `errore` and `traforo`.
- `bun install --frozen-lockfile` exits 0, `cd kimaki && bun run build` is
  clean, and `bun run test -u` is 182 of 182 across 51 files in 38s.

Cost: the files stay on disk and in code search. The disk cost is small. The
merge cost of deletion is recurring.

The same rule applies to submodules. Keep the `gateway-proxy` and
`opencode-injection-guard` gitlinks in the tree and do not init them, instead
of removing the entries. An upstream submodule bump then moves the gitlink on
its own. `git submodule status` already shows `gateway-proxy` as not
initialized.

### 2b. Files inside `kimaki/`: delete only for a real dependency saving

Voice calls (`voice-call.ts`, `live-call.ts`, `voice-agent.ts`) and Strada
analytics live inside the `kimaki` package. Removing them removes code and the
native dependencies `@discordjs/voice`, `werift`, `opusscript`, and
`prism-media`. That is a real install and supply-chain saving. The cost is a
delete/modify conflict if upstream changes those files. Voice calls are never
used, so take the deletion, and keep it in its own commit so a rebase can drop
or reapply it.

Exclusion cannot do this job, because `kimaki` is the workspace in use.

### 2c. The self-hosted refactor is the largest downstream change

`credentials.ts` has 54 gateway references and `onboarding.ts` branches on the
mode. The self-hosted switch is a refactor, not a delete, and it stays in the
patch series permanently. It removes the external dependency on
`discord-gateway.kimaki.dev`.

Tradeoff to state: the exclusion in 2a shrinks the merge surface, but the
self-hosted refactor grows it. Both are coherent. Keep the refactor as one
clearly named patch, so a future rebase can drop it if the gateway decision
changes.

### 2d. The trim check changes

`plans/fork-handoff.md` step 1 checks that "no kept file imports a removed
package". With exclusion, nothing is removed. The check becomes: the kept
workspaces install, `kimaki` builds clean, the suite is green, and
`bun install` does not pull the orphan dependencies.

## 3. Bun only, made reproducible

- Commit `bun.lock`. This fork's lockfile was migrated from `pnpm-lock.yaml` and
  pins the old resolved versions. Do not delete it: a re-resolve once moved
  `goke` and `discord-api-types` to versions that failed `tsc`.
- Use `bun install --frozen-lockfile` (or `bun ci`) for a deploy. It fails when
  `package.json` and `bun.lock` disagree, so an upstream merge that changes
  dependencies forces a deliberate `bun install` and a reviewed lockfile diff.
- Update on purpose: `bun update --interactive`, then build and test.
- `trustedDependencies` replaces Bun's default trust list, it does not extend
  it. The root lists `@discordjs/opus` and `@opencode/cli`. `bun pm untrusted`
  reports 0 untrusted dependencies with scripts today, so the list is complete
  now. Add a package to the list if a later install reports an untrusted
  dependency with a script.
- `@opencode/cli`'s postinstall calls `node`. Node is a build-time need only.
  Keep Node available for `bun install`. The bot and the CLI run on Bun. This is
  acceptable and already recorded.
- Optional: `bun build --compile` gives one standalone binary. It does not fit
  the current plugin-shim design, which points OpenCode at `dist/plugin/`. Do
  not adopt it for the bot now.

## 4. Self-hosted bot on knockon

- One gateway runtime per bot token. Stop the old process before the new one
  starts. Two bots in one server both answer.
- Put the token in an env file that only root can read and give it to systemd
  through `EnvironmentFile`. Never commit it.
- Enable only the intents the bot uses. Message Content is privileged and must
  be enabled in the Developer Portal.
- Run the bot as a systemd user service, like `opencode.service`, with linger on
  (`loginctl` reports `Linger=yes`). `ExecStart` uses the absolute Bun path.
- Restart policy: `Restart=on-failure`, `RestartSec=5`, and `RestartSteps` with
  `RestartMaxDelaySec` so a broken start backs off. Discord blocks an IP that
  sends too many invalid requests, and a fast crash loop can cause that.
- Do not copy a hardening block with `ProtectHome=true` unchanged. The data dir
  is `~/.kimaki`, and OpenCode keeps state under the home directory. Add those
  paths to `ReadWritePaths`, or leave home readable.
- The bot connects out and needs no inbound port. The only local listener is the
  lock server on `127.0.0.1`.

## 5. Verify after each sync

- `cd kimaki && bun run build` (tsc) is clean.
- `bun run test -u` in `kimaki/`, then inspect the snapshot diff.
- `git range-diff` reviews the rebase; run the suite on the rebased result.
- After the switch: `kimaki status` reports `runtime: bun`, and a Discord
  message gets a reply.

Optional CI on the fork: a GitHub Actions job with `oven-sh/setup-bun` that
runs `bun install --frozen-lockfile`, `bun run build`, and the unit tests. Keep
e2e out of CI: each e2e file starts its own OpenCode server, about 400 MB.

## Decisions (2026-10-18)

1. Base the fork on `kimaki@1.2.0` instead of `e8aceec5`. Not applied yet.
2. Exclude the orphan workspaces with a workspace allowlist. Applied and
   verified (section 2a).
3. Send the Bun runtime, test, and install port upstream. Open.
4. Sync on each upstream release. Recommended, not scheduled.

## Sources

- Friendly fork management (GitHub, merge vs rebase, diff3, cadence):
  https://github.blog/developer-skills/github/friend-zone-strategies-friendly-fork-management/
- History-preserving rebase (`ours` merge plus `rebase --onto`):
  https://amboar.github.io/notes/2021/09/16/history-preserving-fork-maintenance-with-git.html
- Long-lived fork cleanup (`merge -s ours`, cherry-pick what is still needed):
  https://die-antwort.eu/techblog/2016-08-git-tricks-for-maintaining-a-long-lived-fork/
- Linux kernel rules on rebasing and merging:
  https://docs.kernel.org/next/maintainer/rebasing-and-merging.html
- `git rerere`, including submodule limits:
  https://git-scm.com/docs/git-rerere
- Delete/modify conflicts are not resolved by `-X ours`; remove the paths:
  https://stackoverflow.com/questions/11331494/git-merge-strategy-to-ignore-deleted-files
- Bun workspaces, negative globs, `--filter`:
  https://bun.com/docs/pm/workspaces
- Bun install, `--frozen-lockfile`, `bun ci`:
  https://bun.com/docs/pm/cli/install
- Bun lifecycle scripts and `trustedDependencies` (replaces the default list):
  https://bun.com/docs/pm/lifecycle
- Bun as a systemd daemon:
  https://bun.com/guides/ecosystem/systemd
- Discord bot on a server (token file, hardening, restart backoff, one gateway
  runtime):
  https://www.melonslab.com/guides/discord-bot
- Discord Gateway intents:
  https://docs.discord.com/developers/events/gateway
