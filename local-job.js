/* A cancellable local worker job, shared by PDF editing, ZIP and OCR. */
class LocalJob {
  constructor(source) { this.source = source; this.task = null; }
  cancel() {
    if (!this.task) return;
    this.task.worker.terminate();
    this.task.reject(new DOMException('Cancelled', 'AbortError'));
    this.task = null;
  }
  run(action, files, options = {}, progress = () => {}) {
    this.cancel();
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([this.source], { type: 'application/javascript' }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      const task = { worker, reject };
      this.task = task;
      const finish = () => { worker.terminate(); if (this.task === task) this.task = null; };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') progress(data);
        else { finish(); data.type === 'error' ? reject(new Error(data.message)) : resolve(data.result); }
      };
      worker.onerror = event => { event.preventDefault(); finish(); reject(new Error('本地处理未能完成，请重试或减少本次文件数量。')); };
      worker.postMessage({ action, files, options });
    });
  }
}
