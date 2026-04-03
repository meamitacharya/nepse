# 🚀 NEPSE Smart — Complete Stock Analysis Platform

> Track smart money. Get buy/sell signals. Maximize profit. Built for Nepal Stock Exchange (NEPSE) investors.

---

## 📁 Project Structure

```
nepse-smart/
├── index.html          → Main dashboard
├── portfolio.html      → Portfolio P&L tracker
├── broker.html         → Broker accumulation tracker (smart money)
├── signals.html        → Full buy/sell signal list
├── alerts.html         → Price alerts manager
├── chat.html           → AI stock advisor (powered by Claude)
├── sectors.html        → Sector rotation tracker
├── watchlist.html      → Personal watchlist
├── ipo.html            → IPO analyzer
├── calendar.html       → Bonus/dividend calendar
├── calculator.html     → Return calculator
├── assets/
│   ├── css/main.css    → Complete design system
│   └── js/
│       ├── api.js      → All data layer, algorithms, signal logic
│       └── ui.js       → Shared UI components, toasts, modals
└── README.md
```

---

## ⚡ Quick Start (Demo Mode)

Just open `index.html` in any browser — no server needed.

The app runs in **demo mode** with realistic sample data that updates every 15 seconds to simulate live movement.

---

## 🔴 Live Data Setup (Recommended for Real Use)

### Step 1: Install Python backend

```bash
pip install git+https://github.com/basic-bgnr/NepseUnofficialApi
```

### Step 2: Start local server

```bash
nepse-cli --start-server
# Server runs at http://localhost:8000
```

### Step 3: Enable live mode

In `assets/js/api.js`, change:
```js
DEMO_MODE: true,
```
to:
```js
DEMO_MODE: false,
```

That's it! The app will now fetch real live data from NEPSE.

---

## 🧠 Key Features

| Feature | Description |
|---------|-------------|
| **Broker Accumulation Tracker** | Detects which brokers are quietly buying — your #1 edge |
| **Burst Predictor** | Stocks with heavy smart-money loading → breakout imminent |
| **Buy/Sell Signals** | Multi-factor algorithm: broker activity + price position + volume + fundamentals |
| **Portfolio P&L** | Track all holdings with real-time profit/loss |
| **Price Alerts** | Get notified when price hits your target or when smart money moves |
| **AI Chat** | Ask Claude AI about any stock using live NEPSE data |
| **Sector Rotation** | See which sectors hot money is moving into |
| **Circuit Breaker Watch** | Stocks near 10% daily limit |

---

## 📊 Signal Algorithm

The buy/sell signal is calculated from 4 factors:

```
Signal Score = 
  Broker Accumulation Score × 40% +
  Price Position (vs high/low)  × 30% +
  Volume Anomaly                × 20% +
  PE Ratio (vs sector avg)      × 10%
```

- Score ≥ 65 + Smart money detected = **STRONG BUY**
- Score ≥ 60 = **MODERATE BUY**
- Score ≤ 35 = **SELL**
- Anything else = **HOLD**

---

## 🏦 Broker Accumulation Logic

Analyzes 10-day floorsheet data:
1. Group all trades by broker number and stock
2. Calculate net units (bought - sold) per broker per stock
3. Identify "consistent accumulators" — brokers buying the same stock 5+ days
4. Score from 0–100 based on intensity and duration
5. Brokers 42, 58 = known institutional/smart money in NEPSE

**Burst Signal triggers when:**
- Accumulation score ≥ 75
- 5+ consecutive days of net positive buying
- Price consolidating (not yet moved significantly)

---

## 💰 Subscription Tiers (Planned)

| Plan | Price | Features |
|------|-------|----------|
| Free | Rs. 0 | 5 stocks watchlist, basic signals, delayed data |
| Pro | Rs. 299/mo | Unlimited signals, broker alerts, AI chat, SMS alerts |
| Premium | Rs. 599/mo | Everything + priority alerts, full floorsheet access |

---

## 📱 SMS Alerts Setup (Pro — Sparrow SMS)

```js
// In api.js, replace sendSMSAlert():
const res = await fetch('https://api.sparrowsms.com/v2/sms/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'YOUR_SPARROW_TOKEN',
    from: 'NepseSmart',
    to: userPhone,
    text: alertMessage,
  })
});
```

---

## 🌐 GitHub Pages Deployment

```bash
# 1. Create GitHub repo
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/nepse-smart.git
git push -u origin main

# 2. Enable GitHub Pages
# Go to: Settings → Pages → Source: main branch → / (root)
# Your site: https://YOUR_USERNAME.github.io/nepse-smart/
```

**Note:** Live data requires your Python backend to be running. For GitHub Pages, you'll need a hosted backend (e.g., Railway, Render, VPS).

---

## ⚠️ Important Disclaimer

This tool provides **data-driven signals** to support your investment research. It does NOT guarantee profits. Always:
- Do your own research (DYOR)
- Set stop losses on every trade
- Never invest more than you can afford to lose
- NEPSE can be illiquid — check volume before buying

---

## 🛣️ Roadmap

- [ ] Historical price charts (OHLC candlestick)
- [ ] Full floorsheet view with broker-level filtering
- [ ] Bonus/rights/dividend calendar with notifications
- [ ] IPO expected listing price predictor (ML-based)
- [ ] Mobile app (React Native)
- [ ] SMS alerts via Sparrow SMS
- [ ] Multi-user accounts + backend
- [ ] Weekly email briefing

---

*Built with ❤️ for NEPSE investors. Start small, be consistent, grow big.*
