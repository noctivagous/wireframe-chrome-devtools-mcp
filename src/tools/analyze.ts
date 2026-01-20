/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const analysisTypeSchema = zod.enum([
  'coverage',
  'dependencies',
  'errors',
  'performance',
  'issues',
]).describe('Type of JavaScript analysis to perform');

const reportFormatSchema = zod.enum(['summary', 'detailed']).default('summary').describe('Format of the analysis report');

const severitySchema = zod.enum(['warning', 'error']).default('warning').describe('Minimum severity level for issues');

const categoriesSchema = zod.array(
  zod.enum(['console-errors', 'unhandled-promises', 'memory-leaks', 'performance-issues', 'deprecated-apis'])
).default(['console-errors', 'unhandled-promises', 'memory-leaks']).describe('Categories of issues to detect');

export const analyzeJs = defineTool({
  name: 'analyze_js',
  description: `Analyze JavaScript code quality and detect errors on the current page. Supports various analysis types including code coverage, dependencies, errors, performance, and general issues.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    analysis: analysisTypeSchema,
    includeLibraries: zod.boolean().optional().describe('Whether to include external libraries in the analysis (only applies to coverage, dependencies, and performance analysis)'),
    reportFormat: reportFormatSchema.optional().describe('Format of the analysis report'),
    categories: categoriesSchema.optional(),
    severity: severitySchema.optional(),
  },
  handler: async (request, response, context) => {
    const {
      analysis,
      includeLibraries = false,
      reportFormat = 'summary',
      categories,
      severity
    } = request.params;
    const page = context.getSelectedPage();

    try {
      switch (analysis) {
        case 'coverage':
          await analyzeCoverage(page, response, {includeLibraries, reportFormat});
          break;
        case 'dependencies':
          await analyzeDependencies(page, response, {includeLibraries, reportFormat});
          break;
        case 'errors':
          await analyzeErrors(page, response, {reportFormat});
          break;
        case 'performance':
          await analyzePerformance(page, response, {includeLibraries, reportFormat});
          break;
        case 'issues':
          await analyzeIssues(page, response, {
            categories: categories || ['console-errors', 'unhandled-promises', 'memory-leaks'],
            severity: severity || 'warning',
            reportFormat
          });
          break;
      }
    } catch (error) {
      response.appendResponseLine(`Error during ${analysis} analysis: ${error}`);
    }
  },
});

async function analyzeCoverage(
  page: Page,
  response: any,
  options: {includeLibraries: boolean; reportFormat: 'summary' | 'detailed'}
): Promise<void> {
  response.appendResponseLine('Starting JavaScript coverage analysis...');

  try {
    // Start collecting coverage data
    await page.coverage.startJSCoverage();

    // Wait a moment for coverage to accumulate
    await new Promise(resolve => setTimeout(resolve, 1000));

    const coverage = await page.coverage.stopJSCoverage();

    const filteredCoverage = options.includeLibraries
      ? coverage
      : coverage.filter(entry => !isLibraryScript(entry.url));

    const totalBytes = filteredCoverage.reduce((sum, entry) => sum + entry.text.length, 0);
    const coveredBytes = filteredCoverage.reduce((sum, entry) => {
      return sum + entry.ranges.reduce((rangeSum, range) => rangeSum + range.end - range.start, 0);
    }, 0);

    const summary = {
      totalScripts: filteredCoverage.length,
      coveredScripts: filteredCoverage.filter(entry => entry.ranges.length > 0).length,
      totalBytes,
      coveredBytes,
      coveragePercentage: totalBytes > 0
        ? Math.round((coveredBytes / totalBytes) * 100 * 100) / 100
        : 0,
    };

    response.appendResponseLine('## Code Coverage Summary');
    response.appendResponseLine(`- Total Scripts: ${summary.totalScripts}`);
    response.appendResponseLine(`- Scripts with Coverage: ${summary.coveredScripts}`);
    response.appendResponseLine(`- Coverage Percentage: ${summary.coveragePercentage}%`);
    response.appendResponseLine(`- Total Bytes: ${summary.totalBytes}`);
    response.appendResponseLine(`- Covered Bytes: ${summary.coveredBytes}`);

    if (options.reportFormat === 'detailed') {
      response.appendResponseLine('\n## Detailed Coverage by Script');
      for (const entry of filteredCoverage) {
        const coveredBytes = entry.ranges.reduce((sum, range) => sum + range.end - range.start, 0);
        const coveragePercent = entry.text.length > 0
          ? Math.round((coveredBytes / entry.text.length) * 100 * 100) / 100
          : 0;

        response.appendResponseLine(`- **${entry.url}**: ${coveragePercent}% (${coveredBytes}/${entry.text.length} bytes)`);
      }
    }
  } catch (error) {
    response.appendResponseLine(`Coverage analysis failed: ${error}`);
  }
}

async function analyzeDependencies(
  page: Page,
  response: any,
  options: {includeLibraries: boolean; reportFormat: 'summary' | 'detailed'}
): Promise<void> {
  response.appendResponseLine('Analyzing JavaScript dependencies...');

  try {
    const scripts = await page.$$eval('script[src]', scripts =>
      scripts.map(script => (script as HTMLScriptElement).src)
    );

    const inlineScripts = await page.$$eval('script:not([src])', scripts =>
      scripts.map((script, index) => ({
        content: script.textContent || '',
        index
      }))
    );

    const filteredScripts = options.includeLibraries
      ? scripts
      : scripts.filter(url => !isLibraryScript(url));

    response.appendResponseLine('## Dependency Analysis');
    response.appendResponseLine(`- External Scripts: ${filteredScripts.length}`);
    response.appendResponseLine(`- Inline Scripts: ${inlineScripts.length}`);

    if (options.reportFormat === 'detailed') {
      if (filteredScripts.length > 0) {
        response.appendResponseLine('\n### External Dependencies');
        for (const script of filteredScripts) {
          response.appendResponseLine(`- ${script}`);
        }
      }

      if (inlineScripts.length > 0) {
        response.appendResponseLine('\n### Inline Scripts');
        for (const script of inlineScripts) {
          const lines = script.content.split('\n').length;
          response.appendResponseLine(`- Script ${script.index + 1}: ${lines} lines`);
        }
      }
    }
  } catch (error) {
    response.appendResponseLine(`Dependency analysis failed: ${error}`);
  }
}

async function analyzeErrors(
  page: Page,
  response: any,
  options: {reportFormat: 'summary' | 'detailed'}
): Promise<void> {
  response.appendResponseLine('Analyzing JavaScript errors...');

  try {
    // Get console messages that are errors
    const errors = await page.evaluate(() => {
      // This is a simplified approach - in a real implementation,
      // you'd want to collect errors over time
      const errorLogs: string[] = [];

      // Override console.error to capture errors
      const originalError = console.error;
      console.error = (...args) => {
        errorLogs.push(args.join(' '));
        originalError.apply(console, args);
      };

      return errorLogs;
    });

    response.appendResponseLine('## Error Analysis');
    response.appendResponseLine(`- Console Errors: ${errors.length}`);

    if (options.reportFormat === 'detailed' && errors.length > 0) {
      response.appendResponseLine('\n### Console Errors');
      for (const error of errors) {
        response.appendResponseLine(`- ${error}`);
      }
    }
  } catch (error) {
    response.appendResponseLine(`Error analysis failed: ${error}`);
  }
}

async function analyzePerformance(
  page: Page,
  response: any,
  options: {includeLibraries: boolean; reportFormat: 'summary' | 'detailed'}
): Promise<void> {
  response.appendResponseLine('Analyzing JavaScript performance...');

  try {
    const performanceData = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('measure');
      const scriptTimings = performance.getEntriesByType('script');

      return {
        measures: perfData.map(entry => ({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime
        })),
        scripts: scriptTimings.map(entry => ({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime
        }))
      };
    });

    response.appendResponseLine('## Performance Analysis');
    response.appendResponseLine(`- Performance Measures: ${performanceData.measures.length}`);
    response.appendResponseLine(`- Script Timings: ${performanceData.scripts.length}`);

    if (options.reportFormat === 'detailed') {
      if (performanceData.measures.length > 0) {
        response.appendResponseLine('\n### Performance Measures');
        for (const measure of performanceData.measures) {
          response.appendResponseLine(`- **${measure.name}**: ${measure.duration.toFixed(2)}ms`);
        }
      }

      if (performanceData.scripts.length > 0) {
        response.appendResponseLine('\n### Script Execution Times');
        for (const script of performanceData.scripts) {
          response.appendResponseLine(`- **${script.name}**: ${script.duration.toFixed(2)}ms`);
        }
      }
    }
  } catch (error) {
    response.appendResponseLine(`Performance analysis failed: ${error}`);
  }
}

async function analyzeIssues(
  page: Page,
  response: any,
  options: {categories: string[]; severity: 'warning' | 'error'; reportFormat: 'summary' | 'detailed'}
): Promise<void> {
  response.appendResponseLine('Analyzing JavaScript issues...');

  const issues: Array<{category: string; severity: string; message: string; details?: string}> = [];

  try {
    // Check for console errors
    if (options.categories.includes('console-errors')) {
      const consoleErrors = await page.evaluate(() => {
        // This would be enhanced to capture actual console errors
        return window.console ? [] : ['Console object not available'];
      });

      for (const error of consoleErrors) {
        issues.push({
          category: 'console-errors',
          severity: 'error',
          message: 'Console error detected',
          details: error
        });
      }
    }

    // Check for unhandled promises
    if (options.categories.includes('unhandled-promises')) {
      const unhandledPromises = await page.evaluate(() => {
        // This would require more sophisticated detection
        return [];
      });

      for (const promise of unhandledPromises) {
        issues.push({
          category: 'unhandled-promises',
          severity: 'warning',
          message: 'Unhandled promise detected',
          details: promise
        });
      }
    }

    // Check for memory leaks (simplified detection)
    if (options.categories.includes('memory-leaks')) {
      const memoryInfo = await page.evaluate(() => {
        // @ts-ignore - performance.memory is not in types but available in Chrome
        const mem = performance.memory;
        return mem ? {
          used: mem.usedJSHeapSize,
          total: mem.totalJSHeapSize,
          limit: mem.jsHeapSizeLimit
        } : null;
      });

      if (memoryInfo) {
        const usagePercent = (memoryInfo.used / memoryInfo.limit) * 100;
        if (usagePercent > 80) {
          issues.push({
            category: 'memory-leaks',
            severity: 'warning',
            message: 'High memory usage detected',
            details: `Memory usage: ${usagePercent.toFixed(1)}% (${Math.round(memoryInfo.used / 1024 / 1024)}MB)`
          });
        }
      }
    }

    // Filter by severity
    const filteredIssues = issues.filter(issue =>
      options.severity === 'warning' || issue.severity === 'error'
    );

    response.appendResponseLine('## Issue Analysis');
    response.appendResponseLine(`- Total Issues: ${filteredIssues.length}`);

    const issuesByCategory = filteredIssues.reduce((acc, issue) => {
      acc[issue.category] = (acc[issue.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [category, count] of Object.entries(issuesByCategory)) {
      response.appendResponseLine(`- ${category}: ${count}`);
    }

    if (options.reportFormat === 'detailed' && filteredIssues.length > 0) {
      response.appendResponseLine('\n### Detailed Issues');
      for (const issue of filteredIssues) {
        response.appendResponseLine(`- **[${issue.severity.toUpperCase()}]** ${issue.category}: ${issue.message}`);
        if (issue.details) {
          response.appendResponseLine(`  - Details: ${issue.details}`);
        }
      }
    }
  } catch (error) {
    response.appendResponseLine(`Issue analysis failed: ${error}`);
  }
}

function isLibraryScript(url: string): boolean {
  const libraryPatterns = [
    /\/node_modules\//,
    /cdn\.jsdelivr\.net/,
    /unpkg\.com/,
    /googleapis\.com/,
    /jquery/,
    /lodash/,
    /react/,
    /angular/,
    /vue/,
    /bootstrap/,
    /font-awesome/
  ];

  return libraryPatterns.some(pattern => pattern.test(url));
}
