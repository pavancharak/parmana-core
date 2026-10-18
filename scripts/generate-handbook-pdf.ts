import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import puppeteer from "puppeteer-core";

import { mdxToMarkdown } from "./handbook/mdxToMarkdown.js";

//
// Renders every docs/site/handbook chapter (the site pages are the only
// copy of the handbook) into one PDF file,
// for the email-gated download at docs/site/handbook/download.mdx.
// Uses puppeteer-core (no bundled Chromium) against whichever Chrome
// or Edge is already installed on the machine building this, rather
// than downloading a ~300MB browser bundle just to print a PDF.
//
// Run manually to regenerate: npx tsx scripts/generate-handbook-pdf.ts
//

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findBrowser(): string {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "No Chrome/Edge/Chromium install found at any known path. " +
        "Install Chrome, or add its path to CHROME_CANDIDATES in this script.",
    );
  }
  return found;
}

const sourceDir = path.resolve(process.cwd(), "docs/site/handbook");
const outputPath = path.resolve(
  process.cwd(),
  // Mintlify serves static assets from their exact path relative to
  // docs/site/ (e.g. docs/site/logo/logo-light.svg -> /logo/logo-light.svg),
  // there is no special "public" subfolder convention -- this must
  // match the downloadUrl POST /handbook/download-leads returns.
  "docs/site/parmana-handbook.pdf",
);

const chapterFiles = readdirSync(sourceDir)
  .filter((f) => /^\d{2}-.*\.mdx$/.test(f))
  .sort();

const readmeMd = mdxToMarkdown(
  readFileSync(path.join(sourceDir, "overview.mdx"), "utf8"),
);

const chaptersHtml = chapterFiles
  .map((file) => {
    const md = mdxToMarkdown(readFileSync(path.join(sourceDir, file), "utf8"));
    return `<section class="chapter">${marked.parse(md)}</section>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>The Parmana Handbook</title>
<style>
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
    max-width: 800px;
    margin: 0 auto;
    padding: 0 24px;
  }
  h1 { font-size: 22pt; margin-top: 0; }
  h2 { font-size: 15pt; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 12.5pt; margin-top: 20px; }
  code {
    background: #f2f2f2;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 9.5pt;
    font-family: "SF Mono", Consolas, monospace;
  }
  pre {
    background: #f7f7f7;
    padding: 10px 14px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 9pt;
  }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f2f2f2; }
  .chapter { page-break-before: always; }
  .cover { text-align: center; padding-top: 200px; page-break-after: always; }
  .cover h1 { font-size: 32pt; }
  .cover p { color: #666; font-size: 12pt; }
</style>
</head>
<body>
<div class="cover">
  <h1>The Parmana Handbook</h1>
  <p>Every capability, explained by reading the actual source.</p>
  <p>Generated ${new Date().toISOString().slice(0, 10)}</p>
</div>
<section class="chapter">${marked.parse(readmeMd)}</section>
${chaptersHtml}
</body>
</html>`;

async function main(): Promise<void> {
  const executablePath = findBrowser();
  console.log(`Using browser: ${executablePath}`);

  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  await page.pdf({
    path: outputPath,
    format: "A4",
    margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    printBackground: true,
  });

  await browser.close();

  console.log(
    `Wrote ${outputPath} (${chapterFiles.length} chapters + README).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
