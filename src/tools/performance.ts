/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import zlib from 'node:zlib';

import {logger} from '../logger.js';
import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';
import type {InsightName} from '../trace-processing/parse.js';
import {
  getInsightOutput,
  getTraceSummary,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

const filePathSchema = zod
  .string()
  .optional()
  .describe(
    'The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).',
  );

export const startTrace = defineTool({
  name: 'performance_start_trace',
  description:
    'Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
    isOriginal: true,
  },
  schema: {
    reload: zod
      .boolean()
      .describe(
        'Determines if, once tracing has started, the page should be automatically reloaded.',
      ),
    autoStop: zod
      .boolean()
      .describe(
        'Determines if the trace recording should be automatically stopped.',
      ),
    filePath: filePathSchema,
  },
  handler: async (request, response, context) => {
    if (context.isRunningPerformanceTrace()) {
      response.appendResponseLine(
        'Error: a performance trace is already running. Use performance_stop_trace to stop it. Only one trace can be running at any given time.',
      );
      return;
    }
    context.setIsRunningPerformanceTrace(true);

    const page = context.getSelectedPage();
    const pageUrlForTracing = page.url();

    if (request.params.reload) {
      // Before starting the recording, navigate to about:blank to clear out any state.
      await page.goto('about:blank', {
        waitUntil: ['networkidle0'],
      });
    }

    // Keep in sync with the categories arrays in:
    // https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/panels/timeline/TimelineController.ts
    // https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-core/gather/gatherers/trace.js
    const categories = [
      '-*',
      'blink.console',
      'blink.user_timing',
      'devtools.timeline',
      'disabled-by-default-devtools.screenshot',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.invalidationTracking',
      'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-devtools.timeline.stack',
      'disabled-by-default-v8.cpu_profiler',
      'disabled-by-default-v8.cpu_profiler.hires',
      'latencyInfo',
      'loading',
      'disabled-by-default-lighthouse',
      'v8.execute',
      'v8',
    ];
    await page.tracing.start({
      categories,
    });

    if (request.params.reload) {
      await page.goto(pageUrlForTracing, {
        waitUntil: ['load'],
      });
    }

    if (request.params.autoStop) {
      await new Promise(resolve => setTimeout(resolve, 5_000));
      await stopTracingAndAppendOutput(
        page,
        response,
        context,
        request.params.filePath,
      );
    } else {
      response.appendResponseLine(
        `The performance trace is being recorded. Use performance_stop_trace to stop it.`,
      );
    }
  },
});

export const stopTrace = defineTool({
  name: 'performance_stop_trace',
  description:
    'Stops the active performance trace recording on the selected page.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
    isOriginal: true,
  },
  schema: {
    filePath: filePathSchema,
  },
  handler: async (request, response, context) => {
    if (!context.isRunningPerformanceTrace()) {
      return;
    }
    const page = context.getSelectedPage();
    await stopTracingAndAppendOutput(
      page,
      response,
      context,
      request.params.filePath,
    );
  },
});

export const analyzeInsight = defineTool({
  name: 'performance_analyze_insight',
  description:
    'Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
    isOriginal: true,
  },
  schema: {
    insightSetId: zod
      .string()
      .describe(
        'The id for the specific insight set. Only use the ids given in the "Available insight sets" list.',
      ),
    insightName: zod
      .string()
      .describe(
        'The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"',
      ),
  },
  handler: async (request, response, context) => {
    const lastRecording = context.recordedTraces().at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have Insights to analyze.',
      );
      return;
    }

    const insightOutput = getInsightOutput(
      lastRecording,
      request.params.insightSetId,
      request.params.insightName as InsightName,
    );
    if ('error' in insightOutput) {
      response.appendResponseLine(insightOutput.error);
      return;
    }

    response.appendResponseLine(insightOutput.output);
  },
});

