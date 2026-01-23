/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WorkflowGroup {
  id: string;
  name: string;
  description: string;
  toolCategories: string[];
  tools: string[];
}

export const WORKFLOW_GROUPS: WorkflowGroup[] = [
  {
    id: 'live-editing',
    name: 'Live Editing',
    description: 'Tools for interactive prototyping and live development',
    toolCategories: ['navigation', 'input', 'snapshot', 'edit_session', 'patch', 'debugging'],
    tools: []
  },
  {
    id: 'live-editing-minimal',
    name: 'Live Editing Minimal',
    description: 'Essential tools for live prototyping and committing changes',
    toolCategories: [],
    tools: [
      'begin_edit_session',
      'batch_ops',
      'insert_css',
      'insert_js',
      'evaluate_script',
      'wireframe_snapshot',
      'svg_snapshot',
      'manipulate_dom',
      'simulate_event',
      'click',
      'hover',
      'list_pages',
      'select_page',
      'close_page',
      'new_page',
      'navigate_page',
      'get_tab_id',
      'commit_edit_session_to_files'
    ]
  },
  {
    id: 'layout-debugging',
    name: 'Layout Debugging',
    description: 'Tools for finding and analyzing layout problems',
    toolCategories: ['snapshot', 'debugging'],
    tools: []
  },
  {
    id: 'debugging',
    name: 'Debugging',
    description: 'Tools for debugging and inspecting application state',
    toolCategories: ['snapshot', 'debugging', 'network', 'extensions'],
    tools: []
  },
  {
    id: 'testing-automation',
    name: 'Testing & Automation',
    description: 'Tools for automated testing and workflow automation',
    toolCategories: ['input', 'navigation', 'snapshot', 'emulation', 'network'],
    tools: []
  },
  {
    id: 'performance-analysis',
    name: 'Performance Analysis',
    description: 'Tools for performance monitoring and analysis',
    toolCategories: ['performance', 'network', 'snapshot'],
    tools: []
  }
];

