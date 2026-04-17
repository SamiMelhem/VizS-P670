const width = 960;
const height = 600;
const BASKET_RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y", "YTD"];

const svg = d3
  .select("#map")
  .attr("viewBox", [0, 0, width, height])
  .style("max-width", "100%")
  .style("height", "auto");

// Everything that should zoom goes inside this group
const viewport = svg.append("g").attr("class", "viewport");

const projection = d3.geoAlbersUsa()
  .scale(1200)
  .translate([width / 2, height / 2]);

const path = d3.geoPath(projection);

const tooltip = d3.select("#tooltip");
const select = d3.select("#industryFilter");
const modeSelect = d3.select("#displayMode");
const widgetArea1 = d3.select("#widget-area-1");

// aggregate panel target
const aggregateContainer = d3.select("#aggregate-container");

function groupedByCoordinates(companies) {
  const withProjectedCoords = companies
    .map(d => {
      const coords = projection([+d.lon, +d.lat]);
      return coords ? { ...d, x: coords[0], y: coords[1] } : null;
    })
    .filter(Boolean);

  const groups = d3.group(withProjectedCoords, d => `${d.lat}|${d.lon}`);

  return Array.from(groups, ([key, members]) => {
    const first = members[0];
    return { key, x: first.x, y: first.y, members };
  });
}

function visibleMembers(cluster, selectedIndustry) {
  if (selectedIndustry === "All") return cluster.members;
  return cluster.members.filter(d => d.Industry === selectedIndustry);
}

function clusterRadius(count) {
  return 3 + Math.min(14, Math.sqrt(count) * 2.2);
}

function formatTooltip(cluster, selectedIndustry) {
  const visible = visibleMembers(cluster, selectedIndustry);
  if (!visible.length) return "";

  const location = visible[0]["Headquarters Location"] || "Unknown";
  const preview = visible.slice(0, 6).map(d => d.Name);
  const overflow = visible.length - preview.length;

  return `
    <strong>${location}</strong><br/>
    Companies shown: ${visible.length}<br/>
    ${preview.join("<br/>")}
    ${overflow > 0 ? `<br/>+ ${overflow} more` : ""}
  `;
}

function companyTooltip(company) {
  return `
    <strong>${company.Name}</strong><br/>
    Location: ${company["Headquarters Location"] || "Unknown"}<br/>
    Industry: ${company.Industry}
  `;
}

function cityName(cluster) {
  return cluster.members[0]["Headquarters Location"] || "Unknown";
}

// ----- ZOOM -----
// ----- ZOOM -----
const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .translateExtent([[0, 0], [width, height]])
  .extent([[0, 0], [width, height]])
  .on("zoom", (event) => {
    viewport.attr("transform", event.transform);
  });
svg.call(zoom);
svg.on("dblclick.zoom", null);

// ----- PAN WITH RIGHT CLICK -----
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let currentTransform = d3.zoomIdentity;

svg.on("contextmenu", (event) => {
  event.preventDefault();
});

svg.on("mousedown", (event) => {
  if (event.button === 2) { // Right mouse button
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    currentTransform = d3.zoomTransform(svg.node());
  }
});

document.addEventListener("mousemove", (event) => {
  if (isPanning) {
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    const newTransform = currentTransform.translate(dx, dy);
    svg.call(zoom.transform, newTransform);
  }
});

document.addEventListener("mouseup", (event) => {
  if (event.button === 2) {
    isPanning = false;
  }
});

window.resetMapZoom = function resetMapZoom() {
  svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
};

// ----- STOCK CHART -----
const RANGES = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "5Y"];
const RANGE_LABELS = {
  "1D": "Past day", "1W": "Past week", "1M": "Past month",
  "3M": "Past 3 months", "6M": "Past 6 months", "YTD": "Year to date",
  "1Y": "Past year", "5Y": "Past 5 years",
};

let selectedTicker = null;
let selectedCompanyName = null;
let selectedRange = "1W";
let currentCircles = null;

