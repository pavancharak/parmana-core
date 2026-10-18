import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname);

const request = JSON.parse(
  readFileSync(path.join(root, "request.json"), "utf8"),
);

const apiBaseUrl = process.env.PARMANA_API_URL ?? "http://localhost:3000";

const apiKey = process.env.PARMANA_API_KEY;

const endpoint = `${apiBaseUrl}/transactions`;

console.log("========================================");
console.log(" Parmana Tutorial 09 - REST API");
console.log("========================================");

console.log();

console.log("POST");
console.log(endpoint);

console.log();

console.log("Request");
console.log(JSON.stringify(request, null, 2));

console.log();

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  },
  body: JSON.stringify(request),
});

// --------------------------------------------------
// SAFE RESPONSE HANDLING (IMPORTANT FIX)
// --------------------------------------------------

const text = await response.text();

let body: unknown;

try {
  body = JSON.parse(text);
} catch (err) {
  console.error("❌ Invalid JSON response received");
  console.error("Status:", response.status);
  console.error("Raw Response:");
  console.error(text);
  throw err;
}

console.log("Response Status");
console.log(response.status);

console.log();

console.log("Response Body");
console.log(JSON.stringify(body, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 10 - End-to-End");
