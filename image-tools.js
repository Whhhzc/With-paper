/* Browser-local image tools and multi-page document scanning. */
const ImageTools = (() => {
  const imageJob = new LocalJob(`importScripts(${JSON.stringify(new URL('image-engine.js', location.href).href)},${JSON.stringify(new URL('image-worker.js', location.href).href)});`);
  const pdfJob = new LocalJob(window.pdfWorkerSource), ocrJob = new LocalJob(window.ocrWorkerSource);
  const cornerNames = ['左上', '右上', '右下', '左下'];
  let files = [], outputs = [], selected = 0, config, controller, listeners, zipUrl, previewUrl, activeCorner = 0, dragging = null, mounted = false;
  let feedback = '', previewNote = '', report = null;
  const scanning = () => state.tool?.id === 'scan-document';
  const busy = () => ['reading', 'processing'].includes(state.phase);
  const current = () => files[selected];
  const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
  const safeName = name => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  const stem = name => safeName(name.replace(/\.[^.]+$/, '')) || '图片';
  const field = (name, input, hint = '') => `<label class="field"><span>${name}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
  function clearResults() {
    outputs.forEach(item => URL.revokeObjectURL(item.url)); outputs = [];
    if (zipUrl) URL.revokeObjectURL(zipUrl); zipUrl = null; report = null;
  }
  function clearPreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; previewNote = ''; }
  function reset() {
    controller?.abort(); controller = null; imageJob.cancel(); pdfJob.cancel(); ocrJob.cancel(); listeners?.abort();
    clearResults(); clearPreview(); files.forEach(item => URL.revokeObjectURL(item.url)); files = [];
    if (mounted) state.files = []; mounted = false; dragging = null;
  }
  function mount() {
    mounted = true; selected = 0; feedback = ''; activeCorner = 0;
    config = { format: 'jpg', quality: '85', width: '', height: '', keepRatio: true, targetKB: '', background: '#ffffff', filter: 'enhance', contrast: '0', brightness: '0', maxEdge: '2400', output: 'pdf', pageSize: 'a4', language: 'chi_sim+eng', name: '' };
    const tool = state.tool;
    main.innerHTML = `<div class="workspace-heading"><div class="hero-file-icon">${fileBadge(tool)}<span>${scanning() ? 'SCAN' : 'IMG'}</span></div><h1>${tool.name}</h1><p>${tool.desc}</p></div>
      <div class="workspace-grid image-workspace"><section class="files-panel" aria-label="图片工作区"><div class="panel-toolbar"><strong>图片列表 <span id="file-count" class="toolbar-sub"></span></strong><button class="text-button" data-im="clear">清空列表</button></div><div id="image-content"></div><div id="file-feedback" class="file-feedback" role="alert"></div><input class="file-input" id="file-input" type="file" multiple accept=".png,.jpg,.jpeg,.webp" aria-label="选择本地图片"><input class="file-input" id="camera-input" type="file" accept="image/*" capture="environment" aria-label="拍摄纸质文件"></section>
      <aside class="settings-panel image-settings"><h2>${scanning() ? '扫描设置' : '图片设置'}</h2>${settings()}<div class="setting-separator"></div><div class="summary-line"><span>已选择图片</span><strong id="selected-count">0 张</strong></div><button class="primary" id="run-button" data-im="run">${scanning() ? '生成扫描文件' : '处理图片'}</button><p class="setting-footnote">文件不上传，原图不会修改。</p></aside></div>
      <div class="demo-notice">${icon('info')}<span>${scanning() ? '先选择页面、调整四角，再预览拉正效果。自动找边适合明亮纸张与较暗背景，结果请手动核对。' : '支持 JPG、PNG、WebP。目标大小可能进一步降低质量或缩小尺寸；PNG 的质量滑块不影响其无损编码。'}</span></div>`;
    listeners = new AbortController(); const options = { signal: listeners.signal };
    main.addEventListener('click', click, options); main.addEventListener('input', input, options);
    main.addEventListener('keydown', keydown, options);
    main.addEventListener('pointerdown', pointerDown, options); main.addEventListener('pointermove', pointerMove, options);
    main.addEventListener('pointerup', () => { dragging = null; }, options); main.addEventListener('pointercancel', () => { dragging = null; }, options);
    document.querySelector('#file-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; }, options);
    document.querySelector('#camera-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; }, options);
    const panel = main.querySelector('.files-panel');
    panel.addEventListener('dragover', event => { event.preventDefault(); panel.classList.add('image-dragover'); }, options);
    panel.addEventListener('dragleave', () => panel.classList.remove('image-dragover'), options);
    panel.addEventListener('drop', event => { event.preventDefault(); panel.classList.remove('image-dragover'); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); }, options);
    render();
  }
  function settings() {
    if (!scanning()) return field('输出格式', '<select id="im-format" data-config="format"><option value="jpg">JPG · 适合照片</option><option value="png">PNG · 保留透明背景</option><option value="webp">WebP · 兼顾体积与透明</option></select>') +
      field('压缩质量', '<div class="image-range"><input id="im-quality" data-config="quality" type="range" min="10" max="100" value="85"><output id="quality-value" for="im-quality">85%</output></div>', 'JPG / WebP 有效。越低通常越小，细节越少。') +
      '<div class="image-size-fields">' + field('宽度（像素）', '<input id="im-width" data-config="width" type="number" min="1" max="16000" placeholder="原宽度">') + field('高度（像素）', '<input id="im-height" data-config="height" type="number" min="1" max="16000" placeholder="原高度">') + '</div>' +
      '<label class="image-check"><input id="im-ratio" data-config="keepRatio" type="checkbox" checked>保持宽高比例</label><p class="image-hint">同时填写宽高时，按比例放入指定范围。</p>' +
      field('目标大小（KB，可选）', '<input id="im-target" data-config="targetKB" type="number" min="1" step="1" placeholder="例如 500">', '优先降低质量，再缩小尺寸；极小目标可能无法满足。') +
      field('JPG 背景色', '<input id="im-background" data-config="background" type="color" value="#ffffff">', '透明区域转换为 JPG 时使用此颜色。') +
      '<button class="secondary image-preview-button" data-im="preview">预览当前图片</button>';
    return field('画面模式', '<select id="scan-filter" data-config="filter"><option value="enhance">文字增强（彩色）</option><option value="original">原色</option><option value="gray">灰度</option><option value="bw">黑白扫描</option></select>') +
      field('对比度', '<input id="scan-contrast" data-config="contrast" type="range" min="-50" max="100" value="0">') +
      field('亮度', '<input id="scan-brightness" data-config="brightness" type="range" min="-60" max="60" value="0">') +
      field('最长边', '<select id="scan-resolution" data-config="maxEdge"><option value="1600">1600 像素 · 轻量</option><option value="2400" selected>2400 像素 · 清晰</option><option value="3200">3200 像素 · 高清</option></select>', '不会凭空增加原图细节。') +
      field('导出内容', '<select id="scan-output" data-config="output"><option value="pdf">扫描 PDF</option><option value="searchable">可搜索 PDF（本地 OCR）</option><option value="png">每页 PNG 图片</option><option value="jpg">每页 JPG 图片</option><option value="txt">提取文字 TXT（本地 OCR）</option></select>') +
      field('PDF 页面尺寸', '<select id="scan-page-size" data-config="pageSize"><option value="a4">A4 · 自动横向 / 纵向</option><option value="fit">适应扫描图片</option></select>') +
      `<div id="scan-language-field" hidden>${field('文字识别语言', '<select id="scan-language" data-config="language"><option value="chi_sim+eng">简体中文 + 英文</option><option value="chi_sim">简体中文</option><option value="eng">英文</option></select>', '识别可能有错字；可搜索 PDF 保留图像并增加隐藏文字层。')}</div>` +
      field('输出文件名', '<input id="im-name" data-config="name" placeholder="扫描文档">') +
      '<button class="secondary image-preview-button" data-im="preview">预览当前页效果</button>';
  }
  function progress({ done = 0, total = 1, label = '正在本地处理…' }) {
    const labelNode = main.querySelector('#progress-label'); if (!labelNode) return;
    labelNode.textContent = label;
    const percent = Math.min(100, Math.round(done / Math.max(total, 1) * 100));
    const bar = main.querySelector('[role="progressbar"]'); bar.setAttribute('aria-valuenow', percent); bar.querySelector('.progress-fill').style.width = `${percent}%`;
  }
  function begin(phase = 'processing') {
    controller?.abort(); clearResults(); controller = new AbortController(); state.phase = phase; feedback = ''; render(); return controller.signal;
  }
  function fail(error, signal) {
    if (signal.aborted || error.name === 'AbortError') return;
    clearResults(); feedback = error.message || '处理失败，请重试。'; state.phase = 'select'; controller = null; render();
  }
  function complete(signal) { signal.throwIfAborted(); controller = null; state.phase = 'select'; render(); }
  async function addFiles(list) {
    if (busy()) return;
    const incoming = Array.from(list), accepted = [], errors = [];
    const signal = begin('reading'); let committed = false;
    try {
      for (const file of incoming) {
        if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { errors.push(`“${file.name}”暂不支持，请使用 JPG、PNG 或 WebP。`); continue; }
        try {
          const { entries: [meta] } = await imageJob.run('inspect', [file], {}, progress); signal.throwIfAborted();
          accepted.push({ file, name: file.name, width: meta.width, height: meta.height, url: URL.createObjectURL(meta.preview), corners: ImageEngine.fullCorners(), rotation: 0 });
        } catch (error) { signal.throwIfAborted(); errors.push(`“${file.name}”：${error.message}`); }
      }
      signal.throwIfAborted(); files.push(...accepted); committed = true; state.files = files;
      if (accepted.length) { selected = files.length - accepted.length; clearPreview(); }
      feedback = errors.join('\n'); complete(signal);
    } catch (error) { fail(error, signal); }
    finally { if (!committed) accepted.forEach(item => URL.revokeObjectURL(item.url)); }
  }
  async function sample() {
    if (busy()) return;
    const signal = listeners.signal, scan = scanning();
    try {
      const source = await Media.sampleImage(); signal.throwIfAborted();
      if (busy()) return;
      if (!scan) { await addFiles([source]); return; }
      const bitmap = await createImageBitmap(source), canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 1200;
      const context = canvas.getContext('2d'); context.fillStyle = '#414955'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(750, 600); context.rotate(-.10); context.drawImage(bitmap, -600, -400); bitmap.close();
      const blob = await Media.blob(canvas); signal.throwIfAborted();
      await addFiles([new File([blob], '拍摄会议记录.png', { type: 'image/png' })]);
    } catch (error) { if (!signal.aborted) { feedback = error.message; render(); } }
  }
  function validCoordinates() {
    if (!scanning()) return true;
    const invalid = [...main.querySelectorAll('[data-point]')].find(node => !Number.isFinite(node.valueAsNumber) || node.valueAsNumber < 0 || node.valueAsNumber > 100);
    if (!invalid) return true;
    feedback = '四角坐标需为 0–100 之间的数字。'; main.querySelector('#file-feedback').textContent = feedback;
    invalid.closest('details').open = true; invalid.focus(); return false;
  }
  function optionsFor(item, preview = false) {
    if (!scanning()) return { ...config };
    ImageEngine.validateCorners(item.corners);
    return { ...config, corners: item.corners, rotation: item.rotation, maxEdge: preview ? Math.min(1400, Number(config.maxEdge)) : Number(config.maxEdge), format: config.output === 'jpg' ? 'jpg' : 'png' };
  }
  async function processPreview() {
    if (busy() || !current() || !validCoordinates()) return;
    const item = current(), signal = begin(); clearPreview();
    try {
      const { entries: [result] } = await imageJob.run(scanning() ? 'scan' : 'compress', [item.file], optionsFor(item, true), progress);
      signal.throwIfAborted(); previewUrl = URL.createObjectURL(result.blob);
      previewNote = `${result.width} × ${result.height} 像素 · ${size(result.blob.size)}${result.targetMet === false ? ' · 未达到目标大小' : ''}${scanning() ? ' · 预览最长边 1400 像素，导出使用所选清晰度' : ''}`;
      complete(signal);
    } catch (error) { fail(error, signal); }
  }
  function unique(entries) {
    const used = new Set();
    return entries.map(entry => {
      const original = safeName(entry.name); let name = original, n = 2;
      while (used.has(name.toLowerCase())) { const dot = original.lastIndexOf('.'); name = `${original.slice(0, dot)} (${n++})${original.slice(dot)}`; }
      used.add(name.toLowerCase()); return { ...entry, name };
    });
  }
  async function run() {
    if (busy() || !files.length || !validCoordinates()) return;
    const signal = begin(); clearPreview();
    try {
      let entries = [], scanned = [], layouts;
      if (!scanning() && config.targetKB && (!Number.isInteger(Number(config.targetKB)) || Number(config.targetKB) < 1)) throw Error('目标大小需为大于 0 的整数 KB。');
      for (let i = 0; i < files.length; i++) {
        const item = files[i]; progress({ label: `正在处理 ${item.name}（${i + 1} / ${files.length}）`, done: i, total: files.length });
        const { entries: [result] } = await imageJob.run(scanning() ? 'scan' : 'compress', [item.file], optionsFor(item), value => progress({ ...value, label: `正在处理 ${item.name}（${i + 1} / ${files.length}）` }));
        signal.throwIfAborted();
        if (scanning()) scanned.push({ ...result, name: `${String(i + 1).padStart(3, '0')}_${stem(item.name)}.${config.output === 'jpg' ? 'jpg' : 'png'}` });
        else entries.push({ ...result, name: `${stem(item.name)}.${config.format}` });
      }
      if (scanning()) {
        if (['searchable', 'txt'].includes(config.output)) {
          const result = await ocrJob.run('recognize', scanned.map(item => new File([item.blob], item.name)), { language: config.language, layout: true, base: new URL('vendor/ocr/', location.href).href }, progress);
          signal.throwIfAborted(); layouts = result.entries;
        }
        const name = safeName(config.name.trim().replace(/\.(pdf|txt|png|jpe?g)$/i, '')) || '扫描文档';
        if (['pdf', 'searchable'].includes(config.output)) {
          let fontBytes;
          if (config.output === 'searchable') {
            progress({ label: '正在加载本站中文字体，生成可搜索文字层…' });
            const response = await fetch(new URL('vendor/content/NotoSansSC-Regular.otf', location.href), { signal });
            if (!response.ok) throw Error('中文字体加载失败，请重试。'); fontBytes = new Uint8Array(await response.arrayBuffer());
          }
          const images = [];
          for (let i = 0; i < scanned.length; i++) { images.push({ bytes: new Uint8Array(await scanned[i].blob.arrayBuffer()), layout: layouts?.[i] }); signal.throwIfAborted(); }
          const result = await pdfJob.run('scanPdf', images, { searchable: config.output === 'searchable', pageSize: config.pageSize, title: name, fontBytes, fontkitUrl: new URL('vendor/content/fontkit.umd.min.js', location.href).href }, progress);
          signal.throwIfAborted(); report = config.output === 'searchable' ? result.report : null;
          entries = [{ name: `${name}.pdf`, pages: result.pages, blob: new Blob([result.bytes], { type: 'application/pdf' }) }];
        } else if (config.output === 'txt') {
          entries = [{ name: `${name}.txt`, blob: new Blob([layouts.map((item, i) => `【第 ${i + 1} 页】\n${item.text.trim()}`).join('\n\n')], { type: 'text/plain;charset=utf-8' }) }];
          report = { text: '文字来自本地 OCR，请核对姓名、数字和标点。' };
        } else entries = scanned;
      }
      outputs = unique(entries).map(entry => ({ ...entry, url: URL.createObjectURL(entry.blob) }));
      if (outputs.length > 1) {
        const packed = await pdfJob.run('zip', outputs.map(item => new File([item.blob], item.name)), {}, progress); signal.throwIfAborted();
        zipUrl = URL.createObjectURL(new Blob([packed.bytes], { type: 'application/zip' }));
      }
      signal.throwIfAborted(); controller = null; state.phase = 'result'; render(); toast('处理完成，文件已生成在本机。');
    } catch (error) { fail(error, signal); }
  }
  async function inspectSelected(action) {
    if (busy() || !current()) return;
    const item = current(), signal = begin('reading'), rotation = action === 'rotate' ? (item.rotation + 1) % 4 : item.rotation;
    clearPreview();
    try {
      const { entries: [result] } = await imageJob.run('inspect', [item.file], { rotation, detect: action === 'detect' }, progress); signal.throwIfAborted();
      URL.revokeObjectURL(item.url); item.url = URL.createObjectURL(result.preview); item.width = result.width; item.height = result.height; item.rotation = rotation;
      if (action === 'rotate') item.corners = ImageEngine.fullCorners();
      else if (result.corners) { item.corners = result.corners; feedback = '已尝试定位纸张，请检查四角，必要时手动调整。'; }
      else feedback = '未找到清晰的纸张边缘，请手动拖动四角，或输入坐标。';
      complete(signal);
    } catch (error) { fail(error, signal); }
  }
  function render() {
    if (!mounted) return;
    state.files = files;
    main.querySelector('#file-count').textContent = `${files.length} 张`;
    main.querySelector('#selected-count').textContent = `${files.length} 张`;
    main.querySelector('#run-button').disabled = busy() || !files.length;
    main.querySelectorAll('.image-settings input,.image-settings select,.image-settings button,[data-im="clear"]').forEach(node => node.disabled = busy() || (['preview', 'run'].includes(node.dataset.im) && !files.length));
    main.querySelector('#file-feedback').textContent = feedback;
    const area = main.querySelector('#image-content');
    if (busy()) {
      area.innerHTML = `<div class="progress-area"><h2>正在本地处理</h2><p id="progress-label" role="status">准备图片…</p><div class="progress-track" role="progressbar" aria-label="处理进度" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill"></div></div><button class="secondary" data-im="cancel">取消处理</button></div>`; return;
    }
    if (!files.length) {
      area.innerHTML = `<div class="drop-zone"><button class="primary" data-im="choose">${icon('upload')}选择图片</button>${scanning() ? '<button class="text-button scan-camera" data-im="camera">使用手机拍照</button>' : ''}<p>点击选择或拖入多张 JPG、PNG、WebP 图片</p><span class="drop-local">文件在本机处理，不上传服务器</span></div><p class="sample-line">暂时没有图片？<button data-im="sample">使用示例图片</button></p>`; return;
    }
    if (state.phase === 'result') { area.innerHTML = results(); return; }
    area.innerHTML = `<div class="image-page-list" aria-label="图片顺序">${files.map((item, i) => `<div class="image-page-item ${i === selected ? 'is-selected' : ''}"><button data-im="select" data-index="${i}" aria-pressed="${i === selected}" title="${escapeHTML(item.name)}"><img src="${item.url}" alt="第 ${i + 1} 张图片"><span>${i + 1}. ${escapeHTML(item.name)}</span></button><div class="image-page-actions"><button data-im="move" data-index="${i}" data-direction="-1" aria-label="前移第 ${i + 1} 张" ${i === 0 ? 'disabled' : ''}>${icon('back')}</button><button data-im="move" data-index="${i}" data-direction="1" aria-label="后移第 ${i + 1} 张" ${i === files.length - 1 ? 'disabled' : ''}>${icon('arrow')}</button><button data-im="remove" data-index="${i}" aria-label="移除第 ${i + 1} 张">${icon('trash')}</button></div></div>`).join('')}<button class="image-add" data-im="choose">${icon('plus')}添加图片</button></div>
      <div class="image-current-title"><strong>${escapeHTML(current().name)}</strong><span>${current().width} × ${current().height} · ${size(current().file.size)}</span></div>${scanning() ? scanEditor() : `<div class="image-comparison"><figure><figcaption>原图</figcaption><img src="${current().url}" alt="当前原图"></figure><figure><figcaption>处理预览</figcaption>${previewUrl ? `<img src="${previewUrl}" alt="压缩转换后的图片"><p>${escapeHTML(previewNote)}</p>` : '<p class="image-preview-empty">调整右侧设置后，点击“预览当前图片”。</p>'}</figure></div>`}`;
  }
  function scanEditor() {
    const item = current();
    return `<div class="scan-toolbar"><button class="secondary" data-im="detect">${icon('scan')}尝试自动找边</button><button class="secondary" data-im="rotate">${icon('rotate')}旋转 90°</button><button class="secondary" data-im="full">使用整张图</button></div>
      <p class="scan-guidance">拖动四角框选纸张；也可先选一个角再点击图片定位。角点支持方向键微调。</p>
      <div class="scan-editor"><figure><figcaption>原图 · 调整纸张四角</figcaption><div class="scan-stage" style="aspect-ratio:${item.width}/${item.height}"><img src="${item.url}" alt="待拉正的纸张照片" draggable="false"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${item.corners.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}"></polygon></svg>${item.corners.map((p, i) => `<button class="scan-corner ${i === activeCorner ? 'is-active' : ''}" data-corner="${i}" style="left:${p.x * 100}%;top:${p.y * 100}%" aria-label="${cornerNames[i]}角，使用方向键微调">${i + 1}</button>`).join('')}</div></figure><figure><figcaption>拉正与增强预览</figcaption>${previewUrl ? `<img class="scan-result-preview" src="${previewUrl}" alt="拉正增强后的扫描页"><p class="image-hint">${escapeHTML(previewNote)}</p>` : '<p class="image-preview-empty">框选后点击“预览当前页效果”，核对文字与裁剪范围。</p>'}</figure></div>
      <details class="scan-coordinates"><summary>精确调整四角（百分比）</summary><div class="scan-coordinate-grid">${item.corners.map((p, i) => `<fieldset><legend>${i + 1}. ${cornerNames[i]}</legend><label>横向 X<input type="number" min="0" max="100" step="0.1" data-point="${i}" data-axis="x" value="${(p.x * 100).toFixed(1)}"></label><label>纵向 Y<input type="number" min="0" max="100" step="0.1" data-point="${i}" data-axis="y" value="${(p.y * 100).toFixed(1)}"></label></fieldset>`).join('')}</div></details>`;
  }
  function results() {
    return `<div class="result-panel"><div class="result-icon">${icon('check')}</div><h2>处理完成</h2><p>生成 ${outputs.length} 个文件，原图未修改。</p>${zipUrl ? `<a class="primary" href="${zipUrl}" download="处理后的图片.zip">${icon('download')}打包下载 ZIP</a>` : ''}<button class="secondary" data-im="back">返回调整</button></div>${report ? `<div class="scan-report">${report.text ? escapeHTML(report.text) : `已加入 ${report.characters} 个 OCR 文字字符。${report.lowConfidence ? `有 ${report.lowConfidence} 行置信度偏低，请重点核对。` : ''}${report.skippedCharacters ? `${report.skippedCharacters} 个字体不支持的字符未加入文字层，原图仍保留。` : ''}文字识别可能有错字；图像外观保持扫描结果。${report.characters ? '' : '未识别到可用文字，请检查扫描范围与清晰度。'}`}</div>` : ''}
      <div class="output-list">${outputs.map(item => {
        const delta = item.originalSize ? (1 - item.blob.size / item.originalSize) * 100 : null;
        return `<article class="image-output"><div class="output-row"><div><strong>${escapeHTML(item.name)}</strong><small>${item.width ? `${item.width} × ${item.height} · ` : ''}${size(item.blob.size)}${item.pages ? ` · ${item.pages} 页` : ''}${delta !== null ? ` · 原图 ${size(item.originalSize)} · ${delta >= 0 ? `减小 ${delta.toFixed(1)}%` : `增大 ${Math.abs(delta).toFixed(1)}%`}` : ''}${item.targetMet === false ? ' · 未达到目标大小，请进一步调整尺寸或格式' : ''}</small></div><a href="${item.url}" download="${escapeHTML(item.name)}">下载</a>${item.blob.type !== 'text/plain;charset=utf-8' ? `<a href="${item.url}" target="_blank" rel="noopener">预览</a>` : ''}</div>${item.blob.type.startsWith('image/') ? `<img class="image-output-preview" src="${item.url}" alt="${escapeHTML(item.name)} 的处理结果">` : ''}</article>`;
      }).join('')}</div>${supportPrompt()}`;
  }
  function invalidate() {
    clearPreview(); clearResults(); state.phase = 'select';
    const figure = main.querySelector('.scan-editor > figure:nth-child(2)');
    if (figure && figure.querySelector('img')) figure.innerHTML = '<figcaption>拉正与增强预览</figcaption><p class="image-preview-empty">裁剪范围已调整，请重新预览当前页效果。</p>';
  }
  function updateCorners() {
    const item = current(); if (!item) return;
    main.querySelector('.scan-stage polygon')?.setAttribute('points', item.corners.map(p => `${p.x * 100},${p.y * 100}`).join(' '));
    main.querySelectorAll('[data-corner]').forEach(node => { const i = Number(node.dataset.corner); node.style.left = `${item.corners[i].x * 100}%`; node.style.top = `${item.corners[i].y * 100}%`; node.classList.toggle('is-active', i === activeCorner); });
    main.querySelectorAll('[data-point]').forEach(node => { if (document.activeElement !== node) node.value = (item.corners[Number(node.dataset.point)][node.dataset.axis] * 100).toFixed(1); });
    try { ImageEngine.validateCorners(item.corners); feedback = ''; } catch (error) { feedback = error.message; }
    main.querySelector('#file-feedback').textContent = feedback;
  }
  function input(event) {
    if (busy()) return;
    const target = event.target;
    if (target.dataset.config) {
      config[target.dataset.config] = target.type === 'checkbox' ? target.checked : target.value;
      if (target.id === 'im-quality') main.querySelector('#quality-value').textContent = `${target.value}%`;
      if (target.id === 'scan-output') main.querySelector('#scan-language-field').hidden = !['searchable', 'txt'].includes(config.output);
      invalidate(); render();
    } else if (target.dataset.point !== undefined && current()) {
      if (!Number.isFinite(target.valueAsNumber) || target.valueAsNumber < 0 || target.valueAsNumber > 100) { feedback = '四角坐标需为 0–100 之间的数字。'; main.querySelector('#file-feedback').textContent = feedback; return; }
      current().corners[Number(target.dataset.point)][target.dataset.axis] = target.valueAsNumber / 100;
      invalidate(); updateCorners();
    }
  }
  function pointerDown(event) {
    if (busy() || !scanning() || !current() || event.button !== 0) return;
    const stage = event.target.closest('.scan-stage'); if (!stage) return;
    const handle = event.target.closest('[data-corner]');
    if (handle) { activeCorner = Number(handle.dataset.corner); handle.focus({ preventScroll: true }); }
    dragging = { pointerId: event.pointerId, rect: stage.getBoundingClientRect() }; main.setPointerCapture(event.pointerId);
    event.preventDefault(); pointerMove(event);
  }
  function pointerMove(event) {
    if (!dragging || dragging.pointerId !== event.pointerId || !current()) return;
    const rect = dragging.rect;
    current().corners[activeCorner] = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    invalidate(); updateCorners();
  }
  function keydown(event) {
    const handle = event.target.closest('[data-corner]'); if (!handle || busy() || !current()) return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]; if (!delta) return;
    event.preventDefault(); activeCorner = Number(handle.dataset.corner); const p = current().corners[activeCorner], step = event.shiftKey ? .02 : .002;
    p.x = Math.max(0, Math.min(1, p.x + delta[0] * step)); p.y = Math.max(0, Math.min(1, p.y + delta[1] * step)); invalidate(); updateCorners();
  }
  function click(event) {
    const button = event.target.closest('[data-im]'); if (!button) return;
    const action = button.dataset.im;
    if (action === 'cancel') { controller?.abort(); imageJob.cancel(); pdfJob.cancel(); ocrJob.cancel(); controller = null; clearResults(); state.phase = 'select'; render(); return; }
    if (busy()) return;
    if (action === 'choose' || action === 'camera') main.querySelector(action === 'camera' ? '#camera-input' : '#file-input').click();
    if (action === 'sample') void sample();
    if (action === 'run') void run();
    if (action === 'preview') void processPreview();
    if (action === 'rotate' || action === 'detect') void inspectSelected(action);
    if (action === 'back') { clearResults(); state.phase = 'select'; render(); }
    if (action === 'full' && current()) { current().corners = ImageEngine.fullCorners(); invalidate(); render(); }
    if (action === 'clear') { files.forEach(item => URL.revokeObjectURL(item.url)); files = []; selected = 0; feedback = ''; invalidate(); render(); }
    if (action === 'select') { selected = Number(button.dataset.index); invalidate(); render(); }
    if (action === 'remove') { const [removed] = files.splice(Number(button.dataset.index), 1); URL.revokeObjectURL(removed.url); selected = Math.min(selected, Math.max(0, files.length - 1)); invalidate(); render(); }
    if (action === 'move') {
      const item = current(), from = Number(button.dataset.index), to = from + Number(button.dataset.direction);
      if (to < 0 || to >= files.length) return;
      [files[from], files[to]] = [files[to], files[from]]; selected = files.indexOf(item); invalidate(); render();
    }
  }
  return { mount, reset };
})();
