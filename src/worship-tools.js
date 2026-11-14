import { namesOfAllah } from './asma.js'

const QURAN_API = 'https://api.alquran.cloud/v1'
const ALADHAN_API = 'https://api.aladhan.com/v1'
const ADHAN_AUDIO_URL = 'https://www.islamcan.com/audio/adhan/azan1.mp3'
const LOCATION_KEY = 'noor-location'
const METHOD_KEY = 'noor-prayer-method'
const TASBEEH_KEY = 'noor-tasbeeh-count'
const PLAN_DAYS_KEY = 'noor-reading-plan-days'
const PLAN_PROGRESS_KEY = 'noor-reading-plan-progress'
const PRAYERS = [
  ['Fajr', 'Fajr'],
  ['Dhuhr', 'Dhuhr'],
  ['Asr', 'Asr'],
  ['Maghrib', 'Maghrib'],
  ['Isha', 'Isha'],
]
const METHODS = [
  [3, 'Muslim World League'],
  [2, 'ISNA'],
  [1, 'University of Islamic Sciences, Karachi'],
  [5, 'Egyptian General Authority'],
  [4, 'Umm Al-Qura, Makkah'],
]

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

async function fetchQuranData(url) {
  const cacheKey = `noor-quran-data:${url}`
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('The Quran text service is unavailable.')
    const result = await response.json()
    try {
      localStorage.setItem(cacheKey, JSON.stringify(result))
    } catch {}
    return result
  } catch (error) {
    const cached = readJSON(cacheKey, null)
    if (cached) return cached
    throw error
  }
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

let coordinates = readJSON(LOCATION_KEY, null)
let prayerData = null
let prayerError = ''
let prayerMethod = Number(localStorage.getItem(METHOD_KEY)) || 3
let tasbeehCount = Number(localStorage.getItem(TASBEEH_KEY)) || 0
let readingPlanDays = [30, 60, 90].includes(Number(localStorage.getItem(PLAN_DAYS_KEY)))
  ? Number(localStorage.getItem(PLAN_DAYS_KEY))
  : 30
let readingPlanProgress = readJSON(PLAN_PROGRESS_KEY, { date: '', verses: [] })
if (!Array.isArray(readingPlanProgress.verses)) readingPlanProgress = { date: '', verses: [] }
let hijriMonthOffset = 0
let adhanEnabled = localStorage.getItem('noor-adhan-enabled') === 'true'
let adhanTimer
let clockTimer
let dailyVersePromise
let currentQiblaBearing = 0
let compassHeading = null
let audioUnlocked = false
const adhanAudio = new Audio(ADHAN_AUDIO_URL)
adhanAudio.preload = 'none'

function prayerRows() {
  if (!prayerData?.timings) return '<div class="prayer-empty">Set your location to see today’s prayer times.</div>'
  return PRAYERS.map(([name, key]) => `
    <div class="prayer-time-row ${prayerData.nextPrayer === name ? 'is-next-prayer' : ''}">
      <span>${name}</span><time>${escapeHTML(cleanTime(prayerData.timings[key]))}</time>
    </div>`).join('')
}

function prayerWidgetMarkup(compact = false) {
  return `
    <section class="prayer-widget ${compact ? 'is-compact' : ''}" aria-label="Prayer times">
      <div class="widget-kicker"><span class="widget-symbol">✳</span> PRAYER TIMES</div>
      <div class="prayer-next-line"><div><span class="widget-caption">NEXT PRAYER</span><strong id="next-prayer-name">Set your location</strong></div><span id="prayer-countdown" class="prayer-countdown">--:--:--</span></div>
      <div class="prayer-location-line"><span id="prayer-location-label">Location is not set</span><button class="text-action" data-worship-action="locate">${coordinates ? 'Update' : 'Set location'}</button></div>
      <div class="prayer-times-list">${prayerRows()}</div>
      ${compact ? '' : `
        <div class="prayer-settings-row">
          <label class="select-label" for="prayer-method">Calculation</label>
          <select id="prayer-method" aria-label="Prayer time calculation method">${METHODS.map(([id, name]) => `<option value="${id}" ${id === prayerMethod ? 'selected' : ''}>${name}</option>`).join('')}</select>
        </div>
        <div class="adhan-setting">
          <div><strong>Adhan alert</strong><small>Sound and notification at prayer time</small></div>
          <button class="switch-button ${adhanEnabled ? 'is-on' : ''}" data-worship-action="toggle-adhan" aria-label="${adhanEnabled ? 'Turn off' : 'Turn on'} adhan alert" aria-pressed="${adhanEnabled}"><span></span></button>
        </div>
        <p class="permission-note" id="adhan-status" aria-live="polite">${adhanEnabled ? 'Adhan alert is on while this page is open.' : 'Allow notifications to receive prayer alerts.'}</p>`}
    </section>`
}

