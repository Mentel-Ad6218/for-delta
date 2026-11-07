/*
 * 配置向导
 * 在浏览器里生成主密钥、包裹密码、加密 Token 与空日记，
 * 然后通过 GitHub Contents API 写入用户自己的仓库。
 */

import {
  DEFAULT_ITERATIONS,
  createEmptyPayload,
  createVault,
  encryptPayload,
  normalizePassword,
  passwordScore,
  sealSecrets,
  zeroBytes,
} from './crypto.js?v=1.5.0';
import { GitHubClient, GitHubError, repoFromLocation } from './github.js?v=1.5.0';

const $ = (id) => document.getElementById(id);

const state = {
  existingConfig: null,
  login: '',
  verified: false,
  generated: null,
  busy: false,
};

const dom = {
  form: $('setupForm'),
  panel: $('setupPanel'),
  successPanel: $('successPanel'),
  siteTitle: $('siteTitle'),
  password: $('password'),
  passwordConfirm: $('passwordConfirm'),
  togglePassword: $('togglePassword'),
  strengthBar: $('strengthBar'),
  strengthLabel: $('strengthLabel'),
  owner: $('owner'),
  repo: $('repo'),
  branch: $('branch'),
  siteDir: $('siteDir'),
  token: $('token'),
  toggleToken: $('toggleToken'),
  verifyButton: $('verifyButton'),
  verifyStatus: $('verifyStatus'),
  configPathPreview: $('configPathPreview'),
  dataPathPreview: $('dataPathPreview'),
  existingBanner: $('existingBanner'),
  existingText: $('existingText'),
  overwriteWrap: $('overwriteWrap'),
  overwriteCheck: $('overwriteCheck'),
  ack: $('ack'),
  formError: $('formError'),
  submitButton: $('submitButton'),
  manualFallback: $('manualFallback'),
  manualDataDownload: $('manualDataDownload'),
  manualConfigDownload: $('manualConfigDownload'),
  successRepo: $('successRepo'),
  successSiteLink: $('successSiteLink'),
  successConfigLink: $('successConfigLink'),
  downloadConfigButton: $('downloadConfigButton'),
  downloadDataButton: $('downloadDataButton'),
  againButton: $('againButton'),
};

boot();

async function boot() {
  applyLocalTheme();
  inferRepository();
  bindEvents();
  updatePathPreview();
  await loadExistingConfig();
}

function applyLocalTheme() {
  let theme = 'day';
  try {
    const saved = localStorage.getItem('tidal.theme.v1');
    if (['day', 'sepia', 'night'].includes(saved)) theme = saved;
  } catch {
    /* 忽略 */
  }
  document.documentElement.dataset.theme = theme;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const colors = { day: '#eaf5ff', sepia: '#f7efe0', night: '#0d1a26' };
  if (metaTheme) metaTheme.setAttribute('content', colors[theme]);
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', theme === 'night' ? 'dark' : 'light');
}

function inferRepository() {
  const { owner, repo } = repoFromLocation();
  if (owner) dom.owner.value = owner;
  if (repo) dom.repo.value = repo;
}

async function loadExistingConfig() {
  try {
    const response = await fetch(new URL(`./config.json?t=${Date.now()}`, document.baseURI), {
      cache: 'no-store',
    });
    if (!response.ok) return;
    const config = await response.json();
    if (config?.format !== 'tidal-diary-config' || !config.repo) return;
    state.existingConfig = config;

    dom.siteTitle.value = config.site?.title || '潮汐手记';
    dom.owner.value = config.repo.owner || dom.owner.value;
    dom.repo.value = config.repo.repo || dom.repo.value;
    dom.branch.value = config.repo.branch || 'main';
    const siteDir = String(config.repo.configPath || 'config.json')
      .replace(/\/?config\.json$/i, '')
      .replace(/^\/+|\/+$/g, '');
    dom.siteDir.value = siteDir;
    updatePathPreview();

    dom.existingBanner.hidden = false;
    dom.existingText.textContent = `检测到 ${config.repo.owner}/${config.repo.repo} · ${config.repo.branch} 已经配置过。如果只是 Token 过期，请回到日记首页，解锁后在“设置 → 更新 Token”中更换；在这里重新生成会创建一把新的主密钥，旧日记将无法用新密码打开。`;
    dom.overwriteWrap.hidden = false;
  } catch {
    /* 没有配置或网络不可用，按首次配置处理 */
  }
}

