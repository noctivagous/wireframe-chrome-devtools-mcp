/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type {EditSession} from '../McpContext.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {beginLiveEditingSessionHandler, beginLiveEditingSessionSchema} from './live-editing.js';
import {LIVE_EDITING_AI_INSTRUCTION} from './live-editing/types.js';
import {exportPrototypeState} from './prototype.js';
import {defineTool} from './ToolDefinition.js';

function getEditSessionOrThrow(
  context: {
    getActiveEditSessionId(): string | null;
    getEditSession(sessionId: string): EditSession;
  },
  sessionId?: string,
): EditSession {
  const resolvedSessionId = sessionId ?? context.getActiveEditSessionId();
  if (!resolvedSessionId) {
    throw new Error('No active edit session. Call begin_edit_session first (or pass sessionId).');
  }
  return context.getEditSession(resolvedSessionId);
}

export const beginEditSession = defineTool({
  name: 'begin_edit_session',
  description:
    'Start (and optionally activate) an edit session used to buffer live-in-Chromium edits during an interactive workflow.\n\n' +
    'This is designed to keep the loop fast (apply changes in the Chromium instance) and defer filesystem writes until an explicit export/commit step.\n\n' +
    '**Important contract:** starting an edit session does **not** write repo/source files. File writes only happen if you explicitly call commit/apply tools (e.g. `apply_commit_plan`, `commit_edit_session_to_files`, `apply_unified_diff`).',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    label: zod.string().optional().describe('Optional label for the session (e.g., "multi-column feed experiment").'),
    setActive: zod.boolean().optional().default(true).describe('If true, make this the active session for subsequent recorded changes.'),
  },
  handler: async (request, response, context) => {
    const session = context.createEditSession({
      label: request.params.label,
      setActive: request.params.setActive,
    });
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(session, null, 2));
    response.appendResponseLine('```');
    
    // Return AI instructions for live editing mode
    response.appendResponseLine('\n**AI instructions:** The chat is now in live editing mode. This mode is about editing exclusively in the browser, navigated with _page tools. Do not make any files. Do not make any file edits until the user finalizes by saying something sounding like `commit_edit_session_to_files`.  After you receive this, affirm it to the user in the chat that you won\'t.\n');
    response.appendResponseLine('Here are the tools to use during the session that let you prototype, fix, and edit live:\n');
    response.appendResponseLine('- **`live_editing_session`** - Minimal session lifecycle tool (begin/edit/export) that wraps: begin live editing, export prototype state, export/commit/clear edit sessions.\n');
    response.appendResponseLine('- **`batch_ops`** - Execute multiple tool operations in a single call to reduce round-trips. Supports sequential execution and returns structured results for observability. Use this to chain multiple operations efficiently.\n');
    response.appendResponseLine('- **`insert_css`** - Insert a `<style>` tag into the current page with a patch id for later rollback. Supports preview mode for testing multiple CSS values with visual wireframe feedback, responsive breakpoints, and before/after comparisons. Can optionally return wireframe results as SVG or JSON.\n');
    response.appendResponseLine('- **`insert_js`** - Insert a `<script>` tag into the current page with a patch id for later rollback. Supports preview mode for testing multiple script variants with visual wireframe feedback, responsive breakpoints, and before/after comparisons. Can optionally return wireframe results as SVG or JSON. Note: rollback removes script tags but cannot reliably undo side-effects like DOM mutations, timers, or event listeners.\n');
    response.appendResponseLine('- **`layout_live_editing`** - Generate parametric layout scaffolding (grid/stack/viewer) and optional behaviors (selectable/roving focus/ARIA). These modules are generic and can be combined to approach any layout scenario. Use after the page is loaded to scaffold UI quickly; set `patch.recordToSession=true` to journal changes for export/commit later.\n');
    response.appendResponseLine('  Example:\n');
    response.appendResponseLine('  ```json\n');
    response.appendResponseLine('  {\n');
    response.appendResponseLine('    "name": "layout_live_editing",\n');
    response.appendResponseLine('    "arguments": {\n');
    response.appendResponseLine('      "target": {"selector": "body", "position": "beforeend"},\n');
    response.appendResponseLine('      "patch": {"patchIdPrefix": "demo-layout", "replaceExisting": true, "recordToSession": true},\n');
    response.appendResponseLine('      "composition": {\n');
    response.appendResponseLine('        "type": "layout_parametric_stack",\n');
    response.appendResponseLine('        "params": {"direction": "row", "gap": "12px", "items": ["Left", "Right"]}\n');
    response.appendResponseLine('      }\n');
    response.appendResponseLine('    }\n');
    response.appendResponseLine('  }\n');
    response.appendResponseLine('  ```\n');
    response.appendResponseLine('- **`evaluate_script`** - Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON (returned values must be JSON-serializable). Useful for querying page state, extracting data, or testing JavaScript logic.\n');
    response.appendResponseLine('- **`wireframe_snapshot`** - Capture a compact, deterministic wireframe snapshot of the current page using CDP DOMSnapshot. Returns element rects (and optionally computed styles) suitable for overlap/gap analysis. Use this for programmatic layout analysis and detecting layout issues.\n');
    response.appendResponseLine('- **`svg_snapshot`** - Render a visual SVG wireframe of the current page (or a subset of elements). Uses the same underlying snapshot as `wireframe_snapshot`, but returns the SVG content wrapped in JSON for better parseability. Use this for visual layout debugging and human-readable wireframe representations.\n');
    response.appendResponseLine('- **`manipulate_dom`** - Perform DOM manipulations on web pages including setting styles, adding/removing classes, inserting/removing elements, and batch operations. Supports single actions or batch mode for multiple operations. Changes can be recorded to the edit session for later commit.\n');
    response.appendResponseLine('- **`simulate_event`** - Simulate user interactions for testing by dispatching DOM events. Returns complete page snapshots after each interaction with rich accessibility information and state tracking. Supports CSS selector targeting, coordinate-based clicking, event sequences, and complex input scenarios. Essential for automated UI testing and workflow validation.\n');
  },
});