function qiblaWidgetMarkup() {
  return `
    <section class="qibla-widget" aria-label="Qibla compass">
      <div class="widget-kicker"><span class="widget-symbol">⌖</span> QIBLA DIRECTION</div>
      <div class="qibla-compass" id="qibla-compass" aria-label="Qibla compass">
        <span class="compass-tick compass-tick-n">N</span><span class="compass-tick compass-tick-e">E</span><span class="compass-tick compass-tick-s">S</span><span class="compass-tick compass-tick-w">W</span>
        <div class="compass-needle" id="qibla-needle"><span></span></div><span class="compass-center"></span>
      </div>
      <strong class="qibla-bearing" id="qibla-bearing">Set your location</strong>
      <p class="qibla-note" id="qibla-note">Find the direction of the Kaaba</p>
      <div class="qibla-actions"><button class="secondary-action" data-worship-action="locate">${coordinates ? 'Update location' : 'Use my location'}</button><button class="text-action" data-worship-action="enable-compass">Live compass</button></div>
    </section>`
}

function tasbeehWidgetMarkup() {
  return `
    <section class="tasbeeh-widget" aria-label="Tasbeeh counter">
      <div class="widget-kicker"><span class="widget-symbol">◉</span> TASBEEH</div>
      <p class="tasbeeh-invocation" lang="ar" dir="rtl">سُبْحَانَ اللَّهِ</p>
      <p class="tasbeeh-transliteration">SubhanAllah</p>
      <button class="tasbeeh-count-button" data-worship-action="count" aria-label="Add one tasbeeh"><span id="tasbeeh-count">${tasbeehCount}</span><small>TAP TO COUNT</small></button>
      <div class="tasbeeh-footer"><span>Cycle <strong id="tasbeeh-cycle">${Math.floor(tasbeehCount / 33) + 1}</strong></span><button class="text-action" data-worship-action="reset-count">Reset</button></div>
    </section>`
}

function dailyVerseMarkup() {
  return `
    <section class="daily-verse-widget" aria-label="Ayah of the day">
      <div class="widget-kicker"><span class="widget-symbol">۞</span> AYAH OF THE DAY</div>
      <div id="daily-verse-content" class="daily-verse-content"><span class="daily-verse-loading">A verse for today is on its way…</span></div>
    </section>`
}

function nameListMarkup() {
  return namesOfAllah.map(([arabic, transliteration, meaning], index) => `
    <article class="name-item" data-name-search="${escapeHTML(`${transliteration} ${meaning}`.toLowerCase())}">
      <span class="name-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="name-arabic" lang="ar" dir="rtl">${arabic}</span>
      <span class="name-copy"><strong>${transliteration}</strong><small>${meaning}</small></span>
    </article>`).join('')
}

