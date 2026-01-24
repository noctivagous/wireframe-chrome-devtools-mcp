# Software Guidance: `design_guide`, `arch_guide`, `engin_guide`

This report explains the three proposed "guidance tools" from `reports/software-guidance.txt`, and how to implement them in this project (`README.md`, `USAGE_GUIDE.md`) using the existing MCP server + the existing tool-toggles web UI.

The significance of these guidance tools extends far beyond simple documentation—they represent a fundamental shift in how AI agents approach software development. Rather than treating each coding task as an isolated prompt-response cycle, guidance systems establish **persistent, queryable knowledge bases** that maintain consistency across an entire development lifecycle.

---

## Why these three guides exist (the deeper significance)

`reports/software-guidance.txt` identifies a systemic failure in current AI agent approaches to software development that leads to chaotic, inconsistent, and ultimately unmaintainable codebases. The core insight is that AI agents, when left to their own devices, exhibit fundamental behavioral patterns that undermine long-term software quality:

### The AI Agent Consistency Crisis

Without structured guidance, AI agents default to **opportunistic generation**—creating solutions from scratch rather than leveraging established patterns, libraries, or architectural decisions. This manifests as:

- **Random stack selection**: Each task becomes an independent decision point, leading to inconsistent technology choices (different CSS frameworks, icon sets, fonts, and UI patterns across the same project)
- **Documentation neglect**: Agents rarely proactively search existing documentation or codebase patterns, resulting in reinvention of established solutions
- **Architectural drift**: Without explicit boundaries and constraints, agents accumulate "prompt-driven patches" that gradually transform clean architectures into tangled, hard-to-maintain systems
- **Design system fragmentation**: Visual and interaction patterns become inconsistent, eroding user experience quality over time

### The Solution: Queryable, Customizable Guidance Systems

The guidance tools represent a paradigm shift from **static documentation** to **interactive, queryable knowledge systems**. Instead of being passive references, these guides serve as:

- **Active constraints**: Explicit boundaries that prevent architectural drift
- **Decision frameworks**: Structured approaches to technology selection and implementation patterns
- **Consistency anchors**: Reference points that ensure uniform behavior across different coding sessions and agents
- **Knowledge evolution**: Living documents that capture and propagate successful patterns while preventing recurring mistakes

### Three Pillars of Agent Guidance

- **`design_guide`**: Product UX + UI system constraints (fonts, spacing, colors, components, patterns) - ensures visual and interaction consistency
- **`arch_guide`**: Architecture constraints (system shape, boundaries, directories, data flow, ADRs) - maintains structural integrity
- **`engin_guide`**: Engineering constraints (style, file org, frameworks, testing, lint, workflow) - enforces technical standards and processes

### Different Aspects of Guidance Systems

The original `software-guidance.txt` identifies several distinct dimensions of guidance that go beyond simple documentation:

#### Levels of Component Kits

The guidance system operates at multiple abstraction levels, from high-level design principles down to specific implementation details:

**Design System Level**:
- Fonts, sizes, colors, spacing scales
- GUI controls and layout patterns
- Component libraries with consistent visual language

**Component Level**:
- Carousel, card, and modal implementations
- Binding/syncing mechanisms for data flow
- State management patterns

**Prefab Level**:
- Complete configuration trees and database schemas
- Pre-configured settings for common scenarios (master-detail views, settings pages)
- Template component libraries addressing specific low-level issues

#### Queryable vs Static Guidance

Traditional documentation is **static**—agents must know what to look for and where to find it. The proposed guidance system is fundamentally **queryable**:

- **Interactive knowledge base**: Agents can ask contextual questions ("What font should I use for headings?" or "How do we handle API state management?")
- **Decision support**: Instead of making isolated choices, agents consult guidance for consistent technology selection
- **Pattern recognition**: Guidance evolves to capture successful approaches and prevent recurring problems
- **Contextual responses**: Answers adapt based on the specific coding task and existing codebase patterns

#### Customizable Web UI as Central Control

The web UI transcends simple configuration—it becomes the **primary interface for knowledge management**:

- **Human curation**: Team members can continuously refine and update guidance based on real project experience
- **Version control integration**: Guidance changes are tracked in git, creating an audit trail of architectural decisions
- **Runtime adaptation**: Changes take effect immediately, allowing agents to benefit from updated guidance without restart
- **Collaboration hub**: Multiple developers can contribute to and maintain guidance, ensuring it reflects team consensus

