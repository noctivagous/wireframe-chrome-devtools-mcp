/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const FrameworkTypeSchema = zod.enum(['react', 'vue', 'angular', 'svelte']);
type FrameworkType = zod.infer<typeof FrameworkTypeSchema>;

const InspectTargetSchema = zod.enum(['localStorage', 'sessionStorage', 'global-variables', 'framework-components']);
type InspectTarget = zod.infer<typeof InspectTargetSchema>;

const FrameworkInspectTypeSchema = zod.enum(['props', 'state', 'hooks', 'data', 'computed', 'methods']);
type FrameworkInspectType = zod.infer<typeof FrameworkInspectTypeSchema>;

export const inspectState = defineTool({
  name: 'inspect_state',
  description: `Inspect application state including browser storage, global variables, and framework-specific component state.
Supports filtering by patterns and framework-specific inspection for React, Vue, Angular, and Svelte components.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    targets: zod
      .array(InspectTargetSchema)
      .min(1)
      .describe('Types of state to inspect. Can include browser storage, global variables, or framework components.'),
    filter: zod
      .string()
      .optional()
      .describe('Pattern to filter results (supports wildcards like "todo*"). Applies to keys/names in storage and global variables.'),
    includeValues: zod
      .boolean()
      .default(true)
      .describe('Whether to include actual values in the response. Set to false for large datasets.'),
    maxItems: zod
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe('Maximum number of items to return per target type.'),
    framework: FrameworkTypeSchema
      .optional()
      .describe('Framework type for component inspection. Required when inspecting framework components.'),
    componentSelector: zod
      .string()
      .optional()
      .describe('CSS selector to find components to inspect. Required when framework is specified.'),
    inspect: zod
      .array(FrameworkInspectTypeSchema)
      .optional()
      .describe('What to inspect in framework components (props, state, hooks, etc.). Required when framework is specified.'),
  },
  handler: async (request, response, context) => {
    const {
      targets,
      filter,
      includeValues = true,
      maxItems = 100,
      framework,
      componentSelector,
      inspect,
    } = request.params;

    const page = context.getSelectedPage();
    const results: Record<string, any> = {};

    // Validate framework-specific parameters
    if (targets.includes('framework-components')) {
      if (!framework) {
        throw new Error('framework parameter is required when inspecting framework components');
      }
      if (!componentSelector) {
        throw new Error('componentSelector parameter is required when inspecting framework components');
      }
      if (!inspect || inspect.length === 0) {
        throw new Error('inspect parameter is required when inspecting framework components');
      }
    }

    // Create filter regex if provided
    const filterRegex = filter ? new RegExp(filter.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;

    // Inspect each target
    for (const target of targets) {
      try {
        switch (target) {
          case 'localStorage':
            results.localStorage = await inspectLocalStorage(page, filterRegex, includeValues, maxItems);
            break;
          case 'sessionStorage':
            results.sessionStorage = await inspectSessionStorage(page, filterRegex, includeValues, maxItems);
            break;
          case 'global-variables':
            results.globalVariables = await inspectGlobalVariables(page, filterRegex, includeValues, maxItems);
            break;
          case 'framework-components':
            results.frameworkComponents = await inspectFrameworkComponents(
              page,
              framework!,
              componentSelector!,
              inspect!,
              includeValues,
              maxItems
            );
            break;
        }
      } catch (error) {
        results[target] = { error: `Failed to inspect ${target}: ${error.message}` };
      }
    }

    response.appendResponseLine('State inspection results:');
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(results, null, 2));
    response.appendResponseLine('```');
  },
});

async function inspectLocalStorage(
  page: Page,
  filterRegex: RegExp | null,
  includeValues: boolean,
  maxItems: number
): Promise<Record<string, any>> {
  return await page.evaluate(
    ({ filterRegex, includeValues, maxItems }) => {
      const result: Record<string, any> = {};
      try {
        for (let i = 0; i < localStorage.length && Object.keys(result).length < maxItems; i++) {
          const key = localStorage.key(i);
          if (key && (!filterRegex || filterRegex.test(key))) {
            if (includeValues) {
              try {
                result[key] = JSON.parse(localStorage.getItem(key) || 'null');
              } catch {
                result[key] = localStorage.getItem(key);
              }
            } else {
              result[key] = '[value excluded]';
            }
          }
        }
      } catch (error) {
        result.error = `Failed to access localStorage: ${error.message}`;
      }
      return result;
    },
    { filterRegex, includeValues, maxItems }
  );
}

