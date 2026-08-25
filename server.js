const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());
const PORT = process.env.PORT || 3000;

// 🔑 API KEYS (From Render Environment Variables)
const OLA_API_KEY = process.env.OLA_API_KEY || "YOUR_OLA_API_KEY_HERE";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

// 📍 21 EXACT DOMBIVLI WEST LOCATIONS
const spots = [
  { id: 1,  name: "East-West Flyover (Centre)",          lat: 19.216683, lng: 73.084526 },
  { id: 2,  name: "Kopar Road (West)",                   lat: 19.215344, lng: 73.081659 },
  { id: 3,  name: "Retibandar Road (West)",              lat: 19.224981, lng: 73.075574 },
  { id: 4,  name: "Retibandar Cross Road (West)",        lat: 19.226838, lng: 73.077923 },
  { id: 5,  name: "Pandit Deendayal Upadhyay Marg (W)",  lat: 19.219529, lng: 73.084562 },
  { id: 6,  name: "Mumbra Devi Road (West)",             lat: 19.220317, lng: 73.081626 },
  { id: 7,  name: "Elephant Fountain Circle (West)",     lat: 19.222038, lng: 73.081989 },
  { id: 8,  name: "Ghanshyam Gupte Road (West)",         lat: 19.222099, lng: 73.085016 },
  { id: 9,  name: "Nana Shankar Seth Road (West)",       lat: 19.222227, lng: 73.082514 },
  { id: 10, name: "Ganesh Chowk (West)",                 lat: 19.222871, lng: 73.086402 },
  { id: 11, name: "Mahatma Phule Road (West)",           lat: 19.227108, lng: 73.085180 },
  { id: 12, name: "Subhash Chandra Bose Road (West)",    lat: 19.222964, lng: 73.086905 },
  { id: 13, name: "Mahatma Gandhi Road (West)",          lat: 19.218919, lng: 73.086973 },
  { id: 14, name: "Gokhale Road (West)",                 lat: 19.221321, lng: 73.089710 },
  { id: 15, name: "Thakurli Flyover (West)",             lat: 19.222784, lng: 73.093368 },
  { id: 16, name: "East to West Thakurli Bridge (W)",    lat: 19.223746, lng: 73.093092 },
  { id: 17, name: "Everest Gali (West)",                 lat: 19.219247, lng: 73.086153 },
  { id: 18, name: "Ghanshyam Gupte Cross Rd No.1 (W)",   lat: 19.219564, lng: 73.085172 },
  { id: 19, name: "Thakurwadi Road (West)",              lat: 19.221747, lng: 73.079805 },
  { id: 20, name: "Swami Vivekanand Lane (West)",        lat: 19.219120, lng: 73.082727 },
  { id: 21, name: "Devi Chowk (West)",                   lat: 19.219245, lng: 73.082462 }
];

let liveTrafficData = spots.map(s => ({
  ...s,
  currentSpeed: 25,
  freeFlowSpeed: 30,
  delayMinutes: 0,
  status: 'green',
  statusText: '🟢 CLEAR',
  redSince: null,
  firstAlertSent: false,
  lastAlertSentAt: null,
  isAlert: false
}));

let lastCheckTime = null;
let isNightMode = false;

// 📲 Send Instant Alert to Telegram
async function sendTelegramAlert(htmlMessage) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
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

