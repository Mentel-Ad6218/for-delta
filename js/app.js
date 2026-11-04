/*
 * 潮汐手记 · 主程序
 * ------------------------------------------------------------
 * 静态站点 + 浏览器端加密 + GitHub Contents API 同步。
 * 不依赖任何后端服务，密码与明文不会离开当前页面。
 */

import {
  CryptoError,
  DEFAULT_ITERATIONS,
  decryptDraft,
  decryptPayload,
  encryptDraft,
  encryptPayload,
  isDataEnvelope,
  normalizePassword,
  openSecrets,
  passwordScore,
  rewrapMasterKey,
  sealSecrets,
  unlockVault,
  zeroBytes,
} from './crypto.js';
import {
  cacheConfig,
  ConfigError,
  DiaryRepository,
  fetchConfig,
  lastSyncAt,
  readCachedConfig,
} from './repository.js';
import {
  MOODS,
  WEATHERS,
  cnNumber,
  countChars,
  deleteEntry,
  excerpt,
  findEntry,
  formatDateCN,
  formatDateLongCN,
  formatMonthKey,
  formatTime,
  greeting,
  groupByMonth,
  moodOf,
  parseDateKey,
  readingMinutes,
  relativeDay,
  sortEntries,
  streakDays,
  todayKey,
  uid,
  upsertEntry,
  weekdayOf,
  weatherOf,
  mergePayloads,
} from './model.js';
import { GitHubClient } from './github.js';
import { demoPayload } from './demo.js';
import { Reader } from './reader.js';

const $ = (id) => document.getElementById(id);

const STORAGE_KEYS = {
  theme: 'tidal.theme.v1',
  fontSize: 'tidal.fontSize.v1',
  autoLock: 'tidal.autoLock.v1',
  draft: 'tidal.draft.v1',
  lastEntry: 'tidal.lastEntry.v1',
};

const THEME_COLORS = {
  day: '#eaf5ff',
  sepia: '#f7efe0',
  night: '#0d1a26',
};

const AUTO_LOCK_VALUES = [0, 5, 15, 30, 60];

const state = {
  demoMode: false,
  authenticated: false,
  mode: 'locked',
  config: null,
  repo: null,
  token: '',
  login: '',
  masterKey: null,
  masterRaw: null,
  payload: null,
  offline: false,
  pending: false,
  syncing: false,
  syncPromise: null,
  tokenInvalid: false,
  lastError: '',
  sessionId: 0,
  loadedDraft: null,
  demoDraft: null,
  demoSnapshot: null,
  query: '',
  todayEntryId: null,
  emptyMode: 'empty',
  view: 'shelf',
  editor: null,
  editorReturn: 'shelf',
  currentReaderId: null,
  draftTimer: 0,
  draftSeq: 0,
  syncTimer: 0,
  pendingImport: null,
  autoLockMinutes: 15,
  lastActivity: Date.now(),
  hiddenAt: 0,
  unlockAttempts: 0,
  bootConfigured: false,
  fontReflowTimer: 0,
};

const dom = {
  boot: $('bootScreen'),
  lock: $('lockScreen'),
  app: $('appView'),
  header: $('appHeader'),

  unlockForm: $('unlockForm'),
  passwordInput: $('passwordInput'),
  togglePassword: $('togglePassword'),
  lockHint: $('lockHint'),
  unlockButton: $('unlockButton'),
  lockUnconfigured: $('lockUnconfigured'),
  demoButton: $('demoButton'),
  lockConfigState: $('lockConfigState'),
  lockHelpButton: $('lockHelpButton'),
  lockEyebrow: $('lockEyebrow'),
  lockTitle: $('lockTitle'),
  lockSubtitle: $('lockSubtitle'),

  brandText: $('brandText'),
  syncPill: $('syncPill'),
  syncLabel: $('syncLabel'),
  searchToggle: $('searchToggle'),
  settingsButton: $('settingsButton'),
  lockButton: $('lockButton'),

  shelf: $('shelfView'),
  reader: $('readerView'),
  editor: $('editorView'),

  statEntries: $('statEntries'),
  statStreak: $('statStreak'),
  statWords: $('statWords'),
  greetingLine: $('greetingLine'),
  heroSub: $('heroSub'),
  todayDay: $('todayDay'),
  todayDate: $('todayDate'),
  todayHint: $('todayHint'),
  todayEntryBtn: $('todayEntryBtn'),
  todayEntryLabel: $('todayEntryLabel'),
  newEntryBtn: $('newEntryBtn'),
  randomEntryBtn: $('randomEntryBtn'),
  shelfNotice: $('shelfNotice'),
  noticeTitle: $('noticeTitle'),
  noticeText: $('noticeText'),
  noticeRetry: $('noticeRetry'),
  searchWrap: $('searchWrap'),
  searchInput: $('searchInput'),
  searchClear: $('searchClear'),
  timelineTitle: $('timelineTitle'),
  timelineCount: $('timelineCount'),
  timeline: $('timeline'),
  emptyState: $('emptyState'),
  emptyTitle: $('emptyTitle'),
  emptyText: $('emptyText'),
  emptyWriteBtn: $('emptyWriteBtn'),
  composeFab: $('composeFab'),

  readerBack: $('readerBack'),
  readerKicker: $('readerKicker'),
  readerTitle: $('readerTitle'),
  readerFontBtn: $('readerFontBtn'),
  readerCatalogBtn: $('readerCatalogBtn'),
  readerMoreBtn: $('readerMoreBtn'),
  readerStage: $('readerStage'),
  pageFrame: $('pageFrame'),
  pageTrack: $('pageTrack'),
  prevPageBtn: $('prevPageBtn'),
  nextPageBtn: $('nextPageBtn'),
  readerProgressText: $('readerProgressText'),
  readerProgressBar: $('readerProgressBar'),
  readerCounter: $('readerCounter'),
  fontPanel: $('fontPanel'),
  readerFontMinus: $('readerFontMinus'),
  readerFontValue: $('readerFontValue'),
  readerFontPlus: $('readerFontPlus'),
  readerThemeDots: $('readerThemeDots'),
  readerMenuPanel: $('readerMenuPanel'),
  readerEditBtn: $('readerEditBtn'),
  readerCopyBtn: $('readerCopyBtn'),
  readerLockBtn: $('readerLockBtn'),
  readerCatalog: $('readerCatalog'),
  catalogClose: $('catalogClose'),
  catalogList: $('catalogList'),

  editorBack: $('editorBack'),
  editorDate: $('editorDate'),
  editorDelete: $('editorDelete'),
  editorSave: $('editorSave'),
  editorSaveLabel: $('editorSaveLabel'),
  editorNumber: $('editorNumber'),
  editorSaveState: $('editorSaveState'),
  editorTitle: $('editorTitle'),
  moodPicker: $('moodPicker'),
  weatherPicker: $('weatherPicker'),
  editorBody: $('editorBody'),
  editorCount: $('editorCount'),
  draftStatus: $('draftStatus'),

  settingsDialog: $('settingsDialog'),
  themeCards: $('themeCards'),
  settingsFontMinus: $('settingsFontMinus'),
  settingsFontValue: $('settingsFontValue'),
  settingsFontPlus: $('settingsFontPlus'),
  settingsSyncTitle: $('settingsSyncTitle'),
  settingsSyncRepo: $('settingsSyncRepo'),
  settingsSyncBadge: $('settingsSyncBadge'),
  settingsLastSync: $('settingsLastSync'),
  syncNowButton: $('syncNowButton'),
  repoLink: $('repoLink'),
  updateTokenButton: $('updateTokenButton'),
  tokenDialog: $('tokenDialog'),
  tokenForm: $('tokenForm'),
  newToken: $('newToken'),
  tokenError: $('tokenError'),
  tokenSubmit: $('tokenSubmit'),
  autoLockSelect: $('autoLockSelect'),
  changePasswordButton: $('changePasswordButton'),
  settingsLockButton: $('settingsLockButton'),
  exportEncryptedButton: $('exportEncryptedButton'),
  exportMarkdownButton: $('exportMarkdownButton'),
  importButton: $('importButton'),
  importFileInput: $('importFileInput'),

  confirmDialog: $('confirmDialog'),
  confirmEyebrow: $('confirmEyebrow'),
  confirmTitle: $('confirmTitle'),
  confirmMessage: $('confirmMessage'),
  confirmCancel: $('confirmCancel'),
  confirmOk: $('confirmOk'),

  passwordDialog: $('passwordDialog'),
  changePasswordForm: $('changePasswordForm'),
  newPassword: $('newPassword'),
  newPasswordConfirm: $('newPasswordConfirm'),
  newPasswordStrength: $('newPasswordStrength'),
  newPasswordLabel: $('newPasswordLabel'),
  changePasswordError: $('changePasswordError'),
  changePasswordSubmit: $('changePasswordSubmit'),

  importPasswordDialog: $('importPasswordDialog'),
  importPasswordForm: $('importPasswordForm'),
  importBackupName: $('importBackupName'),
  importPassword: $('importPassword'),
  importPasswordError: $('importPasswordError'),
  importPasswordSubmit: $('importPasswordSubmit'),

  infoDialog: $('infoDialog'),
  toastHost: $('toastHost'),
};

let reader = null;

/* --------------------------------- 启动 ---------------------------------- */

boot();

async function boot() {
  readLocalSettings();
  applyTheme(state.theme, { silent: true });
  applyFontSize(state.fontSize, { silent: true });
  buildPickers();
  initReader();
  bindEvents();
  registerServiceWorker();

  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    setupDemoMode();
    renderLockConfig();
    revealLock();
    if (params.get('locked') === '1' || params.get('screen') === 'lock') {
      prepareDemoLock();
    } else {
      window.setTimeout(() => enterDemo(), 420);
    }
    return;
  }

  await loadConfiguration();
  renderLockConfig();
  revealLock();
}

function readLocalSettings() {
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.theme);
    state.theme = ['day', 'sepia', 'night'].includes(theme) ? theme : 'day';
    const savedFont = localStorage.getItem(STORAGE_KEYS.fontSize);
    const font = savedFont === null ? Number.NaN : Number(savedFont);
    state.fontSize = Number.isFinite(font) ? Math.max(15, Math.min(24, font)) : 18;
    const savedAutoLock = localStorage.getItem(STORAGE_KEYS.autoLock);
    const auto = savedAutoLock === null ? Number.NaN : Number(savedAutoLock);
    state.autoLockMinutes = AUTO_LOCK_VALUES.includes(auto) ? auto : 15;
  } catch {
    state.theme = 'day';
    state.fontSize = 18;
    state.autoLockMinutes = 15;
  }
}

