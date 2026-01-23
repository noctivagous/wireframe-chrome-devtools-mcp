/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../src/third_party/index.js';

import {ToolCategory} from '../src/tools/categories.js';
import {defineTool} from '../src/tools/ToolDefinition.js';

const PATCH_ID_ATTR = 'data-mcp-patch-id';
const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
const PATCH_KIND_ATTR = 'data-mcp-patch-kind';
const PATCH_OWNER_VALUE = 'wireframe-chrome-devtools-mcp';

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

