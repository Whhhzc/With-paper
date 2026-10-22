# Static deployment feasibility validation

Date: 2026-10-21. Scope: local validation only; no GitHub push, repository creation, Vercel login/link or public deployment.

## Result

The current 14-tool application runs as a frontend-only static site. A fresh source-only copy successfully installed its locked dependencies and built its complete runtime assets. All tools then ran from that copy's isolated dist directory, served by a plain localhost static-file server.

The static server served HTML/JS/WASM/fonts/models only. It had no application API, upload endpoint, PDF conversion process, OCR process or database. The browser performed all document operations.

## Build proof

- Fresh directory: `review/deploy-validation/clean-source`, initially with no node_modules, vendor or dist.
- Copied application/build sources, lockfile and license sources only; did not reuse prebuilt vendor files.
- `npm ci --offline` installed from the existing package cache using the lockfile; `npm run build` succeeded.
- Fresh output: 239 files, 43.29 MiB; largest asset 8.07 MiB. No review or node_modules directory in the site.
- Tested at `http://127.0.0.1:4190`, separate from the development/release-preview origins.

## Functional proof

- PDF merge and an actual browser download passed; independent PDFium/pdfminer checks confirmed four source pages, text order and matching rendering.
- PDF splitting, extraction, rotation, deletion, sorting, Chinese watermark addition/removal, batch watermark, images to PDF, PDF to PNG/JPG and batch rename passed the existing 16-flow browser suite.
- Image OCR, scanned-PDF OCR, Chinese and English text, edited TXT downloads and batch OCR ZIP passed, including a cold start with origin storage cleared.
- Native PDF canvas editing, paragraph insertion/deletion/undo, location on text/images/rotated pages, zoom, live preview and exact preview/download byte equality passed.
- Independent checks passed for 15 phase-one outputs and 6 inline-editor outputs. The deployed artifact was exercised, not a source-folder development server.

## Network proof

Monitored the page and recursively attached workers, including nested Tesseract workers. Cross-origin HTTP/HTTPS URLs were blocked for page/worker targets. Main-page HTTP writes were intercepted; methods were observed for all targets.

- 230 observed requests across four suites and 66 attached worker targets.
- No external-origin requests, HTTP writes/uploads, audit errors or failing HTTP responses in the final runs.
- Both Chinese and English traineddata downloads were observed from the isolated site's own `/vendor/ocr/lang/` paths inside the OCR worker.
- JavaScript, fonts and WASM resources also resolved from the isolated origin.

Raw evidence: `review/deploy-validation/*-network.json`, `network-summary.json`, `merge-check.json` and the existing feature-suite output reports.

## What this does not prove

- There has been no end-to-end GitHub → Vercel cloud deployment. GitHub authentication/permissions, Vercel account/import settings, Linux build-host execution, CDN headers/cache behavior and public-network accessibility have not been exercised.
- The clean installation used the local npm cache on Windows/Node 24; Vercel's fresh registry downloads and Linux build remain an actual-deployment check.
- Device/browser limits remain: current functional verification uses desktop Chrome; OCR needs model loading, and larger documents consume client CPU/memory.
- Existing feature limits remain unchanged: no general removal of flattened watermarks, no Word-style reflow, and scanned/unsupported nested text is not directly editable.

Conclusion: static hosting is locally demonstrated to support the full implemented feature set. The repository/build configuration is prepared for Vercel, but a public deployment is intentionally pending user authorization.
