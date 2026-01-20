/**
 * @license
 * Copyright 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

type CoordinateSpace = 'viewport' | 'document';
type StylePreset = 'minimal' | 'standard' | 'debug';

const STYLE_PRESET_MINIMAL = [
  'display',
  'position',
  'z-index',
  'overflow',
  'overflow-x',
  'overflow-y',
  'box-sizing',
  'opacity',
  'visibility',
  'pointer-events',
  'transform',
] as const satisfies readonly string[];

const STYLE_PRESET_STANDARD = [
  ...STYLE_PRESET_MINIMAL,
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'gap',
  'row-gap',
  'column-gap',
  'flex',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'align-content',
  'align-self',
  'justify-content',
  'justify-items',
  'justify-self',
  'grid',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'grid-auto-columns',
  'grid-auto-rows',
  'grid-column',
  'grid-row',
  'grid-area',
  'place-content',
  'place-items',
  'place-self',
  'font-size',
  'line-height',
] as const satisfies readonly string[];

// Debug preset is intentionally still bounded; callers can override via `computedStyleWhitelist`.
const STYLE_PRESET_DEBUG = [
  ...STYLE_PRESET_STANDARD,
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'contain',
  'content-visibility',
  'will-change',
] as const satisfies readonly string[];

function presetStyles(preset: StylePreset): readonly string[] {
  switch (preset) {
    case 'minimal':
      return STYLE_PRESET_MINIMAL;
    case 'standard':
      return STYLE_PRESET_STANDARD;
    case 'debug':
      return STYLE_PRESET_DEBUG;
  }
}

function resolveString(value: unknown, strings: string[]): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return strings[value];
  }
  return undefined;
}

function resolveStringArray(
  values: unknown,
  strings: string[],
): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const out: string[] = [];
  for (const v of values) {
    const s = resolveString(v, strings);
    if (typeof s === 'string') {
      out.push(s);
    }
  }
  return out;
}

function parseAttributes(
  raw: unknown,
  strings: string[],
): {id?: string; classList?: string[]} {
  const attrs = resolveStringArray(raw, strings);
  if (!attrs?.length) {
    return {};
  }
  // Attributes are typically encoded as [name, value, name, value, ...].
  let id: string | undefined;
  let classList: string[] | undefined;
  for (let i = 0; i + 1 < attrs.length; i += 2) {
    const name = attrs[i];
    const value = attrs[i + 1] ?? '';
    if (name === 'id') {
      id = value;
    } else if (name === 'class') {
      classList = value.split(/\s+/).filter(Boolean);
    }
  }
  return {id, classList};
}

function rectFromBounds(bounds: number[]) {
  const [x, y, width, height] = bounds;
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

async function getViewportAndScroll(page: Page): Promise<{
  scrollX: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}> {
  return await page.evaluate(() => {
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
}

interface WireframeSnapshotOutput {
  schemaVersion: number;
  coordinateSpace: CoordinateSpace;
  page: {
    url: string;
    viewport: {width: number; height: number; devicePixelRatio: number};
    scroll: {x: number; y: number};
  };
  computedStyleWhitelist: string[];
  elements: Array<{
    ref?: {backendNodeId: number};
    tagName?: string;
    id?: string;
    classList?: string[];
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
    };
    computedStyles?: Record<string, string>;
  }>;
  truncated: boolean;
}

async function captureWireframeSnapshot(
  request: {
    params: {
      selectors?: string[];
      scopeSelector?: string;
      includeDescendants?: boolean;
      maxElements?: number;
      includeComputedStyles?: boolean;
      stylePreset?: StylePreset;
      computedStyleWhitelist?: string[];
      coordinateSpace?: CoordinateSpace;
    };
  },
  context: {getSelectedPage(): Page},
): Promise<{output: WireframeSnapshotOutput; json: string; bytes: Uint8Array}> {
  const page = context.getSelectedPage();
  const client = await page.createCDPSession();
  try {
    const {scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio} =
      await getViewportAndScroll(page);

    const coordinateSpace = request.params.coordinateSpace ?? 'viewport';
    const includeComputedStyles = request.params.includeComputedStyles ?? false;

    const computedStyleWhitelistParam = request.params.computedStyleWhitelist;
    // Treat an empty array as "unset" so we still fall back to presets.
    const computedStyleWhitelist =
      Array.isArray(computedStyleWhitelistParam) &&
      computedStyleWhitelistParam.length > 0
        ? computedStyleWhitelistParam
        : undefined;

    const computedStyles: string[] = includeComputedStyles
      ? computedStyleWhitelist
        ? [...computedStyleWhitelist]
        : [...presetStyles(request.params.stylePreset ?? 'minimal')]
      : [];

    // Capture snapshot (single call, deterministic ordering).
    // We intentionally keep additional includes off to keep payload compact.
    const snapshot = (await client.send('DOMSnapshot.captureSnapshot', {
      computedStyles,
      includeDOMRects: true,
      includePaintOrder: false,
    })) as any;

    const strings: string[] = Array.isArray(snapshot?.strings)
      ? snapshot.strings
      : [];
    const documents: any[] = Array.isArray(snapshot?.documents)
      ? snapshot.documents
      : [];

    if (!documents.length) {
      const output: WireframeSnapshotOutput = {
        schemaVersion: 1,
        coordinateSpace,
        page: {
          url: page.url(),
          viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
          scroll: {x: scrollX, y: scrollY},
        },
        computedStyleWhitelist: includeComputedStyles ? computedStyles : [],
        elements: [],
        truncated: false,
      };
      const json = JSON.stringify(output, null, 2);
      return {output, json, bytes: new TextEncoder().encode(json)};
    }

    const doc = documents[0];
    const nodes = doc.nodes ?? {};
    const layout = doc.layout ?? {};

    const nodeName = nodes.nodeName;
    const backendNodeId = nodes.backendNodeId;
    const attributes = nodes.attributes;
    const parentIndex = nodes.parentIndex;

    const layoutNodeIndex: number[] = Array.isArray(layout.nodeIndex)
      ? layout.nodeIndex
      : [];
    const layoutBounds: number[][] = Array.isArray(layout.bounds)
      ? layout.bounds
      : [];
    const layoutStyles: unknown[] | undefined = Array.isArray(layout.styles)
      ? layout.styles
      : undefined;

    // Resolve scope + selector filters using CDP DOM querying (fast and stable).
    // We map selector matches to node indices (via backendNodeId) to filter layout nodes.
    const shouldIncludeNodeIndex = new Set<number>();
    const scopeNodeIndices = new Set<number>();

    const includeDescendants = request.params.includeDescendants ?? false;
    const selectors = request.params.selectors;
    const scopeSelector = request.params.scopeSelector;

    if (scopeSelector || selectors?.length) {
      const dom = await client.send('DOM.getDocument', {depth: -1});
      const rootNodeId = (dom as any)?.root?.nodeId as number | undefined;
      if (rootNodeId) {
        let scopeNodeId = rootNodeId;
        if (scopeSelector) {
          const scoped = (await client.send('DOM.querySelector', {
            nodeId: rootNodeId,
            selector: scopeSelector,
          })) as any;
          if (scoped?.nodeId) {
            scopeNodeId = scoped.nodeId;
          }
        }

        if (scopeNodeId !== rootNodeId) {
          const scopeDesc = (await client.send('DOM.describeNode', {
            nodeId: scopeNodeId,
          })) as any;
          const scopeBackend = scopeDesc?.node?.backendNodeId as
            | number
            | undefined;
          if (typeof scopeBackend === 'number' && Array.isArray(backendNodeId)) {
            const idx = backendNodeId.indexOf(scopeBackend);
            if (idx >= 0) {
              scopeNodeIndices.add(idx);
            }
          }
        }

        if (selectors?.length) {
          for (const selector of selectors) {
            const q = (await client.send('DOM.querySelectorAll', {
              nodeId: scopeNodeId,
              selector,
            })) as any;
            const nodeIds: number[] = Array.isArray(q?.nodeIds) ? q.nodeIds : [];
            for (const nodeId of nodeIds) {
              const desc = (await client.send('DOM.describeNode', {
                nodeId,
              })) as any;
              const b = desc?.node?.backendNodeId as number | undefined;
              if (typeof b !== 'number' || !Array.isArray(backendNodeId)) {
                continue;
              }
              const idx = backendNodeId.indexOf(b);
              if (idx >= 0) {
                shouldIncludeNodeIndex.add(idx);
              }
            }
          }
        }
      }
    }

    const elements: WireframeSnapshotOutput['elements'] = [];
    const maxElements = request.params.maxElements ?? 50;

    // Walk layout snapshot entries in order for deterministic output.
    for (let i = 0; i < layoutNodeIndex.length; i++) {
      const nodeIdx = layoutNodeIndex[i];
      const bounds = layoutBounds[i];
      if (!Array.isArray(bounds) || bounds.length < 4) {
        continue;
      }

      // Apply scope filter (ancestry-based), if present.
      if (scopeNodeIndices.size) {
        let cur = nodeIdx;
        let inScope = false;
        while (cur >= 0) {
          if (scopeNodeIndices.has(cur)) {
            inScope = true;
            break;
          }
          const p =
            Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
              ? parentIndex[cur]
              : -1;
          cur = p;
        }
        if (!inScope) {
          continue;
        }
      }

      // Apply selector filter, if present.
      if (shouldIncludeNodeIndex.size) {
        if (includeDescendants) {
          // Include descendants of matched nodes by checking ancestry.
          let cur = nodeIdx;
          let matched = false;
          while (cur >= 0) {
            if (shouldIncludeNodeIndex.has(cur)) {
              matched = true;
              break;
            }
            const p =
              Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
                ? parentIndex[cur]
                : -1;
            cur = p;
          }
          if (!matched) {
            continue;
          }
        } else if (!shouldIncludeNodeIndex.has(nodeIdx)) {
          continue;
        }
      }

      let rect = rectFromBounds(bounds);
      if (coordinateSpace === 'viewport') {
        rect = rectFromBounds([
          rect.x - scrollX,
          rect.y - scrollY,
          rect.width,
          rect.height,
        ]);
      }

      const tagName = resolveString(
        Array.isArray(nodeName) ? nodeName[nodeIdx] : undefined,
        strings,
      );

      const {id, classList} = parseAttributes(
        Array.isArray(attributes) ? attributes[nodeIdx] : undefined,
        strings,
      );

      const styleValues = includeComputedStyles
        ? resolveStringArray(
            Array.isArray(layoutStyles) ? layoutStyles[i] : undefined,
            strings,
          )
        : undefined;

      const stylesObj: Record<string, string> | undefined =
        includeComputedStyles && styleValues
          ? Object.fromEntries(
              computedStyles.map((k, idx) => [k, styleValues[idx] ?? '']),
            )
          : undefined;

      const backend =
        Array.isArray(backendNodeId) && typeof backendNodeId[nodeIdx] === 'number'
          ? backendNodeId[nodeIdx]
          : undefined;

      elements.push({
        ref: backend ? {backendNodeId: backend} : undefined,
        tagName,
        id,
        classList,
        rect,
        computedStyles: stylesObj,
      });

      if (elements.length >= maxElements) {
        break;
      }
    }

    const output: WireframeSnapshotOutput = {
      schemaVersion: 1,
      coordinateSpace,
      page: {
        url: page.url(),
        viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
        scroll: {x: scrollX, y: scrollY},
      },
      computedStyleWhitelist: includeComputedStyles ? computedStyles : [],
      elements,
      truncated: elements.length >= maxElements,
    };

    const json = JSON.stringify(output, null, 2);
    const bytes = new TextEncoder().encode(json);
    return {output, json, bytes};
  } finally {
    await client.detach().catch(() => {
      // Ignore.
    });
  }
}

export const wireframeSnapshot = defineTool({
  name: 'wireframe_snapshot',
  description:
    `Capture a compact, deterministic wireframe snapshot of the currently selected page using CDP DOMSnapshot.captureSnapshot. ` +
    `Returns element rects (and optionally a small set of computed styles) suitable for overlap/gap analysis.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    // Scope / selection
    selectors: zod
      .array(zod.string())
      .optional()
      .describe(
        'Optional CSS selectors. When provided, the snapshot is filtered to these elements (not their descendants unless includeDescendants is true).',
      ),
    scopeSelector: zod
      .string()
      .optional()
      .describe(
        'Optional CSS selector that constrains results to elements within this scope element.',
      ),
    includeDescendants: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'When used with selectors, includes matching elements’ descendants as well (within scopeSelector if provided).',
      ),

    // Payload shaping
    maxElements: zod
      .number()
      .int()
      .positive()
      .default(50)
      .optional()
      .describe('Maximum number of elements to return (after filtering).'),
    includeComputedStyles: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes a whitelist of computed styles for each element via DOMSnapshot.captureSnapshot.',
      ),
    stylePreset: zod
      .enum(['minimal', 'standard', 'debug'])
      .default('minimal')
      .optional()
      .describe(
        'Computed style whitelist preset used when computedStyleWhitelist is not provided.',
      ),
    computedStyleWhitelist: zod
      .array(zod.string())
      .optional()
      .describe(
        'Override computed style whitelist. If provided, stylePreset is ignored.',
      ),

    coordinateSpace: zod
      .enum(['viewport', 'document'])
      .default('viewport')
      .optional()
      .describe(
        'Coordinate space for returned rects: viewport (scroll-adjusted) or document (page coordinates).',
      ),

    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the JSON output to instead of returning it inline.',
      ),
  },
  handler: async (request, response, context) => {
    const {json, bytes} = await captureWireframeSnapshot(request as any, context);

    if (request.params.filePath) {
      const file = await context.saveFile(bytes, request.params.filePath);
      response.appendResponseLine(`Saved wireframe snapshot JSON to ${file.filename}.`);
    } else if (bytes.length >= 2_000_000) {
      const {filename} = await context.saveTemporaryFile(
        bytes,
        'application/json',
        'wireframe_snapshot',
      );
      response.appendResponseLine(`Saved wireframe snapshot JSON to ${filename}.`);
    } else {
      response.appendResponseLine('```json');
      response.appendResponseLine(json);
      response.appendResponseLine('```');
    }
  },
});

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function elementLabel(el: WireframeSnapshotOutput['elements'][number]): string {
  const parts: string[] = [];
  if (el.tagName) {
    parts.push(el.tagName.toLowerCase());
  }
  if (el.id) {
    parts.push(`#${el.id}`);
  }
  if (el.classList?.length) {
    parts.push(`.${el.classList.join('.')}`);
  }
  return parts.join('');
}

function renderSvgWireframe(
  snapshot: WireframeSnapshotOutput,
  options: {
    scale: number;
    background: 'transparent' | 'white' | 'black';
    showLabels: boolean;
    showDimensions: boolean;
    showSpacing: boolean;
    strokeWidth: number;
    fillOpacity: number;
    highlightChanged: boolean;
    previous?: WireframeSnapshotOutput;
  },
): string {
  const viewportW = snapshot.page.viewport.width;
  const viewportH = snapshot.page.viewport.height;
  const scale = options.scale;

  const viewBox =
    snapshot.coordinateSpace === 'document'
      ? `${snapshot.page.scroll.x} ${snapshot.page.scroll.y} ${viewportW} ${viewportH}`
      : `0 0 ${viewportW} ${viewportH}`;

  const bg =
    options.background === 'transparent'
      ? 'none'
      : options.background === 'white'
        ? '#ffffff'
        : '#000000';

  const prevByBackend = new Map<number, WireframeSnapshotOutput['elements'][number]>();
  if (options.previous) {
    for (const el of options.previous.elements) {
      const id = el.ref?.backendNodeId;
      if (typeof id === 'number') {
        prevByBackend.set(id, el);
      }
    }
  }

  const rects: string[] = [];
  const labels: string[] = [];
  const dims: string[] = [];
  const spacing: string[] = [];

  for (let idx = 0; idx < snapshot.elements.length; idx++) {
    const el = snapshot.elements[idx];
    const r = el.rect;
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) {
      continue;
    }
    if (r.width <= 0 || r.height <= 0) {
      continue;
    }

    // Stable-ish color: hash from index.
    const hue = (idx * 37) % 360;
    const stroke = `hsl(${hue} 80% 45%)`;
    const fill = `hsl(${hue} 80% 45% / ${clamp(options.fillOpacity, 0, 1)})`;

    const backendId = el.ref?.backendNodeId;
    const prev = typeof backendId === 'number' ? prevByBackend.get(backendId) : undefined;
    const changed =
      !!prev &&
      (Math.abs(prev.rect.x - r.x) > 0.5 ||
        Math.abs(prev.rect.y - r.y) > 0.5 ||
        Math.abs(prev.rect.width - r.width) > 0.5 ||
        Math.abs(prev.rect.height - r.height) > 0.5);

    const isHighlighted = options.highlightChanged && changed;
    const strokeColor = isHighlighted ? '#ff3b30' : stroke;
    const strokeDash = isHighlighted ? '6 4' : '';

    rects.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ` +
        `fill="${fill}" stroke="${strokeColor}" stroke-width="${options.strokeWidth}"` +
        (strokeDash ? ` stroke-dasharray="${strokeDash}"` : '') +
        ` />`,
    );

    if (options.showLabels) {
      const text = elementLabel(el);
      if (text) {
        const x = r.x + 2;
        const y = r.y + 12;
        labels.push(
          `<text x="${x}" y="${y}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" ` +
            `font-size="11" fill="${options.background === 'black' ? '#ffffff' : '#111111'}">` +
            `${escapeXml(text)}` +
            `</text>`,
        );
      }
    }

    if (options.showDimensions) {
      const text = `${Math.round(r.width)}×${Math.round(r.height)}`;
      const x = r.x + 2;
      const y = r.y + Math.min(r.height, 16) - 2;
      dims.push(
        `<text x="${x}" y="${y}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" ` +
          `font-size="10" fill="${options.background === 'black' ? '#ffffff' : '#111111'}">` +
          `${escapeXml(text)}` +
          `</text>`,
      );
    }

    if (options.showSpacing && el.computedStyles) {
      // Visualize margins with dashed lines
      const marginTop = parseFloat(el.computedStyles['margin-top'] || '0');
      const marginRight = parseFloat(el.computedStyles['margin-right'] || '0');
      const marginBottom = parseFloat(el.computedStyles['margin-bottom'] || '0');
      const marginLeft = parseFloat(el.computedStyles['margin-left'] || '0');

      if (marginTop > 0) {
        spacing.push(
          `<line x1="${r.x}" y1="${r.y - marginTop}" x2="${r.x + r.width}" y2="${r.y - marginTop}" ` +
            `stroke="#ff6b6b" stroke-width="1" stroke-dasharray="2 2" opacity="0.7" />`,
        );
      }
      if (marginRight > 0) {
        spacing.push(
          `<line x1="${r.x + r.width + marginRight}" y1="${r.y}" x2="${r.x + r.width + marginRight}" y2="${r.y + r.height}" ` +
            `stroke="#ff6b6b" stroke-width="1" stroke-dasharray="2 2" opacity="0.7" />`,
        );
      }
      if (marginBottom > 0) {
        spacing.push(
          `<line x1="${r.x}" y1="${r.y + r.height + marginBottom}" x2="${r.x + r.width}" y2="${r.y + r.height + marginBottom}" ` +
            `stroke="#ff6b6b" stroke-width="1" stroke-dasharray="2 2" opacity="0.7" />`,
        );
      }
      if (marginLeft > 0) {
        spacing.push(
          `<line x1="${r.x - marginLeft}" y1="${r.y}" x2="${r.x - marginLeft}" y2="${r.y + r.height}" ` +
            `stroke="#ff6b6b" stroke-width="1" stroke-dasharray="2 2" opacity="0.7" />`,
        );
      }

      // Visualize padding with dotted lines
      const paddingTop = parseFloat(el.computedStyles['padding-top'] || '0');
      const paddingRight = parseFloat(el.computedStyles['padding-right'] || '0');
      const paddingBottom = parseFloat(el.computedStyles['padding-bottom'] || '0');
      const paddingLeft = parseFloat(el.computedStyles['padding-left'] || '0');

      if (paddingTop > 0) {
        spacing.push(
          `<line x1="${r.x}" y1="${r.y + paddingTop}" x2="${r.x + r.width}" y2="${r.y + paddingTop}" ` +
            `stroke="#4ecdc4" stroke-width="1" stroke-dasharray="1 1" opacity="0.7" />`,
        );
      }
      if (paddingRight > 0) {
        spacing.push(
          `<line x1="${r.x + r.width - paddingRight}" y1="${r.y}" x2="${r.x + r.width - paddingRight}" y2="${r.y + r.height}" ` +
            `stroke="#4ecdc4" stroke-width="1" stroke-dasharray="1 1" opacity="0.7" />`,
        );
      }
      if (paddingBottom > 0) {
        spacing.push(
          `<line x1="${r.x}" y1="${r.y + r.height - paddingBottom}" x2="${r.x + r.width}" y2="${r.y + r.height - paddingBottom}" ` +
            `stroke="#4ecdc4" stroke-width="1" stroke-dasharray="1 1" opacity="0.7" />`,
        );
      }
      if (paddingLeft > 0) {
        spacing.push(
          `<line x1="${r.x + paddingLeft}" y1="${r.y}" x2="${r.x + paddingLeft}" y2="${r.y + r.height}" ` +
            `stroke="#4ecdc4" stroke-width="1" stroke-dasharray="1 1" opacity="0.7" />`,
        );
      }

      // Show gap visualization for flex/grid containers
      const gap = parseFloat(el.computedStyles['gap'] || '0');
      if (gap > 0 && el.computedStyles['display'] === 'flex') {
        // Simple gap visualization - draw cross lines
        const centerX = r.x + r.width / 2;
        const centerY = r.y + r.height / 2;
        spacing.push(
          `<circle cx="${centerX}" cy="${centerY}" r="3" fill="#ffa726" opacity="0.8" />`,
        );
        spacing.push(
          `<text x="${centerX + 5}" y="${centerY + 4}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" ` +
            `font-size="9" fill="#ffa726">gap:${gap}px` +
            `</text>`,
        );
      }
    }

    // Optional: draw previous rect as faint outline.
    if (options.highlightChanged && changed && prev) {
      const pr = prev.rect;
      rects.push(
        `<rect x="${pr.x}" y="${pr.y}" width="${pr.width}" height="${pr.height}" ` +
          `fill="none" stroke="#34c759" stroke-width="${options.strokeWidth}" stroke-dasharray="2 3" />`,
      );
    }
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportW * scale}" height="${viewportH * scale}" viewBox="${viewBox}">` +
    `<rect x="${snapshot.coordinateSpace === 'document' ? snapshot.page.scroll.x : 0}" ` +
    `y="${snapshot.coordinateSpace === 'document' ? snapshot.page.scroll.y : 0}" ` +
    `width="${viewportW}" height="${viewportH}" fill="${bg}" />` +
    `<g>` +
    rects.join('') +
    `</g>` +
    (labels.length ? `<g>` + labels.join('') + `</g>` : '') +
    (dims.length ? `<g>` + dims.join('') + `</g>` : '') +
    (spacing.length ? `<g>` + spacing.join('') + `</g>` : '') +
    `</svg>`
  );
}

export { captureWireframeSnapshot, renderSvgWireframe };

export const svgSnapshot = defineTool({
  name: 'svg_snapshot',
  description:
    `Render a visual SVG wireframe of the current page (or a subset of elements). ` +
    `Uses the same underlying snapshot as wireframe_snapshot, but returns the SVG content wrapped in JSON for better parseability.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    // Scope / selection (same semantics as wireframe_snapshot)
    selectors: zod
      .array(zod.string())
      .optional()
      .describe(
        'Optional CSS selectors. When provided, the snapshot is filtered to these elements (not their descendants unless includeDescendants is true).',
      ),
    scopeSelector: zod
      .string()
      .optional()
      .describe(
        'Optional CSS selector that constrains results to elements within this scope element.',
      ),
    includeDescendants: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'When used with selectors, includes matching elements’ descendants as well (within scopeSelector if provided).',
      ),

    // Payload shaping
    maxElements: zod
      .number()
      .int()
      .positive()
      .default(50)
      .optional()
      .describe('Maximum number of elements to render (after filtering).'),
    includeComputedStyles: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes a whitelist of computed styles for each element via DOMSnapshot.captureSnapshot (also used for optional diff/analysis).',
      ),
    stylePreset: zod
      .enum(['minimal', 'standard', 'debug'])
      .default('minimal')
      .optional()
      .describe(
        'Computed style whitelist preset used when computedStyleWhitelist is not provided.',
      ),
    computedStyleWhitelist: zod
      .array(zod.string())
      .optional()
      .describe(
        'Override computed style whitelist. If provided, stylePreset is ignored.',
      ),

    coordinateSpace: zod
      .enum(['viewport', 'document'])
      .default('viewport')
      .optional()
      .describe(
        'Coordinate space for rendering: viewport (scroll-adjusted) or document (absolute page coordinates, viewBox set to current viewport window).',
      ),

    // Visual options
    scale: zod
      .number()
      .min(0.1)
      .max(4)
      .default(1)
      .optional()
      .describe('Scale factor applied to the output SVG dimensions.'),
    background: zod
      .enum(['transparent', 'white', 'black'])
      .default('transparent')
      .optional()
      .describe('Background fill for the SVG canvas.'),
    showLabels: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, draws tag/id/class labels in the top-left of each box.'),
    showDimensions: zod
      .boolean()
      .default(false)
      .optional()
      .describe('If true, draws width×height labels for each box.'),
    showSpacing: zod
      .boolean()
      .default(false)
      .optional()
      .describe('If true, visualizes margins, padding, and gaps between elements.'),
    strokeWidth: zod
      .number()
      .min(0.25)
      .max(8)
      .default(1)
      .optional()
      .describe('Stroke width for element rectangles.'),
    fillOpacity: zod
      .number()
      .min(0)
      .max(1)
      .default(0.08)
      .optional()
      .describe('Fill opacity for element rectangles.'),

    // Diffing (optional)
    compareWith: zod
      .string()
      .optional()
      .describe(
        'Optional previous wireframe JSON (from wireframe_snapshot) to compare against. When provided with highlightChanged=true, changed rects are highlighted.',
      ),
    highlightChanged: zod
      .boolean()
      .default(false)
      .optional()
      .describe('If true, highlights elements whose rect changed compared to compareWith.'),

    // Output options
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the SVG output to instead of attaching it to the response.',
      ),
  },
  handler: async (request, response, context) => {
    const {output} = await captureWireframeSnapshot(request as any, context);

    let previous: WireframeSnapshotOutput | undefined;
    if (typeof request.params.compareWith === 'string' && request.params.compareWith) {
      try {
        previous = JSON.parse(request.params.compareWith) as WireframeSnapshotOutput;
      } catch (e) {
        throw new Error(
          `Invalid compareWith JSON provided: ${(e as Error).message ?? String(e)}`,
        );
      }
    }

    const svg = renderSvgWireframe(output, {
      scale: request.params.scale ?? 1,
      background: request.params.background ?? 'transparent',
      showLabels: request.params.showLabels ?? true,
      showDimensions: request.params.showDimensions ?? false,
      showSpacing: request.params.showSpacing ?? false,
      strokeWidth: request.params.strokeWidth ?? 1,
      fillOpacity: request.params.fillOpacity ?? 0.08,
      highlightChanged: request.params.highlightChanged ?? false,
      previous,
    });

    const bytes = new TextEncoder().encode(svg);

    response.appendResponseLine(
      `Rendered SVG wireframe (${output.elements.length}${output.truncated ? '+' : ''} elements).`,
    );

    if (request.params.filePath) {
      const file = await context.saveFile(bytes, request.params.filePath);
      response.appendResponseLine(`Saved SVG wireframe to ${file.filename}.`);
      return;
    }

    // Return SVG content wrapped in JSON for better parseability
    const result = {
      svg: svg,
      elementCount: output.elements.length,
      truncated: output.truncated || false,
      viewport: output.page.viewport,
    };

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(result, null, 2));
    response.appendResponseLine('```');
  },
});




