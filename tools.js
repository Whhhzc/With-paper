/* Local implementations for page editing, images, OCR and batch file operations. */
const Tools = (() => {
  const pdfJob = new LocalJob(window.pdfWorkerSource);
  const ocrJob = new LocalJob(window.ocrWorkerSource);
  let operation = null;
  let outputs = [];
  let zipUrl = null;
  let previewUrls = [];
  let thumbnails = [];
  let pageOrder = [];
  let recognition = null;
  const id = () => state.tool.id;
  const single = () => ['split', 'rotate', 'delete', 'sort', 'remove-watermark'].includes(id());
  const imageInput = () => ['image-pdf', 'ocr-image'].includes(id());
  const pageTool = () => ['split', 'rotate', 'delete', 'sort'].includes(id());
  const busy = () => ['reading', 'processing'].includes(state.phase);
  const sizeLabel = size => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  const cleanName = value => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  const field = (label, content, hint = '') => `<label class="field"><span>${label}</span>${content}${hint ? `<small>${hint}</small>` : ''}</label>`;
  const rangeField = (hint = '留空处理全部页面，例如 1-3,5。') => field('页面范围', '<input id="pages-range" placeholder="例如：1-3,5">', hint);
  const outputField = () => field('输出文件名', '<input id="tool-output-name" placeholder="留空使用原文件名">', '多个结果会分别命名，并提供 ZIP 打包下载。');
  const value = selector => document.querySelector(selector)?.value || '';

  function settings() {
    switch (id()) {
      case 'split': return field('拆分方式', '<select id="split-mode"><option value="range">提取选中页面为一份 PDF</option><option value="each">每页拆成独立 PDF</option></select>') + rangeField() + outputField();
      case 'rotate': return field('旋转方向', '<select id="rotate-angle"><option value="90">顺时针 90°</option><option value="270">逆时针 90°</option><option value="180">旋转 180°</option></select>') + rangeField() + outputField();
      case 'delete': return rangeField('输入或勾选需要删除的页面，至少保留一页。') + outputField();
      case 'sort': return field('页面顺序', '<input id="pages-range" placeholder="例如：3,1,2">', '拖动页面或点击箭头；也可输入顺序，需包含全部页面。') + outputField();
      case 'watermark': case 'batch-watermark': return field('水印文字', '<input id="watermark-text" value="仅供内部使用" maxlength="80">') + field('位置', '<select id="watermark-position"><option value="center">页面居中</option><option value="corner">右下角</option></select>') + field('透明度', '<select id="watermark-opacity"><option value="0.2">20%</option><option value="0.35" selected>35%</option><option value="0.5">50%</option><option value="0.8">80%</option></select>') + field('倾斜角度', '<select id="watermark-angle"><option value="35">倾斜 35°</option><option value="0">水平</option></select>') + rangeField() + outputField();
      case 'remove-watermark': return '<p class="settings-description">选择左侧识别出的独立水印，点击“预览去除效果”核对前后变化后下载。</p><p class="settings-description">支持标准 Watermark 批注和本工具写入的独立水印。图片内及未明确标记的水印不会猜测删除。</p>' + outputField();
      case 'image-pdf': return field('输出方式', '<select id="image-mode"><option value="combined">所有图片合成一份 PDF</option><option value="each">每张图片生成独立 PDF</option></select>') + field('页面尺寸', '<select id="image-page-size"><option value="a4">A4（自动横向 / 纵向）</option><option value="fit">适应图片大小</option></select>') + outputField();
      case 'pdf-image': return field('图片格式', '<select id="image-format"><option value="png">PNG</option><option value="jpg">JPG</option></select>') + field('清晰度', '<select id="render-scale"><option value="1">标准 · 72 DPI</option><option value="2" selected>清晰 · 144 DPI</option><option value="3">高清 · 216 DPI</option></select>') + rangeField();
      case 'pdf-word': return rangeField() + field('扫描与图片文字', '<select id="word-ocr"><option value="auto">自动识别扫描页</option><option value="all">同时识别图片内文字（较慢）</option></select>', '原生文字直接提取；图文混合页可选择同时识别图片文字。') + field('识别语言', '<select id="ocr-language"><option value="chi_sim+eng">简体中文 + 英文</option><option value="chi_sim">简体中文</option><option value="eng">英文</option></select>') + field('输出文件名', '<input id="tool-output-name" placeholder="留空使用原文件名">', '导出 .docx；多份文件可打包下载。') + '<p class="settings-description">尽量保留页面尺寸、文字位置、字号和图形。文字以定位文本框编辑，不自动重排；表格边框和插图保留为图片，原字体缺失时可能替换。</p>';
      case 'ocr-image': case 'ocr-pdf': return field('识别语言', '<select id="ocr-language"><option value="chi_sim+eng">简体中文 + 英文</option><option value="chi_sim">简体中文</option><option value="eng">英文</option></select>', '首次使用从本站加载本地模型；文件不会上传。') + (id() === 'ocr-pdf' ? rangeField() : '') + '<p class="settings-description">识别完成后请核对文字，可编辑、复制或下载 TXT。</p>';
      case 'rename': return field('文件名前缀', '<input id="rename-prefix" value="办公资料" maxlength="100">') + field('起始序号', '<input id="rename-start" type="number" min="1" step="1" value="1">') + field('序号位数', '<select id="rename-digits"><option value="3">3 位（001）</option><option value="2">2 位（01）</option><option value="4">4 位（0001）</option></select>') + '<p class="settings-description">保留原扩展名与文件内容，生成重命名副本并打包下载。</p>';
    }
  }

  function cancel() { operation?.abort(); operation = null; pdfJob.cancel(); ocrJob.cancel(); }
  function clearOutputs() {
    outputs.forEach(output => URL.revokeObjectURL(output.url)); outputs = [];
    if (zipUrl) URL.revokeObjectURL(zipUrl); zipUrl = null; recognition = null;
  }
  function clearPreviews() { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; thumbnails = []; }
  function clearFiles() { state.files.forEach(file => URL.revokeObjectURL(file.url)); state.files = []; clearPreviews(); pageOrder = []; }
  function reset() { cancel(); clearOutputs(); clearPreviews(); if (state.tool && state.tool.id !== 'merge') clearFiles(); }
  function begin(phase) { cancel(); clearOutputs(); operation = new AbortController(); state.phase = phase; state.feedback = ''; render(); return operation.signal; }
  function progress({ done = 0, total = 1, label }) {
    const target = document.querySelector('#progress-label');
    if (!target) return;
    target.textContent = label;
    const bar = document.querySelector('[role="progressbar"]');
    const percent = Math.min(100, Math.round(done / total * 100));
    bar.setAttribute('aria-valuenow', percent); bar.querySelector('.progress-fill').style.width = `${percent}%`;
  }
  function failure(error, signal) {
    if (signal?.aborted || error.name === 'AbortError') return;
    state.phase = 'select'; state.feedback = error.message || '无法处理这个文件。'; render();
  }
  function entry(file, details = {}, sample = false) { return { file, name: file.name, size: sizeLabel(file.size), url: URL.createObjectURL(file), sample, ...details }; }
  function setup() {
    document.querySelector('#file-input').multiple = !single();
    document.querySelector('.settings-panel').addEventListener('input', event => {
      if (busy()) return;
      const wasResult = state.phase === 'result';
      if (wasResult) { clearOutputs(); state.phase = 'select'; }
      if (id() === 'rename') state.feedback = '';
      if (id() === 'rename' || wasResult) render();
      if (event.target.id === 'pages-range') {
        updateChecks();
        if (id() === 'sort' && state.files.length) {
          try { const numbers = selectedRange(state.files[0].pages); if (numbers.length === state.files[0].pages) { pageOrder = numbers; render(); } }
          catch { /* Validation is displayed when the user submits the range. */ }
        }
      }
    });
    document.querySelector('.settings-panel').addEventListener('change', () => {
      if (!busy() && state.phase === 'result') { clearOutputs(); state.phase = 'select'; render(); }
    });
  }

  async function pagePreviews(signal) {
    clearPreviews();
    if (!state.files.length || (!pageTool() && id() !== 'remove-watermark')) return;
    const item = state.files[0];
    pageOrder = Array.from({ length: item.pages }, (_, index) => index + 1);
    if (id() === 'sort') document.querySelector('#pages-range').value = pageOrder.join(',');
    const pdfDocument = await Media.pdf(item.file);
    try {
      const pages = pageTool() ? Array.from({ length: item.pages }, (_, i) => i + 1) : [...new Set(item.watermarks.map(mark => mark.page))];
      for (const number of pages) {
        signal.throwIfAborted();
        progress({ done: thumbnails.length, total: pages.length, label: `正在生成第 ${number} 页预览…` });
        const canvas = await Media.page(pdfDocument, number, .28, signal);
        const url = URL.createObjectURL(await Media.blob(canvas)); canvas.width = canvas.height = 0;
        signal.throwIfAborted(); previewUrls.push(url); thumbnails.push({ number, url });
      }
    } finally { await pdfDocument.destroy(); }
  }

  async function addFiles(list, sample = false) {
    if (busy()) return;
    let files = Array.from(list);
    if (single() && files.length > 1) { state.feedback = '这个工具一次处理一份 PDF，请只选择一个文件。'; render(); return; }
    const allowed = id() === 'rename' ? null : imageInput() ? /\.(png|jpe?g|webp)$/i : /\.pdf$/i;
    const rejected = files.filter(file => allowed && !allowed.test(file.name)).map(file => `“${file.name}”格式不支持。`);
    files = files.filter(file => !allowed || allowed.test(file.name));
    if (!files.length) { state.feedback = rejected.join('\n'); render(); return; }
    const signal = begin('reading');
    try {
      const accepted = [];
      if (imageInput()) {
        for (let i = 0; i < files.length; i++) {
          try { const image = await createImageBitmap(files[i]); accepted.push({ file: files[i], width: image.width, height: image.height }); image.close(); }
          catch { rejected.push(`无法读取图片“${files[i].name}”，文件可能损坏。`); }
          signal.throwIfAborted();
        }
      } else if (id() === 'rename') files.forEach(file => accepted.push({ file }));
      else {
        const { entries } = await pdfJob.run('inspect', files, {}, progress);
        signal.throwIfAborted();
        entries.forEach(item => item.error ? rejected.push(item.error) : accepted.push({ file: files[item.index], pages: item.pages, watermarks: item.watermarks }));
      }
      if (accepted.length) {
        if (single() || state.files.some(item => item.sample)) clearFiles();
        accepted.forEach(({ file, ...details }) => state.files.push(entry(file, details, sample)));
        await pagePreviews(signal);
      }
      signal.throwIfAborted(); state.phase = 'select'; state.feedback = rejected.join('\n'); render();
    } catch (error) { failure(error, signal); }
  }

  async function samples() {
    if (busy()) return;
    const signal = begin('reading');
    try {
      let files;
      if (imageInput() || id() === 'rename') files = [await Media.sampleImage()];
      else {
        const { entries } = await pdfJob.run('samples', [], {}, progress);
        signal.throwIfAborted();
        files = (single() ? entries.slice(0, 1) : entries).map(item => new File([item.bytes], item.name, { type: 'application/pdf' }));
        if (id() === 'ocr-pdf') {
          const image = await Media.sampleImage();
          const converted = await pdfJob.run('imagesToPdf', [{ name: image.name, bytes: new Uint8Array(await image.arrayBuffer()) }], { pageSize: 'a4' }, progress);
          files = [new File([converted.entries[0].bytes], '扫描会议记录.pdf', { type: 'application/pdf' })];
        }
        if (id() === 'remove-watermark') {
          const image = await Media.watermark('示例水印'); signal.throwIfAborted();
          const edited = await pdfJob.run('edit', files, { action: 'watermark', text: '示例水印', image, opacity: .35, angle: 35, position: 'center' }, progress);
          files = [new File([edited.entries[0].bytes], '水印示例.pdf', { type: 'application/pdf' })];
        }
      }
      signal.throwIfAborted(); state.phase = 'select'; clearFiles(); await addFiles(files, true);
    } catch (error) { failure(error, signal); }
  }

  function selectedRange(total) {
    const text = value('#pages-range').trim().replace(/[，、]/g, ',').replace(/[–—]/g, '-');
    if (!text) return id() === 'delete' ? [] : Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    for (const part of text.split(',')) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error('页面范围格式错误，请使用 1-3,5 这样的格式。');
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (start < 1 || end > total || start > end) throw new Error(`页面范围超出 1-${total} 页或顺序错误。`);
      for (let number = start; number <= end; number++) {
        if (pages.includes(number)) throw new Error(`第 ${number} 页重复。`);
        pages.push(number);
      }
    }
    return pages;
  }
  function updateChecks() {
    try {
      const numbers = selectedRange(state.files[0]?.pages || 0);
      document.querySelectorAll('[data-page-check]').forEach(input => input.checked = numbers.includes(Number(input.dataset.pageCheck)));
      document.querySelector('#run-button').disabled = !numbers.length;
    } catch { document.querySelector('#run-button').disabled = !state.files.length; }
  }
  function renamed() {
    const prefix = cleanName(value('#rename-prefix').trim());
    const start = Number(value('#rename-start'));
    if (!prefix) throw new Error('请输入文件名前缀。');
    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(start + state.files.length)) throw new Error('起始序号必须是有效的正整数。');
    const digits = Number(value('#rename-digits'));
    return state.files.map((item, index) => {
      const extension = item.name.match(/\.[^.]+$/)?.[0] || '';
      return `${prefix}_${String(start + index).padStart(digits, '0')}${extension}`;
    });
  }
  function uniqueEntries(entries) {
    const seen = new Set();
    return entries.map(item => {
      let name = cleanName(item.name); const original = name; let duplicate = 2;
      while (seen.has(name.toLowerCase())) { const dot = original.lastIndexOf('.'); name = dot > 0 ? `${original.slice(0, dot)} (${duplicate++})${original.slice(dot)}` : `${original} (${duplicate++})`; }
      seen.add(name.toLowerCase()); return { ...item, name };
    });
  }
  async function packageOutputs(entries, signal) {
    const custom = value('#tool-output-name').trim();
    if (entries.length === 1 && custom) {
      const extension=id()==='pdf-word'?'docx':'pdf';
      entries[0].name = `${cleanName(custom.replace(id()==='pdf-word'?/\.(?:docx|pdf)$/i:/\.pdf$/i, ''))}.${extension}`;
    }
    outputs = uniqueEntries(entries).map(item => ({ ...item, url: URL.createObjectURL(item.blob) }));
    if (outputs.length > 1 || id() === 'rename') {
      const files = outputs.map(item => new File([item.blob], item.name));
      const packed = await pdfJob.run('zip', files, {}, progress); signal.throwIfAborted();
      zipUrl = URL.createObjectURL(new Blob([packed.bytes], { type: 'application/zip' }));
    }
  }

  async function run() {
    if (busy() || !state.files.length) return;
    const tool = id();
    const options = { action: tool, range: value('#pages-range'), mode: value('#split-mode'), angle: Number(value('#rotate-angle')), selected: [...document.querySelectorAll('[data-watermark]:checked')].map(input => input.dataset.watermark) };
    const signal = begin('processing');
    try {
      let entries = [];
      if (['split', 'rotate', 'delete', 'sort', 'watermark', 'batch-watermark', 'remove-watermark'].includes(tool)) {
        if (tool.includes('watermark') && tool !== 'remove-watermark') {
          options.text = value('#watermark-text').trim(); if (!options.text) throw new Error('请输入水印文字。');
          options.image = await Media.watermark(options.text); signal.throwIfAborted();
          options.opacity = Number(value('#watermark-opacity')); options.angle = Number(value('#watermark-angle')); options.position = value('#watermark-position');
        }
        const edited = await pdfJob.run('edit', state.files.map(item => item.file), options, progress);
        signal.throwIfAborted(); entries = edited.entries.map(item => ({ name: item.name, pages: item.pages, blob: new Blob([item.bytes], { type: 'application/pdf' }) }));
      } else if (tool === 'image-pdf') {
        const images = [];
        for (const item of state.files) {
          const canvas = await Media.image(item.file, signal);
          const bytes = new Uint8Array(await (await Media.blob(canvas)).arrayBuffer()); canvas.width = canvas.height = 0;
          signal.throwIfAborted(); images.push({ name: item.name, bytes });
        }
        const result = await pdfJob.run('imagesToPdf', images, { mode: value('#image-mode'), pageSize: value('#image-page-size') }, progress);
        signal.throwIfAborted(); entries = result.entries.map(item => ({ name: item.name, pages: item.pages, blob: new Blob([item.bytes], { type: 'application/pdf' }) }));
      } else if (tool === 'pdf-image') {
        const format = value('#image-format'); const scale = Number(value('#render-scale'));
        for (const item of state.files) {
          const document = await Media.pdf(item.file);
          try {
            for (const number of selectedRange(item.pages)) {
              progress({ label: `正在导出 ${item.name} 第 ${number} 页`, done: number - 1, total: item.pages });
              const canvas = await Media.page(document, number, scale, signal);
              const blob = await Media.blob(canvas, format === 'jpg' ? 'image/jpeg' : 'image/png'); canvas.width = canvas.height = 0; signal.throwIfAborted();
              entries.push({ name: `${item.name.replace(/\.pdf$/i, '')}_第${number}页.${format}`, blob });
            }
          } finally { await document.destroy(); }
        }
      } else if (tool === 'pdf-word') {
        for(const item of state.files){
          const result=await WordConverter.convert(item.file,{pages:selectedRange(item.pages),ocr:value('#word-ocr'),language:value('#ocr-language')},signal,progress,ocrJob,pdfJob);
          signal.throwIfAborted();entries.push(result);
        }
      } else if (tool === 'rename') {
        const names = renamed(); entries = state.files.map((item, index) => ({ name: names[index], blob: item.file }));
      } else if (tool.startsWith('ocr-')) {
        if (location.protocol === 'file:') throw new Error('文字识别需通过网站或本地预览地址打开，以加载本机模型；文件仍只在浏览器处理。请访问 http://127.0.0.1:4186。');
        const images = [];
        for (const item of state.files) {
          if (tool === 'ocr-image') {
            const canvas = await Media.image(item.file, signal); const blob = await Media.blob(canvas); canvas.width = canvas.height = 0;
            signal.throwIfAborted(); images.push(new File([blob], item.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' }));
          } else {
            const document = await Media.pdf(item.file);
            try {
              for (const number of selectedRange(item.pages)) {
                progress({ label: `准备识别 ${item.name} 第 ${number} 页`, done: number - 1, total: item.pages });
                const canvas = await Media.page(document, number, 2, signal); const blob = await Media.blob(canvas); canvas.width = canvas.height = 0;
                signal.throwIfAborted(); images.push(new File([blob], `${item.name.replace(/\.pdf$/i, '')}_第${number}页.png`, { type: 'image/png' }));
              }
            } finally { await document.destroy(); }
          }
        }
        const result = await ocrJob.run('recognize', images, { language: value('#ocr-language'), base: new URL('vendor/ocr/', location.href).href }, progress);
        signal.throwIfAborted();
        const url = URL.createObjectURL(images[0]); previewUrls.push(url);
        recognition = { source: url, count: images.length, text: result.entries.map(item => images.length > 1 ? `【${item.name}】\n${item.text.trim()}` : item.text.trim()).join('\n\n'), confidence: Math.round(result.entries.reduce((sum, item) => sum + item.confidence, 0) / result.entries.length) };
        entries = result.entries.map(item => ({ name: item.name.replace(/\.[^.]+$/, '.txt'), blob: new Blob([item.text], { type: 'text/plain;charset=utf-8' }) }));
      }
      await packageOutputs(entries, signal); signal.throwIfAborted();
      state.phase = 'result'; render();
      if (tool === 'remove-watermark') await comparison(options.selected, signal);
      signal.throwIfAborted(); toast('处理完成，结果已生成在本机。');
    } catch (error) {
      if (!signal.aborted) clearOutputs();
      failure(error, signal);
    }
  }

  async function comparison(selected, signal) {
    const number = state.files[0].watermarks.find(mark => selected.includes(mark.id)).page;
    const sources = [state.files[0].file, outputs[0].blob];
    for (let index = 0; index < sources.length; index++) {
      const document = await Media.pdf(sources[index]);
      try {
        const canvas = await Media.page(document, number, .7, signal); const url = URL.createObjectURL(await Media.blob(canvas)); canvas.width = canvas.height = 0;
        signal.throwIfAborted(); previewUrls.push(url);
        window.document.querySelector(`#comparison-${index}`).src = url;
      } finally { await document.destroy(); }
    }
  }

  function render() {
    const processing = busy(); const count = state.files.length;
    document.querySelector('.workspace-grid').classList.toggle('is-empty', !count && !processing);
    document.querySelector('#file-count').textContent = `${count} 个文件`;
    document.querySelector('#selected-count').textContent = `${count} 个`;
    document.querySelector('#run-button').disabled = !count || processing;
    document.querySelector('[data-action="clear"]').disabled = processing;
    document.querySelectorAll('.settings-panel input,.settings-panel select').forEach(input => input.disabled = processing);
    document.querySelector('#file-feedback').textContent = state.feedback;
    const area = document.querySelector('#file-content');
    animateFileState(area);
    if (processing) { area.innerHTML = '<div class="progress-area"><h2>正在本地处理</h2><p id="progress-label" role="status">准备文件…</p><div class="progress-track" role="progressbar" aria-label="处理进度" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill"></div></div><button class="text-button cancel-processing" data-action="cancel">取消处理</button></div>'; return; }
    if (state.phase === 'result') { renderResults(area); return; }
    if (!count) { area.innerHTML = `<div class="drop-zone"><button class="primary" data-action="choose">${icon('upload')}选择${imageInput() ? '图片' : id() === 'rename' ? '文件' : 'PDF 文件'}</button><p>点击选择或拖入文件${single() ? '，一次处理一份 PDF' : '，支持多个文件'}</p><span class="drop-local">文件只在本机处理，不上传服务器</span></div><p class="sample-line">暂时没有文件？<button data-action="samples">使用示例文件体验</button></p>`; return; }
    if (pageTool() && thumbnails.length === state.files[0].pages) {
      area.innerHTML = `<div class="page-toolbar"><span>${escapeHTML(state.files[0].name)} · ${state.files[0].pages} 页</span>${id() !== 'sort' ? '<button class="text-button" data-action="all-pages">全选页面</button><button class="text-button" data-action="no-pages">清除选择</button>' : ''}</div><div class="page-grid">${pageOrder.map((number, index) => `<article class="page-tile" ${id() === 'sort' ? `draggable="true" data-page-index="${index}"` : ''}><img src="${thumbnails.find(item => item.number === number)?.url}" alt="第 ${number} 页预览"><div class="page-controls">${id() === 'sort' ? `<span>第 ${number} 页</span><button class="icon-button" data-page-move="${index}" data-direction="-1" aria-label="前移第 ${number} 页" ${index === 0 ? 'disabled' : ''}>${icon('back')}</button><button class="icon-button" data-page-move="${index}" data-direction="1" aria-label="后移第 ${number} 页" ${index === pageOrder.length - 1 ? 'disabled' : ''}>${icon('arrow')}</button>` : `<label><input type="checkbox" data-page-check="${number}">第 ${number} 页${id() === 'delete' ? ' · 删除' : ''}</label>`}</div></article>`).join('')}</div>`;
      updateChecks(); bindPages(area); return;
    }
    if (id() === 'remove-watermark') {
      const marks = state.files[0].watermarks;
      area.innerHTML = `<div class="watermark-candidates"><p>${marks.length ? `识别到 ${marks.length} 个独立水印，请勾选需要移除的项目。` : '未找到可安全识别的独立水印。图片内、已合并到正文或未标记的水印暂不支持。'}</p>${marks.map(mark => `<label class="candidate-row"><input type="checkbox" data-watermark="${mark.id}"><span>第 ${mark.page} 页 · ${escapeHTML(mark.label)}<small>${mark.type}</small></span></label>`).join('')}</div><div class="page-grid">${thumbnails.map(item => `<figure class="page-tile"><img src="${item.url}" alt="第 ${item.number} 页原始预览"><figcaption>第 ${item.number} 页 · 原文件</figcaption></figure>`).join('')}</div>`;
      document.querySelector('#run-button').disabled = !marks.length; return;
    }
    if (id() === 'rename') {
      let names; try { names = renamed(); } catch (error) { state.feedback = error.message; names = state.files.map(() => '请填写有效的命名规则'); document.querySelector('#file-feedback').textContent = state.feedback; }
      area.innerHTML = `<div class="rename-list"><div class="rename-head"><span>原文件名</span><span>新文件名</span></div>${state.files.map((item, index) => `<div class="rename-row"><span>${escapeHTML(item.name)}</span><strong>${escapeHTML(names[index])}</strong><button class="icon-button" data-remove="${index}" aria-label="移除 ${escapeHTML(item.name)}">${icon('trash')}</button></div>`).join('')}<button class="secondary" data-action="choose">继续添加文件</button></div>`; return;
    }
    area.innerHTML = `<div class="file-grid">${state.files.map((item, index) => `<article class="file-tile" draggable="true" data-index="${index}"><a class="pdf-file-cover" href="${item.url}" target="_blank" rel="noopener">${imageInput() ? `<img class="image-file-preview" src="${item.url}" alt="${escapeHTML(item.name)}">` : `<span class="pdf-document-mark">PDF</span><strong>${item.pages} 页</strong><span>查看原文件</span>`}</a><p class="file-name" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</p><p class="file-meta">${item.size}${item.sample ? ' · 示例' : ''}</p><div class="tile-actions"><div><button class="icon-button" data-move="${index}" data-direction="-1" aria-label="前移 ${escapeHTML(item.name)}" ${index === 0 ? 'disabled' : ''}>${icon('back')}</button><button class="icon-button" data-move="${index}" data-direction="1" aria-label="后移 ${escapeHTML(item.name)}" ${index === count - 1 ? 'disabled' : ''}>${icon('arrow')}</button></div><button class="icon-button" data-remove="${index}" aria-label="移除 ${escapeHTML(item.name)}">${icon('trash')}</button></div></article>`).join('')}<button class="add-tile" data-action="choose">${icon('plus')}继续添加文件</button></div>`;
    area.querySelectorAll('.file-tile').forEach(tile => {
      tile.addEventListener('dragstart', event => event.dataTransfer.setData('application/x-office-file', tile.dataset.index));
      tile.addEventListener('drop', event => {
        const from = event.dataTransfer.getData('application/x-office-file'); if (from === '' || Number(from) >= count) return;
        event.preventDefault(); event.stopPropagation(); const [file] = state.files.splice(Number(from), 1); state.files.splice(Number(tile.dataset.index), 0, file); render();
      });
    });
  }

  function bindPages(area) {
    area.querySelectorAll('[data-page-check]').forEach(input => input.addEventListener('change', () => {
      const numbers = [...area.querySelectorAll('[data-page-check]:checked')].map(item => item.dataset.pageCheck);
      document.querySelector('#pages-range').value = numbers.join(',');
      // Blank normally means all pages. Explicitly disable processing for a cleared selection.
      document.querySelector('#run-button').disabled = !numbers.length;
    }));
    area.querySelectorAll('[data-page-index]').forEach(tile => {
      tile.addEventListener('dragstart', event => event.dataTransfer.setData('application/x-office-page', tile.dataset.pageIndex));
      tile.addEventListener('drop', event => { const from = event.dataTransfer.getData('application/x-office-page'); if (from === '' || Number(from) >= pageOrder.length) return; event.preventDefault(); event.stopPropagation(); movePage(Number(from), Number(tile.dataset.pageIndex)); });
    });
  }
  function movePage(from, to) { const [number] = pageOrder.splice(from, 1); pageOrder.splice(to, 0, number); document.querySelector('#pages-range').value = pageOrder.join(','); render(); }
  function renderResults(area) {
    if (recognition) {
      area.innerHTML = `<div class="ocr-columns"><div class="ocr-original"><span class="ocr-original-label">原始图片${recognition.count > 1 ? ' · 首个识别页面' : ''}</span><img class="ocr-source-image" src="${recognition.source}" alt="识别原图"></div><div class="ocr-result"><label for="ocr-text">识别结果 · 可编辑 · 参考置信度 ${recognition.confidence}%</label><textarea id="ocr-text">${escapeHTML(recognition.text)}</textarea>${!recognition.text ? '<p>未识别到文字，请检查图片清晰度和识别语言。</p>' : ''}<div class="result-actions"><button class="primary" data-action="copy-text">复制文字</button><button class="secondary" data-action="save-text">下载当前 TXT</button></div></div></div>`;
    } else {
      area.innerHTML = `<div class="result-panel"><div class="result-icon">${icon('check')}</div><h2>${id() === 'remove-watermark' ? '去水印预览已生成' : '处理完成'}</h2><p>共生成 ${outputs.length} 个文件，原文件未修改。</p>${zipUrl ? `<a class="primary" href="${zipUrl}" download="${state.tool.name}.zip">${icon('download')}打包下载 ZIP</a>` : ''}</div>`;
    }
    if (id() === 'remove-watermark') area.insertAdjacentHTML('beforeend', '<div class="comparison"><figure><figcaption>处理前</figcaption><img id="comparison-0" alt="处理前页面"></figure><figure><figcaption>处理后</figcaption><img id="comparison-1" alt="去除独立水印后页面"></figure></div>');
    if (id() === 'pdf-word') area.insertAdjacentHTML('beforeend', `<div class="word-conversion-report"><h3>转换说明</h3>${outputs.map(output=>`<p><strong>${escapeHTML(output.name)}</strong>：${output.pages} 页，直接提取 ${output.report.nativePages} 页，OCR 处理 ${output.report.ocrPages} 页，共 ${output.report.characters} 个文字字符。${output.report.lowConfidence?`有 ${output.report.lowConfidence} 处识别结果置信度较低，请重点核对。`:''}</p>${output.report.warnings.map(warning=>`<p>${escapeHTML(warning)}</p>`).join('')}`).join('')}<p>文字可以在文本框内编辑；图形和表格线以图片保留。字体替换、扫描件及复杂排版可能产生差异，请用 Word 或 WPS 打开后核对。</p></div>`);
    area.insertAdjacentHTML('beforeend', `${supportPrompt()}<div class="output-list">${recognition ? `<p>原始识别文本（未包含编辑）${zipUrl ? ` · <a href="${zipUrl}" download="识别文本.zip">打包下载</a>` : ''}</p>` : ''}${outputs.map(output => `<div class="output-row"><div><strong>${escapeHTML(output.name)}</strong><small>${sizeLabel(output.blob.size)}${output.pages ? ` · ${output.pages} 页` : ''}</small></div><a href="${output.url}" download="${escapeHTML(output.name)}">下载</a>${output.blob.type.startsWith('image/') || output.blob.type === 'application/pdf' ? `<a href="${output.url}" target="_blank" rel="noopener">预览</a>` : ''}</div>`).join('')}</div><p class="sample-line"><button data-action="cancel">返回文件列表</button></p>`);
  }

  function handleClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const remove = event.target.closest('[data-remove]');
    const reorder = event.target.closest('[data-move]');
    const pageMove = event.target.closest('[data-page-move]');
    if (remove) { const [file] = state.files.splice(Number(remove.dataset.remove), 1); URL.revokeObjectURL(file.url); render(); return true; }
    if (reorder) { const from = Number(reorder.dataset.move), to = from + Number(reorder.dataset.direction); [state.files[from], state.files[to]] = [state.files[to], state.files[from]]; render(); return true; }
    if (pageMove) { movePage(Number(pageMove.dataset.pageMove), Number(pageMove.dataset.pageMove) + Number(pageMove.dataset.direction)); return true; }
    if (action === 'samples') { samples(); return true; }
    if (action === 'run') { run(); return true; }
    if (action === 'clear') { reset(); state.phase = 'select'; state.feedback = ''; render(); return true; }
    if (action === 'cancel') { cancel(); clearOutputs(); state.phase = 'select'; render(); return true; }
    if (action === 'all-pages' || action === 'no-pages') {
      const selected = action === 'all-pages';
      document.querySelectorAll('[data-page-check]').forEach(input => input.checked = selected);
      document.querySelector('#pages-range').value = selected ? thumbnails.map(item => item.number).join(',') : '';
      document.querySelector('#run-button').disabled = !selected; return true;
    }
    if (action === 'copy-text') {
      const field = document.querySelector('#ocr-text');
      navigator.clipboard.writeText(field.value).then(() => toast('已复制识别文字。')).catch(() => { field.focus(); field.select(); toast('请按 Ctrl+C 复制选中的文字。'); }); return true;
    }
    if (action === 'save-text') {
      const url = URL.createObjectURL(new Blob([document.querySelector('#ocr-text').value], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = '识别结果.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
    }
    return false;
  }
  return { settings, setup, reset, render, addFiles, handleClick };
})();
