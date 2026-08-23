const express = require('express');
const fetch = require('node-fetch');
const twilio = require('twilio');
const app = express();

app.use(express.json());
const PORT = process.env.PORT || 3000;

// 🔑 KEYS (Set in Render Environment Variables)
const TOMTOM_KEY = process.env.TOMTOM_KEY || "YOUR_TOMTOM_KEY_HERE";
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
  twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
  console.log("✅ Twilio WhatsApp connected!");
}

let subscribers = new Set();

// 📍 20 DOMBIVLI WEST PINPOINT LOCATIONS
const spots = [
  { id: 1,  name: "East-West Flyover (Centre)",          lat: 19.2188, lng: 73.0915, map: "East+West+Flyover+Dombivli+Station" },
  { id: 2,  name: "Kopar Road (West)",                   lat: 19.2205, lng: 73.0872, map: "Kopar+Road+Dombivli+West" },
  { id: 3,  name: "Retibandar Road (West)",              lat: 19.2135, lng: 73.0815, map: "Retibandar+Road+Dombivli+West" },
  { id: 4,  name: "Retibandar Cross Road (West)",        lat: 19.2142, lng: 73.0825, map: "Retibandar+Cross+Road+Dombivli+West" },
  { id: 5,  name: "Pandit Deendayal Upadhyay Marg (W)",  lat: 19.2168, lng: 73.0848, map: "Deendayal+Upadhyay+Marg+Dombivli+West" },
  { id: 6,  name: "Mumbra Devi Road (West)",             lat: 19.2125, lng: 73.0805, map: "Mumbra+Devi+Road+Dombivli+West" },
  { id: 7,  name: "Elephant Fountain Circle (West)",     lat: 19.2172, lng: 73.0855, map: "Elephant+Fountain+Circle+Dombivli+West" },
  { id: 8,  name: "Ghanshyam Gupte Road (West)",         lat: 19.2160, lng: 73.0842, map: "Ghanshyam+Gupte+Road+Dombivli+West" },
  { id: 9,  name: "Nana Shankar Seth Road (West)",       lat: 19.2148, lng: 73.0830, map: "Nana+Shankar+Seth+Road+Dombivli+West" },
  { id: 10, name: "Ganesh Chowk (West)",                 lat: 19.2178, lng: 73.0862, map: "Ganesh+Chowk+Dombivli+West" },
  { id: 11, name: "Mahatma Phule Road (West)",           lat: 19.2138, lng: 73.0818, map: "Mahatma+Phule+Road+Dombivli+West" },
  { id: 12, name: "Subhash Chandra Bose Road (West)",    lat: 19.2155, lng: 73.0838, map: "Subhash+Chandra+Bose+Road+Dombivli+West" },
  { id: 13, name: "Mahatma Gandhi Road (West)",          lat: 19.2175, lng: 73.0852, map: "Mahatma+Gandhi+Road+Dombivli+West" },
  { id: 14, name: "Gokhale Road (West)",                 lat: 19.2152, lng: 73.0835, map: "Gokhale+Road+Dombivli+West" },
  { id: 15, name: "Thakurli Flyover (West)",             lat: 19.2218, lng: 73.0930, map: "Thakurli+Flyover+Dombivli+West" },
  { id: 16, name: "East to West Thakurli Bridge (W)",    lat: 19.2212, lng: 73.0938, map: "Thakurli+Bridge+Dombivli+West" },
  { id: 17, name: "Everest Gali (West)",                 lat: 19.2168, lng: 73.0858, map: "Everest+Gali+Dombivli+West" },
  { id: 18, name: "Ghanshyam Gupte Cross Rd No.1 (W)",   lat: 19.2158, lng: 73.0840, map: "Ghanshyam+Gupte+Cross+Road+Dombivli+West" },
  { id: 19, name: "Thakurwadi Road (West)",              lat: 19.2185, lng: 73.0868, map: "Thakurwadi+Road+Dombivli+West" },
  { id: 20, name: "Deva Chowk (West)",                   lat: 19.2182, lng: 73.0872, map: "Deva+Chowk+Dombivli+West" }
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

// 📲 WhatsApp Broadcast
async function broadcastWhatsApp(message) {
  if (!twilioClient || subscribers.size === 0) return;
  for (const phone of subscribers) {
    try {
      await twilioClient.messages.create({
        body: message,
        from: TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${phone}`
      });
      console.log(`📱 WhatsApp sent to ${phone}`);
    } catch (err) {
      console.error(`❌ WhatsApp failed for ${phone}:`, err.message);
    }
  }
}

// 🚦 Check One Spot
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
      const mapLink = `https://www.google.com/maps?q=${spot.lat},${spot.lng}&z=18`;

      if (status === 'red') {
        if (!redSince) redSince = Date.now();
        const minsStuck = Math.floor((Date.now() - redSince) / 60000);

        // ⚡ 5-MINUTE THRESHOLD for WhatsApp alert
        if (minsStuck >= 5) {
          isAlert = true;
          const now = Date.now();
          const minsSinceLastAlert = lastAlertSentAt ? Math.floor((now - lastAlertSentAt) / 60000) : 999;

          // Send first alert + repeat every 5 mins
          if (minsSinceLastAlert >= 5) {
            const message =
`🚔 *DOMBIVLI WEST — TRAFFIC ALERT* 🚔

📍 *Spot:* ${spot.name}
⏱️ *Status:* STATIONARY for ${minsStuck}+ mins
🚗 *Speed:* ${currentSpeed} km/h (Normal: ${freeFlow} km/h)
⏳ *Delay:* +${delayMinutes} mins

🗺️ *Pin-Point GPS Location:*
${mapLink}

_Next update in 5 mins if jam continues._
— Dombivli West Traffic Monitor 🚦`;

            await broadcastWhatsApp(message);
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
    console.error(`Error: ${spot.name}:`, err.message);
  }
  return null;
}

// 🔄 Main Monitor Loop
async function monitorAll() {
  // 🌙 NIGHT MODE: 12 AM – 8 AM IST = Sleep (No API calls)
  const istHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));

  if (istHour >= 0 && istHour < 8) {
    if (!isNightMode) {
      console.log(`🌙 [${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST] Night Mode ON — Pausing API calls until 8:00 AM`);
      isNightMode = true;
      liveTrafficData = liveTrafficData.map(s => ({ ...s, status: 'gray', statusText: '🌙 NIGHT MODE' }));
    }
    lastCheckTime = "🌙 Night Mode (Resumes 8:00 AM IST)";
    return;
  }

  // ☀️ DAYTIME: Active monitoring
  if (isNightMode) {
    console.log(`☀️ [${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST] Morning! Resuming live tracking...`);
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

// ⏰ Scheduler: Every 3 minutes
function scheduleNextCheck() {
  setTimeout(async () => {
    await monitorAll();
    scheduleNextCheck();
  }, 3 * 60 * 1000); // 3 minutes = 180000 ms
}

monitorAll().then(() => scheduleNextCheck());

// 🌐 API
app.get('/api/traffic', (req, res) => {
  res.json({ updatedAt: lastCheckTime, subscribersCount: subscribers.size, nightMode: isNightMode, locations: liveTrafficData });
});

// 📲 WhatsApp Subscribe
app.post('/api/subscribe-whatsapp', async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  phone = phone.replace(/\D/g, '');
  if (phone.length === 10) phone = '+91' + phone;
  else if (!phone.startsWith('+')) phone = '+' + phone;
  subscribers.add(phone);

  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `✅ *Dombivli WEST Traffic Alerts: Active!*\n\nYou will receive WhatsApp alerts when any of the 20 West spots is jammed for 5+ mins.`,
        from: TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${phone}`
      });
    } catch (err) { console.error("Welcome msg error:", err.message); }
  }
  res.json({ success: true, message: `${phone} subscribed for West alerts!` });
});

// 🌐 Dashboard UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dombivli WEST Traffic Monitor 🚦</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}
    body{background:#0f172a;color:#f8fafc;padding:15px}
    header{text-align:center;margin-bottom:15px}
    h1{font-size:22px;color:#f59e0b}
    .wa-box{max-width:600px;margin:0 auto 20px;background:linear-gradient(135deg,#064e3b,#1e293b);border:1px solid #10b981;border-radius:10px;padding:15px}
    .wa-box h3{color:#34d399;font-size:16px;margin-bottom:6px}
    .wa-box p{font-size:12px;color:#cbd5e1;margin-bottom:10px}
    .input-row{display:flex;gap:8px}
    .input-row input{flex:1;padding:9px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:white;font-size:14px}
    .btn-wa{background:#25d366;color:#0f172a;font-weight:bold;border:none;padding:9px 15px;border-radius:6px;cursor:pointer}
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
    .map-btn{display:block;text-align:center;background:#0f172a;color:#38bdf8;padding:6px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:bold;border:1px solid #334155}
    .map-btn:hover{background:#38bdf8;color:#0f172a}
  </style>
</head>
<body>
  <header>
    <h1>🚦 Dombivli WEST — Live Traffic Monitor</h1>
    <p style="color:#94a3b8;font-size:13px">20 Pinpoint Locations • 3-Min Scan • 5-Min WhatsApp Alerts</p>
  </header>
  <div class="wa-box">
    <h3>💬 WhatsApp Alerts (Dombivli West)</h3>
    <p>Get instant WhatsApp alert when any West spot is jammed for 5+ mins with pin-point GPS link.</p>
    <div class="input-row">
      <input type="tel" id="ph" placeholder="10-digit mobile number" />
      <button class="btn-wa" onclick="sub()">Subscribe</button>
    </div>
    <div id="msg" style="font-size:12px;margin-top:6px;color:#34d399"></div>
  </div>
  <div class="bar">
    <div><span class="pulse"></span> <strong id="mode">SYSTEM ACTIVE 24/7</strong> (<span id="subs">0</span> subscribers)</div>
    <span id="time" style="color:#94a3b8">Loading...</span>
  </div>
  <div class="grid" id="grid"></div>
  <script>
    async function sub(){
      const p=document.getElementById('ph').value.trim();
      if(p.length<10){alert('Enter valid number');return}
      const r=await fetch('/api/subscribe-whatsapp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:p})});
      const d=await r.json();
      document.getElementById('msg').innerText="✅ "+d.message;
    }
    async function update(){
      try{
        const r=await fetch('/api/traffic');
        const d=await r.json();
        document.getElementById('time').innerText="Last scan: "+(d.updatedAt||'Now');
        document.getElementById('subs').innerText=d.subscribersCount||0;
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
            <a href="https://www.google.com/maps?q=\${s.lat},\${s.lng}&z=18" target="_blank" class="map-btn">🗺️ Pin-Point on Map ↗</a>\`;
          g.appendChild(c);
        });
      }catch(e){}
    }
    update();setInterval(update,10000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('🚀 Dombivli WEST server running on port ' + PORT));
