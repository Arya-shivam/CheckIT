/**
 * resume-parser.js
 *
 * Provides window.resumeParser with two methods:
 *   - extractTextFromPdfDataUrl(dataUrl)  → Promise<string>
 *   - extractTextFromDocxArrayBuffer(buf) → Promise<string>
 *
 * Libraries used (bundled locally, no CDN calls):
 *   - pdf.min.mjs        (PDF.js v4 ESM build, Mozilla)
 *   - pdf.worker.min.mjs (PDF.js worker, same version)
 *   - mammoth.browser.min.js (mammoth.js DOCX parser)
 *
 * Both scripts are declared in popup.html before this file.
 * PDF.js is loaded as an ES module via a <script type="module"> shim,
 * then attached to window.pdfjsLib so this IIFE can consume it.
 */

(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function dataUrlToUint8Array(dataUrl) {
    const base64 = (dataUrl || '').split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function cleanText(raw) {
    return (raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')       // collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n')        // collapse excessive blank lines
      .trim();
  }

  // ── PDF Extraction via PDF.js ───────────────────────────────────────────────

  /**
   * Waits up to ~3 s for the ESM shim to attach pdfjsLib to window.
   * The shim in popup.html does:
   *   import * as pdfjs from './pdf.min.mjs';
   *   window.pdfjsLib = pdfjs;
   */
  function waitForPdfJs(maxMs = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        const lib = window.pdfjsLib
          || window['pdfjs-dist/build/pdf']
          || window.pdfjs;
        if (lib && lib.getDocument) return resolve(lib);
        if (Date.now() - start > maxMs) {
          return reject(new Error(
            'PDF.js did not initialise. Make sure pdf.min.js is in the extension folder.'
          ));
        }
        setTimeout(poll, 80);
      })();
    });
  }

  async function extractTextFromPdfDataUrl(dataUrl) {
    const pdfjs = await waitForPdfJs();

    // Tell PDF.js where its worker lives (same extension directory).
    // chrome.runtime.getURL works in both popup and content script contexts.
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
    }

    const data = dataUrlToUint8Array(dataUrl);

    let pdf;
    try {
      const loadingTask = pdfjs.getDocument({ data });
      pdf = await loadingTask.promise;
    } catch (err) {
      throw new Error(`PDF.js failed to load document: ${err.message}`);
    }

    const pageTexts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // content.items is an array of TextItem objects.
      // Join with spaces; insert newline on large vertical gaps.
      let lastY = null;
      const lineFrags = [];
      for (const item of content.items) {
        if (!item.str) continue;
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(lastY - y) > 5) {
          lineFrags.push('\n');
        }
        lineFrags.push(item.str);
        lastY = y;
      }
      pageTexts.push(lineFrags.join(' '));
    }

    const combined = cleanText(pageTexts.join('\n\n'));

    if (!combined || combined.length < 80) {
      throw new Error(
        'Could not extract enough text from this PDF. ' +
        'It may be scanned/image-based. Please paste your resume text instead.'
      );
    }

    return combined;
  }

  // ── DOCX Extraction via mammoth.js ──────────────────────────────────────────

  /**
   * Waits up to ~3 s for mammoth to be available on window.
   * Mammoth is a regular script (non-module) so it self-attaches immediately,
   * but we guard just in case of load-order issues.
   */
  function waitForMammoth(maxMs = 3000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        if (window.mammoth) return resolve(window.mammoth);
        if (Date.now() - start > maxMs) return reject(new Error('mammoth.js did not initialise in time.'));
        setTimeout(poll, 50);
      })();
    });
  }

  /**
   * @param {ArrayBuffer} arrayBuffer  – raw bytes of the .docx file
   * @returns {Promise<string>}
   */
  async function extractTextFromDocxArrayBuffer(arrayBuffer) {
    const mammoth = await waitForMammoth();

    let result;
    try {
      result = await mammoth.extractRawText({ arrayBuffer });
    } catch (err) {
      throw new Error(`mammoth.js failed to parse DOCX: ${err.message}`);
    }

    if (result.messages && result.messages.length) {
      console.warn('[resumeParser] mammoth warnings:', result.messages);
    }

    const text = cleanText(result.value || '');
    if (!text || text.length < 80) {
      throw new Error(
        'Could not extract enough text from this DOCX. ' +
        'The file may be empty or heavily image-based.'
      );
    }

    return text;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  window.resumeParser = {
    extractTextFromPdfDataUrl,
    extractTextFromDocxArrayBuffer,
  };
})();