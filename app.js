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

const FALLBACK_TIMINGS = {
  fajr: '04:44',
  dhuhr: '12:08',
  asr: '15:28',
  maghrib: '18:14',
  isha: '19:23',
};

const DEFAULT_ALARM = {
  enabled: true,
  soundType: 'adhan_melody', // 'adhan_melody' | 'soft_chime' | 'beep_alert'
  volume: 80,                // 0 - 100
  notifyEarly: true,         // 10 menit jelang adzan
  notifyAtAdzan: true,       // tepat waktu adzan
  prayers: {
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
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
  prayerTimes: { ...FALLBACK_TIMINGS },
  rawPrayerTimes: { ...FALLBACK_TIMINGS },
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
  alarmConfig: {
    ...DEFAULT_ALARM,
    prayers: { ...DEFAULT_ALARM.prayers },
  },
  lastTriggeredAlarm: null,
  activeFilter: 'all',
  loaded: true,
};

/* =============================================
   INITIALIZATION
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
  // Instant render first with cached/fallback data to avoid waiting
  renderAll();
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

  // 5. Alarm Settings
  if (saved && saved.alarm) {
    state.alarmConfig.enabled = saved.alarm.enabled ?? DEFAULT_ALARM.enabled;
    state.alarmConfig.soundType = saved.alarm.soundType ?? DEFAULT_ALARM.soundType;
    state.alarmConfig.volume = saved.alarm.volume ?? DEFAULT_ALARM.volume;
    state.alarmConfig.notifyEarly = saved.alarm.notifyEarly ?? DEFAULT_ALARM.notifyEarly;
    state.alarmConfig.notifyAtAdzan = saved.alarm.notifyAtAdzan ?? DEFAULT_ALARM.notifyAtAdzan;
    if (saved.alarm.prayers) {
      state.alarmConfig.prayers = {
        fajr: saved.alarm.prayers.fajr ?? true,
        dhuhr: saved.alarm.prayers.dhuhr ?? true,
        asr: saved.alarm.prayers.asr ?? true,
        maghrib: saved.alarm.prayers.maghrib ?? true,
        isha: saved.alarm.prayers.isha ?? true,
      };
    }
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
  updateAlarmUI();
}

function saveSettings() {
  const dataToSave = {
    location: state.location,
    ihtiyat: state.ihtiyat,
    prayers: state.settings,
    sleep: state.sleepConfig,
    alarm: state.alarmConfig,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch(e) {}
}

/* =============================================
   EVENT LISTENERS & CONTROLS
   ============================================= */
function initEventListeners() {

  // ===== TAB NAVIGATION SYSTEM =====
  function switchView(viewName) {
    const panes = {
      prayers: document.getElementById('panePrayers'),
      productivity: document.getElementById('paneProductivity'),
      settings: document.getElementById('paneSettings')
    };
    const buttons = {
      prayers: document.getElementById('tabBtnPrayers'),
      productivity: document.getElementById('tabBtnProductivity'),
      settings: document.getElementById('tabBtnSettings')
    };

    Object.keys(panes).forEach(k => {
      if (panes[k]) panes[k].classList.toggle('is-hidden', k !== viewName);
      if (buttons[k]) {
        buttons[k].classList.toggle('is-active', k === viewName);
        buttons[k].setAttribute('aria-selected', k === viewName ? 'true' : 'false');
      }
    });

    if (viewName === 'productivity') {
      renderSchedule();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });

  // Top Location pill: switch to settings & scroll to GPS
  const topLocBtn = document.getElementById('topLocationBtn');
  if (topLocBtn) {
    topLocBtn.addEventListener('click', () => {
      switchView('settings');
      const gpsBox = document.querySelector('.config-box--location');
      if (gpsBox) gpsBox.scrollIntoView({ behavior: 'smooth' });
      detectGpsLocation();
    });
  }

  // Top Alarm pill: switch to settings & scroll to alarm section
  const topAlmBtn = document.getElementById('topAlarmBtn');
  if (topAlmBtn) {
    topAlmBtn.addEventListener('click', () => {
      switchView('settings');
      const alarmSec = document.getElementById('drawerAlarmSection');
      if (alarmSec) alarmSec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Quick Prayer Edit Modal Listeners
  const prayerGrid = document.getElementById('prayerGrid');
  if (prayerGrid) {
    prayerGrid.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="open-edit-modal"]');
      if (editBtn) {
        const prayerId = editBtn.dataset.prayer;
        if (prayerId) openPrayerEditModal(prayerId);
      }
    });
  }

  const btnCloseEdit = document.getElementById('btnCloseEditModal');
  if (btnCloseEdit) btnCloseEdit.addEventListener('click', closePrayerEditModal);

  const btnSaveEdit = document.getElementById('btnSaveEditModal');
  if (btnSaveEdit) btnSaveEdit.addEventListener('click', savePrayerEditModal);

  const editStudyToggle = document.getElementById('editPrayerStudyToggle');
  const editStudyContainer = document.getElementById('editStudyContainer');
  if (editStudyToggle && editStudyContainer) {
    editStudyToggle.addEventListener('change', (e) => {
      editStudyContainer.style.display = e.target.checked ? 'flex' : 'none';
    });
  }

  const editBtnMin = document.getElementById('editBtnModeMinute');
  const editBtnTime = document.getElementById('editBtnModeTime');
  if (editBtnMin && editBtnTime) {
    editBtnMin.addEventListener('click', () => setEditModalStudyMode('minute'));
    editBtnTime.addEventListener('click', () => setEditModalStudyMode('time'));
  }

  const prayerEditModal = document.getElementById('prayerEditModal');
  if (prayerEditModal) {
    prayerEditModal.addEventListener('click', (e) => {
      if (e.target === prayerEditModal) closePrayerEditModal();
    });
  }

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

  // 5. Top Bar Alarm Pill
  const topAlarmBtn = document.getElementById('topAlarmBtn');
  if (topAlarmBtn) {
    topAlarmBtn.addEventListener('click', () => {
      const panel = document.getElementById('sleepConfigPanel');
      const btnText = document.getElementById('btnToggleSleepConfigText');
      if (panel && panel.classList.contains('is-hidden')) {
        panel.classList.remove('is-hidden');
        if (btnText) btnText.textContent = 'Tutup Pengaturan';
      }
      const section = document.getElementById('drawerAlarmSection');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // 6. Alarm Master Switch
  const toggleAlarmMaster = document.getElementById('toggleAlarmMaster');
  if (toggleAlarmMaster) {
    toggleAlarmMaster.addEventListener('change', (e) => {
      state.alarmConfig.enabled = e.target.checked;
      updateAlarmUI();
      saveSettings();
    });
  }

  // 7. Sound Type Selection
  const alarmSoundSelect = document.getElementById('alarmSoundSelect');
  if (alarmSoundSelect) {
    alarmSoundSelect.addEventListener('change', (e) => {
      state.alarmConfig.soundType = e.target.value;
      saveSettings();
      playConfiguredAlarmSound();
    });
  }

  // 8. Volume Slider
  const alarmVolumeSlider = document.getElementById('alarmVolumeSlider');
  const alarmVolumeValue = document.getElementById('alarmVolumeValue');
  if (alarmVolumeSlider) {
    alarmVolumeSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.alarmConfig.volume = val;
      if (alarmVolumeValue) alarmVolumeValue.textContent = `${val}%`;
    });
    alarmVolumeSlider.addEventListener('change', () => {
      saveSettings();
    });
  }

  // 9. Sound Test Button
  const btnTestSound = document.getElementById('btnTestSound');
  const btnTestSoundIcon = document.getElementById('btnTestSoundIcon');
  const btnTestSoundText = document.getElementById('btnTestSoundText');
  if (btnTestSound) {
    btnTestSound.addEventListener('click', () => {
      if (isPlayingSoundTest) {
        stopAudio();
      } else {
        isPlayingSoundTest = true;
        btnTestSound.classList.add('is-playing');
        if (btnTestSoundIcon) btnTestSoundIcon.textContent = '⏹️';
        if (btnTestSoundText) btnTestSoundText.textContent = 'Hentikan Suara';
        playConfiguredAlarmSound();
      }
    });
  }

  // 10. Web Notification Permission Button
  const btnRequestNotif = document.getElementById('btnRequestNotifPermission');
  if (btnRequestNotif) {
    btnRequestNotif.addEventListener('click', () => {
      requestNotificationPermission();
    });
  }

  // 11. Early Reminder Checkbox
  const toggleEarly = document.getElementById('toggleEarlyReminder');
  if (toggleEarly) {
    toggleEarly.addEventListener('change', (e) => {
      state.alarmConfig.notifyEarly = e.target.checked;
      saveSettings();
    });
  }

  // 12. Individual Prayer Alarm Chips
  PRAYERS.forEach(p => {
    const chip = document.querySelector(`.alarm-chip[data-prayer="${p.id}"]`);
    const input = document.getElementById(`alarmPrayer_${p.id}`);
    if (chip && input) {
      chip.addEventListener('click', (e) => {
        if (e.target !== input) {
          input.checked = !input.checked;
        }
        state.alarmConfig.prayers[p.id] = input.checked;
        chip.classList.toggle('is-active', input.checked);
        saveSettings();
      });
    }
  });

  // 13. Dismiss Alarm Modal
  const btnDismiss = document.getElementById('btnDismissAlarm');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', dismissAlarmModal);
  }
  const alarmModal = document.getElementById('alarmModal');
  if (alarmModal) {
    alarmModal.addEventListener('click', (e) => {
      if (e.target === alarmModal) dismissAlarmModal();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissAlarmModal();
  });
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
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
    clearTimeout(timeoutId);
    console.warn('Network fetch fallback activated:', err.message);
    PRAYERS.forEach(p => {
      const raw = FALLBACK_TIMINGS[p.id] || '12:00';
      state.rawPrayerTimes[p.id] = raw;
      state.prayerTimes[p.id] = state.ihtiyat.enabled ? addMinutes(raw, state.ihtiyat.minutes) : raw;
    });
    state.loaded = true;
    renderAll();
  }
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
  if (!grid) return;
  const travel = state.sleepConfig.globalTravel;
  const currentPrayerId = getCurrentPrayerId();

  grid.innerHTML = PRAYERS.map(p => {
    const time = state.prayerTimes[p.id] || '--:--';
    const s = state.settings[p.id];
    const isCurrent = p.id === currentPrayerId;

    const iqomahTime = time !== '--:--' ? addMinutes(time, s.iqomah) : '--:--';
    const departTime = time !== '--:--' ? subtractMinutes(iqomahTime, travel) : '--:--';
    const studyStartTime = time !== '--:--' ? addMinutes(time, s.offset) : '--:--';

    return `
      <div class="prayer-card prayer-card--clean ${isCurrent ? 'is-active' : ''}" data-id="${p.id}">
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

        <div class="prayer-card__adzan-row">
          <div class="prayer-card__big-time">${time}</div>
        </div>

        <div class="prayer-timing-pills">
          <div class="timing-pill-row">
            <span class="timing-pill-label"><span>⏱️</span> Iqomah (+${s.iqomah}m)</span>
            <span class="timing-pill-val timing-pill-val--iqomah">${iqomahTime}</span>
          </div>
          <div class="timing-pill-row">
            <span class="timing-pill-label"><span>🚶</span> Berangkat (-${travel}m)</span>
            <span class="timing-pill-val timing-pill-val--depart">${departTime}</span>
          </div>
        </div>

        ${s.enabled ? `
          <div class="study-status-badge">
            <span>📚 Sesi Belajar: <strong>${studyStartTime}</strong></span>
            <span>${s.duration}m</span>
          </div>
        ` : `
          <div class="study-status-badge is-inactive">
            <span>Belajar Tidak Dijadwalkan</span>
          </div>
        `}

        <button type="button" class="btn-card-edit" onclick="openPrayerEditModal('${p.id}')">
          <span>✏️</span> Atur Waktu & Belajar
        </button>
      </div>
    `;
  }).join('');
}

let activeEditingPrayerId = null;

function openPrayerEditModal(prayerId) {
  activeEditingPrayerId = prayerId;
  const p = PRAYERS.find(item => item.id === prayerId);
  if (!p) return;
  const s = state.settings[prayerId];
  const prayerTime = state.prayerTimes[prayerId] || '--:--';
  const tz = state.location.tzLabel;

  const modal = document.getElementById('prayerEditModal');
  const title = document.getElementById('editModalTitle');
  const subtitle = document.getElementById('editModalSubtitle');
  const icon = document.getElementById('editModalIcon');
  const iqomahInput = document.getElementById('editPrayerIqomah');
  const studyToggle = document.getElementById('editPrayerStudyToggle');
  const studyContainer = document.getElementById('editStudyContainer');
  const offsetInput = document.getElementById('editPrayerStudyOffset');
  const targetTimeInput = document.getElementById('editPrayerStudyTargetTime');
  const durationInput = document.getElementById('editPrayerStudyDuration');

  if (title) title.textContent = `Atur Sholat ${p.name}`;
  if (subtitle) subtitle.textContent = `Waktu Adzan Pukul ${prayerTime} ${tz}`;
  if (icon) icon.textContent = p.icon;
  if (iqomahInput) iqomahInput.value = s.iqomah;
  if (studyToggle) studyToggle.checked = s.enabled;
  if (studyContainer) studyContainer.style.display = s.enabled ? 'flex' : 'none';
  if (offsetInput) offsetInput.value = s.offset;
  if (targetTimeInput && prayerTime !== '--:--') targetTimeInput.value = addMinutes(prayerTime, s.offset);
  if (durationInput) durationInput.value = s.duration;

  setEditModalStudyMode(s.studyMode || 'minute');

  if (modal) modal.classList.remove('is-hidden');
}

function closePrayerEditModal() {
  const modal = document.getElementById('prayerEditModal');
  if (modal) modal.classList.add('is-hidden');
  activeEditingPrayerId = null;
}

function setEditModalStudyMode(mode) {
  const minRow = document.getElementById('editStudyMinuteRow');
  const timeRow = document.getElementById('editStudyTimeRow');
  const btnMin = document.getElementById('editBtnModeMinute');
  const btnTime = document.getElementById('editBtnModeTime');

  if (minRow) minRow.classList.toggle('is-hidden', mode !== 'minute');
  if (timeRow) timeRow.classList.toggle('is-hidden', mode === 'minute');
  if (btnMin) btnMin.classList.toggle('is-active', mode === 'minute');
  if (btnTime) btnTime.classList.toggle('is-active', mode !== 'minute');
}

function savePrayerEditModal() {
  if (!activeEditingPrayerId) return;
  const pId = activeEditingPrayerId;
  const s = state.settings[pId];
  const prayerTime = state.prayerTimes[pId] || '12:00';

  const iqomahInput = document.getElementById('editPrayerIqomah');
  const studyToggle = document.getElementById('editPrayerStudyToggle');
  const offsetInput = document.getElementById('editPrayerStudyOffset');
  const timeInput = document.getElementById('editPrayerStudyTargetTime');
  const durationInput = document.getElementById('editPrayerStudyDuration');
  const isMinute = document.getElementById('editBtnModeMinute')?.classList.contains('is-active');

  if (iqomahInput) s.iqomah = clamp(parseInt(iqomahInput.value) || 10, 1, 60);
  if (studyToggle) s.enabled = studyToggle.checked;
  s.studyMode = isMinute ? 'minute' : 'time';

  if (isMinute) {
    if (offsetInput) s.offset = clamp(parseInt(offsetInput.value) || 30, 0, 300);
  } else {
    if (timeInput && prayerTime !== '--:--') {
      const pMins = timeToMinutes(prayerTime);
      const tMins = timeToMinutes(timeInput.value);
      let diff = tMins >= pMins ? (tMins - pMins) : ((1440 - pMins) + tMins);
      s.offset = clamp(diff, 0, 300);
    }
  }

  if (durationInput) s.duration = clamp(parseInt(durationInput.value) || 60, 15, 480);

  saveSettings();
  renderPrayerCards();
  renderSchedule();
  closePrayerEditModal();
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
    checkAlarmTriggers(now);
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


/* =============================================
   FITUR CERDAS: AUDIO ADZAN, ALARM & NOTIFIKASI
   ============================================= */
let audioCtx = null;
let activeOscillators = [];
let isPlayingSoundTest = false;
let alarmCountdownTimer = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function stopAudio() {
  activeOscillators.forEach(osc => {
    try { osc.stop(); } catch(e) {}
  });
  activeOscillators = [];
  
  const testBtn = document.getElementById('btnTestSound');
  const testIcon = document.getElementById('btnTestSoundIcon');
  const testText = document.getElementById('btnTestSoundText');
  if (testBtn) testBtn.classList.remove('is-playing');
  if (testIcon) testIcon.textContent = '▶';
  if (testText) testText.textContent = 'Uji Coba Suara';
  isPlayingSoundTest = false;
}

/* 1. Harmoni Melodi Adzan (Maqam Hijaz / Rast - Takbir) */
function playAdhanMelody(volumePercent = 80) {
  const ctx = getAudioContext();
  if (!ctx) return;
  stopAudio();

  const vol = (volumePercent / 100) * 0.45;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(vol, ctx.currentTime);
  masterGain.connect(ctx.destination);

  // Catatan Maqam Hijaz: D4, F#4, A4, Bb4, C#5, D5, A4
  const notes = [
    { f: 293.66, t: 0.0, d: 0.75 },  // D4
    { f: 369.99, t: 0.65, d: 0.85 }, // F#4
    { f: 440.00, t: 1.45, d: 1.15 }, // A4
    { f: 466.16, t: 2.50, d: 0.70 }, // Bb4
    { f: 554.37, t: 3.10, d: 0.80 }, // C#5
    { f: 587.33, t: 3.80, d: 1.50 }, // D5
    { f: 440.00, t: 5.20, d: 1.80 }, // A4 (meluruh damai)
  ];

  notes.forEach(n => {
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(n.f * 2, ctx.currentTime + n.t);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, ctx.currentTime + n.t);

    const noteGain = ctx.createGain();
    const st = ctx.currentTime + n.t;
    const et = st + n.d;

    noteGain.gain.setValueAtTime(0.0001, st);
    noteGain.gain.exponentialRampToValueAtTime(0.7, st + 0.15);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, et);

    osc1.connect(noteGain);
    osc2.connect(noteGain);
    noteGain.connect(filter);
    filter.connect(masterGain);

    osc1.start(st);
    osc2.start(st);
    osc1.stop(et);
    osc2.stop(et);

    activeOscillators.push(osc1, osc2);
  });
}

