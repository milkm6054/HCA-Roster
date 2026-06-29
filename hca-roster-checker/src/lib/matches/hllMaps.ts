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

export const HLL_MAP_MIDPOINTS = {
  Carentan: ["Train Station", "Town Center", "Canal Crossing"],
  Driel: ["Brick Factory", "Railway Bridge", "Gun Emplacements"],
  "El Alamein": ["Valley", "Oasis", "Desert Rat Trenches"],
  "Elsenborn Ridge": ["Road to Elsenborn Ridge", "Dugout Tanks", "Checkpoint"],
  Foy: ["West Bend", "Southern Edge", "Dugout Barn"],
  "Hill 400": ["Flak Pits", "Hill 400", "Southern Approach"],
  "Hurtgen Forest": ["The Siegfried Line", "The Scar", "North Pass"],
  Kharkov: ["Water Mill", "St Mary", "Distillery"],
  Kursk: ["The Windmills", "Yamki", "Oleg's House"],
  Mortain: ["Southern Approach", "La Petite Chapelle Saint-Michel", "Abandoned German Checkpoint"],
  "Omaha Beach": ["West Vierville", "Vierville Sur Mer", "Artillery Battery"],
  "Purple Heart Lane": ["Dead Man's Corner", "Groult Pillbox", "Ingouf Crossroads"],
  Remagen: ["St. Severin Chapel", "Ludendorff Bridge", "Bauernhof am Rhein"],
  "Sainte-Marie-du-Mont": ["The Dugout", "AA Network", "Pierre's Farm"],
  "Sainte-Mere-Eglise": ["Hospice", "Sainte-Mere-Eglise", "Checkpoint"],
  Stalingrad: ["Train Station", "Carriage Depot", "Railway Crossing"],
  Tobruk: ["Desert Rat Caves", "Church Grounds", "Admiralty House"],
  "Utah Beach": ["WN7", "The Chapel", "WN4"],
} as const satisfies Record<HllMapName, readonly [string, string, string]>;

export function getMidpointsForMap(mapName?: string | null): readonly string[] {
  if (!mapName || !HLL_MAPS.includes(mapName as HllMapName)) {
    return [];
  }

  return HLL_MAP_MIDPOINTS[mapName as HllMapName];
}
