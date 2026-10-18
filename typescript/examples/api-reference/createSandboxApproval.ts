// Sandbox only, and not in the SDK: a demo for trying Parmana, not part of
// the product API. Call the route directly.
const response = await fetch(
  "https://parmana-sandbox.vercel.app/sandbox/approvals",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      capability: "sandbox:receipt",
      resourceId: "demo-order-1",
    }),
  },
);

// Send it as signals.approvalArtifact within 5 minutes.
const approval: unknown = await response.json();

console.log(response.status, approval);
