export const HLL_MAPS = [
  "Carentan",
  "Driel",
  "El Alamein",
  "Elsenborn Ridge",
  "Foy",
  "Hill 400",
  "Hurtgen Forest",
  "Kharkov",
  "Kursk",
  "Mortain",
  "Omaha Beach",
  "Purple Heart Lane",
  "Remagen",
  "Sainte-Marie-du-Mont",
  "Sainte-Mere-Eglise",
  "Stalingrad",
  "Tobruk",
  "Utah Beach",
] as const;

export type HllMapName = (typeof HLL_MAPS)[number];
