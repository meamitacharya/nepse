/**
 * NEPSE SMART — Data Layer (api.js) v2.1
 * Fixed: sector mapping, NaN change%, Infinity score, pagination
 */
'use strict';

// ── CONFIG ──────────────────────────────────────────────────────
const CONFIG = {
  // Local Backend (Development)
  LOCAL_BACKEND: 'http://localhost:8000/api',
  
  // Production Backend (Hugging Face Spaces - ZERO COST, NO CARD REQUIRED)
  // TODO: Replace this with your actual Hugging Face Space URL after deployment
  PROD_BACKEND:  'https://meamitacharya-nepse-smart-backend.hf.space/api',
  
  // Automatically select backend based on current URL
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
  const day   = npt.getDay(); // 0=Sun … 4=Thu
  NEPSE.isMarketOpen = day >= 0 && day <= 4 && mins >= open && mins < close;
  return NEPSE.isMarketOpen;
}

// ── SECTOR MAPPING ──────────────────────────────────────────────
// NepseUnofficialApi returns numeric businessType codes.
// Map them to readable names so sector rotation works correctly.
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
  // Numeric codes from NEPSE API
  '1':  'Commercial Banks',
  '2':  'Development Banks',
  '3':  'Finance',
  '4':  'Microfinance',
  '5':  'Life Insurance',
  '6':  'Non-Life Insurance',
  '7':  'Hydropower',
  '8':  'Manufacturing',
  '9':  'Hotels & Tourism',
  '10': 'Trading',
  '11': 'Investment',
  '12': 'Others',
  '13': 'Mutual Fund',
  '14': 'Others',
};

function mapSector(raw) {
  if (!raw && raw !== 0) return 'Others';
  const key = String(raw).trim();
  return SECTOR_MAP[key] || key || 'Others';
}

// ── DEMO DATA (fallback when market closed) ─────────────────────
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

const DEMO_ACCUMULATION = [
  { symbol:'NHPC', score:82, trend:'accumulating', topBuyers:[42,58,3], topSellers:[15,22], netUnits:85000, days:8, signal:'BURST_SOON' },
  { symbol:'CHCL', score:88, trend:'heavy_accum',  topBuyers:[42,58,14],topSellers:[2,7],   netUnits:120000,days:9, signal:'BURST_SOON' },
  { symbol:'JBLB', score:79, trend:'accumulating', topBuyers:[58,42,8], topSellers:[1,6],   netUnits:18000, days:7, signal:'BURST_SOON' },
  { symbol:'CBBL', score:65, trend:'accumulating', topBuyers:[11,4,3],  topSellers:[20,15], netUnits:28000, days:5, signal:'WATCH'      },
  { symbol:'NABIL',score:45, trend:'distributing', topBuyers:[20,16,7], topSellers:[42,58], netUnits:-32000,days:4, signal:'CAUTION'    },
];

const DEMO_INDICES = {
  nepse:     { value:2748.32, change:42.18, pct:1.56, open:2706.14, high:2755.0, low:2701.0 },
  sensitive: { value:482.54,  change:7.21,  pct:1.51, open:475.33,  high:484.0,  low:473.0  },
  float:     { value:192.38,  change:2.84,  pct:1.50, open:189.54,  high:193.0,  low:188.5  },
  turnover:9.82e9, txns:68420, advances:0, declines:0, unchanged:0,
};

