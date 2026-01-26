/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {selectableViewRecipe} from './selectable-view.js';
import {parametricGridRecipe} from './parametric-grid.js';
import {overlayGridRecipe} from './overlay-grid.js';
import {appShellRecipe} from './app-shell.js';
import {twoColumnRecipe} from './two-column.js';
import {threePanelRecipe} from './three-panel.js';
import {toolbarRecipe} from './toolbar.js';
import {gridCanvasRecipe} from './grid-canvas.js';

export type Recipe = {
  name: string;
  description: string;
  schema: any;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
};

export const recipeRegistry: Record<string, Recipe> = {
  selectable_view: selectableViewRecipe,
  parametric_grid: parametricGridRecipe,
  overlay_grid: overlayGridRecipe,
  app_shell: appShellRecipe,
  two_column: twoColumnRecipe,
  three_panel: threePanelRecipe,
  toolbar: toolbarRecipe,
  grid_canvas: gridCanvasRecipe,
};

export {
  selectableViewRecipe,
  parametricGridRecipe,
  overlayGridRecipe,
  appShellRecipe,
  twoColumnRecipe,
  threePanelRecipe,
  toolbarRecipe,
  gridCanvasRecipe,
};

