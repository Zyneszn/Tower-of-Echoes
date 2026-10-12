import { Archetype, Stats } from './types';

// ==========================================
// KEYWORDS SYSTEM
// ==========================================
export type Keyword = 
  | 'CRITICAL'
  | 'BLEED'
  | 'POISON'
  | 'BURN'
  | 'SHIELD'
  | 'DASH'
  | 'PROJECTILE'
  | 'AREA'
  | 'EXECUTE'
  | 'SPEED'
  | 'ABILITY'
  | 'CONTROL'
  | 'DEATH'
  | 'ON_HIT'
  | 'ELITE'
  | 'DEFENSE'
  | 'HP'
  | 'ECONOMY'
  | 'MELEE'
  | 'TANK'
  | 'SUMMONER'
  | 'MINIONS'
  | 'TACTICAL'
  | 'BURST';

// ==========================================
// HUNTER DEFINITIONS
// ==========================================
export interface HunterDefinition {
  id: Archetype;
  name: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  baseStats: Stats;
  skill1: {
    name: string;
    description: string;
    cooldown: number;
    icon: string;
  };
  skill2: {
    name: string;
    description: string;
    cooldown: number;
    icon: string;
  };
  skill3: {
    name: string;
    description: string;
    cooldown: number;
    icon: string;
  };
  dash: {
    name: string;
    description: string;
    cooldown: number;
    maxCharges: number;
    icon: string;
  };
  passive?: {
    name: string;
    description: string;
    icon: string;
    cooldown?: number;
  };
  tags: Keyword[];
}
