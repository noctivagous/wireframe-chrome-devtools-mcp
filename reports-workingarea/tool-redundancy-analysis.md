# Tool Redundancy Analysis and Consolidation Recommendations

**Date:** 2026-01-22  
**Total Tools:** 57  
**Categories:** 11

## Executive Summary

This report analyzes the Chrome DevTools MCP server toolset for redundancies and provides recommendations for consolidation. The analysis identifies **15-20 tools** that could be removed, merged, or simplified, potentially reducing the tool count by **26-35%** while maintaining or improving functionality.

## Key Findings

### High-Priority Redundancies

#### 1. **Snapshot Tools (4 tools → 2 tools)**

**Current State:**
- `take_snapshot` - Text-based a11y tree snapshot
- `take_screenshot` - Visual screenshot (PNG/JPEG/WebP)
- `svg_snapshot` - SVG wireframe visualization
- `wireframe_snapshot` - Structural wireframe data

**Analysis:**
- `take_snapshot` and `take_screenshot` serve different purposes (text vs visual) - **KEEP BOTH**
- `svg_snapshot` and `wireframe_snapshot` are highly redundant:
  - Both use the same underlying `DOMSnapshot.captureSnapshot`
  - `svg_snapshot` is essentially `wireframe_snapshot` + SVG rendering
  - The SVG can be generated client-side from wireframe data

**Recommendation:**
- **Merge `svg_snapshot` into `wireframe_snapshot`** with an optional `format: 'json' | 'svg'` parameter
- **Keep `take_snapshot` and `take_screenshot`** as they serve distinct purposes
- **Result:** 4 tools → 3 tools (25% reduction in snapshot category)

---

#### 2. **JavaScript Evaluation (2 tools → 1 tool)**

**Current State:**
- `evaluate_script` - Simple script evaluation with JSON return
- `js_console` - Enhanced console with persistence, multi-line, context isolation

**Analysis:**
- `js_console` is a superset of `evaluate_script` functionality
- `evaluate_script` has simpler API but `js_console` can handle all use cases
- Both execute JavaScript in page context
- `js_console` with `persist: false` and `context: 'page'` is equivalent to `evaluate_script`

**Recommendation:**
- **Remove `evaluate_script`** and enhance `js_console` documentation to show simple use cases
- **Add migration guide** showing how `evaluate_script` calls map to `js_console`
- **Result:** 2 tools → 1 tool (50% reduction)

---

#### 3. **CSS/JS Preview Tools (4 tools → 2 tools)**

**Current State:**
- `insert_css` - Insert CSS with rollback support
- `insert_css_preview` - Insert CSS with auto-rollback and visual feedback
- `insert_js` - Insert JS with rollback support
- `insert_js_preview` - Insert JS with auto-rollback and visual feedback

**Analysis:**
- Preview tools are wrappers around base tools with:
  - Automatic rollback after snapshot
  - Multiple value testing
  - Visual wireframe feedback
- The preview functionality could be parameters on the base tools
- Auto-rollback can be achieved with `rollback_patch` after snapshot

**Recommendation:**
- **Add `autoRollback` and `preview` parameters to `insert_css` and `insert_js`**
- **Remove `insert_css_preview` and `insert_js_preview`**
- **Result:** 4 tools → 2 tools (50% reduction)

**Alternative (Conservative):**
- Keep preview tools but mark as "convenience wrappers" in documentation
- Add deprecation notice suggesting use of base tools with parameters

---

#### 4. **Click Tools (2 tools → 1 tool)**

**Current State:**
- `click` - Click element by uid
- `click_at` - Click at coordinates (requires `computerVision` condition)

**Analysis:**
- `click_at` is conditionally available (only with computerVision)
- `click` can be extended to support coordinates
- Coordinate-based clicking is less reliable than element-based

**Recommendation:**
- **Merge into `click`** with optional `coordinates: {x, y}` parameter
- **Keep uid-based clicking as primary method**
- **Result:** 2 tools → 1 tool (50% reduction in input category)

---

#### 5. **Edit Session Management (11 tools → 7-8 tools)**

**Current State:**
- `begin_edit_session` - Start session
- `list_edit_sessions` - List all sessions
- `get_edit_session` - Get specific session
- `set_active_edit_session` - Set active session
- `clear_edit_session` - Delete session
- `export_edit_session` - Export as JSON
- `export_edit_session_package` - Export as package folder
- `summarize_edit_session` - Generate markdown summary
- `preview_commit_plan` - Preview what will be written
- `apply_commit_plan` - Apply previewed changes
- `commit_edit_session_to_files` - Best-effort append to files

