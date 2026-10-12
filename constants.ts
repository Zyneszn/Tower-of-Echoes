import { Archetype, Stats, FloorConfig, FloorAnomaly, Biome, Weather } from './types';

export let CANVAS_WIDTH = window.innerWidth;
export let CANVAS_HEIGHT = window.innerHeight;

export const setCanvasSize = (w: number, h: number) => {
    CANVAS_WIDTH = w;
    CANVAS_HEIGHT = h;
};

export const ZOOM_LEVEL = 0.45;

export const COLORS = {
  background: '#2f9e8e',
  grass: '#34b293',
  grassHighlight: '#3dcba9',
  stone: '#5d6d7a',
  stoneHighlight: '#788896',
  water: '#1e293b',
  waterHighlight: '#278f80',
  slime: 'rgba(46, 213, 115, 0.8)', // Vivid emerald green
  [Archetype.ARCHER]: '#34b293', // Emerald green
  [Archetype.MAGE]: '#f3a65a', // Warm amber / gold
  [Archetype.VORGAR]: '#10b981', // Iron green / Emerald spectral glow
  [Archetype.SUMMONER]: '#a855f7', // Ethereal purple / Arcane spirit glow
  // Vivid Mobile Roguelite Biome Palettes
  [Biome.FOREST]: { bg: '#2f9e8e', floor: '#34b293', floorTop: '#3dcba9', alt: '#f3a65a', altTop: '#fbbf24' },
  [Biome.DESERT]: { bg: '#d97706', floor: '#f3a65a', floorTop: '#fbbf24', alt: '#34b293', altTop: '#3dcba9' },
  [Biome.SNOW]: { bg: '#0284c7', floor: '#38bdf8', floorTop: '#7dd3fc', alt: '#f3a65a', altTop: '#fbbf24' },
  [Biome.GRAVEYARD]: { bg: '#6d28d9', floor: '#8b5cf6', floorTop: '#a78bfa', alt: '#34b293', altTop: '#3dcba9' },
  [Biome.VOLCANO]: { bg: '#b91c1c', floor: '#e65c5c', floorTop: '#f87171', alt: '#f3a65a', altTop: '#fbbf24' },
  [Biome.CITY]: { bg: '#334155', floor: '#5d6d7a', floorTop: '#94a3b8', alt: '#34b293', altTop: '#3dcba9' }
};

export const BASE_STATS: Record<Archetype, Stats> = {
  [Archetype.ARCHER]: {
    maxHp: 320, hp: 320, ad: 24, ap: 0, armor: 15, mr: 12,
    moveSpeed: 3.5, atkSpeed: 1.0, omnivamp: 0.02, tenacity: 0.1,
    regen: 3, critChance: 0.12, critDamage: 1.5
  },
  [Archetype.MAGE]: {
    maxHp: 270, hp: 270, ad: 10, ap: 30, armor: 12, mr: 18,
    moveSpeed: 3.3, atkSpeed: 0.85, omnivamp: 0.02, tenacity: 0.1,
    regen: 3, critChance: 0.08, critDamage: 1.5
  },
  [Archetype.VORGAR]: {
    maxHp: 440, hp: 440, ad: 38, ap: 0, armor: 22, mr: 18,
    moveSpeed: 2.8, atkSpeed: 0.82, omnivamp: 0.04, tenacity: 0.2,
    regen: 5, critChance: 0.08, critDamage: 1.5
  },
  [Archetype.SUMMONER]: {
    maxHp: 260, hp: 260, ad: 8, ap: 20, armor: 10, mr: 12,
    moveSpeed: 3.4, atkSpeed: 0.85, omnivamp: 0.02, tenacity: 0.1,
    regen: 3, critChance: 0.08, critDamage: 1.5
  }
};

