# Tutorial 87 — Key Provider Path Traversal

## Objective

Prove `FileKeyProvider` rejects a path-traversal `keyId` (`../../../../etc/passwd`) on every one of its four methods, before ever touching the filesystem.

## What You'll Learn

- `FileKeyProvider` resolves a `keyId` to `${PARMANA_KEY_DIR}/${keyId}.private.pem` (and `.public.pem`) — without sanitization, a `keyId` containing `../` segments could resolve to an arbitrary file outside the key directory entirely
- Every method that accepts a `keyId` — `getPrivateKey`, `getPublicKey`, `hasKey`, `getMetadata` — validates it against an allow-list pattern (`/^[A-Za-z0-9._-]+$/`) and throws a named `CryptoError` naming the problem, consistently across all four
- A well-formed `keyId` (like `"default"`) is completely unaffected — this is a targeted allow-list, not a blanket restriction

## Running the Tutorial

```bash
npx tsx examples/tutorials/87-key-provider-path-traversal/run.ts
```

## Why This Matters

A `keyId` is caller-influenceable in more than one code path (`signerKeyId`, `DEFAULT_SECONDARY_KEY_ID`, artifact `signature.keyId` used to look up a public key for verification). Without sanitization at the provider itself, a single missed validation upstream could turn into a real path-traversal read. This tutorial proves the defense lives at the provider — the layer every caller ultimately goes through — rather than depending on every caller to validate independently.

## Next Tutorial

Continue with **Tutorial 88 – Malformed Request Handling**.