/* 2. Genta / Chime Islami Lembut */
function playSoftChime(volumePercent = 80) {
  const ctx = getAudioContext();
  if (!ctx) return;
  stopAudio();

  const vol = (volumePercent / 100) * 0.45;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(vol, ctx.currentTime);
  masterGain.connect(ctx.destination);

  [523.25, 783.99, 1046.5].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.6 / (idx + 1), ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.8);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 4.0);
    activeOscillators.push(osc);
  });
}

/* 3. Beep Modern Alert */
function playBeepAlert(volumePercent = 80) {
  const ctx = getAudioContext();
  if (!ctx) return;
  stopAudio();

  const vol = (volumePercent / 100) * 0.4;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(vol, ctx.currentTime);
  masterGain.connect(ctx.destination);

  [{ f: 880, t: 0 }, { f: 1174.66, t: 0.18 }].forEach(item => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(item.f, ctx.currentTime + item.t);

    const gain = ctx.createGain();
    const st = ctx.currentTime + item.t;
    gain.gain.setValueAtTime(0.0001, st);
    gain.gain.linearRampToValueAtTime(0.7, st + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(st);
    osc.stop(st + 0.4);
    activeOscillators.push(osc);
  });
}

function playConfiguredAlarmSound() {
  const st = state.alarmConfig.soundType;
  const vol = state.alarmConfig.volume;
  if (st === 'soft_chime') {
    playSoftChime(vol);
  } else if (st === 'beep_alert') {
    playBeepAlert(vol);
  } else {
    playAdhanMelody(vol);
  }
}

