# Wireframe Branch MCP Tools

This document describes all branch tools (non-original tools) added in the wireframe-chrome-devtools-mcp branch. These tools extend the original chrome-devtools-mcp functionality with browser-first prototyping, live editing, wireframe analysis, and enhanced debugging capabilities.

## Analysis & Debugging Tools

### `analyze_js`

**When to use:** Analyze JavaScript code quality and detect errors on the current page. Supports various analysis types including code coverage, dependencies, errors, performance, and general issues.

**Use cases:**
- **Code coverage analysis**: Measure how much of your JavaScript code is actually executed during page interactions
- **Dependency analysis**: Understand what external scripts and inline scripts are loaded on the page
- **Error detection**: Find JavaScript errors and console issues
- **Performance analysis**: Analyze JavaScript performance metrics and execution times
- **Issue detection**: Identify console errors, unhandled promises, memory leaks, and deprecated API usage

**Differences from original tools:** This is a comprehensive JavaScript analysis tool that goes beyond simple console message inspection, providing structured analysis reports with coverage metrics, dependency graphs, and performance insights.

---

### `batch_ops`

**When to use:** Execute multiple tool operations in a single call to reduce round-trips. Supports sequential execution and returns structured results for observability.

**Use cases:**
- **Efficient workflows**: Chain multiple operations together (e.g., navigate → insert CSS → take snapshot) in one call
- **Atomic operations**: Execute related operations together with shared context
- **Error handling**: Control whether to stop on first error or continue executing remaining operations
- **Performance optimization**: Reduce latency by batching operations instead of making separate tool calls

**Differences from original tools:** The original tools require individual calls for each operation. This tool enables batching for better performance and workflow efficiency.

---

### `js_console`

**When to use:** Enhanced interactive JavaScript environment with persistent sessions, multi-line script support, and context isolation for advanced debugging and development.

**Use cases:**
- **Persistent debugging sessions**: Maintain variable state across multiple script executions
- **Isolated execution**: Run scripts in a clean environment without page variables (useful for testing)
- **Multi-line scripts**: Execute complex JavaScript code blocks that span multiple lines
- **Session management**: Use session IDs to maintain separate debugging contexts

**Differences from original tools:** The original `evaluate_script` tool executes single expressions. This tool provides a more console-like experience with session persistence and isolation options.

---

### `monitor_performance`

**When to use:** Real-time performance monitoring with metrics like FPS, memory usage, and DOM node count. Supports duration-based monitoring and trigger-based monitoring.

**Use cases:**
- **Real-time metrics**: Monitor FPS, memory usage, DOM node count, layout shifts, and network requests
- **Event-triggered monitoring**: Start monitoring when specific events occur (scroll, click, navigation, input)
- **Duration-based monitoring**: Monitor for a specific time period and get summary statistics
- **Custom performance marks**: Add custom marks around script execution for detailed performance analysis

**Differences from original tools:** The original performance tools focus on trace recording and analysis. This tool provides real-time monitoring with customizable metrics and event triggers.

---

## Prototype & Export Tools

### `export_prototype_state`

**When to use:** Export the current browser page state as standalone HTML/CSS/JS files. This captures the current DOM state plus any MCP-injected CSS/JS patches, creating a self-contained prototype.

**Use cases:**
- **Browser-first prototyping**: Export a working prototype after iterating in the browser
- **Sharing standalone prototypes**: Create a self-contained HTML file or split files (HTML/CSS/JS) that can run independently
- **Capturing snapshots**: Save the current state before making more changes
- **Creating demos**: Export a working example to share or deploy

**Differences from edit session tools:**
- `export_prototype_state`: Exports the entire page state as files (HTML + injected patches)
- `export_edit_session`: Exports the edit session metadata/log as JSON (for inspection/backup)
- `commit_edit_session_to_files`: Appends recorded CSS/JS snippets to existing source files

---

## Live Editing Tools

### `begin_live_editing_session`

**When to use:** Start a live editing session by opening a URL, activating an edit session, and returning a structured live-editing payload with suggested next steps.

**Use cases:**
- **Interactive prototyping**: Begin a session where you'll make live edits in the browser
- **User annotation workflows**: Enable users to annotate pages with notes and feedback
- **Iterative design**: Set up a workflow for making changes and capturing snapshots
- **Collaborative editing**: Start a session where multiple changes will be made before committing