// ── SIGNAL ALGORITHM ────────────────────────────────────────────
function generateSignal(stock, accumData) {
  // If we have a signal from our Python backend, use it!
  if (stock.backendSignal) {
    return {
      signal: stock.backendSignal.signal,
      score:  stock.backendSignal.score,
      strength: stock.backendSignal.score >= 70 ? 'STRONG' : 'MODERATE',
      zone:   `Rs. ${(stock.ltp*0.98).toFixed(0)} - ${(stock.ltp*1.01).toFixed(0)}`,
      reason: "Analysis provided by NEPSE Smart Engine (Python Backend)",
      target: `Rs. ${(stock.ltp*1.15).toFixed(0)}`,
      stopLoss: `Rs. ${(stock.ltp*0.93).toFixed(0)}`
    };
  }

  const acc = accumData || { score: 50, signal: 'NEUTRAL' };
  const accScore = Math.min(100, Math.max(0, acc.score || 50));

  // Price position within day's range — safe division
  const range = (stock.high || 0) - (stock.low || 0);
  const pricePos = range > 0
    ? Math.min(100, Math.max(0, ((stock.ltp - stock.low) / range) * 100))
    : 50;

  // Volume factor
  const volFactor = (stock.vol || 0) > 100000 ? 80 : (stock.vol || 0) > 50000 ? 55 : 35;

  // PE factor — safe
  const pe = stock.pe || 0;
  const peFactor = pe <= 0 ? 50 : pe < 15 ? 80 : pe < 22 ? 55 : 25;

  const composite = Math.min(100, Math.max(0,
    accScore          * 0.40 +
    (100 - pricePos)  * 0.30 +
    volFactor         * 0.20 +
    peFactor          * 0.10
  ));

  let signal, strength, zone, reason;
  const ltp = stock.ltp || 0;

  if (acc.signal === 'BURST_SOON' && composite >= 65) {
    signal = 'BUY'; strength = 'STRONG';
    zone   = `Rs. ${(ltp*.97).toFixed(0)}–${ltp.toFixed(0)}`;
    reason = `Smart money accumulating ${acc.days||1} days. Volume spike detected.`;
  } else if (acc.signal === 'EXIT' || composite < 25) {
    signal = 'SELL'; strength = 'STRONG';
    zone   = `Rs. ${ltp.toFixed(0)}–${(ltp*1.03).toFixed(0)}`;
    reason = 'Smart money exiting. Institutional selling pressure detected.';
  } else if (composite >= 60) {
    signal = 'BUY'; strength = 'MODERATE';
    zone   = `Rs. ${(ltp*.975).toFixed(0)}–${(ltp*1.01).toFixed(0)}`;
    reason = 'Broker accumulation building. Good entry zone.';
  } else if (composite <= 35) {
    signal = 'SELL'; strength = 'MODERATE';
    zone   = `Rs. ${ltp.toFixed(0)}–${(ltp*1.02).toFixed(0)}`;
    reason = 'Distribution phase detected. Consider reducing position.';
  } else {
    signal = 'HOLD'; strength = 'NEUTRAL';
    zone   = `Rs. ${(ltp*.97).toFixed(0)}–${(ltp*1.03).toFixed(0)}`;
    reason = 'No strong signal. Monitor broker activity.';
  }

  return {
    signal, strength, zone, reason,
    score:    Math.round(composite),
    accScore: Math.round(accScore),
    pricePos: Math.round(pricePos),
    target:   signal === 'BUY' ? `Rs. ${(ltp*1.15).toFixed(0)}–${(ltp*1.25).toFixed(0)} (4–8 weeks)` : null,
    stopLoss: signal === 'BUY' ? `Rs. ${(ltp*.93).toFixed(0)}` : null,
  };
}

