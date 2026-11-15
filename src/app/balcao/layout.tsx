import type { Metadata } from "next";
export const metadata: Metadata = { title: "Balcão · Tropical Açaí", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
