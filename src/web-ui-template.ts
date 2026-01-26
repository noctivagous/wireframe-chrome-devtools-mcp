/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {WORKFLOW_GROUPS} from './web-ui-settings.js';

export type PageRoute = 'tools' | 'guidance' | 'workflows' | 'index' | {type: 'workflow'; workflowId: string};

/**
 * Generates CSS styles for the web UI
 */
function generateStyles(): string {
  return `
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f9fafb;
      --text-primary: #111827;
      --text-secondary: #4b5563;
      --accent: #2563eb;
      --border: rgba(0, 0, 0, 0.1);
      --card-bg: #ffffff;
      --card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
      --header-bg: #ffffff;
      --sidebar-bg: #f3f4f6;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-primary: #111827;
        --bg-secondary: #1f2937;
        --text-primary: #f9fafb;
        --text-secondary: #d1d5db;
        --accent: #3b82f6;
        --border: rgba(255, 255, 255, 0.1);
        --card-bg: #1f2937;
        --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --header-bg: #111827;
        --sidebar-bg: #111827;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      margin: 0;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      background: var(--header-bg);
      padding: 12px 24px;
      border-bottom: 1px solid var(--border);
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .top-tabs {
      display: inline-flex;
      gap: 6px;
      padding: 4px;
      border-radius: 10px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
    }

    .top-tab {
      border: none;
      background: transparent;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: all 0.2s;
    }

    .top-tab:hover {
      color: var(--text-primary);
    }

    .top-tab.active {
      background: var(--bg-primary);
      color: var(--accent);
      box-shadow: var(--card-shadow);
    }

    header .meta {
      display: flex;
      gap: 20px;
      align-items: center;
      font-size: 13px;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.5;
      font-weight: 600;
    }

    .meta-value {
      font-weight: 500;
    }

    main {
      flex: 1;
      display: flex;
      overflow: hidden;
      min-height: 0;
    }

    #tools-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    #guidance-view {
      flex: 1;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }

    #guidance-view.active {
      display: flex;
    }

    #sidebar {
      width: 260px;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      display: none;
    }

    #sidebar.visible {
      display: flex;
    }

    .sidebar-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: var(--sidebar-bg);
    }

    .sidebar-tab {
      flex: 1;
      padding: 12px 8px;
      text-align: center;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
      background: var(--sidebar-bg);
      border: none;
    }

    .sidebar-tab:hover {
      color: var(--text-primary);
      background: var(--border);
    }

    .sidebar-tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: var(--bg-primary);
    }

    .sidebar-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .sidebar-pane {
      flex: 1;
      padding: 16px;
      display: none;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      min-height: 0;
    }

    .sidebar-pane.active {
      display: flex;
    }

    .sidebar-item {
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.2s;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sidebar-item:hover {
      background: var(--border);
      color: var(--text-primary);
    }

    .sidebar-item.active {
      background: var(--accent);
      color: white;
    }

    .sidebar-item .count {
      font-size: 12px;
      opacity: 0.7;
    }

    .workflow-radio-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .workflow-radio-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .workflow-radio-item:hover {
      background: var(--border);
    }

    .workflow-radio-item.selected {
      background: var(--accent);
      color: white;
    }

    .workflow-radio-item input[type="radio"] {
      margin: 0;
      accent-color: var(--accent);
    }

    .workflow-radio-item label {
      flex: 1;
      cursor: pointer;
      font-size: 14px;
      margin: 0;
    }

    .workflow-radio-item .count {
      font-size: 12px;
      opacity: 0.8;
    }

    .workflow-radio-item.selected .count {
      opacity: 1;
    }

    .workflow-context {
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      border: 1px solid var(--border);
    }

    .workflow-context strong {
      color: var(--accent);
    }

    .workflow-explainer {
      margin-top: 12px;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      font-size: 12px;
      color: var(--text-secondary);
      display: grid;
      gap: 12px;
    }

    .workflow-explainer-section h4 {
      margin: 0 0 6px 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-primary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .workflow-explainer-section ul {
      margin: 0;
      padding-left: 18px;
    }

    .workflow-explainer-section li {
      margin-bottom: 4px;
    }

    .workflow-tab-view {
      margin-top: 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .workflow-tab-triggers {
      display: flex;
      background: var(--bg-primary);
    }

    .workflow-tab-trigger {
      flex: 1;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-bottom: 2px solid transparent;
    }

    .workflow-tab-trigger:hover {
      color: var(--text-primary);
      background: var(--bg-secondary);
    }

    .workflow-tab-trigger.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: var(--bg-secondary);
    }

    .workflow-tab-panel {
      display: none;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .workflow-tab-panel.active {
      display: flex;
    }

    .workflow-tab-panel[id^="tab-panel-howto"] {
      padding: 16px;
    }

    .workflow-tab-panel .workflow-explainer-section {
      margin-bottom: 16px;
    }

    .workflow-tab-panel .workflow-explainer-section:last-child {
      margin-bottom: 0;
    }

    #content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .workflow-tab-panel #content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .workflow-tab-panel #content-area .controls-bar {
      flex-shrink: 0;
    }

    .workflow-tab-panel #content-area #tools-grid {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      min-height: 0;
    }

    .controls-bar {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-primary);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      min-width: 300px;
    }

    input[type="search"] {
      width: 100%;
      padding: 10px 16px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    input[type="search"]:focus {
      border-color: var(--accent);
    }

    .btn-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    button {
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    button:hover {
      background: var(--bg-secondary);
      border-color: rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08);
    }

    button:active {
      transform: translateY(0);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    button.primary {
      background: linear-gradient(to bottom, #3b82f6, var(--accent));
      color: white;
      border-color: var(--accent);
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3), 0 1px 2px rgba(37, 99, 235, 0.2);
    }

    button.primary:hover {
      background: linear-gradient(to bottom, var(--accent), #1d4ed8);
      box-shadow: 0 4px 8px rgba(37, 99, 235, 0.4), 0 2px 4px rgba(37, 99, 235, 0.3);
    }

    button.primary:active {
      background: linear-gradient(to bottom, #1d4ed8, #1e40af);
      box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
    }

    #tools-grid {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
      align-content: start;
      min-height: 0;
    }

    .tool-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      box-shadow: var(--card-shadow);
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .tool-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    .tool-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .tool-name-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tool-name {
      font-family: ui-monospace, monospace;
      font-weight: 600;
      font-size: 14px;
      color: var(--accent);
    }

    .tool-desc {
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .parameters-accordion {
      margin-top: 8px;
      border-top: 1px solid var(--border);
      padding-top: 8px;
    }

    .parameters-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      padding: 6px 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      user-select: none;
      transition: color 0.2s;
    }

    .parameters-header:hover {
      color: var(--text-primary);
    }

    .parameters-header::after {
      content: '▼';
      font-size: 10px;
      transition: transform 0.2s;
      opacity: 0.6;
    }

    .parameters-header.expanded::after {
      transform: rotate(180deg);
    }

    .parameters-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-out;
    }

    .parameters-content.expanded {
      max-height: 500px;
      transition: max-height 0.3s ease-in;
    }

    .parameters-list {
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .parameter-item {
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      border-left: 3px solid var(--accent);
    }

    .parameter-name {
      font-family: ui-monospace, monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 4px;
    }

    .parameter-name .required {
      color: #ef4444;
      margin-left: 4px;
    }

    .parameter-name .optional {
      color: var(--text-secondary);
      font-size: 10px;
      font-weight: 400;
      margin-left: 4px;
    }

    .parameter-type {
      font-size: 11px;
      color: var(--text-secondary);
      font-family: ui-monospace, monospace;
      margin-bottom: 4px;
    }

    .parameter-desc {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .4s;
      border-radius: 24px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--accent);
    }

    input:focus + .slider {
      box-shadow: 0 0 1px var(--accent);
    }

    input:checked + .slider:before {
      transform: translateX(20px);
    }

    .category-title {
      grid-column: 1 / -1;
      font-size: 18px;
      font-weight: 700;
      margin-top: 10px;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .category-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 99px;
      background: var(--border);
      font-weight: 600;
    }

    .original-badge {
      background: #e3f2fd;
      color: #1976d2;
      font-size: 9px;
    }

    @media (prefers-color-scheme: dark) {
      .original-badge {
        background: #1565c0;
        color: #e3f2fd;
      }
    }

    .branch-badge {
      background: #fff3e0;
      color: #f57c00;
      font-size: 9px;
    }

    @media (prefers-color-scheme: dark) {
      .branch-badge {
        background: #e65100;
        color: #fff3e0;
      }
    }

    #status-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 24px;
      border-radius: 12px;
      background: var(--text-primary);
      color: var(--bg-primary);
      font-weight: 500;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
      transform: translateY(100px);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 100;
      opacity: 0;
      pointer-events: none;
    }

    #status-toast.visible {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .guidance-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-primary);
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .guidance-warning {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
    }

    @media (prefers-color-scheme: dark) {
      .guidance-warning {
        background: #3f2d13;
        color: #fcd34d;
        border-color: #d97706;
      }
    }

    .guidance-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .guidance-body {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      align-content: start;
      background: var(--bg-secondary);
      min-height: 0;
    }

    .guidance-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      box-shadow: var(--card-shadow);
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 320px;
    }

    .guidance-card h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }

    .guidance-card p {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .guidance-card textarea {
      flex: 1;
      resize: vertical;
      min-height: 220px;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    .workflow-selection-view {
      flex: 1;
      padding: 32px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
    }

    .workflow-selection-view.hidden {
      display: none;
    }

    .workflow-selection-header {
      margin-bottom: 24px;
    }

    .workflow-selection-header h2 {
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: var(--text-primary);
    }

    .workflow-selection-header p {
      font-size: 14px;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.5;
    }

    .workflows-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 16px;
    }

    .workflow-card {
      background: var(--card-bg);
      border: 2px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: var(--card-shadow);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      overflow: hidden;
      min-height: 140px;
    }

    .workflow-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--accent);
      transform: scaleX(0);
      transition: transform 0.2s;
    }

    .workflow-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.15);
      border-color: var(--accent);
    }

    .workflow-card:hover::before {
      transform: scaleX(1);
    }

    .workflow-card:active {
      transform: translateY(-2px);
    }

    .workflow-card.selected {
      border-color: var(--accent);
      background: linear-gradient(to bottom, rgba(37, 99, 235, 0.05), var(--card-bg));
    }

    .workflow-card.selected::before {
      transform: scaleX(1);
    }

    .workflow-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .workflow-card-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
      flex: 1;
    }

    .workflow-card-count {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(37, 99, 235, 0.1);
      padding: 4px 10px;
      border-radius: 12px;
      white-space: nowrap;
    }

    .workflow-card-desc {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0;
      flex: 1;
    }

    .workflow-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }

    .workflow-card-action {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .workflow-card-action::after {
      content: '→';
      transition: transform 0.2s;
    }

    .workflow-card:hover .workflow-card-action::after {
      transform: translateX(4px);
    }

    .tool-selection-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .tool-selection-view.hidden {
      display: none;
    }

    .workflow-context-bar {
      padding: 0;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      z-index: 5;
      position: relative;
      flex-shrink: 0;
    }

    .workflow-context-bar-top {
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .workflow-context-bar-tabs {
      display: flex;
      border-top: 1px solid var(--border);
      background: var(--bg-primary);
    }

    .workflow-context-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .workflow-context-info h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
    }

    .workflow-context-info .workflow-badge {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(37, 99, 235, 0.1);
      padding: 4px 10px;
      border-radius: 12px;
    }

    .back-to-workflows {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .back-to-workflows:hover {
      background: var(--bg-secondary);
      border-color: var(--accent);
    }

    .back-to-workflows::before {
      content: '←';
    }

    .add-tools-section {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-primary);
      flex-shrink: 0;
    }

    .add-tools-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
    }

    .add-tools-toggle:hover {
      background: var(--border);
      border-color: var(--accent);
    }

    .add-tools-panel {
      margin-top: 12px;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 12px;
      border: 1px solid var(--border);
      display: none;
    }

    .add-tools-panel.visible {
      display: block;
      animation: slideDown 0.2s ease-out;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .add-tools-panel h4 {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 12px 0;
      color: var(--text-primary);
    }

    .other-workflows-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .other-workflow-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: var(--bg-primary);
      border-radius: 8px;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.2s;
    }

    .other-workflow-item:hover {
      border-color: var(--accent);
      background: var(--bg-secondary);
    }

    .other-workflow-item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .other-workflow-item-count {
      font-size: 12px;
      color: var(--text-secondary);
    }

    #content-area.workflow-mode {
      display: none;
    }

    #content-area.tool-mode {
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
  `;
}

