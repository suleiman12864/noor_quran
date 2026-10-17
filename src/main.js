import './app.css'

const API = 'https://api.alquran.cloud/v1'
const STORAGE = {
  bookmarks: 'noor-bookmarks',
  progress: 'noor-progress',
  reciter: 'noor-reciter',
  playbackMode: 'noor-playback-mode',
}
const reciters = [
  { id: 'ar.alafasy', name: 'Mishary Alafasy' },
  { id: 'ar.husary', name: 'Mahmoud Al-Husary' },
  { id: 'ar.abdurrahmaansudais', name: 'Abdurrahman Al-Sudais' },
  { id: 'ar.mahermuaiqly', name: 'Maher Al-Muaiqly' },
]
const initialProgress = readJSON(STORAGE.progress, { surah: 1, ayah: 1 })
const icons = {
  arrowLeft: '<path d="m15 18-6-6 6-6"/><path d="M20 12H9"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/><path d="M4 12h11"/>',
  bookmark: '<path d="m6 4 12 0v17l-6-4-6 4z"/>',
  book: '<path d="M12 7v14"/><path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4a3 3 0 0 0-3 2 3 3 0 0 0-3-2H5a2 2 0 0 1-2-2Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M5 14h2v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Zm14 0h-2v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 12 7-12 7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
}

const state = {
  page: 'home',
  surahs: [],
  verses: [],
  selectedSurah: Math.min(114, Math.max(1, Number(initialProgress.surah) || 1)),
  activeVerse: Math.max(1, Number(initialProgress.ayah) || 1),
  navView: 'chapters',
  showTranslation: true,
  showTransliteration: true,
  fontSize: 34,
  reciter: localStorage.getItem(STORAGE.reciter) || reciters[0].id,
  playbackMode: localStorage.getItem(STORAGE.playbackMode) === 'verse' ? 'verse' : 'surah',
  bookmarks: new Set(readJSON(STORAGE.bookmarks, [])),
  loading: false,
  error: '',
  mobileNavOpen: false,
  requestId: 0,
  libraryLoading: true,
}

let audio = new Audio()
audio.preload = 'none'

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function saveProgress(surah, ayah) {
  localStorage.setItem(STORAGE.progress, JSON.stringify({ surah, ayah }))
}

function formatAyahArabic(text, surahNumber, verseNumber) {
  const cleanText = text.replace(/^\uFEFF/, '').trim()
  if (surahNumber === 1 || verseNumber !== 1) return cleanText

  const words = cleanText.split(/\s+/)
  const basmala = ['بسم', 'ٱلله', 'ٱلرحمن', 'ٱلرحيم']
  const normalizedWords = words.slice(0, basmala.length).map((word) =>
    word.normalize('NFD').replace(/\p{M}/gu, ''),
  )
  if (basmala.every((word, index) => normalizedWords[index] === word)) {
    return words.slice(basmala.length).join(' ')
  }
  return cleanText
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
}

