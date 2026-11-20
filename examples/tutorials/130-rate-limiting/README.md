# Tutorial 130: rate limiting

## Objective

Show the two limits that protect the API for callers, and what each one counts:

1. **Per caller, on `POST /execute`.** The limit is keyed by the authenticated caller ID, not
   the IP address, so one busy caller does not starve another that shares a backend address.
   The limiter runs before policy evaluation and signing, so a rejected request consumes
   nothing.
2. **Failed authentications, per source address.** Only `401` responses count. A client that
   keeps sending wrong keys is cut off for the window.

Health checks have their own, far higher limit, because platforms poll them constantly.

The limits here are set low so the example shows them. Production uses the defaults or the
operator's configuration, and a Postgres-backed store so the limit holds across every machine
in a fleet (see handbook chapter 16).

## The steps

1. Alice makes three requests with her own key, within her limit: none is rate limited. The
   malformed body is rejected by the route itself.
2. Her next request: `429 RATE_LIMITED`, with `Retry-After`.
3. Bob, with his own key, is not affected by Alice's usage.
4. Five health checks in a row: all `200`.
5. Three attempts with a wrong key: `401`, `401`, then `429`.
6. Bob's valid request from the same address, after the wrong keys: `429`.

## A finding for the owner

Step 6 is the current behaviour, not a design decision the handbook spells out. The
failed-authentication limit is keyed by source address, so once it is reached, every caller
behind that address is refused for the window, including callers with valid keys. A backend
that shares one outbound address with other callers can be locked out by one client that sends
wrong keys.

The alternatives are to key the failed-authentication limit by the key identifier where one is
presented, or to count failures per address but exempt authenticated callers from the block. Either
is a change to the rate limit design, so this tutorial records the current behaviour and does not
decide it.

## Run

```bash
npx tsx examples/tutorials/130-rate-limiting/run.ts
```

It starts the real API on a random local port, with in-memory limit stores. It is part of
`npm run examples`.