export function homeWorshipMarkup() {
  return `
    <section class="home-worship" aria-label="Daily worship">
      <div class="home-worship-heading"><div><span class="surah-number">A MOMENT FOR YOURSELF</span><h2>Today, with intention</h2></div><button class="home-tools-link" data-action="tools">Open daily tools <span aria-hidden="true">↗</span></button></div>
      <div class="home-worship-grid">
        ${dailyVerseMarkup()}
        ${prayerWidgetMarkup(true)}
      </div>
      <nav class="worship-shortcuts" aria-label="Explore features">
        <button data-action="browse-surahs"><span aria-hidden="true">▤</span><strong>Read Quran</strong><small>Browse all surahs</small></button>
        <button data-action="tools" data-tools-target="daily"><span aria-hidden="true">۞</span><strong>Ayah of the day</strong><small>Read today’s reflection</small></button>
        <button data-action="tools" data-tools-target="names"><span aria-hidden="true">﷽</span><strong>99 Names</strong><small>Explore the names</small></button>
        <button data-action="tools" data-tools-target="qibla"><span aria-hidden="true">⌖</span><strong>Qibla compass</strong><small>Find the direction</small></button>
        <button data-action="tools" data-tools-target="prayer"><span aria-hidden="true">◷</span><strong>Prayer times</strong><small>Today’s schedule</small></button>
        <button data-action="tools" data-tools-target="adhan"><span aria-hidden="true">♫</span><strong>Adhan alert</strong><small>Set a prayer reminder</small></button>
        <button data-action="tools" data-tools-target="tasbeeh"><span aria-hidden="true">◉</span><strong>Tasbeeh</strong><small>Continue your count</small></button>
      </nav>
    </section>`
}

export function worshipToolsMarkup() {
  return `
    <section class="tools-page">
      <div class="tools-page-heading"><div class="tools-heading-copy"><button class="back-button" data-action="home" aria-label="Back to home">‹</button><div><span class="surah-number">A QUIETER RHYTHM</span><h1>Daily tools</h1><p>Prayer, remembrance, and reflection in one place.</p></div></div><span class="tools-heading-ornament" aria-hidden="true">۞</span></div>
      <div class="tools-feature-grid">
        ${prayerWidgetMarkup()}
        ${qiblaWidgetMarkup()}
        ${tasbeehWidgetMarkup()}
      </div>
      <div class="study-tools-grid">
        ${readingPlanMarkup()}
        ${hijriCalendarMarkup()}
      </div>
      <section class="names-section" id="names-section">
        <div class="section-heading"><div><span class="surah-number">ASMA UL HUSNA</span><h2>The 99 Names of Allah</h2></div><span class="names-total">99 names</span></div>
        <label class="names-search"><span aria-hidden="true">⌕</span><input id="names-search-input" type="search" placeholder="Search a name or meaning" autocomplete="off" aria-label="Search the 99 Names" /></label>
        <div class="names-grid" id="names-grid">${nameListMarkup()}</div>
      </section>
      <section class="tools-daily-verse" id="tools-daily-verse">${dailyVerseMarkup()}</section>
    </section>`
}

function cleanTime(time = '') {
  return String(time).split(' ')[0].replace(/[()]/g, '')
}

function calculateQibla(latitude, longitude) {
  const toRadians = (degrees) => degrees * Math.PI / 180
  const toDegrees = (radians) => radians * 180 / Math.PI
  const kaabaLat = toRadians(21.4225)
  const latitudeRadians = toRadians(latitude)
  const longitudeDifference = toRadians(39.8262 - longitude)
  const bearing = toDegrees(Math.atan2(
    Math.sin(longitudeDifference) * Math.cos(kaabaLat),
    Math.cos(latitudeRadians) * Math.sin(kaabaLat) - Math.sin(latitudeRadians) * Math.cos(kaabaLat) * Math.cos(longitudeDifference),
  ))
  return (bearing + 360) % 360
}

function currentPrayerMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function getNextPrayer() {
  if (!prayerData?.timings) return null
  const currentMinutes = currentPrayerMinutes()
  for (const [name, key] of PRAYERS) {
    const [hours, minutes] = cleanTime(prayerData.timings[key]).split(':').map(Number)
    const prayerMinutes = hours * 60 + minutes
    if (prayerMinutes > currentMinutes) {
      const target = new Date()
      target.setHours(hours, minutes, 0, 0)
      return { name, target, minutes: prayerMinutes }
    }
  }
  const [hours, minutes] = cleanTime(prayerData.timings.Fajr).split(':').map(Number)
  const target = new Date()
  target.setDate(target.getDate() + 1)
  target.setHours(hours, minutes, 0, 0)
  return { name: 'Fajr', target, minutes: hours * 60 + minutes }
}