function renderShell() {
  document.querySelector('#app').innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" data-action="home" aria-label="Noor Quran Reader home">
        <span class="brand-mark" aria-hidden="true">ن</span>
        <span class="brand-name">noor<span>.</span></span>
      </a>
      <div class="topbar-center"><span class="live-dot"></span> A quiet place to read</div>
      <button class="icon-button menu-toggle" data-action="mobile-nav" aria-label="Open chapter menu">${icon('menu')}</button>
      <a class="topbar-source" href="https://alquran.cloud" target="_blank" rel="noreferrer">Quran text & audio <span aria-hidden="true">↗</span></a>
    </header>

    <div class="workspace">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-heading">
          <span class="eyebrow">YOUR LIBRARY</span>
          <span class="chapter-total" id="chapter-total">114 chapters</span>
        </div>
        <div class="view-switch" role="tablist" aria-label="Library view">
          <button class="view-tab is-active" role="tab" aria-selected="true" data-action="nav-view" data-view="chapters">Chapters</button>
          <button class="view-tab" role="tab" aria-selected="false" data-action="nav-view" data-view="saved">Saved <span class="saved-count" id="saved-count">0</span></button>
        </div>
        <label class="search-box">
          ${icon('search')}
          <input id="chapter-search" type="search" placeholder="Find a chapter" autocomplete="off" aria-label="Find a chapter" />
          <kbd>/</kbd>
        </label>
        <div class="sidebar-content" id="sidebar-content"></div>
        <div class="sidebar-foot"><span class="mini-flower" aria-hidden="true">✳</span> 114 chapters <span class="foot-divider">·</span> 6,236 verses</div>
      </aside>

      <main class="reader-area">
        <div class="reader-column">
          <div class="reader-overline">
            <span class="eyebrow">THE HOLY QURAN</span>
            <div class="chapter-arrows">
              <button class="subtle-button" data-action="previous-surah" aria-label="Previous chapter">${icon('arrowLeft')}</button>
              <button class="subtle-button" data-action="next-surah" aria-label="Next chapter">${icon('arrowRight')}</button>
            </div>
          </div>
          <div id="reader-heading"></div>
          <section class="reader-controls" aria-label="Reading settings">
            <div class="display-options">
              <button class="display-toggle" id="translation-toggle" data-action="toggle-display" data-display="translation" aria-pressed="true">Translation</button>
              <button class="display-toggle" id="transliteration-toggle" data-action="toggle-display" data-display="transliteration" aria-pressed="true">Transliteration</button>
            </div>
            <label class="text-size-control" for="text-size"><span>Aa</span><input id="text-size" type="range" min="28" max="48" value="34" aria-label="Arabic text size" /><span class="large-aa">Aa</span></label>
          </section>
          <div id="reader-message" aria-live="polite"></div>
          <div id="ayah-list" class="ayah-list" aria-live="polite"></div>
          <div class="reader-credit">Translation: Saheeh International <span>·</span> Transliteration provided for reading support</div>
        </div>
      </main>
    </div>

    <footer class="audio-player" aria-label="Audio player">
      <div class="track-info" id="track-info"></div>
      <div class="player-center">
        <div class="transport-controls">
          <button class="player-side-button" data-action="previous-ayah" aria-label="Previous verse">${icon('arrowLeft')}</button>
          <button class="play-button" id="player-play" data-action="toggle-play" aria-label="Play recitation">${icon('play')}</button>
          <button class="player-side-button" data-action="next-ayah" aria-label="Next verse">${icon('arrowRight')}</button>
        </div>
        <div class="timeline-row">
          <span class="time-label" id="current-time">0:00</span>
          <input class="timeline" id="audio-progress" type="range" min="0" max="1000" value="0" aria-label="Audio position" />
          <span class="time-label" id="duration-time">0:00</span>
        </div>
      </div>
      <div class="player-options">
        ${icon('volume')}
        <select id="playback-mode-select" aria-label="Playback mode"><option value="surah">Full surah</option><option value="verse">Single verse</option></select>
        <select id="reciter-select" aria-label="Choose reciter">${reciters.map((reciter) => `<option value="${reciter.id}">${escapeHtml(reciter.name)}</option>`).join('')}</select>
        <select id="speed-select" aria-label="Playback speed"><option value="1">1×</option><option value="0.75">0.75×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select>
      </div>
    </footer>
    <div class="mobile-scrim" data-action="close-mobile-nav"></div>
  `
  document.querySelector('#reciter-select').value = state.reciter
  document.querySelector('#playback-mode-select').value = state.playbackMode
  document.querySelector('#text-size').value = state.fontSize
}

async function fetchSurahs() {
  const response = await fetch(`${API}/surah`)
  if (!response.ok) throw new Error('Could not reach the Quran text service.')
  const result = await response.json()
  if (result.code !== 200 || !Array.isArray(result.data)) throw new Error('Chapter information could not be loaded.')
  state.surahs = result.data
  document.querySelector('#chapter-total').textContent = `${state.surahs.length} chapters`
}

async function loadSurah(number, focusVerse = 1) {
  const requestId = ++state.requestId
  state.page = 'reader'
  state.loading = true
  state.error = ''
  state.selectedSurah = number
  audio.pause()
  renderSidebar()
  renderReader()
  renderPlayer()

  try {
    const editions = `quran-uthmani,en.sahih,en.transliteration,${state.reciter}`
    const response = await fetch(`${API}/surah/${number}/editions/${editions}`)
    if (!response.ok) throw new Error('The chapter could not be loaded. Check your connection and try again.')
    const result = await response.json()
    if (requestId !== state.requestId) return
    if (result.code !== 200 || result.data?.length < 4) throw new Error('The requested Quran editions are unavailable right now.')

    const [arabic, translation, transliteration, recitation] = result.data
    state.verses = arabic.ayahs.map((ayah, index) => ({
      number: ayah.numberInSurah,
      globalNumber: ayah.number,
      arabic: formatAyahArabic(ayah.text, number, ayah.numberInSurah),
      translation: translation.ayahs[index]?.text || '',
      transliteration: transliteration.ayahs[index]?.text || '',
      audio: recitation.ayahs[index]?.audio || '',
    }))
    state.selectedSurah = number
    state.activeVerse = Math.min(Math.max(Number(focusVerse) || 1, 1), state.verses.length)
    state.loading = false
    state.error = ''
    saveProgress(number, state.activeVerse)
    renderSidebar()
    renderReader()
    renderPlayer()
    closeMobileNav()
  } catch (error) {
    if (requestId !== state.requestId) return
    state.loading = false
    state.error = error.message || 'Something went wrong while loading this chapter.'
    renderReader()
  }
}

function renderSidebar() {
  const content = document.querySelector('#sidebar-content')
  const query = document.querySelector('#chapter-search')?.value.trim().toLocaleLowerCase() || ''
  document.querySelectorAll('.view-tab').forEach((tab) => {
    const active = tab.dataset.view === state.navView
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  document.querySelector('#saved-count').textContent = state.bookmarks.size

  if (state.navView === 'saved') {
    const savedItems = [...state.bookmarks].sort((a, b) => a - b).map((globalNumber) => {
      const location = locateVerse(globalNumber)
      const verse = location?.surah === state.selectedSurah
        ? state.verses.find((entry) => entry.number === location.ayah)
        : null
      return { ...location, globalNumber, preview: verse?.translation || '' }
    }).filter((item) => item.surah)
    if (!savedItems.length) {
      content.innerHTML = '<div class="empty-library"><span class="empty-mark">✳</span><strong>No saved verses yet</strong><span>Use the bookmark beside any verse to keep it here.</span></div>'
      return
    }
    content.innerHTML = savedItems.map((item) => {
      const surah = state.surahs.find((entry) => entry.number === item.surah)
      return `<button class="saved-item" data-action="open-bookmark" data-surah="${item.surah}" data-ayah="${item.ayah}"><span class="saved-item-icon">${icon('bookmark')}</span><span><strong>${escapeHtml(surah?.englishName || `Chapter ${item.surah}`)} · ${item.ayah}</strong><small>${escapeHtml(item.preview || `Verse ${item.globalNumber}`)}</small></span>${icon('arrowRight', 'saved-arrow')}</button>`
    }).join('')
    return
  }

  const filtered = state.surahs.filter((surah) => `${surah.number} ${surah.englishName} ${surah.englishNameTranslation} ${surah.name}`.toLocaleLowerCase().includes(query))
  content.innerHTML = filtered.length ? filtered.map((surah) => `
    <button class="chapter-item ${surah.number === state.selectedSurah ? 'is-current' : ''}" data-action="select-surah" data-surah="${surah.number}" aria-current="${surah.number === state.selectedSurah ? 'page' : 'false'}">
      <span class="chapter-index">${String(surah.number).padStart(3, '0')}</span>
      <span class="chapter-label"><strong>${escapeHtml(surah.englishName)}</strong><small>${escapeHtml(surah.englishNameTranslation)} · ${surah.numberOfAyahs} verses</small></span>
      <span class="chapter-arabic" lang="ar" dir="rtl">${escapeHtml(surah.name.replace(/^سُورَةُ\s*/, ''))}</span>
    </button>`).join('') : '<p class="no-results">No chapters match that search.</p>'
}

function renderReader() {
  if (state.page === 'home') {
    renderHome()
    return
  }

  document.querySelector('.reader-area').classList.remove('is-home')
  const surah = state.surahs.find((entry) => entry.number === state.selectedSurah)
  const heading = document.querySelector('#reader-heading')
  const list = document.querySelector('#ayah-list')
  const message = document.querySelector('#reader-message')
  if (!surah) return

  heading.innerHTML = `
    <div class="surah-heading">
      <div class="surah-heading-copy"><span class="surah-number">CHAPTER ${String(surah.number).padStart(3, '0')}</span><h1>${escapeHtml(surah.englishName)}</h1><p>${escapeHtml(surah.englishNameTranslation)} <span>·</span> ${surah.revelationType} <span>·</span> ${surah.numberOfAyahs} verses</p></div>
      <div class="surah-name-arabic" lang="ar" dir="rtl">${escapeHtml(surah.name)}</div>
    </div>`

  if (state.loading) {
    message.innerHTML = '<div class="reader-state"><span class="loader"></span><span>Opening the chapter…</span></div>'
    list.innerHTML = ''
    return
  }
  if (state.error) {
    message.innerHTML = `<div class="reader-state error-state"><span>${escapeHtml(state.error)}</span><button class="retry-button" data-action="retry">Try again</button></div>`
    list.innerHTML = ''
    return
  }
  message.innerHTML = ''
  const bismillah = surah.number !== 1 && surah.number !== 9
    ? '<div class="bismillah" lang="ar" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>'
    : ''
  list.innerHTML = `${bismillah}${state.verses.map((verse) => {
    const bookmarked = state.bookmarks.has(verse.globalNumber)
    const active = verse.number === state.activeVerse
    return `<article class="ayah ${active ? 'is-playing' : ''}" id="ayah-${verse.number}" data-global-number="${verse.globalNumber}">
      <div class="ayah-topline"><span class="ayah-number">${String(verse.number).padStart(3, '0')} <span> / ${String(surah.numberOfAyahs).padStart(3, '0')}</span></span><div class="ayah-actions"><button class="ayah-action ${active ? 'is-active' : ''}" data-action="play-ayah" data-ayah="${verse.number}" aria-label="Play verse ${verse.number}">${icon(active && !audio.paused ? 'pause' : 'play')}</button><button class="ayah-action ${bookmarked ? 'is-saved' : ''}" data-action="bookmark" data-global-number="${verse.globalNumber}" aria-label="${bookmarked ? 'Remove bookmark' : 'Bookmark'} verse ${verse.number}" aria-pressed="${bookmarked}">${icon('bookmark')}</button></div></div>
      <p class="ayah-arabic" lang="ar" dir="rtl">${escapeHtml(verse.arabic)}</p>
      ${state.showTransliteration ? `<p class="ayah-transliteration" lang="en">${escapeHtml(verse.transliteration)}</p>` : ''}
      ${state.showTranslation ? `<p class="ayah-translation" lang="en">${escapeHtml(verse.translation)}</p>` : ''}
    </article>`
  }).join('')}`
  list.style.setProperty('--arabic-size', `${state.fontSize}px`)
  document.querySelectorAll('.display-toggle').forEach((button) => {
    const isVisible = button.dataset.display === 'translation' ? state.showTranslation : state.showTransliteration
    button.classList.toggle('is-on', isVisible)
    button.setAttribute('aria-pressed', String(isVisible))
  })
}

function renderHome() {
  const area = document.querySelector('.reader-area')
  const heading = document.querySelector('#reader-heading')
  const list = document.querySelector('#ayah-list')
  const message = document.querySelector('#reader-message')
  const query = document.querySelector('#chapter-search').value.trim().toLocaleLowerCase()
  area.classList.add('is-home')
  heading.innerHTML = `
    <section class="home-intro">
      <div><span class="surah-number">NOOR QURAN READER</span><h1>Explore the Quran</h1><p>Choose a surah to read, follow along, or listen.</p></div>
      <span class="home-calligraphy" lang="ar" dir="rtl" aria-hidden="true">اقرأ</span>
    </section>`

  if (state.libraryLoading) {
    message.innerHTML = '<div class="reader-state"><span class="loader"></span><span>Loading surahs…</span></div>'
    list.innerHTML = ''
    return
  }
  if (state.error && !state.surahs.length) {
    message.innerHTML = `<div class="reader-state error-state"><span>${escapeHtml(state.error)}</span><button class="retry-button" data-action="retry-all">Try again</button></div>`
    list.innerHTML = ''
    return
  }

  message.innerHTML = ''
  const progress = readJSON(STORAGE.progress, null)
  const resumeSurah = progress && state.surahs.find((entry) => entry.number === Number(progress.surah))
  const filteredSurahs = state.surahs.filter((surah) => `${surah.number} ${surah.englishName} ${surah.englishNameTranslation} ${surah.name}`.toLocaleLowerCase().includes(query))
  const resumeCard = resumeSurah ? `
    <button class="resume-card" data-action="resume-reading" data-surah="${resumeSurah.number}" data-ayah="${Number(progress.ayah) || 1}">
      <span class="resume-label">PICK UP WHERE YOU LEFT OFF</span>
      <span class="resume-main"><span><strong>${escapeHtml(resumeSurah.englishName)}</strong><small>${escapeHtml(resumeSurah.englishNameTranslation)} · Verse ${Number(progress.ayah) || 1}</small></span><span class="resume-arrow">${icon('arrowRight')}</span></span>
    </button>` : ''
  list.innerHTML = `
    ${resumeCard}
    <div class="home-list-heading"><h2>All surahs</h2><span>${filteredSurahs.length} of 114</span></div>
    <div class="surah-grid">${filteredSurahs.map((surah) => `
      <button class="surah-card" data-action="select-surah" data-surah="${surah.number}">
        <span class="surah-card-number">${String(surah.number).padStart(3, '0')}</span>
        <span class="surah-card-copy"><strong>${escapeHtml(surah.englishName)}</strong><small>${escapeHtml(surah.englishNameTranslation)} · ${surah.numberOfAyahs} verses</small></span>
        <span class="surah-card-arabic" lang="ar" dir="rtl">${escapeHtml(surah.name.replace(/^سُورَةُ\s*/, ''))}</span>
      </button>`).join('') || '<p class="no-results home-no-results">No surahs match that search.</p>'}</div>`
}

function renderPlayer() {
  const surah = state.surahs.find((entry) => entry.number === state.selectedSurah)
  const verse = state.verses.find((entry) => entry.number === state.activeVerse)
  document.querySelector('#track-info').innerHTML = `<span class="track-icon">${icon('headphones')}</span><span class="track-copy"><strong>${escapeHtml(surah?.englishName || 'Quran recitation')}</strong><small>${verse ? `Verse ${verse.number} · ${escapeHtml(reciters.find((item) => item.id === state.reciter)?.name || 'Recitation')}` : state.page === 'home' ? 'Choose a surah to begin' : 'Choose a verse to begin'}</small></span>`
  document.querySelector('#player-play').innerHTML = icon(audio.paused ? 'play' : 'pause')
  document.querySelector('#player-play').setAttribute('aria-label', audio.paused ? 'Play recitation' : 'Pause recitation')
  document.querySelector('#audio-progress').value = audio.duration ? Math.round((audio.currentTime / audio.duration) * 1000) : 0
  document.querySelector('#current-time').textContent = formatTime(audio.currentTime)
  document.querySelector('#duration-time').textContent = formatTime(audio.duration)
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    const reciter = reciters.find((item) => item.id === state.reciter)?.name || 'Quran recitation'
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${surah?.englishName || 'Quran'}${verse ? ` · Verse ${verse.number}` : ''}`,
      artist: reciter,
      album: 'Noor Quran Reader',
    })
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function updateActiveVerse(verseNumber, scroll = true) {
  state.activeVerse = verseNumber
  saveProgress(state.selectedSurah, verseNumber)
  document.querySelectorAll('.ayah').forEach((ayah) => {
    const current = Number(ayah.id.replace('ayah-', '')) === verseNumber
    ayah.classList.toggle('is-playing', current)
    const playButton = ayah.querySelector('[data-action="play-ayah"]')
    if (playButton) {
      playButton.classList.toggle('is-active', current)
      playButton.innerHTML = icon(current && !audio.paused ? 'pause' : 'play')
    }
  })
  renderPlayer()
  if (scroll) document.querySelector(`#ayah-${verseNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function playVerse(verseNumber = state.activeVerse) {
  const verse = state.verses.find((entry) => entry.number === verseNumber)
  if (!verse?.audio) return
  if (state.activeVerse !== verseNumber) updateActiveVerse(verseNumber, false)
  audio.src = verse.audio
  try {
    await audio.play()
  } catch {
    document.querySelector('#reader-message').innerHTML = '<div class="reader-state error-state">Audio could not start. Try again or check your device volume.</div>'
  }
  renderPlayer()
  renderReader()
  document.querySelector(`#ayah-${verseNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function toggleBookmark(globalNumber) {
  if (state.bookmarks.has(globalNumber)) state.bookmarks.delete(globalNumber)
  else state.bookmarks.add(globalNumber)
  localStorage.setItem(STORAGE.bookmarks, JSON.stringify([...state.bookmarks]))
  renderSidebar()
  renderReader()
}

function closeMobileNav() {
  state.mobileNavOpen = false
  document.body.classList.remove('nav-open')
}

function moveSurah(offset) {
  const next = Math.min(114, Math.max(1, state.selectedSurah + offset))
  if (next !== state.selectedSurah) loadSurah(next)
}

function locateVerse(globalNumber) {
  let verseNumber = globalNumber
  for (const surah of state.surahs) {
    if (verseNumber <= surah.numberOfAyahs) return { surah: surah.number, ayah: verseNumber }
    verseNumber -= surah.numberOfAyahs
  }
  return null
}

renderShell()

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const action = button.dataset.action
  if (action === 'home') {
    event.preventDefault()
    state.page = 'home'
    state.navView = 'chapters'
    document.querySelector('#chapter-search').value = ''
    closeMobileNav()
    renderSidebar()
    renderReader()
    renderPlayer()
  }
  if (action === 'resume-reading') loadSurah(Number(button.dataset.surah), Number(button.dataset.ayah))
  if (action === 'select-surah') loadSurah(Number(button.dataset.surah))
  if (action === 'open-bookmark') {
    const location = button.dataset.surah
      ? { surah: Number(button.dataset.surah), ayah: Number(button.dataset.ayah) }
      : locateVerse(Number(button.dataset.globalNumber))
    if (location) loadSurah(location.surah, location.ayah)
  }
  if (action === 'nav-view') {
    state.navView = button.dataset.view
    renderSidebar()
  }
  if (action === 'play-ayah') playVerse(Number(button.dataset.ayah))
  if (action === 'bookmark') toggleBookmark(Number(button.dataset.globalNumber))
  if (action === 'toggle-display') {
    if (button.dataset.display === 'translation') state.showTranslation = !state.showTranslation
    else state.showTransliteration = !state.showTransliteration
    renderReader()
  }
  if (action === 'previous-surah') moveSurah(-1)
  if (action === 'next-surah') moveSurah(1)
  if (action === 'retry') loadSurah(state.selectedSurah, state.activeVerse)
  if (action === 'mobile-nav') {
    state.mobileNavOpen = !state.mobileNavOpen
    document.body.classList.toggle('nav-open', state.mobileNavOpen)
  }
  if (action === 'close-mobile-nav') closeMobileNav()
  if (action === 'toggle-play') {
    if (audio.paused) playVerse(state.activeVerse)
    else audio.pause()
  }
  if (action === 'previous-ayah') playVerse(Math.max(1, state.activeVerse - 1))
  if (action === 'next-ayah') playVerse(Math.min(state.verses.length, state.activeVerse + 1))
})

