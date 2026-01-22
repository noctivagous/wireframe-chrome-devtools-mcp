/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import type {renderSvgWireframe} from './wireframe.js';

const PATCH_ID_ATTR = 'data-mcp-patch-id';
const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
const PATCH_KIND_ATTR = 'data-mcp-patch-kind';
const PATCH_OWNER_VALUE = 'wireframe-chrome-devtools-mcp';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

type WireframeSnapshotOutput = Parameters<typeof renderSvgWireframe>[0];

export const insertCss = defineTool({
  name: 'insert_css',
  description:
    'Insert a <style> tag into the current page with a patch id for later rollback.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    cssText: zod.string().describe('CSS text to insert into the page.'),
    patchId: zod
      .string()
      .optional()
      .describe(
        'Optional patch id. If omitted, the server generates a stable patch id.',
      ),
    replaceExisting: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, replaces an existing patch with the same patchId. If false, insertion is a no-op if patchId exists.',
      ),
    description: zod
      .string()
      .optional()
      .describe('Optional human description to store in the patch registry.'),

    // Optional change journaling (buffer edits during interactive sessions; commit/export later).
    recordToSession: zod
      .boolean()
      .optional()
      .describe(
        'If true, record this change into an edit session journal so it can be exported/committed later (useful to keep live iteration fast and delay filesystem writes).',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
    targetFilePath: zod
      .string()
      .optional()
      .describe(
        'Optional hint for later commit: which local file this CSS should be rolled into at end-of-session.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const patchId = request.params.patchId ?? context.createPatchId('css');

    const result = await page.evaluate(
      ({patchId, cssText, replaceExisting, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
        const find = () => {
          const nodes = Array.from(
            document.querySelectorAll(`style[${PATCH_ID_ATTR}]`),
          ) as HTMLStyleElement[];
          return (
            nodes.find(n => n.getAttribute(PATCH_ID_ATTR) === patchId) ?? null
          );
        };

        const existing = find();
        if (existing && !replaceExisting) {
          return {patchId, inserted: false, replaced: false, existed: true};
        }
        if (existing) {
          existing.remove();
        }

        const el = document.createElement('style');
        el.setAttribute(PATCH_ID_ATTR, patchId);
        el.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
        el.setAttribute(PATCH_KIND_ATTR, 'css');
        el.textContent = cssText;

        (document.head ?? document.documentElement).appendChild(el);
        return {
          patchId,
          inserted: true,
          replaced: Boolean(existing),
          existed: Boolean(existing),
        };
      },
      {
        patchId,
        cssText: request.params.cssText,
        replaceExisting: request.params.replaceExisting,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      },
    );

    context.registerPatch({
      patchId,
      patchType: 'css',
      pageId,
      createdAt: Date.now(),
      description: request.params.description,
    });

    if (request.params.recordToSession) {
      context.appendEditChange(
        {
          type: 'insert_css',
          pageId,
          createdAt: Date.now(),
          patchId,
          description: request.params.description,
          targetFilePath: request.params.targetFilePath,
          payload: {
            cssText: request.params.cssText,
            replaceExisting: request.params.replaceExisting ?? false,
          },
        },
        {sessionId: request.params.editSessionId, autoCreate: true},
      );
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ...result,
          pageId,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const insertJs = defineTool({
  name: 'insert_js',
  description:
    'Insert a <script> tag into the current page with a patch id for later rollback.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    jsText: zod.string().describe('JavaScript text to insert into the page.'),
    patchId: zod
      .string()
      .optional()
      .describe(
        'Optional patch id. If omitted, the server generates a stable patch id.',
      ),
    replaceExisting: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, replaces an existing patch with the same patchId. Note: replacement may re-execute the script.',
      ),
    description: zod
      .string()
      .optional()
      .describe('Optional human description to store in the patch registry.'),

    // Optional change journaling (buffer edits during interactive sessions; commit/export later).
    recordToSession: zod
      .boolean()
      .optional()
      .describe(
        'If true, record this change into an edit session journal so it can be exported/committed later (useful to keep live iteration fast and delay filesystem writes).',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
    targetFilePath: zod
      .string()
      .optional()
      .describe(
        'Optional hint for later commit: which local file this JS should be rolled into at end-of-session.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const patchId = request.params.patchId ?? context.createPatchId('js');

    const result = await page.evaluate(
      ({patchId, jsText, replaceExisting, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
        const find = () => {
          const nodes = Array.from(
            document.querySelectorAll(`script[${PATCH_ID_ATTR}]`),
          ) as HTMLScriptElement[];
          return (
            nodes.find(n => n.getAttribute(PATCH_ID_ATTR) === patchId) ?? null
          );
        };

        const existing = find();
        if (existing && !replaceExisting) {
          return {patchId, inserted: false, replaced: false, existed: true};
        }
        if (existing) {
          existing.remove();
        }

        const el = document.createElement('script');
        el.setAttribute(PATCH_ID_ATTR, patchId);
        el.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
        el.setAttribute(PATCH_KIND_ATTR, 'js');
        el.text = jsText;

        (document.head ?? document.documentElement).appendChild(el);
        return {
          patchId,
          inserted: true,
          replaced: Boolean(existing),
          existed: Boolean(existing),
        };
      },
      {
        patchId,
        jsText: request.params.jsText,
        replaceExisting: request.params.replaceExisting,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      },
    );

    context.registerPatch({
      patchId,
      patchType: 'js',
      pageId,
      createdAt: Date.now(),
      description: request.params.description,
    });

    if (request.params.recordToSession) {
      context.appendEditChange(
        {
          type: 'insert_js',
          pageId,
          createdAt: Date.now(),
          patchId,
          description: request.params.description,
          targetFilePath: request.params.targetFilePath,
          payload: {
            jsText: request.params.jsText,
            replaceExisting: request.params.replaceExisting ?? false,
          },
        },
        {sessionId: request.params.editSessionId, autoCreate: true},
      );
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ...result,
          pageId,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const rollbackPatch = defineTool({
  name: 'rollback_patch',
  description:
    'Rollback (remove) a previously inserted patch by patchId in the current page.',
  annotations: {
    category: ToolCategory.PATCH,
    readOnlyHint: false,
  },
  schema: {
    patchId: zod
      .string()
      .describe('Patch id previously returned by insert_css/insert_js.'),

    // Optional change journaling.
    recordToSession: zod
      .boolean()
      .optional()
      .describe('If true, record this rollback action into an edit session journal.'),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const patchId = request.params.patchId;

    const removed = await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
      const removedIds: string[] = [];
      const candidates = Array.from(
        document.querySelectorAll(`[${PATCH_ID_ATTR}]`),
      ) as HTMLElement[];
      for (const el of candidates) {
        if (el.getAttribute(PATCH_ID_ATTR) === patchId) {
          removedIds.push(patchId);
          el.remove();
        }
      }
      return {patchId, removed: removedIds.length > 0, removedCount: removedIds.length};
    }, {patchId, PATCH_ID_ATTR});

    // Always unregister even if the element isn't present (idempotent rollback).
    context.unregisterPatch(patchId);

    if (request.params.recordToSession) {
      context.appendEditChange(
        {
          type: 'rollback_patch',
          pageId,
          createdAt: Date.now(),
          patchId,
          payload: {patchId},
        },
        {sessionId: request.params.editSessionId, autoCreate: true},
      );
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ...removed,
          pageId,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const injectChatbox = defineTool({
  name: 'inject_chatbox',
  description:
    'Inject a dockable in-page chat panel into the current page. Returns a patchId that can be removed via `rollback_patch`.\n\n' +
    '**Notes:**\n' +
    '- This tool injects a **Live Edit Session** panel intended for the browser-first / deferred-commit workflow (edit sessions + explicit export/commit).\n' +
    '- Injection is idempotent: if the chatbox already exists and `replaceExisting=false`, the tool is a no-op and returns the existing patchId.\n',
  annotations: {
    category: ToolCategory.CHATBOX,
    readOnlyHint: false,
  },
  schema: {
    action: zod
      .enum(['inject', 'remove'])
      .optional()
      .default('inject')
      .describe('Whether to inject the chatbox or remove it (cleanup).'),
    patchId: zod
      .string()
      .optional()
      .describe(
        'Optional patch id. If omitted, the server generates a stable patch id.',
      ),
    description: zod
      .string()
      .optional()
      .describe('Optional human description to store in the patch registry.'),
    replaceExisting: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, replaces any existing injected chatbox UI in the page (even if it was injected under a different patchId).',
      ),
    dock: zod
      .enum(['right', 'left', 'bottom'])
      .optional()
      .default('right')
      .describe('Where to dock the chatbox UI.'),
    width: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(380)
      .describe('Width in pixels for left/right docked chatbox.'),
    height: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Height in pixels for bottom-docked chatbox.'),
    zIndex: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(2147483647)
      .describe('CSS z-index for the chatbox container.'),
    title: zod
      .string()
      .optional()
      .default('Chat')
      .describe('Title displayed in the chatbox header.'),
    placeholder: zod
      .string()
      .optional()
      .default('Type a message…')
      .describe('Placeholder text for the message input.'),
    startOpen: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If false, chatbox starts collapsed (header only).'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const requestedPatchId =
      request.params.patchId ?? context.createPatchId('chatbox');

    // Note: when tools are invoked directly (unit tests), zod defaults are not applied.
    // Keep explicit JS-side defaults here so the tool behaves sensibly in both contexts.
    const action = request.params.action ?? 'inject';
    const replaceExisting = request.params.replaceExisting ?? false;
    const dock = request.params.dock ?? 'right';
    const width = request.params.width ?? 380;
    const height = request.params.height;
    const zIndex = request.params.zIndex ?? 2147483647;
    const title = request.params.title ?? 'Chat';
    const placeholder = request.params.placeholder ?? 'Type a message…';
    const startOpen = request.params.startOpen ?? true;

    const result = await page.evaluate(
      ({
        action,
        patchId,
        replaceExisting,
        dock,
        width,
        height,
        zIndex,
        title,
        placeholder,
        startOpen,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      }) => {
        const ROOT_ID = 'mcp-chatbox-root';
        const existing = document.getElementById(ROOT_ID) as HTMLElement | null;
        const existingPatchId = existing?.getAttribute(PATCH_ID_ATTR) ?? null;

        if (action === 'remove') {
          if (!existing) {
            return {action, removed: false, removedPatchId: null, existed: false};
          }
          if (patchId && existingPatchId && patchId !== existingPatchId) {
            return {
              action,
              removed: false,
              removedPatchId: null,
              existed: true,
              existingPatchId,
              reason: 'Chatbox exists but patchId did not match.',
            };
          }
          const removedPatchId = existingPatchId ?? patchId ?? null;
          existing.remove();
          return {action, removed: true, removedPatchId, existed: true};
        }

        // action === 'inject'
        let replaced = false;
        let replacedPatchId: string | null = null;

        if (existing) {
          if (!replaceExisting) {
            return {
              action,
              patchId: existingPatchId ?? patchId,
              inserted: false,
              replaced: false,
              existed: true,
              rootId: ROOT_ID,
              dock,
            };
          }
          replaced = true;
          replacedPatchId = existingPatchId;
          existing.remove();
        }

        const host = document.createElement('div');
        host.id = ROOT_ID;
        host.setAttribute(PATCH_ID_ATTR, patchId);
        host.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
        host.setAttribute(PATCH_KIND_ATTR, 'chatbox');

        host.style.position = 'fixed';
        host.style.zIndex = String(zIndex);
        host.style.fontFamily =
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        host.style.color = '#111827';
        host.style.pointerEvents = 'auto';

        if (dock === 'right') {
          host.style.top = '0';
          host.style.right = '0';
          host.style.height = '100vh';
          host.style.width = `${width}px`;
        } else if (dock === 'left') {
          host.style.top = '0';
          host.style.left = '0';
          host.style.height = '100vh';
          host.style.width = `${width}px`;
        } else {
          // bottom
          host.style.left = '0';
          host.style.right = '0';
          host.style.bottom = '0';
          host.style.width = '100vw';
          host.style.height = `${height ?? 280}px`;
          host.style.maxHeight = '80vh';
        }

        const shadow = host.attachShadow({mode: 'open'});
        const escapeAttribute = (value: unknown) => {
          return String(value ?? '').replace(/"/g, '&quot;');
        };
        shadow.innerHTML = `
          <style>
            :host { all: initial; }
            .panel {
              height: 100%;
              width: 100%;
              box-sizing: border-box;
              background: rgba(255,255,255,0.92);
              border: 1px solid rgba(17, 24, 39, 0.20);
              border-${dock === 'right' ? 'left' : dock === 'left' ? 'right' : 'top'}: 1px solid rgba(17, 24, 39, 0.20);
              box-shadow: 0 12px 40px rgba(0,0,0,0.22);
              display: flex;
              flex-direction: column;
              backdrop-filter: blur(10px);
            }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 10px 10px;
              background: rgba(17, 24, 39, 0.92);
              color: #fff;
              user-select: none;
              cursor: default;
              gap: 8px;
            }
            .title {
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 0.2px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .header-actions { display: flex; gap: 6px; }
            button {
              font: inherit;
              border: 1px solid rgba(255,255,255,0.18);
              background: rgba(255,255,255,0.08);
              color: #fff;
              border-radius: 6px;
              padding: 4px 8px;
              cursor: pointer;
            }
            button:hover { background: rgba(255,255,255,0.14); }
            .body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
            .messages {
              flex: 1;
              min-height: 0;
              overflow: auto;
              padding: 10px;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .msg {
              font-size: 12px;
              line-height: 1.35;
              padding: 8px 10px;
              border-radius: 10px;
              max-width: 90%;
              word-break: break-word;
              border: 1px solid rgba(17, 24, 39, 0.10);
              background: rgba(255,255,255,0.96);
            }
            .msg.user { align-self: flex-end; background: rgba(219,234,254,0.95); border-color: rgba(59,130,246,0.25); }
            .msg.assistant { align-self: flex-start; background: rgba(243,244,246,0.95); }
            .composer {
              border-top: 1px solid rgba(17, 24, 39, 0.10);
              padding: 10px;
              display: flex;
              gap: 8px;
              background: rgba(255,255,255,0.70);
            }
            input[type="text"] {
              flex: 1;
              font: inherit;
              border-radius: 10px;
              border: 1px solid rgba(17, 24, 39, 0.18);
              padding: 8px 10px;
              outline: none;
              background: rgba(255,255,255,0.96);
              color: #111827;
            }
            input[type="text"]:focus { border-color: rgba(59,130,246,0.6); box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
            button.send {
              border: 1px solid rgba(59,130,246,0.45);
              background: rgba(59,130,246,0.92);
            }
            button.send:hover { background: rgba(59,130,246,1); }
            .collapsed .body { display: none; }

            /* Workflow-only controls (edit sessions + explicit export/commit). */
            .workflow {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              padding: 10px;
              border-top: 1px solid rgba(17, 24, 39, 0.10);
              background: rgba(249,250,251,0.82);
            }
            .workflow button {
              color: #111827;
              background: rgba(255,255,255,0.96);
              border: 1px solid rgba(17, 24, 39, 0.18);
              border-radius: 10px;
              padding: 6px 10px;
              font-size: 12px;
            }
            .workflow button:hover { background: rgba(243,244,246,0.96); }
            .workflow button.primary {
              color: #fff;
              background: rgba(17, 24, 39, 0.92);
              border-color: rgba(17, 24, 39, 0.92);
            }
            .workflow button.primary:hover { background: rgba(17, 24, 39, 1); }
            .workflow button.danger {
              color: #fff;
              background: rgba(185, 28, 28, 0.92);
              border-color: rgba(185, 28, 28, 0.92);
            }
            .workflow button.danger:hover { background: rgba(185, 28, 28, 1); }
            .workflow label {
              font-size: 11px;
              color: rgba(107,114,128,1);
              align-self: center;
            }
            .workflow input[type="text"] {
              flex: 1;
              min-width: 140px;
              font-size: 12px;
              padding: 6px 10px;
              border-radius: 10px;
            }
            .workflow .hint {
              flex-basis: 100%;
              font-size: 11px;
              color: rgba(107,114,128,1);
            }
          </style>
          <div class="panel ${startOpen ? '' : 'collapsed'}" data-role="panel">
            <div class="header">
              <div class="title" title="${escapeAttribute(title)}">${escapeAttribute(title)}</div>
              <div class="header-actions">
                <button type="button" data-role="toggle" title="Toggle">▾</button>
                <button type="button" data-role="close" title="Close">✕</button>
              </div>
            </div>
            <div class="body">
              <div class="messages" data-role="messages"></div>
              <div class="workflow" data-role="workflow">
                <button type="button" class="primary" data-role="begin">Begin session</button>
                <button type="button" data-role="status">Status</button>
                <button type="button" data-role="plan">Preview plan</button>
                <button type="button" data-role="diff">Preview diff</button>
                <button type="button" data-role="exportPrototype">Export prototype</button>
                <button type="button" data-role="export">Export</button>
                <button type="button" data-role="summary">Summary</button>
                <button type="button" class="danger" data-role="rollbackAll">Rollback all</button>
                <label>Target file (optional):</label>
                <input data-role="targetFile" type="text" placeholder="./styles.css (for journaling)" />
                <label>Confirm writes:</label>
                <input data-role="confirm" type="checkbox" />
                <button type="button" data-role="applyPlan">Apply plan</button>
                <button type="button" data-role="applyDiff">Apply diff</button>
                <div class="hint">
                  Workflow-only: make changes in the browser first, record to an edit session, then explicitly export/commit when ready.
                </div>
              </div>
              <div class="composer">
                <input data-role="input" type="text" placeholder="Use buttons above, or type: /help, /css &lt;...&gt;, /js &lt;...&gt;, /plan, /diff" />
                <button class="send" type="button" data-role="send">Run</button>
              </div>
            </div>
          </div>
        `;

        const panel = shadow.querySelector('[data-role="panel"]') as HTMLElement;
        const messages = shadow.querySelector('[data-role="messages"]') as HTMLElement;
        const input = shadow.querySelector('[data-role="input"]') as HTMLInputElement;
        const sendBtn = shadow.querySelector('[data-role="send"]') as HTMLButtonElement;
        const beginBtn = shadow.querySelector('[data-role="begin"]') as HTMLButtonElement;
        const statusBtn = shadow.querySelector('[data-role="status"]') as HTMLButtonElement;
        const planBtn = shadow.querySelector('[data-role="plan"]') as HTMLButtonElement;
        const diffBtn = shadow.querySelector('[data-role="diff"]') as HTMLButtonElement;
        const exportPrototypeBtn = shadow.querySelector('[data-role="exportPrototype"]') as HTMLButtonElement;
        const exportBtn = shadow.querySelector('[data-role="export"]') as HTMLButtonElement;
        const summaryBtn = shadow.querySelector('[data-role="summary"]') as HTMLButtonElement;
        const rollbackAllBtn = shadow.querySelector('[data-role="rollbackAll"]') as HTMLButtonElement;
        const applyPlanBtn = shadow.querySelector('[data-role="applyPlan"]') as HTMLButtonElement;
        const applyDiffBtn = shadow.querySelector('[data-role="applyDiff"]') as HTMLButtonElement;
        const targetFile = shadow.querySelector('[data-role="targetFile"]') as HTMLInputElement;
        const confirm = shadow.querySelector('[data-role="confirm"]') as HTMLInputElement;
        const toggleBtn = shadow.querySelector('[data-role="toggle"]') as HTMLButtonElement;
        const closeBtn = shadow.querySelector('[data-role="close"]') as HTMLButtonElement;

        const appendMessage = (role: 'user' | 'assistant', text: string) => {
          const el = document.createElement('div');
          el.className = `msg ${role}`;
          el.textContent = text;
          messages.appendChild(el);
          // Keep newest messages visible.
          messages.scrollTop = messages.scrollHeight;
        };

        const getTargetFilePath = () => {
          const v = (targetFile?.value ?? '').trim();
          return v || undefined;
        };

        const enqueueCmd = (cmd: any) => {
          const payload = JSON.stringify(cmd);
          appendMessage('user', payload);
          try {
            const w = window as any;
            w.__MCP_CHATBOX__ = w.__MCP_CHATBOX__ || {};
            w.__MCP_CHATBOX__.inbox = w.__MCP_CHATBOX__.inbox || [];
            w.__MCP_CHATBOX__.inbox.push({
              type: 'user',
              text: payload,
              createdAt: Date.now(),
              patchId,
            });
          } catch {
            // Best-effort only.
          }
          window.dispatchEvent(new CustomEvent('mcp-chatbox:send', {detail: {text: payload, patchId}}));
        };

        const doSend = () => {
          const text = (input.value ?? '').trim();
          if (!text) {
            return;
          }
          input.value = '';
          // Translate known workflow commands into structured JSON so the server can execute them.
          const targetFilePath = getTargetFilePath();
          if (text.startsWith('/css ')) {
            enqueueCmd({kind: 'insert_css', cssText: text.slice(5), targetFilePath});
            return;
          }
          if (text.startsWith('/js ')) {
            enqueueCmd({kind: 'insert_js', jsText: text.slice(4), targetFilePath});
            return;
          }
          if (text === '/help') {
            enqueueCmd({kind: 'help'});
            return;
          }
          if (text === '/status') {
            enqueueCmd({kind: 'status'});
            return;
          }
          if (text === '/begin') {
            enqueueCmd({kind: 'begin_session'});
            return;
          }
          if (text === '/export') {
            enqueueCmd({kind: 'export_session'});
            return;
          }
          if (text === '/summary') {
            enqueueCmd({kind: 'summarize_session'});
            return;
          }
          if (text === '/plan') {
            enqueueCmd({kind: 'preview_commit_plan'});
            return;
          }
          if (text === '/diff') {
            enqueueCmd({kind: 'preview_diff_from_commit_plan'});
            return;
          }
          if (text === '/apply') {
            const ok = Boolean((confirm as any)?.checked);
            enqueueCmd({kind: 'apply_commit_plan', dryRun: !ok, confirm: ok});
            return;
          }

          appendMessage('user', text);

          // Buffer messages for the agent/orchestrator to drain (no networking required).
          try {
            const w = window as any;
            w.__MCP_CHATBOX__ = w.__MCP_CHATBOX__ || {};
            w.__MCP_CHATBOX__.inbox = w.__MCP_CHATBOX__.inbox || [];
            w.__MCP_CHATBOX__.inbox.push({
              type: 'user',
              text,
              createdAt: Date.now(),
              patchId,
            });
          } catch {
            // Best-effort only.
          }

          window.dispatchEvent(
            new CustomEvent('mcp-chatbox:send', {
              detail: {text, patchId},
            }),
          );
        };

        sendBtn.addEventListener('click', doSend);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doSend();
          }
        });

        beginBtn.addEventListener('click', () => enqueueCmd({kind: 'begin_session'}));
        statusBtn.addEventListener('click', () => enqueueCmd({kind: 'status'}));
        planBtn.addEventListener('click', () => enqueueCmd({kind: 'preview_commit_plan'}));
        diffBtn.addEventListener('click', () => enqueueCmd({kind: 'preview_diff_from_commit_plan'}));
        exportPrototypeBtn.addEventListener('click', () => enqueueCmd({kind: 'export_prototype_state', mode: 'single_html'}));
        exportBtn.addEventListener('click', () => enqueueCmd({kind: 'export_session'}));
        summaryBtn.addEventListener('click', () => enqueueCmd({kind: 'summarize_session'}));
        rollbackAllBtn.addEventListener('click', () => enqueueCmd({kind: 'rollback_all'}));
        applyPlanBtn.addEventListener('click', () => {
          const ok = Boolean((confirm as any)?.checked);
          enqueueCmd({kind: 'apply_commit_plan', dryRun: !ok, confirm: ok});
        });
        applyDiffBtn.addEventListener('click', () => {
          const ok = Boolean((confirm as any)?.checked);
          enqueueCmd({kind: 'apply_unified_diff', dryRun: !ok, confirm: ok});
        });

        toggleBtn.addEventListener('click', () => {
          panel.classList.toggle('collapsed');
        });
        closeBtn.addEventListener('click', () => {
          // "Close" is intentionally non-destructive; cleanup is done via rollback_patch or action=remove.
          panel.classList.add('collapsed');
        });

        // Expose a tiny API for later orchestration (best-effort; safe to ignore).
        const w = window as any;
        w.__MCP_CHATBOX__ = {
          ...(w.__MCP_CHATBOX__ || {}),
          rootId: ROOT_ID,
          patchId,
          inbox: (w.__MCP_CHATBOX__ && w.__MCP_CHATBOX__.inbox) || [],
          outbox: (w.__MCP_CHATBOX__ && w.__MCP_CHATBOX__.outbox) || [],
          appendAssistantMessage: (text: string) => appendMessage('assistant', String(text ?? '')),
          state: (w.__MCP_CHATBOX__ && w.__MCP_CHATBOX__.state) || {lastPlanJson: null, lastDiff: null},
          getTargetFilePath,
        };

        document.documentElement.appendChild(host);

        return {
          action,
          patchId,
          inserted: true,
          replaced,
          replacedPatchId,
          existed: Boolean(existing),
          rootId: ROOT_ID,
          dock,
        };
      },
      {
        action,
        patchId: requestedPatchId,
        replaceExisting,
        dock,
        width,
        height,
        zIndex,
        title,
        placeholder,
        startOpen,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      },
    );

    if (action === 'remove') {
      const removedPatchId =
        (result as {removedPatchId?: string | null}).removedPatchId ?? null;
      if (removedPatchId) {
        context.unregisterPatch(removedPatchId);
      } else {
        // If user provided patchId, unregister it anyway (idempotent cleanup).
        context.unregisterPatch(requestedPatchId);
      }
    } else {
      const effectivePatchId =
        (result as {patchId?: string | null}).patchId ?? requestedPatchId;
      const replacedPatchId =
        (result as {replacedPatchId?: string | null}).replacedPatchId ?? null;

      // If we replaced a previously injected chatbox under a different patchId, clear its registry entry.
      if (replacedPatchId && replacedPatchId !== effectivePatchId) {
        context.unregisterPatch(replacedPatchId);
      }

      context.registerPatch({
        patchId: effectivePatchId,
        patchType: 'dom-manipulation',
        pageId,
        createdAt: Date.now(),
        description:
          request.params.description ?? `Injected chatbox UI (dock=${dock})`,
      });
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ...result,
          pageId,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const insertCssPreview = defineTool({
  name: 'insert_css_preview',
  description:
    'Insert CSS changes and automatically generate visual wireframe feedback wrapped in JSON. Supports testing multiple values, responsive breakpoints, and before/after comparisons.\n\n' +
    '**Guidance:**\n\n' +
    '- **Auto-rollback by default**: Changes are automatically rolled back after capturing snapshots (`autoRollback` defaults to `true`), making this safe for temporary CSS experimentation without affecting the live page state.\n' +
    '- **Multiple values for A/B testing**: Pass an array of different values to `values` (e.g., `["16px", "24px", "32px"]`) to quickly compare how different CSS values affect layout, with each value generating a separate wireframe snapshot for comparison.\n' +
    '- **Fast interactive workflow (recommended)**: Use `begin_edit_session`, then run `insert_css_preview` with `recordToSession: true` (optionally add `targetFilePath`). When you’re done experimenting, export (`export_edit_session`) and/or explicitly commit/apply to files (`preview_commit_plan` → `apply_commit_plan`, or `commit_edit_session_to_files`) once at the end.\n' +
    '- **Important contract**: previewing CSS changes modifies the live page, but does **not** write repo/source files unless you explicitly run a commit/apply tool.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // CSS targeting
    selector: zod.string().describe('CSS selector to target elements.'),
    property: zod.string().describe('CSS property to modify (e.g., "margin-bottom", "gap", "padding").'),
    values: zod
      .array(zod.string())
      .min(1)
      .describe('Array of CSS values to test. Each value will be applied and visually previewed.'),
    selectedValueIndex: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Optional index (0-based) indicating which value should be recorded as the "chosen" snippet when recordToSession=true. If omitted, the last value is recorded.',
      ),

    // Visual options
    showVisual: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, automatically generates SVG wireframe snapshots for visual feedback.'),
    highlightChanges: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, highlights changed elements in the visual snapshots.'),
    showDimensions: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, shows width×height dimensions on elements in the wireframe.'),

    // Responsive testing
    responsiveBreakpoints: zod
      .array(zod.object({
        name: zod.string().describe('Name for this breakpoint (e.g., "mobile", "tablet", "desktop").'),
        width: zod.number().int().positive().describe('Viewport width in pixels.'),
        height: zod.number().int().positive().describe('Viewport height in pixels.'),
      }))
      .optional()
      .describe('Optional responsive breakpoints to test. Will resize viewport and capture snapshots for each.'),

    // Output options
    filePath: zod
      .string()
      .optional()
      .describe('Optional path to save detailed results. If not provided, results are returned in the response.'),

    // Rollback options
    autoRollback: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, automatically rolls back CSS changes after capturing snapshots.'),

    // Optional change journaling (buffer edits during interactive sessions; commit/export later).
    recordToSession: zod
      .boolean()
      .optional()
      .describe(
        'If true, record this preview run into an edit session journal (useful to keep iteration fast and defer filesystem writes).',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
    targetFilePath: zod
      .string()
      .optional()
      .describe(
        'Optional hint for later commit: which local file the chosen CSS should be rolled into at end-of-session.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const {
      selector,
      property,
      values,
      selectedValueIndex,
      showVisual,
      highlightChanges,
      showDimensions,
      responsiveBreakpoints,
      filePath,
      autoRollback,
    } = request.params;

    // Store original viewport for restoration
    const originalViewport = await page.viewport();
    if (
      selectedValueIndex !== undefined &&
      (selectedValueIndex < 0 || selectedValueIndex >= values.length)
    ) {
      throw new Error(
        `selectedValueIndex out of range: got ${selectedValueIndex}, values.length=${values.length}`,
      );
    }

    const results: Array<{
      value: string;
      cssText: string;
      patchId: string;
      visualSnapshot?: {
        svg: string;
        dimensions: {width: number; height: number};
        changes?: Array<{
          element: string;
          oldValue?: string;
          newValue: string;
          visualDiff: string;
        }>;
      };
      responsiveSnapshots?: Array<{
        breakpoint: string;
        width: number;
        height: number;
        visualSnapshot: {
          svg: string;
          dimensions: {width: number; height: number};
        };
      }>;
    }> = [];

    try {
      // Take initial snapshot if we need to show changes
      let initialSnapshot: WireframeSnapshotOutput | null = null;
      if (showVisual && highlightChanges) {
        // Import wireframe functionality dynamically to avoid circular dependencies
        const { captureWireframeSnapshot } = await import('./wireframe.js');
        const { output } = await captureWireframeSnapshot({
          params: {
            selectors: [selector],
            includeDescendants: true,
            maxElements: 50,
            includeComputedStyles: true,
            stylePreset: 'standard',
            coordinateSpace: 'viewport',
          }
        }, context);
        initialSnapshot = output;
      }

      // Test each value
      const insertedPatchIds: string[] = [];
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        const cssText = `${selector} { ${property}: ${value} !important; }`;
        const patchId = context.createPatchId(`css-preview-${i}`);

        // Insert CSS
        const insertResult = await page.evaluate(
          ({patchId, cssText, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
            const el = document.createElement('style');
            el.setAttribute(PATCH_ID_ATTR, patchId);
            el.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
            el.setAttribute(PATCH_KIND_ATTR, 'css');
            el.textContent = cssText;

            (document.head ?? document.documentElement).appendChild(el);
            return {
              patchId,
              inserted: true,
            };
          },
          {
            patchId,
            cssText,
            PATCH_ID_ATTR,
            PATCH_OWNER_ATTR,
            PATCH_KIND_ATTR,
            PATCH_OWNER_VALUE,
          },
        );

        context.registerPatch({
          patchId,
          patchType: 'css',
          pageId,
          createdAt: Date.now(),
          description: `CSS Preview: ${selector} { ${property}: ${value} }`,
        });

        const result: (typeof results)[number] = {
          value,
          cssText,
          patchId: insertResult.patchId,
        };
        insertedPatchIds.push(insertResult.patchId);

        // Generate visual snapshot if requested
        if (showVisual) {
          const { captureWireframeSnapshot, renderSvgWireframe } = await import('./wireframe.js');
          const { output: currentSnapshot } = await captureWireframeSnapshot({
            params: {
              selectors: [selector],
              includeDescendants: true,
              maxElements: 50,
              includeComputedStyles: true,
              stylePreset: 'standard',
              coordinateSpace: 'viewport',
            }
          }, context);

          const svg = renderSvgWireframe(currentSnapshot, {
            scale: 1,
            background: 'transparent',
            showLabels: true,
            showDimensions: showDimensions ?? true,
            showSpacing: true, // Always show spacing for CSS preview
            strokeWidth: 1,
            fillOpacity: 0.08,
            highlightChanged: highlightChanges ?? true,
            previous: initialSnapshot ?? undefined,
          });

          const viewport = await page.viewport();
          result.visualSnapshot = {
            svg: svg,
            dimensions: { width: viewport?.width || 1200, height: viewport?.height || 800 },
          };

          // Add change information if we have initial snapshot
          if (initialSnapshot && highlightChanges) {
            const changes = [];
            const prevByBackend = new Map();
            for (const el of initialSnapshot.elements) {
              if (el.ref?.backendNodeId) {
                prevByBackend.set(el.ref.backendNodeId, el);
              }
            }

            for (const el of currentSnapshot.elements) {
              const prev = el.ref?.backendNodeId ? prevByBackend.get(el.ref.backendNodeId) : undefined;
              if (prev && el.computedStyles && prev.computedStyles) {
                const oldValue = prev.computedStyles[property];
                const newValue = el.computedStyles[property];
                if (oldValue !== newValue) {
                  changes.push({
                    element: `${el.tagName || ''}${el.id ? `#${el.id}` : ''}${el.classList?.length ? `.${el.classList.join('.')}` : ''}`,
                    oldValue,
                    newValue,
                    visualDiff: 'highlighted',
                  });
                }
              }
            }
            result.visualSnapshot.changes = changes;
          }
        }

        // Test responsive breakpoints if provided
        if (responsiveBreakpoints && responsiveBreakpoints.length > 0) {
          result.responsiveSnapshots = [];
          for (const breakpoint of responsiveBreakpoints) {
            await page.setViewport({
              width: breakpoint.width,
              height: breakpoint.height,
            });

            const { captureWireframeSnapshot, renderSvgWireframe } = await import('./wireframe.js');
            const { output: responsiveSnapshot } = await captureWireframeSnapshot({
              params: {
                selectors: [selector],
                includeDescendants: true,
                maxElements: 50,
                includeComputedStyles: true,
                stylePreset: 'standard',
                coordinateSpace: 'viewport',
              }
            }, context);

            const svg = renderSvgWireframe(responsiveSnapshot, {
              scale: 1,
              background: 'transparent',
              showLabels: true,
              showDimensions: showDimensions ?? true,
              showSpacing: true, // Always show spacing for CSS preview
              strokeWidth: 1,
              fillOpacity: 0.08,
              highlightChanged: false,
              previous: undefined,
            });

            result.responsiveSnapshots.push({
              breakpoint: breakpoint.name,
              width: breakpoint.width,
              height: breakpoint.height,
              visualSnapshot: {
                svg: svg,
                dimensions: { width: breakpoint.width, height: breakpoint.height },
              },
            });
          }
        }

        results.push(result);

        // Auto-rollback if requested (except for the last value; the last patch is handled below).
        if (autoRollback && i < values.length - 1) {
          await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
            const candidates = Array.from(document.querySelectorAll(`[${PATCH_ID_ATTR}]`)) as HTMLElement[];
            for (const el of candidates) {
              if (el.getAttribute(PATCH_ID_ATTR) === patchId) {
                el.remove();
              }
            }
          }, { patchId, PATCH_ID_ATTR });
          context.unregisterPatch(patchId);
        }
      }

      // If autoRollback=true, also remove the last applied patch to match the documented semantics.
      if (autoRollback && insertedPatchIds.length > 0) {
        const lastPatchId = insertedPatchIds[insertedPatchIds.length - 1];
        await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
          const candidates = Array.from(document.querySelectorAll(`[${PATCH_ID_ATTR}]`)) as HTMLElement[];
          for (const el of candidates) {
            if (el.getAttribute(PATCH_ID_ATTR) === patchId) {
              el.remove();
            }
          }
        }, { patchId: lastPatchId, PATCH_ID_ATTR });
        context.unregisterPatch(lastPatchId);
      }

      // Restore original viewport
      if (originalViewport) {
        await page.setViewport(originalViewport);
      }

      // Format response
      response.appendResponseLine(`Tested ${values.length} CSS values for \`${selector} { ${property}: ... }\``);

      // Return full results as JSON
      const recordedValueIndex =
        selectedValueIndex !== undefined ? selectedValueIndex : values.length - 1;
      const recorded = results[recordedValueIndex];
      const result = {
        selector,
        property,
        testedValues: values.length,
        results,
        autoRolledBack: autoRollback,
        recordedValueIndex,
        recordedValue: recorded?.value,
        recordedCssText: recorded?.cssText,
      };

      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result, null, 2));
      response.appendResponseLine('```');

      // Save to file if requested
      if (filePath) {
        const summary = {
          timestamp: new Date().toISOString(),
          selector,
          property,
          testedValues: values,
          results,
        };
        await context.saveFile(
          new TextEncoder().encode(JSON.stringify(summary, null, 2)),
          filePath
        );
        response.appendResponseLine(`\nSaved detailed results to ${filePath}`);
      }

      if (request.params.recordToSession) {
        const recordedValueIndex =
          selectedValueIndex !== undefined
            ? selectedValueIndex
            : Math.max(0, values.length - 1);
        const recorded = results[recordedValueIndex];
        context.appendEditChange(
          {
            type: 'insert_css_preview',
            pageId,
            createdAt: Date.now(),
            description: `CSS Preview: ${selector} { ${property}: [${values.join(', ')}] }`,
            targetFilePath: request.params.targetFilePath,
            payload: {
              selector,
              property,
              values,
              selectedValueIndex: recordedValueIndex,
              selectedValue: recorded?.value,
              cssText: recorded?.cssText,
              results: results.map(r => ({
                value: r.value,
                cssText: r.cssText,
                patchId: r.patchId,
              })),
              autoRollback,
            },
          },
          {sessionId: request.params.editSessionId, autoCreate: true},
        );
      }

    } catch (error) {
      // Restore viewport on error
      if (originalViewport) {
        try {
          await page.setViewport(originalViewport);
        } catch (_e) {
          // Ignore viewport restoration errors
        }
      }
      throw error;
    }
  },
});

export const insertJsPreview = defineTool({
  name: 'insert_js_preview',
  description:
    'Insert JavaScript changes and automatically generate visual wireframe feedback wrapped in JSON. Supports testing multiple script variants, responsive breakpoints, and before/after comparisons.\n\n' +
    '**Guidance:**\n\n' +
    '- **Rollback caveat**: `autoRollback` removes the injected `<script>` tag, but it cannot reliably undo side-effects (e.g., DOM mutations, timers, event listeners). Treat this as best-effort cleanup for exploration.\n' +
    '- **Multiple variants for A/B testing**: Pass multiple entries to `scripts` to compare outcomes; each variant generates its own wireframe snapshot.\n' +
    '- **Fast interactive workflow (recommended)**: Use `begin_edit_session`, then run `insert_js_preview` with `recordToSession: true` (optionally add `targetFilePath`). When you’re done experimenting, export (`export_edit_session`) and/or explicitly commit/apply to files (`preview_commit_plan` → `apply_commit_plan`, or `commit_edit_session_to_files`) once at the end.\n' +
    '- **Important contract**: previewing JS changes modifies the live page, but does **not** write repo/source files unless you explicitly run a commit/apply tool.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // JS payload
    scripts: zod
      .array(zod.string())
      .min(1)
      .describe(
        'Array of JavaScript snippets to test. Each entry is injected as a <script> tag and then snapshotted.',
      ),
    selectedScriptIndex: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Optional index (0-based) indicating which script should be recorded as the "chosen" snippet when recordToSession=true. If omitted, the last script is recorded.',
      ),
    waitAfterMs: zod
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe(
        'Optional delay (ms) after injecting a script before capturing snapshots (useful if the script triggers async DOM updates).',
      ),

    // Snapshot targeting (mirrors wireframe_snapshot basics)
    selectors: zod
      .array(zod.string())
      .optional()
      .describe(
        'Optional selectors to snapshot/highlight. If omitted, the snapshot covers the whole page (subject to maxElements cap).',
      ),
    scopeSelector: zod
      .string()
      .optional()
      .describe(
        'Optional scope root selector; when used with selectors, matching is resolved within this subtree.',
      ),
    includeDescendants: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, include matching elements’ descendants as well (within scopeSelector if provided).',
      ),
    maxElements: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(50)
      .describe('Maximum number of elements to include in snapshots (legacy alias for maxTotal).'),
    includeComputedStyles: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, include computed styles in the snapshot payload (larger output).'),
    computedStylePreset: zod
      .enum(['layout', 'typography', 'paint', 'standard', 'debug'])
      .optional()
      .describe(
        'Computed style preset to use when includeComputedStyles=true. If omitted, wireframe_snapshot defaults apply.',
      ),

    // Visual options
    showVisual: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically generates SVG wireframe snapshots for visual feedback.',
      ),
    highlightChanges: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, highlights changed elements in the visual snapshots (best-effort).',
      ),
    showDimensions: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, shows width×height dimensions on elements in the wireframe.'),

    // Responsive testing
    responsiveBreakpoints: zod
      .array(
        zod.object({
          name: zod
            .string()
            .describe('Name for this breakpoint (e.g., "mobile", "tablet", "desktop").'),
          width: zod.number().int().positive().describe('Viewport width in pixels.'),
          height: zod.number().int().positive().describe('Viewport height in pixels.'),
        }),
      )
      .optional()
      .describe(
        'Optional responsive breakpoints to test. Will resize viewport and capture snapshots for each.',
      ),

    // Output options
    filePath: zod
      .string()
      .optional()
      .describe(
        'Optional path to save detailed results. If not provided, results are returned in the response.',
      ),

    // Rollback options
    autoRollback: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically removes injected <script> tags after capturing snapshots (does not reliably undo side-effects).',
      ),

    // Optional change journaling (buffer edits during interactive sessions; commit/export later).
    recordToSession: zod
      .boolean()
      .optional()
      .describe(
        'If true, record this preview run into an edit session journal (useful to keep iteration fast and defer filesystem writes).',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
    targetFilePath: zod
      .string()
      .optional()
      .describe(
        'Optional hint for later commit: which local file the chosen JS should be rolled into at end-of-session.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const {
      scripts,
      selectedScriptIndex,
      waitAfterMs,
      selectors,
      scopeSelector,
      includeDescendants,
      maxElements,
      includeComputedStyles,
      computedStylePreset,
      showVisual,
      highlightChanges,
      showDimensions,
      responsiveBreakpoints,
      filePath,
      autoRollback,
    } = request.params;

    // Store original viewport for restoration
    const originalViewport = await page.viewport();
    if (
      selectedScriptIndex !== undefined &&
      (selectedScriptIndex < 0 || selectedScriptIndex >= scripts.length)
    ) {
      throw new Error(
        `selectedScriptIndex out of range: got ${selectedScriptIndex}, scripts.length=${scripts.length}`,
      );
    }

    const results: Array<{
      jsText: string;
      patchId: string;
      visualSnapshot?: {
        svg: string;
        dimensions: {width: number; height: number};
      };
      responsiveSnapshots?: Array<{
        breakpoint: string;
        width: number;
        height: number;
        visualSnapshot: {
          svg: string;
          dimensions: {width: number; height: number};
        };
      }>;
    }> = [];

    try {
      // Take initial snapshot if we need to show changes
      let initialSnapshot: WireframeSnapshotOutput | null = null;
      if (showVisual && highlightChanges) {
        const {captureWireframeSnapshot} = await import('./wireframe.js');
        const {output} = await captureWireframeSnapshot(
          {
            params: {
              selectors,
              scopeSelector,
              includeDescendants,
              maxElements,
              includeComputedStyles,
              computedStylePreset,
              coordinateSpace: 'viewport',
            },
          },
          context,
        );
        initialSnapshot = output;
      }

      const insertedPatchIds: string[] = [];
      for (let i = 0; i < scripts.length; i++) {
        const jsText = scripts[i];
        const patchId = context.createPatchId(`js-preview-${i}`);

        const insertResult = await page.evaluate(
          ({patchId, jsText, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
            const el = document.createElement('script');
            el.setAttribute(PATCH_ID_ATTR, patchId);
            el.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
            el.setAttribute(PATCH_KIND_ATTR, 'js');
            el.text = jsText;
            (document.head ?? document.documentElement).appendChild(el);
            return {patchId, inserted: true};
          },
          {
            patchId,
            jsText,
            PATCH_ID_ATTR,
            PATCH_OWNER_ATTR,
            PATCH_KIND_ATTR,
            PATCH_OWNER_VALUE,
          },
        );

        context.registerPatch({
          patchId,
          patchType: 'js',
          pageId,
          createdAt: Date.now(),
          description: `JS Preview: variant ${i + 1}/${scripts.length}`,
        });
        insertedPatchIds.push(insertResult.patchId);

        if (waitAfterMs && waitAfterMs > 0) {
          await new Promise(resolve => setTimeout(resolve, waitAfterMs));
        }

        const result: (typeof results)[number] = {
          jsText,
          patchId: insertResult.patchId,
        };

        if (showVisual) {
          const {captureWireframeSnapshot, renderSvgWireframe} = await import('./wireframe.js');
          const {output: currentSnapshot} = await captureWireframeSnapshot(
            {
              params: {
                selectors,
                scopeSelector,
                includeDescendants,
                maxElements,
                includeComputedStyles,
                computedStylePreset,
                coordinateSpace: 'viewport',
              },
            },
            context,
          );

          const svg = renderSvgWireframe(currentSnapshot, {
            scale: 1,
            background: 'transparent',
            showLabels: true,
            showDimensions: showDimensions ?? true,
            showSpacing: true,
            strokeWidth: 1,
            fillOpacity: 0.08,
            highlightChanged: highlightChanges ?? true,
            previous: initialSnapshot ?? undefined,
          });

          const viewport = await page.viewport();
          result.visualSnapshot = {
            svg,
            dimensions: {
              width: viewport?.width || 1200,
              height: viewport?.height || 800,
            },
          };
        }

        // Test responsive breakpoints if provided
        if (responsiveBreakpoints && responsiveBreakpoints.length > 0) {
          result.responsiveSnapshots = [];
          for (const breakpoint of responsiveBreakpoints) {
            await page.setViewport({
              width: breakpoint.width,
              height: breakpoint.height,
            });

            const {captureWireframeSnapshot, renderSvgWireframe} = await import('./wireframe.js');
            const {output: responsiveSnapshot} = await captureWireframeSnapshot(
              {
                params: {
                  selectors,
                  scopeSelector,
                  includeDescendants,
                  maxElements,
                  includeComputedStyles,
                  computedStylePreset,
                  coordinateSpace: 'viewport',
                },
              },
              context,
            );

            const svg = renderSvgWireframe(responsiveSnapshot, {
              scale: 1,
              background: 'transparent',
              showLabels: true,
              showDimensions: showDimensions ?? true,
              showSpacing: true,
              strokeWidth: 1,
              fillOpacity: 0.08,
              highlightChanged: false,
              previous: undefined,
            });

            result.responsiveSnapshots.push({
              breakpoint: breakpoint.name,
              width: breakpoint.width,
              height: breakpoint.height,
              visualSnapshot: {
                svg,
                dimensions: {width: breakpoint.width, height: breakpoint.height},
              },
            });
          }
        }

        results.push(result);

        // Auto-rollback if requested (except for the last script; the last patch is handled below).
        if (autoRollback && i < scripts.length - 1) {
          await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
            const candidates = Array.from(document.querySelectorAll(`[${PATCH_ID_ATTR}]`)) as HTMLElement[];
            for (const el of candidates) {
              if (el.getAttribute(PATCH_ID_ATTR) === patchId) {
                el.remove();
              }
            }
          }, {patchId, PATCH_ID_ATTR});
          context.unregisterPatch(patchId);
        }
      }

      // If autoRollback=true, also remove the last applied patch.
      if (autoRollback && insertedPatchIds.length > 0) {
        const lastPatchId = insertedPatchIds[insertedPatchIds.length - 1];
        await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
          const candidates = Array.from(document.querySelectorAll(`[${PATCH_ID_ATTR}]`)) as HTMLElement[];
          for (const el of candidates) {
            if (el.getAttribute(PATCH_ID_ATTR) === patchId) {
              el.remove();
            }
          }
        }, {patchId: lastPatchId, PATCH_ID_ATTR});
        context.unregisterPatch(lastPatchId);
      }

      // Restore original viewport
      if (originalViewport) {
        await page.setViewport(originalViewport);
      }

      const recordedScriptIndex =
        selectedScriptIndex !== undefined
          ? selectedScriptIndex
          : scripts.length - 1;
      const recorded = results[recordedScriptIndex];

      response.appendResponseLine(`Tested ${scripts.length} JS variants`);
      const out = {
        testedScripts: scripts.length,
        results,
        autoRolledBack: autoRollback,
        recordedScriptIndex,
        recordedJsText: recorded?.jsText,
      };

      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(out, null, 2));
      response.appendResponseLine('```');

      if (filePath) {
        const summary = {
          timestamp: new Date().toISOString(),
          testedScripts: scripts.length,
          results,
        };
        await context.saveFile(
          new TextEncoder().encode(JSON.stringify(summary, null, 2)),
          filePath,
        );
        response.appendResponseLine(`\nSaved detailed results to ${filePath}`);
      }

      if (request.params.recordToSession) {
        const recordedScriptIndex =
          selectedScriptIndex !== undefined
            ? selectedScriptIndex
            : Math.max(0, scripts.length - 1);
        const recorded = results[recordedScriptIndex];
        context.appendEditChange(
          {
            type: 'insert_js_preview',
            pageId,
            createdAt: Date.now(),
            description: `JS Preview: [${scripts.length} variants]`,
            targetFilePath: request.params.targetFilePath,
            payload: {
              selectedScriptIndex: recordedScriptIndex,
              jsText: recorded?.jsText,
              results: results.map(r => ({
                jsText: r.jsText,
                patchId: r.patchId,
              })),
              autoRollback,
            },
          },
          {sessionId: request.params.editSessionId, autoCreate: true},
        );
      }
    } catch (error) {
      // Restore viewport on error
      if (originalViewport) {
        try {
          await page.setViewport(originalViewport);
        } catch (_e) {
          // Ignore viewport restoration errors
        }
      }
      throw error;
    }
  },
});

