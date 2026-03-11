const width = 960;
const height = 600;

const svg = d3.select("#map");

const projection = d3.geoAlbersUsa()
    .scale(1200)
    .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.json("/data")
]).then(([us, companies]) => {

    const states = topojson.feature(us, us.objects.states);

    svg.append("g")
        .selectAll("path")
        .data(states.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", "#eee")
        .attr("stroke", "#999");

    svg.append("g")
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
        .append("title")
        .text(d => `${d.Name}\n${d["Headquarters Location"]}`);
});