This repo already has the *right* architectural place to host these: a lightweight **local web UI** (currently for tool toggles) plus a **persisted JSON config in the project root** that’s tracked in git.

---

## What the project already provides (relevant foundation)

### Existing “settings surface”: tool toggles web UI

- The MCP server starts a local web UI by default (`--web-ui`, port 7332).
- That UI edits a persisted JSON config file (default `.chrome-devtools-mcp-tools.json`) which currently holds a denylist of disabled tools.
- The server applies the persisted configuration at startup, and changes take effect at runtime (tools become available/unavailable).

Implementation anchors:

- Web UI: `src/web-ui.ts`
- Config load/save: `src/tool-toggles.ts`
- Wiring into server startup: `src/main.ts`
- CLI flags: `src/cli.ts`
- User docs: `docs/tool-toggles-ui.md`, plus the web UI summary in `README.md`

### Existing “workflow surface”: live edit sessions + explicit commit

The core workflow described in `README.md` and `USAGE_GUIDE.md` is already structured around “guardrails”:

- **Iterate live in browser first**
- **Record changes**
- **Only write files when explicitly asked** (`apply_commit_plan`, `commit_edit_session_to_files`, `apply_unified_diff`)

That same philosophy maps cleanly onto “guidance”: **guidance should be explicit, reviewable, versioned**, and **opt-in when it affects writes**.

---

## How to implement the three guides in MCP terms

The implementation must emphasize the **queryable** and **customizable** nature of the guidance system. Rather than static documentation, these become interactive knowledge systems that agents can consult contextually.

### Core Design Principles

**Queryable Knowledge Base**:
- Agents should be able to ask specific questions: "What component should I use for user profiles?" or "How do we handle error states?"
- Responses should be contextual, not generic—adapted to the current coding task and existing codebase patterns
- Version tracking enables agents to detect when guidance has been updated and may change their approach

**Customizable Web UI**:
- The web UI becomes the primary mechanism for teams to evolve and refine guidance based on real project experience
- Changes are immediately available to agents without requiring restarts or manual intervention
- Git-tracked configuration ensures guidance improvements are versioned and auditable

### Recommended Implementation: MCP Tools + Resources

#### Option A (recommended): Provide guidance as MCP **Resources** + also as **Tools**

**Rationale**:
- MCP "resources" provide the structured, queryable knowledge base foundation
- Tools offer interactive querying capabilities for agents that need contextual guidance
- Dual approach ensures broad compatibility across different MCP clients

**Resource Structure**:
- **Resources** (structured knowledge base):
  - `guidance://design` - Design system patterns and component guidelines
  - `guidance://architecture` - System boundaries, data flow, and architectural decisions
  - `guidance://engineering` - Technical standards, tooling, and development processes

- **Tools** (interactive querying):
  - `query_design_guide(question)` - Ask specific design questions
  - `query_arch_guide(question)` - Get architectural guidance for specific scenarios
  - `query_engineering_guide(question)` - Request engineering standards and practices

**Enhanced Response Format**:
- **Contextual answers**: Tools return targeted guidance rather than full documents
- **Version metadata**: Include `updatedAt` and content hash for change detection
- **Progressive disclosure**: Short answer first, with option to retrieve full context
- **Cross-references**: Link related guidance across the three pillars

### Option B: Tools only (simplest)

Implement only tools like `get_design_guide` etc. This matches the current codebase’s “tools-first” orientation, and still solves the core problem.

### Option C: Prompts only (nice-to-have later)

Provide “prompt templates” like:

- `prompt://start_frontend_task`
- `prompt://refactor_mode`

These can embed “call the guidance first” instructions. This is useful, but it’s secondary—resources/tools deliver the durable value.

---

## How to store and edit the guides (config + customizable web UI)

### Recommendation: add a new persisted config file, separate from tool toggles

**Rationale**:

- Tool toggles are operational controls; guides are knowledge artifacts that evolve differently
- Separate files enable independent evolution and clearer git history
- Guides represent long-term project wisdom that transcends individual tool preferences

**Key Design Decision**: The web UI transforms from a simple configuration interface into a **knowledge management platform** where teams collaboratively build and maintain their development wisdom.

Proposed default path (project root):

- `.chrome-devtools-mcp-guidance.json`

Example schema (v1):

