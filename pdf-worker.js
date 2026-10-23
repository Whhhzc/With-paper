self.onmessage = async ({ data }) => {
  const progress = value => self.postMessage({ type: 'progress', ...value });
  try {
    let result;
    if (data.action === 'scanPdf') {
      if (data.options.searchable) importScripts(data.options.fontkitUrl);
      result = await self.PdfScan.build(data.files, progress, data.options);
    } else result = data.action === 'word' ? self.PdfWord.build(data.options.pages, data.options.title) : await self.PdfMerge[data.action](data.files, progress, data.options);
    const transfers = result.bytes ? [result.bytes.buffer] : (result.entries || []).filter(entry => entry.bytes).map(entry => entry.bytes.buffer);
    self.postMessage({ type: 'complete', result }, transfers);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
