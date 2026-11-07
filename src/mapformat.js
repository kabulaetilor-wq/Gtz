// Lecture d'un fichier chunk (format ESM1) — sans dépendance, utilisable aussi sous Node.
export const HEADER = 24;

export function parseChunk(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'ESM1') throw new Error('Chunk invalide : ' + magic);
  const cx = dv.getUint16(4, true);
  const cz = dv.getUint16(6, true);
  const HN = dv.getUint16(8, true);
  const SN = dv.getUint16(10, true);
  const minH = dv.getFloat32(12, true);
  const maxH = dv.getFloat32(16, true);
  const jsonLen = dv.getUint32(20, true);
  const heights = new Uint16Array(buf, HEADER, HN * HN);
  const splatOff = HEADER + HN * HN * 2;
  const splat = new Uint8Array(buf, splatOff, SN * SN * 4);
  const jsonOff = splatOff + SN * SN * 4;
  const text = new TextDecoder('utf-8').decode(new Uint8Array(buf, jsonOff, jsonLen));
  const objects = JSON.parse(text);
  return { cx, cz, HN, SN, minH, maxH, heights, splat, objects };
}
