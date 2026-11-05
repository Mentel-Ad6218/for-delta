/* Node 环境下的加密与同步逻辑测试 */

import assert from 'node:assert/strict';
import {
  DEFAULT_ITERATIONS,
  createVault,
  decryptImageBytes,
  decryptPayload,
  encryptImageBytes,
  encryptPayload,
  openSecrets,
  rewrapMasterKey,
  sealSecrets,
  unlockVault,
} from '../js/crypto.js';
import { DiaryRepository } from '../js/repository.js';
import {
  deleteEntry,
  emptyStats,
  entryViews,
  hasMeaningfulDifference,
  mergePayloads,
  mergeStats,
  recordStatsView,
  upsertEntry,
} from '../js/model.js';
import { demoEntries } from '../js/demo.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

function makeConfig(vault) {
  return {
    format: 'tidal-diary-config',
    version: 1,
    site: { title: '测试日记', siteDir: '' },
    repo: {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      dataPath: 'data/diary.enc.json',
      configPath: 'config.json',
    },
    kdf: vault.kdf,
    wrappedKey: vault.wrappedKey,
  };
}

class FakeClient {
  constructor(initial = null) {
    this.file = initial;
    this.imageFiles = new Map();
    this.shaCounter = 0;
    this.putCalls = 0;
    this.failNextPut = false;
  }
  async getFile() {
    return this.file ? { ...this.file } : null;
  }
  async readPublicFile() {
    return null;
  }
  async putBinaryFile(owner, repo, path, branch, bytes) {
    this.imageFiles.set(path, new Uint8Array(bytes));
    return { content: { sha: `image-${this.imageFiles.size}` } };
  }
  async getBinaryFile(owner, repo, path) {
    const bytes = this.imageFiles.get(path);
    return bytes ? { bytes: new Uint8Array(bytes), sha: `image-${path}` } : null;
  }
  async readPublicBinaryFile() {
    return null;
  }
  async putFile(owner, repo, path, branch, content, options) {
    this.putCalls += 1;
    if (this.failNextPut) {
      this.failNextPut = false;
      const error = new Error('conflict');
      error.status = 409;
      throw error;
    }
    if (this.file && options.sha !== this.file.sha) {
      const error = new Error('conflict');
      error.status = 409;
      throw error;
    }
    this.shaCounter += 1;
    this.file = { text: content, sha: `sha-${this.shaCounter}` };
    return { content: { sha: this.file.sha } };
  }
}

const password = 'A-strong-test-password-2026';
const vault = await createVault(password, 1000 < DEFAULT_ITERATIONS ? 120000 : DEFAULT_ITERATIONS);
const config = makeConfig(vault);
const secrets = await sealSecrets(vault.masterKey, { token: 'ghp_test', login: 'tester' });
config.secrets = secrets;

const opened = await unlockVault(password, config.kdf, config.wrappedKey);
assert.equal(Buffer.from(opened.masterRaw).toString('hex'), Buffer.from(vault.masterRaw).toString('hex'));
const openedSecrets = await openSecrets(opened.masterKey, config.secrets);
assert.equal(openedSecrets.token, 'ghp_test');

await assert.rejects(
  () => unlockVault('wrong-password-2026', config.kdf, config.wrappedKey),
  (error) => error.code === 'WRONG_PASSWORD',
);

// 配图二进制加密 / 解密
const imageBytes = new Uint8Array(2048);
for (let i = 0; i < imageBytes.length; i += 1) imageBytes[i] = i % 256;
const packedImage = await encryptImageBytes(vault.masterKey, imageBytes, 'image-test');
const unpackedImage = await decryptImageBytes(vault.masterKey, packedImage, 'image-test');
assert.deepEqual(Array.from(unpackedImage), Array.from(imageBytes));
await assert.rejects(
  () => decryptImageBytes(vault.masterKey, packedImage, 'other-image'),
  (error) => error.code === 'DECRYPT_FAILED',
);
await assert.rejects(
  () => decryptImageBytes(vault.masterKey, packedImage.slice(0, 20), 'image-test'),
  (error) => error.code === 'BAD_IMAGE',
);

const payload = {
  version: 1,
  entries: demoEntries(),
  tombstones: {},
  updatedAt: new Date().toISOString(),
};
const envelope = await encryptPayload(vault.masterKey, payload);
const decrypted = await decryptPayload(vault.masterKey, envelope);
assert.equal(decrypted.entries.length, payload.entries.length);
assert.equal(decrypted.entries[0].title, payload.entries[0].title);

// 错误密码无法解密数据
const wrongVault = await createVault('another-password-2026', 120000);
await assert.rejects(() => decryptPayload(wrongVault.masterKey, envelope));

// 密码更换后主密钥保持不变
const rewrapped = await rewrapMasterKey(opened.masterRaw, 'new-password-2026', 120000);
const reopened = await unlockVault('new-password-2026', rewrapped.kdf, rewrapped.wrappedKey);
assert.equal(
  Buffer.from(reopened.masterRaw).toString('hex'),
  Buffer.from(opened.masterRaw).toString('hex'),
);

