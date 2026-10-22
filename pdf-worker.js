self.onmessage = async ({ data }) => {
  const progress = value => self.postMessage({ type: 'progress', ...value });
  try {
    const result = await self.PdfMerge[data.action](data.files, progress, data.options);
    const transfers = result.bytes ? [result.bytes.buffer] : (result.entries || []).filter(entry => entry.bytes).map(entry => entry.bytes.buffer);
    self.postMessage({ type: 'complete', result }, transfers);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