// 🚦 Check Spot Traffic via Ola Krutrim Engine
async function checkSpotTraffic(spot) {
  const destLat = (spot.lat + 0.0012).toFixed(6);
  const destLng = (spot.lng + 0.0012).toFixed(6);

  const url = `https://api.olamaps.io/routing/v1/directions?origin=${spot.lat},${spot.lng}&destination=${destLat},${destLng}&mode=driving&api_key=${OLA_API_KEY}`;

  try {
    const res = await fetch(url, {
      headers: { 'X-Request-Id': 'dombivli-west-' + Date.now() }
    });

    if (!res.ok) {
      console.error(`⚠️ Ola API Error [${res.status}] for ${spot.name}`);
      return null;
    }

    const data = await res.json();

    if (data && data.routes && data.routes.length > 0) {
      const leg = data.routes[0].legs ? data.routes[0].legs[0] : {};

      // Handle both number and object formats safely
      let distanceMeters = 300;
      if (typeof leg.distance === 'number') distanceMeters = leg.distance;
      else if (leg.distance && typeof leg.distance.value === 'number') distanceMeters = leg.distance.value;

      let durationSeconds = 35;
      if (typeof leg.duration === 'number') durationSeconds = leg.duration;
      else if (leg.duration && typeof leg.duration.value === 'number') durationSeconds = leg.duration.value;

      // Safe speed calculation in km/h
      const speedKmph = Math.max(3, Math.min(60, Math.round((distanceMeters / 1000) / (durationSeconds / 3600)))) || 25;
      const normalSpeed = 30;
      const normalDuration = Math.round((distanceMeters / 1000) / (normalSpeed / 3600)) || 30;
      const delaySeconds = Math.max(0, durationSeconds - normalDuration);
      const delayMinutes = Math.round(delaySeconds / 60);

      let status = 'green';
      let statusText = '🟢 CLEAR';

      if (speedKmph <= 8 || delayMinutes >= 2) {
        status = 'red';
        statusText = '🚨 JAMMED';
      } else if (speedKmph <= 18 || delayMinutes >= 1) {
        status = 'yellow';
        statusText = '⚠️ SLOW';
      }

      const existing = liveTrafficData.find(s => s.id === spot.id);
      let redSince = existing ? existing.redSince : null;
      let firstAlertSent = existing ? existing.firstAlertSent : false;
      let lastAlertSentAt = existing ? existing.lastAlertSentAt : null;
      let isAlert = false;

      const mapLink = `https://www.google.com/maps?q=${spot.lat},${spot.lng}`;

      if (status === 'red') {
        const now = Date.now();
        if (!redSince) redSince = now;

        const totalSecondsStuck = Math.floor((now - redSince) / 1000);
        const minsStuck = Math.floor(totalSecondsStuck / 60);

        // 🚨 1. INITIAL ALERT AT 2 MINUTES
        if (totalSecondsStuck >= 120 && !firstAlertSent) {
          isAlert = true;
          firstAlertSent = true;
          lastAlertSentAt = now;

          const initialMsg = 
`🚨 <b>TRAFFIC MONITOR WEST — DISPATCH ALERT</b> 🚨

📍 <b>Spot:</b> #${spot.id}. ${spot.name}
⏱️ <b>Status:</b> STATIONARY for <b>2+ minutes!</b>
🚗 <b>Current Flow:</b> ${speedKmph} km/h (Normal: ${normalSpeed} km/h)
⏳ <b>Estimated Delay:</b> +${delayMinutes} mins
📡 <b>Engine:</b> Ola Krutrim Maps India

🗺️ <a href="${mapLink}">👉 Open Pin-Point GPS in Google Maps</a>

<i>Next status update in 5 minutes if congestion continues.</i>
— <b>Traffic Monitor West 🚦</b>`;

          await sendTelegramAlert(initialMsg);
        }
        // 🔄 2. RECURRING UPDATE EVERY 5 MINUTES
        else if (firstAlertSent) {
          isAlert = true;
          const minsSinceLastAlert = Math.floor((now - lastAlertSentAt) / 60000);

          if (minsSinceLastAlert >= 5) {
            lastAlertSentAt = now;

            const updateMsg = 
`🔄 <b>TRAFFIC MONITOR WEST — 5-MIN UPDATE</b> 🔄

📍 <b>Spot:</b> #${spot.id}. ${spot.name}
⏱️ <b>Jam Duration:</b> Ongoing for <b>${minsStuck} minutes!</b>
🚗 <b>Current Flow:</b> ${speedKmph} km/h (Normal: ${normalSpeed} km/h)
⏳ <b>Delay:</b> +${delayMinutes} mins

🗺️ <a href="${mapLink}">👉 Open Pin-Point GPS in Google Maps</a>

<i>Monitoring continuously...</i>
— <b>Traffic Monitor West 🚦</b>`;

            await sendTelegramAlert(updateMsg);
          }
        }
      } else {
        // ✅ 3. TRAFFIC CLEARED
        if (firstAlertSent) {
          const clearedMsg = 
`✅ <b>TRAFFIC CLEARED — TRAFFIC MONITOR WEST</b> ✅

📍 <b>Spot:</b> #${spot.id}. ${spot.name}
🟢 <b>Status:</b> Traffic is now moving freely!
🚗 <b>Speed Restored:</b> ${speedKmph} km/h

— <b>Traffic Monitor West 🚦</b>`;

          await sendTelegramAlert(clearedMsg);
        }

        redSince = null;
        firstAlertSent = false;
        lastAlertSentAt = null;
      }

      return {
        ...spot,
        currentSpeed: speedKmph,
        freeFlowSpeed: normalSpeed,
        delayMinutes,
        status,
        statusText,
        redSince,
        firstAlertSent,
        lastAlertSentAt,
        isAlert
      };
    }
  } catch (err) {
    console.error(`Error checking spot ${spot.name}:`, err.message);
  }
  return null;
}

