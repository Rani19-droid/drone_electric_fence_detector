// hamburger overlay open/close
const hamburger = document.getElementById('hamburger');
const overlay = document.getElementById('overlayMenu');
const closeOverlay = document.getElementById('closeOverlay');
if (hamburger) {

hamburger?.addEventListener('click', () => {
  if (!overlay) {
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  }
});
if (closeOverlay) {
closeOverlay?.addEventListener('click', () => {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
});
}

// auto slide logic
(function initSlider(){
const slides = Array.from(document.querySelectorAll('.slide'));
let current = 0;
const slideInterval = 5000; // 5s

function showSlide(idx){
  slides.forEach((s, i) => {
    s.classList.toggle('active', i === idx);
  });
}
showSlide(0);
  setInterval(() => {
   current = (current + 1) % slides.length;
  showSlide(current);
  }, slideInterval);
})();

}
/* ---------- OPEN MAP FROM HOME (demo + real) ---------- */

/*
Usage:
- On home page: clicking the Map link/button should call openMap().
- openMap() will optionally set a demo location (for testing) into localStorage
  and then open dashboard.html.
- On dashboard.html the map init reads localStorage.drone_location (if present)
  OR will attempt to fetch from /api/drone/location (polling),
  OR connect to a WebSocket endpoint for live updates.
*/

// Call this from Home's Map link: document.getElementById('openMapBtn').onclick = openMap;
function openMap() {
  // DEMO: if you want to supply a manual test location before landing on dashboard:
  // You can prompt (optional) or set a default demo location:
  const demo = { lat: 28.7041, lng: 77.1025 }; // change to your test GPS
  try {
    localStorage.setItem('drone_location', JSON.stringify(demo));
  } catch (e) { console.warn('localStorage not available', e); }

  // Now navigate to dashboard where map JS will pick up this location
  window.location.href = 'dashboard.html';
}

/* ---------- DASHBOARD: READ DRONE LOCATION SOURCE ---------- */

/*
Priority order used by dashboard:
1) If localStorage.drone_location exists -> use that (demo/local test).
2) Else if WS_URL is configured -> connect via WebSocket (real-time).
3) Else try polling REST endpoint /api/drone/location every N seconds.
*/

// Put this inside your map initialization block (or replace the simulate() function to use this).
function attachDroneLocationUpdates(map, droneMarker) {
  // 1) Try localStorage (demo)
  try {
    const raw = localStorage.getItem('drone_location');
    if (raw) {
      const pos = JSON.parse(raw);
      if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
        const latlng = [pos.lat, pos.lng];
        droneMarker.setLatLng(latlng);
        map.setView(latlng, 16);
        console.log('Using demo location from localStorage:', pos);
        // also return early if you want to rely only on that
        // return;
      }
    }
  } catch (e) { console.warn('Could not read localStorage drone_location', e); }

  // 2) WebSocket (recommended for real-time). Configure WS_URL on server side.
  const WS_URL = 'ws://YOUR_SERVER_IP:PORT/drone-ws'; // <-- change this to your WS endpoint
  let ws;
  if (WS_URL && WS_URL.indexOf('YOUR_SERVER_IP') === -1) {
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => console.log('WS connected to', WS_URL);
      ws.onmessage = (evt) => {
        // server should send JSON like: { "lat": 28.7, "lng": 77.1, "voltage": 2300 }
        try {
          const data = JSON.parse(evt.data);
          if (data.lat && data.lng) {
            const latlng = [Number(data.lat), Number(data.lng)];
            droneMarker.setLatLng(latlng);
            map.setView(latlng);
            // optionally update UI elements:
            const voltageEl = document.getElementById('voltage');
            const statusEl = document.getElementById('status');
            if (voltageEl && typeof data.voltage !== 'undefined') voltageEl.textContent = `${data.voltage} V`;
            if (statusEl) statusEl.textContent = data.voltage > 0 ? 'Electric Fence Detected' : 'No Fence Detected';
          }
        } catch (err) { console.warn('Invalid WS message', err); }
      };
      ws.onerror = (err) => console.warn('WS error', err);
      ws.onclose = () => console.log('WS closed');
      // If WS connects, we prefer it; return so we don't enable polling
      return;
    } catch (e) {
      console.warn('WebSocket connection failed (will try polling):', e);
    }
  }

  // 3) Polling REST API fallback
  const POLL_URL = '/api/drone/location'; // server should return JSON: { lat: ..., lng: ..., voltage: ... }
  const POLL_INTERVAL = 3000; // ms

  async function fetchAndApply() {
    try {
      const resp = await fetch(POLL_URL, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Network response not ok ' + resp.status);
      const data = await resp.json();
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        const latlng = [data.lat, data.lng];
        droneMarker.setLatLng(latlng);
        map.setView(latlng);
        const voltageEl = document.getElementById('voltage');
        const statusEl = document.getElementById('status');
        if (voltageEl && typeof data.voltage !== 'undefined') voltageEl.textContent = `${data.voltage} V`;
        if (statusEl) statusEl.textContent = data.voltage > 0 ? 'Electric Fence Detected' : 'No Fence Detected';
      }
    } catch (err) {
      // console.warn('Polling failed', err);
    }
  }

  // start polling
  fetchAndApply();
  setInterval(fetchAndApply, POLL_INTERVAL);
}


