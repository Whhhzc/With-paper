# PDF merge acceptance

Date: 2026-10-21

## Implemented

Actual File objects are inspected and merged by pdf-lib 1.17.1 in a local Blob Worker. The generated worker asset includes the library, engine and message handler, so neither CDN requests nor file uploads are used. Direct file:// opening is supported. Worker termination provides real cancellation, including navigation away from the tool.

Users can add/remove/reorder files, sort by filename, see page counts, open originals, name the output, download and open the merged PDF. Examples are genuine generated PDFs. Result and source object URLs are revoked when discarded.

## Executed verification

- `node --test tests/pdf-merge.test.cjs`: 3 tests passed; merge/order/geometry/source preservation, invalid inputs, real example PDFs.
- `review/verify-merged-pdf.py`: independent PDFium renders all four merged pages pixel-identically to their corresponding original pages, including portrait/landscape, 90-degree rotation, crop boxes, vector shapes and embedded PNG. PDFium and pdfminer both verify text and order.
- `review/check-merge.mjs`: real browser file picker inputs, real Blob Worker merge, actual browser download, filename normalization, file sorting, cancelling, navigation cancellation, clearing, mobile layout and offline file:// execution passed.
- The actual browser-downloaded `browser-merged-B-A.pdf` independently passed the same PDFium/pdfsminer page-content check.
- `review/check-ui.mjs`: remaining demo tools, global search/help and 16 viewport/route combinations passed after the integration.
- Browser checks recorded no unhandled JavaScript exceptions, file uploads or external HTTP requests. Static resources are local GET requests; PDF inputs/outputs stay in memory or are downloaded locally.

Evidence: `merge-browser-checks.json`, `merge-fixtures/*-verification.json`, `merge-live-empty.png`, `merge-live-files.png`, `merge-live-result.png`, `merge-live-mobile.png`.

## Explicit limits

- No PDF thumbnails yet: the file card honestly shows PDF type/page count and opens the original in the browser viewer.
- Encrypted documents are rejected; no encryption bypass. The automated encryption case is a synthetic PDF with an encryption dictionary, validating refusal and messaging, not password decryption.
- Interactive form and signature fields are rejected because copying pages does not copy the document-level AcroForm structure.
- Document-level outlines/bookmarks are not retained. This is stated on the tool page.
- Tests cover generated PDFs with ordinary page text, graphics and an image; not every PDF producer, annotation type, embedded attachment or huge-file workload.
- Desktop Chrome and viewport emulation tested; no physical phone/Safari test.

## Issues resolved

- npm cache-only mode initially lacked pdf-lib; approved network installation completed.
- Node's test runner required permission to spawn its test subprocess.
- pdf-lib's compiled Error subtype did not preserve `instanceof`; encrypted-file error recognition now compares the pinned library's own error message.
- Existing UI check used a fixed 350ms navigation delay, too short on the first load of the bundled engine. Replaced it with page readiness polling.
