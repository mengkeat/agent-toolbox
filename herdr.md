# Adapting `pi-extensions/subagent.ts` for Herdr

The existing [`pi-extensions/subagent.ts`](pi-extensions/subagent.ts) can be used with Herdr in two different ways:

1. Run the existing tmux-backed implementation from a Pi process hosted inside Herdr.
2. Replace the tmux backend with Herdr pane management.

## 1. Run the existing extension inside Herdr

The current extension can already run from a Pi process hosted in Herdr because it controls `tmux` directly.

Install Herdr's Pi integration:

```bash
herdr integration install pi
```

This installs Herdr's managed Pi extension at:

```text
~/.pi/agent/extensions/herdr-agent-state.ts
```

If `PI_CODING_AGENT_DIR` is set, the file is installed under:

```text
$PI_CODING_AGENT_DIR/extensions/herdr-agent-state.ts
```

The integration should not be edited directly; Herdr manages and may overwrite it. Add custom extensions beside it.

### Requirements

- `tmux` must be installed. The current extension checks this with `tmux -V`.
- `pi` must be available on `PATH`, unless the extension can resolve the current Pi executable.
- The `subagent.ts` extension must be loaded by Pi.
- Provider authentication must be available to child Pi processes.
- The parent Pi session must have a valid active provider and model, unless the tool receives explicit overrides.

### Important environment isolation change

A Pi process running inside Herdr inherits variables such as:

```text
HERDR_ENV
HERDR_SOCKET_PATH
HERDR_PANE_ID
HERDR_WORKSPACE_ID
HERDR_TAB_ID
```

The current extension starts a child Pi inside a private tmux server. That child can inherit the parent's Herdr environment. If the managed `herdr-agent-state.ts` extension is loaded by the child, it may report the child state and session identity as belonging to the parent's Herdr pane.

The child command should therefore clear at least:

```text
HERDR_ENV
HERDR_SOCKET_PATH
HERDR_PANE_ID
```

For stronger isolation, clear all Herdr-managed variables before launching the child. For example, the command assembled by `subagent.ts` can use:

```bash
env -u HERDR_ENV \
    -u HERDR_SOCKET_PATH \
    -u HERDR_PANE_ID \
    -u HERDR_WORKSPACE_ID \
    -u HERDR_TAB_ID \
    -u HERDR_SESSION \
    ...
```

This keeps the child visible through tmux without making it claim the parent Herdr pane.

## 2. Replace tmux with Herdr panes

Using Herdr as the actual subagent session backend is not a drop-in change. Herdr's plugin system is separate from Pi's in-process `ExtensionAPI`; a Pi TypeScript extension cannot simply be loaded as a Herdr plugin.

Keep the Pi extension responsible for:

- registering the `subagent` tool;
- validating parameters;
- resolving the provider, model, thinking level, and working directory;
- serializing calls;
- rendering progress and results;
- writing and reading the child result file.

Replace the tmux-specific session-management code with a Herdr backend.

### Backend mapping

| Current tmux behavior | Herdr equivalent |
|---|---|
| `tmux new-session` | `pane.split` |
| `tmux send-keys` | `pane.send-text` / `pane.send-input` |
| `capture-pane` | `pane.read` |
| `pane_dead` polling | Result-file polling plus `pane.process_info` or agent state |
| `kill-session` | `pane.close` |
| tmux session/target | Herdr `pane_id` |
| `pi --attach-subagent` | `herdr agent attach <pane-id>` |

### Herdr-specific requirements

The Herdr backend should:

1. Detect that it is running in Herdr using `HERDR_ENV=1`.
2. Obtain the parent pane from `HERDR_PANE_ID`.
3. Use `HERDR_SOCKET_PATH` for Herdr API communication.
4. Create a child pane with `pane.split`, targeting the parent pane.
5. Pass the child working directory and environment when creating the pane.
6. Launch the child Pi with its own:
   - session directory;
   - session ID;
   - result-file path;
   - provider/model/thinking arguments;
   - child-reporter environment variables.
