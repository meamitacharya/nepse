/**
 * NEPSE SMART — Data Layer (api.js) v3.0 (PREMIUM)
 * Fixed: syntax errors, ultra-fast pre-calculated signal engine
 */
'use strict';

// ── CONFIG ──────────────────────────────────────────────────────
const CONFIG = {
  // Local Backend (Development)
  LOCAL_BACKEND: 'http://localhost:8000/api',
  
  // Production Backend (Hugging Face Spaces)
  PROD_BACKEND:  'https://meamitacharya-nepse-smart-backend.hf.space/api',
  
  get BACKEND_URL() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? this.LOCAL_BACKEND : this.PROD_BACKEND;
  },

  LIVE_DATA_URL: 'https://meamitacharya-nepse-api-amit.hf.space',
  REFRESH_MS:  5 * 60 * 1000,
  MARKET_OPEN:  { h: 11, m: 0 },
  MARKET_CLOSE: { h: 15, m: 0 },
  DEMO_MODE: false,
};

// ── STATE ───────────────────────────────────────────────────────
window.NEPSE = {
  stocks:      [],
  indices:     {},
  brokerData:  [],
  portfolio:   JSON.parse(localStorage.getItem('ns_portfolio') || '[]'),
  watchlist:   JSON.parse(localStorage.getItem('ns_watchlist') || '[]'),
  alerts:      JSON.parse(localStorage.getItem('ns_alerts')    || '[]'),
  lastUpdated: null,
  isMarketOpen: false,
  listeners:   {},
};

// ── EVENT BUS ───────────────────────────────────────────────────
const Bus = {
  on(event, fn) {
    if (!NEPSE.listeners[event]) NEPSE.listeners[event] = [];
    NEPSE.listeners[event].push(fn);
  },
  emit(event, data) {
    (NEPSE.listeners[event] || []).forEach(fn => fn(data));
  },
};

// ── MARKET STATUS ───────────────────────────────────────────────
function checkMarketStatus() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const npt = new Date(utc + 5.75 * 3600000);
  const mins  = npt.getHours() * 60 + npt.getMinutes();
  const open  = CONFIG.MARKET_OPEN.h  * 60 + CONFIG.MARKET_OPEN.m;
  const close = CONFIG.MARKET_CLOSE.h * 60 + CONFIG.MARKET_CLOSE.m;
  const day   = npt.getDay(); 
  NEPSE.isMarketOpen = day >= 0 && day <= 4 && mins >= open && mins < close;
  return NEPSE.isMarketOpen;
}

// ── SECTOR MAPPING ──────────────────────────────────────────────
const SECTOR_MAP = {
  'Commercial Banks':          'Commercial Banks',
  'Development Banks':         'Development Banks',
  'Finance':                   'Finance',
  'Microfinance Institutions': 'Microfinance',
  'Microfinance':              'Microfinance',
  'Life Insurance':            'Life Insurance',
  'Non-Life Insurance':        'Non-Life Insurance',
  'Hydro Power':               'Hydropower',
  'Hydropower':                'Hydropower',
  'Manufacturing And Processing': 'Manufacturing',
  'Manufacturing':             'Manufacturing',
  'Hotels And Tourism':        'Hotels & Tourism',
  'Trading':                   'Trading',
  'Investment':                'Mutual Fund',
  'Mutual Fund':               'Mutual Fund',
  'Others':                    'Others',
  'Other':                     'Others',
  '1':  'Commercial Banks', '2':  'Development Banks', '3':  'Finance',
  '4':  'Microfinance', '5':  'Life Insurance', '6':  'Non-Life Insurance',
  '7':  'Hydropower', '8':  'Manufacturing', '9':  'Hotels & Tourism',
  '10': 'Trading', '11': 'Investment', '12': 'Others', '13': 'Mutual Fund', '14': 'Others',
};

function mapSector(raw) {
  if (!raw && raw !== 0) return 'Others';
  const key = String(raw).trim();
  return SECTOR_MAP[key] || key || 'Others';
}

