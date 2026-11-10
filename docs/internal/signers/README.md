# Signers: current progress and production readiness

This folder records, for each way Parmana can sign, what is built, what is tested, whether it is ready for production, and what is needed to change that. One file per signer. The report is [CURRENT-PROGRESS.md](CURRENT-PROGRESS.md). Claims are numbered in [../CLAIMS.md](../CLAIMS.md); each file names its claims.

Status as of 2026-11-10.

| Signer                        | Built | Tested                | Production ready                           | Details                                  |
| ----------------------------- | ----- | --------------------- | ------------------------------------------ | ---------------------------------------- |
| Ed25519, local key file       | Yes   | Yes                   | **Yes**, the current production signer     | [ed25519.md](ed25519.md)                 |
| AWS KMS                       | Yes   | Yes                   | **Not confirmed.** Needs an operator check | [aws-kms.md](aws-kms.md)                 |
| ML-DSA-65, alone              | Yes   | Yes, in CI on Node 24 | **No**                                     | [ml-dsa-65.md](ml-dsa-65.md)             |
| Hybrid, Ed25519 + ML-DSA-65   | Yes   | Yes, in CI on Node 24 | **No**                                     | [hybrid.md](hybrid.md)                   |
| Azure Key Vault, GCP KMS, HSM | No    | No                    | **No**, refused at startup                 | [not-implemented.md](not-implemented.md) |

"Tested in CI on Node 24" means the suites run on CI's Node 24.22.2 runner. The local sandbox runs Node 22, where the ML-DSA-65 suites skip. A guard test that fails on CI when ML-DSA-65 is unavailable is in a separate change.
