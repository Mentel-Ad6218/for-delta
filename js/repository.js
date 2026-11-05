/* 配置读取、密文缓存与 GitHub 双向同步 */

import {
  createEmptyPayload,
  decryptImageBytes,
  decryptPayload,
  encryptPayload,
  isDataEnvelope,
  normalizePayload,
} from './crypto.js?v=1.4.0';
import { GitHubClient, GitHubError, repoFromLocation } from './github.js?v=1.4.0';
import { hasMeaningfulDifference, mergePayloads } from './model.js?v=1.4.0';

export const CONFIG_CACHE_KEY = 'tidal.config.v1';
export const DATA_CACHE_KEY = 'tidal.data.v1';
export const LAST_SYNC_KEY = 'tidal.lastSync.v1';
const CACHE_NOTE_KEY = 'tidal.cacheNote.v1';

export class ConfigError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export class SyncError extends Error {
  constructor(message, { offline = false, cause } = {}) {
    super(message);
    this.name = 'SyncError';
    this.offline = offline;
    this.cause = cause;
  }
}

/* --------------------------------- 配置文件 --------------------------------- */

export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new ConfigError('INVALID', '配置文件格式不正确');
  if (raw.format !== 'tidal-diary-config') {
    throw new ConfigError('INVALID', '这不是潮汐手记的配置文件');
  }
  const repo = raw.repo || {};
  const required = ['owner', 'repo', 'branch', 'dataPath', 'configPath'];
  for (const key of required) {
    if (typeof repo[key] !== 'string' || !repo[key].trim()) {
      throw new ConfigError('INVALID', `配置文件缺少 repo.${key}`);
    }
  }
  if (!raw.kdf || typeof raw.kdf.salt !== 'string') {
    throw new ConfigError('INVALID', '配置文件缺少密钥参数');
  }
  if (!raw.wrappedKey || !raw.secrets) {
    throw new ConfigError('INVALID', '配置文件缺少加密字段');
  }
  return {
    ...raw,
    site: {
      title: raw.site?.title || '潮汐手记',
      siteDir: raw.site?.siteDir || '',
    },
    repo: {
      owner: repo.owner.trim(),
      repo: repo.repo.trim(),
      branch: repo.branch.trim(),
      dataPath: repo.dataPath.replace(/^\/+/, ''),
      configPath: repo.configPath.replace(/^\/+/, ''),
    },
  };
}

export async function fetchConfig() {
  const url = new URL('./config.json', document.baseURI);
  url.searchParams.set('t', String(Date.now()));
  let response;
  try {
    response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new ConfigError('NETWORK', '无法读取配置文件，请检查网络');
  }
  if (response.status === 404) {
    throw new ConfigError('MISSING', '尚未配置云端日记');
  }
  if (!response.ok) {
    throw new ConfigError('NETWORK', `配置文件读取失败（${response.status}）`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ConfigError('INVALID', '配置文件不是有效的 JSON');
  }
  const config = validateConfig(data);
  cacheConfig(config);
  return config;
}

export function cacheConfig(config) {
  try {
    localStorage.setItem(
      CONFIG_CACHE_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), config }),
    );
  } catch {
    /* 隐私模式下可能无法写入，不影响本次使用 */
  }
}

export function readCachedConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateConfig(parsed.config);
  } catch {
    return null;
  }
}

export function cachedConfigAge() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null');
    if (!raw?.savedAt) return null;
    return Date.now() - Date.parse(raw.savedAt);
  } catch {
    return null;
  }
}

export function suggestRepo() {
  return repoFromLocation();
}

/* --------------------------------- 密文缓存 --------------------------------- */

function readCachedEnvelope() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isDataEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCacheNote(note) {
  try {
    localStorage.setItem(CACHE_NOTE_KEY, note);
  } catch {
    /* 忽略 */
  }
}

export function cacheNote() {
  try {
    return localStorage.getItem(CACHE_NOTE_KEY) || '';
  } catch {
    return '';
  }
}

/* ------------------------------- 同步仓库对象 ------------------------------- */

