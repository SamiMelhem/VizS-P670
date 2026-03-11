const express = require("express");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(express.static("public"));

app.get("/data", (req, res) => {
    const data = JSON.parse(fs.readFileSync("./server/companies_geocoded.json"));
    res.json(data);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});