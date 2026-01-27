# Wireframe Chrome DevTools MCP (Noctivagous)

## What It Is

A custom set of tools for Chrome DevTools MCP to allow

- Debugging layouts (like overlaps and errors).  

  Normally it doesn't work to debug layouts with Chrome DevTools MCP
  because the snapshot tool returns raster information rather
  than vector and computed styling data.

  This is made possible by svg_snapshot and wireframe_snapshot,
  giving the AI structured layout information that it can process, 
  returning responses overlap analysis so it can fix errors.


- Making live edits that add layouts and styling.

  Since you can now debug layouts, why not add some
  tools to make them?  That's what is also provided.

  There are several tools like layout_live_editing,
  insert_js, insert_css, and manipulate_dom, that
  are part of this workflow.



## How to Use

After installing the MCP server, open up an agentic IDE like Cursor/Windsurf.

1. Type "begin live editing" with or without a file URL. If you do it without a file URL, you will be editing `about:blank` from scratch.
2. Ask for what you want. ("Build me an online storefront").

After the page is built, you can refine the page by either

1. Asking for changes in the AI agent chat.
2. Add notes to various elements with the element picker describing what you want. Then say "update from changes" and it will pull your notes from the page and implement them. This lets you isolate specific elements to change without having to describe them and do multiple on the page in one run.


`wireframe-chrome-devtools-mcp` is a forked branch of Google's `chrome-devtools-mcp` that lets your coding agent (such as Gemini, Claude, Cursor or Copilot) control and inspect a live Chrome browser. It acts as a Model-Context-Protocol
(MCP) server, giving your AI coding assistant access to the full power of Chrome DevTools for reliable automation, in-depth debugging, and performance analysis.

## Beginning Forked Branch Focus: Wireframe Debugging Tools

First, this branch specializes in layout debugging capabilities through dedicated wireframe tools. Unlike traditional raster image screenshots, which require complex image processing to detect overlaps, gaps, and layout issues, the included wireframe tools provide structural analysis directly from the browser's rendering engine.


### Key Wireframe Features

- **`wireframe_snapshot`**: Captures compact, deterministic wireframe data for overlap/gap analysis
- **`svg_snapshot`**: Generates visual SVG wireframes with layout debugging overlays

- **Example prompt:**
  - “Use `svg_snapshot` and `wireframe_snapshot` for the main content area and fix what’s overlapping or overflowing.”


These tools excel at detecting layout problems that are difficult to identify through image processing of regular screenshots.


The Noctivagous Wireframe branch


## Tool Management Web UI (wireframe-chrome-devtools-mcp)

**This MCP server automatically starts a web server when launched** to manage which tools are enabled or disabled. The web UI is available at:

**http://localhost:7332** (or **http://127.0.0.1:7332**)

This system is designed with many classes of tools that can be manually turned on or off by the user. The web UI provides an interface for managing tool availability:

- **No server restart required**: When you enable or disable tools in the web UI, the changes are immediately communicated to your MCP client via the `tools/list_changed` notification. Your MCP client will automatically refresh its tool registry without needing to restart the MCP server.

- **Persistent configuration**: Tool toggle settings are saved to `.chrome-devtools-mcp-tools.json` in the project root and tracked in git, so they serve as the default toolset for the project.

- **Grouped by category**: Tools are organized into logical groups with descriptions.

You can disable the web UI by running the server with `--no-web-ui`, but by default it starts automatically to give you full control over which tools are available to your AI assistant.

## Live Editing Workflow (Experimental)

Use the live-editing tools to annotate and iterate inside the browser before committing changes to files.

- **Start (minimal)**: `live_editing_session` with `begin` opens a URL, injects the overlay, and returns a structured payload.
- **Start (full toolset)**: `begin_live_editing_session` does the same, but is intended for the non-minimal workflow groups.
- **Annotate**: right-click to enter picker mode, add notes/move links, and use the notes panel for page-wide notes.
- **Update**: when the user says “update from my changes”, call `update_from_user_changes`.

### Live Editing Response Contract

Live editing tools return a structured JSON payload:

```json
{
  "kind": "live_editing_session|live_editing_update|live_editing_snapshot",
  "version": 1,
  "data": {},
  "artifacts": [],
  "instructions": {},
  "next_tool_calls": [],
  "batch_ops_plan": {}
}
```

Notes:

- **`artifacts`** contain large payloads (snapshots, guidance, SVG) to avoid context bloat.
- **`batch_ops_plan`** is optional and may include suggested operations (e.g., move links, layout hints).
- `update_from_user_changes` clears annotations and page notes after returning them.




### Goals of The Branch Beyond Wireframe Features

Beyond wireframe-only analysis, the long-term goal is provide a **progressive “debugging → editing → refactoring” spectrum** that keeps the feedback loop fast (see changes instantly in Chromium), allowing you to choose which functions and overall process you need. You may want to just use a few tools to fix a problem, or refactor an entire codebase in the browser. The project should allow you to “graduate” changes back into the codebase as clean diffs when you’re ready.