async function inspectSessionStorage(
  page: Page,
  filterRegex: RegExp | null,
  includeValues: boolean,
  maxItems: number
): Promise<Record<string, any>> {
  return await page.evaluate(
    ({ filterRegex, includeValues, maxItems }) => {
      const result: Record<string, any> = {};
      try {
        for (let i = 0; i < sessionStorage.length && Object.keys(result).length < maxItems; i++) {
          const key = sessionStorage.key(i);
          if (key && (!filterRegex || filterRegex.test(key))) {
            if (includeValues) {
              try {
                result[key] = JSON.parse(sessionStorage.getItem(key) || 'null');
              } catch {
                result[key] = sessionStorage.getItem(key);
              }
            } else {
              result[key] = '[value excluded]';
            }
          }
        }
      } catch (error) {
        result.error = `Failed to access sessionStorage: ${error.message}`;
      }
      return result;
    },
    { filterRegex, includeValues, maxItems }
  );
}

async function inspectGlobalVariables(
  page: Page,
  filterRegex: RegExp | null,
  includeValues: boolean,
  maxItems: number
): Promise<Record<string, any>> {
  return await page.evaluate(
    ({ filterRegex, includeValues, maxItems }) => {
      const result: Record<string, any> = {};
      try {
        // Get all global properties
        const globals = Object.getOwnPropertyNames(window);

        for (const prop of globals) {
          if (Object.keys(result).length >= maxItems) {break;}

          // Skip common browser globals and internal properties
          if (
            prop.startsWith('_') ||
            ['window', 'document', 'console', 'location', 'navigator', 'history', 'screen'].includes(prop) ||
            (!filterRegex || filterRegex.test(prop))
          ) {
            try {
              const value = (window as any)[prop];
              const type = typeof value;

              if (includeValues) {
                if (type === 'function') {
                  result[prop] = '[function]';
                } else if (type === 'object' && value !== null) {
                  result[prop] = `[${value.constructor?.name || 'Object'}]`;
                } else {
                  result[prop] = value;
                }
              } else {
                result[prop] = `[${type}]`;
              }
            } catch {
              result[prop] = '[inaccessible]';
            }
          }
        }
      } catch (error) {
        result.error = `Failed to inspect global variables: ${error.message}`;
      }
      return result;
    },
    { filterRegex, includeValues, maxItems }
  );
}

async function inspectFrameworkComponents(
  page: Page,
  framework: FrameworkType,
  componentSelector: string,
  inspect: FrameworkInspectType[],
  includeValues: boolean,
  maxItems: number
): Promise<any[]> {
  return await page.evaluate(
    ({ framework, componentSelector, inspect, includeValues, maxItems }) => {
      const results: any[] = [];

      try {
        const elements = document.querySelectorAll(componentSelector);
        const elementsArray = Array.from(elements).slice(0, maxItems);

        for (const element of elementsArray) {
          const componentData: any = {
            selector: componentSelector,
            elementTag: element.tagName.toLowerCase(),
            elementId: element.id || undefined,
            elementClasses: element.className ? element.className.split(' ').filter(Boolean) : [],
          };

          try {
            switch (framework) {
              case 'react':
                componentData.react = inspectReactComponent(element, inspect, includeValues);
                break;
              case 'vue':
                componentData.vue = inspectVueComponent(element, inspect, includeValues);
                break;
              case 'angular':
                componentData.angular = inspectAngularComponent(element, inspect, includeValues);
                break;
              case 'svelte':
                componentData.svelte = inspectSvelteComponent(element, inspect, includeValues);
                break;
            }
          } catch (error) {
            componentData.error = `Failed to inspect ${framework} component: ${error.message}`;
          }

          results.push(componentData);
        }
      } catch (error) {
        results.push({ error: `Failed to find components with selector "${componentSelector}": ${error.message}` });
      }

      return results;
    },
    { framework, componentSelector, inspect, includeValues, maxItems }
  );
}