function renderStockChart(ticker, companyName, data, containerId = "stock-chart-container") {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (!data.quotes || data.quotes.length === 0) {
    container.innerHTML = '<p class="chart-error">No trading data available for this period</p>';
    return;
  }

  const quotes = data.quotes.map(q => ({ ...q, date: new Date(q.date) }));

  const latestClose = quotes[quotes.length - 1].close;
  const firstClose = quotes[0].close;
  const change = latestClose - firstClose;
  const changePct = (change / firstClose) * 100;
  const isPositive = change >= 0;

  const activeRange = data.range || selectedRange;
  const rangeLabel = RANGE_LABELS[activeRange] || activeRange;

  const header = document.createElement("div");
  header.innerHTML = `
    <p class="stock-chart-title">${companyName} (${ticker})</p>
    <p class="stock-chart-price">$${latestClose.toFixed(2)}</p>
    <p class="stock-chart-change ${isPositive ? "positive" : "negative"}">
      ${isPositive ? "+" : ""}${change.toFixed(2)} (${isPositive ? "+" : ""}${changePct.toFixed(2)}%) ${rangeLabel.toLowerCase()}
    </p>
  `;
  container.appendChild(header);

    const toggleBar = document.createElement("div");
  toggleBar.className = "range-toggle-bar";
  RANGES.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "range-btn" + (r === activeRange ? " active" : "");
    btn.textContent = r;
    // only wire default single-stock behavior for the main chart container
    if (containerId === "stock-chart-container") {
      btn.addEventListener("click", () => {
        selectedRange = r;
        fetchStockData(selectedTicker, selectedCompanyName, currentCircles, r);
      });
    }
    toggleBar.appendChild(btn);
  });
  // Only append toggle bar for single stock chart, not basket chart
  if (containerId === "stock-chart-container") {
    container.appendChild(toggleBar);
  }

  const margin = { top: 8, right: 12, bottom: 28, left: 48 };
  const containerWidth = container.clientWidth || 296;
  const chartWidth = containerWidth - margin.left - margin.right;
  const chartHeight = 160;

  const chartSvg = d3.select(container)
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", chartHeight + margin.top + margin.bottom);

  const g = chartSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime()
    .domain(d3.extent(quotes, d => d.date))
    .range([0, chartWidth]);

  const yMin = d3.min(quotes, d => d.low ?? d.close);
  const yMax = d3.max(quotes, d => d.high ?? d.close);
  const yPad = (yMax - yMin) * 0.15 || 1;

  const y = d3.scaleLinear()
    .domain([yMin - yPad, yMax + yPad])
    .range([chartHeight, 0]);

  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(4).tickSize(-chartWidth).tickFormat(""));

  const activeRangeForAxis = data.range || selectedRange;
  let xTickFormat, xTickCount;

  if (activeRangeForAxis === "1D") {
    xTickFormat = d3.timeFormat("%-I:%M %p");
    xTickCount = 5;
  } else if (activeRangeForAxis === "5Y") {
    xTickFormat = d3.timeFormat("%Y");
    xTickCount = 5;
  } else if (activeRangeForAxis === "1Y") {
    xTickFormat = d3.timeFormat("%b '%y");
    xTickCount = 6;
  } else if (activeRangeForAxis === "3M" || activeRangeForAxis === "6M" || activeRangeForAxis === "YTD") {
    xTickFormat = d3.timeFormat("%b %d");
    xTickCount = 5;
  } else if (activeRangeForAxis === "1M") {
    xTickFormat = d3.timeFormat("%-m/%d");
    xTickCount = 5;
  } else {
    xTickFormat = d3.timeFormat("%-m/%d");
    xTickCount = Math.min(quotes.length, 6);
  }

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(d3.axisBottom(x).ticks(xTickCount).tickFormat(xTickFormat));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(4).tickFormat(d => `$${d.toFixed(0)}`));

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.close))
    .curve(d3.curveMonotoneX);

  const area = d3.area()
    .x(d => x(d.date))
    .y0(chartHeight)
    .y1(d => y(d.close))
    .curve(d3.curveMonotoneX);

  const lineColor = isPositive ? "#4caf50" : "#ef5350";

  g.append("path")
    .datum(quotes)
    .attr("fill", lineColor)
    .attr("fill-opacity", 0.08)
    .attr("d", area);

  g.append("path")
    .datum(quotes)
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 2)
    .attr("d", line);

  const showDots = quotes.length <= 15;
  if (showDots) {
    g.selectAll(".dot")
      .data(quotes)
      .join("circle")
      .attr("cx", d => x(d.date))
      .attr("cy", d => y(d.close))
      .attr("r", 3.5)
      .attr("fill", lineColor)
      .attr("stroke", "rgba(0,0,0,0.3)")
      .attr("stroke-width", 0.8);
  }

  const tooltipBox = d3.select(container)
    .append("div")
    .attr("class", "chart-tooltip-box")
    .style("opacity", 0);

  const hoverLine = g.append("line")
    .attr("stroke", "rgba(255,255,255,0.3)")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3 3")
    .attr("y1", 0)
    .attr("y2", chartHeight)
    .style("opacity", 0);

  const hoverDot = g.append("circle")
    .attr("r", 5)
    .attr("fill", lineColor)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("opacity", 0);

  const bisect = d3.bisector(d => d.date).left;

  chartSvg.append("rect")
    .attr("width", chartWidth)
    .attr("height", chartHeight)
    .attr("transform", `translate(${margin.left},${margin.top})`)
    .attr("fill", "transparent")
    .on("mousemove", function (event) {
      const [mx] = d3.pointer(event, this);
      const dateAtMouse = x.invert(mx);
      const idx = Math.min(bisect(quotes, dateAtMouse, 1), quotes.length - 1);
      const d0 = quotes[idx - 1];
      const d1 = quotes[idx];
      const d = (dateAtMouse - d0.date > d1.date - dateAtMouse) ? d1 : d0;

      hoverLine.attr("x1", x(d.date)).attr("x2", x(d.date)).style("opacity", 1);
      hoverDot.attr("cx", x(d.date)).attr("cy", y(d.close)).style("opacity", 1);

      const fmt = activeRangeForAxis === "1D"
        ? d3.timeFormat("%-I:%M %p")
        : d3.timeFormat("%b %d, %Y");

      tooltipBox
        .style("opacity", 1)
        .html(`<strong>${fmt(d.date)}</strong><br/>
               Close: $${d.close.toFixed(2)}<br/>
               High: $${(d.high ?? d.close).toFixed(2)}<br/>
               Low: $${(d.low ?? d.close).toFixed(2)}`)
        .style("left", `${x(d.date) + margin.left + 14}px`)
        .style("top", `${y(d.close) + margin.top + header.offsetHeight - 10}px`);
    })
    .on("mouseleave", function () {
      hoverLine.style("opacity", 0);
      hoverDot.style("opacity", 0);
      tooltipBox.style("opacity", 0);
    });
}

