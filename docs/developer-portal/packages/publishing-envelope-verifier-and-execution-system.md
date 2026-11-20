# Publishing `@parmana/envelope-verifier` and `@parmana/execution-system`

[Portal home](../README.md) · [SDK index](../sdk/README.md) · [FINDINGS F5](../FINDINGS.md#f5-two-packages-are-on-npm-at-010-while-the-repository-is-411)

This page sets out what publishing these two packages would mean, what is already true, and what to check first. It is for the owner, who decides and publishes. It does not publish anything.

## The decision

Two packages are marked public in the repository but have a different state on npm:

- The repository has both at **4.1.1**.
- npm has both at **0.1.0** (and a `0.0.0-stage` tag). The `0.1.0` versions are older code.

The question is whether they should be published as public packages at all, and if so, at what version.

## What is verified

These facts were checked on 2026-11-20 against the repository and the registry:

| Fact                                                 | Result                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Repository version                                   | 4.1.1 for both (`packages/envelope-verifier/package.json`, `packages/execution-system/package.json`)        |
| Marked private                                       | No. Neither manifest sets `private`.                                                                        |
| Registry versions                                    | `0.1.0` and `0.0.0-stage`, for both                                                                         |
| Packs cleanly                                        | Yes. `npm pack --dry-run` lists only the built `dist` files (`index.js`, `index.d.ts` and maps).            |
| Who depends on them                                  | Only the server packages: `api`, `runtime`, `storage`, `approval` and `execution-gateway`.                  |
| Public SDKs, CLI or verifiers that depend on them    | None. `@parmana/sdk`, `@parmana/cli`, `@parmana/verifier` and `parmana-verifier` do not.                    |
| In the release process                               | No. `docs/internal/runbooks/RELEASE-ALL-PACKAGES.md` lists nine packages, and these two are not among them. |
| Documented as an API in this portal                  | No. The portal lists both as "building blocks", not integration points ([SDK index](../sdk/README.md)).     |
| npm access from the environment used to prepare this | None. `npm whoami` returns `ENEEDAUTH`. Publishing needs the owner's npm account.                           |

## Why publish

- **The registry is out of step.** Anyone who installs `0.1.0` gets older code than the repository has. That can mislead someone who relies on the package.
- **The manifests already say public.** Leaving them public and unpublished is an inconsistency that the repository itself carries.
- **Third parties may want the verifier.** `@parmana/envelope-verifier` verifies that an execution request was authorized. If someone outside the project needs that check alone, a published package is the simplest way to give it to them.

## Why not publish

- **They are not integration points.** The portal says they are building blocks, and that people should not install them. Publishing them invites use that the portal does not support.
- **Publishing creates a version promise.** Once `4.1.1` is on npm, consumers can depend on it, and a later breaking change needs a major version bump. The current `execution-system` is a protocol, and its public surface is not documented.
- **They are outside the release process.** A release outside the runbook has no SLSA provenance, no registry check against the release files, and no version-bump review. The runbook exists to prevent that.
- **Nothing in the published SDKs needs them.** Publishing them does not change what SDK users install.

## If you publish

Do this through the release runbook, not by hand, unless you decide otherwise.

1. **Decide the audience.** Confirm that an outside user needs these packages. If not, mark them `private` and stop here.
2. **Document the public surface.** `execution-system` has no documented API. Write one before publishing, or do not publish it.
3. **Add both to the release process.** Update the package table in `RELEASE-ALL-PACKAGES.md` and the release manifest, so provenance and the registry checks cover them.
4. **Version.** Publish at `4.1.1`, the repository's version, so the registry and the repository agree. Do not reuse `0.1.0`, and do not publish `0.0.0-stage` over anything.
5. **Check the tarball.** Run `npm pack --dry-run` and confirm the contents. Confirm the SHA-256 matches the release record.
6. **Publish with the owner account,** then confirm with `npm view <name> version` that the registry shows `4.1.1`.
7. **Update this page and the SDK index.** Replace "registry version differs" with the published version.

## Decision (2026-11-20): public, released through the process

The owner has said both packages are meant to be public. So the permanent answer is:

- **Both stay public.** Their manifests stay as they are, at `4.1.1`, and are not private.
- **They are released through the release process, not by hand.** The steps are below.
- **The release is owner-run.** It uses the owner's npm account. This environment has no npm credentials and does not publish.

### The release change, not yet applied

Adding the two packages changes the next release, so it waits for an explicit go-ahead. What it needs:

1. `.github/release/release-manifest.json`: add `@parmana/envelope-verifier` and `@parmana/execution-system` to the `npm` list. The list then has seven entries.
2. `docs/internal/runbooks/RELEASE-ALL-PACKAGES.md`: add both to the package table, with the `sdk-v<version>` tag, and update the `All 9 registry files match` check to 11.
3. `tests/architecture/release-manifest.test.ts` and `.github/workflows/release.yml`: check that they read the manifest and do not hard-code nine packages, and update any count that does.
4. Document the public surface of `@parmana/execution-system` before its first publish, because a public package is a version promise.

Until that change is made, the packages stay unpublished. That is the state recorded in FINDINGS F5.

## Recommendation

Do not publish until the audience question in step 1 has an answer. If nobody outside the project needs these packages, mark them `private`. That removes the registry mismatch, and it removes the version promise.
