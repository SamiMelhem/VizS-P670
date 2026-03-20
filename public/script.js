const width = 960;
const height = 600;

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

// ----- ZOOM -----
const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .translateExtent([[0, 0], [width, height]])
  .extent([[0, 0], [width, height]])
  .on("zoom", (event) => {
    viewport.attr("transform", event.transform);
  });

svg.call(zoom);

// Optional: double-click zoom is sometimes annoying on dashboards
svg.on("dblclick.zoom", null);

// Optional: expose reset hook for a button your teammates can add
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

function renderStockChart(ticker, companyName, data) {
  const container = document.getElementById("stock-chart-container");
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
    btn.addEventListener("click", () => {
      selectedRange = r;
      fetchStockData(selectedTicker, selectedCompanyName, currentCircles, r);
    });
    toggleBar.appendChild(btn);
  });
  container.appendChild(toggleBar);

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

  // Interactive hover overlay
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

// ----- LOAD DATA -----
Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.json("/data")
]).then(([us, companies]) => {
  const states = topojson.feature(us, us.objects.states);

  // Draw states
  viewport.append("g")
    .attr("class", "states")
    .selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#eee")
    .attr("stroke", "#999");

  // Populate industry dropdown
  select.selectAll("option").remove();
  select.append("option").attr("value", "All").text("All");

  const industries = Array.from(new Set(companies.map(d => d.Industry))).sort();
  industries.forEach(ind => {
    select.append("option").attr("value", ind).text(ind);
  });

  // Draw circles
  const pointsG = viewport.append("g").attr("class", "company-points");

  const circles = pointsG.selectAll("circle")
    .data(companies, d => d.Name)
    .join("circle")
    .attr("cx", d => {
      const coords = projection([+d.lon, +d.lat]);
      return coords ? coords[0] : -9999;
    })
    .attr("cy", d => {
      const coords = projection([+d.lon, +d.lat]);
      return coords ? coords[1] : -9999;
    })
    .attr("r", 4)
    .attr("fill", "steelblue")
    .attr("opacity", 0.7)
    .style("pointer-events", "all")
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.Name}</strong><br/>
          Location: ${d["Headquarters Location"]}<br/>
          Industry: ${d.Industry}
        `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      fetchStockData(d.Ticker, d.Name, circles);
    });

  // Filter
  select.on("change", function () {
    const selected = this.value;
    circles
      .transition()
      .duration(200)
      .attr("opacity", d => (selected === "All" || d.Industry === selected) ? 0.7 : 0);
  });

  // ----- “BLANK DASHBOARD” HOOKS (placeholders teammates can implement) -----
  // Example: show counts somewhere
  if (document.querySelector("#kpi-total")) {
    document.querySelector("#kpi-total").textContent = companies.length.toLocaleString();
  }

}).catch(err => {
  console.error(err);
});