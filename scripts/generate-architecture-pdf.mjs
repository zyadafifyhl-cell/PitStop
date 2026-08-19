import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'SYSTEM_ARCHITECTURE_AND_FLOWS.md');
const htmlPath = path.join(root, 'scripts', 'docs-source', 'system-architecture-and-flows.html');
const pdfPath = path.join(root, 'SYSTEM_ARCHITECTURE_AND_FLOWS.pdf');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inline(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      closeList();
      const lang = line.slice(3).trim();
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      const code = body.join('\n');
      if (lang === 'mermaid') {
        out.push(`<div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(code)}</pre></div>`);
      } else {
        out.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      }
      i += 1;
      continue;
    }

    if (line.trim() === '---') {
      closeList();
      out.push('<hr />');
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const headers = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push('<table><thead><tr>');
      headers.forEach((cell) => out.push(`<th>${inline(cell)}</th>`));
      out.push('</tr></thead><tbody>');
      rows.forEach((row) => {
        out.push('<tr>');
        row.forEach((cell) => out.push(`<td>${inline(cell)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table>');
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      i += 1;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      closeList();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, '')));
        i += 1;
      }
      out.push('<ol>');
      items.forEach((item) => out.push(`<li>${item}</li>`));
      out.push('</ol>');
      continue;
    }

    if (line.trim() === '') {
      closeList();
      i += 1;
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
    i += 1;
  }

  closeList();
  return out.join('\n');
}

const markdown = fs.readFileSync(mdPath, 'utf8');
const body = markdownToHtml(markdown);
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PitStop — System Architecture and Operational Flows</title>
  <style>
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      color: #111;
      background: #fff;
      line-height: 1.42;
      font-size: 10pt;
      max-width: 210mm;
      margin: 0 auto;
      padding: 8mm 4mm;
    }
    h1 { font-size: 22pt; margin: 0 0 8px; color: #0d3b66; }
    h2 { font-size: 14pt; margin: 22px 0 8px; color: #0d3b66; border-bottom: 2px solid #e8eef5; padding-bottom: 4px; page-break-after: avoid; break-after: avoid; }
    h3 { font-size: 11.5pt; margin: 14px 0 6px; color: #1f3d5c; page-break-after: avoid; break-after: avoid; }
    h4 { font-size: 10.5pt; margin: 10px 0 4px; color: #333; page-break-after: avoid; }
    p, li { margin: 0 0 6px; }
    ul, ol { margin: 4px 0 10px; padding-left: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 8.6pt; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, td { border: 1px solid #d8dee8; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f3f6fa; color: #0d3b66; }
    code { font-family: Consolas, "Courier New", monospace; font-size: 8.4pt; background: #f3f6fa; padding: 1px 4px; border-radius: 3px; }
    pre {
      background: #f7f9fc;
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 6px 0 12px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 7.8pt;
      line-height: 1.35;
    }
    pre code { background: transparent; padding: 0; }
    hr { border: 0; border-top: 1px solid #dde4ee; margin: 16px 0; }
    a { color: #0d3b66; }
    .mermaid-wrap { background: #f7f9fc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 10px 0 14px; overflow-x: auto; }
    .mermaid-wrap pre.mermaid { background: transparent; border: none; padding: 0; margin: 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });</script>
</head>
<body>
${body}
</body>
</html>
`;

fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
fs.writeFileSync(htmlPath, html, 'utf8');

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
    margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="font-size:8px;color:#667;width:100%;padding:0 16mm;display:flex;justify-content:space-between;">
        <span>PitStop — System Architecture and Operational Flows</span>
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
  });

  console.log(`Wrote ${pdfPath}`);
} finally {
  await browser.close();
}
