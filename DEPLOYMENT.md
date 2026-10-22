# GitHub → Vercel

This is a static website. PDF editing, conversion and OCR run in the user's browser. Vercel only serves the website, worker scripts, fonts and models; there is no application processing backend or database.

## Recommended repository

Create a dedicated GitHub repository for the contents of `prototypes/office-tools`. Its root should contain `package.json`, `package-lock.json`, `vercel.json`, the application files, `scripts/`, `licenses/` and `vendor/`.

Do not publish the surrounding backend repository just to deploy this website. `node_modules/`, `dist/`, browser profiles and test downloads are ignored. The `review/`, `tests/` and planning files are development material and are not copied into the deployed `dist/` output.

## Import in Vercel

1. Add New → Project → import the GitHub repository.
2. For a dedicated repository, use repository root as Root Directory. If using the existing repository, set Root Directory to `prototypes/office-tools`.
3. Framework Preset: **Other**.
4. Node.js: **24.x**.
5. Install Command: **npm ci**.
6. Build Command: **npm run build**.
7. Output Directory: **dist**.

The included `vercel.json` sets the framework and build/install/output options. No environment variables or API keys are required for the current features. Git-connected deployments can update automatically after pushes.

## Local release preview

```powershell
npm run build
python -m http.server 4187 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4187`. Test PDF merge, original-content editing and Chinese/English OCR from this release directory. Routes use URL fragments (`#tool/...`), so no SPA rewrite is needed.

The runtime assets are approximately 44 MiB, including local WASM engines, fonts and language models; the largest individual asset is about 8.1 MiB. Initial editor/OCR loading depends on the visitor's network, and downloaded assets count toward hosting bandwidth. User documents themselves are never uploaded.

Keep third-party notices with the deployed files. Configuration/build verification locally is not a completed Vercel deployment: account access and repository import are still needed to obtain a public URL.

Official references:
- https://vercel.com/docs/git
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/project-configuration/vercel-json
