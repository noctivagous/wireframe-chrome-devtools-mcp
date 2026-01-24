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
    'Insert a <style> tag into the current page with a patch id for later rollback.\n\n' +
    '**Preview Mode:** When `preview` parameters are provided (selector, property, values), the tool automatically generates visual wireframe feedback, supports testing multiple values, responsive breakpoints, and before/after comparisons. Preview mode includes automatic rollback by default.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // Direct CSS insertion mode
    cssText: zod
      .string()
      .optional()
      .describe(
        'CSS text to insert into the page. Required unless using preview mode (selector + property + values).',
      ),

    // Preview mode parameters (for A/B testing CSS property values)
    selector: zod
      .string()
      .optional()
      .describe(
        'CSS selector to target elements (preview mode). When provided with property and values, enables preview mode.',
      ),
    property: zod
      .string()
      .optional()
      .describe(
        'CSS property to modify in preview mode (e.g., "margin-bottom", "gap", "padding").',
      ),
    values: zod
      .array(zod.string())
      .min(1)
      .optional()
      .describe(
        'Array of CSS values to test in preview mode. Each value will be applied and visually previewed.',
      ),
    selectedValueIndex: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Optional index (0-based) indicating which value should be recorded as the "chosen" snippet when recordToSession=true in preview mode. If omitted, the last value is recorded.',
      ),

    // Visual options (preview mode)
    showVisual: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically generates SVG wireframe snapshots for visual feedback (preview mode).',
      ),
    highlightChanges: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, highlights changed elements in the visual snapshots (preview mode).',
      ),
    showDimensions: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, shows width×height dimensions on elements in the wireframe (preview mode).',
      ),

    // Responsive testing (preview mode)
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
        'Optional responsive breakpoints to test in preview mode. Will resize viewport and capture snapshots for each.',
      ),

    // Output options (preview mode)
    filePath: zod
      .string()
      .optional()
      .describe(
        'Optional path to save detailed results in preview mode. If not provided, results are returned in the response.',
      ),

    // Rollback options (preview mode)
    autoRollback: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically rolls back CSS changes after capturing snapshots (preview mode only).',
      ),

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

    // Check if preview mode is enabled (selector + property + values provided)
    const isPreviewMode =
      request.params.selector &&
      request.params.property &&
      request.params.values &&
      request.params.values.length > 0;

    if (isPreviewMode) {
      // Preview mode: test multiple CSS values with visual feedback
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
        (selectedValueIndex < 0 || selectedValueIndex >= values!.length)
      ) {
        throw new Error(
          `selectedValueIndex out of range: got ${selectedValueIndex}, values.length=${values!.length}`,
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
          const {captureWireframeSnapshot} = await import('./wireframe.js');
          const {output} = await captureWireframeSnapshot(
            {
              params: {
                selectors: [selector!],
                includeDescendants: true,
                maxElements: 50,
                includeComputedStyles: true,
                stylePreset: 'standard',
                coordinateSpace: 'viewport',
              },
            },
            context,
          );
          initialSnapshot = output;
        }

        // Test each value
        const insertedPatchIds: string[] = [];
        for (let i = 0; i < values!.length; i++) {
          const value = values![i];
          const cssText = `${selector} { ${property}: ${value} !important; }`;
          const patchId = context.createPatchId(`css-preview-${i}`);

          // Insert CSS
          const insertResult = await page.evaluate(
            ({
              patchId,
              cssText,
              PATCH_ID_ATTR,
              PATCH_OWNER_ATTR,
              PATCH_KIND_ATTR,
              PATCH_OWNER_VALUE,
            }) => {
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
            const {captureWireframeSnapshot, renderSvgWireframe} =
              await import('./wireframe.js');
            const {output: currentSnapshot} = await captureWireframeSnapshot(
              {
                params: {
                  selectors: [selector!],
                  includeDescendants: true,
                  maxElements: 50,
                  includeComputedStyles: true,
                  stylePreset: 'standard',
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
              showSpacing: true, // Always show spacing for CSS preview
              showOverlaps: false,
              showGaps: false,
              showClipping: false,
              strokeWidth: 1,
              fillOpacity: 0.08,
              highlightChanged: highlightChanges ?? true,
              previous: initialSnapshot ?? undefined,
            });

            const viewport = await page.viewport();
            result.visualSnapshot = {
              svg: svg,
              dimensions: {
                width: viewport?.width || 1200,
                height: viewport?.height || 800,
              },
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
                const prev = el.ref?.backendNodeId
                  ? prevByBackend.get(el.ref.backendNodeId)
                  : undefined;
                if (prev && el.computedStyles && prev.computedStyles) {
                  const oldValue = prev.computedStyles[property!];
                  const newValue = el.computedStyles[property!];
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

              const {captureWireframeSnapshot, renderSvgWireframe} =
                await import('./wireframe.js');
              const {output: responsiveSnapshot} = await captureWireframeSnapshot(
                {
                  params: {
                    selectors: [selector!],
                    includeDescendants: true,
                    maxElements: 50,
                    includeComputedStyles: true,
                    stylePreset: 'standard',
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
                showSpacing: true, // Always show spacing for CSS preview
                showOverlaps: false,
                showGaps: false,
                showClipping: false,
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
                  dimensions: {
                    width: breakpoint.width,
                    height: breakpoint.height,
                  },
                },
              });
            }
          }

          results.push(result);

          // Auto-rollback if requested (except for the last value; the last patch is handled below).
          if (autoRollback && i < values!.length - 1) {
            await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
              const candidates = Array.from(
                document.querySelectorAll(`[${PATCH_ID_ATTR}]`),
              ) as HTMLElement[];
              for (const el of candidates) {
                if (el.getAttribute(PATCH_ID_ATTR) === patchId) {
                  el.remove();
                }
              }
            }, {patchId, PATCH_ID_ATTR});
            context.unregisterPatch(patchId);
          }
        }

        // If autoRollback=true, also remove the last applied patch to match the documented semantics.
        if (autoRollback && insertedPatchIds.length > 0) {
          const lastPatchId = insertedPatchIds[insertedPatchIds.length - 1];
          await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
            const candidates = Array.from(
              document.querySelectorAll(`[${PATCH_ID_ATTR}]`),
            ) as HTMLElement[];
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

        // Format response
        response.appendResponseLine(
          `Tested ${values!.length} CSS values for \`${selector} { ${property}: ... }\``,
        );

        // Return full results as JSON
        const recordedValueIndex =
          selectedValueIndex !== undefined
            ? selectedValueIndex
            : values!.length - 1;
        const recorded = results[recordedValueIndex];
        const result = {
          selector,
          property,
          testedValues: values!.length,
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
            filePath,
          );
          response.appendResponseLine(`\nSaved detailed results to ${filePath}`);
        }

        if (request.params.recordToSession) {
          const recordedValueIndex =
            selectedValueIndex !== undefined
              ? selectedValueIndex
              : Math.max(0, values!.length - 1);
          const recorded = results[recordedValueIndex];
          context.appendEditChange(
            {
              type: 'insert_css_preview',
              pageId,
              createdAt: Date.now(),
              description: `CSS Preview: ${selector} { ${property}: [${values!.join(', ')}] }`,
              targetFilePath: request.params.targetFilePath,
              payload: {
                selector,
                property,
                values: values!,
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
      return;
    }

    // Simple insertion mode (non-preview)
    if (!request.params.cssText) {
      throw new Error(
        'cssText is required when not using preview mode (selector + property + values).',
      );
    }

    const patchId = request.params.patchId ?? context.createPatchId('css');

    const result = await page.evaluate(
      ({
        patchId,
        cssText,
        replaceExisting,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      }) => {
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
    'Insert a <script> tag into the current page with a patch id for later rollback.\n\n' +
    '**Preview Mode:** When `scripts` array is provided, the tool automatically generates visual wireframe feedback, supports testing multiple script variants, responsive breakpoints, and before/after comparisons. Preview mode includes automatic rollback by default (note: rollback removes script tags but cannot reliably undo side-effects like DOM mutations, timers, or event listeners).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // Direct JS insertion mode
    jsText: zod
      .string()
      .optional()
      .describe(
        'JavaScript text to insert into the page. Required unless using preview mode (scripts array).',
      ),

    // Preview mode parameters (for A/B testing JS variants)
    scripts: zod
      .array(zod.string())
      .min(1)
      .optional()
      .describe(
        'Array of JavaScript snippets to test in preview mode. Each entry is injected as a <script> tag and then snapshotted.',
      ),
    selectedScriptIndex: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Optional index (0-based) indicating which script should be recorded as the "chosen" snippet when recordToSession=true in preview mode. If omitted, the last script is recorded.',
      ),
    waitAfterMs: zod
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe(
        'Optional delay (ms) after injecting a script before capturing snapshots in preview mode (useful if the script triggers async DOM updates).',
      ),

    // Snapshot targeting (preview mode, mirrors wireframe_snapshot basics)
    selectors: zod
      .array(zod.string())
      .optional()
      .describe(
        'Optional selectors to snapshot/highlight in preview mode. If omitted, the snapshot covers the whole page (subject to maxElements cap).',
      ),
    scopeSelector: zod
      .string()
      .optional()
      .describe(
        'Optional scope root selector in preview mode; when used with selectors, matching is resolved within this subtree.',
      ),
    includeDescendants: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, include matching elements\' descendants as well in preview mode (within scopeSelector if provided).',
      ),
    maxElements: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(50)
      .describe(
        'Maximum number of elements to include in snapshots in preview mode (legacy alias for maxTotal).',
      ),
    includeComputedStyles: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, include computed styles in the snapshot payload in preview mode (larger output).',
      ),
    computedStylePreset: zod
      .enum(['layout', 'typography', 'paint', 'standard', 'debug'])
      .optional()
      .describe(
        'Computed style preset to use when includeComputedStyles=true in preview mode. If omitted, wireframe_snapshot defaults apply.',
      ),

    // Visual options (preview mode)
    showVisual: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically generates SVG wireframe snapshots for visual feedback (preview mode).',
      ),
    highlightChanges: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, highlights changed elements in the visual snapshots in preview mode (best-effort).',
      ),
    showDimensions: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, shows width×height dimensions on elements in the wireframe (preview mode).',
      ),

    // Responsive testing (preview mode)
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
        'Optional responsive breakpoints to test in preview mode. Will resize viewport and capture snapshots for each.',
      ),

    // Output options (preview mode)
    filePath: zod
      .string()
      .optional()
      .describe(
        'Optional path to save detailed results in preview mode. If not provided, results are returned in the response.',
      ),

    // Rollback options (preview mode)
    autoRollback: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically removes injected <script> tags after capturing snapshots in preview mode (does not reliably undo side-effects).',
      ),

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

    // Check if preview mode is enabled (scripts array provided)
    const isPreviewMode =
      request.params.scripts && request.params.scripts.length > 0;

    if (isPreviewMode) {
      // Preview mode: test multiple JS variants with visual feedback
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
        (selectedScriptIndex < 0 || selectedScriptIndex >= scripts!.length)
      ) {
        throw new Error(
          `selectedScriptIndex out of range: got ${selectedScriptIndex}, scripts.length=${scripts!.length}`,
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
        for (let i = 0; i < scripts!.length; i++) {
          const jsText = scripts![i];
          const patchId = context.createPatchId(`js-preview-${i}`);

          const insertResult = await page.evaluate(
            ({
              patchId,
              jsText,
              PATCH_ID_ATTR,
              PATCH_OWNER_ATTR,
              PATCH_KIND_ATTR,
              PATCH_OWNER_VALUE,
            }) => {
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
            description: `JS Preview: variant ${i + 1}/${scripts!.length}`,
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
            const {captureWireframeSnapshot, renderSvgWireframe} =
              await import('./wireframe.js');
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
              showOverlaps: false,
              showGaps: false,
              showClipping: false,
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

              const {captureWireframeSnapshot, renderSvgWireframe} =
                await import('./wireframe.js');
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
                showOverlaps: false,
                showGaps: false,
                showClipping: false,
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
                  dimensions: {
                    width: breakpoint.width,
                    height: breakpoint.height,
                  },
                },
              });
            }
          }

          results.push(result);

          // Auto-rollback if requested (except for the last script; the last patch is handled below).
          if (autoRollback && i < scripts!.length - 1) {
            await page.evaluate(({patchId, PATCH_ID_ATTR}) => {
              const candidates = Array.from(
                document.querySelectorAll(`[${PATCH_ID_ATTR}]`),
              ) as HTMLElement[];
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
            const candidates = Array.from(
              document.querySelectorAll(`[${PATCH_ID_ATTR}]`),
            ) as HTMLElement[];
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
            : scripts!.length - 1;
        const recorded = results[recordedScriptIndex];

        response.appendResponseLine(`Tested ${scripts!.length} JS variants`);
        const out = {
          testedScripts: scripts!.length,
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
            testedScripts: scripts!.length,
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
              : Math.max(0, scripts!.length - 1);
          const recorded = results[recordedScriptIndex];
          context.appendEditChange(
            {
              type: 'insert_js_preview',
              pageId,
              createdAt: Date.now(),
              description: `JS Preview: [${scripts!.length} variants]`,
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
      return;
    }

    // Simple insertion mode (non-preview)
    if (!request.params.jsText) {
      throw new Error(
        'jsText is required when not using preview mode (scripts array).',
      );
    }

    const patchId = request.params.patchId ?? context.createPatchId('js');

    const result = await page.evaluate(
      ({
        patchId,
        jsText,
        replaceExisting,
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      }) => {
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

export const manipulateDom = defineTool({
  name: 'manipulate_dom',
  description:
    'Perform DOM manipulations on web pages including setting styles, adding/removing classes, inserting/removing elements, and batch operations. Also supports querying elements to retrieve their properties, styles, and other information.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // Single action mode
    action: zod
      .enum(['set-style', 'add-class', 'remove-class', 'remove-element', 'insert-html', 'query'])
      .optional()
      .describe('Single DOM manipulation action to perform. Use "query" to retrieve element information without modifying the DOM.'),

    // Action parameters
    selector: zod
      .string()
      .optional()
      .describe('CSS selector to target elements for the action or query.'),

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

    // Query parameters
    queryFields: zod
      .array(zod.enum(['tagName', 'id', 'className', 'textContent', 'innerHTML', 'attributes', 'computedStyles', 'boundingRect', 'classes']))
      .optional()
      .describe('Fields to include in query results. If omitted, returns all available fields.'),

    // Batch operations mode
    operations: zod
      .array(zod.object({
        action: zod.enum(['set-style', 'add-class', 'remove-class', 'remove-element', 'insert-html', 'query']).describe('DOM manipulation action. Use "query" to retrieve element information.'),
        selector: zod.string().describe('CSS selector to target elements.'),
        properties: zod.record(zod.string()).optional().describe('CSS properties for set-style action.'),
        className: zod.string().optional().describe('CSS class name for add-class/remove-class actions.'),
        html: zod.string().optional().describe('HTML content for insert-html action.'),
        position: zod.enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend']).optional().describe('Position for insert-html action. Defaults to "beforeend".'),
        queryFields: zod.array(zod.enum(['tagName', 'id', 'className', 'textContent', 'innerHTML', 'attributes', 'computedStyles', 'boundingRect', 'classes'])).optional().describe('Fields to include in query results (for query action).'),
      }))
      .optional()
      .describe('Array of DOM operations to perform in batch.'),

    // Common options
    patchId: zod
      .string()
      .optional()
      .describe('Optional patch id for rollback. If omitted, generates a stable patch id. Not used for query operations.'),

    description: zod
      .string()
      .optional()
      .describe('Optional human description for the patch registry. Not used for query operations.'),

    // Optional change journaling (buffer edits during interactive sessions; commit/export later).
    recordToSession: zod
      .boolean()
      .optional()
      .describe(
        'If true, record this change into an edit session journal so it can be exported/committed later (useful to keep live iteration fast and delay filesystem writes). Not used for query operations.',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true). Not used for query operations.',
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
      queryFields?: string[];
    }> = [];

    if (isSingleMode) {
      domOperations = [{
        action,
        selector,
        properties,
        className,
        html,
        position,
        queryFields: request.params.queryFields,
      }];
    } else if (isBatchMode) {
      domOperations = operations;
    }

    // Check if this is a query-only operation
    const isQueryOnly = domOperations.every(op => op.action === 'query');

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
      // Query action doesn't require any additional parameters
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
      data?: {
        tagName?: string;
        id?: string;
        className?: string;
        classes?: string[];
        textContent?: string;
        innerHTML?: string;
        attributes?: Record<string, string>;
        computedStyles?: Record<string, string>;
        boundingRect?: {
          x: number;
          y: number;
          width: number;
          height: number;
          top: number;
          left: number;
          right: number;
          bottom: number;
        };
      };
    }
    interface DomManipulationEvalResult {
      patchId?: string;
      success: boolean;
      operations: DomManipulationOpResult[];
      executedOperations: unknown[];
      error?: string;
    }

    const result: DomManipulationEvalResult = await page.evaluate(
      ({operations, patchId, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE, isQueryOnly}) => {
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
                let elementData: DomManipulationOpResult['data'] | undefined;

                try {
                  switch (op.action) {
                    case 'query': {
                      const fields = op.queryFields || ['tagName', 'id', 'className', 'textContent', 'innerHTML', 'attributes', 'computedStyles', 'boundingRect', 'classes'];
                      const data: DomManipulationOpResult['data'] = {};

                      if (fields.includes('tagName')) {
                        data.tagName = element.tagName.toLowerCase();
                      }
                      if (fields.includes('id')) {
                        data.id = element.id || undefined;
                      }
                      if (fields.includes('className')) {
                        data.className = element.className || undefined;
                      }
                      if (fields.includes('classes')) {
                        data.classes = Array.from(element.classList);
                      }
                      if (fields.includes('textContent')) {
                        data.textContent = element.textContent || undefined;
                      }
                      if (fields.includes('innerHTML')) {
                        data.innerHTML = element.innerHTML || undefined;
                      }
                      if (fields.includes('attributes')) {
                        const attrs: Record<string, string> = {};
                        for (let j = 0; j < element.attributes.length; j++) {
                          const attr = element.attributes[j];
                          attrs[attr.name] = attr.value;
                        }
                        data.attributes = Object.keys(attrs).length > 0 ? attrs : undefined;
                      }
                      if (fields.includes('computedStyles')) {
                        const styles = window.getComputedStyle(element);
                        const computed: Record<string, string> = {};
                        // Get common CSS properties
                        const commonProps = [
                          'display', 'position', 'width', 'height', 'margin', 'padding', 'border',
                          'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight',
                          'textAlign', 'lineHeight', 'opacity', 'zIndex', 'overflow', 'flexDirection',
                          'justifyContent', 'alignItems', 'gap', 'gridTemplateColumns', 'gridTemplateRows'
                        ];
                        for (const prop of commonProps) {
                          computed[prop] = styles.getPropertyValue(prop);
                        }
                        data.computedStyles = computed;
                      }
                      if (fields.includes('boundingRect')) {
                        const rect = element.getBoundingClientRect();
                        data.boundingRect = {
                          x: rect.x,
                          y: rect.y,
                          width: rect.width,
                          height: rect.height,
                          top: rect.top,
                          left: rect.left,
                          right: rect.right,
                          bottom: rect.bottom,
                        };
                      }
                      elementData = data;
                      break;
                    }

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

                const opResult: DomManipulationOpResult = {
                  selector: op.selector,
                  elementIndex: i,
                  found: true,
                  action: op.action,
                  success,
                  message,
                };
                if (elementData) {
                  opResult.data = elementData;
                }
                opResults.push(opResult);
              }
            }

            results.push(...opResults);
            executedOperations.push(op);
          }

          // Mark successful execution with patch attributes (only for non-query operations)
          if (!isQueryOnly) {
            const marker = document.createElement('div');
            marker.style.display = 'none';
            marker.setAttribute(PATCH_ID_ATTR, patchId);
            marker.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
            marker.setAttribute(PATCH_KIND_ATTR, 'dom-manipulation');
            document.head.appendChild(marker);
          }

          return {
            ...(isQueryOnly ? {} : {patchId}),
            success: true,
            operations: results,
            executedOperations,
          };

        } catch (error) {
          return {
            ...(isQueryOnly ? {} : {patchId}),
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
        isQueryOnly,
      },
    );

    // Register patch if successful (only for non-query operations)
    if (result.success && !isQueryOnly) {
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

    if (isQueryOnly) {
      const queryOps = result.operations.filter(op => op.action === 'query');
      const foundCount = queryOps.filter(op => op.found).length;
      const totalElements = queryOps.reduce((sum, op) => sum + (op.elementIndex !== undefined ? 1 : 0), 0);
      response.appendResponseLine(`Query completed: ${foundCount}/${queryOps.length} selector(s) matched elements (${totalElements} total elements found)`);
    } else {
      response.appendResponseLine(`DOM manipulation completed: ${successfulOps}/${totalOps} operations successful`);
    }

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
          ...(isQueryOnly ? {} : {patchId}),
          pageId,
          success: result.success,
          operations: result.operations,
          totalOperations: totalOps,
          successfulOperations: successfulOps,
          ...(isQueryOnly ? {queryOnly: true} : {}),
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



