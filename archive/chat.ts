/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import {McpResponse} from '../McpResponse.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  applyUnifiedDiff,
  previewUnifiedDiffFromCommitPlan,
} from './diff.js';
import {
  beginEditSession,
  exportEditSession,
  previewCommitPlan,
  applyCommitPlan,
} from './edit-session.js';
import {
  insertCss,
  insertJs,
  manipulateDom,
  rollbackAll,
  rollbackPatch,
} from './mutation.js';
import {exportPrototypeState} from './prototype.js';
import {defineTool} from './ToolDefinition.js';

type ChatboxCommand =
  | {kind: 'help'}
  | {kind: 'status'}
  | {kind: 'begin_session'; label?: string}
  | {kind: 'export_session'; filePath?: string}
  | {kind: 'export_prototype_state'; outputDir?: string; baseName?: string; mode?: 'single_html' | 'split_files'; includeExternal?: boolean; includeChatbox?: boolean}
  | {kind: 'insert_css'; cssText: string; targetFilePath?: string; patchId?: string; replaceExisting?: boolean}
  | {kind: 'insert_js'; jsText: string; targetFilePath?: string; patchId?: string; replaceExisting?: boolean}
  | {kind: 'manipulate_dom'; operations: any[]}
  | {kind: 'rollback_patch'; patchId: string}
  | {kind: 'rollback_all'}
  | {kind: 'preview_commit_plan'; rootDir?: string; maxChunkPreviewLength?: number}
  | {kind: 'preview_diff_from_commit_plan'; rootDir?: string; contextLines?: number; allowCreate?: boolean}
  | {kind: 'apply_commit_plan'; rootDir?: string; dryRun?: boolean; confirm?: boolean}
  | {kind: 'apply_unified_diff'; rootDir?: string; dryRun?: boolean; allowCreate?: boolean; confirm?: boolean};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractFirstJsonFence(lines: readonly string[]): string | null {
  const start = lines.findIndex(l => l.trim() === '```json');
  if (start < 0) {return null;}
  const end = lines.findIndex((l, idx) => idx > start && l.trim() === '```');
  if (end < 0) {return null;}
  const jsonText = lines.slice(start + 1, end).join('\n').trim();
  return jsonText || null;
}

async function setChatboxStateOnPage(
  page: any,
  patchId: string | null,
  state: {lastPlanJson?: string | null; lastDiff?: string | null} | null,
): Promise<void> {
  try {
    await page.evaluate(
      ({patchId, state}: {patchId: string | null; state: any}) => {
        const w = window as any;
        const api = w.__MCP_CHATBOX__;
        if (!api) {return;}
        if (patchId && api.patchId && patchId !== api.patchId) {return;}
        api.state = {...(api.state || {}), ...(state || {})};
      },
      {patchId, state},
    );
  } catch {
    // Best-effort only.
  }
}

async function appendAssistant(page: any, patchId: string | null, text: string): Promise<void> {
  await page.evaluate(
    ({patchId, text}: {patchId: string | null; text: string}) => {
      const w = window as any;
      const api = w.__MCP_CHATBOX__;
      if (!api || typeof api.appendAssistantMessage !== 'function') {return;}
      if (patchId && api.patchId && patchId !== api.patchId) {return;}
      api.appendAssistantMessage(String(text ?? ''));
    },
    {patchId, text},
  );
}

function parseCommandFromMessage(text: string): ChatboxCommand | null {
  const raw = String(text ?? '').trim();
  if (!raw) {return null;}

  // Preferred: JSON command emitted by the chatbox UI.
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const obj = JSON.parse(raw) as any;
      if (obj && typeof obj === 'object' && typeof obj.kind === 'string') {
        return obj as ChatboxCommand;
      }
    } catch {
      // fall through
    }
  }

  // Minimal slash commands (for power users).
  if (raw === '/help') {return {kind: 'help'};}
  if (raw === '/status') {return {kind: 'status'};}
  if (raw.startsWith('/begin')) {
    const label = raw.replace(/^\/begin\s*/, '').trim();
    return {kind: 'begin_session', label: label || undefined};
  }
  if (raw.startsWith('/css ')) {
    return {kind: 'insert_css', cssText: raw.slice(5)};
  }
  if (raw.startsWith('/js ')) {
    return {kind: 'insert_js', jsText: raw.slice(4)};
  }
  if (raw === '/export') {return {kind: 'export_session'};}
  if (raw === '/plan') {return {kind: 'preview_commit_plan'};}
  if (raw === '/diff') {return {kind: 'preview_diff_from_commit_plan'};}
  if (raw === '/apply') {return {kind: 'apply_commit_plan', dryRun: true, confirm: false};}

  return null;
}

