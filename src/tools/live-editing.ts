/**
 * @license
 * Copyright 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {getDefaultGuidanceConfigPath, loadGuidanceConfig} from '../guidance-config.js';
import {SnapshotFormatter} from '../formatters/SnapshotFormatter.js';

import {ToolCategory} from './categories.js';
import {defineTool, timeoutSchema} from './ToolDefinition.js';
import {
  appendLiveEditingResponse,
  LIVE_EDITING_SCHEMA_VERSION,
  resolveArtifactOutput,
  type LiveEditingArtifact,
  type LiveEditingToolResponse,
} from './live-editing/types.js';
import {
  captureWireframeSnapshot,
  renderSvgWireframe,
  summarizeWireframeSnapshot,
  type WireframeSnapshotOutput,
} from './wireframe.js';

const outputModeSchema = zod
  .enum(['summary', 'inline', 'file'])
  .default('summary')
  .optional()
  .describe('Controls how snapshot payloads are returned.');

const svgOutputModeSchema = zod
  .enum(['summary', 'inline', 'file'])
  .default('file')
  .optional()
  .describe('Controls how SVG payloads are returned.');

const maxBytesInlineSchema = zod
  .number()
  .int()
  .positive()
  .default(200_000)
  .optional()
  .describe('Maximum inline payload size (bytes) before falling back to an artifact file.');

export const beginLiveEditingSession = defineTool({
  name: 'begin_live_editing_session',
  description:
    'Start a live editing session by opening a URL, activating an edit session, and returning a structured live-editing payload with suggested next steps.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('URL to open for the live editing session.'),
    openMode: zod
      .enum(['new_page', 'navigate_selected'])
      .default('navigate_selected')
      .optional()
      .describe('Open a new page or navigate the currently selected page.'),
    setActiveEditSession: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, create and activate a new edit session.'),
    injectOverlay: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, inject the live editing overlay into the page.'),
    overlayPatchId: zod
      .string()
      .optional()
      .describe('Optional patch id for the overlay injection.'),
    snapshots: zod
      .object({
        takeSnapshot: zod.boolean().default(true).optional(),
        wireframe: zod.boolean().default(true).optional(),
        svg: zod.boolean().default(false).optional(),
      })
      .optional()
      .describe('Which follow-up snapshots to suggest.'),
    snapshotOptions: zod
      .record(zod.any())
      .optional()
      .describe('Optional args to include in suggested snapshot tool calls.'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const openMode = request.params.openMode ?? 'navigate_selected';
    const page = openMode === 'new_page' ? await context.newPage() : context.getSelectedPage();
    context.selectPage(page);

    let navigationError: string | undefined;
    try {
      await context.waitForEventsAfterAction(async () => {
        await page.goto(request.params.url, {timeout: request.params.timeout});
      });
    } catch (error) {
      navigationError = (error as Error).message ?? String(error);
    }

    const title = await page.title().catch(() => undefined);
    const finalUrl = page.url();

    const editSession = request.params.setActiveEditSession
      ? context.createEditSession({
          label: `live-editing:${finalUrl}`,
          setActive: true,
        })
      : undefined;

    let overlayPatchId: string | undefined;
    let overlayInstalled = false;
    if (request.params.injectOverlay ?? true) {
      overlayPatchId = request.params.overlayPatchId ?? context.createPatchId('live-editing');
      const installResult = await page.evaluate(
        ({patchId, storageKey}) => {
          const PATCH_ID_ATTR = 'data-mcp-patch-id';
          const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
          const PATCH_KIND_ATTR = 'data-mcp-patch-kind';
          const PATCH_OWNER_VALUE = 'wireframe-chrome-devtools-mcp';

          if ((window as any).__MCP_LIVE_EDITING__?.installed) {
            return {installed: true, alreadyInstalled: true};
          }

          const state = {
            annotations: [] as Array<{
              id: string;
              type: string;
              text: string;
              selector: string;
              targetSelector?: string;
              createdAt: number;
            }>,
            selectMode: false,
            scheduled: false,
            hoveredSelector: null as string | null,
            menuVisible: false,
            menuX: 0,
            menuY: 0,
            menuSelector: null as string | null,
            pageNotes: '',
            notesVisible: false,
            notesCollapsed: false,
            notesPos: {x: 24, y: 24},
            dragLink: null as null | {
              annotationId: string;
              startX: number;
              startY: number;
              currentX: number;
              currentY: number;
            },
          };

          const save = () => {
            try {
              window.sessionStorage?.setItem(storageKey, JSON.stringify(state.annotations));
            } catch {
              // ignore
            }
          };

          const saveNotes = () => {
            try {
              window.sessionStorage?.setItem('mcp_live_editing_page_notes', state.pageNotes);
              window.sessionStorage?.setItem(
                'mcp_live_editing_notes_ui',
                JSON.stringify({
                  visible: state.notesVisible,
                  collapsed: state.notesCollapsed,
                  pos: state.notesPos,
                }),
              );
            } catch {
              // ignore
            }
          };

          const load = () => {
            try {
              const raw = window.sessionStorage?.getItem(storageKey);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  state.annotations = parsed;
                }
              }
            } catch {
              // ignore
            }
            try {
              const notes = window.sessionStorage?.getItem('mcp_live_editing_page_notes');
              if (typeof notes === 'string') {
                state.pageNotes = notes;
              }
              const ui = window.sessionStorage?.getItem('mcp_live_editing_notes_ui');
              if (ui) {
                const parsed = JSON.parse(ui);
                if (typeof parsed?.visible === 'boolean') {
                  state.notesVisible = parsed.visible;
                }
                if (typeof parsed?.collapsed === 'boolean') {
                  state.notesCollapsed = parsed.collapsed;
                }
                if (parsed?.pos?.x != null && parsed?.pos?.y != null) {
                  state.notesPos = {x: Number(parsed.pos.x), y: Number(parsed.pos.y)};
                }
              }
            } catch {
              // ignore
            }
          };

          const createRoot = () => {
            let root = document.getElementById('mcp-live-editing-root');
            if (!root) {
              root = document.createElement('div');
              root.id = 'mcp-live-editing-root';
              root.setAttribute(PATCH_ID_ATTR, patchId);
              root.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
              root.setAttribute(PATCH_KIND_ATTR, 'js');
              root.style.position = 'fixed';
              root.style.inset = '0';
              root.style.pointerEvents = 'none';
              root.style.zIndex = '2147483647';
              document.documentElement.appendChild(root);
            }
            return root;
          };

          const ensureStyle = () => {
            let style = document.getElementById('mcp-live-editing-style') as HTMLStyleElement | null;
            if (!style) {
              style = document.createElement('style');
              style.id = 'mcp-live-editing-style';
              style.setAttribute(PATCH_ID_ATTR, patchId);
              style.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
              style.setAttribute(PATCH_KIND_ATTR, 'js');
              style.textContent = `
#mcp-live-editing-root .mcp-le-toolbar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.92);
  color: #f9fafb;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  font-size: 12px;
  pointer-events: auto;
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
}
#mcp-live-editing-root .mcp-le-toolbar button {
  background: #2563eb;
  border: none;
  color: white;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}
#mcp-live-editing-root .mcp-le-toolbar button[data-active="true"] {
  background: #16a34a;
}
#mcp-live-editing-root .mcp-le-tag {
  position: absolute;
  max-width: 240px;
  background: rgba(255, 255, 255, 0.95);
  color: #111827;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px 4px;
  font-size: 12px;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
#mcp-live-editing-root .mcp-le-tag-content {
  outline: none;
  min-height: 16px;
  white-space: pre-wrap;
}
#mcp-live-editing-root .mcp-le-tag-footer {
  margin-top: 4px;
  font-size: 10px;
  color: #6b7280;
  border-top: 1px dashed #e5e7eb;
  padding-top: 3px;
  word-break: break-all;
}
#mcp-live-editing-root .mcp-le-tag button {
  margin-left: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b7280;
}
#mcp-live-editing-root .mcp-le-highlight {
  position: fixed;
  border: 2px solid #3b82f6;
  border-radius: 6px;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
  pointer-events: none;
}
#mcp-live-editing-root .mcp-le-highlight-label {
  position: fixed;
  background: #1f2937;
  color: #f9fafb;
  padding: 2px 6px;
  font-size: 11px;
  border-radius: 6px;
  pointer-events: none;
}
#mcp-live-editing-root .mcp-le-menu {
  position: fixed;
  background: #ffffff;
  color: #111827;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px;
  min-width: 160px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.2);
  pointer-events: auto;
  display: none;
}
#mcp-live-editing-root .mcp-le-menu button {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}
#mcp-live-editing-root .mcp-le-menu button:hover {
  background: #f3f4f6;
}
#mcp-live-editing-root .mcp-le-notes {
  position: fixed;
  width: 280px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 12px 24px rgba(0,0,0,0.2);
  pointer-events: auto;
  display: none;
}
#mcp-live-editing-root .mcp-le-notes-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: move;
  background: #111827;
  color: #f9fafb;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}
#mcp-live-editing-root .mcp-le-notes-titlebar .mcp-le-notes-controls {
  display: flex;
  gap: 6px;
}
#mcp-live-editing-root .mcp-le-notes-titlebar button {
  background: #374151;
  border: none;
  color: #f9fafb;
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
}
#mcp-live-editing-root .mcp-le-notes-body {
  padding: 8px;
}
#mcp-live-editing-root .mcp-le-notes textarea {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px;
  font-size: 12px;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  color: #111827;
}
#mcp-live-editing-root .mcp-le-connector {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
#mcp-live-editing-root .mcp-le-port {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #111827;
  border: 2px solid #ef4444;
  box-shadow: inset 0 0 0 2px #111827, 0 0 0 1px rgba(239,68,68,0.4);
  margin-left: 8px;
  cursor: crosshair;
}
#mcp-live-editing-root .mcp-le-port-inner {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #ef4444;
}
#mcp-live-editing-root .mcp-le-outline {
  outline: 2px solid #f59e0b !important;
  outline-offset: 2px;
}
              `.trim();
              document.head.appendChild(style);
            }
          };

          const buildSelector = (el: Element) => {
            const id = el.getAttribute('id');
            if (id) {
              return `#${CSS.escape(id)}`;
            }
            const dataKeys = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
            for (const key of dataKeys) {
              const v = el.getAttribute(key);
              if (v) {
                return `[${key}="${CSS.escape(v)}"]`;
              }
            }
            const parts: string[] = [];
            let cur: Element | null = el;
            for (let i = 0; cur && i < 4; i++) {
              const name = cur.tagName.toLowerCase();
              const parentEl: Element | null = cur.parentElement;
              if (!parentEl) {
                parts.unshift(name);
                break;
              }
              const siblings = Array.from(parentEl.children) as Element[];
              const sameTag = siblings.filter(child => child.tagName === cur!.tagName);
              const idx = sameTag.indexOf(cur) + 1;
              parts.unshift(`${name}:nth-of-type(${idx})`);
              cur = parentEl;
            }
            return parts.join(' > ');
          };

          const clearTags = (root: HTMLElement) => {
            const tags = Array.from(root.querySelectorAll('.mcp-le-tag'));
            for (const tag of tags) {
              tag.remove();
            }
          };

          const clearOutlines = () => {
            for (const el of Array.from(document.querySelectorAll('.mcp-le-outline'))) {
              el.classList.remove('mcp-le-outline');
            }
          };

          const render = () => {
            const root = createRoot();
            clearTags(root);
            renderConnectors(root);
            clearOutlines();
            for (const annotation of state.annotations) {
              const el = document.querySelector(annotation.selector);
              if (!el) {
                continue;
              }
              const rect = (el as HTMLElement).getBoundingClientRect();
              el.classList.add('mcp-le-outline');
              const tag = document.createElement('div');
              tag.className = 'mcp-le-tag';
              const content = document.createElement('div');
              content.className = 'mcp-le-tag-content';
              content.contentEditable = 'true';
              content.textContent = annotation.text;
              content.addEventListener('input', () => {
                annotation.text = content.textContent ?? '';
                save();
              });
              tag.appendChild(content);
              tag.style.left = `${Math.max(8, rect.left)}px`;
              tag.style.top = `${Math.max(8, rect.top - 28)}px`;
              tag.setAttribute('data-mcp-annotation-id', annotation.id);
              tag.setAttribute(PATCH_ID_ATTR, patchId);
              if (annotation.type === 'move') {
                const port = document.createElement('span');
                port.className = 'mcp-le-port';
                port.setAttribute('data-mcp-annotation-id', annotation.id);
                port.setAttribute(PATCH_ID_ATTR, patchId);
                const inner = document.createElement('span');
                inner.className = 'mcp-le-port-inner';
                port.appendChild(inner);
                port.addEventListener('mousedown', ev => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  const r = (el as HTMLElement).getBoundingClientRect();
                  state.dragLink = {
                    annotationId: annotation.id,
                    startX: r.right,
                    startY: r.top + r.height / 2,
                    currentX: ev.clientX,
                    currentY: ev.clientY,
                  };
                  scheduleRender();
                });
                tag.appendChild(port);
              }
              const close = document.createElement('button');
              close.textContent = 'x';
              close.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                state.annotations = state.annotations.filter(a => a.id !== annotation.id);
                save();
                scheduleRender();
              });
              tag.appendChild(close);
              const footer = document.createElement('div');
              footer.className = 'mcp-le-tag-footer';
              footer.textContent = annotation.selector;
              tag.appendChild(footer);
              root.appendChild(tag);
            }
            renderHighlight(root);
            renderMenu(root);
            renderNotes(root);
          };

          const scheduleRender = () => {
            if (state.scheduled) {
              return;
            }
            state.scheduled = true;
            window.requestAnimationFrame(() => {
              state.scheduled = false;
              render();
            });
          };

          const toggleSelectMode = (force?: boolean) => {
            state.selectMode = typeof force === 'boolean' ? force : !state.selectMode;
            const btn = document.getElementById('mcp-le-btn') as HTMLButtonElement | null;
            if (btn) {
              btn.dataset.active = state.selectMode ? 'true' : 'false';
              btn.textContent = state.selectMode ? 'Click element' : 'Add note';
            }
          };

          const isOverlayTarget = (path: EventTarget[]) => {
            return path.some(t => (t as HTMLElement)?.id === 'mcp-live-editing-root');
          };

          const pickTarget = (ev: MouseEvent): Element | null => {
            const path = (ev.composedPath?.() ?? []) as EventTarget[];
            if (isOverlayTarget(path)) {
              return null;
            }
            for (const entry of path) {
              if (entry instanceof Element) {
                return entry;
              }
            }
            return ev.target instanceof Element ? ev.target : null;
          };

          const renderHighlight = (root: HTMLElement) => {
            let box = root.querySelector('.mcp-le-highlight') as HTMLDivElement | null;
            let label = root.querySelector('.mcp-le-highlight-label') as HTMLDivElement | null;
            if (!box) {
              box = document.createElement('div');
              box.className = 'mcp-le-highlight';
              box.setAttribute(PATCH_ID_ATTR, patchId);
              root.appendChild(box);
            }
            if (!label) {
              label = document.createElement('div');
              label.className = 'mcp-le-highlight-label';
              label.setAttribute(PATCH_ID_ATTR, patchId);
              root.appendChild(label);
            }
            if (!state.selectMode || !state.hoveredSelector) {
              box.style.display = 'none';
              label.style.display = 'none';
              return;
            }
            const el = document.querySelector(state.hoveredSelector) as HTMLElement | null;
            if (!el) {
              box.style.display = 'none';
              label.style.display = 'none';
              return;
            }
            const rect = el.getBoundingClientRect();
            box.style.display = 'block';
            box.style.left = `${rect.left}px`;
            box.style.top = `${rect.top}px`;
            box.style.width = `${rect.width}px`;
            box.style.height = `${rect.height}px`;
            label.style.display = 'block';
            label.textContent = state.hoveredSelector;
            label.style.left = `${rect.left}px`;
            label.style.top = `${Math.max(4, rect.top - 20)}px`;
          };

          const openMenu = (selector: string, x: number, y: number) => {
            state.menuVisible = true;
            state.menuSelector = selector;
            state.menuX = x;
            state.menuY = y;
          };

          const closeMenu = () => {
            state.menuVisible = false;
            state.menuSelector = null;
          };

          const renderMenu = (root: HTMLElement) => {
            let menu = root.querySelector('.mcp-le-menu') as HTMLDivElement | null;
            if (!menu) {
              menu = document.createElement('div');
              menu.className = 'mcp-le-menu';
              menu.setAttribute(PATCH_ID_ATTR, patchId);
              root.appendChild(menu);
            }
            menu.innerHTML = '';
            if (!state.menuVisible || !state.menuSelector) {
              menu.style.display = 'none';
              return;
            }
            menu.style.display = 'block';
            menu.style.left = `${state.menuX}px`;
            menu.style.top = `${state.menuY}px`;

            const addButton = (label: string, onClick: () => void) => {
              const btn = document.createElement('button');
              btn.textContent = label;
              btn.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                onClick();
                closeMenu();
                scheduleRender();
              });
              menu.appendChild(btn);
            };

            addButton('Add note', () => {
              const text = window.prompt('Add annotation');
              if (text && text.trim()) {
                state.annotations.push({
                  id: `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                  type: 'note',
                  text: text.trim(),
                  selector: state.menuSelector!,
                  createdAt: Date.now(),
                });
                save();
              }
            });
            addButton('Move this here', () => {
              const text = window.prompt('Describe the move');
              if (text && text.trim()) {
                state.annotations.push({
                  id: `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                  type: 'move',
                  text: text.trim(),
                  selector: state.menuSelector!,
                  createdAt: Date.now(),
                });
                save();
              }
            });
            addButton('Delete annotations for element', () => {
              state.annotations = state.annotations.filter(
                ann => ann.selector !== state.menuSelector,
              );
              save();
            });
            addButton('Exit picker', () => {
              toggleSelectMode(false);
            });
          };

          const renderConnectors = (root: HTMLElement) => {
            let svg = root.querySelector('.mcp-le-connector') as SVGSVGElement | null;
            if (!svg) {
              svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svg.classList.add('mcp-le-connector');
              svg.setAttribute(PATCH_ID_ATTR, patchId);
              svg.setAttribute('width', '100%');
              svg.setAttribute('height', '100%');
              root.appendChild(svg);
            }
            while (svg.firstChild) {
              svg.removeChild(svg.firstChild);
            }
            const addLine = (x1: number, y1: number, x2: number, y2: number, color: string) => {
              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              line.setAttribute('x1', String(x1));
              line.setAttribute('y1', String(y1));
              line.setAttribute('x2', String(x2));
              line.setAttribute('y2', String(y2));
              line.setAttribute('stroke', color);
              line.setAttribute('stroke-width', '2');
              line.setAttribute('marker-end', 'url(#mcp-le-arrow)');
              svg!.appendChild(line);
            };
            let defs = svg.querySelector('defs');
            if (!defs) {
              defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
              const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
              marker.setAttribute('id', 'mcp-le-arrow');
              marker.setAttribute('markerWidth', '10');
              marker.setAttribute('markerHeight', '10');
              marker.setAttribute('refX', '8');
              marker.setAttribute('refY', '3');
              marker.setAttribute('orient', 'auto');
              const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              path.setAttribute('d', 'M0,0 L8,3 L0,6 Z');
              path.setAttribute('fill', '#ef4444');
              marker.appendChild(path);
              defs.appendChild(marker);
              svg.appendChild(defs);
            }
            for (const annotation of state.annotations) {
              if (annotation.type !== 'move' || !annotation.targetSelector) {
                continue;
              }
              const sourceEl = document.querySelector(annotation.selector) as HTMLElement | null;
              const targetEl = document.querySelector(annotation.targetSelector) as HTMLElement | null;
              if (!sourceEl || !targetEl) {
                continue;
              }
              const s = sourceEl.getBoundingClientRect();
              const t = targetEl.getBoundingClientRect();
              addLine(s.right, s.top + s.height / 2, t.left, t.top + t.height / 2, '#ef4444');
            }
            if (state.dragLink) {
              addLine(
                state.dragLink.startX,
                state.dragLink.startY,
                state.dragLink.currentX,
                state.dragLink.currentY,
                '#f97316',
              );
            }
          };

          const elementFromPointIgnoringOverlay = (x: number, y: number) => {
            const root = document.getElementById('mcp-live-editing-root') as HTMLElement | null;
            const prev = root?.style.pointerEvents;
            if (root) {
              root.style.pointerEvents = 'none';
            }
            const el = document.elementFromPoint(x, y) as Element | null;
            if (root && prev != null) {
              root.style.pointerEvents = prev;
            } else if (root) {
              root.style.pointerEvents = 'none';
            }
            return el;
          };

          const renderNotes = (root: HTMLElement) => {
            let panel = root.querySelector('.mcp-le-notes') as HTMLDivElement | null;
            if (!panel) {
              panel = document.createElement('div');
              panel.className = 'mcp-le-notes';
              panel.setAttribute(PATCH_ID_ATTR, patchId);

              const titlebar = document.createElement('div');
              titlebar.className = 'mcp-le-notes-titlebar';
              titlebar.setAttribute(PATCH_ID_ATTR, patchId);
              const title = document.createElement('div');
              title.textContent = 'Page notes';
              const controls = document.createElement('div');
              controls.className = 'mcp-le-notes-controls';

              const collapseBtn = document.createElement('button');
              collapseBtn.textContent = state.notesCollapsed ? 'Expand' : 'Collapse';
              collapseBtn.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                state.notesCollapsed = !state.notesCollapsed;
                saveNotes();
                scheduleRender();
              });

              const closeBtn = document.createElement('button');
              closeBtn.textContent = 'Close';
              closeBtn.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                state.notesVisible = false;
                saveNotes();
                scheduleRender();
              });

              controls.appendChild(collapseBtn);
              controls.appendChild(closeBtn);
              titlebar.appendChild(title);
              titlebar.appendChild(controls);

              const body = document.createElement('div');
              body.className = 'mcp-le-notes-body';
              const textarea = document.createElement('textarea');
              textarea.placeholder = 'Notes about the whole page...';
              textarea.value = state.pageNotes;
              textarea.addEventListener('input', () => {
                state.pageNotes = textarea.value;
                saveNotes();
              });
              body.appendChild(textarea);

              titlebar.addEventListener('mousedown', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const startX = ev.clientX;
                const startY = ev.clientY;
                const startPos = {...state.notesPos};
                const onMove = (moveEv: MouseEvent) => {
                  const nextX = startPos.x + (moveEv.clientX - startX);
                  const nextY = startPos.y + (moveEv.clientY - startY);
                  state.notesPos = {
                    x: Math.max(8, nextX),
                    y: Math.max(8, nextY),
                  };
                  panel!.style.left = `${state.notesPos.x}px`;
                  panel!.style.top = `${state.notesPos.y}px`;
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove, true);
                  window.removeEventListener('mouseup', onUp, true);
                  saveNotes();
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
              });

              panel.appendChild(titlebar);
              panel.appendChild(body);
              root.appendChild(panel);
            }

            panel.style.left = `${state.notesPos.x}px`;
            panel.style.top = `${state.notesPos.y}px`;
            panel.style.display = state.notesVisible ? 'block' : 'none';

            const collapseBtn = panel.querySelector(
              '.mcp-le-notes-titlebar button',
            ) as HTMLButtonElement | null;
            if (collapseBtn) {
              collapseBtn.textContent = state.notesCollapsed ? 'Expand' : 'Collapse';
            }
            const body = panel.querySelector('.mcp-le-notes-body') as HTMLDivElement | null;
            if (body) {
              body.style.display = state.notesCollapsed ? 'none' : 'block';
              const textarea = body.querySelector('textarea') as HTMLTextAreaElement | null;
              if (textarea && textarea.value !== state.pageNotes) {
                textarea.value = state.pageNotes;
              }
            }
          };

          const handleMouseMove = (ev: MouseEvent) => {
            if (state.dragLink) {
              state.dragLink.currentX = ev.clientX;
              state.dragLink.currentY = ev.clientY;
              scheduleRender();
              return;
            }
            if (!state.selectMode) {
              return;
            }
            const target = pickTarget(ev);
            if (!target) {
              state.hoveredSelector = null;
              scheduleRender();
              return;
            }
            state.hoveredSelector = buildSelector(target);
            scheduleRender();
          };

          const handleSelect = (ev: MouseEvent) => {
            if (!state.selectMode) {
              return;
            }
            const target = pickTarget(ev);
            if (!target) {
              return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            const selector = buildSelector(target);
            openMenu(selector, ev.clientX, ev.clientY);
            toggleSelectMode(false);
            scheduleRender();
          };

          const handleMouseUp = (ev: MouseEvent) => {
            if (!state.dragLink) {
              return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            const target = elementFromPointIgnoringOverlay(ev.clientX, ev.clientY);
            if (target) {
              const selector = buildSelector(target);
              const ann = state.annotations.find(a => a.id === state.dragLink!.annotationId);
              if (ann) {
                ann.targetSelector = selector;
                save();
              }
            }
            state.dragLink = null;
            scheduleRender();
          };

          const handleContextMenu = (ev: MouseEvent) => {
            if (!state.selectMode) {
              state.selectMode = true;
              toggleSelectMode(true);
              state.menuVisible = false;
              ev.preventDefault();
              ev.stopPropagation();
              handleMouseMove(ev);
              return;
            }
            handleSelect(ev);
          };

          const handleKeydown = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
              state.selectMode = false;
              closeMenu();
              scheduleRender();
            }
          };

          const createToolbar = () => {
            const root = createRoot();
            let toolbar = root.querySelector('.mcp-le-toolbar') as HTMLDivElement | null;
            if (!toolbar) {
              toolbar = document.createElement('div');
              toolbar.className = 'mcp-le-toolbar';
              toolbar.setAttribute(PATCH_ID_ATTR, patchId);
              const btn = document.createElement('button');
              btn.id = 'mcp-le-btn';
              btn.textContent = 'Add note';
              btn.dataset.active = 'false';
              btn.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                toggleSelectMode();
              });
              const notesBtn = document.createElement('button');
              notesBtn.id = 'mcp-le-notes-btn';
              notesBtn.textContent = 'Notes';
              notesBtn.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                state.notesVisible = !state.notesVisible;
                saveNotes();
                scheduleRender();
              });
              const label = document.createElement('div');
              label.textContent = 'Live editing';
              toolbar.appendChild(label);
              toolbar.appendChild(btn);
              toolbar.appendChild(notesBtn);
              root.appendChild(toolbar);
            }
          };

          ensureStyle();
          createRoot();
          createToolbar();
          load();
          render();

          window.addEventListener('scroll', scheduleRender, true);
          window.addEventListener('resize', scheduleRender);
          window.addEventListener('mousemove', handleMouseMove, true);
          window.addEventListener('mouseup', handleMouseUp, true);
          window.addEventListener('click', handleSelect, true);
          window.addEventListener('contextmenu', handleContextMenu, true);
          window.addEventListener('keydown', handleKeydown, true);

          (window as any).__MCP_LIVE_EDITING__ = {
            version: 1,
            installed: true,
            state,
            enableSelectMode() {
              if (!state.selectMode) {
                toggleSelectMode();
              }
            },
            disableSelectMode() {
              toggleSelectMode(false);
            },
            addAnnotation(annotation: {selector: string; text: string; type?: string}) {
              if (!annotation?.selector || !annotation?.text) {
                return false;
              }
              state.annotations.push({
                id: `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                type: annotation.type ?? 'note',
                text: annotation.text,
                selector: annotation.selector,
                createdAt: Date.now(),
              });
              save();
              scheduleRender();
              return true;
            },
            exportAnnotations() {
              return [...state.annotations];
            },
            importAnnotations(data: unknown) {
              if (Array.isArray(data)) {
                state.annotations = data as any[];
                save();
                scheduleRender();
                return true;
              }
              return false;
            },
            clearAnnotations() {
              state.annotations = [];
              save();
              clearOutlines();
              scheduleRender();
            },
            getPageNotes() {
              return state.pageNotes;
            },
            setPageNotes(value: string) {
              state.pageNotes = value ?? '';
              saveNotes();
              scheduleRender();
            },
            clearAll() {
              state.annotations = [];
              state.pageNotes = '';
              state.notesVisible = false;
              state.notesCollapsed = false;
              save();
              saveNotes();
              clearOutlines();
              scheduleRender();
            },
          };

          return {installed: true, alreadyInstalled: false};
        },
        {patchId: overlayPatchId, storageKey: 'mcp_live_editing_annotations'},
      );
      overlayInstalled = Boolean(installResult?.installed);
      const pageId = context.getPageId(page) ?? 0;
      context.registerPatch({
        patchId: overlayPatchId,
        patchType: 'js',
        pageId,
        createdAt: Date.now(),
        description: 'Live editing overlay',
      });
    }

    const snapshots = request.params.snapshots ?? {takeSnapshot: true, wireframe: true, svg: false};
    const snapshotOptions = request.params.snapshotOptions ?? {};

    const artifacts: LiveEditingArtifact[] = [];
    let baselineWireframeFile: string | undefined;
    let baselineSnapshotFile: string | undefined;
    let guidanceSummary:
      | {design?: string; architecture?: string; engineering?: string}
      | undefined;

    if (snapshots.takeSnapshot ?? true) {
      await context.createTextSnapshot(false);
      const snapshot = context.getTextSnapshot();
      if (snapshot) {
        const formatter = new SnapshotFormatter(snapshot);
        const bytes = new TextEncoder().encode(formatter.toString());
        const {filename} = await context.saveTemporaryFile(
          bytes,
          'text/plain',
          'live-editing-snapshot',
        );
        artifacts.push({
          filename,
          mimeType: 'text/plain',
          byteLength: bytes.length,
          summary: 'Text snapshot baseline (a11y tree)',
        });
        baselineSnapshotFile = filename;
      }
    }

    if (snapshots.wireframe ?? true) {
      const {output, bytes, json} = await captureWireframeSnapshot(
        {params: snapshotOptions},
        context,
      );
      const resolved = await resolveArtifactOutput({
        context,
        bytes,
        mimeType: 'application/json',
        baseName: 'live-editing-wireframe-baseline',
        outputMode: 'file',
        maxBytesInline: 200_000,
        inlineData: output,
        summary: 'Wireframe snapshot baseline (JSON)',
      });
      if (resolved.artifact) {
        artifacts.push(resolved.artifact);
        baselineWireframeFile = resolved.artifact.filename;
      }
      await page.evaluate((baselineJson: string) => {
        const api = (window as any).__MCP_LIVE_EDITING__;
        if (api) {
          api.baselineWireframeJson = baselineJson;
        } else {
          (window as any).__MCP_LIVE_EDITING_BASELINE__ = {wireframeJson: baselineJson};
        }
      }, json);
    }

    if (snapshots.svg ?? false) {
      const {output} = await captureWireframeSnapshot(
        {params: snapshotOptions},
        context,
      );
      const svg = renderSvgWireframe(output, {
        scale: 1,
        background: 'transparent',
        showLabels: true,
        showDimensions: false,
        showSpacing: false,
        showOverlaps: false,
        showGaps: false,
        showClipping: false,
        strokeWidth: 1,
        fillOpacity: 0.08,
        highlightChanged: false,
        previous: undefined,
      });
      const resolved = await resolveArtifactOutput({
        context,
        bytes: new TextEncoder().encode(svg),
        mimeType: 'text/plain',
        baseName: 'live-editing-svg-baseline',
        outputMode: 'file',
        maxBytesInline: 200_000,
        inlineData: svg,
        summary: 'Wireframe SVG baseline',
      });
      if (resolved.artifact) {
        artifacts.push(resolved.artifact);
      }
    }

    const guidance = await loadGuidanceConfig(getDefaultGuidanceConfigPath());
    const guides = guidance?.config?.guides ?? {};
    const summarize = (value?: string) => {
      if (!value) {
        return undefined;
      }
      const trimmed = value.trim().replace(/\s+/g, ' ');
      return trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
    };
    guidanceSummary = {
      design: summarize(guides.design?.content),
      architecture: summarize(guides.architecture?.content),
      engineering: summarize(guides.engineering?.content),
    };
    for (const [label, guide] of Object.entries(guides)) {
      const content = (guide as any)?.content;
      if (typeof content === 'string' && content.trim()) {
        const bytes = new TextEncoder().encode(content);
        const {filename} = await context.saveTemporaryFile(
          bytes,
          'text/plain',
          `guidance-${label}`,
        );
        artifacts.push({
          filename,
          mimeType: 'text/plain',
          byteLength: bytes.length,
          summary: `Guidance: ${label}`,
        });
      }
    }
    const nextToolCalls = [
      ...(snapshots.wireframe
        ? [
            {
              tool: 'wireframe_snapshot_live_editing',
              args: snapshotOptions,
            },
          ]
        : []),
      ...(snapshots.svg
        ? [
            {
              tool: 'svg_snapshot_live_editing',
              args: snapshotOptions,
            },
          ]
        : []),
    ];

    const payload: LiveEditingToolResponse<{
      page: {
        requestedUrl: string;
        finalUrl: string;
        title?: string;
        openMode: string;
        navigationError?: string;
      };
      editSession?: {sessionId: string; label?: string};
      overlay?: {installed: boolean; patchId?: string};
      baseline?: {
        textSnapshotFile?: string;
        wireframeFile?: string;
      };
      guidanceSummary?: {design?: string; architecture?: string; engineering?: string};
    }> = {
      kind: 'live_editing_session',
      version: LIVE_EDITING_SCHEMA_VERSION,
      data: {
        page: {
          requestedUrl: request.params.url,
          finalUrl,
          title,
          openMode,
          navigationError,
        },
        editSession: editSession
          ? {sessionId: editSession.sessionId, label: editSession.label}
          : undefined,
        overlay: request.params.injectOverlay
          ? {installed: overlayInstalled, patchId: overlayPatchId}
          : undefined,
        baseline: {
          textSnapshotFile: baselineSnapshotFile,
          wireframeFile: baselineWireframeFile,
        },
        guidanceSummary,
      },
      artifacts,
      instructions: {
        ordered_steps: [
          'Confirm the page is correct and ready for live editing.',
          'Use the live-editing snapshot tools to get a baseline (see next_tool_calls) if you need more detail.',
          'Wait for the user to annotate or make changes.',
          'When the user says “update from my changes”, call update_from_user_changes.',
        ],
        constraints: [
          'Do not write repo files during live editing. Keep changes in-browser.',
        ],
        cautions: navigationError
          ? ['Navigation encountered an error; verify the page loaded correctly.']
          : undefined,
      },
      next_tool_calls: nextToolCalls,
    };

    appendLiveEditingResponse(response, payload);
    response.setIncludePages(true);
  },
});

export const updateFromUserChanges = defineTool({
  name: 'update_from_user_changes',
  description:
    'Collect annotations and snapshots after the user makes changes, returning a structured live-editing payload with guidance and artifacts.',
  annotations: {
    category: ToolCategory.EDIT_SESSION,
    readOnlyHint: true,
  },
  schema: {
    includeAnnotations: zod
      .boolean()
      .default(true)
      .optional()
      .describe('Whether to pull annotations from the live editing overlay.'),
    includeSnapshots: zod
      .object({
        wireframe: zod.boolean().default(true).optional(),
        svg: zod.boolean().default(false).optional(),
      })
      .optional()
      .describe('Which snapshots to capture in this update.'),
    compareWith: zod
      .string()
      .optional()
      .describe('Optional previous wireframe JSON for diffing.'),
    wireframeOptions: zod
      .record(zod.any())
      .optional()
      .describe('Options to pass into wireframe snapshot capture.'),
    svgOptions: zod
      .record(zod.any())
      .optional()
      .describe('Options to control SVG rendering (scale, background, labels).'),
    wireframeOutputMode: outputModeSchema,
    svgOutputMode: svgOutputModeSchema,
    maxBytesInline: maxBytesInlineSchema,
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const title = await page.title().catch(() => undefined);
    const url = page.url();

    let annotations: unknown[] = [];
    let annotationSource = 'unavailable';
    let pageNotes = '';
    if (request.params.includeAnnotations ?? true) {
      const result = await page.evaluate(() => {
        const api = (window as any).__MCP_LIVE_EDITING__;
        if (api?.exportAnnotations) {
          const payload = {
            annotations: api.exportAnnotations(),
            source: 'api',
            pageNotes: api.getPageNotes ? api.getPageNotes() : '',
          };
          if (api.clearAll) {
            api.clearAll();
          }
          return payload;
        }
        if (Array.isArray(api?.state?.annotations)) {
          const payload = {
            annotations: api.state.annotations,
            source: 'state',
            pageNotes: typeof api.state.pageNotes === 'string' ? api.state.pageNotes : '',
          };
          api.state.annotations = [];
          api.state.pageNotes = '';
          api.state.notesVisible = false;
          api.state.notesCollapsed = false;
          return payload;
        }
        const storageKey = 'mcp_live_editing_annotations';
        const raw =
          window.sessionStorage?.getItem(storageKey) ??
          window.localStorage?.getItem(storageKey);
        const notes =
          window.sessionStorage?.getItem('mcp_live_editing_page_notes') ??
          window.localStorage?.getItem('mcp_live_editing_page_notes') ??
          '';
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            window.sessionStorage?.removeItem(storageKey);
            window.sessionStorage?.removeItem('mcp_live_editing_page_notes');
            return {annotations: parsed, source: 'storage', pageNotes: notes};
          } catch {
            return {annotations: [], source: 'storage_parse_error', pageNotes: notes};
          }
        }
        window.sessionStorage?.removeItem('mcp_live_editing_page_notes');
        return {annotations: [], source: 'none', pageNotes: notes};
      });
      annotations = Array.isArray(result?.annotations) ? result.annotations : [];
      annotationSource = result?.source ?? 'unknown';
      pageNotes = typeof result?.pageNotes === 'string' ? result.pageNotes : '';
    }

    const includeSnapshots = request.params.includeSnapshots ?? {wireframe: true, svg: false};
    const maxBytesInline = request.params.maxBytesInline ?? 200_000;
    const artifacts: LiveEditingArtifact[] = [];
    let wireframeData:
      | {
          summary: ReturnType<typeof summarizeWireframeSnapshot>;
          outputMode: string;
          inline?: WireframeSnapshotOutput;
          inlineSkipped?: {reason: string; maxBytesInline: number; byteLength: number};
          diffSummary?: {changed: number; added: number; removed: number};
        }
      | undefined;
    let svgData:
      | {
          summary: ReturnType<typeof summarizeWireframeSnapshot>;
          outputMode: string;
          svg?: string;
          inlineSkipped?: {reason: string; maxBytesInline: number; byteLength: number};
        }
      | undefined;

    let snapshotOutput:
      | (ReturnType<typeof captureWireframeSnapshot> extends Promise<infer R> ? R : never)
      | undefined;

    let baselineCompareWith = request.params.compareWith;
    if (!baselineCompareWith) {
      baselineCompareWith = await page.evaluate(() => {
        const api = (window as any).__MCP_LIVE_EDITING__;
        if (typeof api?.baselineWireframeJson === 'string') {
          return api.baselineWireframeJson;
        }
        const fallback = (window as any).__MCP_LIVE_EDITING_BASELINE__;
        return typeof fallback?.wireframeJson === 'string' ? fallback.wireframeJson : undefined;
      });
    }

    if (includeSnapshots.wireframe || includeSnapshots.svg) {
      const wireframeParams = {
        ...(request.params.wireframeOptions ?? {}),
        compareWith: baselineCompareWith,
        includeDiff: baselineCompareWith ? true : undefined,
      };
      snapshotOutput = await captureWireframeSnapshot(
        {params: wireframeParams},
        context,
      );
    }

    if (includeSnapshots.wireframe && snapshotOutput) {
      const summary = summarizeWireframeSnapshot(snapshotOutput.output);
      const resolved = await resolveArtifactOutput({
        context,
        bytes: snapshotOutput.bytes,
        mimeType: 'application/json',
        baseName: 'wireframe_snapshot_live_editing',
        outputMode: request.params.wireframeOutputMode ?? 'summary',
        maxBytesInline,
        inlineData: snapshotOutput.output,
        summary: 'Wireframe snapshot JSON (full)',
      });
      if (resolved.artifact) {
        artifacts.push(resolved.artifact);
      }
      wireframeData = {
        summary,
        outputMode: resolved.effectiveOutputMode,
        inline: resolved.inline,
        inlineSkipped: resolved.inlineSkipped,
        diffSummary: snapshotOutput.output.diff
          ? {
              changed: snapshotOutput.output.diff.changedElements.length,
              added: snapshotOutput.output.diff.addedElements.length,
              removed: snapshotOutput.output.diff.removedElements.length,
            }
          : undefined,
      };
    }

    if (includeSnapshots.svg && snapshotOutput) {
      const svgOptions = request.params.svgOptions ?? {};
      let previous: WireframeSnapshotOutput | undefined;
      if (typeof baselineCompareWith === 'string' && baselineCompareWith) {
        try {
          previous = JSON.parse(baselineCompareWith) as WireframeSnapshotOutput;
        } catch {
          previous = undefined;
        }
      }
      const svg = renderSvgWireframe(snapshotOutput.output, {
        scale: (svgOptions as any).scale ?? 1,
        background: (svgOptions as any).background ?? 'transparent',
        showLabels: (svgOptions as any).showLabels ?? true,
        showDimensions: (svgOptions as any).showDimensions ?? false,
        showSpacing: (svgOptions as any).showSpacing ?? false,
        showOverlaps: (svgOptions as any).showOverlaps ?? false,
        showGaps: (svgOptions as any).showGaps ?? false,
        showClipping: (svgOptions as any).showClipping ?? false,
        strokeWidth: (svgOptions as any).strokeWidth ?? 1,
        fillOpacity: (svgOptions as any).fillOpacity ?? 0.08,
        highlightChanged: (svgOptions as any).highlightChanged ?? false,
        previous,
      });
      const summary = summarizeWireframeSnapshot(snapshotOutput.output);
      const resolved = await resolveArtifactOutput({
        context,
        bytes: new TextEncoder().encode(svg),
        mimeType: 'text/plain',
        baseName: 'svg_snapshot_live_editing',
        outputMode: request.params.svgOutputMode ?? 'file',
        maxBytesInline,
        inlineData: svg,
        summary: 'SVG wireframe (full)',
      });
      if (resolved.artifact) {
        artifacts.push(resolved.artifact);
      }
      svgData = {
        summary,
        outputMode: resolved.effectiveOutputMode,
        svg: resolved.inline,
        inlineSkipped: resolved.inlineSkipped,
      };
    }

    const classifyIntent = (annotation: any): string => {
      if (annotation?.type === 'move') {
        return 'move';
      }
      const text = String(annotation?.text ?? '').toLowerCase();
      if (text.match(/\b(bug|broken|issue|fix|error)\b/)) {
        return 'bug';
      }
      if (text.match(/\b(copy|text|wording|typo|label)\b/)) {
        return 'copy';
      }
      if (text.match(/\b(layout|align|spacing|margin|padding|gap|grid|flex|position|width|height)\b/)) {
        return 'layout';
      }
      if (text.match(/\b(color|typography|font|size|weight|style)\b/)) {
        return 'style';
      }
      return 'note';
    };

    const parseStyleHint = (annotation: any): {selector: string; properties: Record<string, string>} | null => {
      const selector = annotation?.selector;
      if (!selector) {
        return null;
      }
      const text = String(annotation?.text ?? '').toLowerCase();
      const properties: Record<string, string> = {};
      const matchValue = (keyword: string) => {
        const re = new RegExp(`${keyword}\\s+(-?\\d+(?:\\.\\d+)?)`, 'i');
        const match = text.match(re);
        if (match?.[1]) {
          return `${match[1]}px`;
        }
        return null;
      };
      const padding = matchValue('padding');
      if (padding) {
        properties['padding'] = padding;
      }
      const margin = matchValue('margin');
      if (margin) {
        properties['margin'] = margin;
      }
      const gap = matchValue('gap');
      if (gap) {
        properties['gap'] = gap;
      }
      const width = matchValue('width');
      if (width) {
        properties['width'] = width;
      }
      const height = matchValue('height');
      if (height) {
        properties['height'] = height;
      }
      if (Object.keys(properties).length === 0) {
        return null;
      }
      return {selector, properties};
    };

    const annotationInsights = annotations.map((ann: any) => ({
      id: ann?.id,
      type: ann?.type,
      selector: ann?.selector,
      text: ann?.text,
      intent: classifyIntent(ann),
    }));
    const priorityOrder = ['bug', 'move', 'layout', 'style', 'copy', 'note'];
    const prioritizedAnnotationIds = annotationInsights
      .slice()
      .sort((a, b) => priorityOrder.indexOf(a.intent) - priorityOrder.indexOf(b.intent))
      .map(item => item.id)
      .filter(Boolean);

    const moveLinks = annotations
      .filter((ann: any) => ann?.type === 'move' && ann?.selector && ann?.targetSelector)
      .map((ann: any) => ({
        id: ann.id,
        text: ann.text,
        sourceSelector: ann.selector,
        targetSelector: ann.targetSelector,
      }));

    const moveOps = moveLinks.map(link => {
      const sourceSelector = JSON.stringify(link.sourceSelector);
      const targetSelector = JSON.stringify(link.targetSelector);
      return {
        tool: 'evaluate_script',
        params: {
          function: `() => {
  const source = document.querySelector(${sourceSelector});
  const target = document.querySelector(${targetSelector});
  if (!source || !target || !target.parentElement) {
    return {moved: false, reason: 'missing element'};
  }
  target.parentElement.insertBefore(source, target);
  return {moved: true};
}`,
        },
      };
    });

    const styleHints = annotations
      .filter((ann: any) => classifyIntent(ann) === 'layout' || classifyIntent(ann) === 'style')
      .map(parseStyleHint)
      .filter(Boolean) as Array<{selector: string; properties: Record<string, string>}>;
    const styleOps = styleHints.map(hint => ({
      tool: 'manipulate_dom',
      params: {
        operations: [
          {
            action: 'set-style',
            selector: hint.selector,
            properties: hint.properties,
          },
        ],
      },
    }));

    const payload: LiveEditingToolResponse<{
      page: {url: string; title?: string};
      annotations: unknown[];
      annotationSource: string;
      pageNotes: string;
      annotationInsights: Array<{
        id?: string;
        type?: string;
        selector?: string;
        text?: string;
        intent: string;
      }>;
      prioritizedAnnotationIds: Array<string>;
      moveLinks: Array<{
        id: string;
        text: string;
        sourceSelector: string;
        targetSelector: string;
      }>;
      snapshots?: {
        wireframe?: typeof wireframeData;
        svg?: typeof svgData;
      };
    }> = {
      kind: 'live_editing_update',
      version: LIVE_EDITING_SCHEMA_VERSION,
      data: {
        page: {url, title},
        annotations,
        annotationSource,
        pageNotes,
        annotationInsights,
        prioritizedAnnotationIds,
        moveLinks,
        snapshots:
          includeSnapshots.wireframe || includeSnapshots.svg
            ? {wireframe: wireframeData, svg: svgData}
            : undefined,
      },
      artifacts,
      instructions: {
        ordered_steps: [
          'Review annotations and prioritize changes (bug → move → layout → style → copy → note).',
          'Apply edits in the browser using batch_ops/insert_css/manipulate_dom.',
          ...(moveLinks.length
            ? ['Apply move links using the provided batch_ops_plan (evaluate_script).']
            : []),
          'Re-run live-editing snapshots to verify changes.',
        ],
        constraints: ['Do not write repo files unless explicitly requested.'],
      },
      batch_ops_plan: moveOps.length || styleOps.length
        ? {
            tool: 'batch_ops',
            params: {
              operations: [...moveOps, ...styleOps],
              executionMode: 'sequential',
              stopOnError: true,
              shareContext: true,
            },
            notes:
              'Move operations insert the source element before the target element. Style ops are heuristic (padding/margin/gap/width/height). Review before executing.',
          }
        : undefined,
    };

    appendLiveEditingResponse(response, payload);
  },
});