// ── BURST PREDICTOR ─────────────────────────────────────────────
function detectBurstCandidates(stocks, accumData) {
  return (accumData || [])
    .filter(a => a.signal === 'BURST_SOON' || (a.score >= 70 && a.trend === 'accumulating'))
    .map(acc => {
      const stock = stocks.find(s => s.symbol === acc.symbol);
      if (!stock) return null;
      return {
        ...acc, stock,
        daysToBreak: Math.max(1, Math.round((100 - acc.score) / 8)),
        priceTarget: ((stock.ltp || 0) * 1.18).toFixed(0),
        confidence: acc.score >= 80 ? 'HIGH' : 'MEDIUM',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ── CIRCUIT BREAKER ─────────────────────────────────────────────
function detectCircuitCandidates(stocks) {
  return stocks
    .filter(s => Math.abs(s.chgPct || 0) >= 7)
    .map(s => ({
      ...s,
      distToCircuit: s.chgPct > 0 ? parseFloat((10 - s.chgPct).toFixed(2)) : parseFloat((10 + s.chgPct).toFixed(2)),
      direction: s.chgPct > 0 ? 'upper' : 'lower',
    }))
    .sort((a, b) => a.distToCircuit - b.distToCircuit)
    .slice(0, 10);
}

// ── SECTOR ROTATION ─────────────────────────────────────────────
function analyzeSectorRotation(stocks) {
  const sectors = {};
  stocks.forEach(s => {
    const sec = s.sector || 'Others';
    if (!sectors[sec]) sectors[sec] = { stocks:0, totalChgPct:0, totalVol:0, totalTo:0, advances:0, declines:0 };
    sectors[sec].stocks++;
    sectors[sec].totalChgPct += (s.chgPct || 0);
    sectors[sec].totalVol    += (s.vol    || 0);
    sectors[sec].totalTo     += (s.to     || 0);
    if (s.chg > 0)       sectors[sec].advances++;
    else if (s.chg < 0)  sectors[sec].declines++;
  });
  return Object.entries(sectors).map(([name, d]) => {
    const avg = d.stocks > 0 ? d.totalChgPct / d.stocks : 0;
    return {
      name, avgChg: parseFloat(avg.toFixed(2)),
      totalVol: d.totalVol, totalTo: d.totalTo,
      advances: d.advances, declines: d.declines, stocks: d.stocks,
      momentum: avg > 1.5 ? 'HOT' : avg > 0 ? 'POSITIVE' : avg > -1.5 ? 'NEUTRAL' : 'COLD',
    };
  }).sort((a, b) => b.avgChg - a.avgChg);
}

// ── HF API RESPONSE PARSERS ─────────────────────────────────────
// Your HF API returns data directly (no .data wrapper).
// /TradeTurnoverTransactionSubindices → { scripsDetails: {SYM: {...}}, sectorsDetails: {...} }
// /NepseIndex → { "NEPSE Index": { index, currentValue, change, perChange, open, high, low }, ... }
// /Summary    → { "Total Turnover Amount": 9.8e9, "Total Traded Shares": 123456, ... }
// /NepseSubIndices → { "Banking SubIndex": { currentValue, change, perChange }, ... }

function parseHFStocks(scripsDetails) {
  // scripsDetails: { NABIL: { symbol, sector, Turnover, transaction, volume,
  //   previousClose, name, category, pointChange, percentageChange, ltp }, ... }
  return Object.entries(scripsDetails).map(([symbol, s]) => {
    const ltp  = parseFloat(s.ltp)           || 0;
    const prev = parseFloat(s.previousClose) || 0;
    const chg    = parseFloat(s.pointChange)      || 0;
    const chgPct = parseFloat(s.percentageChange) || 0;
    return {
      symbol,
      name:    s.name     || symbol,
      sector:  mapSector(s.sector),
      ltp,
      open:    prev,  // not provided — use previousClose as proxy
      high:    ltp,
      low:     ltp,
      prev,
      vol:     parseInt(s.volume)     || 0,
      to:      parseFloat(s.Turnover) || 0,  // capital T!
      chg,
      chgPct,
      eps:      0,
      pe:       0,
      bv:       0,
      category: s.category || '',
    };
  }).filter(s => s.ltp > 0);
}

function parseHFIndices(data) {
  // { "NEPSE Index": { currentValue, change, perChange, high, low, previousClose, ... }, ... }
  const main = data['NEPSE Index']         || {};
  const sens = data['Sensitive Index']     || {};
  const flt  = data['Float Index']         || {};
  const sensF= data['Sensitive Float Index'] || {};
  return {
    nepse: {
      value:  parseFloat(main.currentValue)  || 0,
      change: parseFloat(main.change)        || 0,
      pct:    parseFloat(main.perChange)     || 0,
      high:   parseFloat(main.high)          || 0,
      low:    parseFloat(main.low)           || 0,
      prev:   parseFloat(main.previousClose) || 0,
      week52High: parseFloat(main.fiftyTwoWeekHigh) || 0,
      week52Low:  parseFloat(main.fiftyTwoWeekLow)  || 0,
    },
    sensitive: {
      value:  parseFloat(sens.currentValue) || 0,
      change: parseFloat(sens.change)       || 0,
      pct:    parseFloat(sens.perChange)    || 0,
    },
    float: {
      value:  parseFloat(flt.currentValue)  || 0,
      change: parseFloat(flt.change)        || 0,
      pct:    parseFloat(flt.perChange)     || 0,
    },
    sensitiveFloat: {
      value:  parseFloat(sensF.currentValue) || 0,
      change: parseFloat(sensF.change)       || 0,
      pct:    parseFloat(sensF.perChange)    || 0,
    },
  };
}

function parseHFSummary(data) {
  // { "Total Turnover Rs:": 8665568641.79, "Total Traded Shares": 20163793,
  //   "Total Transactions": 101180, "Total Scrips Traded": 342,
  //   "Total Market Capitalization Rs:": ..., "Total Float Market Capitalization Rs:": ... }
  // NOTE: No advances/declines in summary — will compute from stocks instead
  return {
    turnover:     parseFloat(data['Total Turnover Rs:'])  || 0,
    transactions: parseInt(data['Total Transactions'])    || 0,
    scripsTraded: parseInt(data['Total Scrips Traded'])   || 0,
    marketCap:    parseFloat(data['Total Market Capitalization Rs:']) || 0,
    advances:     0,  // not in summary — computed from stocks
    declines:     0,
    unchanged:    0,
  };
}

// ── MAIN FETCH ───────────────────────────────────────────────────
async function fetchMarketData() {
  checkMarketStatus();

  if (CONFIG.DEMO_MODE) {
    DEMO_STOCKS.forEach(s => {
      const jitter = (Math.random() - 0.48) * s.ltp * 0.004;
      s.ltp    = parseFloat(Math.max(s.low * .95, s.ltp + jitter).toFixed(1));
      s.chg    = parseFloat((s.ltp - s.prev).toFixed(2));
      s.chgPct = parseFloat(((s.chg / s.prev) * 100).toFixed(2));
    });
    NEPSE.stocks     = DEMO_STOCKS;
    NEPSE.indices    = DEMO_INDICES;
    NEPSE.brokerData = DEMO_ACCUMULATION;
    NEPSE.indices.advances  = DEMO_STOCKS.filter(s => s.chg > 0).length;
    NEPSE.indices.declines  = DEMO_STOCKS.filter(s => s.chg < 0).length;
    NEPSE.indices.unchanged = DEMO_STOCKS.filter(s => s.chg === 0).length;
    NEPSE.lastUpdated = new Date();
    Bus.emit('data:updated', NEPSE);
    return;
  }

  // ── LIVE MODE via HuggingFace API ──
  const liveBase = CONFIG.LIVE_DATA_URL;
  const localBase = CONFIG.BACKEND_URL;

  try {
    const [tradeRes, idxRes, summaryRes] = await Promise.allSettled([
      fetch(`${liveBase}/TradeTurnoverTransactionSubindices`, { signal: AbortSignal.timeout(30000) }),
      fetch(`${liveBase}/NepseIndex`,                        { signal: AbortSignal.timeout(20000) }),
      fetch(`${liveBase}/Summary`,                           { signal: AbortSignal.timeout(20000) }),
    ]);

    // ── Stocks from TradeTurnoverTransactionSubindices ──
    if (tradeRes.status === 'fulfilled' && tradeRes.value.ok) {
      const json = await tradeRes.value.json();
      const scrips = json.scripsDetails || {};
      NEPSE.stocks = parseHFStocks(scrips);
      console.info(`[API] ✅ ${NEPSE.stocks.length} stocks loaded from HF API`);
    } else {
      console.warn('[API] TradeTurnover endpoint failed, trying LiveMarket fallback...');
      // Fallback to LiveMarket
      try {
        const lmRes = await fetch(`${liveBase}/LiveMarket`, { signal: AbortSignal.timeout(20000) });
        if (lmRes.ok) {
          const lmData = await lmRes.json();
          const arr = Array.isArray(lmData) ? lmData : Object.values(lmData);
          NEPSE.stocks = arr.map(s => {
            const ltp  = parseFloat(s.ltp || s.lastTradedPrice) || 0;
            const prev = parseFloat(s.previousClose || s.prev) || 0;
            return {
              symbol:  s.symbol || s.stockSymbol || '',
              name:    s.securityName || s.name || s.symbol || '',
              sector:  mapSector(s.sectorName || s.sector),
              ltp, prev,
              open:    parseFloat(s.openPrice)  || ltp,
              high:    parseFloat(s.highPrice)  || ltp,
              low:     parseFloat(s.lowPrice)   || ltp,
              vol:     parseInt(s.totalTradeQuantity || s.shareTraded) || 0,
              to:      parseFloat(s.totalTurnover || s.turnover) || 0,
              chg:     prev > 0 ? parseFloat((ltp - prev).toFixed(2)) : parseFloat(s.change || s.pointChange) || 0,
              chgPct:  prev > 0 ? parseFloat(((ltp - prev) / prev * 100).toFixed(2)) : parseFloat(s.percentageChange) || 0,
              eps: 0, pe: 0, bv: 0,
            };
          }).filter(s => s.symbol && s.ltp > 0);
          console.info(`[API] ✅ ${NEPSE.stocks.length} stocks from LiveMarket fallback`);
        }
      } catch(fe) { console.warn('[API] LiveMarket fallback also failed:', fe.message); }
    }

    // ── NEPSE Index ──
    if (idxRes.status === 'fulfilled' && idxRes.value.ok) {
      const json = await idxRes.value.json();
      const parsed = parseHFIndices(json);
      NEPSE.indices = { ...NEPSE.indices, ...parsed };
    }

    // ── Summary ──
    if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
      const json = await summaryRes.value.json();
      const s    = parseHFSummary(json);
      NEPSE.indices.turnover  = s.turnover;
      NEPSE.indices.txns      = s.transactions;
      NEPSE.indices.marketCap = s.marketCap;
    }
    // Always compute advances/declines from live stock data
    NEPSE.indices.advances  = NEPSE.stocks.filter(x => x.chg > 0).length;
    NEPSE.indices.declines  = NEPSE.stocks.filter(x => x.chg < 0).length;
    NEPSE.indices.unchanged = NEPSE.stocks.filter(x => x.chg === 0).length;
    if (!NEPSE.indices.turnover) {
      NEPSE.indices.turnover = NEPSE.stocks.reduce((acc, x) => acc + (x.to || 0), 0);
    }

    fetchFloorsheetBackground(liveBase);
    
    // ── FETCH CUSTOM SIGNALS FROM LOCAL BACKEND ──
    try {
      const sigRes = await fetch(`${localBase}/signals/latest`, { signal: AbortSignal.timeout(5000) });
        if (sigRes.ok) {
          const sigData = await sigRes.json();
          const results = sigData.data || [];
          
          if (results.length === 0) {
             console.warn('[API] ⚠️ Local backend connected but returned NO SIGNS. (Is the database empty?)');
          } else {
             // Merge signals into our stock objects directly
             results.forEach(sig => {
                const stock = NEPSE.stocks.find(s => s.symbol === sig.symbol);
                if (stock) {
                  stock.backendSignal = sig;
                }
                
                // Also merge into brokerData for compatibility with signals.html and broker.html
                let bData = NEPSE.brokerData.find(b => b.symbol === sig.symbol);
                if (!bData) {
                  bData = { symbol: sig.symbol, score: sig.score, trend: 'neutral', topBuyers: [], topSellers: [], netUnits: 0, days: 1, signal: sig.signal };
                  NEPSE.brokerData.push(bData);
                } else {
                  bData.score = sig.score;
                  bData.signal = sig.signal;
                }
             });
             console.info(`[API] ✅ Successfully loaded ${results.length} smart signals from local backend`);
          }
        } else {
           console.error(`[API] ❌ Local backend error: ${sigRes.status} ${sigRes.statusText}`);
        }
      } catch(e) { 
        console.warn('[API] ⚠️ Local backend fetch failed (Connection Error). Using client-side fallback.'); 
      }

    NEPSE.lastUpdated = new Date();
    saveCache();
    Bus.emit('data:updated', NEPSE);

  } catch (err) {
    console.warn('[API] fetch error:', err.message);
    if (NEPSE.stocks.length > 0) Bus.emit('data:updated', NEPSE);
    Bus.emit('data:error', err);
  }
}

// ── FLOORSHEET (background, non-blocking) ───────────────────────
async function fetchFloorsheetBackground(base) {
  try {
    const res = await fetch(`${base}/Floorsheet`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return;
    const json = await res.json();
    // HF API /Floorsheet returns array directly or has a floorSheetData key
    const rows = Array.isArray(json) ? json
               : Array.isArray(json.floorSheetData) ? json.floorSheetData
               : (json.data || []);
    if (!rows.length) return;

    const byStock = {};
    for (const row of rows) {
      // HF API floorsheet fields: stockSymbol, buyerMemberId, sellerMemberId, contractQuantity, contractRate
      const sym = row.symbol || row.stockSymbol || row.stock;
      if (!sym) continue;
      if (!byStock[sym]) byStock[sym] = { symbol: sym, netUnits: 0, buyers: {}, sellers: {} };
      const qty = parseInt(row.contractQuantity || row.quantity || row.bought || 0);
      const buyId  = String(row.buyerMemberId  || row.buyBrokerId  || row.buyer  || 0);
      const sellId = String(row.sellerMemberId || row.sellBrokerId || row.seller || 0);
      if (buyId !== '0') {
        byStock[sym].buyers[buyId]  = (byStock[sym].buyers[buyId]  || 0) + qty;
        byStock[sym].netUnits += qty;
      }
      if (sellId !== '0') {
        byStock[sym].sellers[sellId] = (byStock[sym].sellers[sellId] || 0) + qty;
        byStock[sym].netUnits -= qty;
      }
    }

    NEPSE.brokerData = Object.values(byStock).map(s => {
      const topBuyers  = Object.entries(s.buyers) .sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id])=>parseInt(id));
      const topSellers = Object.entries(s.sellers).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id])=>parseInt(id));
      const stock  = NEPSE.stocks.find(x => x.symbol === s.symbol);
      const avgVol = Math.max(1, stock?.vol || 1);
      const score  = Math.min(100, Math.round((Math.abs(s.netUnits) / avgVol) * 100));
      const trend  = s.netUnits > avgVol * 0.5 ? 'heavy_accum'
                   : s.netUnits > 0            ? 'accumulating'
                   : s.netUnits < -avgVol * 0.5 ? 'distribution'
                   : s.netUnits < 0            ? 'distributing'
                   : 'neutral';
      const signal = score >= 75 && trend.includes('accum') ? 'BURST_SOON'
                   : score >= 55 && trend.includes('accum') ? 'WATCH'
                   : trend.includes('distribut') && score >= 60 ? 'EXIT'
                   : trend.includes('distribut') ? 'CAUTION' : 'NEUTRAL';
      return { symbol: s.symbol, score, trend, topBuyers, topSellers, netUnits: s.netUnits, days: 1, signal };
    });

    console.info(`[API] ✅ Floorsheet: ${NEPSE.brokerData.length} stocks tracked`);
    saveCache();
    Bus.emit('data:updated', NEPSE);
  } catch (e) {
    console.warn('[API] Floorsheet failed:', e.message);
  }
}

