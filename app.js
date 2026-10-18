/* =============================================
   CONFIGURATION & DEFAULTS
   ============================================= */
const DEFAULT_CONFIG = {
  method: 99,                   // Custom calculation
  methodSettings: '20,null,18', // Kemenag RI standard: Subuh 20°, Isya 18°
  school: 1,                    // Shafi'i
};

const DEFAULT_LOCATION = {
  lat: -3.4414,
  lon: 114.8430,
  name: 'Landasan Ulin, Banjarbaru',
  isGps: false,
  timezone: 'Asia/Makassar',
  tzLabel: 'WITA',
};

const DEFAULT_IHTIYAT = {
  enabled: true,
  minutes: 2, // Standar Kemenag RI: +2 Menit
};

const PRAYERS = [
  { id: 'fajr',    apiKey: 'Fajr',    name: 'Subuh',   arabic: 'الفجر',  icon: '🌅', defaultOn: true,  defaultOffset: 30,  defaultDuration: 120, defaultIqomah: 20 },
  { id: 'dhuhr',   apiKey: 'Dhuhr',   name: 'Dzuhur',  arabic: 'الظهر',  icon: '☀️', defaultOn: true,  defaultOffset: 30,  defaultDuration: 120, defaultIqomah: 12 },
  { id: 'asr',     apiKey: 'Asr',     name: 'Ashar',   arabic: 'العصر',  icon: '🌤️', defaultOn: true,  defaultOffset: 30,  defaultDuration: 90,  defaultIqomah: 10 },
  { id: 'maghrib', apiKey: 'Maghrib', name: 'Maghrib', arabic: 'المغرب', icon: '🌇', defaultOn: false, defaultOffset: 15,  defaultDuration: 30,  defaultIqomah: 7  },
  { id: 'isha',    apiKey: 'Isha',    name: 'Isya',    arabic: 'العشاء', icon: '🌙', defaultOn: true,  defaultOffset: 30,  defaultDuration: 60,  defaultIqomah: 10 },
];

const STORAGE_KEY = 'jadwalHarian_settings_v4';
const LEGACY_STORAGE_V3 = 'jadwalHarian_settings_v3';
const LEGACY_STORAGE_V2 = 'jadwalHarian_settings_v2';

/* =============================================
   STATE
   ============================================= */
let state = {
  location: { ...DEFAULT_LOCATION },
  ihtiyat: { ...DEFAULT_IHTIYAT },
  prayerTimes: {},       // { fajr: '04:44', ... } -> adjusted with ihtiyat
  rawPrayerTimes: {},    // { fajr: '04:42', ... } -> pure astronomical
  hijriDate: null,
  gregorianDate: null,
  settings: {},          // { fajr: { enabled, offset, duration, iqomah, studyMode: 'minute' }, ... }
  sleepConfig: {
    sleepAfterIsha: 60,  // menit pasca Isya
    wakeBeforeFajr: 30,  // menit jelang Subuh
    globalTravel: 5,     // menit perjalanan ke masjid
    sleepInputMode: 'minute', // 'minute' | 'time'
    wakeInputMode: 'minute',  // 'minute' | 'time'
  },
  activeFilter: 'all',
  loaded: false,
};

/* =============================================
   INITIALIZATION
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
  fetchPrayerTimes();
  startClock();
});

function loadSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) {}

  if (!saved) {
    try { saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_V3)); } catch(e) {}
  }
  if (!saved) {
    try { saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_V2)); } catch(e) {}
  }

  // 1. Location Settings
  if (saved && saved.location) {
    state.location = {
      lat: saved.location.lat ?? DEFAULT_LOCATION.lat,
      lon: saved.location.lon ?? DEFAULT_LOCATION.lon,
      name: saved.location.name ?? DEFAULT_LOCATION.name,
      isGps: saved.location.isGps ?? false,
      timezone: saved.location.timezone ?? DEFAULT_LOCATION.timezone,
      tzLabel: saved.location.tzLabel ?? DEFAULT_LOCATION.tzLabel,
    };
  }

  // 2. Ihtiyat Settings
  if (saved && saved.ihtiyat) {
    state.ihtiyat = {
      enabled: saved.ihtiyat.enabled ?? DEFAULT_IHTIYAT.enabled,
      minutes: saved.ihtiyat.minutes ?? DEFAULT_IHTIYAT.minutes,
    };
  }

  // 3. Prayers Settings
  PRAYERS.forEach(p => {
    const prayerSaved = saved && saved.prayers ? saved.prayers[p.id] : (saved ? saved[p.id] : null);
    if (prayerSaved) {
      state.settings[p.id] = {
        enabled: prayerSaved.enabled ?? p.defaultOn,
        offset: prayerSaved.offset ?? p.defaultOffset,
        duration: prayerSaved.duration ?? p.defaultDuration,
        iqomah: prayerSaved.iqomah ?? p.defaultIqomah,
        studyMode: prayerSaved.studyMode ?? 'minute',
      };
    } else {
      state.settings[p.id] = {
        enabled: p.defaultOn,
        offset: p.defaultOffset,
        duration: p.defaultDuration,
        iqomah: p.defaultIqomah,
        studyMode: 'minute',
      };
    }
  });

  // 4. Sleep Settings
  if (saved && saved.sleep) {
    state.sleepConfig.sleepAfterIsha = saved.sleep.sleepAfterIsha ?? 60;
    state.sleepConfig.wakeBeforeFajr = saved.sleep.wakeBeforeFajr ?? 30;
    state.sleepConfig.globalTravel = saved.sleep.globalTravel ?? 5;
    state.sleepConfig.sleepInputMode = saved.sleep.sleepInputMode ?? 'minute';
    state.sleepConfig.wakeInputMode = saved.sleep.wakeInputMode ?? 'minute';
  }

  // Sync inputs
  const sleepMinInput = document.getElementById('sleepAfterIshaInput');
  const wakeMinInput = document.getElementById('wakeBeforeFajrInput');
  const travelInput = document.getElementById('globalTravelInput');
  const toggleIhtiyatInput = document.getElementById('toggleIhtiyat');

  if (sleepMinInput) sleepMinInput.value = state.sleepConfig.sleepAfterIsha;
  if (wakeMinInput) wakeMinInput.value = state.sleepConfig.wakeBeforeFajr;
  if (travelInput) travelInput.value = state.sleepConfig.globalTravel;
  if (toggleIhtiyatInput) toggleIhtiyatInput.checked = state.ihtiyat.enabled;

  updateLocationUI();
  updateIhtiyatUI();
  updateSleepModeUI();
  updateWakeModeUI();
}

function saveSettings() {
  const dataToSave = {
    location: state.location,
    ihtiyat: state.ihtiyat,
    prayers: state.settings,
    sleep: state.sleepConfig,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch(e) {}
}

/* =============================================
   EVENT LISTENERS & CONTROLS
   ============================================= */
