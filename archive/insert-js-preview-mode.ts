/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ARCHIVED: insert_js Preview Mode Implementation
 * 
 * This file contains the preview mode functionality that was removed from the
 * `insert_js` tool to simplify its API.
 * 
 * ## What Was Preview Mode?
 * 
 * Preview mode allowed testing multiple JavaScript variants with visual feedback:
 * - Test multiple script variants in sequence
 * - Generate SVG wireframe snapshots for visual comparison
 * - Support responsive breakpoint testing
 * - Automatically rollback scripts after testing (by default)
 * - Highlight changed elements in visual snapshots
 * 
 * ## Why Was It Removed?
 * 
 * 1. **Complexity**: The tool had two distinct modes (preview vs direct insertion)
 *   which made the API confusing and harder to understand.
 * 
 * 2. **Redundancy**: Users can achieve the same result by:
 *   - Inserting a script with `insert_js`
 *   - Evaluating results with `evaluate_script` or `wireframe_snapshot`
 *   - Rolling back with `rollback_patch` if needed
 *   - Inserting another variant
 * 
 * 3. **Clarity**: A simpler API with just `jsText` is easier to understand and use.
 * 
 * 4. **Maintenance**: Less code to maintain, fewer edge cases, clearer behavior.
 * 
 * ## Migration Path
 * 
 * If you need preview mode functionality, you can:
 * 
 * 1. **Manual Testing Loop:**
 *   ```typescript
 *   // Insert variant 1
 *   await insert_js({ jsText: "variant1" });
 *   await wireframe_snapshot({ /* capture visual */ });
 *   await rollback_patch({ patchId: "..." });
 *   
 *   // Insert variant 2
 *   await insert_js({ jsText: "variant2" });
 *   await wireframe_snapshot({ /* capture visual */ });
 *   await rollback_patch({ patchId: "..." });
 *   ```
 * 
 * 2. **Use insert_css Preview Mode:**
 *   The `insert_css` tool still has preview mode, which is more useful for CSS
 *   since CSS changes are easier to visualize and rollback reliably.
 * 
 * ## Archived Code
 * 
 * The following code was the preview mode implementation that was removed:
 */

import type {Frame, JSHandle, Page} from '../third_party/index.js';
import type {renderSvgWireframe} from './wireframe.js';

type WireframeSnapshotOutput = Parameters<typeof renderSvgWireframe>[0];

/**
 * Preview mode handler for insert_js (ARCHIVED)
 * 
 * This handler was removed from the main insert_js tool. It supported:
 * - Testing multiple script variants
 * - Visual wireframe snapshots
 * - Responsive breakpoint testing
 * - Automatic rollback
 */
