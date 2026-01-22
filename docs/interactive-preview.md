# Interactive preview workflows (CSS/JS) via MCP tools

This repo supports a **safe, repeatable “preview → commit”** loop for live page modifications using MCP tools.

## Contract: “Show me what it would look like if …”

When a user asks for a hypothetical UI change (e.g. “Show me what it would look like if Twitter had a multi‑column feed”), the workflow should:

- **Default to non-destructive**: changes are **temporary by default** (rollback-on-complete unless the user explicitly asks to keep them).
- **Be explicit about scope**: the user (or agent) should specify what area is affected (a `scopeSelector`/root container, or a precise selector for the component).
- **Support variants**: allow quickly comparing multiple candidate values/snippets (A/B/C…).
- **Optional visual artifacts**: return snapshots when they help illustrate a change (wireframe SVG and/or structured `wireframe_snapshot` output).
- **Separate “live preview” from “writing files”**: keep iteration fast in Chromium; write to disk only at the end via an explicit export/commit step.

## Recommended low-lag workflow (edit sessions)

Use an edit session to buffer changes during experimentation:

- **Start a session**: `begin_edit_session` (optionally with a label)
- **Preview changes**: run tools with `recordToSession: true` (optionally with `targetFilePath`)
  - CSS: `insert_css_preview` (for per-property A/B testing) or `insert_css` (for full snippets)
  - JS: `insert_js_preview` (for variants) or `insert_js` / `evaluate_script`
- **Optional snapshots**: capture artifacts as needed: `wireframe_snapshot` / `svg_snapshot` / `take_snapshot` / `take_screenshot`.
- **End of session** (explicit):
  - **Export**: `export_edit_session` to a JSON file (for review/sharing), and/or
  - **Commit (Level A, recommended)**:
    - `preview_commit_plan` (shows exactly what files/changes would be written)
    - `apply_commit_plan` (writes, supports `dryRun`)
  - **Commit (diff-based, advanced)**:
    - If you already have a patch in unified diff format (e.g. from an external review step), use `apply_unified_diff` to apply it with strict conflict detection and `rootDir` safety anchoring.
  - **Commit (legacy)**: `commit_edit_session_to_files` (best-effort append-only) using the `targetFilePath` hints recorded during preview.

## Rollback semantics

### CSS

- `insert_css_preview` defaults `autoRollback: true` and will remove its injected style tags after capturing snapshots.
- If you want to keep a patch applied, set `autoRollback: false` and use `rollback_patch` later (or `rollback_all`).

### JS

JavaScript is fundamentally different:

- `insert_js_preview` / `insert_js` can remove the injected `<script>` tag (rollback of the *patch*), **but cannot reliably undo side-effects** (DOM mutations, event listeners, timers, global state).
- Treat JS preview as **best-effort cleanup** for exploration. For safer, non-persistent evaluation, prefer `evaluate_script` when possible.

## Variant selection (“which one do we commit?”)

When recording a preview into an edit session:

- **CSS**: use `selectedValueIndex` to specify which entry in `values` becomes the committed `cssText`. If omitted, the **last** value is recorded.
- **JS**: use `selectedScriptIndex` to specify which entry in `scripts` becomes the committed `jsText`. If omitted, the **last** script is recorded.