async function loadConfiguration() {
  try {
    const config = await withTimeout(fetchConfig(), 9000, '读取配置超时');
    state.config = config;
    state.bootConfigured = true;
    state.offline = false;
    state.lastError = '';
  } catch (error) {
    const cached = readCachedConfig();
    if (cached && error.code === 'NETWORK') {
      state.config = cached;
      state.bootConfigured = true;
      state.offline = true;
      state.lastError = '使用上次缓存的配置，当前处于离线状态';
    } else if (cached && error.code === 'INVALID') {
      state.config = cached;
      state.bootConfigured = true;
      state.lastError = '云端配置暂时无法读取，正在使用上次的配置';
    } else {
      state.config = null;
      state.bootConfigured = false;
      state.lastError = error.message || '';
      if (error.code === 'MISSING') state.lastError = '';
    }
  }
}

function revealLock() {
  dom.lock.hidden = false;
  requestAnimationFrame(() => dom.lock.classList.add('is-visible'));
  dom.boot.classList.add('is-leaving');
  window.setTimeout(() => {
    dom.boot.hidden = true;
  }, 520);
}

function setupDemoMode() {
  state.demoMode = true;
  state.mode = 'demo';
  state.config = {
    site: { title: '潮汐手记', siteDir: '' },
    repo: { owner: '', repo: '', branch: '', dataPath: '', configPath: '' },
  };
  state.payload = state.demoSnapshot || demoPayload();
  state.bootConfigured = true;
}

function prepareDemoLock() {
  dom.lockEyebrow.textContent = 'DEMO EDITION';
  dom.lockTitle.textContent = '这是一本演示日记';
  dom.lockSubtitle.textContent = '输入任意密码，就可以翻开看看。';
  dom.lockHint.textContent = '演示模式：内容只停在这一页，刷新后重置。';
}

function enterDemo() {
  if (!state.demoMode) setupDemoMode();
  state.loadedDraft = state.demoDraft || null;
  enterApp();
  window.setTimeout(() => {
    if (state.view !== 'shelf') return;
    toast('这是演示模式。你写下的一切只保存在当前页面，刷新后会重置。', {
      tone: 'info',
      duration: 3600,
    });
  }, 700);
}

/* --------------------------------- 锁屏 ---------------------------------- */

function renderLockConfig() {
  const dot = document.createElement('i');
  dot.className = 'dot';

  if (!state.config) {
    state.mode = 'none';
    state.bootConfigured = false;
    dom.unlockForm.hidden = true;
    dom.lockUnconfigured.hidden = false;
    dom.lockEyebrow.textContent = 'BEFORE WE BEGIN';
    dom.lockTitle.textContent = '先为日记配一把钥匙';
    dom.lockSubtitle.textContent = '配置一次云端保险箱，之后在任何设备上，输入密码就能翻开。';
    dom.lockConfigState.replaceChildren(dot, document.createTextNode(' 尚未配置云端'));
    dom.lockConfigState.className = 'lock-config-state is-muted';
    dom.lockHint.textContent = '';
    return;
  }

  dom.unlockForm.hidden = false;
  dom.lockUnconfigured.hidden = true;
  dom.lockConfigState.className = 'lock-config-state';
  dom.lockConfigState.replaceChildren(
    dot,
    document.createTextNode(
      state.demoMode
        ? ' 演示模式 · 刷新后重置'
        : state.offline
          ? ` 离线缓存 · ${state.config.repo.owner}/${state.config.repo.repo}`
          : ` GitHub · ${state.config.repo.owner}/${state.config.repo.repo}`,
    ),
  );

  if (state.demoMode) {
    dom.lockEyebrow.textContent = 'DEMO EDITION';
    dom.lockTitle.textContent = '欢迎回来';
    dom.lockSubtitle.textContent = '输入任意密码，翻开这本演示日记。';
    dom.lockHint.textContent = '演示模式：内容只停在这一页，刷新后重置。';
  } else {
    dom.lockEyebrow.textContent = 'A QUIET PLACE';
    dom.lockTitle.textContent = state.lockWasAuto ? '夜已经深了' : '欢迎回来';
    dom.lockSubtitle.textContent = state.lockWasAuto
      ? '太久没有翻页，日记替你合上了。'
      : '输入密码，翻开今天这一页。';
    if (state.offline && state.lastError) {
      dom.lockHint.textContent = '当前离线，仍可用密码打开本机缓存。';
    } else if (state.lastError) {
      dom.lockHint.textContent = state.lastError;
    }
  }
}

async function handleUnlock(event) {
  event.preventDefault();
  if (!state.config) {
    window.location.href = './setup.html';
    return;
  }
  if (state.demoMode) {
    enterDemo();
    return;
  }

  const password = dom.passwordInput.value;
  if (!password) {
    setLockHint('请输入密码。', 'error');
    dom.passwordInput.focus();
    return;
  }

  setUnlockBusy(true, '正在解开保险箱…');
  dom.lock.classList.remove('is-shaking');
  try {
    const unlocked = await unlockVault(
      password,
      state.config.kdf,
      state.config.wrappedKey,
    );
    const secrets = await openSecrets(unlocked.masterKey, state.config.secrets);
    state.masterKey = unlocked.masterKey;
    state.masterRaw = unlocked.masterRaw;
    state.token = secrets.token || '';
    state.login = secrets.login || '';
    state.repo = new DiaryRepository({
      config: state.config,
      token: state.token,
      masterKey: state.masterKey,
    });

    setLockHint('正在从潮汐里取回日记…', 'info');
    let result;
    try {
      result = await state.repo.load();
    } catch (error) {
      result = {
        payload: state.repo ? await state.repo.readCache() : null,
        offline: true,
        pending: false,
        error,
      };
      if (!result.payload) throw error;
    }

    if (!result.payload) {
      const cached = await state.repo.readCache();
      if (cached) {
        result.payload = cached;
        result.offline = true;
      }
    }

    state.payload = result.payload || { version: 1, entries: [], tombstones: {}, updatedAt: new Date().toISOString() };
    state.offline = Boolean(result.offline || result.error);
    state.pending = Boolean(result.pending);
    state.tokenInvalid = Boolean(
      result.error && [401, 403].includes(result.error.status || result.error.cause?.status),
    );
    state.lastError = result.error?.message || '';
    state.unlockAttempts = 0;
    state.loadedDraft = await readDraft();
    dom.passwordInput.value = '';
    setLockHint('', '');
    await enterApp();
    if (state.pending) {
      window.setTimeout(() => syncNow({ silent: true, message: 'diary: 同步离线写下的内容' }), 700);
    }
    if (state.offline) {
      toast(
        state.tokenInvalid
          ? '同步凭据已失效，但本机缓存仍可阅读。写入前请重新配置 Token。'
          : '当前无法连接云端，已打开本机缓存。新写的内容会先安全保存。',
        { tone: 'warn', duration: 5600 },
      );
    }
  } catch (error) {
    if (!state.authenticated) {
      state.masterRaw && zeroBytes(state.masterRaw);
      state.masterRaw = null;
      state.masterKey = null;
      state.token = '';
      state.login = '';
      state.repo = null;
      state.payload = null;
    }
    const message =
      error instanceof CryptoError && error.code === 'WRONG_PASSWORD'
        ? '密码不对，再想想。'
        : error.message || '打开失败，请稍后再试。';
    state.unlockAttempts += 1;
    setLockHint(message, 'error');
    dom.lock.classList.add('is-shaking');
    window.setTimeout(() => dom.lock.classList.remove('is-shaking'), 480);
    dom.passwordInput.select();
  } finally {
    setUnlockBusy(false);
  }
}

function setUnlockBusy(busy, message = '') {
  dom.unlockButton.disabled = busy;
  dom.unlockButton.classList.toggle('is-busy', busy);
  dom.unlockButton.querySelector('span').textContent = busy ? '正在打开…' : '翻开日记';
  if (message) setLockHint(message, 'info');
  dom.passwordInput.disabled = busy;
}

function setLockHint(message, tone = '') {
  dom.lockHint.textContent = message;
  dom.lockHint.className = 'form-hint';
  if (tone) dom.lockHint.classList.add(`is-${tone}`);
}

/* --------------------------------- 进入应用 -------------------------------- */

async function enterApp() {
  state.authenticated = true;
  state.sessionId += 1;
  state.mode = state.demoMode ? 'demo' : 'cloud';
  state.lastActivity = Date.now();
  state.currentReaderId = null;

  dom.lock.hidden = true;
  dom.lock.classList.remove('is-visible');
  dom.app.hidden = false;
  requestAnimationFrame(() => dom.app.classList.add('is-visible'));
  document.body.classList.add('is-unlocked');
  document.body.dataset.view = 'shelf';

  setBrandTitle(state.config?.site?.title || '潮汐手记');
  reader.setEntries(state.payload?.entries || []);
  setView('shelf');
  renderShelf();
  renderStatus();
  updateSettingsSync();

  if (!window.location.hash) {
    history.replaceState(null, '', '#/');
  }
  await handleRoute();
  resetActivity();
  document.title = '潮汐手记 · Tidal Diary';
}

function setBrandTitle(title) {
  const small = document.createElement('small');
  small.textContent = 'PRIVATE JOURNAL';
  dom.brandText.replaceChildren(document.createTextNode(title), small);
  document.title = `${title} · Tidal Diary`;
}

/* --------------------------------- 书架 ---------------------------------- */

