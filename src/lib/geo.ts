/**
 * Lê coordenadas de um texto colado: link do Google Maps (com @lat,lng, q=, query=, ll=, !3d!4d),
 * localização compartilhada no WhatsApp ou "lat, lng" digitado.
 */
export type Coordenadas = { lat: number; lng: number };

const valida = (lat: number, lng: number): Coordenadas | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;

export function extrairCoordenadas(texto: string): Coordenadas | null {
  if (!texto) return null;
  let t = texto.trim();
  try { t = decodeURIComponent(t); } catch { /* texto comum */ }
  const num = String.raw`(-?\d{1,3}\.\d+)`;
  const padroes = [
    new RegExp(String.raw`!3d${num}!4d${num}`),          // .../data=!3d-6.74!4d-38.24 (ponto exato do lugar)
    new RegExp(String.raw`@${num},${num}`),              // .../@-6.74,-38.24,17z
    new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=(?:loc:)?${num}\s*,\s*${num}`),
    new RegExp(String.raw`^${num}\s*[,; ]\s*${num}$`),   // "-6.74, -38.24"
    new RegExp(String.raw`${num}\s*,\s*${num}`),         // qualquer par no meio do texto
  ];
  for (const re of padroes) {
    const m = t.match(re);
    if (m) { const c = valida(Number(m[1]), Number(m[2])); if (c) return c; }
  }
  return null;
}

/** Link curto do Google Maps que precisa ser aberto no servidor para achar as coordenadas. */
export const ehLinkCurtoMaps = (t: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(t.trim());
