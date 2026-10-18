# Releasing the TypeScript SDK

The package is `@parmana/sdk`. Run these from the repository root. The version is `version` in `typescript/package.json`, and the root `package-lock.json` records it for the workspace, so change both.

## 1. Prepare

1. Bump `version` in `typescript/package.json` and the `@parmana/sdk` workspace entry in the root `package-lock.json`.
2. Add a note to `docs/site/changelog.mdx` describing what changed.
3. Make sure CI is green, and run the SDK tests **from the repository root**: `npx vitest run typescript`. The integration tests start a real local API and `PARMANA_POLICY_DIR=./policies` resolves relative to where vitest runs, so running them from `typescript/` fails with "Policy 'vendor-payment' was not found".

## 2. Build and inspect the package

```bash
npm run build --workspace=typescript
npm pack --workspace=typescript --pack-destination /tmp/parmana-npm --dry-run
npm pack --workspace=typescript --pack-destination /tmp/parmana-npm
```

The tarball must contain only `dist/`, `README.md`, `LICENSE`, `NOTICE` and `package.json`, and it must be named `parmana-sdk-<version>.tgz`.

## 3. Test the packed tarball in a clean project

```bash
mkdir /tmp/parmana-npm-check && cd /tmp/parmana-npm-check
npm init -y
npm install /tmp/parmana-npm/parmana-sdk-<version>.tgz
node --input-type=module -e "import * as sdk from '@parmana/sdk'; console.log(Object.keys(sdk).length, 'exports', typeof sdk.ParmanaClient)"
```

## 4. Publish a GitHub release

Merge the version bump to `main` first. Then on GitHub: Releases, Draft a new release, type the
new tag `sdk-v<version>`, choose **Create new tag**, check the target is `main`, and publish.

`.github/workflows/release.yml` builds the four SDK packages from that tag, attaches them to the
release with a CycloneDX SBOM for each (`<package file>.cdx.json`), and attaches signed SLSA
provenance (`multiple.intoto.jsonl`) covering all of them. Wait for the workflow run to be green and
the release to show eleven files: six packages, four SBOMs and the provenance. A release on an existing tag that predates the
workflow does not run it.

Publishing the release also runs `.github/workflows/server-image.yml`, which pushes the server image
`ghcr.io/pavancharak/parmana-api:<tag>` with SLSA provenance. Check that run is green too. After the first run, set
the `parmana-api` package to Public in its package settings on GitHub; a new package starts private.

## 5. Publish the release's own file to npm

Publish the file the release built, not a local build, so the package on npm is byte for byte the
one the provenance covers. Download `parmana-sdk-<version>.tgz` from the release page (or run
`gh release download sdk-v<version> --pattern 'parmana-sdk-*.tgz'`), then:

```bash
npm login
npm publish parmana-sdk-<version>.tgz --access public
```

Publishing needs an npm account that can publish `@parmana/sdk`, with two factor authentication;
add `--otp <code>` if your account uses a one time password. Never commit a token.
`@parmana/connector-sdk` is published the same way from `parmana-connector-sdk-<version>.tgz`.

## 6. After publishing

1. Confirm the version at `https://www.npmjs.com/package/@parmana/sdk` and that `npm view @parmana/sdk version` shows it.
2. Check that `npm view @parmana/sdk@<version> dist.shasum` equals the SHA-1 of the release's `.tgz` (`sha1sum parmana-sdk-<version>.tgz`).
3. Update the published version statements in `docs/site/sdks/typescript.mdx` and the "built but not yet published" wording in `docs/site/changelog.mdx`.
