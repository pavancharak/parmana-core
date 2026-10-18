# @parmana/envelope-verifier

For engineers on the **receiving** side of a Parmana integration: this is the
package your system installs to verify that an incoming execution request was
actually authorized by Parmana before you act on it.

## What this verifies — and what it does not

A passing verification proves that Parmana's runtime signed off on a specific
decision. It does **not** re-run or re-evaluate the policy that produced that
decision. This package has no notion of policies, rules, or business logic —
it only checks a cryptographic envelope. If you need to know _why_ a request
was approved, that lives in Parmana's own trust record / receipt, not here.

Concretely, `EnvelopeVerifier.verify()` checks, in this order of concern (not
necessarily execution order):

1. The envelope's signature is valid for the public key you supplied.
2. The envelope has not expired (`now < expiresAt`).
3. The envelope's TTL (`expiresAt - authorizedAt`) does not exceed the policy
   you configured (`maxTtlSeconds`, default 300s) — this bounds how much
   damage a compromised signer could do by minting a long-lived envelope.
4. The envelope's nonce has not been seen before, according to your
   `NonceStore`.

It does **not**:

- Make network calls.
- Read key material from disk, environment variables, or anywhere else — you
  supply Parmana's public key directly as a `KeyObject`.
- Evaluate or know anything about the policy that produced the decision.
- Guarantee global single-use of a nonce across multiple receiving systems
  (see "Claims" below).

## Quickstart

```ts
import { generateKeyPairSync } from "node:crypto";
import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";

// publicKey comes from Parmana out-of-band (e.g. a config value, a secret
// manager, however your organization distributes it) — never generated here.
const verifier = new EnvelopeVerifier({
  publicKey,
  nonceStore: new MemoryNonceStore(),
  maxTtlSeconds: 300,
});

const result = await verifier.verify(incomingAuthorization);

if (!result.valid) {
  throw new Error(`Authorization rejected: ${JSON.stringify(result.checks)}`);
}

// Proceed with the execution request.
```

### Express

```ts
import express from "express";
import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";
import { requireParmanaAuthorization } from "@parmana/envelope-verifier/express";

const verifier = new EnvelopeVerifier({
  publicKey,
  nonceStore: new MemoryNonceStore(),
});

const app = express();
app.use(express.json());

app.post("/execute", requireParmanaAuthorization(verifier), (req, res) => {
  // req.parmanaAuthorization is populated here.
  res.status(200).json({ ok: true });
});
```

The Express integration is a separate entry point
(`@parmana/envelope-verifier/express`) so that consumers who don't use
Express never pull in Express's types. Express itself is a peer dependency
(optional) — this package has no runtime dependency on it.

## PRODUCTION WARNING: `MemoryNonceStore`

`MemoryNonceStore` keeps accepted nonces in a process-local `Map` and **loses
all state on restart**. A process that restarts will accept a replayed
authorization that is still within its TTL — the nonce it consumed is gone.

**Production deployments MUST use a persistent `NonceStore` implementation**
(e.g. backed by Redis, a database, or another durable store shared across
process restarts and instances).

The bound on how much persistence you need is small: because every envelope
carries a short TTL, the persistence window only needs to cover the maximum
TTL you configure. Once an envelope's `expiresAt` has passed, it is already
rejected by the expiry check regardless of what the nonce store remembers —
so a durable store never needs to retain a nonce longer than
`maxTtlSeconds`.

## Operational requirements

- **Node >= 24 if the signer uses `SIGNATURE_PROVIDER=dilithium3`** (ML-DSA-65).
  This package's own verification code has no Node version requirement of
  its own — the constraint comes from `@parmana/crypto`'s use of
  `node:crypto`'s native `ml-dsa-65` support, which requires Node >= 24
  (OpenSSL >= 3.5). If you only ever verify Ed25519 envelopes, this does
  not apply.
- **The signer and every verifier must be configured with the same
  `SIGNATURE_PROVIDER`, and the verifier must hold the signer's matching
  public key.** `EnvelopeVerifier` verifies using whichever single
  algorithm the _verifying_ process is configured for — it does not
  negotiate or auto-detect the signer's algorithm.
- **The envelope's `algorithm` field is informational only, not a routing
  key.** Verification never branches on `authorization.algorithm`; it
  always attempts verification with the verifying process's own
  configured provider. A mismatch (e.g. an Ed25519-configured verifier
  receiving a `dilithium3`-signed envelope) fails verification — it does
  not get routed to the correct algorithm automatically. If you operate
  fleets on different algorithms, each fleet member must be configured for
  the algorithm it actually needs to verify.
- Migrating a deployment from one algorithm to another (e.g. Ed25519 to
  ML-DSA-65) while retaining the ability to verify authorizations issued
  before the switch is not currently supported — see
  the post quantum cryptography design note (in git history).

## Claims

A passing (`valid: true`) verification proves exactly this:

> The request was authorized by the holder of Parmana's signing key, for this
> specific decision, business transaction, and policy version, within its
> validity window, and has not been accepted before **by this nonce store**.

The last clause matters: single-use enforcement is scoped to whichever
`NonceStore` instance performed the check. If you run multiple independent
receiving systems (or multiple instances of the same system) each with their
own `NonceStore`, each one enforces single-use independently — the same
authorization could be accepted once by each of them. If you need
single-use guarantees across a fleet, point every instance at the **same**
shared `NonceStore` (e.g. one Redis-backed store), not one per process.
