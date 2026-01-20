/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const beginEditSession = defineTool({
  name: 'begin_edit_session',
  description:
    'Start (and optionally activate) an edit session used to buffer live-in-Chromium edits during an interactive workflow.\n\n' +
    'This is designed to keep the loop fast (apply changes in the Chromium instance) and defer filesystem writes until an explicit export/commit step.',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    category: ToolCategory.DEBUGGING,
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
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod.string().optional().describe('Optional session id. If omitted, returns the active session.'),
  },
  handler: async (request, response, context) => {
    const sessionId = request.params.sessionId ?? context.getActiveEditSessionId();
    if (!sessionId) {
      throw new Error('No active edit session. Call begin_edit_session first (or pass sessionId).');
    }
    const session = context.getEditSession(sessionId);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(session, null, 2));
    response.appendResponseLine('```');
  },
});

export const setActiveEditSession = defineTool({
  name: 'set_active_edit_session',
  description: 'Set (or clear) the active edit session used by recordToSession-enabled tools.',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    sessionId: zod.string().optional().describe('Session id to clear. If omitted, clears the active session.'),
  },
  handler: async (request, response, context) => {
    const sessionId = request.params.sessionId ?? context.getActiveEditSessionId();
    if (!sessionId) {
      throw new Error('No active edit session. Call begin_edit_session first (or pass sessionId).');
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
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    sessionId: zod.string().optional().describe('Optional session id. If omitted, exports the active session.'),
    filePath: zod.string().optional().describe('Optional output path. If omitted, writes to a temporary file.'),
  },
  handler: async (request, response, context) => {
    const sessionId = request.params.sessionId ?? context.getActiveEditSessionId();
    if (!sessionId) {
      throw new Error('No active edit session. Call begin_edit_session first (or pass sessionId).');
    }
    const session = context.getEditSession(sessionId);
    const bytes = new TextEncoder().encode(JSON.stringify(session, null, 2));
    const filename = request.params.filePath
      ? (await context.saveFile(bytes, request.params.filePath)).filename
      : (await context.saveTemporaryFile(bytes, 'application/json', `edit-session-${sessionId}`)).filename;

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify({sessionId, filename, changeCount: session.changes.length}, null, 2));
    response.appendResponseLine('```');
  },
});

export const commitEditSessionToFiles = defineTool({
  name: 'commit_edit_session_to_files',
  description:
    'Best-effort commit of recorded changes into local files.\n\n' +
    'This intentionally runs as an explicit end-of-session step to avoid editor lag during iteration. Currently supports appending recorded CSS/JS snippets to files referenced by targetFilePath (recorded via recordToSession-enabled tools).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    sessionId: zod.string().optional().describe('Optional session id. If omitted, commits the active session.'),
    dryRun: zod.boolean().optional().default(false).describe('If true, do not write files; only report what would happen.'),
  },
  handler: async (request, response, context) => {
    const sessionId = request.params.sessionId ?? context.getActiveEditSessionId();
    if (!sessionId) {
      throw new Error('No active edit session. Call begin_edit_session first (or pass sessionId).');
    }
    const session = context.getEditSession(sessionId);

    const writes = new Map<string, string[]>();
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
          const header = `/* mcp-edit-session:${sessionId} change:${change.changeId} type:${change.type} at:${new Date(change.createdAt).toISOString()} */\n`;
          const footer = `\n/* end mcp-edit-session:${sessionId} change:${change.changeId} */\n`;
          writes.set(path.resolve(target), [...(writes.get(path.resolve(target)) ?? []), `${header}${cssText}${footer}`]);
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
          const header = `// mcp-edit-session:${sessionId} change:${change.changeId} type:${change.type} at:${new Date(change.createdAt).toISOString()}\n`;
          const footer = `\n// end mcp-edit-session:${sessionId} change:${change.changeId}\n`;
          writes.set(path.resolve(target), [...(writes.get(path.resolve(target)) ?? []), `${header}${jsText}${footer}`]);
        }
      }
    }

    const planned = Array.from(writes.entries()).map(([filePath, chunks]) => ({
      filePath,
      appendChunks: chunks.length,
      appendBytes: chunks.reduce((n, c) => n + c.length, 0),
    }));

    if (!request.params.dryRun) {
      for (const [filePath, chunks] of writes.entries()) {
        // Ensure directory exists and file exists (append creates if missing).
        await fs.mkdir(path.dirname(filePath), {recursive: true});
        await fs.appendFile(filePath, `\n${chunks.join('\n')}`, 'utf8');
      }
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          sessionId,
          dryRun: request.params.dryRun,
          plannedWrites: planned,
          committedFiles: request.params.dryRun ? 0 : planned.length,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});


