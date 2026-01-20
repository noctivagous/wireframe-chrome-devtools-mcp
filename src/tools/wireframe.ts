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
type ComputedStylePreset =
  | 'minimal'
  | 'layout'
  | 'standard'
  | 'debug'
  | 'typography'
  | 'paint';

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
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'flex',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
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

// Layout preset: intended default for UI/layout debugging (flex/grid/spacing/positioning/sizing).
const STYLE_PRESET_LAYOUT = [
  'display',
  'position',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'flex-direction',
  'flex-wrap',
  'flex',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'grid-auto-columns',
  'grid-auto-rows',
  'justify-content',
  'align-items',
  'align-content',
  'place-content',
  'place-items',
  'place-self',
  'gap',
  'row-gap',
  'column-gap',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'box-sizing',
  'overflow',
  'overflow-x',
  'overflow-y',
  'contain',
  'content-visibility',
] as const satisfies readonly string[];

const STYLE_PRESET_TYPOGRAPHY = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-decoration',
  'text-align',
  'white-space',
  'word-break',
  'overflow-wrap',
] as const satisfies readonly string[];

const STYLE_PRESET_PAINT = [
  'opacity',
  'visibility',
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'box-shadow',
  'filter',
  'backdrop-filter',
] as const satisfies readonly string[];

// Debug preset is intentionally still bounded; callers can override via `computedStyleWhitelist`.
const STYLE_PRESET_DEBUG = [
  ...STYLE_PRESET_STANDARD,
  'top',
  'right',
  'bottom',
  'left',
  'contain',
  'content-visibility',
  'will-change',
] as const satisfies readonly string[];