function initEventListeners() {
  // 1. Drawer Toggle
  const btnToggle = document.getElementById('btnToggleSleepConfig');
  const btnText = document.getElementById('btnToggleSleepConfigText');
  const panel = document.getElementById('sleepConfigPanel');
  if (btnToggle && panel) {
    btnToggle.addEventListener('click', () => {
      panel.classList.toggle('is-hidden');
      if (btnText) {
        btnText.textContent = panel.classList.contains('is-hidden') ? 'Pengaturan Waktu' : 'Tutup Pengaturan';
      }
    });
  }

  // 2. Interactive Location Pill (top bar) - also opens drawer and prompts GPS
  const topLocationBtn = document.getElementById('topLocationBtn');
  if (topLocationBtn) {
    topLocationBtn.addEventListener('click', () => {
      if (panel && panel.classList.contains('is-hidden')) {
        panel.classList.remove('is-hidden');
        if (btnText) btnText.textContent = 'Tutup Pengaturan';
      }
      detectGpsLocation();
    });
  }

  // 3. GPS Buttons in Drawer
  const btnDetectGps = document.getElementById('btnDetectGps');
  if (btnDetectGps) {
    btnDetectGps.addEventListener('click', () => {
      detectGpsLocation();
    });
  }

  const btnResetLocation = document.getElementById('btnResetLocation');
  if (btnResetLocation) {
    btnResetLocation.addEventListener('click', () => {
      resetLocationToDefault();
    });
  }

  // 4. Ihtiyat Toggle
  const toggleIhtiyat = document.getElementById('toggleIhtiyat');
  if (toggleIhtiyat) {
    toggleIhtiyat.addEventListener('change', (e) => {
      setIhtiyat(e.target.checked);
    });
  }

  // 5. SMART INPUT 1: MULAI TIDUR
  const smartSleepBox = document.getElementById('smartSleepInputBox');
  if (smartSleepBox) {
    smartSleepBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-mode');
      if (!btn) return;
      state.sleepConfig.sleepInputMode = btn.dataset.mode;
      updateSleepModeUI();
      saveSettings();
    });
  }

  const sleepMinInput = document.getElementById('sleepAfterIshaInput');
  if (sleepMinInput) {
    sleepMinInput.addEventListener('input', (e) => {
      state.sleepConfig.sleepAfterIsha = clamp(parseInt(e.target.value) || 0, 0, 360);
      updateSleepReciprocal();
      saveSettings();
      renderSleepCard();
      renderSchedule();
    });
  }

  const sleepTimeInput = document.getElementById('sleepTargetTimeInput');
  if (sleepTimeInput) {
    sleepTimeInput.addEventListener('change', (e) => {
      const ishaTime = state.prayerTimes['isha'];
      if (!ishaTime) return;
      const targetTime = e.target.value;
      const ishaMins = timeToMinutes(ishaTime);
      const targetMins = timeToMinutes(targetTime);

      let diff = 0;
      if (targetMins >= ishaMins) {
        diff = targetMins - ishaMins;
      } else {
        diff = (1440 - ishaMins) + targetMins;
      }
      state.sleepConfig.sleepAfterIsha = clamp(diff, 0, 360);
      if (sleepMinInput) sleepMinInput.value = state.sleepConfig.sleepAfterIsha;
      updateSleepReciprocal();
      saveSettings();
      renderSleepCard();
      renderSchedule();
    });
  }

  // 6. SMART INPUT 2: BANGUN PAGI
  const smartWakeBox = document.getElementById('smartWakeInputBox');
  if (smartWakeBox) {
    smartWakeBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-mode');
      if (!btn) return;
      state.sleepConfig.wakeInputMode = btn.dataset.mode;
      updateWakeModeUI();
      saveSettings();
    });
  }

  const wakeMinInput = document.getElementById('wakeBeforeFajrInput');
  if (wakeMinInput) {
    wakeMinInput.addEventListener('input', (e) => {
      state.sleepConfig.wakeBeforeFajr = clamp(parseInt(e.target.value) || 0, 0, 240);
      updateWakeReciprocal();
      saveSettings();
      renderSleepCard();
      renderSchedule();
    });
  }

  const wakeTimeInput = document.getElementById('wakeTargetTimeInput');
  if (wakeTimeInput) {
    wakeTimeInput.addEventListener('change', (e) => {
      const fajrTime = state.prayerTimes['fajr'];
      if (!fajrTime) return;
      const targetTime = e.target.value;
      const fajrMins = timeToMinutes(fajrTime);
      const targetMins = timeToMinutes(targetTime);

      let diff = 0;
      if (fajrMins >= targetMins) {
        diff = fajrMins - targetMins;
      } else {
        diff = (1440 - targetMins) + fajrMins;
      }
      state.sleepConfig.wakeBeforeFajr = clamp(diff, 0, 240);
      if (wakeMinInput) wakeMinInput.value = state.sleepConfig.wakeBeforeFajr;
      updateWakeReciprocal();
      saveSettings();
      renderSleepCard();
      renderSchedule();
    });
  }

  // 7. Travel time input
  const travelInput = document.getElementById('globalTravelInput');
  if (travelInput) {
    travelInput.addEventListener('input', (e) => {
      state.sleepConfig.globalTravel = clamp(parseInt(e.target.value) || 0, 0, 60);
      saveSettings();
      renderPrayerCards();
      renderSchedule();
    });
  }

  // 8. Timeline Filter
  const filterContainer = document.getElementById('timelineFilter');
  if (filterContainer) {
    filterContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      filterContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.activeFilter = btn.dataset.filter || 'all';
      renderSchedule();
    });
  }
}

/* =============================================
   GPS & LOCATION SYSTEM
   ============================================= */
