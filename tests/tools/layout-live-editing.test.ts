/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import {describe, it} from 'node:test';

import {layoutLiveEditing, layoutLiveEditingRecipeCatalog} from '../../src/tools/layout-live-editing.js';
import {exportPrototypeState} from '../../src/tools/prototype.js';
import {html, withMcpContext} from '../utils.js';

function extractJson(responseText: string) {
  const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
  assert.ok(jsonMatch, 'Expected JSON payload');
  return JSON.parse(jsonMatch[1]);
}

describe('layout_live_editing', () => {
  it('returns recipe catalog summaries', async () => {
    await withMcpContext(async (response, context) => {
      await layoutLiveEditingRecipeCatalog.handler({params: {}}, response, context);

      const payload = extractJson(response.responseLines.join('\n'));
      const recipes = payload.recipes as Array<{name: string; params: Record<string, unknown>}>;
      assert.ok(recipes.some(recipe => recipe.name === 'toolbar'));
      const toolbar = recipes.find(recipe => recipe.name === 'toolbar');
      assert.ok(toolbar?.params?.groups);
    });
  });

  it('applies grid layout, css/js patches, and selection behavior', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'le-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'test-grid', replaceExisting: true},
            composition: {
              type: 'layout_parametric_grid',
              params: {
                rows: [
                  {items: ['A', 'B', 'C']},
                  {items: ['D', 'E']},
                ],
                unit: '1fr',
                gap: '0.25rem',
              },
            },
            behaviors: [
              {type: 'behavior_selectable', params: {defaultSelectedIndex: 0}},
            ],
          },
        },
        response,
        context,
      );

      const rootExists = await page.evaluate(() => Boolean(document.querySelector('#le-root')));
      assert.equal(rootExists, true);

      const cssPatch = await page.evaluate(() => {
        const style = document.querySelector('style[data-mcp-patch-id="test-grid-css"]') as HTMLStyleElement | null;
        return style?.textContent ?? null;
      });
      assert.ok(cssPatch?.includes('#le-root'));

      const jsPatch = await page.evaluate(() => {
        const script = document.querySelector('script[data-mcp-patch-id="test-grid-js"]') as HTMLScriptElement | null;
        return script?.textContent ?? null;
      });
      assert.ok(jsPatch?.includes('__MCP_LAYOUT_LIVE_EDITING__'));

      const selectedCount = await page.evaluate(() => {
        return document.querySelectorAll('.le-selected').length;
      });
      assert.equal(selectedCount, 0);
    });
  });

  it('returns generated payload in export_only mode', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'export_only',
            root: {id: 'export-root', classPrefix: 'exp'},
            patch: {patchIdPrefix: 'export-test'},
            recipe: 'selectable_view',
            recipeParams: {
              items: [
                {label: 'One', content: '<p>One</p>'},
                {label: 'Two', content: '<p>Two</p>'},
              ],
            },
          },
        },
        response,
        context,
      );

      const payload = extractJson(response.responseLines.join('\n'));
      assert.equal(payload.mode, 'export_only');
      assert.ok(payload.html.includes('export-root'));
      assert.ok(payload.css.includes('#export-root'));
    });
  });

  it('rolls back patches in preview mode', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'preview',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'preview-root', classPrefix: 'prev'},
            patch: {patchIdPrefix: 'preview-test', replaceExisting: true},
            composition: {
              type: 'layout_parametric_stack',
              params: {
                items: ['X', 'Y', 'Z'],
                gap: '4px',
                direction: 'row',
              },
            },
          },
        },
        response,
        context,
      );

      const domExists = await page.evaluate(() => {
        return Boolean(document.querySelector('[data-mcp-patch-id="preview-test-dom"]'));
      });
      assert.equal(domExists, false);

      const cssExists = await page.evaluate(() => {
        return Boolean(document.querySelector('style[data-mcp-patch-id="preview-test-css"]'));
      });
      assert.equal(cssExists, false);
    });
  });

  it('supports fixed and constrained sizing in stack items', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'size-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'size-test', replaceExisting: true},
            composition: {
              type: 'layout_parametric_stack',
              params: {
                direction: 'row',
                items: [
                  {label: 'Fixed', size: '120px', minSize: '80px', maxSize: '160px'},
                  {label: 'Flex', span: 1},
                ],
              },
            },
          },
        },
        response,
        context,
      );

      const firstStyle = await page.evaluate(() => {
        const item = document.querySelector('#size-root [data-le-item]') as HTMLElement | null;
        return item?.getAttribute('style') ?? '';
      });
      assert.ok(firstStyle.includes('flex:0 0 120px'));
      assert.ok(firstStyle.includes('min-width:80px'));
      assert.ok(firstStyle.includes('max-width:160px'));
    });
  });

  it('renders nested compositions inside items', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'nested-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'nested-test', replaceExisting: true},
            composition: {
              type: 'layout_parametric_stack',
              params: {
                direction: 'column',
                items: [
                  {
                    composition: {
                      type: 'layout_parametric_grid',
                      params: {
                        rows: [{items: ['A', 'B']}],
                        unit: '1fr',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        response,
        context,
      );

      const nestedExists = await page.evaluate(() => {
        return Boolean(document.querySelector('#nested-root .le-grid'));
      });
      assert.equal(nestedExists, true);
    });
  });

  it('supports carousel variant navigation', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'carousel-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'carousel-test', replaceExisting: true},
            composition: {
              type: 'component_parametric_viewer',
              params: {
                variant: 'carousel',
                items: [
                  {label: 'One', content: '<p>One</p>'},
                  {label: 'Two', content: '<p>Two</p>'},
                ],
              },
            },
            behaviors: [{type: 'behavior_selectable'}],
          },
        },
        response,
        context,
      );

      const initialIndex = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.le-viewer-trigger'));
        return items.findIndex(item => item.classList.contains('le-selected'));
      });
      assert.equal(initialIndex, 0);

      const nextIndex = await page.evaluate(() => {
        const next = document.querySelector('[data-le-carousel-next]') as HTMLButtonElement | null;
        next?.click();
        const items = Array.from(document.querySelectorAll('.le-viewer-trigger'));
        return items.findIndex(item => item.classList.contains('le-selected'));
      });
      assert.equal(nextIndex, 1);
    });
  });

  it('adds drag-resize handles for stack layouts', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'resize-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'resize-test', replaceExisting: true},
            composition: {
              type: 'layout_parametric_stack',
              params: {
                direction: 'row',
                items: ['Left', 'Middle', 'Right'],
              },
              behaviors: [{type: 'behavior_drag_resize'}],
            },
          },
        },
        response,
        context,
      );

      const handleCount = await page.evaluate(() => {
        return document.querySelectorAll('.le-resize-handle').length;
      });
      assert.equal(handleCount, 2);
    });
  });

  it('exports patches via export_prototype_state', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'export-live-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'export-live', replaceExisting: true},
            recipe: 'selectable_view',
            recipeParams: {
              items: [
                {label: 'One', content: '<p>One</p>'},
                {label: 'Two', content: '<p>Two</p>'},
              ],
            },
          },
        },
        response,
        context,
      );

      response.resetResponseLineForTesting();
      await exportPrototypeState.handler(
        {params: {mode: 'split_files', baseName: 'prototype', includeExternal: true}},
        response,
        context,
      );

      const payload = extractJson(response.responseLines.join('\n'));
      const cssPath = payload?.files?.css as string;
      const jsPath = payload?.files?.js as string;
      assert.ok(cssPath, 'expected exported CSS file path');
      assert.ok(jsPath, 'expected exported JS file path');

      const exportedCss = await fs.readFile(cssPath, 'utf8');
      const exportedJs = await fs.readFile(jsPath, 'utf8');
      assert.ok(exportedCss.includes('.le-viewer'), 'exported CSS should include layout styles');
      assert.ok(exportedJs.includes('__MCP_LAYOUT_LIVE_EDITING__'), 'exported JS should include behavior script');
    });
  });

  it('applies theme presets and palette overrides', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'theme-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'theme-test', replaceExisting: true},
            theme: {
              surfaceIntent: 'industrial',
              visualWeight: 'skeuomorphic',
              interactionModel: 'precision',
              palette: {
                accent: '#ff00aa',
                text: '#f5f5f5',
              },
            },
            composition: {
              type: 'layout_parametric_stack',
              params: {
                direction: 'row',
                items: ['Left', 'Right'],
              },
            },
          },
        },
        response,
        context,
      );

      const cssPatch = await page.evaluate(() => {
        const style = document.querySelector('style[data-mcp-patch-id="theme-test-css"]') as HTMLStyleElement | null;
        return style?.textContent ?? '';
      });
      assert.ok(cssPatch.includes('--le-accent:#ff00aa'));
      assert.ok(cssPatch.includes('--le-text:#f5f5f5'));
      assert.ok(cssPatch.includes('--le-shadow:inset'));
      assert.ok(cssPatch.includes('--le-control-size:28px'));
    });
  });

  it('updates existing patches when replaceExisting is true', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'replace-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'replace-test', replaceExisting: true},
            composition: {
              type: 'layout_parametric_stack',
              params: {direction: 'row', items: ['First']},
            },
          },
        },
        response,
        context,
      );

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'replace-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'replace-test', replaceExisting: true},
            composition: {
              type: 'layout_parametric_stack',
              params: {direction: 'row', items: ['Updated']},
            },
          },
        },
        response,
        context,
      );

      const rootCount = await page.evaluate(() => {
        return document.querySelectorAll('#replace-root').length;
      });
      assert.equal(rootCount, 1);

      const text = await page.evaluate(() => {
        const item = document.querySelector('#replace-root [data-le-item]') as HTMLElement | null;
        return item?.textContent ?? '';
      });
      assert.ok(text.includes('Updated'));
    });
  });

  it('auto-detects theme palette from sampled container styles', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`
        <main id="app">
          <div id="sample" style="background: rgb(18, 20, 24); color: rgb(230, 230, 230); border: 1px solid rgb(48, 54, 60); font-family: 'Courier New', monospace;">
            <button style="background: rgb(70, 130, 180); color: rgb(255, 255, 255);">Play</button>
          </div>
        </main>
      `);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'auto-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'auto-test', replaceExisting: true},
            theme: {
              auto: {sampleSelector: '#sample'},
            },
            composition: {
              type: 'layout_parametric_stack',
              params: {
                direction: 'row',
                items: ['One', 'Two'],
              },
            },
          },
        },
        response,
        context,
      );

      const cssPatch = await page.evaluate(() => {
        const style = document.querySelector('style[data-mcp-patch-id="auto-test-css"]') as HTMLStyleElement | null;
        return style?.textContent ?? '';
      });
      assert.ok(cssPatch.includes('--le-bg:rgb(18, 20, 24)'));
      assert.ok(cssPatch.includes('--le-text:rgb(230, 230, 230)'));
      assert.ok(cssPatch.includes('--le-border:rgb(48, 54, 60)'));
      assert.ok(cssPatch.includes('--le-accent:rgb(70, 130, 180)'));
    });
  });

  it('renders app_shell and toolbar recipes', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<main id="app"></main>`);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'shell-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'shell-test', replaceExisting: true},
            recipe: 'app_shell',
            recipeParams: {
              headerHeight: '48px',
              sidebarWidth: '200px',
            },
          },
        },
        response,
        context,
      );

      const headerExists = await page.evaluate(() => {
        return Boolean(document.querySelector('#shell-root'));
      });
      assert.equal(headerExists, true);

      await layoutLiveEditing.handler(
        {
          params: {
            mode: 'apply',
            target: {selector: '#app', position: 'beforeend'},
            root: {id: 'toolbar-root', classPrefix: 'le'},
            patch: {patchIdPrefix: 'toolbar-test', replaceExisting: true},
            recipe: 'toolbar',
            recipeParams: {
              groups: [{items: ['Play', 'Stop']}],
            },
          },
        },
        response,
        context,
      );

      const toolbarButtonExists = await page.evaluate(() => {
        return Boolean(document.querySelector('#toolbar-root .le-util-btn'));
      });
      assert.equal(toolbarButtonExists, true);
    });
  });
});

