import { checkSdkDocs } from "./sdkdocs/checkSdkDocs.js";

/**
 * Reports any name in the SDK docs code blocks that the real SDKs do not have.
 *
 * Usage: npm run check:sdk-docs
 */
const problems = checkSdkDocs();

if (problems.length === 0) {
  console.log(
    "SDK docs: every imported name, client method and option exists.",
  );
} else {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