// ── DEMO DATA ──────────────────────────────────────────────────
const DEMO_STOCKS = [
  { symbol:'NHPC', name:'Nepal Hydro Power Co.', sector:'Hydropower', ltp:302.4, open:295.0, high:308.0, low:292.0, prev:295.0, vol:245830, to:7.42e7, eps:12.4, pe:24.4, bv:180, div:10 },
  { symbol:'UPPER',name:'Upper Tamakoshi Hydro.', sector:'Hydropower', ltp:268.5, open:260.0, high:272.0, low:258.0, prev:260.0, vol:189240, to:5.08e7, eps:14.1, pe:19.0, bv:155, div:15 },
  { symbol:'CHCL', name:'Chilime Hydro Power Co.', sector:'Hydropower', ltp:498.0, open:480.0, high:502.0, low:477.0, prev:480.0, vol:66630, to:3.32e7, eps:25.6, pe:19.5, bv:300, div:20 },
  { symbol:'NABIL',name:'Nabil Bank Ltd.', sector:'Commercial Banks', ltp:680.0, open:665.0, high:688.0, low:660.0, prev:665.0, vol:45200, to:3.07e7, eps:42.0, pe:16.2, bv:350, div:35 },
  { symbol:'JBLB', name:'Jiban Bikas Laghubitta', sector:'Microfinance', ltp:1524.0, open:1490.0, high:1540.0, low:1485.0, prev:1490.0, vol:8420, to:1.28e7, eps:95.0, pe:16.0, bv:1100, div:80 },
  { symbol:'CBBL', name:'Chhimek Bikas Bank Ltd.', sector:'Development Banks', ltp:1027.9, open:1005.0, high:1035.0, low:1000.0, prev:1005.0, vol:17968, to:1.84e7, eps:68.0, pe:15.1, bv:800, div:60 },
  { symbol:'NTC',  name:'Nepal Telecom', sector:'Others', ltp:680.0, open:670.0, high:685.0, low:665.0, prev:670.0, vol:28400, to:1.93e7, eps:70.0, pe:9.7, bv:600, div:65 },
  { symbol:'RNLI', name:'Rastriya Beema Ltd.', sector:'Life Insurance', ltp:512.0, open:498.0, high:518.0, low:495.0, prev:498.0, vol:42300, to:2.17e7, eps:28.0, pe:18.3, bv:380, div:25 },
];
DEMO_STOCKS.forEach(s => {
  s.chg    = parseFloat((s.ltp - s.prev).toFixed(2));
  s.chgPct = parseFloat(((s.chg / s.prev) * 100).toFixed(2));
});

const DEMO_BROKERS = {
  1:'Kumari Securities',2:'Pragya Securities',3:'NIC Asia Capital',4:'Nabil Invest',
  5:'Rastriya Securities',6:'Civil Capital',7:'Sunrise Capital',8:'Muktinath Capital',
  9:'Nepal Investment Bank Securities',10:'Sanima Capital',11:'Prabhu Capital',
  12:'Laxmi Capital',13:'Siddhartha Capital',14:'NMB Capital',15:'Global IME Capital',
  16:'Mega Capital',17:'Prime Life Capital',18:'Century Capital',19:'Himalayan Capital',
  20:'Machhapuchchhre Capital',21:'NIBL Ace Capital',42:'Broker 42 (Smart Money)',
  58:'Broker 58 (Institutional)',
};

const DEMO_INDICES = {
  nepse:     { value:2748.32, change:42.18, pct:1.56, open:2706.14, high:2755.0, low:2701.0 },
  sensitive: { value:482.54,  change:7.21,  pct:1.51, open:475.33,  high:484.0,  low:473.0  },
  float:     { value:192.38,  change:2.84,  pct:1.50, open:189.54,  high:193.0,  low:188.5  },
  turnover:9.82e9, txns:68420, advances:0, declines:0, unchanged:0,
};