// 🔄 1-Minute Live Monitoring Loop
async function monitorAll() {
  const istHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));

  // 🌙 Night Mode 11 PM - 8 AM IST
  if (istHour >= 23 || istHour < 8) {
    if (!isNightMode) {
      console.log(`🌙 Night Mode active (11 PM - 8 AM) — Pausing scans.`);
      isNightMode = true;
      liveTrafficData = liveTrafficData.map(s => ({ ...s, status: 'gray', statusText: '🌙 NIGHT MODE', redSince: null }));
    }
    lastCheckTime = "🌙 Night Mode (Resumes 8:00 AM IST)";
    return;
  }

  if (isNightMode) {
    console.log(`☀️ Resuming 1-minute daytime tracking...`);
    isNightMode = false;
  }

  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST] 🔍 1-Min Scan running via Ola Krutrim Maps...`);

  for (let i = 0; i < spots.length; i++) {
    const result = await checkSpotTraffic(spots[i]);
    if (result) {
      const idx = liveTrafficData.findIndex(s => s.id === spots[i].id);
      if (idx !== -1) liveTrafficData[idx] = result;
    }
    await new Promise(r => setTimeout(r, 40));
  }
  lastCheckTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + " IST";
}

// ⏰ Schedule Every 1 Minute
function scheduleNextCheck() {
  setTimeout(async () => {
    await monitorAll();
    scheduleNextCheck();
  }, 60 * 1000);
}

// 🌐 API Route
app.get('/api/traffic', (req, res) => {
  res.json({
    updatedAt: lastCheckTime,
    nightMode: isNightMode,
    engine: "Ola Krutrim Maps India",
    locations: liveTrafficData
  });
});

// 🌐 Web Dashboard UI (Live Stopwatch on Jammed Cards)
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
    .bar{max-width:1100px;margin:0 auto 15px;background:#1e293b;padding:10px 15px;border-radius:8px;display:flex;justify-content:space-between;font-size:13px;align-items:center;flex-wrap:wrap;gap:10px}
    .pulse{width:10px;height:10px;background:#22c55e;border-radius:50%;display:inline-block;margin-right:6px;animation:blink 1.5s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
    .timer-box{display:flex;align-items:center;gap:6px;font-weight:bold;color:#38bdf8;background:#0f172a;padding:5px 12px;border-radius:6px;border:1px solid #334155}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;max-width:1100px;margin:0 auto}
    .card{background:#1e293b;border-radius:8px;padding:14px;border-left:5px solid #64748b;transition:all 0.3s}
    .card.green{border-left-color:#22c55e}
    .card.yellow{border-left-color:#eab308}
    .card.red{border-left-color:#ef4444;background:#261216;box-shadow:0 0 15px rgba(239,68,68,0.15)}
    .card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .tag{font-size:10px;font-weight:bold;padding:3px 6px;border-radius:4px}
    .tag.red{background:#7f1d1d;color:#fca5a5}
    .tag.green{background:#14532d;color:#86efac}
    .tag.yellow{background:#713f12;color:#fde047}
    .tag.gray{background:#334155;color:#94a3b8}
    
    .jam-timer{display:none;background:#7f1d1d;color:#fecaca;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-bottom:8px;text-align:center;animation:blink 1.5s infinite}
    .card.red .jam-timer{display:block}

    .metrics{display:flex;justify-content:space-between;background:#0f172a;padding:8px;border-radius:6px;margin:10px 0;font-size:12px}
    .coords{font-size:11px;color:#94a3b8;margin-bottom:8px;text-align:center;font-family:monospace}
    .map-btn{display:block;text-align:center;background:#0f172a;color:#38bdf8;padding:8px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:bold;border:1px solid #334155;transition:0.2s}
    .map-btn:hover{background:#38bdf8;color:#0f172a}
  </style>
</head>
<body>
  <header>
    <h1>🚦 Traffic Monitor West</h1>
    <p class="subtitle">21 Pinpoint Locations • 1-Min Live Scan • Telegram 2-Min Alert & 5-Min Updates</p>
  </header>
  <div class="bar">
    <div><span class="pulse"></span> <strong id="mode">SYSTEM ACTIVE 24/7</strong></div>
    <div class="timer-box">⏱️ Next Scan: <span id="countdown">01:00</span></div>
    <span id="time" style="color:#94a3b8">Loading...</span>
  </div>
  <div class="grid" id="grid"></div>
  
  <script>
    var timeLeft = 60;
    var timerRunning = false;
    var cachedData = [];

    setInterval(function() {
      if (!cachedData || cachedData.length === 0) return;
      var now = Date.now();
      cachedData.forEach(function(s) {
        if (s.status === 'red' && s.redSince) {
          var diffSec = Math.floor((now - s.redSince) / 1000);
          var m = Math.floor(diffSec / 60);
          var sc = diffSec % 60;
          var mStr = m < 10 ? '0' + m : m;
          var sStr = sc < 10 ? '0' + sc : sc;
          var el = document.getElementById('jam-stopwatch-' + s.id);
          if (el) el.innerText = '🚨 JAMMED FOR: ' + mStr + ':' + sStr;
        }
      });
    }, 1000);

    function runCountdown() {
      if (timerRunning) return;
      timerRunning = true;
      setInterval(function() {
        if (timeLeft <= 0) {
          timeLeft = 60;
          fetchData();
        } else {
          timeLeft--;
        }
        var m = Math.floor(timeLeft / 60);
        var s = timeLeft % 60;
        var mStr = m < 10 ? '0' + m : m;
        var sStr = s < 10 ? '0' + s : s;
        document.getElementById('countdown').innerText = mStr + ':' + sStr;
      }, 1000);
    }

    async function fetchData() {
      try {
        var res = await fetch('/api/traffic');
        var data = await res.json();
        cachedData = data.locations || [];
        document.getElementById('time').innerText = "Last scan: " + (data.updatedAt || 'Now');
        document.getElementById('mode').innerText = data.nightMode ? "🌙 NIGHT MODE (11PM-8AM)" : "☀️ LIVE — SCANNING EVERY 1 MIN";
        
        var grid = document.getElementById('grid');
        grid.innerHTML = '';
        
        cachedData.forEach(function(s) {
          var card = document.createElement('div');
          card.className = 'card ' + s.status;
          
          var diffSec = s.redSince ? Math.floor((Date.now() - s.redSince) / 1000) : 0;
          var m = Math.floor(diffSec / 60);
          var sc = diffSec % 60;
          var mStr = m < 10 ? '0' + m : m;
          var sStr = sc < 10 ? '0' + sc : sc;
          var initialJamText = s.status === 'red' ? ('🚨 JAMMED FOR: ' + mStr + ':' + sStr) : '';

          card.innerHTML = 
            '<div class="card-top">' +
              '<h4 style="font-size:14px">📍 #' + s.id + '. ' + s.name + '</h4>' +
              '<span class="tag ' + s.status + '">' + s.statusText + '</span>' +
            '</div>' +
            '<div class="jam-timer" id="jam-stopwatch-' + s.id + '">' + initialJamText + '</div>' +
            '<div class="metrics">' +
              '<div>Speed: <strong>' + s.currentSpeed + ' km/h</strong></div>' +
              '<div>Normal: <strong>' + s.freeFlowSpeed + ' km/h</strong></div>' +
              '<div>Delay: <strong>' + (s.delayMinutes > 0 ? '+' + s.delayMinutes + ' min' : 'None') + '</strong></div>' +
            '</div>' +
            '<div class="coords">GPS: ' + s.lat + ', ' + s.lng + '</div>' +
            '<a href="https://www.google.com/maps?q=' + s.lat + ',' + s.lng + '" target="_blank" class="map-btn">📍 Open Pin-Point GPS in Maps ↗</a>';
          grid.appendChild(card);
        });
      } catch(e) {
        console.error(e);
      }
    }

    fetchData();
    runCountdown();
  </script>
</body>
</html>`);
});

app.listen(PORT, async () => {
  console.log('🚀 Traffic Monitor West (Ola Krutrim Engine) running on port ' + PORT);
  monitorAll().then(() => scheduleNextCheck());
});
