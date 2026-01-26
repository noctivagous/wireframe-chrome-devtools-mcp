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
import {classic5SectionRecipe} from './classic-5-section.js';
import {masonryRecipe} from './masonry.js';
import {centeredHeroRecipe} from './centered-hero.js';
import {stickyHeaderFooterRecipe} from './sticky-header-footer.js';
import {mobileBottomNavRecipe} from './mobile-bottom-nav.js';
import {masterDetailRecipe} from './master-detail.js';
import {dashboardRecipe} from './dashboard.js';
import {splitScreenRecipe} from './split-screen.js';

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
  classic_5_section: classic5SectionRecipe,
  masonry: masonryRecipe,
  centered_hero: centeredHeroRecipe,
  sticky_header_footer: stickyHeaderFooterRecipe,
  mobile_bottom_nav: mobileBottomNavRecipe,
  master_detail: masterDetailRecipe,
  dashboard: dashboardRecipe,
  split_screen: splitScreenRecipe,
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
  classic5SectionRecipe,
  masonryRecipe,
  centeredHeroRecipe,
  stickyHeaderFooterRecipe,
  mobileBottomNavRecipe,
  masterDetailRecipe,
  dashboardRecipe,
  splitScreenRecipe,
};