// ── SIGNAL ALGORITHM ────────────────────────────────────────────
function generateSignal(stock, accumData) {
  if (stock.backendSignal) {
    return {
      signal: stock.backendSignal.signal,
      score:  stock.backendSignal.score,
      strength: stock.backendSignal.score >= 70 ? 'STRONG' : 'MODERATE',
      zone:   `Rs. ${(stock.ltp*0.98).toFixed(0)} - ${(stock.ltp*1.01).toFixed(0)}`,
      reason: stock.backendSignal.reason || "Analysis provided by NEPSE Smart Engine",
      target: `Rs. ${(stock.ltp*1.15).toFixed(0)}`,
      stopLoss: `Rs. ${(stock.ltp*0.93).toFixed(0)}`
    };
  }

  const acc = accumData || { score: 50, signal: 'NEUTRAL' };
  const accScore = Utils.safeScore(acc.score);
  const range = (stock.high || 0) - (stock.low || 0);
  const pricePos = range > 0 ? Math.min(100, Math.max(0, ((stock.ltp - stock.low) / range) * 100)) : 50;
  const volFactor = (stock.vol || 0) > 100000 ? 80 : (stock.vol || 0) > 50000 ? 55 : 35;
  const pe = stock.pe || 0;
  const peFactor = pe <= 0 ? 50 : pe < 15 ? 80 : pe < 22 ? 55 : 25;

  const composite = Math.round(accScore * 0.40 + (100 - pricePos) * 0.30 + volFactor * 0.20 + peFactor * 0.10);

  let signal, strength, reason;
  const ltp = stock.ltp || 0;

  if (acc.signal === 'BURST_SOON' && composite >= 65) { signal = 'BUY'; strength = 'STRONG'; reason = 'Heavy smart money accumulation.'; }
  else if (acc.signal === 'EXIT' || composite < 25) { signal = 'SELL'; strength = 'STRONG'; reason = 'Distribution detected.'; }
  else if (composite >= 60) { signal = 'BUY'; strength = 'MODERATE'; reason = 'Building momentum.'; }
  else if (composite <= 35) { signal = 'SELL'; strength = 'MODERATE'; reason = 'Weak trends.'; }
  else { signal = 'HOLD'; strength = 'NEUTRAL'; reason = 'No strong signal.'; }

  return {
    signal, strength, reason, score: composite,
    zone: `Rs. ${(ltp*0.98).toFixed(0)} - ${(ltp*1.02).toFixed(0)}`,
    target: signal === 'BUY' ? `Rs. ${(ltp*1.15).toFixed(0)}` : null,
    stopLoss: signal === 'BUY' ? `Rs. ${(ltp*0.93).toFixed(0)}` : null,
  };
}

// ── ANALYSIS UTILS ──────────────────────────────────────────────
function detectBurstCandidates(stocks, accumData) {
  return (accumData || [])
    .filter(a => a.signal === 'BURST_SOON' || a.score >= 70)
    .map(acc => {
      const stock = stocks.find(s => s.symbol === acc.symbol);
      if (!stock) return null;
      return { ...acc, stock, priceTarget: ((stock.ltp || 0) * 1.18).toFixed(0), confidence: acc.score >= 80 ? 'HIGH' : 'MEDIUM' };
    }).filter(Boolean).sort((a,b) => b.score - a.score);
}

function detectCircuitCandidates(stocks) {
  return stocks.filter(s => Math.abs(s.chgPct || 0) >= 7).slice(0, 10);
}

function analyzeSectorRotation(stocks) {
  const sectors = {};
  stocks.forEach(s => {
    const sec = s.sector || 'Others';
    if (!sectors[sec]) sectors[sec] = { stocks:0, totalChgPct:0, totalTo:0, advances:0, declines:0 };
    sectors[sec].stocks++;
    sectors[sec].totalChgPct += (s.chgPct || 0);
    sectors[sec].totalTo += (s.to || 0);
    if (s.chg > 0) sectors[sec].advances++; else if (s.chg < 0) sectors[sec].declines++;
  });
  return Object.entries(sectors).map(([name, d]) => ({
    name, avgChg: parseFloat((d.totalChgPct / d.stocks).toFixed(2)),
    totalTo: d.totalTo, advances: d.advances, declines: d.declines, stocks: d.stocks,
    momentum: (d.totalChgPct / d.stocks) > 1.5 ? 'HOT' : (d.totalChgPct / d.stocks) > 0 ? 'POSITIVE' : 'NEUTRAL',
  })).sort((a, b) => b.avgChg - a.avgChg);
}

