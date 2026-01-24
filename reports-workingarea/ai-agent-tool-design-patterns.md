# AI Agent Tool Design Patterns: Individual Calls vs. Parameterized Tools

## Research Summary

This document summarizes research findings on whether AI agents are more likely to use MCP server calls that are individual tool calls versus parameterized tools (e.g., separate `click`, `scroll`, `drag` tools vs. a single `simulate_event` tool with parameters).

## Key Findings

### 1. Granular Tools Are Generally Preferred

From Anthropic's guidance on writing tools for agents:
- Tools should be **"intentionally and clearly defined"**
- They should **"can be combined together in diverse workflows"**
- They should **"enable agents to intuitively solve real-world tasks"**

**Separate tools** (e.g., `click`, `scroll`, `drag`) are:
- **More discoverable**: The model can see each action as a distinct capability
- **More intuitive**: The model doesn't need to infer which parameter to use
- **More composable**: The model can chain them in different ways

### 2. Token and Context Considerations

From OpenAI's function calling documentation:
- **"Functions count against the model's context limit and are billed as input tokens"**
- **"If you run into token limits, we suggest limiting the number of functions"**

Google Cloud's guidance:
- **"Providing too many can increase the risk of selecting an incorrect or suboptimal tool"**
- **"For best results, aim to provide only the relevant tools for the context or task, ideally keeping the active set to a maximum of 10-20"**

### 3. Parameterized Tools Can Be Problematic

From Microsoft's guidance on tool design:
- Tools **"can feel clunky when multiple parameters must be collected manually"**
- They work better when **"preconditions, validation rules, and fallback prompts are implemented"**

### 4. Best Practice Pattern

The research suggests a **hybrid approach**:
- Use **granular tools** for common, distinct actions (click, scroll, drag)
- Use **parameterized tools** for complex, related operations that share significant logic
- Keep the total tool count manageable (**10-20 active tools per context**)

## Recommendation

For the example of separate tools (`click`, `scroll`, `drag`) vs. a single `simulate_event` tool:

**Separate tools are likely better** because:
1. Each action is semantically distinct
2. The model can discover and use them independently
3. They're easier to combine in workflows
4. They reduce parameter confusion

**A parameterized `simulate_event` tool would be better** if:
- The actions share substantial implementation logic
- You have 50+ similar event types that would bloat the tool list
- The events are rarely used and can be grouped

## Bottom Line

**Granular, separate tool calls generally work better for AI agents**, but balance granularity with token costs and tool count limits.

## Sources

- Anthropic: "Writing effective tools for AI agents"
- OpenAI: Function calling documentation
- Google Cloud: Vertex AI function calling best practices
- Microsoft: Tool design patterns for AI agents
- Model Context Protocol (MCP) specification and design guides

