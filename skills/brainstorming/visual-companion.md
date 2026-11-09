# Visual companion

Use the companion for product layouts, user journeys, screen states and visual
comparisons when seeing the alternatives helps the user decide. Keep textual
scope and trade-off questions in chat. It is an optional discussion aid, not a
prerequisite for PRDs or specs. Keep architecture and implementation design
outside this product plugin.

## Start or resume

Use the native launcher after the user accepts the companion. Node.js 18 or
later is required for the companion. Windows supports Windows PowerShell 5.1
and PowerShell 7, with no Bash, WSL, CIM access or extra packages required.
Resolve script paths relative to this skill's directory.

PowerShell:

```powershell
& scripts/start-server.ps1 -ProjectDir C:\path\to\project -Open
```

POSIX:

```bash
bash scripts/start-server.sh --project-dir /path/to/project --open
```

The launchers share `scripts/companion.cjs`. The response is `server-started`
JSON containing `url`, `screen_dir`, `state_dir`, `session_dir`, `pid` and
`server_id`. Starting an already running session returns the same information
with `reused: true`. Treat startup as successful only after valid JSON returns.

Pass the project root to persist screens under `.relayforge/brainstorm/`.
The default resumes that project's active session, including its existing
screens and events. `.active-session` records the session directory name; a
legacy project without a pointer resumes its most recent legacy session.
Connection port and key are persisted per session, so independent sessions do
not overwrite each other's connection files. If the preferred port is busy,
use the newly returned URL; the old tab cannot reconnect to a different port.

To restore a specific session, pass `-SessionDir <session>` or
`--session-dir <session>` instead. To deliberately start a separate session,
pass `-NewSession` or `--new-session`. Without a project, the launcher creates a
temporary session; it is retained on stop for review and can be removed later.
Keep `.relayforge/` out of version control, since connection files contain keys.

The URL contains `?key=…`; always share the complete returned URL. The initial
load stores the key in a cookie and session storage, then removes it from the
visible URL. HTTP and WebSocket access both require the key. Do not expose
keys in durable product artifacts.

The browser opens automatically after a screen is available when `-Open` or
`--open` is set. Also share the URL for environments without a desktop browser.
For remote/container setups, use `--host 0.0.0.0 --url-host <reachable-host>`
(or PowerShell `-BindHost` / `-UrlHost`) only when the environment requires it.

On POSIX hosts that reap detached processes, use the host's persistent terminal
mechanism with `--foreground`. `CODEX_CI` selects foreground automatically;
`--background` explicitly overrides it. On Windows the default is hidden
background launch; `-Foreground` is only for a persistent terminal.

If Node or the selected launcher is unavailable, or startup fails for an
environment reason, report the short cause and create a self-contained static
prototype under the project's prototype directory. Do not spend the product
session troubleshooting companion infrastructure.

## Discuss screens

1. Resume through the launcher to verify the server is alive; existing marker
   files alone do not prove liveness. Shutdown is recorded in
   `state/server-stopped`, which is cleared after a successful restart.
2. Write a fresh semantic HTML filename to `screen_dir`, such as `layout.html`
   and `layout-v2.html`. The newest file is served and changes trigger reloads.
3. Explain the decision the user is making, then wait for their feedback.
4. Before writing the next screen, read `state_dir/events`. The current screen's
   events reset on a new screen; chat feedback remains the primary input.
5. Record settled product decisions in workflow state; browser clicks alone
   never approve a PRD, prototype or spec. In fast mode defer intermediate
   approvals as directed by the controller.

Write HTML fragments by default; the server wraps them with a light/dark frame,
connection status and interaction helpers. Full documents beginning with
`<!DOCTYPE` or `<html` are served with the helper injected. Use self-contained
assets with no external CDN, fonts or remote images. Companion assets are
available as `/files/<filename>` from the content directory.

```html
<h2>Which layout supports the primary task?</h2>
<div class="options">
  <button class="option" data-choice="single" onclick="toggleSelect(this)">
    <span class="letter">A</span><span class="content">Single column</span>
  </button>
  <button class="option" data-choice="split" onclick="toggleSelect(this)">
    <span class="letter">B</span><span class="content">Split view</span>
  </button>
</div>
```

Frame classes include `.options`, `.option`, `.cards`, `.card`, `.mockup`,
`.mockup-header`, `.mockup-body`, `.split`, `.subtitle`, `.section`, `.label`,
`.mock-nav`, `.mock-sidebar`, `.mock-content`, `.mock-button`, `.mock-input`
and `.placeholder`. See [the frame](scripts/frame-template.html) for styling.
Add `data-multiselect` to an options/cards container for selection toggles.
The event stream records click history; use chat to resolve ambiguous final
multi-selections instead of assuming the last click represents the whole set.

## Events

Clicks on `data-choice` elements persist automatically. Custom controls can
call `brainstorm.choice(value, metadata)`; the canonical field is `choice`.
The server also accepts the old `type: choice, value: …` format. Values such as
`0` and `false` are valid choices. Both formats persist to the same JSONL file.

```json
{"type":"choice","choice":"single","screen":"layout.html","timestamp":1794268800000}
```

The injected helper identifies the displayed screen. The server stamps legacy
events without a screen ID and ignores queued events naming an obsolete screen.
Read this stream before pushing a new screen, then transfer durable decisions
to product state. Browser events are feedback, not artifact approval records.

## Stop

```powershell
& scripts/stop-server.ps1 -SessionDir C:\path\to\session
```

```bash
bash scripts/stop-server.sh /path/to/session
```

Stopping verifies the authenticated server instance and requests shutdown over
HTTP. No process-name matching, CIM query or blind PID termination is used.
If a live process cannot be verified, stop fails and preserves its metadata;
it does not report a stopped server. This also protects unrelated reused PIDs.
Session content and logs remain available for a later resume. Idle shutdown
defaults to four hours; configure `-IdleTimeoutMinutes` or
`--idle-timeout-minutes` if needed. Do not keep the companion running once the
visual discussion has finished.
