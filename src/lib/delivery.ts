/** Entrega por raio (distância em linha reta da loja até o ponto marcado pelo cliente). */

export type Faixa = { ate_km: number; taxa: number };
export type Ponto = { lat: number; lng: number };

export function distanciaKm(a: Ponto, b: Ponto) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Cotacao =
  | { entrega: true; distanciaKm: number; taxa: number }
  | { entrega: false; distanciaKm: number; motivo: string };

/** 0–1 km R$ 5 · 1–2 km R$ 7 · 2–3 km R$ 8 · 3–4 km R$ 10 · acima disso não entrega. */
export function cotarEntrega(loja: Ponto, destino: Ponto, faixas: Faixa[]): Cotacao {
  const d = Math.round(distanciaKm(loja, destino) * 100) / 100;
  const f = [...faixas].sort((x, y) => x.ate_km - y.ate_km).find((x) => d <= x.ate_km);
  if (!f) return { entrega: false, distanciaKm: d, motivo: `Endereço a ${d.toFixed(1).replace(".", ",")} km. Entregamos até ${Math.max(...faixas.map((x) => x.ate_km))} km da loja.` };
  return { entrega: true, distanciaKm: d, taxa: f.taxa };
}

export function checarPedidoMinimo(subtotal: number, minimo: number) {
  return subtotal >= minimo ? null : `Pedido mínimo para entrega: R$ ${minimo.toFixed(2).replace(".", ",")}. Faltam R$ ${(minimo - subtotal).toFixed(2).replace(".", ",")}.`;
}
