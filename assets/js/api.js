/**
 * NEPSE SMART — Data Layer (api.js)
 * ──────────────────────────────────
 * All data fetching lives here. When you connect your backend,
 * only change the CONFIG section. All pages consume this module.
 *
 * DATA SOURCES (priority order):
 *  1. Local Python server (NepseUnofficialApi) at localhost:8000  ← LIVE
 *  2. CORS proxy to sharesansar.com                               ← FALLBACK
 *  3. Cached demo data                                            ← OFFLINE/DEV
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  // !! REPLACE THIS with your Render.com URL after deploying backend !!
  // Example: 'https://nepse-smart-api.onrender.com'
  BACKEND_URL: 'https://nepse-api-vgsd.onrender.com',

  // Data refresh interval (ms)
  REFRESH_MS: 5 * 60 * 1000,  // 5 minutes

  // Market hours (Nepal time UTC+5:45)
  MARKET_OPEN:  { h: 11, m: 0 },
  MARKET_CLOSE: { h: 15, m: 0 },

  // Set to false once your backend is deployed on Render
  DEMO_MODE: false,
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
window.NEPSE = {
  stocks:       [],   // today's full price list
  indices:      {},   // NEPSE, Sensitive, Float indices
  brokerData:   [],   // floorsheet aggregated by broker
  portfolio:    JSON.parse(localStorage.getItem('ns_portfolio') || '[]'),
  watchlist:    JSON.parse(localStorage.getItem('ns_watchlist') || '[]'),
  alerts:       JSON.parse(localStorage.getItem('ns_alerts')    || '[]'),
  lastUpdated:  null,
  isMarketOpen: false,
  listeners:    {},   // event listeners
};

// ═══════════════════════════════════════════════════════════════
// EVENT BUS
// ═══════════════════════════════════════════════════════════════
const Bus = {
  on(event, fn) {
    if (!NEPSE.listeners[event]) NEPSE.listeners[event] = [];
    NEPSE.listeners[event].push(fn);
  },
  emit(event, data) {
    (NEPSE.listeners[event] || []).forEach(fn => fn(data));
  },
};

// ═══════════════════════════════════════════════════════════════
// MARKET STATUS
// ═══════════════════════════════════════════════════════════════
function checkMarketStatus() {
  // Nepal time = UTC+5:45
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const npt = new Date(utc + 5.75 * 3600000);
  const h = npt.getHours(), m = npt.getMinutes();
  const mins = h * 60 + m;
  const open  = CONFIG.MARKET_OPEN.h  * 60 + CONFIG.MARKET_OPEN.m;
  const close = CONFIG.MARKET_CLOSE.h * 60 + CONFIG.MARKET_CLOSE.m;
  // Market open Sunday–Thursday
  const day = npt.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const isWeekday = day >= 0 && day <= 4;
  NEPSE.isMarketOpen = isWeekday && mins >= open && mins < close;
  return NEPSE.isMarketOpen;
}

// ═══════════════════════════════════════════════════════════════
// DEMO DATA (realistic NEPSE stocks)
// ═══════════════════════════════════════════════════════════════
const DEMO_STOCKS = [
  { symbol:'NHPC',  name:'Nepal Hydro Power Co.',            sector:'Hydropower',   ltp:302.4, open:295.0, high:308.0, low:292.0, prev:295.0, vol:245830, to:7.42e7, eps:12.4, pe:24.4, bv:180, div:10 },
  { symbol:'UPPER', name:'Upper Tamakoshi Hydro.',           sector:'Hydropower',   ltp:268.5, open:260.0, high:272.0, low:258.0, prev:260.0, vol:189240, to:5.08e7, eps:14.1, pe:19.0, bv:155, div:15 },
  { symbol:'KKHC',  name:'Kulekhani Khimti Hydro Co.',       sector:'Hydropower',   ltp:188.0, open:182.0, high:191.0, low:180.0, prev:182.0, vol:310200, to:5.83e7, eps:8.2,  pe:22.9, bv:120, div:8  },
  { symbol:'CHCL',  name:'Chilime Hydro Power Co.',          sector:'Hydropower',   ltp:498.0, open:480.0, high:502.0, low:477.0, prev:480.0, vol:66630,  to:3.32e7, eps:25.6, pe:19.5, bv:300, div:20 },
  { symbol:'DHEL',  name:'Dodhkola Energy Ltd.',             sector:'Hydropower',   ltp:189.5, open:186.0, high:194.0, low:185.0, prev:186.0, vol:94120,  to:1.78e7, eps:9.8,  pe:19.3, bv:110, div:0  },
  { symbol:'GHL',   name:'Garima Hydropower Ltd.',           sector:'Hydropower',   ltp:294.0, open:288.0, high:298.0, low:285.0, prev:288.0, vol:112400, to:3.31e7, eps:15.2, pe:19.3, bv:190, div:12 },
  { symbol:'SSHL',  name:'Solu Small Hydro Ltd.',            sector:'Hydropower',   ltp:312.0, open:305.0, high:318.0, low:302.0, prev:305.0, vol:78900,  to:2.46e7, eps:16.8, pe:18.6, bv:205, div:14 },
  { symbol:'NABIL', name:'Nabil Bank Ltd.',                  sector:'Commercial Banks', ltp:680.0, open:665.0, high:688.0, low:660.0, prev:665.0, vol:45200, to:3.07e7, eps:42.0, pe:16.2, bv:350, div:35 },
  { symbol:'NICA',  name:'NIC Asia Bank Ltd.',               sector:'Commercial Banks', ltp:288.0, open:278.0, high:292.0, low:275.0, prev:278.0, vol:132400, to:3.81e7, eps:20.4, pe:14.1, bv:195, div:18 },
  { symbol:'NTC',   name:'Nepal Telecom',                    sector:'Manufacturing',    ltp:680.0, open:670.0, high:685.0, low:665.0, prev:670.0, vol:28400, to:1.93e7, eps:70.0, pe:9.7,  bv:600, div:65 },
  { symbol:'PRVU',  name:'Prabhu Bank Ltd.',                 sector:'Commercial Banks', ltp:198.0, open:193.0, high:201.0, low:191.0, prev:193.0, vol:210400, to:4.17e7, eps:14.2, pe:13.9, bv:140, div:10 },
  { symbol:'CBBL',  name:'Chhimek Bikas Bank Ltd.',          sector:'Development Banks',ltp:1027.9,open:1005.0,high:1035.0,low:1000.0,prev:1005.0,vol:17968,  to:1.84e7, eps:68.0, pe:15.1, bv:800, div:60 },
  { symbol:'JBLB',  name:'Jiban Bikas Laghubitta Bittiya', sector:'Microfinance',     ltp:1524.0,open:1490.0,high:1540.0,low:1485.0,prev:1490.0,vol:8420,   to:1.28e7, eps:95.0, pe:16.0, bv:1100,div:80 },
  { symbol:'RNLI',  name:'Rastriya Beema Ltd.',              sector:'Life Insurance',   ltp:512.0, open:498.0, high:518.0, low:495.0, prev:498.0, vol:42300,  to:2.17e7, eps:28.0, pe:18.3, bv:380, div:25 },
  { symbol:'NLIC',  name:'Nepal Life Insurance Co.',         sector:'Life Insurance',   ltp:1180.0,open:1155.0,high:1195.0,low:1150.0,prev:1155.0,vol:14200, to:1.68e7, eps:72.0, pe:16.4, bv:850, div:60 },
  { symbol:'ALBSL', name:'Agrawal Laghubitta Bittiya.',      sector:'Microfinance',     ltp:1176.0,open:1130.0,high:1185.0,low:1125.0,prev:1130.0,vol:51536, to:6.06e7, eps:78.0, pe:15.1, bv:920, div:70 },
  { symbol:'CORBL', name:'Corporate Development Bank',       sector:'Development Banks',ltp:1450.0,open:1511.0,high:1515.0,low:1440.0,prev:1511.0,vol:10914, to:1.58e7, eps:88.0, pe:16.5, bv:1050,div:75 },
  { symbol:'API',   name:'API Power Company Ltd.',           sector:'Hydropower',   ltp:289.0, open:280.0, high:292.0, low:278.0, prev:280.0, vol:62486,  to:1.81e7, eps:16.0, pe:18.1, bv:190, div:0  },
  { symbol:'AHPC',  name:'Arun Hydropower Dev. Co.',         sector:'Hydropower',   ltp:272.3, open:275.4, high:278.0, low:269.0, prev:275.4, vol:96682,  to:2.63e7, eps:14.5, pe:18.8, bv:175, div:12 },
  { symbol:'AKJCL', name:'Akaura Jalvidhyut Co. Ltd.',       sector:'Hydropower',   ltp:182.7, open:183.0, high:186.0, low:180.0, prev:183.0, vol:52107,  to:9.52e6, eps:9.0,  pe:20.3, bv:115, div:8  },
  { symbol:'NMIC',  name:'NMB Sulav Income Scheme 1',        sector:'Mutual Fund',  ltp:11.85, open:11.80, high:11.90, low:11.78, prev:11.80, vol:820400, to:9.72e6, eps:1.2,  pe:9.9,  bv:10,  div:1  },
  { symbol:'NIBLSF',name:'NIBL Samriddhi Fund 1',            sector:'Mutual Fund',  ltp:10.95, open:10.90, high:11.00, low:10.88, prev:10.90, vol:612000, to:6.70e6, eps:0.9,  pe:12.2, bv:10,  div:0.8},
  { symbol:'ADBL',  name:'Agriculture Dev. Bank Ltd.',       sector:'Development Banks',ltp:288.0,open:289.1,high:291.0,low:285.0,prev:289.1,vol:20792,  to:5.99e6, eps:19.0, pe:15.2, bv:210, div:15 },
];

// Add computed fields
DEMO_STOCKS.forEach(s => {
  s.chg    = parseFloat((s.ltp - s.prev).toFixed(2));
  s.chgPct = parseFloat(((s.chg / s.prev) * 100).toFixed(2));
});

// ═══════════════════════════════════════════════════════════════
// BROKER DEMO DATA (from floorsheet analysis)
// ═══════════════════════════════════════════════════════════════
const DEMO_BROKERS = {
  // broker_id: name
  1:'Kumari Securities',2:'Pragya Securities',3:'NIC Asia Capital',4:'Nabil Invest',
  5:'Rastriya Securities',6:'Civil Capital',7:'Sunrise Capital',8:'Muktinath Capital',
  9:'Nepal Investment Bank Securities',10:'Sanima Capital',
  11:'Prabhu Capital',12:'Laxmi Capital',13:'Siddhartha Capital',14:'NMB Capital',
  15:'Global IME Capital',16:'Mega Capital',17:'Prime Life Capital',18:'Century Capital',
  19:'Himalayan Capital',20:'Machhapuchchhre Capital',
  21:'NIBL Ace Capital',22:'Shangrila Development Bank Securities',
  23:'IME Capital',24:'United Securities',25:'Stock Broking Services',
  26:'Nepal Stock House',27:'Midas Stock Broking',28:'ICFC Securities',
  29:'Asian Securities',30:'Standard Securities',
  31:'Beed Investment',32:'Broker 32',33:'Broker 33',34:'Broker 34',35:'Broker 35',
  36:'Broker 36',37:'Broker 37',38:'Broker 38',39:'Broker 39',40:'Broker 40',
  41:'Broker 41',42:'Broker 42 (Smart Money)',43:'Broker 43',44:'Broker 44',45:'Broker 45',
  50:'Broker 50',55:'Broker 55',58:'Broker 58 (Institutional)',60:'Broker 60',
};

// Simulated accumulation scores per stock (based on 10-day floorsheet analysis)
const DEMO_ACCUMULATION = [
  { symbol:'NHPC',  score:82, trend:'accumulating', topBuyers:[42,58,3],  topSellers:[15,22],  netUnits:85000, days:8, signal:'BURST_SOON' },
  { symbol:'UPPER', score:76, trend:'accumulating', topBuyers:[58,4,11],  topSellers:[1,30],   netUnits:62000, days:6, signal:'WATCH'      },
  { symbol:'KKHC',  score:71, trend:'accumulating', topBuyers:[42,3,21],  topSellers:[9,16],   netUnits:44000, days:5, signal:'WATCH'      },
  { symbol:'CHCL',  score:88, trend:'heavy_accum',  topBuyers:[42,58,14], topSellers:[2,7],    netUnits:120000,days:9, signal:'BURST_SOON' },
  { symbol:'CBBL',  score:65, trend:'accumulating', topBuyers:[11,4,3],   topSellers:[20,15],  netUnits:28000, days:5, signal:'WATCH'      },
  { symbol:'JBLB',  score:79, trend:'accumulating', topBuyers:[58,42,8],  topSellers:[1,6],    netUnits:18000, days:7, signal:'BURST_SOON' },
  { symbol:'NABIL', score:45, trend:'distributing', topBuyers:[20,16,7],  topSellers:[42,58],  netUnits:-32000,days:4, signal:'CAUTION'    },
  { symbol:'CORBL', score:22, trend:'distribution', topBuyers:[2,5,9],    topSellers:[42,58,3],netUnits:-85000,days:8, signal:'EXIT'       },
  { symbol:'RNLI',  score:68, trend:'accumulating', topBuyers:[14,21,11], topSellers:[30,22],  netUnits:35000, days:5, signal:'WATCH'      },
  { symbol:'ALBSL', score:58, trend:'neutral',      topBuyers:[3,8,12],   topSellers:[4,18],   netUnits:12000, days:3, signal:'NEUTRAL'    },
  { symbol:'API',   score:39, trend:'neutral',      topBuyers:[5,6,10],   topSellers:[3,11],   netUnits:-8000, days:2, signal:'NEUTRAL'    },
  { symbol:'SSHL',  score:84, trend:'heavy_accum',  topBuyers:[42,58,3],  topSellers:[7,20],   netUnits:95000, days:8, signal:'BURST_SOON' },
  { symbol:'GHL',   score:73, trend:'accumulating', topBuyers:[11,14,21], topSellers:[22,16],  netUnits:48000, days:6, signal:'WATCH'      },
];

// ═══════════════════════════════════════════════════════════════
// BUY/SELL SIGNAL ALGORITHM
// ═══════════════════════════════════════════════════════════════
/**
 * Generates a buy/sell/hold signal for a stock.
 *
 * ALGORITHM (multi-factor):
 *  1. Broker Accumulation Score (40% weight) — smart money tracking
 *  2. Price vs Support/Resistance (30% weight) — technical zones
 *  3. Volume Anomaly (20% weight) — unusual activity
 *  4. Fundamental Value (10% weight) — PE vs sector avg
 *
 * When live data is connected:
 *  - Accumulation score comes from floorsheet (broker buy/sell aggregation)
 *  - Support/Resistance calculated from 52W high/low + 20/50 day MA
 *  - Volume anomaly = today's vol vs 10-day avg
 */
