import { init } from '@embedpdf/pdfium';
import { createContentEngine } from './content-engine.mjs';
let engine;
self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.action === 'open') {
      const [wasm, font] = await Promise.all([fetch(`${data.base}pdfium.wasm`).then(response => response.arrayBuffer()), fetch(`${data.base}NotoSansSC-Regular.otf`).then(response => response.arrayBuffer())]);
      const module = await init({ wasmBinary: wasm }); module.PDFiumExt_Init();
      engine = createContentEngine(module, new Uint8Array(font)); result = engine.open(new Uint8Array(await data.file.arrayBuffer()));
    } else if (data.action === 'inspect') result = engine.inspect(data.page);
    else if (data.action === 'preview') result = engine.preview(data.changes, data.view);
    self.postMessage({ id: data.id, result }, [result.bytes?.buffer, result.editBytes?.buffer].filter(Boolean));
  } catch (error) { self.postMessage({ id: data.id, error: error.message || 'PDF 内容处理失败。' }); }
};
