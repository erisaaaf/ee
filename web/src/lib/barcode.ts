// Barcode / QR classification. Product barcodes are validated with their GS1 check digit.
// QR codes are only treated as food products when they carry a GS1 GTIN (e.g. GS1 Digital Link);
// any other QR content is reported as-is and NEVER treated as a verified nutrition record.

export type ScanResult =
  | { kind: "product"; gtin: string; format: "EAN-13" | "EAN-8" | "UPC-A" | "UPC-E" | "GTIN-14"; fromQr: boolean }
  | { kind: "invalid_barcode"; raw: string; reason: string }
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };

export function gs1CheckDigitValid(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Weights 3,1,3,1... from the right (excluding the check digit).
  digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check;
}

/** Expand UPC-E (8 digits incl. number system + check) to UPC-A. */
export function upcEToUpcA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const ns = upce[0];
  const d = upce.slice(1, 7);
  const check = upce[7];
  const last = d[5];
  let body: string;
  if ("012".includes(last)) body = `${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}`;
  else if (last === "3") body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (last === "4") body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}`;
  return `${ns}${body}${check}`;
}

function classifyDigits(code: string, fromQr: boolean): ScanResult {
  if (code.length === 13) {
    return gs1CheckDigitValid(code)
      ? { kind: "product", gtin: code, format: "EAN-13", fromQr }
      : { kind: "invalid_barcode", raw: code, reason: "The check digit doesn't match — the code may have been misread." };
  }
  if (code.length === 8) {
    if (gs1CheckDigitValid(code)) return { kind: "product", gtin: code, format: "EAN-8", fromQr };
    const upca = upcEToUpcA(code);
    if (upca && gs1CheckDigitValid(upca)) return { kind: "product", gtin: upca, format: "UPC-E", fromQr };
    return { kind: "invalid_barcode", raw: code, reason: "The check digit doesn't match — the code may have been misread." };
  }
  if (code.length === 12) {
    return gs1CheckDigitValid(code)
      ? { kind: "product", gtin: code, format: "UPC-A", fromQr }
      : { kind: "invalid_barcode", raw: code, reason: "The check digit doesn't match — the code may have been misread." };
  }
  if (code.length === 14) {
    if (!gs1CheckDigitValid(code)) return { kind: "invalid_barcode", raw: code, reason: "The check digit doesn't match." };
    // GTIN-14 with leading zero(s) maps to EAN-13 / UPC-A used by product databases.
    if (code.startsWith("00")) return { kind: "product", gtin: code.slice(2), format: "UPC-A", fromQr };
    if (code.startsWith("0")) return { kind: "product", gtin: code.slice(1), format: "EAN-13", fromQr };
    return { kind: "product", gtin: code, format: "GTIN-14", fromQr };
  }
  return { kind: "invalid_barcode", raw: code, reason: "Food barcodes have 8, 12, 13 or 14 digits." };
}

export function classifyScan(raw: string): ScanResult {
  const text = raw.trim();
  if (/^\d{6,14}$/.test(text)) return classifyDigits(text, false);
  // GS1 Digital Link, e.g. https://id.gs1.org/01/09506000134352/10/ABC
  const dl = text.match(/^https?:\/\/[^/]+\/(?:.*\/)?01\/(\d{8,14})(?:[/?#].*)?$/i);
  if (dl) return classifyDigits(dl[1], true);
  // GS1 element string in a QR, e.g. (01)09506000134352 or ]Q3 01...
  const el = text.match(/^\(01\)(\d{14})/) ?? text.match(/^(?:\]Q3|\]d2)?01(\d{14})/);
  if (el) return classifyDigits(el[1], true);
  if (/^https?:\/\//i.test(text)) return { kind: "url", url: text };
  return { kind: "text", text: text.slice(0, 500) };
}
