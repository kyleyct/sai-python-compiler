// py-worker.js - SAi Python Compiler Web Worker v1.1
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.mjs';

let pyodide = null;

async function boot() {
  try {
    pyodide = await loadPyodide({
      stdout: (text) => self.postMessage({ type: 'stdout', data: text }),
      stderr: (text) => self.postMessage({ type: 'stderr', data: text }),
    });
    await pyodide.loadPackage(['numpy', 'pandas']);
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'boot_error', data: String(err) });
  }
}

self.onmessage = async (e) => {
  const { type, code, filename, content } = e.data;

  // ── 寫入 CSV 到虛擬檔案系統 ──
  if (type === 'upload_csv') {
    if (!pyodide) return;
    try {
      pyodide.FS.writeFile(filename, content);
      self.postMessage({ type: 'csv_loaded', data: filename });
    } catch (err) {
      self.postMessage({ type: 'error', data: '寫入 CSV 失敗：' + String(err) });
    }
    return;
  }

  // ── 執行 Python 程式碼 ──
  if (type === 'run') {
    if (!pyodide) {
      self.postMessage({ type: 'error', data: 'Pyodide not ready yet.' });
      return;
    }
    try {
      pyodide.globals.set('result', pyodide.toPy(null));
      await pyodide.runPythonAsync(code);
      const resultVal = pyodide.globals.get('result');
      if (resultVal !== null && resultVal !== undefined) {
        try {
          const isDF = pyodide.runPython(
            `import pandas as pd; isinstance(result, pd.DataFrame) if 'result' in dir() else False`
          );
          if (isDF) {
            const html = pyodide.runPython(
              `result.to_html(classes='df-table', border=0, max_rows=50)`
            );
            self.postMessage({ type: 'result', data: { type: 'dataframe', html } });
          } else {
            const strVal = pyodide.runPython(`str(result)`);
            self.postMessage({ type: 'result', data: { value: strVal } });
          }
        } catch (_) {
          self.postMessage({ type: 'result', data: {} });
        }
      } else {
        self.postMessage({ type: 'result', data: {} });
      }
    } catch (err) {
      self.postMessage({ type: 'error', data: String(err) });
    }
    self.postMessage({ type: 'done' });
  }
};

boot();
