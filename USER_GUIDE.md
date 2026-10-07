# RHD‑CES — User & Admin Guide

**RHD Cost Estimation System** — a two‑sided web app for building
road / bridge / building cost estimates against a shared rate database.

- **Admins** own the **Item Master** (the rate database), approve special‑item
  requests, and manage organizations, regions and users.
- **Users** build **estimations**: pick items, break them down by part, enter
  dimensions, and request items that aren't in the master yet.

---

## 1. Core concepts

| Term | Meaning |
|---|---|
| **Item Master** | The catalogue of priced work items. Each row = one `item code` × `region/zone` × `organization` × **rate year**. |
| **Organization** | The rate‑issuing authority: **RHD**, **LGED**, or **PWD**. Each keeps its own rates. |
| **Region / Zone** | Geographic rate area (e.g. *Dhaka Zone*, *Comilla Zone*). |
| **Rate year** | The schedule year a rate belongs to. The master can hold the last two years side by side. |
| **Division** | Trade grouping of items (Earthwork, Concrete, …). |
| **Project → Estimation** | A project holds one or more estimations. An estimation is the working sheet. |
| **Work type** | Road / Bridge / Building — each estimation picks one or more; each becomes a tab. |
| **Line** | One priced row in an estimation (an item + its dimensions). |
| **Sub‑item** | A line broken into parts that roll up into it. Parts can themselves be broken down — up to **5 levels** deep. |
| **Structural element** | The named part a sub‑item prices: bridge `A1 / P1 … Pn / A2`, or a road chainage segment `0+000 – 1+250`. |
| **Special item** | Work not in the master. A user *requests* it; an admin *approves* it, which adds it to the master and to the estimation. |

### Roles

| Role | Can do |
|---|---|
| **User** | Create projects/estimations, add lines, make sub‑items, request special items, export. |
| **Admin** | Everything a user can, **plus** manage the Item Master, import/export rates, approve/reject special items, manage organizations & regions, manage users. |
| **Superadmin** | Everything, plus data‑retention / purge controls. |

---

## 2. Getting started (everyone)

1. **Log in** at `/login`.
2. The **top bar** has: dashboard launcher (top‑left grid icon), **Items**,
   **Projects**, (admins also see **Notifications** and **Users**), and your
   profile menu (top‑right).
3. Your work **autosaves**; the interval is set in your profile
   (5 / 10 / 30 min). The header shows unsaved‑changes state and a manual save.

---

## 3. Users — building an estimation

### 3.1 Create a project and estimation
1. **Projects → New**. Give it a name (and client, optionally).
2. Inside the project, **New estimation**. Choose:
   - **Region** — the rate zone to price against.
   - **Work type(s)** — Road / Bridge / Building. Each becomes a tab.
   - **Rate year** — leave blank to use the newest available, or type a year
     (e.g. `2025`). This decides which rates new lines pick up. You can change
     it later from the estimation header.

### 3.2 The estimation screen
- Tabs across the top: one per **work type**, plus **Summary**.
- **Items** vs **Special Items** sub‑tabs (top‑left).
- The blue banner shows the project, GPS, and the **Rate year** selector.
- **Rename parts** (right of the tabs) opens the structural‑elements manager.

### 3.3 Add an item line
1. Click **Add Item**.
2. Pick **Organization → Region → Division → Item**. For RHD the region is
   locked to the estimation's; other orgs let you choose.
3. The **Unit** shows once the item is picked. Dimension fields adapt to it:
   - `m³` (cu.m) → No. / Length / Width / Thickness
   - `m²` (sq.m) → No. / Length / Width
   - `m` (r.m) → No. / Length
   - lump sum / number → No. / Quantity
   Each field shows its unit inline (`m`, `m²`, `m³`, `nos`).
4. Dimension fields accept **arithmetic**: `2*3.5`, `12/4`, `1+0.5`. The typed
   expression is remembered.
5. Optional: **Sub Description**, **Element** (if the estimation has any).
6. **Use last for item** / **presets** reuse previous dimensions for that item.
7. **Add Line** (or tick *Keep form open* to add several).

### 3.4 Break a line into sub‑items
Select a single line → **Make Sub‑Item**. Choose a mode:

| Mode | Creates |
|---|---|
| **Bridge** | `A1`, `P1 … Pn`, `A2` (set pier count; toggle abutments). |
| **Road** | One chainage segment per interval you enter (`0+000` → `3+500`). |
| **Other** | Sub‑items with names you type (e.g. *Toilet Block*, *Guard Room*). |

