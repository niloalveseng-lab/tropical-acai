/** Botão fixo no canto da tela que abre o atendimento no WhatsApp. */
export function WhatsAppFlutuante({ numero, mensagem = "Olá! Vim pelo site do Tropical Açaí." }: { numero: string; mensagem?: string }) {
  const href = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com o Tropical Açaí no WhatsApp"
      className="pressionavel fixed z-20 left-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-5 sm:bottom-5 flex items-center gap-2 rounded-full bg-whats px-3.5 py-3.5 font-bold text-white shadow-[0_10px_28px_-8px_rgb(0_0_0/.45)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-lima sm:px-4 sm:py-3"
    >
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" fill="currentColor">
        <path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.8 5 2.1.9 3 1 4 .8.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5 0-.2-.3-.3-.6-.4Z" />
      </svg>
      <span className="hidden sm:inline">Fale com a gente</span>
    </a>
  );
}
