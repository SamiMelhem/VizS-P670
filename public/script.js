const width = 960;
const height = 600;

const svg = d3.select("#map");

const projection = d3.geoAlbersUsa()
    .scale(1200)
    .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

const tooltip = d3.select("#tooltip");
const select = d3.select("#industryFilter");

Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.json("/data")
]).then(([us, companies]) => {

    const states = topojson.feature(us, us.objects.states);

    // Draw states
    svg.append("g")
        .selectAll("path")
        .data(states.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", "#eee")
        .attr("stroke", "#999");

    // Industry dropdown
    const industries = Array.from(new Set(companies.map(d => d.Industry)));

    industries.forEach(ind => {
        select.append("option")
            .attr("value", ind)
            .text(ind);
    });

    // Draw circles
    const circles = svg.append("g")
        .selectAll("circle")
        .data(companies)
        .enter()
        .append("circle")
        .attr("cx", d => {
            const coords = projection([d.lon, d.lat]);
            return coords ? coords[0] : null;
        })
        .attr("cy", d => {
            const coords = projection([d.lon, d.lat]);
            return coords ? coords[1] : null;
        })
        .attr("r", 4)
        .attr("fill", "steelblue")
        .attr("opacity", 0.7)

        // Tooltip events
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
        });

    select.on("change", function () {
        const selected = this.value;

        circles
            .transition()
            .duration(300)
            .attr("opacity", d =>
                selected === "All" || d.Industry === selected ? 0.7 : 0);
    });

});