**Analysis:**
- `get_edit_session` and `list_edit_sessions` could be merged (list with optional filter)
- `export_edit_session` and `export_edit_session_package` are similar (package is just JSON + markdown)
- `summarize_edit_session` could be a parameter on export tools
- `preview_commit_plan` and `apply_commit_plan` are a good pair - **KEEP**
- `commit_edit_session_to_files` is less safe but useful - **KEEP**

**Recommendation:**
- **Merge `get_edit_session` into `list_edit_sessions`** with optional `sessionId` filter
- **Merge `export_edit_session_package` into `export_edit_session`** with `format: 'json' | 'package'` parameter
- **Add `includeSummary` parameter to export tools** instead of separate `summarize_edit_session`
- **Result:** 11 tools → 8 tools (27% reduction)

---

#### 6. **Diff Tools (2 tools → 1 tool)**

**Current State:**
- `apply_unified_diff` - Apply git-style diff to files
- `preview_diff_from_commit_plan` - Generate diff from commit plan

**Analysis:**
- `preview_diff_from_commit_plan` generates diffs, `apply_unified_diff` applies them
- These are complementary, not redundant
- However, `preview_diff_from_commit_plan` could be a parameter on `preview_commit_plan`

**Recommendation:**
- **Add `outputFormat: 'plan' | 'diff'` parameter to `preview_commit_plan`**
- **Remove `preview_diff_from_commit_plan`**
- **Keep `apply_unified_diff`** as it's a core building block
- **Result:** 2 tools → 1 tool (in diff category, but functionality preserved)

---

### Medium-Priority Redundancies

#### 7. **Console Tools (3 tools → 2 tools)**

**Current State:**
- `list_console_messages` - List all messages
- `get_console_message` - Get specific message by ID
- `js_console` - Interactive console (already covered above)

**Analysis:**
- `get_console_message` is a convenience wrapper
- Could be merged into `list_console_messages` with optional `msgid` filter

**Recommendation:**
- **Merge `get_console_message` into `list_console_messages`** with optional `msgid` parameter
- **Result:** 3 tools → 2 tools (33% reduction)

---

#### 8. **Network Tools (2 tools - KEEP)**

**Current State:**
- `list_network_requests` - List all requests
- `get_network_request` - Get specific request

**Analysis:**
- Similar pattern to console tools, but network requests are more complex
- `get_network_request` supports saving large bodies to files
- **Recommendation: KEEP BOTH** - the file saving feature justifies separation

---

#### 9. **Prototype Export (1 tool - KEEP)**

**Current State:**
- `export_prototype_state` - Export page as HTML/CSS/JS

**Analysis:**
- Unique functionality, not redundant
- **Recommendation: KEEP**

---

### Low-Priority / Edge Cases

#### 10. **Performance Tools (5 tools - REVIEW)**

**Current State:**
- `performance_start_trace` - Start trace
- `performance_stop_trace` - Stop trace
- `performance_analyze_insight` - Analyze insight
- `monitor_performance` - Real-time monitoring
- `analyze_js` - JS code analysis

**Analysis:**
- Start/stop trace are a natural pair - **KEEP**
- `analyze_js` is separate from performance tools - **KEEP**
- `monitor_performance` and `performance_analyze_insight` could potentially be merged

**Recommendation:**
- **Review usage patterns** - if `monitor_performance` is rarely used, consider removing
- **Keep trace tools** as they're core functionality
- **Result:** Potentially 5 tools → 4 tools (20% reduction)

---

## Consolidation Strategy

### Phase 1: Low-Risk Consolidations (Immediate)

1. **Merge `get_edit_session` into `list_edit_sessions`**
   - Low risk, clear migration path
   - Reduces: 11 → 10 tools

2. **Merge `get_console_message` into `list_console_messages`**
   - Low risk, similar pattern
   - Reduces: 3 → 2 tools

3. **Merge `svg_snapshot` into `wireframe_snapshot`**
   - Medium risk, requires parameter addition
   - Reduces: 4 → 3 tools

**Phase 1 Total: 57 → 54 tools (5% reduction)**

### Phase 2: Medium-Risk Consolidations (After Phase 1 validation)

4. **Remove `evaluate_script`, use `js_console` only**
   - Medium risk, requires documentation updates
   - Reduces: 54 → 53 tools

5. **Merge preview tools into base tools**
   - Medium risk, API changes required
   - Reduces: 53 → 51 tools

6. **Merge export tools**
   - Low risk, parameter addition
   - Reduces: 51 → 50 tools