function inspectReactComponent(
  element: Element,
  inspect: FrameworkInspectType[],
  includeValues: boolean
): Record<string, any> {
  const result: Record<string, any> = {};

  try {
    // Check if React devtools are available
    const reactInternals = (window as any).React || (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;

    if (!reactInternals) {
      result.warning = 'React devtools not detected. Component inspection may be limited.';
    }

    // Try to get React fiber node
    const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
    const internalKey = Object.keys(element).find(key => key.startsWith('__reactInternalInstance$'));

    if (fiberKey) {
      const fiber = (element as any)[fiberKey];
      if (fiber) {
        if (inspect.includes('props') && fiber.memoizedProps) {
          result.props = includeValues ? fiber.memoizedProps : Object.keys(fiber.memoizedProps);
        }
        if (inspect.includes('state') && fiber.memoizedState) {
          result.state = includeValues ? fiber.memoizedState : Object.keys(fiber.memoizedState);
        }
        if (inspect.includes('hooks') && fiber._debugHookTypes) {
          result.hooks = includeValues ? fiber._debugHookTypes : fiber._debugHookTypes.map((h: any) => h.name || 'unknown');
        }
      }
    } else if (internalKey) {
      // Legacy React
      const internal = (element as any)[internalKey];
      if (internal && internal._currentElement) {
        result.legacyReact = 'Legacy React detected - full inspection not available';
      }
    }

    // Try to detect component name
    const key = fiberKey || internalKey;
    if (key) {
      const fiber = (element as any)[key];
      if (fiber) {
        result.componentName = fiber.type?.name || fiber.type?.displayName || 'Anonymous';
      }
    }
  } catch (error) {
    result.error = `React inspection failed: ${error.message}`;
  }

  return result;
}

function inspectVueComponent(
  element: Element,
  inspect: FrameworkInspectType[],
  includeValues: boolean
): Record<string, any> {
  const result: Record<string, any> = {};

  try {
    // Vue components usually have __vue__ property
    const vueInstance = (element as any).__vue__;

    if (!vueInstance) {
      result.warning = 'Vue component not found on this element';
      return result;
    }

    result.componentName = vueInstance.$options?.name || vueInstance.constructor?.name || 'Anonymous';

    if (inspect.includes('data') && vueInstance.$data) {
      result.data = includeValues ? vueInstance.$data : Object.keys(vueInstance.$data);
    }
    if (inspect.includes('computed') && vueInstance.$options?.computed) {
      result.computed = includeValues ?
        Object.keys(vueInstance.$options.computed).reduce((acc, key) => {
          acc[key] = vueInstance[key];
          return acc;
        }, {} as Record<string, any>) :
        Object.keys(vueInstance.$options.computed);
    }
    if (inspect.includes('methods') && vueInstance.$options?.methods) {
      result.methods = Object.keys(vueInstance.$options.methods);
    }
    if (inspect.includes('props') && vueInstance.$props) {
      result.props = includeValues ? vueInstance.$props : Object.keys(vueInstance.$props);
    }
  } catch (error) {
    result.error = `Vue inspection failed: ${error.message}`;
  }

  return result;
}

function inspectAngularComponent(
  element: Element,
  inspect: FrameworkInspectType[],
  includeValues: boolean
): Record<string, any> {
  const result: Record<string, any> = {};

  try {
    // Angular components may have __ngContext__ or be stored in injector
    const ngContext = (element as any).__ngContext__;

    if (!ngContext) {
      result.warning = 'Angular component context not found on this element';
      return result;
    }

    // This is a simplified inspection - full Angular inspection would require
    // more complex debugging API access
    result.componentFound = true;
    result.contextKeys = Object.keys(ngContext);

    if (inspect.includes('props')) {
      // Try to extract component inputs
      const inputs = ngContext[0]?._tNode?.inputs;
      if (inputs) {
        result.inputs = includeValues ? inputs : Object.keys(inputs);
      }
    }

    // Component instance might be available through debug API
    if (inspect.includes('state') && ngContext[0]?._lView) {
      result.hasComponentInstance = true;
    }
  } catch (error) {
    result.error = `Angular inspection failed: ${error.message}`;
  }

  return result;
}

function inspectSvelteComponent(
  element: Element,
  inspect: FrameworkInspectType[],
  includeValues: boolean
): Record<string, any> {
  const result: Record<string, any> = {};

  try {
    // Svelte components may have $$ properties
    const svelteProps = Object.keys(element).filter(key => key.startsWith('$$'));

    if (svelteProps.length === 0) {
      result.warning = 'Svelte component properties not found on this element';
      return result;
    }

    result.svelteProps = svelteProps;

    // Try to access component state
    if (inspect.includes('state')) {
      const ctx = (element as any).$$?.ctx;
      if (ctx) {
        result.state = includeValues ? ctx : Object.keys(ctx);
      }
    }

    if (inspect.includes('props')) {
      const props = (element as any).$$?.props;
      if (props) {
        result.props = includeValues ? props : Object.keys(props);
      }
    }
  } catch (error) {
    result.error = `Svelte inspection failed: ${error.message}`;
  }

  return result;
}
