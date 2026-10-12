import { PersistentSaveData, EquipmentItem, ItemRarity } from './src_types_progression';
import { EQUIPMENT_DATABASE, createItemInstance } from './src_data_items';

// =========================================================
// SISTEMA DE RECOMPENSAS, TABELAS DE LOOT E RNG DE CHEFES
// =========================================================

// Mapeamento de Pools Temáticas dos Chefes
export const BOSS_LOOT_POOLS: Record<string, string[]> = {
  'Crystal Golias': [
    'amulet_emerald_bead',
    'weapon_archer_gale',
    'ring_silver_band',
    'chest_chainmail_guard'
  ],
  'Corrupted Leviathan': [
    'chest_leviathan_carapace',
    'weapon_summoner_bone_wand',
    'ring_silver_band',
    'amulet_soul_drain'
  ],
  'Forge Dragon': [
    'weapon_vorgar_forge_hammer',
    'chest_phoenix_plate',
    'ring_eternal_mana_band',
    'weapon_vorgar_fury'
  ],
  'Artillery Warlord': [
    'weapon_archer_thunder_recurve',
    'chest_iron_sentinel',
    'ring_silver_band',
    'weapon_vorgar_iron_cleaver'
  ],
  'Thunder Pharaoh': [
    'weapon_archer_thunder_recurve',
    'ring_eternal_mana_band',
    'amulet_zephyr_feather',
    'weapon_mage_crystal_wand'
  ],
  'Yeti Overlord': [
    'weapon_mage_frost_staff',
    'ring_frost_shard',
    'chest_chainmail_guard',
    'amulet_zephyr_feather'
  ],
  'Prime Colossus': [
    'weapon_archer_colossus',
    'ring_colossus_eye',
    'chest_iron_sentinel',
    'weapon_vorgar_malakar_iron'
  ],
  'Night Reaper': [
    'weapon_summoner_abyssal_scythe',
    'amulet_soul_harvest_belt',
    'amulet_soul_drain',
    'weapon_summoner_pact'
  ],
  'Celestial Emperor': [
    'weapon_mage_aurelius',
    'chest_phoenix_plate',
    'ring_colossus_eye',
    'weapon_mage_frost_staff'
  ],
  'Void Sovereign': [
    'weapon_summoner_void',
    'weapon_vorgar_malakar_iron',
    'amulet_soul_drain',
    'chest_phoenix_plate'
  ]
};

// Pools Regionais por Andar/Bioma
export const REGIONAL_LOOT_POOLS: Record<number, string[]> = {
  1: ['weapon_archer_hunter_recurve', 'chest_chainmail_guard', 'amulet_emerald_bead', 'ring_silver_band', 'weapon_archer_gale'],
  2: ['chest_leviathan_carapace', 'ring_frost_shard', 'weapon_mage_singularity', 'weapon_summoner_bone_wand'],
  3: ['weapon_vorgar_forge_hammer', 'ring_eternal_mana_band', 'weapon_vorgar_fury', 'chest_iron_sentinel'],
  4: ['weapon_archer_thunder_recurve', 'chest_iron_sentinel', 'ring_silver_band', 'amulet_zephyr_feather'],
  5: ['weapon_archer_thunder_recurve', 'ring_eternal_mana_band', 'amulet_zephyr_feather', 'weapon_mage_crystal_wand'],
  6: ['weapon_mage_frost_staff', 'ring_frost_shard', 'chest_chainmail_guard', 'amulet_zephyr_feather'],
  7: ['weapon_archer_colossus', 'ring_colossus_eye', 'chest_iron_sentinel', 'weapon_vorgar_malakar_iron'],
  8: ['weapon_summoner_abyssal_scythe', 'amulet_soul_harvest_belt', 'amulet_soul_drain', 'weapon_summoner_pact'],
  9: ['weapon_mage_aurelius', 'chest_phoenix_plate', 'ring_colossus_eye', 'weapon_mage_frost_staff'],
  10: ['weapon_summoner_void', 'weapon_vorgar_malakar_iron', 'amulet_soul_drain', 'chest_phoenix_plate']
};

export interface BossRewardResult {
  isChest: boolean;
  offers: EquipmentItem[];
  crystalsReward?: number;
  updatedPity: {
    consecutiveChestsWithoutLegendary: number;
    consecutiveBossKillsWithoutChest: number;
  };
}

// Filtra a base de templates disponíveis (excluindo os de treino/iniciais)
function getEligibleTemplates(): string[] {
  return Object.keys(EQUIPMENT_DATABASE).filter(id => !id.includes('starter'));
}

