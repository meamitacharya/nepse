/**
 * NEPSE SMART — UI Components (ui.js)
 * Toast notifications, modals, score rings, mini charts, shared rendering
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
const Toast = {
  container: null,

  init() {
    if (!document.getElementById('toast-container')) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('toast-container');
    }
  },

  show(type, title, msg, duration = 4500) {
    if (!this.container) this.init();
    const icons = { buy:'🟢', sell:'🔴', info:'💡', warn:'⚠️', alert:'🔔' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${msg}</div>
      </div>
      <button onclick="this.parentElement.remove()" style="margin-left:auto;background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;line-height:1">×</button>
    `;
    this.container.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, duration);
  },

  buy:   (title, msg) => Toast.show('buy',  title, msg),
  sell:  (title, msg) => Toast.show('sell', title, msg),
  info:  (title, msg) => Toast.show('info', title, msg),
  warn:  (title, msg) => Toast.show('warn', title, msg),
  alert: (title, msg) => Toast.show('alert', title, msg),
};

// ═══════════════════════════════════════════════════════════════
// SCORE RING
// ═══════════════════════════════════════════════════════════════
function renderScoreRing(rawScore, size = 56) {
  // Sanitize — guard against Infinity/NaN from division errors
  const score = (rawScore == null || !isFinite(rawScore) || isNaN(rawScore))
    ? 50 : Math.min(100, Math.max(0, Math.round(rawScore)));
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const cls  = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
  return `
    <div class="score-ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle class="bg" cx="${size/2}" cy="${size/2}" r="${r}"
          fill="none" stroke="var(--border)" stroke-width="5"/>
        <circle class="fg ${cls}" cx="${size/2}" cy="${size/2}" r="${r}"
          fill="none" stroke="${color}" stroke-width="5"
          stroke-dasharray="${circ}"
          stroke-dashoffset="${circ - fill}"
          style="transform:rotate(-90deg);transform-origin:50% 50%;transition:stroke-dashoffset .6s ease"/>
      </svg>
      <div class="score-label" style="font-size:${size < 48 ? 11 : 13}px">${score}</div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// MINI SPARKLINE (SVG)
// ═══════════════════════════════════════════════════════════════
function renderSparkline(values, color = 'var(--green)', width = 80, height = 32) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const last = values[values.length - 1];
  const first = values[0];
  const lineColor = last >= first ? 'var(--green)' : 'var(--red)';
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
      <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="1.5"
        stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL BADGE HTML
// ═══════════════════════════════════════════════════════════════
function signalBadge(signal) {
  const map = { BUY:'buy', SELL:'sell', HOLD:'hold', WATCH:'watch', NEUTRAL:'hold' };
  const cls = map[signal] || 'hold';
  const labels = { BUY:'● BUY', SELL:'● SELL', HOLD:'● HOLD', WATCH:'● WATCH', NEUTRAL:'● HOLD' };
  return `<span class="signal ${cls}">${labels[signal] || signal}</span>`;
}

// ═══════════════════════════════════════════════════════════════
// ACCUMULATION BAR
// ═══════════════════════════════════════════════════════════════
function accumulationBar(rawScore) {
  const score = (rawScore == null || !isFinite(rawScore) || isNaN(rawScore))
    ? 50 : Math.min(100, Math.max(0, Math.round(rawScore)));
  const cls = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
  return `
    <div style="display:flex;align-items:center;gap:8px">
      <div class="progress-bar" style="width:80px;flex-shrink:0">
        <div class="progress-fill ${cls}" style="width:${score}%"></div>
      </div>
      <span class="font-data text-sm ${score >= 70 ? 'up' : score >= 40 ? '' : 'dn'}">${score}</span>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// MARKET STATUS BAR UPDATER
// ═══════════════════════════════════════════════════════════════
function updateMarketStatusBar(isOpen) {
  const dot  = document.getElementById('market-dot');
  const text = document.getElementById('market-text');
  if (!dot || !text) return;
  if (isOpen) {
    dot.className  = 'status-dot open';
    text.textContent = 'Market Open';
  } else {
    dot.className  = 'status-dot';
    text.textContent = 'Market Closed';
  }
}

// ═══════════════════════════════════════════════════════════════
// TICKER UPDATER
// ═══════════════════════════════════════════════════════════════
function updateTicker(stocks) {
  const inner = document.querySelector('.ticker-inner');
  if (!inner || !stocks.length) return;
  // Show top 20 by turnover, doubled for infinite scroll
  const top = [...stocks].sort((a,b) => b.to - a.to).slice(0, 20);
  const items = [...top, ...top].map(s => `
    <div class="ticker-item">
      <span class="ticker-sym">${s.symbol}</span>
      <span class="ticker-price">${API.Utils.fmt(s.ltp)}</span>
      <span class="ticker-chg ${API.Utils.clsName(s.chg)}">
        ${s.chg >= 0 ? '+' : ''}${API.Utils.fmt(s.chg)} (${s.chg >= 0 ? '+' : ''}${API.Utils.fmt(s.chgPct)}%)
      </span>
    </div>
  `).join('');
  inner.innerHTML = items;
}

// ═══════════════════════════════════════════════════════════════
// LAST UPDATED TIMESTAMP
// ═══════════════════════════════════════════════════════════════
function updateTimestamp() {
  const el = document.getElementById('last-updated');
  if (!el) return;
  const npt = API.Utils.getNPTTime();
  el.textContent = `Updated ${npt.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })} NPT`;
}

// ═══════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
const Modal = {
  open(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  },
  closeAll() {
    document.querySelectorAll('.modal-overlay.open').forEach(el => el.classList.remove('open'));
  },
};

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});

// ═══════════════════════════════════════════════════════════════
// STOCK DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
function showStockModal(symbol) {
  const stock = NEPSE.stocks.find(s => s.symbol === symbol);
  if (!stock) return;
  const acc = NEPSE.brokerData.find(b => b.symbol === symbol);
  const sig = API.generateSignal(stock, acc);

  let modal = document.getElementById('stock-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'stock-detail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:560px"><div id="smd-content"></div></div>`;
    document.body.appendChild(modal);
  }

  const chgCls = API.Utils.clsName(stock.chg);
  const brokerBuyers  = acc ? acc.topBuyers.map(id => API.Utils.brokerName(id)).join(', ') : '—';
  const brokerSellers = acc ? acc.topSellers.map(id => API.Utils.brokerName(id)).join(', ') : '—';

  document.getElementById('smd-content').innerHTML = `
    <div class="modal-header">
      <div>
        <div class="modal-title">${stock.symbol} <span style="color:var(--text2);font-weight:400;font-size:14px">· ${stock.name}</span></div>
        <div style="margin-top:4px;display:flex;gap:8px;align-items:center">
          ${signalBadge(sig.signal)}
          <span class="chip">${stock.sector}</span>
          ${acc ? `<span class="live-badge">TRACKING</span>` : ''}
        </div>
      </div>
      <button class="modal-close" onclick="Modal.closeAll()">×</button>
    </div>

    <!-- Price Section -->
    <div style="background:var(--surface2);border-radius:var(--r-lg);padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px">
        <div style="font-family:var(--font-data);font-size:32px;font-weight:500">Rs. ${API.Utils.fmt(stock.ltp)}</div>
        <div class="${chgCls}" style="font-size:16px;font-weight:600">${stock.chg >= 0 ? '+' : ''}${API.Utils.fmt(stock.chg)} (${stock.chg >= 0 ? '+' : ''}${API.Utils.fmt(stock.chgPct)}%)</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${[['Open',stock.open],['High',stock.high],['Low',stock.low],['Prev',stock.prev]].map(([l,v]) => `
          <div><div style="font-size:10px;color:var(--text3);margin-bottom:2px">${l}</div>
          <div style="font-family:var(--font-data);font-size:13px">${API.Utils.fmt(v)}</div></div>
        `).join('')}
      </div>
    </div>

    <!-- Signal Section -->
    <div style="background:${sig.signal==='BUY'?'var(--green-bg)':sig.signal==='SELL'?'var(--red-bg)':'var(--surface2)'};border:1px solid ${sig.signal==='BUY'?'rgba(16,185,129,.3)':sig.signal==='SELL'?'rgba(239,68,68,.3)':'var(--border)'};border-radius:var(--r-lg);padding:14px;margin-bottom:16px">
      <div style="font-weight:600;margin-bottom:6px">📊 AI Signal: ${sig.signal} (${sig.strength})</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${sig.reason}</div>
      <div style="display:flex;gap:16px;font-size:12px;flex-wrap:wrap">
        <div><span style="color:var(--text3)">Entry Zone: </span><strong>${sig.zone}</strong></div>
        ${sig.target ? `<div><span style="color:var(--text3)">Target: </span><strong class="up">${sig.target}</strong></div>` : ''}
        ${sig.stopLoss ? `<div><span style="color:var(--text3)">Stop Loss: </span><strong class="dn">${sig.stopLoss}</strong></div>` : ''}
      </div>
    </div>

    <!-- Broker Section -->
    ${acc ? `
    <div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">🏦 Broker Activity (Last 10 Days)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:var(--green-bg);border:1px solid rgba(16,185,129,.2);border-radius:var(--r-md);padding:12px">
          <div style="font-size:11px;color:var(--green);margin-bottom:4px">TOP BUYERS (Smart Money)</div>
          <div style="font-size:12px">${brokerBuyers}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">+${API.Utils.fmtI(Math.abs(acc.netUnits))} net units</div>
        </div>
        <div style="background:var(--red-bg);border:1px solid rgba(239,68,68,.2);border-radius:var(--r-md);padding:12px">
          <div style="font-size:11px;color:var(--red);margin-bottom:4px">TOP SELLERS</div>
          <div style="font-size:12px">${brokerSellers}</div>
        </div>
      </div>
      <div style="margin-top:10px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Accumulation Score</div>
        ${accumulationBar(acc.score)}
      </div>
    </div>
    ` : ''}

    <!-- Fundamentals -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${[['EPS',stock.eps,'Rs.'],['P/E',stock.pe,'x'],['Book Value',stock.bv,'Rs.'],['Dividend',stock.div,'%']].map(([l,v,u])=>`
        <div style="background:var(--surface2);border-radius:var(--r-md);padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${l}</div>
          <div style="font-family:var(--font-data);font-size:15px;font-weight:500">${v||'—'}<span style="font-size:10px;color:var(--text3)">${u}</span></div>
        </div>
      `).join('')}
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="addToWatchlist('${stock.symbol}')">+ Watchlist</button>
      <button class="btn btn-ghost btn-sm" onclick="openAddHolding('${stock.symbol}')">+ Portfolio</button>
      <button class="btn btn-ghost btn-sm" onclick="openAlertModal('${stock.symbol}')">🔔 Set Alert</button>
      <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Modal.closeAll()">Close</button>
    </div>
  `;
  modal.classList.add('open');
}

// ═══════════════════════════════════════════════════════════════
// WATCHLIST / PORTFOLIO QUICK ACTIONS
// ═══════════════════════════════════════════════════════════════
function addToWatchlist(symbol) {
  if (!NEPSE.watchlist.includes(symbol)) {
    NEPSE.watchlist.push(symbol);
    API.saveWatchlist();
    Toast.info('Watchlist Updated', `${symbol} added to your watchlist`);
  } else {
    Toast.info('Already Watching', `${symbol} is already in your watchlist`);
  }
}

function openAddHolding(symbol) {
  Modal.closeAll();
  // Will be handled by portfolio page
  if (typeof portfolioModal === 'function') {
    portfolioModal(symbol);
  } else {
    Toast.info('Portfolio', `Go to Portfolio page to add ${symbol}`);
  }
}

function openAlertModal(symbol) {
  Modal.closeAll();
  if (typeof alertModal === 'function') {
    alertModal(symbol);
  } else {
    Toast.info('Alerts', `Go to Alerts page to set alerts for ${symbol}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// DATA DISCLAIMER
// ═══════════════════════════════════════════════════════════════
function demoDisclaimer() {
  if (API.CONFIG.DEMO_MODE) {
    return `
      <div class="data-disclaimer">
        ⚠️ <strong>Demo Mode:</strong> Showing sample data with simulated movement.
        Backend not connected yet.
      </div>
    `;
  }
  return `
    <div style="background:var(--green-bg);border:1px solid rgba(16,185,129,.3);border-radius:var(--r-md);
      padding:10px 14px;font-size:11.5px;color:var(--green);display:flex;align-items:center;gap:8px;margin-bottom:16px">
      ✅ <strong>Live Data Mode</strong> — Connected to NEPSE backend. Data refreshes every 5 minutes during market hours.
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
Toast.init();
window.Toast  = Toast;
window.Modal  = Modal;
window.UI = {
  renderScoreRing,
  renderSparkline,
  signalBadge,
  accumulationBar,
  updateMarketStatusBar,
  updateTicker,
  updateTimestamp,
  showStockModal,
  addToWatchlist,
  openAddHolding,
  openAlertModal,
  demoDisclaimer,
};

// Alert trigger notification
API.Bus.on('alert:triggered', ({ alert, stock }) => {
  const msg = alert.type === 'broker_accum'
    ? `Smart money detected accumulating ${alert.symbol}`
    : `${alert.symbol} has reached Rs. ${API.Utils.fmt(alert.price)}`;
  Toast.alert(`🔔 Alert: ${alert.symbol}`, msg);
});