**Differences from edit session tools:** This tool specifically sets up a live editing workflow with overlay injection, baseline snapshots, and structured guidance for the editing process.

---

### `update_from_user_changes`

**When to use:** Collect annotations and snapshots after the user makes changes, returning a structured live-editing payload with guidance and artifacts.

**Use cases:**
- **Annotation collection**: Gather user annotations and notes from the live editing overlay
- **Change detection**: Capture wireframe snapshots and detect layout changes
- **Workflow continuation**: Continue a live editing session after user modifications
- **Batch operation planning**: Generate batch operation plans based on user annotations (e.g., move elements, apply styles)

**Differences from original tools:** This tool is specifically designed for live editing workflows, collecting user annotations and generating actionable plans from them.

---

## Wireframe & Snapshot Tools

### `wireframe_snapshot`

**When to use:** Capture a compact, deterministic wireframe snapshot of the current page using CDP DOMSnapshot. Returns element rects (and optionally computed styles) suitable for overlap/gap analysis.

**Use cases:**
- **Layout analysis**: Programmatically analyze page layout and detect spacing issues
- **Overlap detection**: Find elements that overlap or have incorrect positioning
- **Component debugging**: Focus on specific components using selectors and scope filters
- **Change detection**: Compare snapshots before and after changes to see what moved

**Differences from original tools:** The original `take_snapshot` provides accessibility tree information. This tool focuses on layout/visual structure with precise element positions and computed styles.

---

### `svg_snapshot`

**When to use:** Render a visual SVG wireframe of the current page (or a subset of elements). Uses the same underlying snapshot as `wireframe_snapshot`, but returns the SVG content wrapped in JSON for better parseability.

**Use cases:**
- **Visual layout debugging**: See a visual representation of the page structure
- **Human-readable wireframes**: Generate wireframes that can be viewed in browsers or design tools
- **Before/after comparisons**: Visualize layout changes with highlighted differences
- **Documentation**: Create visual documentation of page layouts

**Differences from original tools:** This tool provides visual SVG output rather than just data, making it easier to understand layout at a glance.

---

### `wireframe_snapshot_live_editing`

**When to use:** Capture a compact wireframe snapshot optimized for live editing workflows. Returns a small summary inline and stores the full JSON snapshot as an artifact by default.

**Use cases:**
- **Live editing workflows**: Quick snapshots during interactive editing sessions
- **Artifact-based storage**: Store large snapshots as files rather than inline responses
- **Iterative comparison**: Capture snapshots at different stages of editing for comparison

**Differences from `wireframe_snapshot`:** This version is optimized for live editing workflows with artifact-based storage and summary-first responses.

---

### `svg_snapshot_live_editing`

**When to use:** Render an SVG wireframe optimized for live editing workflows. Stores the SVG as an artifact by default and returns only a summary inline.

**Use cases:**
- **Live editing visualization**: Quick visual feedback during editing sessions
- **Artifact-based storage**: Store large SVG files as artifacts
- **Workflow integration**: Seamlessly integrate with live editing session tools

**Differences from `svg_snapshot`:** This version is optimized for live editing workflows with artifact-based storage.

---

## Edit Session Tools

### `begin_edit_session`

**When to use:** Start (and optionally activate) an edit session used to buffer live-in-Chromium edits during an interactive workflow. This keeps the loop fast by applying changes in the Chromium instance and deferring filesystem writes until an explicit export/commit step.

**Use cases:**
- **Fast iteration**: Make multiple edits in the browser without writing files each time
- **Edit buffering**: Collect all changes and commit them together at the end
- **Session management**: Track and manage multiple editing sessions

**Important contract:** Starting an edit session does **not** write repo/source files. File writes only happen if you explicitly call commit/apply tools.

---

### `list_edit_sessions`

**When to use:** List edit sessions currently held in memory by this MCP server process.

**Use cases:**
- **Session overview**: See all active edit sessions
- **Session management**: Identify which session to use or clear

---

### `get_edit_session`

**When to use:** Get a specific edit session (or the active session if sessionId is omitted).

**Use cases:**
- **Session inspection**: View the contents and changes in a specific session
- **Debugging**: Understand what changes have been recorded

---

### `set_active_edit_session`

**When to use:** Set (or clear) the active edit session used by recordToSession-enabled tools.

**Use cases:**
- **Session switching**: Switch between multiple edit sessions
- **Session clearing**: Clear the active session to stop recording changes

---

### `clear_edit_session`

**When to use:** Delete an edit session from memory (clears the active session if it matches).