function updatePrayerClock() {
  if (!prayerData?.timings) return
  const next = getNextPrayer()
  if (!next) return
  prayerData.nextPrayer = next.name
  const nextName = document.querySelector('#next-prayer-name')
  if (nextName) nextName.textContent = next.name
  const countdown = document.querySelector('#prayer-countdown')
  if (countdown) {
    const secondsLeft = Math.max(0, Math.floor((next.target.getTime() - Date.now()) / 1000))
    const hours = Math.floor(secondsLeft / 3600)
    const minutes = Math.floor((secondsLeft % 3600) / 60)
    const seconds = secondsLeft % 60
    countdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  document.querySelectorAll('.prayer-time-row').forEach((row) => {
    row.classList.toggle('is-next-prayer', row.firstElementChild?.textContent === next.name)
  })
}

function updateQiblaUI() {
  const bearingLabel = document.querySelector('#qibla-bearing')
  const note = document.querySelector('#qibla-note')
  const needle = document.querySelector('#qibla-needle')
  const widget = document.querySelector('.qibla-widget')
  const compass = document.querySelector('#qibla-compass')
  if (!bearingLabel || !coordinates) return
  const headingError = compassHeading === null
    ? Infinity
    : Math.abs(((currentQiblaBearing - compassHeading + 540) % 360) - 180)
  const aligned = headingError <= 5
  widget?.classList.toggle('is-aligned', aligned)
  compass?.setAttribute('aria-label', aligned ? 'Qibla direction aligned' : 'Qibla compass')
  bearingLabel.textContent = `${Math.round(currentQiblaBearing)}° from north`
  if (needle) needle.style.transform = `rotate(${currentQiblaBearing - (compassHeading || 0)}deg)`
  if (note) note.textContent = aligned
    ? 'You are facing the Qibla'
    : compassHeading === null
      ? 'Activate live compass to orient your phone'
      : 'Turn until the needle points to the Kaaba'
}

function renderPrayerData() {
  const locationLabel = document.querySelector('#prayer-location-label')
  if (locationLabel) locationLabel.textContent = coordinates
    ? `${coordinates.latitude.toFixed(2)}°, ${coordinates.longitude.toFixed(2)}°`
    : prayerError || 'Location is not set'

  const times = document.querySelector('.prayer-times-list')
  if (times) times.innerHTML = prayerRows()
  if (coordinates) {
    currentQiblaBearing = calculateQibla(coordinates.latitude, coordinates.longitude)
    updateQiblaUI()
  }
  updatePrayerClock()
  scheduleAdhan()
}

async function fetchPrayerTimes() {
  if (!coordinates) return
  prayerError = ''
  renderPrayerData()
  const timestamp = Math.floor(Date.now() / 1000)
  const url = `${ALADHAN_API}/timings/${timestamp}?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&method=${prayerMethod}`
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Prayer times are unavailable right now.')
    const result = await response.json()
    if (result.code !== 200 || !result.data?.timings) throw new Error('Prayer times could not be calculated.')
    prayerData = result.data
    renderPrayerData()
  } catch (error) {
    prayerError = error.message || 'Prayer times could not be loaded.'
    renderPrayerData()
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    prayerError = 'Location is not available in this browser.'
    renderPrayerData()
    return
  }
  prayerError = 'Waiting for location permission…'
  renderPrayerData()
  navigator.geolocation.getCurrentPosition((position) => {
    coordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }
    localStorage.setItem(LOCATION_KEY, JSON.stringify(coordinates))
    fetchPrayerTimes()
  }, (error) => {
    prayerError = error.code === error.PERMISSION_DENIED
      ? 'Location permission was denied.'
      : 'Could not get your location. Check device location settings.'
    renderPrayerData()
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 })
}

function showPrayerNotification(prayerName) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`It’s time for ${prayerName}`, {
      body: 'Noor prayer reminder',
      tag: `noor-prayer-${prayerName}`,
    })
  }
}

async function playAdhan() {
  try {
    adhanAudio.currentTime = 0
    await adhanAudio.play()
  } catch {
    const status = document.querySelector('#adhan-status')
    if (status) status.textContent = 'The adhan audio could not start. Check your connection or browser sound settings.'
  }
}

function scheduleAdhan() {
  clearTimeout(adhanTimer)
  if (!adhanEnabled || !prayerData?.timings) return
  const next = getNextPrayer()
  if (!next) return
  const delay = next.target.getTime() - Date.now()
  if (delay <= 0) return
  adhanTimer = setTimeout(() => {
    playAdhan()
    showPrayerNotification(next.name)
    scheduleAdhan()
  }, delay)
}

