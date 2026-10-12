import qrcode from "qrcode-generator";

/**
 * A QR code as one SVG path, so the page can colour and size it with its
 * own tokens: `size` modules square (quiet zone included), `path` one unit
 * square per dark module. Error correction M, which still reads off a
 * projector screen across a classroom.
 */
export function qrPath(text: string, quiet = 2): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return { size: n + quiet * 2, path };
}