export const monitorPerformance = defineTool({
  name: 'monitor_performance',
  description: 'Real-time performance monitoring with metrics like FPS, memory usage, and DOM node count. Supports duration-based monitoring and trigger-based monitoring.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    metrics: zod
      .array(
        zod.enum(['fps', 'memory', 'dom-nodes', 'layout-shifts', 'network-requests'])
      )
      .default(['fps', 'memory', 'dom-nodes'])
      .describe(
        'Performance metrics to monitor. Available: fps, memory, dom-nodes, layout-shifts, network-requests.',
      ),
    duration: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Duration in milliseconds to monitor performance. If not specified, monitors until manually stopped.',
      ),
    trigger: zod
      .enum(['scroll', 'click', 'navigation', 'input'])
      .optional()
      .describe(
        'Event that triggers the start of monitoring. If specified, monitoring begins when this event occurs.',
      ),
    interval: zod
      .number()
      .int()
      .min(100)
      .max(10000)
      .optional()
      .describe(
        'Interval in milliseconds between performance measurements. Default: 1000ms.',
      ),
    customMarks: zod
      .array(
        zod.object({
          name: zod.string().describe('Name of the performance mark'),
          position: zod.enum(['before-script', 'after-script']).describe('When to place the mark relative to script execution'),
        })
      )
      .optional()
      .describe(
        'Custom performance marks to record during monitoring.',
      ),
    script: zod
      .string()
      .optional()
      .describe(
        'Optional JavaScript code to execute during monitoring. Performance marks will be placed around this script.',
      ),
  },
  handler: async (request, response, context) => {
    const { metrics, duration, trigger, interval, customMarks, script } = request.params;
    const page = context.getSelectedPage();

    try {
      // Setup performance monitoring script
      const monitoringScript = `
        (function() {
          if (window.__performanceMonitor) {
            window.__performanceMonitor.stop();
          }

          const monitor = {
            isRunning: false,
            measurements: [],
            startTime: null,
            intervalId: null,
            marks: [],

            start() {
              if (this.isRunning) return;
              this.isRunning = true;
              this.startTime = performance.now();
              this.measurements = [];

              this.intervalId = setInterval(() => {
                this.takeMeasurement();
              }, ${interval});

              console.log('Performance monitoring started');
            },

            stop() {
              if (!this.isRunning) return;
              this.isRunning = false;

              if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
              }

              this.takeMeasurement(); // Final measurement
              console.log('Performance monitoring stopped');
              return this.getSummary();
            },

            takeMeasurement() {
              const now = performance.now();
              const measurement = {
                timestamp: now,
                relativeTime: now - this.startTime,
                metrics: {}
              };

              ${metrics.includes('fps') ? `
              // FPS calculation using requestAnimationFrame
              if (!this.lastFrameTime) {
                this.lastFrameTime = now;
                this.frameCount = 0;
              }
              this.frameCount++;
              if (now - this.lastFrameTime >= 1000) {
                measurement.metrics.fps = Math.round((this.frameCount * 1000) / (now - this.lastFrameTime));
                this.frameCount = 0;
                this.lastFrameTime = now;
              }` : ''}

              ${metrics.includes('memory') ? `
              if (performance.memory) {
                measurement.metrics.memory = {
                  used: performance.memory.usedJSHeapSize,
                  total: performance.memory.totalJSHeapSize,
                  limit: performance.memory.jsHeapSizeLimit
                };
              }` : ''}

              ${metrics.includes('dom-nodes') ? `
              measurement.metrics.domNodes = document.getElementsByTagName('*').length;` : ''}

              ${metrics.includes('layout-shifts') ? `
              if (!this.cumulativeLayoutShift) {
                this.cumulativeLayoutShift = 0;
                const observer = new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) {
                      this.cumulativeLayoutShift += entry.value;
                    }
                  }
                });
                observer.observe({entryTypes: ['layout-shift']});
              }
              measurement.metrics.layoutShifts = this.cumulativeLayoutShift;` : ''}

              ${metrics.includes('network-requests') ? `
              if (!this.networkObserver) {
                this.networkRequests = { sent: 0, received: 0, failed: 0 };
                this.networkObserver = new PerformanceObserver((list) => {
                  for (const entry of list.getEntries()) {
                    if (entry.entryType === 'resource') {
                      this.networkRequests.received++;
                    }
                  }
                });
                this.networkObserver.observe({entryTypes: ['resource']});
              }
              measurement.metrics.networkRequests = { ...this.networkRequests };` : ''}

              this.measurements.push(measurement);
            },

            addMark(name) {
              performance.mark(name);
              this.marks.push({
                name,
                timestamp: performance.now()
              });
            },

            getSummary() {
              const endTime = performance.now();
              const duration = endTime - this.startTime;

              const summary = {
                duration,
                measurements: this.measurements,
                marks: this.marks,
                averages: {},
                peaks: {}
              };

              // Calculate averages and peaks
              const metricKeys = ['fps', 'domNodes', 'layoutShifts'];
              const memoryKeys = ['used', 'total', 'limit'];

              metricKeys.forEach(key => {
                const values = this.measurements
                  .map(m => m.metrics[key])
                  .filter(v => v !== undefined);

                if (values.length > 0) {
                  summary.averages[key] = values.reduce((a, b) => a + b, 0) / values.length;
                  summary.peaks[key] = Math.max(...values);
                }
              });

              if (this.measurements.some(m => m.metrics.memory)) {
                summary.averages.memory = {};
                summary.peaks.memory = {};

                memoryKeys.forEach(key => {
                  const values = this.measurements
                    .map(m => m.metrics.memory?.[key])
                    .filter(v => v !== undefined);

                  if (values.length > 0) {
                    summary.averages.memory[key] = values.reduce((a, b) => a + b, 0) / values.length;
                    summary.peaks.memory[key] = Math.max(...values);
                  }
                });
              }

              return summary;
            }
          };

          window.__performanceMonitor = monitor;
          return monitor;
        })()
      `;

      // Inject monitoring script
      await page.evaluate(monitoringScript);

      // Setup event triggers if specified
      if (trigger) {
        const triggerScript = `
          (function() {
            const triggerHandler = () => {
              if (window.__performanceMonitor && !window.__performanceMonitor.isRunning) {
                window.__performanceMonitor.start();
              }
            };

            document.addEventListener('${trigger}', triggerHandler, { once: true });
          })()
        `;
        await page.evaluate(triggerScript);
        response.appendResponseLine(`Performance monitoring will start on ${trigger} event.`);
      }

      // Add custom performance marks if specified
      if (customMarks && customMarks.length > 0) {
        for (const mark of customMarks) {
          if (mark.position === 'before-script') {
            await page.evaluate(`window.__performanceMonitor.addMark('${mark.name}')`);
          }
        }
      }

      // Execute custom script if provided
      if (script) {
        await page.evaluate(script);
      }

      // Add marks after script execution
      if (customMarks && customMarks.length > 0) {
        for (const mark of customMarks) {
          if (mark.position === 'after-script') {
            await page.evaluate(`window.__performanceMonitor.addMark('${mark.name}')`);
          }
        }
      }

      // Start monitoring
      if (!trigger) {
        await page.evaluate('window.__performanceMonitor.start()');
        response.appendResponseLine('Performance monitoring started.');
      }

      // Handle duration-based monitoring
      if (duration) {
        await new Promise(resolve => setTimeout(resolve, duration));

        const summary = await page.evaluate('window.__performanceMonitor.stop()');

        response.appendResponseLine('Performance monitoring completed:');
        response.appendResponseLine('```json');
        response.appendResponseLine(JSON.stringify(summary, null, 2));
        response.appendResponseLine('```');

        // Cleanup
        await page.evaluate('delete window.__performanceMonitor');
      } else if (!trigger) {
        response.appendResponseLine(`Monitoring for ${metrics.join(', ')} metrics every ${interval}ms.`);
        response.appendResponseLine('Use monitor_performance again with duration to stop and get results.');
      }

    } catch (e) {
      const errorText = e instanceof Error ? e.message : JSON.stringify(e);
      response.appendResponseLine('An error occurred while setting up performance monitoring:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine(errorText);
      response.appendResponseLine('```');
    }
  },
});

