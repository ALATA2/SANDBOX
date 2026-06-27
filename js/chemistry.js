// Chemistry Voxel Module - ARCHIPELAGO
import { getTranslation } from './lang.js';

// Simple deterministic 3D pseudo-random hash
function hash3D(x, y, z) {
  const sx = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453123;
  return sx - Math.floor(sx);
}

// 3D Value Noise for veins and local concentration fluctuations
function valueNoise3D(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  
  // Smoothstep interpolation curves
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  
  const c000 = hash3D(xi, yi, zi);
  const c100 = hash3D(xi + 1, yi, zi);
  const c010 = hash3D(xi, yi + 1, zi);
  const c110 = hash3D(xi + 1, yi + 1, zi);
  const c001 = hash3D(xi, yi, zi + 1);
  const c101 = hash3D(xi + 1, yi, zi + 1);
  const c011 = hash3D(xi, yi + 1, zi + 1);
  const c111 = hash3D(xi + 1, yi + 1, zi + 1);
  
  const c00 = c000 * (1 - u) + c100 * u;
  const c10 = c010 * (1 - u) + c110 * u;
  const c01 = c001 * (1 - u) + c101 * u;
  const c11 = c011 * (1 - u) + c111 * u;
  
  const c0 = c00 * (1 - v) + c10 * v;
  const c1 = c01 * (1 - v) + c11 * v;
  
  return c0 * (1 - w) + c1 * w;
}

// Base chemical profiles - abundance peak and spread (depth in virtual meters)
export function getBaseAbundance(element, d) {
  switch (element) {
    case 'Si': // Silicon
      return d < 40 ? 45 * (1 - d / 40) + 12 : 12;
    case 'C': // Carbon
      return d < 20 ? 15 * (1 - d / 20) + 2 : 2;
    case 'Cu': // Copper
      return Math.max(0.1, 8 * Math.exp(-Math.pow((d - 15) / 10, 2)));
    case 'Fe': // Iron
      return Math.max(1.5, 20 * Math.exp(-Math.pow((d - 50) / 45, 2)));
    case 'S': // Sulfur
      return Math.max(0.5, 12 * Math.exp(-Math.pow((d - 150) / 90, 2)));
    case 'Ti': // Titanium
      return Math.max(0, 16 * Math.exp(-Math.pow((d - 380) / 200, 2)));
    case 'U': // Uranium
      return Math.max(0, 7 * Math.exp(-Math.pow((d - 800) / 180, 2)));
    case 'Nh': // Nihonium (Exotic Geomagnetic element)
      return Math.max(0, 9 * Math.exp(-Math.pow((d - 980) / 100, 2)));
    case 'Ni': // Nickel
      return Math.max(0.8, 30 * Math.exp(-Math.pow((d - 1100) / 150, 2)));
    case 'Au': // Gold
      return Math.max(0.01, 2.5 * Math.exp(-Math.pow((d - 85) / 60, 2)));
    case 'Ag': // Silver
      return Math.max(0.02, 3.5 * Math.exp(-Math.pow((d - 65) / 50, 2)));
    default:
      return 0;
  }
}

// Full chemical name mappings
export const elementNames = {
  Si: { en: 'Silicon (Si)', it: 'Silicio (Si)' },
  C: { en: 'Carbon (C)', it: 'Carbonio (C)' },
  Cu: { en: 'Copper (Cu)', it: 'Rame (Cu)' },
  Fe: { en: 'Iron (Fe)', it: 'Ferro (Fe)' },
  S: { en: 'Sulfur (S)', it: 'Zolfo (S)' },
  Ti: { en: 'Titanium (Ti)', it: 'Titanio (Ti)' },
  U: { en: 'Uranium (U)', it: 'Uranio (U)' },
  Nh: { en: 'Nihonium (Nh)', it: 'Nihonio (Nh)' },
  Ni: { en: 'Nickel (Ni)', it: 'Nichel (Ni)' },
  Au: { en: 'Gold (Au)', it: 'Oro (Au)' },
  Ag: { en: 'Silver (Ag)', it: 'Argento (Ag)' }
};

