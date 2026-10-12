import { Archetype } from './types';

export type BlessingRarity = 'COMMON' | 'RARE' | 'EPIC';
export type BlessingCategory = 'STATS' | 'SKILL' | 'SURVIVAL' | 'UTILITY';

export interface RunBlessing {
  id: string;
  name: string;
  description: string;
  category: BlessingCategory;
  rarity: BlessingRarity;
  icon: string;
  color: string;
  // Archetypes that can roll this blessing (empty = universal)
  allowedArchetypes?: Archetype[];
  // Application function parameters
  statsBonus?: {
    maxHp?: number;
    ad?: number;
    ap?: number;
    armor?: number;
    mr?: number;
    moveSpeed?: number;
    atkSpeed?: number;
    critChance?: number;
    critDamage?: number;
    omnivamp?: number;
    regen?: number;
    pierce?: number;
  };
  specialEffectKey?: string;
  specialEffectValue?: number;
}

export const RUN_BLESSINGS: RunBlessing[] = [
  // --- UNIVERSAIS & ATRIBUTOS ---
  {
    id: 'blessing_vitality_surge',
    name: 'Surto de Vitalidade',
    description: '+35 Vida Máxima e restaura 35 de Vida imediatamente.',
    category: 'SURVIVAL',
    rarity: 'COMMON',
    icon: '❤️',
    color: '#f43f5e',
    statsBonus: { maxHp: 35 }
  },
  {
    id: 'blessing_colossus_vigor',
    name: 'Vigor do Colosso',
    description: '+80 Vida Máxima, +5 Armadura e restaura 80 de Vida.',
    category: 'SURVIVAL',
    rarity: 'RARE',
    icon: '🛡️',
    color: '#10b981',
    statsBonus: { maxHp: 80, armor: 5 }
  },
  {
    id: 'blessing_blade_sharpening',
    name: 'Lâminas Rúnicas',
    description: '+4 Dano Físico (AD) e +3% Chance de Crítico.',
    category: 'STATS',
    rarity: 'COMMON',
    icon: '⚔️',
    color: '#f59e0b',
    allowedArchetypes: [Archetype.ARCHER, Archetype.VORGAR],
    statsBonus: { ad: 4, critChance: 0.03 }
  },
  {
    id: 'blessing_arcane_surge',
    name: 'Fluência Arcana',
    description: '+6 Poder Mágico (AP) e +2% Velocidade de Ataque.',
    category: 'STATS',
    rarity: 'COMMON',
    icon: '🔮',
    color: '#a855f7',
    allowedArchetypes: [Archetype.MAGE, Archetype.SUMMONER],
    statsBonus: { ap: 6, atkSpeed: 0.02 }
  },
  {
    id: 'blessing_wind_strider',
    name: 'Passos da Tormenta',
    description: '+18 Velocidade de Movimento e +5% Velocidade de Ataque.',
    category: 'UTILITY',
    rarity: 'COMMON',
    icon: '👟',
    color: '#06b6d4',
    statsBonus: { moveSpeed: 18, atkSpeed: 0.05 }
  },
  {
    id: 'blessing_blood_thirst',
    name: 'Dízimo de Sangue',
    description: '+2.5% Omnivamp (recupera vida ao causar dano de qualquer fonte).',
    category: 'SURVIVAL',
    rarity: 'RARE',
    icon: '🩸',
    color: '#e11d48',
    statsBonus: { omnivamp: 0.025 }
  },
  {
    id: 'blessing_critical_fervor',
    name: 'Fervor Crítico',
    description: '+8% Chance de Crítico e +25% Dano Crítico.',
    category: 'STATS',
    rarity: 'RARE',
    icon: '💥',
    color: '#f97316',
    statsBonus: { critChance: 0.08, critDamage: 0.25 }
  },
  {
    id: 'blessing_aegis_ward',
    name: 'Bastião Inviolável',
    description: '+8 Armadura e +8 Resistência Mágica contra todos os danos.',
    category: 'SURVIVAL',
    rarity: 'COMMON',
    icon: '🔰',
    color: '#34d399',
    statsBonus: { armor: 8, mr: 8 }
  },

  // --- LYRA (ARCHER) ---
  {
    id: 'blessing_lyra_split_shot',
    name: 'Disparos Divididos',
    description: 'Ataques básicos e Chuva de Flechas disparam +1 projétil adicional.',
    category: 'SKILL',
    rarity: 'RARE',
    icon: '🏹',
    color: '#fbbf24',
    allowedArchetypes: [Archetype.ARCHER],
    specialEffectKey: 'bonus_projectiles',
    specialEffectValue: 1
  },
  {
    id: 'blessing_lyra_piercing_gale',
    name: 'Vendaval Perfurante',
    description: 'Seus projéteis perfuram +1 alvo adicional e ganham +15% de Velocidade.',
    category: 'SKILL',
    rarity: 'COMMON',
    icon: '🎯',
    color: '#38bdf8',
    allowedArchetypes: [Archetype.ARCHER],
    statsBonus: { pierce: 1, atkSpeed: 0.08 }
  },
  {
    id: 'blessing_lyra_executioner',
    name: 'Marca da Algoz',
    description: 'Ataques causam +25% de dano adicional contra inimigos abaixo de 40% de Vida.',
    category: 'SKILL',
    rarity: 'EPIC',
    icon: '🦅',
    color: '#ef4444',
    allowedArchetypes: [Archetype.ARCHER],
    statsBonus: { critChance: 0.06, ad: 5 }
  },

  // --- KAEL (MAGE) ---
  {
    id: 'blessing_kael_singularity_echo',
    name: 'Eco de Singularidade',
    description: 'O feitiço E (Singularidade) causa +35% de dano e puxa com maior rapidez.',
    category: 'SKILL',
    rarity: 'RARE',
    icon: '🌀',
    color: '#c084fc',
    allowedArchetypes: [Archetype.MAGE],
    statsBonus: { ap: 8 }
  },
  {
    id: 'blessing_kael_overload',
    name: 'Sobrecarga Elemental',
    description: '+12 Poder Mágico (AP) e ataques mágicos perfuram +1 inimigo extra.',
    category: 'SKILL',
    rarity: 'EPIC',
    icon: '⚡',
    color: '#a855f7',
    allowedArchetypes: [Archetype.MAGE],
    statsBonus: { ap: 12, pierce: 1 }
  },
  {
    id: 'blessing_kael_frost_spark',
    name: 'Centelha Glacial',
    description: 'Seus orbes mágicos aplicam 20% de lentidão nos inimigos por 1.5s.',
    category: 'SKILL',
    rarity: 'COMMON',
    icon: '❄️',
    color: '#67e8f9',
    allowedArchetypes: [Archetype.MAGE],
    statsBonus: { ap: 4 }
  },

  // --- VORGAR (BERSERKER / TANK) ---
  {
    id: 'blessing_vorgar_earth_shatter',
    name: 'Ruptura Sísmica',
    description: 'O Golpe Sísmico (Q) ganha +30% de área de impacto e quebra armadura.',
    category: 'SKILL',
    rarity: 'RARE',
    icon: '🔨',
    color: '#f97316',
    allowedArchetypes: [Archetype.VORGAR],
    statsBonus: { ad: 6, maxHp: 25 }
  },
  {
    id: 'blessing_vorgar_titan_fortitude',
    name: 'Fortitude de Titã',
    description: 'Receber dano gera um escudo reativo de 25 de Vida (Recarga: 8s).',
    category: 'SURVIVAL',
    rarity: 'EPIC',
    icon: '🪨',
    color: '#eab308',
    allowedArchetypes: [Archetype.VORGAR],
    statsBonus: { maxHp: 60, armor: 8, mr: 8 }
  },
  {
    id: 'blessing_vorgar_blood_frenzy',
    name: 'Frenesi Sanguinário',
    description: '+12% Velocidade de Ataque corpo a corpo e +2% Omnivamp.',
    category: 'STATS',
    rarity: 'COMMON',
    icon: '🪓',
    color: '#ef4444',
    allowedArchetypes: [Archetype.VORGAR],
    statsBonus: { atkSpeed: 0.12, omnivamp: 0.02 }
  },

  // --- MALAKAR (SUMMONER) ---
  {
    id: 'blessing_malakar_beast_vigor',
    name: 'Vigor das Feras',
    description: 'Suas invocações ganham +35% de Vida Máxima e +10 de Armadura/RM.',
    category: 'SKILL',
    rarity: 'RARE',
    icon: '🐺',
    color: '#38bdf8',
    allowedArchetypes: [Archetype.SUMMONER],
    statsBonus: { ap: 5, maxHp: 30 }
  },
  {
    id: 'blessing_malakar_spirit_frenzy',
    name: 'Fúria Espectral',
    description: 'As feras atacam 25% mais rápido e causam dano adicional baseado em seu AP.',
    category: 'SKILL',
    rarity: 'RARE',
    icon: '🐾',
    color: '#818cf8',
    allowedArchetypes: [Archetype.SUMMONER],
    statsBonus: { ap: 8, atkSpeed: 0.05 }
  },
  {
    id: 'blessing_malakar_soul_harvest',
    name: 'Colheita de Almas',
    description: 'Derrotar inimigos concede 1 carga temporária que aumenta seu Poder Mágico.',
    category: 'SKILL',
    rarity: 'EPIC',
    icon: '👻',
    color: '#c084fc',
    allowedArchetypes: [Archetype.SUMMONER],
    statsBonus: { ap: 10, omnivamp: 0.015 }
  }
];

// Utilitário para sortear 3 Dádivas respeitando o Caçador atual e raridades
export function rollLevelUpBlessings(archetype: Archetype, count: number = 3): RunBlessing[] {
  // Filtra as dádivas compatíveis
  const available = RUN_BLESSINGS.filter(b => !b.allowedArchetypes || b.allowedArchetypes.includes(archetype));
  
  const shuffled = [...available].sort(() => 0.5 - Math.random());
  
  // Retorna 'count' dádivas distintas
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
