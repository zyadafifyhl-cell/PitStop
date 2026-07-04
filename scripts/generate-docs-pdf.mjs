import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'scripts', 'docs-source', 'pitstop-master-system-documentation.html');
const pdfPath = path.join(root, 'docs', 'pitstop-master-system-documentation.pdf');
const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 120_000 });

  await page
    .waitForFunction(
      () => {
        const blocks = document.querySelectorAll('pre.mermaid');
        if (!blocks.length) return true;
        return [...blocks].every((node) => node.querySelector('svg'));
      },
      { timeout: 90_000 },
    )
    .catch(() => {});

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
  });

  console.log(`Wrote ${pdfPath}`);
} finally {
  await browser.close();
}
