// EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
// Decide a review as a reviewer
const response = await fetch(
  "https://parmana-api-real.vercel.app/v2/reviews/review-123/decision",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ decision: "approve" }),
  },
);
console.log(response.status, await response.text());
