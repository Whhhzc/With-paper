# PDF to Word acceptance

Implemented a frontend-only PDF-to-DOCX tool at `#tool/pdf-word`. No new dependency or conversion backend is required. Runtime resources remain local to the site.

Native PDF text is read directly with its Unicode mapping, font/style metadata, color, geometry and rotation. Editable DrawingML text boxes preserve page placement; a separately rendered page backdrop preserves graphics and table borders without duplicating native text. Scans use existing local Chinese/English OCR and are reconstructed by line. Mixed pages have an explicit image-text OCR option.

## Verified

- Production build succeeded. All 15 Node PDF/Word tests passed.
- 21 browser checks passed from `dist`: exact Chinese/English text and amounts, columns, native/scanned/mixed pages, rotated/cropped page, range and invalid range, custom DOCX name, cancel/navigation, batch ZIP, desktop/mobile and no observed external requests.
- Microsoft Word opened and rendered three generated DOCX files with the expected page counts (3, 1, 1). A title was edited and saved to DOCX and PDF, proving actual editability.
- Actual Word-rendered PDF retains native Chinese and numeric text. The sample title matches the PDF's X/Y baseline and font size exactly. The 30-degree text remains an editable rotated shape in Word's saved DOCX; Word outlines it when exporting PDF. Native and scanned page renders were visually inspected.
- Six independent standard-library XML/ZIP/PNG checks passed: valid parts/CRC, native and OCR text, page dimensions/styles/text boxes, native text absent from background, artwork/table pixels retained, and Word-saved edited title with Chinese preserved.

Evidence is in `review/pdf-word-results/`: `browser-checks.json`, `independent-checks.json`, `word-interop.json`, `render-checks.json`, source PDF/DOCX and Word-rendered PDF files. Screenshots: `review/pdf-word-result.png`, `review/pdf-word-mobile.png`, `review/pdf-word-source-1.png`, `review/pdf-word-word-1.png`, `review/pdf-word-source-3.png`, `review/pdf-word-word-3.png`.

## Scope and limitations

Text is editable in positioned boxes; paragraphs do not automatically reflow. Tables retain their visual rules and positioned text, not native Word cells. Illustrations are retained in the backdrop. Original PDF fonts are not embedded in DOCX and may be substituted. OCR, unusual fonts, formulas, vertical text, complex transparency/clipping and overlaid artwork can differ and need checking. Pages longer than Word's 22-inch limit are rejected with guidance. WPS-specific rendering was not independently tested.

The site was not pushed or deployed. Local release preview: `http://127.0.0.1:4194/#tool/pdf-word`.

## Repeat checks

Run `npm run build` and `npm run test:pdf`. Serve `dist` locally, launch a test Chrome CDP session, and set `OFFICE_TEST_URL` / `OFFICE_CDP_URL` before `node review/check-pdf-word.mjs`. On Windows with Word installed, `cscript //Nologo //B review/verify-pdf-word.vbs` produces Word-rendered comparison files. `review/compare-pdf-word.mjs` uses a source-root localhost preview to read those review files; `python review/verify-pdf-word.py` performs independent package checks.
