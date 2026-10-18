import { writeFileSync } from "node:fs";

const response = await fetch(
  "https://parmana-api-real.vercel.app/parmana-handbook.pdf",
);

writeFileSync(
  "parmana-handbook.pdf",
  Buffer.from(await response.arrayBuffer()),
);
