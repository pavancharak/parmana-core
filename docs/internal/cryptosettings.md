Crypto settings: when to use what, and how to change them

This explains the four lines that control how Parmana signs and hashes trust records and receipts:

\# CRYPTO\_MODE: single | hybrid | pq

CRYPTO\_MODE=single

\# PRIMARY\_SIGNATURE\_PROVIDER: ed25519 | ecdsa-p256 | dilithium3 | dilithium5 | sphincs-plus

PRIMARY\_SIGNATURE\_PROVIDER=ed25519

\# SECONDARY\_SIGNATURE\_PROVIDER: same list as the primary. Only for hybrid.

SECONDARY\_SIGNATURE\_PROVIDER=

\# HASH\_PROVIDER: sha256 | sha3-512 | blake3

HASH\_PROVIDER=sha256

Sources: packages/shared/src/config/CryptoAlgorithms.ts (the mode descriptions), packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts (startup refusals), packages/shared/src/config/Config.ts (the downgrade note), and the record fields signature-entry.ts and execution-trust-record.ts.

Production runs CRYPTO\_MODE=single, PRIMARY\_SIGNATURE\_PROVIDER=ed25519, no secondary, and HASH\_PROVIDER=sha256. Keep those unless you have a reason and a plan.

1\. What each setting does

Signing. Every trust record and receipt carries one or more signatures. A signature is made with a private key and checked with the matching public key. The signature proves two things: the record was made by the holder of that key, and the record was not changed afterwards.

Hashing. Records are also hashed. The hash is what the signature covers. Changing the hash algorithm changes the hash of every new record.

Mode. CRYPTO\_MODE decides how many signatures a record carries. It does not change which algorithm is used. The algorithms are chosen by the provider settings.

2\. CRYPTO\_MODE: when to use each

single: use this

One signature provider signs and verifies every record. This is the current behavior and what production runs.

Use it when:

You want the simplest setup, and one algorithm is enough for your threat model.

You run on KMS (KEY\_PROVIDER=aws-kms). This is our production setup.

hybrid: use only with a specific requirement

Two providers sign each trust record and receipt. Verification requires both signatures to pass.

Use it when:

A requirement says a record must survive the failure of one algorithm, for example if you need protection against a future break of one signature scheme.

You have a key pair for each provider on local disk.

Do not use it when:

You run with KEY\_PROVIDER=aws-kms. The startup check refuses this combination, because the hybrid signing path needs keys the server can read directly.

You just want "more security". A second signature is not more security unless the two algorithms fail independently.

What changes when you turn it on:

Records and receipts get an extra signatures list. The code marks this with a comment: the field is present only on records signed under hybrid.

Verification of those records needs both signatures.

Startup needs a key pair for each provider. The check names the missing key ID, so a missing key stops the server before it opens the port.

The downgrade risk: the code notes that a deployment that switches hybrid on and off weakens its guarantees, because some records carry one signature and some carry two. Turn it on once, and do not turn it off.

pq: do not use

The code reserves this value for a future post-quantum-only mode. No production code reads it today. Setting it does nothing useful and may confuse later readers.

3\. PRIMARY\_SIGNATURE\_PROVIDER: which algorithm

The primary provider signs everything in single mode. In hybrid mode it is one of the two signers.

Value Type Use it when

ed25519 Classical, fast, small signatures Always, for production. This is what we run.

ecdsa-p256 Classical, widely supported Only when an external system requires ECDSA P-256.

dilithium3 Post-quantum (lattice-based) Only for post-quantum evaluation.

dilithium5 Post-quantum (lattice-based), larger parameters Only for post-quantum evaluation, at a higher security level.

sphincs-plus Post-quantum (hash-based) Only for post-quantum evaluation where a hash-based scheme is preferred.

What I checked: these names are in the enum, and the code's mode descriptions reference the primary provider.

What I did not check: whether each name is implemented and tested end to end in this codebase. Before you choose any value other than ed25519, confirm the signer implementation and run a test record through it.

4\. SECONDARY\_SIGNATURE\_PROVIDER: when to set it

Leave it empty unless CRYPTO\_MODE=hybrid.

When you do use it:

Pick an algorithm different from the primary. If both are from the same family, a weakness in that family breaks both.

Pair a classical algorithm with a post-quantum one. For example, ed25519 as primary and dilithium3 as secondary.

The same implementation check applies: confirm the algorithm works before you rely on it.

5\. HASH\_PROVIDER: which hash

Value Use it when

sha256 Always, unless you have a specific reason. This is the default and what we run.

sha3-512 A requirement calls for SHA-3, or a longer digest. Confirm the builder wiring first.

blake3 You want a fast hash, and the requirement allows it. Confirm the builder wiring first.

What changing it does: every new record gets a different hash. Records already written keep theirs. Verifiers must be able to recompute the hash of each record with the algorithm that was used for that record, so changing this on a live deployment needs a plan. Do not change it casually.

What I checked: the three names are in the enum, and the hash provider is passed into the crypto builder.

What I did not check: that sha3-512 and blake3 are fully wired and tested end to end.

6\. How to change a setting safely

Decide the reason. Write down which requirement the change meets. If you cannot name one, keep the default.

Test locally first. Set the value in your local .env, start the server, and sign a test record. Verify it with the matching public key.

Check the key material. Hybrid needs a key pair per provider. The startup log names any missing key.

Plan for old records. Decide how records signed before the change will still be verified. Keep the old public keys and the old hash algorithm available for verification.

Change one setting at a time. Mode, primary, secondary and hash are independent decisions. Changing two at once makes a failure hard to diagnose.

Deploy, then check. Confirm /ready returns 200, then sign and verify one new record.

7\. Common questions

Can I use ed25519 and dilithium3 together without hybrid? No. Only hybrid uses a secondary provider. In single mode, the primary is the only signer.

Does a post-quantum primary make the system quantum-safe? Not by itself. The signatures and hashes are one part. Other parts (key storage, transport, the KMS path) have their own requirements. Read the security documents before claiming post-quantum safety.

Why is hybrid refused with KMS? The hybrid path needs both signing keys to be readable by the server. Under aws-kms, the default signing key stays in KMS, and the startup check refuses the combination rather than silently running a different mode.

What should I put in production today? The values at the top of this file: single, ed25519, no secondary, sha256.
