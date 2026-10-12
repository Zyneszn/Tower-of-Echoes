import { Archetype, Stats } from './types';
import { EquipmentItem, ItemRarity, ItemSlot } from './src_types_progression';

// ==========================================
// SISTEMA DE EQUIPAMENTOS ATIVOS (BUILDS)
// ==========================================

// Função simples e robusta para gerar IDs únicos sem depender de pacotes externos
export function generateUniqueId(): string {
  return 'item_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

export interface ItemTemplate {
  templateId: string;
  name: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  stats: Partial<Stats>;
  uniqueEffectId?: string;
  uniqueEffectDesc?: string;
  hunterClass?: Archetype;
  lore?: string;
}

// Catálogo Principal de Equipamentos do Jogo
export const EQUIPMENT_DATABASE: Record<string, ItemTemplate> = {
  // --- ARMAS DA LYRA (ARCHER) ---
  'weapon_archer_starter': {
    templateId: 'weapon_archer_starter',
    name: 'Arco do Caçador Iniciante',
    slot: 'WEAPON',
    rarity: 'COMMON',
    stats: { ad: 8 },
    hunterClass: Archetype.ARCHER,
    lore: 'Um arco simples e leve, ideal para quem está iniciando suas descidas na Torre.'
  },
  'weapon_archer_hunter_recurve': {
    templateId: 'weapon_archer_hunter_recurve',
    name: 'Arco Recurvo da Patrulha',
    slot: 'WEAPON',
    rarity: 'UNCOMMON',
    stats: { ad: 14, atkSpeed: 0.05 },
    hunterClass: Archetype.ARCHER,
    lore: 'Construído com madeira flexível das raízes externas da Torre.'
  },
  'weapon_archer_gale': {
    templateId: 'weapon_archer_gale',
    name: 'Arco do Vendaval Sombrio',
    slot: 'WEAPON',
    rarity: 'RARE',
    stats: { ad: 22, atkSpeed: 0.08, critChance: 0.05 },
    uniqueEffectId: 'archer_wind_strike',
    uniqueEffectDesc: 'Seus ataques básicos têm 12% de chance de causar uma rajada cortante extra que perfura inimigos.',
    hunterClass: Archetype.ARCHER,
    lore: 'Forjado com as penas das Harpias do Vazio da Região 1.'
  },
  'weapon_archer_thunder_recurve': {
    templateId: 'weapon_archer_thunder_recurve',
    name: 'Arco Tempestuoso do Faraó',
    slot: 'WEAPON',
    rarity: 'EPIC',
    stats: { ad: 34, atkSpeed: 0.12, critChance: 0.08 },
    uniqueEffectId: 'archer_storm_surge',
    uniqueEffectDesc: 'Disparos no modo Salva (Q) eletrizam o chão gerando pequenas descargas elétricas ao redor.',
    hunterClass: Archetype.ARCHER,
    lore: 'Imbuído com as faíscas residuais da tumba do Faraó do Trovão.'
  },
  'weapon_archer_colossus': {
    templateId: 'weapon_archer_colossus',
    name: 'Grande Arco do Colosso',
    slot: 'WEAPON',
    rarity: 'LEGENDARY',
    stats: { ad: 48, critChance: 0.12, critDamage: 0.25 },
    uniqueEffectId: 'archer_colossus_shot',
    uniqueEffectDesc: 'O tiro de precisão (Q) dispara 2 flechas perfurantes adicionais em leque.',
    hunterClass: Archetype.ARCHER,
    lore: 'Uma relíquia colossal recuperada dos escombros do Colosso Primordial. Carrega uma força esmagadora.'
  },

  // --- ARMAS DO KAEL (MAGE) ---
  'weapon_mage_starter': {
    templateId: 'weapon_mage_starter',
    name: 'Cajado de Salgueiro do Aprendiz',
    slot: 'WEAPON',
    rarity: 'COMMON',
    stats: { ap: 10 },
    hunterClass: Archetype.MAGE,
    lore: 'O entalhe rústico ajuda a estabilizar pequenas cargas de mana cósmica.'
  },
  'weapon_mage_crystal_wand': {
    templateId: 'weapon_mage_crystal_wand',
    name: 'Varinha de Cristal Arcano',
    slot: 'WEAPON',
    rarity: 'UNCOMMON',
    stats: { ap: 16, moveSpeed: 8 },
    hunterClass: Archetype.MAGE,
    lore: 'Um núcleo de cristal puro que amplifica feitiços básicos.'
  },
  'weapon_mage_singularity': {
    templateId: 'weapon_mage_singularity',
    name: 'Grimório do Horizonte de Eventos',
    slot: 'WEAPON',
    rarity: 'RARE',
    stats: { ap: 28, moveSpeed: 15, critChance: 0.06 },
    uniqueEffectId: 'mage_stellar_flicker',
    uniqueEffectDesc: 'Ao conjurar a Distorção Gravitacional (E), ganha 25% de velocidade de movimento por 3s.',
    hunterClass: Archetype.MAGE,
    lore: 'Páginas que sussurram segredos sobre as estrelas colapsadas.'
  },
  'weapon_mage_frost_staff': {
    templateId: 'weapon_mage_frost_staff',
    name: 'Báculo Glacial do Titã Ymir',
    slot: 'WEAPON',
    rarity: 'EPIC',
    stats: { ap: 42, skillRadiusMult: 0.12, mr: 15 },
    uniqueEffectId: 'mage_arcane_echo',
    uniqueEffectDesc: 'Aumenta em 25% o raio de área da Nova Cósmica (Q) e da Singularidade Gravitacional (E).',
    hunterClass: Archetype.MAGE,
    lore: 'Congela o ar ao redor do conjurador. Extraído dos picos de gelo eterno.'
  },
  'weapon_mage_aurelius': {
    templateId: 'weapon_mage_aurelius',
    name: 'Scepter Real de Aurelius',
    slot: 'WEAPON',
    rarity: 'LEGENDARY',
    stats: { ap: 55, skillRadiusMult: 0.15, critDamage: 0.15 },
    uniqueEffectId: 'mage_aurelius_nova',
    uniqueEffectDesc: 'Sua Chuva Cósmica (R) cai com 15% de raio aumentado e deixa poças estelares que causam dano por segundo.',
    hunterClass: Archetype.MAGE,
    lore: 'Pertenceu ao Imperador Celestial Aurelius. O brilho da realeza cósmica ainda irradia de seu cristal.'
  },

  // --- ARMAS DO VORGAR (VORGAR) ---
  'weapon_vorgar_starter': {
    templateId: 'weapon_vorgar_starter',
    name: 'Martelo de Batalha de Treino',
    slot: 'WEAPON',
    rarity: 'COMMON',
    stats: { ad: 12 },
    hunterClass: Archetype.VORGAR,
    lore: 'Pesado, rústico e implacável nas mãos certas.'
  },
  'weapon_vorgar_iron_cleaver': {
    templateId: 'weapon_vorgar_iron_cleaver',
    name: 'Cutelo de Ferro Pesado',
    slot: 'WEAPON',
    rarity: 'UNCOMMON',
    stats: { ad: 18, maxHp: 40 },
    hunterClass: Archetype.VORGAR,
    lore: 'Uma lâmina larga forjada para cortar ossos e couros resistentes.'
  },
  'weapon_vorgar_fury': {
    templateId: 'weapon_vorgar_fury',
    name: 'Esmagador de Crânios do Gladiador',
    slot: 'WEAPON',
    rarity: 'RARE',
    stats: { ad: 26, maxHp: 60, omnivamp: 0.04 },
    uniqueEffectId: 'vorgar_gladiator_blood',
    uniqueEffectDesc: 'Ganhe 1.5% de roubo de vida adicional para cada 10% de HP perdido.',
    hunterClass: Archetype.VORGAR,
    lore: 'Gostoso de brandir, perigoso de enfrentar.'
  },
  'weapon_vorgar_forge_hammer': {
    templateId: 'weapon_vorgar_forge_hammer',
    name: 'Martelo Vulcânico do Dragão da Forja',
    slot: 'WEAPON',
    rarity: 'EPIC',
    stats: { ad: 38, maxHp: 120, armor: 15 },
    uniqueEffectId: 'vorgar_magma_strike',
    uniqueEffectDesc: 'Seu impacto no solo (Q) queima o chão liberando fagulhas de magma por 3 segundos.',
    hunterClass: Archetype.VORGAR,
    lore: 'Retirado das escamas ardentes do Dragão da Forja no coração do vulcão.'
  },
  'weapon_vorgar_malakar_iron': {
    templateId: 'weapon_vorgar_malakar_iron',
    name: 'Clava Rúnica da Fortaleza Negra',
    slot: 'WEAPON',
    rarity: 'LEGENDARY',
    stats: { ad: 44, armor: 25, mr: 20 },
    uniqueEffectId: 'vorgar_iron_fortress',
    uniqueEffectDesc: 'Sua onda de choque (Q) gera um escudo de pedra igual a 15% da sua armadura para cada inimigo atingido.',
    hunterClass: Archetype.VORGAR,
    lore: 'Uma clava lendária forjada a partir dos portões de ferro da fortaleza de Malakar.'
  },

  // --- ARMAS DO MALAKAR (SUMMONER) ---
  'weapon_summoner_starter': {
    templateId: 'weapon_summoner_starter',
    name: 'Foice Ritual de Bronze',
    slot: 'WEAPON',
    rarity: 'COMMON',
    stats: { summonPower: 0.05 },
    hunterClass: Archetype.SUMMONER,
    lore: 'Utilizada para canalizar as primeiras almas dos caídos na Torre.'
  },
  'weapon_summoner_bone_wand': {
    templateId: 'weapon_summoner_bone_wand',
    name: 'Varinha de Osso Espiritual',
    slot: 'WEAPON',
    rarity: 'UNCOMMON',
    stats: { ap: 10, summonPower: 0.10 },
    hunterClass: Archetype.SUMMONER,
    lore: 'Talhada a partir de ossos antigos que mantêm sintonização com o outro mundo.'
  },
  'weapon_summoner_pact': {
    templateId: 'weapon_summoner_pact',
    name: 'Cetro do Pacto Profano',
    slot: 'WEAPON',
    rarity: 'RARE',
    stats: { ap: 15, summonPower: 0.15, maxHp: 50 },
    uniqueEffectId: 'summoner_soul_echo',
    uniqueEffectDesc: 'Sempre que seu Guardião de Ferro derrota um monstro, você recupera 3% de seu HP máximo.',
    hunterClass: Archetype.SUMMONER,
    lore: 'O pacto espiritual foi selado com sangue e runas de sombras.'
  },
  'weapon_summoner_abyssal_scythe': {
    templateId: 'weapon_summoner_abyssal_scythe',
    name: 'Gadanha do Ceifador da Noite',
    slot: 'WEAPON',
    rarity: 'EPIC',
    stats: { ap: 28, summonPower: 0.25, omnivamp: 0.04 },
    uniqueEffectId: 'summoner_necrotic_harvest',
    uniqueEffectDesc: 'Sempre que você elimina um inimigo, cura 5% da vida máxima de todos os espíritos invocados.',
    hunterClass: Archetype.SUMMONER,
    lore: 'Uma lâmina escura que sussurra lamentos dos que pereceram na escuridão.'
  },
  'weapon_summoner_void': {
    templateId: 'weapon_summoner_void',
    name: 'Foice Ceifadora de Almas',
    slot: 'WEAPON',
    rarity: 'LEGENDARY',
    stats: { summonPower: 0.35, ap: 35, omnivamp: 0.06 },
    uniqueEffectId: 'summoner_void_reaper',
    uniqueEffectDesc: 'Seu Guardião de Ferro emite ondas de fogo sombrio periódicas que causam dano mágico em área.',
    hunterClass: Archetype.SUMMONER,
    lore: 'Reza a lenda que esta foice contém uma fração da consciência do próprio Ceifador do Vazio.'
  },

  // --- ARMADURAS CORPORAIS (UNIVERSAIS) ---
  'chest_recruit_plate': {
    templateId: 'chest_recruit_plate',
    name: 'Peitoral de Couro de Recruta',
    slot: 'CHEST',
    rarity: 'COMMON',
    stats: { maxHp: 30, armor: 4 },
    lore: 'Oferece proteção básica contra mordidas de feras e espinhos.'
  },
  'chest_chainmail_guard': {
    templateId: 'chest_chainmail_guard',
    name: 'Cota de Malha Reforçada',
    slot: 'CHEST',
    rarity: 'UNCOMMON',
    stats: { maxHp: 60, armor: 8, mr: 6 },
    lore: 'Anéis de aço entrelaçados para suportar investidas de monstros intermediários.'
  },
  'chest_iron_sentinel': {
    templateId: 'chest_iron_sentinel',
    name: 'Couraça de Ferro da Sentinela',
    slot: 'CHEST',
    rarity: 'RARE',
    stats: { maxHp: 90, armor: 15, mr: 12 },
    uniqueEffectId: 'chest_sentinel_barrier',
    uniqueEffectDesc: 'Ao entrar em uma nova fase da Torre, recebe um escudo temporário igual a 10% do seu HP Máximo.',
    lore: 'Pesada e imponente, forjada pelos melhores ferreiros da Vila dos Ecos.'
  },
  'chest_leviathan_carapace': {
    templateId: 'chest_leviathan_carapace',
    name: 'Carapaça do Leviatã Corrompido',
    slot: 'CHEST',
    rarity: 'EPIC',
    stats: { maxHp: 140, armor: 18, mr: 18, tenacity: 0.15 },
    uniqueEffectId: 'chest_leviathan_plating',
    uniqueEffectDesc: 'Reduz o dano recebido de chefes e elites em 12% e concede resiliência contra atordoamentos.',
    lore: 'Escamas blindadas que resistiram por séculos no pântano sombrio da Torre.'
  },
  'chest_phoenix_plate': {
    templateId: 'chest_phoenix_plate',
    name: 'Manto das Chamas da Fênix',
    slot: 'CHEST',
    rarity: 'LEGENDARY',
    stats: { maxHp: 200, armor: 22, mr: 22, regen: 2.5 },
    uniqueEffectId: 'chest_phoenix_rebirth',
    uniqueEffectDesc: 'Uma vez por run, ao receber um golpe fatal, ressuscita instantaneamente com 35% de HP e cria uma explosão de fogo.',
    lore: 'Tecida com cinzas rúnicas de uma fênix anciã. Quente ao toque.'
  },

  // --- ANÉIS DO PACTO (UNIVERSAIS) ---
  'ring_copper_loop': {
    templateId: 'ring_copper_loop',
    name: 'Anel de Bronze Simples',
    slot: 'RING',
    rarity: 'COMMON',
    stats: { critChance: 0.03 },
    lore: 'Um anel opaco, sem gravação, mas que irradia uma leve pulsação de mana.'
  },
  'ring_silver_band': {
    templateId: 'ring_silver_band',
    name: 'Aliança de Prata Rúnica',
    slot: 'RING',
    rarity: 'UNCOMMON',
    stats: { critChance: 0.05, ad: 6, ap: 6 },
    lore: 'Encantado com pequenos nós arcanos que fortalecem seus ataques.'
  },
  'ring_frost_shard': {
    templateId: 'ring_frost_shard',
    name: 'Elo de Cristal Glacial',
    slot: 'RING',
    rarity: 'RARE',
    stats: { ap: 12, critChance: 0.06, moveSpeed: 10 },
    uniqueEffectId: 'ring_chill_touch',
    uniqueEffectDesc: 'Ataques críticos têm 25% de chance de aplicar congelamento que desacelera inimigos por 2 segundos.',
    lore: 'Recuperado das cavernas de Ymir. Gelado a ponto de grudar na pele.'
  },
  'ring_eternal_mana_band': {
    templateId: 'ring_eternal_mana_band',
    name: 'Anel da Mana Eterna',
    slot: 'RING',
    rarity: 'EPIC',
    stats: { ap: 16, ad: 10, critChance: 0.07 },
    uniqueEffectId: 'ring_eternal_mana',
    uniqueEffectDesc: 'Cada abate reduz em 0.5s o tempo de recarga de todas as suas habilidades ativas.',
    lore: 'Uma gema pulsante que consome as vibrações dos inimigos derrotados para alimentar suas magias.'
  },
  'ring_colossus_eye': {
    templateId: 'ring_colossus_eye',
    name: 'Anel do Olho do Colosso',
    slot: 'RING',
    rarity: 'LEGENDARY',
    stats: { ad: 18, ap: 18, critChance: 0.10, critDamage: 0.20 },
    uniqueEffectId: 'ring_critical_frenzy',
    uniqueEffectDesc: 'Sempre que causa um acerto crítico, aumenta sua velocidade de ataque em 15% por 4s (acumula até 3 vezes).',
    lore: 'O cristal central pisca no mesmo ritmo que o núcleo de energia do Colosso Primordial.'
  },

  // --- AMULETOS/RELÍQUIAS (UNIVERSAIS) ---
  'amulet_stone_pendant': {
    templateId: 'amulet_stone_pendant',
    name: 'Pingente de Seixo da Torre',
    slot: 'AMULET',
    rarity: 'COMMON',
    stats: { moveSpeed: 8 },
    lore: 'Um simples colar rústico que sintoniza as correntes de vento da Torre.'
  },
  'amulet_emerald_bead': {
    templateId: 'amulet_emerald_bead',
    name: 'Conta Esmeralda dos Bosques',
    slot: 'AMULET',
    rarity: 'UNCOMMON',
    stats: { moveSpeed: 14, maxHp: 50 },
    lore: 'Uma gema verde que transmite o frescor da floresta primordial.'
  },
  'amulet_zephyr_feather': {
    templateId: 'amulet_zephyr_feather',
    name: 'Pluma Rúnica do Zéfiro',
    slot: 'AMULET',
    rarity: 'RARE',
    stats: { moveSpeed: 25, atkSpeed: 0.06 },
    uniqueEffectId: 'amulet_dash_haste',
    uniqueEffectDesc: 'Após usar a habilidade de esquiva/dash, ganha 35% de velocidade de movimento por 2 segundos.',
    lore: 'Uma pena brilhante que parece levitar por conta própria se não for segurada firme.'
  },
  'amulet_soul_harvest_belt': {
    templateId: 'amulet_soul_harvest_belt',
    name: 'Talismã da Colheita de Almas',
    slot: 'AMULET',
    rarity: 'EPIC',
    stats: { ap: 20, maxHp: 75, regen: 1.0 },
    uniqueEffectId: 'belt_soul_harvest',
    uniqueEffectDesc: 'Cada monstro eliminado concede +0.5% de Poder Mágico permanente acumulativo durante a subida.',
    lore: 'Canaliza resquícios de ectoplasma convertendo-os em pura energia destrutiva.'
  },
  'amulet_soul_drain': {
    templateId: 'amulet_soul_drain',
    name: 'Amuleta de Sifão do Vazio',
    slot: 'AMULET',
    rarity: 'LEGENDARY',
    stats: { omnivamp: 0.08, regen: 1.5, maxHp: 120 },
    uniqueEffectId: 'amulet_vampiric_shadow',
    uniqueEffectDesc: 'Sempre que derrota qualquer criatura, você absorve sua essência, recuperando 15 pontos de Vida instantaneamente.',
    lore: 'Canaliza o poder devorador do Ceifador do Vazio, drenando a força vital dos inimigos caídos.'
  }
};

// Cria uma instância única e aprimorável a partir de um template estático do catálogo
export function createItemInstance(templateId: string, customId?: string): EquipmentItem {
  const template = EQUIPMENT_DATABASE[templateId];
  if (!template) {
    throw new Error(`Item template '${templateId}' não encontrado no catálogo de equipamentos.`);
  }

  return {
    id: customId || generateUniqueId(),
    templateId: template.templateId,
    name: template.name,
    slot: template.slot,
    rarity: template.rarity,
    level: 0,
    stats: { ...template.stats },
    uniqueEffectId: template.uniqueEffectId,
    uniqueEffectDesc: template.uniqueEffectDesc,
    hunterClass: template.hunterClass,
    lore: template.lore
  };
}

// Retorna uma lista de itens iniciais de presente para perfis novos ou que ainda não têm itens
export function getStarterKit(): EquipmentItem[] {
  return [
    createItemInstance('weapon_archer_starter'),
    createItemInstance('weapon_mage_starter'),
    createItemInstance('weapon_vorgar_starter'),
    createItemInstance('weapon_summoner_starter'),
    createItemInstance('chest_recruit_plate'),
    createItemInstance('ring_copper_loop'),
    createItemInstance('amulet_stone_pendant')
  ];
}

// Sorteia e cria um item de saque com base no andar atual e uma pitada de sorte
export function rollLootItem(floor: number): EquipmentItem {
  const roll = Math.random();
  let rarity: ItemRarity = 'COMMON';
  
  // Chance de raridade escala com o andar
  const legendaryChance = 0.02 + Math.min(0.12, floor * 0.015); // Até 14% lendário no andar 8+
  const rareChance = 0.15 + Math.min(0.35, floor * 0.04);       // Até 50% raro
  const uncommonChance = 0.40;

  if (roll < legendaryChance) {
    rarity = 'LEGENDARY';
  } else if (roll < legendaryChance + rareChance) {
    rarity = 'RARE';
  } else if (roll < legendaryChance + rareChance + uncommonChance) {
    rarity = 'UNCOMMON';
  }

  // Filtrar todos os templates que correspondem à raridade desejada
  const templates = Object.values(EQUIPMENT_DATABASE).filter(t => t.rarity === rarity && t.templateId.indexOf('starter') === -1);
  const selectedTemplate = templates.length > 0 
    ? templates[Math.floor(Math.random() * templates.length)]
    : EQUIPMENT_DATABASE['chest_recruit_plate']; // fallback seguro

  // Criar o item instanciado
  const item = createItemInstance(selectedTemplate.templateId);

  // Se o item é de nível alto (andar elevado), podemos dar um pequeno aprimoramento (+1, +2...) gratuito nele!
  if (floor >= 5) {
    const upgradeRoll = Math.random();
    if (upgradeRoll < 0.20 && rarity !== 'LEGENDARY') {
      item.level = 2;
      // Escalar atributos proporcionalmente
      Object.entries(item.stats).forEach(([k, val]) => {
        if (typeof val === 'number') {
          item.stats[k as keyof Stats] = parseFloat((val * 1.35).toFixed(2));
        }
      });
    } else if (upgradeRoll < 0.55) {
      item.level = 1;
      Object.entries(item.stats).forEach(([k, val]) => {
        if (typeof val === 'number') {
          item.stats[k as keyof Stats] = parseFloat((val * 1.15).toFixed(2));
        }
      });
    }
  }

  return item;
}

// Função para aprimorar um item de nível na Forja, consumindo recursos e escalando seus atributos bases
export function upgradeItemInForge(item: EquipmentItem): void {
  item.level += 1;
  // Multiplicador de escala simples de 15% por nível de aprimoramento
  const scale = 1.15;
  Object.entries(item.stats).forEach(([k, val]) => {
    if (typeof val === 'number') {
      // Atributos de porcentagem (como crítico e roubo de vida) ganham um bônus menor para equilíbrio
      const isPercent = k === 'critChance' || k === 'critDamage' || k === 'omnivamp' || k === 'skillRadiusMult' || k === 'summonPower';
      const actualScale = isPercent ? 1.05 : scale;
      item.stats[k as keyof Stats] = parseFloat((val * actualScale).toFixed(2));
    }
  });
}


// ==========================================
// SISTEMA DE RELÍQUIAS DO COFRE (COLECTIBLES)
// ==========================================

export interface GameItem {
  id: string;
  name: string;
  rarity: string; // 'COMUM' | 'INCOMUM' | 'RARO' | 'EPICO' | 'LENDARIO'
  description: string;
  statsDesc: string;
  icon: string;
  bossExclusive: boolean;
  regionNumber: number;
  biome: string;
  bossName?: string;
}

export const ITEMS_DATABASE: GameItem[] = [
  {
    id: 'relic_01',
    name: 'Olho da Harpia Sombria',
    rarity: 'RARO',
    description: 'Um pingente contendo o olho cristalizado da Rainha Harpia. Concede agilidade fantasma.',
    statsDesc: '+5% Velocidade de Movimento, +3% Velocidade de Ataque',
    icon: '👁️',
    bossExclusive: true,
    regionNumber: 1,
    biome: 'Floresta Sombria',
    bossName: 'Rainha Harpia'
  },
  {
    id: 'relic_02',
    name: 'Estilhaço de Ymir',
    rarity: 'EPICO',
    description: 'Um fragmento de gelo eterno retirado do corpo do titã de gelo.',
    statsDesc: '+10 AP, +15% Resiliência a Lentidão',
    icon: '❄️',
    bossExclusive: true,
    regionNumber: 2,
    biome: 'Caverna Glacial',
    bossName: 'Ymir, o Titã de Gelo'
  },
  {
    id: 'relic_03',
    name: 'Presa de Cérbero',
    rarity: 'EPICO',
    description: 'A presa flamejante do cão de três cabeças, queimando com fogo espiritual.',
    statsDesc: '+12 AD, +4% Chance de Crítico',
    icon: '🔥',
    bossExclusive: true,
    regionNumber: 3,
    biome: 'Ruínas de Cinzas',
    bossName: 'Cérbero de Fogo'
  },
  {
    id: 'relic_04',
    name: 'Selo do Colosso',
    rarity: 'LENDARIO',
    description: 'A placa rúnica central que ativava os movimentos do golem titânico.',
    statsDesc: '+100 HP Máximo, +12 Armadura',
    icon: '🛡️',
    bossExclusive: true,
    regionNumber: 4,
    biome: 'Fortaleza Ancestral',
    bossName: 'Colosso Primordial'
  },
  {
    id: 'relic_05',
    name: 'Essência de Mana Pura',
    rarity: 'COMUM',
    description: 'Um cristal comum de energia concentrada coletado nas fendas da Torre.',
    statsDesc: '+5 AP',
    icon: '💎',
    bossExclusive: false,
    regionNumber: 1,
    biome: 'Floresta Sombria'
  },
  {
    id: 'relic_06',
    name: 'Anel de Couro Trançado',
    rarity: 'COMUM',
    description: 'Um anel simples usado por antigos patrulheiros da Torre.',
    statsDesc: '+35 HP Máximo',
    icon: '💍',
    bossExclusive: false,
    regionNumber: 1,
    biome: 'Floresta Sombria'
  },
  {
    id: 'relic_07',
    name: 'Amuleto de Sangue de Dragão',
    rarity: 'LENDARIO',
    description: 'Um rubi lapidado que absorve a energia vital de criaturas caídas.',
    statsDesc: '+2.5% Vampirismo (Omnivamp)',
    icon: '🩸',
    bossExclusive: false,
    regionNumber: 3,
    biome: 'Ruínas de Cinzas'
  }
];

export function rollLootForItem(floor: number, bossName: string, isFirstVictory: boolean): GameItem {
  // Retorna uma relíquia correspondente ao andar ou uma relíquia comum
  const matching = ITEMS_DATABASE.filter(item => item.regionNumber === floor && item.bossName === bossName);
  if (matching.length > 0) {
    return matching[0];
  }
  // Fallback
  return ITEMS_DATABASE[Math.floor(Math.random() * ITEMS_DATABASE.length)];
}
