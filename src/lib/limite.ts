/** Limite simples de tentativas por IP (memória do servidor). Em produção com várias instâncias, trocar por Upstash/Redis. */
const g = globalThis as unknown as { __limite?: Map<string, number[]> };
const mapa: Map<string, number[]> = (g.__limite ??= new Map());

export function permitido(chave: string, max: number, janelaMs: number, agora = Date.now()) {
  const marcas = (mapa.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (marcas.length >= max) { mapa.set(chave, marcas); return false; }
  marcas.push(agora); mapa.set(chave, marcas);
  return true;
}
