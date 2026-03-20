const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/data", (req, res) => {
  try {
    const filePath = path.join(__dirname, "companies_geocoded.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    // Ensure lat/lon are numbers (projection expects numbers)
    const cleaned = data
      .map(d => ({ ...d, lat: +d.lat, lon: +d.lon }))
      .filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lon));

    res.json(cleaned);
  } catch (err) {
    console.error("Failed to serve /data:", err);
    res.status(500).json({ error: "Failed to load companies data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});