/* ========== Dashboard: Map + Drone Simulation + Voltage ========== */
(function initMapAndTelemetry(){
  // only run if map container exists on the page
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // dynamic import check for Leaflet presence (we use CDN in HTML)
  if (typeof L === 'undefined') {
    console.warn('Leaflet not loaded. Include <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script> in HTML.');
    mapEl.innerHTML = '<p style="color:#fff">Map library not loaded.</p>';
    return;
  }

  // initialize map (default coordinates)
  const defaultLat = 28.7041;
  const defaultLng = 77.1025;
  const map = L.map('map').setView([defaultLat, defaultLng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // icons
  const droneIcon = L.icon({
    iconUrl: 'assets/drone-icon.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  const fenceIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/565/565548.png',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  // markers
  let lat = defaultLat, lng = defaultLng;
  const droneMarker = L.marker([lat, lng], {icon: droneIcon}).addTo(map).bindPopup('Drone Current Location');
  const fenceMarker = L.marker([defaultLat + 0.0025, defaultLng + 0.0035], {icon: fenceIcon}).addTo(map).bindPopup('Electric Fence (sample)');

  // telemetry display elements (if present)
  const voltageEl = document.getElementById('voltage');
  const statusEl  = document.getElementById('status');

  // simulate telemetry: drone movement + voltage reading
  function simulate() {
    lat += (Math.random() - 0.5) / 1000;
    lng += (Math.random() - 0.5) / 1000;
    droneMarker.setLatLng([lat, lng]);

    // voltage simulation: 0..5000 V
    const voltage = Math.floor(Math.random() * 5000);
    if (voltageEl) voltageEl.textContent = voltage + ' V';
    if (statusEl) statusEl.textContent = (voltage > 0 ? 'Electric Fence Detected' : 'No Fence Detected');

    // if voltage exceeds threshold, show popup and voice alert
    const threshold = 2000;
    if (voltage > threshold) {
      fenceMarker.setLatLng([lat + 0.0015, lng + 0.0015]);  // move sample fence nearby
      fenceMarker.openPopup();
      if ('speechSynthesis' in window) {
        const msg = new SpeechSynthesisUtterance('Alert! High voltage detected nearby.');
        window.speechSynthesis.speak(msg);
      }
    }
  }

  // run simulate every 4s
  simulate();
  setInterval(simulate, 4000);
})();

/* ========== Utilities: Test alert (used by buttons) ========== */
function triggerAlert() {
  if ('speechSynthesis' in window) {
    const msg = new SpeechSynthesisUtterance('Alert! Electric fence detected nearby!');
    window.speechSynthesis.speak(msg);
  } else {
    alert('Alert: Electric fence detected (voice not supported).');
  }
}

/* ========== Dashboard access guard (basic demo) ========== */
(function protectDashboard(){
  // if user opens dashboard.html without login (demo), allow but optionally redirect:
  // Uncomment below lines to force redirect to index.html when not logged in (demo)
  /*
  if (window.location.pathname.endsWith('dashboard.html')) {
    const role = localStorage.getItem('drone_role');
    if (!role) {
      // not logged in -> redirect to login
      window.location.href = 'index.html';
    }
  }
  */
})();
// start autoplay only if slides exist
if (slides.length > 0) {
  showSlide(0);
  setInterval(nextSlide, slideInterval);
}

// footer year
document.getElementById('year').textContent = new Date().getFullYear();
