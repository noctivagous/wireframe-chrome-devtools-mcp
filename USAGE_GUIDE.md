# How To Use Wireframe-ChromeDevTools-MCP
## Core Concept

This MCP server is **flexible**—it supports both modern live-editing workflows and traditional file-based approaches:

**Live sessions (recommended for iteration):** Edit web pages **live in the browser** with instant feedback, then explicitly commit changes to files when you're ready. No more "edit → reload → check" loops!

**Traditional approach (works too):** The AI can edit your files directly, and you reload the browser to see changes—just like normal development.

**Key principle for live sessions:** Changes happen in the browser first. Files are only written when you explicitly ask for it.

## How It Accomplishes This

The system provides specialized tools across four categories:

**📊 Structured Layout Analysis**
- `svg_snapshot` - Visual wireframe with layout debugging overlays
- `wireframe_snapshot` - Compact structural data for detecting overlaps, gaps, and layout issues

**🔧 Live Insertion & Manipulation**
- `insert_css` / `insert_css_preview` - Inject CSS with rollback; test multiple values
- `insert_js` / `insert_js_preview` - Inject JavaScript with rollback; test variants
- `manipulate_dom` - Modify DOM elements (styles, classes, HTML) with batch operations

**📝 Session Tracking**
- `begin_edit_session` - Start recording changes
- `get_edit_session` / `list_edit_sessions` - Review recorded changes
- `export_edit_session` - Export for review/sharing

**💾 Commit & Apply**
- `preview_commit_plan` - Preview exactly what will be written to files
- `apply_commit_plan` - Apply previewed changes (safe, reviewable)
- `commit_edit_session_to_files` - Best-effort append to target files
- `apply_unified_diff` - Apply git-style diffs with conflict detection

Together, these tools enable a workflow where the AI can **see** layout structure precisely, **manipulate** it live with instant feedback, **track** all changes in a session, and **commit** clean, reviewable patches when you're ready.

---

## Quick Start

### 1. Load a page
```
"Load https://example.com in the browser"
"Open index.html in the browser"
```

### 2. Choose your workflow

**Live editing (recommended for iteration):**
```
"begin live editing session" (shorthand: "ble.")
```

**Live editing minimal (low tool count):**
Use a single session tool for begin/edit/export:
```
"live_editing_session" with begin: { url: "https://example.com" }
... iterate with insert_css / manipulate_dom / insert_js ...
"update_from_user_changes"
"live_editing_session" with export: { action: "commit_edit_session_to_files", rootDir: "...", dryRun: true }
```

**Direct file edits (traditional approach):**
Just ask the AI to fix something—it will edit files and you can reload to see changes.

---

## Level A: Live Edit Sessions

### What is it?
Record all your live browser edits into a session, preview exactly what will change, then apply clean patches to specific files.

### How to use it

**Step 1: Start a session**
```
"begin live editing session" (shorthand: "ble.")
```
Or with in-browser chat:
```
"begin live editing session with chatbox" (shorthand: "ble-c.")
```

**Step 2: Make changes**
- Tell the AI to adjust CSS, modify the DOM, inject JavaScript
- Changes appear instantly in the browser
- All changes are recorded with `recordToSession: true`

**Step 3: Review and commit**

Preview what will be written:
```
"preview the commit plan"
```

Apply changes to files:
```
"apply the commit plan"
```

Or best-effort append:
```
"commit this session to files"
```

Or just export without touching files:
```
"export this session"
"summarize this session"
```

### Example prompts

**Live prototyping:**
- "Start with a blank page and build a settings panel with a toggle and slider"
- "Create a card layout with hover effects, record it, then commit to components.css"

**Live fixes:**
- "Fix the header overlap with the first card—try 3 different solutions and show wireframes"
- "Find all layout gaps on this page and fix them, then preview the commit plan"
- "Adjust the spacing in this grid until it looks right, then commit it"

**A/B testing:**
- "Preview three different gap values for this grid and show me wireframes for each"
- "Test margin-bottom values of 16px, 24px, and 32px and compare"

**Batch ops + edit session (when available):**
- "Use batch_ops to start an edit session, apply CSS + DOM changes with recordToSession, take a snapshot, then preview the commit plan"

---

## Traditional Workflow (Not Live)

For quick one-off fixes without a session:

### Inspect and fix
```
"Use svg_snapshot to find layout issues and fix them"
"Check for overlaps and gaps in the main content area"
```

The AI will:
1. Analyze the page structure
2. Edit your CSS/HTML files directly
3. You reload the browser to see changes

**When to use:** Simple fixes, working on files first, or integrating with existing file-based workflows.

---

## Common Workflows

### 🎨 Build a prototype from scratch
```
1. "begin live editing session"
2. "Create a navigation bar with logo and menu items"
3. "Add a hero section with centered text and CTA button"
4. "Preview the commit plan and apply to styles.css and index.html"
```

### 🔧 Debug layout issues
```
1. "Load my-app/dashboard.html"
2. "begin live editing session"
3. "Find overlapping elements and gaps using svg_snapshot"
4. "Fix all issues and show me before/after wireframes"
5. "Commit to dashboard.css"
```

### ⚡ Iterate quickly
```
1. "begin live editing session with chatbox" (ble-c.)
2. [In browser chat] "Make the cards wider"
3. [In browser chat] "Add more padding between sections"
4. [In IDE] "commit this session to files"
```

### 📦 Export for review
```
1. "begin live editing session"
2. [Make several changes]
3. "export this session as a package"
4. [Share the package with team for review]
5. [Later] "apply the commit plan from the package"
```

---

## Tips

✅ **Use live sessions when:**
- Iterating on design/layout
- Testing multiple options
- Building something new
- Need instant visual feedback

✅ **Use direct file edits when:**
- Making quick one-off changes
- Already know exactly what to change
- Working in an existing file-based workflow

✅ **Always specify target files:**
```
"Record this to styles.css"
"Save this change to components/header.css"
```

✅ **Preview before applying:**
```
"preview commit plan" → "apply commit plan"
```
Much safer than blind commits!

---

## Tools Overview

### Edit Session Tools
- `live_editing_session` - **Minimal** session lifecycle wrapper (begin/edit/export) that covers starting live editing, exporting prototype state, and exporting/committing/clearing edit sessions
- `begin_edit_session` - Start recording changes
- `preview_commit_plan` - See what will be written
- `apply_commit_plan` - Write changes to files
- `commit_edit_session_to_files` - Best-effort append to target files
- `export_edit_session` - Save session as JSON

### Live Editing Tools
- `insert_css` / `insert_js` - Inject code with rollback
- `insert_css_preview` / `insert_js_preview` - Test multiple variants
- `manipulate_dom` - Modify DOM (styles, classes, HTML)
- `rollback_patch` / `rollback_all` - Undo changes

### Inspection Tools
- `svg_snapshot` - Visual wireframe with layout debugging
- `wireframe_snapshot` - Structural analysis for overlaps/gaps
- `inspect_state` - Check localStorage, React state, etc.
- `evaluate_script` - Run JavaScript and get results

---

## Learn More

- **Full tool reference:** [docs/tool-reference.md](docs/tool-reference.md)
- **README:** [README.md](README.md)
- **Troubleshooting:** [docs/troubleshooting.md](docs/troubleshooting.md)