```json
{
  "version": 1,
  "updatedAt": "2026-01-22T00:00:00.000Z",
  "guides": {
    "design": {
      "title": "Design Guide",
      "format": "markdown",
      "content": "..."
    },
    "architecture": {
      "title": "Architecture Guide",
      "format": "markdown",
      "content": "..."
    },
    "engineering": {
      "title": "Engineering Guide",
      "format": "markdown",
      "content": "..."
    }
  },
  "kits": {
    "defaultKitId": "web-minimal-2026",
    "items": [
      {
        "id": "web-minimal-2026",
        "name": "Web Minimal Kit",
        "purpose": "Fast prototyping in live browser sessions",
        "fonts": ["Inter"],
        "icons": ["Lucide"],
        "designSystem": "Project tokens (DTCG-style)",
        "notes": "Prefer CSS variables + small component primitives."
      }
    ]
  }
}
```

Notes:

- `content` should be **plain markdown**, not rich JSON, so it’s easy for humans to edit in the UI.
- The “kit” concept is optional but directly addresses the “random stack” issue from `software-guidance.txt`.

---

## Web UI changes (extend the existing server, not a new server)

The existing UI is a single page served by `src/web-ui.ts`. To incorporate the three guides:

### Note: docs drift (worth fixing while you’re here)

`docs/tool-toggles-ui.md` describes features like tri-state category toggles and expand/collapse controls, but the current implementation in `src/web-ui.ts` is a category sidebar + card grid without those controls. When you extend the UI for Guides, it’s a good moment to either:

- update `docs/tool-toggles-ui.md` to match reality, or
- implement the documented features so the docs remain accurate.

### Enhanced UI Layout for Knowledge Management

- **Top-level nav/tabs**:
  - **Tools** (existing operational controls)
  - **Guidance** (new knowledge management hub)
  - **Kits** (component libraries and templates)

### Guidance Screen: Interactive Knowledge Base Editor

The guidance interface becomes the central hub for teams to evolve their development standards:

- **Three Interactive Guide Panels**:
  - **Design Guide**: Visual system, components, UX patterns
  - **Architecture Guide**: System boundaries, data flow, ADRs
  - **Engineering Guide**: Technical standards, tooling, processes

- **Advanced Editing Features**:
  - **Rich markdown editor** with live preview
  - **Version history** showing when guidance was last updated and by whom
  - **Query testing** - test how agents would receive guidance responses
  - **Cross-reference validation** - ensure consistency between guides
  - **Template system** - start from proven patterns or industry standards

- **Collaboration Features**:
  - **Copy prompt snippets** - generate ready-to-use instructions for AI clients
  - **Export/import** - share guidance between projects or backup configurations
  - **Change notifications** - agents are informed when guidance updates affect their behavior

- **Quality Assurance**:
  - **Guidance health checks** - validate completeness and internal consistency
  - **Usage analytics** - track which guidance sections are most consulted by agents

### Server routes

Keep the existing `/api/tools` endpoints, add:

- `GET /api/guidance` → returns the current guides + meta
- `POST /api/guidance` → validates + writes `.chrome-devtools-mcp-guidance.json`

Validation rules:

- Enforce `version === 1`
- Enforce max size limits (to prevent accidental megabyte pastes)
- Disallow binary/non-UTF8

Security note:

- Add a UI warning: **“Don’t store secrets/tokens here; this file is tracked in git.”**

---

## MCP surface area to add (queryable guidance system)

### Interactive Query Tools (primary interface)

The guidance system exposes **interactive querying capabilities** that transform static documentation into dynamic knowledge systems:

#### Core Query Tools

- `query_design_guide(question, context?)` - Ask specific design questions with optional task context
- `query_arch_guide(question, context?)` - Get architectural guidance for specific scenarios
- `query_engineering_guide(question, context?)` - Request technical standards and practices

**Enhanced Response Format**:
- **Contextual answers**: Targeted guidance rather than full documents
- **Confidence scoring**: Indicate how directly the guidance addresses the query
- **Related questions**: Suggest follow-up queries for comprehensive understanding
- **Source attribution**: Reference specific sections of the guide for transparency

#### Complementary Read Tools

For clients that prefer full document access:

- `read_design_guide()` - Complete design guide with metadata
- `read_arch_guide()` - Complete architecture guide with metadata
- `read_engineering_guide()` - Complete engineering guide with metadata