function bindEvents() {
  dom.togglePassword.addEventListener('click', () => toggleSecret(dom.password, dom.togglePassword));
  dom.toggleToken.addEventListener('click', () => toggleSecret(dom.token, dom.toggleToken));
  dom.password.addEventListener('input', () => updateStrength(dom.password.value));
  dom.verifyButton.addEventListener('click', verifyConnection);
  dom.form.addEventListener('submit', handleSubmit);
  dom.form.addEventListener('input', () => hideError());
  dom.siteDir.addEventListener('input', updatePathPreview);
  dom.downloadConfigButton.addEventListener('click', () => {
    if (state.generated) downloadText('config.json', state.generated.configText, 'application/json');
  });
  dom.downloadDataButton.addEventListener('click', () => {
    if (state.generated) downloadText('diary.enc.json', state.generated.dataText, 'application/json');
  });
  dom.manualConfigDownload.addEventListener('click', () => {
    if (state.generated) downloadText('config.json', state.generated.configText, 'application/json');
  });
  dom.manualDataDownload.addEventListener('click', () => {
    if (state.generated) downloadText('diary.enc.json', state.generated.dataText, 'application/json');
  });
  dom.againButton.addEventListener('click', () => window.location.reload());
}

function toggleSecret(input, button) {
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? '隐藏内容' : '显示内容');
  const use = button.querySelector('use');
  if (use) use.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
}

function updateStrength(value) {
  const result = passwordScore(value);
  const widths = ['8%', '28%', '54%', '78%', '100%'];
  dom.strengthBar.style.width = widths[result.score];
  dom.strengthBar.dataset.score = String(result.score);
  dom.strengthLabel.textContent = value ? result.label : '建议至少 12 位';
  dom.strengthLabel.dataset.score = String(result.score);
}

function normalizeDir(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function pathsFor(siteDir) {
  const dir = normalizeDir(siteDir);
  return {
    dir,
    configPath: dir ? `${dir}/config.json` : 'config.json',
    dataPath: dir ? `${dir}/data/diary.enc.json` : 'data/diary.enc.json',
  };
}

function updatePathPreview() {
  const { configPath, dataPath } = pathsFor(dom.siteDir.value);
  dom.configPathPreview.textContent = configPath;
  dom.dataPathPreview.textContent = dataPath;
}

function readForm() {
  const paths = pathsFor(dom.siteDir.value);
  return {
    title: dom.siteTitle.value.trim() || '潮汐手记',
    password: dom.password.value,
    passwordConfirm: dom.passwordConfirm.value,
    owner: dom.owner.value.trim(),
    repo: dom.repo.value.trim(),
    branch: dom.branch.value.trim() || 'main',
    siteDir: paths.dir,
    configPath: paths.configPath,
    dataPath: paths.dataPath,
    token: dom.token.value.trim(),
  };
}

function validateForm(values, { requireAck = true } = {}) {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(values.owner)) {
    return 'GitHub 用户名格式看起来不太对。';
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(values.repo)) {
    return '仓库名格式看起来不太对。';
  }
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(values.branch) || values.branch.includes('..')) {
    return '分支名只能包含字母、数字、点、横线、下划线和斜线。';
  }
  if (values.siteDir && (!/^[A-Za-z0-9._/-]+$/.test(values.siteDir) || values.siteDir.includes('..'))) {
    return '发布目录只能包含字母、数字、点、横线、下划线和斜线，且不能包含 ..。';
  }
  if (normalizePassword(values.password).length < 10) {
    return '密码至少需要 10 位。建议使用 12 位以上，并混合不同字符。';
  }
  if (values.password !== values.passwordConfirm) {
    return '两次输入的密码不一样。';
  }
  if (!values.token) {
    return '请填写 GitHub Token。';
  }
  if (!/^(gh[pousr]_|github_pat_)/.test(values.token)) {
    return '这看起来不像一个 GitHub Token（通常以 ghp_ 或 github_pat_ 开头）。';
  }
  if (requireAck && !dom.ack.checked) {
    return '请先勾选“我明白如果忘记密码，日记无法恢复”。';
  }
  return '';
}

