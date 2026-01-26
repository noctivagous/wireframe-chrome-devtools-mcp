/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  insertCss,
  insertJs,
  manipulateDom,
  rollbackPatch,
} from '../../src/tools/mutation.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('mutation', () => {
  const server = serverHooks();

  describe('manipulate_dom', () => {
    it('set-style action', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="test-element">Test</div>
        `);

        await manipulateDom.handler(
          {
            params: {
              action: 'set-style',
              selector: '.test-element',
              properties: {
                'color': 'red',
                'font-size': '20px',
              },
            },
          },
          response,
          context,
        );

        // Verify the style was applied
        const color = await page.evaluate(() => {
          const el = document.querySelector('.test-element') as HTMLElement;
          return window.getComputedStyle(el).color;
        });
        assert.strictEqual(color, 'rgb(255, 0, 0)');

        const fontSize = await page.evaluate(() => {
          const el = document.querySelector('.test-element') as HTMLElement;
          return window.getComputedStyle(el).fontSize;
        });
        assert.strictEqual(fontSize, '20px');
      });
    });

    it('add-class action', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="test-element">Test</div>
        `);

        await manipulateDom.handler(
          {
            params: {
              action: 'add-class',
              selector: '.test-element',
              className: 'highlight',
            },
          },
          response,
          context,
        );

        const hasClass = await page.evaluate(() => {
          return document.querySelector('.test-element')!.classList.contains('highlight');
        });
        assert.strictEqual(hasClass, true);
      });
    });

    it('remove-element action', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="container">
            <div class="to-remove">Remove me</div>
            <div class="keep">Keep me</div>
          </div>
        `);

        await manipulateDom.handler(
          {
            params: {
              action: 'remove-element',
              selector: '.to-remove',
            },
          },
          response,
          context,
        );

        const removedExists = await page.evaluate(() => {
          return document.querySelector('.to-remove') !== null;
        });
        assert.strictEqual(removedExists, false);

        const keptExists = await page.evaluate(() => {
          return document.querySelector('.keep') !== null;
        });
        assert.strictEqual(keptExists, true);
      });
    });

    it('insert-html action', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="container">Original</div>
        `);

        await manipulateDom.handler(
          {
            params: {
              action: 'insert-html',
              selector: '.container',
              html: '<span>New content</span>',
              position: 'beforeend',
            },
          },
          response,
          context,
        );

        const content = await page.evaluate(() => {
          return document.querySelector('.container')!.innerHTML;
        });
        assert.strictEqual(content, 'Original<span>New content</span>');
      });
    });

    it('multiple operations', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="container">
            <div class="item">Item 1</div>
            <div class="item">Item 2</div>
          </div>
        `);

        // First operation: set style
        await manipulateDom.handler(
          {
            params: {
              action: 'set-style',
              selector: '.item',
              properties: { 'color': 'blue' },
            },
          },
          response,
          context,
        );

        // Second operation: add class
        response.resetResponseLineForTesting();
        await manipulateDom.handler(
          {
            params: {
              action: 'add-class',
              selector: '.container',
              className: 'processed',
            },
          },
          response,
          context,
        );

        // Third operation: insert HTML
        response.resetResponseLineForTesting();
        await manipulateDom.handler(
          {
            params: {
              action: 'insert-html',
              selector: '.container',
              html: '<div class="footer">Footer</div>',
              position: 'beforeend',
            },
          },
          response,
          context,
        );

        // Verify styles were applied
        const itemColor = await page.evaluate(() => {
          const el = document.querySelector('.item') as HTMLElement;
          return window.getComputedStyle(el).color;
        });
        assert.strictEqual(itemColor, 'rgb(0, 0, 255)');

        // Verify class was added
        const hasClass = await page.evaluate(() => {
          return document.querySelector('.container')!.classList.contains('processed');
        });
        assert.strictEqual(hasClass, true);

        // Verify HTML was inserted
        const hasFooter = await page.evaluate(() => {
          return document.querySelector('.footer') !== null;
        });
        assert.strictEqual(hasFooter, true);
      });
    });

    it('handles non-existent selectors gracefully', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="container">Test</div>
        `);

        await manipulateDom.handler(
          {
            params: {
              action: 'set-style',
              selector: '.non-existent',
              properties: { 'color': 'red' },
            },
          },
          response,
          context,
        );

        // Should not throw, and response should indicate no elements found
        assert(response.responseLines.length > 0);
      });
    });

    it('validates required parameters', async () => {
      await withMcpContext(async (response, context) => {
        await assert.rejects(
          async () => {
            await manipulateDom.handler(
              {
                params: {
                  action: 'set-style',
                  selector: '.test',
                  // Missing properties
                },
              },
              response,
              context,
            );
          },
          /set-style action requires properties parameter/,
        );
      });
    });

    it('supports array index notation for selecting nth element across parents', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        // Create a structure where items are nested in different parent rows
        // This simulates the dashboard grid scenario
        await page.setContent(html`
          <div class="dashboard-grid-row">
            <div class="dashboard-grid-item">Item 1</div>
            <div class="dashboard-grid-item">Item 2</div>
          </div>
          <div class="dashboard-grid-row">
            <div class="dashboard-grid-item">Item 3</div>
            <div class="dashboard-grid-item">Item 4</div>
          </div>
          <div class="dashboard-grid-row">
            <div class="dashboard-grid-item">Item 5</div>
            <div class="dashboard-grid-item">Item 6</div>
          </div>
        `);

        // Use array index notation to select the 4th item (index 3)
        await manipulateDom.handler(
          {
            params: {
              action: 'set-style',
              selector: '.dashboard-grid-item[3]',
              properties: {
                'color': 'red',
              },
            },
          },
          response,
          context,
        );

        // Verify the 4th item (Item 4) has the style applied
        const item4Color = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('.dashboard-grid-item'));
          const item4 = items[3] as HTMLElement;
          return window.getComputedStyle(item4).color;
        });
        assert.strictEqual(item4Color, 'rgb(255, 0, 0)');

        // Verify other items don't have the style
        const item1Color = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('.dashboard-grid-item'));
          const item1 = items[0] as HTMLElement;
          return window.getComputedStyle(item1).color;
        });
        assert.notStrictEqual(item1Color, 'rgb(255, 0, 0)');
      });
    });

    it('handles out of bounds array index gracefully', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="item">Item 1</div>
          <div class="item">Item 2</div>
        `);

        await manipulateDom.handler(
          {
            params: {
              action: 'set-style',
              selector: '.item[5]',
              properties: {
                'color': 'red',
              },
            },
          },
          response,
          context,
        );

        // Should not throw, and response should indicate index out of bounds
        assert(response.responseLines.length > 0);
        const responseText = response.responseLines.join('\n');
        assert(responseText.includes('out of bounds'));
      });
    });
  });

  describe('insert_css', () => {
    it('inserts CSS', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="test">Test</div>
        `);

        await insertCss.handler(
          {params: {mode: 'apply', cssText: '.test { color: red; }', replaceExisting: false}},
          response,
          context,
        );

        const color = await page.evaluate(() => {
          return window.getComputedStyle(document.querySelector('.test')!).color;
        });
        assert.strictEqual(color, 'rgb(255, 0, 0)');
      });
    });
  });

  describe('insert_js', () => {
    it('inserts JS', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div id="test">Test</div>
        `);

        await insertJs.handler(
          {
            params: {
              jsText: 'document.getElementById("test").textContent = "Changed";',
              replaceExisting: false,
            } as any,
          },
          response,
          context,
        );

        const text = await page.evaluate(() => {
          return document.getElementById('test')!.textContent;
        });
        assert.strictEqual(text, 'Changed');
      });
    });
  });

  describe('rollback_patch', () => {
    it('rolls back CSS patches', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(html`
          <div class="test">Test</div>
        `);

        // Insert CSS
        await insertCss.handler(
          {
            params: {
              mode: 'apply',
              cssText: '.test { color: red; }',
              patchId: 'test-patch',
              replaceExisting: false,
            },
          },
          response,
          context,
        );

        let color = await page.evaluate(() => {
          return window.getComputedStyle(document.querySelector('.test')!).color;
        });
        assert.strictEqual(color, 'rgb(255, 0, 0)');

        // Rollback
        response.resetResponseLineForTesting();
        await rollbackPatch.handler(
          {params: {patchId: 'test-patch'}},
          response,
          context,
        );

        color = await page.evaluate(() => {
          return window.getComputedStyle(document.querySelector('.test')!).color;
        });
        assert.notStrictEqual(color, 'rgb(255, 0, 0)');
      });
    });
  });
});
