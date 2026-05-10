export const SPORTS = {
  badminton:   { name: 'Badminton',   icon: '🏸', players: 4 },
  pickleball:  { name: 'Pickleball',  icon: '🏓', players: 4 },
  tennis:      { name: 'Tennis',      icon: '🎾', players: 4 },
  table_tennis:{ name: 'Table Tennis',icon: '🏓', players: 4 },
  volleyball:  { name: 'Volleyball',  icon: '🏐', players: 12 },
} as const;

export type SportKey = keyof typeof SPORTS;

export const SPORT_LIST: SportKey[] = Object.keys(SPORTS) as SportKey[];

export const getPreferredSport = (): SportKey => {
  try {
    const stored = localStorage.getItem('preferred-sport');
    if (stored && stored in SPORTS) return stored as SportKey;
  } catch {}
  return 'badminton';
};

export const setPreferredSport = (sport: SportKey) => {
  try { localStorage.setItem('preferred-sport', sport); } catch {}
};