- **Level A — Live edits + targeted commits**: Record the exact sequence of live edits into an edit session, then preview and apply small, reviewable patches back to specific files when you explicitly opt in. Edit sessions are safe by default and do not write repo files unless you explicitly commit/apply a plan.
- **Level B — Deep refactors (multi-file, clean diffs)**: Opt-in refactor mode where you can iterate/verify in-browser and then generate/apply a structured, conflict-aware refactor plan across many files.

#### Level B workflow (draft)

Level B is an opt-in, scoped refactor mode intended for multi-file changes. The core idea is: iterate/verify in Chromium, then generate clean diffs and apply them explicitly.

Proposed flow:

1. **Opt in + define scope**: start a refactor session and declare the file/folder scope and safety guardrails.
2. **Iterate live**: apply changes in-browser (CSS/JS/DOM/tools), keeping a fast feedback loop.
3. **Validate**: run checks (typecheck/build/tests where possible) to confirm behavior.
4. **Generate a refactor plan**: produce structured, conflict-aware diffs across affected files.
5. **Review the plan**: inspect a preview of the diffs/patches before any write occurs.
6. **Apply explicitly**: write changes to disk only when the user approves.
7. **Rollback path**: require a clear revert strategy (git-based recommended).

This section is intentionally aspirational; tooling will be added incrementally to make each step concrete.

This is aimed at reducing the friction of “edit files → reload → re-check layout/behavior” by enabling rapid in-browser iteration first, then turning the final, validated changes into minimal, reviewable filesystem diffs.

### Contract: edit sessions are live-in-browser, and do not write repo files unless you explicitly commit

The **default expectation** for this branch is:

- **Visible by default**: if you start an edit session and use preview tools, you should see changes applied live in Chromium (unless you explicitly enable headless mode).
- **No repo/source edits unless you say so**: `live_editing_session` (begin/edit) and `begin_edit_session` + `recordToSession` tools **do not modify repo files**. They only:
  - apply temporary changes in the browser, and/or
  - record what happened into an in-memory edit session, and/or
- write optional artifacts (snapshots/wireframes/screenshots) to temp/user paths.
- **Only explicit tools write repo/source files**:
  - `apply_commit_plan` / `commit_edit_session_to_files` (write to specified target paths)
  - `live_editing_session` with `commit_edit_session_to_files: {...}` (write to specified target paths)
  - `apply_unified_diff` (patches files)

If you want the agent to keep iterating in-browser, say: **“keep it live; don’t write files yet.”**
If you want to land changes, say: **“commit/apply this to files”** (and ideally specify the target path or ask for a plan/diff first).

### Tool toggles web UI (turn tools on/off, persisted to JSON)

If you have too many tools exposed at once, you can run a small local web UI to enable/disable tools and persist the selection on disk:

- Docs: `docs/tool-toggles-ui.md`

#### Headless edit sessions (supported when explicitly enabled)

You can run the same edit-session workflows **without a visible browser window** by enabling headless mode (`--headless=true`). This preserves the “fast loop” semantics, but the feedback loop becomes **artifacts/logs** instead of what you watch on screen.

Headless edit sessions are especially useful for:

- **CI / remote servers**: run workflows on a machine with no display, record an edit session, export it, and review/apply later.
- **Batch experiments**: sweep many variants (CSS values, layout tweaks, toggles) across pages/breakpoints and save wireframes/snapshots as the comparison surface.
- **Regression checking**: apply patches, capture before/after wireframes + snapshots, rollback, repeat—without manual viewing.
- **Performance / timing-sensitive runs**: reduce UI overhead/noise while collecting traces, wireframes, or DOM snapshots.
- **Repro artifacts for humans**: generate a shareable export (`export_edit_session`) so someone else can review changes without an interactive session.
- **Security/permissions constraints**: environments where showing a browser window is undesirable, but controlled automation and artifacts are acceptable.


From one perspective, the web browser is a JIT code execution environment carrying a very large
set of components and APIs that the JIT JavaScript code can access. It's just 
that people are all writing code for this JIT environment outside of it, 
saving changes to disk before loading and reloading them in the web browser.  
The world is not harnessing the JIT conditions available for the software development phase
by using the web browser as the place where software is assembled.
The software development and code generation can take place inside the JIT environment,
especially with AI, as long as there is a bridge back to the file system
or AI code editor that stores the files.  