Then either:
- **Create & Enter Numbers** — opens the **Complete Sub‑Items** wizard to key
  dimensions for each part in turn (*Save & Next*, *Skip*, *Save & Exit*), or
- **Save & Exit** — creates the parts now and returns to the sheet; fill their
  numbers later (they show as *pending* until you do).

The parent line becomes an **aggregate**: it stops taking its own dimensions and
shows the **sum of its parts**.

### 3.5 Go deeper — sub‑items of sub‑items
Select a sub‑item → **Make Sub‑Item** again. Nested breakdowns use **named
parts** (the bridge/road generators are first‑level only). Nesting is allowed up
to **5 levels**; the button is disabled past that.

### 3.6 Add a *different* item under a sub‑item
Select any line → **Add item inside** (toolbar or right‑click). This adds a
child line with **its own item, rate and dimensions** that still rolls up into
the parent. Use it when a part needs, say, both concrete *and* formwork.

### 3.7 Rename bridge/road parts
**Rename parts** → edit a part's **name** (`A1` → `Left Abutment`), its
**structure name**, or its **label**. Road chainage codes are derived from the
metres and can't be typed. You can also double‑click a sub‑item's name badge in
the grid to rename it in place.

### 3.8 Edit, reorder, duplicate, delete
- **Double‑click** a cell to edit it inline (toggle *Editing* first).
- Select rows → **Edit / Duplicate / Delete** in the toolbar, or right‑click a
  row.
- Deleting a parent deletes its whole subtree.
- An **aggregate line** (one with children) ignores dimension edits — it's just
  the sum. Its name / item / element are still editable.

### 3.9 GPS & coordinates
Right‑click a line → **Set GPS**, or set it on the project.
- **Geometry**: *Single point*, *Line / route* (2+ points), *Area* (3+ points).
- **Format**: *Decimal*, *D°M'S"*, or *D°M.m'* — pick per your preference; it's
  remembered. You can type either style (`23°46'50"N` or `23.7808`) and paste
  `lat, long` pairs.
- For a route, every point becomes a waypoint in the **View route on map** link
  (opens Google Maps). The **Summary** tab lists the points and the link.

### 3.10 Attachments
Right‑click a line → **Insert Picture** to attach an image/PDF (≤ 10 MB).

### 3.11 Summary & export
- **Summary** tab: totals per work type (Item Master vs Special Items),
  unassigned total, a pending‑parts warning, the grand total, and the route /
  coordinates list.
- **Download** (top‑right of the sheet): **CSV**, **XLSX**, or **PDF**.

---

## 4. Special items — request & approval workflow

Use a special item when the work you need **isn't in the Item Master**.

### 4.1 Lifecycle

```
        user creates                     admin approves
  ┌──────────────────┐   reject(reason)  ┌──────────────────────────────┐
  │     PENDING      │ ────────────────▶ │           REJECTED           │
  │  (editable by    │                   │  requester edits & resubmits │
  │   user & admin)  │ ◀──────────────── │        → back to PENDING      │
  └────────┬─────────┘  edit & resubmit  └──────────────────────────────┘
           │ approve (admin)
           ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                           APPROVED                                │
  │  • a master item is created (under the estimation's rate year)    │
  │  • a line is added to the estimation, in the same element/part    │
  │  • request is locked — edit the line from the sheet instead       │
  │  • deleting that line keeps the master item; request shows        │
  │    "line removed"                                                 │
  └──────────────────────────────────────────────────────────────────┘
```

### 4.2 As a user — requesting
1. On the estimation, open the **Special Items** sub‑tab → **New Special Item**.
2. Fill **Division, Description, Unit, Rate, Region, Organization**, the
   **dimensions**, and (optionally) an **Element** so the approved line lands on
   the right part.
3. **Attach the source** for the rate (a quote, a rate analysis) — this is what
   the admin reviews.
4. Submit. It appears as **PENDING**. Totals show it under "Pending total" but
   it is **not** in the estimation grand total until approved.
5. Track status on this page. While **PENDING** you can **Edit** or **Delete**
   it.
6. If **REJECTED**, the admin's **reason** is shown. Click **Edit & Resubmit**,
   fix the issue, and save — it returns to **PENDING** with the rejection note
   cleared.

### 4.3 As an admin — reviewing
Two places show the same requests:
- **Notifications** (top bar) — every estimation's requests, with **Pending /
  Approved / Rejected / All** tabs and search.
- The **Special Items** sub‑tab of a specific estimation.

For each **PENDING** request:
- Check the **description, dimensions, derived quantity, rate**, and open the
  **attachment**.