async function detectGpsLocation() {
  const btn = document.getElementById('btnDetectGps');
  const btnText = document.getElementById('btnDetectGpsText');

  if (!navigator.geolocation) {
    showGpsFeedback('Perangkat Anda tidak mendukung deteksi lokasi GPS.', 'error');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Mencari Satelit GPS...';
  showGpsFeedback('📡 Sedang mendeteksi sinyal koordinat GPS...', 'loading');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(4));
      const lon = parseFloat(pos.coords.longitude.toFixed(4));

      // Calculate accurate timezone based on longitude in Indonesia or device
      let tz = 'Asia/Makassar';
      let tzLabel = 'WITA';
      if (lon < 110.0) {
        tz = 'Asia/Jakarta';
        tzLabel = 'WIB';
      } else if (lon <= 125.0) {
        tz = 'Asia/Makassar';
        tzLabel = 'WITA';
      } else if (lon <= 142.0) {
        tz = 'Asia/Jayapura';
        tzLabel = 'WIT';
      } else {
        try {
          tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Makassar';
          tzLabel = 'LOKAL';
        } catch(e) {}
      }

      showGpsFeedback(`🛰️ Koordinat didapat (${lat}, ${lon}). Mengambil nama wilayah...`, 'loading');

      // Reverse geocoding with OpenStreetMap Nominatim
      let placeName = `Titik GPS (${lat}, ${lon})`;
      try {
        const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
        const geoRes = await fetch(geoUrl, {
          headers: { 'Accept-Language': 'id,en' }
        });
        if (geoRes.ok) {
          const geoJson = await geoRes.json();
          const addr = geoJson.address || {};
          const district = addr.suburb || addr.city_district || addr.village || addr.neighbourhood || '';
          const city = addr.city || addr.town || addr.municipality || addr.county || addr.state || '';
          if (district && city) {
            placeName = `${district}, ${city}`;
          } else if (city) {
            placeName = city;
          } else if (geoJson.display_name) {
            placeName = geoJson.display_name.split(',').slice(0, 2).join(',').trim();
          }
        }
      } catch (err) {
        console.warn('Geocoding notice:', err);
      }

      state.location = {
        lat,
        lon,
        name: placeName,
        isGps: true,
        timezone: tz,
        tzLabel: tzLabel,
      };

      saveSettings();
      updateLocationUI();
      showGpsFeedback(`✅ Lokasi aktif: ${placeName} (${tzLabel})`, 'success');

      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Gunakan Lokasi GPS Saya';

      await fetchPrayerTimes();
    },
    (err) => {
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Gunakan Lokasi GPS Saya';
      let msg = 'Gagal mendeteksi lokasi GPS.';
      if (err.code === 1) {
        msg = 'Izin lokasi GPS ditolak oleh browser. Silakan aktifkan izin lokasi di browser Anda.';
      } else if (err.code === 2) {
        msg = 'Sinyal lokasi tidak tersedia. Pastikan GPS perangkat Anda aktif.';
      } else if (err.code === 3) {
        msg = 'Waktu pencarian sinyal GPS habis (timeout).';
      }
      showGpsFeedback(`❌ ${msg}`, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

async function resetLocationToDefault() {
  state.location = { ...DEFAULT_LOCATION };
  saveSettings();
  updateLocationUI();
  showGpsFeedback('🔄 Lokasi dikembalikan ke default: Landasan Ulin, Banjarbaru (WITA)', 'success');
  await fetchPrayerTimes();
}

function showGpsFeedback(msg, type) {
  const el = document.getElementById('gpsFeedback');
  if (!el) return;
  el.className = `gps-feedback status-${type}`;
  el.textContent = msg;
  el.classList.remove('is-hidden');

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      if (el) el.classList.add('is-hidden');
    }, 6000);
  }
}

function updateLocationUI() {
  const loc = state.location;
  const topText = document.getElementById('topLocationText');
  const topGpsDot = document.getElementById('topGpsIndicator');
  const drawerName = document.getElementById('drawerLocationName');
  const drawerCoords = document.getElementById('drawerLocationCoords');
  const gpsBadge = document.getElementById('gpsBadge');
  const brandTzBadge = document.getElementById('brandTzBadge');

  if (topText) topText.textContent = loc.name;
  if (topGpsDot) {
    topGpsDot.classList.toggle('is-gps', loc.isGps);
    topGpsDot.title = loc.isGps ? 'GPS Aktif' : 'Default Banjarbaru';
  }
  if (drawerName) drawerName.textContent = loc.name;
  if (drawerCoords) {
    drawerCoords.textContent = `Lat: ${loc.lat} • Lon: ${loc.lon} (${loc.tzLabel})`;
  }
  if (gpsBadge) {
    gpsBadge.textContent = loc.isGps ? '📍 GPS Aktif' : 'Default Banjarbaru';
    gpsBadge.className = `badge-mini-tag ${loc.isGps ? 'badge-mini-tag--amber' : 'badge-mini-tag--green'}`;
  }
  if (brandTzBadge) {
    const cityName = loc.name.split(',').pop().trim().toUpperCase();
    brandTzBadge.textContent = `LIVE ${loc.tzLabel} • ${cityName}`;
  }
}

/* =============================================
   IHTIYAT KEMENAG RI (+2 MENIT)
   ============================================= */
function setIhtiyat(enabled) {
  state.ihtiyat.enabled = enabled;
  saveSettings();
  updateIhtiyatUI();

  // Recalculate adzan times from raw API times instantaneously without re-fetching network
  if (state.loaded && state.rawPrayerTimes) {
    PRAYERS.forEach(p => {
      const raw = state.rawPrayerTimes[p.id];
      if (raw) {
        state.prayerTimes[p.id] = enabled ? addMinutes(raw, state.ihtiyat.minutes) : raw;
      }
    });
    renderAll();
  }
}

