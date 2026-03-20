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
const modeSelect = d3.select("#displayMode");
const widgetArea1 = d3.select("#widget-area-1");

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
    return {
      key,
      x: first.x,
      y: first.y,
      members
    };
  });
}

function visibleMembers(cluster, selectedIndustry) {
  if (selectedIndustry === "All") {
    return cluster.members;
  }
  return cluster.members.filter(d => d.Industry === selectedIndustry);
}

function clusterRadius(count) {
  return 3 + Math.min(14, Math.sqrt(count) * 2.2);
}

function formatTooltip(cluster, selectedIndustry) {
  const visible = visibleMembers(cluster, selectedIndustry);
  if (!visible.length) {
    return "";
  }

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
    .attr("d", path)
    .attr("fill", "#eee")
    .attr("stroke", "#999");

  // Populate industry dropdown
  select.selectAll("option").remove();
  select.append("option").attr("value", "All").text("All");

  const industries = Array.from(new Set(projectedCompanies.map(d => d.Industry))).sort();
  industries.forEach(ind => {
    select.append("option").attr("value", ind).text(ind);
  });

  const clusters = groupedByCoordinates(projectedCompanies);

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
    if (selectedIndustry === "All") {
      return projectedCompanies;
    }
    return projectedCompanies.filter(d => d.Industry === selectedIndustry);
  }

  function renderPoints() {
    const selectedIndustry = select.property("value");
    const selectedMode = modeSelect.property("value");

    const renderedData = selectedMode === "companies"
      ? visibleCompanies(selectedIndustry).map(d => ({ ...d, mode: "company" }))
        : clusters
          .map(c => ({ ...c, mode: "city", cityKey: c.key, cityLabel: cityName(c), visible: visibleMembers(c, selectedIndustry) }))
          .filter(c => c.visible.length > 0);

    const circles = pointsG.selectAll("circle")
      .data(renderedData, d => `${d.mode}:${d.key}`)
      .join(
        enter => enter
          .append("circle")
          .attr("cx", d => d.x)
          .attr("cy", d => d.y)
          .attr("r", 0)
          .attr("fill", "steelblue")
          .attr("opacity", 0.8)
          .style("pointer-events", "all")
          .call(enter => enter.transition().duration(200).attr("r", d => d.mode === "city" ? clusterRadius(d.visible.length) : 4)),
        update => update
          .call(update => update.transition().duration(200)
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", d => d.mode === "city" ? clusterRadius(d.visible.length) : 4)
            .attr("opacity", 0.8)),
        exit => exit
          .call(exit => exit.transition().duration(150).attr("r", 0).remove())
      );

    circles
      .on("mouseover", (event, d) => {
        const html = d.mode === "city"
          ? formatTooltip({ ...d, members: d.visible }, "All")
          : companyTooltip(d);
        tooltip
          .style("opacity", 1)
          .html(html);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY + 10) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("opacity", 0);
      });

    if (selectedMode === "cities") {
      circles.on("click", (event, d) => {
        selectedCityKey = d.cityKey;
        syncCitySelectionAndList();
      });
    }

    if (selectedMode === "companies") {
      circles.on("click", (event, d) => {
        selectedCompanyKey = d.key;
        syncCompanySearchWidget();
      });
    }
  }

  function visibleCityClusters(selectedIndustry) {
    return clusters
      .map(c => ({
        key: c.key,
        label: cityName(c),
        companies: visibleMembers(c, selectedIndustry).slice().sort((a, b) => d3.ascending(a.Name, b.Name))
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
    if (!company) {
      return "Search and select a company to view details.";
    }

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
      if (!query) {
        return true;
      }
      const name = (d.Name || "").toLowerCase();
      const location = (d["Headquarters Location"] || "").toLowerCase();
      const industry = (d.Industry || "").toLowerCase();
      return name.includes(query) || location.includes(query) || industry.includes(query);
    });

    if (matching.length && (!selectedCompanyKey || !matching.some(c => c.key === selectedCompanyKey))) {
      selectedCompanyKey = matching[0].key;
    }

    if (!matching.length) {
      selectedCompanyKey = null;
    }

    const items = companySearchResults
      .selectAll("li")
      .data(matching, d => d.key)
      .join("li");

    items
      .attr("class", d => d.key === selectedCompanyKey ? "is-selected" : null)
      .text(d => d.Name)
      .on("click", (event, d) => {
        selectedCompanyKey = d.key;
        syncCompanySearchWidget();
      });

    companySearchResults.attr("hidden", matching.length === 0 ? true : null);
    companySearchEmpty.attr("hidden", matching.length === 0 ? null : true);

    const selectedCompany = matching.find(c => c.key === selectedCompanyKey) || null;
    companyInfoCard.html(formatCompanyInfo(selectedCompany));
  }

  renderPoints();
  syncCitySelectionAndList();
  syncCompanySearchWidget();

  // Filter
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

  // ----- “BLANK DASHBOARD” HOOKS (placeholders teammates can implement) -----
  // Example: show counts somewhere
  if (document.querySelector("#kpi-total")) {
    document.querySelector("#kpi-total").textContent = projectedCompanies.length.toLocaleString();
  }

}).catch(err => {
  console.error(err);
});