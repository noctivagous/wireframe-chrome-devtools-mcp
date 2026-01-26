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
    '**Preview Mode:** When `mode: "preview"` is used with `selector`, `property`, and `values`, the tool automatically generates visual wireframe feedback, supports testing multiple values, responsive breakpoints, and before/after comparisons. Preview mode includes automatic rollback by default.\n\n' +
    '**SVG Snapshots:** By default, this tool includes an SVG wireframe snapshot after applying CSS changes (in both apply and preview modes) to provide visual confirmation of layout changes. Set `includeSvgSnapshot: false` to disable.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    mode: zod
      .enum(['apply', 'preview'])
      .optional()
      .default('apply')
      .describe(
        'Operation mode: "apply" to modify the page permanently, "preview" to apply changes then automatically rollback. Preview mode requires selector, property, and values parameters.',
      ),

    // Direct CSS insertion mode
    cssText: zod
      .string()
      .optional()
      .describe(
        'CSS text to insert into the page. Required when mode is "apply" and not using selector/property/values.',
      ),

    // Preview mode parameters (for A/B testing CSS property values)
    selector: zod
      .string()
      .optional()
      .describe(
        'CSS selector to target elements. Required when mode is "preview" (must be provided with property and values).',
      ),
    property: zod
      .string()
      .optional()
      .describe(
        'CSS property to modify (e.g., "margin-bottom", "gap", "padding"). Required when mode is "preview" (must be provided with selector and values).',
      ),
    values: zod
      .array(zod.string())
      .min(1)
      .optional()
      .describe(
        'Array of CSS values to test. Each value will be applied and visually previewed. Required when mode is "preview" (must be provided with selector and property).',
      ),
    selectedValueIndex: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Optional index (0-based) indicating which value should be recorded as the "chosen" snippet when recordToSession=true in preview mode. If omitted, the last value is recorded.',
      ),

    // Visual options (used in preview mode)
    showVisual: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically generates SVG wireframe snapshots for visual feedback. Used when mode is "preview".',
      ),
    highlightChanges: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, highlights changed elements in the visual snapshots. Used when mode is "preview".',
      ),
    showDimensions: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, shows width×height dimensions on elements in the wireframe. Used when mode is "preview".',
      ),

    // Responsive testing (used in preview mode)
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
        'Optional responsive breakpoints to test. Will resize viewport and capture snapshots for each. Used when mode is "preview".',
      ),

    // Output options (used in preview mode)
    filePath: zod
      .string()
      .optional()
      .describe(
        'Optional path to save detailed results. If not provided, results are returned in the response. Used when mode is "preview".',
      ),

    // Rollback options (used in preview mode)
    autoRollback: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically rolls back CSS changes after capturing snapshots. Only used when mode is "preview".',
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

    // SVG snapshot option (for apply mode)
    includeSvgSnapshot: zod
      .boolean()
      .default(true)
      .optional()
      .describe(
        'If true, automatically generates an SVG wireframe snapshot after applying CSS changes. Provides visual confirmation of layout changes. Defaults to true.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;

    const mode = request.params.mode ?? 'apply';

    // Preview mode: test CSS changes with visual feedback and automatic rollback
    if (mode === 'preview') {
      // Preview mode with selector/property/values (A/B testing CSS property values)
      if (request.params.selector && request.params.property && request.params.values && request.params.values.length > 0) {
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

      // Preview mode with cssText (apply then rollback)
      if (request.params.cssText) {
        const patchId = request.params.patchId ?? context.createPatchId('css-preview');
        const cssText = request.params.cssText;
        const autoRollback = request.params.autoRollback ?? true;

        // Insert CSS
        await page.evaluate(
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
            cssText,
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
          description: request.params.description || 'CSS Preview',
        });

        response.appendResponseLine('```json');
        response.appendResponseLine(
          JSON.stringify(
            {
              patchId,
              inserted: true,
              pageId,
              mode: 'preview',
              cssText,
            },
            null,
            2,
          ),
        );
        response.appendResponseLine('```');
        response.appendResponseLine('\n⚠️  Preview mode: CSS applied. Use rollback_patch to remove changes.');

        // Auto-rollback if requested
        if (autoRollback) {
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
          response.appendResponseLine('✅ Automatically rolled back CSS changes.');
        }

        return;
      }

      // Preview mode requires either selector/property/values OR cssText
      throw new Error(
        'Preview mode requires either:\n' +
        '  - selector, property, and values (for A/B testing CSS property values), OR\n' +
        '  - cssText (to preview CSS then rollback).\n' +
        'Example: { mode: "preview", selector: ".grid", property: "gap", values: ["8px", "16px"] }',
      );
    }

    // Apply mode: direct CSS insertion
    if (mode === 'apply') {
      // When using selector/property/values in apply mode, apply all values (no rollback)
      if (request.params.selector && request.params.property && request.params.values && request.params.values.length > 0) {
        // Apply all values sequentially (last one stays)
        const {selector, property, values} = request.params;
        const patchId = request.params.patchId ?? context.createPatchId('css');
        
        for (let i = 0; i < values.length; i++) {
          const value = values[i];
          const cssText = `${selector} { ${property}: ${value} !important; }`;
          const currentPatchId = i === values.length - 1 ? patchId : context.createPatchId(`css-apply-${i}`);
          
          await page.evaluate(
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
              patchId: currentPatchId,
              cssText,
              replaceExisting: request.params.replaceExisting,
              PATCH_ID_ATTR,
              PATCH_OWNER_ATTR,
              PATCH_KIND_ATTR,
              PATCH_OWNER_VALUE,
            },
          );

          if (i === values.length - 1) {
            context.registerPatch({
              patchId,
              patchType: 'css',
              pageId,
              createdAt: Date.now(),
              description: request.params.description || `CSS Apply: ${selector} { ${property}: ${value} }`,
            });
          }
        }

        if (request.params.recordToSession) {
          const lastValue = values[values.length - 1];
          context.appendEditChange(
            {
              type: 'insert_css',
              pageId,
              createdAt: Date.now(),
              patchId,
              description: request.params.description,
              targetFilePath: request.params.targetFilePath,
              payload: {
                cssText: `${selector} { ${property}: ${lastValue} !important; }`,
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
              patchId,
              inserted: true,
              pageId,
              appliedValues: values.length,
              finalValue: values[values.length - 1],
            },
            null,
            2,
          ),
        );
        response.appendResponseLine('```');

        // Generate SVG snapshot if requested
        if (request.params.includeSvgSnapshot !== false) {
          const {captureWireframeSnapshot, renderSvgWireframe} =
            await import('./wireframe.js');
          const {output: snapshot} = await captureWireframeSnapshot(
            {
              params: {
                includeComputedStyles: true,
                stylePreset: 'standard',
                coordinateSpace: 'viewport',
                maxTotal: 50,
              },
            },
            context,
          );

          const svg = renderSvgWireframe(snapshot, {
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
          });

          const result = {
            svg: svg,
            elementCount: snapshot.elements.length,
            truncated: snapshot.truncated || false,
            viewport: snapshot.page.viewport,
          };

          response.appendResponseLine('\n## SVG Snapshot');
          response.appendResponseLine('```json');
          response.appendResponseLine(JSON.stringify(result, null, 2));
          response.appendResponseLine('```');
        }
        return;
      }

      // Standard apply mode with cssText
      if (!request.params.cssText) {
        throw new Error(
          'cssText is required when mode is "apply" and not using selector/property/values. ' +
          'Alternatively, use mode: "preview" with selector, property, and values for preview mode.',
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

    // Generate SVG snapshot if requested
    if (request.params.includeSvgSnapshot !== false) {
      const {captureWireframeSnapshot, renderSvgWireframe} =
        await import('./wireframe.js');
      const {output: snapshot} = await captureWireframeSnapshot(
        {
          params: {
            includeComputedStyles: true,
            stylePreset: 'standard',
            coordinateSpace: 'viewport',
            maxTotal: 50,
          },
        },
        context,
      );

      const svg = renderSvgWireframe(snapshot, {
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
      });

      const result = {
        svg: svg,
        elementCount: snapshot.elements.length,
        truncated: snapshot.truncated || false,
        viewport: snapshot.page.viewport,
      };

      response.appendResponseLine('\n## SVG Snapshot');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result, null, 2));
      response.appendResponseLine('```');
    }
    }
  },
});