export const SKILL_CONFIG = {
  [Archetype.ARCHER]: { skill1Cd: 4, skill2Cd: 3.5, skill3Cd: 14.0, dashCd: 2.0, dashChargesMax: 3 },
  [Archetype.MAGE]: { skill1Cd: 5, skill2Cd: 4.5, skill3Cd: 16.0, dashCd: 2.5, dashChargesMax: 3 },
  [Archetype.VORGAR]: { skill1Cd: 4.5, skill2Cd: 7.0, skill3Cd: 15.0, dashCd: 3.5, dashChargesMax: 2 },
  [Archetype.SUMMONER]: { skill1Cd: 5.5, skill2Cd: 9.5, skill3Cd: 18.0, dashCd: 3.0, dashChargesMax: 2 }
};

export const FLOOR_CONFIGS: FloorConfig[] = [
  {
    floorNumber: 1,
    regionName: 'Floresta Esmeralda',
    duration: 30,
    phase1Duration: 30,
    phase2Duration: 20,
    spawnRate: 1400,
    enemyTypes: ['QUARTZ_GOLEM'],
    boss: 'BOSS_CRYSTAL_GOLIAS',
    biome: Biome.FOREST,
    possibleWeathers: [Weather.CLEAR, Weather.RAIN],
    phases: {
      1: { phaseNumber: 1, name: 'Entrada da Floresta', description: 'Enfrente hordas de golens de quartzo selvagens', duration: 30, spawnRate: 1400, enemyTypes: ['QUARTZ_GOLEM'] },
      2: { phaseNumber: 2, name: 'Clareira de Cristal', description: 'Derrote os guardiões de cristal de elite que bloqueiam o caminho', duration: 20, spawnRate: 1540, enemyTypes: ['QUARTZ_GOLEM'] },
      3: { phaseNumber: 3, name: 'Coração de Esmeralda', description: 'Enfrente o colosso Crystal Golias', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 2,
    regionName: 'Pântano dos Sussurros',
    duration: 25,
    phase1Duration: 25,
    phase2Duration: 20,
    spawnRate: 1000,
    enemyTypes: ['MARSH_JUMPER', 'SPORE_SPITTER'],
    boss: 'BOSS_CORRUPTED_LEVIATHAN',
    biome: Biome.GRAVEYARD,
    possibleWeathers: [Weather.RAIN, Weather.NIGHT],
    phases: {
      1: { phaseNumber: 1, name: 'Pântano Profundo', description: 'Sussurros ecoam no nevoeiro. Sobreviva aos saltadores e esporos.', duration: 25, spawnRate: 1000, enemyTypes: ['MARSH_JUMPER', 'SPORE_SPITTER'] },
      2: { phaseNumber: 2, name: 'Vala das Almas', description: 'Derrote os espécimes gigantes alterados pela radiação espectral', duration: 20, spawnRate: 1100, enemyTypes: ['MARSH_JUMPER', 'SPORE_SPITTER'] },
      3: { phaseNumber: 3, name: 'Covil do Leviatã', description: 'O Corrupted Leviathan emergiu das profundezas lodosas', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 3,
    regionName: 'Forja Magmática',
    duration: 20,
    phase1Duration: 20,
    phase2Duration: 20,
    spawnRate: 1250,
    enemyTypes: ['MAGMA_BAT'],
    boss: 'BOSS_FORGE_DRAGON',
    biome: Biome.VOLCANO,
    possibleWeathers: [Weather.CLEAR],
    phases: {
      1: { phaseNumber: 1, name: 'Entrada das Fendas', description: 'Desvie de fendas de calor e morcegos magmáticos', duration: 20, spawnRate: 1250, enemyTypes: ['MAGMA_BAT'] },
      2: { phaseNumber: 2, name: 'Caldeira de Cinzas', description: 'Uma ponte estreita sobre a lava fervente. Elites se aproximam.', duration: 20, spawnRate: 1375, enemyTypes: ['MAGMA_BAT'] },
      3: { phaseNumber: 3, name: 'Coração da Forja', description: 'Destrua as 4 Fendas de Erupção para expor o Dragão da Forja!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 4,
    regionName: 'Cidadela Neonis',
    duration: 25,
    phase1Duration: 25,
    phase2Duration: 20,
    spawnRate: 850,
    enemyTypes: ['CANNON_ARCHER', 'CYBER_AUTOMATON'],
    boss: 'BOSS_ARTILLERY_WARLORD',
    biome: Biome.CITY,
    possibleWeathers: [Weather.CLEAR, Weather.RAIN],
    phases: {
      1: { phaseNumber: 1, name: 'Pátio de Artilharia', description: 'Enfrente arqueiros mecânicos sob fogo cruzado', duration: 25, spawnRate: 850, enemyTypes: ['CANNON_ARCHER', 'CYBER_AUTOMATON'] },
      2: { phaseNumber: 2, name: 'Arsenal Blindado', description: 'A segurança máxima da cidadela foi ativada. Inimigos de elite a postos.', duration: 20, spawnRate: 935, enemyTypes: ['CANNON_ARCHER', 'CYBER_AUTOMATON'] },
      3: { phaseNumber: 3, name: 'Câmara de Controle', description: 'Neutralize as 4 Bobinas de Energia para penetrar o escudo do Senhor da Artilharia!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 5,
    regionName: 'Deserto das Tempestades',
    duration: 25,
    phase1Duration: 25,
    phase2Duration: 20,
    spawnRate: 650,
    enemyTypes: ['TESLA_MUMMY', 'SOLAR_MONK'],
    boss: 'BOSS_THUNDER_PHARAOH',
    biome: Biome.DESERT,
    possibleWeathers: [Weather.CLEAR, Weather.SANDSTORM],
    phases: {
      1: { phaseNumber: 1, name: 'Dunas Solares', description: 'Sobreviva sob o sol escaldante e múmias eletrificadas', duration: 25, spawnRate: 650, enemyTypes: ['TESLA_MUMMY', 'SOLAR_MONK'] },
      2: { phaseNumber: 2, name: 'Ruínas de Âmbar', description: 'Tempestades de areia e condutores cobrem o solo sagrado', duration: 20, spawnRate: 715, enemyTypes: ['TESLA_MUMMY', 'SOLAR_MONK'] },
      3: { phaseNumber: 3, name: 'Templo do Trovão', description: 'Destrua os 3 Sarcófagos Tesla usando as descargas do Faraó do Trovão!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 6,
    regionName: 'Pico do Zero Absoluto',
    duration: 25,
    phase1Duration: 25,
    phase2Duration: 20,
    spawnRate: 550,
    enemyTypes: ['PERMAFROST_WARDEN', 'BLIZZARD_WRAITH', 'CRYO_SPIKER'],
    boss: 'BOSS_YETI_OVERLORD',
    biome: Biome.SNOW,
    possibleWeathers: [Weather.BLIZZARD, Weather.CLEAR],
    phases: {
      1: { phaseNumber: 1, name: 'Encostas Congeladas', description: 'Aqueça-se em gêiseres termais para combater o frio congelante', duration: 25, spawnRate: 550, enemyTypes: ['PERMAFROST_WARDEN', 'BLIZZARD_WRAITH', 'CRYO_SPIKER'] },
      2: { phaseNumber: 2, name: 'Fenda da Nevasca', description: 'Guerreiros glaciais de elite bloqueiam sua passagem pela encosta', duration: 20, spawnRate: 605, enemyTypes: ['PERMAFROST_WARDEN', 'BLIZZARD_WRAITH', 'CRYO_SPIKER'] },
      3: { phaseNumber: 3, name: 'Trono da Geada', description: 'Destrua os 4 Cristais Criogênicos que emitem o escudo do Lorde Yeti!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 7,
    regionName: 'Metrópole Resonante',
    duration: 25,
    phase1Duration: 25,
    phase2Duration: 20,
    spawnRate: 500,
    enemyTypes: ['PRISM_SIPHON', 'INERTIA_SENTINEL'],
    boss: 'BOSS_PRIME_COLOSSUS',
    biome: Biome.CITY,
    possibleWeathers: [Weather.CLEAR],
    phases: {
      1: { phaseNumber: 1, name: 'Periferia de Néon', description: 'Os hologramas brilham. Sobreviva à investida sentinela.', duration: 25, spawnRate: 500, enemyTypes: ['PRISM_SIPHON', 'INERTIA_SENTINEL'] },
      2: { phaseNumber: 2, name: 'Plataforma Antigravidade', description: 'Correntes elétricas oscilam no piso flutuante', duration: 20, spawnRate: 550, enemyTypes: ['PRISM_SIPHON', 'INERTIA_SENTINEL'] },
      3: { phaseNumber: 3, name: 'Núcleo de Singularidade', description: 'Desative as 4 Âncoras Gravitacionais para danificar o Colosso Primordial!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 8,
    regionName: 'Criptas Góticas',
    duration: 25,
    phase1Duration: 25,
    phase2Duration: 20,
    spawnRate: 450,
    enemyTypes: ['SHADOW_STALKER', 'CRYPT_NECROMANCER', 'GRAVE_EXECUTIONER'],
    boss: 'BOSS_NIGHT_REAPER',
    biome: Biome.GRAVEYARD,
    possibleWeathers: [Weather.NIGHT],
    phases: {
      1: { phaseNumber: 1, name: 'Jardim de Lápides', description: 'As lápides tremem. Evite as mãos e abata os necromantes.', duration: 25, spawnRate: 450, enemyTypes: ['SHADOW_STALKER', 'CRYPT_NECROMANCER', 'GRAVE_EXECUTIONER'] },
      2: { phaseNumber: 2, name: 'Catacumbas de Ossos', description: 'Estreitas galerias de túmulos ancestrais habitadas por elites góticos', duration: 20, spawnRate: 495, enemyTypes: ['SHADOW_STALKER', 'CRYPT_NECROMANCER', 'GRAVE_EXECUTIONER'] },
      3: { phaseNumber: 3, name: 'Mausoléu Ancestral', description: 'Destrua os 4 Altares de Almas para dissipar a névoa do Ceifador da Noite!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 9,
    regionName: 'Santuário Celestial',
    duration: 30,
    phase1Duration: 30,
    phase2Duration: 20,
    spawnRate: 400,
    enemyTypes: ['SOLAR_MONK', 'SOLAR_PALADIN', 'SOLAR_PRIESTESS'],
    boss: 'BOSS_CELESTIAL_EMPEROR',
    biome: Biome.FOREST,
    possibleWeathers: [Weather.CLEAR],
    phases: {
      1: { phaseNumber: 1, name: 'Jardins Suspensos', description: 'Caminhe sobre as nuvens. O poder solar brilha nos altares.', duration: 30, spawnRate: 400, enemyTypes: ['SOLAR_MONK', 'SOLAR_PALADIN', 'SOLAR_PRIESTESS'] },
      2: { phaseNumber: 2, name: 'Caminho da Iluminação', description: 'Proteja-se na luz e encare os paladinos solares sagrados', duration: 20, spawnRate: 440, enemyTypes: ['SOLAR_MONK', 'SOLAR_PALADIN', 'SOLAR_PRIESTESS'] },
      3: { phaseNumber: 3, name: 'Cúpula da Aurora', description: 'Estraçalhe as 4 Lentes de Foco Celeste para punir o Imperador Celestial!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  },
  {
    floorNumber: 10,
    regionName: 'Abismo do Vazio',
    duration: 30,
    phase1Duration: 30,
    phase2Duration: 20,
    spawnRate: 320,
    enemyTypes: ['VOID_ABERRATION', 'ENTROPY_BEHEMOTH', 'RIFT_CALLER'],
    boss: 'BOSS_VOID_SOVEREIGN',
    biome: Biome.GRAVEYARD,
    possibleWeathers: [Weather.NIGHT],
    phases: {
      1: { phaseNumber: 1, name: 'Fronteira da Existência', description: 'A gravidade colapsa. O vazio consome tudo.', duration: 30, spawnRate: 320, enemyTypes: ['VOID_ABERRATION', 'ENTROPY_BEHEMOTH', 'RIFT_CALLER'] },
      2: { phaseNumber: 2, name: 'Singularidade Negra', description: 'A matéria escura distorce o espaço e o tempo com fúria', duration: 20, spawnRate: 352, enemyTypes: ['VOID_ABERRATION', 'ENTROPY_BEHEMOTH', 'RIFT_CALLER'] },
      3: { phaseNumber: 3, name: 'Coração do Caos', description: 'Vença a simulação destruindo as 4 Fendas de Singularidade do Soberano do Vazio!', duration: 9999, spawnRate: 0, enemyTypes: [] }
    }
  }
];

export const REGION_CONFIGS = FLOOR_CONFIGS;

export const FLOOR_ANOMALIES: Record<number, FloorAnomaly> = {
  2: {
    floorNumber: 2,
    id: 'ANOMALY_BLOOD_MOON',
    name: 'Lua de Sangue',
    icon: '🩸',
    color: '#ef4444',
    description: 'Uma lua avermelhada enfurece os monstros, mas dobra as recompensas arcanas.',
    buffText: '+100% Cristais de Mana e +15% Chance de Crítico.',
    hazardText: 'Inimigos têm +25% de Velocidade de Movimento e +20% Dano.',
    manaCrystalsMult: 2.0,
    critChanceBonus: 0.15,
    enemySpeedMult: 1.25,
    enemyDamageMult: 1.20
  },
  3: {
    floorNumber: 3,
    id: 'ANOMALY_VOLCANO',
    name: 'Forja Magmática',
    icon: '🔥',
    color: '#f97316',
    description: 'O calor sufocante incendeia todos os ataques, mas enfraquece armaduras.',
    buffText: 'Ataques inflamam inimigos causando Dano de Fogo bônus.',
    hazardText: 'Armadura e Resistência Mágica reduzidas em 20%. Inimigos têm +15% de HP.',
    playerAdMult: 1.15,
    playerApMult: 1.15,
    enemyHpMult: 1.15
  },
  4: {
    floorNumber: 4,
    id: 'ANOMALY_TOXIC',
    name: 'Miasma Venenoso',
    icon: '☣️',
    color: '#a3e635',
    description: 'Esporos tóxicos cobrem a cidade. Golpes críticos espalham veneno contagioso.',
    buffText: 'Golpes críticos causam explosão de Veneno em Área.',
    hazardText: 'Inimigos recebem +25% de Vida Máxima e Escudo.',
    critChanceBonus: 0.10,
    enemyHpMult: 1.25
  },
  5: {
    floorNumber: 5,
    id: 'ANOMALY_ELECTRIC',
    name: 'Sobrecarga Elétrica',
    icon: '⚡',
    color: '#eab308',
    description: 'O deserto relampejante sobrecarrega todas as habilidades e feitiços.',
    buffText: 'Tempo de Recarga de Habilidades reduzido em -30%.',
    hazardText: 'Dano sofrido pelo Caçador aumentado em +20%.',
    skillCooldownMult: 0.70,
    enemyDamageMult: 1.20
  },
  6: {
    floorNumber: 6,
    id: 'ANOMALY_FROST',
    name: 'Geada Absoluta',
    icon: '❄️',
    color: '#38bdf8',
    description: 'A ventania congelante desacelera o combate e intensifica atordoamentos.',
    buffText: 'Acertos em inimigos reduzem velocidade deles e causam +50% de Stagger.',
    hazardText: 'Inimigos causam +15% de Dano de Gelo bônus.',
    staggerBonusMult: 1.50,
    enemyDamageMult: 1.15
  },
  7: {
    floorNumber: 7,
    id: 'ANOMALY_GRAVITY',
    name: 'Dobra Gravitacional',
    icon: '🌌',
    color: '#a855f7',
    description: 'Campos gravitacionais instáveis expandem o alcance de explosões mágicas.',
    buffText: 'Raio de Habilidades em Área aumentado em +60%.',
    hazardText: 'Tempo de Recarga da Esquiva (Dash) aumentado em +25%.',
    skillRadiusMult: 1.60,
    dashCooldownMult: 1.25
  },
  8: {
    floorNumber: 8,
    id: 'ANOMALY_SHADOW',
    name: 'Vazio Sombrio',
    icon: '👁️',
    color: '#c084fc',
    description: 'A penumbra do cemitério arcano fortalece a agressividade de caçadores e monstros.',
    buffText: '+30% de Dano Físico e Mágico (AD/AP) e +10% Omnivamp.',
    hazardText: 'Inimigos atacam 20% mais rápido e possuem +25% de HP.',
    playerAdMult: 1.30,
    playerApMult: 1.30,
    enemyHpMult: 1.25,
    enemySpeedMult: 1.20
  },
  9: {
    floorNumber: 9,
    id: 'ANOMALY_CELESTIAL',
    name: 'Aurora Celestial',
    icon: '✨',
    color: '#fef08a',
    description: 'A luz cósmica do santuário abençoa acertos críticos com roubo de vida.',
    buffText: 'Abater Elites restaura 15% de Vida e dá +30% de Dano Crítico.',
    hazardText: 'Inimigos ganham escudos arcanos refletores temporários.',
    critChanceBonus: 0.15,
    enemyHpMult: 1.30
  },
  10: {
    floorNumber: 10,
    id: 'ANOMALY_CHAOS',
    name: 'Caos Primordial',
    icon: '☠️',
    color: '#f43f5e',
    description: 'O topo da Torre dos Ecos. O Soberano do Vazio invoca cataclismos contínuos.',
    buffText: 'Dano de todas as Habilidades aumentado em +50%.',
    hazardText: 'O Chefe final ganha 3 Fases Dinâmicas, imune a congelamento e fúria total.',
    playerAdMult: 1.50,
    playerApMult: 1.50,
    staggerBonusMult: 1.30,
    enemyHpMult: 1.50,
    enemyDamageMult: 1.35
  }
};

export function getFloorAnomaly(floorNumber: number): FloorAnomaly | null {
  const normFloor = Math.max(1, Math.min(10, floorNumber));
  return FLOOR_ANOMALIES[normFloor] || null;
}

export interface Floor1InstabilityInfo {
  stage: number;
  name: string;
  color: string;
  desc: string;
}

export function getFloor1Instability(timeSeconds: number): Floor1InstabilityInfo {
  if (timeSeconds < 120) {
    return { stage: 1, name: 'Estabilidade Cristalina', color: '#10b981', desc: 'Floresta calma (00:00 - 02:00)' };
  } else if (timeSeconds < 240) {
    return { stage: 2, name: 'Instabilidade Leve', color: '#38bdf8', desc: 'Espinhos ativos (02:00 - 04:00)' };
  } else if (timeSeconds < 360) {
    return { stage: 3, name: 'Ruptura de Cristal', color: '#f59e0b', desc: 'Quedas de estilhaços (04:00 - 06:00)' };
  } else if (timeSeconds < 480) {
    return { stage: 4, name: 'Tempestade de Quartzo', color: '#f97316', desc: 'Perigo elevado (06:00 - 08:00)' };
  } else {
    return { stage: 5, name: 'Colapso Cristalino', color: '#ef4444', desc: 'Instabilidade crítica (08:00+)' };
  }
}

export interface RegionTreeNode {
  floorNumber: number;
  regionName: string;
  biome: string;
  bossName: string;
  x: number;
  y: number;
  predecessors: number[];
  successors: number[];
  description: string;
  dificuldade: 'Iniciante' | 'Intermediária' | 'Perigosa' | 'Elite' | 'Mestre' | 'Pesadelo' | 'Apocalipse';
  recompensa: string;
}

export const REGION_TREE_NODES: RegionTreeNode[] = [
  {
    floorNumber: 1,
    regionName: 'Floresta Esmeralda',
    biome: 'Floresta Elfa',
    bossName: 'Crystal Golias',
    x: 0,
    y: 50,
    predecessors: [],
    successors: [2, 3],
    description: 'Uma densa floresta sob a influência de cristais misteriosos. Lar de golens de quartzo adormecidos.',
    dificuldade: 'Iniciante',
    recompensa: 'Início Seguro + Cristais de Mana de Base'
  },
  {
    floorNumber: 2,
    regionName: 'Pântano dos Sussurros',
    biome: 'Necrópole Espectral',
    bossName: 'Corrupted Leviathan',
    x: -120,
    y: 170,
    predecessors: [1],
    successors: [4, 5],
    description: 'Um lamaçal coberto de neblina corrosiva e sussurros ancestrais. Cuidado com os saltadores do pântano.',
    dificuldade: 'Intermediária',
    recompensa: 'Bônus de XP de Monstro +15%'
  },
  {
    floorNumber: 3,
    regionName: 'Forja Magmática',
    biome: 'Vulcão Ativo',
    bossName: 'Forge Dragon',
    x: 120,
    y: 170,
    predecessors: [1],
    successors: [5, 6],
    description: 'Rachaduras de calor extremo expelem cinzas e morcegos flamejantes. A lava ferve sob as plataformas.',
    dificuldade: 'Intermediária',
    recompensa: 'Bônus de Cristais de Mana +20%'
  },
  {
    floorNumber: 4,
    regionName: 'Cidadela Neonis',
    biome: 'Metrópole Tecnológica',
    bossName: 'Artillery Warlord',
    x: -200,
    y: 290,
    predecessors: [2],
    successors: [7],
    description: 'Uma cidadela futurista guardada por robôs automatizados e arqueiros de artilharia pesada.',
    dificuldade: 'Perigosa',
    recompensa: 'Chance de Drop de Runas Raras +10%'
  },
  {
    floorNumber: 5,
    regionName: 'Deserto das Tempestades',
    biome: 'Dunas Solares',
    bossName: 'Thunder Pharaoh',
    x: 0,
    y: 290,
    predecessors: [2, 3],
    successors: [7, 8],
    description: 'Um mar de areia sob tempestades de areia constantes e descargas elétricas de múmias de Tesla.',
    dificuldade: 'Elite',
    recompensa: 'Recuperação de Vida na Transição +10% de Max HP'
  },
  {
    floorNumber: 6,
    regionName: 'Pico do Zero Absoluto',
    biome: 'Geleira Glacial',
    bossName: 'Yeti Overlord',
    x: 200,
    y: 290,
    predecessors: [3],
    successors: [8],
    description: 'Montanhas cobertas por nevascas violentas. Espectros e guardiões de permafrost habitam o gelo.',
    dificuldade: 'Perigosa',
    recompensa: 'Bônus de Escudo Inicial de 150 HP'
  },
  {
    floorNumber: 7,
    regionName: 'Metrópole Resonante',
    biome: 'Cúpula Holográfica',
    bossName: 'Prime Colossus',
    x: -100,
    y: 410,
    predecessors: [4, 5],
    successors: [9],
    description: 'O núcleo tecnológico superior onde a gravidade oscila e sentinelas prismáticas drenam energia.',
    dificuldade: 'Mestre',
    recompensa: 'Redução de Cooldown de Habilidades +15%'
  },
  {
    floorNumber: 8,
    regionName: 'Criptas Góticas',
    biome: 'Catacumba Subterrânea',
    bossName: 'Night Reaper',
    x: 100,
    y: 410,
    predecessors: [5, 6],
    successors: [9],
    description: 'Túmulos sombrios e necromantes poderosos que erguem as mãos das profundezas para capturar caçadores.',
    dificuldade: 'Mestre',
    recompensa: 'Aumento de Dano Físico e Mágico +10%'
  },
  {
    floorNumber: 9,
    regionName: 'Santuário Celestial',
    biome: 'Caminho Celeste',
    bossName: 'Celestial Emperor',
    x: 0,
    y: 530,
    predecessors: [7, 8],
    successors: [10],
    description: 'Altares suspensos sobre as nuvens. O brilho solar purificador cega quem não está preparado.',
    dificuldade: 'Pesadelo',
    recompensa: 'Ganho de XP de Caçador duplicado por 60 segundos'
  },
  {
    floorNumber: 10,
    regionName: 'Abismo do Vazio',
    biome: 'Singularidade Negra',
    bossName: 'Void Sovereign',
    x: 0,
    y: 650,
    predecessors: [9],
    successors: [],
    description: 'Onde o tempo e o espaço colapsam. O teste final contra a entropia e o rei do vazio.',
    dificuldade: 'Apocalipse',
    recompensa: 'VITÓRIA TOTAL DA TORRE DOS ECOS'
  }
];

