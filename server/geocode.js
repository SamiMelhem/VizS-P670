const fs = require("fs");
const csv = require("csv-parser");

const results = [];

async function geocode(location) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;

    const res = await fetch(url, {
        headers: { "User-Agent": "d3-map-project" }
    });

    const data = await res.json();

    if (data.length > 0) {
        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon)
        };
    }

    return null;
}

async function run() {

    const rows = [];

    fs.createReadStream("./server/sp500-companies.csv")
        .pipe(csv())
        .on("data", row => rows.push(row))
        .on("end", async () => {

            for (const r of rows) {

                console.log("Geocoding:", r["Headquarters Location"]);

                const coords = await geocode(r["Headquarters Location"]);

                if (coords) {
                    r.lat = coords.lat;
                    r.lon = coords.lon;
                }

                results.push(r);

                await new Promise(r => setTimeout(r, 1000)); // avoid rate limits
            }

            fs.writeFileSync(
                "./server/companies_geocoded.json",
                JSON.stringify(results, null, 2)
            );

            console.log("Finished geocoding");
        });
}

run();