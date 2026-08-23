const express = require('express');
const fetch = require('node-fetch');
const app = express();

const PORT = process.env.PORT || 3000;

// 🔑 YOUR TOMTOM API KEY (Configured via Render environment variable or fallback)
const TOMTOM_KEY = process.env.TOMTOM_KEY || "YOUR_TOMTOM_KEY_HERE";

// 📍 15 Dombivli Locations
const spots = [
  { id: 1, name: "Kopar Flyover / Bridge", zone: "Dombivli West / East Link", lat: 19.2210, lng: 73.0875, map: "Kopar+Flyover+Dombivli" },
  { id: 2, name: "Thakurli ROB / Bridge", zone: "Thakurli - Dombivli Link", lat: 19.2220, lng: 73.0945, map: "Thakurli+Railway+Overbridge+Dombivli" },
  { id: 3, name: "Datta Chowk", zone: "Dombivli East", lat: 19.2170, lng: 73.0922, map: "Datta+Chowk+Dombivli+East" },
  { id: 4, name: "Mankoli - Motagaon Bridge", zone: "Dombivli West (Bhiwandi Link)", lat: 19.2290, lng: 73.0780, map: "Mankoli+Bridge+Motagaon+Dombivli" },
  { id: 5, name: "Mota Gaon Road", zone: "Dombivli West", lat: 19.2200, lng: 73.0962, map: "Motagaon+Road+Dombivli+West" },
  { id: 6, name: "Akshay Hospital (Ramnagar)", zone: "Dombivli East", lat: 19.2160, lng: 73.0912, map: "Akshay+Hospital+Ram+Nagar+Dombivli+East" },
  { id: 7, name: "Sant Namdev Path", zone: "Dombivli East", lat: 19.2150, lng: 73.0892, map: "Namdeo+Path+Dombivli+East" },
  { id: 8, name: "Ice Factory (Baraf Karkhana)", zone: "Dombivli East", lat: 19.2140, lng: 73.0952, map: "Ice+Factory+Dombivli+East" },
  { id: 9, name: "Girnar / Phadke Road", zone: "Dombivli East (Station Rd)", lat: 19.2130, lng: 73.0902, map: "Girnar+Mithai+Phadke+Road+Dombivli+East" },
  { id: 10, name: "Biryani Corner", zone: "Dombivli East", lat: 19.2155, lng: 73.0932, map: "Biryani+Corner+Dombivli" },
  { id: 11, name: "Kelkar Road", zone: "Dombivli East", lat: 19.2145, lng: 73.0882, map: "Kelkar+Road+Dombivli+East" },
  { id: 12, name: "Deendayal Road (West)", zone: "Dombivli West", lat: 19.2165, lng: 73.0862, map: "Deendayal+Road+Dombivli+West" },
  { id: 13, name: "Mahatma Gandhi Road (West)", zone: "Dombivli West", lat: 19.2175, lng: 73.0852, map: "Mahatma+Gandhi+Road+Dombivli+West" },
  { id: 14, name: "Kolhapur Chowk", zone: "Dombivli West", lat: 19.2190, lng: 73.0912, map: "Kolhapur+Chowk+Dombivli+West" },
  { id: 15, name: "Indira Chowk (East)", zone: "Dombivli East", lat: 19.2160, lng: 73.1002, map: "Indira+Chowk+Dombivli+East" }
];

// In-Memory state for live traffic data & alert tracking
let liveTrafficData = spots.map(s => ({
  ...s,
  currentSpeed: 0,
  freeFlowSpeed: 0,
  delayMinutes: 0,
  status: 'gray',
  statusText: 'INITIALIZING',
  redSince: null,
  isAlert: false
}));

let lastCheckTime = null;

// 🚦 Check traffic for one spot
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

      if (currentSpeed < (freeFlow * 0.4) || delayMinutes >= 5) {
        status = 'red';
        statusText = '🚨 JAMMED';
      } else if (currentSpeed < (freeFlow * 0.75) || delayMinutes >= 2) {
        status = 'yellow';
        statusText = '⚠️ SLOW';
      }

      // Check alert conditions (>10 mins stopped)
      const existing = liveTrafficData.find(s => s.id === spot.id);
      let redSince = existing ? existing.redSince : null;
      let isAlert = false;

      if (status === 'red') {
        if (!redSince) redSince = Date.now();
        const minsStuck = Math.floor((Date.now() - redSince) / 60000);
        if (minsStuck >= 10) {
          isAlert = true;
          console.log(`🚨 ALERT: ${spot.name} stuck for ${minsStuck} mins!`);
        }
      } else {
        redSince = null;
      }

      return {
        ...spot,
        currentSpeed,
        freeFlowSpeed: freeFlow,
        delayMinutes,
        status,
        statusText,
        redSince,
        isAlert
      };
    }
  } catch (err) {
    console.error(`Error checking ${spot.name}:`, err.message);
  }
  return null;
}

