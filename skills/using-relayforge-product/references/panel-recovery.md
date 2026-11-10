# Panel runtime recovery

Use this recovery only during requested product work when progress tools are
missing, a panel/tool launch fails, source_state reports node_unavailable, or
the user reports that a panel cannot open. Check once per affected component
per conversation; repeat only after a user-requested repair or new evidence.
Do not create a product requirement for an environment repair.

## Native check before runtime-dependent diagnostics

On Codex local desktop/CLI, the plugin registers a SessionStart hook for a new or
cleared chat. Windows uses the built-in Windows PowerShell; macOS/Linux use
`/bin/sh` and system utilities. The checker itself requires neither Python nor
Node, does not call MCP, and does not download or install anything. It locates
optional runtimes and probes only those already found, with bounded execution
and Python automatic-install flags disabled. It reads no prompt or transcript.

The hook sends a `systemMessage` with an environment notice and setup choices to
the host UI/event stream when a check fails, plus `additionalContext` containing
the observed node/python statuses and instructions for the assistant. Healthy
environments produce no warning. This output does not depend on an agent having
selected the controller or on a working progress panel. Ask the user through
the host's choice tool when available, otherwise in chat, after showing the
concrete plan required below. A warning's assisted-setup option is not itself
consent to an unspecified install command.

Codex requires review/trust before running plugin hooks. Direct users to
**Settings > Hooks / Review hooks** for this plugin; never modify their trust
settings automatically. Hooks disabled by the user/admin, unsupported hosts,
or OS restrictions cannot be bypassed. In that case the Skill must explicitly
run the native checker instead, or report that shell access is unavailable.
The hook runs on startup/clear, not every prompt or resume, to avoid repeatedly
asking about an already declined installation. An upgrade requires a new hook
review when Codex requests it. After consenting to a repair, explicitly recheck.

Manual/Skill fallback from the actual installed plugin root:

```powershell
& "<plugin-root>/hooks/check-runtime.ps1" -Format Json
```

```sh
/bin/sh "<plugin-root>/hooks/check-runtime.sh" --json
```

The native report identifies `node` and `python` as ready, missing, unsupported,
sqlite_unavailable (Python), or probe_failed. Missing means no command was found
on this process's PATH, not proof that no install exists on disk. probe_failed
is uncertainty, not absence: do not prescribe an install from a timeout or denied
execution alone. If both are ready, no installation prompt is needed. Runtime
readiness does not establish host MCP registration or successful UI rendering.

## Deeper diagnosis after the native check

Distinguish the inline product progress card (`progress`) from the optional
browser visual companion (`companion`). Progress needs Python 3.11+ with the
standard-library sqlite3 module and Node.js 18+; the companion needs only Node.js
18+. The UI and SDK are bundled: neither needs npm install, pip packages, Bash
or WSL at runtime. A missing tool is a trigger to check, not proof of a missing
runtime. Never run diagnostics on unrelated general questions.

After native checks find Node available, use this deeper read-only checker when
service startup or host connection still needs diagnosis, resolving
`<skill-dir>` to this controller's absolute directory, with a quoted path:

```text
node <skill-dir>/scripts/panel-runtime.cjs progress
node <skill-dir>/scripts/panel-runtime.cjs companion
```

Use the actual installed Skill directory from this chat, not a repository copy
or a cache on another computer. Read its root plugin.json version and check the
checker file exists first. The report includes package identity/version/root and
the optional Codex install revision. Older checkers may omit these fields; read
the manifest separately in that case. A missing checker means package/version
verification is needed, not that Node or Python needs installation. An update
shown in plugin details does not by itself establish which Skill files an
already-running chat loaded.

Run only the command for the affected component. Each Python probe and service
probe has a five-second limit. The checker tests python and python3 (preferring
python on Windows), plus Windows py -3, their versions and sqlite3, then performs an MCP initialize handshake in
the plugin directory. It creates no task or progress cache and installs nothing.

If Node itself cannot run, stay with the native checker above. Do not install
Node merely to execute diagnostics. If the host provides no shell, say that local
detection is unavailable; offer manual instructions without claiming a runtime is missing.

