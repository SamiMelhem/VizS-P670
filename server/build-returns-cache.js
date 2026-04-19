/**
 * build-returns-cache.js
 *
 * Pre-computes stock returns for every ticker in companies_geocoded.json
 * across multiple time periods and writes results to returns_cache.json.
 *
 * Usage:  node server/build-returns-cache.js
 */

const fs = require("fs");
const path = require("path");

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y"];
const BATCH_SIZE = 10;

const RANGE_CONFIG = {
  "1D":  { days: 2,    interval: "1h"   },
  "1W":  { days: 7,    interval: "1d"   },
  "1M":  { days: 30,   interval: "1d"   },
  "3M":  { days: 90,   interval: "1d"   },
  "YTD": { ytd: true,  interval: "1d"   },
  "1Y":  { days: 365,  interval: "1wk"  },
  "5Y":  { days: 1825, interval: "1mo"  },
};

async function main() {
  // Dynamic import for yahoo-finance2 (ESM module)
  const mod = await import("yahoo-finance2");
  const YahooFinance = mod.default;
  const yahooFinance = new YahooFinance();

  // Load tickers
  const companiesPath = path.join(__dirname, "companies_geocoded.json");
  const companies = JSON.parse(fs.readFileSync(companiesPath, "utf8"));
  const tickers = [...new Set(
    companies
      .map(c => (c.Ticker || "").trim().toUpperCase())
      .filter(t => t && t !== "NULL" && t !== "N/A" && t !== "NA")
  )];

  console.log(`Found ${tickers.length} unique tickers across ${companies.length} companies`);
  console.log(`Fetching returns for periods: ${PERIODS.join(", ")}\n`);

  const allReturns = {};
  for (const period of PERIODS) {
    allReturns[period] = {};
  }

  let completed = 0;
  const total = tickers.length;

  // Process in batches
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (ticker) => {
      const safeTicker = ticker.replace(".", "-");

      for (const period of PERIODS) {
        try {
          const config = RANGE_CONFIG[period];
          const now = new Date();
          let period1;
          if (config.ytd) {
            period1 = new Date(now.getFullYear(), 0, 1);
          } else {
            period1 = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
          }

          const result = await yahooFinance.chart(safeTicker, {
            period1,
            period2: now,
            interval: config.interval,
          });

          const quotes = (result.quotes || []).filter(q => q.close != null);
          if (quotes.length >= 2) {
            const first = quotes[0].close;
            const last = quotes[quotes.length - 1].close;
            const ret = ((last - first) / first) * 100;
            allReturns[period][ticker] = Math.round(ret * 100) / 100;
          }
        } catch (err) {
          // Skip failed tickers silently
        }
      }

      completed++;
      const pct = ((completed / total) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${completed}/${total} (${pct}%) — ${ticker}`);
    }));
  }

  console.log("\n");

  // Summary
  for (const period of PERIODS) {
    const count = Object.keys(allReturns[period]).length;
    console.log(`  ${period}: ${count}/${tickers.length} tickers`);
  }

  // Write cache
  const outputPath = path.join(__dirname, "returns_cache.json");
  const output = {
    updatedAt: new Date().toISOString(),
    periods: PERIODS,
    returns: allReturns,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Cache written to ${outputPath}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