document.querySelector('#chapter-search').addEventListener('input', () => {
  renderSidebar()
  if (state.page === 'home') renderHome()
})
document.querySelector('#text-size').addEventListener('input', (event) => {
  state.fontSize = Number(event.target.value)
  document.querySelector('#ayah-list').style.setProperty('--arabic-size', `${state.fontSize}px`)
})
document.querySelector('#reciter-select').addEventListener('change', (event) => {
  state.reciter = event.target.value
  localStorage.setItem(STORAGE.reciter, state.reciter)
  loadSurah(state.selectedSurah, state.activeVerse)
})
document.querySelector('#speed-select').addEventListener('change', (event) => {
  audio.playbackRate = Number(event.target.value)
})
document.querySelector('#playback-mode-select').addEventListener('change', (event) => {
  state.playbackMode = event.target.value === 'verse' ? 'verse' : 'surah'
  localStorage.setItem(STORAGE.playbackMode, state.playbackMode)
})
document.querySelector('#audio-progress').addEventListener('input', (event) => {
  if (Number.isFinite(audio.duration)) audio.currentTime = (Number(event.target.value) / 1000) * audio.duration
})
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault()
    document.querySelector('#chapter-search').focus()
  }
  if (event.key === 'Escape') closeMobileNav()
})