/**
 * Generates JavaScript code for the web UI
 */
function generateScript(route: PageRoute): string {
  const workflowGroupsJson = JSON.stringify(WORKFLOW_GROUPS);
  const routeJson = JSON.stringify(route);
  
  const workflowGuidance = {
    'live-editing-minimal': {
      howToUse: [
        'Start a live editing session.',
        'Describe the changes you want.',
        'Review results in-browser before committing.'
      ],
      aiToolUse: [
        'Begin session and keep changes in-browser.',
        'Use insert_css / insert_js / manipulate_dom with recordToSession when applicable.',
        'Use wireframe/svg snapshots to validate layout before commit.'
      ]
    },
    'layout-debugging': {
      howToUse: [
        'Identify a page or section with layout issues.',
        'Ask for wireframe analysis and confirm the problems.',
        'Approve fixes after before/after verification.'
      ],
      aiToolUse: [
        'Use wireframe_snapshot / svg_snapshot to detect gaps, overlaps, clipping.',
        'Apply candidate fixes in-browser and re-snapshot for comparison.',
        'Only commit after the user confirms the layout is correct.'
      ]
    },
    'debugging': {
      howToUse: [
        'Describe the bug or behavior you want to inspect.',
        'Provide the page/URL and any repro steps.',
        'Confirm findings and approve changes if needed.'
      ],
      aiToolUse: [
        'Use snapshot and debugging tools to inspect state and DOM.',
        'Use evaluate_script / manipulate_dom for targeted checks or patches.',
        'Keep changes minimal and confirm impact before committing.'
      ]
    },
    'testing-automation': {
      howToUse: [
        'Describe the test scenario and expected outcome.',
        'Provide the page/URL and any setup steps.',
        'Review results and iterate on failures.'
      ],
      aiToolUse: [
        'Use input/navigation tools to drive the scenario.',
        'Use snapshot tools to capture outcomes and verify state.',
        'Report failures with clear steps and evidence.'
      ]
    },
    'performance-analysis': {
      howToUse: [
        'Describe the performance concern or target metric.',
        'Provide the page/URL and a reproducible flow.',
        'Review findings and decide on next optimizations.'
      ],
      aiToolUse: [
        'Use performance tools to capture traces and timings.',
        'Use network tools to identify slow resources.',
        'Summarize bottlenecks and propose targeted fixes.'
      ]
    }
  };

  return `
    (function() {
      'use strict';
      
      const WORKFLOW_GROUPS = ${workflowGroupsJson};
      const WORKFLOW_GUIDANCE = ${JSON.stringify(workflowGuidance)};
      const currentRoute = ${routeJson};
      
      // State management
      const state = {
        tools: [],
        selectedCategory: 'all',
        currentView: 'workflows',
        selectedWorkflow: 'all',
        guidanceLoaded: false
      };
      
      // DOM helpers
      const $ = (id) => document.getElementById(id);
      const $$ = (selector) => document.querySelectorAll(selector);
      
      // Status toast
      function setStatus(msg) {
        const toast = $('status-toast');
        if (!toast) return;
        if (msg) {
          toast.textContent = msg;
          toast.classList.add('visible');
          setTimeout(() => toast.classList.remove('visible'), 2000);
        }
      }
      
      // API functions
      async function loadTools() {
        try {
          const r = await fetch('/api/tools');
          const j = await r.json();
          state.tools = j.tools || [];
          const configPathEl = $('configPath');
          const updatedAtEl = $('updatedAt');
          if (configPathEl) {
            configPathEl.textContent = j.configPath.split('/').pop() || '';
            configPathEl.title = j.configPath;
          }
          if (updatedAtEl) {
            updatedAtEl.textContent = new Date(j.updatedAt).toLocaleTimeString();
          }
          render();
        } catch (error) {
          setStatus('Failed to load tools.');
          console.error('Error loading tools:', error);
        }
      }
      
      async function loadGuidance() {
        try {
          const r = await fetch('/api/guidance');
          if (!r.ok) {
            setStatus('Failed to load guidance.');
            return;
          }
          const j = await r.json();
          const configPathEl = $('guidanceConfigPath');
          const updatedAtEl = $('guidanceUpdatedAt');
          const versionEl = $('guidanceVersion');
          const designEl = $('designGuide');
          const archEl = $('architectureGuide');
          const engEl = $('engineeringGuide');
          
          if (configPathEl) {
            configPathEl.textContent = (j.configPath || '').split('/').pop() || '';
            configPathEl.title = j.configPath || '';
          }
          if (updatedAtEl) {
            updatedAtEl.textContent = j.updatedAt ? new Date(j.updatedAt).toLocaleTimeString() : '...';
          }
          if (versionEl) {
            versionEl.textContent = 'v' + (j.version || 1);
          }
          if (designEl) designEl.value = j.guides?.design?.content ?? '';
          if (archEl) archEl.value = j.guides?.architecture?.content ?? '';
          if (engEl) engEl.value = j.guides?.engineering?.content ?? '';
          state.guidanceLoaded = true;
        } catch (error) {
          setStatus('Failed to load guidance.');
          console.error('Error loading guidance:', error);
        }
      }
      
      // Render workflow guidance
      function renderWorkflowGuidance(workflowId) {
        const guidance = WORKFLOW_GUIDANCE[workflowId];
        if (!guidance) return '';
        
        const renderList = (items) => {
          if (!items || !items.length) return '';
          return '<ul>' + items.map(i => '<li>' + i.replace(/</g, '&lt;') + '</li>').join('') + '</ul>';
        };
        
        return \`
          <div class="workflow-tab-view" id="workflow-tab-view-\${workflowId}">
            <div class="workflow-tab-panel active" id="tab-panel-howto-\${workflowId}" role="tabpanel">
              <div class="workflow-explainer-section">
                <h4>How to use this workflow</h4>
                \${renderList(guidance.howToUse)}
              </div>
              <div class="workflow-explainer-section">
                <h4>How the AI will use tools</h4>
                \${renderList(guidance.aiToolUse)}
              </div>
            </div>
            <div class="workflow-tab-panel" id="tab-panel-tools-\${workflowId}" role="tabpanel"></div>
          </div>
        \`;
      }
      
      // Render main UI
      function render() {
        const q = ($('q')?.value || '').toLowerCase().trim();
        const grid = $('tools-grid');
        const workflowGroups = $('workflow-groups');
        const toolCategories = $('tool-categories');
        
        if (!grid) return;
        
        // Update search placeholder
        const searchInput = $('q');
        if (searchInput) {
          if (state.selectedWorkflow !== 'all' && state.currentView === 'tools') {
            const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
            searchInput.placeholder = "Filter tools in " + (workflow ? workflow.name : 'selected workflow') + "...";
          } else {
            searchInput.placeholder = "Filter tools (name/category/description)...";
          }
        }
        
        // Update enabled count
        const enabledTools = state.tools.filter(t => t.enabled).length;
        const enabledCountEl = $('enabledCount');
        if (enabledCountEl) {
          enabledCountEl.textContent = enabledTools.toString();
        }
        
        // Update workflow name in header if a workflow is selected
        const workflowNameMeta = $('workflowNameMeta');
        const workflowNameLabel = $('workflowNameLabel');
        if (workflowNameMeta && workflowNameLabel) {
          if (state.selectedWorkflow !== 'all' && state.selectedWorkflow) {
            const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
            if (workflow) {
              workflowNameLabel.textContent = workflow.name;
              workflowNameMeta.style.display = 'flex';
            } else {
              workflowNameMeta.style.display = 'none';
            }
          } else {
            workflowNameMeta.style.display = 'none';
          }
        }
        
        // Filter tools
        let filtered = [];
        let allowedCategories = [];
        let allowedTools = [];
        
        if (state.currentView === 'workflows') {
          if (state.selectedWorkflow === 'all') {
            allowedCategories = [...new Set(state.tools.map(t => t.category))];
          } else {
            const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
            allowedCategories = workflow ? workflow.toolCategories : [];
            allowedTools = workflow ? workflow.tools : [];
          }
        }
        
        filtered = state.tools.filter(t => {
          const matchesQuery = !q ||
                 (t.name || '').toLowerCase().includes(q) ||
                 (t.category || '').toLowerCase().includes(q) ||
                 (t.description || '').toLowerCase().includes(q);
          
          let matchesSelection = false;
          if (state.currentView === 'tools') {
            matchesSelection = state.selectedCategory === 'all' || t.category === state.selectedCategory;
          } else {
            matchesSelection = state.selectedWorkflow === 'all' ||
              allowedCategories.includes(t.category) ||
              allowedTools.includes(t.name);
          }
          
          return matchesQuery && matchesSelection;
        });
        
        // Render sidebar
        if (state.currentView === 'workflows' && workflowGroups) {
          renderWorkflowGroups(workflowGroups);
        } else if (state.currentView === 'tools' && toolCategories) {
          renderToolCategories(toolCategories);
        }
        
        // Render grid
        renderToolsGrid(grid, filtered);
      }
      
      // Render workflow groups sidebar
      function renderWorkflowGroups(container) {
        let html = '<div class="workflow-radio-group">';
        
        // All workflows option
        const allSelected = state.selectedWorkflow === 'all' ? ' selected' : '';
        const allChecked = state.selectedWorkflow === 'all' ? ' checked' : '';
        const allEnabled = state.tools.filter(t => t.enabled).length;
        const allTotal = state.tools.length;
        html += '<div class="workflow-radio-item' + allSelected + '">' +
          '<input type="radio" id="workflow-all" name="workflow-group" value="all"' + allChecked + '>' +
          '<label for="workflow-all">All Workflows</label>' +
          '<span class="count">' + allEnabled + ' / ' + allTotal + '</span>' +
          '</div>';
        
        // Individual workflow options
        WORKFLOW_GROUPS.forEach(workflow => {
          const workflowTools = state.tools.filter(t =>
            workflow.toolCategories.includes(t.category) ||
            workflow.tools.includes(t.name)
          );
          const total = workflowTools.length;
          const enabled = workflowTools.filter(t => t.enabled).length;
          const selected = state.selectedWorkflow === workflow.id ? ' selected' : '';
          const checked = state.selectedWorkflow === workflow.id ? ' checked' : '';
          
          html += '<div class="workflow-radio-item' + selected + '" title="' + (workflow.description || '').replace(/"/g, '&quot;') + '">' +
            '<input type="radio" id="workflow-' + workflow.id + '" name="workflow-group" value="' + workflow.id + '"' + checked + '>' +
            '<label for="workflow-' + workflow.id + '">' + (workflow.name || '').replace(/</g, '&lt;') + '</label>' +
            '<span class="count">' + enabled + ' / ' + total + '</span>' +
            '</div>';
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add event listeners
        container.querySelectorAll('input[name="workflow-group"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            state.selectedWorkflow = e.target.value;
            
            // When a workflow group is selected (not "all"), enable only its tools
            if (state.selectedWorkflow !== 'all') {
              const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
              if (workflow) {
                const workflowToolNames = new Set([
                  ...workflow.tools,
                  ...(workflow.toolCategories && workflow.toolCategories.length > 0
                    ? state.tools
                        .filter(t => workflow.toolCategories.includes(t.category))
                        .map(t => t.name)
                    : [])
                ]);
                
                state.tools.forEach(t => {
                  t.enabled = workflowToolNames.has(t.name);
                });
              }
            }
            
            render();
          });
        });
      }
      
      // Render tool categories sidebar
      function renderToolCategories(container) {
        container.innerHTML = '';
        
        // Show workflow context if a specific workflow is selected
        if (state.selectedWorkflow !== 'all') {
          const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
          if (workflow) {
            const workflowTools = state.tools.filter(t =>
              workflow.toolCategories.includes(t.category) ||
              workflow.tools.includes(t.name)
            );
            const total = workflowTools.length;
            const enabled = workflowTools.filter(t => t.enabled).length;
            
            const contextDiv = document.createElement('div');
            contextDiv.className = 'workflow-context';
            contextDiv.innerHTML =
              '<strong>' + (workflow.name || '').replace(/</g, '&lt;') + '</strong>: ' + enabled + ' of ' + total + ' tools enabled' +
              '<br><small>' + (workflow.description || '').replace(/</g, '&lt;') + '</small>';
            container.appendChild(contextDiv);
          }
        }
        
        const categories = ['all', ...new Set(state.tools.map(t => t.category))].sort();
        categories.forEach(cat => {
          const item = document.createElement('div');
          item.className = 'sidebar-item' + (state.selectedCategory === cat ? ' active' : '');
          const categoryTools = cat === 'all' ? state.tools : state.tools.filter(t => t.category === cat);
          const total = categoryTools.length;
          const enabled = categoryTools.filter(t => t.enabled).length;
          item.innerHTML = \`<span>\${(cat.charAt(0).toUpperCase() + cat.slice(1)).replace(/</g, '&lt;')}</span> <span class="count">\${enabled} / \${total}</span>\`;
          item.onclick = () => {
            state.selectedCategory = cat;
            render();
          };
          container.appendChild(item);
        });
      }
      
      // Render tools grid
      function renderToolsGrid(grid, filtered) {
        grid.innerHTML = '';
        
        if (filtered.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; opacity: 0.5;">No tools found matching your criteria</div>';
          return;
        }
        
        const byCategory = new Map();
        for (const t of filtered) {
          const cat = t.category || 'unknown';
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat).push(t);
        }
        
        const cats = Array.from(byCategory.keys()).sort();
        cats.forEach(cat => {
          if (state.selectedCategory === 'all') {
            const title = document.createElement('div');
            title.className = 'category-title';
            
            if (state.selectedWorkflow !== 'all' && state.currentView === 'tools') {
              const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
              title.innerHTML = (cat || '').replace(/</g, '&lt;') + " <small>(in " + (workflow ? (workflow.name || '').replace(/</g, '&lt;') : 'selected workflow') + ")</small>";
            } else {
              title.textContent = cat || '';
            }
            
            grid.appendChild(title);
          }
          
          const items = byCategory.get(cat).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
          items.forEach(t => {
            const card = createToolCard(t);
            grid.appendChild(card);
          });
        });
      }
      
      // Create tool card
      function createToolCard(t) {
        const card = document.createElement('div');
        card.className = 'tool-card';
        
        // Build parameters HTML
        let parametersHtml = '';
        if (t.parameters && Object.keys(t.parameters).length > 0) {
          const paramsList = Object.entries(t.parameters).map(([name, param]) => {
            const isRequired = param.required || false;
            let type = param.type || 'unknown';
            if (param.enum && param.enum.length > 0) {
              type = 'enum: ' + param.enum.map(v => '"' + (v || '').replace(/"/g, '&quot;') + '"').join(', ');
            }
            const desc = param.description || '';
            const requiredBadge = isRequired ? '<span class="required">*</span>' : '<span class="optional">(optional)</span>';
            const descHtml = desc ? '<div class="parameter-desc">' + desc.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : '';
            return '<div class="parameter-item">' +
              '<div class="parameter-name">' + (name || '').replace(/</g, '&lt;') + requiredBadge + '</div>' +
              '<div class="parameter-type">' + (type || '').replace(/</g, '&lt;') + '</div>' +
              descHtml +
              '</div>';
          }).join('');
          
          parametersHtml = '<div class="parameters-accordion">' +
            '<div class="parameters-header" data-tool="' + (t.name || '').replace(/"/g, '&quot;') + '">Parameters</div>' +
            '<div class="parameters-content" data-content="' + (t.name || '').replace(/"/g, '&quot;') + '">' +
            '<div class="parameters-list">' + paramsList + '</div>' +
            '</div>' +
            '</div>';
        }
        
        const badgeHtml = t.isOriginal 
          ? '<span class="badge original-badge" title="From original chrome-devtools-mcp repo">Original</span>'
          : '<span class="badge branch-badge" title="Added in this branch">Branch</span>';
        const checkedAttr = t.enabled ? 'checked' : '';
        
        card.innerHTML = '<div class="tool-card-header">' +
            '<div class="tool-name-wrapper">' +
              '<div class="tool-name">' + (t.name || '').replace(/</g, '&lt;') + '</div>' +
              badgeHtml +
            '</div>' +
            '<label class="switch">' +
              '<input type="checkbox" ' + checkedAttr + ' data-tool="' + (t.name || '').replace(/"/g, '&quot;') + '">' +
              '<span class="slider"></span>' +
            '</label>' +
          '</div>' +
          '<div class="tool-desc">' + (t.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
          parametersHtml;
        
        // Add checkbox handler
        const cb = card.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.onchange = (e) => {
            const tool = state.tools.find(tool => tool.name === t.name);
            if (tool) {
              tool.enabled = e.target.checked;
              render();
            }
          };
        }
        
        // Add accordion toggle
        const paramHeader = card.querySelector('.parameters-header');
        const paramContent = card.querySelector('.parameters-content');
        if (paramHeader && paramContent) {
          paramHeader.onclick = () => {
            const isExpanded = paramHeader.classList.contains('expanded');
            if (isExpanded) {
              paramHeader.classList.remove('expanded');
              paramContent.classList.remove('expanded');
            } else {
              paramHeader.classList.add('expanded');
              paramContent.classList.add('expanded');
            }
          };
        }
        
        return card;
      }
      
      // Workflow-first UI management
      const workflowUI = {
        init() {
          if (document.getElementById('workflow-selection-view')) return;
          
          const toolsView = $('tools-view');
          if (!toolsView) return;
          
          // Hide sidebar initially
          const sidebar = $('sidebar');
          if (sidebar) {
            sidebar.classList.remove('visible');
          }
          
          // Hide content area initially
          const contentArea = $('content-area');
          if (contentArea) {
            contentArea.classList.add('workflow-mode');
          }
          
          // Create workflow selection view
          const workflowView = this.createWorkflowSelectionView();
          toolsView.insertBefore(workflowView, toolsView.firstChild);
        },
        
        createWorkflowSelectionView() {
          const container = document.createElement('div');
          container.className = 'workflow-selection-view';
          container.id = 'workflow-selection-view';
          
          const header = document.createElement('div');
          header.className = 'workflow-selection-header';
          header.innerHTML = \`
            <h2>Choose a Workflow</h2>
            <p>Start by selecting a workflow that matches your task. You can add tools from other workflows later.</p>
          \`;
          
          const grid = document.createElement('div');
          grid.className = 'workflows-grid';
          
          WORKFLOW_GROUPS.forEach(workflow => {
            const card = document.createElement('div');
            card.className = 'workflow-card';
            card.dataset.workflowId = workflow.id;
            
            // Check if this workflow is currently selected
            const isSelected = state.selectedWorkflow === workflow.id;
            if (isSelected) {
              card.classList.add('selected');
            }
            
            const workflowTools = state.tools.filter(t =>
              workflow.toolCategories.includes(t.category) ||
              workflow.tools.includes(t.name)
            );
            const total = workflowTools.length;
            const enabled = workflowTools.filter(t => t.enabled).length;
            
            card.innerHTML = \`
              <div class="workflow-card-header">
                <h3 class="workflow-card-title">\${(workflow.name || '').replace(/</g, '&lt;')}</h3>
                <span class="workflow-card-count">\${enabled} / \${total}</span>
              </div>
              \${workflow.description ? \`<p class="workflow-card-desc">\${(workflow.description || '').replace(/</g, '&lt;')}</p>\` : ''}
              <div class="workflow-card-footer">
                <span class="workflow-card-action">Select workflow</span>
              </div>
            \`;
            
            card.addEventListener('click', () => {
              // Navigate to workflow URL
              window.location.href = '/workflow/' + workflow.id + '/';
            });
            
            grid.appendChild(card);
          });
          
          container.appendChild(header);
          container.appendChild(grid);
          
          return container;
        },
        
        selectWorkflow(workflowId, workflowName) {
          // Update state first
          state.selectedWorkflow = workflowId;
          state.currentView = 'workflows';
          
          // Hide workflow selection
          const workflowView = $('workflow-selection-view');
          if (workflowView) {
            workflowView.classList.add('hidden');
          }
          
          // Show tool selection
          let toolView = $('tool-selection-view');
          if (!toolView) {
            toolView = this.createToolSelectionView(workflowId, workflowName);
            const toolsView = $('tools-view');
            if (toolsView) {
              toolsView.appendChild(toolView);
            }
          } else {
            toolView.classList.remove('hidden');
            this.updateToolSelectionView(toolView, workflowId, workflowName);
          }
          
          // Trigger workflow selection in sidebar (this will call render)
          const radio = document.querySelector(\`input[type="radio"][value="\${workflowId}"]\`);
          if (radio) {
            radio.click();
          } else {
            // If radio doesn't exist yet, render manually
            render();
          }
          
          // Populate other workflows
          this.populateOtherWorkflows(workflowId);
          
          // Ensure tools tab is visible after render completes
          // This ensures tools are shown when workflow is selected
          setTimeout(() => {
            this.activateToolsTab(toolView, workflowId);
          }, 50);
        },
        
        createToolSelectionView(workflowId, workflowName) {
          const container = document.createElement('div');
          container.className = 'tool-selection-view';
          container.id = 'tool-selection-view';
          
          // Context bar
          const contextBar = document.createElement('div');
          contextBar.className = 'workflow-context-bar';
          contextBar.innerHTML = \`
            <div class="workflow-context-bar-top">
              <div class="workflow-context-info">
                <button class="back-to-workflows">Back</button>
                <h3>\${(workflowName || '').replace(/</g, '&lt;')}</h3>
                <span class="workflow-badge">\${(workflowId || '').replace(/</g, '&lt;')}</span>
              </div>
            </div>
            <div class="workflow-context-bar-tabs workflow-tab-triggers" role="tablist" id="workflow-tab-triggers-\${workflowId}">
              <button class="workflow-tab-trigger active" role="tab" aria-selected="true" aria-controls="tab-panel-howto-\${workflowId}" data-tab="howto">How to use</button>
              <button class="workflow-tab-trigger" role="tab" aria-selected="false" aria-controls="tab-panel-tools-\${workflowId}" data-tab="tools">Tools</button>
            </div>
          \`;
          
          contextBar.querySelector('.back-to-workflows')?.addEventListener('click', () => {
            // Navigate back to workflows page, preserving the selected workflow
            window.location.href = '/workflows?selected=' + encodeURIComponent(workflowId);
          });
          
          // Tab view
          const explainerWrapper = document.createElement('div');
          explainerWrapper.innerHTML = renderWorkflowGuidance(workflowId) || '';
          
          const tabView = explainerWrapper.querySelector('.workflow-tab-view');
          const tabTriggers = contextBar.querySelector('.workflow-tab-triggers');
          const contentArea = $('content-area');
          
          if (tabView && tabTriggers && contentArea) {
            const toolsPanel = tabView.querySelector('#tab-panel-tools-' + workflowId);
            if (toolsPanel) {
              // Ensure content area is in the tools panel
              if (!toolsPanel.contains(contentArea)) {
                toolsPanel.appendChild(contentArea);
              }
              contentArea.className = 'content-area tool-mode';
              // Start with content area hidden (How to use tab active)
              contentArea.style.display = 'none';
            }
            
            this.setupTabSwitching(tabTriggers, tabView, workflowId);
          } else if (contentArea) {
            // If tab view doesn't exist, ensure content area is visible
            contentArea.className = 'content-area tool-mode';
            contentArea.style.display = 'flex';
          }
          
          // Add tools section
          const addToolsSection = document.createElement('div');
          addToolsSection.className = 'add-tools-section';
          addToolsSection.innerHTML = \`
            <button class="add-tools-toggle">
              <span>+ Add tools from other workflows</span>
            </button>
            <div class="add-tools-panel">
              <h4>Other Workflows</h4>
              <div class="other-workflows-list" id="other-workflows-list"></div>
            </div>
          \`;
          
          const toggle = addToolsSection.querySelector('.add-tools-toggle');
          const panel = addToolsSection.querySelector('.add-tools-panel');
          toggle?.addEventListener('click', () => {
            panel?.classList.toggle('visible');
          });
          
          container.appendChild(contextBar);
          if (explainerWrapper.innerHTML) {
            container.appendChild(explainerWrapper);
          }
          container.appendChild(addToolsSection);
          
          return container;
        },
        
        updateToolSelectionView(toolView, workflowId, workflowName) {
          const contextInfo = toolView.querySelector('.workflow-context-info h3');
          const badge = toolView.querySelector('.workflow-badge');
          if (contextInfo) contextInfo.textContent = workflowName || '';
          if (badge) badge.textContent = workflowId || '';
          
          // Update tab triggers
          const tabTriggers = toolView.querySelector('.workflow-tab-triggers');
          if (tabTriggers) {
            const triggers = tabTriggers.querySelectorAll('.workflow-tab-trigger');
            triggers.forEach((trigger, index) => {
              trigger.setAttribute('aria-controls', index === 0 ? 'tab-panel-howto-' + workflowId : 'tab-panel-tools-' + workflowId);
            });
          }
          
          // Update tab view
          const existingTabView = toolView.querySelector('.workflow-tab-view');
          if (existingTabView) {
            existingTabView.remove();
          }
          
          const updatedExplainer = document.createElement('div');
          updatedExplainer.innerHTML = renderWorkflowGuidance(workflowId) || '';
          if (updatedExplainer.innerHTML) {
            const tabView = updatedExplainer.querySelector('.workflow-tab-view');
            if (tabView) {
              const tabTriggers = toolView.querySelector('.workflow-tab-triggers');
              const contentArea = $('content-area');
              const toolsPanel = tabView.querySelector('#tab-panel-tools-' + workflowId);
              
              if (contentArea && toolsPanel) {
                // Ensure content area is in the tools panel
                if (!toolsPanel.contains(contentArea)) {
                  toolsPanel.appendChild(contentArea);
                }
                contentArea.className = 'content-area tool-mode';
                // Start with content area hidden (How to use tab active)
                contentArea.style.display = 'none';
              } else if (contentArea) {
                // If tools panel doesn't exist, ensure content area is visible
                contentArea.className = 'content-area tool-mode';
                contentArea.style.display = 'flex';
              }
              
              this.setupTabSwitching(tabTriggers, tabView, workflowId);
              toolView.insertBefore(tabView, toolView.children[1]);
            }
          }
        },
        
        setupTabSwitching(tabTriggers, tabView, workflowId) {
          if (!tabTriggers || !tabView) return;
          
          const triggers = Array.from(tabTriggers.querySelectorAll('.workflow-tab-trigger'));
          const panels = Array.from(tabView.querySelectorAll('.workflow-tab-panel'));
          const toolsPanel = tabView.querySelector('#tab-panel-tools-' + workflowId);
          const contentArea = $('content-area');
          
          triggers.forEach((trigger, index) => {
            // Remove existing listeners by cloning
            const newTrigger = trigger.cloneNode(true);
            trigger.parentNode?.replaceChild(newTrigger, trigger);
            
            newTrigger.addEventListener('click', () => {
              // Update all triggers
              triggers.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
              });
              newTrigger.classList.add('active');
              newTrigger.setAttribute('aria-selected', 'true');
              
              // Update all panels
              panels.forEach(p => p.classList.remove('active'));
              
              if (index === 0) {
                // How to use tab
                if (panels[0]) panels[0].classList.add('active');
                if (contentArea) {
                  contentArea.style.display = 'none';
                }
              } else {
                // Tools tab
                if (panels[1]) panels[1].classList.add('active');
                if (contentArea) {
                  // Ensure content area is in tools panel
                  if (toolsPanel && !toolsPanel.contains(contentArea)) {
                    toolsPanel.appendChild(contentArea);
                  }
                  contentArea.className = 'content-area tool-mode';
                  contentArea.style.display = 'flex';
                  // Ensure tools are rendered
                  render();
                }
              }
            });
          });
        },
        
        activateToolsTab(toolView, workflowId) {
          const tabTriggers = toolView?.querySelector('.workflow-tab-triggers');
          const tabView = toolView?.querySelector('.workflow-tab-view');
          const contentArea = $('content-area');
          
          if (!tabTriggers || !tabView || !contentArea) return;
          
          const triggers = Array.from(tabTriggers.querySelectorAll('.workflow-tab-trigger'));
          const panels = Array.from(tabView.querySelectorAll('.workflow-tab-panel'));
          const toolsPanel = tabView.querySelector('#tab-panel-tools-' + workflowId);
          const toolsTrigger = tabTriggers.querySelector('[data-tab="tools"]');
          
          triggers.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          
          if (toolsTrigger) {
            toolsTrigger.classList.add('active');
            toolsTrigger.setAttribute('aria-selected', 'true');
          }
          
          panels.forEach(p => p.classList.remove('active'));
          if (panels[1]) panels[1].classList.add('active');
          
          if (toolsPanel && !toolsPanel.contains(contentArea)) {
            toolsPanel.appendChild(contentArea);
          }
          contentArea.className = 'content-area tool-mode';
          contentArea.style.display = 'flex';
          render();
        },
        
        showWorkflowSelection() {
          // Navigate to workflows page
          window.location.href = '/workflows';
        },
        
        populateOtherWorkflows(currentWorkflowId) {
          const list = $('other-workflows-list');
          if (!list) return;
          
          list.innerHTML = '';
          
          WORKFLOW_GROUPS.forEach(workflow => {
            if (workflow.id === 'all' || workflow.id === currentWorkflowId) return;
            
            const workflowTools = state.tools.filter(t =>
              workflow.toolCategories.includes(t.category) ||
              workflow.tools.includes(t.name)
            );
            const total = workflowTools.length;
            const enabled = workflowTools.filter(t => t.enabled).length;
            
            const item = document.createElement('div');
            item.className = 'other-workflow-item';
            item.innerHTML = \`
              <span class="other-workflow-item-name">\${(workflow.name || '').replace(/</g, '&lt;')}</span>
              <span class="other-workflow-item-count">\${enabled} / \${total}</span>
            \`;
            
            item.addEventListener('click', () => {
              // Enable all tools from this workflow
              const workflowToolNames = new Set([
                ...workflow.tools,
                ...(workflow.toolCategories && workflow.toolCategories.length > 0
                  ? state.tools
                      .filter(t => workflow.toolCategories.includes(t.category))
                      .map(t => t.name)
                  : [])
              ]);
              
              // Enable tools from this workflow
              state.tools.forEach(t => {
                if (workflowToolNames.has(t.name)) {
                  t.enabled = true;
                }
              });
              
              // Re-render to show updated state
              render();
              
              // Update the count for this item
              const updatedEnabled = state.tools.filter(t => 
                workflowToolNames.has(t.name) && t.enabled
              ).length;
              const countEl = item.querySelector('.other-workflow-item-count');
              if (countEl) {
                countEl.textContent = updatedEnabled + ' / ' + total;
              }
            });
            
            list.appendChild(item);
          });
        }
      };
      
      // Event handlers
      function setupEventHandlers() {
        // Search
        const searchInput = $('q');
        if (searchInput) {
          searchInput.oninput = render;
        }
        
        // Reload
        const reloadBtn = $('reload');
        if (reloadBtn) {
          reloadBtn.onclick = loadTools;
        }
        
        // Enable/Disable all
        const enableAllBtn = $('enableAll');
        if (enableAllBtn) {
          enableAllBtn.onclick = () => {
            state.tools.forEach(t => t.enabled = true);
            render();
          };
        }
        
        const disableAllBtn = $('disableAll');
        if (disableAllBtn) {
          disableAllBtn.onclick = () => {
            state.tools.forEach(t => t.enabled = false);
            render();
          };
        }
        
        // Save
        const saveBtn = $('save');
        if (saveBtn) {
          saveBtn.onclick = async () => {
            setStatus('Saving changes...');
            const disabledTools = state.tools.filter(t => !t.enabled).map(t => t.name);
            try {
              const r = await fetch('/api/tools', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({disabledTools}),
              });
              if (r.ok) {
                const j = await r.json();
                const updatedAtEl = $('updatedAt');
                if (updatedAtEl) {
                  updatedAtEl.textContent = new Date().toLocaleTimeString();
                }
                setStatus('Changes saved successfully!');
              } else {
                setStatus('Failed to save changes.');
              }
            } catch (error) {
              setStatus('Failed to save changes.');
              console.error('Error saving tools:', error);
            }
          };
        }
        
        // Guidance handlers
        const guidanceReloadBtn = $('guidanceReload');
        if (guidanceReloadBtn) {
          guidanceReloadBtn.onclick = () => {
            setStatus('Reloading guidance...');
            loadGuidance();
          };
        }
        
        const guidanceSaveBtn = $('guidanceSave');
        if (guidanceSaveBtn) {
          guidanceSaveBtn.onclick = async () => {
            setStatus('Saving guidance...');
            const designEl = $('designGuide');
            const archEl = $('architectureGuide');
            const engEl = $('engineeringGuide');
            const payload = {
              guides: {
                design: {title: 'Design Guide', format: 'markdown', content: designEl?.value || ''},
                architecture: {title: 'Architecture Guide', format: 'markdown', content: archEl?.value || ''},
                engineering: {title: 'Engineering Guide', format: 'markdown', content: engEl?.value || ''},
              },
            };
            try {
              const r = await fetch('/api/guidance', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify(payload),
              });
              if (r.ok) {
                const j = await r.json();
                const updatedAtEl = $('guidanceUpdatedAt');
                if (updatedAtEl) {
                  updatedAtEl.textContent = new Date(j.updatedAt || Date.now()).toLocaleTimeString();
                }
                setStatus('Guidance saved successfully!');
              } else {
                const j = await r.json().catch(() => ({}));
                setStatus(j.error || 'Failed to save guidance.');
              }
            } catch (error) {
              setStatus('Failed to save guidance.');
              console.error('Error saving guidance:', error);
            }
          };
        }
        
        // Sidebar tabs
        $$('.sidebar-tab').forEach(tab => {
          tab.onclick = (e) => {
            const tabElement = e.target;
            const tabName = tabElement.getAttribute('data-tab');
            if (tabName) {
              state.currentView = tabName;
              if (tabName === 'workflows') {
                state.selectedCategory = 'all';
              }
              
              $$('.sidebar-tab').forEach(t => t.classList.remove('active'));
              tabElement.classList.add('active');
              
              $$('.sidebar-pane').forEach(p => p.classList.remove('active'));
              const paneId = tabName === 'workflows' ? 'workflow-groups' : 'tool-categories';
              const pane = $(paneId);
              if (pane) {
                pane.classList.add('active');
              }
              
              render();
            }
          };
        });
      }
      
      // View switching
      function switchView(viewName) {
        const toolsView = $('tools-view');
        const guidanceView = $('guidance-view');
        const toolsMeta = $('toolsMeta');
        const guidanceMeta = $('guidanceMeta');
        const pageTitle = $('pageTitle');
        
        if (viewName === 'guidance') {
          if (toolsView) toolsView.style.display = 'none';
          if (guidanceView) {
            guidanceView.style.display = 'flex';
            guidanceView.classList.add('active');
          }
          if (toolsMeta) toolsMeta.style.display = 'none';
          if (guidanceMeta) guidanceMeta.style.display = 'flex';
          if (pageTitle) pageTitle.textContent = 'Guidance';
          if (!state.guidanceLoaded) {
            loadGuidance();
          }
        } else {
          if (toolsView) toolsView.style.display = 'flex';
          if (guidanceView) {
            guidanceView.style.display = 'none';
            guidanceView.classList.remove('active');
          }
          if (toolsMeta) toolsMeta.style.display = 'flex';
          if (guidanceMeta) guidanceMeta.style.display = 'none';
          if (pageTitle) {
            if (state.selectedWorkflow !== 'all' && state.selectedWorkflow) {
              const workflow = WORKFLOW_GROUPS.find(w => w.id === state.selectedWorkflow);
              pageTitle.textContent = workflow ? 'Workflow: ' + workflow.name : 'Workflows';
            } else {
              pageTitle.textContent = 'Workflows';
            }
          }
        }
      }
      
      // Initialize
      function init() {
        setupEventHandlers();
        
        // Check if we're on a workflow route
        const isWorkflowRoute = typeof currentRoute === 'object' && currentRoute.type === 'workflow';
        const workflowId = isWorkflowRoute ? currentRoute.workflowId : null;
        
        if (currentRoute === 'tools' || currentRoute === 'index' || currentRoute === 'workflows' || isWorkflowRoute) {
          // Set selected workflow from URL before loading tools
          if (isWorkflowRoute && workflowId) {
            state.selectedWorkflow = workflowId;
          } else if (currentRoute === 'workflows') {
            // On workflows page, check URL params for selected workflow
            const urlParams = new URLSearchParams(window.location.search);
            const selectedWorkflowId = urlParams.get('selected');
            if (selectedWorkflowId && selectedWorkflowId !== 'all') {
              state.selectedWorkflow = selectedWorkflowId;
            } else {
              state.selectedWorkflow = 'all';
            }
          }
          
          loadTools().then(() => {
            setTimeout(() => {
              workflowUI.init();
              
              // If we're on a workflow route, automatically select that workflow
              if (workflowId) {
                const workflow = WORKFLOW_GROUPS.find(w => w.id === workflowId);
                if (workflow) {
                  workflowUI.selectWorkflow(workflowId, workflow.name);
                }
              }
            }, 50);
          });
        }
        
        if (currentRoute === 'guidance') {
          switchView('guidance');
          loadGuidance();
        } else {
          switchView('tools');
        }
        
        // Top tab navigation
        $$('.top-tab').forEach(tab => {
          tab.addEventListener('click', (e) => {
            e.preventDefault();
            const view = tab.getAttribute('data-view');
            if (view === 'guidance') {
              window.location.href = '/guidance';
            } else if (view === 'workflows') {
              window.location.href = '/workflows';
            }
          });
        });
      }
      
      // Start when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  `;
}

