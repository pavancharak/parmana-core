# Proof of Authorized Execution (PoAE)

Everything regarding PoAE lives in a separate repository: **[pavancharak/parmana-poae-benchmark](https://github.com/pavancharak/parmana-poae-benchmark)**. That includes the research specification, the 30 scenarios, the benchmark runner, its CI workflow, the decisions and the results.

This repository holds the product. Nothing here runs the PoAE benchmark or records its results. The product behaviour that PoAE tests (the execution gateway, the signed trust record, the offline verifier, the reconciliation function) remains in this repository, and the open items it leaves are listed in [OPEN_ITEMS.md](OPEN_ITEMS.md).