export class DiaryRepository {
  constructor({ config, token, masterKey }) {
    this.config = config;
    this.token = token || '';
    this.masterKey = masterKey;
    this.client = new GitHubClient(this.token);
    this.owner = config.repo.owner;
    this.repo = config.repo.repo;
    this.branch = config.repo.branch;
    this.dataPath = config.repo.dataPath;
    this.configPath = config.repo.configPath;
    this.imageCache = new Map();
  }

  imagePath(id) {
    const parts = this.dataPath.split('/');
    parts.pop();
    return [...parts, 'images', `${id}.bin`].join('/');
  }

  async readImageCiphertext(ref) {
    const path = ref.path || this.imagePath(ref.id);
    let apiError = null;
    let file = null;
    try {
      file = await this.client.getBinaryFile(this.owner, this.repo, path, this.branch);
    } catch (error) {
      apiError = error;
    }
    if (!file) {
      const raw = await this.client.readPublicBinaryFile(
        this.owner,
        this.repo,
        path,
        this.branch,
      );
      if (raw) file = raw;
    }
    if (!file) {
      throw new SyncError(
        apiError instanceof GitHubError ? apiError.message : '配图文件不存在或暂时无法读取',
        { offline: Boolean(apiError), cause: apiError },
      );
    }
    return file.bytes;
  }

  /** 读取并解密一张配图，返回可供 <img> 使用的 object URL。 */
  async loadImage(ref) {
    if (!ref?.id) throw new SyncError('配图缺少 ID');
    const cached = this.imageCache.get(ref.id);
    if (cached) return cached;

    const packed = await this.readImageCiphertext(ref);
    const bytes = await decryptImageBytes(this.masterKey, packed, ref.id);
    const mime = ref.mime || 'image/webp';
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const loaded = {
      id: ref.id,
      url,
      width: ref.width || 0,
      height: ref.height || 0,
      mime,
      name: ref.name || '',
    };
    this.imageCache.set(ref.id, loaded);
    return loaded;
  }

  clearImageCache() {
    for (const item of this.imageCache.values()) {
      try {
        URL.revokeObjectURL(item.url);
      } catch {
        /* 忽略 */
      }
    }
    this.imageCache.clear();
  }

  get remoteName() {
    return `${this.owner}/${this.repo}`;
  }

  get fileUrl() {
    return `https://github.com/${this.owner}/${this.repo}/blob/${encodeURIComponent(
      this.branch,
    )}/${this.dataPath}`;
  }

  async readCache() {
    const envelope = readCachedEnvelope();
    if (!envelope) return null;
    try {
      return await decryptPayload(this.masterKey, envelope);
    } catch {
      return null;
    }
  }

