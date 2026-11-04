/*
 * 潮汐手记 · 加密内核
 * ------------------------------------------------------------
 * 设计：
 *  - 用户密码只用于「包裹」一把随机主密钥（PBKDF2-SHA256 + AES-GCM）。
 *  - 日记正文、GitHub Token 都由主密钥加密。
 *  - 修改密码时只需重新包裹主密钥，无需重新加密全部日记。
 *  - 所有密钥材料只在浏览器内存里出现，不发送给任何第三方。
 */

export const DEFAULT_ITERATIONS = 310_000;
export const MIN_ITERATIONS = 120_000;
export const MAX_ITERATIONS = 1_200_000;

export const AAD = Object.freeze({
  wrappedKey: 'tidal-diary/wrapped-key/v1',
  secrets: 'tidal-diary/secrets/v1',
  data: 'tidal-diary/data/v1',
  draft: 'tidal-diary/draft/v1',
});

export class CryptoError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'CryptoError';
    this.code = code;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ---------------------------------- 基础工具 --------------------------------- */

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CryptoError('BAD_PAYLOAD', '加密数据缺少必要字段');
  }
  let binary;
  try {
    binary = atob(value.replace(/\s+/g, ''));
  } catch {
    throw new CryptoError('BAD_PAYLOAD', '加密数据格式不完整');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizePassword(password) {
  return String(password ?? '').normalize('NFKC');
}

export function zeroBytes(bytes) {
  if (bytes instanceof Uint8Array) bytes.fill(0);
}

export function passwordScore(password) {
  const value = normalizePassword(password);
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;
  const groups = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^\x20-\x7e]/].filter((re) => re.test(value)).length;
  if (groups >= 3) score += 1;
  if (groups >= 4) score += 1;
  if (/^(.)\1+$/.test(value) || /^(?:123456|password|qwerty|abc123|admin|woaini|5201314)/i.test(value)) {
    score = Math.min(score, 1);
  }
  const labels = ['太短了', '偏弱', '一般', '不错', '很稳'];
  return { score: Math.max(0, Math.min(4, score)), label: labels[Math.max(0, Math.min(4, score))] };
}

/* ---------------------------------- 密钥派生 --------------------------------- */

export async function derivePasswordKey(password, salt, iterations = DEFAULT_ITERATIONS) {
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < MIN_ITERATIONS || rounds > MAX_ITERATIONS) {
    throw new CryptoError('BAD_KDF', '密码派生参数异常');
  }
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizePassword(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt instanceof Uint8Array ? salt : base64ToBytes(salt),
      iterations: rounds,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createMasterKey() {
  const raw = randomBytes(32);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
  return { key, raw };
}

export async function importMasterKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/* --------------------------------- AES-GCM --------------------------------- */

export async function encryptBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(aad),
      tagLength: 128,
    },
    key,
    bytes,
  );
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(cipher)) };
}

export async function decryptBytes(key, blob, aad) {
  if (!blob || typeof blob.iv !== 'string' || typeof blob.ct !== 'string') {
    throw new CryptoError('BAD_PAYLOAD', '加密数据格式不完整');
  }
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(blob.iv),
        additionalData: encoder.encode(aad),
        tagLength: 128,
      },
      key,
      base64ToBytes(blob.ct),
    );
    return new Uint8Array(plain);
  } catch {
    throw new CryptoError('DECRYPT_FAILED', '无法解开这段内容');
  }
}

export async function encryptText(key, text, aad) {
  return encryptBytes(key, encoder.encode(String(text)), aad);
}

export async function decryptText(key, blob, aad) {
  const plain = await decryptBytes(key, blob, aad);
  return decoder.decode(plain);
}

/* ------------------------------- 保险箱 / 配置 ------------------------------- */

/**
 * 用密码创建一把主密钥，并返回配置中需要的公开字段。
 */
export async function createVault(password, iterations = DEFAULT_ITERATIONS) {
  const salt = randomBytes(16);
  const passwordKey = await derivePasswordKey(password, salt, iterations);
  const { key: masterKey, raw } = await createMasterKey();
  const wrappedKey = await encryptBytes(passwordKey, raw, AAD.wrappedKey);
  const saltB64 = bytesToBase64(salt);
  return {
    masterKey,
    masterRaw: raw,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: saltB64 },
    wrappedKey,
  };
}

