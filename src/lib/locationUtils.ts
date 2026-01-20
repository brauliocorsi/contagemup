// Location type classification utilities

export type LocationType = 'floor' | 'rack_1' | 'rack_2' | 'rack_3' | 'rack_4' | 'rack_5' | 'unknown';

export interface LocationInfo {
  type: LocationType;
  label: string;
  shortLabel: string;
  color: string;
  icon: 'floor' | 'rack';
  level?: number;
}

const LOCATION_PATTERNS: { pattern: RegExp; type: LocationType }[] = [
  // Floor patterns (chão, piso, ground, solo)
  { pattern: /ch[aã]o|piso|ground|solo|floor/i, type: 'floor' },
  // Rack level patterns
  { pattern: /rack.*?5|n[ií]vel.*?5|level.*?5|r5|n5|l5/i, type: 'rack_5' },
  { pattern: /rack.*?4|n[ií]vel.*?4|level.*?4|r4|n4|l4/i, type: 'rack_4' },
  { pattern: /rack.*?3|n[ií]vel.*?3|level.*?3|r3|n3|l3/i, type: 'rack_3' },
  { pattern: /rack.*?2|n[ií]vel.*?2|level.*?2|r2|n2|l2/i, type: 'rack_2' },
  { pattern: /rack.*?1|n[ií]vel.*?1|level.*?1|r1|n1|l1|rack/i, type: 'rack_1' },
];

const LOCATION_INFO: Record<LocationType, Omit<LocationInfo, 'type'>> = {
  floor: {
    label: 'Chão',
    shortLabel: 'CH',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: 'floor',
  },
  rack_1: {
    label: 'Rack Nível 1',
    shortLabel: 'R1',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: 'rack',
    level: 1,
  },
  rack_2: {
    label: 'Rack Nível 2',
    shortLabel: 'R2',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: 'rack',
    level: 2,
  },
  rack_3: {
    label: 'Rack Nível 3',
    shortLabel: 'R3',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: 'rack',
    level: 3,
  },
  rack_4: {
    label: 'Rack Nível 4',
    shortLabel: 'R4',
    color: 'bg-pink-100 text-pink-800 border-pink-300',
    icon: 'rack',
    level: 4,
  },
  rack_5: {
    label: 'Rack Nível 5',
    shortLabel: 'R5',
    color: 'bg-rose-100 text-rose-800 border-rose-300',
    icon: 'rack',
    level: 5,
  },
  unknown: {
    label: 'Outro',
    shortLabel: '?',
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    icon: 'floor',
  },
};

export function classifyLocation(location: string | null | undefined): LocationInfo {
  if (!location || location.trim() === '') {
    return { type: 'unknown', ...LOCATION_INFO.unknown };
  }

  for (const { pattern, type } of LOCATION_PATTERNS) {
    if (pattern.test(location)) {
      return { type, ...LOCATION_INFO[type] };
    }
  }

  return { type: 'unknown', ...LOCATION_INFO.unknown };
}

export function getLocationTypeLabel(type: LocationType): string {
  return LOCATION_INFO[type].label;
}

export function getLocationTypeColor(type: LocationType): string {
  return LOCATION_INFO[type].color;
}

export function parseLocationLevel(location: string | null | undefined): number | null {
  if (!location) return null;
  
  const info = classifyLocation(location);
  return info.level ?? null;
}

// Extract the rack/aisle identifier from a location string
export function extractLocationIdentifier(location: string | null | undefined): string | null {
  if (!location) return null;
  
  // Try to extract patterns like "A1", "B2", "Corredor 3", etc.
  const match = location.match(/([A-Z]\d+|corredor\s*\d+|aisle\s*\d+)/i);
  return match ? match[1].toUpperCase() : location.split(/[-_\s]/)[0] || null;
}
