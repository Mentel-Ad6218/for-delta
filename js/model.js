/* 日期、文本与数据合并的纯函数工具 */

export const MOODS = [
  { key: 'calm', label: '平静', mark: '静' },
  { key: 'bright', label: '轻快', mark: '晴' },
  { key: 'tired', label: '疲惫', mark: '倦' },
  { key: 'missing', label: '想念', mark: '念' },
  { key: 'low', label: '低落', mark: '沉' },
  { key: 'soft', label: '柔软', mark: '柔' },
];

export const WEATHERS = [
  { key: 'sunny', label: '晴', glyph: '☼' },
  { key: 'cloudy', label: '多云', glyph: '☁' },
  { key: 'rain', label: '雨', glyph: '☂' },
  { key: 'snow', label: '雪', glyph: '❄' },
  { key: 'wind', label: '风', glyph: '≋' },
  { key: 'fog', label: '雾', glyph: '〰' },
];

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

/** 本地时区的 YYYY-MM-DD，避免 toISOString 的时区偏移问题 */
export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return new Date();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function weekdayOf(key) {
  return WEEKDAYS[parseDateKey(key).getDay()];
}

export function formatDateCN(key) {
  const d = parseDateKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDateLongCN(key) {
  return `${formatDateCN(key)} · ${weekdayOf(key)}`;
}

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UNITS = ['', '十', '百', '千'];

/** 把 1–9999 转成中文数字，用于“第几夜 / 第几篇” */
export function cnNumber(input) {
  const n = Math.floor(Number(input));
  if (!Number.isFinite(n) || n <= 0) return '零';
  if (n >= 10000) return String(n);
  const digits = String(n).split('').map(Number);
  let result = '';
  digits.forEach((digit, index) => {
    const unit = CN_UNITS[digits.length - index - 1];
    if (digit === 0) {
      if (result && !result.endsWith('〇') && index < digits.length - 1) result += '〇';
    } else {
      if (!(digit === 1 && index === 0 && digits.length === 2)) result += CN_DIGITS[digit];
      result += unit;
    }
  });
  return result.replace(/〇+$/, '').replace(/〇{2,}/g, '〇') || '零';
}

export function formatMonthKey(key) {
  const d = parseDateKey(key);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

export function formatMonthShort(key) {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1} 月`;
}

export function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function relativeDay(key, now = new Date()) {
  const target = parseDateKey(key);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff > 2 && diff < 7) return `${diff} 天前`;
  if (diff < 0) return '未来';
  return formatMonthShort(key);
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return '夜还很长';
  if (hour < 11) return '早上好';
  if (hour < 14) return '午安';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

export function countChars(text) {
  return Array.from(String(text || '').replace(/\s/g, '')).length;
}

export function readingMinutes(text) {
  return Math.max(1, Math.ceil(countChars(text) / 420));
}

export function excerpt(text, limit = 96) {
  const clean = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
  const chars = Array.from(clean);
  if (chars.length <= limit) return clean;
  return `${chars.slice(0, limit).join('')}…`;
}

export function formatWordCount(text) {
  const count = countChars(text);
  if (count < 1000) return `${count} 字`;
  return `${(count / 1000).toFixed(1)}k 字`;
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const dateDiff = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateDiff !== 0) return dateDiff;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export function groupByMonth(entries) {
  const groups = [];
  let current = null;
  for (const entry of sortEntries(entries)) {
    const month = String(entry.date || '').slice(0, 7);
    if (!current || current.month !== month) {
      current = { month, label: formatMonthKey(`${month}-01`), entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

export function moodOf(key) {
  return MOODS.find((mood) => mood.key === key) || null;
}

export function weatherOf(key) {
  return WEATHERS.find((weather) => weather.key === key) || null;
}

/* --------------------------------- 合并逻辑 --------------------------------- */

function toMs(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function mergePayloads(base, incoming) {
  const entries = new Map();
  const tombstones = {};
  const sources = [base, incoming].filter(Boolean);

  for (const source of sources) {
    for (const entry of source.entries || []) {
      if (!entry || typeof entry.id !== 'string') continue;
      const previous = entries.get(entry.id);
      if (!previous || toMs(entry.updatedAt) >= toMs(previous.updatedAt)) {
        entries.set(entry.id, { ...entry });
      }
    }
    for (const [id, time] of Object.entries(source.tombstones || {})) {
      tombstones[id] = Math.max(tombstones[id] || 0, toMs(time));
    }
  }

  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const entry = entries.get(id);
    if (entry && toMs(entry.updatedAt) <= deletedAt) entries.delete(id);
  }

  const mergedEntries = sortEntries([...entries.values()]);
  const latest = Math.max(
    ...sources.map((source) => toMs(source.updatedAt)),
    ...mergedEntries.map((entry) => toMs(entry.updatedAt)),
    ...Object.values(tombstones),
    0,
  );

  return {
    version: 1,
    entries: mergedEntries,
    tombstones,
    updatedAt: latest ? new Date(latest).toISOString() : new Date().toISOString(),
  };
}

/**
 * 判断 candidate 是否含有 base 里没有的新内容（用于判断本地是否有待上传修改）。
 */
export function hasMeaningfulDifference(base, candidate) {
  const merged = mergePayloads(base, candidate);
  return contentSignature(merged) !== contentSignature(base);
}

function contentSignature(payload) {
  return JSON.stringify({
    entries: (payload.entries || [])
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        body: entry.body,
        date: entry.date,
        mood: entry.mood,
        weather: entry.weather,
        updatedAt: entry.updatedAt,
      }))
      .sort((x, y) => x.id.localeCompare(y.id)),
    tombstones: Object.fromEntries(
      Object.entries(payload.tombstones || {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
}

export function upsertEntry(payload, entry) {
  const entries = new Map((payload.entries || []).map((item) => [item.id, item]));
  entries.set(entry.id, { ...entry });
  const tombstones = { ...(payload.tombstones || {}) };
  delete tombstones[entry.id];
  return normalizePayloadLocal({
    version: 1,
    entries: sortEntries([...entries.values()]),
    tombstones,
    updatedAt: new Date().toISOString(),
  });
}

export function deleteEntry(payload, id) {
  const entries = (payload.entries || []).filter((entry) => entry.id !== id);
  const tombstones = { ...(payload.tombstones || {}), [id]: Date.now() };
  return normalizePayloadLocal({
    version: 1,
    entries,
    tombstones,
    updatedAt: new Date().toISOString(),
  });
}

function normalizePayloadLocal(payload) {
  return {
    version: 1,
    entries: payload.entries || [],
    tombstones: payload.tombstones || {},
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

export function findEntry(entries, id) {
  return entries.find((entry) => entry.id === id) || null;
}

export function streakDays(entries, now = new Date()) {
  const days = new Set(entries.map((entry) => entry.date).filter(Boolean));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(toDateKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function chineseYear(key) {
  const year = String(parseDateKey(key).getFullYear());
  return [...year].map((digit) => CN_DIGITS[Number(digit)] || digit).join('');
}
