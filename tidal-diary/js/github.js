/* 极简 GitHub Contents API 客户端：只做潮汐手记需要的事 */

const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 25_000;

export class GitHubError extends Error {
  constructor(message, { status = 0, code = 'GITHUB_ERROR', detail = '' } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function encodePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUtf8(value) {
  const normalized = String(value || '').replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function friendlyMessage(status, detail = '') {
  if (status === 401) return 'GitHub Token 无效或已过期，请在配置页重新生成';
  if (status === 403) {
    if (/rate limit/i.test(detail)) return 'GitHub API 请求次数已达上限，请稍后再试';
    return 'Token 权限不足，需要该仓库的 Contents 读写权限';
  }
  if (status === 404) return '没有找到仓库、分支或文件，请检查配置';
  if (status === 409) return '云端文件刚刚被修改，正在重试';
  if (status === 422) return 'GitHub 拒绝了这次提交，请检查分支与文件路径';
  return `GitHub 请求失败${status ? `（${status}）` : ''}`;
}

export class GitHubClient {
  constructor(token) {
    this.token = token || '';
  }

  async request(path, { method = 'GET', body, auth = true, raw = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers = {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new GitHubError('连接 GitHub 超时，请检查网络后重试', { code: 'TIMEOUT' });
      }
      throw new GitHubError('无法连接 GitHub，当前可能处于离线状态', { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const detail = data?.message || text.slice(0, 300);
      throw new GitHubError(friendlyMessage(response.status, detail), {
        status: response.status,
        code: data?.message || 'HTTP_ERROR',
        detail,
      });
    }
    return raw ? text : data;
  }

  async getUser() {
    return this.request('/user');
  }

  async getRepo(owner, repo) {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  /**
   * 读取文件；文件不存在时返回 null。
   * 返回 { text, sha, size, htmlUrl }
   */
  async getFile(owner, repo, path, branch) {
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(
      path,
    )}?ref=${encodeURIComponent(branch)}`;
    try {
      const data = await this.request(url);
      if (Array.isArray(data)) {
        throw new GitHubError('数据路径指向了一个文件夹，请检查配置', { code: 'IS_DIRECTORY' });
      }
      return {
        text: base64ToUtf8(data.content),
        sha: data.sha,
        size: data.size,
        htmlUrl: data.html_url,
      };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      if (error instanceof GitHubError && error.code === 'IS_DIRECTORY') throw error;
      throw error;
    }
  }

  async putFile(owner, repo, path, branch, content, { message, sha } = {}) {
    const body = {
      message: message || 'chore: update tidal diary',
      content: utf8ToBase64(content),
      branch,
    };
    if (sha) body.sha = sha;
    const data = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`,
      { method: 'PUT', body },
    );
    return data;
  }

  /** 公开仓库的 raw 回退读取：API 限流或 Token 过期时仍可只读 */
  async readPublicFile(owner, repo, path, branch) {
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(
      owner,
    )}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodePath(path)}?t=${Date.now()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!response.ok) return null;
      return { text: await response.text(), sha: null };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function repoPathFor(siteDir, file = 'config.json') {
  const dir = String(siteDir || '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
  return dir ? `${dir}/${file}` : file;
}

export function repoFromLocation(location = window.location) {
  const host = location.hostname;
  const segments = location.pathname.split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    const owner = host.slice(0, -'.github.io'.length);
    const repo = segments.length ? segments[0] : `${owner}.github.io`;
    return { owner, repo };
  }
  return { owner: '', repo: '' };
}
