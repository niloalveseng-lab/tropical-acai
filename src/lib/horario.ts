/** Horário da loja (fuso de Sousa-PB). `horarios`: dia da semana (0=dom) → [abre, fecha] em horas, ou null = fechado. */
export type Horarios = Record<string, [number, number] | null>;
export type Agora = { diaSemana: number; hora: number; data: string };

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export type StatusLoja = { aberta: boolean; texto: string; proxima: { diaSemana: number; hora: number; emDias: number } | null };

export function statusLoja(h: Horarios, agora: Agora): StatusLoja {
  const hoje = h[String(agora.diaSemana)];
  if (hoje && agora.hora >= hoje[0] && agora.hora < hoje[1]) return { aberta: true, texto: `Aberto agora · até ${hoje[1]}h`, proxima: null };
  for (let i = 0; i <= 7; i++) {
    const d = (agora.diaSemana + i) % 7, hh = h[String(d)];
    if (!hh) continue;
    if (i === 0 && agora.hora >= hh[0]) continue; // já fechou hoje
    const quando = i === 0 ? "hoje" : i === 1 ? "amanhã" : DIAS[d];
    return { aberta: false, texto: `Fechado · abre ${quando} às ${hh[0]}h`, proxima: { diaSemana: d, hora: hh[0], emDias: i } };
  }
  return { aberta: false, texto: "Fechado", proxima: null };
}

export function saudacao(hora: number) {
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}