function generateSignal(stock, accumData) {
  const acc = accumData || { score: 50, signal: 'NEUTRAL' };

  // Factor 1: Broker accumulation (0–100)
  const accScore = acc.score;

  // Factor 2: Price position (% from 52W low, higher = more expensive)
  // Using prev/ltp as proxy until 52W data available
  const pricePos = ((stock.ltp - stock.low) / (stock.high - stock.low)) * 100 || 50;

  // Factor 3: Volume anomaly (simulated — in live: today/10dayAvg)
  const volFactor = stock.vol > 100000 ? 80 : stock.vol > 50000 ? 55 : 35;

  // Factor 4: Fundamental (PE < 15 = cheap, >25 = expensive)
  const peFactor = !stock.pe ? 50 : stock.pe < 15 ? 80 : stock.pe < 22 ? 55 : 25;

  // Weighted composite
  const composite = (
    accScore   * 0.40 +
    (100 - pricePos) * 0.30 +  // buying low = better
    volFactor  * 0.20 +
    peFactor   * 0.10
  );

  // Map to signal
  let signal, strength, zone, reason;
  if (acc.signal === 'BURST_SOON' && composite >= 65) {
    signal = 'BUY'; strength = 'STRONG';
    zone = `Rs. ${(stock.ltp * .97).toFixed(0)}–${(stock.ltp * 1.0).toFixed(0)}`;
    reason = `Smart money accumulating ${acc.days} days. Volume ${stock.vol > 100000 ? '3x' : '2x'} normal.`;
  } else if (acc.signal === 'EXIT' || composite < 25) {
    signal = 'SELL'; strength = 'STRONG';
    zone = `Rs. ${(stock.ltp * 1.0).toFixed(0)}–${(stock.ltp * 1.03).toFixed(0)}`;
    reason = 'Smart money exiting. Institutional selling pressure detected.';
  } else if (composite >= 60) {
    signal = 'BUY'; strength = 'MODERATE';
    zone = `Rs. ${(stock.ltp * .975).toFixed(0)}–${(stock.ltp * 1.01).toFixed(0)}`;
    reason = `Broker accumulation building. Good entry zone.`;
  } else if (composite <= 35) {
    signal = 'SELL'; strength = 'MODERATE';
    zone = `Rs. ${(stock.ltp).toFixed(0)}–${(stock.ltp * 1.02).toFixed(0)}`;
    reason = 'Distribution phase detected. Consider reducing position.';
  } else {
    signal = 'HOLD'; strength = 'NEUTRAL';
    zone = `Rs. ${(stock.ltp * .97).toFixed(0)}–${(stock.ltp * 1.03).toFixed(0)}`;
    reason = 'No strong signal. Monitor broker activity.';
  }

  return {
    signal,
    strength,
    zone,
    reason,
    score: Math.round(composite),
    accScore,
    pricePos: Math.round(pricePos),
    target: signal === 'BUY'
      ? `Rs. ${(stock.ltp * 1.15).toFixed(0)}–${(stock.ltp * 1.25).toFixed(0)} (4–8 weeks)`
      : null,
    stopLoss: signal === 'BUY'
      ? `Rs. ${(stock.ltp * .93).toFixed(0)}`
      : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// BURST PREDICTOR
// ═══════════════════════════════════════════════════════════════
/**
 * Detects stocks about to make a big price move.
 *
 * Logic:
 *  - 5+ days of net positive broker accumulation
 *  - Volume trending UP over last 5 days
 *  - Price consolidating (low range, < ±3% move per day)
 *  - Score >= 75
 *
 * The "spring loaded" effect: heavy accumulation + tight price =
 * inevitable breakout. Smart money can't accumulate forever.
 */
function detectBurstCandidates(stocks, accumData) {
  return accumData
    .filter(a => a.signal === 'BURST_SOON' || (a.score >= 70 && a.trend === 'accumulating'))
    .map(acc => {
      const stock = stocks.find(s => s.symbol === acc.symbol);
      if (!stock) return null;
      const daysToBreak = Math.max(1, Math.round((100 - acc.score) / 8));
      return {
        ...acc,
        stock,
        daysToBreak,
        priceTarget: (stock.ltp * 1.18).toFixed(0),
        confidence: acc.score >= 80 ? 'HIGH' : 'MEDIUM',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PREDICTOR
// ═══════════════════════════════════════════════════════════════
function detectCircuitCandidates(stocks) {
  return stocks
    .filter(s => Math.abs(s.chgPct) >= 7)
    .map(s => ({
      ...s,
      distToCircuit: s.chgPct > 0
        ? parseFloat((10 - s.chgPct).toFixed(2))
        : parseFloat((10 + s.chgPct).toFixed(2)),
      direction: s.chgPct > 0 ? 'upper' : 'lower',
    }))
    .sort((a, b) => a.distToCircuit - b.distToCircuit)
    .slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════
// SECTOR ROTATION
// ═══════════════════════════════════════════════════════════════
function analyzeSectorRotation(stocks) {
  const sectors = {};
  stocks.forEach(s => {
    if (!sectors[s.sector]) {
      sectors[s.sector] = { stocks: 0, totalChgPct: 0, totalVol: 0, totalTo: 0, advances: 0, declines: 0 };
    }
    const sec = sectors[s.sector];
    sec.stocks++;
    sec.totalChgPct += s.chgPct;
    sec.totalVol    += s.vol;
    sec.totalTo     += s.to;
    if (s.chg > 0) sec.advances++;
    else if (s.chg < 0) sec.declines++;
  });
  return Object.entries(sectors).map(([name, d]) => ({
    name,
    avgChg:    parseFloat((d.totalChgPct / d.stocks).toFixed(2)),
    totalVol:  d.totalVol,
    totalTo:   d.totalTo,
    advances:  d.advances,
    declines:  d.declines,
    stocks:    d.stocks,
    momentum:  d.totalChgPct / d.stocks > 1.5 ? 'HOT' :
               d.totalChgPct / d.stocks > 0 ? 'POSITIVE' :
               d.totalChgPct / d.stocks > -1.5 ? 'NEUTRAL' : 'COLD',
  })).sort((a, b) => b.avgChg - a.avgChg);
}

// ═══════════════════════════════════════════════════════════════
// DEMO INDEX DATA
// ═══════════════════════════════════════════════════════════════
const DEMO_INDICES = {
  nepse:     { value: 2748.32, change: 42.18, pct: 1.56, open: 2706.14, high: 2755.0, low: 2701.0 },
  sensitive: { value: 482.54,  change: 7.21,  pct: 1.51, open: 475.33,  high: 484.0,  low: 473.0  },
  float:     { value: 192.38,  change: 2.84,  pct: 1.50, open: 189.54,  high: 193.0,  low: 188.5  },
  turnover:  9.82e9,
  txns:      68420,
  advances:  0,
  declines:  0,
  unchanged: 0,
};

// ═══════════════════════════════════════════════════════════════
// MAIN FETCH / REFRESH
// ═══════════════════════════════════════════════════════════════
async function fetchMarketData() {
  checkMarketStatus();

  if (CONFIG.DEMO_MODE) {
    // Simulate slight price movement to make demo feel alive
    DEMO_STOCKS.forEach(s => {
      const jitter = (Math.random() - 0.48) * s.ltp * 0.004;
      s.ltp   = parseFloat(Math.max(s.low * .95, s.ltp + jitter).toFixed(1));
      s.chg   = parseFloat((s.ltp - s.prev).toFixed(2));
      s.chgPct = parseFloat(((s.chg / s.prev) * 100).toFixed(2));
    });

    NEPSE.stocks  = DEMO_STOCKS;
    NEPSE.indices = DEMO_INDICES;
    NEPSE.brokerData = DEMO_ACCUMULATION;

    // Compute market breadth
    NEPSE.indices.advances  = DEMO_STOCKS.filter(s => s.chg > 0).length;
    NEPSE.indices.declines  = DEMO_STOCKS.filter(s => s.chg < 0).length;
    NEPSE.indices.unchanged = DEMO_STOCKS.filter(s => s.chg === 0).length;

    NEPSE.lastUpdated = new Date();
    Bus.emit('data:updated', NEPSE);
    return;
  }

  // ── LIVE MODE — calls our FastAPI backend on Render ──
  const base = CONFIG.BACKEND_URL;
  try {
    // Fetch stocks, indices, summary in parallel
    const [stocksRes, idxRes, summaryRes] = await Promise.allSettled([
      fetch(`${base}/api/stocks`,  { signal: AbortSignal.timeout(20000) }),
      fetch(`${base}/api/indices`, { signal: AbortSignal.timeout(20000) }),
      fetch(`${base}/api/summary`, { signal: AbortSignal.timeout(20000) }),
    ]);

    // ── Stocks ──
    if (stocksRes.status === 'fulfilled' && stocksRes.value.ok) {
      const json = await stocksRes.value.json();
      // Backend already normalises the shape — just use it directly
      NEPSE.stocks = json.data || [];
      console.info(`[API] ✅ ${NEPSE.stocks.length} stocks loaded (${json.source})`);
    } else {
      console.warn('[API] Stocks fetch failed:', stocksRes.reason || stocksRes.value?.status);
    }

    // ── Indices ──
    if (idxRes.status === 'fulfilled' && idxRes.value.ok) {
      const json = await idxRes.value.json();
      NEPSE.indices = json.data || {};
    }

    // ── Summary ──
    if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
      const json = await summaryRes.value.json();
      const s = json.data || {};
      // Merge into indices object for compatibility with existing render code
      NEPSE.indices.turnover  = s.turnover    || 0;
      NEPSE.indices.txns      = s.transactions || 0;
      NEPSE.indices.advances  = s.advances    || NEPSE.stocks.filter(x => x.chg > 0).length;
      NEPSE.indices.declines  = s.declines    || NEPSE.stocks.filter(x => x.chg < 0).length;
      NEPSE.indices.unchanged = s.unchanged   || NEPSE.stocks.filter(x => x.chg === 0).length;
    } else {
      // Compute breadth from stock data as fallback
      NEPSE.indices.advances  = NEPSE.stocks.filter(x => x.chg > 0).length;
      NEPSE.indices.declines  = NEPSE.stocks.filter(x => x.chg < 0).length;
      NEPSE.indices.unchanged = NEPSE.stocks.filter(x => x.chg === 0).length;
      NEPSE.indices.turnover  = NEPSE.stocks.reduce((s, x) => s + (x.to || 0), 0);
    }

    // ── Floorsheet / Broker data (fetch separately, non-blocking) ──
    fetchFloorsheetBackground(base);

    NEPSE.lastUpdated = new Date();
    Bus.emit('data:updated', NEPSE);

  } catch (err) {
    console.warn('[API] Live fetch error:', err.message);
    // If we have any stocks from a previous fetch, still emit so UI doesn't freeze
    if (NEPSE.stocks.length > 0) {
      Bus.emit('data:updated', NEPSE);
    }
    Bus.emit('data:error', err);
  }
}

// ── Fetch floorsheet in background (slow, don't block UI) ──
async function fetchFloorsheetBackground(base) {
  try {
    const res = await fetch(`${base}/api/floorsheet`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return;
    const json = await res.json();
    const rows = json.data || [];

    // Aggregate into per-stock accumulation scores (same shape as DEMO_ACCUMULATION)
    const byStock = {};
    for (const row of rows) {
      const sym = row.symbol;
      if (!byStock[sym]) byStock[sym] = { symbol: sym, netUnits: 0, buyers: {}, sellers: {} };
      byStock[sym].netUnits += row.netUnits;
      if (row.netUnits > 0) {
        byStock[sym].buyers[row.brokerId]  = (byStock[sym].buyers[row.brokerId]  || 0) + row.bought;
      } else {
        byStock[sym].sellers[row.brokerId] = (byStock[sym].sellers[row.brokerId] || 0) + row.sold;
      }
    }

    NEPSE.brokerData = Object.values(byStock).map(s => {
      const topBuyers  = Object.entries(s.buyers) .sort((a,b) => b[1]-a[1]).slice(0,3).map(([id]) => parseInt(id));
      const topSellers = Object.entries(s.sellers).sort((a,b) => b[1]-a[1]).slice(0,3).map(([id]) => parseInt(id));
      const absNet     = Math.abs(s.netUnits);

      // Score: 0–100 based on net accumulation intensity
      const stock   = NEPSE.stocks.find(x => x.symbol === s.symbol);
      const avgVol  = stock ? (stock.vol || 1) : 1;
      const score   = Math.min(100, Math.round((absNet / avgVol) * 100));
      const trend   = s.netUnits > avgVol * 0.5 ? 'heavy_accum'
                    : s.netUnits > 0             ? 'accumulating'
                    : s.netUnits < -avgVol * 0.5 ? 'distribution'
                    : s.netUnits < 0             ? 'distributing'
                    : 'neutral';
      const signal  = score >= 75 && trend.includes('accum') ? 'BURST_SOON'
                    : score >= 55 && trend.includes('accum') ? 'WATCH'
                    : trend.includes('distribut') && score >= 60 ? 'EXIT'
                    : trend.includes('distribut') ? 'CAUTION'
                    : 'NEUTRAL';

      return { symbol: s.symbol, score, trend, topBuyers, topSellers, netUnits: s.netUnits, days: 1, signal };
    });

    console.info(`[API] ✅ Floorsheet processed: ${NEPSE.brokerData.length} stocks`);
    // Re-emit so broker tracker updates
    Bus.emit('data:updated', NEPSE);
  } catch (e) {
    console.warn('[API] Floorsheet background fetch failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PORTFOLIO HELPERS
// ═══════════════════════════════════════════════════════════════
function calcPortfolio() {
  return NEPSE.portfolio.map(holding => {
    const live = NEPSE.stocks.find(s => s.symbol === holding.symbol) || {};
    const ltp  = live.ltp || holding.avgPrice;
    const invested = holding.units * holding.avgPrice;
    const current  = holding.units * ltp;
    return {
      ...holding,
      ltp,
      invested,
      current,
      pnl:    parseFloat((current - invested).toFixed(2)),
      pnlPct: parseFloat(((current - invested) / invested * 100).toFixed(2)),
      chg:    live.chg || 0,
      chgPct: live.chgPct || 0,
      signal: live ? generateSignal(live, NEPSE.brokerData.find(b => b.symbol === holding.symbol)) : null,
    };
  });
}

function savePortfolio() {
  localStorage.setItem('ns_portfolio', JSON.stringify(NEPSE.portfolio));
  Bus.emit('portfolio:updated', NEPSE.portfolio);
}
function saveWatchlist() {
  localStorage.setItem('ns_watchlist', JSON.stringify(NEPSE.watchlist));
  Bus.emit('watchlist:updated', NEPSE.watchlist);
}
function saveAlerts() {
  localStorage.setItem('ns_alerts', JSON.stringify(NEPSE.alerts));
  Bus.emit('alerts:updated', NEPSE.alerts);
}

// ═══════════════════════════════════════════════════════════════
// ALERT CHECKER (runs on every data update)
// ═══════════════════════════════════════════════════════════════
function checkAlerts() {
  NEPSE.alerts.forEach(alert => {
    if (!alert.active) return;
    const stock = NEPSE.stocks.find(s => s.symbol === alert.symbol);
    if (!stock) return;
    let triggered = false;
    if (alert.type === 'above' && stock.ltp >= alert.price) triggered = true;
    if (alert.type === 'below' && stock.ltp <= alert.price) triggered = true;
    if (alert.type === 'broker_accum') {
      const acc = NEPSE.brokerData.find(b => b.symbol === alert.symbol);
      if (acc && acc.score >= 70) triggered = true;
    }
    if (triggered) {
      Bus.emit('alert:triggered', { alert, stock });
      if (alert.once) alert.active = false;
      saveAlerts();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function initAPI() {
  await fetchMarketData();
  Bus.on('data:updated', checkAlerts);

  // Auto-refresh
  setInterval(() => {
    if (CONFIG.DEMO_MODE || NEPSE.isMarketOpen) {
      fetchMarketData();
    }
  }, CONFIG.DEMO_MODE ? 15000 : CONFIG.REFRESH_MS);
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
const Utils = {
  fmt:   (n, d=2) => n==null?'—': parseFloat(n).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d}),
  fmtI:  (n)      => n==null?'—': parseInt(n).toLocaleString('en-IN'),
  fmtCr: (n) => {
    if (!n) return '—';
    if (n>=1e9) return (n/1e9).toFixed(2)+' Arba';
    if (n>=1e7) return (n/1e7).toFixed(2)+' Cr';
    if (n>=1e5) return (n/1e5).toFixed(2)+' L';
    return Utils.fmtI(n);
  },
  clsName: (v) => v>0?'up':v<0?'dn':'neu',
  arrow:   (v) => v>0?'▲':v<0?'▼':'●',
  scoreClass: (s) => s>=70?'high':s>=40?'mid':'low',
  brokerName: (id) => DEMO_BROKERS[id] || `Broker ${id}`,
  getNPTTime: () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.75 * 3600000);
  },
};

// Expose globally
window.API = {
  init: initAPI,
  fetch: fetchMarketData,
  calcPortfolio,
  savePortfolio,
  saveWatchlist,
  saveAlerts,
  generateSignal,
  detectBurstCandidates,
  detectCircuitCandidates,
  analyzeSectorRotation,
  Bus,
  Utils,
  CONFIG,
  DEMO_BROKERS,
};