// ── PORTFOLIO HELPERS ───────────────────────────────────────────
function calcPortfolio() {
  return NEPSE.portfolio.map(holding => {
    const live     = NEPSE.stocks.find(s => s.symbol === holding.symbol) || {};
    const ltp      = live.ltp || holding.avgPrice;
    const invested = holding.units * holding.avgPrice;
    const current  = holding.units * ltp;
    return {
      ...holding, ltp, invested, current,
      pnl:    parseFloat((current - invested).toFixed(2)),
      pnlPct: parseFloat(((current - invested) / invested * 100).toFixed(2)),
      chg:    live.chg    || 0,
      chgPct: live.chgPct || 0,
      signal: Object.keys(live).length ? generateSignal(live, NEPSE.brokerData.find(b => b.symbol === holding.symbol)) : null,
    };
  });
}

function savePortfolio() { localStorage.setItem('ns_portfolio', JSON.stringify(NEPSE.portfolio)); Bus.emit('portfolio:updated', NEPSE.portfolio); }
function saveWatchlist()  { localStorage.setItem('ns_watchlist', JSON.stringify(NEPSE.watchlist)); Bus.emit('watchlist:updated', NEPSE.watchlist); }
function saveAlerts()     { localStorage.setItem('ns_alerts',    JSON.stringify(NEPSE.alerts));    Bus.emit('alerts:updated',    NEPSE.alerts); }

