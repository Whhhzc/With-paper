/* A dedicated owner worker lets cancellation terminate OCR and its nested worker. */
self.onmessage = async ({ data }) => {
  const { files, options } = data;
  let worker;
  try {
    importScripts(`${options.base}tesseract.min.js`);
    const progress = (label, done, total) => self.postMessage({ type: 'progress', label, done, total });
    progress('正在加载本地文字识别引擎与语言模型…', 0, files.length);
    let index = 0;
    worker = await Tesseract.createWorker(options.language, 1, {
      workerPath: `${options.base}worker.min.js`,
      corePath: options.base,
      langPath: `${options.base}lang/`,
      gzip: true,
      logger: event => {
        if (event.status === 'recognizing text') progress(`正在识别第 ${index + 1} / ${files.length} 页`, index + event.progress, files.length);
      },
      errorHandler: () => {},
    });
    const entries = [];
    for (index = 0; index < files.length; index++) {
      const { data: result } = await worker.recognize(new Uint8Array(await files[index].arrayBuffer()), {}, { text:true, blocks:Boolean(options.layout) });
      const entry={ name: files[index].name, text: result.text, confidence: result.confidence };
      if(options.layout)entry.blocks=(result.blocks||[]).map(block=>({paragraphs:block.paragraphs.map(paragraph=>({lines:paragraph.lines.map(line=>({text:line.text,confidence:line.confidence,bbox:line.bbox,rowAttributes:line.rowAttributes}))}))}));
      entries.push(entry);
      progress(`已识别 ${index + 1} / ${files.length} 页`, index + 1, files.length);
    }
    await worker.terminate();
    self.postMessage({ type: 'complete', result: { entries } });
  } catch (error) {
    if (worker) await worker.terminate();
    self.postMessage({ type: 'error', message: `文字识别失败：${error.message || error}。请检查文件，或重新打开本地预览页面。` });
  }
};
