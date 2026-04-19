/**
 * build-company-data.js
 *
 * Enriches companies_geocoded.json with market cap data from Yahoo Finance
 * and removes tickers that have no stock data available.
 *
 * Usage:  node server/build-company-data.js
 */

const fs = require("fs");
const path = require("path");

const BATCH_SIZE = 10;

async function main() {
  const mod = await import("yahoo-finance2");
  const YahooFinance = mod.default;
  const yahooFinance = new YahooFinance();

  const companiesPath = path.join(__dirname, "companies_geocoded.json");
  const companies = JSON.parse(fs.readFileSync(companiesPath, "utf8"));

  console.log(`Processing ${companies.length} companies...\n`);

  // Load the returns cache to identify which tickers have valid stock data
  let validTickers = new Set();
  try {
    const cachePath = path.join(__dirname, "returns_cache.json");
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    // A ticker is valid if it appears in ANY period
    for (const period of Object.keys(cache.returns || {})) {
      for (const ticker of Object.keys(cache.returns[period])) {
        validTickers.add(ticker.toUpperCase());
      }
    }
    console.log(`Found ${validTickers.size} valid tickers from returns cache\n`);
  } catch (err) {
    console.warn("No returns_cache.json found, skipping ticker validation");
  }

  // Fetch market caps in batches
  let completed = 0;
  const total = companies.length;
  const removed = [];

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (company) => {
      const ticker = (company.Ticker || "").trim().toUpperCase();
      if (!ticker || ticker === "NULL" || ticker === "N/A" || ticker === "NA") {
        company._remove = true;
        removed.push({ name: company.Name, reason: "no ticker" });
        completed++;
        return;
      }

      // Check if ticker has valid stock data
      if (validTickers.size > 0 && !validTickers.has(ticker)) {
        company._remove = true;
        removed.push({ name: company.Name, ticker, reason: "no stock data" });
        completed++;
        return;
      }

      // Fetch market cap
      try {
        const safeTicker = ticker.replace(".", "-");
        const quote = await yahooFinance.quote(safeTicker);
        company.marketCap = quote.marketCap || null;
      } catch (err) {
        company.marketCap = null;
      }

      completed++;
      const pct = ((completed / total) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${completed}/${total} (${pct}%)`);
    }));
  }

  console.log("\n");

  // Remove invalid companies
  const cleaned = companies.filter(c => !c._remove);
  cleaned.forEach(c => delete c._remove);

  // Summary
  const withCap = cleaned.filter(c => c.marketCap).length;
  console.log(`  Companies with market cap: ${withCap}/${cleaned.length}`);
  console.log(`  Companies removed: ${removed.length}`);
  if (removed.length) {
    removed.forEach(r => console.log(`    - ${r.name} (${r.ticker || "?"}) — ${r.reason}`));
  }

  // Write back
  fs.writeFileSync(companiesPath, JSON.stringify(cleaned, null, 2));
  console.log(`\n✅ Updated ${companiesPath} (${cleaned.length} companies)`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