/**
 * 用密码打开主密钥。密码错误或配置损坏都会在这里失败。
 */
export async function unlockVault(password, kdf, wrappedKey) {
  if (!kdf || typeof kdf.salt !== 'string') {
    throw new CryptoError('BAD_CONFIG', '配置文件缺少密钥参数');
  }
  const passwordKey = await derivePasswordKey(password, kdf.salt, kdf.iterations);
  let raw;
  try {
    raw = await decryptBytes(passwordKey, wrappedKey, AAD.wrappedKey);
  } catch {
    throw new CryptoError('WRONG_PASSWORD', '密码不正确');
  }
  if (raw.length !== 32) throw new CryptoError('BAD_CONFIG', '主密钥长度异常');
  const key = await importMasterKey(raw);
  return { masterKey: key, masterRaw: raw };
}

export async function rewrapMasterKey(masterRaw, password, iterations = DEFAULT_ITERATIONS) {
  const salt = randomBytes(16);
  const passwordKey = await derivePasswordKey(password, salt, iterations);
  const wrappedKey = await encryptBytes(passwordKey, masterRaw, AAD.wrappedKey);
  return {
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(salt) },
    wrappedKey,
  };
}

export async function sealSecrets(masterKey, secrets) {
  return encryptText(masterKey, JSON.stringify(secrets), AAD.secrets);
}

export async function openSecrets(masterKey, blob) {
  try {
    const text = await decryptText(masterKey, blob, AAD.secrets);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError('BAD_SECRETS', '无法读取同步凭据');
  }
}

/* --------------------------------- 日记数据 --------------------------------- */

export function createEmptyPayload() {
  return {
    version: 1,
    entries: [],
    tombstones: {},
    updatedAt: new Date().toISOString(),
  };
}

export function normalizePayload(value) {
  const payload = value && typeof value === 'object' ? value : {};
  const entries = Array.isArray(payload.entries) ? payload.entries.filter(isValidEntry) : [];
  const tombstones = {};
  if (payload.tombstones && typeof payload.tombstones === 'object') {
    for (const [id, time] of Object.entries(payload.tombstones)) {
      if (typeof id === 'string' && Number.isFinite(Number(time))) tombstones[id] = Number(time);
    }
  }
  return {
    version: 1,
    entries,
    tombstones,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
  };
}

function isValidEntry(entry) {
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      typeof entry.id === 'string' &&
      entry.id.length > 0 &&
      entry.id.length <= 120 &&
      (typeof entry.body === 'string' || typeof entry.title === 'string'),
  );
}

export async function encryptPayload(masterKey, payload) {
  const normalized = normalizePayload(payload);
  const text = JSON.stringify(normalized);
  const sealed = await encryptText(masterKey, text, AAD.data);
  return {
    format: 'tidal-diary-data',
    version: 1,
    alg: 'AES-GCM',
    iv: sealed.iv,
    ct: sealed.ct,
    updatedAt: new Date().toISOString(),
  };
}

export function isDataEnvelope(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.format === 'tidal-diary-data' &&
      typeof value.iv === 'string' &&
      typeof value.ct === 'string',
  );
}

export async function decryptPayload(masterKey, envelope) {
  if (!isDataEnvelope(envelope)) {
    throw new CryptoError('BAD_DATA', '这不是一份潮汐手记的数据文件');
  }
  try {
    const text = await decryptText(masterKey, envelope, AAD.data);
    return normalizePayload(JSON.parse(text));
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError('BAD_DATA', '数据文件已损坏或不属于当前密码');
  }
}

/* --------------------------------- 草稿加密 --------------------------------- */

export async function encryptDraft(masterKey, draft) {
  return encryptText(masterKey, JSON.stringify(draft), AAD.draft);
}

export async function decryptDraft(masterKey, blob) {
  try {
    return JSON.parse(await decryptText(masterKey, blob, AAD.draft));
  } catch {
    return null;
  }
}