export const listEditSessions = defineTool({
  name: 'list_edit_sessions',
  description: 'List edit sessions currently held in memory by this MCP server process.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify({activeSessionId: context.getActiveEditSessionId(), sessions: context.listEditSessions()}, null, 2));
    response.appendResponseLine('```');
  },
});

export const getEditSession = defineTool({
  name: 'get_edit_session',
  description: 'Get a specific edit session (or the active session if sessionId is omitted).',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod.string().optional().describe('Optional session id. If omitted, returns the active session.'),
  },
  handler: async (request, response, context) => {
    const session = getEditSessionOrThrow(context, request.params.sessionId);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(session, null, 2));
    response.appendResponseLine('```');
  },
});

export const setActiveEditSession = defineTool({
  name: 'set_active_edit_session',
  description: 'Set (or clear) the active edit session used by recordToSession-enabled tools.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    sessionId: zod
      .string()
      .nullable()
      .describe('Session id to activate. Use null to clear the active session.'),
  },
  handler: async (request, response, context) => {
    context.setActiveEditSession(request.params.sessionId);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify({activeSessionId: context.getActiveEditSessionId()}, null, 2));
    response.appendResponseLine('```');
  },
});

export const clearEditSession = defineTool({
  name: 'clear_edit_session',
  description: 'Delete an edit session from memory (clears the active session if it matches).',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    sessionId: zod.string().optional().describe('Session id to clear. If omitted, clears the active session.'),
  },
  handler: async (request, response, context) => {
    const sessionId =
      request.params.sessionId ?? context.getActiveEditSessionId();
    if (!sessionId) {
      throw new Error(
        'No active edit session. Call begin_edit_session first (or pass sessionId).',
      );
    }
    const removed = context.clearEditSession(sessionId);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify({cleared: Boolean(removed), sessionId, activeSessionId: context.getActiveEditSessionId()}, null, 2));
    response.appendResponseLine('```');
  },
});