function fetchStockData(ticker, companyName, circles, range) {
  const isRangeSwitch = range && ticker === selectedTicker;

  selectedTicker = ticker;
  selectedCompanyName = companyName;
  currentCircles = circles;
  if (range) selectedRange = range;

  const container = document.getElementById("stock-chart-container");

  if (isRangeSwitch) {
    container.classList.add("chart-fetching");
    const btns = container.querySelectorAll(".range-btn");
    btns.forEach(b => {
      b.classList.toggle("active", b.textContent === selectedRange);
    });
  } else {
    container.innerHTML = '<p class="chart-loading">Loading stock data</p>';
  }

  if (circles) circles.classed("selected", d => d.Ticker === ticker);

  fetch(`/api/stock/${encodeURIComponent(ticker)}?range=${encodeURIComponent(selectedRange)}`)
    .then(res => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then(data => {
      container.classList.remove("chart-fetching");
      renderStockChart(data.ticker, data.name || companyName, data);
    })
    .catch(() => {
      container.classList.remove("chart-fetching");
      container.innerHTML = '<p class="chart-error">Failed to load stock data. Please try again.</p>';
    });
}

let selectedBasketRange = "1W";
let selectedBasketTickersKey = "";

function fetchBasketStockData(tickers, range) {
  const containerId = "aggregate-stock-chart-container";
  const container = document.getElementById(containerId);
  const normalized = (tickers || [])
    .map(t => String(t || "").trim().toUpperCase())
    .filter(t => t && t !== "NULL" && t !== "N/A" && t !== "NA")
    .sort();
  const key = normalized.join(",");

  if (!normalized.length) {
    container.innerHTML = '<p class="chart-placeholder">No basket data selected.</p>';
    selectedBasketTickersKey = "";
    return;
  }

  if (range) selectedBasketRange = range;

  const shouldRefetch = key !== selectedBasketTickersKey || !!range;
  selectedBasketTickersKey = key;

  if (!shouldRefetch) return;

  container.innerHTML = '<p class="chart-loading">Loading basket stock data</p>';

  fetch(`/api/stock-basket?tickers=${encodeURIComponent(key)}&range=${encodeURIComponent(selectedBasketRange)}`)
    .then(res => {
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    })
    .then(data => {
      renderStockChart(
        data.ticker || "BASKET",
        data.name || "Selection basket",
        data,
        containerId
      );
      
      // Rewire the range bar for basket chart only
      const c = document.getElementById(containerId);
      const bar = c.querySelector(".range-toggle-bar");
      if (bar) {
        bar.querySelectorAll("button").forEach(btn => {
          const r = btn.textContent;
          btn.onclick = () => fetchBasketStockData(normalized, r);
        });
      }
      
      // Also wire up the quick-select buttons
      document.querySelectorAll(".basket-range-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.range === selectedBasketRange);
        btn.onclick = () => fetchBasketStockData(normalized, btn.dataset.range);
      });
    })
    .catch(() => {
      container.innerHTML = '<p class="chart-error">Failed to load basket stock data.</p>';
    });
}