function renderShelf() {
  if (!state.payload) return;
  const entries = sortEntries(state.payload.entries || []);
  const today = todayKey();
  const todayEntry = entries.find((entry) => entry.date === today) || null;
  state.todayEntryId = todayEntry?.id || null;

  const totalWords = entries.reduce((sum, entry) => sum + countChars(entry.body || ''), 0);
  dom.statEntries.textContent = String(entries.length);
  dom.statStreak.textContent = String(streakDays(entries));
  dom.statWords.textContent = formatLargeNumber(totalWords);

  const now = new Date();
  const todayDate = parseDateKey(today);
  dom.greetingLine.textContent = `${greeting(now)} · ${now.getFullYear()}`;
  dom.heroSub.textContent = entries.length
    ? `已经收好 ${entries.length} 个日子。今天，想写点什么？`
    : '把那些很小的事写下来。以后翻开时，它们会替你记得。';
  dom.todayDay.textContent = String(todayDate.getDate()).padStart(2, '0');
  dom.todayDate.textContent = `${todayDate.getMonth() + 1} 月 · ${weekdayOf(today).replace('星期', '周')}`;

  if (todayEntry) {
    dom.todayHint.textContent = `今天写下了「${todayEntry.title?.trim() || '无题'}」。`;
    dom.todayEntryLabel.textContent = '读今天';
  } else {
    dom.todayHint.textContent = '今天还没有落笔。';
    dom.todayEntryLabel.textContent = '写今天';
  }

  const query = state.query.trim();
  const normalizedQuery = query.toLowerCase();
  const filtered = query
    ? entries.filter((entry) => {
        const mood = moodOf(entry.mood)?.label || '';
        const weather = weatherOf(entry.weather)?.label || '';
        return `${entry.title || ''}\n${entry.body || ''}\n${entry.date}\n${mood}\n${weather}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
    : entries;

  dom.timelineTitle.textContent = query ? `搜索「${query}」` : '最近写的';
  dom.timelineCount.textContent = `共 ${filtered.length} 篇`;

  dom.timeline.replaceChildren();
  if (filtered.length) {
    const groups = groupByMonth(filtered);
    let index = 0;
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'timeline-month';

      const head = document.createElement('div');
      head.className = 'month-head';
      const title = document.createElement('h2');
      title.textContent = group.label;
      const count = document.createElement('span');
      count.textContent = `${group.entries.length} 篇`;
      head.append(title, count);
      section.appendChild(head);

      const list = document.createElement('div');
      list.className = 'entry-list';
      for (const entry of group.entries) {
        list.appendChild(buildEntryRow(entry, index));
        index += 1;
      }
      section.appendChild(list);
      dom.timeline.appendChild(section);
    }
  }

  const showEmpty = filtered.length === 0;
  dom.emptyState.hidden = !showEmpty;
  if (showEmpty) {
    if (query) {
      state.emptyMode = 'search';
      dom.emptyTitle.textContent = '没有找到这一段潮汐';
      dom.emptyText.textContent = '换一个词试试。也许它藏在另一个句子里。';
      setEmptyButton('清空搜索', 'i-x');
    } else {
      state.emptyMode = 'empty';
      dom.emptyTitle.textContent = '书架还是空的';
      dom.emptyText.textContent = '从今天开始吧。写下第一句话，海就会记住它。';
      setEmptyButton('写第一页', 'i-pen');
    }
  }

  renderStatus();
  if (state.editor) updateEditorNumber();
}

function setEmptyButton(label, iconName) {
  dom.emptyWriteBtn.replaceChildren(createIcon(iconName), document.createTextNode(label));
}

function buildEntryRow(entry, index) {
  const date = parseDateKey(entry.date);
  const row = document.createElement('article');
  row.className = 'entry-row';
  row.tabIndex = 0;
  row.dataset.entryId = entry.id;
  row.setAttribute('role', 'link');
  row.setAttribute('aria-label', `阅读 ${entry.title || '无题'}`);
  row.style.setProperty('--entry-i', String(Math.min(index, 12)));

  const day = document.createElement('div');
  day.className = 'entry-day';
  const dayNumber = document.createElement('strong');
  dayNumber.textContent = String(date.getDate()).padStart(2, '0');
  const dayWeek = document.createElement('span');
  dayWeek.textContent = weekdayOf(entry.date).replace('星期', '周');
  day.append(dayNumber, dayWeek);

  const copy = document.createElement('div');
  copy.className = 'entry-copy';
  const top = document.createElement('div');
  top.className = 'entry-top';
  const title = document.createElement('h3');
  title.textContent = entry.title?.trim() || '无题';
  top.appendChild(title);
  const mood = moodOf(entry.mood);
  if (mood) {
    const moodTag = document.createElement('span');
    moodTag.className = 'mood-tag';
    moodTag.textContent = mood.label;
    top.appendChild(moodTag);
  }
  const body = document.createElement('p');
  body.className = 'entry-excerpt';
  body.textContent = excerpt(entry.body, 92) || '这一页只留下了一点空白。';
  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  meta.append(
    textSpan(`${relativeDay(entry.date)} · ${formatTime(entry.createdAt) || formatTime(entry.updatedAt)}`),
    textSpan(`${readingMinutes(entry.body)} 分钟`),
  );
  const weather = weatherOf(entry.weather);
  if (weather) meta.appendChild(textSpan(`${weather.glyph} ${weather.label}`));
  copy.append(top, body, meta);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'entry-edit';
  edit.dataset.editEntry = entry.id;
  edit.setAttribute('aria-label', `编辑 ${entry.title || '无题'}`);
  edit.appendChild(createIcon('i-pen'));

  const arrow = document.createElement('span');
  arrow.className = 'entry-arrow';
  arrow.textContent = '→';
  arrow.setAttribute('aria-hidden', 'true');

  row.append(day, copy, edit, arrow);
  return row;
}

function textSpan(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function formatLargeNumber(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

/* --------------------------------- 状态栏 --------------------------------- */

function renderStatus() {
  const pill = dom.syncPill;
  pill.classList.remove('is-demo', 'is-offline', 'is-pending', 'is-syncing', 'is-synced');
  let label = '已同步';
  let statusClass = 'is-synced';

  if (state.demoMode) {
    label = '演示';
    statusClass = 'is-demo';
  } else if (state.syncing) {
    label = '同步中';
    statusClass = 'is-syncing';
  } else if (state.offline) {
    label = '离线';
    statusClass = 'is-offline';
  } else if (state.pending) {
    label = '待同步';
    statusClass = 'is-pending';
  }
  pill.classList.add(statusClass);
  dom.syncLabel.textContent = label;

  const showNotice = !state.demoMode && (state.offline || state.pending || state.tokenInvalid);
  dom.shelfNotice.hidden = !showNotice;
  if (showNotice) {
    dom.noticeTitle.textContent = state.tokenInvalid
      ? '同步凭据已失效'
      : state.offline
        ? '当前为离线阅读'
        : '有内容等待同步';
    dom.noticeText.textContent = state.tokenInvalid
      ? '本机缓存仍可阅读。请前往配置页重新生成 Token，再回来同步。'
      : state.offline
        ? '新写的内容会先用密码加密，保存在这台设备上。'
        : '本机还有几页没有送到云端，点一下就能再试。';
    dom.noticeRetry.hidden = false;
  }

  updateSettingsSync();
}

function updateSettingsSync() {
  if (!dom.settingsSyncTitle) return;
  let title = '已与云端同步';
  let badge = '已同步';
  let badgeClass = 'is-ok';

  if (state.demoMode) {
    title = '演示模式';
    badge = 'DEMO';
    badgeClass = 'is-demo';
  } else if (state.syncing) {
    title = '正在与云端同步';
    badge = '同步中';
    badgeClass = 'is-busy';
  } else if (state.offline) {
    title = state.tokenInvalid ? '同步凭据已失效' : '当前离线';
    badge = '离线';
    badgeClass = 'is-offline';
  } else if (state.pending) {
    title = '有内容等待同步';
    badge = '待同步';
    badgeClass = 'is-pending';
  }

  dom.settingsSyncTitle.textContent = title;
  dom.settingsSyncBadge.textContent = badge;
  dom.settingsSyncBadge.className = `mini-badge ${badgeClass}`;
  dom.settingsSyncRepo.textContent = state.demoMode
    ? '内容只保存在当前页面'
    : state.config
      ? `${state.config.repo.owner}/${state.config.repo.repo} · ${state.config.repo.branch}`
      : '—';
  dom.settingsLastSync.textContent = state.demoMode
    ? '不会上传'
    : lastSyncAt()
      ? formatSyncTime(lastSyncAt())
      : '还没有同步过';

  if (state.config && !state.demoMode) {
    dom.repoLink.hidden = false;
    dom.repoLink.href = `https://github.com/${state.config.repo.owner}/${state.config.repo.repo}`;
  } else {
    dom.repoLink.hidden = true;
  }
  dom.syncNowButton.disabled = state.demoMode || state.syncing;
  dom.exportEncryptedButton.disabled = state.demoMode || !state.masterKey;
  dom.changePasswordButton.disabled = state.demoMode;
  dom.updateTokenButton.hidden = state.demoMode || !state.repo;
  dom.updateTokenButton.disabled = !state.masterKey || !state.repo;
}

function formatSyncTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/* --------------------------------- 视图切换 -------------------------------- */

function setView(name) {
  state.view = name;
  dom.shelf.hidden = name !== 'shelf';
  dom.reader.hidden = name !== 'reader';
  dom.editor.hidden = name !== 'editor';
  dom.header.hidden = name !== 'shelf';
  document.body.dataset.view = name;
  if (name !== 'shelf') closeSearch(true);
}

function closeSearch(clear = true) {
  dom.searchWrap.hidden = true;
  dom.searchToggle.setAttribute('aria-expanded', 'false');
  if (clear) {
    state.query = '';
    dom.searchInput.value = '';
  }
}

function goShelf({ replace = true, skipConfirm = false } = {}) {
  if (state.view === 'editor' && state.editor) {
    if (!skipConfirm) {
      closeEditorWithConfirm().then((ok) => {
        if (ok) finishGoShelf(replace);
      });
      return;
    }
    closeEditorWithConfirm({ skipConfirm: true });
  }
  if (state.view === 'reader' || reader?.entry) {
    reader?.close();
    state.currentReaderId = null;
  }
  finishGoShelf(replace);
}

function finishGoShelf(replace) {
  if (reader?.entry) {
    reader.close();
    state.currentReaderId = null;
  }
  document.body.classList.remove('reader-open');
  setView('shelf');
  renderShelf();
  navigate('#/', { replace });
  document.title = `${state.config?.site?.title || '潮汐手记'} · Tidal Diary`;
  window.scrollTo(0, 0);
}

/* --------------------------------- 阅读器 --------------------------------- */

function initReader() {
  reader = new Reader({
    view: dom.reader,
    stage: dom.readerStage,
    frame: dom.pageFrame,
    track: dom.pageTrack,
    elements: {
      kicker: dom.readerKicker,
      title: dom.readerTitle,
      counter: dom.readerCounter,
      progressText: dom.readerProgressText,
      progressBar: dom.readerProgressBar,
      prevBtn: dom.prevPageBtn,
      nextBtn: dom.nextPageBtn,
    },
    callbacks: {
      onNextEntry: (index) => openAdjacentEntry(index + 1, 'next'),
      onPrevEntry: (index) => openAdjacentEntry(index - 1, 'prev'),
      onOpenEntry: (id) => openReader(id, { history: 'replace' }),
      onBoundary: (message) => toast(message, { tone: 'info', duration: 1800 }),
      onProgress: ({ entry }) => {
        try {
          localStorage.setItem(
            STORAGE_KEYS.lastEntry,
            JSON.stringify({ id: entry.id, at: Date.now() }),
          );
        } catch {
          /* 忽略 */
        }
      },
      onClosePopovers: closeReaderPopovers,
    },
  });
}

async function openReader(entryId, { history = 'push', direction = '', atEnd = false } = {}) {
  if (!state.payload) return false;
  const entries = sortEntries(state.payload.entries || []);
  const entry = findEntry(entries, entryId);
  if (!entry) {
    toast('这一页好像被潮水带走了。', { tone: 'warn' });
    goShelf({ replace: true, skipConfirm: true });
    return false;
  }

  reader.setEntries(entries);
  setView('reader');
  closeReaderPopovers();
  document.body.classList.add('reader-open');
  try {
    const opened = await reader.open(entryId, { direction });
    if (!opened) throw new Error('无法打开这一页');
    if (atEnd) reader.goLast();
    state.currentReaderId = entryId;
    if (history === 'push') navigate(`#/read/${encodeURIComponent(entryId)}`, { replace: false });
    else if (history === 'replace') navigate(`#/read/${encodeURIComponent(entryId)}`, { replace: true });
    // 不在浏览器标题/历史里暴露日记标题。
    document.title = `${state.config?.site?.title || '潮汐手记'} · Tidal Diary`;
    window.scrollTo(0, 0);
    reader.showChrome();
    return true;
  } catch (error) {
    console.error(error);
    toast('排版这一页时遇到了问题，请再试一次。', { tone: 'error' });
    setView('shelf');
    return false;
  }
}

async function openAdjacentEntry(index, direction) {
  const entries = sortEntries(state.payload?.entries || []);
  const target = entries[index];
  if (!target) return false;
  const ok = await openReader(target.id, {
    history: 'replace',
    direction,
    atEnd: direction === 'prev',
  });
  return ok;
}

function closeReaderView() {
  if (!reader) return;
  reader.close();
  state.currentReaderId = null;
  document.body.classList.remove('reader-open');
  setView('shelf');
  renderShelf();
  navigate('#/', { replace: true });
  document.title = `${state.config?.site?.title || '潮汐手记'} · Tidal Diary`;
}

function closeReaderPopovers() {
  dom.fontPanel.hidden = true;
  dom.readerMenuPanel.hidden = true;
  if (!dom.readerCatalog.hidden) {
    dom.readerCatalog.classList.remove('is-open');
    window.setTimeout(() => {
      if (!dom.readerCatalog.classList.contains('is-open')) dom.readerCatalog.hidden = true;
    }, 240);
  }
}

function toggleReaderPanel(panel) {
  const target = panel === 'font' ? dom.fontPanel : dom.readerMenuPanel;
  const other = panel === 'font' ? dom.readerMenuPanel : dom.fontPanel;
  other.hidden = true;
  target.hidden = !target.hidden;
  if (!target.hidden) {
    closeCatalog();
    target.classList.remove('is-visible');
    requestAnimationFrame(() => target.classList.add('is-visible'));
  }
}

function toggleFontPanel() {
  toggleReaderPanel('font');
}

function toggleReaderMenu() {
  toggleReaderPanel('menu');
}

function openCatalog() {
  if (!state.payload) return;
  closeReaderPopovers();
  const entries = sortEntries(state.payload.entries || []);
  dom.catalogList.replaceChildren();
  entries.forEach((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-item';
    button.dataset.catalogEntry = entry.id;
    if (entry.id === reader?.entry?.id) button.classList.add('is-current');

    const date = document.createElement('span');
    date.className = 'catalog-date';
    const parsed = parseDateKey(entry.date);
    date.textContent = `${parsed.getMonth() + 1}.${String(parsed.getDate()).padStart(2, '0')}`;

    const copy = document.createElement('span');
    copy.className = 'catalog-copy';
    const title = document.createElement('strong');
    title.textContent = entry.title?.trim() || '无题';
    const meta = document.createElement('small');
    meta.textContent = `第 ${entries.length - index} 篇 · ${readingMinutes(entry.body)} 分钟`;
    copy.append(title, meta);

    const current = document.createElement('span');
    current.className = 'catalog-current';
    current.textContent = '正在读';

    button.append(date, copy, current);
    dom.catalogList.appendChild(button);
  });

  dom.readerCatalog.hidden = false;
  requestAnimationFrame(() => dom.readerCatalog.classList.add('is-open'));
  const current = dom.catalogList.querySelector('.is-current');
  if (current) {
    requestAnimationFrame(() => current.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
}

function closeCatalog() {
  if (dom.readerCatalog.hidden) return;
  dom.readerCatalog.classList.remove('is-open');
  window.setTimeout(() => {
    if (!dom.readerCatalog.classList.contains('is-open')) dom.readerCatalog.hidden = true;
  }, 240);
}

function changeReaderFont(delta) {
  const next = Math.max(15, Math.min(24, state.fontSize + delta));
  if (next === state.fontSize) return;
  state.fontSize = next;
  applyFontSize(next);
}

/* --------------------------------- 编辑器 --------------------------------- */

function buildPickers() {
  dom.moodPicker.replaceChildren();
  for (const mood of MOODS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.mood = mood.key;
    const mark = document.createElement('span');
    mark.className = 'chip-mark';
    mark.textContent = mood.mark;
    button.append(mark, document.createTextNode(mood.label));
    dom.moodPicker.appendChild(button);
  }

  dom.weatherPicker.replaceChildren();
  for (const weather of WEATHERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip weather-chip';
    button.dataset.weather = weather.key;
    const mark = document.createElement('span');
    mark.className = 'chip-mark';
    mark.textContent = weather.glyph;
    button.append(mark, document.createTextNode(weather.label));
    dom.weatherPicker.appendChild(button);
  }
}

async function openEditor(entryId = null, { history = 'push', returnTo = 'shelf' } = {}) {
  if (!state.payload) return;
  if (dom.settingsDialog.open) dom.settingsDialog.close();

  const entries = sortEntries(state.payload.entries || []);
  const existing = entryId ? findEntry(entries, entryId) : null;
  if (entryId && !existing) {
    toast('没有找到这一篇。', { tone: 'warn' });
    return;
  }

  const draft = state.loadedDraft;
  let useDraft = false;
  let content = existing
    ? { ...existing }
    : {
        id: null,
        date: todayKey(),
        title: '',
        body: '',
        mood: 'calm',
        weather: '',
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };

  if (draft && draft.entryId === (existing?.id || null)) {
    const baseMatches = !existing || draft.baseUpdatedAt === existing.updatedAt;
    const differs =
      draft.title !== (existing?.title || '') ||
      draft.body !== (existing?.body || '') ||
      draft.mood !== (existing?.mood || '') ||
      draft.weather !== (existing?.weather || '') ||
      draft.date !== (existing?.date || todayKey());
    if (baseMatches && differs && (draft.title || draft.body)) {
      content = {
        ...content,
        title: draft.title || '',
        body: draft.body || '',
        mood: draft.mood || content.mood,
        weather: draft.weather || '',
        date: draft.date || content.date,
      };
      useDraft = true;
    }
  }

  state.editorReturn = returnTo;
  state.editor = {
    id: existing?.id || null,
    original: existing ? { ...existing } : null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    date: content.date || todayKey(),
    title: content.title || '',
    body: content.body || '',
    mood: content.mood || '',
    weather: content.weather || '',
    dirty: useDraft,
    saving: false,
  };

  setView('editor');
  document.body.classList.remove('reader-open');
  closeReaderPopovers();

  dom.editorTitle.value = state.editor.title;
  dom.editorBody.value = state.editor.body;
  dom.editorDate.value = state.editor.date;
  dom.editorDate.max = todayKey();
  dom.editorDelete.hidden = !existing;
  dom.editorSaveState.textContent = useDraft ? '已恢复草稿' : existing ? '已保存' : '未保存';
  dom.editorSaveState.className = 'editor-save-state';
  if (useDraft) dom.editorSaveState.classList.add('is-dirty');
  updateEditorChips();
  updateEditorNumber();
  updateEditorCount();
  autoGrowEditor();
  window.setTimeout(autoGrowEditor, 60);

  if (history === 'push') navigate(`#/write${existing ? `/${encodeURIComponent(existing.id)}` : ''}`, { replace: false });
  else if (history === 'replace') navigate(`#/write${existing ? `/${encodeURIComponent(existing.id)}` : ''}`, { replace: true });
  document.title = `写一页 · ${state.config?.site?.title || '潮汐手记'}`;

  if (useDraft) {
    toast('已恢复上次没有收好的草稿。', { tone: 'info', duration: 3000 });
  } else if (window.matchMedia('(pointer: fine)').matches && !existing) {
    window.setTimeout(() => dom.editorTitle.focus(), 180);
  }
}

function updateEditorNumber() {
  const entries = sortEntries(state.payload?.entries || []);
  const ascending = [...entries].sort((a, b) => {
    const dateDiff = String(a.date).localeCompare(String(b.date));
    if (dateDiff !== 0) return dateDiff;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
  let number = ascending.length + 1;
  if (state.editor?.id) {
    const index = ascending.findIndex((entry) => entry.id === state.editor.id);
    if (index >= 0) number = index + 1;
  }
  dom.editorNumber.textContent = String(number).padStart(2, '0');
}

function updateEditorChips() {
  if (!state.editor) return;
  dom.moodPicker.querySelectorAll('[data-mood]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mood === state.editor.mood);
  });
  dom.weatherPicker.querySelectorAll('[data-weather]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.weather === state.editor.weather);
  });
}

function updateEditorCount() {
  const body = dom.editorBody.value;
  const count = countChars(body);
  dom.editorCount.textContent = count
    ? `${count} 字 · 约 ${readingMinutes(body)} 分钟`
    : '0 字';
}

function autoGrowEditor() {
  if (state.view !== 'editor') return;
  dom.editorBody.style.height = 'auto';
  dom.editorBody.style.height = `${Math.max(window.innerHeight * 0.45, dom.editorBody.scrollHeight + 8)}px`;
}

function updateEditorFromDom({ markDirty = true } = {}) {
  if (!state.editor) return;
  state.editor.title = dom.editorTitle.value;
  state.editor.body = dom.editorBody.value;
  state.editor.date = dom.editorDate.value || todayKey();
  if (markDirty) {
    state.editor.dirty = true;
    dom.editorSaveState.textContent = '未保存';
    dom.editorSaveState.classList.add('is-dirty');
  }
  updateEditorCount();
  autoGrowEditor();
  scheduleDraft();
}

function scheduleDraft() {
  if (!state.editor) return;
  window.clearTimeout(state.draftTimer);
  state.draftTimer = window.setTimeout(() => {
    saveDraftNow();
  }, 700);
}

async function saveDraftNow() {
  if (!state.editor || !state.editor.dirty) return;
  const editor = state.editor;
  const draft = {
    entryId: editor.id,
    baseUpdatedAt: editor.original?.updatedAt || null,
    date: editor.date,
    title: editor.title,
    body: editor.body,
    mood: editor.mood,
    weather: editor.weather,
    savedAt: new Date().toISOString(),
  };
  const seq = ++state.draftSeq;

  if (state.demoMode) {
    state.demoDraft = draft;
    if (state.editor === editor) dom.draftStatus.textContent = '演示草稿 · 只存于本页';
    return;
  }
  if (!state.masterKey) return;
  try {
    const sealed = await encryptDraft(state.masterKey, draft);
    if (seq !== state.draftSeq) return;
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(sealed));
    state.loadedDraft = draft;
    if (state.editor === editor) {
      dom.draftStatus.textContent = `草稿已加密保存 · ${formatClock(new Date())}`;
    }
  } catch {
    if (state.editor === editor) dom.draftStatus.textContent = '草稿保存失败';
  }
}

async function readDraft() {
  if (state.demoMode) return state.demoDraft || null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.draft);
    if (!raw) return null;
    const sealed = JSON.parse(raw);
    const draft = await decryptDraft(state.masterKey, sealed);
    if (!draft || typeof draft !== 'object') return null;
    return draft;
  } catch {
    return null;
  }
}