function renderHelpText(): string {
  return [
    'This chatbox is **workflow-only**: browser-first edits recorded into an edit session, then explicitly exported/committed when ready.',
    '',
    '**Buttons** in the panel enqueue structured commands (recommended).',
    '',
    '**Slash commands (minimal)**:',
    '- `/begin [label]`',
    '- `/status`',
    '- `/css <cssText>` (records into edit session; optionally set target file in UI)',
    '- `/js <jsText>` (records into edit session; optionally set target file in UI)',
    '- `/export`',
    '- `/summary`',
    '- `/plan` (preview commit plan; no writes)',
    '- `/diff` (preview unified diff; no writes)',
    '- `/apply` (dry run apply; no writes)',
    '',
    '**Commit safety**: apply/commit commands require explicit confirmation in the UI.',
  ].join('\n');
}

async function runTool(
  tool: {name: string; handler: (req: any, res: any, ctx: any) => Promise<void>},
  params: Record<string, unknown>,
  context: any,
): Promise<{lines: readonly string[]; json: string | null}> {
  const r = new McpResponse();
  await tool.handler({params}, r, context);
  const lines = r.responseLines;
  return {lines, json: extractFirstJsonFence(lines)};
}

export const chatboxStep = defineTool({
  name: 'chatbox_step',
  description:
    'Drain pending user messages from the injected in-page chatbox (`inject_chatbox`) and append assistant replies back into the chat UI.\n\n' +
    '**Purpose:** This is a minimal bridge for chat-driven iteration without requiring any network wiring.\n' +
    'A higher-level agent can call this tool in a loop: user types → call `chatbox_step` → optionally call other tools → write results back.\n',
  annotations: {
    category: ToolCategory.CHATBOX,
    readOnlyHint: false,
  },
  schema: {
    patchId: zod
      .string()
      .optional()
      .describe(
        'Optional chatbox patchId to target. If omitted, uses `window.__MCP_CHATBOX__.patchId`.',
      ),
    maxMessages: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(20)
      .describe('Maximum number of queued messages to drain in one call.'),
    // This tool is now workflow-only and always interprets drained messages as structured commands.
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;

    // Note: when invoked directly (unit tests), zod defaults may not be applied.
    const maxMessages = request.params.maxMessages ?? 20;
    const requestedPatchId = request.params.patchId;

    const result = await page.evaluate(
      ({maxMessages, patchId}) => {
        const w = window as any;
        const api = w.__MCP_CHATBOX__;
        if (!api || !api.inbox || !Array.isArray(api.inbox)) {
          return {
            ok: false,
            error: 'No chatbox inbox found. Did you run inject_chatbox on this page?',
            drained: [],
            usedPatchId: null,
          };
        }

        const usedPatchId = patchId ?? api.patchId ?? null;
        const drained = api.inbox.splice(0, Math.max(0, maxMessages));

        return {
          ok: true,
          drained,
          usedPatchId,
        };
      },
      {maxMessages, patchId: requestedPatchId},
    );

    // Workflow-only behavior: interpret drained messages as structured commands and execute
    // the edit-session workflow tools server-side. This keeps changes browser-first and
    // commits explicit.
    const usedPatchId = (result as any).usedPatchId ?? null;
    const drained = Array.isArray((result as any).drained) ? (result as any).drained : [];

    // Keep per-page state in the chatbox so subsequent buttons can reuse plan/diff.
    let lastPlanJson: string | null = null;
    let lastDiff: string | null = null;
    try {
      const state = await page.evaluate(({patchId}) => {
        const w = window as any;
        const api = w.__MCP_CHATBOX__;
        if (!api) {return null;}
        if (patchId && api.patchId && patchId !== api.patchId) {return null;}
        return api.state || null;
      }, {patchId: usedPatchId});
      lastPlanJson = state?.lastPlanJson ?? null;
      lastDiff = state?.lastDiff ?? null;
    } catch {
      // ignore
    }

    for (const msg of drained) {
      const text = msg && typeof msg.text === 'string' ? msg.text : '';
      const cmd = parseCommandFromMessage(text);
      if (!cmd) {
        await appendAssistant(
          page,
          usedPatchId,
          [
            'This panel only supports the live-edit-session workflow.',
            'Use the buttons (recommended) or type `/help`.',
          ].join('\n'),
        );
        continue;
      }

      try {
        if (cmd.kind === 'help') {
          await appendAssistant(page, usedPatchId, renderHelpText());
          continue;
        }

        if (cmd.kind === 'status') {
          const active = context.getActiveEditSessionId();
          const changeCount =
            active ? context.getEditSession(active).changes.length : 0;
          const patches = context.listPatches({pageId});
          await appendAssistant(
            page,
            usedPatchId,
            safeStringify({
              pageId,
              activeEditSessionId: active,
              changeCount,
              patches: patches.map(p => ({patchId: p.patchId, patchType: p.patchType, createdAt: p.createdAt})),
              hasLastPlan: Boolean(lastPlanJson),
              hasLastDiff: Boolean(lastDiff),
            }),
          );
          continue;
        }

        if (cmd.kind === 'begin_session') {
          const {lines} = await runTool(
            beginEditSession,
            {label: cmd.label, setActive: true},
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'insert_css') {
          const {lines} = await runTool(
            insertCss,
            {
              cssText: cmd.cssText,
              patchId: cmd.patchId,
              replaceExisting: cmd.replaceExisting ?? true,
              recordToSession: true,
              targetFilePath: cmd.targetFilePath,
            },
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'insert_js') {
          const {lines} = await runTool(
            insertJs,
            {
              jsText: cmd.jsText,
              patchId: cmd.patchId,
              replaceExisting: cmd.replaceExisting ?? true,
              recordToSession: true,
              targetFilePath: cmd.targetFilePath,
            },
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'manipulate_dom') {
          const {lines} = await runTool(
            manipulateDom,
            {operations: cmd.operations, recordToSession: true},
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'rollback_patch') {
          const {lines} = await runTool(
            rollbackPatch,
            {patchId: cmd.patchId, recordToSession: true},
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'rollback_all') {
          const {lines} = await runTool(rollbackAll, {recordToSession: true}, context);
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'export_session') {
          const {lines} = await runTool(
            exportEditSession,
            {sessionId: context.getActiveEditSessionId(), filePath: cmd.filePath},
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'export_prototype_state') {
          const {lines} = await runTool(
            exportPrototypeState,
            {
              outputDir: cmd.outputDir,
              baseName: cmd.baseName,
              mode: cmd.mode ?? 'single_html',
              includeExternal: cmd.includeExternal ?? true,
              includeChatbox: cmd.includeChatbox ?? false,
            },
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'preview_commit_plan') {
          const {lines, json} = await runTool(
            previewCommitPlan,
            {
              sessionId: context.getActiveEditSessionId(),
              rootDir: cmd.rootDir,
              includeChunkContents: true,
              checkAlreadyApplied: true,
              maxChunkPreviewLength: cmd.maxChunkPreviewLength ?? 800,
            },
            context,
          );
          if (json) {
            lastPlanJson = json;
            await setChatboxStateOnPage(page, usedPatchId, {lastPlanJson});
          }
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'preview_diff_from_commit_plan') {
          if (!lastPlanJson) {
            await appendAssistant(page, usedPatchId, 'No commit plan cached yet. Run “Preview plan” first.');
            continue;
          }
          const {lines} = await runTool(
            previewUnifiedDiffFromCommitPlan,
            {
              planJson: lastPlanJson,
              rootDir: cmd.rootDir,
              contextLines: cmd.contextLines ?? 3,
              allowCreate: cmd.allowCreate ?? false,
              skipIfAlreadyApplied: true,
            },
            context,
          );
          // Cache the diff text if present.
          const json = extractFirstJsonFence(lines);
          if (json) {
            try {
              const obj = JSON.parse(json) as any;
              if (obj && typeof obj.diff === 'string') {
                lastDiff = obj.diff;
                await setChatboxStateOnPage(page, usedPatchId, {lastDiff});
              }
            } catch {
              // ignore
            }
          }
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'apply_commit_plan') {
          if (!lastPlanJson) {
            await appendAssistant(page, usedPatchId, 'No commit plan cached yet. Run “Preview plan” first.');
            continue;
          }
          if (!cmd.confirm && !(cmd.dryRun ?? false)) {
            await appendAssistant(
              page,
              usedPatchId,
              'Refusing to write files: set `confirm: true` in the UI “Apply” action. (Dry-run is always allowed.)',
            );
            continue;
          }
          const {lines} = await runTool(
            applyCommitPlan,
            {
              planJson: lastPlanJson,
              rootDir: cmd.rootDir,
              dryRun: cmd.dryRun ?? false,
            },
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }

        if (cmd.kind === 'apply_unified_diff') {
          if (!lastDiff) {
            await appendAssistant(page, usedPatchId, 'No diff cached yet. Run “Preview diff” first.');
            continue;
          }
          if (!cmd.confirm && !(cmd.dryRun ?? false)) {
            await appendAssistant(
              page,
              usedPatchId,
              'Refusing to patch files: set `confirm: true` in the UI “Apply diff” action. (Dry-run is always allowed.)',
            );
            continue;
          }
          const {lines} = await runTool(
            applyUnifiedDiff,
            {
              diff: lastDiff,
              rootDir: cmd.rootDir,
              dryRun: cmd.dryRun ?? false,
              allowCreate: cmd.allowCreate ?? false,
            },
            context,
          );
          await appendAssistant(page, usedPatchId, lines.join('\n'));
          continue;
        }
      } catch (e) {
        await appendAssistant(
          page,
          usedPatchId,
          `Error running command ${cmd.kind}:\n` + String((e as Error)?.message ?? e),
        );
      }
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          pageId,
          ...result,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});