To accommodate existing processes, the MCP server tools will not just become a place for live
editing and software development inside the browser before the products
of that effort are committed and saved to disk.  The wireframe-chromedevtools
MCP server can serve the needs of present-day, conventional work that begins on
the file system, allowing users to utilize individual mcp tools like wireframe_snapshot
and svg_snapshot that can fix layout issues in a web page, previewing them live before
applying the fixes.  Going up a level is watching the AI construct a page, 
gui components, and and write sections of the app while the software developer is
also working in the code editor. The level above this is a future live chat
window placed inside the browser produced by the mcp server and allows 
the user to make changes inside web the page by chatting there.  Eventually,
going along with this will be the ability of the AI to seek out
resources, like images and fonts, which means it will make 
software development happen inside the web browser window, front-end and back-end.
that adds external libraries on the fly.  Then when the user approves
of the current session, all changes can be committed from what is 
shown in the web browser to the filesystem and the chat session
ended.

The friction to using AI for making software is very high because 
the code and the page markup is being written to disk before 
being executed and there is a sluggish loop.  The process is 
speeding you up during code generation of the files, 
while being slow at executing the results.  You need to
be able to see results as fast as the AI is generating
them for the conditions of using this technology to line up
with what it is.


### Additional Debugging Tools

This branch includes several advanced debugging and development tools not present in the base `chrome-devtools-mcp`:

#### **Edit Session Management** (11 tools)
Interactive workflow tools for buffering live browser edits during experimentation, with optional filesystem commit:

- **Example prompts:**
  - “Live-edit this page: add a small UI control panel (toggle + slider) that changes the layout live, record the final version to an edit session, then roll the chosen CSS/JS into files via `commit_edit_session_to_files`.”

- Typical usage is: `begin_edit_session` → run one or more tools with `recordToSession: true` → review via `get_edit_session` → finish by exporting (`export_edit_session`), or generate a plan (`preview_commit_plan` → `apply_commit_plan`) or commit (`commit_edit_session_to_files`) the selected snippets, then `clear_edit_session` when done. This keeps iteration fast in Chromium and makes "write to disk" an explicit end-of-session step.

- **`begin_edit_session`**: Start a new edit session to buffer CSS/JS changes during iteration
- **`list_edit_sessions`** / **`get_edit_session`**: View active or specific edit sessions
- **`set_active_edit_session`**: Switch between multiple concurrent edit sessions
- **`export_edit_session`**: Export session changes to JSON for later review
- **`commit_edit_session_to_files`**: Commit recorded changes directly to local CSS/JS files
- **`clear_edit_session`**: Clean up completed edit sessions

#### **DOM Manipulation** (6 tools)
Live CSS and JavaScript injection with rollback capabilities:

- **Example prompts:**
  - “Preview three `gap` values for this grid and show me wireframes for each (A/B test).”
  - “Inject temporary CSS to outline all clickable elements, then roll it back.”
  - “Insert a small script to label every `article` with its index so I can debug ordering.”
  - “Fix this specific overlap: the header is covering the first card. Identify the overlapping elements, preview 2–3 candidate fixes (padding-top vs sticky offset vs z-index), and keep the best one.”
  - “Prototype a ‘Settings’ button and a floating panel UI directly on this page (DOM + CSS + minimal JS), then export/commit the result when it looks right.”

- These tools are best used as a safe “what if?” loop: preview a change, optionally capture snapshots (`svg_snapshot` / `wireframe_snapshot`), and either roll it back immediately (default for preview tools) or keep it applied and later `rollback_patch`/`rollback_all`. Example uses include A/B testing spacing/typography values, temporarily adding debug outlines, or injecting a small script to annotate the DOM.

- **`insert_css`** / **`insert_js`**: Inject CSS or JavaScript with patch tracking for easy rollback
- **`insert_css_preview`** / **`insert_js_preview`**: Test multiple CSS/JS variants with automatic visual feedback and rollback
- **`manipulate_dom`**: Perform DOM operations (styles, classes, HTML insertion/removal) with batch support
- **`rollback_patch`** / **`rollback_all`**: Selective or complete rollback of injected changes

#### **State Inspection** (2 tools)
Advanced inspection of browser state and application internals:

- **Example prompts:**
  - “Inspect `localStorage` for auth/session keys and show me anything token-like.”
  - “Inspect React component props/state for the feed container and tell me what drives its rendering.”
  - “Find suspicious globals on `window` (debug flags, feature toggles) and report their values.”

- A common workflow is: use `inspect_state` to find the relevant state (e.g. a token in `localStorage`, a suspicious global, or React props/state on a component), then use `evaluate_script` / `analyze_js` to validate hypotheses and narrow down where a bug or performance issue is coming from.

- **`inspect_state`**: Examine browser storage, global variables, and framework component state (React, Vue, Angular, Svelte)
- **`analyze_js`**: Static analysis of JavaScript code with performance and security insights

These additional tools enable powerful interactive debugging workflows, allowing you to experiment with CSS/JS changes in the live browser while maintaining full control over when and how changes are committed to your codebase.



## [Tool reference](./docs/tool-reference.md) | [Changelog](./CHANGELOG.md) | [Contributing](./CONTRIBUTING.md) | [Troubleshooting](./docs/troubleshooting.md) | [Design Principles](./docs/design-principles.md)

