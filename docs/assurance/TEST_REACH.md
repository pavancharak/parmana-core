# Test reach by package

Measured on 2026-11-22 with `node scripts/assurance-test-reach.mjs`. A mutant in `src/` can only be killed by a test that imports `src/`. Package names resolve to `dist/` (see each package's `exports`), so such an import never reaches `src/`. The count of `self_by_name` is zero for every package, so no test reaches its own package only through `dist/`.

```
package	test_files	src_relative	self_by_name
api	151	118	0
approval	9	9	0
capability-registry	2	2	0
cli	8	7	0
connector-sdk	5	4	0
crypto	51	47	0
envelope-verifier	4	4	0
execution-control	8	8	0
execution-gateway	29	29	0
execution-system	2	2	0
governance-ui	3	3	0
policy	46	46	0
replay	5	5	0
runtime	43	42	0
shared	8	8	0
storage	50	46	0
```

Limit: a test that reaches package X's `src/` only through another package's `dist/` does not kill a mutant in X. This is not measured here.
