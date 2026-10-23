# Image tools and document scanning acceptance

Validated 2026-10-23 against the packaged static site at `http://127.0.0.1:4194`, using local headless Chrome via CDP. No production deployment was performed.

## Implemented scope

- Two new tools: `#tool/image-tools` (batch JPG/PNG/WebP compression, resize, target KB, transparency, previews and ZIP) and `#tool/scan-document` (per-page four-corner perspective correction, rotation, optional bright-paper detection, image filters, image/PDF/TXT/searchable PDF exports).
- All 17 catalog tools have distinct local SVG paths in the same badge style; no external icon font or new npm dependency.
- Image decoding/pixel loops/encoding run in a cancellable local worker. Original files remain untouched. Scan crop editing supports pointer dragging, tap placement, arrow keys and numeric coordinates. Page reordering has buttons.
- Searchable PDFs embed a subset of the existing Noto Sans SC font and invisible OCR lines positioned over the scan image. Fontkit loads only for this output mode.

## Evidence

- `npm run build`: passed. Runtime-only packaging includes the new image scripts/style and lazy fontkit asset.
- `npm run test:images`: 6 tests passed, covering resize constraints, arbitrary projective geometry, crop sampling/alpha, filters, bright-sheet detection and invisible Unicode PDF text structure.
- `npm run test:pdf`: all 15 existing tests passed, including original-content editing and PDF-to-Word.
- `review/check-image-tools.mjs`: 29 real-browser checks passed, including actual target-50KB output, image dimensions/MIME, alpha preservation, JPG background, ZIP, corner dragging/keyboard, detection, rotation/reordering, binary scan pixels, actual Chinese/English/number extraction from exported PDF, TXT, cancellation/navigation, invalid inputs and responsive widths 375/812.
- `review/check-scan-outputs.mjs`: 6 additional checks passed: pixel-identical raster/searchable PDF rendering; projective photo rectification with independently defined colored landmarks; invalid numeric crop rejection; two-page PDF opening; duplicate filenames; corrupt image error/disabled processing.
- Network audit attached to nested workers, allowed only same-origin GET/HEAD, and reported no blocked requests, external origins, uploads or audit errors.
- Desktop image results and scan editor, mobile editor and perspective result screenshots were visually inspected. Generated evidence is under ignored `review/image-tools-results/`; screenshots are ignored `review/*.png`.

## Corrections during validation

- The first expected OCR character count in the unit fixture was incorrect (15 characters per line, 30 across two pages); corrected the expectation.
- Fixed quoting in the browser harness's JavaScript selectors, without changing site behavior.
- Invalid numeric coordinates now block processing before the editor is rerendered; sample generation is cancelled on navigation; large scan pixel buffers are downsampled before perspective interpolation.
- The corrupt-image check found settings control updates re-enabling the empty workspace's run button. Disabled-state handling now covers both run and preview, and both browser suites passed after packaging the fix.
- Sandbox restrictions blocked normal vendor overwrites, spawning Node test subprocesses and writing browser artifacts. Reviewed local build/test commands succeeded. No installed packages or global browser settings were changed.

## Limits

- Real physical phone camera hardware was not exercised. Native capture input and mobile emulation were checked. Browser/device support determines whether camera capture or a file picker opens.
- Chrome was exercised; Firefox/Safari implementations were not independently tested. Worker processing needs modern OffscreenCanvas/createImageBitmap support; unsupported encoding reports an error instead of writing PNG bytes under another extension.
- JPG/PNG/WebP still images only; no HEIC or animation preservation. Re-encoding may enlarge files. Target KB may reduce dimensions and is not guaranteed for very small limits.
- Bright-paper detection is a best-effort aid, not a general document vision model. Manual crop correction remains available. Glare, blur, large shadows and OCR mistakes need manual review.
- Input guard is 64 million pixels, general resize output guard is 32 million pixels, scan longest-edge choices are 1600/2400/3200. Actual usable size depends on device memory; preview uses at most 1400 pixels on the longest edge.
- OCR text is searchable/copyable, not native table reconstruction or original scanned-object editing. Unsupported font characters are reported and remain visible in the scan image.
- No new persistent document storage, full offline install, backend, upload endpoint or production deployment.

## Rerun

Build and serve `dist/`, start an isolated Chrome profile with CDP, then set `OFFICE_TEST_URL` and `OFFICE_CDP_URL` for the review scripts. Run `check-image-tools.mjs` before `check-scan-outputs.mjs`, as the latter compares files produced by the former. Set `OFFICE_NETWORK_AUDIT=1` and `OFFICE_AUDIT_FILE` for the first suite to audit nested workers. The local HTTP server only serves static assets.
