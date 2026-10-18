import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import puppeteer from "puppeteer-core";

import { mdxToMarkdown } from "./build-book/mdxToMarkdown.js";

//
// Renders "Build with Parmana" (the docs/site/build-book pages, the only
// copy of the book) into one PDF, docs/site/build-with-parmana.pdf, a
// public static file the overview page links to. Like
// scripts/generate-handbook-pdf.ts, it uses puppeteer-core against the
// Chrome or Edge already installed on the machine building it.
//
// Run: npm run generate:build-book-pdf
//

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

// The reading order: the overview, the ten chapters, then the generated
// reference. A page missing from disk stops the build rather than
// printing a book with a hole in it.
export const BOOK_PAGES = [
  "overview",
  "01-how-parmana-works",
  "02-your-first-governed-action",
  "03-connect-an-agent",
  "04-policies",
  "05-human-approvals",
  "06-connect-your-systems",
  "07-verify-and-audit",
  "08-deploy-and-operate",
  "09-errors-and-troubleshooting",
  "10-security-model-and-limits",
  "reference-endpoints",
  "reference-sdk",
  "reference-errors",
] as const;

const sourceDir = path.resolve(process.cwd(), "docs/site/build-book");
const outputPath = path.resolve(
  process.cwd(),
  "docs/site/build-with-parmana.pdf",
);

function findBrowser(): string {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error(
      "No Chrome, Edge or Chromium found at any known path. " +
        "Install one, or add its path to CHROME_CANDIDATES in this script.",
    );
  }

  return found;
}

function bookHtml(): string {
  const sections = BOOK_PAGES.map((page) => {
    const file = path.join(sourceDir, `${page}.mdx`);
    const markdown = mdxToMarkdown(readFileSync(file, "utf8"));

    return `<section class="chapter">${marked.parse(markdown)}</section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Build with Parmana</title>
<style>
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #1a1a1a;
    margin: 0 auto;
  }
  h1 { font-size: 22pt; margin-top: 0; }
  h2 { font-size: 15pt; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 12pt; margin-top: 20px; }
  a { color: #1a4fd6; text-decoration: none; }
  code {
    background: #f2f2f2;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 8.5pt;
    font-family: "SF Mono", Consolas, monospace;
    overflow-wrap: anywhere;
  }
  pre {
    background: #f7f7f7;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 8pt;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 8.5pt; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  tr { page-break-inside: avoid; }
  .chapter { page-break-before: always; }
  .cover { text-align: center; padding-top: 200px; page-break-after: always; }
  .cover h1 { font-size: 32pt; }
  .cover p { color: #666; font-size: 12pt; }
</style>
</head>
<body>
<div class="cover">
  <h1>Build with Parmana</h1>
  <p>Connect AI agents to real systems, with a person and a signed record behind every action.</p>
  <p>Generated ${new Date().toISOString().slice(0, 10)}</p>
</div>
${sections}
</body>
</html>`;
}

async function main(): Promise<void> {
  const executablePath = findBrowser();
  console.log(`Using browser: ${executablePath}`);

  const html = bookHtml();
  const browser = await puppeteer.launch({ executablePath, headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: { top: "18mm", bottom: "18mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`Wrote ${outputPath} (${BOOK_PAGES.length} pages of the book).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
