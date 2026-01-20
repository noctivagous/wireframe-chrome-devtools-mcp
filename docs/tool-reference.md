<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (9 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`press_key`](#press_key)
  - [`simulate_event`](#simulate_event)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (6 tools)
  - [`close_page`](#close_page)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (2 tools)
  - [`emulate`](#emulate)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (4 tools)
  - [`monitor_performance`](#monitor_performance)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (16 tools)
  - [`analyze_js`](#analyze_js)
  - [`evaluate_script`](#evaluate_script)
  - [`get_console_message`](#get_console_message)
  - [`insert_css`](#insert_css)
  - [`insert_css_preview`](#insert_css_preview)
  - [`insert_js`](#insert_js)
  - [`inspect_state`](#inspect_state)
  - [`js_console`](#js_console)
  - [`list_console_messages`](#list_console_messages)
  - [`manipulate_dom`](#manipulate_dom)
  - [`rollback_all`](#rollback_all)
  - [`rollback_patch`](#rollback_patch)
  - [`svg_snapshot`](#svg_snapshot)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)
  - [`wireframe_snapshot`](#wireframe_snapshot)

## Input automation

### `click`

**Description:** Clicks on the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into

---

### `fill`

**Description:** Type text into a input, text area or select an option from a &lt;select&gt; element.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to [`fill`](#fill) in

---

### `fill_form`

**Description:** [`Fill`](#fill) out multiple form elements at once

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.

---

### `handle_dialog`

**Description:** If a browser dialog was opened, use this command to handle it

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Whether to dismiss or accept the dialog
- **promptText** (string) _(optional)_: Optional prompt text to enter into the dialog.

---

### `hover`

**Description:** [`Hover`](#hover) over the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `press_key`

**Description:** Press a key or key combination. Use this when other input methods like [`fill`](#fill)() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

**Parameters:**

- **key** (string) **(required)**: A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta

---

### `simulate_event`

**Description:** Simulate user interactions for testing by dispatching DOM events. Supports basic events, complex input sequences, and mouse interactions with coordinates.

**Parameters:**

- **eventType** (string) **(required)**: The type of event to simulate (e.g., "[`click`](#click)", "input", "mousedown", "mouseup", "mousemove")
- **coordinates** (unknown) _(optional)_: Coordinates for mouse events. If selector is provided, coordinates are relative to the element; otherwise relative to viewport.
- **dragTo** (unknown) _(optional)_: Coordinates to [`drag`](#drag) to (requires mousedown eventType and coordinates)
- **options** (unknown) _(optional)_: Event options
- **selector** (string) _(optional)_: CSS selector for the target element. Optional when using coordinates.
- **sequence** (array) _(optional)_: Sequence of events to dispatch in order (e.g., ["focus", "input", "change", "blur"])
- **value** (string) _(optional)_: Value to set for input events

---

### `upload_file`

**Description:** Upload a file through a provided element.

**Parameters:**

- **filePath** (string) **(required)**: The local path of the file to upload
- **uid** (string) **(required)**: The uid of the file input element or an element that will open file chooser on the page from the page content snapshot

---

## Navigation automation

### `close_page`

**Description:** Closes the page by its index. The last open page cannot be closed.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** Get a list of pages open in the browser.

**Parameters:** None

---

### `navigate_page`

**Description:** Navigates the currently selected page to a URL.

**Parameters:**

- **handleBeforeUnload** (enum: "accept", "decline") _(optional)_: Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept.
- **ignoreCache** (boolean) _(optional)_: Whether to ignore cache on reload.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigate the page by URL, back or forward in history, or reload.
- **url** (string) _(optional)_: Target URL (only type=url)

---

### `new_page`

**Description:** Creates a new page

**Parameters:**

- **url** (string) **(required)**: URL to load in a new page.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to select. Call [`list_pages`](#list_pages) to get available pages.
- **bringToFront** (boolean) _(optional)_: Whether to focus the page and bring it to the top.

---

### `wait_for`

**Description:** Wait for the specified text to appear on the selected page.

**Parameters:**

- **text** (string) **(required)**: Text to appear on the page
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

## Emulation

### `emulate`

**Description:** Emulates various features on the selected page.

**Parameters:**

- **cpuThrottlingRate** (number) _(optional)_: Represents the CPU slowdown factor. Set the rate to 1 to disable throttling. If omitted, throttling remains unchanged.
- **geolocation** (unknown) _(optional)_: Geolocation to [`emulate`](#emulate). Set to null to clear the geolocation override.
- **networkConditions** (enum: "No emulation", "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Throttle network. Set to "No emulation" to disable. If omitted, conditions remain unchanged.

---

### `resize_page`

**Description:** Resizes the selected page's window so that the page has specified dimension

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `monitor_performance`

**Description:** Real-time performance monitoring with metrics like FPS, memory usage, and DOM node count. Supports duration-based monitoring and trigger-based monitoring.

**Parameters:**

- **customMarks** (array) _(optional)_: Custom performance marks to record during monitoring.
- **duration** (integer) _(optional)_: Duration in milliseconds to monitor performance. If not specified, monitors until manually stopped.
- **interval** (integer) _(optional)_: Interval in milliseconds between performance measurements. Default: 1000ms.
- **metrics** (array) _(optional)_: Performance metrics to monitor. Available: fps, memory, dom-nodes, layout-shifts, network-requests.
- **script** (string) _(optional)_: Optional JavaScript code to execute during monitoring. Performance marks will be placed around this script.
- **trigger** (enum: "scroll", "click", "navigation", "input") _(optional)_: Event that triggers the start of monitoring. If specified, monitoring begins when this event occurs.

---

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"
- **insightSetId** (string) **(required)**: The id for the specific insight set. Only use the ids given in the "Available insight sets" list.

---

### `performance_start_trace`

**Description:** Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

**Parameters:**

- **autoStop** (boolean) **(required)**: Determines if the trace recording should be automatically stopped.
- **reload** (boolean) **(required)**: Determines if, once tracing has started, the page should be automatically reloaded.
- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).

---

### `performance_stop_trace`

**Description:** Stops the active performance trace recording on the selected page.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).

---

## Network

### `get_network_request`

**Description:** Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

**Guidance:**

- **Saving request/response bodies to disk**: Use `requestFilePath` and `responseFilePath` to save large request/response bodies directly to files instead of returning them inline. This is useful for binary content, large JSON payloads, or when you want to preserve exact formatting.
- **Currently selected request**: When `reqid` is omitted, returns details for whichever request is currently highlighted/selected in the DevTools Network panel. If nothing is selected, the tool returns a short message instead of a request.

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.
- **requestFilePath** (string) _(optional)_: The absolute or relative path to save the request body to. If omitted, the body is returned inline.
- **responseFilePath** (string) _(optional)_: The absolute or relative path to save the response body to. If omitted, the body is returned inline.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true to return the preserved requests over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

## Debugging

### `analyze_js`

**Description:** Analyze JavaScript code quality and detect errors on the current page. Supports various analysis types including code coverage, dependencies, errors, performance, and general issues.

**Parameters:**

- **analysis** (enum: "coverage", "dependencies", "errors", "performance", "issues") **(required)**: Type of JavaScript analysis to perform
- **categories** (array) _(optional)_: Categories of issues to detect
- **includeLibraries** (boolean) _(optional)_: Whether to include external libraries in the analysis (only applies to coverage, dependencies, and performance analysis)
- **reportFormat** (enum: "summary", "detailed") _(optional)_: Format of the analysis report
- **severity** (enum: "warning", "error") _(optional)_: Minimum severity level for issues

---

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.

**Parameters:**

- **function** (string) **(required)**: A JavaScript function declaration to be executed by the tool in the currently selected page.
Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
Example with arguments: `(el) => {
  return el.innerText;
}`

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.

---

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages

---

### `insert_css`

**Description:** Insert a &lt;style&gt; tag into the current page with a patch id for later rollback.

**Parameters:**

- **cssText** (string) **(required)**: CSS text to insert into the page.
- **description** (string) _(optional)_: Optional human description to store in the patch registry.
- **patchId** (string) _(optional)_: Optional patch id. If omitted, the server generates a stable patch id.
- **replaceExisting** (boolean) _(optional)_: If true, replaces an existing patch with the same patchId. If false, insertion is a no-op if patchId exists.

---

### `insert_css_preview`

**Description:** Insert CSS changes and automatically generate visual wireframe feedback wrapped in JSON. Supports testing multiple values, responsive breakpoints, and before/after comparisons.

**Guidance:**

- **Auto-rollback by default**: Changes are automatically rolled back after capturing snapshots (`autoRollback` defaults to `true`), making this safe for temporary CSS experimentation without affecting the live page state.
- **Multiple values for A/B testing**: Pass an array of different values to `values` (e.g., `["16px", "24px", "32px"]`) to quickly compare how different CSS values affect layout, with each value generating a separate wireframe snapshot for comparison.

**Parameters:**

- **property** (string) **(required)**: CSS property to modify (e.g., "margin-bottom", "gap", "padding").
- **selector** (string) **(required)**: CSS selector to target elements.
- **values** (array) **(required)**: Array of CSS values to test. Each value will be applied and visually previewed.
- **autoRollback** (boolean) _(optional)_: If true, automatically rolls back CSS changes after capturing snapshots.
- **filePath** (string) _(optional)_: Optional path to save detailed results. If not provided, results are returned in the response.
- **highlightChanges** (boolean) _(optional)_: If true, highlights changed elements in the visual snapshots.
- **responsiveBreakpoints** (array) _(optional)_: Optional responsive breakpoints to test. Will resize viewport and capture snapshots for each.
- **showDimensions** (boolean) _(optional)_: If true, shows width×height dimensions on elements in the wireframe.
- **showVisual** (boolean) _(optional)_: If true, automatically generates SVG wireframe snapshots for visual feedback.

---

### `insert_js`

**Description:** Insert a &lt;script&gt; tag into the current page with a patch id for later rollback.

**Parameters:**

- **jsText** (string) **(required)**: JavaScript text to insert into the page.
- **description** (string) _(optional)_: Optional human description to store in the patch registry.
- **patchId** (string) _(optional)_: Optional patch id. If omitted, the server generates a stable patch id.
- **replaceExisting** (boolean) _(optional)_: If true, replaces an existing patch with the same patchId. Note: replacement may re-execute the script.

---

### `inspect_state`

**Description:** Inspect application state including browser storage, global variables, and framework-specific component state.
Supports filtering by patterns and framework-specific inspection for React, Vue, Angular, and Svelte components.

**Examples:**

- **Browser storage**: `targets: ["localStorage", "sessionStorage"]`, `filter: "user*"`, `maxItems: 50`
- **Global variables**: `targets: ["global-variables"]`, `filter: "window.app*"`, `includeValues: true`
- **React components**: `targets: ["framework-components"]`, `framework: "react"`, `componentSelector: ".todo-list"`, `inspect: ["props", "state"]`
- **Vue components**: `targets: ["framework-components"]`, `framework: "vue"`, `componentSelector: "[data-vue]"`, `inspect: ["data", "computed"]`
- **Angular components**: `targets: ["framework-components"]`, `framework: "angular"`, `componentSelector: "app-todo-list"`, `inspect: ["props", "methods"]`
- **Svelte components**: `targets: ["framework-components"]`, `framework: "svelte"`, `componentSelector: ".svelte-component"`, `inspect: ["props", "state"]`

**Guidance:**

- **componentSelector expectations**: This tool runs `document.querySelectorAll(componentSelector)` and inspects the matched elements. For React it looks for React fiber fields on the element (`__reactFiber$...`). For Angular it checks for `__ngContext__`. For Vue it checks for `__vue__` (Vue 2-style). For Svelte it checks for element keys that start with `$$`. Results are best-effort and may vary by framework version/build mode.
- **Typical filter patterns**: `filter` supports `*` (any substring) and `?` (single character), and is applied case-insensitively to storage keys and global variable names (not framework component inspection). Examples: `"user*"`, `"*token*"`, `"app.*"`, `"debug?flag"`.

**Parameters:**

- **targets** (array) **(required)**: Types of state to inspect. Can include browser storage, global variables, or framework components.
- **componentSelector** (string) _(optional)_: CSS selector to find components to inspect. Required when framework is specified.
- **filter** (string) _(optional)_: Pattern to filter results (supports wildcards like "todo*"). Applies to keys/names in storage and global variables.
- **framework** (enum: "react", "vue", "angular", "svelte") _(optional)_: Framework type for component inspection. Required when inspecting framework components.
- **includeValues** (boolean) _(optional)_: Whether to include actual values in the response. Set to false for large datasets.
- **inspect** (array) _(optional)_: What to inspect in framework components (props, state, hooks, etc.). Required when framework is specified.
- **maxItems** (integer) _(optional)_: Maximum number of items to return per target type.

---

### `js_console`

**Description:** Enhanced interactive JavaScript environment with persistent sessions, multi-line script support, and context isolation for advanced debugging and development.

**Parameters:**

- **script** (string) **(required)**: The JavaScript code to execute. Supports multi-line scripts and maintains context across calls when persist is true.
- **context** (enum: "page", "isolated") _(optional)_: Execution context: "page" executes in the page context, "isolated" executes in a clean environment without page variables.
- **persist** (boolean) _(optional)_: Whether to maintain console session context across multiple calls. When true, variables and functions persist between executions.
- **returnResult** (boolean) _(optional)_: Whether to return the result of the script execution. Set to false to execute code for side effects only.
- **sessionId** (string) _(optional)_: Optional session identifier. When provided with persist=true, maintains context for this specific session.

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all requests.
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.

---

### `manipulate_dom`

**Description:** Perform DOM manipulations on web pages including setting styles, adding/removing classes, inserting/removing elements, and batch operations.

**Parameters:**

- **action** (enum: "set-style", "add-class", "remove-class", "remove-element", "insert-html") _(optional)_: Single DOM manipulation action to perform.
- **className** (string) _(optional)_: CSS class name for add-class/remove-class actions.
- **description** (string) _(optional)_: Optional human description for the patch registry.
- **html** (string) _(optional)_: HTML content to insert for insert-html action.
- **operations** (array) _(optional)_: Array of DOM operations to perform in batch.
- **patchId** (string) _(optional)_: Optional patch id for rollback. If omitted, generates a stable patch id.
- **position** (enum: "beforebegin", "afterbegin", "beforeend", "afterend") _(optional)_: Position for insert-html action relative to the selected element. Defaults to "beforeend".
- **properties** (unknown) _(optional)_: CSS properties and values for set-style action. E.g., {"margin-bottom": "32px", "padding": "16px"}
- **selector** (string) _(optional)_: CSS selector to target elements for the action.

---

### `rollback_all`

**Description:** Rollback (remove) all patches inserted by this MCP server in the current page.

**Parameters:**

- **includeRegistryOnly** (boolean) _(optional)_: If true, only clears the server-side registry for the current page without touching the DOM.

---

### `rollback_patch`

**Description:** Rollback (remove) a previously inserted patch by patchId in the current page.

**Parameters:**

- **patchId** (string) **(required)**: Patch id previously returned by [`insert_css`](#insert_css)/[`insert_js`](#insert_js).

---

### `svg_snapshot`

**Description:** Render a visual SVG wireframe of the current page (or a subset of elements). Uses the same underlying snapshot as [`wireframe_snapshot`](#wireframe_snapshot), but returns the SVG content wrapped in JSON for better parseability.

**Parameters:**

- **background** (enum: "transparent", "white", "black") _(optional)_: Background [`fill`](#fill) for the SVG canvas.
- **compareWith** (string) _(optional)_: Optional previous wireframe JSON (from [`wireframe_snapshot`](#wireframe_snapshot)) to compare against. When provided with highlightChanged=true, changed rects are highlighted.
- **computedStylePreset** (enum: "minimal", "layout", "standard", "debug", "typography", "paint") _(optional)_: Computed style whitelist preset used when computedStyleWhitelist is not provided.
- **computedStyleWhitelist** (array) _(optional)_: Override computed style whitelist. If provided, stylePreset is ignored.
- **coordinateSpace** (enum: "viewport", "document") _(optional)_: Coordinate space for rendering: viewport (scroll-adjusted) or document (absolute page coordinates, viewBox set to current viewport window).
- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the SVG output to instead of attaching it to the response.
- **fillOpacity** (number) _(optional)_: [`Fill`](#fill) opacity for element rectangles.
- **highlightChanged** (boolean) _(optional)_: If true, highlights elements whose rect changed compared to compareWith.
- **includeComputedStyles** (boolean) _(optional)_: If true, includes a whitelist of computed styles for each element via DOMSnapshot.captureSnapshot (also used for optional diff/analysis).
- **includeDescendants** (boolean) _(optional)_: When used with selectors, includes matching elements’ descendants as well (within scopeSelector if provided).
- **includeLayoutAssertions** (boolean) _(optional)_: If true, adds a small derived layoutAssertions section (e.g., overflow offenders).
- **includePseudoElements** (boolean) _(optional)_: If true, includes pseudo-element nodes (e.g. ::before/::after) when present in the DOMSnapshot.
- **includeShadowDom** (boolean) _(optional)_: If true, attempts to include and query into open shadow roots under the scope root (best-effort).
- **includeTextSnippets** (boolean) _(optional)_: If true, includes best-effort textSnippet fields when available in the snapshot (bounded).
- **maxDepth** (integer) _(optional)_: Limit traversal depth (0 means only the scope root itself when scopeSelector is provided).
- **maxElements** (integer) _(optional)_: Legacy alias for maxTotal. Prefer maxTotal.
- **maxPerSelector** (integer) _(optional)_: When multiple selectors are provided, cap the number of matches per selector (best-effort).
- **maxTotal** (integer) _(optional)_: Maximum number of elements to render (after filtering).
- **scale** (number) _(optional)_: Scale factor applied to the output SVG dimensions.
- **scopeSelector** (string) _(optional)_: Optional CSS selector that constrains results to elements within this scope element.
- **scrollToSelector** (string) _(optional)_: Optional CSS selector to scroll into view before capture.
- **scrollToY** (number) _(optional)_: Optional Y scroll position to set before capture (document coordinates).
- **selectors** (array) _(optional)_: Optional CSS selectors. When provided, the snapshot is filtered to these elements (not their descendants unless includeDescendants is true).
- **showDimensions** (boolean) _(optional)_: If true, draws width×height labels for each box.
- **showLabels** (boolean) _(optional)_: If true, draws tag/id/class labels in the top-left of each box.
- **showSpacing** (boolean) _(optional)_: If true, visualizes margins, padding, and gaps between elements.
- **strokeWidth** (number) _(optional)_: Stroke width for element rectangles.
- **stylePreset** (enum: "minimal", "layout", "standard", "debug", "typography", "paint") _(optional)_: Deprecated alias for computedStylePreset. Prefer computedStylePreset.
- **textSnippetMaxLength** (integer) _(optional)_: Maximum length for textSnippet when includeTextSnippets is true.

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **verbose** (boolean) _(optional)_: Whether to include all possible information available in the full a11y tree. Default is false.

---

### `wireframe_snapshot`

**Description:** Capture a compact, deterministic wireframe snapshot of the currently selected page using CDP DOMSnapshot.captureSnapshot. Returns element rects (and optionally a small set of computed styles) suitable for overlap/gap analysis.

**Guidance:**

- **selectors vs scopeSelector**: Use `selectors` to filter down to specific elements (or element groups). Use `scopeSelector` to constrain results to a subtree (descendants of a container). They can be combined: `selectors` are resolved within the `scopeSelector` root.
- **maxTotal truncation**: `maxTotal` is applied after all filters. The snapshot is returned in a deterministic order and sets `truncated: true` when the cap is hit. If you’re debugging a component subtree, prefer narrowing with `scopeSelector` and increasing `maxTotal`.
- **Computed styles (computedStylePreset / computedStyleWhitelist)**: These only apply when `includeComputedStyles: true`. Use `computedStylePreset: "layout"` for UI/layout debugging; use `"debug"` when you also need extra diagnostics; use `computedStyleWhitelist` for an explicit list.

**Parameters:**

- **compareWith** (string) _(optional)_: Optional previous wireframe JSON (from [`wireframe_snapshot`](#wireframe_snapshot)) to compare against. Adds diff metadata to the output.
- **computedStylePreset** (enum: "minimal", "layout", "standard", "debug", "typography", "paint") _(optional)_: Computed style whitelist preset used when computedStyleWhitelist is not provided.
- **computedStyleWhitelist** (array) _(optional)_: Override computed style whitelist. If provided, stylePreset is ignored.
- **coordinateSpace** (enum: "viewport", "document") _(optional)_: Coordinate space for returned rects: viewport (scroll-adjusted) or document (page coordinates).
- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the JSON output to instead of returning it inline.
- **includeComputedStyles** (boolean) _(optional)_: If true, includes a whitelist of computed styles for each element via DOMSnapshot.captureSnapshot.
- **includeDescendants** (boolean) _(optional)_: When used with selectors, includes matching elements’ descendants as well (within scopeSelector if provided).
- **includeDiff** (boolean) _(optional)_: If true, includes diff metadata (changed/added/removed). Defaults to true when compareWith is provided.
- **includeLayoutAssertions** (boolean) _(optional)_: If true, adds a small derived layoutAssertions section (e.g., overflow offenders).
- **includePseudoElements** (boolean) _(optional)_: If true, includes pseudo-element nodes (e.g. ::before/::after) when present in the DOMSnapshot.
- **includeShadowDom** (boolean) _(optional)_: If true, attempts to include and query into open shadow roots under the scope root (best-effort).
- **includeTextSnippets** (boolean) _(optional)_: If true, includes best-effort textSnippet fields when available in the snapshot (bounded).
- **maxDepth** (integer) _(optional)_: Limit traversal depth (0 means only the scope root itself when scopeSelector is provided).
- **maxElements** (integer) _(optional)_: Legacy alias for maxTotal. Prefer maxTotal.
- **maxPerSelector** (integer) _(optional)_: When multiple selectors are provided, cap the number of matches per selector (best-effort).
- **maxTotal** (integer) _(optional)_: Maximum number of elements to return (after filtering).
- **scopeSelector** (string) _(optional)_: Optional CSS selector that constrains results to elements within this scope element.
- **scrollToSelector** (string) _(optional)_: Optional CSS selector to scroll into view before capture.
- **scrollToY** (number) _(optional)_: Optional Y scroll position to set before capture (document coordinates).
- **selectors** (array) _(optional)_: Optional CSS selectors. When provided, the snapshot is filtered to these elements (not their descendants unless includeDescendants is true).
- **stylePreset** (enum: "minimal", "layout", "standard", "debug", "typography", "paint") _(optional)_: Deprecated alias for computedStylePreset. Prefer computedStylePreset.
- **textSnippetMaxLength** (integer) _(optional)_: Maximum length for textSnippet when includeTextSnippets is true.

---
