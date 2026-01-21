## Tool toggles web UI (persistent tool enable/disable)

When you have “too many tools” exposed at once, you can start a small local web UI to enable/disable tools and persist the selection to disk as JSON.

### How it works
- The server registers all tools, but each tool can be **enabled/disabled** at runtime.
- Disabled tools:
  - are omitted from `tools/list`
  - cannot be called (server returns “Tool … disabled”)
- Toggling tools triggers an MCP `tools/list_changed` notification (clients that support it can refresh their tool registry automatically).

### UI features
- Tools are **grouped by category**.
- Each category has a **tri-state** checkbox (on / off / mixed).
- Category headers also include **Enable** / **Disable** buttons.
- Global **Expand all** / **Collapse all** controls help manage long tool lists.

### Start the UI

```bash
npm run start -- --web-ui
```

By default the MCP server starts the web UI automatically. If you want to run the MCP server **without** the web UI:

```bash
npm run start -- --no-web-ui
```

### Config file location
- Default: `./.chrome-devtools-mcp-tools.json` (relative to the server working directory)
- Override:

```bash
npm run start -- --web-ui --tool-config /absolute/path/to/tools.json
```

### Bind host / port

```bash
npm run start -- --web-ui --web-ui-host 127.0.0.1 --web-ui-port 7332
```


