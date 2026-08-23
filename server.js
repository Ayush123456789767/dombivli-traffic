const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());
const PORT = process.env.PORT || 3000;

// 🔑 API KEYS (Set in Render Environment Variables)
const TOMTOM_KEY = process.env.TOMTOM_KEY || "YOUR_TOMTOM_KEY_HERE";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "YOUR_TELEGRAM_CHAT_ID";

// 📍 20 EXACT DOMBIVLI WEST LOCATIONS (Direct Pin-Point GPS Coordinates)
const spots = [
  { id: 1,  name: "East-West Flyover (Centre)",          lat: 19.21780, lng: 73.08805 },
  { id: 2,  name: "Kopar Road (West)",                   lat: 19.22080, lng: 73.08550 },
  { id: 3,  name: "Retibandar Road (West)",              lat: 19.21180, lng: 73.07920 },
  { id: 4,  name: "Retibandar Cross Road (West)",        lat: 19.21320, lng: 73.08150 },
  { id: 5,  name: "Pandit Deendayal Upadhyay Marg (W)",  lat: 19.21620, lng: 73.08480 },
  { id: 6,  name: "Mumbra Devi Road (West)",             lat: 19.21280, lng: 73.08050 },
  { id: 7,  name: "Elephant Fountain Circle / Hathi Chowk (W)", lat: 19.21695, lng: 73.08502 },
  { id: 8,  name: "Ghanshyam Gupte Road (West)",         lat: 19.21580, lng: 73.08420 },
  { id: 9,  name: "Nana Shankar Seth Road (West)",       lat: 19.21480, lng: 73.08310 },
  { id: 10, name: "Ganesh Chowk (West)",                 lat: 19.21820, lng: 73.08620 },
  { id: 11, name: "Mahatma Phule Road (West)",           lat: 19.21390, lng: 73.08190 },
  { id: 12, name: "Subhash Chandra Bose Road (West)",    lat: 19.21660, lng: 73.08560 },
  { id: 13, name: "Mahatma Gandhi Road (West)",          lat: 19.21740, lng: 73.08510 },
  { id: 14, name: "Gokhale Road (West)",                 lat: 19.21530, lng: 73.08340 },
  { id: 15, name: "Thakurli Flyover (West)",             lat: 19.22380, lng: 73.09150 },
  { id: 16, name: "East to West Thakurli Bridge (W)",    lat: 19.22450, lng: 73.09350 },
  { id: 17, name: "Everest Gali (West)",                 lat: 19.21715, lng: 73.08575 },
  { id: 18, name: "Ghanshyam Gupte Cross Rd No.1 (W)",   lat: 19.21570, lng: 73.08390 },
  { id: 19, name: "Thakurwadi Road (West)",              lat: 19.21950, lng: 73.08650 },
  { id: 20, name: "Deva Chowk (West)",                   lat: 19.21915, lng: 73.08685 }
];

let liveTrafficData = spots.map(s => ({
  ...s,
  currentSpeed: 0,
  freeFlowSpeed: 0,
  delayMinutes: 0,
  status: 'gray',
  statusText: 'WAITING',
  redSince: null,
  lastAlertSentAt: null,
  isAlert: false
}));

let lastCheckTime = null;
let isNightMode = false;

// 📲 Send Instant Alert to Telegram
async function sendTelegramAlert(htmlMessage) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.startsWith("YOUR_")) return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: htmlMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });
    console.log(`📱 Telegram alert dispatched!`);
  } catch (err) {
    console.error(`❌ Telegram dispatch error:`, err.message);
  }
}

