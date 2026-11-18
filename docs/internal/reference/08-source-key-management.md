# Key management: the accounts source signing key

**Status:** reference draft. Holder and storage are **ASSUMED** until the accounts system is named.

## Who holds what

| Item                                             | Held by                             | Stored where                                       | Never                                      |
| ------------------------------------------------ | ----------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Private key (signs answers)                      | The adapter operator (ASSUMED)      | The adapter's secret store                         | Sent to Parmana, committed, pasted in chat |
| Public key (verifies answers)                    | Parmana, registered in the register | The register, through `POST /sources`              | Anywhere else needed                       |
| Adapter token (authenticates Parmana's requests) | Parmana and the adapter             | Parmana's secret store; the adapter's secret store | Repository, chat                           |

## Generating a key

1. Generate an Ed25519 key pair with a tool approved by the security owner. Do not reuse a key from another system.
2. Give the public key (PEM, SPKI) to the source owner for registration. Do not send the private key.
3. Record the key id, the creation date and the holder in the table at the end of this document.

## Registering a key

1. The source owner registers the public key with `POST /sources` (see `ERP-INVOICE-PAY-SOURCE-BUILD.md`, section 4).
2. The second approver approves it with `POST /sources/accounts/approve`.
3. Nothing is trusted until both steps are done.

## Rotation (every 12 months, ASSUMED interval)

1. Generate a new key pair (above).
2. Register the new public key under a new key id, and approve it.
3. Switch the adapter to the new key id.
4. Confirm answers verify with the new key in staging, then in production.
5. Revoke the old key with `POST /sources/accounts/revoke` or the register's key revocation route. Check the route in its handler.
6. Record the rotation in the table below.

## Compromise

If the private key may have been seen by anyone else:

1. Revoke the key now. Every answer signed with it is then refused (`KEY_REVOKED`).
2. Decisions that use the source refuse until a new key is registered. This is the intended outcome.
3. Record the incident, the time, and who was told.
4. Rotate the key as above.

## Key log

| Key id | Public key fingerprint | Created | Registered | Approved by | Revoked | Holder |
| ------ | ---------------------- | ------- | ---------- | ----------- | ------- | ------ |
|        |                        |         |            |             |         |        |
