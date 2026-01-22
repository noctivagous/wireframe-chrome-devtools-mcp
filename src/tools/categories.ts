/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ToolCategory {
  INPUT = 'input',
  NAVIGATION = 'navigation',
  EMULATION = 'emulation',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  SNAPSHOT = 'snapshot',
  EDIT_SESSION = 'edit_session',
  PATCH = 'patch',
  CHATBOX = 'chatbox',
  DEBUGGING = 'debugging',
  EXTENSIONS = 'extensions',
}

export const labels = {
  [ToolCategory.INPUT]: 'Input automation',
  [ToolCategory.NAVIGATION]: 'Navigation automation',
  [ToolCategory.EMULATION]: 'Emulation',
  [ToolCategory.PERFORMANCE]: 'Performance',
  [ToolCategory.NETWORK]: 'Network',
  [ToolCategory.SNAPSHOT]: 'Snapshot',
  [ToolCategory.EDIT_SESSION]: 'Edit Session',
  [ToolCategory.PATCH]: 'Patch',
  [ToolCategory.CHATBOX]: 'Chatbox',
  [ToolCategory.DEBUGGING]: 'Debugging',
  [ToolCategory.EXTENSIONS]: 'Extensions',
};