// 🚦 Check One Spot Traffic
async function checkSpotTraffic(spot) {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${spot.lat},${spot.lng}&unit=KMPH&key=${TOMTOM_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.flowSegmentData) {
      const flow = data.flowSegmentData;
      const currentSpeed = Math.round(flow.currentSpeed);
      const freeFlow = Math.round(flow.freeFlowSpeed);
      const delaySeconds = Math.max(0, flow.currentTravelTime - flow.freeFlowTravelTime);
      const delayMinutes = Math.round(delaySeconds / 60);

      let status = 'green';
      let statusText = '🟢 CLEAR';

      if (currentSpeed < (freeFlow * 0.4) || delayMinutes >= 3) {
        status = 'red';
        statusText = '🚨 JAMMED';
      } else if (currentSpeed < (freeFlow * 0.75) || delayMinutes >= 1) {
        status = 'yellow';
        statusText = '⚠️ SLOW';
      }

      const existing = liveTrafficData.find(s => s.id === spot.id);
      let redSince = existing ? existing.redSince : null;
      let lastAlertSentAt = existing ? existing.lastAlertSentAt : null;
      let isAlert = false;
      
      // Exact Coordinate Pin Link with street-level zoom
      const mapLink = `https://www.google.com/maps?q=${spot.lat},${spot.lng}&z=19`;

      if (status === 'red') {
        if (!redSince) redSince = Date.now();
        const minsStuck = Math.floor((Date.now() - redSince) / 60000);

        // 🚨 5-Minute Jam Alert Trigger
        if (minsStuck >= 5) {
          isAlert = true;
          const now = Date.now();
          const minsSinceLastAlert = lastAlertSentAt ? Math.floor((now - lastAlertSentAt) / 60000) : 999;

          if (minsSinceLastAlert >= 5) {
            const message = 
`🚨 <b>TRAFFIC MONITOR WEST — DISPATCH ALERT</b> 🚨

📍 <b>Spot:</b> ${spot.name}
⏱️ <b>Status:</b> STATIONARY for <b>${minsStuck}+ minutes!</b>
🚗 <b>Current Flow:</b> ${currentSpeed} km/h (Normal: ${freeFlow} km/h)
⏳ <b>Estimated Delay:</b> +${delayMinutes} mins

🗺️ <a href="${mapLink}">👉 Open Exact GPS Pin in Google Maps</a>

<i>Next update in 5 mins if congestion continues.</i>
— <b>Traffic Monitor West 🚦</b>`;

            await sendTelegramAlert(message);
            lastAlertSentAt = now;
          }
        }
      } else {
        redSince = null;
        lastAlertSentAt = null;
      }

      return { ...spot, currentSpeed, freeFlowSpeed: freeFlow, delayMinutes, status, statusText, redSince, lastAlertSentAt, isAlert };
    }
  } catch (err) {
    console.error(`Error checking ${spot.name}:`, err.message);
  }
  return null;
}