export async function handleInsertJsPreviewMode(
  scripts: string[],
  params: {
    selectedScriptIndex?: number;
    waitAfterMs?: number;
    selectors?: string[];
    scopeSelector?: string;
    includeDescendants?: boolean;
    maxElements?: number;
    includeComputedStyles?: boolean;
    computedStylePreset?: 'layout' | 'typography' | 'paint' | 'standard' | 'debug';
    showVisual?: boolean;
    highlightChanges?: boolean;
    showDimensions?: boolean;
    responsiveBreakpoints?: Array<{
      name: string;
      width: number;
      height: number;
    }>;
    filePath?: string;
    autoRollback?: boolean;
    recordToSession?: boolean;
    editSessionId?: string;
    targetFilePath?: string;
  },
  context: {
    getSelectedPage: () => Page;
    getPageId: (page: Page) => number | undefined;
    createPatchId: (prefix: string) => string;
    registerPatch: (patch: {
      patchId: string;
      patchType: 'js';
      pageId: number;
      createdAt: number;
      description?: string;
    }) => void;
    unregisterPatch: (patchId: string) => void;
    saveFile: (data: Uint8Array, filename: string) => Promise<{filename: string}>;
    appendEditChange: (
      change: {
        type: 'insert_js_preview';
        pageId: number;
        createdAt: number;
        description: string;
        targetFilePath?: string;
        payload: {
          selectedScriptIndex: number;
          jsText?: string;
          results: Array<{jsText: string; patchId: string}>;
          autoRollback?: boolean;
        };
      },
      options: {sessionId?: string; autoCreate: boolean},
    ) => void;
  },
  response: {
    appendResponseLine: (line: string) => void;
  },
) {
  const page = context.getSelectedPage();
  const pageId = context.getPageId(page) ?? 0;

  const PATCH_ID_ATTR = 'data-mcp-patch-id';
  const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
  const PATCH_KIND_ATTR = 'data-mcp-patch-kind';
  const PATCH_OWNER_VALUE = 'wireframe-chrome-devtools-mcp';

  // Store original viewport for restoration
  const originalViewport = await page.viewport();
  if (
    params.selectedScriptIndex !== undefined &&
    (params.selectedScriptIndex < 0 || params.selectedScriptIndex >= scripts.length)
  ) {
    throw new Error(
      `selectedScriptIndex out of range: got ${params.selectedScriptIndex}, scripts.length=${scripts.length}`,
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
    if (params.showVisual && params.highlightChanges) {
      const {captureWireframeSnapshot} = await import('./wireframe.js');
      const {output} = await captureWireframeSnapshot(
        {
          params: {
            selectors: params.selectors,
            scopeSelector: params.scopeSelector,
            includeDescendants: params.includeDescendants,
            maxElements: params.maxElements,
            includeComputedStyles: params.includeComputedStyles,
            computedStylePreset: params.computedStylePreset,
            coordinateSpace: 'viewport',
          },
        },
        context as any,
      );
      initialSnapshot = output;
    }

    const insertedPatchIds: string[] = [];
    for (let i = 0; i < scripts.length; i++) {
      const jsText = scripts[i];
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
        description: `JS Preview: variant ${i + 1}/${scripts.length}`,
      });
      insertedPatchIds.push(insertResult.patchId);

      if (params.waitAfterMs && params.waitAfterMs > 0) {
        await new Promise(resolve => setTimeout(resolve, params.waitAfterMs));
      }

      const result: (typeof results)[number] = {
        jsText,
        patchId: insertResult.patchId,
      };

      if (params.showVisual) {
        const {captureWireframeSnapshot, renderSvgWireframe} =
          await import('./wireframe.js');
        const {output: currentSnapshot} = await captureWireframeSnapshot(
          {
            params: {
              selectors: params.selectors,
              scopeSelector: params.scopeSelector,
              includeDescendants: params.includeDescendants,
              maxElements: params.maxElements,
              includeComputedStyles: params.includeComputedStyles,
              computedStylePreset: params.computedStylePreset,
              coordinateSpace: 'viewport',
            },
          },
          context as any,
        );

        const svg = renderSvgWireframe(currentSnapshot, {
          scale: 1,
          background: 'transparent',
          showLabels: true,
          showDimensions: params.showDimensions ?? true,
          showSpacing: true,
          showOverlaps: false,
          showGaps: false,
          showClipping: false,
          strokeWidth: 1,
          fillOpacity: 0.08,
          highlightChanged: params.highlightChanges ?? true,
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
      if (params.responsiveBreakpoints && params.responsiveBreakpoints.length > 0) {
        result.responsiveSnapshots = [];
        for (const breakpoint of params.responsiveBreakpoints) {
          await page.setViewport({
            width: breakpoint.width,
            height: breakpoint.height,
          });

          const {captureWireframeSnapshot, renderSvgWireframe} =
            await import('./wireframe.js');
          const {output: responsiveSnapshot} = await captureWireframeSnapshot(
            {
              params: {
                selectors: params.selectors,
                scopeSelector: params.scopeSelector,
                includeDescendants: params.includeDescendants,
                maxElements: params.maxElements,
                includeComputedStyles: params.includeComputedStyles,
                computedStylePreset: params.computedStylePreset,
                coordinateSpace: 'viewport',
              },
            },
            context as any,
          );

          const svg = renderSvgWireframe(responsiveSnapshot, {
            scale: 1,
            background: 'transparent',
            showLabels: true,
            showDimensions: params.showDimensions ?? true,
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
      if (params.autoRollback && i < scripts.length - 1) {
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
    if (params.autoRollback && insertedPatchIds.length > 0) {
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
      params.selectedScriptIndex !== undefined
        ? params.selectedScriptIndex
        : scripts.length - 1;
    const recorded = results[recordedScriptIndex];

    response.appendResponseLine(`Tested ${scripts.length} JS variants`);
    const out = {
      testedScripts: scripts.length,
      results,
      autoRolledBack: params.autoRollback,
      recordedScriptIndex,
      recordedJsText: recorded?.jsText,
    };

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(out, null, 2));
    response.appendResponseLine('```');

    if (params.filePath) {
      const summary = {
        timestamp: new Date().toISOString(),
        testedScripts: scripts.length,
        results,
      };
      await context.saveFile(
        new TextEncoder().encode(JSON.stringify(summary, null, 2)),
        params.filePath,
      );
      response.appendResponseLine(`\nSaved detailed results to ${params.filePath}`);
    }

    if (params.recordToSession) {
      const recordedScriptIndex =
        params.selectedScriptIndex !== undefined
          ? params.selectedScriptIndex
          : Math.max(0, scripts.length - 1);
      const recorded = results[recordedScriptIndex];
      context.appendEditChange(
        {
          type: 'insert_js_preview',
          pageId,
          createdAt: Date.now(),
          description: `JS Preview: [${scripts.length} variants]`,
          targetFilePath: params.targetFilePath,
          payload: {
            selectedScriptIndex: recordedScriptIndex,
            jsText: recorded?.jsText,
            results: results.map(r => ({
              jsText: r.jsText,
              patchId: r.patchId,
            })),
            autoRollback: params.autoRollback,
          },
        },
        {sessionId: params.editSessionId, autoCreate: true},
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
}

