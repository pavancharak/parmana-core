# End-to-end run, 27 November 2026

Produced by the Parmana runtime in the API test environment (`execute`, `verify`, `receipt`, `replay`), then checked with the independent `parmana-verifier` CLI (`pavancharak/parmana-verifier`, commit `4eb6dff`), which reads only the record and a trust file.

- `transaction.json`: the business transaction submitted to `POST /execute` (test fixture).
- `record.json`: the Execution Trust Record returned by `POST /execute`, schema version 3.
- `trust.json`: the trust file. It holds one public key (`default`, Ed25519). The fingerprint was computed by the verifier's `key-fingerprint` command.
- `default.public.pem`: the public key the trust file names.
- `receipt.json`, `verify.json`, `replay.json`: the responses from the other runtime endpoints.
- `tampered-record.json`: `record.json` with one field changed, to show the verifier rejects it.
- `verifier-output.txt`: the verifier output and exit codes.

Keys: this run used the test environment's ephemeral signing keys, not a production key. It shows the mechanism works. It is not evidence about production keys. Out-of-band key pinning (the step in the verifier README) was not done, because the key comes from this test process.

No private key is included.
