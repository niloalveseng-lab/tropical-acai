import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const montserrat = localFont({ src: "./fonts/Montserrat-VF.ttf", variable: "--font-montserrat", weight: "100 900", display: "swap" });
const pacifico = localFont({ src: "./fonts/Pacifico-Regular.ttf", variable: "--font-pacifico", display: "swap" });

export const metadata: Metadata = {
  // Endereço oficial: usado nas prévias de link do WhatsApp e Instagram.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://otropicalacai.com.br"),
  title: "Tropical Açaí · Sousa-PB",
  description: "Açaí, milkshakes, sorvetes e picolés em Sousa-PB. Peça online para entrega ou retirada.",
  openGraph: { title: "Tropical Açaí", description: "O sabor gelado para os dias quentes", images: ["/img/logo.png"], locale: "pt_BR" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${montserrat.variable} ${pacifico.variable} font-sans`}>{children}</body>
    </html>
  );
}