/**
 * Generates HTML structure
 */
function generateHTML(route: PageRoute): string {
  const isWorkflowRoute = typeof route === 'object' && route.type === 'workflow';
  const pageTitle = isWorkflowRoute
    ? `Workflow: ${route.workflowId}`
    : route === 'tools' ? 'Tool Toggles' 
    : route === 'guidance' ? 'Guidance' 
    : route === 'workflows' ? 'Workflows' 
    : 'Tool Toggles';
  const workflowsTabActive = route === 'tools' || route === 'index' || route === 'workflows' || isWorkflowRoute ? ' active' : '';
  const guidanceTabActive = route === 'guidance' ? ' active' : '';
  
  return `
  <header>
    <div class="header-left">
      <h1 id="pageTitle">${pageTitle}</h1>
      <div class="top-tabs">
        <a href="/workflows" class="top-tab${workflowsTabActive}" data-view="workflows">Workflows</a>
        <a href="/guidance" class="top-tab${guidanceTabActive}" data-view="guidance">Guidance</a>
      </div>
    </div>
    <div class="meta" id="toolsMeta">
      <div class="meta-item" id="workflowNameMeta" style="display: none;">
        <span class="meta-label" id="workflowNameLabel"></span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Enabled</span>
        <span class="meta-value" id="enabledCount">0</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Config</span>
        <span class="meta-value" id="configPath">...</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Last Updated</span>
        <span class="meta-value" id="updatedAt">...</span>
      </div>
    </div>
    <div class="meta" id="guidanceMeta" style="display:none;">
      <div class="meta-item">
        <span class="meta-label">Config</span>
        <span class="meta-value" id="guidanceConfigPath">...</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Version</span>
        <span class="meta-value" id="guidanceVersion">v1</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Last Updated</span>
        <span class="meta-value" id="guidanceUpdatedAt">...</span>
      </div>
    </div>
  </header>
  <main>
    <div id="tools-view">
      <div id="sidebar">
        <div class="sidebar-tabs">
          <div class="sidebar-tab active" data-tab="workflows">Workflow Groups</div>
          <div class="sidebar-tab" data-tab="tools">Tools</div>
        </div>
        <div class="sidebar-content">
          <div id="workflow-groups" class="sidebar-pane active"></div>
          <div id="tool-categories" class="sidebar-pane"></div>
        </div>
      </div>
      <div id="content-area">
        <div class="controls-bar">
          <div class="search-wrapper">
            <input id="q" type="search" placeholder="Filter tools (name/category/description)..." />
          </div>
          <div class="btn-group">

            <button class="primary" id="save">Save Changes</button>
            <button id="reload">Reload</button>
          </div>
        </div>
        <div id="tools-grid"></div>
      </div>
    </div>
    <div id="guidance-view">
      <div class="guidance-header">
        <div class="guidance-warning">Do not store secrets or tokens here. This file may be tracked in git.</div>
        <div class="guidance-actions">
          <button id="guidanceReload">Reload</button>
          <button class="primary" id="guidanceSave">Save Guidance</button>
        </div>
      </div>
      <div class="guidance-body">
        <div class="guidance-card">
          <h2>Design Guide</h2>
          <p>Design system rules, UI patterns, spacing, typography.</p>
          <textarea id="designGuide" placeholder="Markdown guidance for design decisions..."></textarea>
        </div>
        <div class="guidance-card">
          <h2>Architecture Guide</h2>
          <p>System boundaries, data flow, decisions, ADRs.</p>
          <textarea id="architectureGuide" placeholder="Markdown guidance for architecture decisions..."></textarea>
        </div>
        <div class="guidance-card">
          <h2>Engineering Guide</h2>
          <p>Tooling, code style, testing, repo conventions.</p>
          <textarea id="engineeringGuide" placeholder="Markdown guidance for engineering decisions..."></textarea>
        </div>
      </div>
    </div>
  </main>
  <div id="status-toast"></div>
  `;
}

/**
 * Generates the complete HTML page
 */
export function htmlPage(route: PageRoute = 'index'): string {
  const pageTitle = typeof route === 'object' && route.type === 'workflow'
    ? `Workflow: ${route.workflowId}`
    : route === 'tools' ? 'Workflows' 
    : route === 'guidance' ? 'Guidance' 
    : route === 'workflows' ? 'Workflows' 
    : 'Workflows';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chrome DevTools MCP — ${pageTitle}</title>
  <style>
${generateStyles()}
  </style>
</head>
<body>
${generateHTML(route)}
  <script>
${generateScript(route)}
  </script>
</body>
</html>`;
}