// Global player chemical knowledge database
// By default, common ancient elements are known, advanced ones are unknown.
export const chemicalKnowledge = {
  Si: true,
  C: true,
  Cu: true,
  Fe: true,
  Au: true,
  Ag: true,
  S: true,
  Ni: true,
  Ti: false, // Discovered by scanning/progression
  U: false,  // Discovered by scanning/progression
  Nh: false  // Discovered by scanning/progression
};

// Generate procedural concentrations for a coordinate (adds up to 100%)
export function getBlockChemicalComposition(x, virtualY, z) {
  const elements = ['Si', 'C', 'Cu', 'Fe', 'S', 'Ti', 'U', 'Nh', 'Ni', 'Au', 'Ag'];
  const composition = {};
  let sum = 0;

  // Use absolute coordinates to prevent scrolling from resetting vein layout
  const noiseScale = 0.15;
  const nVal = valueNoise3D(x * noiseScale, virtualY * noiseScale, z * noiseScale);

  elements.forEach(el => {
    const base = getBaseAbundance(el, virtualY);
    // Multiply by local noise variance (veins)
    let conc = base * (0.4 + 1.2 * nVal);
    
    // Add small random noise to make it feel natural
    const noiseMicro = hash3D(x, z, elements.indexOf(el)) * 0.05 * base;
    conc = Math.max(0, conc + noiseMicro);

    composition[el] = conc;
    sum += conc;
  });

  // Normalize if they exceed 90% (leaving room for base matrix)
  if (sum > 90) {
    const scale = 90 / sum;
    elements.forEach(el => {
      composition[el] *= scale;
    });
    sum = 90;
  }

  // Base Rock Matrix (Silicates & Oxygen) makes up the rest
  composition['Matrix'] = 100 - sum;

  return composition;
}

// Analyze a block to get UI display data and unlock unknown elements in database
export function analyzeBlockComposition(x, virtualY, z, currentLang) {
  const comp = getBlockChemicalComposition(x, virtualY, z);
  const elements = ['Si', 'C', 'Cu', 'Fe', 'S', 'Ti', 'U', 'Nh', 'Ni', 'Au', 'Ag'];
  
  let unknownSum = 0;
  const report = [];

  elements.forEach(el => {
    const percentage = comp[el];
    if (percentage <= 0.05) return; // skip trace elements for clean output

    if (chemicalKnowledge[el]) {
      const name = elementNames[el][currentLang] || elementNames[el]['en'];
      report.push({ name, pct: percentage, known: true, id: el });
    } else {
      unknownSum += percentage;
    }
  });

  if (unknownSum > 0.05) {
    const unknownLabel = currentLang === 'it' ? 'Elemento Sconosciuto' : 'Unknown Element';
    report.push({ name: `${unknownLabel} (?)`, pct: unknownSum, known: false });
  }

  // Matrix
  const matrixLabel = currentLang === 'it' ? 'Matrice Rocciosa (O, Al)' : 'Rock Matrix (O, Al)';
  report.push({ name: matrixLabel, pct: comp['Matrix'], known: true });

  // Sort by highest concentration
  report.sort((a, b) => b.pct - a.pct);

  // Auto unlock logic if spectrometer/analyzer used (called separately on click)
  return report;
}

// Scan unlocks any unknown element in the block composition
export function scanAndUnlock(x, virtualY, z) {
  const comp = getBlockChemicalComposition(x, virtualY, z);
  const unlocked = [];

  for (const el in chemicalKnowledge) {
    if (!chemicalKnowledge[el] && comp[el] > 0.5) {
      chemicalKnowledge[el] = true;
      unlocked.push(el);
    }
  }
  return unlocked;
}