// 合并与墓碑
const e1 = {
  id: 'local-edit-test',
  date: '2026-10-01',
  title: '本地修改',
  body: '用来测试合并的一页。',
  mood: 'calm',
  weather: '',
  createdAt: new Date(Date.now() - 7200000).toISOString(),
  updatedAt: new Date(Date.now() - 3600000).toISOString(),
};
const merged = mergePayloads(payload, { entries: [e1], tombstones: {}, updatedAt: new Date().toISOString() });
assert.equal(merged.entries.find((entry) => entry.id === e1.id).title, '本地修改');
const deleted = deleteEntry(merged, e1.id);
const mergedAfterDelete = mergePayloads(merged, deleted);
assert.equal(mergedAfterDelete.entries.some((entry) => entry.id === e1.id), false);
assert.equal(Boolean(mergedAfterDelete.tombstones[e1.id]), true);
assert.equal(hasMeaningfulDifference(merged, mergedAfterDelete), true);

// 仓库读取与同步
localStorage.clear();
const initialEnvelope = await encryptPayload(vault.masterKey, payload);
const fake = new FakeClient({ text: JSON.stringify(initialEnvelope), sha: 'remote-1' });
const repo = new DiaryRepository({
  config,
  token: 'ghp_test',
  masterKey: vault.masterKey,
});
repo.client = fake;

const loaded = await repo.load();
assert.equal(loaded.payload.entries.length, payload.entries.length);
assert.equal(loaded.offline, false);
assert.equal(loaded.pending, false);

// 阅读统计按设备合并，不会因为统计变化触发云端写入
const statsA = recordStatsView(emptyStats(), 'dev-a', 'entry-1');
const statsA2 = recordStatsView(statsA, 'dev-a', 'entry-1');
const statsB = recordStatsView(emptyStats(), 'dev-b', 'entry-1');
const statsMerged = mergeStats(statsA2, statsB);
assert.equal(entryViews(statsMerged, 'entry-1'), 3);
assert.equal(hasMeaningfulDifference(payload, { ...payload, stats: statsA2 }), false);
const settingsPayload = mergePayloads(
  {
    ...payload,
    settings: {
      imageStorage: { provider: 'local', cloudName: '', uploadPreset: '', folder: 'a' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    stats: statsA2,
  },
  {
    ...payload,
    settings: {
      imageStorage: { provider: 'cloudinary', cloudName: 'demo', uploadPreset: 'preset', folder: 'b' },
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    stats: statsB,
  },
);
assert.equal(settingsPayload.settings.imageStorage.provider, 'cloudinary');
assert.equal(entryViews(settingsPayload.stats, 'entry-1'), 3);
assert.equal(entryViews(deleteEntry(settingsPayload, 'entry-1').stats, 'entry-1'), 0);

// 兼容旧版仓库内配图（新增配图功能已停用，只保留只读显示）
fake.imageFiles.set('data/images/image-legacy.bin', packedImage);
const legacyImage = await repo.loadImage({
  id: 'image-test',
  path: 'data/images/image-legacy.bin',
  width: 10,
  height: 10,
});
assert.ok(legacyImage.url.startsWith('blob:'));
repo.clearImageCache();

const added = {
  id: 'test-new-entry',
  date: '2026-11-04',
  title: '同步测试',
  body: '一段用来测试同步的正文。',
  mood: 'calm',
  weather: 'sunny',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const localPayload = upsertEntry(loaded.payload, added);
const result = await repo.sync(localPayload, { message: 'test' });
assert.equal(result.noop, false);
assert.equal(fake.putCalls, 1);
const remoteEnvelope = JSON.parse(fake.file.text);
const remotePayload = await decryptPayload(vault.masterKey, remoteEnvelope);
assert.equal(remotePayload.entries.some((entry) => entry.id === added.id), true);

// 冲突重试：模拟远端 SHA 变化
const remoteEdited = {
  ...remotePayload.entries[0],
  title: '另一台设备写下的标题',
  updatedAt: new Date(Date.now() + 172800000).toISOString(),
};
const remotePayload2 = upsertEntry(remotePayload, remoteEdited);
const envelope2 = await encryptPayload(vault.masterKey, remotePayload2);
fake.file = { text: JSON.stringify(envelope2), sha: 'remote-2' };
fake.failNextPut = true;
const local2 = upsertEntry(result.payload, {
  ...added,
  title: '本机标题',
  updatedAt: new Date(Date.now() + 259200000).toISOString(),
});
const result2 = await repo.sync(local2, { message: 'merge test' });
assert.equal(result2.noop, false);
assert.equal(result2.payload.entries.find((entry) => entry.id === remoteEdited.id).title, '另一台设备写下的标题');
assert.equal(result2.payload.entries.find((entry) => entry.id === added.id).title, '本机标题');

console.log('All tests passed.');