function clearDraft() {
  state.draftSeq += 1;
  window.clearTimeout(state.draftTimer);
  state.loadedDraft = null;
  state.demoDraft = null;
  try {
    localStorage.removeItem(STORAGE_KEYS.draft);
  } catch {
    /* 忽略 */
  }
  dom.draftStatus.textContent = '';
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function closeEditorWithConfirm({ skipConfirm = false } = {}) {
  if (!state.editor) return true;
  if (state.editor.dirty && !skipConfirm) {
    const ok = await confirmAction({
      eyebrow: 'UNFINISHED PAGE',
      title: '这一页还没有收好',
      message: '离开前会把草稿用密码加密，保存在这台设备上。下次打开时可以接着写。',
      okLabel: '保存草稿并离开',
      cancelLabel: '继续写',
    });
    if (!ok) return false;
  }

  const wasDirty = state.editor.dirty;
  if (wasDirty) {
    await saveDraftNow();
  }
  state.editor = null;
  window.clearTimeout(state.draftTimer);
  dom.editorSaveState.textContent = '';
  dom.draftStatus.textContent = '';
  if (wasDirty && !state.demoMode) {
    toast('草稿已加密保存在本机。', { tone: 'success', duration: 2600 });
  }
  return true;
}

async function handleEditorSave() {
  if (!state.editor || state.editor.saving) return;
  updateEditorFromDom({ markDirty: false });
  const editor = state.editor;
  const title = dom.editorTitle.value.trim();
  const body = dom.editorBody.value.replace(/\r\n/g, '\n').replace(/\s+$/g, '');
  if (!title && !body.trim()) {
    toast('先写一句话，再收好这一页。', { tone: 'warn' });
    dom.editorBody.focus();
    return;
  }

  editor.saving = true;
  dom.editorSave.disabled = true;
  dom.editorSave.classList.add('is-busy');
  dom.editorSaveLabel.textContent = '正在收好…';
  dom.editorSaveState.textContent = '保存中…';

  const now = new Date().toISOString();
  const entry = {
    id: editor.id || uid(),
    date: dom.editorDate.value || todayKey(),
    title: title || '无题',
    body,
    mood: editor.mood || '',
    weather: editor.weather || '',
    createdAt: editor.createdAt || now,
    updatedAt: now,
  };

  try {
    state.payload = upsertEntry(state.payload, entry);
    reader.setEntries(sortEntries(state.payload.entries));
    // 提交信息不包含日记标题，避免公开仓库的提交记录泄露内容线索。
    const message = 'diary: 更新一页';

    let result = { ok: true, demo: state.demoMode };
    if (!state.demoMode) {
      result = await syncNow({
        payload: state.payload,
        message,
        silent: true,
      });
    }

    clearDraft();
    state.editor = null;
    state.editorReturn = 'shelf';
    dom.editorSave.disabled = false;
    dom.editorSave.classList.remove('is-busy');
    dom.editorSaveLabel.textContent = '收好这一页';

    renderShelf();
    await openReader(entry.id, { history: 'replace' });

    if (state.demoMode) {
      toast('已收好这一页。演示模式下，刷新后会重新开始。', {
        tone: 'success',
        duration: 4200,
      });
    } else if (result.ok) {
      toast('这一页已经收进云端。', { tone: 'success' });
    } else {
      toast('已加密保存在本机，等待下次同步。', { tone: 'warn', duration: 4600 });
    }
  } catch (error) {
    console.error(error);
    editor.saving = false;
    dom.editorSave.disabled = false;
    dom.editorSave.classList.remove('is-busy');
    dom.editorSaveLabel.textContent = '收好这一页';
    dom.editorSaveState.textContent = '保存失败';
    toast(error.message || '保存失败，请稍后重试。', { tone: 'error', duration: 5000 });
  }
}

async function handleEditorDelete() {
  if (!state.editor?.id) return;
  const title = state.editor.title?.trim() || '这一篇';
  const ok = await confirmAction({
    eyebrow: 'DELETE A PAGE',
    title: '要把这一页撕下来吗？',
    message: `「${title}」会从云端和本机一起删除。这个动作无法撤销。`,
    okLabel: '删除这一篇',
    cancelLabel: '再想想',
    danger: true,
  });
  if (!ok) return;

  const id = state.editor.id;
  state.payload = deleteEntry(state.payload, id);
  reader.setEntries(sortEntries(state.payload.entries));
  clearDraft();
  state.editor = null;
  reader.close();
  state.currentReaderId = null;

  let synced = true;
  if (!state.demoMode) {
    const result = await syncNow({ message: 'diary: 删除一页', silent: true });
    synced = result.ok;
  }
  dom.editorSave.disabled = false;
  setView('shelf');
  renderShelf();
  navigate('#/', { replace: true });
  toast(
    synced ? '那一页已经随潮水退走了。' : '已从本机移除，云端会在下次同步时更新。',
    { tone: synced ? 'success' : 'warn', duration: 4600 },
  );
}

/* --------------------------------- 同步 ---------------------------------- */

async function syncNow({ silent = false, message = 'diary: 同步日记', payload = null } = {}) {
  if (state.demoMode) {
    if (!silent) toast('演示模式不会上传内容。', { tone: 'info' });
    return { ok: true, demo: true };
  }
  if (!state.repo) {
    if (!silent) toast('还没有连接到云端仓库。', { tone: 'warn' });
    return { ok: false, error: new Error('no repository') };
  }

  if (state.syncing && state.syncPromise) {
    try {
      await state.syncPromise;
    } catch {
      /* 等前一次结束 */
    }
  }

  const session = state.sessionId;
  state.syncing = true;
  renderStatus();
  state.syncPromise = (async () => {
    try {
      const target = payload || state.payload;
      const result = await state.repo.sync(target, { message });
      if (session === state.sessionId) {
        state.payload = result.payload;
        state.pending = false;
        state.offline = false;
        state.tokenInvalid = false;
        state.lastError = '';
        reader.setEntries(sortEntries(state.payload.entries));
        if (state.view === 'shelf') renderShelf();
        renderStatus();
      }
      if (!silent) {
        toast(result.noop ? '云端已经是最新的一页。' : '已同步到云端。', {
          tone: 'success',
          duration: 2600,
        });
      }
      return { ok: true, ...result };
    } catch (error) {
      if (session === state.sessionId) {
        state.offline = error.offline !== false;
        state.pending = true;
        state.lastError = error.message || '同步失败';
        state.tokenInvalid = Boolean(
          error.cause && [401, 403].includes(error.cause.status),
        );
        renderStatus();
      }
      if (!silent) {
        toast(error.message || '同步失败，请稍后重试。', {
          tone: 'warn',
          duration: 5400,
        });
      }
      return { ok: false, error };
    } finally {
      if (session === state.sessionId) {
        state.syncing = false;
        state.syncPromise = null;
        renderStatus();
      }
    }
  })();

  return state.syncPromise;
}

/* --------------------------------- 设置 ---------------------------------- */

function openSettings() {
  if (!state.authenticated) return;
  closeReaderPopovers();
  renderSettingsState();
  if (!dom.settingsDialog.open) {
    dom.settingsDialog.showModal();
    dom.settingsDialog.tabIndex = -1;
    dom.settingsDialog.focus();
  }
}

function renderSettingsState() {
  updateSettingsSync();
  dom.themeCards.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeChoice === state.theme);
  });
  dom.readerThemeDots.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeChoice === state.theme);
  });
  dom.settingsFontValue.textContent = String(state.fontSize);
  dom.readerFontValue.textContent = String(state.fontSize);
  dom.settingsFontMinus.disabled = state.fontSize <= 15;
  dom.settingsFontPlus.disabled = state.fontSize >= 24;
  dom.autoLockSelect.value = String(state.autoLockMinutes);
}