// ----- AGGREGATION + BRUSH HELPERS -----
function renderAggregatePanel({ selection, selectedCompanies }) {
  // Remove the Mode/Industry/Selected area/Companies boxes entirely.
  // Keep only: hint (when no selection), top industries, and clear selection.

  if (!selection) {
    aggregateContainer.html(`
      <div class="aggregate-hint">
        Drag a rectangle on the map to select an area.
      </div>
      <div class="aggregate-actions">
        <button type="button" id="clear-selection" disabled>Clear selection</button>
      </div>
    `);
    return;
  }

  const byIndustry = d3.rollups(
    selectedCompanies,
    v => v.length,
    d => d.Industry || "Unknown"
  ).sort((a, b) => d3.descending(a[1], b[1]));

  const top = byIndustry.slice(0, 8);

  aggregateContainer.html(`
    <div>
      <div class="city-widget-title" style="margin-bottom:6px;">Top industries (in selection)</div>
      <ul class="aggregate-list">
        ${top.map(([k, v]) => `<li>${k}: ${v}</li>`).join("")}
        ${byIndustry.length > top.length ? `<li>+ ${byIndustry.length - top.length} more</li>` : ""}
      </ul>
    </div>
    <div class="aggregate-actions">
      <button type="button" id="clear-selection">Clear selection</button>
    </div>
  `);

  document.getElementById("clear-selection")?.addEventListener("click", () => {
    clearBrushSelection();
  });
}

// holds current selection in *screen/map* coords (not lon/lat)
let currentBrushSelection = null;
let brushG = null;
let brushBehavior = null;

function clearBrushSelection() {
  currentBrushSelection = null;
  if (brushG) brushG.call(brushBehavior.move, null);
}

// Compute selected companies from the current brush selection,
// respecting mode + industry filter.
function companiesInSelection({ selection, mode, industry, projectedCompanies, clusters }) {
  if (!selection) return [];

  // Convert selection bounds into viewport coords by inverting the current zoom transform.
  const t = d3.zoomTransform(svg.node());
  const [[sx0, sy0], [sx1, sy1]] = selection;
  const [x0, y0] = t.invert([sx0, sy0]);
  const [x1, y1] = t.invert([sx1, sy1]);

  const xmin = Math.min(x0, x1);
  const xmax = Math.max(x0, x1);
  const ymin = Math.min(y0, y1);
  const ymax = Math.max(y0, y1);

  const inside = (x, y) => x >= xmin && x <= xmax && y >= ymin && y <= ymax;

  if (mode === "companies") {
    const base = industry === "All"
      ? projectedCompanies
      : projectedCompanies.filter(d => d.Industry === industry);
    return base.filter(d => inside(d.x, d.y));
  }

  // mode === "cities"
  const selectedClusters = clusters.filter(c => inside(c.x, c.y));
  return selectedClusters.flatMap(c => visibleMembers(c, industry));
}