**Why Interactive Tools Over Static Resources**:
- **Contextual responses**: Agents receive guidance tailored to their specific coding task
- **Query-driven learning**: Encourages agents to ask precise questions rather than guessing
- **Evolutionary improvement**: Query patterns reveal gaps in guidance, driving iterative improvement
- **Broad compatibility**: Tool-based approach works across all MCP clients while enabling sophisticated interactions

### Optional: MCP Resources (more semantically correct)

If/when you add resources, align with MCP’s “list/get” pattern:

- `resources/list` shows the three guides
- `resources/read` returns the markdown

Reference:

- MCP architecture overview: `https://modelcontextprotocol.io/docs/learn/architecture`
- “Resources + Prompts + Tools” overview for developers: `https://stytch.com/blog/model-context-protocol-introduction/`

---

## How this addresses the failures described in `software-guidance.txt`

### 1) "The agent writes things from scratch" → Queryable Knowledge Base

**Root Cause**: AI agents lack persistent memory of established patterns and make isolated decisions.

**Solution - Interactive Guidance System**:
- **Queryable tools** enable agents to ask "What component should I use for X?" rather than guessing
- **Customizable web UI** allows teams to continuously add successful patterns and prevent reinvention
- **Contextual responses** provide specific, task-relevant guidance instead of generic documentation
- **Version awareness** ensures agents can detect and adapt to updated guidance

**Measurable Impact**:
- Reduced code duplication through established component reuse
- Consistent technology choices across the codebase
- Faster development through pattern recognition rather than rediscovery

### 2) "Random CSS/fonts/icons/design each time" → Design System Consistency

**Root Cause**: Without centralized design authority, each AI agent makes independent visual decisions.

**Solution - Unified Design Knowledge Base**:
- **Design guide as queryable authority**: Agents ask "What button style should I use?" and receive consistent answers
- **Customizable kits in web UI**: Teams can define and evolve design systems through the interface
- **Token-based consistency**: Design tokens (spacing, colors, typography) are codified and queryable
- **Component pattern library**: Established UI patterns are documented and easily accessible

**Industry Alignment**: Follows design tokens standards (DTCG/W3C) for interoperable design systems.

### 3) "Doesn't seek docs/search, can't integrate libraries" → Proactive Research Culture

**Root Cause**: AI agents prioritize generation over investigation, leading to incorrect integrations.

**Solution - Guidance-Driven Research Protocol**:
- **Engineering guide mandates**: Explicit rules requiring documentation consultation and source citation
- **Integrated research workflow**: Guidance tools include research protocols and resource references
- **Quality gates**: Web UI allows teams to add "research required" rules for specific technologies
- **Knowledge accumulation**: Successful integrations become part of the evolving guidance

**Best Practice Integration**: Aligns with established AI agent coding guidelines that emphasize documentation-driven development.

### 4) "No long-term architecture; messy codebase over time" → Architectural Memory

**Root Cause**: AI agents treat each coding session as independent, ignoring long-term system evolution.

**Solution - Living Architecture Knowledge Base**:
- **Architecture guide as decision framework**: Documents boundaries, patterns, and constraints
- **ADR integration**: Architectural Decision Records are linked and queryable through the system
- **Web UI evolution tracking**: Teams can update architectural guidance as systems mature
- **Consistency enforcement**: Agents can query architectural constraints before making structural changes

**Template Foundation**: Uses established ADR formats (MADR, adr.github.io) for consistent decision documentation.

---

## Documentation changes to land in this repo

### `README.md`

Add a section near the existing “Tool Management Web UI” section:

- **Project guidance (design/architecture/engineering)**
  - Explain that the web UI also hosts editable project guides
  - Explain these are meant to keep agents consistent over time
  - Mention the default persisted file path(s)
  - Provide a quick “how to use”: “call `get_*_guide` at the start of a task”

### `USAGE_GUIDE.md`

Add a short “pre-flight” step to your recommended workflows:

- Before starting a live edit session that will later be committed:
  - Call guidance tools (or open the Guides tab) to align on conventions
  - Then proceed with `begin_edit_session` → live iteration → commit plan

Example snippet (conceptual):

> “Before you create UI or commit changes, read `design_guide` and `engin_guide` and follow them. If you need library specifics, use web search and cite the docs.”

---

## Suggested starter templates for the three guides (copy/paste)

