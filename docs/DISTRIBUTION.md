# Desktop distribution

The downloadable application is a GitHub Release asset, separate from Git source history and the documentation website. GitHub permits individual release assets below 2 GiB, which accommodates this application. See [GitHub's release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas).

Use this stable asset name for every release:

```text
Collection-Studio-mac-universal.zip
```

The README and any website download button can use:

```text
https://github.com/bolotnikov/collection-studio/releases/latest/download/Collection-Studio-mac-universal.zip
```

This URL follows the latest published non-prerelease release. A draft is not a public download. Each published release also has an immutable version-specific asset URL. Keep its tag and assets unchanged after delivery. Never add packaged archives to Git, Git LFS, or the website's static assets.

## Platform and first launch

The universal target is macOS 13 Ventura or later on Intel and Apple Silicon. Electron 45 requires macOS 13+; see [Electron compatibility](https://www.electronjs.org/docs/latest/breaking-changes#removed-macos-12-support). Older Macs that cannot run macOS 13 are outside this release target. The archive contains `Collection Studio.app` and the bilingual `START-HERE.txt`, sourced from [FIRST_LAUNCH.txt](FIRST_LAUNCH.txt). Electron, native production dependencies, and the prepared reference/knowledge resources ship inside the app. No source compilation is needed by the recipient.

Generation requires a separately installed Codex CLI, ChatGPT sign-in, account/model/image-tool access, and available limits. The app can open and display its bundled library without CLI authentication. New set and Settings display localized connection guidance; generation remains disabled. The connection test makes no model request and does not establish model or image-tool compatibility.

Current packages use ad-hoc signing for bundle integrity. **They do not have a trusted Apple Developer ID signature or notarization.** macOS may require an explicit first-launch exception. Do not present this preview as a universally frictionless installation. Follow [Apple's instructions](https://support.apple.com/102445); do not instruct recipients to disable Gatekeeper or remove quarantine recursively. A trusted release requires access to the publisher's Apple Developer ID certificate and notarization credentials, a separately approved signing configuration, and verification of the notarized downloaded artifact.

## Verify and package

Run on an Apple Silicon Mac:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run package:mac
```

`package:mac` builds production code and packages into a temporary directory outside `release/`, explicitly disabling publishing. The script installs isolated production dependencies and integrity-checks the two locked Intel native image packages, then builds both Electron architectures into one universal app. It verifies both executable slices, both native image-library variants, the ad-hoc signature and required resources, creates and tests the ZIP, and computes SHA-256. Build dependencies and the working node_modules directory are not changed. Only then does it replace `release/` with:

```text
release/
  mac-arm64/Collection Studio.app
  Collection-Studio-mac-universal.zip
  SHA256SUMS.txt
```

The canonical app directory retains its historical `mac-arm64` name, but now contains the universal app. The previous local release is retained until replacement succeeds; obsolete outputs and temporary packaging files are removed. The entire release directory remains ignored by Git. Do not run generation or resume historical runs to validate packaging. Local signature/archive validation does not establish Gatekeeper acceptance on another computer.

## Publish a verified version

Commit only intended source, documentation, and packaging changes after verification. Create the release against that exact pushed commit; do not tag unrelated uncommitted website work. Attach the ZIP and `SHA256SUMS.txt`. Release notes must identify the target platform, CLI/login dependency, signing/notarization status, and validation limits.

Stage a draft first, using an unused tag matching the application's package version and the verified commit SHA:

```sh
gh release create v0.1.0 \
  release/Collection-Studio-mac-universal.zip \
  release/SHA256SUMS.txt \
  --repo bolotnikov/collection-studio \
  --target VERIFIED_COMMIT_SHA \
  --title 'Collection Studio 0.1.0 · macOS Universal' \
  --notes-file RELEASE_NOTES_PATH \
  --draft
```

After publication is authorized, publish the draft with `gh release edit v0.1.0 --draft=false --latest`. Confirm the public release and asset URLs and verify the published asset digest against `SHA256SUMS.txt`. Keep the app version and Git tag aligned for subsequent releases, and retain earlier release assets for existing recipients.
