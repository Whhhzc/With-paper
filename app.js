const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
  merge: '<path d="M8 3H3v14h5M16 3h5v14h-5M12 10v11M8 17l4 4 4-4M6 7l6 5 6-5"/>',
  split: '<path d="M12 21V10M4 3v7h6M20 3v7h-6M12 14 4 6M12 14l8-8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  scan: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 12h10M9 8h6M9 16h6"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  rotate: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  sort: '<path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/>',
  watermark: '<path d="M8 3h8l-1 9 4 4v3H5v-3l4-4zM5 22h14M9 12h6"/>',
  rename: '<path d="M13 4H4v16h16v-9M14 3h7M14 21h7M17.5 3v18M7 10h5M7 14h5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const groups = [ ['all','全部工具','grid'], ['pdf','PDF 处理','file'], ['image','图片与 PDF','image'], ['ocr','文字识别','scan'], ['batch','批量处理','layers'] ];
const tools = [
  {id:'merge',name:'合并 PDF',desc:'将多个 PDF 按顺序合成一份文件',group:'pdf',icon:'merge',popular:true,ready:true},
  {id:'split',name:'拆分 PDF',desc:'提取需要的页面，或拆成多个文件',group:'pdf',icon:'split',popular:true},
  {id:'image-pdf',name:'图片转 PDF',desc:'将照片、截图整理成一份 PDF',group:'image',icon:'image',popular:true},
  {id:'pdf-image',name:'PDF 转图片',desc:'将 PDF 页面导出为 JPG 或 PNG',group:'image',icon:'file',popular:true},
  {id:'ocr-image',name:'图片提取文字',desc:'把图片中的文字变成可编辑文本',group:'ocr',icon:'scan',popular:true},
  {id:'rename',name:'批量重命名',desc:'统一文件名称，让文件井井有条',group:'batch',icon:'rename',popular:true},
  {id:'rotate',name:'旋转 PDF',desc:'调整页面方向，阅读更顺手',group:'pdf',icon:'rotate'},
  {id:'delete',name:'删除 PDF 页面',desc:'移除空白页和不需要的内容',group:'pdf',icon:'trash'},
  {id:'sort',name:'调整页面顺序',desc:'拖动页面，重新整理文档',group:'pdf',icon:'sort'},
  {id:'watermark',name:'PDF 添加水印',desc:'为文档添加文字水印',group:'pdf',icon:'watermark'},
  {id:'ocr-pdf',name:'扫描件提取文字',desc:'识别扫描 PDF 中的文字内容',group:'ocr',icon:'scan'},
  {id:'batch-watermark',name:'批量添加水印',desc:'一次为多份 PDF 添加水印',group:'batch',icon:'watermark'}
];
tools.push({id:'remove-watermark',name:'去除 PDF 水印',desc:'选择并移除可识别的独立水印',group:'pdf',icon:'watermark'});
tools.splice(1,0,{id:'edit-pdf',name:'编辑 PDF',desc:'修改原有文字和图片，同步预览后下载',group:'pdf',icon:'rename'});
tools.forEach(tool=>tool.ready=true);
const main = document.querySelector('main');
function fileBadge(tool){
  const glyphs={
    merge:'<path d="M7 8h8v11H7zM17 13h8v11h-8z" fill="none" stroke="white" stroke-width="2"/><path d="M14 24h-4v-3m8-13h4v3" fill="none" stroke="white" stroke-width="2"/>',
    split:'<path d="M9 8v16M23 8v16M13 16h6m-6 0 3-3m-3 3 3 3m3-3-3-3m3 3-3 3" fill="none" stroke="white" stroke-width="2"/>',
    image:'<rect x="7" y="8" width="18" height="16" rx="1" fill="none" stroke="white" stroke-width="2"/><circle cx="12" cy="13" r="2" fill="white"/><path d="m8 23 6-6 4 4 3-3 4 5" fill="none" stroke="white" stroke-width="2"/>',
    scan:'<path d="M8 8h16v4h-2v-2h-5v13h3v2h-8v-2h3V10h-5v2H8z" fill="white"/>',
    rotate:'<path d="M9 12a8 8 0 1 1-1 7M8 6v7h7" fill="none" stroke="white" stroke-width="2.5"/>',
    trash:'<path d="M8 10h16M13 7h6M11 13v12h10V13M15 15v7M18 15v7" fill="none" stroke="white" stroke-width="2"/>',
    sort:'<path d="M11 7v18m-4-4 4 4 4-4M21 25V7m-4 4 4-4 4 4" fill="none" stroke="white" stroke-width="2"/>',
    watermark:'<path d="M12 7h8v7l4 5v3H8v-3l4-5zM9 26h14" fill="none" stroke="white" stroke-width="2"/>',
    rename:'<path d="M7 8h12v17H7zM22 7v18M19 7h6M19 25h6M10 13h6M10 18h6" fill="none" stroke="white" stroke-width="2"/>',
    file:'<path d="M9 5h10l5 5v17H9z" fill="white"/><path d="M19 5v6h5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 16h9M12 20h9" stroke="currentColor" stroke-width="2"/>'
  };
  return `<svg class="file-badge badge-${tool.group}" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="5" fill="currentColor"/>${glyphs[tool.icon]||glyphs.file}</svg>`;
}
const state = {group:'all',query:'',tool:null,files:[],phase:'select',feedback:''};
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isOCR = () => state.tool?.group === 'ocr';
let toastTimer;
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function navigation(){document.querySelector('#navigation').innerHTML=`<a class="nav-home ${!state.tool&&state.group==='all'?'active':''}" href="#home">全部工具</a>`+groups.filter(([id])=>id!=='all').map(([id,name])=>`<details class="nav-group" open><summary>${name}</summary>${tools.filter(t=>t.group===id).map(t=>`<a class="nav-link ${state.tool?.id===t.id?'active':''}" href="#tool/${t.id}" ${state.tool?.id===t.id?'aria-current="page"':''}>${fileBadge(t)}<span>${t.name}</span></a>`).join('')}</details>`).join('');}
function renderHome(){
  const groupName=groups.find(g=>g[0]===state.group)[1];
  document.title=`${groupName} · 纸间`;
  document.querySelector('#breadcrumb').innerHTML=`<a href="#home">首页</a> <span>/</span> <strong>${groupName}</strong>`;
  main.innerHTML=`<section class="intro"><div><h1>${state.group==='all'?'办公文件工具':groupName}</h1><p>选择需要的工具，添加文件即可开始。</p></div></section><section id="popular-section" aria-label="常用工具"><h2>常用工具</h2><div class="popular-grid">${tools.filter(t=>t.popular).map(t=>`<a href="#tool/${t.id}" class="tool-card">${fileBadge(t)}<div><h3>${t.name}</h3><p>${t.desc}</p></div></a>`).join('')}</div></section><section class="tools-section"><div class="directory-heading"><h2>全部工具</h2><span id="tool-count"></span></div><div id="tool-list" class="tool-list"></div></section><div class="local-note"><span>使用说明</span><p>文件在本地处理，无需上传服务器。</p><button class="text-button" data-action="privacy">查看详情</button></div>`;
  filterTools();
}
function filterTools(){
  const q=state.query.trim().toLowerCase().replace(/\s/g,'');
  const matches=tools.filter(t=>(state.group==='all'||t.group===state.group)&&`${t.name}${t.desc}`.toLowerCase().replace(/\s/g,'').includes(q));
  const descriptions={pdf:'整理文档页面',image:'图片与文档互转',ocr:'提取可编辑文本',batch:'同时处理多个文件'};
  document.querySelector('#tool-list').innerHTML=matches.length?groups.filter(([id])=>id!=='all'&&matches.some(t=>t.group===id)).map(([id,name])=>`<section class="directory-group"><div class="group-heading"><h3>${name}</h3><p>${descriptions[id]}</p></div><div class="group-tools">${matches.filter(t=>t.group===id).map(t=>`<a class="tool-row" href="#tool/${t.id}">${fileBadge(t)}<div><h4>${t.name}</h4><p>${t.desc}</p></div></a>`).join('')}</div></section>`).join(''):'<div class="empty-results">没有找到相关工具。试试“图片”或“PDF”。</div>';
  document.querySelector('#tool-count').textContent=`${matches.length} 个工具`;
  document.querySelector('#popular-section').hidden=Boolean(q)||state.group!=='all';
}
function acceptTypes(){if(state.tool.id==='rename')return '';if(state.tool.id==='image-pdf'||state.tool.id==='ocr-image')return '.png,.jpg,.jpeg,.webp';return '.pdf';}
function outputField(){
 const id=state.tool.id;
 if(id!=='merge')return Tools.settings();
 return `<label class="field"><span>输出文件名</span><div class="input-with-suffix"><input id="output-name" aria-label="输出文件名" value="${id==='merge'?'合并后的文件':'处理后的文件'}"><span>${id==='pdf-image'?'.zip':'.pdf'}</span></div></label>${id==='merge'?'<label class="field"><span>合并顺序</span><select id="merge-order"><option value="manual">按当前排列顺序</option><option value="name">按文件名排序</option></select><small>拖动文件或使用左右箭头调整顺序。</small></label>':''}`;
}
function renderWorkspace(){
 const tool=state.tool;
 document.title=`${tool.name} · 纸间`;
 document.querySelector('#breadcrumb').innerHTML=`<a href="#home">全部工具</a><span>/</span><strong>${tool.name}</strong>`;
 if(tool.id==='edit-pdf'){PdfEditor.mount();return;}
 main.innerHTML=`<div class="workspace-heading"><div class="hero-file-icon">${fileBadge(tool)}<span>${isOCR()?'TXT':tool.id==='pdf-image'?'JPG':tool.id==='rename'?'ABC':'PDF'}</span></div><h1>${tool.name}</h1><p>${tool.desc}</p></div>
 <div class="workspace-grid"><section class="files-panel" aria-label="文件工作区"><div class="panel-toolbar"><strong>${isOCR()?'原始文件':'文件列表'} <span id="file-count" class="toolbar-sub"></span></strong><button class="text-button" data-action="clear">清空列表</button></div><div id="file-content"></div><div id="file-feedback" class="file-feedback" role="alert"></div><input class="file-input" id="file-input" type="file" multiple accept="${acceptTypes()}" aria-label="选择本地文件"></section><aside class="settings-panel"><h2>${isOCR()?'识别设置':tool.id==='merge'?'合并设置':'处理设置'}</h2>${outputField()}<div class="setting-separator"></div><div class="summary-line"><span>已选择文件</span><strong id="selected-count">0 个</strong></div><button class="primary" id="run-button" data-action="run">开始处理</button><p class="setting-footnote">文件在本地处理，原文件不会修改。</p></aside></div>
 <div class="demo-notice">${icon('info')}<span>文件在浏览器本地处理。</span></div><section class="instruction-block"><h2>使用方法</h2><div class="instruction-list"><span><b class="step-number">1</b>选择文件</span><span><b class="step-number">2</b>${isOCR()?'识别并核对文字':'调整顺序和设置'}</span><span><b class="step-number">3</b>${isOCR()?'复制或下载文字':'处理并下载结果'}</span></div></section>`;
 document.querySelector('#file-input').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
 const panel=document.querySelector('.files-panel');
 panel.addEventListener('dragover',e=>{e.preventDefault();panel.querySelector('.drop-zone')?.classList.add('drag-over');});
 panel.addEventListener('dragleave',()=>panel.querySelector('.drop-zone')?.classList.remove('drag-over'));
 panel.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);});
 if(tool.id==='merge'){
   document.querySelector('#run-button').textContent='合并 PDF';
   document.querySelector('.setting-footnote').textContent='处理在本地完成，原文件不会被修改。';
   document.querySelector('.demo-notice span').textContent='合并页面内容，保留页面尺寸与方向；不保留原文件书签。加密文件和交互表单暂不支持。';
   Merge.setup();
 }else{
   document.querySelector('#run-button').textContent=tool.id==='remove-watermark'?'预览去除效果':tool.group==='ocr'?'开始识别':tool.id==='rename'?'重命名并打包':'开始处理';
   document.querySelector('.setting-footnote').textContent='结果保存在本机，原文件不会修改。';
   document.querySelector('.demo-notice span').textContent=tool.id==='remove-watermark'?'仅移除明确识别的独立水印，请核对前后效果。图片内和未标记的水印暂不支持。':tool.group==='ocr'?'识别引擎和语言模型从本站加载，文件内容不上传；请核对识别结果。':tool.id==='rename'?'生成重命名副本，不修改原文件。':tool.id==='image-pdf'?'图片在本机转换。多个结果可打包下载。':'本地处理；加密文件及交互表单暂不支持。提取或重新排序页面不保留原文件书签。';
   Tools.setup();
 }
 renderFiles();
}
function renderFiles(){ state.tool.id==='merge'?Merge.render():Tools.render(); }
function addFiles(files){ state.tool.id==='merge'?Merge.addFiles(files):Tools.addFiles(files); }
function showInfo(kind){
 const privacy=kind==='privacy';
 document.querySelector('#dialog-title').textContent=privacy?'文件留在你的设备':'欢迎使用纸间';
 document.querySelector('#dialog-content').innerHTML=privacy?'<p>所有文件都在浏览器中处理，没有文件上传接口。PDF、图片、识别引擎和中文/英文模型均由本站提供，不调用第三方文件处理服务。</p><p>OCR 语言模型可能缓存于浏览器，便于再次使用；你的文档和识别结果不会写入服务端。</p><p>刷新或关闭页面后本次文件和结果会清除，请及时下载。原文件不会修改。文字识别请通过网站或本地预览地址使用，以加载识别模型。</p>':'<p>选择工具并添加文件，设置参数后开始处理。页面工具可点击缩略图下的复选框选择页面；排序可拖动或用箭头调整。</p><p>多个结果提供逐个下载和 ZIP 打包。识别文字可核对编辑后复制或下载。处理中可取消，离开工具也会终止本次任务。</p><p>去水印仅支持标准水印批注和本工具写入的独立水印，提供前后对照；图片内或未标记的水印不做猜测删除。加密 PDF 和交互表单暂不支持。</p><p>按 / 搜索工具，Esc 关闭弹窗。刷新或关闭页面将清除本次文件和结果。</p>';
 document.querySelector('#info-dialog').showModal();
}
document.addEventListener('click',e=>{
 if(state.tool?.id==='merge'&&Merge.handleClick(e))return;
 if(state.tool&&!['merge','edit-pdf'].includes(state.tool.id)&&Tools.handleClick(e))return;
 const action=e.target.closest('[data-action]')?.dataset.action;
 if(action==='help'||action==='privacy')showInfo(action);
 if(action==='close-dialog')document.querySelector('#info-dialog').close();
 if(action==='choose')document.querySelector('#file-input').click();
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog').open){const search=document.querySelector('#tool-search');if(search){e.preventDefault();search.focus();}}});
document.querySelector('#tool-search').addEventListener('input',e=>{if(!state.tool){state.query=e.target.value;filterTools();}});
document.querySelector('#global-search').addEventListener('submit',e=>{
 e.preventDefault();const query=document.querySelector('#tool-search').value;
 history.pushState(null,'','#home');route();state.query=query;
 document.querySelector('#tool-search').value=query;filterTools();
 main.focus({preventScroll:true});
});
document.querySelector('#navigation').addEventListener('click',e=>{
 const summary=e.target.closest('summary');
 if(summary&&matchMedia('(max-width: 650px)').matches){
   const sidebar=document.querySelector('.sidebar');
   if(!sidebar.classList.contains('mobile-expanded')){
     sidebar.querySelectorAll('details').forEach(group=>group.open=false);
     sidebar.classList.add('mobile-expanded');
   }
 }
});
function route(){
 PdfEditor.reset();
 Merge.reset();
 Tools.reset();
 state.files=[];state.phase='select';state.feedback='';
 clearTimeout(toastTimer);document.querySelector('#toast').classList.remove('visible');
 document.querySelector('.sidebar').classList.remove('mobile-expanded');
 const hash=location.hash.slice(1);const [type,id]=hash.split('/');
 state.tool=type==='tool'?tools.find(t=>t.id===id):null;
 document.querySelector('.prototype-label').textContent=state.tool?'本地处理':'全部工具已开放';
 main.className=state.tool?'page-workspace':'page-home';
 document.body.classList.toggle('workspace-open',Boolean(state.tool));
 state.group=state.tool?.group||(type==='category'&&groups.some(g=>g[0]===id)?id:'all');
 state.query='';document.querySelector('#tool-search').value='';navigation();if(state.tool)renderWorkspace();else renderHome();window.scrollTo(0,0);
}
window.addEventListener('hashchange',()=>{route();main.focus({preventScroll:true});});
route();