/* Update UI Controls from State */
function updateAlarmUI() {
  const topAlarmBtn = document.getElementById('topAlarmBtn');
  const topAlarmText = document.getElementById('topAlarmText');
  const topAlarmIcon = document.getElementById('topAlarmIcon');
  const toggleMaster = document.getElementById('toggleAlarmMaster');
  const soundSelect = document.getElementById('alarmSoundSelect');
  const volumeSlider = document.getElementById('alarmVolumeSlider');
  const volumeText = document.getElementById('alarmVolumeValue');
  const earlyCheck = document.getElementById('toggleEarlyReminder');

  const enabled = state.alarmConfig.enabled;

  if (topAlarmBtn) {
    if (enabled) {
      topAlarmBtn.classList.remove('is-disabled');
      if (topAlarmIcon) topAlarmIcon.textContent = '🔔';
      if (topAlarmText) topAlarmText.textContent = 'Alarm Aktif';
    } else {
      topAlarmBtn.classList.add('is-disabled');
      if (topAlarmIcon) topAlarmIcon.textContent = '🔕';
      if (topAlarmText) topAlarmText.textContent = 'Alarm Mati';
    }
  }

  if (toggleMaster) toggleMaster.checked = enabled;
  if (soundSelect) soundSelect.value = state.alarmConfig.soundType;
  if (volumeSlider) volumeSlider.value = state.alarmConfig.volume;
  if (volumeText) volumeText.textContent = `${state.alarmConfig.volume}%`;
  if (earlyCheck) earlyCheck.checked = state.alarmConfig.notifyEarly;

  // Sync prayer chips
  PRAYERS.forEach(p => {
    const input = document.getElementById(`alarmPrayer_${p.id}`);
    const chip = document.querySelector(`.alarm-chip[data-prayer="${p.id}"]`);
    const isChecked = !!state.alarmConfig.prayers[p.id];
    if (input) input.checked = isChecked;
    if (chip) {
      chip.classList.toggle('is-active', isChecked);
    }
  });

  updateNotificationPermissionUI();
}

