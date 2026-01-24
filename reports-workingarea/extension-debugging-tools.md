# Extension Debugging Tools: Research & Feasibility

This document summarizes research (via Brave Search and the Chrome DevTools Protocol) on **adding MCP tools for debugging Chrome extensions**—including **reloading**, **reinstalling**, **uninstalling**, and related workflows. The wireframe-chrome-devtools MCP integrates with Chromium’s developer interface over CDP, so extension lifecycle control fits naturally alongside existing DevTools-backed tools.

---

## Current State in This Project

- **`install_extension`** already exists. It installs an unpacked extension from a filesystem path and returns the extension ID.
- It uses **Puppeteer’s `Browser.installExtension(path)`**, which calls CDP **`Extensions.loadUnpacked`**.
- The **Extensions** tool category exists; extension-related tools are gated by `--allow-extensions` / `categoryExtensions` and require **`enableExtensions: true`** when launching Chrome (so `--enable-unsafe-extension-debugging` is set).
- The MCP launches Chrome with **`pipe: true`** (i.e. `--remote-debugging-pipe`), which is required for the CDP Extensions domain.

---

## Chrome DevTools Protocol (CDP) Extensions Domain

The **Extensions** domain ([Chrome DevTools Protocol – Extensions](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)) provides:

| Method | Purpose |
|--------|---------|
| **`Extensions.loadUnpacked`** | Install unpacked extension from path → returns extension ID |
| **`Extensions.uninstall`** | Uninstall an **unpacked** extension by ID |
| **`Extensions.getStorageItems`** | Read extension storage (session/local/sync/managed) |
| **`Extensions.removeStorageItems`** | Remove storage keys |
| **`Extensions.clearStorageItems`** | Clear storage |
| **`Extensions.setStorageItems`** | Write extension storage |

**Requirements:**

- Client must connect with **`--remote-debugging-pipe`** (this project uses `pipe: true`).
- **`--enable-unsafe-extension-debugging`** must be set (Puppeteer adds this when `enableExtensions: true`).

**Limitations:**

- **No `Extensions.reload`**. The protocol does not define a reload command.
- **`uninstall`** applies only to **unpacked** extensions, not Web Store installs.

---

## Reloading Extensions: How It Works Today

Because there is no CDP “reload” method, reload is implemented by **running `chrome.runtime.reload()` inside the extension’s own context**:

1. Use **`Target.getTargets`** to list CDP targets.
2. Find the target(s) for the extension:
   - **Manifest V2**: `type === "background_page"`, `url` starts with `chrome-extension://<id>/`.
   - **Manifest V3**: `type === "service_worker"`, same URL prefix.
3. **`Target.attachToTarget`** for that target → obtain a `sessionId`.
4. Send **`Runtime.evaluate`** to that session with `expression: "chrome.runtime.reload()"`.