async function stopTracingAndAppendOutput(
  page: Page,
  response: Response,
  context: Context,
  filePath?: string,
): Promise<void> {
  try {
    const traceEventsBuffer = await page.tracing.stop();
    if (filePath && traceEventsBuffer) {
      let dataToWrite: Uint8Array = traceEventsBuffer;
      if (filePath.endsWith('.gz')) {
        dataToWrite = await new Promise((resolve, reject) => {
          zlib.gzip(traceEventsBuffer, (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
        });
      }
      const file = await context.saveFile(dataToWrite, filePath);
      response.appendResponseLine(
        `The raw trace data was saved to ${file.filename}.`,
      );
    }
    const result = await parseRawTraceBuffer(traceEventsBuffer);
    response.appendResponseLine('The performance trace has been stopped.');
    if (traceResultIsSuccess(result)) {
      context.storeTraceRecording(result);
      const traceSummaryText = getTraceSummary(result);
      response.appendResponseLine(traceSummaryText);
    } else {
      response.appendResponseLine(
        'There was an unexpected error parsing the trace:',
      );
      response.appendResponseLine(result.error);
    }
  } catch (e) {
    const errorText = e instanceof Error ? e.message : JSON.stringify(e);
    logger(`Error stopping performance trace: ${errorText}`);
    response.appendResponseLine(
      'An error occurred generating the response for this trace:',
    );
    response.appendResponseLine(errorText);
  } finally {
    context.setIsRunningPerformanceTrace(false);
  }
}
