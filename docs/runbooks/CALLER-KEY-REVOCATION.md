# Caller API key revocation

How to revoke a caller API key so the server refuses it on the next request, how to check that it worked, and what the check depends on.

This applies to builds of `main` at `fba4b2c` (PR #238) and later. Earlier builds load caller keys once at startup and do not read the revocation table, so a revocation takes effect only at the next restart on those builds.

---

## 1. Before you revoke

**The migration is applied.** In the Supabase SQL editor, run:

```sql
select to_regclass('public.caller_key_revocations');
```

It must return `caller_key_revocations`. If it returns empty, stop. The new build refuses every caller while the table is missing, so do not deploy it, and do not revoke. Apply the migration first, from a checkout of the branch that contains it:

```powershell
npm run db:migrate -- apply --dry-run
npm run db:migrate -- apply
```

**You have the key's SHA-256 hash, not the key.** Compute it without a trailing newline.

In PowerShell:

```powershell
$bytes = [Text.Encoding]::UTF8.GetBytes($key)
([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)) -replace '-', '').ToLower()
```

In Git Bash:

```bash
printf '%s' "$KEY" | sha256sum
```

The result is 64 lowercase hex characters.

---

## 2. Revoke

```powershell
npx tsx scripts/revoke-caller-key.ts `
  --key-hash <64 hex characters> `
  --caller-id <callerId the key belongs to> `
  --by <your name> `
  --reason "<why>"
```

Expected output:

```
Revoked key <first 12 characters>... for caller <callerId>. It is refused from the next request.
```

- The script writes to the database named by `DATABASE_URL`. Check that variable before you run it. A production database needs an approval first.
- Revoking a key that is already revoked changes nothing.
- The script stores the hash, the caller ID, the operator name and the reason. It never stores the key.

---

## 3. Check

1. A request with the revoked key is refused:

   ```powershell
   try { Invoke-RestMethod "$env:PARMANA_URL/policies" -Headers @{ Authorization = "Bearer $key" } } catch { "$($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)" }
   ```

   Expect `401 {"error":"authentication required"}`.

2. A request with a key that was not revoked still succeeds.

3. If the revoked key still works, stop. Check two things:
   - The running build is `fba4b2c` or later. Run the commands in `PRODUCTION-DEPLOY-AND-ROLLBACK.md`, section 3e. A build older than `fba4b2c` does not read the table.
   - The hash you revoked matches the key you tested. Recompute it from the same key.

---

## 4. What revocation does not do

- It does not remove the key from `PARMANA_API_KEYS`. A revoked key stays in config and is refused.
- There is no un-revoke command. To restore a key, an operator deletes its row from `caller_key_revocations`. Do that only in an approved change, and record the reason.
- The check fails closed. If the lookup fails, every key is refused until the lookup works again.

---

## 5. If callers are refused unexpectedly

1. Run the table check in section 1. A missing table refuses every caller.
2. In the deployment's Runtime Logs, look for `caller_key_revocation_lookup_failed`. Its `error` field names the failure.
3. Check that the deployment's `DATABASE_URL` points to the database with the table.
4. If callers stay refused, roll back using section 4 of `PRODUCTION-DEPLOY-AND-ROLLBACK.md`.

---

## Related

- `docs/VERIFICATION-GAPS.md`: G-127 (the restart window) and G-128 (credentials on the same host).
- `docs/BACKLOG.md`: rows 51 and 52.
- `docs/CLAIMS.md`: 2.16.