function updateNotificationPermissionUI() {
  const notifBtn = document.getElementById('btnRequestNotifPermission');
  const notifIcon = document.getElementById('notifBtnIcon');
  const notifText = document.getElementById('notifBtnText');
  const notifBadge = document.getElementById('notifStatusBadge');

  if (!('Notification' in window)) {
    if (notifBtn) notifBtn.style.display = 'none';
    if (notifBadge) notifBadge.textContent = 'Browser ini tidak mendukung Web Notifications';
    return;
  }

  if (Notification.permission === 'granted') {
    if (notifBtn) {
      notifBtn.classList.add('is-granted');
      if (notifIcon) notifIcon.textContent = '✅';
      if (notifText) notifText.textContent = 'Notifikasi Aktif';
    }
    if (notifBadge) notifBadge.innerHTML = '✅ Notifikasi browser aktif & siap berdering di latar belakang.';
  } else if (Notification.permission === 'denied') {
    if (notifBtn) {
      notifBtn.classList.remove('is-granted');
      if (notifIcon) notifIcon.textContent = '🚫';
      if (notifText) notifText.textContent = 'Izin Diblokir';
    }
    if (notifBadge) notifBadge.innerHTML = '⚠️ Izin notifikasi dinonaktifkan di setelan browser Anda.';
  } else {
    if (notifBtn) {
      notifBtn.classList.remove('is-granted');
      if (notifIcon) notifIcon.textContent = '🔔';
      if (notifText) notifText.textContent = 'Aktifkan Notifikasi Layar';
    }
    if (notifBadge) notifBadge.innerHTML = 'Klik tombol di atas agar Mizan dapat menampilkan notifikasi saat tab tidak aktif.';
  }
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Browser Anda tidak mendukung Web Notification API.');
    return;
  }
  Notification.requestPermission().then(permission => {
    updateNotificationPermissionUI();
    if (permission === 'granted') {
      try {
        new Notification('⚖️ Mizan — Notifikasi Aktif', {
          body: 'Notifikasi waktu sholat dan pengingat harian berhasil diaktifkan.',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚖️</text></svg>'
        });
      } catch(e) {}
    }
  });
}

