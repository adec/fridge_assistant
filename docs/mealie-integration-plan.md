# Mealie integration decision — 6 October 2026

Keep Fridge Assistant as a Home Assistant custom integration for the first Mealie implementation. Do not extract a separate Docker backend yet. Keep recipe matching and ranking independent of Home Assistant-specific code to allow future extraction.

Implement an in-app “What can I cook?” view. Retrieve actual recipes and foods using Mealie's API, use saved ingredient mappings and aliases first, and optionally ask an LLM to suggest unfamiliar mappings for user review. Save accepted mappings. Keep substitutions separate from exact matches. Validate stock and calculate date priority in application code. Preserve working results when AI is unavailable.

Prioritise recipes using ingredients due soon. Exclude past Use By stock and distinguish past Best Before stock. Show missing ingredients, frozen items needing thawing and quantity limitations explicitly. Initial matching checks presence, not sufficient quantities where inventory amounts are free text. Link results to actual Mealie recipes. No external chat interface is required. MCP may be added later for other clients.

Use a dedicated feature branch such as feature/mealie-integration, based on the latest main. Main remains the installable released version. Publish the completed feature through a reviewed PR and a new version/release, retaining the OpenAI Codex disclosure. Branch created and first milestone started on 6 October 2026.

Before implementation, establish installed Mealie version, connectivity, recipe ingredient structure and preferred AI provider. Keep credentials out of source files and notes.

## Milestone 1: connection and catalogue preview

Implemented optional URL/token options, a saved-settings connection test, manual/startup/six-hour sync, paginated foods/recipe retrieval and bounded parallel recipe-detail requests. Full snapshots are cached atomically and failures preserve the prior cache for the same connection. Tokens never appear in frontend responses or cached data. Changing credentials hides the old connection cache. The panel shows a searchable recipe catalogue, links to Mealie and counts of ingredients requiring parsing. This preview makes no availability or ranking claims.

Next: confirm API behaviour against the user's installed Mealie version, add saved food mappings and alias review, implement the deterministic matching/ranking view, then add optional AI-assisted matching. Packs/items only; no structured inventory quantities.

### Validation and handoff

126 automated tests pass (including 17 Mealie client/cache tests); Python and panel JavaScript syntax checks pass. No live Home Assistant or Mealie instance has been tested. Local browser verification was blocked because the execution environment could not open a listening socket. GitHub fetch/push access was unavailable during this milestone, so the feature branch is local until network access is restored. The stable main release is unchanged.

The next check needs the installed Mealie version and a handful of imported recipes. Do not enter API tokens in GitHub files or chat; use the integration options.
