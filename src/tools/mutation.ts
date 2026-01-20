/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const PATCH_ID_ATTR = 'data-mcp-patch-id';
const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
const PATCH_KIND_ATTR = 'data-mcp-patch-kind';
const PATCH_OWNER_VALUE = 'wireframe-chrome-devtools-mcp';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

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
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    patchId: zod
      .string()
      .describe('Patch id previously returned by insert_css/insert_js.'),
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

export const insertCssPreview = defineTool({
  name: 'insert_css_preview',
  description:
    'Insert CSS changes and automatically generate visual wireframe feedback wrapped in JSON. Supports testing multiple values, responsive breakpoints, and before/after comparisons.',
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
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const { selector, property, values, showVisual, highlightChanges, showDimensions, responsiveBreakpoints, filePath, autoRollback } = request.params;

    // Store original viewport for restoration
    const originalViewport = await page.viewport();
    const originalUrl = page.url();

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
      let initialSnapshot: any = null;
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

        const result: any = {
          value,
          cssText,
          patchId: insertResult.patchId,
        };

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
            previous: initialSnapshot,
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

        // Auto-rollback if requested (except for the last value if not auto-rolling back)
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

      // Restore original viewport
      if (originalViewport) {
        await page.setViewport(originalViewport);
      }

      // Format response
      response.appendResponseLine(`Tested ${values.length} CSS values for \`${selector} { ${property}: ... }\``);

      // Return full results as JSON
      const result = {
        selector,
        property,
        testedValues: values.length,
        results,
        autoRolledBack: autoRollback,
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

    } catch (error) {
      // Restore viewport on error
      if (originalViewport) {
        try {
          await page.setViewport(originalViewport);
        } catch (e) {
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
    const result = await page.evaluate(
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
    }

    // Format response
    const successfulOps = result.operations.filter((op: any) => op.success).length;
    const totalOps = result.operations.length;

    response.appendResponseLine(`DOM manipulation completed: ${successfulOps}/${totalOps} operations successful`);

    if (result.operations.some((op: any) => !op.found)) {
      const notFound = result.operations.filter((op: any) => !op.found);
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
    category: ToolCategory.DEBUGGING,
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



