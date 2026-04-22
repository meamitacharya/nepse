/**
 * NEPSE SMART — Data Layer (api.js) v3.4 (STABLE)
 * Fixed: Namespace regressions, Portfolio Engine, and Storage persistence
 */
'use strict';

const CONFIG = {
  PROD_BACKEND:  'https://meamitacharya-nepse-smart-backend.hf.space/api',
  LIVE_DATA_URL: 'https://meamitacharya-nepse-api-amit.hf.space',
  REFRESH_MS:    5 * 60 * 1000,
  MARKET_OPEN:   { h: 11, m: 0 },
  MARKET_CLOSE:  { h: 15, m: 0 },
  DEMO_MODE:     false,
};

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

const Bus = {
  on(event, fn) {
    if (!NEPSE.listeners[event]) NEPSE.listeners[event] = [];
    NEPSE.listeners[event].push(fn);
  },
  emit(event, data) {
    (NEPSE.listeners[event] || []).forEach(fn => fn(data));
  },
};

const Utils = {
  fmt:   (n, d=2) => (n == null || isNaN(n)) ? '—' : parseFloat(n).toLocaleString('en-IN', {minimumFractionDigits:d, maximumFractionDigits:d}),
  fmtI:  (n) => (n == null || isNaN(n)) ? '—' : parseInt(n).toLocaleString('en-IN'),
  fmtCr: (n) => n >= 1e9 ? (n/1e9).toFixed(2) + ' Arba' : n >= 1e7 ? (n/1e7).toFixed(2) + ' Cr' : Utils.fmtI(n),
  clsName: (v) => v > 0 ? 'up' : v < 0 ? 'dn' : 'neu',
  arrow:   (v) => v > 0 ? '▲' : v < 0 ? '▼' : '●',
  safeScore (v) { return (v == null || !isFinite(v) || isNaN(v)) ? 50 : Math.min(100, Math.max(0, Math.round(v))); },
  getNPTTime() {
    const now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.75 * 3600000);
  },
  brokerName(id) { return window.API && window.API.DEMO_BROKERS ? (window.API.DEMO_BROKERS[id] || `Broker ${id}`) : `Broker ${id}`; }
};