// 🔄 Background 24/7 Monitoring Loop
async function monitorAll() {
  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST] 🔍 Checking Dombivli traffic...`);
  for (let i = 0; i < spots.length; i++) {
    const result = await checkSpotTraffic(spots[i]);
    if (result) {
      const idx = liveTrafficData.findIndex(s => s.id === spots[i].id);
      if (idx !== -1) liveTrafficData[idx] = result;
    }
    // Small delay between calls to be gentle on API
    await new Promise(r => setTimeout(r, 200));
  }
  lastCheckTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + " IST";
}

// ⏰ Smart Scheduler: Adjusts frequency based on Dombivli peak hours to stay under 2,500 daily free limit
function scheduleNextCheck() {
  const istHour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const hour = parseInt(istHour);

  // Peak hours (8am-11am & 5pm-9pm IST) -> Every 4 mins
  // Normal daytime -> Every 8 mins
  // Night time (11pm-6am IST) -> Every 20 mins
  let intervalMinutes = 8;
  if ((hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21)) {
    intervalMinutes = 4;
  } else if (hour >= 23 || hour < 6) {
    intervalMinutes = 20;
  }

  setTimeout(async () => {
    await monitorAll();
    scheduleNextCheck();
  }, intervalMinutes * 60 * 1000);
}

// Start first check immediately on server launch
monitorAll().then(() => scheduleNextCheck());

// 🌐 Serve JSON API
app.get('/api/traffic', (req, res) => {
  res.json({
    updatedAt: lastCheckTime,
    locations: liveTrafficData
  });
});

// 🌐 Serve the Dashboard UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dombivli Live Traffic 24/7 🚦</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI', sans-serif; }
    body { background:#0f172a; color:#f8fafc; padding:15px; }
    header { text-align:center; margin-bottom:15px; }
    h1 { font-size:22px; color:#38bdf8; }
    .status-bar { max-width:1000px; margin:0 auto 15px; background:#1e293b; padding:10px 15px; border-radius:8px; display:flex; justify-content:space-between; font-size:13px; align-items:center; }
    .pulse { width:10px; height:10px; background:#22c55e; border-radius:50%; display:inline-block; margin-right:6px; animation:blink 1.5s infinite; }
    @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; max-width:1000px; margin:0 auto; }
    .card { background:#1e293b; border-radius:8px; padding:14px; border-left:5px solid #64748b; }
    .card.green { border-left-color:#22c55e; }
    .card.yellow { border-left-color:#eab308; }
    .card.red { border-left-color:#ef4444; background:#291418; }
    .card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    .tag { font-size:10px; font-weight:bold; padding:3px 6px; border-radius:4px; }
    .tag.red { background:#7f1d1d; color:#fca5a5; }
    .tag.green { background:#14532d; color:#86efac; }
    .tag.yellow { background:#713f12; color:#fde047; }
    .metrics { display:flex; justify-content:space-between; background:#0f172a; padding:8px; border-radius:6px; margin:10px 0; font-size:12px; }
    .map-btn { display:block; text-align:center; background:#0f172a; color:#38bdf8; padding:6px; border-radius:5px; text-decoration:none; font-size:12px; font-weight:bold; border:1px solid #334155; }
    .map-btn:hover { background:#38bdf8; color:#0f172a; }
  </style>
</head>
<body>
  <header>
    <h1>🚦 Dombivli Live Traffic Monitor</h1>
    <p style="color:#94a3b8; font-size:13px;">24/7 Automated Cloud Monitoring</p>
  </header>
  <div class="status-bar">
    <div><span class="pulse"></span> <strong>SYSTEM ACTIVE 24/7</strong></div>
    <span id="time" style="color:#94a3b8;">Loading...</span>
  </div>
  <div class="grid" id="grid"></div>
  <script>
    async function updateUI() {
      try {
        const res = await fetch('/api/traffic');
        const data = await res.json();
        document.getElementById('time').innerText = "Last checked: " + (data.updatedAt || 'Just now');
        const grid = document.getElementById('grid');
        grid.innerHTML = '';
        data.locations.forEach(s => {
          const card = document.createElement('div');
          card.className = 'card ' + s.status;
          card.innerHTML = \`
            <div class="card-top">
              <h4 style="font-size:15px;">📍 \${s.name}</h4>
              <span class="tag \${s.status}">\${s.statusText}</span>
            </div>
            <p style="font-size:11px; color:#94a3b8;">\${s.zone}</p>
            <div class="metrics">
              <div>Speed: <strong>\${s.currentSpeed} km/h</strong></div>
              <div>Normal: <strong>\${s.freeFlowSpeed} km/h</strong></div>
              <div>Delay: <strong>\${s.delayMinutes > 0 ? '+' + s.delayMinutes + ' min' : 'None'}</strong></div>
            </div>
            <a href="https://www.google.com/maps/search/?api=1&query=\${s.map}" target="_blank" class="map-btn">
              🗺️ Open in Google Maps ↗
            </a>
          \`;
          grid.appendChild(card);
        });
      } catch(e){}
    }
    updateUI();
    setInterval(updateUI, 15000);
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});