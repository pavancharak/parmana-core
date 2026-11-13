// Prints one fresh business transaction from the test fixture as JSON.
// Used by the outage drill. The transaction is not approved by a trusted
// approver, so the server refuses it at the signal check, which is the
// domain response the drill compares against.
import { createBusinessTransaction } from "../../packages/api/tests/fixtures/business-transaction.ts";

const transaction = await createBusinessTransaction();

process.stdout.write(JSON.stringify(transaction));
