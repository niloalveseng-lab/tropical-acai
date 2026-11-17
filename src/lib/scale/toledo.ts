/**
 * Balança Toledo Prix 3 Fit — leitura de peso pelo cabo (RS-232 ou USB).
 *
 * Configuração na balança (manual Prix 3 Fit, parâmetros técnicos):
 *   C14 = Prt3  (protocolo com status de estabilidade)  ← recomendado
 *   C15 = velocidade (quando disponível) — usar a mesma do sistema (padrão 2400, como vem a balança da loja)
 *   Formato fixo: 8 bits de dados, sem paridade, 1 stop bit.
 *
 * Protocolo Prt3: o PDV envia ENQ (0x05) e a balança responde
 *   STX PPPPP ETX   peso estável (5 dígitos, sem vírgula; 3 casas implícitas → gramas)
 *   STX IIIII ETX   peso instável
 *   STX NNNNN ETX   peso negativo
 *   STX SSSSS ETX   sobrecarga
 * Prt1 responde igual, mas sem os estados I/N/S.
 *
 * Funciona no Chrome ou Edge do computador do balcão (Web Serial API).
 */

export const STX = 0x02, ETX = 0x03, ENQ = 0x05;

export type ScaleReading =
  | { status: "estavel"; gramas: number }
  | { status: "instavel" }
  | { status: "negativo" }
  | { status: "sobrecarga" }
  | { status: "invalido"; bruto: string };

/** Interpreta um quadro STX ... ETX (ou o conteúdo entre eles). */
export function parseFrame(payload: string): ScaleReading {
  const p = payload.replace(/[\x02\x03\r\n]/g, "").trim();
  if (/^I+$/.test(p)) return { status: "instavel" };
  if (/^N+$/.test(p)) return { status: "negativo" };
  if (/^S+$/.test(p)) return { status: "sobrecarga" };
  if (/^\d{5}$/.test(p)) return { status: "estavel", gramas: parseInt(p, 10) };
  // Prt2 (6 caracteres com ponto decimal, ex. "01.234")
  const m = p.match(/^-?\d{1,3}[.,]\d{3}$/);
  if (m) {
    const kg = parseFloat(p.replace(",", "."));
    return kg < 0 ? { status: "negativo" } : { status: "estavel", gramas: Math.round(kg * 1000) };
  }
  return { status: "invalido", bruto: p };
}

/** Extrai o último quadro completo de um buffer de bytes recebidos. */
export function lastFrame(buf: Uint8Array): string | null {
  let end = -1;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i] === ETX || buf[i] === 0x0d) { end = i; break; }
  }
  if (end < 0) return null;
  let start = -1;
  for (let i = end - 1; i >= 0; i--) if (buf[i] === STX) { start = i; break; }
  if (start < 0) return null;
  return new TextDecoder().decode(buf.slice(start + 1, end));
}

/** Preço do açaí no quilo, descontando a tara da embalagem. */
export function precoPorPeso(pesoBrutoG: number, taraG: number, precoKg: number) {
  const liquido = Math.max(0, Math.round(pesoBrutoG - taraG));
  const valor = Math.round((liquido / 1000) * precoKg * 100) / 100;
  return { liquidoG: liquido, valor };
}

/* ---------------- Conexão Web Serial (somente navegador) ---------------- */

type SerialPortLike = {
  open(o: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

export class ToledoScale {
  private port: SerialPortLike | null = null;

  static suportado() {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /** Abre a janela do navegador para escolher a porta (só na 1ª vez; depois reconecta sozinho). */
  async conectar(baudRate = 2400, pedirPorta = true) {
    const serial = (navigator as unknown as { serial: { getPorts(): Promise<SerialPortLike[]>; requestPort(): Promise<SerialPortLike> } }).serial;
    const ja = await serial.getPorts();
    this.port = ja[0] ?? (pedirPorta ? await serial.requestPort() : null);
    if (!this.port) throw new Error("Nenhuma balança autorizada neste computador");
    await this.port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none" });
  }

  get conectada() { return !!this.port; }

  async desconectar() {
    try { await this.port?.close(); } finally { this.port = null; }
  }

  /** Envia ENQ e aguarda a resposta (até `timeoutMs`). */
  async lerPeso(timeoutMs = 800): Promise<ScaleReading> {
    if (!this.port?.writable || !this.port.readable) throw new Error("Balança desconectada");
    const w = this.port.writable.getWriter();
    await w.write(new Uint8Array([ENQ]));
    w.releaseLock();

    const r = this.port.readable.getReader();
    let buf = new Uint8Array(0);
    const timer = setTimeout(() => r.cancel().catch(() => {}), timeoutMs);
    try {
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        if (value) {
          const n = new Uint8Array(buf.length + value.length);
          n.set(buf); n.set(value, buf.length); buf = n;
          const f = lastFrame(buf);
          if (f !== null) return parseFrame(f);
        }
      }
    } finally {
      clearTimeout(timer);
      r.releaseLock();
    }
    return { status: "invalido", bruto: new TextDecoder().decode(buf) };
  }

  /** Lê repetidamente até o peso estabilizar (ou desistir). */
  async lerEstavel(tentativas = 10, intervaloMs = 250): Promise<ScaleReading> {
    let ultima: ScaleReading = { status: "instavel" };
    for (let i = 0; i < tentativas; i++) {
      ultima = await this.lerPeso();
      if (ultima.status !== "instavel") return ultima;
      await new Promise((ok) => setTimeout(ok, intervaloMs));
    }
    return ultima;
  }
}