async function enableAdhan() {
  if (adhanEnabled) {
    adhanEnabled = false
    localStorage.setItem('noor-adhan-enabled', 'false')
    adhanAudio.pause()
    updateAdhanButton()
    scheduleAdhan()
    return
  }
  audioUnlocked = true
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission()
    } catch {}
  }
  adhanEnabled = true
  localStorage.setItem('noor-adhan-enabled', 'true')
  updateAdhanButton()
  scheduleAdhan()
}

function updateAdhanButton(message) {
  const button = document.querySelector('[data-worship-action="toggle-adhan"]')
  if (button) {
    button.classList.toggle('is-on', adhanEnabled)
    button.setAttribute('aria-pressed', String(adhanEnabled))
    button.setAttribute('aria-label', `${adhanEnabled ? 'Turn off' : 'Turn on'} adhan alert`)
  }
  const status = document.querySelector('#adhan-status')
  if (status) status.textContent = message || (adhanEnabled
    ? 'Adhan alert is on while this page is open.'
    : 'Allow notifications to receive prayer alerts.')
}

async function enableCompass() {
  const orientationAPI = window.DeviceOrientationEvent
  if (!orientationAPI) {
    const note = document.querySelector('#qibla-note')
    if (note) note.textContent = 'Live compass is not supported on this device.'
    return
  }
  if (typeof orientationAPI.requestPermission === 'function') {
    try {
      const permission = await orientationAPI.requestPermission()
      if (permission !== 'granted') throw new Error('Compass permission was denied.')
    } catch (error) {
      const note = document.querySelector('#qibla-note')
      if (note) note.textContent = error.message || 'Compass permission was denied.'
      return
    }
  }
  window.addEventListener('deviceorientation', (event) => {
    const heading = Number.isFinite(event.webkitCompassHeading)
      ? event.webkitCompassHeading
      : Number.isFinite(event.alpha) ? (360 - event.alpha) % 360 : null
    if (heading === null) return
    compassHeading = heading
    updateQiblaUI()
  }, true)
  const note = document.querySelector('#qibla-note')
  if (note) note.textContent = 'Move your phone slowly to find north'
}

function renderTasbeeh() {
  const count = document.querySelector('#tasbeeh-count')
  const cycle = document.querySelector('#tasbeeh-cycle')
  if (count) count.textContent = tasbeehCount
  if (cycle) cycle.textContent = Math.floor(tasbeehCount / 33) + 1
}

function renderReadingPlan() {
  const progress = document.querySelector('#reading-plan-progress')
  const count = document.querySelector('.reading-plan-count span')
  const percent = document.querySelector('#reading-plan-percent')
  if (!progress || !count || !percent) return
  const target = Math.ceil(6236 / readingPlanDays)
  const today = new Date().toLocaleDateString('en-CA')
  const readToday = readingPlanProgress.date === today && Array.isArray(readingPlanProgress.verses)
    ? readingPlanProgress.verses.length
    : 0
  progress.max = target
  progress.value = Math.min(readToday, target)
  count.textContent = `${Math.min(readToday, target)} of ${target} ayahs today`
  percent.textContent = `${Math.min(100, Math.round(readToday / target * 100))}%`
}

function hijriParts(date) {
  const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]))
}

function hijriMonthKey(date) {
  const parts = hijriParts(date)
  return `${parts.year}-${parts.month}`
}

function firstDayOfHijriMonth(date) {
  const firstDay = new Date(date)
  firstDay.setHours(12, 0, 0, 0)
  const key = hijriMonthKey(firstDay)
  for (let day = 0; day < 31; day += 1) {
    const previous = new Date(firstDay)
    previous.setDate(previous.getDate() - 1)
    if (hijriMonthKey(previous) !== key) break
    firstDay.setDate(firstDay.getDate() - 1)
  }
  return firstDay
}

