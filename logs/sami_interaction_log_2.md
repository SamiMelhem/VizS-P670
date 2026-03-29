# Project features and system overview
_Exported on 3/24/2026 at 19:02:25 CDT from Cursor (2.6.20)_

---

**User**

Based on the progress that we have made within this project, give me these parts:

Features
Mapping Design Requirements to Features
System Overview

---

**Cursor**


Exploring the project to document features, map design requirements, and summarize the system overview.




Here is a concise write-up grounded in the repo (`README.md`, `public/script.js`, `server/server.js`, `server/geocode.js`) and aligned with the research framing in the README.

---

## System overview

**VizS-P670** is a small **Express** app that serves a **static D3 dashboard**: a **US Albers projection** map of **S&P 500–style company headquarters** (from `server/companies_geocoded.json`), with **industry filtering**, **two display modes** (cities vs. companies), and **per-company price history** loaded through **`/api/stock/:ticker`** via **yahoo-finance2**. The browser loads **state geometry** from the **us-atlas** CDN (TopoJSON) and company rows from **`GET /data`**.

**Data pipeline (offline / one-off):** `server/geocode.js` reads `server/sp500-companies.csv`, geocodes **Headquarters Location** with **OpenStreetMap Nominatim**, rate-limited, and writes **`companies_geocoded.json`**.

**Note:** The README describes a broader stack (TypeScript, Supabase, FMP, etc.). The **running implementation** is **JavaScript** in `public/`, **Node + Express** in `server/server.js`, and **Yahoo Finance** for charts—not the full README stack.

---

## Features

| Area | What exists today |
|------|-------------------|
| **Map** | US states (TopoJSON), company points projected with **d3.geoAlbersUsa** |
| **Display modes** | **Cities:** one circle per shared HQ coordinates, radius scales with count. **Companies:** one circle per firm |
| **Industry filter** | Dropdown filters which companies (and city clusters) appear |
| **Navigation** | **Pan/zoom** on the map; **Reset zoom** button |
| **Tooltips** | City clusters: location, count, sample names. Companies: name, location, industry |
| **City workflow** | In **Cities** mode, click a cluster → **City Companies** widget (city dropdown + list) → pick a company → **stock panel** updates |
| **Company workflow** | In **Companies** mode → **search** (name / location / industry), **info card**, click map or list → **stock panel** |
| **Stock panel** | Title, last close, period change %, **range buttons** (1D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y), D3 **line + area**, grid/axes, **hover** crosshair and OHLC-style tooltip |
| **APIs** | `GET /data` — cleaned geocoded companies; `GET /api/stock/:ticker?range=…` — normalized quote series |
| **Tooling** | `server/geocode.js` — CSV → geocode → JSON |

**Hooks / placeholders:** Comments reference optional KPI elements (e.g. `#kpi-total`) if added to the HTML later.

---

## Mapping design requirements to features

Requirements are taken from the README’s goals and research questions (RQ1–RQ3).

| Design requirement | How it is addressed in the current build | Gap / next step (if any) |
|--------------------|------------------------------------------|---------------------------|
| **Geographic view of S&P 500 HQs** | Map + lat/lon points from geocoded JSON | — |
| **Audience: beginners / students** | Single-page dashboard, filters, click-to-explore, simple stock chart | Could add short on-page explanations or guided copy |
| **Industry / regional clustering (RQ2)** | **Industry** filter + seeing **where** filtered firms sit; **Cities** mode emphasizes shared locations | No explicit “region” labels or sector **summary** stats per state/region |
| **Capital concentration (RQ1)** | Users can **see** density of points and city bubble sizes | No **market cap** encoding (size/color by cap) or **state-level aggregates** in the UI |
| **Returns / volatility by geography (RQ3)** | **Per-company** return over selected ranges in the stock panel | No **cross-state** or **portfolio-by-state** metrics; no **volatility** visualization in the chart |
| **“Live” performance** | Yahoo chart API for selected ticker/range | Depends on Yahoo availability; not the FMP/Yahoo split described in the README |
| **Sustainable HQ data** | Static JSON built from CSV + geocoding | README’s **Supabase + FMP** path is **not** wired into the running server |

---

If you want this turned into a formal doc section (e.g. for a report), say the target format (bullet vs. table vs. prose) and whether to treat the README stack as **planned** vs. **current** only.

---

**User**

For the features, could you pull the latest within the "testing" branch since so far that has the latest code? Then analyze what is there and then make the features more concise so it is easy to present the progress we made on the prototype

---

**Cursor**


Fetching the `testing` branch and analyzing the codebase for an updated, concise features list.




