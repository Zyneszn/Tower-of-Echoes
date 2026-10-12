import { Archetype } from './types';
import { HunterDefinition } from './src_types_build';
import { BASE_STATS, SKILL_CONFIG } from './constants';

// ==========================================
// HUNTERS
// ==========================================
export const HUNTERS: Record<Archetype, HunterDefinition> = {
  [Archetype.ARCHER]: {
    id: Archetype.ARCHER,
    name: 'Lyra, a Patrulheira Sombria',
    title: 'Arqueira Fantasma do Vazio',
    description: 'Especialista em disparos perfurantes de longa distância, mobilidade rápida e acertos críticos letais.',
    icon: '🏹',
    color: '#00e5ff',
    baseStats: BASE_STATS[Archetype.ARCHER],
    skill1: {
      name: 'Chuva de Flechas de Fóton',
      description: 'Dispara uma salva circular de flechas perfurantes em 360° causando dano físico massivo.',
      cooldown: SKILL_CONFIG[Archetype.ARCHER].skill1Cd,
      icon: '🎯'
    },
    skill2: {
      name: 'Disparo Perfurante Sombrio',
      description: 'Dispara um feixe veloz de flechas concentradas em linha reta que perfura inimigos e aplica Sangramento.',
      cooldown: SKILL_CONFIG[Archetype.ARCHER].skill2Cd,
      icon: '⚡'
    },
    skill3: {
      name: 'Eclipse do Vazio',
      description: 'Envolve Lyra em sombras furtivas e marca inimigos na tela. O próximo ataque dispara flechas espectrais em todos os alvos.',
      cooldown: SKILL_CONFIG[Archetype.ARCHER].skill3Cd,
      icon: '🌌'
    },
    dash: {
      name: 'Salto Fantasmagórico',
      description: 'Impulso etéreo que ultrapassa inimigos e esquiva de projéteis com 3 cargas.',
      cooldown: SKILL_CONFIG[Archetype.ARCHER].dashCd,
      maxCharges: SKILL_CONFIG[Archetype.ARCHER].dashChargesMax,
      icon: '💨'
    },
    passive: {
      name: 'Passo Fantasma',
      description: 'Acertos críticos concedem +15% de Velocidade e +5% de Chance de Crítico por 4 segundos (acumula 3x).',
      icon: '👁️'
    },
    tags: ['PROJECTILE', 'CRITICAL', 'SPEED', 'DASH']
  },
  [Archetype.MAGE]: {
    id: Archetype.MAGE,
    name: 'Kael, o Tecelão do Vazio',
    title: 'Arcanista da Chama Nebular',
    description: 'Manipula o poder arcano concentrado, causando explosões em área e invocando escudos de energia.',
    icon: '🔮',
    color: '#b026ff',
    baseStats: BASE_STATS[Archetype.MAGE],
    skill1: {
      name: 'Nova Cósmica de Energia',
      description: 'Detona uma onda esférica de magia que empurra e atordoa alvos próximos.',
      cooldown: SKILL_CONFIG[Archetype.MAGE].skill1Cd,
      icon: '💥'
    },
    skill2: {
      name: 'Fenda Gravitacional Arcana',
      description: 'Abre um vórtice gravitacional que atrai todos os monstros próximos para o centro, causando dano contínuo e desaceleração.',
      cooldown: SKILL_CONFIG[Archetype.MAGE].skill2Cd,
      icon: '🌀'
    },
    skill3: {
      name: 'Cataclismo Estelar',
      description: 'Invoca um meteorito devastador do espaço na posição do cursor, causando dano mágico massivo e atordoamento em área.',
      cooldown: SKILL_CONFIG[Archetype.MAGE].skill3Cd,
      icon: '☄️'
    },
    dash: {
      name: 'Translocação Dimensional',
      description: 'Teleporte instantâneo em linha reta com 2 cargas com dano residual.',
      cooldown: SKILL_CONFIG[Archetype.MAGE].dashCd,
      maxCharges: SKILL_CONFIG[Archetype.MAGE].dashChargesMax,
      icon: '🌌'
    },
    passive: {
      name: 'Escudo Singular',
      description: 'Ao conjurar qualquer habilidade, gera uma barreira mágica que absorve dano equivalente a 15% de seu AP total.',
      icon: '🔮'
    },
    tags: ['ABILITY', 'AREA', 'SHIELD', 'CONTROL']
  },
  [Archetype.VORGAR]: {
    id: Archetype.VORGAR,
    name: 'Vorgar, o Colosso da Ruína',
    title: 'Guerreiro de Ferro Ancestral',
    description: 'Titã encouraçado de combate corpo a corpo. Empunha uma marreta colossal, atrai inimigos com correntes e os esmaga no chão com força cataclísmica.',
    icon: '🔨',
    color: '#10b981',
    baseStats: BASE_STATS[Archetype.VORGAR],
    skill1: {
      name: 'Martelo Cataclísmico',
      description: 'Ergue sua marreta e golpeia uma área com impacto devastador. Causa dano massivo e lentidão (+50% de dano se atingir alvo isolado).',
      cooldown: SKILL_CONFIG[Archetype.VORGAR].skill1Cd,
      icon: '💥'
    },
    skill2: {
      name: 'Garra da Ruína',
      description: 'Lança correntes espectrais que arrastam todos os inimigos na linha para sua frente, atordoando-os brevemente para preparar o combo.',
      cooldown: SKILL_CONFIG[Archetype.VORGAR].skill2Cd,
      icon: '🧲'
    },
    skill3: {
      name: 'Avatar da Ruína',
      description: 'Transforma Vorgar em um titã invencível por 10s: cura vida, aumenta tamanho, concede imunidade e reduz o cooldown do Martelo.',
      cooldown: SKILL_CONFIG[Archetype.VORGAR].skill3Cd,
      icon: '👑'
    },
    dash: {
      name: 'Investida Inexorável',
      description: 'Avanço pesado blindado com 2 cargas, empurrando inimigos e ignorando lentidão.',
      cooldown: SKILL_CONFIG[Archetype.VORGAR].dashCd,
      maxCharges: SKILL_CONFIG[Archetype.VORGAR].dashChargesMax,
      icon: '🛡️'
    },
    passive: {
      name: 'Baluarte Inquebrável',
      description: 'Ao ter sua vida reduzida abaixo de 35%, ativa um Escudo Absorvente de 40% da Vida Máxima, +80 de Armadura e +80 de RM por 8s. (Recarga: 45s)',
      icon: '🛡️',
      cooldown: 45
    },
    tags: ['MELEE', 'AREA', 'CONTROL', 'TANK']
  },
  [Archetype.SUMMONER]: {
    id: Archetype.SUMMONER,
    name: 'Malakar, o Pastor das Almas',
    title: 'Mestre da Convocação Espiritual',
    description: 'Invocador místico auxiliado por duas criaturas espectrais autônomas: o robusto Guardião de Ferro e a veloz Fera Predadora. Vulnerável sem suas invocações.',
    icon: '🔮',
    color: '#a855f7',
    baseStats: BASE_STATS[Archetype.SUMMONER],
    skill1: {
      name: 'Convergência Espiritual',
      description: 'Ordena que os espíritos convirjam e se meçam instantaneamente na área alvo com uma onda de choque explosiva.',
      cooldown: SKILL_CONFIG[Archetype.SUMMONER].skill1Cd,
      icon: '✨'
    },
    skill2: {
      name: 'Invocação Dimensional',
      description: 'Abre um portal dimensional no local indicado, invocando/teleportando ambas as criaturas renovadas com provocações e impacto em área.',
      cooldown: SKILL_CONFIG[Archetype.SUMMONER].skill2Cd,
      icon: '🌀'
    },
    skill3: {
      name: 'Exército das Almas',
      description: 'Entra em fúria necromântica por 8s, restaurando totalmente a vida de suas invocações espirituais e aumentando a agressividade da legião.',
      cooldown: SKILL_CONFIG[Archetype.SUMMONER].skill3Cd,
      icon: '💀'
    },
    dash: {
      name: 'Salto de Névoa Astral',
      description: 'Deslize de teleporte etéreo com 2 cargas que deixa uma cópia espectral para trás.',
      cooldown: SKILL_CONFIG[Archetype.SUMMONER].dashCd,
      maxCharges: SKILL_CONFIG[Archetype.SUMMONER].dashChargesMax,
      icon: '🌫️'
    },
    passive: {
      name: 'Sincronia de Almas',
      description: '25% do dano sofrido é redirecionado para o Guardião. Concede +20% de Velocidade enquanto ambas as criaturas vivem.',
      icon: '👻'
    },
    tags: ['SUMMONER', 'MINIONS', 'TACTICAL', 'BURST']
  }
};