### `design_guide` template

- **Typography**: font family, sizes, line-height, headings/body
- **Spacing scale**: e.g. 4/8/12/16/24/32 (and when to use each)
- **Color tokens**: background/surface/text/border/accent states
- **Components**: buttons, inputs, cards, modals, toasts (with examples)
- **Layout rules**: max widths, gutters, breakpoints
- **Accessibility**: contrast targets, focus rings, keyboard nav

### `arch_guide` template

- **System overview**: what this product is and is not
- **Boundaries**: frontend/backend separation, modules, ownership
- **Data flow**: state management, API patterns, caching
- **Decision process**: ADR folder + template + when to write ADRs
- **Non-goals**: explicit “don’t do this” constraints

### `engin_guide` template

- **Languages/tooling**: Node/TS versions, build commands
- **Repo structure**: where to put new code and why
- **Style**: linting rules, naming conventions, file naming
- **Testing**: what tests are expected for changes
- **Dependency policy**: “prefer existing libs; justify new deps”
- **Search policy**: “if uncertain, search docs; cite and link”

---

## Implementation checklist (concrete steps)

### Phase 1: Core Infrastructure
1. **Guidance Configuration System**
   - Add `.chrome-devtools-mcp-guidance.json` schema (v1) with kits support
   - Implement loader/saver module (parallel to `src/tool-toggles.ts`)
   - Add version validation and migration support

2. **Enhanced Web UI**
   - Transform existing UI into knowledge management platform
   - Add Guidance tab with rich markdown editing
   - Implement `/api/guidance` endpoints with validation
   - Add query testing and cross-reference validation features

### Phase 2: Queryable MCP Interface
3. **Interactive Query Tools**
   - Implement `query_design_guide()`, `query_arch_guide()`, `query_engineering_guide()`
   - Add contextual response formatting with confidence scoring
   - Include version metadata and change detection

4. **Complementary Read Tools**
   - Add `read_*_guide()` tools for full document access
   - Ensure broad MCP client compatibility

### Phase 3: Integration & Validation
5. **Documentation Updates**
   - Update `README.md` to emphasize queryable/customizable aspects
   - Enhance `USAGE_GUIDE.md` with guidance-first workflows
   - Add examples of query-based development

6. **Quality Assurance**
   - Add comprehensive unit tests for guidance loading/saving
   - Implement guidance validation (completeness, consistency)
   - Add integration tests for MCP tool responses

### Phase 4: Advanced Features (Future)
7. **Usage Analytics**
   - Track which guidance sections are most queried
   - Identify gaps in guidance coverage

8. **Template System**
   - Provide starter templates for different project types
   - Enable guidance import/export between projects

---

## Bottom line: A Paradigm Shift in AI Agent Development

The guidance system represents a fundamental rethinking of how AI agents interact with software development projects. Rather than treating each coding task as an isolated prompt-response interaction, this system establishes **persistent, queryable knowledge infrastructure** that maintains consistency across the entire development lifecycle.

### Key Differentiators

**Queryable Knowledge Base**:
- Transforms static documentation into interactive decision support systems
- Enables contextual, task-specific guidance rather than generic instructions
- Creates feedback loops where agent queries reveal and drive guidance improvement

**Customizable Web UI as Knowledge Hub**:
- Elevates the interface from configuration tool to collaborative knowledge management platform
- Enables teams to continuously evolve development standards based on real project experience
- Provides immediate runtime updates that agents can leverage without interruption

**Multi-Level Guidance Architecture**:
- Design system level: Fonts, colors, spacing, component patterns
- Component level: Specific implementations and binding/syncing mechanisms
- Prefab level: Complete configuration trees and scenario-specific templates

### Why This Project is Perfect for This Vision

The existing MCP server provides exactly the right foundation:

- **Persisted, version-controlled configuration** enables knowledge evolution tracking
- **Web UI infrastructure** supports rich knowledge management interfaces
- **Explicit workflow philosophy** aligns with guidance-first development practices
- **MCP protocol** enables standardized, queryable knowledge access across AI clients

This implementation doesn't just solve the immediate problems of AI agent inconsistency—it establishes a new paradigm for **collaborative AI-human knowledge systems** in software development. The guidance becomes a living, breathing component of the development process that evolves alongside the codebase, ensuring that AI agents become increasingly aligned with human expertise and project wisdom.