function applyTheme(theme, { silent = false } = {}) {
  const value = ['day', 'sepia', 'night'].includes(theme) ? theme : 'day';
  state.theme = value;
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem(STORAGE_KEYS.theme, value);
  } catch {
    /* 忽略 */
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaTheme) metaTheme.setAttribute('content', THEME_COLORS[value]);
  if (metaScheme) metaScheme.setAttribute('content', value === 'night' ? 'dark' : 'light');
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeChoice === value);
  });
  if (!silent) {
    dom.settingsFontValue.textContent = String(state.fontSize);
  }
}

function applyFontSize(size, { silent = false } = {}) {
  const value = Math.max(15, Math.min(24, Number(size) || 18));
  state.fontSize = value;
  document.documentElement.style.setProperty('--reader-font-size', `${value}px`);
  try {
    localStorage.setItem(STORAGE_KEYS.fontSize, String(value));
  } catch {
    /* 忽略 */
  }
  dom.settingsFontValue.textContent = String(value);
  dom.readerFontValue.textContent = String(value);
  dom.settingsFontMinus.disabled = value <= 15;
  dom.settingsFontPlus.disabled = value >= 24;
  if (!silent && reader?.isOpen) {
    window.clearTimeout(state.fontReflowTimer);
    state.fontReflowTimer = window.setTimeout(() => {
      if (reader?.isOpen) reader.reflow();
    }, 170);
  }
}

