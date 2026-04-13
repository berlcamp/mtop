export const INSPECTION_FIELDS = [
  "clean_windshields",
  "garbage_receptacle",
  "functioning_horn",
  "signal_lights",
  "tail_light",
  "top_chain",
  "headlights_taillights",
  "sidecar_light",
  "anti_noise_equipment",
  "body_number_sticker",
  "functional_mufflers",
  "road_worthiness",
] as const

export const INSPECTION_LABELS: Record<string, string> = {
  clean_windshields: "Clean Windshields",
  garbage_receptacle: "Garbage Receptacle",
  functioning_horn: "Functioning Horn (not excessively loud)",
  signal_lights: "Signal Lights (2 front + 2 back)",
  tail_light: "Tail Light + License Plate Light",
  top_chain: "Top Chain (extending to rear wheel)",
  headlights_taillights: "Headlights + Tail Light (white front, red rear, visible 5m)",
  sidecar_light: "Sidecar Interior Light (lighted while plying)",
  anti_noise_equipment: "Anti-noise Equipment / Silencer",
  body_number_sticker: "Body Number Sticker (identifiable from distance)",
  functional_mufflers: "Fully Functional Mufflers",
  road_worthiness: "Road Worthiness",
}