function presetStyles(preset: ComputedStylePreset): readonly string[] {
  switch (preset) {
    case 'minimal':
      return STYLE_PRESET_MINIMAL;
    case 'layout':
      return STYLE_PRESET_LAYOUT;
    case 'standard':
      return STYLE_PRESET_STANDARD;
    case 'debug':
      return STYLE_PRESET_DEBUG;
    case 'typography':
      return STYLE_PRESET_TYPOGRAPHY;
    case 'paint':
      return STYLE_PRESET_PAINT;
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

function buildRareStringLookup(
  data: unknown,
  strings: string[],
): Map<number, string> | undefined {
  // CDP sometimes uses "rare string" encoding: {index: number[], value: (string|number)[]}
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const idxs = (data as any).index;
  const vals = (data as any).value;
  if (!Array.isArray(idxs) || !Array.isArray(vals) || idxs.length !== vals.length) {
    return undefined;
  }
  const out = new Map<number, string>();
  for (let i = 0; i < idxs.length; i++) {
    const idx = idxs[i];
    const val = resolveString(vals[i], strings);
    if (typeof idx === 'number' && typeof val === 'string') {
      out.set(idx, val);
    }
  }
  return out;
}

function resolveNodeFieldString(
  field: unknown,
  nodeIdx: number,
  strings: string[],
  rareLookup?: Map<number, string>,
): string | undefined {
  if (rareLookup) {
    return rareLookup.get(nodeIdx);
  }
  if (Array.isArray(field)) {
    return resolveString(field[nodeIdx], strings);
  }
  return undefined;
}

function parseAttributes(
  raw: unknown,
  strings: string[],
): {id?: string; classList?: string[]; dataAttrs?: Record<string, string>} {
  const attrs = resolveStringArray(raw, strings);
  if (!attrs?.length) {
    return {};
  }
  // Attributes are typically encoded as [name, value, name, value, ...].
  let id: string | undefined;
  let classList: string[] | undefined;
  const dataAttrs: Record<string, string> = {};
  for (let i = 0; i + 1 < attrs.length; i += 2) {
    const name = attrs[i];
    const value = attrs[i + 1] ?? '';
    if (name === 'id') {
      id = value;
    } else if (name === 'class') {
      classList = value.split(/\s+/).filter(Boolean);
    } else if (name && name.startsWith('data-')) {
      dataAttrs[name] = value;
    }
  }
  return {id, classList, dataAttrs: Object.keys(dataAttrs).length ? dataAttrs : undefined};
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

function isElementTagName(tagName: string | undefined): boolean {
  if (!tagName) {
    return false;
  }
  return !tagName.startsWith('#');
}

function pickStableIdFromAttrs(input: {
  id?: string;
  dataAttrs?: Record<string, string>;
}): string | undefined {
  if (input.id) {
    return `id:${input.id}`;
  }
  const data = input.dataAttrs ?? {};
  const keys = [
    'data-testid',
    'data-test',
    'data-cy',
    'data-qa',
    'data-automation-id',
  ];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v) {
      return `data:${k}=${v}`;
    }
  }
  return undefined;
}

function buildChildrenByParent(parentIndex: unknown, nodeCount: number): number[][] {
  const out: number[][] = Array.from({length: nodeCount}, () => []);
  if (!Array.isArray(parentIndex)) {
    return out;
  }
  for (let i = 0; i < nodeCount; i++) {
    const p = typeof parentIndex[i] === 'number' ? (parentIndex[i] as number) : -1;
    if (p >= 0 && p < nodeCount) {
      out[p]!.push(i);
    }
  }
  return out;
}

function elementChildPosition(
  nodeIdx: number,
  parentIdx: number,
  childrenByParent: number[][],
  nodeName: unknown,
  strings: string[],
): number | undefined {
  const kids = childrenByParent[parentIdx];
  if (!kids?.length) {
    return undefined;
  }
  let pos = 0;
  for (const k of kids) {
    const tag = resolveString(Array.isArray(nodeName) ? nodeName[k] : undefined, strings);
    if (!isElementTagName(tag)) {
      continue;
    }
    pos++;
    if (k === nodeIdx) {
      return pos; // 1-based, CSS-like
    }
  }
  return undefined;
}

function stablePathForNode(
  nodeIdx: number,
  parentIndex: unknown,
  nodeName: unknown,
  strings: string[],
  childrenByParent: number[][],
  stopAtIdx: number | undefined,
  shadowRootTypeField: unknown,
  shadowLookup?: Map<number, string>,
): string {
  const segments: string[] = [];
  let cur = nodeIdx;
  while (cur >= 0) {
    const tag = resolveString(Array.isArray(nodeName) ? nodeName[cur] : undefined, strings);
    const shadowRootType = resolveNodeFieldString(
      shadowRootTypeField,
      cur,
      strings,
      shadowLookup,
    );

    if (isElementTagName(tag) && tag) {
      const p =
        Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
          ? (parentIndex[cur] as number)
          : -1;
      const nth =
        p >= 0 ? elementChildPosition(cur, p, childrenByParent, nodeName, strings) : undefined;
      const seg = nth ? `${tag.toLowerCase()}:nth-child(${nth})` : tag.toLowerCase();
      segments.push(seg);
    } else if (tag === '#document-fragment' && shadowRootType) {
      segments.push(`#shadow-root(${shadowRootType})`);
    }

    if (typeof stopAtIdx === 'number' && cur === stopAtIdx) {
      break;
    }

    const p =
      Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
        ? (parentIndex[cur] as number)
        : -1;
    cur = p;
  }

  return segments.reverse().join('>');
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
    visualViewport?: {
      scale: number;
      offsetLeft: number;
      offsetTop: number;
      width: number;
      height: number;
    };
  };
  computedStyleWhitelist: string[];
  elements: Array<{
    ref?: {backendNodeId: number};
    stableId?: string;
    matchedSelectors?: string[];
    depth?: number;
    shadowRootType?: string;
    pseudoType?: string;
    tagName?: string;
    id?: string;
    classList?: string[];
    textSnippet?: string;
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
    changed?: boolean;
    changedComputedStyleKeys?: string[];
  }>;
  truncated: boolean;
  returnedElementCount?: number;
  estimatedTotalElementsInScope?: number;
  whyTruncated?: 'maxTotal';
  layoutAssertions?: {
    overflowXOffenders: Array<{stableId: string; right: number; excess: number}>;
    overflowYOffenders: Array<{stableId: string; bottom: number; excess: number}>;
  };
  diff?: {
    changedElements: Array<{
      stableId: string;
      rectChanged: boolean;
      computedStylesChanged: boolean;
      changedComputedStyleKeys?: string[];
    }>;
    addedElements: string[];
    removedElements: string[];
  };
}

