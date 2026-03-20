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

const COMPANIES_PATH = path.join(__dirname, "companies_geocoded.json");
const RETURNS_CACHE_PATH = path.join(__dirname, "returns_1y_cache.json");
const RETURNS_TTL_MS = 24 * 60 * 60 * 1000;
const BULK_CONCURRENCY = 4;
const BULK_CHUNK_DELAY_MS = 120;

app.use(express.static(path.join(__dirname, "..", "public")));

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

function buildPeriodBounds(range) {
  const config = RANGE_CONFIG[range] || RANGE_CONFIG["1W"];
  const now = new Date();
  let period1;
  if (config.ytd) {
    period1 = new Date(now.getFullYear(), 0, 1);
  } else {
    period1 = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
  }
  return { period1, period2: now, interval: config.interval };
}

const round2 = (v) => (v != null ? Math.round(v * 100) / 100 : null);

async function fetchYahooChartQuotes(ticker, range) {
  await yfReady;
  const t = ticker.toUpperCase();
  const { period1, period2, interval } = buildPeriodBounds(range);
  const result = await yahooFinance.chart(t, {
    period1,
    period2,
    interval,
  });

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

  return { meta: result.meta, quotes };
}

function pctReturnFromQuotes(quotes) {
  if (!quotes || quotes.length < 2) {
    return null;
  }
  const firstClose = quotes[0].close;
  const lastClose = quotes[quotes.length - 1].close;
  if (firstClose == null || lastClose == null || firstClose === 0) {
    return null;
  }
  return Math.round(((lastClose - firstClose) / firstClose) * 10000) / 100;
}

function readReturnsCache() {
  try {
    if (!fs.existsSync(RETURNS_CACHE_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(RETURNS_CACHE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

app.get("/data", (req, res) => {
  try {
    const raw = fs.readFileSync(COMPANIES_PATH, "utf8");
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

app.get("/api/stock/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const range = (req.query.range || "1W").toUpperCase();

    const { meta, quotes } = await fetchYahooChartQuotes(ticker, range);

    res.json({
      ticker: meta.symbol,
      currency: meta.currency,
      name: meta.shortName || meta.longName || ticker,
      range,
      quotes,
    });
  } catch (err) {
    console.error(`Failed to fetch stock data for ${req.params.ticker}:`, err.message);
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

app.get("/api/returns/1y", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    if (!forceRefresh) {
      const cached = readReturnsCache();
      if (cached && cached.updatedAt) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age >= 0 && age < RETURNS_TTL_MS && cached.returns && typeof cached.returns === "object") {
          return res.json(cached);
        }
      }
    }

    const raw = fs.readFileSync(COMPANIES_PATH, "utf8");
    const data = JSON.parse(raw);
    const tickers = [...new Set(data.map(d => d.Ticker).filter(Boolean))];

    const returns = {};
    for (let i = 0; i < tickers.length; i += BULK_CONCURRENCY) {
      const slice = tickers.slice(i, i + BULK_CONCURRENCY);
      await Promise.all(
        slice.map(async (tk) => {
          try {
            const { quotes } = await fetchYahooChartQuotes(tk, "1Y");
            const pct = pctReturnFromQuotes(quotes);
            if (pct != null) {
              returns[tk] = pct;
            }
          } catch (err) {
            console.error(`1Y return ${tk}:`, err.message);
          }
        })
      );
      if (i + BULK_CONCURRENCY < tickers.length) {
        await new Promise((r) => setTimeout(r, BULK_CHUNK_DELAY_MS));
      }
    }

    const payload = { updatedAt: new Date().toISOString(), returns };
    try {
      fs.writeFileSync(RETURNS_CACHE_PATH, JSON.stringify(payload), "utf8");
    } catch (writeErr) {
      console.error("Failed to write returns cache:", writeErr.message);
    }

    res.json(payload);
  } catch (err) {
    console.error("Failed /api/returns/1y:", err);
    res.status(500).json({ error: "Failed to load annual returns" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