// Visual highlight for selected points (works for both modes)
function applySelectionStyling(circles, selection) {
  if (!circles) return;

  if (!selection) {
    circles.classed("brush-selected", false);
    return;
  }

  const t = d3.zoomTransform(svg.node());
  const [[sx0, sy0], [sx1, sy1]] = selection;
  const [x0, y0] = t.invert([sx0, sy0]);
  const [x1, y1] = t.invert([sx1, sy1]);

  const xmin = Math.min(x0, x1);
  const xmax = Math.max(x0, x1);
  const ymin = Math.min(y0, y1);
  const ymax = Math.max(y0, y1);

  circles.classed("brush-selected", d =>
    d.x >= xmin && d.x <= xmax && d.y >= ymin && d.y <= ymax
  );
}

// ----- LOAD DATA -----
Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.json("/data")
]).then(([us, companies]) => {
  const projectedCompanies = companies
    .map(d => {
      const coords = projection([+d.lon, +d.lat]);
      return coords ? { ...d, x: coords[0], y: coords[1], key: d.Name } : null;
    })
    .filter(Boolean);

  const states = topojson.feature(us, us.objects.states);

  // Draw states
  viewport.append("g")
    .attr("class", "states")
    .selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path);

  // Populate industry dropdown
  select.selectAll("option").remove();
  select.append("option").attr("value", "All").text("All");
  const industries = Array.from(new Set(projectedCompanies.map(d => d.Industry))).sort();
  industries.forEach(ind => {
    select.append("option").attr("value", ind).text(ind);
  });

  const clusters = groupedByCoordinates(projectedCompanies);

  // Build right-side widget area
  widgetArea1.html(`
    <div id="city-widget" class="city-widget">
      <div class="city-widget-title">City Companies</div>
      <div>
        <label for="cityFilter">City:</label>
        <select id="cityFilter"></select>
      </div>
      <ul id="city-company-list" class="company-list"></ul>
      <div id="city-widget-empty" class="city-widget-empty" hidden>No companies for this city and industry filter.</div>
    </div>

    <div id="company-search-widget" class="company-search-widget" hidden>
      <div class="city-widget-title">Company Search</div>
      <input id="companySearchInput" class="company-search-input" type="text" placeholder="Search companies..." />
      <ul id="company-search-results" class="company-list"></ul>
      <div id="company-search-empty" class="city-widget-empty" hidden>No matching companies.</div>
      <div id="company-info-card" class="company-info-card">Search and select a company to view details.</div>
    </div>
  `);

  const cityWidget = d3.select("#city-widget");
  const citySelect = d3.select("#cityFilter");
  const cityCompanyList = d3.select("#city-company-list");
  const cityWidgetEmpty = d3.select("#city-widget-empty");

  const companySearchWidget = d3.select("#company-search-widget");
  const companySearchInput = d3.select("#companySearchInput");
  const companySearchResults = d3.select("#company-search-results");
  const companySearchEmpty = d3.select("#company-search-empty");
  const companyInfoCard = d3.select("#company-info-card");

  let selectedCityKey = null;
  let selectedCompanyKey = null;

  // Draw circles
  const pointsG = viewport.append("g").attr("class", "company-points");

  function visibleCompanies(selectedIndustry) {
    if (selectedIndustry === "All") return projectedCompanies;
    return projectedCompanies.filter(d => d.Industry === selectedIndustry);
  }

  function setSelectedCompany(company) {
    if (!company) return;

    selectedCompanyKey = company.key;
    syncCompanySearchWidget();

    const t = String(company.Ticker || "").trim().toUpperCase();
    if (t && t !== "NULL" && t !== "N/A" && t !== "NA") {
      fetchStockData(t, company.Name, pointsG.selectAll("circle"));
    }
  }

  // Keep reference to latest circles selection (needed for brushing highlight)
  let lastRenderedCircles = null;

  function renderPoints() {
    const selectedIndustry = select.property("value");
    const selectedMode = modeSelect.property("value");

    const renderedData = selectedMode === "companies"
      ? visibleCompanies(selectedIndustry).map(d => ({ ...d, mode: "company" }))
      : clusters
        .map(c => ({
          ...c,
          mode: "city",
          cityKey: c.key,
          cityLabel: cityName(c),
          visible: visibleMembers(c, selectedIndustry)
        }))
        .filter(c => c.visible.length > 0);

    const circles = pointsG.selectAll("circle")
      .data(renderedData, d => `${d.mode}:${d.key}`)
      .join(
        enter => enter
          .append("circle")
          .attr("cx", d => d.x)
          .attr("cy", d => d.y)
          .attr("r", 0)
          .style("pointer-events", "all")
          .call(enter => enter.transition().duration(200)
            .attr("r", d => d.mode === "city" ? clusterRadius(d.visible.length) : 4)
          ),
        update => update
          .call(update => update.transition().duration(200)
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", d => d.mode === "city" ? clusterRadius(d.visible.length) : 4)
          ),
        exit => exit.call(exit => exit.transition().duration(150).attr("r", 0).remove())
      );

    circles
      .on("mouseover", (event, d) => {
        const html = d.mode === "city"
          ? formatTooltip({ ...d, members: d.visible }, "All")
          : companyTooltip(d);
        tooltip.style("opacity", 1).html(html);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY + 10) + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    if (selectedMode === "cities") {
      circles.on("click", (event, d) => {
        selectedCityKey = d.cityKey;
        syncCitySelectionAndList();
      });
    }

    if (selectedMode === "companies") {
      circles.on("click", (event, d) => setSelectedCompany(d));
    }

    lastRenderedCircles = circles;

    // Re-apply selection highlighting after rerender
    applySelectionStyling(lastRenderedCircles, currentBrushSelection);

    // Recompute aggregates after rerender (industry/mode change)
    updateAggregatesFromSelection();
  }

  function visibleCityClusters(selectedIndustry) {
    return clusters
      .map(c => ({
        key: c.key,
        label: cityName(c),
        companies: visibleMembers(c, selectedIndustry)
          .slice()
          .sort((a, b) => d3.ascending(a.Name, b.Name))
      }))
      .filter(c => c.companies.length > 0)
      .sort((a, b) => d3.ascending(a.label, b.label));
  }

  function syncCitySelectionAndList() {
    const selectedIndustry = select.property("value");
    const selectedMode = modeSelect.property("value");

    if (selectedMode !== "cities") {
      cityWidget.attr("hidden", true);
      return;
    }

    cityWidget.attr("hidden", null);

    const cityOptions = visibleCityClusters(selectedIndustry);
    if (!cityOptions.length) {
      citySelect.selectAll("option").remove();
      cityCompanyList.selectAll("li").remove();
      cityCompanyList.attr("hidden", true);
      cityWidgetEmpty.attr("hidden", null);
      selectedCityKey = null;
      return;
    }

    if (!selectedCityKey || !cityOptions.some(c => c.key === selectedCityKey)) {
      selectedCityKey = cityOptions[0].key;
    }

    const cityOptionJoin = citySelect
      .selectAll("option")
      .data(cityOptions, d => d.key)
      .join("option")
      .attr("value", d => d.key)
      .text(d => `${d.label} (${d.companies.length})`);

    cityOptionJoin.property("selected", d => d.key === selectedCityKey);

    const activeCity = cityOptions.find(c => c.key === selectedCityKey);
    const activeCompanies = activeCity ? activeCity.companies : [];

    cityCompanyList
      .attr("hidden", activeCompanies.length === 0 ? true : null)
      .selectAll("li")
      .data(activeCompanies, d => d.Name)
      .join("li")
      .text(d => d.Name);

    cityWidgetEmpty.attr("hidden", activeCompanies.length === 0 ? null : true);
  }

  function formatCompanyInfo(company) {
    if (!company) return "Search and select a company to view details.";
    return `
      <strong>${company.Name}</strong><br/>
      Location: ${company["Headquarters Location"] || "Unknown"}<br/>
      Industry: ${company.Industry || "Unknown"}<br/>
      Coordinates: ${Number(company.lat).toFixed(4)}, ${Number(company.lon).toFixed(4)}
    `;
  }

  function syncCompanySearchWidget() {
    const selectedMode = modeSelect.property("value");
    const selectedIndustry = select.property("value");

    if (selectedMode !== "companies") {
      companySearchWidget.attr("hidden", true);
      return;
    }

    companySearchWidget.attr("hidden", null);

    const query = (companySearchInput.property("value") || "").trim().toLowerCase();

    const companiesForMode = visibleCompanies(selectedIndustry)
      .slice()
      .sort((a, b) => d3.ascending(a.Name, b.Name));

    const matching = companiesForMode.filter(d => {
      if (!query) return true;
      const name = (d.Name || "").toLowerCase();
      const location = (d["Headquarters Location"] || "").toLowerCase();
      const industry = (d.Industry || "").toLowerCase();
      return name.includes(query) || location.includes(query) || industry.includes(query);
    });

    if (matching.length && (!selectedCompanyKey || !matching.some(c => c.key === selectedCompanyKey))) {
      selectedCompanyKey = matching[0].key;
    }

    if (!matching.length) selectedCompanyKey = null;

    const items = companySearchResults
      .selectAll("li")
      .data(matching, d => d.key)
      .join("li");

    items
      .attr("class", d => d.key === selectedCompanyKey ? "is-selected" : null)
      .text(d => d.Name)
      .on("click", (event, d) => setSelectedCompany(d));

    companySearchResults.attr("hidden", matching.length === 0 ? true : null);
    companySearchEmpty.attr("hidden", matching.length === 0 ? null : true);

    const selectedCompany = matching.find(c => c.key === selectedCompanyKey) || null;
    companyInfoCard.html(formatCompanyInfo(selectedCompany));
  }

  // ----- BRUSH SETUP -----
  brushBehavior = d3.brush()
    .extent([[0, 0], [width, height]])
    .on("start", () => {
      svg.on(".zoom", null);
    })
    .on("brush end", (event) => {
      currentBrushSelection = event.selection;
      applySelectionStyling(lastRenderedCircles, currentBrushSelection);
      updateAggregatesFromSelection();
    })
    .on("end", () => {
      svg.call(zoom);
      svg.on("dblclick.zoom", null);
    });

  brushG = svg.append("g").attr("class", "brush").call(brushBehavior);

  function updateAggregatesFromSelection() {
    const mode = modeSelect.property("value");
    const industry = select.property("value");

    if (!currentBrushSelection) {
      renderAggregatePanel({
        selection: null,
        selectedCompanies: []
      });
      fetchBasketStockData([]);
      return;
    }

    const selectedCompanies = companiesInSelection({
      selection: currentBrushSelection,
      mode,
      industry,
      projectedCompanies,
      clusters
    });

    const tickers = Array.from(new Set(
      selectedCompanies
        .map(d => String(d.Ticker || "").trim().toUpperCase())
        .filter(t => t && t !== "NULL" && t !== "N/A" && t !== "NA")
    ));

    fetchBasketStockData(tickers);

    renderAggregatePanel({
      selection: currentBrushSelection,
      selectedCompanies
    });
  }

  // Initial aggregates UI (no selection yet)
  updateAggregatesFromSelection();

  // Initial draws
  renderPoints();
  syncCitySelectionAndList();
  syncCompanySearchWidget();

  // Filter + mode listeners
  select.on("change", function () {
    renderPoints();
    syncCitySelectionAndList();
    syncCompanySearchWidget();
  });

  modeSelect.on("change", function () {
    tooltip.style("opacity", 0);
    renderPoints();
    syncCitySelectionAndList();
    syncCompanySearchWidget();
  });

  citySelect.on("change", function () {
    selectedCityKey = this.value;
    syncCitySelectionAndList();
  });

  companySearchInput.on("input", function () {
    syncCompanySearchWidget();
  });

  // KPI hook
  if (document.querySelector("#kpi-total")) {
    document.querySelector("#kpi-total").textContent = projectedCompanies.length.toLocaleString();
  }
}).catch(err => {
  console.error(err);
});