function setThemeFromButton(button) {
  const theme = button?.dataset?.themeChoice;
  if (!theme) return;
  applyTheme(theme);
  renderSettingsState();
}

/* --------------------------------- 备份 ---------------------------------- */

async function exportEncryptedBackup() {
  if (state.demoMode || !state.masterKey) {
    toast('演示模式没有可导出的加密数据。', { tone: 'info' });
    return;
  }
  try {
    const envelope = await encryptPayload(state.masterKey, state.payload);
    const backup = {
      format: 'tidal-diary-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      siteTitle: state.config?.site?.title || '潮汐手记',
      meta: { entries: state.payload.entries.length },
      vault: {
        kdf: state.config.kdf,
        wrappedKey: state.config.wrappedKey,
      },
      data: envelope,
    };
    downloadText(
      `tidal-diary-backup-${todayKey().replace(/-/g, '')}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
    toast('加密备份已经下载。请把它和密码分开存放。', {
      tone: 'success',
      duration: 4200,
    });
  } catch (error) {
    toast(error.message || '导出失败。', { tone: 'error' });
  }
}

function exportMarkdown() {
  if (!state.payload) return;
  const entries = [...sortEntries(state.payload.entries)].reverse();
  const lines = [
    `# ${state.config?.site?.title || '潮汐手记'}`,
    '',
    `> 导出于 ${formatDateLongCN(todayKey())} · 共 ${entries.length} 篇`,
    '',
  ];
  for (const entry of entries) {
    const mood = moodOf(entry.mood)?.label || '';
    const weather = weatherOf(entry.weather)?.label || '';
    lines.push('---', '');
    lines.push(`## ${formatDateLongCN(entry.date)} · ${entry.title?.trim() || '无题'}`);
    lines.push('');
    const meta = [mood && `心情：${mood}`, weather && `天气：${weather}`, formatTime(entry.createdAt)]
      .filter(Boolean)
      .join(' ｜ ');
    if (meta) lines.push(`*${meta}*`, '');
    lines.push(entry.body || '', '');
  }
  downloadText(
    `tidal-diary-${todayKey().replace(/-/g, '')}.md`,
    `\ufeff${lines.join('\n')}`,
    'text/markdown',
  );
  toast('Markdown 已经下载。它是明文，请妥善保管。', {
    tone: 'info',
    duration: 4200,
  });
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('备份文件太大了。');
    }
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('这个文件不是有效的 JSON。');
    }

    if (data?.format === 'tidal-diary-backup' && data.data && data.vault) {
      state.pendingImport = { ...data, fileName: file.name };
      dom.importBackupName.textContent = file.name;
      dom.importPassword.value = '';
      dom.importPasswordError.hidden = true;
      dom.importPasswordSubmit.disabled = false;
      if (dom.settingsDialog.open) dom.settingsDialog.close();
      if (!dom.importPasswordDialog.open) dom.importPasswordDialog.showModal();
      window.setTimeout(() => dom.importPassword.focus(), 120);
      return;
    }

    if (isDataEnvelope(data)) {
      if (!state.masterKey) throw new Error('演示模式无法打开这份加密数据。');
      const payload = await decryptPayload(state.masterKey, data);
      await mergeImportedPayload(payload, '加密备份');
      return;
    }

    const rawEntries = Array.isArray(data)
      ? data
      : Array.isArray(data?.entries)
        ? data.entries
        : null;
    if (!rawEntries) throw new Error('没有在这份文件里找到日记。');
    const payload = sanitizeImportedPayload({ entries: rawEntries, tombstones: data.tombstones });
    await mergeImportedPayload(payload, '明文备份');
  } catch (error) {
    toast(error.message || '导入失败。', { tone: 'error', duration: 5000 });
  } finally {
    dom.importFileInput.value = '';
  }
}

async function handleImportPassword(event) {
  event.preventDefault();
  const pending = state.pendingImport;
  if (!pending) return;
  const password = dom.importPassword.value;
  if (!password) {
    dom.importPasswordError.textContent = '请输入备份密码。';
    dom.importPasswordError.hidden = false;
    return;
  }
  dom.importPasswordSubmit.disabled = true;
  dom.importPasswordError.hidden = true;
  try {
    const { masterKey } = await unlockVault(
      password,
      pending.vault.kdf,
      pending.vault.wrappedKey,
    );
    const payload = await decryptPayload(masterKey, pending.data);
    state.pendingImport = null;
    dom.importPasswordDialog.close();
    await mergeImportedPayload(payload, '加密备份');
  } catch (error) {
    dom.importPasswordError.textContent =
      error instanceof CryptoError && error.code === 'WRONG_PASSWORD'
        ? '备份密码不对。'
        : error.message || '无法打开这份备份。';
    dom.importPasswordError.hidden = false;
  } finally {
    dom.importPasswordSubmit.disabled = false;
  }
}

function sanitizeImportedPayload(raw) {
  const entries = [];
  const limit = 5000;
  const source = Array.isArray(raw?.entries) ? raw.entries.slice(0, limit) : [];
  const validMoods = new Set(MOODS.map((mood) => mood.key));
  const validWeathers = new Set(WEATHERS.map((weather) => weather.key));

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.title !== 'string' && typeof item.body !== 'string') continue;
    const id = typeof item.id === 'string' && item.id ? item.id.slice(0, 120) : uid();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)) ? item.date : todayKey();
    const createdAt = Number.isFinite(Date.parse(item.createdAt))
      ? new Date(item.createdAt).toISOString()
      : new Date().toISOString();
    const updatedAt = Number.isFinite(Date.parse(item.updatedAt))
      ? new Date(item.updatedAt).toISOString()
      : createdAt;
    entries.push({
      id,
      date,
      title: String(item.title || '').slice(0, 120),
      body: String(item.body || '').slice(0, 400000),
      mood: validMoods.has(item.mood) ? item.mood : '',
      weather: validWeathers.has(item.weather) ? item.weather : '',
      createdAt,
      updatedAt,
    });
  }

  const tombstones = {};
  if (raw?.tombstones && typeof raw.tombstones === 'object') {
    for (const [id, time] of Object.entries(raw.tombstones)) {
      if (typeof id === 'string' && Number.isFinite(Number(time))) {
        tombstones[id] = Number(time);
      }
    }
  }
  return {
    version: 1,
    entries,
    tombstones,
    updatedAt: new Date().toISOString(),
  };
}

async function mergeImportedPayload(imported, sourceLabel) {
  const before = new Set((state.payload.entries || []).map((entry) => entry.id));
  const merged = mergePayloads(state.payload, imported);
  const added = merged.entries.filter((entry) => !before.has(entry.id)).length;
  state.payload = merged;
  reader.setEntries(sortEntries(state.payload.entries));
  renderShelf();

  let synced = true;
  if (!state.demoMode) {
    const result = await syncNow({ silent: true, message: 'diary: 导入备份' });
    synced = result.ok;
  }
  const summary = added ? `新增 ${added} 篇` : '已与现有日记合并';
  toast(
    state.demoMode
      ? `已合并${sourceLabel}：${summary}（演示模式不会上传）`
      : synced
        ? `已合并${sourceLabel}：${summary}，并同步到云端。`
        : `已合并${sourceLabel}：${summary}。云端暂不可用，稍后会自动重试。`,
    { tone: synced ? 'success' : 'warn', duration: 5000 },
  );
}

/* --------------------------------- 密码 ---------------------------------- */

function openChangePassword() {
  if (state.demoMode) {
    toast('演示模式不需要更改密码。', { tone: 'info' });
    return;
  }
  if (dom.settingsDialog.open) dom.settingsDialog.close();
  dom.newPassword.value = '';
  dom.newPasswordConfirm.value = '';
  dom.changePasswordError.hidden = true;
  updatePasswordStrength('');
  dom.changePasswordSubmit.disabled = false;
  if (!dom.passwordDialog.open) dom.passwordDialog.showModal();
  window.setTimeout(() => dom.newPassword.focus(), 120);
}

function updatePasswordStrength(value) {
  const result = passwordScore(value);
  const widths = ['8%', '28%', '54%', '78%', '100%'];
  dom.newPasswordStrength.style.width = widths[result.score];
  dom.newPasswordStrength.dataset.score = String(result.score);
  dom.newPasswordLabel.textContent = value ? result.label : '建议至少 12 位';
  dom.newPasswordLabel.dataset.score = String(result.score);
}

async function handleChangePassword(event) {
  event.preventDefault();
  if (!state.masterRaw || !state.repo) {
    toast('当前无法更改密码。', { tone: 'warn' });
    return;
  }
  const password = dom.newPassword.value;
  const confirm = dom.newPasswordConfirm.value;
  dom.changePasswordError.hidden = true;

  if (password.length < 10) {
    showChangePasswordError('新密码至少需要 10 位。建议 12 位以上。');
    return;
  }
  if (password !== confirm) {
    showChangePasswordError('两次输入的密码不一样。');
    return;
  }
  if (normalizePassword(password) === '') {
    showChangePasswordError('新密码不能只有空白字符。');
    return;
  }

  dom.changePasswordSubmit.disabled = true;
  dom.changePasswordSubmit.textContent = '正在换钥匙…';
  try {
    const rewrapped = await rewrapMasterKey(state.masterRaw, password, DEFAULT_ITERATIONS);
    const nextConfig = {
      ...state.config,
      kdf: rewrapped.kdf,
      wrappedKey: rewrapped.wrappedKey,
    };
    await state.repo.saveConfig(nextConfig, { message: 'config: 更换日记密码' });
    state.config = nextConfig;
    cacheConfig(nextConfig);
    dom.passwordDialog.close();
    toast('密码已经更换。其他设备下次打开时，请使用新密码。', {
      tone: 'success',
      duration: 5200,
    });
  } catch (error) {
    showChangePasswordError(error.message || '更改密码失败，请稍后重试。');
  } finally {
    dom.changePasswordSubmit.disabled = false;
    dom.changePasswordSubmit.textContent = '换一把钥匙';
  }
}

function showChangePasswordError(message) {
  dom.changePasswordError.textContent = message;
  dom.changePasswordError.hidden = false;
}

/* ------------------------------- 更新 Token ------------------------------- */