function updateIhtiyatUI() {
  const enabled = state.ihtiyat.enabled;
  const topBadge = document.getElementById('topIhtiyatBadge');
  const topText = document.getElementById('topIhtiyatText');
  const toggle = document.getElementById('toggleIhtiyat');
  const recipLabel = document.getElementById('ihtiyatReciprocalLabel');
  const footerAccuracy = document.getElementById('footerAccuracyText');

  if (topBadge) topBadge.classList.toggle('is-disabled', !enabled);
  if (topText) topText.textContent = enabled ? 'Ihtiyat +2m' : 'Astronomis Murni';
  if (toggle) toggle.checked = enabled;

  if (recipLabel) {
    if (enabled) {
      recipLabel.innerHTML = '✅ <strong>+2 Menit</strong> Standar Masjid Kemenag RI';
      recipLabel.style.color = 'var(--emerald-400)';
      recipLabel.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      recipLabel.style.background = 'rgba(16, 185, 129, 0.12)';
    } else {
      recipLabel.innerHTML = '⚠️ <strong>Astronomis Murni</strong> (Tanpa +2 Menit)';
      recipLabel.style.color = 'var(--gold-400)';
      recipLabel.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      recipLabel.style.background = 'rgba(245, 158, 11, 0.12)';
    }
  }

  if (footerAccuracy) {
    footerAccuracy.textContent = enabled ? 'Standar Ihtiyat Kemenag RI (+2 Menit)' : 'Hisab Astronomis Murni (Aladhan)';
  }
}

/* =============================================
   SMART RECIPROCAL DUAL-MODE HELPERS
   ============================================= */
function updateSleepModeUI() {
  const isMinute = state.sleepConfig.sleepInputMode === 'minute';
  const box = document.getElementById('smartSleepInputBox');
  if (!box) return;

  box.querySelectorAll('.btn-mode').forEach(b => {
    b.classList.toggle('is-active', b.dataset.mode === state.sleepConfig.sleepInputMode);
  });

  const minWrap = document.getElementById('sleepInputMinuteWrap');
  const timeWrap = document.getElementById('sleepInputTimeWrap');
  if (minWrap && timeWrap) {
    minWrap.classList.toggle('is-hidden', !isMinute);
    timeWrap.classList.toggle('is-hidden', isMinute);
  }

  updateSleepReciprocal();
}

function updateSleepReciprocal() {
  const isMinute = state.sleepConfig.sleepInputMode === 'minute';
  const ishaTime = state.prayerTimes['isha'] || '19:22';
  const offset = state.sleepConfig.sleepAfterIsha;
  const calculatedTime = addMinutes(ishaTime, offset);

  const timeInput = document.getElementById('sleepTargetTimeInput');
  if (timeInput) timeInput.value = calculatedTime;

  const lbl = document.getElementById('sleepReciprocalLabel');
  if (!lbl) return;

  const tz = state.location.tzLabel;
  if (isMinute) {
    lbl.innerHTML = `⏰ Waktu Tidur: <strong>${calculatedTime} ${tz}</strong>`;
  } else {
    lbl.innerHTML = `⏳ Selisih: <strong>${offset} menit</strong> pasca Isya (${ishaTime})`;
  }
}

function updateWakeModeUI() {
  const isMinute = state.sleepConfig.wakeInputMode === 'minute';
  const box = document.getElementById('smartWakeInputBox');
  if (!box) return;

  box.querySelectorAll('.btn-mode').forEach(b => {
    b.classList.toggle('is-active', b.dataset.mode === state.sleepConfig.wakeInputMode);
  });

  const minWrap = document.getElementById('wakeInputMinuteWrap');
  const timeWrap = document.getElementById('wakeInputTimeWrap');
  if (minWrap && timeWrap) {
    minWrap.classList.toggle('is-hidden', !isMinute);
    timeWrap.classList.toggle('is-hidden', isMinute);
  }

  updateWakeReciprocal();
}

function updateWakeReciprocal() {
  const isMinute = state.sleepConfig.wakeInputMode === 'minute';
  const fajrTime = state.prayerTimes['fajr'] || '04:44';
  const offset = state.sleepConfig.wakeBeforeFajr;
  const calculatedTime = subtractMinutes(fajrTime, offset);

  const timeInput = document.getElementById('wakeTargetTimeInput');
  if (timeInput) timeInput.value = calculatedTime;

  const lbl = document.getElementById('wakeReciprocalLabel');
  if (!lbl) return;

  const tz = state.location.tzLabel;
  if (isMinute) {
    lbl.innerHTML = `⏰ Waktu Bangun: <strong>${calculatedTime} ${tz}</strong>`;
  } else {
    lbl.innerHTML = `⏳ Selisih: <strong>${offset} menit</strong> sebelum Subuh (${fajrTime})`;
  }
}

/* =============================================
   API FETCHING
   ============================================= */