**Use cases:**
- **Cleanup**: Remove sessions that are no longer needed
- **Memory management**: Free up memory by clearing old sessions

---

### `export_edit_session`

**When to use:** Export an edit session to a JSON file. This is the recommended way to batch filesystem writes: keep edits live in Chromium during iteration, then export once at the end.

**Use cases:**
- **Backup**: Save edit session data for later inspection or restoration
- **Inspection**: Export session data to analyze changes outside the MCP server
- **Batch operations**: Export multiple sessions for batch processing

**Differences from `commit_edit_session_to_files`:** This exports the session metadata/log as JSON, while `commit_edit_session_to_files` writes changes directly to source files.

---

### `preview_commit_plan`

**When to use:** Preview a structured commit plan for an edit session without writing any files. This is the recommended Level A workflow: preview exactly what would be written (files + change ids + chunk previews), then apply the plan explicitly via `apply_commit_plan`.

**Use cases:**
- **Review before commit**: See exactly what changes will be written before committing
- **Safety checks**: Verify file paths and change contents before applying
- **Planning**: Understand the scope of changes before committing

---

### `apply_commit_plan`

**When to use:** Apply a previously previewed commit plan by writing changes to disk. This tool is designed to be used with `preview_commit_plan`. It supports dryRun mode.

**Use cases:**
- **Safe commits**: Apply changes that have been previewed and reviewed
- **Dry run testing**: Test the commit process without actually writing files
- **Batch commits**: Apply multiple changes from a commit plan at once

**Important contract:** This is an explicit filesystem write step. Do not call it unless the user asked to commit/apply changes to files.

---

### `commit_edit_session_to_files`

**When to use:** Best-effort commit of recorded changes into local files. This intentionally runs as an explicit end-of-session step to avoid editor lag during iteration. Currently supports appending recorded CSS/JS snippets to files referenced by targetFilePath.

**Use cases:**
- **End-of-session commits**: Commit all changes from an edit session at once
- **File appending**: Append CSS/JS snippets to existing source files
- **Workflow completion**: Finalize a live editing session by writing changes to disk

**Important contract:** This is an explicit filesystem write step. Do not call it unless the user asked to commit/apply changes to files.

**Differences from `export_edit_session`:** This tool writes changes directly to source files, while `export_edit_session` saves session metadata as JSON.

---

## Mutation & DOM Tools

### `insert_css`

**When to use:** Insert a `<style>` tag into the current page with a patch id for later rollback. Supports preview mode for testing multiple CSS values with visual wireframe feedback, responsive breakpoints, and before/after comparisons.

**Use cases:**
- **Live CSS editing**: Test CSS changes directly in the browser
- **Preview mode**: Test multiple CSS property values and see visual feedback
- **Responsive testing**: Test CSS changes at different viewport sizes
- **A/B testing**: Compare different CSS values side-by-side

**Preview mode features:**
- Automatically generates SVG wireframe snapshots for visual feedback
- Tests multiple CSS values and shows before/after comparisons
- Supports responsive breakpoint testing
- Includes automatic rollback by default

---

### `insert_js`

**When to use:** Insert a `<script>` tag into the current page with a patch id for later rollback. Supports preview mode for testing multiple script variants with visual wireframe feedback, responsive breakpoints, and before/after comparisons.

**Use cases:**
- **Live JavaScript editing**: Test JavaScript changes directly in the browser
- **Preview mode**: Test multiple script variants and see their effects
- **DOM manipulation testing**: Test scripts that modify the DOM
- **Behavior testing**: Compare different JavaScript implementations

**Note:** Rollback removes script tags but cannot reliably undo side-effects like DOM mutations, timers, or event listeners.

---

### `rollback_patch`

**When to use:** Rollback (remove) a previously inserted patch by patchId in the current page.

**Use cases:**
- **Undo changes**: Remove a specific CSS or JS patch
- **Testing**: Remove patches to test the original state
- **Cleanup**: Remove patches that are no longer needed

---

### `rollback_all`

**When to use:** Rollback (remove) all patches inserted by this MCP server in the current page.

**Use cases:**
- **Reset page**: Remove all MCP-injected changes to return to original state
- **Cleanup**: Clear all patches before starting a new editing session
- **Testing**: Reset the page to test original behavior

---

### `manipulate_dom`

**When to use:** Perform DOM manipulations on web pages including setting styles, adding/removing classes, inserting/removing elements, and batch operations.

