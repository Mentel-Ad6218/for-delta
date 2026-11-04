/*
 * 阅读器：把一篇日记切成真正的“纸页”
 * ------------------------------------------------------------
 * 不使用 CSS 多栏，而是逐块测量、逐字切分。
 * 这样每一页都有自己的页眉、页码和右下角的 Δ。
 */

import {
  chineseYear,
  cnNumber,
  formatDateCN,
  moodOf,
  parseDateKey,
  readingMinutes,
  weekdayOf,
  weatherOf,
} from './model.js';

const PROGRESS_KEY = 'tidal.progress.v1';
const SPLIT_TAGS = new Set(['P']);
const CLOSING_PUNCT = /[，。！？；：、”’）】》」』…—～·〉]/u;
const OPENING_PUNCT = /[“‘（【《「『〈]/u;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, '');
}

function readProgressMap() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeProgressMap(map) {
  try {
    const entries = Object.entries(map)
      .sort(([, a], [, b]) => (b?.at || 0) - (a?.at || 0))
      .slice(0, 240);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* 忽略存储失败 */
  }
}

export class Reader {
  constructor({ view, stage, frame, track, elements, callbacks = {} }) {
    this.view = view;
    this.stage = stage;
    this.frame = frame;
    this.track = track;
    this.elements = elements;
    this.callbacks = callbacks;

    this.entries = [];
    this.entry = null;
    this.entryIndex = 0;
    this.pages = [];
    this.current = 0;
    this.step = 0;
    this.chromeHidden = false;
    this.drag = null;
    this.suppressClickUntil = 0;
    this.turnTimer = 0;
    this.reflowTimer = 0;
    this.lastWheel = 0;
    this.paginateSeq = 0;
    this.progress = readProgressMap();

    this.bound = false;
    this.bindEvents();
    this.observeResize();
  }

  setEntries(entries) {
    this.entries = Array.isArray(entries) ? entries : [];
  }

  get isOpen() {
    return Boolean(this.entry) && !this.view.hidden;
  }

  /* --------------------------------- 生命周期 -------------------------------- */

  async open(entryId, { page = null, ratio = null, direction = '' } = {}) {
    const index = this.entries.findIndex((item) => item.id === entryId);
    if (index < 0) return false;

    this.entryIndex = index;
    this.entry = this.entries[index];
    this.current = 0;
    this.pages = [];
    this.showChrome();

    this.renderHeader();
    this.view.dataset.entryId = this.entry.id;
    if (direction) {
      this.view.classList.remove('enter-from-next', 'enter-from-prev');
      this.view.classList.add(direction === 'next' ? 'enter-from-next' : 'enter-from-prev');
      window.setTimeout(() => {
        this.view.classList.remove('enter-from-next', 'enter-from-prev');
      }, 620);
    }

    await this.waitForLayout();
    const saved = this.progress[this.entry.id];
    let targetPage = page;
    let targetRatio = ratio;
    let savedTotal = null;
    if (targetPage === null && saved) {
      if (saved.updatedAt === this.entry.updatedAt && Number.isInteger(saved.page)) {
        targetPage = saved.page;
        savedTotal = saved.total ?? null;
      }
      if (targetRatio === null && Number.isFinite(saved.ratio)) targetRatio = saved.ratio;
    }

    await this.paginate({ page: targetPage, ratio: targetRatio, savedTotal });
    this.saveProgress();
    return true;
  }

  close() {
    this.saveProgress();
    this.entry = null;
    this.pages = [];
    this.track.replaceChildren();
    this.closeChrome();
  }

  dispose() {
    this.close();
    this.entries = [];
  }

