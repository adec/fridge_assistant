# Feature backlog

## In progress: Mealie recipe suggestions
Keep the existing Home Assistant integration. Add an in-app “What can I cook?” view, direct Mealie API access, saved ingredient mappings, date-based ranking and optional AI-assisted matching reviewed by the user. See [the implementation plan](docs/mealie-integration-plan.md). Connection settings, atomic recipe caching and a read-only catalogue preview are implemented on `feature/mealie-integration`. Saved food mappings, deterministic presence matching and date ranking are also implemented. Optional AI review and live validation remain outstanding. No separate Docker backend yet.

## Partially implemented: minimum-stock alerts and replenishment
Initial delivery in beta 30: simple integer counts, template thresholds, an in-app low-stock list, a Low stock sensor and the `consume_stock` automation action. Shopping-list destinations, optional location scopes and usable-stock policies remain on the backlog.

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

## Backlog: standalone backend with a thin Home Assistant integration

Recorded 26 October 2026. Preferred long-term architecture to evaluate, deferred for
now with no implementation date or ordering commitment:

- A standalone service owns inventory, templates, barcode mappings, portion lifetimes,
  Mealie synchronisation and background jobs. Support Docker and consider an HAOS app
  (add-on) package for convenient local installation and independent updates.
- A thin Home Assistant integration connects through a versioned API and exposes
  relevant entities/actions and access to the frontend. Preserve the in-HA experience;
  external chat should not be required for normal use.
- The backend owns its own database (SQLite initially if appropriate), schema migrations,
  transactions, credentials and recovery. Never extend or depend on Recorder's schema.
  Avoid an intermediate in-HA database migration if backend extraction is the next step.
- Plan a validated, recoverable import from the existing storage data, preserving IDs,
  stock, history, templates, barcode/Mealie links, portion state, dates and sticker codes.
- Define API authentication, connection failures, unavailable/stale entities, compatibility
  between backend/integration versions, and reliable backup/restore for both deployments.
- Keep domain logic and persistence separated from HA-specific code meanwhile. Measure
  performance before assuming extraction is required for capacity; independent updates,
  runtime isolation and clearer ownership are the main architectural motivations.

Keep the current integration/storage approach for now. Recording this item does not
start a rewrite, database migration or deployment change.

## Implemented: opened and defrosted item lifetimes
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

Implemented in v0.10.0b25: optional handling setting, hour/day template defaults, per-portion events and locations, undo, grouped inventory, portion-aware matching, expiry checks and labels. No universal food lifetimes are added.

## Deferred: unified category display symbol

Consider a single selector with a preview for choosing an emoji or an MDI icon per
category. Keep emojis as the default. Category MDI fields originated upstream and
remain stored for compatibility, but are not currently displayed in the panel. The
category editor hides the unused icon field and preserves existing icon values.
Check upstream usage before implementing this option. No implementation commitment.

## Backlog: ingredient and dish template maintenance

Requested 26 October 2026. A dedicated maintenance view for tidying the template
catalogue without adding friction to everyday inventory entry. Proposal only:

- Search/filter and select multiple ingredient or dish templates, then preview bulk
  name formatting (e.g. lower-case). Keep IDs stable; preserve stock assignments,
  aliases, Mealie mappings and intentional item display names. Show name collisions
  and possible duplicate matches before applying changes; offer undo where practical.
- Review templates unused for a configurable period. Track actual use/last-used dates
  from introduction of the feature; do not infer that old templates were never used
  when historical usage is unavailable. Distinguish creation/modification from usage.
- Review templates with no Mealie mappings or no usage in synced Mealie recipes.
  Include automatic matches as well as manual mappings, and show which recipe/stock
  references exist. “Unlinked” does not mean unwanted: pantry staples and dishes may
  intentionally have no recipe links. Mark linkage unknown when Mealie is unconfigured,
  its cache is incomplete or sync failed; never classify unknown as safe to remove.
- Prefer archive/hide with restore over deletion. Show affected current inventory,
  templates, aliases and recipe mappings before any bulk destructive action. Keep
  built-in hide/reset behaviour distinct from deleting user-created templates.
- Protect referenced templates or offer explicit reassignment. Keep inventory,
  sticker codes, history and quantity/portion tracking intact. Dry-run previews and
  explicit selection; no automatic deletion merely because a template is old or
  absent from the current Mealie catalogue.

Recording the idea does not implement cleanup or authorise deleting any templates.