function sendBrowserNotification(prayer, isEarly) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const adzanTime = state.prayerTimes[prayer.id];
  const tz = state.location.tzLabel;
  const iqomahMins = state.settings[prayer.id]?.iqomah || prayer.defaultIqomah;

  const title = isEarly 
    ? `⏳ 10 Menit Menjelang Sholat ${prayer.name}`
    : `🕌 Waktu Sholat ${prayer.name} Telah Tiba! (${adzanTime} ${tz})`;
  const body = isEarly
    ? `Pukul ${adzanTime} ${tz}. Segera selesaikan kegiatan dan ambil wudhu untuk persiapan ke masjid.`
    : `Iqomah masjid diperkirakan dalam ${iqomahMins} menit. Mari raih keutamaan sholat awal waktu!`;

  try {
    new Notification(title, {
      body: body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🕌</text></svg>',
      tag: `mizan-${prayer.id}`
    });
  } catch(e) {}
}

/* Trigger Modal & Audio */
function triggerAlarmModal(prayer, isEarly = false) {
  // 1. Play Audio
  playConfiguredAlarmSound();

  // 2. Vibrate Device
  if (navigator.vibrate) {
    try { navigator.vibrate([300, 150, 300, 150, 500]); } catch(e){}
  }

  // 3. Send Web Notification
  sendBrowserNotification(prayer, isEarly);

  // 4. Populate & Reveal Fullscreen Glassmorphism Modal
  const modal = document.getElementById('alarmModal');
  const title = document.getElementById('alarmModalTitle');
  const badge = document.getElementById('alarmModalBadge');
  const timeEl = document.getElementById('alarmModalTime');
  const icon = document.getElementById('alarmModalIcon');
  const countLabel = document.getElementById('alarmModalCountLabel');
  const countVal = document.getElementById('alarmModalIqomahCount');

  const adzanTime = state.prayerTimes[prayer.id];
  const tz = state.location.tzLabel;
  const iqomahMins = state.settings[prayer.id]?.iqomah || prayer.defaultIqomah;

  if (modal) {
    modal.classList.remove('is-hidden');
    if (icon) icon.textContent = prayer.icon || '🕌';
    if (timeEl) timeEl.innerHTML = `${adzanTime} <span class="alarm-modal-tz" id="alarmModalTz">${tz}</span>`;

    if (isEarly) {
      if (badge) badge.textContent = '⏳ PERSIAPAN (10 MENIT LAGI)';
      if (title) title.textContent = `Menjelang Waktu Sholat ${prayer.name}`;
      if (countLabel) countLabel.textContent = 'Waktu Adzan Tiba Dalam:';
      if (countVal) countVal.textContent = '10:00 Menit';
    } else {
      if (badge) badge.textContent = '🕌 WAKTU SHOLAT TELAH TIBA';
      if (title) title.textContent = `Waktu Sholat ${prayer.name}`;
      if (countLabel) countLabel.textContent = 'Estimasi Iqomah Masjid Dimulai Dalam:';
      if (countVal) countVal.textContent = `${iqomahMins}:00 Menit`;
    }

    // Live countdown timer in modal
    if (alarmCountdownTimer) clearInterval(alarmCountdownTimer);
    let remainingSecs = (isEarly ? 10 : iqomahMins) * 60;
    alarmCountdownTimer = setInterval(() => {
      remainingSecs--;
      if (remainingSecs <= 0) {
        clearInterval(alarmCountdownTimer);
        if (countVal) countVal.textContent = isEarly ? 'Waktu Adzan Tiba!' : 'Waktu Iqomah Tiba!';
      } else {
        const m = Math.floor(remainingSecs / 60);
        const s = remainingSecs % 60;
        if (countVal) countVal.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    }, 1000);
  }
}

function dismissAlarmModal() {
  stopAudio();
  if (alarmCountdownTimer) {
    clearInterval(alarmCountdownTimer);
    alarmCountdownTimer = null;
  }
  const modal = document.getElementById('alarmModal');
  if (modal) modal.classList.add('is-hidden');
}

/* Check triggers every second in updateClock() */
function checkAlarmTriggers(now) {
  if (!state.loaded || !state.alarmConfig.enabled) return;
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const currentHM = `${h}:${m}`;
  const s = now.getSeconds();

  // Check once during the first 2 seconds of each minute
  if (s > 2) return;

  PRAYERS.forEach(p => {
    if (!state.alarmConfig.prayers[p.id]) return;
    const adzanTime = state.prayerTimes[p.id];
    if (!adzanTime || adzanTime === '--:--') return;

    // 1. Exact Adzan Trigger
    if (state.alarmConfig.notifyAtAdzan && currentHM === adzanTime) {
      const key = `${p.id}-exact-${currentHM}`;
      if (state.lastTriggeredAlarm !== key) {
        state.lastTriggeredAlarm = key;
        triggerAlarmModal(p, false);
      }
    }

    // 2. 10-Minute Early Reminder
    if (state.alarmConfig.notifyEarly) {
      const earlyHM = subtractMinutes(adzanTime, 10);
      if (currentHM === earlyHM) {
        const key = `${p.id}-early-${currentHM}`;
        if (state.lastTriggeredAlarm !== key) {
          state.lastTriggeredAlarm = key;
          triggerAlarmModal(p, true);
        }
      }
    }
  });
}


window.switchView = switchView;
window.openPrayerEditModal = openPrayerEditModal;
window.closePrayerEditModal = closePrayerEditModal;
window.savePrayerEditModal = savePrayerEditModal;