function renderHijriCalendar() {
  const monthLabel = document.querySelector('#hijri-month-label')
  const grid = document.querySelector('#hijri-calendar-grid')
  if (!monthLabel || !grid) return
  const today = new Date()
  let monthStart = firstDayOfHijriMonth(today)
  for (let step = 0; step < Math.abs(hijriMonthOffset); step += 1) {
    const anchor = new Date(monthStart)
    anchor.setDate(anchor.getDate() + (hijriMonthOffset > 0 ? 31 : -1))
    monthStart = firstDayOfHijriMonth(anchor)
  }
  const key = hijriMonthKey(monthStart)
  monthLabel.textContent = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    month: 'long',
    year: 'numeric',
  }).format(monthStart)
  const days = []
  const date = new Date(monthStart)
  while (hijriMonthKey(date) === key && days.length < 31) {
    const parts = hijriParts(date)
    const current = date.toDateString() === today.toDateString()
    days.push(`<span class="hijri-day ${current ? 'is-today' : ''}" role="gridcell" aria-label="${parts.month} ${parts.day}, ${parts.year}">${parts.day}</span>`)
    date.setDate(date.getDate() + 1)
  }
  grid.innerHTML = `${'<span class="hijri-day is-empty" aria-hidden="true"></span>'.repeat(monthStart.getDay())}${days.join('')}`
}

export function recordReadingVerse(globalVerseNumber) {
  const today = new Date().toLocaleDateString('en-CA')
  if (readingPlanProgress.date !== today || !Array.isArray(readingPlanProgress.verses)) {
    readingPlanProgress = { date: today, verses: [] }
  }
  const verseNumber = Number(globalVerseNumber)
  if (!Number.isInteger(verseNumber) || verseNumber < 1 || verseNumber > 6236) return
  if (!readingPlanProgress.verses.includes(verseNumber)) {
    readingPlanProgress.verses.push(verseNumber)
    localStorage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(readingPlanProgress))
  }
  renderReadingPlan()
}

function renderNames(query = '') {
  const normalized = query.trim().toLocaleLowerCase()
  document.querySelectorAll('.name-item').forEach((item) => {
    item.hidden = normalized !== '' && !item.dataset.nameSearch.includes(normalized)
  })
}

async function renderDailyVerse() {
  const target = document.querySelector('#daily-verse-content')
  if (!target) return
  if (!dailyVersePromise) {
    const now = new Date()
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
    const globalVerse = ((dayOfYear * 71 + 17) % 6236) + 1
    dailyVersePromise = fetchQuranData(`${QURAN_API}/ayah/${globalVerse}/editions/quran-uthmani,en.sahih`)
      .then((result) => {
        if (result.code !== 200 || result.data?.length < 2) throw new Error('Daily verse is unavailable.')
        const [arabic, translation] = result.data
        return { arabic: arabic.text, translation: translation.text, surah: arabic.surah, ayah: arabic.numberInSurah }
      })
  }
  try {
    const verse = await dailyVersePromise
    const currentTarget = document.querySelector('#daily-verse-content')
    if (!currentTarget) return
    currentTarget.innerHTML = `
      <p class="daily-verse-arabic" lang="ar" dir="rtl">${escapeHTML(verse.arabic)}</p>
      <p class="daily-verse-translation">“${escapeHTML(verse.translation)}”</p>
      <button class="daily-verse-reference" data-worship-action="read-ayah" data-surah="${verse.surah.number}" data-ayah="${verse.ayah}">${escapeHTML(verse.surah.englishName)} · ${verse.ayah} <span aria-hidden="true">↗</span></button>`
  } catch {
    const currentTarget = document.querySelector('#daily-verse-content')
    if (currentTarget) currentTarget.innerHTML = '<p class="daily-verse-translation">Connect to the Quran text service to read today’s ayah.</p>'
  }
}

