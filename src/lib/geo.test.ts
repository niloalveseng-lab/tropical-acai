import { describe, expect, it } from "vitest";
import { ehLinkCurtoMaps, extrairCoordenadas } from "./geo";

describe("coordenadas coladas", () => {
  it("lê links do Google Maps", () => {
    expect(extrairCoordenadas("https://www.google.com/maps/place/Tropical+A%C3%A7ai/@-6.7490513,-38.2423700,17z/data=!3d-6.7490513!4d-38.24237")).toEqual({ lat: -6.7490513, lng: -38.24237 });
    expect(extrairCoordenadas("https://maps.google.com/maps?q=-6.7521%2C-38.2401&z=17")).toEqual({ lat: -6.7521, lng: -38.2401 });
    expect(extrairCoordenadas("https://www.google.com/maps/search/?api=1&query=-6.75,-38.24")).toEqual({ lat: -6.75, lng: -38.24 });
  });
  it("lê coordenadas digitadas", () => {
    expect(extrairCoordenadas("-6.7512, -38.2389")).toEqual({ lat: -6.7512, lng: -38.2389 });
    expect(extrairCoordenadas("Minha localização: -6.7512,-38.2389")).toEqual({ lat: -6.7512, lng: -38.2389 });
  });
  it("ignora texto sem coordenadas", () => {
    expect(extrairCoordenadas("Rua Manoel Francisco de Barros, 47")).toBeNull();
    expect(extrairCoordenadas("")).toBeNull();
  });
  it("reconhece link curto", () => {
    expect(ehLinkCurtoMaps("https://maps.app.goo.gl/MjkoGWeLm3SKbeba6")).toBe(true);
    expect(ehLinkCurtoMaps("https://google.com")).toBe(false);
  });
});
