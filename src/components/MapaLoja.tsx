/** Mapa com a localização da loja (Google Maps incorporado, sem chave de API). */
export function MapaLoja({ lat, lng, endereco }: { lat: number; lng: number; endereco: string }) {
  const embed = `https://maps.google.com/maps?q=${lat},${lng}&z=17&hl=pt-BR&output=embed`;
  const rota = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return (
    <section aria-labelledby="onde" className="mx-auto max-w-5xl px-4 py-12">
      <h2 id="onde" className="text-2xl font-extrabold">Onde estamos</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl border border-roxo/10 shadow-sm">
          <iframe title="Mapa do Tropical Açaí" src={embed} className="h-80 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-roxo p-5 text-white">
          <p className="font-bold">{endereco}</p>
          <p className="text-sm text-white/80">Próximo à Praça do Alto do Cruzeiro, em frente à Igreja São João Batista.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="font-bold">Ter a Qui</dt><dd>14h às 21h</dd>
            <dt className="font-bold">Sex e Sáb</dt><dd>14h às 22h</dd>
            <dt className="font-bold">Domingo</dt><dd>14h às 21h</dd>
            <dt className="font-bold text-white/60">Segunda</dt><dd className="text-white/60">Fechado</dd>
          </dl>
          <a href={rota} target="_blank" rel="noopener noreferrer" className="mt-auto rounded-full bg-lima px-4 py-2.5 text-center font-extrabold text-roxo-escuro">Como chegar</a>
        </div>
      </div>
    </section>
  );
}
