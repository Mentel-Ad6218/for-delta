/*
 * 旧版配图标记兼容
 * ------------------------------------------------------------
 * 新版已停用添加配图。这里只保留旧日记里的【图N】标记解析，
 * 以便旧数据仍能在阅读页只读显示。
 */

export const IMAGE_TOKEN_PATTERN = /^【图(\d+)】$/;
const IMAGE_TOKEN_GLOBAL = /【图(\d+)】/g;

export function makeImageToken(key) {
  return `【图${key}】`;
}

export function extractImageKeys(text) {
  const keys = new Set();
  String(text || '').replace(IMAGE_TOKEN_GLOBAL, (_, key) => {
    keys.add(Number(key));
    return '';
  });
  return keys;
}

export function removeImageToken(text, key) {
  const token = makeImageToken(key);
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '')
    .replace(new RegExp(`\\n?${escaped}\\n?`, 'g'), '\n')
    .replace(/\n{3,}/g, '\n\n');
}