const API = {
  CONFIG, Bus, Utils,
  DEMO_BROKERS: { 1:'Kumari',2:'Pragya',3:'NIC Asia',4:'Nabil',42:'Smart Money',58:'Institutional' },

  async init() {
    this.Bus.emit('api:loading', true);
    if (!this.loadCache()) await this.fetch();
    else { this.Bus.emit('data:updated', NEPSE); this.fetch(); }
    setInterval(() => this.fetch(), CONFIG.REFRESH_MS);
  },

  async fetch() {
    this.checkMarketStatus();
    if (CONFIG.DEMO_MODE) { this.Bus.emit('data:updated', NEPSE); return; }

    try {
      const [tradeRes, idxRes, summaryRes] = await Promise.allSettled([
        fetch(`${CONFIG.LIVE_DATA_URL}/TradeTurnoverTransactionSubindices`, { signal: AbortSignal.timeout(30000) }),
        fetch(`${CONFIG.LIVE_DATA_URL}/NepseIndex`, { signal: AbortSignal.timeout(20000) }),
        fetch(`${CONFIG.LIVE_DATA_URL}/Summary`, { signal: AbortSignal.timeout(20000) }),
      ]);

      if (tradeRes.status === 'fulfilled' && tradeRes.value.ok) {
        const json = await tradeRes.value.json();
        const scrips = json.scripsDetails || {};
        NEPSE.stocks = Object.entries(scrips).map(([symbol, s]) => ({
          symbol, name: s.name || symbol, sector: this.mapSector(s.sector), ltp: parseFloat(s.ltp)||0, prev: parseFloat(s.previousClose)||0,
          high: parseFloat(s.ltp)||0, low: parseFloat(s.ltp)||0, vol: parseInt(s.volume)||0, to: parseFloat(s.Turnover)||0,
          chg: parseFloat(s.pointChange)||0, chgPct: parseFloat(s.percentageChange)||0,
        })).filter(s => s.ltp > 0);
      }

      if (idxRes.status === 'fulfilled' && idxRes.value.ok) {
        const idx = await idxRes.value.json();
        const main = idx['NEPSE Index'] || {};
        NEPSE.indices.nepse = { value: parseFloat(main.currentValue)||0, change: parseFloat(main.change)||0, pct: parseFloat(main.perChange)||0 };
        NEPSE.indices.advances = parseInt(idx.advances || 0);
        NEPSE.indices.declines = parseInt(idx.declines || 0);
        NEPSE.indices.unchanged = parseInt(idx.unchanged || 0);
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
        const summ = await summaryRes.value.json();
        NEPSE.indices.turnover = parseFloat(summ['Total Turnover Rs:']) || 0;
      }

      NEPSE.lastUpdated = new Date();
      await Promise.allSettled([
        this.fetchSmartSignals(),
        this.fetchBrokerData()
      ]);
      this.saveCache();
      this.Bus.emit('data:updated', NEPSE);
    } catch (err) { console.warn('[API] Fetch Error:', err.message); }
  },

  async fetchSmartSignals() {
    const url = `${CONFIG.PROD_BACKEND}/signals/latest`;
    console.info('[API] 📡 Synchronizing Smart Engine...');
    
    let attempts = 0;
    while (attempts < 2) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const { data } = await res.json();
          (data || []).forEach(sig => {
            const stock = NEPSE.stocks.find(s => s.symbol === sig.symbol);
            if (stock) stock.backendSignal = sig;
          });
          console.info(`[API] 🧠 Smart Engine: Activated (${(data||[]).length} signals).`);
          return;
        }
      } catch (e) { attempts++; if (attempts < 2) await new Promise(r => setTimeout(r, 2000)); }
    }
    console.warn('[API] ⚠️ Smart Engine connection failed.');
  },

  async fetchBrokerData() {
    const url = `${CONFIG.PROD_BACKEND}/broker/accumulation`;
    console.info('[API] 🏦 Synchronizing Broker Tracker...');
    
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const { data } = await res.json();
        NEPSE.brokerData = data || [];
        console.info(`[API] 📈 Broker Tracker: Loaded data for ${NEPSE.brokerData.length} stocks.`);
      }
    } catch (e) { console.warn('[API] Broker Tracker connection failed.'); }
  },

  calcPortfolio() {
    return NEPSE.portfolio.map(p => {
      const stock = NEPSE.stocks.find(s => s.symbol === p.symbol);
      const ltp = stock ? stock.ltp : p.avgPrice;
      const invested = p.units * p.avgPrice;
      const current = p.units * ltp;
      const pnl = current - invested;
      return {
        ...p, ltp, invested, current, pnl,
        pnlPct: invested ? (pnl / invested * 100) : 0,
        sig: stock ? this.generateSignal(stock, null) : null
      };
    });
  },

  savePortfolio() { localStorage.setItem('ns_portfolio', JSON.stringify(NEPSE.portfolio)); this.Bus.emit('data:updated', NEPSE); },
  saveWatchlist() { localStorage.setItem('ns_watchlist', JSON.stringify(NEPSE.watchlist)); this.Bus.emit('data:updated', NEPSE); },
  saveAlerts()    { localStorage.setItem('ns_alerts',    JSON.stringify(NEPSE.alerts));    this.Bus.emit('data:updated', NEPSE); },

  generateSignal(stock, acc) {
    if (stock.backendSignal) {
      const b = stock.backendSignal;
      const strength = b.score >= 70 || b.score <= 30 ? 'STRONG' : (b.score >= 60 || b.score <= 40 ? 'MODERATE' : 'NEUTRAL');
      const target = b.signal.includes('BUY') ? `Rs. ${(stock.ltp*1.15).toFixed(0)}` : '—';
      const stopLoss = b.signal.includes('BUY') ? `Rs. ${(stock.ltp*0.95).toFixed(0)}` : '—';
      return { 
        ...b, 
        strength: b.strength || strength,
        target: b.target || target,
        stopLoss: b.stopLoss || stopLoss,
        zone: `Rs. ${(stock.ltp*0.98).toFixed(0)}-${(stock.ltp*1.02).toFixed(0)}` 
      };
    }
    const score = 50;
    return { signal: 'HOLD', score, strength: 'NEUTRAL', reason: 'Analyzing market trends...', zone: '—', target: '—', stopLoss: '—' };
  },

  detectBurstCandidates() {
    return NEPSE.brokerData.filter(b => b.score >= 80).map(b => ({
      ...b,
      stock: NEPSE.stocks.find(s => s.symbol === b.symbol),
      confidence: b.score >= 90 ? 'HIGH' : 'MEDIUM'
    })).sort((a,b) => b.score - a.score);
  },

  detectCircuitCandidates(stocks) {
    return stocks.filter(s => Math.abs(s.chgPct) >= 7.5).map(s => {
      const limit = 10;
      const direction = s.chgPct >= 0 ? 'upper' : 'lower';
      const distToCircuit = Math.abs(limit - Math.abs(s.chgPct));
      return { ...s, direction, distToCircuit };
    }).sort((a,b) => a.distToCircuit - b.distToCircuit).slice(0, 10);
  },
  
  analyzeSectorRotation(stocks) {
    const sectors = {};
    stocks.forEach(s => {
      if (!sectors[s.sector]) sectors[s.sector] = { name:s.sector, stocks:0, totalChg:0, totalTo:0, totalVol:0 };
      sectors[s.sector].stocks++;
      sectors[s.sector].totalChg += s.chgPct;
      sectors[s.sector].totalTo += s.to;
      sectors[s.sector].totalVol += (s.vol || 0);
    });
    return Object.values(sectors).map(sec => ({
      ...sec, avgChg: sec.totalChg / sec.stocks,
      momentum: (sec.totalChg / sec.stocks) > 1 ? 'HOT' : (sec.totalChg / sec.stocks) > 0 ? 'POSITIVE' : 'COLD'
    })).sort((a,b) => b.avgChg - a.avgChg);
  },

  checkMarketStatus() {
    const npt = Utils.getNPTTime();
    const mins = npt.getHours() * 60 + npt.getMinutes();
    const open = CONFIG.MARKET_OPEN.h * 60;
    const close = CONFIG.MARKET_CLOSE.h * 60;
    NEPSE.isMarketOpen = npt.getDay() >= 0 && npt.getDay() <= 4 && mins >= open && mins < close;
  },

  mapSector(raw) {
    const m = { 'Commercial Banks':'Commercial Banks', 'Hydro Power':'Hydropower', 'Investment':'Mutual Fund' };
    return m[raw] || raw || 'Others';
  },

  saveCache() { localStorage.setItem('ns_market_cache', JSON.stringify({ ts: Date.now(), stocks: NEPSE.stocks, indices: NEPSE.indices })); },
  loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem('ns_market_cache'));
      if (!c || Date.now() - c.ts > 300000) return false;
      NEPSE.stocks = c.stocks; NEPSE.indices = c.indices; NEPSE.lastUpdated = new Date(c.ts);
      return true;
    } catch(e) { return false; }
  }
};

window.API = API;
API.init();
