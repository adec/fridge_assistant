# Feature backlog

## In progress: Mealie recipe suggestions
Keep the existing Home Assistant integration. Add an in-app “What can I cook?” view, direct Mealie API access, saved ingredient mappings, date-based ranking and optional AI-assisted matching reviewed by the user. See [the implementation plan](docs/mealie-integration-plan.md). Connection settings, atomic recipe caching and a read-only catalogue preview are implemented on `feature/mealie-integration`. Matching, ranking and optional AI review remain to be built. No separate Docker backend yet.

## Backlog: minimum-stock alerts and replenishment
Requested 6 October 2026. Let users identify foods they want to keep in stock, set minimum stock thresholds and receive low-stock prompts.

Proposed design, not yet finalised:
- Store the replenishment policy on a food template, rather than individual inventory batches. Aggregate linked stock items across configured storage locations.
- Count packs/items only, with optional location scope. Structured quantities, weights, volumes and unit conversion are explicitly out of scope. The user tried Grocy and found too much friction; preserve fast, simple stock entry and consumption. Do not confuse meal portions with ingredient quantities.
- Default one inventory entry to one pack/item. Any support for multiple packs on an entry must use a simple integer count and avoid requiring weights or measurements.
- Show low-stock foods in a dedicated view and expose suitable Home Assistant entities/events for reminders and automations.
- Define usable-stock rules, including treatment of past Use By, Best Before, archived locations and frozen stock.
- Optional subsequent enhancement: add shortages to a selected Mealie shopping list, or a Home Assistant shopping/to-do list. Apple Reminders synchronisation is a possible downstream integration; feasibility and supported direction must be verified before promising it.
- Keep shopping-list writes opt-in. Avoid duplicate entries, support replenishment targets and define when an item may be added again after purchase/completion/dismissal. Store stable external list/item references where available.

This is a backlog item, not part of the first Mealie recipe-suggestion release. No implementation or automatic shopping-list writes have been authorised by recording this idea.

## Deferred: wider food icon/image library
Searchable curated offline food icons, optional product/personal photos, template defaults and item overrides. Deferred because the expected gain did not justify the work at present.

## Future architecture option
Consider extracting a standalone backend only if independent operation, persistent jobs or additional clients justify it. Keep new recipe logic separate from Home Assistant-specific code to preserve that option.