Here’s what **`testing`** actually contains (I compared it to `main`: only `public/script.js` differs, and `testing` is a **slimmed-down** variant of the same prototype).

---

## Source

- **Branch:** `testing` (local matches `origin/testing` for these files).
- **Delta vs `main`:** City widget company names are **list-only** (no row click, no auto-load of the first company into the chart). `setSelectedCompany` always requests quotes when a ticker is set (no `forceFetch` guard).

---

## Features (concise — for prototype progress)

1. **US headquarters map** — D3 Albers USA, state outlines, S&P-scale companies from geocoded JSON (`GET /data`).
2. **Two map modes** — **Cities** (one marker per HQ location, size ~ count) and **Companies** (one marker per firm).
3. **Industry filter** — Restricts who appears on the map and in side widgets.
4. **Map navigation** — Pan/zoom plus **Reset zoom**.
5. **Tooltips** — Cluster summary or single-company name, location, industry.
6. **City sidebar** — After picking a cluster (or city in the dropdown), see **which companies** share that HQ (Cities mode).
7. **Company sidebar** — In **Companies** mode: **search** (name / location / industry), **info card**, and **map click** to select.
8. **Stock panel** — For a selected ticker: **multi-range** history (1D–5Y, YTD), summary change, D3 line/area chart, **hover** for date/OHLC-style detail; data from **`/api/stock/:ticker`** (Yahoo Finance via `yahoo-finance2`).
9. **Backend** — Express serves the UI, company JSON, and stock proxy; optional **CSV → geocode** script for refreshing `companies_geocoded.json`.

**One-line caveat for demos:** On **`testing`**, the **stock chart is tied to Companies mode** (map + search). **Cities** mode is strong for **“who is here?”**; it does **not** wire list clicks to the chart on this branch.

---

If you want this as slide bullets only, use **1–8** and move the caveat to speaker notes. If you prefer **`main`** behavior (chart also driven from the city company list), say so and the feature line can say “pick a company from the city list to load the chart” again.

---

**User**

Here is what I have for the features, let's break down each of them into detail

---

**Cursor**


Checking the codebase for details that support each F-item and whether D4 (market cap) appears in the implementation.




Here is a **detailed breakdown** of each slide item, tied to what the **`testing`** branch actually implements (Express + D3, `public/script.js`, `server/server.js`). Where something is only a **goal** on the slide and not in code yet, that is called out.

---

## Functional features (F-series)

### **F1: US headquarters map**
- **What it does:** Draws the **lower-48–style** US map with **state boundaries** using **D3** (`d3.geoPath` + **Albers USA** projection at scale 1200, centered in a 960×600 viewBox).
- **Data:** Company rows come from **`GET /data`**, which reads **`server/companies_geocoded.json`** (lat/lon per firm). Points outside the projection are dropped when building screen coordinates.
- **Geometry:** State shapes load from the **us-atlas** TopoJSON CDN; rendering sits in a **`viewport`** `<g>` so the whole map layer zooms together.

### **F2: Two map modes**
- **Cities:** Companies that share the **same lat/lon** are **one circle**; **radius** grows with how many firms match the current view (roughly \(\sqrt{n}\), capped).
- **Companies:** **One circle per company** (fixed radius), after the same projection and industry filter.
- **Switching:** The **Mode** dropdown re-binds the circle data and click behavior (city cluster click vs company click).

### **F3: Industry filter**
- **What it does:** A single **Industry** `<select>` built from **unique `Industry` values** in the loaded dataset (plus **All**).
- **Effect:** Filters which companies are drawn in **Companies** mode and which members count toward **Cities** clusters and tooltips; also drives the **city list** and **company search** lists to stay consistent with the map.

### **F4: Map navigation**
- **Pan/zoom:** **`d3.zoom`** on the SVG (scale roughly **1×–8×**), with transform applied to the **viewport** group.
- **UX details:** **Double-click zoom is disabled** on the map; **Reset zoom** runs a short transition back to the identity transform.
- **Boundary:** Zoom is constrained to the chart extent so the view does not drift unbounded.

### **F5: Tooltips**
- **Map – city/cluster mode:** On hover, shows **headquarters label**, **count** of companies shown under the filter, and up to **six names** plus “+ N more” if needed.
- **Map – company mode:** Shows **company name**, **headquarters string**, and **industry**.
- **Stock chart:** A **hover overlay** on the price series shows **date**, **close**, **high**, and **low** (with sensible date formatting per selected range, e.g. intraday for 1D).