## Key features

- **Get performance insights**: Uses [Chrome
  DevTools](https://github.com/ChromeDevTools/devtools-frontend) to record
  traces and extract actionable performance insights.
- **Advanced browser debugging**: Analyze network requests, take screenshots and
  check the browser console.
- **Reliable automation**. Uses
  [puppeteer](https://github.com/puppeteer/puppeteer) to automate actions in
  Chrome and automatically wait for action results.
- **Workflow guidance**: Exposes project documentation as MCP Resources and reusable workflow templates as Prompts, enabling agents to discover and follow structured workflows automatically.

## Disclaimers

`chrome-devtools-mcp` exposes content of the browser instance to the MCP clients
allowing them to inspect, debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you don't want to share with
MCP clients.

## Requirements

- [Node.js](https://nodejs.org/) v20.19 or a newer [latest maintenance LTS](https://github.com/nodejs/Release#release-schedule) version.
- [Chrome](https://www.google.com/chrome/) current stable version or newer.
- [npm](https://www.npmjs.com/).

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

> [!NOTE]  
> Using `chrome-devtools-mcp@latest` ensures that your MCP client will always use the latest version of the Chrome DevTools MCP server.

### MCP Client configuration

<details>
  <summary>Amp</summary>
  Follow https://ampcode.com/manual#mcp and use the config provided above. You can also install the Chrome DevTools MCP server using the CLI:

```bash
amp mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Antigravity</summary>

To use the Chrome DevTools MCP server follow the instructions from <a href="https://antigravity.google/docs/mcp">Antigravity's docs<a/> to install a custom MCP server. Add the following config to the MCP servers config:

```bash
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222",
        "-y"
      ]
    }
  }
}
```

This will make the Chrome DevTools MCP server automatically connect to the browser that Antigravity is using. If you are not using port 9222, make sure to adjust accordingly.

Chrome DevTools MCP will not start the browser instance automatically using this approach as as the Chrome DevTools MCP server runs in Antigravity's built-in browser. If the browser is not already running, you have to start it first by clicking the Chrome icon at the top right corner.

</details>

<details>
  <summary>Claude Code</summary>
    Use the Claude Code CLI to add the Chrome DevTools MCP server (<a href="https://code.claude.com/docs/en/mcp">guide</a>):

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Cline</summary>
  Follow https://docs.cline.bot/mcp/configuring-mcp-servers and use the config provided above.
</details>

<details>
  <summary>Codex</summary>
  Follow the <a href="https://github.com/openai/codex/blob/main/docs/advanced.md#model-context-protocol-mcp">configure MCP guide</a>
  using the standard config from above. You can also install the Chrome DevTools MCP server using the Codex CLI:

```bash
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

**On Windows 11**

Configure the Chrome install location and increase the startup timeout by updating `.codex/config.toml` and adding the following `env` and `startup_timeout_ms` parameters:

```
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
    "/c",
    "npx",
    "-y",
    "chrome-devtools-mcp@latest",
]
env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
startup_timeout_ms = 20_000
```

</details>

<details>
  <summary>Copilot CLI</summary>

Start Copilot CLI:

```
copilot
```

Start the dialog to add a new MCP server by running:

```
/mcp add
```

Configure the following fields and press `CTRL+S` to save the configuration:

- **Server name:** `chrome-devtools`
- **Server Type:** `[1] Local`
- **Command:** `npx -y chrome-devtools-mcp@latest`

</details>

<details>
  <summary>Copilot / VS Code</summary>

**Click the button to install:**

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://vscode.dev/redirect/mcp/install?name=io.github.ChromeDevTools%2Fchrome-devtools-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22chrome-devtools-mcp%22%5D%2C%22env%22%3A%7B%7D%7D)

[<img src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5" alt="Install in VS Code Insiders">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522io.github.ChromeDevTools%252Fchrome-devtools-mcp%2522%252C%2522config%2522%253A%257B%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522chrome-devtools-mcp%2522%255D%252C%2522env%2522%253A%257B%257D%257D%257D)

**Or install manually:**

Follow the MCP install <a href="https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server">guide</a>,
with the standard config from above. You can also install the Chrome DevTools MCP server using the VS Code CLI:

```bash
code --add-mcp '{"name":"io.github.ChromeDevTools/chrome-devtools-mcp","command":"npx","args":["-y","chrome-devtools-mcp"],"env":{}}'
```

</details>

<details>
  <summary>Cursor</summary>

**Click the button to install:**

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=chrome-devtools&config=eyJjb21tYW5kIjoibnB4IC15IGNocm9tZS1kZXZ0b29scy1tY3BAbGF0ZXN0In0%3D)

**Or install manually:**

Go to `Cursor Settings` -> `MCP` -> `New MCP Server`. Use the config provided above.

</details>

<details>
  <summary>Factory CLI</summary>
Use the Factory CLI to add the Chrome DevTools MCP server (<a href="https://docs.factory.ai/cli/configuration/mcp">guide</a>):

```bash
droid mcp add chrome-devtools "npx -y chrome-devtools-mcp@latest"
```

</details>

<details>
  <summary>Gemini CLI</summary>
Install the Chrome DevTools MCP server using the Gemini CLI.

**Project wide:**

```bash
gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

**Globally:**

```bash
gemini mcp add -s user chrome-devtools npx chrome-devtools-mcp@latest
```

Alternatively, follow the <a href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Gemini Code Assist</summary>
  Follow the <a href="https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers">configure MCP guide</a>
  using the standard config from above.
</details>

<details>
  <summary>JetBrains AI Assistant & Junie</summary>

Go to `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` -> `Add`. Use the config provided above.
The same way chrome-devtools-mcp can be configured for JetBrains Junie in `Settings | Tools | Junie | MCP Settings` -> `Add`. Use the config provided above.

</details>

<details>
  <summary>Kiro</summary>

In **Kiro Settings**, go to `Configure MCP` > `Open Workspace or User MCP Config` > Use the configuration snippet provided above.

Or, from the IDE **Activity Bar** > `Kiro` > `MCP Servers` > `Click Open MCP Config`. Use the configuration snippet provided above.

</details>

<details>
  <summary>OpenCode</summary>

Add the following configuration to your `opencode.json` file. If you don't have one, create it at `~/.config/opencode/opencode.json` (<a href="https://opencode.ai/docs/mcp-servers">guide</a>):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

</details>

<details>
  <summary>Qoder</summary>

In **Qoder Settings**, go to `MCP Server` > `+ Add` > Use the configuration snippet provided above.

Alternatively, follow the <a href="https://docs.qoder.com/user-guide/chat/model-context-protocol">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Qoder CLI</summary>

Install the Chrome DevTools MCP server using the Qoder CLI (<a href="https://docs.qoder.com/cli/using-cli#mcp-servsers">guide</a>):

**Project wide:**

```bash
qodercli mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

**Globally:**

```bash
qodercli mcp add -s user chrome-devtools -- npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Visual Studio</summary>
  
  **Click the button to install:**
  
  [<img src="https://img.shields.io/badge/Visual_Studio-Install-C16FDE?logo=visualstudio&logoColor=white" alt="Install in Visual Studio">](https://vs-open.link/mcp-install?%7B%22name%22%3A%22chrome-devtools%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22chrome-devtools-mcp%40latest%22%5D%7D)
</details>

<details>
  <summary>Warp</summary>

Go to `Settings | AI | Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the config provided above.

</details>

<details>
  <summary>Windsurf</summary>
  Follow the <a href="https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json">configure MCP guide</a>
  using the standard config from above.
</details>

### Your first prompt

Enter the following prompt in your MCP Client to check if everything is working:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should open the browser and record a performance trace.

> [!NOTE]  
> The MCP server will start the browser automatically once the MCP client uses a tool that requires a running browser instance. Connecting to the Chrome DevTools MCP server on its own will not automatically start the browser.

## Tools

If you run into any issues, checkout our [troubleshooting guide](./docs/troubleshooting.md).

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Input automation** (9 tools)
  - [`click`](docs/tool-reference.md#click)
  - [`drag`](docs/tool-reference.md#drag)
  - [`fill`](docs/tool-reference.md#fill)
  - [`fill_form`](docs/tool-reference.md#fill_form)
  - [`handle_dialog`](docs/tool-reference.md#handle_dialog)
  - [`hover`](docs/tool-reference.md#hover)
  - [`press_key`](docs/tool-reference.md#press_key)
  - [`simulate_event`](docs/tool-reference.md#simulate_event)
  - [`upload_file`](docs/tool-reference.md#upload_file)
- **Navigation automation** (6 tools)
  - [`close_page`](docs/tool-reference.md#close_page)
  - [`list_pages`](docs/tool-reference.md#list_pages)
  - [`navigate_page`](docs/tool-reference.md#navigate_page)
  - [`new_page`](docs/tool-reference.md#new_page)
  - [`select_page`](docs/tool-reference.md#select_page)
  - [`wait_for`](docs/tool-reference.md#wait_for)
- **Emulation** (2 tools)
  - [`emulate`](docs/tool-reference.md#emulate)
  - [`resize_page`](docs/tool-reference.md#resize_page)
- **Performance** (5 tools)
  - [`analyze_js`](docs/tool-reference.md#analyze_js)
  - [`monitor_performance`](docs/tool-reference.md#monitor_performance)
  - [`performance_analyze_insight`](docs/tool-reference.md#performance_analyze_insight)
  - [`performance_start_trace`](docs/tool-reference.md#performance_start_trace)
  - [`performance_stop_trace`](docs/tool-reference.md#performance_stop_trace)
- **Network** (2 tools)
  - [`get_network_request`](docs/tool-reference.md#get_network_request)
  - [`list_network_requests`](docs/tool-reference.md#list_network_requests)
- **Snapshot** (4 tools)
  - [`svg_snapshot`](docs/tool-reference.md#svg_snapshot)
  - [`take_screenshot`](docs/tool-reference.md#take_screenshot)
  - [`take_snapshot`](docs/tool-reference.md#take_snapshot)
  - [`wireframe_snapshot`](docs/tool-reference.md#wireframe_snapshot)
- **Edit Session** (11 tools)
  - [`apply_commit_plan`](docs/tool-reference.md#apply_commit_plan)
  - [`begin_edit_session`](docs/tool-reference.md#begin_edit_session)
  - [`clear_edit_session`](docs/tool-reference.md#clear_edit_session)
  - [`commit_edit_session_to_files`](docs/tool-reference.md#commit_edit_session_to_files)
  - [`export_edit_session`](docs/tool-reference.md#export_edit_session)
  - [`get_edit_session`](docs/tool-reference.md#get_edit_session)
  - [`list_edit_sessions`](docs/tool-reference.md#list_edit_sessions)
  - [`preview_commit_plan`](docs/tool-reference.md#preview_commit_plan)
  - [`set_active_edit_session`](docs/tool-reference.md#set_active_edit_session)
- **Patch** (2 tools)
  - [`rollback_all`](docs/tool-reference.md#rollback_all)
  - [`rollback_patch`](docs/tool-reference.md#rollback_patch)
- **Chatbox** (2 tools)
  - [`chatbox_step`](docs/tool-reference.md#chatbox_step)
  - [`inject_chatbox`](docs/tool-reference.md#inject_chatbox)
- **Debugging** (14 tools)
  - [`apply_unified_diff`](docs/tool-reference.md#apply_unified_diff)
  - [`batch_ops`](docs/tool-reference.md#batch_ops)
  - [`evaluate_script`](docs/tool-reference.md#evaluate_script)
  - [`export_prototype_state`](docs/tool-reference.md#export_prototype_state)
  - [`get_console_message`](docs/tool-reference.md#get_console_message)
  - [`insert_css`](docs/tool-reference.md#insert_css)
  - [`insert_css_preview`](docs/tool-reference.md#insert_css_preview)
  - [`insert_js`](docs/tool-reference.md#insert_js)
  - [`insert_js_preview`](docs/tool-reference.md#insert_js_preview)
  - [`inspect_state`](docs/tool-reference.md#inspect_state)
  - [`js_console`](docs/tool-reference.md#js_console)
  - [`list_console_messages`](docs/tool-reference.md#list_console_messages)
  - [`manipulate_dom`](docs/tool-reference.md#manipulate_dom)
  - [`preview_diff_from_commit_plan`](docs/tool-reference.md#preview_diff_from_commit_plan)

<!-- END AUTO GENERATED TOOLS -->

## Resources

In addition to tools, this MCP server exposes **Resources** (read-only project documentation) that agents can discover and read for workflow guidance:

- **`project://repo/README.md`** - Project overview, tool inventory, configuration, and concepts
- **`project://repo/USAGE_GUIDE.md`** - Detailed usage guide with workflow examples and best practices
- **`project://repo/docs/tool-reference.md`** - Complete reference for all available tools
- **`project://repo/docs/tool-toggles-ui.md`** - Documentation for the tool management web UI
- **`project://repo/reports/software-guidance-report.md`** - Guidance on design/architecture/engineering constraints

Agents can discover available resources via `resources/list` and read specific documentation via `resources/read` with the resource URI. This enables agents to proactively consult project documentation when needed, rather than relying solely on tool descriptions.

**Example:**
```
"List available resources" → agent discovers project://repo/USAGE_GUIDE.md
"Read the usage guide" → agent reads USAGE_GUIDE.md to understand live edit session workflows
```

## Prompts

The server also provides **Prompts** (reusable workflow templates) aligned with common workflows described in `USAGE_GUIDE.md`:

- **`workflow_live_edit_session`** - Template for starting a live editing session, making changes with `recordToSession: true`, and committing when ready
- **`workflow_debug_layout_then_fix`** - Template for using wireframe tools to identify layout issues, then applying fixes
- **`workflow_export_session_package`** - Template for exporting an edit session as a shareable package
- **`workflow_build_prototype_from_scratch`** - Template for building complete prototypes from blank pages using live editing
- **`workflow_chatbox_iteration`** - Template for using in-browser chatbox for rapid iteration with instant feedback

Agents can discover available prompts via `prompts/list` and retrieve structured prompt templates via `prompts/get`. These prompts provide structured guidance that helps ensure consistent workflow execution.

**Example:**
```
"List available prompts" → agent discovers workflow_live_edit_session
"Get the live edit session prompt" → agent receives structured instructions for the workflow
```

## Configuration

The Chrome DevTools MCP server supports the following configuration option:

<!-- BEGIN AUTO GENERATED OPTIONS -->

- **`--autoConnect`/ `--auto-connect`**
  If specified, automatically connects to a browser (Chrome 144+) running in the user data directory identified by the channel param. Requires the remoted debugging server to be started in the Chrome instance via chrome://inspect/#remote-debugging.
  - **Type:** boolean
  - **Default:** `false`

- **`--browserUrl`/ `--browser-url`, `-u`**
  Connect to a running, debuggable Chrome instance (e.g. `http://127.0.0.1:9222`). For more details see: https://github.com/ChromeDevTools/chrome-devtools-mcp#connecting-to-a-running-chrome-instance.
  - **Type:** string

- **`--wsEndpoint`/ `--ws-endpoint`, `-w`**
  WebSocket endpoint to connect to a running Chrome instance (e.g., ws://127.0.0.1:9222/devtools/browser/<id>). Alternative to --browserUrl.
  - **Type:** string

- **`--wsHeaders`/ `--ws-headers`**
  Custom headers for WebSocket connection in JSON format (e.g., '{"Authorization":"Bearer token"}'). Only works with --wsEndpoint.
  - **Type:** string

- **`--headless`**
  Whether to run in headless (no UI) mode.
  - **Type:** boolean
  - **Default:** `false`

- **`--executablePath`/ `--executable-path`, `-e`**
  Path to custom Chrome executable.
  - **Type:** string

- **`--isolated`**
  If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to false.
  - **Type:** boolean

- **`--userDataDir`/ `--user-data-dir`**
  Path to the user data directory for Chrome. Default is $HOME/.cache/chrome-devtools-mcp/chrome-profile$CHANNEL_SUFFIX_IF_NON_STABLE
  - **Type:** string

- **`--channel`**
  Specify a different Chrome channel that should be used. The default is the stable channel version.
  - **Type:** string
  - **Choices:** `stable`, `canary`, `beta`, `dev`

- **`--logFile`/ `--log-file`**
  Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.
  - **Type:** string

- **`--viewport`**
  Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.
  - **Type:** string

- **`--proxyServer`/ `--proxy-server`**
  Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.
  - **Type:** string

- **`--acceptInsecureCerts`/ `--accept-insecure-certs`**
  If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.
  - **Type:** boolean

- **`--chromeArg`/ `--chrome-arg`**
  Additional arguments for Chrome. Only applies when Chrome is launched by chrome-devtools-mcp.
  - **Type:** array

- **`--ignoreDefaultChromeArg`/ `--ignore-default-chrome-arg`**
  Explicitly disable default arguments for Chrome. Only applies when Chrome is launched by chrome-devtools-mcp.
  - **Type:** array

- **`--categoryEmulation`/ `--category-emulation`**
  Set to false to exclude tools related to emulation.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryPerformance`/ `--category-performance`**
  Set to false to exclude tools related to performance.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryNetwork`/ `--category-network`**
  Set to false to exclude tools related to network.
  - **Type:** boolean
  - **Default:** `true`

- **`--toolConfig`/ `--tool-config`**
  Path to a JSON file used to persist tool enable/disable settings (used by the tool toggles web UI). Defaults to .chrome-devtools-mcp-tools.json in the project root (where package.json is located).
  - **Type:** string

- **`--webUi`/ `--web-ui`**
  If true, start a local web UI for enabling/disabling tools (persisted to toolConfig). Disable with --no-web-ui.
  - **Type:** boolean
  - **Default:** `true`

- **`--webUiHost`/ `--web-ui-host`**
  Bind host for the tool toggles web UI (default: 127.0.0.1).
  - **Type:** string
  - **Default:** `127.0.0.1`

- **`--webUiPort`/ `--web-ui-port`**
  Port for the tool toggles web UI (default: 7332).
  - **Type:** number
  - **Default:** `7332`

<!-- END AUTO GENERATED OPTIONS -->

Pass them via the `args` property in the JSON configuration. For example:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--channel=canary",
        "--headless=true",
        "--isolated=true"
      ]
    }
  }
}
```

### Connecting via WebSocket with custom headers

You can connect directly to a Chrome WebSocket endpoint and include custom headers (e.g., for authentication):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--wsEndpoint=ws://127.0.0.1:9222/devtools/browser/<id>",
        "--wsHeaders={\"Authorization\":\"Bearer YOUR_TOKEN\"}"
      ]
    }
  }
}
```

To get the WebSocket endpoint from a running Chrome instance, visit `http://127.0.0.1:9222/json/version` and look for the `webSocketDebuggerUrl` field.

You can also run `npx chrome-devtools-mcp@latest --help` to see all available configuration options.

## Concepts

### User data directory

`chrome-devtools-mcp` starts a Chrome's stable channel instance using the following user
data directory:

- Linux / macOS: `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- Windows: `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

The user data directory is not cleared between runs and shared across
all instances of `chrome-devtools-mcp`. Set the `isolated` option to `true`
to use a temporary user data dir instead which will be cleared automatically after
the browser is closed.

### Connecting to a running Chrome instance

By default, the Chrome DevTools MCP server will start a new Chrome instance with a dedicated profile. This might not be ideal in all situations:

- If you would like to maintain the same application state when alternating between manual site testing and agent-driven testing.
- When the MCP needs to sign into a website. Some accounts may prevent sign-in when the browser is controlled via WebDriver (the default launch mechanism for the Chrome DevTools MCP server).
- If you're running your LLM inside a sandboxed environment, but you would like to connect to a Chrome instance that runs outside the sandbox.

In these cases, start Chrome first and let the Chrome DevTools MCP server connect to it. There are two ways to do so:

- **Automatic connection (available in Chrome 144)**: best for sharing state between manual and agent-driven testing.
- **Manual connection via remote debugging port**: best when running inside a sandboxed environment.

#### Automatically connecting to a running Chrome instance

**Step 1:** Set up remote debugging in Chrome

In Chrome (\>= M144), do the following to set up remote debugging:

1.  Navigate to `chrome://inspect/#remote-debugging` to enable remote debugging.
2.  Follow the dialog UI to allow or disallow incoming debugging connections.

**Step 2:** Configure Chrome DevTools MCP server to automatically connect to a running Chrome Instance

To connect the `chrome-devtools-mcp` server to the running Chrome instance, use
`--autoConnect` command line argument for the MCP server.

The following code snippet is an example configuration for gemini-cli:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect", "--channel=beta"]
    }
  }
}
```

Note: you have to specify `--channel=beta` until Chrome M144 has reached the
stable channel.

**Step 3:** Test your setup

Make sure your browser is running. Open gemini-cli and run the following prompt:

```none
Check the performance of https://developers.chrome.com
```

> [!NOTE]  
> The <code>autoConnect</code> option requires the user to start Chrome. If the user has multiple active profiles, the MCP server will connect to the default profile (as determined by Chrome). The MCP server has access to all open windows for the selected profile.

The Chrome DevTools MCP server will try to connect to your running Chrome
instance. It shows a dialog asking for user permission.

Clicking **Allow** results in the Chrome DevTools MCP server opening
[developers.chrome.com](http://developers.chrome.com) and taking a performance
trace.

#### Manual connection using port forwarding

You can connect to a running Chrome instance by using the `--browser-url` option. This is useful if you are running the MCP server in a sandboxed environment that does not allow starting a new Chrome instance.

Here is a step-by-step guide on how to connect to a running Chrome instance:

**Step 1: Configure the MCP client**

Add the `--browser-url` option to your MCP client configuration. The value of this option should be the URL of the running Chrome instance. `http://127.0.0.1:9222` is a common default.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

**Step 2: Start the Chrome browser**

> [!WARNING]  
> Enabling the remote debugging port opens up a debugging port on the running browser instance. Any application on your machine can connect to this port and control the browser. Make sure that you are not browsing any sensitive websites while the debugging port is open.

Start the Chrome browser with the remote debugging port enabled. Make sure to close any running Chrome instances before starting a new one with the debugging port enabled. The port number you choose must be the same as the one you specified in the `--browser-url` option in your MCP client configuration.

For security reasons, [Chrome requires you to use a non-default user data directory](https://developer.chrome.com/blog/remote-debugging-port) when enabling the remote debugging port. You can specify a custom directory using the `--user-data-dir` flag. This ensures that your regular browsing profile and data are not exposed to the debugging session.

**macOS**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Linux**

```bash
/usr/bin/google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Windows**

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-profile-stable"
```

**Step 3: Test your setup**

After configuring the MCP client and starting the Chrome browser, you can test your setup by running a simple prompt in your MCP client:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should connect to the running Chrome instance and receive a performance report.

If you hit VM-to-host port forwarding issues, see the “Remote debugging between virtual machine (VM) and host fails” section in [`docs/troubleshooting.md`](./docs/troubleshooting.md#remote-debugging-between-virtual-machine-vm-and-host-fails).

For more details on remote debugging, see the [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/remote-debugging/).

### Debugging Chrome on Android

Please consult [these instructions](./docs/debugging-android.md).

## Known limitations

### Operating system sandboxes

Some MCP clients allow sandboxing the MCP server using macOS Seatbelt or Linux
containers. If sandboxes are enabled, `chrome-devtools-mcp` is not able to start
Chrome that requires permissions to create its own sandboxes. As a workaround,
either disable sandboxing for `chrome-devtools-mcp` in your MCP client or use
`--browser-url` to connect to a Chrome instance that you start manually outside
of the MCP client sandbox.