  async cachePayload(payload) {
    try {
      const envelope = await encryptPayload(this.masterKey, payload);
      localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 拉取远端数据。API 失败时尝试 raw 公开回退，再失败则交给本地缓存。
   */
  async readRemote() {
    let apiError = null;
    let file = null;
    let source = 'api';

    try {
      file = await this.client.getFile(this.owner, this.repo, this.dataPath, this.branch);
    } catch (error) {
      apiError = error;
    }

    if (!file) {
      const raw = await this.client.readPublicFile(
        this.owner,
        this.repo,
        this.dataPath,
        this.branch,
      );
      if (raw) {
        file = raw;
        source = 'raw';
      }
    }

    if (!file) {
      if (apiError && apiError.status !== 404) {
        return {
          payload: null,
          sha: null,
          source: 'none',
          error: apiError,
        };
      }
      return { payload: null, sha: null, source, error: null };
    }

    let data;
    try {
      data = JSON.parse(file.text);
    } catch {
      throw new SyncError('云端数据文件不是有效的 JSON', { cause: apiError });
    }
    if (!isDataEnvelope(data)) {
      throw new SyncError('云端数据文件格式不正确，可能不是潮汐手记生成的文件');
    }
    const payload = await decryptPayload(this.masterKey, data);
    return { payload, sha: file.sha || null, source, error: apiError, envelope: data };
  }

  /**
   * 读取云端与本地缓存，合并后返回。不会自动上传。
   * 返回值里 pending 表示缓存中存在云端还没有的修改。
   */
  async load() {
    let remote = { payload: null, sha: null, source: 'none', error: null };
    let remoteFailed = false;
    try {
      remote = await this.readRemote();
      remoteFailed = Boolean(remote.error) && !remote.payload;
    } catch (error) {
      remoteFailed = true;
      remote.error = error;
    }

    const cached = await this.readCache();
    const hasRemote = Boolean(remote.payload);
    const base = hasRemote ? remote.payload : createEmptyPayload();
    const merged = mergePayloads(base, cached || createEmptyPayload());
    const pending = Boolean(cached) && hasMeaningfulDifference(base, cached);

    // 每次成功读到云端后，都把合并结果写回本机，保证离线缓存不会漏掉
    // 另一台设备写下的内容或新的删除墓碑。
    if (hasRemote) await this.cachePayload(merged);

    return {
      payload: merged,
      remote: remote.payload,
      remoteSha: remote.sha,
      source: remote.source,
      offline: remoteFailed,
      pending,
      error: remote.error || null,
    };
  }

  /**
   * 与云端合并并上传。网络失败时会先写本地缓存，再抛出 SyncError。
   */
  async sync(localPayload, { message = 'diary: 写下新的一页', forceWrite = false } = {}) {
    let lastError = null;
    let merged = normalizePayload(localPayload);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let file = null;
      try {
        file = await this.client.getFile(
          this.owner,
          this.repo,
          this.dataPath,
          this.branch,
        );
      } catch (error) {
        if (error?.status === 409) {
          lastError = error;
          continue;
        }
        if (error?.status === 404) {
          file = null;
        } else {
          await this.cachePayload(merged);
          throw new SyncError(
            error instanceof GitHubError ? error.message : '无法读取云端数据',
            { offline: true, cause: error },
          );
        }
      }

      let remotePayload = createEmptyPayload();
      if (file) {
        let envelope;
        try {
          envelope = JSON.parse(file.text);
        } catch {
          throw new SyncError('云端数据文件损坏，已停止上传以保护原数据');
        }
        if (!isDataEnvelope(envelope)) {
          throw new SyncError('云端数据文件格式异常，已停止上传以保护原数据');
        }
        remotePayload = await decryptPayload(this.masterKey, envelope);
      }

      merged = mergePayloads(remotePayload, localPayload);
      const needsWrite = forceWrite || !file || hasMeaningfulDifference(remotePayload, merged);

      if (!needsWrite) {
        await this.cachePayload(merged);
        this.markSynced();
        return { payload: merged, sha: file?.sha || null, noop: true };
      }

      const envelope = await encryptPayload(this.masterKey, merged);
      try {
        const result = await this.client.putFile(
          this.owner,
          this.repo,
          this.dataPath,
          this.branch,
          JSON.stringify(envelope),
          { message, sha: file?.sha },
        );
        await this.cachePayload(merged);
        this.markSynced();
        return {
          payload: merged,
          sha: result?.content?.sha || null,
          noop: false,
          commitUrl: result?.commit?.html_url || null,
        };
      } catch (error) {
        lastError = error;
        if (error?.status === 409 || error?.status === 422) {
          continue;
        }
        await this.cachePayload(merged);
        throw new SyncError(
          error instanceof GitHubError ? error.message : '上传失败，内容已保存在本机',
          { offline: true, cause: error },
        );
      }
    }

    await this.cachePayload(merged);
    throw new SyncError(
      lastError instanceof GitHubError ? lastError.message : '云端频繁冲突，请稍后重试',
      { offline: true, cause: lastError },
    );
  }

  markSynced() {
    try {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } catch {
      /* 忽略 */
    }
  }

  async saveConfig(nextConfig, { message = 'config: 更新潮汐手记密码' } = {}) {
    const file = await this.client.getFile(
      this.owner,
      this.repo,
      this.configPath,
      this.branch,
    );
    const text = `${JSON.stringify(nextConfig, null, 2)}\n`;
    const result = await this.client.putFile(
      this.owner,
      this.repo,
      this.configPath,
      this.branch,
      text,
      { message, sha: file?.sha },
    );
    cacheConfig(nextConfig);
    return result;
  }
}

export function lastSyncAt() {
  try {
    return localStorage.getItem(LAST_SYNC_KEY) || '';
  } catch {
    return '';
  }
}

export { GitHubError };
