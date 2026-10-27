# Household stock

Household is a third built-in kind alongside Ingredients and Dishes. Use it for
supplies such as dishwasher tablets, laundry capsules or bin bags.

Create a Household template, choose a category, and optionally set a count label
(e.g. tablets), barcodes and a reorder threshold. Add inventory using that template
and enter a whole-number count. A pack of 80 tablets is one entry with a count of
80. Use one or the existing consume_stock automation action to reduce the count.

Household uses simple counts only. All new items, including food, default to the first active cupboard
(storage type `pantry`); if none exists, the first active location is used. Explicitly
selected locations and existing stock locations are preserved.
All active locations remain selectable, including
fridges and freezers, but the location does not apply food shelf-life estimates.
Dates remain optional manual entries under **More options** in the item editor.
Food kinds keep their date controls on the main form; changing kind preserves any
entered dates. Household has no opening/thawing controls,
and templates and stock are excluded from Mealie ingredient matching. Food AI
shelf-life/emoji estimation is unavailable for Household until metadata-only AI
suggestions are supported. Package-photo entry remains on the backlog.

Existing inventory retains its kind and tracking even when its template changes.
Editing an existing single unhandled entry to Household enables a count; an entry
with multiple or handled portions cannot be converted this way. Existing categories
can remain assigned as previously agreed. New selections filter categories by kind;
additional Household categories can be created in category management.

Test on dev before publishing. OpenAI Codex was used to develop this enhancement.
