"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

type Ponto = { lat: number; lng: number };
const pino = (cor: string, rotulo: string) => L.divIcon({
  className: "", iconSize: [34, 44], iconAnchor: [17, 42],
  html: `<div aria-label="${rotulo}" style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${cor};border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35)"></div>`,
});

/** Mapa para o cliente marcar onde entregar: arrastar o pino ou tocar no mapa. */
export function MapaEntrega({ loja, destino, raioKm, onMudar }: { loja: Ponto; destino: Ponto | null; raioKm: number; onMudar: (p: Ponto) => void }) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marca = useRef<L.Marker | null>(null);
  const mudar = useRef(onMudar); mudar.current = onMudar;

  useEffect(() => {
    if (!div.current || mapa.current) return;
    const m = L.map(div.current, { zoomControl: true, attributionControl: true }).setView([loja.lat, loja.lng], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    L.circle([loja.lat, loja.lng], { radius: raioKm * 1000, color: "#421268", weight: 1.5, fillColor: "#9ACD1F", fillOpacity: 0.08 }).addTo(m);
    L.marker([loja.lat, loja.lng], { icon: pino("#421268", "Tropical Açaí"), interactive: false }).addTo(m);
    m.on("click", (e) => mudar.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; marca.current = null; };
  }, [loja.lat, loja.lng, raioKm]);

  useEffect(() => {
    const m = mapa.current; if (!m || !destino) return;
    if (!marca.current) {
      marca.current = L.marker([destino.lat, destino.lng], { icon: pino("#E8434F", "Local da entrega"), draggable: true, autoPan: true }).addTo(m);
      marca.current.on("dragend", () => { const p = marca.current!.getLatLng(); mudar.current({ lat: p.lat, lng: p.lng }); });
    } else marca.current.setLatLng([destino.lat, destino.lng]);
    m.panTo([destino.lat, destino.lng]);
  }, [destino]);

  return <div ref={div} className="h-56 w-full overflow-hidden rounded-2xl border-2 border-roxo/15" aria-label="Mapa para marcar o local da entrega" />;
}
