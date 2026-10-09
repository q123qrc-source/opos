/** Wallpapers (pure CSS mesh gradients, no assets) and accent palettes. */
export const WALLPAPERS: Record<string, { name: string; css: string }> = {
  aurora: {
    name: 'Aurora',
    css: 'radial-gradient(at 18% 22%, #4338ca 0px, transparent 50%), radial-gradient(at 82% 12%, #be185d 0px, transparent 45%), radial-gradient(at 70% 88%, #0e7490 0px, transparent 50%), radial-gradient(at 12% 92%, #6d28d9 0px, transparent 45%), #07080d',
  },
  nebula: {
    name: 'Nebula',
    css: 'radial-gradient(at 30% 30%, #7c3aed 0px, transparent 45%), radial-gradient(at 75% 65%, #db2777 0px, transparent 45%), radial-gradient(at 50% 100%, #1d4ed8 0px, transparent 50%), #05040a',
  },
  dune: {
    name: 'Dune',
    css: 'radial-gradient(at 20% 80%, #c2410c 0px, transparent 50%), radial-gradient(at 80% 20%, #a16207 0px, transparent 45%), radial-gradient(at 60% 60%, #7c2d12 0px, transparent 50%), #0c0705',
  },
  lagoon: {
    name: 'Lagoon',
    css: 'radial-gradient(at 15% 15%, #0d9488 0px, transparent 45%), radial-gradient(at 85% 40%, #0284c7 0px, transparent 45%), radial-gradient(at 40% 95%, #065f46 0px, transparent 50%), #030a0c',
  },
  graphite: {
    name: 'Graphite',
    css: 'radial-gradient(at 50% 0%, #334155 0px, transparent 55%), radial-gradient(at 100% 100%, #1e293b 0px, transparent 50%), #050608',
  },
  ember: {
    name: 'Ember',
    css: 'radial-gradient(at 80% 80%, #b91c1c 0px, transparent 45%), radial-gradient(at 20% 30%, #9d174d 0px, transparent 45%), radial-gradient(at 60% 10%, #ea580c 0px, transparent 40%), #090304',
  },
};

/** Accent colors as "r g b" triples for the --os-accent CSS variable. */
export const ACCENTS: Record<string, { name: string; rgb: string; hex: string }> = {
  indigo: { name: 'Indigo', rgb: '124 140 255', hex: '#7c8cff' },
  violet: { name: 'Violet', rgb: '167 139 250', hex: '#a78bfa' },
  pink: { name: 'Pink', rgb: '244 114 182', hex: '#f472b6' },
  red: { name: 'Red', rgb: '248 113 113', hex: '#f87171' },
  amber: { name: 'Amber', rgb: '251 191 36', hex: '#fbbf24' },
  emerald: { name: 'Emerald', rgb: '52 211 153', hex: '#34d399' },
  cyan: { name: 'Cyan', rgb: '34 211 238', hex: '#22d3ee' },
  white: { name: 'Mono', rgb: '235 235 245', hex: '#ebebf5' },
};