This is exactly what **[extreload](https://github.com/teddywing/extreload)** (Manifest V2) and **[swextreload](https://github.com/teddywing/swextreload)** (Manifest V3) do: they talk to Chrome over the DevTools Protocol (WebSocket), filter extension targets (e.g. background pages for MV2, service workers for MV3), attach, and evaluate `chrome.runtime.reload()`. They work for both automation (e.g. file watchers) and manual reload-by-id. Note that swextreload is a rewrite of extreload specifically for Manifest V3 extensions, as extreload doesn't work reliably with MV3.

**Implications for this MCP:**

- Reload is ** feasible ** without any new CDP APIs.
- We need the **browser-level** CDP connection (e.g. Puppeteer’s `browser.connection()`), not just a page session:
  - `Target.getTargets` and `Target.attachToTarget` are sent on the **browser** connection.
  - `Runtime.evaluate` is sent to the **attached** session (the extension’s background/service worker).
- The MCP already has access to the Puppeteer `Browser` (e.g. via `McpContext`); the browser exposes `connection()` for raw CDP.

**Flag Requirements for `reload_extension`:**
- **No additional flags required**: The Target and Runtime domain methods (`Target.getTargets`, `Target.attachToTarget`, `Runtime.evaluate`) used by `reload_extension` are standard CDP methods that work with any CDP connection. They do **not** require `--enable-unsafe-extension-debugging` or any other special flags beyond standard CDP access (which requires `--remote-debugging-pipe`, already set via `pipe: true` in this project).
- **Same session flag as other extension tools**: However, `reload_extension` is only useful when an extension is already installed. Installing extensions requires `--enable-unsafe-extension-debugging` (set via `enableExtensions: true`). Therefore, `reload_extension` will typically be used in the same session where `install_extension` or other extension tools are used, meaning it will run with the same `--enable-unsafe-extension-debugging` flag already enabled for the Extensions category.
- **Implications**: Since `reload_extension` doesn't require a different flag, it can be added to the Extensions category without changing the launch configuration. The existing `enableExtensions: true` behavior (when `categoryExtensions` is enabled) is sufficient. No separate flag toggle or session restart is needed.

---

## Reinstalling Extensions

“Reinstall” here means: **uninstall the extension, then install it again from the same unpacked path**.

- **Uninstall**: CDP **`Extensions.uninstall`** (by extension ID). Only unpacked extensions.
- **Install**: CDP **`Extensions.loadUnpacked`** (by path).

So **reinstall = uninstall(id) + loadUnpacked(path)**. We need **both** the extension ID and the path. A tool like `reinstall_extension(id, path)` could wrap that. The path is the same unpacked directory used for `install_extension`.

---

## Chrome DevTools MCP Upstream Alignment

**[ChromeDevTools/chrome-devtools-mcp#96](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/96)** is a feature request for **browser extension development and debugging**:

- **Lifecycle**: install, **reload**, uninstall, etc.
- **Inspection**: service workers, side panel, popups, etc.

The issue explicitly mentions:

- **`install_extension`** → `Extensions.loadUnpacked` (already in this project).
- **`uninstall_extension`** → `Extensions.uninstall`.
- **`reload_extension`** → “Reloads an extension to apply any changes.”

Adding **`uninstall_extension`** and **`reload_extension`** would align this MCP with that direction and with real-world workflows (e.g. [extreload](https://github.com/teddywing/extreload) for Manifest V2, [swextreload](https://github.com/teddywing/swextreload) for Manifest V3, [Extension Development – Auto Reloader](https://chromewebstore.google.com/detail/extension-development-aut/falghmjeljhgmccbpffloemnfnmikked)).

---

## Other Extension APIs (Not CDP)

- **`chrome.management`**: `setEnabled`, `uninstall`, etc. These run **inside** a Chrome extension. The MCP drives Chrome from **outside** via CDP, so we do not use these directly. We use CDP instead (e.g. `Extensions.uninstall`).
- **`chrome.runtime.reload()`**: Invoked **inside** the extension. We trigger it via CDP `Runtime.evaluate` in the extension’s context, as above.
- **`chrome.devtools.inspectedWindow.reload()`**: Reloads the **inspected page**, not the extension itself.

---

## Recommendations

### 1. Add **`uninstall_extension`** (extension ID)

- **Implementation**: Call Puppeteer’s `browser.uninstallExtension(id)`, which uses **`Extensions.uninstall`**.
- **Effort**: Low. The API exists; we only need to expose it as an MCP tool (e.g. in `extensions.ts`) and ensure the Extensions category / `enableExtensions` is used when launching.

### 2. Add **`reload_extension`** (extension ID)

- **Implementation**: Use the **Target + Runtime** approach:
  1. `Target.getTargets` on the browser connection.
  2. Find the extension’s `background_page` (MV2) or `service_worker` (MV3) target by `chrome-extension://<id>/`.
  3. `Target.attachToTarget` → get `sessionId`.
  4. `Runtime.evaluate` in that session with `chrome.runtime.reload()`.
  5. Optionally `Target.detachFromTarget` to clean up.
- **Effort**: Medium. Requires using the browser-level CDP connection and handling attach/evaluate/detach. Must support both MV2 and MV3 target types.
- **Flag requirements**: No additional flags needed beyond what's already required for extension tools. The Target and Runtime domain methods work with standard CDP access (`--remote-debugging-pipe`, already set). Since `reload_extension` is only useful when extensions are installed, it will run in the same session with `--enable-unsafe-extension-debugging` (via `enableExtensions: true`), but this is the same flag already used by `install_extension` and other extension tools. No session restart or separate flag configuration is needed.

### 3. Optionally add **`reinstall_extension`** (extension ID, path)

- **Implementation**: `Extensions.uninstall` by ID, then `Extensions.loadUnpacked` by path. Return the new extension ID.
- **Effort**: Low, once `uninstall_extension` and `install_extension` are available.

### 4. Optional: Extension storage tools

- **`Extensions.getStorageItems`** / **`setStorageItems`** / **`removeStorageItems`** / **`clearStorageItems`** can support debugging storage (e.g. options, state). These are natural candidates for future “extension debugging” tools.

### 5. Ensure **`enableExtensions`** when using extension tools

- Extension CDP methods require **`--enable-unsafe-extension-debugging`**. The project already passes `enableExtensions` into the launcher when the Extensions category is enabled. Keep that behavior and document that **extension tools require `--allow-extensions`** (or equivalent) so that `enableExtensions` is true.

---

## Summary

| Tool | CDP / mechanism | Feasibility |
|------|------------------|-------------|
| **install_extension** | `Extensions.loadUnpacked` | ✅ Already implemented |
| **uninstall_extension** | `Extensions.uninstall` | ✅ Easy; expose existing Puppeteer API |
| **reload_extension** | `Target.getTargets` → `attachToTarget` → `Runtime.evaluate("chrome.runtime.reload()")` | ✅ Feasible; same pattern as extreload (MV2) and swextreload (MV3) |
| **reinstall_extension** | `uninstall` + `loadUnpacked` | ✅ Easy once uninstall exists |
| Extension storage | `Extensions.getStorageItems` etc. | ✅ Possible future addition |

**Yes, you can add tools to this project for debugging Chrome extensions**—including **reloading** and **reinstalling** unpacked extensions—by combining the CDP Extensions domain with the Target and Runtime domains, as used by extreload (Manifest V2) and swextreload (Manifest V3). The main technical requirement is using the **browser-level** CDP connection for Target attach and the attached session for `Runtime.evaluate`.

---

## References

- [Chrome DevTools Protocol – Extensions domain](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)
- [Puppeteer – Chrome Extensions](https://pptr.dev/guides/chrome-extensions) (`installExtension`, `uninstallExtension`, `pipe`, `enableExtensions`)
- [extreload](https://github.com/teddywing/extreload) – Reload Manifest V2 extensions via CDP (Target + Runtime.evaluate)
- [swextreload](https://github.com/teddywing/swextreload) – Reload Manifest V3 extensions via CDP (Target + Runtime.evaluate); rewrite of extreload for MV3 support
- [ChromeDevTools/chrome-devtools-mcp#96](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/96) – Extension development and debugging feature request
- [Mozilla web-ext #3388](https://github.com/mozilla/web-ext/issues/3388) – Migrating from `--load-extension` to `Extensions.loadUnpacked`

