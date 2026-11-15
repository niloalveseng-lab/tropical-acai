import type { Cardapio } from "@/lib/cardapio";

/** Cardápio usado enquanto o banco (Supabase) não está configurado. Espelha supabase/seed.sql. */
export const CARDAPIO_DEMO: Cardapio = {
 "demo": true,
 "settings": {
  "acomp_extra": 2,
  "preco_kg": 49.99
 },
 "sizes": [
  {
   "id": "c300",
   "embalagem": "Copo",
   "rotulo": "300 ml",
   "preco": 14.9,
   "acomp_inclusos": 3,
   "ativo": true
  },
  {
   "id": "c400",
   "embalagem": "Copo",
   "rotulo": "400 ml",
   "preco": 17.9,
   "acomp_inclusos": 4,
   "ativo": true
  },
  {
   "id": "c500",
   "embalagem": "Copo",
   "rotulo": "500 ml",
   "preco": 19.9,
   "acomp_inclusos": 5,
   "ativo": true
  },
  {
   "id": "p300",
   "embalagem": "Pote",
   "rotulo": "300 ml",
   "preco": 15.9,
   "acomp_inclusos": 3,
   "ativo": true
  },
  {
   "id": "p500",
   "embalagem": "Pote",
   "rotulo": "500 ml",
   "preco": 21.9,
   "acomp_inclusos": 5,
   "ativo": true
  },
  {
   "id": "p750",
   "embalagem": "Pote",
   "rotulo": "750 ml",
   "preco": 29.9,
   "acomp_inclusos": 6,
   "ativo": true
  },
  {
   "id": "p1l",
   "embalagem": "Pote",
   "rotulo": "1 litro",
   "preco": 38.9,
   "acomp_inclusos": 7,
   "ativo": true
  }
 ],
 "bases": [
  {
   "id": "tradicional",
   "nome": "Tradicional",
   "ativo": true
  },
  {
   "id": "zero",
   "nome": "Zero",
   "ativo": true
  }
 ],
 "grupos": [
  {
   "id": "frutas",
   "nome": "Frutas"
  },
  {
   "id": "cremes",
   "nome": "Cremes"
  },
  {
   "id": "mousses",
   "nome": "Mousses"
  },
  {
   "id": "compl",
   "nome": "Complementos"
  },
  {
   "id": "cob",
   "nome": "Coberturas"
  },
  {
   "id": "esp",
   "nome": "Cremes especiais"
  }
 ],
 "addons": [
  {
   "id": "frutas-banana",
   "group_id": "frutas",
   "nome": "Banana",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "frutas-morango",
   "group_id": "frutas",
   "nome": "Morango",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "frutas-kiwi",
   "group_id": "frutas",
   "nome": "Kiwi",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "frutas-cereja",
   "group_id": "frutas",
   "nome": "Cereja",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cremes-pistache",
   "group_id": "cremes",
   "nome": "Pistache",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cremes-ninho-trufado",
   "group_id": "cremes",
   "nome": "Ninho Trufado",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cremes-morango",
   "group_id": "cremes",
   "nome": "Morango",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "mousses-abacaxi",
   "group_id": "mousses",
   "nome": "Abacaxi",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "mousses-maracuja",
   "group_id": "mousses",
   "nome": "Maracujá",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "mousses-limao",
   "group_id": "mousses",
   "nome": "Limão",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-leite-em-po",
   "group_id": "compl",
   "nome": "Leite em Pó",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-amendoim",
   "group_id": "compl",
   "nome": "Amendoim",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-castanha",
   "group_id": "compl",
   "nome": "Castanha",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-m-m-s",
   "group_id": "compl",
   "nome": "M&M's",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-chocobol",
   "group_id": "compl",
   "nome": "Chocobol",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-oreo",
   "group_id": "compl",
   "nome": "Oreo",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-marshmallow",
   "group_id": "compl",
   "nome": "Marshmallow",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-granulado",
   "group_id": "compl",
   "nome": "Granulado",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-fini-beijos",
   "group_id": "compl",
   "nome": "Fini Beijos",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-fini-banana",
   "group_id": "compl",
   "nome": "Fini Banana",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-farinha-lactea",
   "group_id": "compl",
   "nome": "Farinha Láctea",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-granola",
   "group_id": "compl",
   "nome": "Granola",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-gotas-de-chocolate",
   "group_id": "compl",
   "nome": "Gotas de Chocolate",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-tubetes",
   "group_id": "compl",
   "nome": "Tubetes",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-bis",
   "group_id": "compl",
   "nome": "Bis",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "compl-ouro-branco",
   "group_id": "compl",
   "nome": "Ouro Branco",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cob-leite-condensado",
   "group_id": "cob",
   "nome": "Leite Condensado",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cob-chocolate",
   "group_id": "cob",
   "nome": "Chocolate",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cob-morango",
   "group_id": "cob",
   "nome": "Morango",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cob-uva",
   "group_id": "cob",
   "nome": "Uva",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "cob-caramelo",
   "group_id": "cob",
   "nome": "Caramelo",
   "preco_adicional": 0,
   "conta_no_limite": true,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "esp-creme-de-ovomaltine",
   "group_id": "esp",
   "nome": "Creme de Ovomaltine",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "esp-creme-de-ninho",
   "group_id": "esp",
   "nome": "Creme de Ninho",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "esp-creme-de-avela",
   "group_id": "esp",
   "nome": "Creme de Avelã",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  },
  {
   "id": "esp-creme-de-buenissimo",
   "group_id": "esp",
   "nome": "Creme de Buenissimo",
   "preco_adicional": 3,
   "conta_no_limite": false,
   "ativo": true,
   "esgotado_em": null
  }
 ],
 "categorias": [
  {
   "id": "batida",
   "nome": "Batida de Açaí"
  },
  {
   "id": "milkshake",
   "nome": "Milkshakes"
  },
  {
   "id": "sorvete",
   "nome": "Sorvetes"
  },
  {
   "id": "picole",
   "nome": "Picolés"
  }
 ],
 "products": [
  {
   "descricao": "No copo ou na garrafa",
   "preco": null,
   "tamanhos": [
    {
     "nome": "300 ml",
     "preco": 13
    },
    {
     "nome": "500 ml",
     "preco": 18
    }
   ],
   "sabores": null,
   "escolha": {
    "rotulo": "Servir em",
    "opcoes": [
     "Copo",
     "Garrafa"
    ]
   },
   "ativo": true,
   "esgotado_em": null,
   "imagem": "/img/batida.jpg",
   "id": "batida",
   "category_id": "batida",
   "nome": "Batida de Açaí",
   "kind": "opcoes"
  },
  {
   "descricao": "8 sabores · P, M ou G",
   "preco": null,
   "tamanhos": [
    {
     "nome": "P 300 ml",
     "preco": 15
    },
    {
     "nome": "M 400 ml",
     "preco": 18
    },
    {
     "nome": "G 500 ml",
     "preco": 20
    }
   ],
   "sabores": [
    "Ovomaltine",
    "Chocolate",
    "Morango",
    "Doce de Leite",
    "Céu Azul",
    "Ouro Branco",
    "Ninho Trufado",
    "Flocos"
   ],
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": "/img/milkshake.jpg",
   "id": "shake",
   "category_id": "milkshake",
   "nome": "Milkshake",
   "kind": "opcoes"
  },
  {
   "descricao": "1 ou 2 bolas",
   "preco": null,
   "tamanhos": [
    {
     "nome": "1 bola",
     "preco": 5,
     "sabores": 1
    },
    {
     "nome": "2 bolas",
     "preco": 7,
     "sabores": 2
    }
   ],
   "sabores": [
    "Nutella",
    "Céu Azul Trufado",
    "Abacaxi",
    "Prestígio",
    "Chokito",
    "Ouro Branco",
    "Chocolate Branco",
    "Doce de Leite",
    "Oreo"
   ],
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": "/img/cascao.jpg",
   "id": "cascao",
   "category_id": "sorvete",
   "nome": "Sorvete no Cascão",
   "kind": "opcoes"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic0",
   "category_id": "picole",
   "nome": "Picolé Abacaxi",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 7,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": "/img/pic_acai.jpg",
   "id": "pic1",
   "category_id": "picole",
   "nome": "Picolé Açaí c/ Leite Condensado",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 7,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic2",
   "category_id": "picole",
   "nome": "Picolé Brigadeiro Belga",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": "/img/pic_brownie.jpg",
   "id": "pic3",
   "category_id": "picole",
   "nome": "Picolé Brownie",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": "/img/pic_coco.jpg",
   "id": "pic4",
   "category_id": "picole",
   "nome": "Picolé Coco",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic5",
   "category_id": "picole",
   "nome": "Picolé Doce de Leite c/ Leite Condensado",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic6",
   "category_id": "picole",
   "nome": "Picolé Morango Trufado",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic7",
   "category_id": "picole",
   "nome": "Picolé Ninho",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic8",
   "category_id": "picole",
   "nome": "Picolé Oreo",
   "kind": "simples"
  },
  {
   "descricao": null,
   "preco": 6,
   "tamanhos": null,
   "sabores": null,
   "escolha": null,
   "ativo": true,
   "esgotado_em": null,
   "imagem": null,
   "id": "pic9",
   "category_id": "picole",
   "nome": "Picolé Paçoca",
   "kind": "simples"
  }
 ],
 "promos": [
  {
   "id": "copo-promocional",
   "nome": "Copo Promocional",
   "tamanho": "300 ml",
   "preco": 10,
   "composicao": [
    "Açaí",
    "Amendoim",
    "Leite em Pó",
    "Leite Condensado",
    "M&M's"
   ],
   "dias_semana": [
    2,
    3,
    4,
    5
   ],
   "hora_inicio": null,
   "hora_fim": null,
   "ativo": true
  }
 ],
 "imagens": {
  "Copo": "/img/acai_copo.jpg",
  "Pote": "/img/acai_pote.jpg"
 },
 "loja": {
  "whatsapp": "5583993526981",
  "endereco": "Av. Monsenhor Vicente Freitas, 445 – Sousa-PB",
  "lat": -6.7490513,
  "lng": -38.24237,
  "horarios": {
   "0": [
    14,
    21
   ],
   "1": null,
   "2": [
    14,
    21
   ],
   "3": [
    14,
    21
   ],
   "4": [
    14,
    21
   ],
   "5": [
    14,
    22
   ],
   "6": [
    14,
    22
   ]
  },
  "faixas": [
   {
    "ate_km": 1,
    "taxa": 5
   },
   {
    "ate_km": 2,
    "taxa": 7
   },
   {
    "ate_km": 3,
    "taxa": 8
   },
   {
    "ate_km": 4,
    "taxa": 10
   }
  ],
  "pedidoMinimo": 20,
  "aceitaAgendamento": true
 }
} as Cardapio;