audio.addEventListener('play', () => {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
  renderPlayer()
  renderReader()
})
audio.addEventListener('pause', () => {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  renderPlayer()
  renderReader()
})
audio.addEventListener('timeupdate', () => {
  const progress = document.querySelector('#audio-progress')
  if (progress && !progress.matches(':active')) progress.value = audio.duration ? Math.round((audio.currentTime / audio.duration) * 1000) : 0
  const currentTime = document.querySelector('#current-time')
  if (currentTime) currentTime.textContent = formatTime(audio.currentTime)
  const durationTime = document.querySelector('#duration-time')
  if (durationTime) durationTime.textContent = formatTime(audio.duration)
})
audio.addEventListener('ended', () => {
  if (state.playbackMode === 'surah' && state.activeVerse < state.verses.length) playVerse(state.activeVerse + 1)
  else {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
    updateActiveVerse(state.activeVerse, false)
    renderReader()
    renderPlayer()
  }
})
audio.addEventListener('error', () => {
  document.querySelector('#reader-message').innerHTML = '<div class="reader-state error-state">This recitation could not be played. Choose another reciter or try again.</div>'
})

if ('mediaSession' in navigator) {
  const mediaActions = {
    play: () => playVerse(state.activeVerse),
    pause: () => audio.pause(),
    previoustrack: () => playVerse(Math.max(1, state.activeVerse - 1)),
    nexttrack: () => playVerse(Math.min(state.verses.length, state.activeVerse + 1)),
    seekto: (details) => {
      if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime
    },
  }
  for (const [action, handler] of Object.entries(mediaActions)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {}
  }
}

renderPlayer()
renderReader()
fetchSurahs().then(() => {
  state.libraryLoading = false
  state.error = ''
  renderSidebar()
  renderReader()
}).catch((error) => {
  state.libraryLoading = false
  state.error = error.message
  renderReader()
})

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="retry-all"]')) {
    state.libraryLoading = true
    state.error = ''
    renderReader()
    document.querySelector('#reader-message').innerHTML = '<div class="reader-state"><span class="loader"></span><span>Connecting…</span></div>'
    fetchSurahs().then(() => {
      state.libraryLoading = false
      state.error = ''
      renderSidebar()
      renderReader()
    }).catch((error) => {
      state.libraryLoading = false
      state.error = error.message
      renderReader()
    })
  }
})
