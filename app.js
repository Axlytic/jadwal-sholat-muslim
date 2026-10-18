/* =============================================
   CONFIGURATION & DEFAULTS
   ============================================= */
const CONFIG = {
  lat: -3.4414,
  lon: 114.8430,
  method: 99,                   // Custom calculation
  methodSettings: '20,null,18', // Kemenag RI: Subuh 20°, Isya 18°
  school: 1,                    // Shafi'i
  timezone: 'Asia/Makassar',
  locationName: 'Landasan Ulin, Banjarbaru',
};

const PRAYERS = [
  { id: 'fajr',    apiKey: 'Fajr',    name: 'Subuh',   arabic: 'الفجر',  icon: '🌅', defaultOn: true,  defaultOffset: 30,  defaultDuration: 120, defaultIqomah: 20 },
  { id: 'dhuhr',   apiKey: 'Dhuhr',   name: 'Dzuhur',  arabic: 'الظهر',  icon: '☀️', defaultOn: true,  defaultOffset: 30,  defaultDuration: 120, defaultIqomah: 12 },
  { id: 'asr',     apiKey: 'Asr',     name: 'Ashar',   arabic: 'العصر',  icon: '🌤️', defaultOn: true,  defaultOffset: 30,  defaultDuration: 90,  defaultIqomah: 10 },
  { id: 'maghrib', apiKey: 'Maghrib', name: 'Maghrib', arabic: 'المغرب', icon: '🌇', defaultOn: false, defaultOffset: 15,  defaultDuration: 30,  defaultIqomah: 7  },
  { id: 'isha',    apiKey: 'Isha',    name: 'Isya',    arabic: 'العشاء', icon: '🌙', defaultOn: true,  defaultOffset: 30,  defaultDuration: 60,  defaultIqomah: 10 },
];

const STORAGE_KEY = 'jadwalHarian_settings_v3';
const LEGACY_STORAGE_KEY = 'jadwalHarian_settings_v2';

/* =============================================
   STATE
   ============================================= */
let state = {
  prayerTimes: {},       // { fajr: '04:32', ... }
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
  activeFilter: 'all',   // 'all', 'prayer', 'study', 'sleep'
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
    try { saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)); } catch(e) {}
  }

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

  if (sleepMinInput) sleepMinInput.value = state.sleepConfig.sleepAfterIsha;
  if (wakeMinInput) wakeMinInput.value = state.sleepConfig.wakeBeforeFajr;
  if (travelInput) travelInput.value = state.sleepConfig.globalTravel;

  // Set initial active state of mode buttons
  updateSleepModeUI();
  updateWakeModeUI();
}