async function fetchPrayerTimes() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  const lat = state.location.lat;
  const lon = state.location.lon;
  const tz = state.location.timezone;

  const url = `https://api.aladhan.com/v1/timings/${dateStr}`
    + `?latitude=${lat}&longitude=${lon}`
    + `&method=${DEFAULT_CONFIG.method}&methodSettings=${DEFAULT_CONFIG.methodSettings}`
    + `&school=${DEFAULT_CONFIG.school}&timezonestring=${tz}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.code !== 200) throw new Error(json.status || 'API error');

    const timings = json.data.timings;

    PRAYERS.forEach(p => {
      const raw = (timings[p.apiKey] || '').split(' ')[0];
      state.rawPrayerTimes[p.id] = raw;
      if (state.ihtiyat.enabled) {
        state.prayerTimes[p.id] = addMinutes(raw, state.ihtiyat.minutes);
      } else {
        state.prayerTimes[p.id] = raw;
      }
    });

    state.hijriDate = json.data.date.hijri;
    state.gregorianDate = json.data.date.gregorian;
    state.loaded = true;

    renderAll();
  } catch (err) {
    console.error('Fetch error:', err);
    showError(err.message);
  }
}

function showError(msg) {
  const grid = document.getElementById('prayerGrid');
  grid.innerHTML = `
    <div class="error-state" style="grid-column:1/-1; text-align:center; padding:2rem; background:rgba(239,68,68,0.1); border-radius:14px; border:1px solid rgba(239,68,68,0.3);">
      <p style="font-size:1.15rem; font-weight:700; color:#f87171;">⚠️ Gagal Mengambil Data Waktu Sholat</p>
      <p style="font-size:.85rem; color:var(--text-muted); margin:.4rem 0 1rem;">${msg}</p>
      <button style="padding:.5rem 1.25rem; background:#ef4444; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:700;" onclick="location.reload()">Coba Lagi</button>
    </div>`;
}

/* =============================================
   RENDER ALL
   ============================================= */
function renderAll() {
  renderDates();
  renderSleepCard();
  renderPrayerCards();
  renderSchedule();
  updateClock();
  updateSleepReciprocal();
  updateWakeReciprocal();
}

/* ---- Dates Header ---- */
function renderDates() {
  const el = document.getElementById('headerDates');
  if (!state.gregorianDate || !state.hijriDate) return;

  const g = state.gregorianDate;
  const h = state.hijriDate;

  const hijriMonths = {
    1: 'Muharram', 2: 'Safar', 3: "Rabi'ul Awal", 4: "Rabi'ul Akhir",
    5: 'Jumadil Awal', 6: 'Jumadil Akhir', 7: 'Rajab', 8: "Sya'ban",
    9: 'Ramadhan', 10: 'Syawal', 11: "Dzulqa'dah", 12: "Dzulhijjah",
  };

  const dayNames = { Sunday: 'Minggu', Monday: 'Senin', Tuesday: 'Selasa', Wednesday: 'Rabu', Thursday: 'Kamis', Friday: 'Jumat', Saturday: 'Sabtu' };
  const monthNames = { January: 'Januari', February: 'Februari', March: 'Maret', April: 'April', May: 'Mei', June: 'Juni', July: 'Juli', August: 'Agustus', September: 'September', October: 'Oktober', November: 'November', December: 'Desember' };

  const dayName = dayNames[g.weekday.en] || g.weekday.en;
  const monthName = monthNames[g.month.en] || g.month.en;
  const hijriMonth = hijriMonths[h.month.number] || h.month.en;

  el.innerHTML = `
    <span>📅 ${dayName}, ${g.day} ${monthName} ${g.year}</span>
    <span>🗓️ ${h.day} ${hijriMonth} ${h.year} H</span>`;
}

/* ---- Sleep Card ---- */
function renderSleepCard() {
  if (!state.loaded) return;

  const ishaTime = state.prayerTimes['isha'];
  const fajrTime = state.prayerTimes['fajr'];
  if (!ishaTime || !fajrTime) return;

  const sleepTimeStr = addMinutes(ishaTime, state.sleepConfig.sleepAfterIsha);
  const wakeTimeStr = subtractMinutes(fajrTime, state.sleepConfig.wakeBeforeFajr);

  const sleepMins = timeToMinutes(sleepTimeStr);
  const wakeMins = timeToMinutes(wakeTimeStr);

  let totalSleepMinutes = 0;
  if (wakeMins >= sleepMins) {
    totalSleepMinutes = wakeMins - sleepMins;
  } else {
    totalSleepMinutes = (1440 - sleepMins) + wakeMins;
  }

  const hours = Math.floor(totalSleepMinutes / 60);
  const mins = totalSleepMinutes % 60;

  document.getElementById('sleepTimeDisplay').textContent = sleepTimeStr;
  document.getElementById('wakeTimeDisplay').textContent = wakeTimeStr;
  document.getElementById('sleepTimeHint').textContent = `${state.sleepConfig.sleepAfterIsha}m pasca Isya`;
  document.getElementById('wakeTimeHint').textContent = `${state.sleepConfig.wakeBeforeFajr}m jelang Subuh`;
  document.getElementById('sleepDurationDisplay').textContent = `${hours}j ${mins}m`;

  const badge = document.getElementById('sleepQualityBadge');
  if (badge) {
    if (hours >= 7 && hours <= 9) {
      badge.textContent = 'Sehat (7–8 Jam)';
      badge.className = 'badge-status-pill badge-status-pill--good';
    } else if (hours < 6) {
      badge.textContent = 'Kurang (< 6 Jam)';
      badge.className = 'badge-status-pill badge-status-pill--warn';
    } else {
      badge.textContent = 'Cukup';
      badge.className = 'badge-status-pill';
    }
  }
}

/* ---- 5 Prayer Cards ---- */
function renderPrayerCards() {
  const grid = document.getElementById('prayerGrid');
  const travel = state.sleepConfig.globalTravel;
  const currentPrayerId = getCurrentPrayerId();

  grid.innerHTML = PRAYERS.map(p => {
    const time = state.prayerTimes[p.id] || '--:--';
    const s = state.settings[p.id];
    const isCurrent = p.id === currentPrayerId;
    const isMinuteMode = s.studyMode === 'minute';

    const iqomahTime = time !== '--:--' ? addMinutes(time, s.iqomah) : '--:--';
    const departTime = time !== '--:--' ? subtractMinutes(iqomahTime, travel) : '--:--';
    const studyStartTime = time !== '--:--' ? addMinutes(time, s.offset) : '--:--';

    const reciprocalStudyHtml = isMinuteMode
      ? `⏰ Mulai: <strong>${studyStartTime}</strong>`
      : `⏳ Jarak: <strong>${s.offset}m</strong>`;

    return `
      <div class="prayer-card ${isCurrent ? 'is-active' : ''}" data-id="${p.id}">
        <div class="prayer-card__arabic-bg">${p.arabic}</div>

        <div class="prayer-card__top">
          <div class="prayer-card__left">
            <span class="prayer-card__icon">${p.icon}</span>
            <div>
              <div class="prayer-card__name">${p.name}</div>
              <div class="prayer-card__arabic">${p.arabic}</div>
            </div>
          </div>
          ${isCurrent ? '<span class="prayer-card__badge-live">Sekarang</span>' : ''}
        </div>

        <div class="prayer-card__time">${time}</div>

        <div class="prayer-card__timing-box">
          <div class="timing-row">
            <span class="timing-row__label">⏱️ Iqomah</span>
            <span class="timing-row__val timing-row__val--iqomah">${iqomahTime}</span>
          </div>
          <div class="timing-row">
            <span class="timing-row__label">🚶 Berangkat</span>
            <span class="timing-row__val timing-row__val--depart">${departTime}</span>
          </div>
        </div>

        <div class="card-tabs">
          <button class="card-tab-btn is-active" data-tab="study" data-prayer="${p.id}" type="button">
            📚 Belajar
          </button>
          <button class="card-tab-btn" data-tab="iqomah" data-prayer="${p.id}" type="button">
            ⏱️ Iqomah
          </button>
        </div>

        <div class="card-tab-pane is-active" data-pane="study-${p.id}">
          <div class="prayer-card__study">
            <label class="toggle">
              <input type="checkbox"
                     data-action="toggle-study"
                     data-prayer="${p.id}"
                     ${s.enabled ? 'checked' : ''}>
              <span class="toggle__track"></span>
              <span class="toggle__label">Aktifkan Belajar</span>
            </label>

            <div class="study-inputs ${s.enabled ? 'is-visible' : ''}" data-inputs="${p.id}">
              <!-- Reciprocal Badge & Dual-Mode Pill -->
              <div class="smart-study-header">
                <span class="smart-study-reciprocal" id="studyReciprocal-${p.id}">
                  ${reciprocalStudyHtml}
                </span>
                <div class="smart-toggle-pill">
                  <button type="button" class="btn-mode ${isMinuteMode ? 'is-active' : ''}"
                          data-action="toggle-study-mode" data-prayer="${p.id}" data-mode="minute">Menit</button>
                  <button type="button" class="btn-mode ${!isMinuteMode ? 'is-active' : ''}"
                          data-action="toggle-study-mode" data-prayer="${p.id}" data-mode="time">Jam</button>
                </div>
              </div>

              <!-- Input Row: Minute Mode -->
              <div class="input-row ${!isMinuteMode ? 'is-hidden' : ''}" data-study-row="minute-${p.id}">
                <span class="input-row__label">Jeda</span>
                <input type="number"
                       data-action="study-offset"
                       data-prayer="${p.id}"
                       value="${s.offset}"
                       min="0" max="300" step="5">
                <span class="input-row__unit">mnt pasca ${p.name}</span>
              </div>

              <!-- Input Row: Time Mode -->
              <div class="input-row ${isMinuteMode ? 'is-hidden' : ''}" data-study-row="time-${p.id}">
                <span class="input-row__label">Mulai</span>
                <input type="time"
                       class="input-time"
                       data-action="study-time"
                       data-prayer="${p.id}"
                       value="${studyStartTime}">
                <span class="input-row__unit">${state.location.tzLabel}</span>
              </div>

              <!-- Duration Input -->
              <div class="input-row">
                <span class="input-row__label">Durasi</span>
                <input type="number"
                       data-action="study-duration"
                       data-prayer="${p.id}"
                       value="${s.duration}"
                       min="5" max="480" step="5">
                <span class="input-row__unit">menit</span>
              </div>

              <div class="study-preview">
                📚 ${studyStartTime} — ${addMinutes(studyStartTime, s.duration)}
              </div>
            </div>
          </div>
        </div>

        <div class="card-tab-pane" data-pane="iqomah-${p.id}">
          <div class="iqomah-pane-content">
            <div class="input-row">
              <span class="input-row__label">Jeda Iqomah</span>
              <input type="number"
                     data-action="iqomah-duration"
                     data-prayer="${p.id}"
                     value="${s.iqomah}"
                     min="1" max="60" step="1">
              <span class="input-row__unit">menit pasca adzan</span>
            </div>
            <div class="iqomah-pane-hint">
              Waktu jalan ke masjid: <strong>${travel} menit</strong> (diatur pada panel atas)
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.removeEventListener('click', handleCardClick);
  grid.removeEventListener('input', handleCardInput);
  grid.addEventListener('click', handleCardClick);
  grid.addEventListener('input', handleCardInput);
}

