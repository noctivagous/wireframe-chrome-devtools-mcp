/**
 * @license
 * Copyright 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {svgSnapshot, wireframeSnapshot} from '../../src/tools/wireframe.js';
import {html, withMcpContext} from '../utils.js';

describe('wireframe', () => {
  describe('wireframe_snapshot', () => {
    it('returns JSON output', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await wireframeSnapshot.handler({params: {}}, response, context);

        const text = response.responseLines.join('\n');
        assert.ok(text.includes('"schemaVersion": 2'));
        assert.ok(text.includes('"elements"'));
      });
    });
  });

  describe('svg_snapshot', () => {
    it('returns SVG content wrapped in JSON', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await svgSnapshot.handler(
          {
            params: {
              selectors: ['#a', '.b'],
              includeDescendants: true,
              showLabels: true,
              showDimensions: true,
              background: 'white',
            },
          },
          response,
          context,
        );

        // Check that JSON was appended to response
        const responseText = response.responseLines.join('\n');
        assert.ok(responseText.includes('```json'));
        assert.ok(responseText.includes('```'));

        // Extract JSON from between the code block markers
        const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
        assert.ok(jsonMatch);
        const result = JSON.parse(jsonMatch[1]);
        assert.equal(typeof result.svg, 'string');
        assert.ok(
          result.svg.startsWith('<?xml') || result.svg.startsWith('<svg'),
        );
        assert.ok(result.svg.includes('<svg'));
        assert.ok(result.svg.includes('<rect'));
        assert.ok(result.svg.includes('<text'));
        assert.ok(result.elementCount >= 2);
        assert.equal(result.truncated, false);
        assert.ok(result.viewport);
      });
    });
  });
});



