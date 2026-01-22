/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {EditSession} from '../McpContext.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
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

function toIso(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function truncate(text: string, maxLen: number): string {
  if (maxLen <= 0) {
    return '';
  }
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen - 1) + '…';
}

function renderEditSessionMarkdownSummary(
  session: EditSession,
  options?: {maxSnippetLength?: number},
): string {
  const maxSnippetLength = options?.maxSnippetLength ?? 600;
  const lines: string[] = [];
  lines.push(`# Edit Session Summary: ${session.sessionId}`);
  if (session.label) {
    lines.push(`- **Label:** ${session.label}`);
  }
  lines.push(`- **Created:** ${toIso(session.createdAt)}`);
  lines.push(`- **Changes:** ${session.changes.length}`);
  lines.push('');
  lines.push('## Changes');
  lines.push('');

  if (session.changes.length === 0) {
    lines.push('_No recorded changes._');
    return lines.join('\n');
  }

  for (const change of session.changes) {
    lines.push(`### ${change.changeId} — ${change.type}`);
    lines.push(`- **Time:** ${toIso(change.createdAt)}`);
    lines.push(`- **Page:** ${change.pageId}`);
    if (change.patchId) {
      lines.push(`- **Patch:** ${change.patchId}`);
    }
    if (change.targetFilePath) {
      lines.push(`- **Target file:** \`${change.targetFilePath}\``);
    }
    if (change.description) {
      lines.push(`- **Description:** ${change.description}`);
    }

    const payload = change.payload && typeof change.payload === 'object'
      ? (change.payload as Record<string, unknown>)
      : null;

    const cssText =
      payload && typeof payload.cssText === 'string' ? payload.cssText : undefined;
    const jsText =
      payload && typeof payload.jsText === 'string' ? payload.jsText : undefined;

    const snippet = cssText ?? jsText;
    if (snippet && snippet.trim()) {
      const fence = cssText ? 'css' : 'javascript';
      lines.push('');
      lines.push('```' + fence);
      lines.push(truncate(snippet.trim(), maxSnippetLength));
      lines.push('```');
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
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

export const summarizeEditSession = defineTool({
  name: 'summarize_edit_session',
  description:
    'Summarize an edit session into human-readable Markdown (optionally saving it to disk). Useful for sharing/PR prep without committing any changes.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod
      .string()
      .optional()
      .describe('Optional session id. If omitted, summarizes the active session.'),
    maxSnippetLength: zod
      .number()
      .int()
      .min(0)
      .optional()
      .default(600)
      .describe(
        'Maximum length of CSS/JS snippet previews included per change (0 disables snippet previews).',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'Optional output path. If provided, writes the markdown summary to this file.',
      ),
  },
  handler: async (request, response, context) => {
    const session = getEditSessionOrThrow(context, request.params.sessionId);
    const markdown = renderEditSessionMarkdownSummary(session, {
      maxSnippetLength: request.params.maxSnippetLength,
    });

    const filename = request.params.filePath
      ? (await context.saveFile(new TextEncoder().encode(markdown), request.params.filePath))
          .filename
      : undefined;

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          sessionId: session.sessionId,
          label: session.label ?? null,
          createdAt: session.createdAt,
          changeCount: session.changes.length,
          filename: filename ?? null,
          markdown,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const exportEditSessionPackage = defineTool({
  name: 'export_edit_session_package',
  description:
    'Export an edit session as a small “package folder”: JSON session log + a Markdown summary. This is Level-1 friendly (shareable) and still makes no repo edits.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod
      .string()
      .optional()
      .describe('Optional session id. If omitted, exports the active session.'),
    outputDir: zod
      .string()
      .optional()
      .describe(
        'Optional output directory to write the package into. If omitted, creates a temporary directory.',
      ),
    maxSnippetLength: zod
      .number()
      .int()
      .min(0)
      .optional()
      .default(600)
      .describe(
        'Maximum length of CSS/JS snippet previews included in the generated summary markdown (0 disables snippet previews).',
      ),
  },
  handler: async (request, response, context) => {
    const session = getEditSessionOrThrow(context, request.params.sessionId);
    const outputDir = request.params.outputDir
      ? path.resolve(request.params.outputDir)
      : await fs.mkdtemp(
          path.join(os.tmpdir(), `chrome-devtools-mcp-edit-session-${session.sessionId}-`),
        );

    await fs.mkdir(outputDir, {recursive: true});

    const sessionJsonPath = path.join(outputDir, 'edit-session.json');
    const summaryPath = path.join(outputDir, 'edit-session-summary.md');

    const sessionJson = JSON.stringify(session, null, 2);
    const summaryMarkdown = renderEditSessionMarkdownSummary(session, {
      maxSnippetLength: request.params.maxSnippetLength,
    });

    await fs.writeFile(sessionJsonPath, sessionJson, 'utf8');
    await fs.writeFile(summaryPath, summaryMarkdown, 'utf8');

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          sessionId: session.sessionId,
          outputDir,
          files: {
            sessionJson: sessionJsonPath,
            summaryMarkdown: summaryPath,
          },
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