function handleCardClick(e) {
  const tabBtn = e.target.closest('.card-tab-btn, .prayer-tab');
  if (tabBtn) {
    const prayerId = tabBtn.dataset.prayer;
    const tabType = tabBtn.dataset.tab;
    const card = tabBtn.closest('.prayer-card');

    card.querySelectorAll('.card-tab-btn, .prayer-tab').forEach(b => b.classList.remove('is-active'));
    tabBtn.classList.add('is-active');

    const studyPane = card.querySelector(`[data-pane="study-${prayerId}"]`);
    const iqomahPane = card.querySelector(`[data-pane="iqomah-${prayerId}"]`);

    if (tabType === 'study') {
      if (studyPane) studyPane.classList.add('is-active');
      if (iqomahPane) iqomahPane.classList.remove('is-active');
    } else {
      if (iqomahPane) iqomahPane.classList.add('is-active');
      if (studyPane) studyPane.classList.remove('is-active');
    }
    return;
  }

  // Study Dual-Mode button in prayer card
  const modeBtn = e.target.closest('[data-action="toggle-study-mode"]');
  if (modeBtn) {
    const prayerId = modeBtn.dataset.prayer;
    const mode = modeBtn.dataset.mode;
    state.settings[prayerId].studyMode = mode;

    const card = modeBtn.closest('.prayer-card');
    card.querySelectorAll('[data-action="toggle-study-mode"]').forEach(b => b.classList.toggle('is-active', b.dataset.mode === mode));

    const minRow = card.querySelector(`[data-study-row="minute-${prayerId}"]`);
    const timeRow = card.querySelector(`[data-study-row="time-${prayerId}"]`);

    if (minRow && timeRow) {
      minRow.classList.toggle('is-hidden', mode !== 'minute');
      timeRow.classList.toggle('is-hidden', mode === 'minute');
    }

    updatePrayerStudyReciprocal(prayerId);
    saveSettings();
  }
}

function handleCardInput(e) {
  const el = e.target;
  const action = el.dataset.action;
  const prayerId = el.dataset.prayer;
  if (!action || !prayerId) return;

  const s = state.settings[prayerId];
  const prayerTime = state.prayerTimes[prayerId] || '12:00';

  if (action === 'toggle-study') {
    s.enabled = el.checked;
    const inputs = document.querySelector(`[data-inputs="${prayerId}"]`);
    if (inputs) inputs.classList.toggle('is-visible', s.enabled);
  } else if (action === 'study-offset') {
    s.offset = clamp(parseInt(el.value) || 0, 0, 300);
    const timeInput = document.querySelector(`[data-action="study-time"][data-prayer="${prayerId}"]`);
    if (timeInput) timeInput.value = addMinutes(prayerTime, s.offset);
  } else if (action === 'study-time') {
    const targetTime = el.value;
    const prayerMins = timeToMinutes(prayerTime);
    const targetMins = timeToMinutes(targetTime);
    let diff = targetMins >= prayerMins ? (targetMins - prayerMins) : ((1440 - prayerMins) + targetMins);
    s.offset = clamp(diff, 0, 300);
    const minInput = document.querySelector(`[data-action="study-offset"][data-prayer="${prayerId}"]`);
    if (minInput) minInput.value = s.offset;
  } else if (action === 'study-duration') {
    s.duration = clamp(parseInt(el.value) || 5, 5, 480);
  } else if (action === 'iqomah-duration') {
    s.iqomah = clamp(parseInt(el.value) || 1, 1, 60);
    const card = document.querySelector(`.prayer-card[data-id="${prayerId}"]`);
    if (card) {
      const travel = state.sleepConfig.globalTravel;
      const iqomahTime = addMinutes(prayerTime, s.iqomah);
      const departTime = subtractMinutes(iqomahTime, travel);
      const iqomahEl = card.querySelector('.timing-row__val--iqomah');
      const departEl = card.querySelector('.timing-row__val--depart');
      if (iqomahEl) iqomahEl.textContent = iqomahTime;
      if (departEl) departEl.textContent = departTime;
    }
  }

  saveSettings();
  updatePrayerStudyReciprocal(prayerId);
  updateStudyPreview(prayerId);
  renderSchedule();
}