async function captureWireframeSnapshot(
  request: {
    params: {
      selectors?: string[];
      scopeSelector?: string;
      includeDescendants?: boolean;
      maxElements?: number; // legacy alias for maxTotal
      maxTotal?: number;
      maxPerSelector?: number;
      maxDepth?: number;
      includeComputedStyles?: boolean;
      // Deprecated: use computedStylePreset. Kept for compatibility.
      stylePreset?: ComputedStylePreset;
      computedStylePreset?: ComputedStylePreset;
      computedStyleWhitelist?: string[];
      coordinateSpace?: CoordinateSpace;
      includeShadowDom?: boolean;
      includePseudoElements?: boolean;
      scrollToSelector?: string;
      scrollToY?: number;
      includeTextSnippets?: boolean;
      textSnippetMaxLength?: number;
      includeLayoutAssertions?: boolean;
      compareWith?: string;
      includeDiff?: boolean;
      highlightChanged?: boolean;
    };
  },
  context: {getSelectedPage(): Page},
): Promise<{output: WireframeSnapshotOutput; json: string; bytes: Uint8Array}> {
  const page = context.getSelectedPage();
  const client = await page.createCDPSession();
  try {
    // Optional scroll ergonomics for repeatable snapshots.
    if (typeof request.params.scrollToY === 'number' && Number.isFinite(request.params.scrollToY)) {
      await page.evaluate(y => window.scrollTo({top: y, left: window.scrollX}), request.params.scrollToY);
    }
    if (typeof request.params.scrollToSelector === 'string' && request.params.scrollToSelector) {
      await page.evaluate(selector => {
        const el = document.querySelector(selector);
        if (el) {
          (el as HTMLElement).scrollIntoView({block: 'center', inline: 'nearest'});
        }
      }, request.params.scrollToSelector);
    }

    const {scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio} =
      await getViewportAndScroll(page);
    const visualViewport = await page.evaluate(() => {
      const vv = (window as any).visualViewport;
      if (!vv) return undefined;
      return {
        scale: Number(vv.scale ?? 1),
        offsetLeft: Number(vv.offsetLeft ?? 0),
        offsetTop: Number(vv.offsetTop ?? 0),
        width: Number(vv.width ?? window.innerWidth),
        height: Number(vv.height ?? window.innerHeight),
      };
    });

    const coordinateSpace = request.params.coordinateSpace ?? 'viewport';
    const includeComputedStyles = request.params.includeComputedStyles ?? false;
    const includeShadowDom = request.params.includeShadowDom ?? false;
    const includePseudoElements = request.params.includePseudoElements ?? false;

    const computedStyleWhitelistParam = request.params.computedStyleWhitelist;
    // Treat an empty array as "unset" so we still fall back to presets.
    const computedStyleWhitelist =
      Array.isArray(computedStyleWhitelistParam) &&
      computedStyleWhitelistParam.length > 0
        ? computedStyleWhitelistParam
        : undefined;

    const preset: ComputedStylePreset =
      request.params.computedStylePreset ?? request.params.stylePreset ?? 'layout';

    const computedStyles: string[] = includeComputedStyles
      ? computedStyleWhitelist
        ? [...computedStyleWhitelist]
        : [...presetStyles(preset)]
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
        schemaVersion: 2,
        coordinateSpace,
        page: {
          url: page.url(),
          viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
          scroll: {x: scrollX, y: scrollY},
          visualViewport: visualViewport ?? undefined,
        },
        computedStyleWhitelist: includeComputedStyles ? computedStyles : [],
        elements: [],
        truncated: false,
        returnedElementCount: 0,
        estimatedTotalElementsInScope: 0,
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
    const pseudoTypeField = nodes.pseudoType;
    const shadowRootTypeField = nodes.shadowRootType;
    const textValueField = nodes.textValue ?? nodes.nodeValue;

    const shadowRootLookup = buildRareStringLookup(shadowRootTypeField, strings);
    const pseudoTypeLookup = buildRareStringLookup(pseudoTypeField, strings);
    const textValueLookup = buildRareStringLookup(textValueField, strings);

    const nodeCount = Array.isArray(nodeName) ? nodeName.length : 0;
    const childrenByParent = buildChildrenByParent(parentIndex, nodeCount);

    const backendNodeIdToIndex = new Map<number, number>();
    if (Array.isArray(backendNodeId)) {
      for (let i = 0; i < backendNodeId.length; i++) {
        const b = backendNodeId[i];
        if (typeof b === 'number') {
          backendNodeIdToIndex.set(b, i);
        }
      }
    }

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
    // We map selector matches to snapshot node indices (via backendNodeId) to filter layout nodes.
    const shouldIncludeNodeIndex = new Set<number>();
    const matchedSelectorsByNodeIndex = new Map<number, string[]>();
    const scopeNodeIndices = new Set<number>();

    const includeDescendants = request.params.includeDescendants ?? false;
    const selectors = request.params.selectors;
    const scopeSelector = request.params.scopeSelector;
    const maxPerSelector =
      typeof request.params.maxPerSelector === 'number' &&
      Number.isFinite(request.params.maxPerSelector) &&
      request.params.maxPerSelector > 0
        ? Math.floor(request.params.maxPerSelector)
        : undefined;

    const addSelectorMatch = (nodeIdx: number, selector: string) => {
      shouldIncludeNodeIndex.add(nodeIdx);
      const existing = matchedSelectorsByNodeIndex.get(nodeIdx);
      if (!existing) {
        matchedSelectorsByNodeIndex.set(nodeIdx, [selector]);
      } else if (!existing.includes(selector)) {
        existing.push(selector);
      }
    };

    if (scopeSelector || selectors?.length) {
      const dom = await client.send('DOM.getDocument', {depth: -1, pierce: includeShadowDom});
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

        const searchRootNodeIds: number[] = [scopeNodeId];
        if (includeShadowDom) {
          // Best-effort: include immediate open shadow roots of the scope node as additional selector roots.
          const scopeDesc = (await client.send('DOM.describeNode', {
            nodeId: scopeNodeId,
            pierce: true,
            depth: 2,
          })) as any;
          const roots: any[] = Array.isArray(scopeDesc?.node?.shadowRoots)
            ? scopeDesc.node.shadowRoots
            : [];
          for (const r of roots) {
            const nid = r?.nodeId;
            if (typeof nid === 'number') {
              searchRootNodeIds.push(nid);
            }
          }
        }

        if (scopeNodeId !== rootNodeId) {
          const scopeDesc = (await client.send('DOM.describeNode', {
            nodeId: scopeNodeId,
          })) as any;
          const scopeBackend = scopeDesc?.node?.backendNodeId as number | undefined;
          if (typeof scopeBackend === 'number') {
            const idx = backendNodeIdToIndex.get(scopeBackend);
            if (typeof idx === 'number') {
              scopeNodeIndices.add(idx);
            }
          }
        }

        if (selectors?.length) {
          for (const selector of selectors) {
            let addedForSelector = 0;
            for (const rootId of searchRootNodeIds) {
              if (maxPerSelector && addedForSelector >= maxPerSelector) {
                break;
              }
              const q = (await client.send('DOM.querySelectorAll', {
                nodeId: rootId,
                selector,
              })) as any;
              const nodeIds: number[] = Array.isArray(q?.nodeIds) ? q.nodeIds : [];
              for (const nodeId of nodeIds) {
                if (maxPerSelector && addedForSelector >= maxPerSelector) {
                  break;
                }
                const desc = (await client.send('DOM.describeNode', {nodeId})) as any;
                const b = desc?.node?.backendNodeId as number | undefined;
                if (typeof b !== 'number') {
                  continue;
                }
                const idx = backendNodeIdToIndex.get(b);
                if (typeof idx === 'number') {
                  addSelectorMatch(idx, selector);
                  addedForSelector++;
                }
              }
            }
          }
        }
      }
    }

    const elements: WireframeSnapshotOutput['elements'] = [];
    const maxTotalRaw =
      (typeof request.params.maxTotal === 'number' ? request.params.maxTotal : undefined) ??
      request.params.maxElements ??
      50;
    const maxTotal = Math.max(1, Math.floor(maxTotalRaw));
    const maxDepth =
      typeof request.params.maxDepth === 'number' &&
      Number.isFinite(request.params.maxDepth) &&
      request.params.maxDepth >= 0
        ? Math.floor(request.params.maxDepth)
        : undefined;
    const includeTextSnippets = request.params.includeTextSnippets ?? false;
    const textSnippetMaxLength =
      typeof request.params.textSnippetMaxLength === 'number' &&
      Number.isFinite(request.params.textSnippetMaxLength) &&
      request.params.textSnippetMaxLength > 0
        ? Math.floor(request.params.textSnippetMaxLength)
        : 80;

    let totalInScope = 0;

    // Walk layout snapshot entries in order for deterministic output.
    for (let i = 0; i < layoutNodeIndex.length; i++) {
      const nodeIdx = layoutNodeIndex[i];
      const bounds = layoutBounds[i];
      if (!Array.isArray(bounds) || bounds.length < 4) {
        continue;
      }

      const pseudoType = resolveNodeFieldString(
        pseudoTypeField,
        nodeIdx,
        strings,
        pseudoTypeLookup,
      );
      if (pseudoType && !includePseudoElements) {
        continue;
      }

      const shadowRootType = resolveNodeFieldString(
        shadowRootTypeField,
        nodeIdx,
        strings,
        shadowRootLookup,
      );

      // Apply scope filter (ancestry-based), if present. Also compute depth (relative to scope root).
      let depth: number | undefined;
      let scopeRootMatchIdx: number | undefined;
      if (scopeNodeIndices.size) {
        let cur = nodeIdx;
        let inScope = false;
        let steps = 0;
        while (cur >= 0) {
          if (scopeNodeIndices.has(cur)) {
            inScope = true;
            scopeRootMatchIdx = cur;
            depth = steps;
            break;
          }
          const p =
            Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
              ? (parentIndex[cur] as number)
              : -1;
          cur = p;
          steps++;
        }
        if (!inScope) {
          continue;
        }
      } else if (typeof maxDepth === 'number') {
        // If maxDepth is requested without an explicit scope, compute depth from the document root.
        let cur = nodeIdx;
        let steps = 0;
        while (cur >= 0) {
          const p =
            Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
              ? (parentIndex[cur] as number)
              : -1;
          cur = p;
          steps++;
        }
        depth = steps;
      }

      if (typeof maxDepth === 'number' && typeof depth === 'number' && depth > maxDepth) {
        continue;
      }

      // Apply selector filter, if present, and attach match metadata.
      let matchedSelectors: string[] | undefined;
      if (shouldIncludeNodeIndex.size) {
        if (includeDescendants) {
          // Include descendants of matched nodes by checking ancestry; inherit matchedSelectors from nearest match.
          let cur = nodeIdx;
          let matchedIdx: number | undefined;
          while (cur >= 0) {
            if (shouldIncludeNodeIndex.has(cur)) {
              matchedIdx = cur;
              break;
            }
            const p =
              Array.isArray(parentIndex) && typeof parentIndex[cur] === 'number'
                ? (parentIndex[cur] as number)
                : -1;
            cur = p;
          }
          if (typeof matchedIdx !== 'number') {
            continue;
          }
          const ms = matchedSelectorsByNodeIndex.get(matchedIdx);
          matchedSelectors = ms?.length ? [...ms] : undefined;
        } else {
          if (!shouldIncludeNodeIndex.has(nodeIdx)) {
            continue;
          }
          const ms = matchedSelectorsByNodeIndex.get(nodeIdx);
          matchedSelectors = ms?.length ? [...ms] : undefined;
        }
      }

      totalInScope++;

      // Enforce maxTotal while still scanning to compute truncation stats.
      if (elements.length >= maxTotal) {
        continue;
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

      const {id, classList, dataAttrs} = parseAttributes(
        Array.isArray(attributes) ? attributes[nodeIdx] : undefined,
        strings,
      );

      let textSnippet: string | undefined;
      if (includeTextSnippets) {
        const raw = resolveNodeFieldString(
          textValueField,
          nodeIdx,
          strings,
          textValueLookup,
        );
        if (typeof raw === 'string' && raw.trim()) {
          const t = raw.trim().replace(/\s+/g, ' ');
          textSnippet =
            t.length > textSnippetMaxLength ? t.slice(0, textSnippetMaxLength) : t;
        }
      }

      const stableIdFromAttrs = pickStableIdFromAttrs({id, dataAttrs});
      const stablePath = stablePathForNode(
        nodeIdx,
        parentIndex,
        nodeName,
        strings,
        childrenByParent,
        scopeRootMatchIdx,
        shadowRootTypeField,
        shadowRootLookup,
      );
      const stableId = stableIdFromAttrs ?? `path:${stablePath}`;

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
          ? (backendNodeId[nodeIdx] as number)
          : undefined;

      elements.push({
        ref: backend ? {backendNodeId: backend} : undefined,
        stableId,
        matchedSelectors,
        depth,
        shadowRootType,
        pseudoType,
        tagName,
        id,
        classList,
        textSnippet,
        rect,
        computedStyles: stylesObj,
      });
    }

    const truncated = totalInScope > maxTotal;

    const output: WireframeSnapshotOutput = {
      schemaVersion: 2,
      coordinateSpace,
      page: {
        url: page.url(),
        viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
        scroll: {x: scrollX, y: scrollY},
        visualViewport: visualViewport ?? undefined,
      },
      computedStyleWhitelist: includeComputedStyles ? computedStyles : [],
      elements,
      truncated,
      returnedElementCount: elements.length,
      estimatedTotalElementsInScope: totalInScope,
      whyTruncated: truncated ? 'maxTotal' : undefined,
    };

    if (request.params.includeLayoutAssertions ?? false) {
      const viewLeft = coordinateSpace === 'document' ? scrollX : 0;
      const viewTop = coordinateSpace === 'document' ? scrollY : 0;
      const viewRight = viewLeft + innerWidth;
      const viewBottom = viewTop + innerHeight;

      const overflowXOffenders: Array<{stableId: string; right: number; excess: number}> = [];
      const overflowYOffenders: Array<{stableId: string; bottom: number; excess: number}> = [];

      for (const el of elements) {
        const sid = el.stableId;
        if (!sid) continue;
        if (el.rect.right > viewRight + 1) {
          overflowXOffenders.push({
            stableId: sid,
            right: el.rect.right,
            excess: el.rect.right - viewRight,
          });
        }
        if (el.rect.bottom > viewBottom + 1) {
          overflowYOffenders.push({
            stableId: sid,
            bottom: el.rect.bottom,
            excess: el.rect.bottom - viewBottom,
          });
        }
      }

      overflowXOffenders.sort((a, b) => b.excess - a.excess);
      overflowYOffenders.sort((a, b) => b.excess - a.excess);

      output.layoutAssertions = {
        overflowXOffenders: overflowXOffenders.slice(0, 20),
        overflowYOffenders: overflowYOffenders.slice(0, 20),
      };
    }

    const includeDiff =
      (request.params.includeDiff ?? undefined) ??
      (typeof request.params.compareWith === 'string' && request.params.compareWith.length > 0);

    if (includeDiff && typeof request.params.compareWith === 'string' && request.params.compareWith) {
      let previous: WireframeSnapshotOutput | undefined;
      try {
        previous = JSON.parse(request.params.compareWith) as WireframeSnapshotOutput;
      } catch (e) {
        throw new Error(
          `Invalid compareWith JSON provided: ${(e as Error).message ?? String(e)}`,
        );
      }

      const keyFor = (el: any): string | undefined => {
        if (typeof el?.stableId === 'string' && el.stableId) return el.stableId;
        if (typeof el?.id === 'string' && el.id) return `id:${el.id}`;
        const b = el?.ref?.backendNodeId;
        if (typeof b === 'number') return `backend:${b}`;
        return undefined;
      };

      const prevByKey = new Map<string, any>();
      for (const el of previous?.elements ?? []) {
        const k = keyFor(el);
        if (k && !prevByKey.has(k)) prevByKey.set(k, el);
      }
      const curByKey = new Map<string, any>();
      for (const el of output.elements) {
        const k = keyFor(el);
        if (k && !curByKey.has(k)) curByKey.set(k, el);
      }

      const changedElements: NonNullable<WireframeSnapshotOutput['diff']>['changedElements'] = [];
      const addedElements: string[] = [];
      const removedElements: string[] = [];

      for (const [k, cur] of curByKey) {
        const prev = prevByKey.get(k);
        if (!prev) {
          addedElements.push(k);
          continue;
        }
        const rectChanged =
          !!prev?.rect &&
          (Math.abs((prev.rect.x ?? 0) - (cur.rect.x ?? 0)) > 0.5 ||
            Math.abs((prev.rect.y ?? 0) - (cur.rect.y ?? 0)) > 0.5 ||
            Math.abs((prev.rect.width ?? 0) - (cur.rect.width ?? 0)) > 0.5 ||
            Math.abs((prev.rect.height ?? 0) - (cur.rect.height ?? 0)) > 0.5);

        let computedStylesChanged = false;
        let changedKeys: string[] | undefined;
        if (cur.computedStyles && prev.computedStyles) {
          const keys = new Set([
            ...Object.keys(cur.computedStyles),
            ...Object.keys(prev.computedStyles),
          ]);
          const diffs: string[] = [];
          for (const key of keys) {
            if ((cur.computedStyles[key] ?? '') !== (prev.computedStyles[key] ?? '')) {
              diffs.push(key);
            }
          }
          if (diffs.length) {
            computedStylesChanged = true;
            changedKeys = diffs;
          }
        }

        const changed = rectChanged || computedStylesChanged;
        if (changed) {
          (cur as any).changed = true;
          if (changedKeys?.length) {
            (cur as any).changedComputedStyleKeys = changedKeys;
          }
          changedElements.push({
            stableId: k,
            rectChanged,
            computedStylesChanged,
            changedComputedStyleKeys: changedKeys,
          });
        } else {
          (cur as any).changed = false;
        }
      }

      for (const [k] of prevByKey) {
        if (!curByKey.has(k)) {
          removedElements.push(k);
        }
      }

      output.diff = {
        changedElements,
        addedElements,
        removedElements,
      };
    }

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
    `Returns element rects (and optionally a small set of computed styles) suitable for overlap/gap analysis.\n\n` +
    `**Guidance:**\n\n` +
    `- **selectors vs scopeSelector**: Use \`selectors\` to filter down to specific elements (or element groups). Use \`scopeSelector\` to constrain results to a subtree (descendants of a container). They can be combined: \`selectors\` are resolved within the \`scopeSelector\` root.\n` +
    `- **maxTotal truncation**: \`maxTotal\` is applied after all filters. The snapshot is returned in a deterministic order and sets \`truncated: true\` when the cap is hit. If you’re debugging a component subtree, prefer narrowing with \`scopeSelector\` and increasing \`maxTotal\`.\n` +
    `- **Computed styles (computedStylePreset / computedStyleWhitelist)**: These only apply when \`includeComputedStyles: true\`. Use \`computedStylePreset: "layout"\` for UI/layout debugging; use \`"debug"\` when you also need extra diagnostics; use \`computedStyleWhitelist\` for an explicit list.`,
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
    maxTotal: zod
      .number()
      .int()
      .positive()
      .default(50)
      .optional()
      .describe('Maximum number of elements to return (after filtering).'),
    maxElements: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Legacy alias for maxTotal. Prefer maxTotal.'),
    maxPerSelector: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'When multiple selectors are provided, cap the number of matches per selector (best-effort).',
      ),
    maxDepth: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Limit traversal depth (0 means only the scope root itself when scopeSelector is provided).',
      ),
    includeComputedStyles: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes a whitelist of computed styles for each element via DOMSnapshot.captureSnapshot.',
      ),
    computedStylePreset: zod
      .enum(['minimal', 'layout', 'standard', 'debug', 'typography', 'paint'])
      .default('layout')
      .optional()
      .describe(
        'Computed style whitelist preset used when computedStyleWhitelist is not provided.',
      ),
    stylePreset: zod
      .enum(['minimal', 'layout', 'standard', 'debug', 'typography', 'paint'])
      .optional()
      .describe(
        'Deprecated alias for computedStylePreset. Prefer computedStylePreset.',
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

    // Shadow DOM / pseudo-elements
    includeShadowDom: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, attempts to include and query into open shadow roots under the scope root (best-effort).',
      ),
    includePseudoElements: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes pseudo-element nodes (e.g. ::before/::after) when present in the DOMSnapshot.',
      ),

    // Optional text + derived assertions
    includeTextSnippets: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes best-effort textSnippet fields when available in the snapshot (bounded).',
      ),
    textSnippetMaxLength: zod
      .number()
      .int()
      .positive()
      .default(80)
      .optional()
      .describe('Maximum length for textSnippet when includeTextSnippets is true.'),
    includeLayoutAssertions: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, adds a small derived layoutAssertions section (e.g., overflow offenders).',
      ),

    // Scroll ergonomics
    scrollToSelector: zod
      .string()
      .optional()
      .describe('Optional CSS selector to scroll into view before capture.'),
    scrollToY: zod
      .number()
      .optional()
      .describe('Optional Y scroll position to set before capture (document coordinates).'),

    // Diffing
    compareWith: zod
      .string()
      .optional()
      .describe(
        'Optional previous wireframe JSON (from wireframe_snapshot) to compare against. Adds diff metadata to the output.',
      ),
    includeDiff: zod
      .boolean()
      .optional()
      .describe(
        'If true, includes diff metadata (changed/added/removed). Defaults to true when compareWith is provided.',
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

  const keyFor = (el: WireframeSnapshotOutput['elements'][number] | undefined): string | undefined => {
    if (!el) return undefined;
    if (typeof el.stableId === 'string' && el.stableId) return el.stableId;
    if (typeof el.id === 'string' && el.id) return `id:${el.id}`;
    const b = el.ref?.backendNodeId;
    if (typeof b === 'number') return `backend:${b}`;
    return undefined;
  };

  const prevByKey = new Map<string, WireframeSnapshotOutput['elements'][number]>();
  const prevByBackend = new Map<number, WireframeSnapshotOutput['elements'][number]>();
  if (options.previous) {
    for (const el of options.previous.elements) {
      const k = keyFor(el);
      if (k && !prevByKey.has(k)) {
        prevByKey.set(k, el);
      }
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

    const k = keyFor(el);
    const prev =
      (k ? prevByKey.get(k) : undefined) ??
      (typeof el.ref?.backendNodeId === 'number'
        ? prevByBackend.get(el.ref.backendNodeId)
        : undefined);
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
    maxTotal: zod
      .number()
      .int()
      .positive()
      .default(50)
      .optional()
      .describe('Maximum number of elements to render (after filtering).'),
    maxElements: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Legacy alias for maxTotal. Prefer maxTotal.'),
    maxPerSelector: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'When multiple selectors are provided, cap the number of matches per selector (best-effort).',
      ),
    maxDepth: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Limit traversal depth (0 means only the scope root itself when scopeSelector is provided).',
      ),
    includeComputedStyles: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes a whitelist of computed styles for each element via DOMSnapshot.captureSnapshot (also used for optional diff/analysis).',
      ),
    computedStylePreset: zod
      .enum(['minimal', 'layout', 'standard', 'debug', 'typography', 'paint'])
      .default('layout')
      .optional()
      .describe(
        'Computed style whitelist preset used when computedStyleWhitelist is not provided.',
      ),
    stylePreset: zod
      .enum(['minimal', 'layout', 'standard', 'debug', 'typography', 'paint'])
      .optional()
      .describe(
        'Deprecated alias for computedStylePreset. Prefer computedStylePreset.',
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

    // Shadow DOM / pseudo-elements
    includeShadowDom: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, attempts to include and query into open shadow roots under the scope root (best-effort).',
      ),
    includePseudoElements: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes pseudo-element nodes (e.g. ::before/::after) when present in the DOMSnapshot.',
      ),

    // Optional text + derived assertions
    includeTextSnippets: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, includes best-effort textSnippet fields when available in the snapshot (bounded).',
      ),
    textSnippetMaxLength: zod
      .number()
      .int()
      .positive()
      .default(80)
      .optional()
      .describe('Maximum length for textSnippet when includeTextSnippets is true.'),
    includeLayoutAssertions: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'If true, adds a small derived layoutAssertions section (e.g., overflow offenders).',
      ),

    // Scroll ergonomics
    scrollToSelector: zod
      .string()
      .optional()
      .describe('Optional CSS selector to scroll into view before capture.'),
    scrollToY: zod
      .number()
      .optional()
      .describe('Optional Y scroll position to set before capture (document coordinates).'),

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