export const manipulateDom = defineTool({
  name: 'manipulate_dom',
  description:
    'Perform DOM manipulations on web pages including setting styles, adding/removing classes, inserting/removing elements, and batch operations.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // Single action mode
    action: zod
      .enum(['set-style', 'add-class', 'remove-class', 'remove-element', 'insert-html'])
      .optional()
      .describe('Single DOM manipulation action to perform.'),

    // Action parameters
    selector: zod
      .string()
      .optional()
      .describe('CSS selector to target elements for the action.'),

    properties: zod
      .record(zod.string())
      .optional()
      .describe('CSS properties and values for set-style action. E.g., {"margin-bottom": "32px", "padding": "16px"}'),

    className: zod
      .string()
      .optional()
      .describe('CSS class name for add-class/remove-class actions.'),

    html: zod
      .string()
      .optional()
      .describe('HTML content to insert for insert-html action.'),

    position: zod
      .enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend'])
      .optional()
      .describe('Position for insert-html action relative to the selected element. Defaults to "beforeend".'),

    // Batch operations mode
    operations: zod
      .array(zod.object({
        action: zod.enum(['set-style', 'add-class', 'remove-class', 'remove-element', 'insert-html']).describe('DOM manipulation action.'),
        selector: zod.string().describe('CSS selector to target elements.'),
        properties: zod.record(zod.string()).optional().describe('CSS properties for set-style action.'),
        className: zod.string().optional().describe('CSS class name for add-class/remove-class actions.'),
        html: zod.string().optional().describe('HTML content for insert-html action.'),
        position: zod.enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend']).optional().describe('Position for insert-html action. Defaults to "beforeend".'),
      }))
      .optional()
      .describe('Array of DOM operations to perform in batch.'),

    // Common options
    patchId: zod
      .string()
      .optional()
      .describe('Optional patch id for rollback. If omitted, generates a stable patch id.'),

    description: zod
      .string()
      .optional()
      .describe('Optional human description for the patch registry.'),

    // Optional change journaling (buffer edits during interactive sessions; commit/export later).
    recordToSession: zod
      .boolean()
      .optional()
      .describe(
        'If true, record this change into an edit session journal so it can be exported/committed later (useful to keep live iteration fast and delay filesystem writes).',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const { action, selector, properties, className, html, position, operations, patchId: requestedPatchId, description } = request.params;

    // Determine if we're in single action or batch mode
    const isBatchMode = operations && operations.length > 0;
    const isSingleMode = action && selector;

    if (!isBatchMode && !isSingleMode) {
      throw new Error('Either provide a single action with selector, or provide operations array for batch mode.');
    }

    if (isBatchMode && isSingleMode) {
      throw new Error('Cannot use both single action and batch operations. Choose one mode.');
    }

    // Prepare operations array
    let domOperations: Array<{
      action: string;
      selector: string;
      properties?: Record<string, string>;
      className?: string;
      html?: string;
      position?: string;
    }> = [];

    if (isSingleMode) {
      domOperations = [{
        action,
        selector,
        properties,
        className,
        html,
        position,
      }];
    } else if (isBatchMode) {
      domOperations = operations;
    }

    // Validate operations
    for (const op of domOperations) {
      if (op.action === 'set-style' && !op.properties) {
        throw new Error('set-style action requires properties parameter.');
      }
      if ((op.action === 'add-class' || op.action === 'remove-class') && !op.className) {
        throw new Error(`${op.action} action requires className parameter.`);
      }
      if (op.action === 'insert-html' && !op.html) {
        throw new Error('insert-html action requires html parameter.');
      }
    }

    const patchId = requestedPatchId ?? context.createPatchId('dom-manipulate');

    // Execute DOM manipulations
    interface DomManipulationOpResult {
      selector: string;
      found: boolean;
      action: string;
      success?: boolean;
      message?: string;
      elementIndex?: number;
    }
    interface DomManipulationEvalResult {
      patchId: string;
      success: boolean;
      operations: DomManipulationOpResult[];
      executedOperations: unknown[];
      error?: string;
    }

    const result: DomManipulationEvalResult = await page.evaluate(
      ({operations, patchId, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
        const results = [];
        const executedOperations = [];

        try {
          for (const op of operations) {
            const elements = Array.from(document.querySelectorAll(op.selector)) as HTMLElement[];
            const opResults = [];

            if (elements.length === 0) {
              opResults.push({
                selector: op.selector,
                found: false,
                action: op.action,
                message: 'No elements found matching selector',
              });
            } else {
              for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                let success = true;
                let message = '';

                try {
                  switch (op.action) {
                    case 'set-style':
                      if (op.properties) {
                        for (const [prop, value] of Object.entries(op.properties)) {
                          element.style.setProperty(prop, value, 'important');
                        }
                      }
                      break;

                    case 'add-class':
                      if (op.className) {
                        element.classList.add(op.className);
                      }
                      break;

                    case 'remove-class':
                      if (op.className) {
                        element.classList.remove(op.className);
                      }
                      break;

                    case 'remove-element':
                      element.remove();
                      break;

                    case 'insert-html':
                      if (op.html) {
                        const position = (op.position || 'beforeend') as InsertPosition;
                        element.insertAdjacentHTML(position, op.html);
                      }
                      break;

                    default:
                      success = false;
                      message = `Unknown action: ${op.action}`;
                  }
                } catch (error) {
                  success = false;
                  message = error.message;
                }

                opResults.push({
                  selector: op.selector,
                  elementIndex: i,
                  found: true,
                  action: op.action,
                  success,
                  message,
                });
              }
            }

            results.push(...opResults);
            executedOperations.push(op);
          }

          // Mark successful execution with patch attributes
          // We'll use a hidden div to track this manipulation
          const marker = document.createElement('div');
          marker.style.display = 'none';
          marker.setAttribute(PATCH_ID_ATTR, patchId);
          marker.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
          marker.setAttribute(PATCH_KIND_ATTR, 'dom-manipulation');
          document.head.appendChild(marker);

          return {
            patchId,
            success: true,
            operations: results,
            executedOperations,
          };

        } catch (error) {
          return {
            patchId,
            success: false,
            error: error.message,
            operations: results,
            executedOperations,
          };
        }
      },
      {
        operations: domOperations,
        patchId,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      },
    );

    // Register patch if successful
    if (result.success) {
      context.registerPatch({
        patchId,
        patchType: 'dom-manipulation',
        pageId,
        createdAt: Date.now(),
        description: description || `DOM manipulation: ${domOperations.map(op => `${op.action} on ${op.selector}`).join(', ')}`,
      });

      if (request.params.recordToSession) {
        context.appendEditChange(
          {
            type: 'manipulate_dom',
            pageId,
            createdAt: Date.now(),
            patchId,
            description: description || `DOM manipulation: ${domOperations.map(op => `${op.action} on ${op.selector}`).join(', ')}`,
            payload: {
              operations: domOperations,
            },
          },
          {sessionId: request.params.editSessionId, autoCreate: true},
        );
      }
    }

    // Format response
    const successfulOps = result.operations.filter(op => op.success === true).length;
    const totalOps = result.operations.length;

    response.appendResponseLine(`DOM manipulation completed: ${successfulOps}/${totalOps} operations successful`);

    if (result.operations.some(op => op.found === false)) {
      const notFound = result.operations.filter(op => op.found === false);
      response.appendResponseLine(`\n⚠️  Warning: ${notFound.length} selector(s) matched no elements:`);
      for (const op of notFound) {
        response.appendResponseLine(`  - "${op.selector}"`);
      }
    }

    response.appendResponseLine('\n```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          patchId,
          pageId,
          success: result.success,
          operations: result.operations,
          totalOperations: totalOps,
          successfulOperations: successfulOps,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const rollbackAll = defineTool({
  name: 'rollback_all',
  description:
    'Rollback (remove) all patches inserted by this MCP server in the current page.',
  annotations: {
    category: ToolCategory.PATCH,
    readOnlyHint: false,
  },
  schema: {
    includeRegistryOnly: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, only clears the server-side registry for the current page without touching the DOM.',
      ),

    // Optional change journaling.
    recordToSession: zod
      .boolean()
      .optional()
      .describe('If true, record this rollback-all action into an edit session journal.'),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;

    let removedFromDom: string[] = [];
    if (!request.params.includeRegistryOnly) {
      removedFromDom = await page.evaluate(({PATCH_OWNER_ATTR, PATCH_OWNER_VALUE, PATCH_ID_ATTR}) => {
        const removed: string[] = [];
        const candidates = Array.from(
          document.querySelectorAll(`[${PATCH_OWNER_ATTR}="${PATCH_OWNER_VALUE}"][${PATCH_ID_ATTR}]`),
        ) as HTMLElement[];
        for (const el of candidates) {
          const id = el.getAttribute(PATCH_ID_ATTR);
          if (id) {
            removed.push(id);
          }
          el.remove();
        }
        return removed;
      }, {PATCH_OWNER_ATTR, PATCH_OWNER_VALUE, PATCH_ID_ATTR});
    }

    const cleared = context.clearPatches({pageId}).map(p => p.patchId);
    const all = unique([...removedFromDom, ...cleared]);

    if (request.params.recordToSession) {
      context.appendEditChange(
        {
          type: 'rollback_all',
          pageId,
          createdAt: Date.now(),
          payload: {
            includeRegistryOnly: request.params.includeRegistryOnly ?? false,
            removedPatchIds: all,
            removedFromDomPatchIds: removedFromDom,
            clearedRegistryPatchIds: cleared,
          },
        },
        {sessionId: request.params.editSessionId, autoCreate: true},
      );
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          pageId,
          removedPatchIds: all,
          removedFromDomPatchIds: removedFromDom,
          clearedRegistryPatchIds: cleared,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});



