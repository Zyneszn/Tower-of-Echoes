import { PersistentSaveData } from './src_types_progression';
import { createDefaultHunterProgress } from './src_data_talents';
import { Archetype } from './types';
import { getStarterKit } from './src_data_items';

const SAVE_KEY = 'tower_of_echoes_progression_save_v2';

// Pré-configuração do kit inicial para novas contas
const starterItems = getStarterKit();

export const DEFAULT_SAVE_DATA: PersistentSaveData = {
  version: 2,
  permanentManaCrystals: 50,
  unlockedHunterIds: ['ARCHER', 'MAGE'],
  highestFloorReached: 1,
  concludedRegions: [],
  unlockedRelicIds: [],
  regionClears: {},
  talentProgress: {
    [Archetype.ARCHER]: createDefaultHunterProgress(Archetype.ARCHER),
    [Archetype.MAGE]: createDefaultHunterProgress(Archetype.MAGE)
  },
  inventory: starterItems,
  equippedItems: {
    [Archetype.ARCHER]: {
      WEAPON: starterItems.find(i => i.templateId === 'weapon_archer_starter')?.id || null,
      CHEST: starterItems.find(i => i.templateId === 'chest_recruit_plate')?.id || null,
      RING: starterItems.find(i => i.templateId === 'ring_copper_loop')?.id || null,
      AMULET: starterItems.find(i => i.templateId === 'amulet_stone_pendant')?.id || null
    },
    [Archetype.MAGE]: {
      WEAPON: starterItems.find(i => i.templateId === 'weapon_mage_starter')?.id || null,
      CHEST: starterItems.find(i => i.templateId === 'chest_recruit_plate')?.id || null,
      RING: starterItems.find(i => i.templateId === 'ring_copper_loop')?.id || null,
      AMULET: starterItems.find(i => i.templateId === 'amulet_stone_pendant')?.id || null
    },
    [Archetype.VORGAR]: {
      WEAPON: starterItems.find(i => i.templateId === 'weapon_vorgar_starter')?.id || null,
      CHEST: starterItems.find(i => i.templateId === 'chest_recruit_plate')?.id || null,
      RING: starterItems.find(i => i.templateId === 'ring_copper_loop')?.id || null,
      AMULET: starterItems.find(i => i.templateId === 'amulet_stone_pendant')?.id || null
    },
    [Archetype.SUMMONER]: {
      WEAPON: starterItems.find(i => i.templateId === 'weapon_summoner_starter')?.id || null,
      CHEST: starterItems.find(i => i.templateId === 'chest_recruit_plate')?.id || null,
      RING: starterItems.find(i => i.templateId === 'ring_copper_loop')?.id || null,
      AMULET: starterItems.find(i => i.templateId === 'amulet_stone_pendant')?.id || null
    }
  },
  settings: {
    musicVolume: 0.7,
    sfxVolume: 0.8,
    muted: false
  }
};

export class SaveManager {
  public static load(): PersistentSaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...DEFAULT_SAVE_DATA };
      const parsed = JSON.parse(raw);
      
      const loadedTalentProgress = parsed.talentProgress || {};
      if (!loadedTalentProgress[Archetype.ARCHER]) {
        loadedTalentProgress[Archetype.ARCHER] = createDefaultHunterProgress(Archetype.ARCHER);
      }
      if (!loadedTalentProgress[Archetype.MAGE]) {
        loadedTalentProgress[Archetype.MAGE] = createDefaultHunterProgress(Archetype.MAGE);
      }

      let loadedConcluded = parsed.concludedRegions;
      if (!Array.isArray(loadedConcluded)) {
        loadedConcluded = [];
        const maxFloor = parsed.highestFloorReached || 1;
        for (let f = 1; f < maxFloor; f++) {
          loadedConcluded.push(f);
        }
      }

      const loadedRelicIds = Array.isArray(parsed.unlockedRelicIds) ? parsed.unlockedRelicIds : [];
      const loadedRegionClears = parsed.regionClears || {};
      // If region is concluded but clears doesn't list it, initialize to 1
      loadedConcluded.forEach((r: number) => {
        if (loadedRegionClears[r] === undefined) {
          loadedRegionClears[r] = 1;
        }
      });

      const loadedInventory = Array.isArray(parsed.inventory) && parsed.inventory.length > 0
        ? parsed.inventory
        : [...starterItems];

      const loadedEquipped = parsed.equippedItems || {};
      const archetypes = [Archetype.ARCHER, Archetype.MAGE, Archetype.VORGAR, Archetype.SUMMONER];
      archetypes.forEach(arch => {
        if (!loadedEquipped[arch]) {
          loadedEquipped[arch] = { WEAPON: null, CHEST: null, RING: null, AMULET: null };
        }
        // Auto-equipar arma inicial caso esteja sem arma no slot correspondente
        const classWeapon = loadedInventory.find(i => i.slot === 'WEAPON' && i.hunterClass === arch);
        if (classWeapon && !loadedEquipped[arch].WEAPON) {
          loadedEquipped[arch].WEAPON = classWeapon.id;
        }
        const commonChest = loadedInventory.find(i => i.templateId === 'chest_recruit_plate');
        if (commonChest && !loadedEquipped[arch].CHEST) {
          loadedEquipped[arch].CHEST = commonChest.id;
        }
        const commonRing = loadedInventory.find(i => i.templateId === 'ring_copper_loop');
        if (commonRing && !loadedEquipped[arch].RING) {
          loadedEquipped[arch].RING = commonRing.id;
        }
        const commonAmulet = loadedInventory.find(i => i.templateId === 'amulet_stone_pendant');
        if (commonAmulet && !loadedEquipped[arch].AMULET) {
          loadedEquipped[arch].AMULET = commonAmulet.id;
        }
      });

      return {
        ...DEFAULT_SAVE_DATA,
        ...parsed,
        permanentManaCrystals: parsed.permanentManaCrystals !== undefined ? parsed.permanentManaCrystals : 50,
        unlockedHunterIds: Array.isArray(parsed?.unlockedHunterIds) && parsed.unlockedHunterIds.length > 0
          ? parsed.unlockedHunterIds
          : DEFAULT_SAVE_DATA.unlockedHunterIds,
        talentProgress: loadedTalentProgress,
        concludedRegions: loadedConcluded,
        unlockedRelicIds: loadedRelicIds,
        regionClears: loadedRegionClears,
        inventory: loadedInventory,
        equippedItems: loadedEquipped
      };
    } catch {
      return { ...DEFAULT_SAVE_DATA };
    }
  }

  public static loadSave(): PersistentSaveData {
    return SaveManager.load();
  }

  public static save(data: PersistentSaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save progression data', e);
    }
  }

  public static saveGame(data: PersistentSaveData): void {
    SaveManager.save(data);
  }
}
