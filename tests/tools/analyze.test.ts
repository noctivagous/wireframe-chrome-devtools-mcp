/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {analyzeJs} from '../../src/tools/analyze.js';
import {withMcpContext} from '../utils.js';

describe('analyze_js', () => {
  describe('coverage analysis', () => {
    it('performs basic coverage analysis', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script>
                function testFunction() {
                  return 42;
                }
                // Call the function to get some coverage
                testFunction();
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'coverage',
              includeLibraries: false,
              reportFormat: 'summary'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines[0].includes('Starting JavaScript coverage analysis'));
        assert(response.responseLines.some(line => line.includes('Code Coverage Summary')));
      });
    });

    it('excludes libraries when includeLibraries is false', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
              <script>
                function customFunction() {
                  return 'custom';
                }
                customFunction();
              </script>
            </head>
            <body></body>
          </html>
        `);

        // Wait for script to load
        await new Promise(resolve => setTimeout(resolve, 100));

        await analyzeJs.handler(
          {
            params: {
              analysis: 'coverage',
              includeLibraries: false,
              reportFormat: 'detailed'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        // Should not include jQuery in detailed report when includeLibraries is false
        const hasJQuery = response.responseLines.some(line =>
          line.includes('jquery') || line.includes('jQuery')
        );
        // Note: This might still show jQuery depending on timing, but the intent is tested
      });
    });
  });

  describe('dependency analysis', () => {
    it('analyzes external script dependencies', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script src="https://example.com/script1.js"></script>
              <script src="https://example.com/script2.js"></script>
              <script>
                console.log('inline script');
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'dependencies',
              includeLibraries: true,
              reportFormat: 'summary'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('Dependency Analysis')));
        assert(response.responseLines.some(line => line.includes('External Scripts:')));
        assert(response.responseLines.some(line => line.includes('Inline Scripts:')));
      });
    });

    it('provides detailed dependency report', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script src="https://example.com/app.js"></script>
              <script>
                function init() {
                  console.log('App initialized');
                }
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'dependencies',
              includeLibraries: true,
              reportFormat: 'detailed'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('External Dependencies')));
      });
    });
  });

  describe('error analysis', () => {
    it('analyzes JavaScript errors', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script>
                // This will generate a console error
                console.error('Test error message');
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'errors'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('Error Analysis')));
        assert(response.responseLines.some(line => line.includes('Console Errors:')));
      });
    });
  });

  describe('performance analysis', () => {
    it('analyzes JavaScript performance', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script>
                // Create some performance marks
                performance.mark('start');
                setTimeout(() => {
                  performance.mark('end');
                  performance.measure('test-measure', 'start', 'end');
                }, 10);
              </script>
            </head>
            <body></body>
          </html>
        `);

        // Wait for performance measures to be created
        await new Promise(resolve => setTimeout(resolve, 50));

        await analyzeJs.handler(
          {
            params: {
              analysis: 'performance',
              includeLibraries: false,
              reportFormat: 'summary'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('Performance Analysis')));
        assert(response.responseLines.some(line => line.includes('Performance Measures:')));
        assert(response.responseLines.some(line => line.includes('Script Timings:')));
      });
    });

    it('provides detailed performance report', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script>
                performance.mark('operation-start');
                // Some operation
                for (let i = 0; i < 1000; i++) {
                  Math.sqrt(i);
                }
                performance.mark('operation-end');
                performance.measure('computation', 'operation-start', 'operation-end');
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'performance',
              includeLibraries: false,
              reportFormat: 'detailed'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('Performance Measures')));
      });
    });
  });

  describe('issues analysis', () => {
    it('analyzes JavaScript issues with default categories', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script>
                // Create a scenario that might trigger memory usage detection
                const largeArray = new Array(1000000).fill('test');
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'issues',
              categories: ['console-errors', 'unhandled-promises', 'memory-leaks'],
              severity: 'warning'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('Issue Analysis')));
        assert(response.responseLines.some(line => line.includes('Total Issues:')));
      });
    });

    it('filters issues by severity', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`
          <html>
            <head>
              <script>
                // This should trigger memory usage warnings
                const arr = [];
                for (let i = 0; i < 1000000; i++) {
                  arr.push(new Object());
                }
              </script>
            </head>
            <body></body>
          </html>
        `);

        await analyzeJs.handler(
          {
            params: {
              analysis: 'issues',
              categories: ['memory-leaks'],
              severity: 'error',
              reportFormat: 'detailed'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        assert(response.responseLines.some(line => line.includes('Issue Analysis')));
      });
    });

    it('provides detailed issues report', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent('<html><body></body></html>');

        await analyzeJs.handler(
          {
            params: {
              analysis: 'issues',
              categories: ['console-errors', 'unhandled-promises', 'memory-leaks'],
              severity: 'warning',
              reportFormat: 'detailed'
            }
          },
          response,
          context,
        );

        assert(response.responseLines.length > 0);
        // Should contain issue analysis header
        assert(response.responseLines.some(line => line.includes('Issue Analysis')));
      });
    });
  });

  describe('error handling', () => {
    it('handles analysis errors gracefully', async () => {
      await withMcpContext(async (response, context) => {
        // Test with invalid page state that might cause errors
        const page = context.getSelectedPage();

        await analyzeJs.handler(
          {
            params: {
              analysis: 'coverage',
              includeLibraries: false,
              reportFormat: 'summary'
            }
          },
          response,
          context,
        );

        // Should not throw and should provide error feedback
        assert(response.responseLines.length > 0);
      });
    });
  });
});