function scrollToTool(target) {
  const ids = {
    prayer: '.prayer-widget',
    adhan: '.adhan-setting',
    qibla: '.qibla-widget',
    tasbeeh: '.tasbeeh-widget',
    names: '#names-section',
    daily: '#tools-daily-verse',
    calendar: '#hijri-calendar',
    plan: '.reading-plan-widget',
  }
  document.querySelector(ids[target] || '#names-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

let initialized = false

export function initWorshipTools(onOpenAyah) {
  if (!initialized) {
    initialized = true
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-worship-action]')
      if (!button) return
      const action = button.dataset.worshipAction
      if (action === 'locate') requestLocation()
      if (action === 'toggle-adhan') enableAdhan()
      if (action === 'enable-compass') enableCompass()
      if (action === 'count') {
        tasbeehCount += 1
        localStorage.setItem(TASBEEH_KEY, String(tasbeehCount))
        renderTasbeeh()
      }
      if (action === 'reset-count') {
        tasbeehCount = 0
        localStorage.setItem(TASBEEH_KEY, '0')
        renderTasbeeh()
      }
      if (action === 'hijri-previous') {
        hijriMonthOffset -= 1
        renderHijriCalendar()
      }
      if (action === 'hijri-next') {
        hijriMonthOffset += 1
        renderHijriCalendar()
      }
      if (action === 'read-ayah') onOpenAyah(Number(button.dataset.surah), Number(button.dataset.ayah))
    })
    document.addEventListener('change', (event) => {
      if (event.target.id === 'prayer-method') {
        prayerMethod = Number(event.target.value)
        localStorage.setItem(METHOD_KEY, String(prayerMethod))
        fetchPrayerTimes()
      }
      if (event.target.id === 'reading-plan-days') {
        readingPlanDays = Number(event.target.value)
        localStorage.setItem(PLAN_DAYS_KEY, String(readingPlanDays))
        renderReadingPlan()
      }
    })
    document.addEventListener('input', (event) => {
      if (event.target.id === 'names-search-input') renderNames(event.target.value)
    })
    window.addEventListener('storage', (event) => {
      if (event.key === TASBEEH_KEY) {
        tasbeehCount = Number(event.newValue) || 0
        renderTasbeeh()
      }
    })
    clockTimer = setInterval(updatePrayerClock, 1000)
    if (coordinates) fetchPrayerTimes()
    if (adhanEnabled && 'Notification' in window && Notification.permission === 'denied') {
      updateAdhanButton('Notifications are blocked. Allow them in browser settings to receive alerts.')
    }
  }
  renderPrayerData()
  renderTasbeeh()
  renderReadingPlan()
  renderHijriCalendar()
  renderDailyVerse()
}

export function openWorshipShortcut(target) {
  if (target) scrollToTool(target)
}

function readingPlanMarkup() {
  const target = Math.ceil(6236 / readingPlanDays)
  const today = new Date().toLocaleDateString('en-CA')
  const readToday = readingPlanProgress.date === today ? readingPlanProgress.verses.length : 0
  return `
    <section class="reading-plan-widget" aria-label="Quran reading plan">
      <div class="widget-kicker"><span class="widget-symbol">◷</span> READING PLAN</div>
      <div class="reading-plan-heading"><strong>Complete the Quran</strong><label>Finish in <select id="reading-plan-days" aria-label="Choose plan duration"><option value="30" ${readingPlanDays === 30 ? 'selected' : ''}>30 days</option><option value="60" ${readingPlanDays === 60 ? 'selected' : ''}>60 days</option><option value="90" ${readingPlanDays === 90 ? 'selected' : ''}>90 days</option></select></label></div>
      <p class="reading-plan-target">Read about <strong>${target}</strong> ayahs each day</p>
      <progress id="reading-plan-progress" max="${target}" value="${Math.min(readToday, target)}"></progress>
      <div class="reading-plan-count"><span>${Math.min(readToday, target)} of ${target} ayahs today</span><strong id="reading-plan-percent">${Math.min(100, Math.round(readToday / target * 100))}%</strong></div>
    </section>`
}

function hijriCalendarMarkup() {
  return `
    <section class="hijri-widget" id="hijri-calendar" aria-label="Hijri calendar">
      <div class="widget-kicker"><span class="widget-symbol">☾</span> HIJRI CALENDAR</div>
      <div class="hijri-calendar-heading"><button data-worship-action="hijri-previous" aria-label="Previous Hijri month">‹</button><strong id="hijri-month-label"></strong><button data-worship-action="hijri-next" aria-label="Next Hijri month">›</button></div>
      <div class="hijri-weekdays" aria-hidden="true"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
      <div class="hijri-calendar-grid" id="hijri-calendar-grid" role="grid" aria-label="Hijri month dates"></div>
    </section>`
}