export const insertJs = defineTool({
  name: 'insert_js',
  description:
    'Insert a <script> tag into the current page with a patch id for later rollback. ' +
    'To test multiple script variants, insert, evaluate results, then rollback and insert again.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    jsText: zod
      .string()
      .describe('JavaScript text to insert into the page.'),

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
    const jsText = request.params.jsText;

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
        jsText,
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
            jsText,
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
    'Perform DOM manipulations on web pages including setting styles, adding/removing classes, inserting/removing elements, replacing innerHTML. Also supports querying elements to retrieve their properties, styles, and other information. For multiple operations, call this tool multiple times or use batch_ops. Supports array index notation in selectors (e.g., ".item[3]" selects the 4th matching element) to select nth element across all matches regardless of parent structure.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    // Single action mode
    action: zod
      .enum(['set-style', 'add-class', 'remove-class', 'remove-element', 'insert-html', 'replace-html', 'replace-content', 'validate-structure', 'query'])
      .describe('DOM manipulation action to perform. Use "query" to retrieve element information without modifying the DOM. Use "replace-content" for safer content replacement that preserves wrapper structure. Use "validate-structure" to check structure integrity.'),

    // Action parameters
    selector: zod
      .string()
      .describe('CSS selector to target elements for the action or query. Supports array index notation (e.g., ".item[3]") to select the nth element (0-based) from all matching elements, useful when elements are nested in different parent containers. Also supports :contains("text") pseudo-selector to match elements containing specific text content (case-sensitive).'),

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
      .describe('HTML content to insert for insert-html action, to replace innerHTML for replace-html action, or to replace content for replace-content action.'),

    position: zod
      .enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend'])
      .optional()
      .describe('Position for insert-html action relative to the selected element. Defaults to "beforeend".'),

    preserveStructure: zod
      .boolean()
      .optional()
      .describe('For replace-content action: if true, preserves wrapper structure by only replacing direct children/text nodes. Defaults to true if not specified.'),

    required: zod
      .object({
        elements: zod.array(zod.string()).optional().describe('Required CSS selectors that must exist within the target structure.'),
        classes: zod.array(zod.string()).optional().describe('Required CSS classes that must exist within the target structure.'),
        count: zod.record(zod.object({
          min: zod.number().optional(),
          max: zod.number().optional(),
          exact: zod.number().optional(),
        })).optional().describe('Required element counts by selector (e.g., {".store-stack-item": {min: 3}}).'),
      })
      .optional()
      .describe('For validate-structure action: requirements that must be met for structure to be considered valid.'),

    // Query parameters
    queryFields: zod
      .array(zod.enum(['tagName', 'id', 'className', 'textContent', 'innerHTML', 'attributes', 'computedStyles', 'boundingRect', 'classes']))
      .optional()
      .describe('Fields to include in query results. If omitted, returns all available fields.'),

    // Text-based filtering (alternative to :contains() in selector)
    checkIfElementContains: zod
      .string()
      .optional()
      .describe('Filter matching elements to only those whose text content includes this string. Works with any selector - applies text filter after selector matching. Case-sensitive by default.'),
    
    containsCaseSensitive: zod
      .boolean()
      .optional()
      .describe('Whether checkIfElementContains search is case-sensitive. Defaults to true if not specified.'),

    containsSearchIn: zod
      .enum(['textContent', 'innerHTML', 'innerText'])
      .optional()
      .describe('Where to search for checkIfElementContains: "textContent", "innerHTML", or "innerText". Defaults to "textContent" if not specified.'),

    // Get entire HTML document (for query action only)
    getEntireHTMLDocument: zod
      .object({
        includeCSS: zod.boolean().optional().describe('Include all <style> tags and CSS patches. Defaults to true if not specified.'),
        includeJS: zod.boolean().optional().describe('Include all <script> tags and JS patches. Defaults to true if not specified.'),
        includePatches: zod.boolean().optional().describe('Include MCP-injected CSS/JS patches. Defaults to true if not specified.'),
        format: zod.enum(['string', 'structured']).optional().describe('Return format: "string" (HTML string) or "structured" (parsed object). Defaults to "string" if not specified.'),
      })
      .optional()
      .describe('Get the complete HTML document. Only valid for query action with selector "html". Returns full document including CSS/JS and patches.'),

    // Rich response options (opt-in for enhanced responses)
    responseOptions: zod
      .object({
        includeContext: zod.boolean().optional().describe('Include information about parent, siblings, and children elements. Defaults to false.'),
        includeAlternatives: zod.boolean().optional().describe('Include alternative selectors that target the same element. Defaults to false.'),
        includeHints: zod.boolean().optional().describe('Include hints and suggestions for next steps. Defaults to false.'),
        includeResultingState: zod.boolean().optional().describe('Include resulting state after manipulation (computed styles, dimensions). Only for manipulation actions. Defaults to false.'),
        maxContextDepth: zod.number().int().min(0).max(3).optional().describe('Maximum depth for context information (0-3). Higher values include more nested children. Defaults to 1.'),
        maxAlternatives: zod.number().int().min(0).max(10).optional().describe('Maximum number of alternative selectors to return (0-10). Defaults to 5.'),
      })
      .optional()
      .describe('Options to control response richness. All options default to false for backward compatibility. Enable specific features as needed.'),

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
    const { 
      action, 
      selector, 
      properties, 
      className, 
      html, 
      position, 
      preserveStructure, 
      required, 
      patchId: requestedPatchId, 
      description,
      checkIfElementContains,
      containsCaseSensitive = true,
      containsSearchIn = 'textContent',
      getEntireHTMLDocument,
      responseOptions,
    } = request.params;

    if (!action || !selector) {
      throw new Error('Both action and selector are required.');
    }

    // Prepare operations array (single operation)
    type DomOperation = {
      action: string;
      selector: string;
      properties?: Record<string, string>;
      className?: string;
      html?: string;
      position?: string;
      preserveStructure?: boolean;
      required?: {
        elements?: string[];
        classes?: string[];
        count?: Record<string, {min?: number; max?: number; exact?: number}>;
      };
      queryFields?: string[];
      checkIfElementContains?: string;
      containsCaseSensitive?: boolean;
      containsSearchIn?: 'textContent' | 'innerHTML' | 'innerText';
      getEntireHTMLDocument?: {
        includeCSS?: boolean;
        includeJS?: boolean;
        includePatches?: boolean;
        format?: 'string' | 'structured';
      };
      responseOptions?: {
        includeContext?: boolean;
        includeAlternatives?: boolean;
        includeHints?: boolean;
        includeResultingState?: boolean;
        maxContextDepth?: number;
        maxAlternatives?: number;
      };
    };
    
    const domOperations: DomOperation[] = [{
      action,
      selector,
      ...(properties !== undefined ? {properties} : {}),
      ...(className !== undefined ? {className} : {}),
      ...(html !== undefined ? {html} : {}),
      ...(position !== undefined ? {position} : {}),
      ...(preserveStructure !== undefined ? {preserveStructure} : {}),
      ...(required !== undefined ? {required} : {}),
      ...(request.params.queryFields !== undefined ? {queryFields: request.params.queryFields} : {}),
      ...(checkIfElementContains !== undefined ? {
        checkIfElementContains,
        containsCaseSensitive,
        containsSearchIn,
      } : {}),
      ...(getEntireHTMLDocument !== undefined ? {getEntireHTMLDocument} : {}),
      ...(responseOptions !== undefined ? {responseOptions} : {}),
    }];

    // Check if this is a query-only operation (query and validate-structure don't modify DOM)
    const isQueryOnly = domOperations.every(op => op.action === 'query' || op.action === 'validate-structure');

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
      if (op.action === 'replace-html' && !op.html) {
        throw new Error('replace-html action requires html parameter.');
      }
      if (op.action === 'replace-content' && !op.html) {
        throw new Error('replace-content action requires html parameter.');
      }
      if (op.action === 'validate-structure' && !op.required) {
        throw new Error('validate-structure action requires required parameter.');
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
      // Rich response fields (opt-in)
      context?: {
        parent?: {
          selector?: string;
          tagName?: string;
          className?: string;
          id?: string;
          computedStyles?: Record<string, string>;
          attributes?: Record<string, string>;
        };
        siblings?: {
          before?: Array<{
            selector?: string;
            tagName?: string;
            textContent?: string;
            className?: string;
          }>;
          after?: Array<{
            selector?: string;
            tagName?: string;
            textContent?: string;
            className?: string;
          }>;
          count?: number;
        };
        children?: {
          direct?: Array<{
            selector?: string;
            tagName?: string;
            className?: string;
            textContent?: string;
          }>;
          count?: {
            direct?: number;
            total?: number;
          };
        };
      };
      alternativeSelectors?: Array<{
        selector: string;
        reason?: string;
        confidence?: 'high' | 'medium' | 'low';
        matches?: number;
      }>;
      hints?: {
        nextSteps?: string[];
        warnings?: string[];
        bestPractices?: string[];
      };
      changes?: {
        before?: Record<string, string>;
        after?: Record<string, string>;
      };
      resultingState?: {
        computedStyles?: Record<string, string>;
        boundingRect?: {
          width: number;
          height: number;
          x: number;
          y: number;
        };
      };
      document?: {
        html?: string;
        length?: number;
        includes?: {
          css?: boolean;
          js?: boolean;
          patches?: boolean;
        };
        statistics?: {
          totalElements?: number;
          styleTags?: number;
          scriptTags?: number;
          mcpPatches?: {
            css?: number;
            js?: number;
          };
        };
      };
      containsMatch?: boolean;
      matchedText?: string;
    }
    interface DomManipulationEvalResult {
      patchId?: string;
      success: boolean;
      operations: DomManipulationOpResult[];
      executedOperations: unknown[];
      error?: string;
    }

    const result: DomManipulationEvalResult = await page.evaluate(
      ({operations, patchId, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE, isQueryOnly}: {
        operations: DomOperation[];
        patchId: string;
        PATCH_ID_ATTR: string;
        PATCH_OWNER_ATTR: string;
        PATCH_KIND_ATTR: string;
        PATCH_OWNER_VALUE: string;
        isQueryOnly: boolean;
      }) => {
        // Utility function to generate selector for an element
        function generateSelectorForElement(el: HTMLElement): string {
          if (el.id) {
            return `#${el.id}`;
          }
          const classes = Array.from(el.classList);
          if (classes.length > 0) {
            return `.${classes.join('.')}`;
          }
          return el.tagName.toLowerCase();
        }

        // Utility function to get element context
        function getElementContext(element: HTMLElement, maxDepth: number = 1): {
          parent?: any;
          siblings?: any;
          children?: any;
        } {
          const context: any = {};
          
          // Parent context
          if (element.parentElement) {
            const parent = element.parentElement;
            const parentStyles = window.getComputedStyle(parent);
            context.parent = {
              selector: generateSelectorForElement(parent),
              tagName: parent.tagName.toLowerCase(),
              className: parent.className || undefined,
              id: parent.id || undefined,
              computedStyles: {
                display: parentStyles.display,
                flexDirection: parentStyles.flexDirection,
                gridTemplateColumns: parentStyles.gridTemplateColumns,
              },
            };
          }
          
          // Siblings context
          if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children) as HTMLElement[];
            const elementIndex = siblings.indexOf(element);
            const before = siblings.slice(0, elementIndex).slice(-3).map(s => ({
              selector: generateSelectorForElement(s),
              tagName: s.tagName.toLowerCase(),
              textContent: (s.textContent || '').substring(0, 50),
              className: s.className || undefined,
            }));
            const after = siblings.slice(elementIndex + 1).slice(0, 3).map(s => ({
              selector: generateSelectorForElement(s),
              tagName: s.tagName.toLowerCase(),
              textContent: (s.textContent || '').substring(0, 50),
              className: s.className || undefined,
            }));
            context.siblings = {
              before: before.length > 0 ? before : undefined,
              after: after.length > 0 ? after : undefined,
              count: siblings.length - 1,
            };
          }
          
          // Children context (limited by maxDepth)
          if (maxDepth > 0) {
            const directChildren = Array.from(element.children).slice(0, 10) as HTMLElement[];
            context.children = {
              direct: directChildren.map(c => ({
                selector: generateSelectorForElement(c),
                tagName: c.tagName.toLowerCase(),
                className: c.className || undefined,
                textContent: (c.textContent || '').substring(0, 50),
              })),
              count: {
                direct: element.children.length,
                total: element.querySelectorAll('*').length,
              },
            };
          }
          
          return context;
        }

        // Utility function to generate alternative selectors
        function generateAlternativeSelectors(element: HTMLElement, baseSelector: string, maxAlternatives: number = 5): Array<{selector: string; reason: string; confidence: 'high' | 'medium' | 'low'; matches: number}> {
          const alternatives: Array<{selector: string; reason: string; confidence: 'high' | 'medium' | 'low'; matches: number}> = [];
          
          // ID selector (highest confidence)
          if (element.id) {
            const idSelector = `#${element.id}`;
            const matches = document.querySelectorAll(idSelector).length;
            alternatives.push({
              selector: idSelector,
              reason: 'Uses element ID',
              confidence: 'high',
              matches,
            });
          }
          
          // Class-based selectors
          const classes = Array.from(element.classList);
          if (classes.length > 0) {
            const classSelector = `.${classes.join('.')}`;
            const matches = document.querySelectorAll(classSelector).length;
            if (matches === 1) {
              alternatives.push({
                selector: classSelector,
                reason: 'Unique class combination',
                confidence: 'high',
                matches,
              });
            }
          }
          
          // Position-based selectors
          if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children);
            const index = siblings.indexOf(element);
            if (index === 0) {
              const firstChildSelector = `${baseSelector}:first-child`;
              const matches = document.querySelectorAll(firstChildSelector).length;
              alternatives.push({
                selector: firstChildSelector,
                reason: 'First child in parent',
                confidence: 'medium',
                matches,
              });
            }
            if (index === siblings.length - 1) {
              const lastChildSelector = `${baseSelector}:last-child`;
              const matches = document.querySelectorAll(lastChildSelector).length;
              alternatives.push({
                selector: lastChildSelector,
                reason: 'Last child in parent',
                confidence: 'medium',
                matches,
              });
            }
          }
          
          // Data attribute selectors
          const dataAttrs = Array.from(element.attributes).filter(attr => attr.name.startsWith('data-'));
          for (const attr of dataAttrs.slice(0, 2)) {
            const dataSelector = `[${attr.name}="${attr.value}"]`;
            const matches = document.querySelectorAll(dataSelector).length;
            if (matches === 1) {
              alternatives.push({
                selector: dataSelector,
                reason: `Uses data attribute ${attr.name}`,
                confidence: 'high',
                matches,
              });
            }
          }
          
          return alternatives.slice(0, maxAlternatives);
        }
        const results = [];
        const executedOperations = [];

        // Parse selector for array index notation (e.g., ".item[3]" selects 4th element)
        // and :contains() pseudo-selector (e.g., ".item:contains('text')")
        // This allows selecting nth element across all matches, regardless of parent structure
        function parseSelectorWithIndex(selector: string): {baseSelector: string; index: number | null; containsText: string | null} {
          // First, extract :contains() pseudo-selector if present
          // Pattern: :contains("text") or :contains('text')
          let containsText: string | null = null;
          let baseSelector = selector;
          
          const containsMatch = selector.match(/:contains\(["']([^"']+)["']\)/);
          if (containsMatch) {
            containsText = containsMatch[1];
            // Remove :contains() from selector
            baseSelector = selector.replace(/:contains\(["'][^"']+["']\)/, '');
          }
          
          // Match pattern: selector ending with [number] where number is a non-negative integer
          // This is different from CSS attribute selectors which have values like [data-id="value"]
          const arrayIndexMatch = baseSelector.match(/^(.+)\[(\d+)\]$/);
          if (arrayIndexMatch) {
            const finalBaseSelector = arrayIndexMatch[1];
            const index = parseInt(arrayIndexMatch[2], 10);
            return {baseSelector: finalBaseSelector, index, containsText};
          }
          return {baseSelector, index: null, containsText};
        }
        
        // Filter elements by :contains() text if specified (from selector)
        function filterByContains(elements: HTMLElement[], text: string | null): HTMLElement[] {
          if (!text) return elements;
          return elements.filter(el => {
            const elementText = el.textContent || '';
            return elementText.includes(text);
          });
        }

        // Filter elements by checkIfElementContains parameter (separate from selector)
        function filterByContainsParam(elements: HTMLElement[], text: string | null, caseSensitive: boolean, searchIn: 'textContent' | 'innerHTML' | 'innerText'): HTMLElement[] {
          if (!text) return elements;
          const searchText = caseSensitive ? text : text.toLowerCase();
          return elements.filter(el => {
            let elementText: string;
            if (searchIn === 'innerHTML') {
              elementText = el.innerHTML || '';
            } else if (searchIn === 'innerText') {
              elementText = el.innerText || '';
            } else {
              elementText = el.textContent || '';
            }
            const normalizedText = caseSensitive ? elementText : elementText.toLowerCase();
            return normalizedText.includes(searchText);
          });
        }

        try {
          for (const op of operations as DomOperation[]) {
            const {baseSelector, index, containsText} = parseSelectorWithIndex(op.selector);
            let allElements = Array.from(document.querySelectorAll(baseSelector)) as HTMLElement[];
            
            // Filter by :contains() if specified in selector
            allElements = filterByContains(allElements, containsText);
            
            // Filter by checkIfElementContains parameter if specified (separate from selector)
            if (op.checkIfElementContains) {
              const caseSensitive = op.containsCaseSensitive !== false; // Default true
              const searchIn = op.containsSearchIn || 'textContent';
              allElements = filterByContainsParam(allElements, op.checkIfElementContains, caseSensitive, searchIn);
            }
            
            const opResults = [];

            // If array index notation is used, select only the element at that index
            let elements: HTMLElement[];
            if (index !== null) {
              if (index < 0) {
                opResults.push({
                  selector: op.selector,
                  found: false,
                  action: op.action,
                  message: `Invalid array index: ${index}. Index must be non-negative.`,
                });
                results.push(...opResults);
                executedOperations.push(op);
                continue;
              }
              if (index >= allElements.length) {
                opResults.push({
                  selector: op.selector,
                  found: false,
                  action: op.action,
                  message: `Array index ${index} is out of bounds. Found ${allElements.length} element(s) matching "${baseSelector}".`,
                });
                results.push(...opResults);
                executedOperations.push(op);
                continue;
              }
              elements = [allElements[index]];
            } else {
              // Default to first match when multiple elements match (for non-query operations)
              // This prevents unintended operations on multiple elements
              if (op.action !== 'query' && op.action !== 'validate-structure' && allElements.length > 1) {
                elements = [allElements[0]];
                opResults.push({
                  selector: op.selector,
                  found: true,
                  action: op.action,
                  success: true,
                  message: `⚠️ Warning: Selector matched ${allElements.length} elements. Applied operation to the first match only. Use array index notation (e.g., "${baseSelector}[0]" for first, "${baseSelector}[1]" for second) to target a specific element, or "${baseSelector}[${allElements.length - 1}]" for the last.`,
                });
              } else {
                // For query operations or single matches, use all elements
                elements = allElements;
              }
            }

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
                // When array index notation is used, preserve the original index
                const originalIndex = index !== null ? index : (allElements.indexOf(element));
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
                      
                      // Handle getEntireHTMLDocument for query action
                      if (op.getEntireHTMLDocument && op.selector.toLowerCase() === 'html' && element === document.documentElement) {
                        const includeCSS = op.getEntireHTMLDocument.includeCSS !== false;
                        const includeJS = op.getEntireHTMLDocument.includeJS !== false;
                        const includePatches = op.getEntireHTMLDocument.includePatches !== false;
                        const format = op.getEntireHTMLDocument.format || 'string';
                        
                        if (format === 'string') {
                          let html = document.documentElement.outerHTML;
                          
                          // Count elements
                          const totalElements = document.querySelectorAll('*').length;
                          const styleTags = document.querySelectorAll('style').length;
                          const scriptTags = document.querySelectorAll('script').length;
                          
                          // Count patches if needed
                          let cssPatches = 0;
                          let jsPatches = 0;
                          if (includePatches) {
                            const patchElements = document.querySelectorAll(`[${PATCH_ID_ATTR}]`);
                            for (const el of Array.from(patchElements)) {
                              const kind = el.getAttribute(PATCH_KIND_ATTR);
                              if (kind === 'css') cssPatches++;
                              if (kind === 'js') jsPatches++;
                            }
                          }
                          
                          // If patches should be included but aren't in outerHTML, we'd need to append them
                          // For now, we return the HTML as-is and note what's included
                          // Store document info separately (will be added to opResult later)
                          (elementData as any).__document = {
                            html: html,
                            length: html.length,
                            includes: {
                              css: includeCSS && styleTags > 0,
                              js: includeJS && scriptTags > 0,
                              patches: includePatches && (cssPatches > 0 || jsPatches > 0),
                            },
                            statistics: {
                              totalElements,
                              styleTags: includeCSS ? styleTags : 0,
                              scriptTags: includeJS ? scriptTags : 0,
                              mcpPatches: includePatches ? {
                                css: cssPatches,
                                js: jsPatches,
                              } : undefined,
                            },
                          };
                        }
                        // TODO: structured format would require more complex parsing
                      }
                      
                      // Track contains match if checkIfElementContains was used
                      if (op.checkIfElementContains) {
                        const caseSensitive = op.containsCaseSensitive !== false;
                        const searchIn = op.containsSearchIn || 'textContent';
                        let elementText: string;
                        if (searchIn === 'innerHTML') {
                          elementText = element.innerHTML || '';
                        } else if (searchIn === 'innerText') {
                          elementText = element.innerText || '';
                        } else {
                          elementText = element.textContent || '';
                        }
                        const searchText = caseSensitive ? op.checkIfElementContains : op.checkIfElementContains.toLowerCase();
                        const matchText = caseSensitive ? elementText : elementText.toLowerCase();
                        if (matchText.includes(searchText)) {
                          (elementData as any).__containsMatch = true;
                          (elementData as any).__matchedText = elementText.substring(0, 100);
                        }
                      }
                      
                      break;
                    }

                    case 'set-style': {
                      // Capture before state if responseOptions.includeResultingState is enabled
                      let beforeState: Record<string, string> | undefined;
                      if (op.responseOptions?.includeResultingState && op.properties) {
                        const styles = window.getComputedStyle(element);
                        beforeState = {};
                        for (const prop of Object.keys(op.properties)) {
                          beforeState[prop] = styles.getPropertyValue(prop) || '';
                        }
                      }
                      
                      if (op.properties) {
                        for (const [prop, value] of Object.entries(op.properties)) {
                          element.style.setProperty(prop, value, 'important');
                        }
                      }
                      
                      // Capture after state if responseOptions.includeResultingState is enabled
                      if (op.responseOptions?.includeResultingState && op.properties) {
                        const styles = window.getComputedStyle(element);
                        const afterState: Record<string, string> = {};
                        for (const prop of Object.keys(op.properties)) {
                          afterState[prop] = styles.getPropertyValue(prop) || '';
                        }
                        // Store changes and resulting state separately (will be added to opResult later)
                        (elementData as any).__changes = {
                          before: beforeState,
                          after: afterState,
                        };
                        (elementData as any).__resultingState = {
                          computedStyles: {
                            ...Object.fromEntries(
                              ['display', 'position', 'width', 'height', 'padding', 'margin', 'background'].map(p => [
                                p,
                                styles.getPropertyValue(p) || '',
                              ])
                            ),
                          },
                          boundingRect: (() => {
                            const rect = element.getBoundingClientRect();
                            return {
                              width: rect.width,
                              height: rect.height,
                              x: rect.x,
                              y: rect.y,
                            };
                          })(),
                        };
                      }
                      break;
                    }

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

                    case 'replace-html':
                      if (op.html !== undefined) {
                        element.innerHTML = op.html;
                      }
                      break;

                    case 'replace-content': {
                      if (op.html !== undefined) {
                        const preserve = op.preserveStructure !== false; // Default to true
                        if (preserve) {
                          // Preserve wrapper structure by only replacing direct children/text nodes
                          // Remove all child nodes
                          while (element.firstChild) {
                            element.removeChild(element.firstChild);
                          }
                          // Insert new HTML as a fragment
                          const temp = document.createElement('div');
                          temp.innerHTML = op.html;
                          while (temp.firstChild) {
                            element.appendChild(temp.firstChild);
                          }
                        } else {
                          // Fallback to innerHTML if preserveStructure is false
                          element.innerHTML = op.html;
                        }
                      }
                      break;
                    }

                    case 'validate-structure': {
                      if (!op.required) {
                        success = false;
                        message = 'validate-structure action requires required parameter';
                        break;
                      }
                      
                      const validationResults: string[] = [];
                      let isValid = true;
                      
                      // Check required elements
                      if (op.required.elements) {
                        for (const selector of op.required.elements) {
                          const matches = element.querySelectorAll(selector);
                          if (matches.length === 0) {
                            validationResults.push(`Missing required element: "${selector}"`);
                            isValid = false;
                          }
                        }
                      }
                      
                      // Check required classes
                      if (op.required.classes) {
                        for (const className of op.required.classes) {
                          const hasClass = element.classList.contains(className) || 
                                         element.querySelector(`.${className}`) !== null;
                          if (!hasClass) {
                            validationResults.push(`Missing required class: "${className}"`);
                            isValid = false;
                          }
                        }
                      }
                      
                      // Check element counts
                      if (op.required.count) {
                        for (const [selector, constraints] of Object.entries(op.required.count)) {
                          const matches = element.querySelectorAll(selector);
                          const count = matches.length;
                          
                          if (constraints.exact !== undefined && count !== constraints.exact) {
                            validationResults.push(`Selector "${selector}" matched ${count} elements, expected exactly ${constraints.exact}`);
                            isValid = false;
                          } else if (constraints.min !== undefined && count < constraints.min) {
                            validationResults.push(`Selector "${selector}" matched ${count} elements, expected at least ${constraints.min}`);
                            isValid = false;
                          } else if (constraints.max !== undefined && count > constraints.max) {
                            validationResults.push(`Selector "${selector}" matched ${count} elements, expected at most ${constraints.max}`);
                            isValid = false;
                          }
                        }
                      }
                      
                      success = isValid;
                      message = isValid 
                        ? 'Structure validation passed'
                        : `Structure validation failed:\n${validationResults.join('\n')}`;
                      
                      elementData = {
                        textContent: message,
                        attributes: {
                          'validation-result': isValid ? 'valid' : 'invalid',
                          'validation-errors': validationResults.length.toString(),
                        },
                      };
                      break;
                    }

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
                  elementIndex: originalIndex,
                  found: true,
                  action: op.action,
                  success,
                  message,
                };
                if (elementData) {
                  // Extract special fields that should be on opResult, not data
                  const {__document, __containsMatch, __matchedText, __changes, __resultingState, ...cleanData} = elementData as any;
                  opResult.data = cleanData;
                  
                  // Move special fields to opResult
                  if (__document) {
                    opResult.document = __document;
                  }
                  if (__containsMatch !== undefined) {
                    opResult.containsMatch = __containsMatch;
                  }
                  if (__matchedText) {
                    opResult.matchedText = __matchedText;
                  }
                  if (__changes) {
                    opResult.changes = __changes;
                  }
                  if (__resultingState) {
                    opResult.resultingState = __resultingState;
                  }
                }
                
                // Add rich response data based on responseOptions
                const respOpts = op.responseOptions;
                if (respOpts) {
                  // Context information
                  if (respOpts.includeContext) {
                    const maxDepth = respOpts.maxContextDepth || 1;
                    opResult.context = getElementContext(element, maxDepth);
                  }
                  
                  // Alternative selectors
                  if (respOpts.includeAlternatives) {
                    const maxAlternatives = respOpts.maxAlternatives || 5;
                    opResult.alternativeSelectors = generateAlternativeSelectors(element, baseSelector, maxAlternatives);
                  }
                  
                  // Hints
                  if (respOpts.includeHints) {
                    const hints: DomManipulationOpResult['hints'] = {
                      nextSteps: [],
                      warnings: [],
                      bestPractices: [],
                    };
                    
                    // Add warnings for multiple matches
                    if (allElements.length > 1 && op.action !== 'query') {
                      hints.warnings?.push(
                        `Selector matched ${allElements.length} elements. Operation was applied to the first match only. Use array index notation (e.g., "${baseSelector}[0]" for first, "${baseSelector}[1]" for second) to target a specific element.`
                      );
                    }
                    
                    // Add next steps based on action
                    if (op.action === 'query') {
                      hints.nextSteps?.push('Query sibling elements to understand layout structure');
                      hints.nextSteps?.push('Check parent element for layout constraints (flex/grid)');
                    } else if (op.action === 'set-style') {
                      hints.nextSteps?.push('Consider checking if parent container needs height constraints');
                      const parent = element.parentElement;
                      if (parent) {
                        const parentStyles = window.getComputedStyle(parent);
                        if (parentStyles.display === 'flex') {
                          hints.nextSteps?.push('Parent uses flexbox - consider flex-direction and flex properties');
                        }
                      }
                    }
                    
                    // Best practices
                    hints.bestPractices?.push('Use data attributes (data-*) for stable selectors in dynamic layouts');
                    hints.bestPractices?.push('Prefer semantic selectors over positional (:nth-child)');
                    if (!element.id) {
                      hints.bestPractices?.push('Consider adding an ID for frequently accessed elements');
                    }
                    
                    opResult.hints = hints;
                  }
                  
                  // For manipulation actions, include resulting state if not already included
                  if (respOpts.includeResultingState && op.action !== 'query' && !opResult.resultingState) {
                    const styles = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    opResult.resultingState = {
                      computedStyles: {
                        display: styles.display,
                        position: styles.position,
                        width: styles.width,
                        height: styles.height,
                        padding: styles.padding,
                        margin: styles.margin,
                      },
                      boundingRect: {
                        width: rect.width,
                        height: rect.height,
                        x: rect.x,
                        y: rect.y,
                      },
                    };
                  }
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
      const validateOps = result.operations.filter(op => op.action === 'validate-structure');
      const foundCount = queryOps.filter(op => op.found).length;
      const totalElements = queryOps.reduce((sum, op) => sum + (op.elementIndex !== undefined ? 1 : 0), 0);
      if (queryOps.length > 0) {
        response.appendResponseLine(`Query completed: ${foundCount}/${queryOps.length} selector(s) matched elements (${totalElements} total elements found)`);
        
        // Add summary for checkIfElementContains if used
        if (checkIfElementContains) {
          const containsOps = queryOps.filter(op => op.containsMatch === true);
          if (containsOps.length > 0) {
            response.appendResponseLine(`Text filter "${checkIfElementContains}": ${containsOps.length} element(s) matched both selector and text content`);
          } else {
            response.appendResponseLine(`Text filter "${checkIfElementContains}": No elements matched the text filter`);
          }
        }
      }
      if (validateOps.length > 0) {
        const validCount = validateOps.filter(op => op.success === true).length;
        response.appendResponseLine(`Structure validation completed: ${validCount}/${validateOps.length} validation(s) passed`);
      }
    } else {
      response.appendResponseLine(`DOM manipulation completed: ${successfulOps}/${totalOps} operations successful`);
    }

    // Show warnings for multiple element matches
    const warnings = result.operations.filter(op => op.message && op.message.includes('⚠️ Warning: Selector matched'));
    if (warnings.length > 0) {
      response.appendResponseLine(`\n⚠️  Warning: ${warnings.length} selector(s) matched multiple elements:`);
      for (const op of warnings) {
        response.appendResponseLine(`  - "${op.selector}": ${op.message}`);
      }
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



