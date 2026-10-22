/* Local PDF merge controller. */
const Merge = (() => {
  const job = new LocalJob(window.pdfWorkerSource);
  let result = null;
  const busy = () => state.phase === 'reading' || state.phase === 'processing';
  const sizeLabel = size => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

  function discardResult() {
    if (result) URL.revokeObjectURL(result.url);
    result = null;
  }

  function cancelTask() { job.cancel(); }

  function reset() {
    cancelTask();
    discardResult();
    if (state.tool?.id === 'merge') state.files.forEach(entry => URL.revokeObjectURL(entry.url));
  }

  function runTask(action, files) {
    return job.run(action, files, {}, data => {
      const label = document.querySelector('#progress-label');
      if (label) label.textContent = data.label;
      const bar = document.querySelector('[role="progressbar"]');
      const percent = Math.round(data.done / data.total * 100);
      if (bar) {
        bar.setAttribute('aria-valuenow', percent);
        bar.querySelector('.progress-fill').style.width = `${percent}%`;
      }
    });
  }

  function entry(file, pages, sample = false) {
    return { name: file.name, size: sizeLabel(file.size), file, pages, sample, url: URL.createObjectURL(file) };
  }

  function sortFiles() {
    if (document.querySelector('#merge-order').value === 'name') {
      state.files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    }
  }

  function setup() {
    document.querySelector('#merge-order').addEventListener('change', () => { sortFiles(); discardResult(); state.phase = 'select'; render(); });
    document.querySelector('#output-name').addEventListener('input', () => {
      if (state.phase === 'result') { discardResult(); state.phase = 'select'; render(); }
    });
  }

  async function addFiles(fileList) {
    if (busy()) return;
    const files = Array.from(fileList);
    const valid = files.filter(file => /\.pdf$/i.test(file.name));
    const messages = files.filter(file => !/\.pdf$/i.test(file.name)).map(file => `“${file.name}”不是 PDF 文件，未添加。`);
    if (!valid.length) { state.feedback = messages.join('\n'); render(); return; }
    discardResult(); state.phase = 'reading'; state.feedback = ''; render();
    try {
      const { entries } = await runTask('inspect', valid);
      const accepted = entries.filter(item => !item.error);
      if (accepted.length && state.files.some(item => item.sample)) {
        state.files.forEach(item => URL.revokeObjectURL(item.url));
        state.files = [];
      }
      entries.forEach(item => {
        if (item.error) messages.push(item.error);
        else state.files.push(entry(valid[item.index], item.pages));
      });
      sortFiles(); state.phase = 'select'; state.feedback = messages.join('\n'); render();
    } catch (error) { failed(error); }
  }

  async function samples() {
    if (busy()) return;
    discardResult(); state.phase = 'reading'; state.feedback = ''; render();
    try {
      const { entries } = await runTask('samples');
      state.files.forEach(item => URL.revokeObjectURL(item.url));
      state.files = entries.map(item => entry(new File([item.bytes], item.name, { type: 'application/pdf' }), item.pages, true));
      sortFiles(); state.phase = 'select'; render();
    } catch (error) { failed(error); }
  }

  function failed(error) {
    if (error.name === 'AbortError') return;
    discardResult(); state.phase = 'select'; state.feedback = error.message; render();
  }

  async function run() {
    if (busy() || state.files.length < 2) return;
    const rawName = document.querySelector('#output-name').value.trim().replace(/\.pdf$/i, '');
    const name = (rawName || '合并后的文件').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    document.querySelector('#output-name').value = name;
    const filename = `${name}.pdf`;
    discardResult(); state.phase = 'processing'; state.feedback = ''; render();
    try {
      const output = await runTask('merge', state.files.map(item => item.file));
      result = { filename, pages: output.pages, size: sizeLabel(output.bytes.length), url: URL.createObjectURL(new Blob([output.bytes], { type: 'application/pdf' })) };
      state.phase = 'result'; render(); toast(`合并完成，共 ${output.pages} 页。`);
    } catch (error) { failed(error); }
  }

  function move(from, to) {
    const [item] = state.files.splice(from, 1);
    state.files.splice(to, 0, item);
    document.querySelector('#merge-order').value = 'manual';
    discardResult(); state.phase = 'select'; render();
  }

  function render() {
    const count = state.files.length;
    const pages = state.files.reduce((total, item) => total + item.pages, 0);
    const processing = busy();
    document.querySelector('.workspace-grid').classList.toggle('is-empty', !count && !processing);
    document.querySelector('#file-count').textContent = `${count} 个文件 · ${pages} 页`;
    document.querySelector('#selected-count').textContent = `${count} 个 / ${pages} 页`;
    document.querySelector('#run-button').disabled = count < 2 || processing;
    document.querySelector('[data-action="clear"]').disabled = processing;
    document.querySelectorAll('.settings-panel input,.settings-panel select').forEach(input => input.disabled = processing);
    document.querySelector('#file-feedback').textContent = state.feedback;
    const area = document.querySelector('#file-content');
    animateFileState(area);
    if (processing) {
      area.innerHTML = `<div class="progress-area"><h2>${state.phase === 'reading' ? '正在读取 PDF' : '正在合并 PDF'}</h2><p id="progress-label" role="status">准备文件…</p><div class="progress-track" role="progressbar" aria-label="PDF 处理进度" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill"></div></div><button class="text-button cancel-processing" data-action="cancel">取消处理</button></div>`;
      return;
    }
    if (result && state.phase === 'result') {
      area.innerHTML = `<div class="result-panel"><div class="result-icon">${icon('check')}</div><h2>PDF 合并完成</h2><p><strong>${escapeHTML(result.filename)}</strong><br>${count} 个文件 · ${result.pages} 页 · ${result.size}</p><div class="result-actions"><a class="primary" href="${result.url}" download="${escapeHTML(result.filename)}">${icon('download')}下载 PDF</a><a class="secondary" href="${result.url}" target="_blank" rel="noopener">查看合并结果</a></div><button class="text-button" data-action="cancel">返回文件列表</button></div>`;
      return;
    }
    if (!count) {
      area.innerHTML = `<div class="drop-zone"><button class="primary" data-action="choose">${icon('upload')}选择 PDF 文件</button><p>点击选择或将文件拖到此处，支持多个 .pdf 文件</p><span class="drop-local">文件仅在本机读取，无需上传</span></div><p class="sample-line">暂时没有文件？<button data-action="samples">使用示例文件体验</button></p>`;
      return;
    }
    area.innerHTML = `<div class="file-grid">${state.files.map((item, index) => `<article class="file-tile" draggable="true" data-index="${index}"><a class="pdf-file-cover" href="${item.url}" target="_blank" rel="noopener" aria-label="查看 ${escapeHTML(item.name)}"><span class="pdf-document-mark">PDF</span><strong>${item.pages} 页</strong><span>查看原文件</span></a><p class="file-name" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</p><p class="file-meta">${item.sample ? '示例 · ' : ''}${item.size} · 第 ${index + 1} 项</p><div class="tile-actions"><div><button class="icon-button" data-move="${index}" data-direction="-1" aria-label="前移 ${escapeHTML(item.name)}" ${index === 0 ? 'disabled' : ''}>${icon('back')}</button><button class="icon-button" data-move="${index}" data-direction="1" aria-label="后移 ${escapeHTML(item.name)}" ${index === count - 1 ? 'disabled' : ''}>${icon('arrow')}</button></div><button class="icon-button" data-remove="${index}" aria-label="移除 ${escapeHTML(item.name)}">${icon('trash')}</button></div></article>`).join('')}<button class="add-tile" data-action="choose">${icon('plus')}继续添加文件</button></div>${count === 1 ? '<p class="sample-line">再添加一个 PDF 即可合并。</p>' : ''}`;
    area.querySelectorAll('.file-tile').forEach(tile => {
      tile.addEventListener('dragstart', event => { event.dataTransfer.setData('application/x-zhijian-file', tile.dataset.index); });
      tile.addEventListener('drop', event => {
        const from = event.dataTransfer.getData('application/x-zhijian-file');
        if (from === '' || Number(from) >= state.files.length) return;
        event.preventDefault(); event.stopPropagation(); move(Number(from), Number(tile.dataset.index));
      });
    });
  }

  function handleClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const remove = event.target.closest('[data-remove]');
    const reorder = event.target.closest('[data-move]');
    if (remove) {
      const [item] = state.files.splice(Number(remove.dataset.remove), 1);
      URL.revokeObjectURL(item.url); discardResult(); state.phase = 'select'; render(); return true;
    }
    if (reorder) { move(Number(reorder.dataset.move), Number(reorder.dataset.move) + Number(reorder.dataset.direction)); return true; }
    if (action === 'samples') { samples(); return true; }
    if (action === 'run') { run(); return true; }
    if (action === 'clear') { reset(); state.files = []; state.phase = 'select'; state.feedback = ''; render(); return true; }
    if (action === 'cancel') { cancelTask(); discardResult(); state.phase = 'select'; render(); return true; }
    return false;
  }

  return { setup, render, addFiles, reset, handleClick };
})();