### **F6: Sidebars**
- **Layout:** The page is a **two-column dashboard**: **Map** panel and **Interactions / Widgets** panel (`index.html`).
- **City widget (Cities mode):** **City** dropdown (with **company counts**), and a **list of company names** for the selected city. On **`testing`**, that list is **read-only** (no click handler to load the chart).
- **Company widget (Companies mode):** **Search** field (matches **name**, **headquarters**, **industry**), **search results list** (click selects), and a **detail card** (name, location, industry, coordinates).

### **F7: Stock panel**
- **Trigger:** Selecting a company with a **ticker** in **Companies** mode (via **map** or **search list**) calls **`fetch('/api/stock/…?range=…')`**.
- **Backend:** **`server/server.js`** uses **yahoo-finance2** `chart()` with a **range config** (e.g. **1D** with 5m bars, **1Y** with 1wk, **5Y** with 1mo, **YTD** from Jan 1).
- **UI:** **Title**, **last close**, **period change** ($ and %), **range buttons** (1D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y), **D3** line + faint area, **axes/grid**, optional **dots** when the series is short, loading/error states.

---

## Design requirements / criteria (D-series)

### **D1: Separability**
- **In the prototype:** **Visual** separability: **states vs points**, **two modes** (aggregate vs firm), **industry filter**, and **side panel vs map** keep tasks distinct.
- **Data** separability: Server **normalizes** company JSON (finite lat/lon only) and **stock** responses (cleaned quote rows) so the client does not mix concerns.
- **Gap (if your rubric means statistical separability):** There is **no** formal analysis (e.g. clustering tests, state-by-state performance separation) in the UI yet.

### **D2: Dashboard**
- **In the prototype:** Single **dashboard** shell: **top bar** (mode, industry, reset), **primary map**, **secondary analytics strip** (widgets + stock chart), global **map tooltip** layer.
- **Intent:** One screen to **explore geography**, **narrow by sector**, and **inspect price history** for a chosen firm.

### **D3: Time evolution**
- **In the prototype:** The **stock panel** is the main time-evolution view: **historical quotes** over the user-selected window, with **readable time axes** (hour labels for 1D, month/year for longer spans).
- **Not in the prototype yet:** **Animated** time scrubbing on the map, or **comparing** multiple companies over time on one chart.

### **D4: Market capitalization**
- **In the prototype:** **Not implemented.** The bundled **`sp500-companies.csv`** fields (as in repo) are **Ticker, Name, Industry, Sub-Industry, Headquarters, Date added, Founded**—**no market-cap column** in that pipeline, and the map does **not** encode size or color by cap.
- **For the slide:** Treat D4 as a **requirement the next iteration should satisfy** (e.g. join cap from an API or dataset, then **bubble size** or **choropleth** by state)—or adjust the slide to match current scope.

---

### Quick alignment note for your deck
**F1–F7** map cleanly to **`testing`**. **D4** is the main item that is still **requirement-only** unless you add cap data and a visual encoding. If you want **F6** to say “sidebar drives the chart in both modes,” that matches **`main`** more than **`testing`** (city list clicks + auto-selection were reduced on **`testing`**).

I can turn this into **slide-ready sub-bullets** (one line each under F1–F7) if you tell me your max bullets per feature.

---

**User**

For each feature could you make it more concise in terms of the content of just what the feature does

---

**Cursor**


## Functional features (what each one does)

- **F1 — US headquarters map:** Shows US state outlines and plots each company at its geocoded HQ on a US map.

- **F2 — Two map modes:** **Cities** merges firms that share the same coordinates into one marker sized by count; **Companies** shows one marker per firm.

- **F3 — Industry filter:** Limits the map and side lists to a chosen industry (or shows all).

- **F4 — Map navigation:** Lets you pan and zoom the map and return to the default view with one action.

- **F5 — Tooltips:** On hover, shows a short summary on the map (cluster or company) and, on the stock chart, date and price details.

- **F6 — Sidebars:** **Cities** mode: pick a city and see its companies listed. **Companies** mode: search firms, see a small info card, and pick from the list.

- **F7 — Stock panel:** After you select a company (with a ticker), shows recent price history, period change, and lets you switch the time range.

---

## Design criteria (what each one means in the product)

- **D1 — Separability:** Keeps map exploration, filtering, and company/stock detail as clearly separate tasks on one screen.

- **D2 — Dashboard:** Presents map + controls + stock view together as one coordinated layout.

- **D3 — Time evolution:** Shows how the selected stock’s price moves over the chosen time window.

- **D4 — Market capitalization:** *(Target, not in current prototype.)* Would show or use company size (market cap) in the visualization once data and encoding are added.

