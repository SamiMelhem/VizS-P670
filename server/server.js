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
    
    // Don't fetch market caps on initial load - return data immediately
    res.json(cleaned);
  } catch (err) {
    console.error("Failed to serve /data:", err);
    res.status(500).json({ error: "Failed to load companies data" });
  }
});

// Add new endpoint for fetching market cap on demand
app.get("/api/marketcap/:ticker", async (req, res) => {
  try {
    await yfReady;
    const safeTicker = normalizeTicker(req.params.ticker);
    const quote = await yahooFinance.quote(safeTicker);
    res.json({ 
      ticker: req.params.ticker,
      marketCap: quote.marketCap || null 
    });
  } catch (err) {
    res.json({ 
      ticker: req.params.ticker,
      marketCap: null 
    });
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
    await yfReady; // Make sure Yahoo Finance is loaded
    
    // Validate and normalize range
    const range = (req.query.range || "1W").toUpperCase();
    
    if (!RANGE_CONFIG[range]) {
      return res.status(400).json({ 
        error: `Invalid range. Supported: ${Object.keys(RANGE_CONFIG).join(", ")}`,
        supportedRanges: Object.keys(RANGE_CONFIG)
      });
    }
    
    const config = RANGE_CONFIG[range];
    
    // Parse and validate tickers
    const tickersParam = (req.query.tickers || "").trim();
    const tickers = tickersParam
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .filter(t => t !== "NULL" && t !== "N/A" && t !== "NA");
    
    if (!tickers.length) {
      return res.status(200).json({
        ticker: "BASKET",
        name: "Selection basket (0/0 tickers)",
        range,
        quotes: [],
        componentsUsed: 0,
        componentsRequested: 0,
        components: [],
        supportedRanges: Object.keys(RANGE_CONFIG)
      });
    }
    
    const MAX = 30;
    const basketTickers = tickers.slice(0, MAX);
    
    
    // Calculate date range
    const now = new Date();
    let period1;
    if (config.ytd) {
      period1 = new Date(now.getFullYear(), 0, 1);
    } else {
      period1 = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
    }
    
    // Fetch all ticker data in parallel
    const results = await Promise.allSettled(
      basketTickers.map(t =>
        yahooFinance.chart(t, { period1, period2: now, interval: config.interval })
          .catch(err => {
            console.log(`❌ Failed to fetch ${t}:`, err.message);
            return null;
          })
      )
    );
    
    
    // Process successful results
    const series = results
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value)
      .filter(r => r?.meta?.symbol && Array.isArray(r?.quotes) && r.quotes.length)
      .map(r => {
        const symbol = r.meta.symbol.toUpperCase();
        const quotes = r.quotes
          .filter(q => q?.date && q.close != null)
          .map(q => ({ t: +new Date(q.date), close: Number(q.close) }))
          .filter(q => Number.isFinite(q.t) && Number.isFinite(q.close))
          .sort((a, b) => a.t - b.t);
        
        const baseline = quotes.length ? quotes[0].close : null;
        
        if (!baseline || !Number.isFinite(baseline) || baseline <= 0) {
          return null;
        }
        
        return { symbol, baseline, quotes };
      })
      .filter(Boolean);
    
    
    // Helper functions
    const round4 = (v) => (v != null ? Math.round(v * 10000) / 10000 : null);
    const round2 = (v) => (v != null ? Math.round(v * 100) / 100 : null);
    
    // Return early if no valid data
    if (!series.length) {
      console.log("⚠️ No valid series data");
      return res.status(200).json({
        ticker: "BASKET",
        name: `Selection basket (0/${basketTickers.length} tickers)`,
        range,
        quotes: [],
        componentsUsed: 0,
        componentsRequested: basketTickers.length,
        components: basketTickers,
        supportedRanges: Object.keys(RANGE_CONFIG)
      });
    }
    
    // Build time-indexed map of normalized values
    const byTime = new Map();
    for (const s of series) {
      for (const q of s.quotes) {
        const idx = q.close / s.baseline;
        
        if (!Number.isFinite(idx)) continue;
        
        if (!byTime.has(q.t)) {
          byTime.set(q.t, []);
        }
        byTime.get(q.t).push(idx);
      }
    }
    
    const times = Array.from(byTime.keys()).sort((a, b) => a - b);
    
    // Require minimum contributors
    const minContrib = Math.max(2, Math.ceil(series.length * 0.6));
    
    // Build basket index (starting at 100)
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
    
    
    return res.json({
      ticker: "BASKET",
      currency: "USD",
      name: `Selection basket (${series.length}/${basketTickers.length} tickers)`,
      range,
      quotes,
      componentsUsed: series.length,
      componentsRequested: basketTickers.length,
      components: series.map(s => s.symbol),
      minContrib,
      base: 100,
      supportedRanges: Object.keys(RANGE_CONFIG)
    });
    
  } catch (err) {
    res.status(500).json({ 
      error: "Failed to fetch basket data",
      message: err.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});