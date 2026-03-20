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
  const cityToCompanyCount = d3.rollup(projectedCompanies, v => v.length, d => d["Headquarters Location"] || "Unknown");
  const overlappedCityCount = Array.from(cityToCompanyCount.values()).filter(v => v > 1).length;

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
          .map(c => ({ ...c, mode: "city", visible: visibleMembers(c, selectedIndustry) }))
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
  }

  renderPoints();

  // Filter
  select.on("change", function () {
    renderPoints();
  });

  modeSelect.on("change", function () {
    tooltip.style("opacity", 0);
    renderPoints();
  });

  // ----- “BLANK DASHBOARD” HOOKS (placeholders teammates can implement) -----
  // Example: show counts somewhere
  if (document.querySelector("#kpi-total")) {
    document.querySelector("#kpi-total").textContent = projectedCompanies.length.toLocaleString();
  }

}).catch(err => {
  console.error(err);
});