7. Read progress using `pane.read`, preferably the `recent-unwrapped` source for logs.
8. Treat the atomic result file as the authoritative completion signal.
9. Use `pane.process_info` or Herdr agent state as a secondary failure/exit signal.
10. Close the pane with `pane.close` when cleanup is requested, or preserve it for inspection.
11. Store and display the Herdr `pane_id` rather than a tmux session name.
12. Display an attach command such as:

```bash
herdr agent attach <pane-id>
```

### CLI versus socket API

Herdr recommends its CLI wrappers for simple scripts and human debugging:

```bash
herdr pane split <pane-id> --direction right --cwd <cwd>
herdr pane read <pane-id> --source recent-unwrapped --lines 50
herdr pane process-info --pane <pane-id>
herdr pane close <pane-id>
```

For a long-running Pi extension, the local socket API is usually more reliable because it provides structured request/response data without shell quoting and text parsing.

Herdr uses newline-delimited JSON over a local Unix socket on Unix systems. The socket path is supplied by:

```text
HERDR_SOCKET_PATH
```

Relevant API methods include:

```text
pane.split
pane.read
pane.process_info
pane.send_text
pane.send_input
pane.close
pane.wait_for_output
pane.report_agent
pane.report_agent_session
```

Herdr injects these variables into managed pane processes:

```text
HERDR_SOCKET_PATH
HERDR_ENV=1
HERDR_WORKSPACE_ID
HERDR_TAB_ID
HERDR_PANE_ID
```

The child Pi should retain those variables if it is intentionally being managed as a Herdr agent pane. In that case, install the Herdr Pi integration and let the child report its own lifecycle and session identity. Do not clear the variables in this mode.

## Session and lifecycle considerations

The current extension writes a child result file and calls `ctx.shutdown()` when the child settles. That model works with Herdr as well.

However, the Herdr backend must distinguish between:

- the Pi process finishing while the pane's shell remains alive;
- the pane itself being closed;
- the Herdr server restarting;
- the parent Pi session shutting down;
- a child Pi failing before it writes a result.

A Herdr pane may remain present after the child Pi exits, so pane existence alone is not an equivalent of tmux's `pane_dead` check. Use the result file first, and use process information or agent state to detect abnormal exits.

If child runs must survive a parent Pi restart, the extension also needs persistent run metadata. The current in-memory values such as `activeSession` and `queueTail` are not enough to reconnect to existing Herdr panes after a restart.

For restart recovery, persist at least:

- child run ID;
- parent session ID;
- Herdr workspace/tab/pane ID;
- child session file;
- result-file path;
- start time;
- current status;
- provider/model/thinking settings.

Herdr may assign a new public pane ID when a pane moves across workspaces, so recovery should refresh pane identity through the Herdr API rather than assuming the old ID is permanent.

## Recommended implementation order

1. Install the official Pi integration:

   ```bash
   herdr integration install pi
   ```

2. Make the existing tmux implementation safe by clearing inherited Herdr variables in child mode.
3. Verify that the subagent tool works when Pi runs inside Herdr.
4. Extract terminal operations behind a small backend interface.
5. Keep the existing tmux backend as the default fallback.
6. Add a Herdr backend selected when `HERDR_ENV=1` and `HERDR_PANE_ID` are present.
7. Prefer the Herdr socket API for pane creation, reading, process inspection, and cleanup.
8. Add Herdr-aware attach/capture/cleanup commands to the tool result and renderer.
9. Add persistence and recovery only if child panes must survive parent-session restarts.

## Official references

- Herdr integrations: https://herdr.dev/docs/integrations/
- Herdr socket API: https://herdr.dev/docs/socket-api/
- Herdr CLI reference: https://herdr.dev/docs/cli-reference/