// ── FETCH LOGIC ────────────────────────────────────────────────
async function fetchSmartSignals(localBase) {
  if (!localBase) return;
  try {
    console.info('[API] 📡 Requesting Smart Signals from Python Engine...');
    const sigRes = await fetch(`${localBase}/signals/latest`, { signal: AbortSignal.timeout(10000) });
    if (sigRes.ok) {
      const sigData = await sigRes.json();
      const results = sigData.data || [];
      if (results.length > 0) {
         results.forEach(sig => {
            const stock = NEPSE.stocks.find(s => s.symbol === sig.symbol);
            if (stock) stock.backendSignal = sig;
            let bData = NEPSE.brokerData.find(b => b.symbol === sig.symbol);
            if (!bData) {
              bData = { symbol: sig.symbol, score: sig.score, trend: 'neutral', topBuyers: [], topSellers: [], netUnits: 0, days: 1, signal: sig.signal };
              NEPSE.brokerData.push(bData);
            } else { bData.score = sig.score; bData.signal = sig.signal; }
         });
         console.info(`[API] 🧠 Smart Engine: Loaded ${results.length} signals.`);
         Bus.emit('data:updated', NEPSE);
      }
    }
  } catch(e) { console.warn('[API] ⚠️ Smart Engine connection failed.'); }
}

async function fetchMarketData() {
  checkMarketStatus();
  if (CONFIG.DEMO_MODE) { Bus.emit('data:updated', NEPSE); return; }

  const liveBase = CONFIG.LIVE_DATA_URL;
  const localBase = CONFIG.BACKEND_URL;

  try {
    const [tradeRes, idxRes, summaryRes] = await Promise.allSettled([
      fetch(`${liveBase}/TradeTurnoverTransactionSubindices`, { signal: AbortSignal.timeout(30000) }),
      fetch(`${liveBase}/NepseIndex`, { signal: AbortSignal.timeout(20000) }),
      fetch(`${liveBase}/Summary`, { signal: AbortSignal.timeout(20000) }),
    ]);

    if (tradeRes.status === 'fulfilled' && tradeRes.value.ok) {
      const json = await tradeRes.value.json();
      const scrips = json.scripsDetails || {};
      NEPSE.stocks = Object.entries(scrips).map(([symbol, s]) => ({
        symbol, name: s.name || symbol, sector: mapSector(s.sector), ltp: parseFloat(s.ltp)||0, prev: parseFloat(s.previousClose)||0,
        high: parseFloat(s.ltp)||0, low: parseFloat(s.ltp)||0, vol: parseInt(s.volume)||0, to: parseFloat(s.Turnover)||0,
        chg: parseFloat(s.pointChange)||0, chgPct: parseFloat(s.percentageChange)||0,
      })).filter(s => s.ltp > 0);
    }

    if (idxRes.status === 'fulfilled' && idxRes.value.ok) {
      const idx = await idxRes.value.json();
      const main = idx['NEPSE Index'] || {};
      NEPSE.indices.nepse = { value: parseFloat(main.currentValue)||0, change: parseFloat(main.change)||0, pct: parseFloat(main.perChange)||0 };
    }

    if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
      const summ = await summaryRes.value.json();
      NEPSE.indices.turnover = parseFloat(summ['Total Turnover Rs:']) || 0;
    }

    NEPSE.indices.advances = NEPSE.stocks.filter(x => x.chg > 0).length;
    NEPSE.indices.declines = NEPSE.stocks.filter(x => x.chg < 0).length;
    NEPSE.lastUpdated = new Date();
    
    fetchFloorsheetBackground(liveBase);
    fetchSmartSignals(localBase);

    saveCache();
    Bus.emit('data:updated', NEPSE);
  } catch (err) { console.warn('[API] fetch error:', err.message); }
}