- **Approve** →
  - a new **Item Master** row is created for it, stamped with the **estimation's
    rate year**, so it aligns with every other rate on that estimation;
  - a **line** is added to the estimation in the request's element/part, with
    its dimensions;
  - the request becomes **APPROVED** and locked.
- **Reject** → enter a **reason** (the requester sees it). The request becomes
  **REJECTED** and the requester can correct and resubmit.

### 4.4 After approval
- Edit the numbers from the **estimation sheet** (the line), not the request.
- **Deleting the line** is allowed; the master item it created **stays** in the
  catalogue and the request shows **"line removed / master item kept"**. Re‑add
  it from **Add Item** if you need it back.
- An approved request **cannot** be deleted or edited directly.

---

## 5. Admins — managing the Item Master

Open **Items**. Admin‑only controls (add / edit / delete / import / the
*Organization* and *Year* columns) appear only for admins.

### 5.1 Add a single item
**Add item** → Division, Code, Description, Unit, Rate, Region, Organization.
New items are stamped with the **current year** unless you set one.

### 5.2 Import rates (bulk)
**Import** → choose a file, a **mode**, and a **Rate year**.

**Accepted files:** CSV or XLSX, in either layout — headers are matched
case/space‑insensitively with common synonyms (`Division`/`Major Division`,
`Region`/`Zone`, `Description`/`Item Description`, …).

| Layout | Shape |
|---|---|
| **Linear** | One row per item **per region**, with literal `Rate` and `Region` columns. Optional `Organization` and `Year` columns. |
| **Pivoted** | One row per item, **one column per zone** (`Dhaka Zone`, `Comilla Zone`, …). Optional `Organization` and `Year` columns. |

- A **`Year`** column (synonyms: `Rate Year`, `Fiscal Year`, `Schedule Year`,
  `FY`) sets the rate year per row. Rows without it take the **Rate year** you
  chose in the dialog.
- `Cumilla Zone` is normalised to `Comilla Zone`.

**Modes:**
- **Add on top (upsert)** — insert new rows, overwrite matching ones. Match key
  is `code × region × organization × year`.
- **Replace this org + year's items** — same upsert, then **delete** the
  untouched rows **only within the `(organization, year)` combinations present
  in your file**. Importing LGED‑2026 never disturbs RHD‑2025. Rows referenced
  by an estimation are never deleted.

### 5.3 Export & template
**Export** gives the pivoted layout back (with `Organization` and `Year`
columns) — edit and re‑import. **Download CSV template** gives just the headers.

### 5.4 Rate years in practice
- Keep **two years** in the master (e.g. 2025 and 2026).
- Each estimation's **Rate year** decides which year its item pickers and new
  lines use; blank = newest.
- Approving a **special item** files it under the estimation's rate year.
- Older years can be pruned by the retention job once nothing references them.

### 5.5 Organizations & regions
Managed from the Items screen (org selector → **Manage regions**). **RHD**,
**LGED** and **PWD** are seeded automatically; new regions are also created on
the fly when an import references them.

---

## 6. Admins — users & roles

**Users** (top bar): create users, activate/deactivate, assign roles
(`user` / `admin` / `superadmin`). Permissions are attached to roles; the
routers check `resource:action` (e.g. `items:create`, `estimations:update`).

---

## 7. Superadmins — retention

The **Notifications** page shows a **Retention / Purge** panel. Expired projects
are archived/purged on a schedule; a dry run reports what would be removed
before a real run.

---

## 8. Quick reference

| I want to… | Do this |
|---|---|
| Price a standard item | Items must exist in the master → **Add Item** on the estimation |
| Price something not in the master | **Special Items → New Special Item**, attach the rate source, wait for approval |
| Split an item across bridge parts | Select it → **Make Sub‑Item → Bridge** |
| Split a part further | Select the part → **Make Sub‑Item → Other** (named) |
| Add formwork under a concrete sub‑item | Select the sub‑item → **Add item inside** |
| Rename `A1` to `Left Abutment` | **Rename parts**, or double‑click its badge |
| Enter `2 × 3.5` as a length | Type `2*3.5` in the Length field |
| Use last year's rates | Set the estimation's **Rate year** in the blue header |
| Load a new rate schedule (admin) | **Items → Import**, pick mode + **Rate year** |
| Approve a colleague's special item (admin) | **Notifications → Pending → ✓** |
| Reject with feedback (admin) | **Notifications → Pending → ✗**, type a reason |
| Fix a rejected request (user) | **Special Items → Edit & Resubmit** |
| See a route on a map | Set GPS as **Line / route**, add points, **View route on map**; also on the **Summary** tab |
| Export the estimate | **Download → CSV / XLSX / PDF** |
