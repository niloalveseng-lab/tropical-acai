/** Rodapé: onde estamos, horários, mapa (Google Maps incorporado, sem chave de API) e contatos. */
export function MapaLoja({ lat, lng, endereco, whatsapp }: { lat: number; lng: number; endereco: string; whatsapp?: string }) {
  const embed = `https://maps.google.com/maps?q=${lat},${lng}&z=17&hl=pt-BR&output=embed`;
  const rota = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return (
    <footer aria-labelledby="onde" className="bg-roxo-escuro text-white">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 pb-32 pt-14 sm:pb-16 md:grid-cols-[1fr_1.1fr] md:gap-12">
        <div className="flex flex-col">
          <h2 id="onde" className="text-[2rem] font-black leading-[1] tracking-[-0.035em] sm:text-5xl">Passa aqui.</h2>
          <p className="mt-4 text-lg font-bold leading-snug">{endereco}</p>
          <p className="mt-1 max-w-[38ch] text-sm text-white/65">Próximo à Praça do Alto do Cruzeiro, em frente à Igreja São João Batista.</p>
          <dl className="mt-6 grid max-w-xs grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm tabular-nums">
            <dt className="font-bold">Ter a Qui</dt><dd className="text-white/80">14h às 21h</dd>
            <dt className="font-bold">Sex e Sáb</dt><dd className="text-white/80">14h às 22h</dd>
            <dt className="font-bold">Domingo</dt><dd className="text-white/80">14h às 21h</dd>
            <dt className="font-bold text-white/45">Segunda</dt><dd className="text-white/45">Fechado</dd>
          </dl>
          <div className="mt-7 flex flex-wrap gap-2">
            <a href={rota} target="_blank" rel="noopener noreferrer" className="pressionavel rounded-full bg-lima px-5 py-3 text-sm font-extrabold text-roxo-escuro">Como chegar</a>
            <a href="https://instagram.com/otropical.acai" target="_blank" rel="noopener noreferrer" className="pressionavel rounded-full px-5 py-3 text-sm font-bold ring-1 ring-white/20 transition-colors hover:bg-white/10">@otropical.acai</a>
            {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="pressionavel rounded-full px-5 py-3 text-sm font-bold ring-1 ring-white/20 transition-colors hover:bg-white/10">WhatsApp</a>}
          </div>
        </div>
        <div className="overflow-hidden rounded-[24px] ring-1 ring-white/10">
          <iframe title="Mapa do Tropical Açaí" src={embed} className="h-72 w-full grayscale-[35%] md:h-full md:min-h-[340px]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </div>
    </footer>
  );
}