function openTokenDialog() {
  if (state.demoMode) {
    toast('演示模式不需要更新 Token。', { tone: 'info' });
    return;
  }
  if (!state.masterKey || !state.repo) {
    toast('请先打开日记，再更新 Token。', { tone: 'warn' });
    return;
  }
  if (dom.settingsDialog.open) dom.settingsDialog.close();
  dom.newToken.value = '';
  dom.tokenError.hidden = true;
  dom.tokenSubmit.disabled = false;
  if (!dom.tokenDialog.open) dom.tokenDialog.showModal();
  window.setTimeout(() => dom.newToken.focus(), 120);
}

async function handleTokenUpdate(event) {
  event.preventDefault();
  if (!state.masterKey || !state.repo || !state.config) return;
  const value = dom.newToken.value.trim();
  if (!/^(gh[pousr]_|github_pat_)/.test(value)) {
    dom.tokenError.textContent = '这看起来不是 GitHub Token。通常以 ghp_ 或 github_pat_ 开头。';
    dom.tokenError.hidden = false;
    return;
  }

  dom.tokenSubmit.disabled = true;
  dom.tokenSubmit.textContent = '正在验证…';
  dom.tokenError.hidden = true;
  try {
    const client = new GitHubClient(value);
    const user = await client.getUser();
    await client.getRepo(state.config.repo.owner, state.config.repo.repo);

    const secrets = await sealSecrets(state.masterKey, {
      token: value,
      login: user.login || state.login || '',
      createdAt: new Date().toISOString(),
    });
    const nextConfig = { ...state.config, secrets };
    const nextRepo = new DiaryRepository({
      config: nextConfig,
      token: value,
      masterKey: state.masterKey,
    });
    await nextRepo.saveConfig(nextConfig, { message: 'config: 更新同步 Token' });

    state.config = nextConfig;
    state.repo = nextRepo;
    state.token = value;
    state.login = user.login || state.login || '';
    state.tokenInvalid = false;
    state.lastError = '';
    cacheConfig(nextConfig);
    dom.tokenDialog.close();
    updateSettingsSync();
    renderStatus();
    toast('Token 已更新，日记内容没有被重新加密。', {
      tone: 'success',
      duration: 4200,
    });
    window.setTimeout(() => {
      syncNow({ silent: true, message: 'diary: 更新凭据后同步' });
    }, 700);
  } catch (error) {
    dom.tokenError.textContent = error.message || 'Token 验证或写入失败。';
    dom.tokenError.hidden = false;
  } finally {
    dom.tokenSubmit.disabled = false;
    dom.tokenSubmit.textContent = '验证并更新';
  }
}

/* --------------------------------- 锁定 ---------------------------------- */

async function lockApp({ reason = 'manual' } = {}) {
  if (!state.authenticated) return;
  if (state.editor?.dirty) {
    await saveDraftNow();
  }
  if (state.syncing && state.syncPromise) {
    await Promise.race([state.syncPromise, delay(2800)]);
  }

  state.sessionId += 1;
  state.authenticated = false;
  state.lockWasAuto = reason === 'auto';
  const demoSnapshot = state.demoMode ? state.payload : null;

  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  reader?.dispose();
  state.masterRaw && zeroBytes(state.masterRaw);
  state.masterRaw = null;
  state.masterKey = null;
  state.token = '';
  state.login = '';
  state.repo = null;
  state.payload = null;
  state.demoSnapshot = demoSnapshot;
  state.offline = false;
  state.pending = false;
  state.syncing = false;
  state.syncPromise = null;
  state.tokenInvalid = false;
  state.lastError = '';
  state.editor = null;
  state.currentReaderId = null;
  state.loadedDraft = null;
  state.query = '';
  state.view = 'locked';
  window.clearTimeout(state.draftTimer);
  closeSearch(true);

  dom.app.hidden = true;
  dom.app.classList.remove('is-visible');
  dom.lock.hidden = false;
  requestAnimationFrame(() => dom.lock.classList.add('is-visible'));
  document.body.classList.remove('is-unlocked', 'reader-open');
  document.body.dataset.view = 'locked';
  dom.header.hidden = false;
  dom.shelf.hidden = false;
  dom.reader.hidden = true;
  dom.editor.hidden = true;
  dom.timeline.replaceChildren();
  dom.catalogList.replaceChildren();
  dom.pageTrack.replaceChildren();
  dom.readerTitle.textContent = '';
  dom.readerKicker.textContent = '';
  dom.editorTitle.value = '';
  dom.editorBody.value = '';
  dom.passwordInput.value = '';
  dom.passwordInput.disabled = false;
  setUnlockBusy(false);
  setLockHint(
    reason === 'auto' ? '因为很久没有翻页，日记已经自动合上。' : '',
    reason === 'auto' ? 'info' : '',
  );
  renderLockConfig();
  document.title = '潮汐手记 · Tidal Diary';
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/* --------------------------------- 交互绑定 -------------------------------- */

function bindEvents() {
  dom.unlockForm.addEventListener('submit', handleUnlock);
  dom.togglePassword.addEventListener('click', togglePasswordVisibility);
  dom.demoButton.addEventListener('click', () => {
    if (!state.demoMode) setupDemoMode();
    renderLockConfig();
    enterDemo();
  });
  dom.lockHelpButton.addEventListener('click', () => {
    if (!dom.infoDialog.open) dom.infoDialog.showModal();
  });

  dom.lockButton.addEventListener('click', () => lockApp({ reason: 'manual' }));
  dom.settingsLockButton.addEventListener('click', () => {
    dom.settingsDialog.close();
    lockApp({ reason: 'manual' });
  });
  dom.settingsButton.addEventListener('click', openSettings);
  dom.syncPill.addEventListener('click', openSettings);
  dom.searchToggle.addEventListener('click', toggleSearch);
  dom.searchInput.addEventListener('input', debounce(() => {
    state.query = dom.searchInput.value;
    renderShelf();
  }, 120));
  dom.searchClear.addEventListener('click', () => {
    state.query = '';
    dom.searchInput.value = '';
    dom.searchInput.focus();
    renderShelf();
  });

  dom.newEntryBtn.addEventListener('click', () => openEditor(null));
  dom.composeFab.addEventListener('click', () => openEditor(null));
  dom.todayEntryBtn.addEventListener('click', () => {
    if (state.todayEntryId) openReader(state.todayEntryId);
    else openEditor(null);
  });
  dom.randomEntryBtn.addEventListener('click', openRandomEntry);
  dom.emptyWriteBtn.addEventListener('click', () => {
    if (state.emptyMode === 'search') {
      state.query = '';
      dom.searchInput.value = '';
      renderShelf();
    } else {
      openEditor(null);
    }
  });
  dom.noticeRetry.addEventListener('click', () => syncNow({ message: 'diary: 手动同步' }));

  dom.timeline.addEventListener('click', handleTimelineClick);
  dom.timeline.addEventListener('keydown', handleTimelineKey);

  dom.readerBack.addEventListener('click', closeReaderView);
  dom.readerFontBtn.addEventListener('click', toggleFontPanel);
  dom.readerMoreBtn.addEventListener('click', toggleReaderMenu);
  dom.readerCatalogBtn.addEventListener('click', openCatalog);
  dom.readerFontMinus.addEventListener('click', () => changeReaderFont(-1));
  dom.readerFontPlus.addEventListener('click', () => changeReaderFont(1));
  dom.readerThemeDots.addEventListener('click', (event) => {
    setThemeFromButton(event.target.closest('[data-theme-choice]'));
  });
  dom.readerEditBtn.addEventListener('click', () => {
    const entry = reader?.entry;
    closeReaderPopovers();
    if (!entry) return;
    reader.saveProgress();
    state.currentReaderId = entry.id;
    openEditor(entry.id, { history: 'push', returnTo: 'reader' });
  });
  dom.readerCopyBtn.addEventListener('click', copyReaderLink);
  dom.readerLockBtn.addEventListener('click', () => lockApp({ reason: 'manual' }));
  dom.catalogClose.addEventListener('click', closeCatalog);
  dom.readerCatalog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-catalog]')) closeCatalog();
    const item = event.target.closest('[data-catalog-entry]');
    if (item) {
      closeCatalog();
      openReader(item.dataset.catalogEntry, { history: 'replace' });
    }
  });

  dom.editorBack.addEventListener('click', handleEditorBack);
  dom.editorSave.addEventListener('click', handleEditorSave);
  dom.editorDelete.addEventListener('click', handleEditorDelete);
  dom.editorTitle.addEventListener('input', () => updateEditorFromDom());
  dom.editorBody.addEventListener('input', () => updateEditorFromDom());
  dom.editorDate.addEventListener('change', () => {
    updateEditorFromDom();
    updateEditorNumber();
  });
  dom.moodPicker.addEventListener('click', (event) => toggleEditorChip(event, 'mood'));
  dom.weatherPicker.addEventListener('click', (event) => toggleEditorChip(event, 'weather'));

  dom.settingsDialog.addEventListener('click', (event) => {
    if (event.target === dom.settingsDialog) dom.settingsDialog.close();
  });
  dom.settingsDialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => dom.settingsDialog.close());
  });
  dom.confirmDialog.addEventListener('click', (event) => {
    if (event.target === dom.confirmDialog) dom.confirmDialog.close('cancel');
  });
  dom.passwordDialog.addEventListener('click', (event) => {
    if (event.target === dom.passwordDialog) dom.passwordDialog.close();
  });
  dom.importPasswordDialog.addEventListener('click', (event) => {
    if (event.target === dom.importPasswordDialog) dom.importPasswordDialog.close();
  });
  dom.tokenDialog.addEventListener('click', (event) => {
    if (event.target === dom.tokenDialog) dom.tokenDialog.close();
  });
  dom.infoDialog.addEventListener('click', (event) => {
    if (event.target === dom.infoDialog) dom.infoDialog.close();
  });
  dom.infoDialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => dom.infoDialog.close());
  });
  dom.passwordDialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => dom.passwordDialog.close());
  });
  dom.importPasswordDialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => dom.importPasswordDialog.close());
  });
  dom.tokenDialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => dom.tokenDialog.close());
  });

  dom.themeCards.addEventListener('click', (event) => {
    setThemeFromButton(event.target.closest('[data-theme-choice]'));
  });
  dom.settingsFontMinus.addEventListener('click', () => changeReaderFont(-1));
  dom.settingsFontPlus.addEventListener('click', () => changeReaderFont(1));
  dom.autoLockSelect.addEventListener('change', () => {
    state.autoLockMinutes = Number(dom.autoLockSelect.value);
    try {
      localStorage.setItem(STORAGE_KEYS.autoLock, String(state.autoLockMinutes));
    } catch {
      /* 忽略 */
    }
    resetActivity();
    toast(state.autoLockMinutes ? `将在 ${state.autoLockMinutes} 分钟无操作后自动上锁。` : '已关闭自动上锁。', {
      tone: 'info',
      duration: 2200,
    });
  });
  dom.syncNowButton.addEventListener('click', () => syncNow({ message: 'diary: 手动同步' }));
  dom.updateTokenButton.addEventListener('click', openTokenDialog);
  dom.tokenForm.addEventListener('submit', handleTokenUpdate);
  dom.changePasswordButton.addEventListener('click', openChangePassword);
  dom.exportEncryptedButton.addEventListener('click', exportEncryptedBackup);
  dom.exportMarkdownButton.addEventListener('click', exportMarkdown);
  dom.importButton.addEventListener('click', () => dom.importFileInput.click());
  dom.importFileInput.addEventListener('change', () => {
    handleImportFile(dom.importFileInput.files?.[0]);
  });

  dom.newPassword.addEventListener('input', () => updatePasswordStrength(dom.newPassword.value));
  dom.changePasswordForm.addEventListener('submit', handleChangePassword);
  dom.importPasswordForm.addEventListener('submit', handleImportPassword);

  dom.confirmOk.addEventListener('click', () => dom.confirmDialog.close('ok'));
  dom.confirmCancel.addEventListener('click', () => dom.confirmDialog.close('cancel'));

  document.addEventListener('pointerdown', handleDocumentPointerDown, { passive: true });
  document.addEventListener('wheel', resetActivity, { passive: true });
  document.addEventListener('touchmove', resetActivity, { passive: true });
  document.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('popstate', () => {
    handleRoute().catch(() => {});
  });
  window.addEventListener('resize', () => {
    if (state.view === 'editor') autoGrowEditor();
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', (event) => {
    if (state.editor?.dirty) {
      saveDraftNow();
      event.preventDefault();
      event.returnValue = '';
    }
  });

  window.setInterval(() => {
    if (!state.authenticated || !state.autoLockMinutes) return;
    if (Date.now() - state.lastActivity > state.autoLockMinutes * 60_000) {
      lockApp({ reason: 'auto' });
    }
  }, 15_000);
}

