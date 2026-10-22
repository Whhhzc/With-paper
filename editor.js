/* Original content is edited on the left; the right pane renders the downloadable PDF bytes. */
const PdfEditor = (() => {
  let client = null, opening = null, file = null, pageCount = 0, current = 0;
  let cache = new Map(), changes = new Map(), undo = [], redo = [], pendingEdit = null;
  let revision = 0, readyRevision = -1, timer = null, pumping = false, wanted = false;
  let rendering = null, previewUrl = null, previewViewport = null, replacing = null;
  let selectedId = null, locatedId = null, pendingLocate = null, focusInline = false, sequence = 0;
  let editViewport = null, locations = [];
  let editZoom = 1, resizeObserver = null;
  const active = () => state.tool?.id === 'edit-pdf';
  const detail = () => cache.get(current);
  const itemFor = id => [...cache.values()].flatMap(page => page.items).find(item => item.id === id) || (changes.get(id)?.added ? changes.get(id) : null);
  const hex = color => `#${color.slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('')}`;
  const rgba = (value, alpha = 255) => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), alpha];
  const currentValue = item => ({ ...item, ...changes.get(item.id) });
  function createClient() {
    const worker = new Worker(new URL('vendor/content/worker.js', location.href), { type: 'module' });
    let sequence = 0; const requests = new Map();
    worker.onmessage = ({ data }) => { const pending = requests.get(data.id); if (!pending) return; requests.delete(data.id); data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.result); };
    worker.onerror = event => { event.preventDefault(); for (const pending of requests.values()) pending.reject(new Error('本地编辑引擎处理失败，请重新打开文件。')); requests.clear(); };
    return {
      request(action, payload = {}) { return new Promise((resolve, reject) => { const id = ++sequence; requests.set(id, { resolve, reject }); worker.postMessage({ id, action, ...payload }); }); },
      close() { worker.terminate(); for (const pending of requests.values()) pending.reject(new DOMException('Cancelled', 'AbortError')); requests.clear(); },
    };
  }
  function reset() {
    clearTimeout(timer); rendering?.abort(); client?.close(); opening?.close();
    client = opening = null; file = null; pageCount = current = 0; cache = new Map(); changes = new Map(); undo = []; redo = []; pendingEdit = null;
    revision++; readyRevision = -1; wanted = pumping = false; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; previewViewport = null; replacing = null;
    selectedId = locatedId = pendingLocate = null; editViewport = null; locations = []; sequence = 0;
    resizeObserver?.disconnect(); resizeObserver = null; editZoom = 1;
  }
  function message(text, error = false) {
    const target = document.querySelector('#content-preview-status'); if (target) { target.textContent = text; target.classList.toggle('error', error); }
    const empty = document.querySelector('#content-open-message'); if (empty) empty.textContent = text;
  }
  const inputs = () => '<input class="file-input" id="content-pdf-input" type="file" accept=".pdf" aria-label="打开要编辑的 PDF"><input class="file-input" id="content-image-input" type="file" accept=".png,.jpg,.jpeg,.webp" aria-label="选择替换原图片的文件">';
  function mount() {
    main.className = 'page-content-editor';
    main.innerHTML = '<div class="content-editor-heading"><h1>编辑 PDF 内容</h1><p>在左侧 PDF 页面内点击正文直接编辑，右侧同步预览修改后的文件。</p></div><div id="content-editor-root"></div>';
    document.querySelector('#content-editor-root').innerHTML = `<div class="content-editor-empty"><div class="drop-zone"><button class="primary" data-content-action="open">${icon('upload')}打开 PDF</button><p>或拖入一份 PDF，读取其中的原有内容</p><span class="drop-local">所有处理均在本机完成，文件不会上传</span></div><p class="sample-line"><button data-content-action="sample">使用示例文件体验</button></p><p id="content-open-message" role="status"></p><button class="text-button" data-content-action="cancel-open" hidden>取消打开</button></div>${inputs()}`;
    bind();
  }
  function shell() {
    document.querySelector('#content-editor-root').innerHTML = `<div class="content-editor-filebar"><span title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span><button class="text-button" data-content-action="open">打开其他 PDF</button><button class="text-button" data-content-action="cancel-open" hidden>取消打开</button></div><div class="content-editor-toolbar"><div class="content-page-picker"><button class="icon-button" data-content-action="previous" aria-label="查看上一页">${icon('back')}</button><label>查看第 <select id="content-page" aria-label="选择查看页面">${Array.from({ length: pageCount }, (_, index) => `<option value="${index}">${index + 1}</option>`).join('')}</select> / ${pageCount} 页</label><button class="icon-button" data-content-action="next" aria-label="查看下一页">${icon('arrow')}</button></div><div class="content-history"><button data-content-action="undo">撤销</button><button data-content-action="redo">重做</button></div><span id="content-change-count">尚未修改</span></div><div id="content-inline-tools"></div><div class="content-editor-columns"><section class="content-edit-pane"><div class="content-pane-title"><h2>PDF 原位编辑</h2><span>点击正文直接输入</span></div><p class="content-edit-help">点击文字就地修改；选中后可在段落下方新增文字。新增内容不会自动下移原有段落，请通过间距和字号调整。</p><div id="content-edit-stage"><div id="content-edit-paper"></div></div></section><section class="content-preview-pane"><div class="content-pane-title"><h2>修改后预览</h2><a id="content-preview-open" target="_blank" rel="noopener">单独打开预览</a></div><p id="content-preview-status" role="status" aria-live="polite">正在生成预览…</p><div id="content-preview-stage"><div id="content-preview-paper"></div></div></section></div><div class="content-editor-save"><label>文件名 <input id="content-output-name" aria-label="下载文件名" value="${escapeHTML(file.name.replace(/\.pdf$/i, ''))}_已修改"><span>.pdf</span></label><button class="primary" id="content-download" data-content-action="download" disabled>${icon('download')}下载右侧预览版本</button></div><p class="content-editor-note">直接修改 PDF 原内容，不调整页面大小、方向或顺序。原字体缺字时会改用内置中文字体并提示；扫描页文字和嵌套特殊对象暂不能直接改写。</p>${inputs()}`;
    bind(); renderEditorControls(); updateControls();
    resizeObserver?.disconnect(); resizeObserver = new ResizeObserver(refreshEditingSurface); resizeObserver.observe(document.querySelector('#content-edit-stage'));
  }
  function bind() {
    const root = document.querySelector('#content-editor-root');
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onChange); root.addEventListener('keydown', onKey);
    document.querySelector('#content-pdf-input').addEventListener('change', event => { const next = event.target.files[0]; event.target.value = ''; if (next) loadFile(next); });
    document.querySelector('#content-image-input').addEventListener('change', event => { const image = event.target.files[0]; event.target.value = ''; if (image) replaceImage(image); });
    root.ondragover = event => event.preventDefault();
    root.ondrop = event => { event.preventDefault(); if (event.dataTransfer.files.length !== 1) message('一次只能打开一份 PDF。', true); else loadFile(event.dataTransfer.files[0]); };
  }
  async function loadFile(next) {
    if (opening) return;
    if (!/\.pdf$/i.test(next.name)) { message('请选择有效的 PDF 文件。', true); return; }
    if (location.protocol === 'file:') { message('请通过网站或 http://127.0.0.1:4186 打开编辑器，以加载本地内容编辑引擎。文件不会上传。', true); return; }
    finishPending(); const nextClient = createClient(); opening = nextClient; state.phase = 'reading'; updateControls(); message('正在加载本地编辑引擎并读取原有内容…');
    try {
      const info = await nextClient.request('open', { file: next, base: new URL('vendor/content/', location.href).href });
      const first = await nextClient.request('inspect', { page: 0 }); if (opening !== nextClient || !active()) return;
      clearTimeout(timer); rendering?.abort(); client?.close(); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null;
      client = nextClient; opening = null; file = next; pageCount = info.pages; current = 0; cache = new Map([[0, first]]); changes = new Map(); undo = []; redo = []; pendingEdit = null;
      selectedId = locatedId = pendingLocate = null; editViewport = null; locations = []; sequence = 0;
      revision++; readyRevision = -1; pumping = wanted = false; state.phase = 'select'; shell(); schedule(true);
    } catch (error) { if (opening !== nextClient || !active()) return; nextClient.close(); opening = null; state.phase = 'select'; message(error.message, true); updateControls(); }
  }
  async function sample() {
    if (opening) return; const job = new LocalJob(window.pdfWorkerSource);
    try { const result = await job.run('samples'); if (active()) await loadFile(new File([result.entries[0].bytes], '内容编辑示例.pdf', { type: 'application/pdf' })); }
    catch (error) { if (active()) message(error.message, true); }
  }
  function viewportRect(box, viewport) {
    const corners = [[box[0],box[1]],[box[0],box[3]],[box[2],box[1]],[box[2],box[3]]].map(([x,y]) => viewport.convertToViewportPoint(x,y));
    return [Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
  }
  function visibleItems() { return [...(detail()?.items || []), ...[...changes.values()].filter(item=>item.added&&item.page===current)]; }
  function renderEditorControls() {
    const tools = document.querySelector('#content-inline-tools'); if (!tools) return;
    const item = selectedId && itemFor(selectedId) ? currentValue(itemFor(selectedId)) : null;
    let html = '<span class="content-select-hint">点击页面中的文字、图片或图形进行编辑。</span>';
    if (item) {
      const type = item.type === 'text' ? item.added ? '新增段落' : '原文' : item.type === 'image' ? '图片' : item.type === 'graphic' ? '图形' : '特殊对象';
      html = `<div class="content-selection-tools" data-content-id="${item.id}"><strong>${type}</strong>`;
      if(item.type==='text') html += `<label>字号 <input type="number" min="1" step="any" required data-content-property="fontSize" value="${Number(item.fontSize.toFixed(2))}"></label><label>颜色 <input type="color" data-content-property="color" value="${hex(item.color)}"></label><button data-content-add="${item.id}">在此段下新增</button>`;
      if(item.added) html += `<label>下方间距 <input type="number" step="any" required data-content-property="gap" value="${item.gap}"></label><label>水平偏移 <input type="number" step="any" required data-content-property="offsetX" value="${item.offsetX}"></label>`;
      if(item.type==='image') html += `<button data-content-replace="${item.id}">替换图片</button>`;
      if(item.type==='graphic') html += `${item.hasFill?`<label>填充 <input type="color" data-content-property="color" value="${hex(item.color)}"></label>`:''}${item.hasStroke?`<label>线条 <input type="color" data-content-property="strokeColor" value="${hex(item.strokeColor)}"></label>`:''}`;
      if(item.type==='locked') html += `<span>${item.reason}</span>`;
      else html += `<button data-content-remove="${item.id}">删除</button>`;
      html += `<button data-content-locate="${item.id}">定位</button><button data-content-action="finish-edit">完成编辑</button></div>`;
    }
    tools.innerHTML = `${html}<label class="content-edit-zoom">编辑缩放 <select id="content-edit-zoom"><option value="1">适合宽度</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>`;
    document.querySelector('#content-edit-zoom').value=String(editZoom);
    refreshEditingSurface();
    const input=document.querySelector('.content-inline-edit');if(input&&selectedId&&itemFor(selectedId))input.value=currentValue(itemFor(selectedId)).text;
  }
  function refreshEditingSurface() {
    const paper = document.querySelector('#content-edit-paper'); if (!paper || !editViewport || !paper.querySelector('canvas')) return;
    paper.style.width=`${editZoom*100}%`;
    let layer=paper.querySelector('.content-hit-layer'); if(!layer){layer=document.createElement('div');layer.className='content-hit-layer';paper.append(layer);}
    layer.replaceChildren();
    for(const original of visibleItems()) {
      const item=currentValue(original), location=locations.find(value=>value.id===item.id) || item;
      if(item.deleted||location.deleted||item.id===selectedId&&item.type==='text')continue;
      const box=viewportRect(location.bounds,editViewport),button=document.createElement('button');
      button.className='content-hit';button.dataset.inlineSelect=item.id;button.setAttribute('aria-label',item.type==='text'?`编辑文字：${item.text}`:item.type==='image'?'选择原图片':item.type==='graphic'?'选择原图形':'查看特殊对象');
      button.setAttribute('aria-pressed',String(item.id===selectedId));
      Object.assign(button.style,{left:`${box[0]/editViewport.width*100}%`,top:`${box[1]/editViewport.height*100}%`,width:`${Math.max(5,box[2]-box[0])/editViewport.width*100}%`,height:`${Math.max(5,box[3]-box[1])/editViewport.height*100}%`});layer.append(button);
    }
    const item=selectedId&&itemFor(selectedId)?currentValue(itemFor(selectedId)):null;
    let edit=paper.querySelector('.content-inline-edit');
    if(!item||item.type!=='text'||item.deleted){edit?.remove();return;}
    if(edit?.dataset.contentId!==item.id){edit?.remove();edit=document.createElement('textarea');edit.className='content-inline-edit';edit.dataset.contentProperty='text';edit.dataset.contentId=item.id;edit.setAttribute('aria-label',item.added?'输入新增段落':'在 PDF 页面内编辑原文');edit.wrap='off';edit.value=item.text;paper.append(edit);}
    if(document.activeElement!==edit&&edit.value!==item.text)edit.value=item.text;
    const location=locations.find(value=>value.id===item.id)||item, m=location.matrix, v=editViewport.transform;
    const a=v[0]*m[0]+v[2]*m[1],b=v[1]*m[0]+v[3]*m[1],c=v[0]*m[2]+v[2]*m[3],d=v[1]*m[2]+v[3]*m[3];
    const x=v[0]*m[4]+v[2]*m[5]+v[4],y=v[1]*m[4]+v[3]*m[5]+v[5],ratio=paper.clientWidth/editViewport.width;
    const lines=item.text.split('\n').length, font=item.fontSize;
    Object.assign(edit.style,{left:`${(x+c*font*.98)/editViewport.width*100}%`,top:`${(y+d*font*.98)/editViewport.height*100}%`,width:`${Math.max(150,Math.min(430,editViewport.width/Math.max(1,Math.hypot(a,b))*.78))*ratio}px`,height:`${Math.max(font*1.5,lines*font*1.3+6)*ratio}px`,fontSize:`${font*ratio}px`,lineHeight:'1.3',color:hex(item.color),transform:`matrix(${a},${b},${-c},${-d},0,0)`});
    edit.style.fontFamily=/[^\x00-\x7f]/.test(item.text)?'ZJContentFont, sans-serif':/Times|Serif|Song|Sun/i.test(item.fontName)?'"Times New Roman", SimSun, serif':/Courier|Mono/i.test(item.fontName)?'"Courier New", monospace':'Arial, sans-serif';
    if(focusInline){focusInline=false;edit.focus({preventScroll:true});edit.setSelectionRange(edit.value.length,edit.value.length);}
  }
  function selectItem(id) {
    if(opening)return;finishPending();selectedId=id;focusInline=itemFor(id).type==='text';revision++;readyRevision=-1;pendingLocate=id;renderEditorControls();schedule(true);
  }
  function addParagraph(afterId) {
    finishPending();const anchor=currentValue(itemFor(afterId)), location=locations.find(item=>item.id===afterId)||anchor, matrix=[...location.matrix];
    const distance=anchor.text.split('\n').length*anchor.fontSize*1.3+6;matrix[4]-=matrix[2]*distance;matrix[5]-=matrix[3]*distance;
    const id=`new-${++sequence}`,entry={id,page:current,type:'text',added:true,afterId,text:'',fontSize:anchor.fontSize,fontName:anchor.fontName,color:[...anchor.color],gap:6,offsetX:0,matrix,bounds:[matrix[4],matrix[5]-anchor.fontSize*.25,matrix[4]+anchor.fontSize*8,matrix[5]+anchor.fontSize]};
    changes.set(id,entry);undo.push({id,before:undefined,after:entry});redo=[];selectedId=id;focusInline=true;revision++;renderEditorControls();schedule(true);
  }
  function canonical(id, patch) {
    const original = itemFor(id), change = { ...(changes.get(id) || {}), ...patch, id, page: original.page }, effective = { ...original, ...change };
    if(change.added){changes.set(id,change);return;}
    const same = !effective.deleted && !change.image && (original.type !== 'text' || (effective.text === original.text && Math.abs(effective.fontSize - original.fontSize) < .005)) && effective.color.join(',') === original.color.join(',') && (!original.strokeColor || effective.strokeColor.join(',') === original.strokeColor.join(','));
    if (same) changes.delete(id); else changes.set(id, change);
  }
  function finishPending() { if (!pendingEdit) return; undo.push({ id: pendingEdit.id, before: pendingEdit.before, after: changes.get(pendingEdit.id) }); redo = []; pendingEdit = null; updateControls(); }
  function edit(id, patch, immediate = false) {
    if (pendingEdit && pendingEdit.id !== id) finishPending(); if (!pendingEdit) pendingEdit = { id, before: changes.get(id) };
    canonical(id, patch); revision++; readyRevision = -1;
    if (immediate) { finishPending(); renderEditorControls(); } else refreshEditingSurface(); schedule();
  }
  function onInput(event) {
    const property = event.target.dataset.contentProperty; if (!property || opening) return;
    const id = event.target.closest('[data-content-id]').dataset.contentId, original = itemFor(id);
    if (property === 'deleted') return;
    if (event.target.type==='number' && !event.target.checkValidity()) { revision++; readyRevision = -1; clearTimeout(timer); message('请填写有效数值，字号须大于零。', true); updateControls(); return; }
    edit(id, { [property]: property === 'text' ? event.target.value : ['fontSize','gap','offsetX'].includes(property) ? Number(event.target.value) : rgba(event.target.value, original[property][3]) });
  }
  function onChange(event) {
    if (event.target.id === 'content-page') { changePage(Number(event.target.value)); return; }
    if (event.target.id === 'content-edit-zoom') {editZoom=Number(event.target.value);refreshEditingSurface();return;}
    const property = event.target.dataset.contentProperty; if (!property) return;
    const id = event.target.closest('[data-content-id]').dataset.contentId;
    if (property === 'deleted') edit(id, { deleted: event.target.checked }, true); else finishPending();
  }
  function valid() { return [...document.querySelectorAll('#content-inline-tools input[type="number"]')].every(input => input.disabled || input.checkValidity()); }
  function schedule(immediate = false) {
    clearTimeout(timer); readyRevision = -1; rendering?.abort(); document.querySelector('#content-preview-stage')?.classList.add('updating');
    const paper=document.querySelector('#content-edit-paper');if(paper)paper.classList.toggle('pending-mask',Boolean(selectedId)&&paper.dataset.masked!==selectedId);
    message('正在更新预览，完成后可下载…'); updateControls(); timer = setTimeout(() => { wanted = true; pump(); }, immediate ? 0 : 350);
  }
  async function pump() {
    if (pumping || opening || !client || !valid()) return; pumping = true; const owner = client;
    try {
      while (wanted && owner === client && active()) {
        wanted = false; const version = revision, pageNumber = current;
        const result = await owner.request('preview', { changes: [...changes.values()], view:{page:pageNumber,selected:selectedId} });
        if (owner !== client || version !== revision || pageNumber !== current || !valid()) continue;
        const controller = new AbortController(); rendering = controller; const blob = new Blob([result.bytes], { type: 'application/pdf' }); let pdf, editPdf;
        try {
          pdf = await Media.pdf(blob, controller.signal); const page = await pdf.getPage(pageNumber + 1); controller.signal.throwIfAborted();
          const viewport = page.getViewport({ scale: 1 }); const canvas = await Media.page(pdf, pageNumber + 1, 1.5, controller.signal);
          let leftCanvas;
          if(result.editBytes){editPdf=await Media.pdf(new Blob([result.editBytes],{type:'application/pdf'}),controller.signal);leftCanvas=await Media.page(editPdf,pageNumber+1,1.5,controller.signal);}
          else{leftCanvas=document.createElement('canvas');leftCanvas.width=canvas.width;leftCanvas.height=canvas.height;leftCanvas.getContext('2d').drawImage(canvas,0,0);}
          if (owner !== client || version !== revision || pageNumber !== current) continue;
          const paper = document.querySelector('#content-preview-paper'); canvas.setAttribute('aria-label', `第 ${pageNumber + 1} 页修改后的 PDF 预览`); paper.replaceChildren(canvas);
          const marker = document.createElement('div'); marker.id = 'content-preview-marker'; marker.hidden = true; paper.append(marker); previewViewport = viewport;
          locations=result.locations||[];editViewport=viewport;
          const leftPaper=document.querySelector('#content-edit-paper');const oldCanvas=leftPaper.querySelector('canvas');if(oldCanvas)oldCanvas.replaceWith(leftCanvas);else leftPaper.prepend(leftCanvas);
          leftPaper.dataset.masked=selectedId||'';leftPaper.classList.remove('pending-mask');refreshEditingSurface();
          if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(blob); readyRevision = version;
          document.querySelector('#content-preview-stage').classList.remove('updating');
          message(result.warnings.length ? result.warnings.join('\n') : changes.size ? '预览已更新，下载将保存右侧这一版 PDF。' : '当前为原文件预览。左侧可直接修改现有内容。'); updateControls();
          if(pendingLocate&&itemFor(pendingLocate)){const target=pendingLocate;pendingLocate=null;locate(target);}else if(locatedId&&itemFor(locatedId))drawMarker(locatedId,false);
        } catch (error) { if (!controller.signal.aborted) throw error; }
        finally { if (pdf) await pdf.destroy();if(editPdf)await editPdf.destroy(); if (rendering === controller) rendering = null; }
      }
    } catch (error) { if (owner === client && active() && error.name !== 'AbortError') { readyRevision = -1; message(`预览未更新：${error.message}`, true); updateControls(); } }
    finally { if (owner === client) { pumping = false; if (wanted) void pump(); } }
  }
  async function changePage(number) {
    if (opening) return; finishPending(); current = number;selectedId=locatedId=pendingLocate=null;editViewport=null;locations=[];document.querySelector('#content-edit-paper')?.replaceChildren(); revision++; readyRevision = -1; rendering?.abort(); renderEditorControls(); updateControls(); const owner = client;
    try {
      if (!cache.has(number)) { const result = await owner.request('inspect', { page: number }); if (owner !== client) return; cache.set(number, result); }
      if (number !== current || !active()) return; renderEditorControls(); schedule(true);
    } catch (error) { if (owner === client && active()) message(error.message, true); }
  }
  async function replaceImage(image) {
    const id = replacing, owner = client; replacing = null; if (!id || opening) return;
    revision++;readyRevision=-1;clearTimeout(timer);rendering?.abort();message('正在读取替换图片…');updateControls();
    try {
      const canvas = await Media.image(image); if (owner !== client) return;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const replacement = { name: image.name, width: canvas.width, height: canvas.height, data: new Uint8Array(pixels.data) };
      canvas.width = canvas.height = 0; edit(id, { image: replacement, deleted: false }, true);
    } catch { if (owner === client) {schedule(true);toast('无法读取这张图片，已保留原图片。请选择有效的 PNG、JPG 或 WebP。');} }
  }
  function locate(id) {
    if (!previewViewport || readyRevision !== revision) {pendingLocate=id;toast('预览正在更新，完成后会自动定位。');return;}
    locatedId=id;drawMarker(id,true);toast(`已定位到第 ${current+1} 页的对应内容。`);
  }
  function drawMarker(id,scroll) {
    const item=locations.find(value=>value.id===id)||itemFor(id),rect=viewportRect(item.bounds,previewViewport),marker=document.querySelector('#content-preview-marker');
    marker.hidden=false;Object.assign(marker.style,{left:`${rect[0]/previewViewport.width*100}%`,top:`${rect[1]/previewViewport.height*100}%`,width:`${Math.max(5,rect[2]-rect[0])/previewViewport.width*100}%`,height:`${Math.max(5,rect[3]-rect[1])/previewViewport.height*100}%`});
    if(scroll){const stage=document.querySelector('#content-preview-stage');stage.scrollIntoView({block:'nearest',inline:'nearest'});const box=marker.getBoundingClientRect(),container=stage.getBoundingClientRect();stage.scrollTop+=box.top-container.top-container.height/2+box.height/2;stage.scrollLeft+=box.left-container.left-container.width/2+box.width/2;}
  }
  function updateControls() {
    const root = document.querySelector('#content-editor-root'); if (!root) return;
    root.querySelectorAll('input,textarea,select,button').forEach(element => { if (element.dataset.contentAction !== 'cancel-open' && !element.closest('fieldset[disabled]')) element.disabled = Boolean(opening); });
    const button = action => root.querySelector(`[data-content-action="${action}"]`);
    if (button('cancel-open')) button('cancel-open').hidden = !opening;
    if (button('download')) button('download').disabled = Boolean(opening) || !previewUrl || readyRevision !== revision || !valid();
    if (button('undo')) button('undo').disabled = Boolean(opening) || (!undo.length && !pendingEdit);
    if (button('redo')) button('redo').disabled = Boolean(opening) || !redo.length;
    if (button('previous')) button('previous').disabled = Boolean(opening) || current <= 0;
    if (button('next')) button('next').disabled = Boolean(opening) || current >= pageCount - 1;
    const preview = document.querySelector('#content-preview-open'); if (preview) { if (readyRevision === revision && previewUrl) { preview.href = previewUrl; preview.setAttribute('aria-disabled', 'false'); } else { preview.removeAttribute('href'); preview.setAttribute('aria-disabled', 'true'); } }
    const page = document.querySelector('#content-page'); if (page) page.value = String(current);
    const count = document.querySelector('#content-change-count'); if (count) count.textContent = changes.size ? `${changes.size} 项内容已修改` : '尚未修改';
    const toolbar=document.querySelector('.content-selection-tools');
    if(toolbar&&selectedId){const restore=toolbar.querySelector('[data-content-restore]');if(changes.has(selectedId)&&!itemFor(selectedId)?.added&&!restore){const button=document.createElement('button');button.dataset.contentRestore=selectedId;button.textContent='恢复原内容';toolbar.append(button);}else if(!changes.has(selectedId))restore?.remove();}
  }
  function travel(backward) {
    finishPending(); const source = backward ? undo : redo, target = backward ? redo : undo, command = source.pop(); if (!command) return;
    target.push(command); const value = backward ? command.before : command.after; if (value) changes.set(command.id, value); else changes.delete(command.id);
    const page = (value||command.before||command.after)?.page??itemFor(command.id).page;selectedId=value?.deleted?null:itemFor(command.id)?command.id:null;locatedId=pendingLocate=null; revision++; renderEditorControls(); if (page !== current) changePage(page); else schedule(true);
  }
  function onClick(event) {
    const selected=event.target.closest('[data-inline-select]');if(selected){selectItem(selected.dataset.inlineSelect);return;}
    const addition=event.target.closest('[data-content-add]');if(addition){addParagraph(addition.dataset.contentAdd);return;}
    const removed=event.target.closest('[data-content-remove]');if(removed){const id=removed.dataset.contentRemove;selectedId=locatedId=pendingLocate=null;edit(id,{deleted:true},true);return;}
    const replace = event.target.closest('[data-content-replace]'); if (replace) { replacing = replace.dataset.contentReplace; document.querySelector('#content-image-input').click(); return; }
    const restore = event.target.closest('[data-content-restore]'); if (restore) { finishPending(); const id = restore.dataset.contentRestore; undo.push({ id, before: changes.get(id), after: undefined }); changes.delete(id); redo = []; revision++; renderEditorControls(); schedule(true); return; }
    const locateButton = event.target.closest('[data-content-locate]'); if (locateButton) { locate(locateButton.dataset.contentLocate); return; }
    const action = event.target.closest('[data-content-action]')?.dataset.contentAction;
    if(action==='finish-edit'||(selectedId&&event.target.matches('#content-edit-paper canvas'))){finishPending();selectedId=null;revision++;renderEditorControls();schedule(true);return;}
    if (action === 'open') document.querySelector('#content-pdf-input').click(); if (action === 'sample') sample();
    if (action === 'previous') changePage(current - 1); if (action === 'next') changePage(current + 1);
    if (action === 'undo') travel(true); if (action === 'redo') travel(false);
    if (action === 'cancel-open') { opening?.close(); opening = null; state.phase = 'select'; updateControls(); message('已取消打开文件，现有编辑保留。'); }
    if (action === 'download' && readyRevision === revision && previewUrl && valid()) {
      finishPending(); const name = document.querySelector('#content-output-name').value.trim().replace(/\.pdf$/i, '') || '修改后的文件';
      const link = document.createElement('a'); link.href = previewUrl; link.download = `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.pdf`; link.click();
    }
  }
  function onKey(event){if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(!event.shiftKey);}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();travel(false);}}
  return { mount, reset };
})();