// Sorteia um template de uma lista de IDs ou da base global
function pickTemplateFromList(pool: string[], fallbackRarity?: ItemRarity): string {
  const eligible = pool.filter(id => !!EQUIPMENT_DATABASE[id]);
  if (eligible.length > 0) {
    if (fallbackRarity) {
      const matchRarity = eligible.filter(id => EQUIPMENT_DATABASE[id]?.rarity === fallbackRarity);
      if (matchRarity.length > 0) {
        return matchRarity[Math.floor(Math.random() * matchRarity.length)];
      }
    }
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
  const global = getEligibleTemplates();
  return global[Math.floor(Math.random() * global.length)];
}

// Executa o sorteio das 3 opções de recompensa após a derrota do chefe
export function rollBossRewardDraft(
  floor: number,
  bossName: string,
  saveData: PersistentSaveData
): BossRewardResult {
  const currentConcluded = saveData.concludedRegions || [];
  const clears = saveData.regionClears?.[floor] || 0;
  const isFirstVictory = clears === 0 || !currentConcluded.includes(floor);

  let consecutiveBossKillsWithoutChest = saveData.consecutiveBossKillsWithoutChest || 0;
  let consecutiveChestsWithoutLegendary = saveData.consecutiveChestsWithoutLegendary || 0;

  let isChest = false;

  if (isFirstVictory) {
    // 1ª Vitória na Região: 100% de chance de Baú de Equipamentos garantido!
    isChest = true;
    consecutiveBossKillsWithoutChest = 0;
  } else {
    // Vitórias posteriores: 40% chance base + 30% de pity para cada tentativa anterior sem baú
    const chestChance = Math.min(1.0, 0.40 + consecutiveBossKillsWithoutChest * 0.30);
    if (Math.random() < chestChance) {
      isChest = true;
      consecutiveBossKillsWithoutChest = 0;
    } else {
      isChest = false;
      consecutiveBossKillsWithoutChest += 1;
    }
  }

  // Se não dropou baú de equipamento, entrega uma grande recompensa de Cristais de Mana!
  if (!isChest) {
    const crystalsReward = Math.floor(45 + Math.random() * 20 + floor * 5); // 50 a 80 cristais
    return {
      isChest: false,
      offers: [],
      crystalsReward,
      updatedPity: {
        consecutiveChestsWithoutLegendary,
        consecutiveBossKillsWithoutChest
      }
    };
  }

  // Sorteio das 3 cartas com o Modelo Híbrido:
  // Carta 1: Pool Temática do Chefe
  // Carta 2: Pool da Região / Bioma
  // Carta 3: Pool Global
  const bossPool = BOSS_LOOT_POOLS[bossName] || REGIONAL_LOOT_POOLS[floor] || getEligibleTemplates();
  const regionalPool = REGIONAL_LOOT_POOLS[floor] || getEligibleTemplates();
  const globalPool = getEligibleTemplates();

  // Pity de Raridade Lendária (a cada 10 baús sem lendário, garante 1)
  const forceLegendary = consecutiveChestsWithoutLegendary >= 10;

  const chosenTemplateIds: string[] = [];

  // Slot 1 (Chefe)
  let t1 = pickTemplateFromList(bossPool, forceLegendary ? 'LEGENDARY' : (isFirstVictory ? 'RARE' : undefined));
  chosenTemplateIds.push(t1);

  // Slot 2 (Região)
  let candidatePool2 = regionalPool.filter(id => !chosenTemplateIds.includes(id));
  if (candidatePool2.length === 0) candidatePool2 = globalPool.filter(id => !chosenTemplateIds.includes(id));
  let t2 = pickTemplateFromList(candidatePool2);
  chosenTemplateIds.push(t2);

  // Slot 3 (Global)
  let candidatePool3 = globalPool.filter(id => !chosenTemplateIds.includes(id));
  if (candidatePool3.length === 0) candidatePool3 = globalPool;
  let t3 = pickTemplateFromList(candidatePool3);
  chosenTemplateIds.push(t3);

  // Gera as instâncias dos 3 itens
  const offers: EquipmentItem[] = chosenTemplateIds.map(templateId => {
    const item = createItemInstance(templateId);
    
    // Em andares altos (andar 5+), concede uma chance de vir com aprimoramento (+1)
    if (floor >= 5 && Math.random() < 0.35 && item.rarity !== 'LEGENDARY') {
      item.level = 1;
    }
    return item;
  });

  // Atualiza o contador de pity de lendário
  const hasLegendaryInOffer = offers.some(item => item.rarity === 'LEGENDARY');
  if (hasLegendaryInOffer) {
    consecutiveChestsWithoutLegendary = 0;
  } else {
    consecutiveChestsWithoutLegendary += 1;
  }

  return {
    isChest: true,
    offers,
    updatedPity: {
      consecutiveChestsWithoutLegendary,
      consecutiveBossKillsWithoutChest
    }
  };
}