function showError(message) {
  dom.formError.textContent = message;
  dom.formError.hidden = false;
  dom.formError.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function hideError() {
  if (!dom.formError.hidden) dom.formError.hidden = true;
}

function setBusy(busy, label) {
  state.busy = busy;
  dom.submitButton.disabled = busy;
  dom.verifyButton.disabled = busy;
  if (busy) {
    const icon = dom.submitButton.querySelector('svg');
    dom.submitButton.replaceChildren(icon, document.createTextNode(label || '正在处理…'));
  } else {
    const icon = dom.submitButton.querySelector('svg');
    dom.submitButton.replaceChildren(icon, document.createTextNode('生成保险箱并写入仓库'));
  }
}

async function verifyConnection() {
  if (state.busy) return;
  const values = readForm();
  if (!values.token) {
    showError('先填写 GitHub Token，再验证连接。');
    dom.token.focus();
    return;
  }
  dom.verifyButton.disabled = true;
  dom.verifyStatus.hidden = true;
  try {
    const client = new GitHubClient(values.token);
    const user = await client.getUser();
    state.login = user.login || '';
    let message = `Token 有效 · 已连接 @${state.login}`;
    if (values.owner && values.repo) {
      const repoInfo = await client.getRepo(values.owner, values.repo);
      if (!dom.branch.value.trim()) dom.branch.value = repoInfo.default_branch || 'main';
      message += ` · ${repoInfo.full_name}${repoInfo.private ? '（私有仓库）' : ''}`;
    }
    dom.verifyStatus.querySelector('span').textContent = message;
    dom.verifyStatus.hidden = false;
    state.verified = true;
  } catch (error) {
    state.verified = false;
    showError(mapGitHubError(error));
  } finally {
    dom.verifyButton.disabled = false;
  }
}

function mapGitHubError(error) {
  if (error instanceof GitHubError) {
    if (error.status === 401) return 'Token 无效或已经过期。';
    if (error.status === 404) return '没有找到这个仓库。请检查用户名、仓库名，以及 Token 是否有权访问它。';
    if (error.status === 403) return 'Token 权限不足。需要该仓库的 Contents 读写权限。';
    return error.message;
  }
  return error.message || '连接 GitHub 时出现未知错误。';
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.busy) return;
  hideError();
  const values = readForm();
  const validationError = validateForm(values);
  if (validationError) {
    showError(validationError);
    return;
  }

  setBusy(true, '正在生成密钥…');
  let client;
  let masterRaw;
  try {
    client = new GitHubClient(values.token);
    if (!state.login) {
      const user = await client.getUser();
      state.login = user.login || '';
    }
    const repoInfo = await client.getRepo(values.owner, values.repo);
    if (!dom.branch.value.trim()) {
      values.branch = repoInfo.default_branch || 'main';
      dom.branch.value = values.branch;
    } else {
      values.branch = dom.branch.value.trim();
    }

    const configFile = await client.getFile(
      values.owner,
      values.repo,
      values.configPath,
      values.branch,
    );
    const dataFile = await client.getFile(
      values.owner,
      values.repo,
      values.dataPath,
      values.branch,
    );

    if ((configFile || dataFile || state.existingConfig) && !dom.overwriteCheck.checked) {
      dom.overwriteWrap.hidden = false;
      throw new Error(
        '仓库里已经有一份潮汐手记。为保护旧日记，不会自动覆盖。请先备份，然后勾选页面下方的覆盖确认，再试一次。',
      );
    }

    setBusy(true, '正在加密并写入…');
    const vault = await createVault(values.password, DEFAULT_ITERATIONS);
    masterRaw = vault.masterRaw;
    const secrets = await sealSecrets(vault.masterKey, {
      token: values.token,
      login: state.login,
      createdAt: new Date().toISOString(),
    });

    const config = {
      format: 'tidal-diary-config',
      version: 1,
      site: {
        title: values.title,
        siteDir: values.siteDir,
      },
      repo: {
        owner: values.owner,
        repo: values.repo,
        branch: values.branch,
        dataPath: values.dataPath,
        configPath: values.configPath,
      },
      kdf: vault.kdf,
      wrappedKey: vault.wrappedKey,
      secrets,
      createdAt: new Date().toISOString(),
    };

    const emptyPayload = createEmptyPayload();
    const envelope = await encryptPayload(vault.masterKey, emptyPayload);
    const configText = `${JSON.stringify(config, null, 2)}\n`;
    const dataText = `${JSON.stringify(envelope, null, 2)}\n`;

    state.generated = {
      config,
      configText,
      dataText,
      configPath: values.configPath,
      dataPath: values.dataPath,
      owner: values.owner,
      repo: values.repo,
      branch: values.branch,
    };
    const fallbackText = dom.manualFallback.querySelector('p');
    if (fallbackText) {
      fallbackText.textContent = `下载这两个文件，分别放到仓库的 ${values.configPath} 与 ${values.dataPath}。配置文件必须最后上传。`;
    }

    // 先写数据文件，最后写配置，避免页面在数据尚未就绪时被打开。
    await client.putFile(
      values.owner,
      values.repo,
      values.dataPath,
      values.branch,
      dataText,
      { message: 'tidal: 初始化加密日记', sha: dataFile?.sha },
    );

    await client.putFile(
      values.owner,
      values.repo,
      values.configPath,
      values.branch,
      configText,
      { message: 'tidal: 写入潮汐手记配置', sha: configFile?.sha },
    );

    zeroBytes(masterRaw);
    masterRaw = null;
    showSuccess(values);
  } catch (error) {
    console.error(error);
    if (state.generated) {
      dom.manualFallback.hidden = false;
      showError(
        `${mapGitHubError(error)} 加密文件已在本地生成，可以展开下方的“手动放入仓库”下载后上传。`,
      );
    } else {
      showError(mapGitHubError(error));
    }
    if (error instanceof GitHubError && [401, 403].includes(error.status)) {
      dom.verifyStatus.hidden = true;
    }
  } finally {
    if (masterRaw) zeroBytes(masterRaw);
    setBusy(false);
  }
}

function showSuccess(values) {
  dom.successRepo.textContent = `${values.owner}/${values.repo} · ${values.branch}`;
  const encodedBranch = values.branch
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const encodedPath = state.generated.configPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  dom.successConfigLink.href = `https://github.com/${encodeURIComponent(
    values.owner,
  )}/${encodeURIComponent(values.repo)}/blob/${encodedBranch}/${encodedPath}`;
  dom.successSiteLink.href = './';

  dom.panel.hidden = true;
  dom.successPanel.hidden = false;
  dom.existingBanner.hidden = true;
  document.title = '配置完成 · 潮汐手记';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  dom.password.value = '';
  dom.passwordConfirm.value = '';
  dom.token.value = '';
  dom.verifyStatus.hidden = true;
  state.verified = false;
  state.login = '';
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

window.addEventListener('error', (event) => {
  console.error('配置向导运行时错误：', event.error || event.message);
});
