const express = require("express");
const fs = require("fs");
const path = require("path");

let yahooFinance;
const yfReady = import("yahoo-finance2").then((mod) => {
  const YahooFinance = mod.default;
  yahooFinance = new YahooFinance();
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/data", (req, res) => {
  try {
    const filePath = path.join(__dirname, "companies_geocoded.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    const cleaned = data
      .map(d => ({ ...d, lat: +d.lat, lon: +d.lon }))
      .filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lon));

    res.json(cleaned);
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

app.get("/api/stock-basket", async (req, res) => {
  try {
    await yfReady;

    const range = (req.query.range || "1W").toUpperCase();
    const config = RANGE_CONFIG[range] || RANGE_CONFIG["1W"];

    const tickersParam = (req.query.tickers || "").trim();
    const tickers = tickersParam
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .filter(t => t !== "NULL" && t !== "N/A" && t !== "NA");

    if (!tickers.length) {
      return res.status(400).json({ error: "tickers is required" });
    }

    const MAX = 30;
    const basketTickers = tickers.slice(0, MAX);

    const now = new Date();
    let period1;
    if (config.ytd) period1 = new Date(now.getFullYear(), 0, 1);
    else period1 = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);

    const results = await Promise.allSettled(
      basketTickers.map(t =>
        yahooFinance.chart(t, { period1, period2: now, interval: config.interval })
      )
    );

    // Convert fulfilled results into per-ticker quote arrays
    const series = results
      .filter(r => r.status === "fulfilled")
      .map(r => r.value)
      .filter(r => r?.meta?.symbol && Array.isArray(r?.quotes) && r.quotes.length)
      .map(r => {
        const symbol = r.meta.symbol.toUpperCase();
        const quotes = r.quotes
          .filter(q => q?.date && q.close != null)
          .map(q => ({ t: +new Date(q.date), close: Number(q.close) }))
          .filter(q => Number.isFinite(q.t) && Number.isFinite(q.close))
          .sort((a, b) => a.t - b.t);

        // baseline = first close in range
        const baseline = quotes.length ? quotes[0].close : null;
        if (!baseline || !Number.isFinite(baseline) || baseline <= 0) return null;

        return { symbol, baseline, quotes };
      })
      .filter(Boolean);

    if (!series.length) {
      return res.status(200).json({
        ticker: "BASKET",
        name: "Selection basket",
        range,
        quotes: [],
        components: basketTickers,
        componentsUsed: 0,
        componentsRequested: basketTickers.length,
      });
    }

    // Build time -> array of normalized index values (close/baseline)
    const byTime = new Map();
    for (const s of series) {
      for (const q of s.quotes) {
        const idx = q.close / s.baseline; // normalized
        if (!Number.isFinite(idx)) continue;
        if (!byTime.has(q.t)) byTime.set(q.t, []);
        byTime.get(q.t).push(idx);
      }
    }

    const times = Array.from(byTime.keys()).sort((a, b) => a - b);

    // Require at least a minimum number of tickers contributing at a timestamp.
    // This avoids end-of-range artifacts (e.g., “today” only has 1 ticker).
    const minContrib = Math.max(2, Math.ceil(series.length * 0.6)); // 60% or at least 2

    const round4 = (v) => (v != null ? Math.round(v * 10000) / 10000 : null);
    const round2 = (v) => (v != null ? Math.round(v * 100) / 100 : null);

    // Build an index level (start at 100)
    const quotes = [];
    for (const t of times) {
      const idxs = byTime.get(t);
      if (!idxs || idxs.length < minContrib) continue;

      const avgIdx = idxs.reduce((a, b) => a + b, 0) / idxs.length;
      const level = avgIdx * 100;

      quotes.push({
        date: new Date(t),
        open: round2(level),
        high: round2(level),
        low: round2(level),
        close: round2(level),
        volume: null,
        _avgIdx: round4(avgIdx),
        _contributors: idxs.length
      });
    }

    res.json({
      ticker: "BASKET",
      currency: series[0]?.meta?.currency, // may be undefined; fine for your client
      name: `Selection basket (${series.length}/${basketTickers.length} tickers)`,
      range,
      quotes,
      componentsUsed: series.length,
      componentsRequested: basketTickers.length,
      components: basketTickers,
      minContrib,
      base: 100
    });
  } catch (err) {
    console.error("Failed to fetch basket data:", err.message);
    res.status(500).json({ error: "Failed to fetch basket data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});