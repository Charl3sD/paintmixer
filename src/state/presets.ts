import type { Paint } from './store';

type PresetPaint = Omit<Paint, 'id' | 'enabled'>;

export interface Preset {
  name: string;
  description: string;
  paints: PresetPaint[];
}

// Colours approximate each paint's masstone on screen. Strong pigments (phthalos, blacks) tint far
// more per drop than earth colours, which is what the strength value models.
export const PRESETS: Preset[] = [
  {
    // Sampled from default-colours.png, white-balanced so its Titanium White swatch reads as #f7f7f2.
    name: '12-colour set',
    description: 'The 12 paints from the default colour chart',
    paints: [
      { name: 'Sky blue', hex: '#77bcde', strength: 1 },
      { name: 'Cobalt blue', hex: '#38385f', strength: 1 },
      { name: 'Flesh color', hex: '#ddab7d', strength: 1 },
      { name: 'Naples yellow', hex: '#f8df60', strength: 1 },
      { name: 'Middle yellow', hex: '#df9d4b', strength: 1 },
      { name: 'Pink', hex: '#d14685', strength: 1 },
      { name: 'Orange red', hex: '#db3733', strength: 1 },
      { name: 'Emerald green', hex: '#597b60', strength: 1 },
      { name: 'Black', hex: '#443d3e', strength: 3 },
      { name: 'Rose red', hex: '#a73945', strength: 1 },
      { name: 'Titanium white', hex: '#f7f7f2', strength: 1 },
      { name: 'Phthalo blue', hex: '#4a4a55', strength: 3 },
    ],
  },
  {
    name: 'Printer primaries',
    description: 'Cyan, magenta and yellow with white and black',
    paints: [
      { name: 'Titanium white', hex: '#fafaf7', strength: 1 },
      { name: 'Mars black', hex: '#1c1c1c', strength: 3 },
      { name: 'Primary yellow', hex: '#f7d117', strength: 1 },
      { name: 'Primary magenta', hex: '#b0206c', strength: 1.5 },
      { name: 'Primary cyan', hex: '#0077b6', strength: 1.5 },
    ],
  },
  {
    name: 'School primaries',
    description: 'Red, yellow and blue with white and black',
    paints: [
      { name: 'White', hex: '#fafaf7', strength: 1 },
      { name: 'Black', hex: '#1c1c1c', strength: 3 },
      { name: 'Red', hex: '#d32f2f', strength: 1 },
      { name: 'Yellow', hex: '#fbc02d', strength: 1 },
      { name: 'Blue', hex: '#1e4fa3', strength: 1.5 },
    ],
  },
  {
    name: 'Artist split primaries',
    description: 'A warm and a cool of each primary, plus earths',
    paints: [
      { name: 'Titanium white', hex: '#f7f7f2', strength: 1 },
      { name: 'Ivory black', hex: '#231f20', strength: 3 },
      { name: 'Lemon yellow', hex: '#f4e23a', strength: 1 },
      { name: 'Cadmium yellow', hex: '#f9b200', strength: 1 },
      { name: 'Cadmium red light', hex: '#e23d28', strength: 1 },
      { name: 'Alizarin crimson', hex: '#9e1b32', strength: 1.5 },
      { name: 'Ultramarine blue', hex: '#243c8f', strength: 1.5 },
      { name: 'Phthalo blue', hex: '#0e3a6e', strength: 3 },
      { name: 'Yellow ochre', hex: '#c9922e', strength: 1 },
      { name: 'Burnt sienna', hex: '#8a3c1e', strength: 1 },
      { name: 'Burnt umber', hex: '#5b3a29', strength: 1.5 },
    ],
  },
];
