# Policy: `crm:read`

**Status:** reference. The rules below are the working assumption (**ASSUMED**): they are used as the reference text until the owner confirms or replaces them.
**Owner (action owner):** Mohinder. **Successor:** Pavan.
**Capability:** `crm:read`. **Sourced values:** none.

## Rules (ASSUMED)

1. A read is allowed only when the requester is the named owner of the customer account.
2. The answer includes only name and contact details. Balances and history are never included.
3. Every read is recorded in the evidence log.
4. A read outside these rules is refused, and the refusal names the rule.

## How the rules map to the policy (to be written)

- Rule 1 is a check of the requester against the account's owner, from the request's `signals` (caller values). It is a request-level check, not a sourced value.
- Rule 2 is a field restriction on the answer, enforced by the caller's integration. The decision records the outcome; the field list is part of the policy text.
- Rules 3 and 4 are properties of the decision record and the refusal reason.

The policy text must pass the validator when it is proposed (see `CRM-READ-ENABLEMENT.md`, step 6).

## Owner sign-off

| Name     | Role         | Confirmed (Y/N) | Date |
| -------- | ------------ | --------------- | ---- |
| Mohinder | Action owner |                 |      |
| Pavan    | Successor    |                 |      |
