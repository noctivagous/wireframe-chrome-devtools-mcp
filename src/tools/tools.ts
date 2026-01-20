/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {analyzeJs} from './analyze.js';
import * as consoleTools from './console.js';
import * as emulationTools from './emulation.js';
import * as extensionTools from './extensions.js';
import * as inputTools from './input.js';
import * as mutationTools from './mutation.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as snapshotTools from './snapshot.js';
import * as stateTools from './state.js';
import type {ToolDefinition} from './ToolDefinition.js';
import {wireframeSnapshot, svgSnapshot} from './wireframe.js';

const tools = [
  analyzeJs,
  ...Object.values(consoleTools),
  ...Object.values(emulationTools),
  ...Object.values(extensionTools),
  ...Object.values(inputTools),
  ...Object.values(mutationTools),
  ...Object.values(networkTools),
  ...Object.values(pagesTools),
  ...Object.values(performanceTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
  ...Object.values(stateTools),
  wireframeSnapshot,
  svgSnapshot,
] as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

export {tools};