function updatePrayerStudyReciprocal(prayerId) {
  const s = state.settings[prayerId];
  const prayerTime = state.prayerTimes[prayerId] || '12:00';
  const studyStart = addMinutes(prayerTime, s.offset);
  const isMinute = s.studyMode === 'minute';
  const pObj = PRAYERS.find(p => p.id === prayerId);
  const pName = pObj ? pObj.name : '';

  const recipEl = document.getElementById(`studyReciprocal-${prayerId}`);
  if (!recipEl) return;

  if (isMinute) {
    recipEl.innerHTML = `⏰ Mulai: <strong>${studyStart}</strong>`;
  } else {
    recipEl.innerHTML = `⏳ Jarak: <strong>${s.offset}m</strong>`;
  }
}

function updateStudyPreview(prayerId) {
  const s = state.settings[prayerId];
  const time = state.prayerTimes[prayerId];
  if (!time) return;

  const card = document.querySelector(`.prayer-card[data-id="${prayerId}"]`);
  if (!card) return;

  const inputsContainer = card.querySelector(`[data-inputs="${prayerId}"]`);
  if (!inputsContainer) return;

  let preview = inputsContainer.querySelector('.study-preview');

  if (s.enabled) {
    const studyStart = addMinutes(time, s.offset);
    const studyEnd = addMinutes(time, s.offset + s.duration);
    if (preview) {
      preview.textContent = `📚 ${studyStart} — ${studyEnd}`;
    } else {
      preview = document.createElement('div');
      preview.className = 'study-preview';
      preview.textContent = `📚 ${studyStart} — ${studyEnd}`;
      inputsContainer.appendChild(preview);
    }
  } else if (preview) {
    preview.remove();
  }
}

/* =============================================
   SCHEDULE TIMELINE & BENTO METRICS SYNC
   ============================================= */
function renderSchedule() {
  const section = document.getElementById('scheduleSection');
  const timelineEl = document.getElementById('timeline');

  if (!state.loaded) {
    section.style.display = 'none';
    return;
  }

  const travel = state.sleepConfig.globalTravel;
  const ishaTime = state.prayerTimes['isha'];
  const fajrTime = state.prayerTimes['fajr'];

  const events = [];

  // 1. Prayers & Departs
  PRAYERS.forEach(p => {
    const time = state.prayerTimes[p.id];
    if (!time) return;
    const mins = timeToMinutes(time);
    const s = state.settings[p.id];

    const iqomahMins = mins + s.iqomah;
    const departMins = iqomahMins - travel;

    events.push({
      category: 'prayer',
      type: 'depart',
      prayer: p,
      time: minutesToTime(departMins),
      minutes: departMins,
      title: `🚶 Berangkat ke Masjid (${p.name})`,
      detail: `Waktu tempuh ${travel} menit menuju iqomah`,
    });

    events.push({
      category: 'prayer',
      type: 'prayer',
      prayer: p,
      time,
      minutes: mins,
      title: `${p.icon} Sholat ${p.name} (${p.arabic})`,
      detail: `Waktu masuk sholat ${p.name}`,
    });

    events.push({
      category: 'prayer',
      type: 'iqomah',
      prayer: p,
      time: minutesToTime(iqomahMins),
      minutes: iqomahMins,
      title: `⏱️ Iqomah ${p.name}`,
      detail: `${s.iqomah} menit pasca adzan`,
    });

    if (s.enabled) {
      const studyStartMins = mins + s.offset;
      const studyEndMins = studyStartMins + s.duration;
      events.push({
        category: 'study',
        type: 'study',
        prayer: p,
        time: minutesToTime(studyStartMins),
        endTime: minutesToTime(studyEndMins),
        minutes: studyStartMins,
        durationMins: s.duration,
        offsetMins: s.offset,
        title: `📚 Belajar (${formatDuration(s.duration)})`,
        detail: `${s.offset} menit setelah ${p.name}`,
      });
    }
  });

  // 2. Sleep & Wake
  if (ishaTime && fajrTime) {
    const sleepMins = timeToMinutes(ishaTime) + state.sleepConfig.sleepAfterIsha;
    const wakeMins = timeToMinutes(fajrTime) - state.sleepConfig.wakeBeforeFajr;

    events.push({
      category: 'sleep',
      type: 'wake',
      time: minutesToTime(wakeMins),
      minutes: wakeMins,
      title: `⏰ Bangun Pagi / Subuh`,
      detail: `${state.sleepConfig.wakeBeforeFajr} menit sebelum Subuh (Qiyamul Lail & Persiapan)`,
    });

    events.push({
      category: 'sleep',
      type: 'sleep',
      time: minutesToTime(sleepMins),
      minutes: sleepMins,
      title: `🛏️ Mulai Tidur Malam`,
      detail: `${state.sleepConfig.sleepAfterIsha} menit pasca Isya • Pemulihan optimal`,
    });
  }

  events.sort((a, b) => a.minutes - b.minutes);

  let filteredEvents = events;
  if (state.activeFilter !== 'all') {
    filteredEvents = events.filter(e => e.category === state.activeFilter);
  }

  section.style.display = '';

  // Update Bento Study Stats Card
  const totalStudyMins = events
    .filter(e => e.type === 'study')
    .reduce((sum, e) => sum + e.durationMins, 0);
  const studySessions = events.filter(e => e.type === 'study').length;

  const studyHours = Math.floor(totalStudyMins / 60);
  const studyRemMins = totalStudyMins % 60;
  const hoursDisplay = studyHours > 0 ? `${studyHours}j ${studyRemMins}m` : `${studyRemMins}m`;

  const hoursEl = document.getElementById('summaryStudyHours');
  const sessionsEl = document.getElementById('summaryStudySessions');
  if (hoursEl) hoursEl.textContent = hoursDisplay;
  if (sessionsEl) sessionsEl.textContent = `${studySessions} Sesi`;

  // Render Timeline Elements
  timelineEl.innerHTML = filteredEvents.map(e => `
    <div class="timeline-item timeline-item--${e.category} timeline-item--${e.type}">
      <div class="timeline-item__dot"></div>
      <div class="timeline-item__content">
        <div class="timeline-item__time">${e.time} ${state.location.tzLabel}</div>
        <div class="timeline-item__label">${e.title}</div>
        <div class="timeline-item__detail">${e.detail}</div>
      </div>
    </div>
  `).join('');
}