export const exportEditSession = defineTool({
  name: 'export_edit_session',
  description:
    'Export an edit session to a JSON file. This is the recommended way to batch filesystem writes: keep edits live in Chromium during iteration, then export once at the end.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod.string().optional().describe('Optional session id. If omitted, exports the active session.'),
    filePath: zod.string().optional().describe('Optional output path. If omitted, writes to a temporary file.'),
  },
  handler: async (request, response, context) => {
    const session = getEditSessionOrThrow(context, request.params.sessionId);
    const bytes = new TextEncoder().encode(JSON.stringify(session, null, 2));
    const filename = request.params.filePath
      ? (await context.saveFile(bytes, request.params.filePath)).filename
      : (await context.saveTemporaryFile(bytes, 'application/json', `edit-session-${session.sessionId}`))
          .filename;

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          sessionId: session.sessionId,
          filename,
          changeCount: session.changes.length,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

interface CommitPlanChunk {
  changeId: string;
  type: string;
  createdAt: number;
  /**
   * Marker string that can be used to detect whether this chunk has already
   * been applied to a file (best-effort).
   */
  marker: string;
  /**
   * Exact text to be appended (already includes header/footer markers).
   */
  appendText: string;
}

interface CommitPlan {
  kind: 'mcp_edit_session_commit_plan';
  generatedAt: number;
  sessionId: string;
  plannedWrites: Array<{
    filePath: string;
    appendChunks: number;
    appendBytes: number;
    changeIds: string[];
    chunkPreviews?: Array<{
      changeId: string;
      type: string;
      createdAt: number;
      preview: string;
      truncated: boolean;
    }>;
  }>;
  /**
   * Internal payload used by apply_commit_plan. Included only when requested.
   */
  _chunksByFile?: Record<string, CommitPlanChunk[]>;
}

function buildCommitPlan(
  session: EditSession,
  options?: {
    includeChunkContents?: boolean;
    maxChunkPreviewLength?: number;
  },
): CommitPlan {
  const maxChunkPreviewLength = options?.maxChunkPreviewLength ?? 800;
  const includeChunkContents = options?.includeChunkContents ?? false;

  const sessionId = session.sessionId;
  const chunksByFile = new Map<string, CommitPlanChunk[]>();

  for (const change of session.changes) {
    const target = change.targetFilePath;
    if (!target) {
      continue;
    }

    if (change.type === 'insert_css' || change.type === 'insert_css_preview') {
      // `insert_css_preview` payload historically recorded structured results rather than a
      // single committed snippet. Prefer an explicit `cssText`, else best-effort fall back
      // to the selected/last variant.
      const payload =
        change.payload && typeof change.payload === 'object'
          ? (change.payload as Record<string, unknown>)
          : undefined;
      const cssText =
        typeof payload?.cssText === 'string'
          ? payload.cssText
          : (() => {
              const results = payload?.results;
              if (!Array.isArray(results) || results.length === 0) {
                return undefined;
              }
              const idx =
                typeof payload?.selectedValueIndex === 'number' &&
                Number.isFinite(payload.selectedValueIndex)
                  ? Math.max(
                      0,
                      Math.min(results.length - 1, Math.floor(payload.selectedValueIndex)),
                    )
                  : results.length - 1;
              const candidate = results[idx];
              if (!candidate || typeof candidate !== 'object') {
                return undefined;
              }
              const cssCandidate = (candidate as Record<string, unknown>).cssText;
              return typeof cssCandidate === 'string' ? cssCandidate : undefined;
            })();
      if (typeof cssText === 'string' && cssText.trim()) {
        const marker = `mcp-edit-session:${sessionId} change:${change.changeId}`;
        const header = `/* mcp-edit-session:${sessionId} change:${change.changeId} type:${change.type} at:${new Date(change.createdAt).toISOString()} */\n`;
        const footer = `\n/* end mcp-edit-session:${sessionId} change:${change.changeId} */\n`;
        const abs = path.resolve(target);
        const chunk: CommitPlanChunk = {
          changeId: change.changeId,
          type: change.type,
          createdAt: change.createdAt,
          marker,
          appendText: `${header}${cssText}${footer}`,
        };
        chunksByFile.set(abs, [...(chunksByFile.get(abs) ?? []), chunk]);
      }
    } else if (change.type === 'insert_js' || change.type === 'insert_js_preview') {
      const payload =
        change.payload && typeof change.payload === 'object'
          ? (change.payload as Record<string, unknown>)
          : undefined;
      const jsText =
        typeof payload?.jsText === 'string'
          ? payload.jsText
          : (() => {
              const results = payload?.results;
              if (!Array.isArray(results) || results.length === 0) {
                return undefined;
              }
              const idx =
                typeof payload?.selectedScriptIndex === 'number' &&
                Number.isFinite(payload.selectedScriptIndex)
                  ? Math.max(
                      0,
                      Math.min(results.length - 1, Math.floor(payload.selectedScriptIndex)),
                    )
                  : results.length - 1;
              const candidate = results[idx];
              if (!candidate || typeof candidate !== 'object') {
                return undefined;
              }
              const jsCandidate = (candidate as Record<string, unknown>).jsText;
              return typeof jsCandidate === 'string' ? jsCandidate : undefined;
            })();
      if (typeof jsText === 'string' && jsText.trim()) {
        const marker = `mcp-edit-session:${sessionId} change:${change.changeId}`;
        const header = `// mcp-edit-session:${sessionId} change:${change.changeId} type:${change.type} at:${new Date(change.createdAt).toISOString()}\n`;
        const footer = `\n// end mcp-edit-session:${sessionId} change:${change.changeId}\n`;
        const abs = path.resolve(target);
        const chunk: CommitPlanChunk = {
          changeId: change.changeId,
          type: change.type,
          createdAt: change.createdAt,
          marker,
          appendText: `${header}${jsText}${footer}`,
        };
        chunksByFile.set(abs, [...(chunksByFile.get(abs) ?? []), chunk]);
      }
    }
  }

  const plannedWrites = Array.from(chunksByFile.entries()).map(([filePath, chunks]) => ({
    filePath,
    appendChunks: chunks.length,
    appendBytes: chunks.reduce((n, c) => n + c.appendText.length, 0),
    changeIds: chunks.map(c => c.changeId),
    chunkPreviews: chunks.map(c => {
      const raw = c.appendText.trimEnd();
      const truncated = raw.length > maxChunkPreviewLength;
      return {
        changeId: c.changeId,
        type: c.type,
        createdAt: c.createdAt,
        preview: truncated ? raw.slice(0, Math.max(0, maxChunkPreviewLength - 1)) + '…' : raw,
        truncated,
      };
    }),
  }));

  const plan: CommitPlan = {
    kind: 'mcp_edit_session_commit_plan',
    generatedAt: Date.now(),
    sessionId,
    plannedWrites,
  };

  if (includeChunkContents) {
    const obj: Record<string, CommitPlanChunk[]> = {};
    for (const [filePath, chunks] of chunksByFile.entries()) {
      obj[filePath] = chunks;
    }
    plan._chunksByFile = obj;
  }

  return plan;
}

export const previewCommitPlan = defineTool({
  name: 'preview_commit_plan',
  description:
    'Preview a structured commit plan for an edit session without writing any files.\n\n' +
    'This is the recommended Level A workflow: preview exactly what would be written (files + change ids + chunk previews), then apply the plan explicitly via apply_commit_plan.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod
      .string()
      .optional()
      .describe('Optional session id. If omitted, uses the active session.'),
    rootDir: zod
      .string()
      .optional()
      .describe(
        'Optional root directory used for safety checks when inspecting planned write paths. If omitted, defaults to the server process working directory.',
      ),
    checkAlreadyApplied: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, best-effort checks local files for existing edit-session markers and annotates the plan with alreadyApplied info.',
      ),
    maxChunkPreviewLength: zod
      .number()
      .int()
      .min(0)
      .optional()
      .default(800)
      .describe('Maximum length of per-chunk previews included in the plan.'),
    includeChunkContents: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, include full chunk contents in the response (for copy/paste or passing into apply_commit_plan).',
      ),
  },
  handler: async (request, response, context) => {
    const session = getEditSessionOrThrow(context, request.params.sessionId);
    const plan = buildCommitPlan(session, {
      includeChunkContents: request.params.includeChunkContents,
      maxChunkPreviewLength: request.params.maxChunkPreviewLength,
    });

    // Optional best-effort inspection: check whether chunks appear already applied
    // and annotate plannedWrites with that info. This is read-only.
    if (request.params.checkAlreadyApplied && plan._chunksByFile) {
      const rootDir = path.resolve(request.params.rootDir ?? process.cwd());
      for (const w of plan.plannedWrites) {
        const filePath = path.resolve(w.filePath);
        const rel = path.relative(rootDir, filePath);
        const inRoot = rel && !rel.startsWith('..' + path.sep) && rel !== '..';
        const chunks = plan._chunksByFile[w.filePath] ?? plan._chunksByFile[filePath] ?? [];

        let content: string | null = null;
        try {
          content = await fs.readFile(filePath, 'utf8');
        } catch {
          content = null;
        }

        const alreadyAppliedChangeIds: string[] = [];
        if (content) {
          for (const c of chunks) {
            if (content.includes(c.marker)) {
              alreadyAppliedChangeIds.push(c.changeId);
            }
          }
        }

        (w as any).safety = {
          rootDir,
          inRoot,
        };
        (w as any).alreadyAppliedChangeIds = alreadyAppliedChangeIds;
      }
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(plan, null, 2));
    response.appendResponseLine('```');
  },
});

