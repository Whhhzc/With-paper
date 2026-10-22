# Original-content PDF editor acceptance

Date: 2026-10-21

## Delivered behavior

The desktop UI now displays PDF pages on both sides. Clicking original text in the left canvas opens an in-place editor; a compact toolbar edits font/color or adds a native paragraph underneath. Images and paths are selected directly on the page. The right pane renders the actual resulting PDF. There are no page rearrangement controls. Page navigation changes only the viewed page.

The native PDFium worker reopens the original bytes for each edit set and modifies/removes those existing objects. Unchanged objects/pages remain intact. It reuses source fonts where characters are available and uses an embedded open Noto Sans SC font otherwise. Native text remains searchable/selectable; ActualText metadata preserves exact Unicode when compatible glyph forms share a glyph.

The right pane renders the serialized result through PDF.js. The download uses the very same Blob bytes, not a separate export pipeline. While edits are queued, rendering is pending, or input cannot be represented, download and the preview link are disabled. Rapid edits are coalesced and stale results are discarded.

## Verified

- Native engine tests passed Latin text replacement, Chinese native text replacement, old-text removal, image replacement, graphic color editing, deletion and preserved page rotation/crop geometry.
- Complete PDF engine test run: 10 tests passed, including the existing merge and phase-one tests.
- `review/check-content-editor.mjs` passed original text loading, live preview changes, undo/redo, Chinese editing, exact preview/download byte equality, rapid typing using the latest version, multi-page edits, image replacement, original-text deletion, original-content restoration, invalid font-size and unsupported-character handling, preserving current edits after an invalid replacement file, and navigation cleanup.
- Loaded layout checks passed at 375, 768, 1024 and 1440 CSS pixels. On narrow screens editing and preview stack vertically.
- `review/verify-content-editor.py` passed 10 independent PDFium checks: original text is absent, replacement Chinese text can be extracted, unaffected body rendering and the rotated/cropped second page remain pixel-identical, image changes stay inside the original image frame, and rapid/multi-page edits are correct.
- The actual browser download is byte-identical to the Blob rendered in the right pane.
- The existing real merge/download/offline regression passed after integration.
- Browser checks reported no unhandled JavaScript exceptions, uploads or external HTTP requests. Native worker source, WASM and font resources are local to the website.

Evidence: `content-editor-results/browser-checks.json`, `content-editor-results/independent-checks.json`, `content-editor-desktop.png`, `content-editor-mobile.png` and generated PDFs under `content-editor-results/`.

## Material limits

- Existing top-level text/image/path objects are editable. Nested Form XObjects and special drawing objects are explicitly read-only, not silently flattened or guessed.
- Image-only scan text is not treated as editable native text. The page image may be replaced; OCR extraction remains a separate tool.
- Text stays at its original position. This is not a Word-style reflow engine; long/multiline text can overlap later content and must be checked in the live preview.
- Font substitution is disclosed when needed. Embedding the full fallback font can enlarge output files. Unsupported characters stop the preview rather than producing an apparently successful stale download.
- Encrypted documents, interactive forms and signatures remain unsupported. The source file is not overwritten.
- Tested with ordinary generated PDFs, mixed page sizes/rotation/cropping and known text/image/path content in Chrome. Not a claim of support for every PDF producer, advanced shaping or physical mobile/Safari environment.
- Inserting a paragraph does not automatically push subsequent original content down or create new pages. Gap, horizontal offset and font size are adjustable; users must check for overlaps.

## Inline editing, Locate and insertion update

- Reproduced the Locate failure: `previewViewport.convertToViewportRectangle is not a function`. Installed PDF.js exposes `convertToViewportPoint`; the implementation now transforms all four corners, handles rotation/cropping and centers the marker in the preview scroll area. Pending locate clicks are replayed after the preview completes.
- Removed the left text-card list. The left pane is a real PDF canvas with clickable content regions, an in-place text editor, selection toolbar and zoom. For selected text, a temporary editor-only PDF omits that text so the input does not overlap its old glyphs; the right preview and download always use the complete final PDF, never the temporary edit-surface bytes.
- Added native paragraphs below original or newly added paragraphs, retaining exact Unicode and native reading order. Existing objects/pages are preserved; inserted text can be edited, deleted and restored through undo/redo.
- Four native editor tests passed, including paragraph output, reading order and separation of edit-surface/final bytes.
- `check-inline-editor.mjs` passed actual mouse selection on the PDF, direct typing, pending/rotated/image Locate, marker coverage of actual rendered glyphs, paragraph insertion/deletion/undo, zoom, three viewport widths and exact preview/download equality.
- Updated `check-content-editor.mjs` passed the existing full editor regression using on-page selection: original edits, preview, undo/redo, images, deletion, multiple pages, invalid inputs and responsive layouts.
- `verify-inline-editor.py` passed six independent checks: inserted Chinese is native text in the intended reading order, lower-page content and untouched rotated/cropped pages remain pixel-identical, paragraph deletion is selective, rotated-page inline changes are real, and the downloaded file equals the preview.
- Evidence: `inline-editor-desktop.png`, `inline-editor-mobile.png`, `content-editor-results/inline-checks.json`, `inline-independent-checks.json` and generated `inline-*.pdf` files.

## Build and verification corrections

- Module-worker output preserves PDFium's import.meta-based local WASM path; an initial classic-worker build produced an invalid resource URL and was corrected before acceptance.
- FontKit's published package declares MIT but includes no standalone LICENSE; builds retain its actual README and metadata instead of attempting to copy a missing file. The Noto OFL source notice is retained separately.
- The earlier annotation-oriented work was removed after the user clarified the requirement; this delivery modifies original native objects.
