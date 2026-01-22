/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {inspectState} from '../../src/tools/state.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

const server = serverHooks();

describe('state', () => {
  describe('inspect_state', () => {
    it('inspects localStorage', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        // Set up some localStorage data
        await page.evaluate(() => {
          localStorage.setItem('testKey', 'testValue');
          localStorage.setItem('todoCount', '5');
          localStorage.setItem('userSettings', JSON.stringify({theme: 'dark', lang: 'en'}));
        });

        await inspectState.handler(
          {
            params: {
              targets: ['localStorage'],
              includeValues: true,
              maxItems: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.localStorage);
        assert.strictEqual(result.localStorage.testKey, 'testValue');
        assert.strictEqual(result.localStorage.todoCount, 5); // Should be parsed as number
        assert.deepEqual(result.localStorage.userSettings, {theme: 'dark', lang: 'en'});
      });
    });

    it('inspects sessionStorage', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        // Set up some sessionStorage data
        await page.evaluate(() => {
          sessionStorage.setItem('sessionKey', 'sessionValue');
          sessionStorage.setItem('tempData', JSON.stringify([1, 2, 3]));
        });

        await inspectState.handler(
          {
            params: {
              targets: ['sessionStorage'],
              includeValues: true,
              maxItems: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.sessionStorage);
        assert.strictEqual(result.sessionStorage.sessionKey, 'sessionValue');
        assert.deepEqual(result.sessionStorage.tempData, [1, 2, 3]);
      });
    });

    it('inspects global variables', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        // Set up some global variables
        await page.evaluate(() => {
          (window as any).myApp = {version: '1.0.0', config: {debug: true}};
          (window as any).todoState = ['item1', 'item2'];
          (window as any).counter = 42;
        });

        await inspectState.handler(
          {
            params: {
              targets: ['global-variables'],
              filter: 'todo*|counter|myApp',
              includeValues: true,
              maxItems: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.globalVariables);
        assert.deepEqual(result.globalVariables.myApp, {version: '1.0.0', config: {debug: true}});
        assert.deepEqual(result.globalVariables.todoState, ['item1', 'item2']);
        assert.strictEqual(result.globalVariables.counter, 42);
      });
    });

    it('applies filtering correctly', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        // Set up mixed data
        await page.evaluate(() => {
          localStorage.setItem('todoItem1', 'value1');
          localStorage.setItem('todoItem2', 'value2');
          localStorage.setItem('otherItem', 'value3');
          sessionStorage.setItem('todoTemp', 'tempValue');
          sessionStorage.setItem('otherTemp', 'otherValue');
        });

        await inspectState.handler(
          {
            params: {
              targets: ['localStorage', 'sessionStorage'],
              filter: 'todo*',
              includeValues: true,
              maxItems: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.localStorage);
        assert(result.sessionStorage);

        // Should only include items matching 'todo*'
        assert('todoItem1' in result.localStorage);
        assert('todoItem2' in result.localStorage);
        assert(!('otherItem' in result.localStorage));
        assert('todoTemp' in result.sessionStorage);
        assert(!('otherTemp' in result.sessionStorage));
      });
    });

    it('respects maxItems limit', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        // Set up many items
        await page.evaluate(() => {
          for (let i = 0; i < 10; i++) {
            localStorage.setItem(`item${i}`, `value${i}`);
          }
        });

        await inspectState.handler(
          {
            params: {
              targets: ['localStorage'],
              includeValues: true,
              maxItems: 3,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.localStorage);
        assert(Object.keys(result.localStorage).length <= 3);
      });
    });

    it('excludes values when includeValues is false', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        await page.evaluate(() => {
          localStorage.setItem('testKey', 'secretValue');
        });

        await inspectState.handler(
          {
            params: {
              targets: ['localStorage'],
              includeValues: false,
              maxItems: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.localStorage);
        assert.strictEqual(result.localStorage.testKey, '[value excluded]');
      });
    });

    it('handles framework component inspection validation', async () => {
      await withMcpContext(async (response, context) => {
        // Test missing framework parameter
        await assert.rejects(
          inspectState.handler(
            {
              params: {
                targets: ['framework-components'],
                componentSelector: '.component',
                inspect: ['props'],
                includeValues: true,
                maxItems: 10,
              },
            },
            response,
            context,
          ),
          /framework parameter is required/
        );

        // Test missing componentSelector parameter
        await assert.rejects(
          inspectState.handler(
            {
              params: {
                targets: ['framework-components'],
                framework: 'react',
                inspect: ['props'],
                includeValues: true,
                maxItems: 10,
              },
            },
            response,
            context,
          ),
          /componentSelector parameter is required/
        );

        // Test missing inspect parameter
        await assert.rejects(
          inspectState.handler(
            {
              params: {
                targets: ['framework-components'],
                framework: 'react',
                componentSelector: '.component',
                includeValues: true,
                maxItems: 10,
              },
            },
            response,
            context,
          ),
          /inspect parameter is required/
        );
      });
    });

    it('handles multiple targets', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        server.addHtmlRoute('/state', html`<main>state</main>`);
        await page.goto(server.getRoute('/state'));

        // Set up data for multiple targets
        await page.evaluate(() => {
          localStorage.setItem('test', 'value');
          sessionStorage.setItem('session', 'data');
          (window as any).globalVar = 'test';
        });

        await inspectState.handler(
          {
            params: {
              targets: ['localStorage', 'sessionStorage', 'global-variables'],
              includeValues: true,
              maxItems: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const result = JSON.parse(responseText.split('```json')[1].split('```')[0]);

        assert(result.localStorage);
        assert(result.sessionStorage);
        assert(result.globalVariables);
      });
    });
  });
});
