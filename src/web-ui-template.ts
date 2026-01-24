/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {WORKFLOW_GROUPS} from './web-ui-settings.js';

export function htmlPage(): string {
  // Inline HTML/JS to keep this lightweight.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chrome DevTools MCP — Tool Toggles</title>
  <style>
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

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      margin: 0;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
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
    }

    #tools-view {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    #guidance-view {
      flex: 1;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }

    #sidebar {
      width: 260px;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
    }

    .sidebar-pane {
      flex: 1;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      display: none;
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

    /* Radio button styling for workflow groups */
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

    /* Workflow context indicator */
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

    #content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .controls-bar {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-primary);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
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
      position: relative;
      overflow: hidden;
    }

    button::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.1), transparent);
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }

    button:hover {
      background: var(--bg-secondary);
      border-color: rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08);
    }

    button:hover::before {
      opacity: 1;
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
      transform: translateY(-1px);
      opacity: 1;
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
    }

    #status-toast.visible {
      transform: translateY(0);
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

    /* Workflow-first reorganization styles */
    #tools-view {
      display: flex;
      flex-direction: column;
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

    /* Hide sidebar by default, show only when needed */
    #sidebar {
      display: none;
    }

    #sidebar.visible {
      display: flex;
    }

    /* Tool selection view */
    .tool-selection-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .tool-selection-view.hidden {
      display: none;
    }

    .workflow-context-bar {
      padding: 16px 24px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      z-index: 5;
      position: relative;
    }

    .workflow-context-info {
      display: flex;
      align-items: center;
      gap: 12px;
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

    /* Add tools section */
    .add-tools-section {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-primary);
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

    /* Update content area to work with new structure */
    #content-area.workflow-mode {
      display: none;
    }

    #content-area.tool-mode {
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <h1 id="pageTitle">Tool toggles</h1>
      <div class="top-tabs">
        <button class="top-tab active" data-view="tools">Tools</button>
        <button class="top-tab" data-view="guidance">Guidance</button>
      </div>
    </div>
    <div class="meta" id="toolsMeta">
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
            <button id="enableAll">Enable all</button>
            <button id="disableAll">Disable all</button>
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

  <script>
    const WORKFLOW_GROUPS = ${JSON.stringify(WORKFLOW_GROUPS)};
    const WORKFLOW_GUIDANCE = {
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

    function renderWorkflowGuidance(workflowId) {
      const guidance = WORKFLOW_GUIDANCE[workflowId];
      if (!guidance) return '';

      const renderList = (items) => {
        if (!items || !items.length) return '';
        return '<ul>' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
      };

      return \`
        <div class="workflow-explainer">
          <div class="workflow-explainer-section">
            <h4>How to use this workflow</h4>
            \${renderList(guidance.howToUse)}
          </div>
          <div class="workflow-explainer-section">
            <h4>How the AI will use tools</h4>
            \${renderList(guidance.aiToolUse)}
          </div>
        </div>
      \`;
    }
    const $ = (id) => document.getElementById(id);
    let tools = [];
    let selectedCategory = 'all';
    let currentView = 'workflows'; // 'workflows' or 'tools'
    let selectedWorkflow = 'all';
    let guidanceLoaded = false;

    function setStatus(msg) {
      const toast = $('status-toast');
      if (msg) {
        toast.textContent = msg;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 2000);
      }
    }

    async function loadTools() {
      const r = await fetch('/api/tools');
      const j = await r.json();
      tools = j.tools || [];
      $('configPath').textContent = j.configPath.split('/').pop() || '';
      $('configPath').title = j.configPath;
      $('updatedAt').textContent = new Date(j.updatedAt).toLocaleTimeString();
      render();
    }

    async function loadGuidance() {
      const r = await fetch('/api/guidance');
      if (!r.ok) {
        setStatus('Failed to load guidance.');
        return;
      }
      const j = await r.json();
      $('guidanceConfigPath').textContent = (j.configPath || '').split('/').pop() || '';
      $('guidanceConfigPath').title = j.configPath || '';
      $('guidanceUpdatedAt').textContent = j.updatedAt ? new Date(j.updatedAt).toLocaleTimeString() : '...';
      $('guidanceVersion').textContent = 'v' + (j.version || 1);
      $('designGuide').value = j.guides?.design?.content ?? '';
      $('architectureGuide').value = j.guides?.architecture?.content ?? '';
      $('engineeringGuide').value = j.guides?.engineering?.content ?? '';
      guidanceLoaded = true;
    }

    function render() {
      const q = ($('q').value || '').toLowerCase().trim();
      const grid = $('tools-grid');
      const workflowGroups = $('workflow-groups');
      const toolCategories = $('tool-categories');

      // Update search placeholder based on context
      const searchInput = $('q');
      if (selectedWorkflow !== 'all' && currentView === 'tools') {
        const workflow = WORKFLOW_GROUPS.find(w => w.id === selectedWorkflow);
        searchInput.placeholder = "Filter tools in " + (workflow ? workflow.name : 'selected workflow') + "...";
      } else {
        searchInput.placeholder = "Filter tools (name/category/description)...";
      }

      const totalTools = tools.length;
      const enabledTools = tools.filter(t => t.enabled).length;
      $('enabledCount').textContent = enabledTools.toString();

      let filtered = [];
      let allowedCategories = [];
      let allowedTools = [];

      if (currentView === 'workflows') {
        if (selectedWorkflow === 'all') {
          allowedCategories = [...new Set(tools.map(t => t.category))];
        } else {
          const workflow = WORKFLOW_GROUPS.find(w => w.id === selectedWorkflow);
          allowedCategories = workflow ? workflow.toolCategories : [];
          allowedTools = workflow ? workflow.tools : [];
        }
      }

      filtered = tools.filter(t => {
        const matchesQuery = !q ||
               (t.name || '').toLowerCase().includes(q) ||
               (t.category || '').toLowerCase().includes(q) ||
               (t.description || '').toLowerCase().includes(q);

        let matchesSelection = false;
        if (currentView === 'tools') {
          matchesSelection = selectedCategory === 'all' || t.category === selectedCategory;
        } else { // workflows
          matchesSelection = selectedWorkflow === 'all' ||
            allowedCategories.includes(t.category) ||
            allowedTools.includes(t.name);
        }

        return matchesQuery && matchesSelection;
      });

      // Update Sidebar based on current view
      if (currentView === 'workflows') {
        let html = '<div class="workflow-radio-group">';

        // All workflows option
        const allSelected = selectedWorkflow === 'all' ? ' selected' : '';
        const allChecked = selectedWorkflow === 'all' ? ' checked' : '';
        const allEnabled = tools.filter(t => t.enabled).length;
        const allTotal = tools.length;
        html += '<div class="workflow-radio-item' + allSelected + '">' +
          '<input type="radio" id="workflow-all" name="workflow-group" value="all"' + allChecked + '>' +
          '<label for="workflow-all">All Workflows</label>' +
          '<span class="count">' + allEnabled + ' / ' + allTotal + '</span>' +
          '</div>';

        // Individual workflow options
        WORKFLOW_GROUPS.forEach(workflow => {
          const workflowTools = tools.filter(t =>
            workflow.toolCategories.includes(t.category) ||
            workflow.tools.includes(t.name)
          );
          const total = workflowTools.length;
          const enabled = workflowTools.filter(t => t.enabled).length;
          const selected = selectedWorkflow === workflow.id ? ' selected' : '';
          const checked = selectedWorkflow === workflow.id ? ' checked' : '';

          html += '<div class="workflow-radio-item' + selected + '" title="' + workflow.description + '">' +
            '<input type="radio" id="workflow-' + workflow.id + '" name="workflow-group" value="' + workflow.id + '"' + checked + '>' +
            '<label for="workflow-' + workflow.id + '">' + workflow.name + '</label>' +
            '<span class="count">' + enabled + ' / ' + total + '</span>' +
            '</div>';
        });

        html += '</div>';
        workflowGroups.innerHTML = html;

        // Add event listeners for radio buttons
        document.querySelectorAll('input[name="workflow-group"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            selectedWorkflow = e.target.value;
            
            // When a workflow group is selected (not "all"), enable only its tools
            if (selectedWorkflow !== 'all') {
              const workflow = WORKFLOW_GROUPS.find(w => w.id === selectedWorkflow);
              if (workflow) {
                // Get all tools that belong to this workflow
                // Include tools explicitly listed in workflow.tools
                // Include tools whose category matches workflow.toolCategories
                const workflowToolNames = new Set([
                  ...workflow.tools,
                  ...(workflow.toolCategories && workflow.toolCategories.length > 0
                    ? tools
                        .filter(t => workflow.toolCategories.includes(t.category))
                        .map(t => t.name)
                    : [])
                ]);
                
                // Enable only workflow tools, disable all others
                tools.forEach(t => {
                  t.enabled = workflowToolNames.has(t.name);
                });
              }
            }
            
            render();
          });
        });
      } else { // tools view
        toolCategories.innerHTML = '';

        // Show workflow context if a specific workflow is selected
        if (selectedWorkflow !== 'all') {
          const workflow = WORKFLOW_GROUPS.find(w => w.id === selectedWorkflow);
          if (workflow) {
            const workflowTools = tools.filter(t =>
              workflow.toolCategories.includes(t.category) ||
              workflow.tools.includes(t.name)
            );
            const total = workflowTools.length;
            const enabled = workflowTools.filter(t => t.enabled).length;

            const contextDiv = document.createElement('div');
            contextDiv.className = 'workflow-context';
            contextDiv.innerHTML =
              '<strong>' + workflow.name + '</strong>: ' + enabled + ' of ' + total + ' tools enabled' +
              '<br><small>' + workflow.description + '</small>';
            toolCategories.appendChild(contextDiv);
          }
        }

        const categories = ['all', ...new Set(tools.map(t => t.category))].sort();
        categories.forEach(cat => {
          const item = document.createElement('div');
          item.className = 'sidebar-item' + (selectedCategory === cat ? ' active' : '');
          const categoryTools = cat === 'all' ? tools : tools.filter(t => t.category === cat);
          const total = categoryTools.length;
          const enabled = categoryTools.filter(t => t.enabled).length;
          item.innerHTML = \`<span>\${cat.charAt(0).toUpperCase() + cat.slice(1)}</span> <span class="count">\${enabled} / \${total}</span>\`;
          item.onclick = () => {
            selectedCategory = cat;
            render();
          };
          toolCategories.appendChild(item);
        });
      }

      // Update Grid
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
        if (selectedCategory === 'all') {
          const title = document.createElement('div');
          title.className = 'category-title';

          // Show workflow context in category titles when applicable
          if (selectedWorkflow !== 'all' && currentView === 'tools') {
            const workflow = WORKFLOW_GROUPS.find(w => w.id === selectedWorkflow);
            title.innerHTML = cat + " <small>(in " + (workflow ? workflow.name : 'selected workflow') + ")</small>";
          } else {
            title.textContent = cat;
          }

          grid.appendChild(title);
        }

        const items = byCategory.get(cat).sort((a,b) => a.name.localeCompare(b.name));
        items.forEach(t => {
          const card = document.createElement('div');
          card.className = 'tool-card';
          
          // Build parameters HTML if available
          let parametersHtml = '';
          if (t.parameters && Object.keys(t.parameters).length > 0) {
            const paramsList = Object.entries(t.parameters).map(([name, param]) => {
              const isRequired = param.required || false;
              let type = param.type || 'unknown';
              // Format enum values if present
              if (param.enum && param.enum.length > 0) {
                type = 'enum: ' + param.enum.map(v => '"' + v + '"').join(', ');
              }
              const desc = param.description || '';
              const requiredBadge = isRequired ? '<span class="required">*</span>' : '<span class="optional">(optional)</span>';
              const descHtml = desc ? '<div class="parameter-desc">' + desc.replace(/</g, '&lt;') + '</div>' : '';
              return '<div class="parameter-item">' +
                '<div class="parameter-name">' + name + requiredBadge + '</div>' +
                '<div class="parameter-type">' + type + '</div>' +
                descHtml +
                '</div>';
            }).join('');
            
            parametersHtml = '<div class="parameters-accordion">' +
              '<div class="parameters-header" data-tool="' + t.name + '">Parameters</div>' +
              '<div class="parameters-content" data-content="' + t.name + '">' +
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
                '<div class="tool-name">' + t.name + '</div>' +
                badgeHtml +
              '</div>' +
              '<label class="switch">' +
                '<input type="checkbox" ' + checkedAttr + ' data-tool="' + t.name + '">' +
                '<span class="slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="tool-desc">' + (t.description || '').replace(/</g, '&lt;') + '</div>' +
            parametersHtml;
          
          const cb = card.querySelector('input[type="checkbox"]');
          cb.onchange = (e) => {
            t.enabled = e.target.checked;
            render();
          };
          
          // Add accordion toggle functionality
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
          
          grid.appendChild(card);
        });
      });
    }

    // Tab switching
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.onclick = (e) => {
        const tabElement = e.target;
        const tabName = tabElement.getAttribute('data-tab');
        if (tabName) {
          currentView = tabName;
          // Don't reset workflow selection when switching to tools view
          if (tabName === 'workflows') {
            selectedCategory = 'all';
          }

          // Update active tab
          document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
          tabElement.classList.add('active');

          // Update active pane
          document.querySelectorAll('.sidebar-pane').forEach(p => p.classList.remove('active'));
          $(tabName === 'workflows' ? 'workflow-groups' : 'tool-categories').classList.add('active');

          render();
        }
      };
    });

    $('q').oninput = render;
    $('reload').onclick = loadTools;
    $('enableAll').onclick = () => { tools.forEach(t => t.enabled = true); render(); };
    $('disableAll').onclick = () => { tools.forEach(t => t.enabled = false); render(); };

    $('save').onclick = async () => {
      setStatus('Saving changes...');
      const disabledTools = tools.filter(t => !t.enabled).map(t => t.name);
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({disabledTools}),
      });
      if (r.ok) {
        const j = await r.json();
        $('updatedAt').textContent = new Date().toLocaleTimeString();
        setStatus('Changes saved successfully!');
      } else {
        setStatus('Failed to save changes.');
      }
    };

    $('guidanceReload').onclick = () => {
      setStatus('Reloading guidance...');
      loadGuidance();
    };

    $('guidanceSave').onclick = async () => {
      setStatus('Saving guidance...');
      const payload = {
        guides: {
          design: {title: 'Design Guide', format: 'markdown', content: $('designGuide').value || ''},
          architecture: {title: 'Architecture Guide', format: 'markdown', content: $('architectureGuide').value || ''},
          engineering: {title: 'Engineering Guide', format: 'markdown', content: $('engineeringGuide').value || ''},
        },
      };
      const r = await fetch('/api/guidance', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const j = await r.json();
        $('guidanceUpdatedAt').textContent = new Date(j.updatedAt || Date.now()).toLocaleTimeString();
        setStatus('Guidance saved successfully!');
      } else {
        const j = await r.json().catch(() => ({}));
        setStatus(j.error || 'Failed to save guidance.');
      }
    };

    document.querySelectorAll('.top-tab').forEach(tab => {
      tab.onclick = (e) => {
        const target = e.target;
        const view = target.getAttribute('data-view');
        if (!view) {
          return;
        }
        document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
        target.classList.add('active');
        const showTools = view === 'tools';
        $('tools-view').style.display = showTools ? 'flex' : 'none';
        $('guidance-view').style.display = showTools ? 'none' : 'flex';
        $('toolsMeta').style.display = showTools ? 'flex' : 'none';
        $('guidanceMeta').style.display = showTools ? 'none' : 'flex';
        $('pageTitle').textContent = showTools ? 'Tool toggles' : 'Guidance';
        if (!showTools && !guidanceLoaded) {
          loadGuidance();
        }
      };
    });

    // Workflow-first reorganization JavaScript
    (function() {
      'use strict';
      
      // Get workflow data from existing DOM
      function getWorkflowData() {
        const workflowItems = document.querySelectorAll('#workflow-groups .workflow-radio-item');
        const workflows = [];
        
        workflowItems.forEach(item => {
          const radio = item.querySelector('input[type="radio"]');
          const label = item.querySelector('label');
          const count = item.querySelector('.count');
          const title = item.getAttribute('title') || '';
          
          if (radio && label) {
            workflows.push({
              id: radio.id.replace('workflow-', ''),
              value: radio.value,
              name: label.textContent.trim(),
              count: count ? count.textContent.trim() : '',
              description: title,
              enabled: radio.checked
            });
          }
        });
        
        return workflows;
      }
      
      // Create workflow selection view
      function createWorkflowSelectionView(workflows) {
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
        
        workflows.forEach(workflow => {
          if (workflow.value === 'all') return; // Skip "All Workflows"
          
          const card = document.createElement('div');
          card.className = 'workflow-card';
          card.dataset.workflowId = workflow.id;
          card.dataset.workflowValue = workflow.value;
          
          card.innerHTML = \`
            <div class="workflow-card-header">
              <h3 class="workflow-card-title">\${workflow.name}</h3>
              <span class="workflow-card-count">\${workflow.count}</span>
            </div>
            \${workflow.description ? \`<p class="workflow-card-desc">\${workflow.description}</p>\` : ''}
            <div class="workflow-card-footer">
              <span class="workflow-card-action">Select workflow</span>
            </div>
          \`;
          
          card.addEventListener('click', () => {
            selectWorkflow(workflow.value, workflow.name);
          });
          
          grid.appendChild(card);
        });
        
        container.appendChild(header);
        container.appendChild(grid);
        
        return container;
      }
      
      // Create tool selection view
      function createToolSelectionView(workflowValue, workflowName) {
        const container = document.createElement('div');
        container.className = 'tool-selection-view';
        container.id = 'tool-selection-view';
        
        // Context bar
        const contextBar = document.createElement('div');
        contextBar.className = 'workflow-context-bar';
        contextBar.innerHTML = \`
          <div class="workflow-context-info">
            <button class="back-to-workflows">Back</button>
            <h3>\${workflowName}</h3>
            <span class="workflow-badge">\${workflowValue}</span>
          </div>
        \`;
        
        contextBar.querySelector('.back-to-workflows').addEventListener('click', () => {
          showWorkflowSelection();
        });

        const explainerWrapper = document.createElement('div');
        explainerWrapper.innerHTML = renderWorkflowGuidance(workflowValue) || '';
        
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
        
        toggle.addEventListener('click', () => {
          panel.classList.toggle('visible');
        });
        
        // Content area (reuse existing)
        const contentArea = document.getElementById('content-area');
        if (contentArea) {
          contentArea.className = 'content-area tool-mode';
        }
        
        container.appendChild(contextBar);
        if (explainerWrapper.innerHTML) {
          container.appendChild(explainerWrapper);
        }
        container.appendChild(addToolsSection);
        if (contentArea) {
          container.appendChild(contentArea);
        }
        
        return container;
      }
      
      // Select workflow and show tools
      function selectWorkflow(workflowValue, workflowName) {
        // Hide workflow selection
        const workflowView = document.getElementById('workflow-selection-view');
        if (workflowView) {
          workflowView.classList.add('hidden');
        }
        
        // Show tool selection
        let toolView = document.getElementById('tool-selection-view');
        if (!toolView) {
          toolView = createToolSelectionView(workflowValue, workflowName);
          const toolsView = document.getElementById('tools-view');
          if (toolsView) {
            toolsView.appendChild(toolView);
          }
        } else {
          toolView.classList.remove('hidden');
          // Update context
          const contextInfo = toolView.querySelector('.workflow-context-info h3');
          const badge = toolView.querySelector('.workflow-badge');
          if (contextInfo) contextInfo.textContent = workflowName;
          if (badge) badge.textContent = workflowValue;
          const existingExplainer = toolView.querySelector('.workflow-explainer');
          if (existingExplainer) {
            existingExplainer.parentElement.removeChild(existingExplainer);
          }
          const updatedExplainer = document.createElement('div');
          updatedExplainer.innerHTML = renderWorkflowGuidance(workflowValue) || '';
          if (updatedExplainer.innerHTML) {
            toolView.insertBefore(updatedExplainer.firstElementChild, toolView.children[1]);
          }
        }
        
        // Trigger workflow selection in existing code
        const radio = document.querySelector(\`input[type="radio"][value="\${workflowValue}"]\`);
        if (radio) {
          radio.click();
        }
        
        // Populate other workflows list
        populateOtherWorkflows(workflowValue);
      }
      
      // Show workflow selection
      function showWorkflowSelection() {
        const workflowView = document.getElementById('workflow-selection-view');
        const toolView = document.getElementById('tool-selection-view');
        
        if (workflowView) {
          workflowView.classList.remove('hidden');
        }
        if (toolView) {
          toolView.classList.add('hidden');
        }
        
        // Reset to "all" workflow
        const allRadio = document.querySelector('input[type="radio"][value="all"]');
        if (allRadio) {
          allRadio.click();
        }
      }
      
      // Populate other workflows list
      function populateOtherWorkflows(currentWorkflowValue) {
        const list = document.getElementById('other-workflows-list');
        if (!list) return;
        
        list.innerHTML = '';
        const workflows = getWorkflowData();
        
        workflows.forEach(workflow => {
          if (workflow.value === 'all' || workflow.value === currentWorkflowValue) return;
          
          const item = document.createElement('div');
          item.className = 'other-workflow-item';
          item.innerHTML = \`
            <span class="other-workflow-item-name">\${workflow.name}</span>
            <span class="other-workflow-item-count">\${workflow.count}</span>
          \`;
          
          item.addEventListener('click', () => {
            // Add tools from this workflow
            const radio = document.querySelector(\`input[type="radio"][value="\${workflow.value}"]\`);
            if (radio) {
              radio.click();
              // Then switch back to current workflow
              setTimeout(() => {
                const currentRadio = document.querySelector(\`input[type="radio"][value="\${currentWorkflowValue}"]\`);
                if (currentRadio) {
                  currentRadio.click();
                }
              }, 100);
            }
          });
          
          list.appendChild(item);
        });
      }
      
      // Initialize workflow-first UI
      function initWorkflowFirstUI() {
        const workflows = getWorkflowData();
        const toolsView = document.getElementById('tools-view');
        
        if (!toolsView) return;
        
        // Check if already initialized
        if (document.getElementById('workflow-selection-view')) return;
        
        // Hide sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          sidebar.classList.remove('visible');
        }
        
        // Hide content area initially
        const contentArea = document.getElementById('content-area');
        if (contentArea) {
          contentArea.classList.add('workflow-mode');
        }
        
        // Create and show workflow selection
        const workflowView = createWorkflowSelectionView(workflows);
        toolsView.insertBefore(workflowView, toolsView.firstChild);
      }
      
      // Hook into render to initialize after first render
      const originalRender = render;
      render = function() {
        originalRender();
        // Initialize workflow-first UI after first render
        if (!document.getElementById('workflow-selection-view')) {
          setTimeout(() => {
            initWorkflowFirstUI();
          }, 50);
        }
      };
    })();

    loadTools();
    loadGuidance();
  </script>
</body>
</html>`;
}

