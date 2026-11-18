import { NextResponse } from "next/server";
import { AcessoNegado, exigirEquipe } from "@/lib/equipe/admin";
import { ehLinkCurtoMaps, extrairCoordenadas } from "@/lib/geo";
import { permitido } from "@/lib/limite";
import { supabaseConfigurado } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Ajuda o caixa a achar o local da entrega (só para a equipe):
 *  ?link=<link curto do Google Maps>  → abre o link e devolve as coordenadas
 *  ?q=<endereço>                      → busca no OpenStreetMap, perto de Sousa-PB
 */
export async function GET(req: Request) {
  try {
    const usuario = supabaseConfigurado() ? await exigirEquipe() : "demo";
    if (!permitido("geo:" + usuario, 30, 60_000)) return NextResponse.json({ erro: "Muitas buscas seguidas. Aguarde um minuto." }, { status: 429 });
    const u = new URL(req.url);
    const link = u.searchParams.get("link")?.trim();
    const q = u.searchParams.get("q")?.trim();

    if (link) {
      if (!ehLinkCurtoMaps(link)) return NextResponse.json({ erro: "Link não reconhecido" }, { status: 400 });
      // Segue os redirecionamentos e procura as coordenadas no endereço final e na página.
      const r = await fetch(link, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      const c = extrairCoordenadas(r.url) ?? extrairCoordenadas((await r.text()).slice(0, 200_000).match(/https:\/\/www\.google\.[^"'\\]+@-?\d+\.\d+,-?\d+\.\d+/)?.[0] ?? "");
      return c ? NextResponse.json(c) : NextResponse.json({ erro: "Não achei a localização nesse link. Peça ao cliente para enviar a localização de novo." }, { status: 404 });
    }

    if (q && q.length >= 3) {
      const busca = new URL("https://nominatim.openstreetmap.org/search");
      busca.search = new URLSearchParams({
        q: /sousa/i.test(q) ? q : `${q}, Sousa, Paraíba`, format: "jsonv2", limit: "6", countrycodes: "br",
        viewbox: "-38.32,-6.68,-38.16,-6.82", bounded: "1", "accept-language": "pt-BR",
      }).toString();
      const r = await fetch(busca, { headers: { "User-Agent": "TropicalAcai/1.0 (https://otropicalacai.com.br)" }, signal: AbortSignal.timeout(8000) });
      const lista = (await r.json()) as { lat: string; lon: string; display_name: string }[];
      return NextResponse.json({ resultados: lista.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), nome: x.display_name.split(", ").slice(0, 3).join(", ") })) });
    }
    return NextResponse.json({ erro: "Informe o endereço ou o link" }, { status: 400 });
  } catch (e) {
    if (e instanceof AcessoNegado) return NextResponse.json({ erro: e.message }, { status: 403 });
    console.error("[geo]", e);
    return NextResponse.json({ erro: "A busca não respondeu. Marque o local direto no mapa." }, { status: 502 });
  }
}