function togglePasswordVisibility() {
  const isPassword = dom.passwordInput.type === 'password';
  dom.passwordInput.type = isPassword ? 'text' : 'password';
  dom.togglePassword.setAttribute('aria-label', isPassword ? '隐藏密码' : '显示密码');
  dom.togglePassword.querySelector('use').setAttribute('href', isPassword ? '#i-eye-off' : '#i-eye');
}

function toggleSearch() {
  const willOpen = dom.searchWrap.hidden;
  dom.searchWrap.hidden = !willOpen;
  dom.searchToggle.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    dom.searchInput.focus();
  } else {
    state.query = '';
    dom.searchInput.value = '';
    renderShelf();
  }
}

function handleTimelineClick(event) {
  const edit = event.target.closest('[data-edit-entry]');
  if (edit) {
    event.preventDefault();
    event.stopPropagation();
    openEditor(edit.dataset.editEntry);
    return;
  }
  const row = event.target.closest('[data-entry-id]');
  if (row) openReader(row.dataset.entryId);
}

function handleTimelineKey(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('[data-entry-id]');
  if (!row || event.target.closest('[data-edit-entry]')) return;
  event.preventDefault();
  openReader(row.dataset.entryId);
}

function openRandomEntry() {
  const entries = sortEntries(state.payload?.entries || []);
  if (!entries.length) {
    openEditor(null);
    return;
  }
  const candidates = entries.length > 1 ? entries.filter((entry) => entry.id !== reader?.entry?.id) : entries;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  openReader(pick.id);
}

function toggleEditorChip(event, type) {
  const button = event.target.closest(`[data-${type}]`);
  if (!button || !state.editor) return;
  const key = button.dataset[type];
  state.editor[type] = state.editor[type] === key ? '' : key;
  state.editor.dirty = true;
  dom.editorSaveState.textContent = '未保存';
  dom.editorSaveState.classList.add('is-dirty');
  updateEditorChips();
  scheduleDraft();
}

async function handleEditorBack() {
  const returnTo = state.editorReturn;
  const readerId = state.currentReaderId;
  const ok = await closeEditorWithConfirm();
  if (!ok) return;
  if (returnTo === 'reader' && readerId) {
    await openReader(readerId, { history: 'replace' });
  } else {
    setView('shelf');
    renderShelf();
    navigate('#/', { replace: true });
    document.title = `${state.config?.site?.title || '潮汐手记'} · Tidal Diary`;
  }
}

function handleDocumentPointerDown(event) {
  resetActivity();
  if (state.view !== 'reader') return;
  const target = event.target;
  if (
    dom.fontPanel.hidden &&
    dom.readerMenuPanel.hidden &&
    dom.readerCatalog.hidden
  ) {
    return;
  }
  if (
    target.closest('.reader-popover') ||
    target.closest('#readerFontBtn') ||
    target.closest('#readerMoreBtn') ||
    target.closest('#readerCatalogBtn') ||
    target.closest('.catalog-panel')
  ) {
    return;
  }
  closeReaderPopovers();
  closeCatalog();
}

function handleGlobalKeydown(event) {
  resetActivity();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    if (state.view === 'editor') {
      event.preventDefault();
      handleEditorSave();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (!dom.readerCatalog.hidden) {
      closeCatalog();
      event.preventDefault();
      return;
    }
    if (!dom.fontPanel.hidden || !dom.readerMenuPanel.hidden) {
      dom.fontPanel.hidden = true;
      dom.readerMenuPanel.hidden = true;
      event.preventDefault();
      return;
    }
    if (state.view === 'reader') {
      if (reader?.chromeHidden) reader.showChrome();
      else closeReaderView();
      event.preventDefault();
    }
  }
}

function handleDocumentClick(event) {
  const nav = event.target.closest('a[data-nav="shelf"]');
  if (nav) {
    event.preventDefault();
    goShelf({ replace: true });
    return;
  }
  const anchor = event.target.closest('a[href^="#/"]');
  if (anchor && state.authenticated) {
    event.preventDefault();
    const hash = anchor.getAttribute('href');
    if (hash === location.hash) return;
    history.pushState(null, '', hash);
    handleRoute().catch(() => {});
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    state.hiddenAt = Date.now();
    return;
  }
  if (
    state.authenticated &&
    state.autoLockMinutes &&
    state.hiddenAt &&
    Date.now() - state.hiddenAt > state.autoLockMinutes * 60_000
  ) {
    lockApp({ reason: 'auto' });
  }
  state.hiddenAt = 0;
  resetActivity();
}

function resetActivity() {
  state.lastActivity = Date.now();
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

/* --------------------------------- 路由 ---------------------------------- */

function navigate(hash, { replace = false } = {}) {
  if (location.hash === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
}

async function handleRoute() {
  if (!state.authenticated || !state.payload) return;
  const hash = location.hash || '#/';

  if (hash.startsWith('#/read/')) {
    const id = decodeURIComponent(hash.slice('#/read/'.length));
    if (state.view === 'reader' && reader?.entry?.id === id) return;
    if (state.view === 'editor') {
      const ok = await closeEditorWithConfirm({ skipConfirm: true });
      if (!ok) return;
    }
    await openReader(id, { history: 'none' });
    return;
  }

  if (hash.startsWith('#/write')) {
    const rest = hash.slice('#/write'.length).replace(/^\//, '');
    const id = rest ? decodeURIComponent(rest.split('?')[0]) : null;
    if (state.view === 'editor' && state.editor?.id === id) return;
    if (state.view === 'reader') {
      if (!dom.readerCatalog.hidden) closeCatalog();
      reader?.close();
      state.currentReaderId = null;
      document.body.classList.remove('reader-open');
    }
    await openEditor(id, { history: 'none' });
    return;
  }

  if (state.view === 'editor') {
    const ok = await closeEditorWithConfirm({ skipConfirm: true });
    if (!ok) return;
  }
  if (state.view === 'reader' || reader?.entry) {
    reader?.close();
    state.currentReaderId = null;
    document.body.classList.remove('reader-open');
  }
  setView('shelf');
  renderShelf();
}

/* --------------------------------- 杂项 ---------------------------------- */

function confirmAction({
  eyebrow = 'PLEASE CONFIRM',
  title,
  message,
  okLabel = '确定',
  cancelLabel = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    dom.confirmEyebrow.textContent = eyebrow;
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmOk.textContent = okLabel;
    dom.confirmCancel.textContent = cancelLabel;
    dom.confirmOk.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    dom.confirmDialog.returnValue = '';
    const onClose = () => {
      dom.confirmDialog.removeEventListener('close', onClose);
      resolve(dom.confirmDialog.returnValue === 'ok');
    };
    dom.confirmDialog.addEventListener('close', onClose);
    if (!dom.confirmDialog.open) dom.confirmDialog.showModal();
  });
}

function copyReaderLink() {
  const entry = reader?.entry;
  if (!entry) return;
  const url = `${location.origin}${location.pathname}${location.search}#/read/${encodeURIComponent(entry.id)}`;
  const done = () => {
    closeReaderPopovers();
    toast('本页链接已复制。', { tone: 'success', duration: 2200 });
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
  } else {
    fallbackCopy(url, done);
  }
}

function fallbackCopy(text, done) {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    toast('复制失败，请手动复制地址栏链接。', { tone: 'warn' });
  } finally {
    input.remove();
  }
}

function toast(message, { tone = 'info', duration = 3200 } = {}) {
  const node = document.createElement('div');
  node.className = `toast toast-${tone}`;
  const iconName = tone === 'success' ? 'i-check' : tone === 'warn' ? 'i-info' : tone === 'error' ? 'i-cloud-off' : 'i-info';
  node.appendChild(createIcon(iconName));
  const text = document.createElement('span');
  text.textContent = message;
  node.appendChild(text);
  dom.toastHost.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  window.setTimeout(() => {
    node.classList.remove('is-visible');
    window.setTimeout(() => node.remove(), 300);
  }, duration);
}

function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.appendChild(use);
  return svg;
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new ConfigError('NETWORK', message || '请求超时'));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('./sw.js', document.baseURI), { scope: './' })
      .catch(() => {
        /* 离线缓存失败不影响主功能 */
      });
  });
}

window.addEventListener('error', (event) => {
  console.error('潮汐手记运行时错误：', event.error || event.message);
});