// ── CACHE HELPERS ────────────────────────────────────────────────
const CACHE_KEY = 'ns_market_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ts:         Date.now(),
      stocks:     NEPSE.stocks,
      indices:    NEPSE.indices,
      brokerData: NEPSE.brokerData,
    }));
  } catch(e) { /* storage full — ignore */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const cache = JSON.parse(raw);
    if (Date.now() - cache.ts > CACHE_TTL) return false; // stale
    NEPSE.stocks     = cache.stocks     || [];
    NEPSE.indices    = cache.indices    || {};
    NEPSE.brokerData = cache.brokerData || [];
    NEPSE.lastUpdated = new Date(cache.ts);
    console.info(`[API] ✅ Loaded ${NEPSE.stocks.length} stocks from cache (${Math.round((Date.now()-cache.ts)/1000)}s old)`);
    return true;
  } catch(e) { return false; }
}

// ── ALERT CHECKER ────────────────────────────────────────────────
function checkAlerts() {
  NEPSE.alerts.forEach(alert => {
    if (!alert.active) return;
    const stock = NEPSE.stocks.find(s => s.symbol === alert.symbol);
    if (!stock) return;
    let triggered = false;
    if (alert.type === 'above' && stock.ltp >= alert.price)  triggered = true;
    if (alert.type === 'below' && stock.ltp <= alert.price)  triggered = true;
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

// ── INIT ────────────────────────────────────────────────────────
async function initAPI() {
  // Use cached data immediately if fresh — no loading spinner for user
  if (loadCache()) {
    Bus.emit('data:updated', NEPSE);
    checkAlerts();
    // Still refresh in background if cache is older than 2 minutes
    const raw = localStorage.getItem(CACHE_KEY);
    const cacheAge = raw ? Date.now() - JSON.parse(raw).ts : Infinity;
    if (cacheAge > 2 * 60 * 1000) {
      fetchMarketData(); // background refresh, non-blocking
    }
  } else {
    await fetchMarketData(); // no cache — must wait
  }
  Bus.on('data:updated', checkAlerts);
  setInterval(fetchMarketData, CONFIG.DEMO_MODE ? 15000 : CONFIG.REFRESH_MS);
}

// ── UTILS ────────────────────────────────────────────────────────
const Utils = {
  fmt:   (n, d=2)  => (n == null || isNaN(n)) ? '—' : parseFloat(n).toLocaleString('en-IN', {minimumFractionDigits:d, maximumFractionDigits:d}),
  fmtI:  (n)       => (n == null || isNaN(n)) ? '—' : parseInt(n).toLocaleString('en-IN'),
  fmtCr: (n) => {
    if (!n || isNaN(n)) return '—';
    if (n >= 1e9) return (n/1e9).toFixed(2) + ' Arba';
    if (n >= 1e7) return (n/1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return (n/1e5).toFixed(2) + ' L';
    return Utils.fmtI(n);
  },
  clsName:    (v) => v > 0 ? 'up' : v < 0 ? 'dn' : 'neu',
  arrow:      (v) => v > 0 ? '▲'  : v < 0 ? '▼'  : '●',
  scoreClass: (s) => s >= 70 ? 'high' : s >= 40 ? 'mid' : 'low',
  brokerName: (id) => DEMO_BROKERS[id] || `Broker ${id}`,
  getNPTTime: () => {
    const now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.75 * 3600000);
  },
  safeScore: (s) => {
    const n = parseFloat(s);
    return isNaN(n) || !isFinite(n) ? 50 : Math.min(100, Math.max(0, Math.round(n)));
  },
};

window.API = {
  init: initAPI, fetch: fetchMarketData,
  calcPortfolio, savePortfolio, saveWatchlist, saveAlerts,
  generateSignal, detectBurstCandidates, detectCircuitCandidates, analyzeSectorRotation,
  Bus, Utils, CONFIG, DEMO_BROKERS, mapSector,
};
