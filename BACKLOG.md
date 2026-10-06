# Feature backlog

## In progress: Mealie recipe suggestions
Keep the existing Home Assistant integration. Add an in-app “What can I cook?” view, direct Mealie API access, saved ingredient mappings, date-based ranking and optional AI-assisted matching reviewed by the user. See [the implementation plan](docs/mealie-integration-plan.md). Connection settings, atomic recipe caching and a read-only catalogue preview are implemented on `feature/mealie-integration`. Saved food mappings, deterministic presence matching and date ranking are also implemented. Optional AI review and live validation remain outstanding. No separate Docker backend yet.

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

## Backlog: opened and defrosted item lifetimes
Requested 6 October 2026. Optional lightweight tracking to answer when food needs eating,
without structured quantities or a Grocy-style workflow. Design proposal, not implemented:

- A user-facing configuration setting enables opened/defrosted tracking (off by default).
  Basic stock entry remains unchanged. No separate technical feature-flag machinery needed.
- Optional template defaults: days after opening and days after defrosting. Empty means
  no automatic estimate; allow an item override. No mandatory extra fields.
- Item actions: “Opened today” and “Move to fridge / start defrosting”. Allow correcting
  the timestamp and undoing the action, retaining the original date and location.
- Moving frozen stock to a selected fridge can offer defrost tracking; do not silently
  declare it fully thawed. Distinguish started defrosting from fully defrosted, and state
  which event begins the configured lifetime. Offer “Defrosted today” for confirmation.
- Store opening/defrost timestamps and separate derived deadlines. The effective deadline
  is the earliest applicable one, preserving the original label date and its type.
  Confirm deadline changes and show the reason (e.g. “Use within 2 days of opening”).
- Preserve Use By versus Best Before meaning. Do not automatically label a storage-life
  estimate as a manufacturer's Use By date; make the handling deadline distinct in UI,
  stickers, notifications and recipe priority. Do not extend an original Use By date.
- Select destination from managed fridge-type locations; never assume a single built-in
  fridge. A normal storage move should not reset dates automatically.
- Partially opened packs still count as one pack/item for minimum-stock purposes; no
  remaining-weight tracking. Define interactions with portions and undo/history.
- Verify food-safety guidance before introducing any built-in duration or thawing rule;
  prefer user/package-specific instructions over a universal defrost lifetime.

Record only at this stage; implementation belongs to a later feature branch/release.
