# Optional local sources

`local-sources/` is the only location for optional source exports and downloaded research. It is ignored by Git and is not read by the app or the packaging configuration. A clean checkout builds and loads the complete prepared database from tracked `resources/` alone.

```text
local-sources/
  README.md                  Navigation and storage rules
  index.json                 Original paths, exact hashes and current locations
  miro/
    export/                  Complete toolbar export, grouped by original board section
    api/                     Historical API inventory, download URLs and board JSON
    contact-sheets/          Six historical overview sheets
    downloads/               New API-only images, created only when needed
  research/
    evidence.json            Research provenance and observations
    source-code/             Saved examples and source excerpts
    style-architecture/      Style-workflow and adapter research
```

The complete export retains its seven original Russian section names, original filenames, text, `Файлы.json`, `Разделы.json` and export notes. All 185 PNGs already exist byte-for-byte under `resources/`, so their export entries are relative symbolic links to those canonical files. The old 120-card partial download tree is redundant and has no separate image copies. Its historical API manifest is retained unchanged; its old `art/...` paths describe the original download. `index.json` resolves every old path to its current file.

Two research excerpts differed from their corresponding Python files only by one trailing newline. They share the Python source file; their original hash and newline difference are retained in the index. No original artwork bytes, source documents or historical run data are changed.

## Maintenance

- `npm run prepare:library` imports the complete `local-sources/miro/export/` by default.
- `npm run prepare:references` reads that export by default and restores only the eight curated anchors.
- `npm run prepare:knowledge` reads that export by default and rebuilds the prepared corpus and clean sheets.
- Existing `SOURCE_EXPORT_DIR`, `REFERENCE_EXPORT_DIR`, `REFERENCE_ART_DIR` and explicit `REFERENCE_MANIFEST` overrides remain available. Restoring the historical partial API manifest requires the matching external originals through `REFERENCE_ART_DIR`; its original paths are not active project folders.
- `scripts/download_miro_art.py` reads API inputs under `local-sources/miro/api/`. Existing canonical images are reused; newly downloaded bytes use one SHA-256 filename under `miro/downloads/` until imported.

Do not recreate root `art/`, `Art Sources/` or `references/` folders. Store new material in the appropriate local section and reuse canonical images through links. Move newly accepted source bytes into `resources/` when preparing a distributed corpus and replace their local copies with links.

The local folder can be removed without affecting normal builds or app startup. Its image links depend on tracked `resources/`: to back up the full developer source context, preserve both together. Preparation and catalog-analysis commands are maintenance operations, not normal build steps; do not run model analysis merely to verify this layout.