**Use cases:**
- **Style manipulation**: Set inline styles on elements
- **Class management**: Add or remove CSS classes
- **Element insertion**: Insert HTML content into the page
- **Element removal**: Remove elements from the DOM
- **Batch operations**: Perform multiple DOM operations in a single call

**Differences from `insert_css`:** This tool manipulates existing DOM elements directly, while `insert_css` injects new style tags. Use `manipulate_dom` for targeted element changes, and `insert_css` for global style rules.

---

## Diff & Commit Tools

### `apply_unified_diff`

**When to use:** Apply a unified diff (git-style) to local files with strict conflict detection. This is a Level A building block: apply small, reviewable diffs to the repo after validating changes in-browser.

**Use cases:**
- **Git integration**: Apply diffs generated by git or other tools
- **Reviewable changes**: Apply small, reviewable changes after browser validation
- **Conflict detection**: Detect and report conflicts when applying diffs
- **Safe patching**: Apply patches with safety checks (root directory, dry run)

---

### `preview_diff_from_commit_plan`

**When to use:** Generate a unified diff (git-style) from a commit plan (typically produced by `preview_commit_plan`). This lets Level A workflows produce reviewable diffs: plan → diff → apply_unified_diff (or git apply).

**Use cases:**
- **Diff generation**: Create git-style diffs from edit session commit plans
- **Code review**: Generate reviewable diffs for code review processes
- **Git integration**: Create diffs that can be applied with `git apply`
- **Change documentation**: Document changes in standard diff format

---

## Input & Interaction Tools

### `click_at`

**When to use:** Clicks at the provided coordinates. Useful when elements don't have stable selectors or when you need precise coordinate-based clicking.

**Use cases:**
- **Coordinate-based clicking**: Click at specific screen coordinates
- **Canvas/WebGL interactions**: Interact with canvas elements that don't have standard selectors
- **Overlay elements**: Click elements that are overlaid on other content
- **Computer vision workflows**: Use with computer vision tools that provide coordinates

**Differences from `click`:** This tool uses coordinates instead of element UIDs, making it useful for elements without stable selectors.

---

### `simulate_event`

**When to use:** Simulate user interactions for testing by dispatching DOM events. Returns complete page snapshots after each interaction, providing rich accessibility information and state tracking.

**Use cases:**
- **Event testing**: Test how elements respond to specific DOM events
- **Complex interactions**: Simulate event sequences (e.g., focus → input → change → blur)
- **Drag operations**: Simulate drag and drop interactions
- **Coordinate-based events**: Dispatch events at specific coordinates
- **Automated UI testing**: Create comprehensive UI test scenarios

**Differences from original tools:** The original `click` tool uses element UIDs from snapshots. This tool provides more flexible event simulation with CSS selectors, coordinates, and event sequences.

---

## Guidance & Configuration Tools

### `guidance_config`

**When to use:** Get or set the MCP guidance content (design/architecture/engineering) stored in the MCP server directory.

**Use cases:**
- **Project guidance**: Store and retrieve project-specific design, architecture, and engineering guidelines
- **Context for AI**: Provide context to AI assistants about project conventions
- **Documentation**: Maintain project documentation in a structured format
- **Workflow configuration**: Configure guidance that influences tool behavior and suggestions

---

## Page Management Tools

### `get_tab_id`

**When to use:** Get the tab ID of the page. Useful for integration with browser extension APIs or other tools that require tab IDs.

**Use cases:**
- **Extension integration**: Get tab IDs for browser extension APIs
- **Tab management**: Identify pages by their tab IDs
- **Cross-tool communication**: Share tab IDs between different tools or systems

**Differences from original tools:** This provides access to internal browser tab IDs, which may be needed for advanced integrations.

---

## Summary

These branch tools extend the original chrome-devtools-mcp functionality with:

1. **Browser-first prototyping**: Tools for live editing, prototyping, and exporting page states
2. **Enhanced analysis**: JavaScript analysis, performance monitoring, and wireframe snapshots
3. **Edit session management**: Comprehensive workflow for buffering and committing browser edits
4. **Visual debugging**: SVG wireframes and visual layout analysis
5. **Advanced interactions**: Coordinate-based clicking, event simulation, and batch operations
6. **Workflow tools**: Diff generation, commit planning, and guidance configuration

All branch tools are designed to work together to support a browser-first development workflow where changes are made and tested in the browser before being committed to source files.

