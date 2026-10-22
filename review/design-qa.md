# UI acceptance checks

Date: 2026-10-21

## Visual direction

Revision 3: follows the user's provided office-site screenshot: compact grouped left navigation, small solid colored file icons, white panel, centered tool icon/title, subtle pale-blue top and a blue file-selection action. Category colors: PDF red, images blue, OCR purple, batch green. Working product name: 纸间. All icons are local inline SVG, not generated images or copied third-party branding.

## Reviewed views

- home-desktop.png: 1440 × 1100, grouped tool sidebar and six common tools with solid file icons.
- merge-empty-desktop.png: file selection and settings.
- merge-desktop.png: sample file cards, order controls, processing action.
- result-desktop.png: explicitly simulated completion.
- ocr-desktop.png: example source document.
- ocr-result-desktop.png: source/text comparison, editing and example export.
- home-mobile.png and merge-mobile.png: 375 × 812 responsive views.

## Executed checks

Node syntax check passed. Headless installed Chrome tested through DevTools Protocol; results in checks.json.

- Search, no-result state, category navigation.
- Empty-state action disabled; sample file loading.
- File reordering and removal; local selection and invalid-format feedback.
- Simulated progress, cancellation, completion, honest download disclosure.
- Fixed OCR example result and editable text UI.
- Help modal and Escape dismissal.
- 375 × 812, 768 × 1024, 1024 × 768, 1440 × 900 across home, merge, OCR and rename: no horizontal overflow.
- Direct file URL works with browser network disabled.
- Reduced motion respected.
- No JavaScript exceptions or external network requests during checks.

## Scope and limits

This is a UI prototype, not a completed PDF/OCR product. Real document processing, real thumbnails, conversion parameter effects and model downloads are not implemented. OCR TXT export downloads the editable example text. File metadata and UI state live only in page memory.

Physical phones and Safari/Firefox were not tested; mobile checks use Chrome viewport emulation. Drag interactions have visible button alternatives. Full screen-reader and WCAG audit not performed.

## Iteration

Initial test query “文字” matched watermark descriptions too, so the expected count was incorrect. Used “提取文字” to verify OCR search. Visual review improved OCR to show original/example text together. Navigation now clears stale toasts and category filters update routes consistently.

Revision 2 reran the existing browser checks after restyling. All passed. Visually inspected updated desktop directory, mobile directory and merge empty state. Screenshots now reflect the second design.

Revision 3 supersedes the second design; screenshots now reflect the provided visual reference. Additional browser checks passed for shared header search, 12 sidebar icons, mobile category expansion and settings shown only after adding files. Removed duplicate search field. Visually inspected the final desktop merge view and mobile homepage after these changes. Existing responsiveness, offline, dialog and processing-demo checks also passed.
