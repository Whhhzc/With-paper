const Media = (() => {
  const base = new URL('vendor/pdfjs/', location.href).href;
  async function pdf(file, signal) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    const url = URL.createObjectURL(new Blob([window.pdfRendererSource], { type: 'application/javascript' }));
    const port = new Worker(url);
    URL.revokeObjectURL(url);
    const worker = new PdfRenderer.PDFWorker({ port });
    const task = PdfRenderer.getDocument({ data: bytes, worker, isEvalSupported: false, cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, iccUrl: `${base}iccs/`, useWasm: location.protocol !== 'file:', verbosity: 0 });
    const onAbort = () => { void destroy().catch(() => {}); };
    const destroy = async () => { signal?.removeEventListener('abort', onAbort); try { await task.destroy(); } finally { worker.destroy(); port.terminate(); } };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const document = await task.promise;
      signal?.throwIfAborted();
      return { numPages: document.numPages, getPage: number => document.getPage(number), destroy };
    } catch (error) { await destroy(); throw error; }
  }
  async function page(pdfDocument, number, scale = 1.4, signal) {
    signal?.throwIfAborted();
    const pdfPage = await pdfDocument.getPage(number);
    signal?.throwIfAborted();
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' });
    const cancel = () => task.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    try { await task.promise; signal?.throwIfAborted(); return canvas; }
    finally { signal?.removeEventListener('abort', cancel); pdfPage.cleanup(); }
  }
  async function image(file, signal) {
    const bitmap = await createImageBitmap(file);
    try {
      signal?.throwIfAborted();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      return canvas;
    } finally { bitmap.close(); }
  }
  const blob = (canvas, type = 'image/png', quality = .92) => new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片导出失败，请降低分辨率后重试。')), type, quality));
  async function watermark(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = '64px "Microsoft YaHei", "PingFang SC", sans-serif';
    canvas.width = Math.ceil(context.measureText(text).width) + 32; canvas.height = 112;
    context.font = '64px "Microsoft YaHei", "PingFang SC", sans-serif';
    context.fillStyle = '#555555'; context.textBaseline = 'middle';
    context.fillText(text, 16, 56);
    return new Uint8Array(await (await blob(canvas)).arrayBuffer());
  }
  async function sampleImage() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 1200, 800);
    context.fillStyle = '#111'; context.font = '48px "Microsoft YaHei", sans-serif';
    ['办公会议记录', '项目计划与工作安排', '请于周五前完成文件整理。', 'Office meeting notes', 'Please finish the report by Friday.', 'Reference: 2026-1021'].forEach((line, index) => context.fillText(line, 75, 120 + index * 100));
    return new File([await blob(canvas)], '会议记录.png', { type: 'image/png' });
  }
  return { pdf, page, image, blob, watermark, sampleImage };
})();
