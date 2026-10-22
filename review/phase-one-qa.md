# Phase-one acceptance

Date: 2026-10-21

## Delivered scope

All 13 tools now process real local files: PDF merge, split/extract, rotate, delete pages, reorder pages, add text watermark, remove recognized independent watermarks, images to PDF, PDF to PNG/JPG, image OCR, scanned-PDF OCR, batch rename and batch watermark. There are no simulated processing/results paths left in the application.

The accepted UI is retained. Page tools have actual rendered thumbnails, selection checkboxes and reorder controls. Multi-output tools export individual files and a ZIP. OCR supports Simplified Chinese/English, editable results, original per-page text, and batch ZIP export. The original PDF merge controller now shares the cancellable worker transport with the other tools.

## Executed checks

- 7 Node tests passed across `tests/pdf-merge.test.cjs` and `tests/phase-one.test.cjs`: page content/geometry, ranges, splitting, rotation, deletion, sorting, Unicode watermark labels, independent watermark removal, standard watermark annotations, image-to-PDF, ZIP bytes, bad/empty/encrypted/form inputs and real samples.
- `check-phase-one.mjs`: 16 browser flows passed with actual saved PDF, PNG, JPG and ZIP artifacts. Includes range and deletion validation, unsupported watermark detection, ordering controls and conversion cancellation.
- `check-ocr.mjs`: real image and scanned PDF each recognized Chinese “办公会议记录” and English “Office meeting notes”; edited TXT downloads and two-image OCR ZIP verified.
- `verify-phase-one.py`: 15 independent PDFium/Pillow/ZIP/text checks passed. Extracted/deleted/sorted/cleaned pages render identically to their corresponding sources. Rotated font rendering uses a small average pixel tolerance for PDFium antialiasing (observed about 0.115 / 255), while selected rotation and content are checked separately. Added Chinese watermarks visibly change pages; removing them restores original rendering and body text.
- Rename ZIP entries have the expected Chinese names and exactly the original bytes. Split ZIP contains four actual single-page PDFs. PNG/JPEG exports have correct 144 DPI dimensions and matching visible content.
- `check-ui.mjs`: 34 loaded tool/viewport combinations passed at 375, 768, 1024 and 1440 widths. Search, help, keyboard dismissal, mobile category navigation, checkbox clearing/typed ranges, typed page-order previews, OCR initialization cancellation and navigation cancellation passed.
- Existing `check-merge.mjs` regression passed actual file selection, sorting, cancellation, browser download, output naming, mobile layout and offline file:// merge.
- An additional 100-page input check confirmed cancellation during partial thumbnail generation retains the source and usable controls. After cancellation/navigation, the browser target list contained no leftover dedicated worker targets.
- Captured page/network checks reported no unhandled JavaScript exceptions, external HTTP requests or file-upload requests. PDF and OCR paths explicitly use locally bundled assets, model files and worker URLs.

## Evidence

- `phase-one-results/browser-checks.json`, `ocr-checks.json`, `independent-checks.json`.
- `live-ui-checks.json`, `merge-browser-checks.json`.
- Actual PDFs, ZIPs, rendered images and recognized/edited text under `phase-one-results/`.
- Screenshots: `phase-one-page-sort.png`, `phase-one-watermark-comparison.png`, `phase-one-ocr-image.png`, `phase-one-ocr-pdf.png`, `phase-one-rename.png`, `phase-one-mobile-pages.png`, `phase-one-mobile-rename.png`.

## Limits

- Watermark removal supports standard PDF `/Watermark` annotations and standalone watermark content streams explicitly tagged by this app. Users select candidates and can inspect a before/after page comparison. It does not erase arbitrary unmarked text/graphics or reconstruct pixels beneath a flattened image watermark.
- PDF inputs containing encryption or interactive form/signature fields are rejected. Document-level outlines/bookmarks are not preserved by page copying/extraction/reordering.
- OCR accuracy depends on source quality and layout; manual review remains necessary. Language data is local to the website and may be cached by the browser; documents/results are not stored on the server.
- The complete toolset should be served over HTTP/HTTPS. OCR displays a clear message for direct file:// opening because loading the local WebAssembly/model resources requires a web origin. PDF merge still works directly offline.
- Device memory limits practical document/image batch size. No arbitrary universal large-file capacity is claimed.
- Tests use installed desktop Chrome and viewport emulation, not physical mobile devices or Safari/Firefox. PDF cases include generated text/images/rotation/cropping and known watermark structures, not every PDF producer.

## Issues fixed during implementation

- GitHub raw-model transfer timed out with a partial file. Replaced it with the official npm language-data packages; the partial file was removed.
- Adapted PDF.js 6 document cleanup to `loadingTask.destroy()` with explicit worker ownership; corrected a local variable shadowing the DOM `document` during rendering.
- Browser checks now force a fresh document at session start to avoid evaluating a previous script revision on hash-only navigation.
- The initial OCR batch test appended to an existing file list; the test now clears the list before its independent batch case.
- Fixed page-selection re-enabling after typing a range, typed-order thumbnail updates, stale rename validation text, and usable fallback file controls when thumbnail generation is cancelled.
- Full original and new PDF unit tests, feature tests, OCR checks, independent output verification, UI layouts and merge regression passed after the relevant corrections.
