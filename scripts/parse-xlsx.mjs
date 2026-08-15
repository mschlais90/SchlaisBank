// Minimal, dependency-free .xlsx reader — just enough to pull the Bank of Dad
// sheet out of BankOfDad.xlsx. Unzips with zlib, then reads the few XML parts
// we need (shared strings, number formats, sheet cells).
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/** Extracts all files from a .zip buffer into a { name: Buffer } map. */
function unzip(buf) {
  const files = {};
  // Walk the End of Central Directory record backwards to find the directory.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record)");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Corrupt central directory");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    // The local header repeats the name/extra lengths; the data starts after them.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    files[name] = method === 0 ? raw : inflateRawSync(raw);

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeEntities = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");

/** Excel serial date -> "YYYY-MM-DD" (1900 date system). */
const serialToISO = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);

/**
 * Reads the workbook and returns a cell map like { B7: "2024-06-03", C7: 56 }
 * for the first worksheet, with date-formatted cells already converted.
 */
export function readSheetCells(xlsxPath) {
  const files = unzip(readFileSync(xlsxPath));
  const text = (name) => files[name]?.toString("utf8") ?? "";

  const strings = [];
  for (const si of text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
    strings.push(decodeEntities(s));
  }

  // Map each cell style index to its number format so we can spot date columns.
  const styles = text("xl/styles.xml");
  const numFmts = {};
  for (const f of styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)) {
    numFmts[f[1]] = decodeEntities(f[2]);
  }
  const cellXfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const xfFmtIds = [...cellXfs.matchAll(/<xf [^>]*numFmtId="(\d+)"/g)].map((x) => x[1]);

  const isDateStyle = (styleIdx) => {
    const id = xfFmtIds[styleIdx];
    if (id === undefined) return false;
    if (+id >= 14 && +id <= 22) return true; // built-in date/time formats
    const code = numFmts[id];
    return Boolean(code && /[dmy]/i.test(code) && !/[#0]/.test(code.replace(/\[[^\]]*\]/g, "")));
  };

  const sheetName = Object.keys(files).find((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  const sheet = text(sheetName);

  const cells = {};
  for (const row of sheet.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = row[1];
    // A cell is either self-closing (<c .../>) or wraps a value (<c ...>…</c>).
    for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const col = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/t="([^"]*)"/)?.[1];
      const styleIdx = attrs.match(/s="(\d+)"/)?.[1];

      const inline = body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];

      let value = null;
      if (inline !== undefined) value = decodeEntities(inline);
      else if (v !== undefined) {
        if (type === "s") value = strings[+v];
        else if (type === "str" || type === "e") value = decodeEntities(v);
        else if (styleIdx !== undefined && isDateStyle(+styleIdx) && !Number.isNaN(parseFloat(v)))
          value = serialToISO(parseFloat(v));
        else value = Number.isNaN(parseFloat(v)) ? decodeEntities(v) : parseFloat(v);
      }
      if (value !== null && value !== "") cells[col + rowNum] = value;
    }
  }
  return cells;
}
