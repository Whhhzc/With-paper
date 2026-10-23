/* All image decoding, encoding and pixel loops stay off the UI thread. */
function surface(width, height) { return new OffscreenCanvas(width, height); }
async function decoded(file, rotation = 0) {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 64000000) throw Error('图片超过 6400 万像素，请先缩小后重试。');
    const odd = rotation % 2;
    const canvas = surface(odd ? bitmap.height : bitmap.width, odd ? bitmap.width : bitmap.height);
    const context = canvas.getContext('2d');
    context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 2);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return canvas;
  } finally { bitmap.close(); }
}
async function encode(canvas, type, quality) {
  const blob = await canvas.convertToBlob({ type, quality });
  if (blob.type !== type) throw Error(`当前浏览器不支持导出 ${type.split('/')[1].toUpperCase()}，请改用 JPG 或 PNG。`);
  return blob;
}
async function inspect(file, options) {
  const canvas = await decoded(file, options.rotation || 0);
  const scale = Math.min(1, 1100 / Math.max(canvas.width, canvas.height));
  const preview = surface(Math.max(1, Math.round(canvas.width * scale)), Math.max(1, Math.round(canvas.height * scale)));
  preview.getContext('2d').drawImage(canvas, 0, 0, preview.width, preview.height);
  let corners = null;
  if (options.detect) {
    const factor = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
    const small = surface(Math.max(2, Math.round(canvas.width * factor)), Math.max(2, Math.round(canvas.height * factor)));
    const ctx = small.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, small.width, small.height); ctx.drawImage(canvas, 0, 0, small.width, small.height);
    corners = ImageEngine.detect(ctx.getImageData(0, 0, small.width, small.height));
  }
  return { width: canvas.width, height: canvas.height, preview: await encode(preview, 'image/png'), corners };
}
async function compress(file, options) {
  const source = await decoded(file);
  let { width, height } = ImageEngine.dimensions(source.width, source.height, options);
  const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[options.format];
  if (!type) throw Error('请选择 JPG、PNG 或 WebP 格式。');
  const quality = Number(options.quality) / 100, target = Number(options.targetKB || 0) * 1024;
  if (!(quality >= .1 && quality <= 1) || !Number.isFinite(target) || target < 0) throw Error('请填写有效的质量和目标大小。');
  let blob, canvas;
  for (let round = 0; round < 10; round++) {
    canvas = surface(width, height); const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = options.background || '#ffffff'; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(source, 0, 0, width, height);
    blob = await encode(canvas, type, quality);
    if (!target || blob.size <= target) break;
    if (type !== 'image/png') {
      let low = .03, high = quality, candidate = await encode(canvas, type, low);
      if (candidate.size <= target) {
        for (let i = 0; i < 7; i++) { const mid = (low + high) / 2, next = await encode(canvas, type, mid); if (next.size <= target) { candidate = next; low = mid; } else high = mid; }
        blob = candidate; break;
      }
      blob = candidate;
    }
    const factor = Math.min(.85, Math.sqrt(target / blob.size) * .9);
    const nextW = Math.max(1, Math.floor(width * factor)), nextH = Math.max(1, Math.floor(height * factor));
    if (nextW === width && nextH === height) break;
    width = nextW; height = nextH;
  }
  return { blob, width: canvas.width, height: canvas.height, targetMet: !target || blob.size <= target, originalSize: file.size };
}
async function scan(file, options) {
  let canvas = await decoded(file, options.rotation || 0);
  // Bound the pixel buffers used for perspective interpolation on mobile devices.
  const limit = (Number(options.maxEdge) || 2400) * 1.5, factor = Math.min(1, limit / Math.max(canvas.width, canvas.height));
  if (factor < 1) {
    const reduced = surface(Math.max(2, Math.round(canvas.width * factor)), Math.max(2, Math.round(canvas.height * factor)));
    reduced.getContext('2d').drawImage(canvas, 0, 0, reduced.width, reduced.height); canvas.width = canvas.height = 0; canvas = reduced;
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const result = ImageEngine.filter(ImageEngine.warp(context.getImageData(0, 0, canvas.width, canvas.height), options.corners, Number(options.maxEdge) || 2400), options.filter, options.contrast, options.brightness);
  const output = surface(result.width, result.height); output.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
  return { blob: await encode(output, options.format === 'jpg' ? 'image/jpeg' : 'image/png', .92), width: result.width, height: result.height };
}
self.onmessage = async ({ data }) => {
  try {
    if (typeof OffscreenCanvas === 'undefined') throw Error('当前浏览器缺少本地图片处理能力，请使用新版 Chrome、Edge、Firefox 或 Safari。');
    const results = [];
    for (let i = 0; i < data.files.length; i++) {
      self.postMessage({ type: 'progress', done: i, total: data.files.length, label: `正在处理第 ${i + 1} / ${data.files.length} 张图片…` });
      results.push(await ({ inspect, compress, scan }[data.action])(data.files[i], data.options));
    }
    self.postMessage({ type: 'complete', result: { entries: results } });
  } catch (error) { self.postMessage({ type: 'error', message: error.message || '图片处理失败，请重试。' }); }
};
