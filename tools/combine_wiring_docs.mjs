import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');

async function combineWiringGuides() {
  const picPdfPath = path.join(docsDir, 'Macropad_Picture_Wiring_V1_V2.pdf');
  const guidePdfPath = path.join(docsDir, 'Macropad_V1_V2_Wiring_Guide.pdf');
  const outPdfPath = path.join(docsDir, 'Macropad_Complete_Wiring_Guide.pdf');

  if (!fs.existsSync(picPdfPath)) {
    throw new Error(`Missing picture wiring PDF: ${picPdfPath}`);
  }
  if (!fs.existsSync(guidePdfPath)) {
    throw new Error(`Missing wiring guide PDF: ${guidePdfPath}`);
  }

  const mergedDoc = await PDFDocument.create();

  // 1. Add Picture Wiring pages (V1 and V2 visual pictorial diagrams)
  const picBytes = fs.readFileSync(picPdfPath);
  const picDoc = await PDFDocument.load(picBytes);
  const picPages = await mergedDoc.copyPages(picDoc, picDoc.getPageIndices());
  picPages.forEach((p) => mergedDoc.addPage(p));

  // 2. Add Complete Soldering & Schematic Wiring Guide pages (6 pages)
  const guideBytes = fs.readFileSync(guidePdfPath);
  const guideDoc = await PDFDocument.load(guideBytes);
  const guidePages = await mergedDoc.copyPages(guideDoc, guideDoc.getPageIndices());
  guidePages.forEach((p) => mergedDoc.addPage(p));

  mergedDoc.setTitle('Macropad V1 & V2 — Complete Wiring & Hardware Guide');
  mergedDoc.setAuthor('Macropad Project');
  mergedDoc.setSubject('Unified Picture Wiring, Schematics, Pinout Tables, and Bench Checklist');
  mergedDoc.setKeywords(['macropad', 'wiring', 'rp2040-zero', 'cherry-mx', 'oled', 'rotary-encoder']);

  const finalBytes = await mergedDoc.save();
  fs.writeFileSync(outPdfPath, finalBytes);

  console.log(`Successfully combined wiring documents into: ${outPdfPath}`);
  console.log(`Total Pages: ${mergedDoc.getPageCount()}`);
  console.log(`File Size: ${(finalBytes.length / 1024).toFixed(1)} KB`);
}

combineWiringGuides().catch((err) => {
  console.error('Failed to combine wiring guides:', err);
  process.exit(1);
});