  async waitForLayout() {
    if (this.frame.clientWidth > 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return;
    }
    await new Promise((resolve) => {
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (this.frame.clientWidth > 0 || frames > 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  observeResize() {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.isOpen || this.drag?.active) return;
      window.clearTimeout(this.reflowTimer);
      this.reflowTimer = window.setTimeout(() => this.reflow(), 180);
    });
    this.resizeObserver.observe(this.stage);
  }

  async reflow({ page = null, ratio = null } = {}) {
    if (!this.isOpen) return;
    const captured = page === null ? this.capturePosition() : null;
    await this.paginate({
      page: page ?? null,
      ratio: ratio ?? captured?.ratio ?? null,
      preserveText: captured?.text || '',
    });
    this.saveProgress();
  }

  /* ---------------------------------- 页眉 ---------------------------------- */

  renderHeader() {
    const entry = this.entry;
    const chapterNo = this.entries.length - this.entryIndex;
    this.elements.kicker.textContent = `第 ${cnNumber(chapterNo)} 篇 · ${entry.date.replace(
      /-/g,
      '.',
    )}`;
    this.elements.title.textContent = entry.title?.trim() || '无题';
    this.view.setAttribute('aria-label', `${entry.title || '无题'} · 阅读`);
  }

  /* -------------------------------- 切页与排版 ------------------------------- */

  async paginate({ page = null, ratio = null, preserveText = '', savedTotal = null } = {}) {
    if (!this.entry) return;
    const seq = ++this.paginateSeq;
    await this.waitForLayout();
    try {
      await document.fonts?.ready;
    } catch {
      /* 系统字体可能没有 fonts API */
    }
    // 如果在等待字体 / 布局时又发生了一次重排，让最新的那次接管。
    if (seq !== this.paginateSeq) return;

    this.frame.classList.add('is-paginating');
    this.track.replaceChildren();
    this.pages = [];

    const blocks = this.buildBlocks(this.entry);
    let current = this.createPage();
    let pageIndex = 0;
    let guard = 0;

    const overflows = () => current.body.scrollHeight > current.body.clientHeight + 2;

    for (let index = 0; index < blocks.length; index += 1) {
      guard += 1;
      if (guard > 12000) break;
      const block = blocks[index];
      const splittable =
        (block.tagName === 'P' && SPLIT_TAGS.has(block.tagName)) ||
        (block.tagName === 'BLOCKQUOTE' && Boolean(block.querySelector('p')));
      let text = splittable ? block.textContent : '';
      let continuation = false;

      while (true) {
        guard += 1;
        if (guard > 16000) break;

        // 小标题如果落在页面最底部，就和下面的正文一起挪到下一页，
        // 避免出现只有一行标题的孤页。
        if (
          block.classList.contains('body-heading') &&
          current.body.childElementCount > 0
        ) {
          current.body.appendChild(block);
          const headingFits = !overflows();
          const lineHeight =
            parseFloat(getComputedStyle(current.body).lineHeight) ||
            this.frame.clientWidth * 0.05;
          const room = this.remainingRoom(current.body);
          current.body.removeChild(block);
          if (!headingFits || room < lineHeight * 1.45) {
            this.finishPage(current, pageIndex);
            pageIndex += 1;
            current = this.createPage();
            continue;
          }
        }

        let node;
        if (splittable) {
          node = this.makeParagraph(block, text, continuation);
        } else {
          node = index === 0 ? block : block; // 保持原节点的样式
        }

        current.body.appendChild(node);
        if (!overflows()) break;

        current.body.removeChild(node);

        if (splittable && text) {
          const fit = this.findFit(current.body, block, text, continuation);
          if (fit > 0) {
            const chars = Array.from(text);
            const chunkText = chars.slice(0, fit).join('');
            const remainder = chars.slice(fit).join('').replace(/^\s+/, '');
            current.body.appendChild(this.makeParagraph(block, chunkText, continuation));
            text = remainder;
            continuation = true;
            this.finishPage(current, pageIndex);
            pageIndex += 1;
            current = this.createPage();
            if (!text) break;
            continue;
          }
        }

        if (current.body.childElementCount === 0) {
          // 整块比一页还高（极端情况）：允许它被裁切，避免死循环
          current.body.appendChild(node);
          this.finishPage(current, pageIndex);
          pageIndex += 1;
          current = this.createPage();
          break;
        }

        // 这一页放不下，换一页再试
        if (block.classList.contains('para-gap')) {
          // 空白间距不单独占据新页的顶部
          this.finishPage(current, pageIndex);
          pageIndex += 1;
          current = this.createPage();
          break;
        }
        this.finishPage(current, pageIndex);
        pageIndex += 1;
        current = this.createPage();
        continue;
      }
    }

    if (current.body.childElementCount > 0) {
      this.finishPage(current, pageIndex);
    } else {
      current.page.remove();
    }

    this.pages = Array.from(this.track.querySelectorAll('.page'));
    if (!this.pages.length) {
      const fallback = this.createPage();
      fallback.body.appendChild(el('p', 'body-empty', '这一页，还没有写下什么。'));
      this.finishPage(fallback, 0);
      this.pages = [fallback.page];
    }

    this.updatePageNumbers();
    this.layoutPages();

    let target = 0;
    const pageStillValid =
      Number.isInteger(page) &&
      page >= 0 &&
      page < this.pages.length &&
      (savedTotal === null || savedTotal === this.pages.length);
    if (pageStillValid) {
      target = page;
    } else if (preserveText) {
      const found = this.findPageByText(preserveText);
      if (found >= 0) target = found;
      else if (Number.isFinite(ratio)) target = Math.round(ratio * (this.pages.length - 1));
    } else if (Number.isFinite(ratio)) {
      target = Math.round(ratio * (this.pages.length - 1));
    } else if (Number.isInteger(page) && page >= 0 && page < this.pages.length) {
      target = page;
    }

    this.current = Math.max(0, Math.min(this.pages.length - 1, target));
    this.applyTransform(false);
    this.updateUI();
    this.frame.classList.remove('is-paginating');
    this.updateArrows();
  }

  createPage() {
    const page = el('article', 'page');
    const running = el('div', 'running-head');
    const runningLeft = el('span', 'running-left', '潮汐手记');
    const runningRight = el('span', 'running-right', this.entry ? formatDateCN(this.entry.date) : '');
    running.append(runningLeft, runningRight);

    const body = el('div', 'page-body');
    const foot = el('footer', 'page-foot');
    const footLeft = el('span', 'page-foot-left', 'TIDAL DIARY');
    const footCenter = el('span', 'page-foot-center');
    const footRight = el('span', 'page-foot-right');
    const delta = el('span', 'page-delta', 'Δ');
    delta.title = 'Δ · 一点微小的不同';
    footRight.append(delta);
    foot.append(footLeft, footCenter, footRight);

    page.append(running, body, foot);
    this.track.appendChild(page);
    return { page, body, footCenter, running, runningLeft, runningRight };
  }

  finishPage(current, index) {
    current.page.dataset.index = String(index);
    current.page.classList.toggle('is-first', index === 0);
    current.page.classList.toggle('is-even', index % 2 === 1);
    if (index === 0) {
      current.running.setAttribute('aria-hidden', 'true');
    }
    current.footCenter.textContent = String(index + 1).padStart(2, '0');
  }

  updatePageNumbers() {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      page.dataset.total = String(total);
      page.setAttribute('aria-label', `第 ${index + 1} 页，共 ${total} 页`);
      const center = page.querySelector('.page-foot-center');
      if (center) center.textContent = `${String(index + 1).padStart(2, '0')} / ${total}`;
    });
  }

  measure() {
    const width = this.frame.clientWidth;
    const gap = parseFloat(getComputedStyle(this.frame).getPropertyValue('--page-gap')) || 0;
    this.step = width + gap;
  }

  layoutPages() {
    this.measure();
    this.pages.forEach((page, index) => {
      page.style.transform = `translate3d(${index * this.step}px, 0, 0)`;
    });
  }

  applyTransform(animate = true) {
    if (!this.step) this.measure();
    this.frame.classList.toggle('no-transition', !animate);
    this.track.style.transform = `translate3d(${-this.current * this.step}px, 0, 0)`;
    if (!animate) {
      // 强制下一帧再恢复过渡，避免重排时闪动
      requestAnimationFrame(() => this.frame.classList.remove('no-transition'));
    }
    this.animateSheen();
  }

  animateSheen() {
    window.clearTimeout(this.turnTimer);
    this.frame.classList.add('is-turning');
    this.turnTimer = window.setTimeout(() => this.frame.classList.remove('is-turning'), 620);
  }

  goTo(index, { animate = true } = {}) {
    const target = Math.max(0, Math.min(this.pages.length - 1, index));
    if (target === this.current) {
      this.applyTransform(animate);
      return;
    }
    this.current = target;
    this.applyTransform(animate);
    this.updateUI();
    this.saveProgress();
    this.updateArrows();
  }

  goFirst() {
    this.goTo(0);
  }

  goLast() {
    this.goTo(this.pages.length - 1);
  }

  async nextPage() {
    if (this.current < this.pages.length - 1) {
      this.goTo(this.current + 1);
      return true;
    }
    const handled = await this.callbacks.onNextEntry?.(this.entryIndex);
    if (!handled) {
      this.applyTransform(true);
      this.callbacks.onBoundary?.('已经是最后一页了');
    }
    return handled;
  }

  async prevPage() {
    if (this.current > 0) {
      this.goTo(this.current - 1);
      return true;
    }
    const handled = await this.callbacks.onPrevEntry?.(this.entryIndex);
    if (!handled) {
      this.applyTransform(true);
      this.callbacks.onBoundary?.('已经是第一页了');
    }
    return handled;
  }

  capturePosition() {
    const page = this.pages[this.current];
    const raw = page?.querySelector('.page-body')?.textContent || '';
    return {
      page: this.current,
      ratio: this.pages.length > 1 ? this.current / (this.pages.length - 1) : 0,
      text: normalizedText(raw).slice(0, 28),
    };
  }

  findPageByText(text) {
    const needle = normalizedText(text).slice(0, 14);
    if (!needle) return -1;
    let fallback = -1;
    for (let index = 0; index < this.pages.length; index += 1) {
      const content = normalizedText(this.pages[index].querySelector('.page-body')?.textContent);
      if (content.startsWith(needle)) return index;
      if (fallback < 0 && content.includes(needle)) fallback = index;
    }
    return fallback;
  }

  /* --------------------------------- 内容渲染 -------------------------------- */

  buildBlocks(entry) {
    const blocks = [];
    const head = el('header', 'chapter-head');
    const eyebrow = el('p', 'chapter-eyebrow');
    const date = parseDateKey(entry.date);
    eyebrow.textContent = `${chineseYear(entry.date)} · ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    const title = el('h2', 'chapter-title', entry.title?.trim() || '无题');
    const meta = el('p', 'chapter-meta');
    const metaBits = [weekdayOf(entry.date)];
    const weather = weatherOf(entry.weather);
    const mood = moodOf(entry.mood);
    if (weather) metaBits.push(weather.label);
    if (mood) metaBits.push(mood.label);
    if (entry.body) metaBits.push(`约 ${readingMinutes(entry.body)} 分钟`);
    meta.textContent = metaBits.join(' · ');
    const ornament = el('div', 'chapter-ornament');
    ornament.append(el('span'), el('i', '', 'Δ'), el('span'));
    head.append(eyebrow, title, meta, ornament);
    blocks.push(head);

    const lines = String(entry.body || '')
      .replace(/\r\n/g, '\n')
      .split('\n');

    let hasParagraph = false;
    let previousBlank = true;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (!previousBlank) {
          blocks.push(el('div', 'para-gap'));
          previousBlank = true;
        }
        continue;
      }
      previousBlank = false;

      if (/^---+$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
        const breakNode = el('div', 'scene-break');
        breakNode.append(el('span'), el('i', '', 'Δ'), el('span'));
        blocks.push(breakNode);
        continue;
      }

      if (/^#{1,3}\s+/.test(trimmed)) {
        const headingText = trimmed.replace(/^#{1,3}\s+/, '').slice(0, 80);
        blocks.push(el('h3', 'body-heading', headingText));
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quote = el('blockquote', 'body-quote');
        const p = el('p', '', trimmed.replace(/^>\s?/, ''));
        quote.appendChild(p);
        blocks.push(quote);
        continue;
      }

      const p = el('p', 'body-p');
      if (!hasParagraph) p.classList.add('has-dropcap');
      p.textContent = line.replace(/\s+$/, '');
      blocks.push(p);
      hasParagraph = true;
    }

    if (!entry.body?.trim()) {
      blocks.push(el('p', 'body-empty', '今天只留下了一点空白。'));
    }

    const end = el('div', 'chapter-end');
    end.append(el('span', 'end-line'), el('em', '', '完'), el('span', 'end-line'));
    blocks.push(end);

    const nextEntry = this.entries[this.entryIndex + 1];
    if (nextEntry) {
      const card = el('button', 'chapter-next');
      card.type = 'button';
      card.dataset.openEntry = nextEntry.id;
      const label = el('span', 'chapter-next-label', '较早的一篇');
      const nextTitle = el('strong', '', nextEntry.title?.trim() || '无题');
      const nextDate = el('span', 'chapter-next-date', formatDateCN(nextEntry.date));
      const arrow = el('span', 'chapter-next-arrow', '→');
      card.append(label, nextTitle, nextDate, arrow);
      blocks.push(card);
    } else {
      const last = el('div', 'chapter-last');
      last.append(el('span', '', '这是最早的一篇'), el('i', '', 'Δ'));
      blocks.push(last);
    }

    return blocks;
  }

  makeParagraph(block, text, continuation) {
    if (block.tagName === 'BLOCKQUOTE') {
      const quote = el('blockquote', 'body-quote');
      if (continuation) quote.classList.add('is-continued');
      const p = el('p', '', text);
      quote.appendChild(p);
      return quote;
    }
    const p = el('p', 'body-p');
    if (continuation) p.classList.add('is-continuation');
    if (block.classList.contains('has-dropcap') && !continuation) p.classList.add('has-dropcap');
    p.textContent = text;
    return p;
  }

  remainingRoom(body) {
    const last = body.lastElementChild;
    if (!last) return body.clientHeight;
    const bodyRect = body.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    const style = getComputedStyle(last);
    const marginBottom = parseFloat(style.marginBottom) || 0;
    const used = lastRect.bottom + marginBottom - bodyRect.top;
    return body.clientHeight - used;
  }

  findFit(body, block, text, continuation) {
    const chars = Array.from(text);
    if (!chars.length) return 0;
    let low = 1;
    let high = chars.length - 1;
    let best = 0;

    const fits = (length) => {
      const probe = this.makeParagraph(block, chars.slice(0, length).join(''), continuation);
      body.appendChild(probe);
      const ok = body.scrollHeight <= body.clientHeight + 2;
      body.removeChild(probe);
      return ok;
    };

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (fits(mid)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (best <= 0) return 0;

    // 避免下一页只剩一两个字的“孤儿行”：把更多内容推到下一页。
    const MIN_ORPHAN = 20;
    if (chars.length > MIN_ORPHAN && chars.length - best < MIN_ORPHAN) {
      best = Math.max(1, chars.length - MIN_ORPHAN);
    }

    // 不要把收尾标点孤单地丢到下一页开头
    while (best > 1 && best < chars.length && CLOSING_PUNCT.test(chars[best])) {
      best -= 1;
    }
    if (best < chars.length && OPENING_PUNCT.test(chars[best - 1])) {
      best = Math.max(1, best - 1);
    }
    return best;
  }

  /* ----------------------------------- 交互 ---------------------------------- */

  bindEvents() {
    if (this.bound) return;
    this.bound = true;

    this.stage.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', (event) => this.onPointerUp(event));
    window.addEventListener('pointercancel', () => this.cancelDrag());

    this.stage.addEventListener('click', (event) => this.onStageClick(event));
    this.stage.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));

    this.elements.prevBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.prevPage();
    });
    this.elements.nextBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.nextPage();
    });
  }

  onPointerDown(event) {
    if (!this.isOpen) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    if (this.drag) return;

    this.drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      active: false,
      pointerType: event.pointerType,
    };
  }

  onPointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;

    if (!this.drag.active) {
      if (Math.abs(dx) < 9) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.25) {
        this.drag = null;
        return;
      }
      this.drag.active = true;
      this.frame.classList.add('is-dragging');
      this.showChrome();
    }

    event.preventDefault();
    let offset = dx;
    if ((this.current === 0 && dx > 0) || (this.current === this.pages.length - 1 && dx < 0)) {
      offset = dx * 0.28;
    }
    if (!this.step) this.measure();
    this.track.style.transform = `translate3d(${-this.current * this.step + offset}px, 0, 0)`;
    this.drag.lastX = event.clientX;
  }

  onPointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const drag = this.drag;
    this.drag = null;
    this.frame.classList.remove('is-dragging');

    if (!drag.active) return;
    const dx = event.clientX - drag.startX;
    const threshold = Math.max(44, this.frame.clientWidth * 0.14);
    this.suppressClickUntil = Date.now() + 380;

    if (dx <= -threshold) this.nextPage();
    else if (dx >= threshold) this.prevPage();
    else this.applyTransform(true);
  }

  cancelDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.frame.classList.remove('is-dragging');
    this.applyTransform(true);
  }

  onStageClick(event) {
    if (!this.isOpen) return;
    if (Date.now() < this.suppressClickUntil) return;
    const nextCard = event.target.closest('[data-open-entry]');
    if (nextCard) {
      this.callbacks.onOpenEntry?.(nextCard.dataset.openEntry);
      return;
    }
    if (event.target.closest('button, a, input, select, textarea')) return;

    const rect = this.stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < rect.width * 0.28) this.prevPage();
    else if (x > rect.width * 0.72) this.nextPage();
    else this.toggleChrome();
  }

  onWheel(event) {
    if (!this.isOpen) return;
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.1) return;
    if (Math.abs(event.deltaX) < 24) return;
    event.preventDefault();
    const now = Date.now();
    if (now - this.lastWheel < 480) return;
    this.lastWheel = now;
    if (event.deltaX > 0) this.nextPage();
    else this.prevPage();
  }

  onKeyDown(event) {
    if (!this.isOpen) return;
    const tag = document.activeElement?.tagName;
    if (/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(tag || '')) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;

    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      this.nextPage();
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      this.prevPage();
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.goFirst();
    } else if (event.key === 'End') {
      event.preventDefault();
      this.goLast();
    }
  }

  toggleChrome(force) {
    if (this.chromeHidden && force !== false) this.showChrome();
    else if (!this.chromeHidden && force !== true) this.hideChrome();
    else if (force === false) this.showChrome();
  }

  hideChrome() {
    this.chromeHidden = true;
    this.view.classList.add('chrome-hidden');
    this.closePopovers();
  }

  showChrome() {
    this.chromeHidden = false;
    this.view.classList.remove('chrome-hidden');
  }

  closeChrome() {
    this.chromeHidden = false;
    this.view.classList.remove('chrome-hidden');
  }

  closePopovers() {
    this.callbacks.onClosePopovers?.();
  }

  /* ---------------------------------- 进度 ---------------------------------- */

  saveProgress() {
    if (!this.entry) return;
    this.progress[this.entry.id] = {
      page: this.current,
      total: this.pages.length,
      ratio: this.pages.length > 1 ? this.current / (this.pages.length - 1) : 0,
      updatedAt: this.entry.updatedAt,
      at: Date.now(),
    };
    writeProgressMap(this.progress);
    this.callbacks.onProgress?.({
      entry: this.entry,
      page: this.current + 1,
      total: this.pages.length,
    });
  }

  updateUI() {
    const total = Math.max(1, this.pages.length);
    const pageNo = Math.min(this.current + 1, total);
    const percent = Math.round((pageNo / total) * 100);
    if (this.elements.counter) this.elements.counter.textContent = `${pageNo} / ${total}`;
    if (this.elements.progressText) this.elements.progressText.textContent = `${percent}%`;
    if (this.elements.progressBar) this.elements.progressBar.style.width = `${percent}%`;
    this.track.style.setProperty('--page-index', String(this.current));
    this.callbacks.onPageChange?.(pageNo, total);
  }

  updateArrows() {
    const atFirst = this.current === 0 && this.entryIndex === 0;
    const atLast = this.current === this.pages.length - 1 && this.entryIndex >= this.entries.length - 1;
    this.elements.prevBtn?.classList.toggle('is-disabled', atFirst);
    this.elements.nextBtn?.classList.toggle('is-disabled', atLast);
    if (this.elements.prevBtn) this.elements.prevBtn.disabled = atFirst;
    if (this.elements.nextBtn) this.elements.nextBtn.disabled = atLast;
  }
}
