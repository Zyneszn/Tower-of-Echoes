import { Archetype } from './types';

export type TalentNodeType = 'MINOR' | 'MAJOR' | 'KEYSTONE' | 'HYBRID';
export type TalentNodeState = 'LOCKED' | 'AVAILABLE' | 'UNLOCKED';

export interface TalentEffectDefinition {
  type: string;
  value?: number;
  statKey?: string;
  description?: string;
}

export interface TalentNode {
  id: string;
  hunterId: Archetype | string;
  familyId: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  nodeType: TalentNodeType;
  tier: number;
  x: number; // 2D canvas coordinate X
  y: number; // 2D canvas coordinate Y
  prerequisites: string[]; // IDs of nodes required before this can be unlocked
  connections: string[]; // Connected neighboring node IDs
  effects?: TalentEffectDefinition[]; // Future expansion: skill/stat modifiers
}

export interface TalentFamily {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  accentColor: string;
  bgGlow: string;
}

export interface TalentConnection {
  from: string;
  to: string;
  style?: 'SOLID' | 'DASHED' | 'ENERGY';
}

export interface HunterTalentTree {
  hunterId: Archetype;
  hunterName: string;
  title: string;
  accentColor: string;
  description: string;
  families: TalentFamily[]; // Standard 3 families per hunter
  nodes: TalentNode[];
  connections: TalentConnection[];
}

export interface HunterTalentProgress {
  hunterId: string;
  unlockedNodeIds: string[];
  spentPoints: number;
  availablePoints: number;
}

export type PlayerTalentProgressMap = Record<string, HunterTalentProgress>;