// 🔄 24/7 Monitoring Loop
async function monitorAll() {
  // 🌙 NIGHT MODE: 12 AM – 8 AM IST (0 calls to save quota)
  const istHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));

  if (istHour >= 0 && istHour < 8) {
    if (!isNightMode) {
      console.log(`🌙 Night Mode active (12 AM - 8 AM) — Pausing scans.`);
      isNightMode = true;
      liveTrafficData = liveTrafficData.map(s => ({ ...s, status: 'gray', statusText: '🌙 NIGHT MODE' }));
    }
    lastCheckTime = "🌙 Night Mode (Resumes 8:00 AM IST)";
    return;
  }

  if (isNightMode) {
    console.log(`☀️ Resuming daytime tracking...`);
    isNightMode = false;
  }

  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST] 🔍 Scanning 20 West spots...`);

  for (let i = 0; i < spots.length; i++) {
    const result = await checkSpotTraffic(spots[i]);
    if (result) {
      const idx = liveTrafficData.findIndex(s => s.id === spots[i].id);
      if (idx !== -1) liveTrafficData[idx] = result;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  lastCheckTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + " IST";
}

// ⏰ Scan every 3 minutes
function scheduleNextCheck() {
  setTimeout(async () => {
    await monitorAll();
    scheduleNextCheck();
  }, 3 * 60 * 1000);
}

// 🌐 API Route
app.get('/api/traffic', (req, res) => {
  res.json({ updatedAt: lastCheckTime, nightMode: isNightMode, locations: liveTrafficData });
});

// 🌐 Web Dashboard UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Traffic Monitor West 🚦</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}
    body{background:#0f172a;color:#f8fafc;padding:15px}
    header{text-align:center;margin-bottom:15px}
    h1{font-size:24px;color:#38bdf8;font-weight:800}
    .subtitle{color:#94a3b8;font-size:13px;margin-top:3px}
    .bar{max-width:1100px;margin:0 auto 15px;background:#1e293b;padding:10px 15px;border-radius:8px;display:flex;justify-content:space-between;font-size:13px;align-items:center}
    .pulse{width:10px;height:10px;background:#22c55e;border-radius:50%;display:inline-block;margin-right:6px;animation:blink 1.5s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;max-width:1100px;margin:0 auto}
    .card{background:#1e293b;border-radius:8px;padding:14px;border-left:5px solid #64748b}
    .card.green{border-left-color:#22c55e}
    .card.yellow{border-left-color:#eab308}
    .card.red{border-left-color:#ef4444;background:#291418}
    .card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .tag{font-size:10px;font-weight:bold;padding:3px 6px;border-radius:4px}
    .tag.red{background:#7f1d1d;color:#fca5a5}
    .tag.green{background:#14532d;color:#86efac}
    .tag.yellow{background:#713f12;color:#fde047}
    .tag.gray{background:#334155;color:#94a3b8}
    .metrics{display:flex;justify-content:space-between;background:#0f172a;padding:8px;border-radius:6px;margin:10px 0;font-size:12px}
    .map-btn{display:block;text-align:center;background:#0f172a;color:#38bdf8;padding:8px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:bold;border:1px solid #334155;transition:0.2s}
    .map-btn:hover{background:#38bdf8;color:#0f172a}
  </style>
</head>
<body>
  <header>
    <h1>🚦 Traffic Monitor West</h1>
    <p class="subtitle">20 Pinpoint Locations • 3-Min Scan • Telegram Alert Dispatch</p>
  </header>
  <div class="bar">
    <div><span class="pulse"></span> <strong id="mode">SYSTEM ACTIVE 24/7</strong></div>
    <span id="time" style="color:#94a3b8">Loading...</span>
  </div>
  <div class="grid" id="grid"></div>
  <script>
    async function update(){
      try{
        const r=await fetch('/api/traffic');
        const d=await r.json();
        document.getElementById('time').innerText="Last scan: "+(d.updatedAt||'Now');
        document.getElementById('mode').innerText=d.nightMode?"🌙 NIGHT MODE (12AM-8AM)":"☀️ LIVE — SCANNING EVERY 3 MINS";
        const g=document.getElementById('grid');g.innerHTML='';
        d.locations.forEach(s=>{
          const c=document.createElement('div');c.className='card '+s.status;
          c.innerHTML=\`
            <div class="card-top"><h4 style="font-size:14px">📍 \${s.name}</h4><span class="tag \${s.status}">\${s.statusText}</span></div>
            <div class="metrics">
              <div>Speed: <strong>\${s.currentSpeed} km/h</strong></div>
              <div>Normal: <strong>\${s.freeFlowSpeed} km/h</strong></div>
              <div>Delay: <strong>\${s.delayMinutes>0?'+'+s.delayMinutes+' min':'None'}</strong></div>
            </div>
            <a href="https://www.google.com/maps?q=\${s.lat},\${s.lng}&z=19" target="_blank" class="map-btn">📍 Open Pin-Point GPS in Maps ↗</a>\`;
          g.appendChild(c);
        });
      }catch(e){}
    }
    update();setInterval(update,10000);
  </script>
</body>
</html>`);
});

app.listen(PORT, async () => {
  console.log('🚀 Traffic Monitor West running on port ' + PORT);
  monitorAll().then(() => scheduleNextCheck());
});
