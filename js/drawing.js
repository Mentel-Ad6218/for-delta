/*
 * 日记涂鸦：用少量矢量笔画记录在日记加密数据里。
 * 画布坐标固定为 1000 × 600，显示时按纸张宽度缩放。
 */

export const DRAWING_WIDTH = 1000;
export const DRAWING_HEIGHT = 600;

export const DRAW_COLORS = [
  { key: 'ink', label: '墨色', value: '#294958' },
  { key: 'blue', label: '海蓝', value: '#2f7fb5' },
  { key: 'green', label: '苔绿', value: '#4f7d5c' },
  { key: 'rose', label: '珊瑚', value: '#b65f68' },
  { key: 'gold', label: '麦金', value: '#a37a32' },
];

const COLOR_MAP = new Map(DRAW_COLORS.map((color) => [color.key, color.value]));
const MAX_STROKES = 90;
const MAX_POINTS = 6000;
const MAX_POINTS_PER_STROKE = 600;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function readPoint(point) {
  if (Array.isArray(point)) return [Number(point[0]), Number(point[1])];
  if (point && typeof point === 'object') return [Number(point.x), Number(point.y)];
  return [Number.NaN, Number.NaN];
}

export function emptyDrawing() {
  return { version: 1, width: DRAWING_WIDTH, height: DRAWING_HEIGHT, strokes: [] };
}

/**
 * 清理外部数据（导入的备份、旧草稿）里的涂鸦。
 * 限制笔画数量与坐标范围，避免异常数据拖慢分页。
 */
export function normalizeDrawing(raw) {
  const source = raw && typeof raw === 'object' ? raw : null;
  const strokes = [];
  if (!source || !Array.isArray(source.strokes)) return emptyDrawing();

  let totalPoints = 0;
  for (const rawStroke of source.strokes.slice(0, MAX_STROKES)) {
    if (!rawStroke || typeof rawStroke !== 'object' || !Array.isArray(rawStroke.points)) continue;
    if (totalPoints >= MAX_POINTS) break;

    const points = [];
    for (const point of rawStroke.points.slice(0, MAX_POINTS_PER_STROKE)) {
      if (totalPoints + points.length >= MAX_POINTS) break;
      const [x, y] = readPoint(point);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([round(clamp(x, 0, DRAWING_WIDTH)), round(clamp(y, 0, DRAWING_HEIGHT))]);
    }
    if (!points.length) continue;
    totalPoints += points.length;

    const color = COLOR_MAP.has(rawStroke.color) ? rawStroke.color : 'ink';
    strokes.push({
      color,
      width: round(clamp(Number(rawStroke.width) || 4, 1, 24)),
      erase: rawStroke.erase === true,
      points,
    });
  }

  return {
    version: 1,
    width: DRAWING_WIDTH,
    height: DRAWING_HEIGHT,
    strokes,
  };
}

export function drawingHasInk(drawing) {
  return Boolean(
    drawing &&
      Array.isArray(drawing.strokes) &&
      drawing.strokes.some((stroke) => Array.isArray(stroke.points) && stroke.points.length),
  );
}

export function drawingSignature(drawing) {
  const normalized = normalizeDrawing(drawing);
  return drawingHasInk(normalized) ? JSON.stringify(normalized) : '';
}

export function drawingColorValue(key) {
  return COLOR_MAP.get(key) || COLOR_MAP.get('ink');
}

function applyStrokeStyle(ctx, stroke) {
  ctx.save();
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = drawingColorValue(stroke.color);
  ctx.fillStyle = drawingColorValue(stroke.color);
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function paintDab(ctx, stroke, point) {
  const [x, y] = point;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, stroke.width / 2), 0, Math.PI * 2);
  ctx.fill();
}

/** 把一笔完整画到 canvas 上（canvas 尺寸应为 1000×600）。 */
export function paintStroke(ctx, stroke) {
  if (!stroke?.points?.length) return;
  applyStrokeStyle(ctx, stroke);
  if (stroke.points.length === 1) {
    paintDab(ctx, stroke, stroke.points[0]);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (let index = 1; index < stroke.points.length; index += 1) {
    ctx.lineTo(stroke.points[index][0], stroke.points[index][1]);
  }
  ctx.stroke();
  ctx.restore();
}

/** 只画最后一小段，用于手指/鼠标移动时实时反馈。 */
export function paintStrokeTail(ctx, stroke) {
  const points = stroke?.points;
  if (!points?.length) return;
  applyStrokeStyle(ctx, stroke);
  if (points.length === 1) {
    paintDab(ctx, stroke, points[0]);
    ctx.restore();
    return;
  }
  const from = points[points.length - 2];
  const to = points[points.length - 1];
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
  ctx.restore();
}

export function paintDrawing(canvas, drawing) {
  if (!canvas) return;
  const normalized = normalizeDrawing(drawing);
  canvas.width = DRAWING_WIDTH;
  canvas.height = DRAWING_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
  for (const stroke of normalized.strokes) paintStroke(ctx, stroke);
}
