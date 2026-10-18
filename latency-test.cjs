const API_KEY = process.env.PARMANA_LATENCY_TEST_KEY;
if (!API_KEY) {
  throw new Error("Set PARMANA_LATENCY_TEST_KEY before running this script.");
}
const URL = "https://parmana-api.fly.dev/execute";
const REQUEST_COUNT = 20;

async function timedRequest(i) {
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    await res.arrayBuffer();
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    console.log(`request ${i + 1}: status ${res.status}  ${ms.toFixed(1)}ms`);
    return ms;
  } catch (err) {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    console.log(`request ${i + 1}: ERROR ${err.message}  ${ms.toFixed(1)}ms`);
    return null;
  }
}

async function main() {
  console.log(
    `Firing ${REQUEST_COUNT} requests through one warm connection...`,
  );
  const timings = [];
  for (let i = 0; i < REQUEST_COUNT; i++) {
    const ms = await timedRequest(i);
    if (ms !== null) timings.push(ms);
  }

  if (timings.length === 0) {
    console.log("No successful timings collected.");
    return;
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const sum = timings.reduce((a, b) => a + b, 0);
  const mean = sum / timings.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const first = timings[0];
  const restMean =
    timings.length > 1
      ? timings.slice(1).reduce((a, b) => a + b, 0) / (timings.length - 1)
      : null;

  console.log("--- Summary ---");
  console.log(
    `First request (cold, pays connection setup): ${first.toFixed(1)}ms`,
  );
  if (restMean !== null) {
    console.log(
      `Mean of requests 2-${timings.length} (warm connection): ${restMean.toFixed(1)}ms`,
    );
  }
  console.log(`Overall mean: ${mean.toFixed(1)}ms`);
  console.log(`p50: ${p50.toFixed(1)}ms`);
  console.log(`p95: ${p95.toFixed(1)}ms`);
  console.log(`min: ${sorted[0].toFixed(1)}ms`);
  console.log(`max: ${sorted[sorted.length - 1].toFixed(1)}ms`);
}

main();
