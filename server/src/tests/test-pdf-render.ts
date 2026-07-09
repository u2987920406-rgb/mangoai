// Tests du rendu visuel de PDF (#147 — pdf-render.ts).
// Autonome : génère ses propres PDF (texte + image embarquée) avec offsets xref
// calculés, exerce le rendu, le crop, les garde-fous et l'extraction d'images.
// Pas de réseau, pas de fixture externe.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderPdfPage, extractPdfImages, pdfPageCount } from "../pdf-render.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

// ── Générateurs de PDF minimaux (offsets xref exacts) ────────────────────────

/** PDF 1 page 300×200 avec deux lignes de texte. */
function makeTextPdf(dst: string): void {
  const content = `BT /F1 24 Tf 40 120 Td (Hello Mango) Tj 0 -40 Td (page test) Tj ET`;
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (out += String(o).padStart(10, "0") + " 00000 n \n"));
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  fs.writeFileSync(dst, out, "latin1");
}

/** PDF 1 page avec une image RGB 4×4 embarquée (XObject). */
function makeImagePdf(dst: string): void {
  const px: number[] = [];
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const on = (x + y) % 2 === 0;
      px.push(on ? 255 : 0, on ? 80 : 160, on ? 0 : 255);
    }
  const imgData = Buffer.from(px);
  const content = `q 200 0 0 200 50 0 cm /Im0 Do Q`;
  const objs: Buffer[] = [
    Buffer.from(`<< /Type /Catalog /Pages 2 0 R >>`),
    Buffer.from(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${imgData.length} >>\nstream\n`),
      imgData,
      Buffer.from(`\nendstream`),
    ]),
  ];
  let buf = Buffer.from("%PDF-1.4\n");
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(buf.length);
    buf = Buffer.concat([buf, Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from(`\nendobj\n`)]);
  });
  const xrefStart = buf.length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (xref += String(o).padStart(10, "0") + " 00000 n \n"));
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  fs.writeFileSync(dst, Buffer.concat([buf, Buffer.from(xref)]));
}

/** Le PNG commence-t-il par la signature magique ? */
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

// ── Suite ────────────────────────────────────────────────────────────────────

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-render-"));
const textPdf = path.join(dir, "text.pdf");
const imgPdf = path.join(dir, "img.pdf");
makeTextPdf(textPdf);
makeImagePdf(imgPdf);

async function run() {
  console.log("\n[1] pdfPageCount");
  check("document texte a 1 page", (await pdfPageCount(textPdf)) === 1);

  console.log("\n[2] renderPdfPage — page pleine");
  const full = await renderPdfPage(textPdf, 1, { scale: 3 });
  check("PNG valide (signature)", isPng(full.png));
  check("dimensions = 300×200 ×3 = 900×600", full.width === 900 && full.height === 600);
  check("scale appliqué = 3", full.scale === 3);
  check("pageCount renvoyé", full.pageCount === 1);

  console.log("\n[3] renderPdfPage — crop");
  const crop = await renderPdfPage(textPdf, 1, { scale: 3, crop: { x: 100, y: 80, w: 300, h: 120 } });
  check("crop = 300×120", crop.width === 300 && crop.height === 120);
  check("crop PNG valide", isPng(crop.png));

  console.log("\n[4] garde-fous");
  check("scale par défaut quand absent", (await renderPdfPage(textPdf, 1)).scale === 2);
  // scale extrême → replafonné par DIM_MAX (5000), jamais au-delà.
  const huge = await renderPdfPage(textPdf, 1, { scale: 99 });
  check("dimension plafonnée ≤ 5000", Math.max(huge.width, huge.height) <= 5000);
  // crop hors cadre → clampé, jamais d'erreur.
  const oob = await renderPdfPage(textPdf, 1, { scale: 2, crop: { x: 9999, y: 9999, w: 9999, h: 9999 } });
  check("crop hors cadre clampé (≥1px, dans le cadre)", oob.width >= 1 && oob.height >= 1);
  let threw = false;
  try {
    await renderPdfPage(textPdf, 9, {});
  } catch {
    threw = true;
  }
  check("page hors limites → throw", threw);
  let threwMissing = false;
  try {
    await renderPdfPage(path.join(dir, "nope.pdf"), 1, {});
  } catch {
    threwMissing = true;
  }
  check("PDF introuvable → throw", threwMissing);

  console.log("\n[5] extractPdfImages");
  const imgs = await extractPdfImages(imgPdf);
  check("1 image embarquée extraite", imgs.length === 1);
  check("image 4×4", imgs[0]?.width === 4 && imgs[0]?.height === 4);
  check("image PNG valide", isPng(imgs[0]?.png ?? Buffer.alloc(0)));
  check("image rattachée à la page 1", imgs[0]?.pageNum === 1);
  const none = await extractPdfImages(textPdf);
  check("PDF sans image → tableau vide", none.length === 0);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? "✅" : "❌"} pdf-render : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