**Phase 2 Total: 54 → 50 tools (12% total reduction)**

### Phase 3: Higher-Risk Consolidations (Future consideration)

7. **Merge `click_at` into `click`**
   - Higher risk, coordinate support needed
   - Reduces: 50 → 49 tools

8. **Review performance tools**
   - Requires usage analytics
   - Potential: 49 → 48 tools

**Phase 3 Total: 50 → 48 tools (16% total reduction)**

---

## Implementation Recommendations

### 1. **Add Tool Usage Analytics**

Before removing tools, track:
- Tool call frequency
- User patterns
- Error rates
- Feature overlap

### 2. **Deprecation Strategy**

For tools being removed:
1. Mark as deprecated in tool description
2. Add migration guide
3. Support for 2-3 versions
4. Provide clear error messages pointing to replacement

### 3. **Parameter-Based Consolidation**

Instead of separate tools, use parameters:
- `format: 'json' | 'svg'` for wireframe output
- `autoRollback: boolean` for preview behavior
- `sessionId?: string` for filtering

### 4. **Documentation Updates**

- Update all examples
- Create migration guides
- Update USAGE_GUIDE.md
- Update tool reference docs

---

## Risk Assessment

### Low Risk
- Merging list/get patterns (console, edit sessions)
- Adding optional parameters to existing tools

### Medium Risk
- Removing `evaluate_script` (requires user migration)
- Merging preview tools (API changes)

### High Risk
- Removing tools with no clear migration path
- Breaking changes without deprecation period

---

## Benefits of Consolidation

1. **Reduced Cognitive Load**
   - Fewer tools to learn
   - Clearer mental model
   - Less decision fatigue

2. **Easier Maintenance**
   - Less code to maintain
   - Fewer edge cases
   - Simpler testing

3. **Better Discoverability**
   - Fewer tools in lists
   - More focused functionality
   - Clearer tool purposes

4. **Improved Consistency**
   - Unified patterns
   - Consistent APIs
   - Better documentation

---

## Tools to Keep (No Changes)

These tools are well-designed and serve unique purposes:

- **Input automation:** `fill`, `fill_form`, `drag`, `hover`, `press_key`, `simulate_event`, `upload_file`
- **Navigation:** `navigate_page`, `new_page`, `close_page`, `select_page`, `list_pages`, `wait_for`
- **Emulation:** `emulate`, `resize_page`
- **Network:** `list_network_requests`, `get_network_request` (with file saving)
- **Patch:** `rollback_patch`, `rollback_all`
- **Chatbox:** `inject_chatbox`, `chatbox_step`
- **State:** `inspect_state`
- **Prototype:** `export_prototype_state`
- **Batch:** `batch_ops`
- **Diff:** `apply_unified_diff`
- **Performance:** `performance_start_trace`, `performance_stop_trace`, `analyze_js`

---

## Summary Table

| Category | Current | After Phase 1 | After Phase 2 | After Phase 3 | Reduction |
|----------|---------|---------------|---------------|---------------|-----------|
| Snapshot | 4 | 3 | 3 | 3 | 25% |
| Script Eval | 2 | 2 | 1 | 1 | 50% |
| CSS/JS Insert | 4 | 4 | 2 | 2 | 50% |
| Click | 2 | 2 | 2 | 1 | 50% |
| Edit Session | 11 | 10 | 8 | 8 | 27% |
| Diff | 2 | 2 | 1 | 1 | 50% |
| Console | 3 | 2 | 2 | 2 | 33% |
| Performance | 5 | 5 | 5 | 4 | 20% |
| **Total** | **57** | **54** | **50** | **48** | **16%** |

---

## Next Steps

1. **Immediate:** Implement Phase 1 consolidations
2. **Short-term:** Add usage analytics to inform Phase 2
3. **Medium-term:** Implement Phase 2 with proper deprecation
4. **Long-term:** Evaluate Phase 3 based on usage data

---

## Appendix: Tool Inventory

### Current Tool Count by Category

- **Input automation:** 9 tools
- **Navigation automation:** 6 tools
- **Emulation:** 2 tools
- **Performance:** 5 tools
- **Network:** 2 tools
- **Snapshot:** 4 tools
- **Edit Session:** 11 tools
- **Patch:** 2 tools
- **Chatbox:** 2 tools
- **Debugging:** 14 tools
- **Extensions:** 4 tools (conditional)

**Total: 57 tools** (excluding conditional extensions)

---

*Report generated: 2026-01-22*  
*Analysis based on codebase review and tool definitions*

