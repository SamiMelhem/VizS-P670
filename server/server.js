const express = require("express");
const fs = require("fs");
const path = require("path");

function normalizeTicker(ticker) {
  return ticker.replace(".", "-");
}

let yahooFinance;
const yfReady = import("yahoo-finance2").then((mod) => {
  const YahooFinance = mod.default;
  yahooFinance = new YahooFinance();
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/data", async (req, res) => {
  try {
    await yfReady;

    const filePath = path.join(__dirname, "companies_geocoded.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    const cleaned = data
      .map(d => ({ ...d, lat: +d.lat, lon: +d.lon }))
      .filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lon));

    // ⚡ Fetch market caps in parallel (limit to avoid overload)
    const results = await Promise.all(
      cleaned.map(async (company) => {
        try {
          const safeTicker = normalizeTicker(company.Ticker);
          const quote = await yahooFinance.quote(safeTicker);
          return {
            ...company,
            marketCap: quote.marketCap || null
          };
        } catch (err) {
          return {
            ...company,
            marketCap: null
          };
        }
      })
    );

    res.json(results);

  } catch (err) {
    console.error("Failed to serve /data:", err);
    res.status(500).json({ error: "Failed to load companies data" });
  }
});

const RANGE_CONFIG = {
  "1D": { days: 1,    interval: "5m"  },
  "1W": { days: 7,    interval: "1d"  },
  "1M": { days: 30,   interval: "1d"  },
  "3M": { days: 90,   interval: "1d"  },
  "6M": { days: 180,  interval: "1d"  },
  "YTD": { ytd: true, interval: "1d"  },
  "1Y": { days: 365,  interval: "1wk" },
  "5Y": { days: 1825, interval: "1mo" },
};

app.get("/api/stock/:ticker", async (req, res) => {
  try {
    await yfReady;

    const ticker = req.params.ticker.toUpperCase();
    const range = (req.query.range || "1W").toUpperCase();
    const config = RANGE_CONFIG[range] || RANGE_CONFIG["1W"];

    const now = new Date();
    let period1;
    if (config.ytd) {
      period1 = new Date(now.getFullYear(), 0, 1);
    } else {
      period1 = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
    }

    const result = await yahooFinance.chart(ticker, {
      period1,
      period2: now,
      interval: config.interval,
    });

    const round2 = (v) => v != null ? Math.round(v * 100) / 100 : null;

    const quotes = result.quotes
      .filter((q) => q.close !== null)
      .map((q) => ({
        date: q.date,
        open: round2(q.open),
        high: round2(q.high),
        low: round2(q.low),
        close: round2(q.close),
        volume: q.volume,
      }));

    res.json({
      ticker: result.meta.symbol,
      currency: result.meta.currency,
      name: result.meta.shortName || result.meta.longName || ticker,
      range,
      quotes,
    });
  } catch (err) {
    console.error(`Failed to fetch stock data for ${req.params.ticker}:`, err.message);
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});