/* =============================================
   LIVE CLOCK & HERO CARD COUNTDOWN
   ============================================= */
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const tz = state.location.tzLabel;
  const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');

  const clockEl = document.getElementById('clockTime');
  if (clockEl) clockEl.textContent = `${timeStr} ${tz}`;

  if (state.loaded) {
    updateHeroCountdown();
  }
}

function updateHeroCountdown() {
  const now = new Date();
  const nowSecs = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();

  const heroName = document.getElementById('heroPrayerName');
  const heroAdzan = document.getElementById('heroAdzanTime');
  const heroCountdown = document.getElementById('heroCountdownTimer');
  const heroIcon = document.getElementById('heroIcon');
  const heroArabic = document.getElementById('heroArabicCalligraphy');
  const heroIqomah = document.getElementById('heroIqomahTime');
  const heroDepart = document.getElementById('heroDepartTime');
  const heroProgressBar = document.getElementById('heroProgressBar');

  const travel = state.sleepConfig.globalTravel;

  let nextPrayer = null;
  let nextPrayerSecs = null;
  let prevPrayerSecs = 0;

  for (let i = 0; i < PRAYERS.length; i++) {
    const p = PRAYERS[i];
    const timeStr = state.prayerTimes[p.id];
    if (!timeStr) continue;
    const pSecs = timeToMinutes(timeStr) * 60;

    if (pSecs > nowSecs) {
      nextPrayer = p;
      nextPrayerSecs = pSecs;
      if (i > 0) {
        prevPrayerSecs = timeToMinutes(state.prayerTimes[PRAYERS[i - 1].id]) * 60;
      }
      break;
    }
  }

  const tz = state.location.tzLabel;

  if (nextPrayer) {
    const adzanTime = state.prayerTimes[nextPrayer.id];
    const s = state.settings[nextPrayer.id];
    const iqomahTime = addMinutes(adzanTime, s.iqomah);
    const departTime = subtractMinutes(iqomahTime, travel);

    if (heroName) heroName.textContent = nextPrayer.name;
    if (heroAdzan) heroAdzan.textContent = `${adzanTime} ${tz}`;
    if (heroIcon) heroIcon.textContent = nextPrayer.icon;
    if (heroArabic) heroArabic.textContent = nextPrayer.arabic;
    if (heroIqomah) heroIqomah.textContent = iqomahTime;
    if (heroDepart) heroDepart.textContent = departTime;

    const diffSecs = nextPrayerSecs - nowSecs;
    const dh = Math.floor(diffSecs / 3600);
    const dm = Math.floor((diffSecs % 3600) / 60);
    const ds = diffSecs % 60;

    let countdownStr = '';
    if (dh > 0) countdownStr += `${dh}j `;
    countdownStr += `${dm}m ${ds}s`;

    if (heroCountdown) heroCountdown.textContent = countdownStr;

    if (heroProgressBar) {
      const nextSecs = nextPrayerSecs;
      const totalSpan = Math.max(1, nextSecs - prevPrayerSecs);
      const elapsed = Math.max(0, nowSecs - prevPrayerSecs);
      const pct = clamp(Math.round((elapsed / totalSpan) * 100), 5, 98);
      heroProgressBar.style.width = `${pct}%`;
    }

  } else {
    const fajr = PRAYERS[0];
    const fajrAdzan = state.prayerTimes['fajr'];
    const s = state.settings['fajr'];
    const iqomahTime = addMinutes(fajrAdzan, s.iqomah);
    const departTime = subtractMinutes(iqomahTime, travel);

    if (heroName) heroName.textContent = 'Subuh Besok';
    if (heroAdzan) heroAdzan.textContent = `${fajrAdzan} ${tz}`;
    if (heroIcon) heroIcon.textContent = fajr.icon;
    if (heroArabic) heroArabic.textContent = fajr.arabic;
    if (heroIqomah) heroIqomah.textContent = iqomahTime;
    if (heroDepart) heroDepart.textContent = departTime;

    const fajrMins = timeToMinutes(fajrAdzan);
    const diffSecs = (86400 - nowSecs) + (fajrMins * 60);
    const dh = Math.floor(diffSecs / 3600);
    const dm = Math.floor((diffSecs % 3600) / 60);
    const ds = diffSecs % 60;

    if (heroCountdown) heroCountdown.textContent = `${dh}j ${dm}m ${ds}s`;
    if (heroProgressBar) heroProgressBar.style.width = '100%';
  }
}

function getCurrentPrayerId() {
  if (!state.loaded) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  let current = null;
  for (const p of PRAYERS) {
    const pMins = timeToMinutes(state.prayerTimes[p.id]);
    if (pMins <= nowMins) {
      current = p.id;
    }
  }
  return current;
}

/* =============================================
   UTILITY FUNCTIONS
   ============================================= */
function timeToMinutes(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMins) {
  totalMins = ((totalMins % 1440) + 1440) % 1440;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutes(timeStr, mins) {
  return minutesToTime(timeToMinutes(timeStr) + mins);
}

function subtractMinutes(timeStr, mins) {
  return minutesToTime(timeToMinutes(timeStr) - mins);
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} jam ${m} menit`;
  if (h > 0) return `${h} jam`;
  return `${m} menit`;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