| Evidence | Response |
| --- | --- |
| Python/Node command missing or a verified version below the minimum | Explain the observed command/version and offer the installation choice below for only the affected runtime. A command missing from this process does not prove the computer has no installation; mention PATH or an existing install as alternatives. |
| launch_command_mismatch | A compatible Python already exists. Show the suggested MCP command/args/cwd and offer a host-local launch override using the discovered absolute executable; do not reinstall Python or rewrite the shared plugin manifests with a machine-specific path. |
| python_sqlite_unavailable | Explain that the existing Python lacks working sqlite3. Offer to repair/use a full Python distribution; sqlite3 is not a pip package. |
| python_probe_failed | The check failed or timed out; do not label this as an absent runtime. Report the uncertainty and offer manual diagnosis or text continuation. |
| service_unavailable | Runtimes were found but MCP initialization failed. Check plugin path, working directory and host error details; do not prescribe a runtime install from this result alone. |
| runtime_ready_host_unverified | Runtimes and the local progress handshake (when applicable) passed. Check MCP registration, permissions, host PATH and MCP Apps support. The checker cannot observe whether the host rendered a panel. For the companion, check the returned URL and browser access. |

Do not infer a panel opened from a successful tool response. If the host supplies
no render-failure signal, detect missing tools/launch errors and respond to user
reports; do not promise automatic detection of an invisible rendering failure.

Current registrations use `node progress_panel/launch.cjs` to select an existing
compatible Python and start the stdio server with its absolute executable. The
launcher checks python first on Windows, stops at the first compatible runtime,
inherits stdio and writes startup errors only to stderr. If launch_command_mismatch
is reported by an older installed package that still registers python3 directly,
use an explicit host-local override or upgrade to a package with the automatic
launcher; installing another Python is not the repair for that mismatch.

## Let the user choose in chat

For a confirmed runtime problem, explain which panel is affected, the observed
cause and the minimum requirement. Prepare the OS-specific repair/install plan
before asking: name the package, version/channel, official source, exact command
(or manual installer steps), user/system scope and any administrator or PATH
change. Prefer an existing compatible install over adding another one. For a
new install choose a currently supported stable Python or Node LTS meeting the
minimum, rather than assuming the minimum version is still supported.

Offer these three choices in the user's language, in chat (the unavailable panel
cannot carry the choice):

- **协助安装并重试** — Execute the displayed plan only after explicit selection.
- **查看手动安装说明** — Provide official download/setup steps; execute nothing.
- **暂不安装，继续产品工作** — Continue with text progress or a static prototype.

Example after presenting the concrete plan: “进度面板暂时无法启动：当前进程找不到
Python 3.11+。你可以选择：按上述方案协助安装并重试、查看手动安装说明，或暂不
安装继续产品工作。” Tailor the cause to the evidence; do not reuse this wording
for an unknown host-rendering failure.

Installation changes the user's machine, so the product request or acceptance of
the visual companion does not itself consent to installing software. Reuse an
explicit earlier consent to the same concrete plan. Silence, “继续” and unrelated
product approvals are not installation consent. While awaiting an optional
choice, continue independent requested product work with text/static fallback.
Remember a decline/defer for this conversation; do not ask again at every stage.

After consent, use only the displayed official installer or an already available
package manager whose package identity/source was verified. Follow host tool
permissions; if execution is unavailable, deliver the manual steps. Do not add
an MCP server, install a package manager or use an unreviewed download-and-execute
script as an implicit prerequisite. Useful official starting points:
[Python downloads](https://www.python.org/downloads/),
[Python on Windows](https://docs.python.org/3/using/windows.html), and
[Node.js downloads](https://nodejs.org/en/download).

After installation/repair, recheck the affected runtime and retry the panel once
when the host allows. A running host may still have its old PATH: explain how to
reload its MCP connection or restart it at the user's convenience; never restart
the app automatically. Reuse an existing run_id if available, avoid duplicate
cards and preserve the selected product requirement. If the retry fails, report
the remaining cause and continue the fallback without another install loop.