## Backlog: CI/CD and dev deployment pipeline

Requested 27 October 2026. Begin with the local working-copy deployment command in
[scripts/deploy_dev.py](scripts/deploy_dev.py), documented in
[dev deployment](docs/dev-deployment.md), to test before commits and HACS releases.

Future work: pull-request validation, deployment of a reviewed revision to a dedicated
dev Home Assistant, startup and feature smoke checks, manual release approval, and
repeatable HACS beta/stable packaging. Keep deployment credentials scoped to dev,
serialize deploys, and plan backup/rollback and storage migrations. Production must
remain a separate, explicitly approved deployment. No CI runner access or automatic
production deployment is configured by this backlog entry.

## Backlog: optional package-photo entry

Requested 27 October 2026. Deferred until the Household workflow is established;
no implementation or delivery date committed. Useful for ingredients, dishes and
household items when a barcode is unknown, missing or unreadable.

- Offer “Read packaging” after an unmatched barcode scan, plus a direct “Add from
  photo” action. Allow taking or choosing a photo and an optional second photo of
  the date or pack details. Keep existing manual entry and barcode scanning usable
  without AI configured.
- Suggest name, an existing template, category, emoji, count/count label and clearly
  printed dates. Prefill the existing add-item form for review; never save stock or
  permanent barcode mappings without the user's confirmation. Preserve a scanned
  barcode and offer linking it to the selected template on save.
- Distinguish transcription from inference. Preserve printed date type and precision:
  “Best before Aug 2027” uses month/year precision and its existing last-day rule.
  Leave unclear or absent dates blank; do not invent expiry dates. Show uncertainty
  and allow correction before saving.
- Keep counts separate from measured quantities: “80 tablets” may suggest 80 units;
  “500 g” stays descriptive, not 500 items. Do not add structured weights, volumes
  or unit conversion.
- A handwritten meal label may provide useful text. A meal photo alone supports
  tentative identification only, not claims about ingredients, allergens or safe
  use-by dates. Do not generate household chemical-safety or storage instructions.
- Make image transmission to the configured provider clear before first use; define
  retention and avoid retaining photos unnecessarily. Handle unsupported image
  providers, unreadable photos and service failures with a manual-entry fallback.

OpenAI Codex helped record this proposal. This entry does not enable image uploads
or change the existing AI configuration.

## Backlog: illustrated household user guide

Requested 27 October 2026. A friendly, non-technical guide to help household members
learn Fridge Assistant, using clear screenshots and short task-based instructions.
No delivery date committed.

- Cover everyday flows: adding/scanning items, choosing templates and locations,
  reading dates/status colours, opening or thawing selected portions, consuming or
  discarding stock, correcting mistakes through History, and low-stock reminders.
  Include recipe suggestions where configured and Household tracking when implemented.
- Follow the preview mockups’ visual style: calm colours, rounded panels, generous
  spacing, readable type and clear visual hierarchy. Keep examples concise and easy
  on the eyes; annotations should clarify rather than clutter. Preserve this style
  in the guide layout, not just its screenshots.
- Use short steps with annotated screenshots, especially for the phone and kitchen
  display. Explain action icons and the distinction between a batch, portions and
  a simple count through practical examples, rather than implementation details.
- Reuse preview layouts to plan illustrations, but capture the released interface
  with sample data for the final guide. Clearly label proposed features/mockups;
  do not present them as currently available. Avoid household names, tokens, URLs
  or other personal details in shared documentation.
- Keep screenshots and wording matched to an identified app version. Store source
  images and guide text in the repo; prefer maintainable Markdown/HTML initially,
  with a printable PDF as a possible later output. Prioritise a brief getting-started
  guide over an exhaustive manual.

This records documentation work only; no screenshots are published by this entry.


## Backlog: translation review

English is the default language for this fork, including default metadata sent by
its backend. Preserve user-supplied names and their casing. Retain existing Dutch
translation support where available; broader languages and a systematic translation
review are future work. Do not allow untranslated backend defaults to leak into the
English interface. Requested 27 October 2026.


## Implemented on dev: Household and compact inventory UI

Household adds count-only stock, optional dates, category management and exclusion
from Mealie matching. All new items default to an active cupboard; explicit choices
and existing locations are preserved. Includes simplified cards, a compact view
selector and compact portion rows with consistent location headings. See
[Household stock](docs/household.md). Stock-to-template navigation remains an idea
for a later update; it is not part of this implementation.