async function fetchFloorsheetBackground(base) {
  try {
    const res = await fetch(`${base}/Floorsheet`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return;
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.floorSheetData || []);
    const byStock = {};
    for (const row of rows) {
      const sym = row.symbol || row.stockSymbol || row.stock; if (!sym) continue;
      if (!byStock[sym]) byStock[sym] = { symbol: sym, netUnits: 0, buyers: {}, sellers: {} };
      const qty = parseInt(row.contractQuantity || 0);
      const buyId = String(row.buyerMemberId || 0); const sellId = String(row.sellerMemberId || 0);
      if (buyId !== '0') { byStock[sym].buyers[buyId] = (byStock[sym].buyers[buyId] || 0) + qty; byStock[sym].netUnits += qty; }
      if (sellId !== '0') { byStock[sym].sellers[sellId] = (byStock[sym].sellers[sellId] || 0) + qty; byStock[sym].netUnits -= qty; }
    }
    NEPSE.brokerData = Object.values(byStock).map(s => {
      const stock = NEPSE.stocks.find(x => x.symbol === s.symbol);
      const avgVol = Math.max(1, stock?.vol || 1);
      const score = Math.min(100, Math.round((Math.abs(s.netUnits) / avgVol) * 100));
      return { symbol: s.symbol, score, netUnits: s.netUnits, signal: score >= 75 ? 'BURST_SOON' : 'NEUTRAL' };
    });
    Bus.emit('data:updated', NEPSE);
  } catch (e) { console.warn('[API] Floorsheet failed.'); }
}

// ── STORAGE & HELPERS ──────────────────────────────────────────
const CACHE_KEY = 'ns_market_cache';
function saveCache() { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), stocks: NEPSE.stocks, indices: NEPSE.indices })); }
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY); if (!raw) return false;
    const c = JSON.parse(raw); if (Date.now() - c.ts > 300000) return false;
    NEPSE.stocks = c.stocks; NEPSE.indices = c.indices; NEPSE.lastUpdated = new Date(c.ts);
    return true;
  } catch(e) { return false; }
}

function checkAlerts() {
  NEPSE.alerts.forEach(alert => {
    if (!alert.active) return;
    const stock = NEPSE.stocks.find(s => s.symbol === alert.symbol); if (!stock) return;
    let trig = (alert.type === 'above' && stock.ltp >= alert.price) || (alert.type === 'below' && stock.ltp <= alert.price);
    if (trig) { Bus.emit('alert:triggered', { alert, stock }); if (alert.once) alert.active = false; }
  });
}

// ── INIT ──────────────────────────────────────────────────────
async function initAPI() {
  const localBase = CONFIG.BACKEND_URL;
  fetchSmartSignals(localBase);
  if (loadCache()) { Bus.emit('data:updated', NEPSE); checkAlerts(); if (Date.now() - NEPSE.lastUpdated > 120000) fetchMarketData(); } 
  else { await fetchMarketData(); }
  Bus.on('data:updated', checkAlerts);
  setInterval(fetchMarketData, CONFIG.REFRESH_MS);
}

const Utils = {
  fmt:   (n, d=2) => (n == null || isNaN(n)) ? '—' : parseFloat(n).toLocaleString('en-IN', {minimumFractionDigits:d, maximumFractionDigits:d}),
  fmtI:  (n) => (n == null || isNaN(n)) ? '—' : parseInt(n).toLocaleString('en-IN'),
  fmtCr: (n) => n >= 1e9 ? (n/1e9).toFixed(2) + ' Arba' : n >= 1e7 ? (n/1e7).toFixed(2) + ' Cr' : Utils.fmtI(n),
  clsName: (v) => v > 0 ? 'up' : v < 0 ? 'dn' : 'neu',
  arrow:   (v) => v > 0 ? '▲' : v < 0 ? '▼' : '●',
  scoreClass: (s) => s >= 70 ? 'high' : s >= 40 ? 'mid' : 'low',
  brokerName: (id) => DEMO_BROKERS[id] || `Broker ${id}`,
  getNPTTime: () => {
    const now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.75 * 3600000);
  },
  safeScore: (s) => { const n = parseFloat(s); return isNaN(n) || !isFinite(n) ? 50 : Math.min(100, Math.max(0, Math.round(n))); },
};

window.API = {
  init: initAPI, fetch: fetchMarketData, generateSignal, detectBurstCandidates, detectCircuitCandidates, analyzeSectorRotation,
  Bus, Utils, CONFIG, DEMO_BROKERS, mapSector,
};
