# Locally distributed components

All runtime assets are served with this website. No CDN is required for file processing.

| Component | Version | License | Source / local notice |
|---|---|---|---|
| pdf-lib | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib ; vendor/pdf-lib-LICENSE.md |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate ; vendor/fflate-LICENSE |
| PDF.js / pdfjs-dist | 6.4.299 | Apache-2.0 | https://github.com/mozilla/pdf.js ; vendor/pdfjs/LICENSE |
| Tesseract.js | 7.0.0 | Apache-2.0 | https://github.com/naptha/tesseract.js ; vendor/ocr/LICENSE-tesseract.md |
| Tesseract.js-core | 7.0.0 | Apache-2.0 | https://github.com/naptha/tesseract.js-core ; vendor/ocr/LICENSE-core |
| English and Simplified Chinese traineddata | @tesseract.js-data packages, 4.0.0_best_int | Apache-2.0 | https://github.com/naptha/tessdata ; vendor/ocr/lang/LICENSE-APACHE-2.0 |
| @embedpdf/pdfium | 2.15.1 | MIT wrapper / Apache-2.0 PDFium | https://github.com/embedpdf/embed-pdf-viewer ; vendor/content/LICENSE and LICENSE.pdfium |
| @pdf-lib/fontkit | 1.1.1 | MIT | https://github.com/Hopding/fontkit ; vendor/content/fontkit-NOTICE.md and fontkit-package.json retain upstream license declaration |
| Noto Sans SC font | @fontsource/noto-sans-sc 4.5.12 | SIL OFL-1.1 font / MIT package | https://github.com/google/fonts/tree/main/ofl/notosanssc ; vendor/content/OFL-NotoSansSC.txt |

Language data is from the installed `@tesseract.js-data/eng` and `@tesseract.js-data/chi_sim` packages (versions recorded in package-lock.json). Copyright remains with the model contributors. The interrupted raw GitHub model download is not used or distributed.

PDF.js font, CMap and decoder directories retain their upstream license files. Tesseract's distributed worker bundles retain their generated LICENSE.txt notices. esbuild is a development-only bundler and is not loaded by the website.

The content editor is loaded on demand. Its font build losslessly unpacks the upstream WOFF1 container into the original OpenType tables; font outlines and names are unchanged. The fontkit package/repository has no standalone LICENSE file; its shipped README and package metadata declare MIT and are retained. Noto's full OFL notice is kept in licenses/ and copied during builds.
