# Grouped inventory list

Switch Inventory to **List**, then choose **Group by**:

- **Follow sort**: date sorting uses date-status groups; location sorting uses
  location groups; name sorting leaves the list ungrouped.
- **Date status**: Past date, Due soon, Later and No date. Due soon uses the
  configured warning window, includes today, and distinguishes exact overdue
  handling deadlines. Past date includes both use-by and best-before items.
- **Location** or **Category**: groups use stable IDs and display their current names.
- **No grouping**: a single uninterrupted table.

Sort order applies within each group. Empty groups are omitted. Header counts are
inventory rows after search and filters, not units within counted stock or totals
across hidden results. Individual rows retain their usual info and action controls.

Use a group heading or **Expand all / Collapse all**. Past-date and due-soon groups
start expanded, later and undated groups start collapsed. Location/category groups
start expanded. Choices are stored in this browser independently for each grouping.
Search temporarily opens groups containing matching items without overwriting saved
collapse choices; clearing the search restores them. Grouping affects list view only.

OpenAI Codex was used to develop this enhancement.
