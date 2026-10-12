import { HunterTalentProgress } from './src_types_talents';
import { Archetype, Stats } from './types';

export type ItemSlot = 'WEAPON' | 'CHEST' | 'RING' | 'AMULET';
export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface EquipmentItem {
  id: string;          // UUID gerado por instância do item
  templateId: string;  // ID de catálogo de item estático
  name: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  level: number;       // Nível de aprimoramento (+0, +1, +2...)
  stats: Partial<Stats>; // Atributos que este item concede
  uniqueEffectId?: string; // ID da passiva do item se houver
  uniqueEffectDesc?: string;
  hunterClass?: Archetype; // Se restrito a um caçador, undefined se universal
  lore?: string;
}

export interface ActiveLootDraft {
  floor: number;
  bossName: string;
  isChest: boolean;
  offers: EquipmentItem[];
  crystalsReward?: number;
  pickedIndex?: number;
}

export interface PersistentSaveData {
  version: number;
  permanentManaCrystals: number;
  unlockedHunterIds: string[];
  highestFloorReached: number;
  totalRunsCompleted?: number;
  talentProgress?: Record<string, HunterTalentProgress>;
  concludedRegions?: number[];
  unlockedRelicIds?: string[];
  regionClears?: Record<number, number>; // Maps floorNumber to number of clears
  consecutiveChestsWithoutLegendary?: number; // Pity de raridade lendária
  consecutiveBossKillsWithoutChest?: number;  // Pity de baú em repetições de região
  activeLootDraft?: ActiveLootDraft | null;   // Proteção contra reroll por refresh da página
  inventory: EquipmentItem[]; // Inventário compartilhado
  equippedItems: Record<string, Record<string, string | null>>; // Classe -> Slot -> Instance ID (string)
  settings: {
    musicVolume: number;
    sfxVolume: number;
    muted: boolean;
  };
}

