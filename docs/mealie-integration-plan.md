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

## Milestone 2: deterministic matching and ranking

Implemented saved Mealie food-ID to ingredient-template mappings, unique exact-name/alias
matching, review controls and presence filters. Complete recipes rank first, followed by
fewer missing/unresolved foods, more ingredients due within three days, and earliest dates.
Past Use By stock is excluded; past Best Before stock stays visible with a quality-check
flag. Frozen stock is marked for thawing. Each matched food identifies its earliest-dated
available pack. Duplicate recipe foods count once; no grams, units or quantities are inferred.
Unparsed ingredients and missing mappings prevent an “all present” claim.

Target: Mealie v3.28.0, user-selected URL https://mealie.collinshouse.uk (configured by
user, never hard-coded). Checked the v3.28.0 recipe schema against the cached ingredient
shape. Live authenticated Mealie and Home Assistant validation is still outstanding.
AI-assisted suggestions remain a separate next milestone; accepted manual mappings work
without AI. 136 automated tests pass, including ten matching/ranking cases; Python and
JavaScript syntax checks pass.

## Test feedback — 7 October 2026
User reports the initial build works on their live Home Assistant instance. Recipes with
any unparsed (missing food-ID) ingredients now appear only in a collapsed parsing section
with links to their Mealie recipe pages; they are excluded from main results and filters.
No dedicated pending-parsing route was found in the v3.28.0 page inventory. Parsed recipes
with unmapped food IDs still appear for mapping review. Manifest version 0.10.0b2 identifies
this feature preview and refreshes the panel URL. Stable release remains v0.9.0.

## Recipe tabs and tiles — beta 3
Inventory remains the default tab; Recipes retains its search/filter when switching tabs.
Recipe cards show photos, availability, due-soon count and handling flags. Tapping opens
stock/missing-ingredient details. Manage reveals connection configuration, sync, mappings
and parsing links. v3.28.0 /api/media/recipes/{id}/images/min-original.webp serves token-free
images; no API credentials are exposed. Lazy-loaded images use a placeholder on failure.
Local browser checks covered tabs, management controls, detail opening/closing, missing
photos and iPhone-width layout using fixtures. Live Mealie photo loading awaits user testing.

## Beta 4: invalidate all frontend modules
Live beta-3 feedback showed undefined tab labels and an empty Recipes view, consistent
with an updated entry module importing stale strings/view/style modules. Every relative
ES-module import now includes the manifest version, not just the panel entry URL.
Run `python3 scripts/version_panel.py` after each manifest bump; an automated test
requires every import to match the manifest and resolve to an existing file.
138 tests pass and all non-vendor panel modules pass JavaScript syntax checks.

## Beta 5: show effective automatic mappings
Reports of Onion and Bell pepper not matching prompted regression tests using the actual
seed templates and lower/upper/mixed-case Mealie names. All match correctly: casefold
normalisation already applies to names and aliases. The mapping dropdown now identifies
the effective automatic target (e.g. “Automatic matching — Onion”) instead of showing only
“Automatic matching”. This is a display clarification, not a confirmed fix for any missing
stock; stock template linkage and date eligibility still require checking if symptoms remain.

## Beta 6: focused ingredient mapping administration
Manage opens a dedicated mapping screen, defaulting to Needs review and foods used in
synced recipes (including parsed foods in partially unparsed recipes). Status filters,
case-insensitive search across food/target names and 25-row pagination keep large catalogues
manageable. Change opens a searchable, paginated template picker; Automatic matching
removes a manual override. The review count is scoped to the selected recipe/catalogue
scope. Save failures leave the picker open for retry. Existing mappings are preserved.
140 tests pass, including large-catalogue filtering/page clamping checks. Local browser
fixtures verified default scope/status, search and nested template picker. Live saves
using the new UI await user testing.

## Beta 7: categories and in-flow template creation
Add/edit stock now includes Category under More options, preserving explicit choices
against automatic recognition and AI. Create template prefills the template editor from
the item without copying the current pack deadline. Saving returns the saved template to
the item editor, pins its ID, preserves other fields and suggests its storage lifetime
without replacing a locked date. Existing manager callbacks remain compatible.
Local browser fixtures verified category choice, template prefill/save, preserved quantity,
five-day lifetime suggestion, and saving the linked item under Fruit. 140 automated tests
and all panel syntax/import-version checks pass. Live Home Assistant validation remains
for the user after upgrading.