function saveSettings() {
  const dataToSave = {
    prayers: state.settings,
    sleep: state.sleepConfig,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch(e) {}
}

/* =============================================
   EVENT LISTENERS & SMART DUAL-MODE CONTROLS
   ============================================= */
function initEventListeners() {
  // Drawer Toggle
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

  // --- SMART INPUT 1: MULAI TIDUR ---
  // Mode switcher: Menit vs Jam
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

  // Input minute
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

  // Input time
  const sleepTimeInput = document.getElementById('sleepTargetTimeInput');
  if (sleepTimeInput) {
    sleepTimeInput.addEventListener('change', (e) => {
      const ishaTime = state.prayerTimes['isha'];
      if (!ishaTime) return;
      const targetTime = e.target.value; // "HH:MM"
      const ishaMins = timeToMinutes(ishaTime);
      const targetMins = timeToMinutes(targetTime);

      let diff = 0;
      if (targetMins >= ishaMins) {
        diff = targetMins - ishaMins;
      } else {
        // Past midnight
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

  // --- SMART INPUT 2: BANGUN PAGI ---
  // Mode switcher: Menit vs Jam
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

  // Input minute
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

  // Input time
  const wakeTimeInput = document.getElementById('wakeTargetTimeInput');
  if (wakeTimeInput) {
    wakeTimeInput.addEventListener('change', (e) => {
      const fajrTime = state.prayerTimes['fajr'];
      if (!fajrTime) return;
      const targetTime = e.target.value; // "HH:MM"
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

  // Travel time input
  const travelInput = document.getElementById('globalTravelInput');
  if (travelInput) {
    travelInput.addEventListener('input', (e) => {
      state.sleepConfig.globalTravel = clamp(parseInt(e.target.value) || 0, 0, 60);
      saveSettings();
      renderPrayerCards();
      renderSchedule();
    });
  }

  // Timeline Filter
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
   SMART RECIPROCAL UI HELPERS
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

  if (isMinute) {
    // Mode Menit: Tampilkan label Jam
    lbl.innerHTML = `⏰ Waktu Tidur: <strong>${calculatedTime} WITA</strong>`;
  } else {
    // Mode Jam: Tampilkan label Menit
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
  const fajrTime = state.prayerTimes['fajr'] || '04:43';
  const offset = state.sleepConfig.wakeBeforeFajr;
  const calculatedTime = subtractMinutes(fajrTime, offset);

  const timeInput = document.getElementById('wakeTargetTimeInput');
  if (timeInput) timeInput.value = calculatedTime;

  const lbl = document.getElementById('wakeReciprocalLabel');
  if (!lbl) return;

  if (isMinute) {
    // Mode Menit: Tampilkan label Jam
    lbl.innerHTML = `⏰ Waktu Bangun: <strong>${calculatedTime} WITA</strong>`;
  } else {
    // Mode Jam: Tampilkan label Menit
    lbl.innerHTML = `⏳ Selisih: <strong>${offset} menit</strong> jelang Subuh (${fajrTime})`;
  }
}

/* =============================================
   API FETCH (Aladhan API)
   ============================================= */
async function fetchPrayerTimes() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  const url = `https://api.aladhan.com/v1/timings/${dateStr}`
    + `?latitude=${CONFIG.lat}&longitude=${CONFIG.lon}`
    + `&method=${CONFIG.method}&methodSettings=${CONFIG.methodSettings}`
    + `&school=${CONFIG.school}&timezonestring=${CONFIG.timezone}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.code !== 200) throw new Error(json.status || 'API error');

    const timings = json.data.timings;

    PRAYERS.forEach(p => {
      state.prayerTimes[p.id] = (timings[p.apiKey] || '').split(' ')[0];
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
  if (totalSleepMinutes >= 420) {
    badge.className = 'badge-status-pill sleep-badge--good';
    badge.textContent = '🟢 Sehat (7-8 Jam)';
  } else if (totalSleepMinutes >= 360) {
    badge.className = 'badge-status-pill sleep-badge--fair';
    badge.textContent = '🟡 Cukup (6-7 Jam)';
  } else {
    badge.className = 'badge-status-pill sleep-badge--low';
    badge.textContent = '🔴 Kurang (<6 Jam)';
  }
}

/* ---- Prayer Cards (With Smart Dual-Mode Study Input) ---- */
function renderPrayerCards() {
  const grid = document.getElementById('prayerGrid');
  const currentId = getCurrentPrayerId();
  const travel = state.sleepConfig.globalTravel;

  grid.innerHTML = PRAYERS.map(p => {
    const time = state.prayerTimes[p.id] || '--:--';
    const s = state.settings[p.id];
    const isCurrent = p.id === currentId;

    const iqomahTime = addMinutes(time, s.iqomah);
    const departTime = subtractMinutes(iqomahTime, travel);

    const studyStart = s.enabled ? addMinutes(time, s.offset) : null;
    const studyEnd = s.enabled ? addMinutes(time, s.offset + s.duration) : null;
    const isStudyMinMode = s.studyMode === 'minute';

    return `
      <div class="prayer-card ${isCurrent ? 'is-current' : ''}" data-id="${p.id}">
        <div class="prayer-card__header">
          <span class="prayer-card__icon">${p.icon}</span>
          <span class="prayer-card__badge">Sekarang</span>
        </div>
        <div class="prayer-card__name-row">
          <div class="prayer-card__name">${p.name}</div>
          <div class="prayer-card__arabic">${p.arabic}</div>
        </div>
        <div class="prayer-card__time">${time}</div>

        <!-- Info Kotak Iqomah & Berangkat -->
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

        <!-- Segmented Tab: Belajar vs Iqomah -->
        <div class="card-tabs">
          <button type="button" class="card-tab-btn is-active" data-tab="study" data-prayer="${p.id}">📚 Belajar</button>
          <button type="button" class="card-tab-btn" data-tab="iqomah" data-prayer="${p.id}">⏱️ Iqomah</button>
        </div>

        <!-- Tab Pane 1: Belajar (Smart Dual-Mode) -->
        <div class="card-tab-pane is-active" data-pane="study-${p.id}">
          <label class="toggle">
            <input type="checkbox" ${s.enabled ? 'checked' : ''} data-action="toggle-study" data-prayer="${p.id}">
            <span class="toggle__track"></span>
            <span class="toggle__label">Aktifkan Belajar</span>
          </label>
          <div class="study-inputs ${s.enabled ? 'is-visible' : ''}" data-inputs="${p.id}">
            
            <!-- Smart Mode Header inside Prayer Card -->
            <div class="smart-study-header">
              <span class="smart-study-reciprocal" id="studyReciprocal-${p.id}">
                ${isStudyMinMode ? `⏰ Jam ${studyStart || '--:--'}` : `⏳ ${s.offset}m pasca ${p.name}`}
              </span>
              <div class="smart-toggle-pill">
                <button type="button" class="btn-mode ${isStudyMinMode ? 'is-active' : ''}" data-action="toggle-study-mode" data-mode="minute" data-prayer="${p.id}">Menit</button>
                <button type="button" class="btn-mode ${!isStudyMinMode ? 'is-active' : ''}" data-action="toggle-study-mode" data-mode="time" data-prayer="${p.id}">Jam</button>
              </div>
            </div>

            <!-- Jeda / Waktu Mulai Input -->
            <div class="input-row ${isStudyMinMode ? '' : 'is-hidden'}" data-study-row="minute-${p.id}">
              <span class="input-row__label">Jeda</span>
              <input type="number" value="${s.offset}" min="0" max="300" data-action="study-offset" data-prayer="${p.id}">
              <span class="input-row__unit">mnt pasca ${p.name}</span>
            </div>

            <div class="input-row ${!isStudyMinMode ? '' : 'is-hidden'}" data-study-row="time-${p.id}">
              <span class="input-row__label">Mulai</span>
              <input type="time" value="${studyStart || '13:00'}" data-action="study-time" data-prayer="${p.id}" style="width:90px; color-scheme:dark; background:var(--bg-input); border:1px solid var(--border-card); border-radius:6px; color:#fff; font-weight:700; text-align:center;">
              <span class="input-row__unit">WITA</span>
            </div>

            <!-- Durasi Belajar -->
            <div class="input-row">
              <span class="input-row__label">Durasi</span>
              <input type="number" value="${s.duration}" min="5" max="480" data-action="study-duration" data-prayer="${p.id}">
              <span class="input-row__unit">menit</span>
            </div>

            ${studyStart ? `
            <div class="study-preview">
              📚 ${studyStart} — ${studyEnd}
            </div>` : ''}
          </div>
        </div>

        <!-- Tab Pane 2: Iqomah Customization -->
        <div class="card-tab-pane" data-pane="iqomah-${p.id}">
          <div class="iqomah-inputs">
            <div class="input-row">
              <span class="input-row__label">Jeda Iqomah</span>
              <input type="number" value="${s.iqomah}" min="1" max="60" data-action="iqomah-duration" data-prayer="${p.id}">
              <span class="input-row__unit">menit</span>
            </div>
            <p style="font-size:0.68rem; color:var(--text-muted); margin-top:0.25rem;">
              Masjid Landasan Ulin • Jalan: <strong>${travel} mnt</strong>
            </p>
          </div>
        </div>
      </div>`;
  }).join('');

  grid.addEventListener('change', handleCardInput);
  grid.addEventListener('input', handleCardInput);
  grid.addEventListener('click', handleCardClick);
}

function handleCardClick(e) {
  // Tab switcher
  const tabBtn = e.target.closest('.card-tab-btn');
  if (tabBtn) {
    const prayerId = tabBtn.dataset.prayer;
    const tabType = tabBtn.dataset.tab;
    const card = tabBtn.closest('.prayer-card');

    card.querySelectorAll('.card-tab-btn').forEach(b => b.classList.remove('is-active'));
    tabBtn.classList.add('is-active');

    const studyPane = card.querySelector(`[data-pane="study-${prayerId}"]`);
    const iqomahPane = card.querySelector(`[data-pane="iqomah-${prayerId}"]`);

    if (tabType === 'study') {
      studyPane.classList.add('is-active');
      iqomahPane.classList.remove('is-active');
    } else {
      iqomahPane.classList.add('is-active');
      studyPane.classList.remove('is-active');
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
    // sync time input
    const timeInput = document.querySelector(`[data-action="study-time"][data-prayer="${prayerId}"]`);
    if (timeInput) timeInput.value = addMinutes(prayerTime, s.offset);
  } else if (action === 'study-time') {
    const targetTime = el.value;
    const prayerMins = timeToMinutes(prayerTime);
    const targetMins = timeToMinutes(targetTime);
    let diff = targetMins >= prayerMins ? (targetMins - prayerMins) : ((1440 - prayerMins) + targetMins);
    s.offset = clamp(diff, 0, 300);
    // sync minute input
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
    // Mode Menit: Label di atas menampilkan JAM
    recipEl.innerHTML = `⏰ Mulai: <strong>${studyStart} WITA</strong>`;
  } else {
    // Mode Jam: Label di atas menampilkan MENIT
    recipEl.innerHTML = `⏳ Jarak: <strong>${s.offset}m</strong> pasca ${pName}`;
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
  const studyStr = studyHours > 0
    ? `${studyHours}j ${studyRemMins > 0 ? studyRemMins + 'm' : ''}`
    : `${studyRemMins} mnt`;

  const summaryHoursEl = document.getElementById('summaryStudyHours');
  const summarySessionsEl = document.getElementById('summaryStudySessions');
  if (summaryHoursEl) summaryHoursEl.textContent = studyStr;
  if (summarySessionsEl) summarySessionsEl.textContent = `${studySessions} Sesi`;

  // Render Timeline
  timelineEl.innerHTML = filteredEvents.map(e => {
    let itemClass = `timeline-item timeline-item--${e.type}`;
    let timeDisplay = e.time;
    if (e.endTime) timeDisplay += ` — ${e.endTime}`;

    return `
      <div class="${itemClass}">
        <div class="timeline-item__dot"></div>
        <div class="timeline-item__content">
          <div class="timeline-item__time">${timeDisplay}</div>
          <div class="timeline-item__label">${e.title}</div>
          <div class="timeline-item__detail">${e.detail}</div>
        </div>
      </div>`;
  }).join('');
}

/* =============================================
   LIVE CLOCK & BENTO HERO SYNCHRONIZER
   ============================================= */
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  const clockEl = document.getElementById('clockTime');
  if (clockEl) clockEl.textContent = `${h}:${m}:${s} WITA`;

  if (!state.loaded) return;

  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const heroName = document.getElementById('heroPrayerName');
  const heroAdzan = document.getElementById('heroAdzanTime');
  const heroIcon = document.getElementById('heroIcon');
  const heroArabic = document.getElementById('heroArabicCalligraphy');
  const heroCountdown = document.getElementById('heroCountdownTimer');
  const heroIqomah = document.getElementById('heroIqomahTime');
  const heroDepart = document.getElementById('heroDepartTime');
  const heroProgressBar = document.getElementById('heroProgressBar');

  let prevPrayer = null;
  let nextPrayer = null;

  for (let i = 0; i < PRAYERS.length; i++) {
    const p = PRAYERS[i];
    const pMins = timeToMinutes(state.prayerTimes[p.id]);
    if (pMins > nowMins) {
      nextPrayer = { prayer: p, minutes: pMins };
      prevPrayer = i > 0 ? { prayer: PRAYERS[i - 1], minutes: timeToMinutes(state.prayerTimes[PRAYERS[i - 1].id]) } : null;
      break;
    }
  }

  const travel = state.sleepConfig.globalTravel;

  if (nextPrayer) {
    const p = nextPrayer.prayer;
    const adzanTime = state.prayerTimes[p.id];
    const s = state.settings[p.id];
    const iqomahTime = addMinutes(adzanTime, s.iqomah);
    const departTime = subtractMinutes(iqomahTime, travel);

    if (heroName) heroName.textContent = p.name;
    if (heroAdzan) heroAdzan.textContent = `${adzanTime} WITA`;
    if (heroIcon) heroIcon.textContent = p.icon;
    if (heroArabic) heroArabic.textContent = p.arabic;
    if (heroIqomah) heroIqomah.textContent = iqomahTime;
    if (heroDepart) heroDepart.textContent = departTime;

    const nextSecs = nextPrayer.minutes * 60;
    const diffSecs = nextSecs - nowSecs;
    const dh = Math.floor(diffSecs / 3600);
    const dm = Math.floor((diffSecs % 3600) / 60);
    const ds = diffSecs % 60;

    const countdownStr = dh > 0 ? `${dh}j ${dm}m ${ds}s` : `${dm}m ${ds}s`;
    if (heroCountdown) heroCountdown.textContent = countdownStr;

    if (heroProgressBar) {
      const prevSecs = prevPrayer ? prevPrayer.minutes * 60 : (nextPrayer.minutes - 180) * 60;
      const totalSpan = Math.max(1, nextSecs - prevSecs);
      const elapsed = Math.max(0, nowSecs - prevSecs);
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
    if (heroAdzan) heroAdzan.textContent = `${fajrAdzan} WITA`;
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