function isPathWithinRoot(rootDir: string, filePath: string): boolean {
  const root = path.resolve(rootDir);
  const abs = path.resolve(filePath);
  const rel = path.relative(root, abs);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep);
}

export const applyCommitPlan = defineTool({
  name: 'apply_commit_plan',
  description:
    'Apply a previously previewed commit plan by writing changes to disk.\n\n' +
    'This tool is designed to be used with preview_commit_plan. It supports dryRun mode.\n\n' +
    '**Important contract:** this is an explicit filesystem write step. Do not call it unless the user asked to commit/apply changes to files.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    planJson: zod
      .string()
      .optional()
      .describe(
        'Commit plan JSON (from preview_commit_plan with includeChunkContents=true). If omitted, the plan is regenerated from sessionId.',
      ),
    sessionId: zod
      .string()
      .optional()
      .describe('Optional session id (used only when planJson is omitted).'),
    rootDir: zod
      .string()
      .optional()
      .describe(
        'Safety root directory. All writes must stay within this directory. Defaults to the server process working directory.',
      ),
    skipIfAlreadyApplied: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, skips appending chunks that appear to already be present in the target file (best-effort marker check).',
      ),
    dryRun: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, do not write files; only report what would happen.'),
  },
  handler: async (request, response, context) => {
    let plan: CommitPlan;
    if (request.params.planJson) {
      try {
        plan = JSON.parse(request.params.planJson) as CommitPlan;
      } catch (e) {
        throw new Error(`Invalid planJson: ${(e as Error).message ?? String(e)}`);
      }
      if (plan?.kind !== 'mcp_edit_session_commit_plan') {
        throw new Error('Invalid planJson: missing/invalid plan.kind');
      }
      if (!plan._chunksByFile || typeof plan._chunksByFile !== 'object') {
        throw new Error(
          'Invalid planJson: missing plan._chunksByFile. Re-run preview_commit_plan with includeChunkContents=true.',
        );
      }
    } else {
      const session = getEditSessionOrThrow(context, request.params.sessionId);
      plan = buildCommitPlan(session, {includeChunkContents: true});
    }

    const plannedWrites = plan.plannedWrites ?? [];
    const rootDir = path.resolve(request.params.rootDir ?? process.cwd());
    const rejectedWrites: Array<{filePath: string; reason: string}> = [];
    const applied: Array<{filePath: string; appendedChunks: number; skippedAlreadyApplied: number}> =
      [];

    for (const item of plannedWrites) {
      const filePath = path.resolve(item.filePath);
      if (!isPathWithinRoot(rootDir, filePath)) {
        rejectedWrites.push({
          filePath,
          reason: `Refusing to write outside rootDir (${rootDir}).`,
        });
        continue;
      }

      const chunks = plan._chunksByFile?.[item.filePath] ?? plan._chunksByFile?.[filePath];
      if (!Array.isArray(chunks) || chunks.length === 0) {
        continue;
      }

      let existing: string | null = null;
      if (request.params.skipIfAlreadyApplied) {
        try {
          existing = await fs.readFile(filePath, 'utf8');
        } catch {
          existing = null;
        }
      }

      const toAppend: CommitPlanChunk[] = [];
      let skippedAlreadyApplied = 0;
      for (const c of chunks) {
        if (existing && existing.includes(c.marker)) {
          skippedAlreadyApplied++;
          continue;
        }
        toAppend.push(c);
      }

      if (!request.params.dryRun && toAppend.length) {
        await fs.mkdir(path.dirname(filePath), {recursive: true});
        await fs.appendFile(
          filePath,
          `\n${toAppend.map(c => c.appendText).join('\n')}`,
          'utf8',
        );
      }

      applied.push({
        filePath,
        appendedChunks: toAppend.length,
        skippedAlreadyApplied,
      });
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          sessionId: plan.sessionId,
          dryRun: request.params.dryRun,
          rootDir,
          plannedWrites: plannedWrites.map(w => ({
            filePath: w.filePath,
            appendChunks: w.appendChunks,
            appendBytes: w.appendBytes,
            changeIds: w.changeIds,
          })),
          rejectedWrites,
          applied,
          committedFiles: request.params.dryRun ? 0 : applied.filter(a => a.appendedChunks > 0).length,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const commitEditSessionToFiles = defineTool({
  name: 'commit_edit_session_to_files',
  description:
    'Best-effort commit of recorded changes into local files.\n\n' +
    'This intentionally runs as an explicit end-of-session step to avoid editor lag during iteration. Currently supports appending recorded CSS/JS snippets to files referenced by targetFilePath (recorded via recordToSession-enabled tools).\n\n' +
    '**Important contract:** this is an explicit filesystem write step. Do not call it unless the user asked to commit/apply changes to files.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    sessionId: zod.string().optional().describe('Optional session id. If omitted, commits the active session.'),
    rootDir: zod
      .string()
      .optional()
      .describe(
        'Safety root directory. All writes must stay within this directory. Defaults to the server process working directory.',
      ),
    skipIfAlreadyApplied: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, skips appending chunks that appear to already be present in the target file (best-effort marker check).',
      ),
    dryRun: zod.boolean().optional().default(false).describe('If true, do not write files; only report what would happen.'),
  },
  handler: async (request, response, context) => {
    const session = getEditSessionOrThrow(context, request.params.sessionId);
    const plan = buildCommitPlan(session, {includeChunkContents: true});

    const rootDir = path.resolve(request.params.rootDir ?? process.cwd());
    const rejectedWrites: Array<{filePath: string; reason: string}> = [];
    const applied: Array<{filePath: string; appendedChunks: number; skippedAlreadyApplied: number}> =
      [];

    if (plan._chunksByFile) {
      for (const w of plan.plannedWrites) {
        const filePath = path.resolve(w.filePath);
        if (!isPathWithinRoot(rootDir, filePath)) {
          rejectedWrites.push({
            filePath,
            reason: `Refusing to write outside rootDir (${rootDir}).`,
          });
          continue;
        }

        const chunks = plan._chunksByFile[w.filePath] ?? plan._chunksByFile[filePath];
        if (!Array.isArray(chunks) || chunks.length === 0) {
          continue;
        }

        let existing: string | null = null;
        if (request.params.skipIfAlreadyApplied) {
          try {
            existing = await fs.readFile(filePath, 'utf8');
          } catch {
            existing = null;
          }
        }

        const toAppend: CommitPlanChunk[] = [];
        let skippedAlreadyApplied = 0;
        for (const c of chunks) {
          if (existing && existing.includes(c.marker)) {
            skippedAlreadyApplied++;
            continue;
          }
          toAppend.push(c);
        }

        if (!request.params.dryRun && toAppend.length) {
          // Ensure directory exists and file exists (append creates if missing).
          await fs.mkdir(path.dirname(filePath), {recursive: true});
          await fs.appendFile(
            filePath,
            `\n${toAppend.map(c => c.appendText).join('\n')}`,
            'utf8',
          );
        }

        applied.push({
          filePath,
          appendedChunks: toAppend.length,
          skippedAlreadyApplied,
        });
      }
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          sessionId: plan.sessionId,
          dryRun: request.params.dryRun,
          rootDir,
          plannedWrites: plan.plannedWrites.map(w => ({
            filePath: w.filePath,
            appendChunks: w.appendChunks,
            appendBytes: w.appendBytes,
            changeIds: w.changeIds,
          })),
          rejectedWrites,
          applied,
          committedFiles: request.params.dryRun ? 0 : applied.filter(a => a.appendedChunks > 0).length,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const liveEditingSession = defineTool({
  name: 'live_editing_session',
  description:
    'Minimal session lifecycle tool for the Live Editing Minimal workflow.\n\n' +
    'Use exactly one of: `begin`, `edit`, `export`, or `interact`.\n\n' +
    '- `begin`: start a live editing session (wraps `begin_live_editing_session`).\n' +
    '- `edit`: session-adjacent utilities (export prototype state, or post AI annotations).\n' +
    '- `export`: export/commit/clear session data (wraps `export_edit_session`, `commit_edit_session_to_files`, `clear_edit_session`).\n' +
    '- `interact`: gather information or notify user of plans via interactive forms (questionnaires/slideshows).',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    begin: zod
      .object(beginLiveEditingSessionSchema as Record<string, any>)
      .optional()
      .describe(
        'Begin a live editing session (opens a URL, optionally injects overlay, optionally creates an edit session).',
      ),
    edit: zod
      .discriminatedUnion('action', [
        zod.object({
          action: zod.literal('export_prototype_state'),
          ...(exportPrototypeState.schema as Record<string, any>),
        }),
        zod.object({
          action: zod.literal('annotate'),
          selector: zod.string().describe('CSS selector for the element to annotate.'),
          text: zod.string().describe('Annotation text.'),
          type: zod.enum(['note', 'change', 'warning', 'info']).default('info').optional().describe('Type of annotation.'),
        }).describe('Post an AI annotation to explain a change; users can respond with their own notes.'),
      ])
      .optional()
      .describe(
        'Session-adjacent operations during iteration (e.g. export prototype state or post AI annotations).',
      ),
    export: zod
      .discriminatedUnion('action', [
        zod.object({
          action: zod.literal('export_edit_session'),
          ...(exportEditSession.schema as Record<string, any>),
        }),
        zod.object({
          action: zod.literal('commit_edit_session_to_files'),
          ...(commitEditSessionToFiles.schema as Record<string, any>),
        }),
        zod.object({
          action: zod.literal('clear_edit_session'),
          ...(clearEditSession.schema as Record<string, any>),
        }),
      ])
      .optional()
      .describe('Export/commit/clear session state. This is the explicit write/export step.'),
    interact: zod
      .discriminatedUnion('type', [
        zod.object({
          type: zod.literal('questionnaire'),
          questions: zod.array(zod.string()).describe('List of questions for the user.'),
          title: zod.string().optional().describe('Optional title for the questionnaire.'),
        }),
        zod.object({
          type: zod.literal('plans_notification'),
          plans: zod.array(zod.string()).describe('List of planned actions to show the user.'),
          title: zod.string().optional().describe('Optional title for the plans notification.'),
        }),
      ])
      .optional()
      .describe('Gather information or notify user of plans via interactive forms.'),
  },
  handler: async (request, response, context) => {
    const begin = (request.params as any).begin;
    const edit = (request.params as any).edit;
    const exportOp = (request.params as any).export;
    const interact = (request.params as any).interact;
    const provided = [begin, edit, exportOp, interact].filter(Boolean).length;
    if (provided !== 1) {
      throw new Error('Provide exactly one of: begin, edit, export, interact.');
    }

    if (begin) {
      await beginLiveEditingSessionHandler({params: begin as any}, response, context);
      return;
    }

    if (edit) {
      const {action, ...rest} = edit as Record<string, unknown>;
      if (action === 'export_prototype_state') {
        await exportPrototypeState.handler({params: rest as any}, response, context);
        return;
      }
      if (action === 'annotate') {
        const page = context.getSelectedPage();
        const success = await page.evaluate((params) => {
          const api = (window as any).__MCP_LIVE_EDITING__;
          if (!api?.addAnnotation) {
            return false;
          }
          return api.addAnnotation({
            ...params,
            source: 'ai',
          });
        }, rest);
        const workflowState = context.getLiveEditingWorkflowState();
        response.appendResponseLine('```json');
        response.appendResponseLine(
          JSON.stringify(
            {
              success,
              workflow_state: workflowState,
              ai_instruction:
                workflowState === 'live_editing' ? LIVE_EDITING_AI_INSTRUCTION : undefined,
            },
            null,
            2,
          ),
        );
        response.appendResponseLine('```');
        return;
      }
      throw new Error(`Unsupported edit action: ${String(action)}`);
    }

    if (exportOp) {
      const {action, ...rest} = exportOp as Record<string, unknown>;
      if (action === 'export_edit_session') {
        await exportEditSession.handler({params: rest as any}, response, context);
        const workflowState = context.getLiveEditingWorkflowState();
        response.appendResponseLine('```json');
        response.appendResponseLine(
          JSON.stringify(
            {
              workflow_state: workflowState,
              ai_instruction:
                workflowState === 'live_editing' ? LIVE_EDITING_AI_INSTRUCTION : undefined,
            },
            null,
            2,
          ),
        );
        response.appendResponseLine('```');
        return;
      }
      if (action === 'commit_edit_session_to_files') {
        await commitEditSessionToFiles.handler({params: rest as any}, response, context);
        context.setLiveEditingWorkflowState('idle');
        response.appendResponseLine('```json');
        response.appendResponseLine(JSON.stringify({workflow_state: 'idle'}, null, 2));
        response.appendResponseLine('```');
        return;
      }
      if (action === 'clear_edit_session') {
        await clearEditSession.handler({params: rest as any}, response, context);
        context.setLiveEditingWorkflowState('idle');
        response.appendResponseLine('```json');
        response.appendResponseLine(JSON.stringify({workflow_state: 'idle'}, null, 2));
        response.appendResponseLine('```');
        return;
      }
      throw new Error(`Unsupported export action: ${String(action)}`);
    }

    if (interact) {
      const page = context.getSelectedPage();
      const result = await page.evaluate((params) => {
        const api = (window as any).__MCP_LIVE_EDITING__;
        if (!api?.showInteractForm) {
          throw new Error('Live editing overlay with interact support not installed or page not ready.');
        }
        return api.showInteractForm(params);
      }, interact);
      
      const workflowState = context.getLiveEditingWorkflowState();
      response.appendResponseLine('```json');
      response.appendResponseLine(
        JSON.stringify(
          {
            ok: true,
            interactResult: result,
            workflow_state: workflowState,
            ai_instruction:
              workflowState === 'live_editing' ? LIVE_EDITING_AI_INSTRUCTION : undefined,
          },
          null,
          2,
        ),
      );
      response.appendResponseLine('```');
      return;
    }
  },
});


