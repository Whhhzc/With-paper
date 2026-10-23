/* Pixel and perspective operations shared by the local image worker and tests. */
(function (root) {
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const fullCorners = () => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  function dimensions(width, height, options = {}) {
    const w = Number(options.width || 0), h = Number(options.height || 0);
    if (![w, h].every(n => Number.isInteger(n) && n >= 0 && n <= 16000)) throw Error('宽高需为 1–16000 的整数，留空表示不限制。');
    let nextW = width, nextH = height;
    if (options.keepRatio !== false) {
      const ratio = Math.min(w ? w / width : Infinity, h ? h / height : Infinity);
      if (Number.isFinite(ratio)) { nextW *= ratio; nextH *= ratio; }
    } else { nextW = w || width; nextH = h || height; }
    nextW = Math.max(1, Math.round(nextW)); nextH = Math.max(1, Math.round(nextH));
    if (nextW * nextH > 32000000) throw Error('输出超过 3200 万像素，请减小宽高。');
    return { width: nextW, height: nextH };
  }
  function validateCorners(points) {
    if (!Array.isArray(points) || points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw Error('四角坐标需在图片范围内。');
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= .00001) throw Error('四个角不能交叉，请按左上、右上、右下、左下排列。');
      area += a.x * b.y - b.x * a.y;
    }
    if (area / 2 < .005) throw Error('裁剪区域太小，请扩大四角范围。');
    return points;
  }
  // Solve the eight homography coefficients mapping a unit square to the photo.
  function homography(points) {
    const source = [[0, 0], [1, 0], [1, 1], [0, 1]], rows = [];
    source.forEach(([u, v], i) => {
      const { x, y } = points[i];
      rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
      rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
    });
    for (let col = 0; col < 8; col++) {
      let pivot = col;
      for (let row = col + 1; row < 8; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
      [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
      const divisor = rows[col][col];
      if (Math.abs(divisor) < 1e-10) throw Error('无法拉正这个区域，请重新调整四角。');
      for (let j = col; j <= 8; j++) rows[col][j] /= divisor;
      for (let row = 0; row < 8; row++) if (row !== col) {
        const factor = rows[row][col];
        for (let j = col; j <= 8; j++) rows[row][j] -= factor * rows[col][j];
      }
    }
    return rows.map(row => row[8]);
  }
  function project(matrix, u, v) {
    const d = matrix[6] * u + matrix[7] * v + 1;
    return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / d, y: (matrix[3] * u + matrix[4] * v + matrix[5]) / d };
  }
  function warp(source, corners, maxEdge = 2400) {
    validateCorners(corners);
    const points = corners.map(p => ({ x: p.x * (source.width - 1), y: p.y * (source.height - 1) }));
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = Math.max(2, Math.round(Math.max(distance(points[0], points[1]), distance(points[3], points[2])) + 1));
    const h = Math.max(2, Math.round(Math.max(distance(points[0], points[3]), distance(points[1], points[2])) + 1));
    const factor = Math.min(1, maxEdge / Math.max(w, h));
    const width = Math.max(2, Math.round(w * factor)), height = Math.max(2, Math.round(h * factor));
    const data = new Uint8ClampedArray(width * height * 4), matrix = homography(points);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = project(matrix, x / (width - 1), y / (height - 1));
      const sx = clamp(p.x, 0, source.width - 1), sy = clamp(p.y, 0, source.height - 1);
      const ix = Math.floor(sx), iy = Math.floor(sy), dx = sx - ix, dy = sy - iy;
      const a = (iy * source.width + ix) * 4, b = (iy * source.width + Math.min(ix + 1, source.width - 1)) * 4;
      const c = (Math.min(iy + 1, source.height - 1) * source.width + ix) * 4, d = (Math.min(iy + 1, source.height - 1) * source.width + Math.min(ix + 1, source.width - 1)) * 4;
      const to = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const sample = offset => source.data[offset + channel] * source.data[offset + 3] / 255 + 255 - source.data[offset + 3];
        data[to + channel] = sample(a) * (1 - dx) * (1 - dy) + sample(b) * dx * (1 - dy) + sample(c) * (1 - dx) * dy + sample(d) * dx * dy;
      }
      data[to + 3] = 255;
    }
    return { width, height, data };
  }
  function filter(image, mode = 'original', contrast = 0, brightness = 0) {
    const { width, height, data } = image;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(.299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2]);
    let integral;
    if (mode === 'bw') {
      integral = new Float64Array((width + 1) * (height + 1));
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let x = 0; x < width; x++) { sum += gray[y * width + x]; integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + sum; }
      }
    }
    const gain = 1 + clamp(Number(contrast), -80, 100) / 100, lift = clamp(Number(brightness), -80, 80);
    const radius = Math.max(8, Math.round(Math.min(width, height) / 35));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, offset = i * 4;
      if (mode === 'bw') {
        const l = Math.max(0, x - radius), r = Math.min(width, x + radius + 1), t = Math.max(0, y - radius), b = Math.min(height, y + radius + 1), stride = width + 1;
        const average = (integral[b * stride + r] - integral[t * stride + r] - integral[b * stride + l] + integral[t * stride + l]) / ((r - l) * (b - t));
        const value = (gray[i] - 128) * gain + 128 + lift < average - 12 ? 0 : 255;
        data[offset] = data[offset + 1] = data[offset + 2] = value;
      } else for (let c = 0; c < 3; c++) {
        const base = mode === 'gray' ? gray[i] : data[offset + c];
        data[offset + c] = (base - 128) * gain * (mode === 'enhance' ? 1.25 : 1) + 128 + lift + (mode === 'enhance' ? 10 : 0);
      }
    }
    return image;
  }
  // Best-effort detection of a bright connected sheet against a darker background.
  function detect(image) {
    const { width, height, data } = image, count = width * height;
    const light = new Uint8Array(count); let min = 255, max = 0;
    for (let i = 0; i < count; i++) { const v = .299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2]; light[i] = v; min = Math.min(min, v); max = Math.max(max, v); }
    if (max - min < 45) return null;
    const threshold = Math.max(120, min + (max - min) * .62), visited = new Uint8Array(count), queue = new Int32Array(count);
    let best = null, bestCount = 0;
    for (let start = 0; start < count; start++) {
      if (visited[start] || light[start] < threshold) continue;
      let head = 0, tail = 1; queue[0] = start; visited[start] = 1;
      let extrema = [Infinity, -Infinity, -Infinity, Infinity], points = [];
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width), sum = x + y, diff = x - y;
        if (sum < extrema[0]) { extrema[0] = sum; points[0] = { x, y }; }
        if (diff > extrema[1]) { extrema[1] = diff; points[1] = { x, y }; }
        if (sum > extrema[2]) { extrema[2] = sum; points[2] = { x, y }; }
        if (diff < extrema[3]) { extrema[3] = diff; points[3] = { x, y }; }
        const neighbors = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1];
        for (const next of neighbors) if (next >= 0 && !visited[next] && light[next] >= threshold) { visited[next] = 1; queue[tail++] = next; }
      }
      if (tail > bestCount) { bestCount = tail; best = points; }
    }
    if (bestCount < count * .12 || bestCount > count * .96 || !best || best.length !== 4) return null;
    const points = best.map(p => ({ x: p.x / (width - 1), y: p.y / (height - 1) }));
    try { validateCorners(points); return points; } catch { return null; }
  }
  root.ImageEngine = { dimensions, fullCorners, validateCorners, homography, project, warp, filter, detect };
})(typeof self === 'undefined' ? globalThis : self);
