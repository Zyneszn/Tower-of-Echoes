import { Archetype, Player } from './types';
import { HunterTalentTree, HunterTalentProgress, PlayerTalentProgressMap } from './src_types_talents';
import { PersistentSaveData } from './src_types_progression';

/**
 * HUNTER TALENT TREES CATALOG
 * Full 33-Node Talent Tree specification for Lyra, the Shadow Ranger
 */
export const HUNTER_TALENT_TREES: Record<Archetype, HunterTalentTree> = {
  [Archetype.ARCHER]: {
    hunterId: Archetype.ARCHER,
    hunterName: 'Lyra',
    title: 'A Patrulheira Sombria',
    accentColor: '#00e5ff',
    description: 'Mestre do combate à distância de alta precisão, rajadas de flechas tempestuosas e preparação tática de campo.',
    families: [
      {
        id: 'PRECISION',
        name: 'Precisão',
        subtitle: 'Foco Cirúrgico, Dano Crítico e Execução',
        description: 'Transforma Lyra em uma atiradora de elite com alto dano de alvo único, perfuração e finalizações cirúrgicas.',
        icon: 'Target',
        color: '#00e5ff',
        accentColor: '#38bdf8',
        bgGlow: 'rgba(6, 182, 212, 0.25)'
      },
      {
        id: 'STORM',
        name: 'Tempestade',
        subtitle: 'Cadência Astral e Limpeza de Hordas',
        description: 'Multiplica a quantidade de projéteis, cadência incessante e dispersão elétrica de energia em área.',
        icon: 'Zap',
        color: '#f59e0b',
        accentColor: '#fbbf24',
        bgGlow: 'rgba(245, 158, 11, 0.25)'
      },
      {
        id: 'TRAPS',
        name: 'Armadilhas',
        subtitle: 'Controle de Terreno e Emboscada',
        description: 'Prepara o campo de batalha com espinhos rúnicos, veneno persistente, desaceleração e explosões reactivas.',
        icon: 'ShieldAlert',
        color: '#10b981',
        accentColor: '#34d399',
        bgGlow: 'rgba(16, 185, 129, 0.25)'
      }
    ],
    nodes: [
      // 1. CORE / ORIGIN NODE
      {
        id: 'lyra_core',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Vontade da Patrulheira',
        description: 'O despertar primordial da Patrulheira Sombria. Conecta-se às matrizes de Precisão, Tempestade e Armadilhas.',
        cost: 0,
        icon: 'Compass',
        nodeType: 'KEYSTONE',
        tier: 0,
        x: 0,
        y: 0,
        prerequisites: [],
        connections: ['lyra_p01', 'lyra_t01', 'lyra_a01']
      },

      // 2. PRECISION FAMILY (P01 - P08)
      {
        id: 'lyra_p01',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Olho Frio',
        description: 'Inimigos com mais de 80% de vida sofrem +30% de dano de acerto crítico adicional.',
        cost: 1,
        icon: 'Eye',
        nodeType: 'MINOR',
        tier: 1,
        x: -120,
        y: -90,
        prerequisites: ['lyra_core'],
        connections: ['lyra_p02', 'lyra_p03', 'lyra_h01', 'lyra_h02']
      },
      {
        id: 'lyra_p02',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Ponto Fraco',
        description: 'Acertos críticos reduzem a armadura do alvo em 20% por 4 segundos.',
        cost: 1,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 2,
        x: -220,
        y: -140,
        prerequisites: ['lyra_p01'],
        connections: ['lyra_p04', 'lyra_h02']
      },
      {
        id: 'lyra_p03',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Flecha Pesada',
        description: 'O Disparo Perfurante [E] atordoa o primeiro inimigo atingido por 1.5s e causa +25% de dano.',
        cost: 2,
        icon: 'Target',
        nodeType: 'MAJOR',
        tier: 2,
        x: -150,
        y: -220,
        prerequisites: ['lyra_p01'],
        connections: ['lyra_p04', 'lyra_p05', 'lyra_h01']
      },
      {
        id: 'lyra_p04',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Mapeamento Sombrio',
        description: 'Causar dano crítico a um inimigo marca seus pontos vitais, aumentando a chance de crítico contra ele em +15%.',
        cost: 1,
        icon: 'Sparkles',
        nodeType: 'MINOR',
        tier: 3,
        x: -280,
        y: -230,
        prerequisites: ['lyra_p02', 'lyra_p03'],
        connections: ['lyra_p06', 'lyra_h04']
      },
      {
        id: 'lyra_p05',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Tiro Cirúrgico',
        description: 'Disparos a mais de 300px de distância causam até +35% de dano adicional escalando com o alcance.',
        cost: 2,
        icon: 'Crosshair',
        nodeType: 'MAJOR',
        tier: 3,
        x: -200,
        y: -320,
        prerequisites: ['lyra_p03'],
        connections: ['lyra_p06', 'lyra_p07', 'lyra_h06']
      },
      {
        id: 'lyra_p06',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Calibre Espectral',
        description: 'O Disparo Perfurante atravessa projéteis menores e ganha +40% de velocidade de vôo.',
        cost: 2,
        icon: 'Wind',
        nodeType: 'MAJOR',
        tier: 4,
        x: -320,
        y: -330,
        prerequisites: ['lyra_p04', 'lyra_p05'],
        connections: ['lyra_p07', 'lyra_p08']
      },
      {
        id: 'lyra_p07',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Execução Silenciosa',
        description: 'Eliminar um inimigo com acerto crítico reseta 50% do tempo de recarga do Disparo Perfurante [E].',
        cost: 2,
        icon: 'Flame',
        nodeType: 'MAJOR',
        tier: 4,
        x: -240,
        y: -420,
        prerequisites: ['lyra_p05', 'lyra_p06'],
        connections: ['lyra_p08', 'lyra_h06']
      },
      {
        id: 'lyra_p08',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Tiro da Meia-Noite',
        description: 'A cada 3 acertos críticos consecutivos, o próximo ataque ou habilidade desfere 100% de dano verdadeiro penetrante.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: -300,
        y: -520,
        prerequisites: ['lyra_p06', 'lyra_p07'],
        connections: ['lyra_s01']
      },

      // 3. STORM FAMILY (T01 - T08)
      {
        id: 'lyra_t01',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Dança da Caçadora',
        description: 'Cada ataque básico consecutivo concede +4% de velocidade de ataque acumulando até 5 vezes (+20%).',
        cost: 1,
        icon: 'Zap',
        nodeType: 'MINOR',
        tier: 1,
        x: 120,
        y: -90,
        prerequisites: ['lyra_core'],
        connections: ['lyra_t02', 'lyra_t03', 'lyra_h01', 'lyra_h03']
      },
      {
        id: 'lyra_t02',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Salva de Fótons',
        description: 'A Chuva de Flechas [Q] dispara +2 projéteis adicionais em arco mais amplo.',
        cost: 1,
        icon: 'Sun',
        nodeType: 'MINOR',
        tier: 2,
        x: 220,
        y: -140,
        prerequisites: ['lyra_t01'],
        connections: ['lyra_t04', 'lyra_h03']
      },
      {
        id: 'lyra_t03',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Ricochete Elétrico',
        description: 'Flechas básicas possuem 30% de chance de ricochetear em um inimigo próximo causando 60% do dano.',
        cost: 2,
        icon: 'ZapFast',
        nodeType: 'MAJOR',
        tier: 2,
        x: 150,
        y: -220,
        prerequisites: ['lyra_t01'],
        connections: ['lyra_t04', 'lyra_t05', 'lyra_h01']
      },
      {
        id: 'lyra_t04',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Vento Constante',
        description: 'Enquanto em movimento contínuo, a recarga de todas as habilidades acelera em +20%.',
        cost: 1,
        icon: 'Wind',
        nodeType: 'MINOR',
        tier: 3,
        x: 280,
        y: -230,
        prerequisites: ['lyra_t02', 'lyra_t03'],
        connections: ['lyra_t06', 'lyra_h05']
      },
      {
        id: 'lyra_t05',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Dilúvio Cósmico',
        description: 'O tempo de recarga da Chuva de Flechas [Q] reduz em 25% e cada flecha gera uma micro-explosão estelar.',
        cost: 2,
        icon: 'Activity',
        nodeType: 'MAJOR',
        tier: 3,
        x: 200,
        y: -320,
        prerequisites: ['lyra_t03'],
        connections: ['lyra_t06', 'lyra_t07', 'lyra_h06']
      },
      {
        id: 'lyra_t06',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Impulso Tempestuoso',
        description: 'Usar o Salto Fantasmagórico [ESPAÇO] concede +100% de velocidade de ataque por 2.5s.',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 4,
        x: 320,
        y: -330,
        prerequisites: ['lyra_t04', 'lyra_t05'],
        connections: ['lyra_t07', 'lyra_t08']
      },
      {
        id: 'lyra_t07',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Fluxo Eletrizante',
        description: 'A cada 6 ataques consecutivos rápidos, libere uma descarga elétrica em cadeia que atinge até 4 alvos.',
        cost: 2,
        icon: 'Sparkles',
        nodeType: 'MAJOR',
        tier: 4,
        x: 240,
        y: -420,
        prerequisites: ['lyra_t05', 'lyra_t06'],
        connections: ['lyra_t08', 'lyra_h06']
      },
      {
        id: 'lyra_t08',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Vórtice da Tempestade',
        description: 'A Chuva de Flechas [Q] cria um vórtice eletromagnético contínuo que suga levemente os inimigos para o centro.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: 300,
        y: -520,
        prerequisites: ['lyra_t06', 'lyra_t07'],
        connections: ['lyra_s01']
      },

      // 4. TRAPS & CONTROL FAMILY (A01 - A08)
      {
        id: 'lyra_a01',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Abrolhos Venenosos',
        description: 'Usar o Dash [ESPAÇO] deixa para trás uma armadilha rúnica que desacelera inimigos em 40% e envenena por 3s.',
        cost: 1,
        icon: 'ShieldAlert',
        nodeType: 'MINOR',
        tier: 1,
        x: 0,
        y: 130,
        prerequisites: ['lyra_core'],
        connections: ['lyra_a02', 'lyra_a03', 'lyra_h02', 'lyra_h03']
      },
      {
        id: 'lyra_a02',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Rede de Contenção',
        description: 'Inimigos que estiverem sob efeito de lentidão ou envenenamento sofrem +20% de dano de todas as fontes.',
        cost: 1,
        icon: 'Disc',
        nodeType: 'MINOR',
        tier: 2,
        x: -110,
        y: 220,
        prerequisites: ['lyra_a01'],
        connections: ['lyra_a04', 'lyra_h02']
      },
      {
        id: 'lyra_a03',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Armadilha Esmagadora',
        description: 'Inimigos que acionarem suas armadilhas ficam enraizados por 1.5 segundos e sofrem dano físico aumentado.',
        cost: 2,
        icon: 'Radio',
        nodeType: 'MAJOR',
        tier: 2,
        x: 110,
        y: 220,
        prerequisites: ['lyra_a01'],
        connections: ['lyra_a05', 'lyra_h03']
      },
      {
        id: 'lyra_a04',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Camuflagem do Vazio',
        description: 'Após 1.5s sem sofrer dano ou atacar, Lyra entra em camuflagem: o próximo ataque causa +40% de dano surpresa.',
        cost: 1,
        icon: 'Shield',
        nodeType: 'MINOR',
        tier: 3,
        x: -170,
        y: 310,
        prerequisites: ['lyra_a02'],
        connections: ['lyra_a06', 'lyra_h04']
      },
      {
        id: 'lyra_a05',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Detonação em Cadeia',
        description: 'Inimigos derrotados enquanto envenenados explodem em espinhos rúnicos que espalham veneno em área.',
        cost: 2,
        icon: 'Hexagon',
        nodeType: 'MAJOR',
        tier: 3,
        x: 170,
        y: 310,
        prerequisites: ['lyra_a03'],
        connections: ['lyra_a07', 'lyra_h05']
      },
      {
        id: 'lyra_a06',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Engenharia das Sombras',
        description: 'O número máximo de cargas de Dash aumenta em +1 e a recarga é acelerada em 20%.',
        cost: 2,
        icon: 'Lock',
        nodeType: 'MAJOR',
        tier: 4,
        x: -90,
        y: 400,
        prerequisites: ['lyra_a04'],
        connections: ['lyra_a08', 'lyra_h04']
      },
      {
        id: 'lyra_a07',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Gás Asfixiante',
        description: 'Armadilhas liberam uma névoa tóxica persistente que reduz a velocidade de ataque e movimento inimigos em 35%.',
        cost: 2,
        icon: 'Activity',
        nodeType: 'MAJOR',
        tier: 4,
        x: 90,
        y: 400,
        prerequisites: ['lyra_a05'],
        connections: ['lyra_a08', 'lyra_h05']
      },
      {
        id: 'lyra_a08',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Campo Minado Rúnico',
        description: 'O Dash implanta instantaneamente 3 armadilhas em leque que detonam em sequência ao toque inimigo.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: 0,
        y: 500,
        prerequisites: ['lyra_a06', 'lyra_a07'],
        connections: ['lyra_s02']
      },

      // 5. HYBRID BRIDGES (H01 - H06)
      {
        id: 'lyra_h01',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Precisão Tempestuosa',
        description: '[Ponte Precisão + Tempestade] Cada acerto crítico dispara imediatamente 1 flecha fantasma adicional em alta velocidade.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 2,
        x: 0,
        y: -170,
        prerequisites: ['lyra_p01', 'lyra_t01'],
        connections: ['lyra_p03', 'lyra_t03']
      },
      {
        id: 'lyra_h02',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Gatilho de Emboscada',
        description: '[Ponte Precisão + Armadilhas] Acertos críticos com Disparo Perfurante [E] geram uma armadilha no chão do primeiro alvo atingido.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 2,
        x: -140,
        y: 70,
        prerequisites: ['lyra_p01', 'lyra_a01'],
        connections: ['lyra_p02', 'lyra_a02']
      },
      {
        id: 'lyra_h03',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Chuva de Abrolhos',
        description: '[Ponte Tempestade + Armadilhas] A cada 3 flechas da Chuva de Flechas [Q], finca-se um espinho rúnico no solo que causa lentidão.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 2,
        x: 140,
        y: 70,
        prerequisites: ['lyra_t01', 'lyra_a01'],
        connections: ['lyra_t02', 'lyra_a03']
      },
      {
        id: 'lyra_h04',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Balística Venenosa',
        description: '[Ponte Precisão + Armadilhas] Flechas perfurantes aplicam o veneno máximo de armadilha a todos os alvos que atravessam.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 3,
        x: -240,
        y: 150,
        prerequisites: ['lyra_p04', 'lyra_a04'],
        connections: ['lyra_p06', 'lyra_a06', 'lyra_s02']
      },
      {
        id: 'lyra_h05',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Tempestade de Fragmentação',
        description: '[Ponte Tempestade + Armadilhas] Detonações de armadilha disparam 6 fragmentos afiados que herdam bônus de velocidade de ataque.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 3,
        x: 240,
        y: 150,
        prerequisites: ['lyra_t04', 'lyra_a05'],
        connections: ['lyra_t06', 'lyra_a07', 'lyra_s02']
      },
      {
        id: 'lyra_h06',
        hunterId: Archetype.ARCHER,
        familyId: 'PRECISION',
        name: 'Foco do Olho da Tempestade',
        description: '[Ponte Precisão + Tempestade] Manter a velocidade máxima de ataque aumenta a chance de acerto crítico em +25%.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 4,
        x: 0,
        y: -360,
        prerequisites: ['lyra_p05', 'lyra_t05'],
        connections: ['lyra_p07', 'lyra_t07', 'lyra_s01']
      },

      // 6. SIGNATURE KEYSTONES (S01, S02)
      {
        id: 'lyra_s01',
        hunterId: Archetype.ARCHER,
        familyId: 'STORM',
        name: 'Avatar da Caça Noturna',
        description: '[Assinatura Suprema: Precisão & Tempestade] Todos os projéteis perfuram +1 alvo, têm velocidade duplicada e todo acerto crítico gera flechas espectrais em cascata.',
        cost: 4,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 6,
        x: 0,
        y: -560,
        prerequisites: ['lyra_p08', 'lyra_t08'],
        connections: ['lyra_p08', 'lyra_t08', 'lyra_h06']
      },
      {
        id: 'lyra_s02',
        hunterId: Archetype.ARCHER,
        familyId: 'TRAPS',
        name: 'Soberana do Campo de Batalha',
        description: '[Assinatura Suprema: Controle & Tática] O campo de batalha torna-se seu domínio: inimigos em armadilhas sofrem +50% de dano crítico e o Dash recarrega 1s mais rápido a cada inimigo afetado.',
        cost: 4,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 6,
        x: 0,
        y: 620,
        prerequisites: ['lyra_a08'],
        connections: ['lyra_a08', 'lyra_h04', 'lyra_h05']
      }
    ],
    connections: [
      // Central core connections
      { from: 'lyra_core', to: 'lyra_p01', style: 'ENERGY' },
      { from: 'lyra_core', to: 'lyra_t01', style: 'ENERGY' },
      { from: 'lyra_core', to: 'lyra_a01', style: 'ENERGY' },

      // Precision branch
      { from: 'lyra_p01', to: 'lyra_p02', style: 'SOLID' },
      { from: 'lyra_p01', to: 'lyra_p03', style: 'SOLID' },
      { from: 'lyra_p02', to: 'lyra_p04', style: 'SOLID' },
      { from: 'lyra_p03', to: 'lyra_p04', style: 'SOLID' },
      { from: 'lyra_p03', to: 'lyra_p05', style: 'SOLID' },
      { from: 'lyra_p04', to: 'lyra_p06', style: 'SOLID' },
      { from: 'lyra_p05', to: 'lyra_p06', style: 'SOLID' },
      { from: 'lyra_p05', to: 'lyra_p07', style: 'SOLID' },
      { from: 'lyra_p06', to: 'lyra_p07', style: 'SOLID' },
      { from: 'lyra_p06', to: 'lyra_p08', style: 'ENERGY' },
      { from: 'lyra_p07', to: 'lyra_p08', style: 'ENERGY' },

      // Storm branch
      { from: 'lyra_t01', to: 'lyra_t02', style: 'SOLID' },
      { from: 'lyra_t01', to: 'lyra_t03', style: 'SOLID' },
      { from: 'lyra_t02', to: 'lyra_t04', style: 'SOLID' },
      { from: 'lyra_t03', to: 'lyra_t04', style: 'SOLID' },
      { from: 'lyra_t03', to: 'lyra_t05', style: 'SOLID' },
      { from: 'lyra_t04', to: 'lyra_t06', style: 'SOLID' },
      { from: 'lyra_t05', to: 'lyra_t06', style: 'SOLID' },
      { from: 'lyra_t05', to: 'lyra_t07', style: 'SOLID' },
      { from: 'lyra_t06', to: 'lyra_t07', style: 'SOLID' },
      { from: 'lyra_t06', to: 'lyra_t08', style: 'ENERGY' },
      { from: 'lyra_t07', to: 'lyra_t08', style: 'ENERGY' },

      // Traps branch
      { from: 'lyra_a01', to: 'lyra_a02', style: 'SOLID' },
      { from: 'lyra_a01', to: 'lyra_a03', style: 'SOLID' },
      { from: 'lyra_a02', to: 'lyra_a04', style: 'SOLID' },
      { from: 'lyra_a03', to: 'lyra_a05', style: 'SOLID' },
      { from: 'lyra_a04', to: 'lyra_a06', style: 'SOLID' },
      { from: 'lyra_a05', to: 'lyra_a07', style: 'SOLID' },
      { from: 'lyra_a06', to: 'lyra_a08', style: 'ENERGY' },
      { from: 'lyra_a07', to: 'lyra_a08', style: 'ENERGY' },

      // Hybrid Bridges (Free Inter-Family Connection)
      { from: 'lyra_p01', to: 'lyra_h01', style: 'DASHED' },
      { from: 'lyra_t01', to: 'lyra_h01', style: 'DASHED' },
      { from: 'lyra_h01', to: 'lyra_p03', style: 'DASHED' },
      { from: 'lyra_h01', to: 'lyra_t03', style: 'DASHED' },

      { from: 'lyra_p01', to: 'lyra_h02', style: 'DASHED' },
      { from: 'lyra_a01', to: 'lyra_h02', style: 'DASHED' },
      { from: 'lyra_h02', to: 'lyra_p02', style: 'DASHED' },
      { from: 'lyra_h02', to: 'lyra_a02', style: 'DASHED' },

      { from: 'lyra_t01', to: 'lyra_h03', style: 'DASHED' },
      { from: 'lyra_a01', to: 'lyra_h03', style: 'DASHED' },
      { from: 'lyra_h03', to: 'lyra_t02', style: 'DASHED' },
      { from: 'lyra_h03', to: 'lyra_a03', style: 'DASHED' },

      { from: 'lyra_p04', to: 'lyra_h04', style: 'DASHED' },
      { from: 'lyra_a04', to: 'lyra_h04', style: 'DASHED' },
      { from: 'lyra_h04', to: 'lyra_p06', style: 'DASHED' },
      { from: 'lyra_h04', to: 'lyra_a06', style: 'DASHED' },

      { from: 'lyra_t04', to: 'lyra_h05', style: 'DASHED' },
      { from: 'lyra_a05', to: 'lyra_h05', style: 'DASHED' },
      { from: 'lyra_h05', to: 'lyra_t06', style: 'DASHED' },
      { from: 'lyra_h05', to: 'lyra_a07', style: 'DASHED' },

      { from: 'lyra_p05', to: 'lyra_h06', style: 'DASHED' },
      { from: 'lyra_t05', to: 'lyra_h06', style: 'DASHED' },
      { from: 'lyra_h06', to: 'lyra_p07', style: 'DASHED' },
      { from: 'lyra_h06', to: 'lyra_t07', style: 'DASHED' },

      // Signature connections
      { from: 'lyra_p08', to: 'lyra_s01', style: 'ENERGY' },
      { from: 'lyra_t08', to: 'lyra_s01', style: 'ENERGY' },
      { from: 'lyra_h06', to: 'lyra_s01', style: 'ENERGY' },

      { from: 'lyra_a08', to: 'lyra_s02', style: 'ENERGY' },
      { from: 'lyra_h04', to: 'lyra_s02', style: 'ENERGY' },
      { from: 'lyra_h05', to: 'lyra_s02', style: 'ENERGY' }
    ]
  },

  [Archetype.MAGE]: {
    hunterId: Archetype.MAGE,
    hunterName: 'Kael',
    title: 'O Tecelão do Vazio',
    accentColor: '#b026ff',
    description: 'Conjurador primordial de dano mágico, alto AP, controle gravitacional, explosões de Nova Cósmica e manipulação espacial através de translocações dimensionais.',
    families: [
      {
        id: 'GRAVITY',
        name: 'Gravidade',
        subtitle: 'Controle, Puxão e Compressão',
        description: 'Manipulação de massas magnéticas, puxões de singularidade e controle espacial do campo de batalha.',
        icon: 'Orbit',
        color: '#9333ea',
        accentColor: '#c084fc',
        bgGlow: 'rgba(147, 51, 234, 0.25)'
      },
      {
        id: 'DESTRUCTION',
        name: 'Destruição',
        subtitle: 'Nova Cósmica e Dano em Área',
        description: 'Poder arcano bruto, amplificação de dano mágico (AP), reações e destruição devastadora de hordas.',
        icon: 'Flame',
        color: '#f43f5e',
        accentColor: '#fb7185',
        bgGlow: 'rgba(244, 63, 94, 0.25)'
      },
      {
        id: 'DISTORTION',
        name: 'Distorção',
        subtitle: 'Blink, Espaço e Ecos Dimensionais',
        description: 'Manipulação de translocações dimensionais, rupturas de espaço-tempo e ecos de conjuração.',
        icon: 'Sparkles',
        color: '#b026ff',
        accentColor: '#d946ef',
        bgGlow: 'rgba(176, 38, 255, 0.25)'
      }
    ],
    nodes: [
      // 1. CORE / ORIGIN NODE (K0)
      {
        id: 'kael_core',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'K0 — Pulso Nebular',
        description: 'Núcleo inicial da Rede do Tecelão do Vazio. Conecta-se às matrizes de Gravidade, Destruição e Distorção.',
        cost: 0,
        icon: 'Compass',
        nodeType: 'KEYSTONE',
        tier: 0,
        x: 0,
        y: 0,
        prerequisites: [],
        connections: ['kael_g01', 'kael_d01', 'kael_s01']
      },

      // 2. GRAVITY FAMILY (G01 - G08)
      {
        id: 'kael_g01',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G01 — Centro de Massa',
        description: 'Aumenta o raio de atração da Fenda Gravitacional [E] de 320 px para 370 px. O raio de dano permanece em 175 px.',
        cost: 1,
        icon: 'Orbit',
        nodeType: 'MINOR',
        tier: 1,
        x: -130,
        y: -100,
        prerequisites: ['kael_core'],
        connections: ['kael_g02', 'kael_g03', 'kael_h01', 'kael_h05']
      },
      {
        id: 'kael_g02',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G02 — Colapso Progressivo',
        description: 'Inimigos dentro da área de atração da Fenda recebem força de puxão progressivamente maior. Após 2s sob o efeito: +40% de força de puxão.',
        cost: 1,
        icon: 'Disc',
        nodeType: 'MINOR',
        tier: 2,
        x: -220,
        y: -160,
        prerequisites: ['kael_g01'],
        connections: ['kael_g04', 'kael_h01']
      },
      {
        id: 'kael_g03',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G03 — Peso do Vazio',
        description: 'Inimigos afetados pela atração gravitacional sofrem -25% de Velocidade de Movimento. O efeito permanece por 1,5s após saírem da área.',
        cost: 1,
        icon: 'Radio',
        nodeType: 'MINOR',
        tier: 2,
        x: -150,
        y: -230,
        prerequisites: ['kael_g01'],
        connections: ['kael_g04', 'kael_g05', 'kael_h05']
      },
      {
        id: 'kael_g04',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G04 — Compressão Arcana',
        description: 'Para cada inimigo dentro do raio de dano da Fenda Gravitacional, Kael recebe +3% de dano causado pela Fenda (máximo de 10 inimigos = +30%).',
        cost: 2,
        icon: 'Sparkles',
        nodeType: 'MAJOR',
        tier: 3,
        x: -270,
        y: -240,
        prerequisites: ['kael_g02', 'kael_g03'],
        connections: ['kael_g06', 'kael_h01', 'kael_h02']
      },
      {
        id: 'kael_g05',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G05 — Singularidade Instável',
        description: 'Quando a Fenda Gravitacional termina, ocorre uma explosão final (Raio: 220 px, Dano: 120% AP, +5% por inimigo dentro da Fenda no momento, máx +50%).',
        cost: 2,
        icon: 'Sun',
        nodeType: 'MAJOR',
        tier: 3,
        x: -190,
        y: -330,
        prerequisites: ['kael_g03'],
        connections: ['kael_g06', 'kael_g07', 'kael_h02']
      },
      {
        id: 'kael_g06',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G06 — Órbita Forçada',
        description: 'Inimigos próximos ao centro realizam movimento orbital antes do puxão. Inimigos nos 175 px internos recebem -20% de velocidade de saída da área.',
        cost: 2,
        icon: 'Orbit',
        nodeType: 'MAJOR',
        tier: 4,
        x: -320,
        y: -340,
        prerequisites: ['kael_g04', 'kael_g05'],
        connections: ['kael_g08', 'kael_h06']
      },
      {
        id: 'kael_g07',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G07 — Horizonte de Eventos',
        description: 'Ao permanecer 1,5s na área central da Fenda, o inimigo recebe COMPRIMIDO por 3s (+15% de dano das habilidades de Kael, recarga de 4s por alvo).',
        cost: 2,
        icon: 'Eye',
        nodeType: 'MAJOR',
        tier: 4,
        x: -220,
        y: -430,
        prerequisites: ['kael_g05'],
        connections: ['kael_g08', 'kael_h02']
      },
      {
        id: 'kael_g08',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'G08 — Poço Sem Fundo',
        description: 'Quando houver pelo menos 8 inimigos dentro do raio de atração da Fenda, o raio de dano aumenta de 175 px para 230 px.',
        cost: 2,
        icon: 'Hexagon',
        nodeType: 'MAJOR',
        tier: 5,
        x: -280,
        y: -510,
        prerequisites: ['kael_g06', 'kael_g07'],
        connections: ['kael_k01']
      },

      // 3. DESTRUCTION FAMILY (D01 - D08)
      {
        id: 'kael_d01',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D01 — Sobrecarga Arcana',
        description: 'Aumenta o dano de todas as habilidades mágicas de Kael em +10% (afeta Q, E e explosões criadas por talentos).',
        cost: 1,
        icon: 'Flame',
        nodeType: 'MINOR',
        tier: 1,
        x: 130,
        y: -100,
        prerequisites: ['kael_core'],
        connections: ['kael_d02', 'kael_d03', 'kael_h01', 'kael_h03']
      },
      {
        id: 'kael_d02',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D02 — Núcleo Instável',
        description: 'Quando a Nova Cósmica [Q] atinge pelo menos 3 inimigos, deixa uma zona instável durante 2 segundos (Raio: 90 px, Dano: 35% AP por segundo).',
        cost: 1,
        icon: 'Activity',
        nodeType: 'MINOR',
        tier: 2,
        x: 220,
        y: -160,
        prerequisites: ['kael_d01'],
        connections: ['kael_d04', 'kael_h03']
      },
      {
        id: 'kael_d03',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D03 — Explosão Expandida',
        description: 'Aumenta o raio de impacto da Nova Cósmica [Q] de 150 px para 180 px.',
        cost: 1,
        icon: 'Sun',
        nodeType: 'MINOR',
        tier: 2,
        x: 150,
        y: -230,
        prerequisites: ['kael_d01'],
        connections: ['kael_d04', 'kael_d05', 'kael_h01']
      },
      {
        id: 'kael_d04',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D04 — Ruptura',
        description: 'Inimigos atingidos pela Nova Cósmica explodem ao morrer durante os próximos 3 segundos (Dano: 80% AP, Raio: 100 px).',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 3,
        x: 270,
        y: -240,
        prerequisites: ['kael_d02', 'kael_d03'],
        connections: ['kael_d06', 'kael_h04']
      },
      {
        id: 'kael_d05',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D05 — Reação Nebular',
        description: 'Quando um inimigo for atingido pela Fenda Gravitacional e posteriormente pela Nova Cósmica, a Nova causa +35% de dano adicional naquele alvo.',
        cost: 2,
        icon: 'Crosshair',
        nodeType: 'MAJOR',
        tier: 3,
        x: 190,
        y: -330,
        prerequisites: ['kael_d03'],
        connections: ['kael_d06', 'kael_d07', 'kael_h02']
      },
      {
        id: 'kael_d06',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D06 — Fragmentos Cósmicos',
        description: 'Após a explosão da Nova Cósmica, 5 fragmentos arcanos teleguiados são disparados contra inimigos próximos (cada um causa 50% AP, 1 por alvo).',
        cost: 2,
        icon: 'Sparkles',
        nodeType: 'MAJOR',
        tier: 4,
        x: 320,
        y: -340,
        prerequisites: ['kael_d04', 'kael_d05'],
        connections: ['kael_d08', 'kael_h04']
      },
      {
        id: 'kael_d07',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D07 — Catástrofe Concentrada',
        description: 'Se a Nova Cósmica atingir 5 ou menos inimigos, ela causa +40% de dano amplificado naquele impacto.',
        cost: 2,
        icon: 'Target',
        nodeType: 'MAJOR',
        tier: 4,
        x: 220,
        y: -430,
        prerequisites: ['kael_d05'],
        connections: ['kael_d08', 'kael_h02']
      },
      {
        id: 'kael_d08',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'D08 — Supernova',
        description: 'Se a Nova Cósmica atingir pelo menos 8 inimigos, gera uma segunda explosão após 0,5 segundo (60% do raio, 70% do dano).',
        cost: 2,
        icon: 'Flame',
        nodeType: 'MAJOR',
        tier: 5,
        x: 280,
        y: -510,
        prerequisites: ['kael_d06', 'kael_d07'],
        connections: ['kael_k01']
      },

      // 4. DISTORTION FAMILY (S01 - S08)
      {
        id: 'kael_s01',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S01 — Alcance Dimensional',
        description: 'Aumenta a distância de translocação do Blink [ESPAÇO] de 300 px para 360 px.',
        cost: 1,
        icon: 'Wind',
        nodeType: 'MINOR',
        tier: 1,
        x: 0,
        y: 130,
        prerequisites: ['kael_core'],
        connections: ['kael_s02', 'kael_s03', 'kael_h03', 'kael_h05']
      },
      {
        id: 'kael_s02',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S02 — Passo Ressonante',
        description: 'Após utilizar Blink, Kael recebe +15% de Velocidade de Movimento durante 2 segundos.',
        cost: 1,
        icon: 'Wind',
        nodeType: 'MINOR',
        tier: 2,
        x: -120,
        y: 210,
        prerequisites: ['kael_s01'],
        connections: ['kael_s04', 'kael_h05']
      },
      {
        id: 'kael_s03',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S03 — Fenda Residual',
        description: 'Após utilizar Blink, permanece uma Fenda Residual no ponto de origem por 2,5s (Raio: 80 px, Dano: 30% AP por segundo).',
        cost: 1,
        icon: 'Sparkles',
        nodeType: 'MINOR',
        tier: 2,
        x: 120,
        y: 210,
        prerequisites: ['kael_s01'],
        connections: ['kael_s05', 'kael_h03']
      },
      {
        id: 'kael_s04',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S04 — Ponto de Retorno',
        description: 'Após utilizar Blink, Kael possui uma janela de 1,2 segundo para ativar novamente o Blink e retornar instantaneamente ao ponto inicial.',
        cost: 2,
        icon: 'Compass',
        nodeType: 'MAJOR',
        tier: 3,
        x: -160,
        y: 310,
        prerequisites: ['kael_s02'],
        connections: ['kael_s06', 'kael_h06']
      },
      {
        id: 'kael_s05',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S05 — Teleporte Agressivo',
        description: 'Ao chegar ao destino do Blink, cria uma explosão dimensional (Raio: 120 px, Dano: 100% AP) que empurra inimigos atingidos levemente.',
        cost: 2,
        icon: 'ShieldAlert',
        nodeType: 'MAJOR',
        tier: 3,
        x: 160,
        y: 310,
        prerequisites: ['kael_s03'],
        connections: ['kael_s07', 'kael_h04']
      },
      {
        id: 'kael_s06',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S06 — Dobra Temporal',
        description: 'Se Kael utilizar Blink dentro de 2 segundos após lançar uma habilidade, reduz o tempo de recarga restante dessa habilidade em 15%.',
        cost: 2,
        icon: 'Lock',
        nodeType: 'MAJOR',
        tier: 4,
        x: -110,
        y: 410,
        prerequisites: ['kael_s04'],
        connections: ['kael_s08', 'kael_h06']
      },
      {
        id: 'kael_s07',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S07 — Eco de Conjuração',
        description: 'Após utilizar Blink, a próxima habilidade usada em até 2s cria um Eco (Q: Nova secundária após 0,75s com 45% AP; E: Fenda com +20% raio de atração. Cooldown: 4s).',
        cost: 2,
        icon: 'Radio',
        nodeType: 'MAJOR',
        tier: 4,
        x: 110,
        y: 410,
        prerequisites: ['kael_s05'],
        connections: ['kael_s08', 'kael_h04']
      },
      {
        id: 'kael_s08',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'S08 — Fratura Espacial',
        description: 'Ao utilizar Blink, Kael deixa uma Fratura dimensional entre o ponto inicial e o destino por 2 segundos. Inimigos que cruzarem recebem 70% AP.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'MAJOR',
        tier: 5,
        x: 0,
        y: 490,
        prerequisites: ['kael_s06', 'kael_s07'],
        connections: ['kael_k02']
      },

      // 5. HYBRID BRIDGES (H01 - H06)
      {
        id: 'kael_h01',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'H01 — Detonação de Massa',
        description: '[Ponte Gravidade + Destruição] A Nova Cósmica recebe +5% de dano para cada inimigo que estiver dentro da área de atração da Fenda no momento da explosão (Máx +50%).',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 2,
        x: 0,
        y: -170,
        prerequisites: ['kael_g01', 'kael_d01'],
        connections: ['kael_g04', 'kael_d03']
      },
      {
        id: 'kael_h02',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'H02 — Implosão Cósmica',
        description: '[Ponte Gravidade + Destruição] Inimigos com a condição Comprimido sofrem uma explosão adicional quando a Fenda Gravitacional termina (Dano: 100% AP, Raio: 120 px).',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 4,
        x: 0,
        y: -390,
        prerequisites: ['kael_g05', 'kael_d05'],
        connections: ['kael_g07', 'kael_d07', 'kael_k01']
      },
      {
        id: 'kael_h03',
        hunterId: Archetype.MAGE,
        familyId: 'DESTRUCTION',
        name: 'H03 — Explosão Deslocada',
        description: '[Ponte Destruição + Distorção] Após utilizar Blink, a próxima Nova Cósmica lançada em 2s possui +20% de raio e explode 0,3s mais rápido.',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 2,
        x: 210,
        y: 80,
        prerequisites: ['kael_d01', 'kael_s01'],
        connections: ['kael_d02', 'kael_s03']
      },
      {
        id: 'kael_h04',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'H04 — Portal de Ruína',
        description: '[Ponte Destruição + Distorção] Quando uma Nova Cósmica mata um inimigo: 35% de chance de criar uma ruptura dimensional por 3s (Dano: 50% AP em área, máx 3 simultâneos).',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 4,
        x: 300,
        y: 220,
        prerequisites: ['kael_d04', 'kael_s05'],
        connections: ['kael_d06', 'kael_s07', 'kael_k02']
      },
      {
        id: 'kael_h05',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'H05 — Puxão Transdimensional',
        description: '[Ponte Gravidade + Distorção] Após utilizar Blink, inimigos em até 200 px do ponto de chegada são puxados para ele durante 0,75s (ferramenta de controle e preparação).',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 2,
        x: -210,
        y: 80,
        prerequisites: ['kael_g01', 'kael_s01'],
        connections: ['kael_g03', 'kael_s02']
      },
      {
        id: 'kael_h06',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'H06 — Singularidade Errante',
        description: '[Ponte Gravidade + Distorção] Enquanto a Fenda Gravitacional estiver ativa, utilizar Blink teleporta a Fenda diretamente para o ponto de chegada de Kael (1 vez por conjuração).',
        cost: 2,
        icon: 'GitMerge',
        nodeType: 'HYBRID',
        tier: 4,
        x: -300,
        y: 220,
        prerequisites: ['kael_g06', 'kael_s04'],
        connections: ['kael_g06', 'kael_s06', 'kael_k02']
      },

      // 6. SIGNATURE KEYSTONES (K01, K02)
      {
        id: 'kael_k01',
        hunterId: Archetype.MAGE,
        familyId: 'GRAVITY',
        name: 'K01 — Maestro da Singularidade',
        description: '[Assinatura Suprema: Gravidade & Destruição] Ao usar Fenda Gravitacional [E] e Blink durante ela, a Fenda se move para o destino; por 1s após a chegada, ganha +30% força de puxão e aplica Comprimido imediatamente. Lançar Q dentro da Fenda causa +40% de dano.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 6,
        x: 0,
        y: -580,
        prerequisites: ['kael_g08', 'kael_d08'],
        connections: ['kael_g08', 'kael_d08', 'kael_h02']
      },
      {
        id: 'kael_k02',
        hunterId: Archetype.MAGE,
        familyId: 'DISTORTION',
        name: 'K02 — Colapso Nebular',
        description: '[Assinatura Suprema: Tríade Cósmica] Quando um inimigo na Fenda é atingido pela Nova Cósmica e Kael usou Blink nos últimos 3s, o alvo sofre Colapso Nebular: detona após 0,75s causando 150% AP em raio de 140 px.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 6,
        x: 0,
        y: 600,
        prerequisites: ['kael_s08'],
        connections: ['kael_s08', 'kael_h04', 'kael_h06']
      }
    ],
    connections: [
      // Central core connections
      { from: 'kael_core', to: 'kael_g01', style: 'ENERGY' },
      { from: 'kael_core', to: 'kael_d01', style: 'ENERGY' },
      { from: 'kael_core', to: 'kael_s01', style: 'ENERGY' },

      // Gravity branch
      { from: 'kael_g01', to: 'kael_g02', style: 'SOLID' },
      { from: 'kael_g01', to: 'kael_g03', style: 'SOLID' },
      { from: 'kael_g02', to: 'kael_g04', style: 'SOLID' },
      { from: 'kael_g03', to: 'kael_g04', style: 'SOLID' },
      { from: 'kael_g03', to: 'kael_g05', style: 'SOLID' },
      { from: 'kael_g04', to: 'kael_g06', style: 'SOLID' },
      { from: 'kael_g05', to: 'kael_g06', style: 'SOLID' },
      { from: 'kael_g05', to: 'kael_g07', style: 'SOLID' },
      { from: 'kael_g06', to: 'kael_g08', style: 'SOLID' },
      { from: 'kael_g07', to: 'kael_g08', style: 'SOLID' },

      // Destruction branch
      { from: 'kael_d01', to: 'kael_d02', style: 'SOLID' },
      { from: 'kael_d01', to: 'kael_d03', style: 'SOLID' },
      { from: 'kael_d02', to: 'kael_d04', style: 'SOLID' },
      { from: 'kael_d03', to: 'kael_d04', style: 'SOLID' },
      { from: 'kael_d03', to: 'kael_d05', style: 'SOLID' },
      { from: 'kael_d04', to: 'kael_d06', style: 'SOLID' },
      { from: 'kael_d05', to: 'kael_d06', style: 'SOLID' },
      { from: 'kael_d05', to: 'kael_d07', style: 'SOLID' },
      { from: 'kael_d06', to: 'kael_d08', style: 'SOLID' },
      { from: 'kael_d07', to: 'kael_d08', style: 'SOLID' },

      // Distortion branch
      { from: 'kael_s01', to: 'kael_s02', style: 'SOLID' },
      { from: 'kael_s01', to: 'kael_s03', style: 'SOLID' },
      { from: 'kael_s02', to: 'kael_s04', style: 'SOLID' },
      { from: 'kael_s03', to: 'kael_s05', style: 'SOLID' },
      { from: 'kael_s04', to: 'kael_s06', style: 'SOLID' },
      { from: 'kael_s05', to: 'kael_s07', style: 'SOLID' },
      { from: 'kael_s06', to: 'kael_s08', style: 'SOLID' },
      { from: 'kael_s07', to: 'kael_s08', style: 'SOLID' },

      // Hybrid Bridges
      { from: 'kael_g01', to: 'kael_h01', style: 'DASHED' },
      { from: 'kael_d01', to: 'kael_h01', style: 'DASHED' },
      { from: 'kael_h01', to: 'kael_g04', style: 'DASHED' },
      { from: 'kael_h01', to: 'kael_d03', style: 'DASHED' },

      { from: 'kael_g05', to: 'kael_h02', style: 'DASHED' },
      { from: 'kael_d05', to: 'kael_h02', style: 'DASHED' },
      { from: 'kael_h02', to: 'kael_g07', style: 'DASHED' },
      { from: 'kael_h02', to: 'kael_d07', style: 'DASHED' },

      { from: 'kael_d01', to: 'kael_h03', style: 'DASHED' },
      { from: 'kael_s01', to: 'kael_h03', style: 'DASHED' },
      { from: 'kael_h03', to: 'kael_d02', style: 'DASHED' },
      { from: 'kael_h03', to: 'kael_s03', style: 'DASHED' },

      { from: 'kael_d04', to: 'kael_h04', style: 'DASHED' },
      { from: 'kael_s05', to: 'kael_h04', style: 'DASHED' },
      { from: 'kael_h04', to: 'kael_d06', style: 'DASHED' },
      { from: 'kael_h04', to: 'kael_s07', style: 'DASHED' },

      { from: 'kael_g01', to: 'kael_h05', style: 'DASHED' },
      { from: 'kael_s01', to: 'kael_h05', style: 'DASHED' },
      { from: 'kael_h05', to: 'kael_g03', style: 'DASHED' },
      { from: 'kael_h05', to: 'kael_s02', style: 'DASHED' },

      { from: 'kael_g06', to: 'kael_h06', style: 'DASHED' },
      { from: 'kael_s04', to: 'kael_h06', style: 'DASHED' },
      { from: 'kael_h06', to: 'kael_s06', style: 'DASHED' },

      // Signature Keystone Connections
      { from: 'kael_g08', to: 'kael_k01', style: 'ENERGY' },
      { from: 'kael_d08', to: 'kael_k01', style: 'ENERGY' },
      { from: 'kael_h02', to: 'kael_k01', style: 'ENERGY' },

      { from: 'kael_s08', to: 'kael_k02', style: 'ENERGY' },
      { from: 'kael_h04', to: 'kael_k02', style: 'ENERGY' },
      { from: 'kael_h06', to: 'kael_k02', style: 'ENERGY' }
    ]
  },
  [Archetype.VORGAR]: {
    hunterId: Archetype.VORGAR,
    hunterName: 'Vorgar',
    title: 'O Colosso da Ruína',
    accentColor: '#10b981',
    description: 'Tanque titânico de combate corpo a corpo. Devasta hordas com o Martelo Cataclísmico, prende com a Garra da Ruína e se recusa a cair com armadura ancestral.',
    families: [
      {
        id: 'DEVASTATION',
        name: 'Devastação',
        subtitle: 'Impacto Sísmico, Dano Brutal e Esmagamento',
        description: 'Amplifica o poder do Martelo Cataclísmico (Q), adicionando estilhaços de rocha, dano contra alvos isolados e golpes demolidores.',
        icon: 'Flame',
        color: '#ef4444',
        accentColor: '#f87171',
        bgGlow: 'rgba(239, 68, 68, 0.25)'
      },
      {
        id: 'DOMINION',
        name: 'Domínio',
        subtitle: 'Controle de Grupo, Correntes e Atordoamento',
        description: 'Aprimora a Garra da Ruína (E), aumentando o alcance do puxão, a duração do atordoamento e criando escudos espectrais ao capturar múltiplos alvos.',
        icon: 'Orbit',
        color: '#10b981',
        accentColor: '#34d399',
        bgGlow: 'rgba(16, 185, 129, 0.25)'
      },
      {
        id: 'FORTRESS',
        name: 'Fortificação',
        subtitle: 'Carapaça Ancestral, Regeneração e Resiliência',
        description: 'Torna Vorgar uma muralha impenetrável com armadura passiva por proximidade de monstros, roubo de vida físico e sobrevivência a golpes fatais.',
        icon: 'Shield',
        color: '#f59e0b',
        accentColor: '#fbbf24',
        bgGlow: 'rgba(245, 158, 11, 0.25)'
      }
    ],
    nodes: [
      {
        id: 'vorgar_core',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Coração de Ferro Ancestral',
        description: 'O despertar do Colosso. Concede +30 Vida Máxima, +5 Ataque Físico e conecta-se às matrizes de Devastação, Domínio e Fortificação.',
        cost: 0,
        icon: 'Compass',
        nodeType: 'KEYSTONE',
        tier: 0,
        x: 0,
        y: 0,
        connections: ['vorgar_d01', 'vorgar_m01', 'vorgar_f01'],
        prerequisites: []
      },
      // Devastação Branch (Left)
      {
        id: 'vorgar_d01',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Peso do Titã',
        description: '+6 Ataque Físico e +20 Vida Máxima.',
        cost: 1,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 1,
        x: -120,
        y: -40,
        connections: ['vorgar_d02', 'vorgar_d03'],
        prerequisites: ['vorgar_core']
      },
      {
        id: 'vorgar_d02',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Onda Sísmica',
        description: 'O Martelo Cataclísmico (Q) gera estilhaços de rocha, aumentando a área do impacto em +25%.',
        cost: 1,
        icon: 'Flame',
        nodeType: 'MAJOR',
        tier: 2,
        x: -200,
        y: -80,
        connections: ['vorgar_d04'],
        prerequisites: ['vorgar_d01']
      },
      {
        id: 'vorgar_d03',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Golpe Carrasco',
        description: 'Aumenta o dano do Martelo Cataclísmico (Q) em +30% contra alvos com menos de 50% de vida.',
        cost: 1,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 2,
        x: -140,
        y: -120,
        connections: ['vorgar_d04', 'vorgar_d05'],
        prerequisites: ['vorgar_d01']
      },
      {
        id: 'vorgar_d04',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Impacto Fraturante',
        description: '+8% Chance de Acerto Crítico e +30% Dano Crítico.',
        cost: 2,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 3,
        x: -220,
        y: -160,
        connections: ['vorgar_d06'],
        prerequisites: ['vorgar_d02', 'vorgar_d03']
      },
      {
        id: 'vorgar_d05',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Devastação Concentrada',
        description: 'O bônus de dano contra alvos isolados no Martelo Cataclísmico (Q) aumenta de +50% para +80%.',
        cost: 2,
        icon: 'Flame',
        nodeType: 'MAJOR',
        tier: 3,
        x: -140,
        y: -200,
        connections: ['vorgar_d06', 'vorgar_d07'],
        prerequisites: ['vorgar_d03']
      },
      {
        id: 'vorgar_d06',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Esmagador Implacável',
        description: '+12 Ataque Físico e +40 Vida Máxima.',
        cost: 2,
        icon: 'Target',
        nodeType: 'MINOR',
        tier: 4,
        x: -200,
        y: -260,
        connections: ['vorgar_d08'],
        prerequisites: ['vorgar_d04', 'vorgar_d05']
      },
      {
        id: 'vorgar_d07',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Eco Telúrico',
        description: 'Acertos críticos com a maça e com o Q reduzem o tempo de recarga de todas as habilidades em 0.8s.',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 4,
        x: -120,
        y: -280,
        connections: ['vorgar_d08'],
        prerequisites: ['vorgar_d05']
      },
      {
        id: 'vorgar_d08',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Martelo da Aniquilação',
        description: '+15 Ataque Físico e o alcance da varredura de ataque básico corpo a corpo aumenta em +25px.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: -160,
        y: -360,
        connections: ['vorgar_k01'],
        prerequisites: ['vorgar_d06', 'vorgar_d07']
      },

      // Domínio Branch (Center-Right)
      {
        id: 'vorgar_m01',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Correntes de Ferro',
        description: 'A Garra da Ruína (E) tem seu alcance aumentado em +30% e puxa alvos mais rapidamente.',
        cost: 1,
        icon: 'Orbit',
        nodeType: 'MINOR',
        tier: 1,
        x: 120,
        y: -40,
        connections: ['vorgar_m02', 'vorgar_m03'],
        prerequisites: ['vorgar_core']
      },
      {
        id: 'vorgar_m02',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Prisão Espectral',
        description: 'Inimigos puxados pela Garra da Ruína (E) ficam atordoados por mais 0.6s adicional.',
        cost: 1,
        icon: 'Lock',
        nodeType: 'MAJOR',
        tier: 2,
        x: 140,
        y: -120,
        connections: ['vorgar_m04', 'vorgar_m05'],
        prerequisites: ['vorgar_m01']
      },
      {
        id: 'vorgar_m03',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Arrasto Concussivo',
        description: 'A Garra da Ruína causa +35% de dano e aplica lentidão persistente de 50% após o atordoamento.',
        cost: 1,
        icon: 'Orbit',
        nodeType: 'MAJOR',
        tier: 2,
        x: 200,
        y: -80,
        connections: ['vorgar_m04'],
        prerequisites: ['vorgar_m01']
      },
      {
        id: 'vorgar_m04',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Vórtice Protetor',
        description: 'Puxar 2 ou mais inimigos com a Garra da Ruína concede um escudo temporário de absorção por 3s.',
        cost: 2,
        icon: 'Shield',
        nodeType: 'MAJOR',
        tier: 3,
        x: 180,
        y: -180,
        connections: ['vorgar_m06'],
        prerequisites: ['vorgar_m02', 'vorgar_m03']
      },
      {
        id: 'vorgar_m05',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Magnetismo Ruinoso',
        description: 'Reduz o tempo de recarga da Garra da Ruína (E) em 2.0 segundos.',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MINOR',
        tier: 3,
        x: 120,
        y: -220,
        connections: ['vorgar_m06', 'vorgar_m07'],
        prerequisites: ['vorgar_m02']
      },
      {
        id: 'vorgar_m06',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Presença Opressora',
        description: 'Inimigos a até 180px de Vorgar causam 15% a menos de dano e têm -20% de velocidade de movimento.',
        cost: 2,
        icon: 'ShieldAlert',
        nodeType: 'MAJOR',
        tier: 4,
        x: 160,
        y: -270,
        connections: ['vorgar_m08'],
        prerequisites: ['vorgar_m04', 'vorgar_m05']
      },
      {
        id: 'vorgar_m07',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Frio da Tumba',
        description: '+6 Armadura, +6 Resistência Mágica e +30 Vida Máxima.',
        cost: 2,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 4,
        x: 90,
        y: -290,
        connections: ['vorgar_m08'],
        prerequisites: ['vorgar_m05']
      },
      {
        id: 'vorgar_m08',
        hunterId: Archetype.VORGAR,
        familyId: 'DOMINION',
        name: 'Reino da Ruína',
        description: 'A Garra da Ruína atinge uma área mais ampla e atordoa chefes temporariamente acelerando seu Stagger.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: 130,
        y: -360,
        connections: ['vorgar_k01'],
        prerequisites: ['vorgar_m06', 'vorgar_m07']
      },

      // Fortificação Branch (Bottom/Center)
      {
        id: 'vorgar_f01',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Carapaça de Ferro',
        description: '+8 Armadura e +8 Resistência Mágica passivas.',
        cost: 1,
        icon: 'Shield',
        nodeType: 'MINOR',
        tier: 1,
        x: 0,
        y: 110,
        connections: ['vorgar_f02', 'vorgar_f03'],
        prerequisites: ['vorgar_core']
      },
      {
        id: 'vorgar_f02',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Sangue da Forja',
        description: 'Abater inimigos com ataques corpo a corpo restaura 4% da Vida Máxima.',
        cost: 1,
        icon: 'Activity',
        nodeType: 'MAJOR',
        tier: 2,
        x: -70,
        y: 180,
        connections: ['vorgar_f04'],
        prerequisites: ['vorgar_f01']
      },
      {
        id: 'vorgar_f03',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Bastião Inabalável',
        description: 'Ganha +2 de Armadura adicional para cada monstro próximo a até 200px (acumula até 10 vezes).',
        cost: 1,
        icon: 'ShieldAlert',
        nodeType: 'MAJOR',
        tier: 2,
        x: 70,
        y: 180,
        connections: ['vorgar_f04', 'vorgar_f05'],
        prerequisites: ['vorgar_f01']
      },
      {
        id: 'vorgar_f04',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Pele de Aço Rúnico',
        description: '+40 Vida Máxima e +2 Regeneração de Vida por segundo.',
        cost: 2,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 3,
        x: 0,
        y: 250,
        connections: ['vorgar_f06'],
        prerequisites: ['vorgar_f02', 'vorgar_f03']
      },
      {
        id: 'vorgar_f05',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Investida Destruidora',
        description: 'A Investida Inexorável (Espaço) ganha +1 carga extra e causa dano de atropelamento a inimigos atravessados.',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 3,
        x: 100,
        y: 260,
        connections: ['vorgar_f06'],
        prerequisites: ['vorgar_f03']
      },
      {
        id: 'vorgar_f06',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Colosso Imortal',
        description: 'Ao receber dano que seria fatal, Vorgar se torna imune a dano por 2.5 segundos (Recarga de 90s na torre).',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 4,
        x: 0,
        y: 350,
        connections: ['vorgar_k02'],
        prerequisites: ['vorgar_f04', 'vorgar_f05']
      },

      // Supreme Apex Keystones
      {
        id: 'vorgar_k01',
        hunterId: Archetype.VORGAR,
        familyId: 'DEVASTATION',
        name: 'Avatar da Ruína Eterna',
        description: 'O combo supremo: usar a Garra da Ruína (E) reativa instantaneamente o Martelo Cataclísmico (Q), concedendo +40% de dano no próximo golpe.',
        cost: 3,
        icon: 'Sparkles',
        nodeType: 'KEYSTONE',
        tier: 6,
        x: 0,
        y: -440,
        connections: [],
        prerequisites: ['vorgar_d08', 'vorgar_m08']
      },
      {
        id: 'vorgar_k02',
        hunterId: Archetype.VORGAR,
        familyId: 'FORTRESS',
        name: 'Fortaleza Invicta',
        description: 'Concede +120 Vida Máxima, +20 Armadura, +20 MR e +6% Omnivamp permanente.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: 0,
        y: 430,
        connections: [],
        prerequisites: ['vorgar_f06']
      }
    ],
    connections: [
      { from: 'vorgar_core', to: 'vorgar_d01', style: 'SOLID' },
      { from: 'vorgar_core', to: 'vorgar_m01', style: 'SOLID' },
      { from: 'vorgar_core', to: 'vorgar_f01', style: 'SOLID' },

      { from: 'vorgar_d01', to: 'vorgar_d02', style: 'SOLID' },
      { from: 'vorgar_d01', to: 'vorgar_d03', style: 'SOLID' },
      { from: 'vorgar_d02', to: 'vorgar_d04', style: 'SOLID' },
      { from: 'vorgar_d03', to: 'vorgar_d04', style: 'SOLID' },
      { from: 'vorgar_d03', to: 'vorgar_d05', style: 'SOLID' },
      { from: 'vorgar_d04', to: 'vorgar_d06', style: 'SOLID' },
      { from: 'vorgar_d05', to: 'vorgar_d06', style: 'SOLID' },
      { from: 'vorgar_d05', to: 'vorgar_d07', style: 'SOLID' },
      { from: 'vorgar_d06', to: 'vorgar_d08', style: 'SOLID' },
      { from: 'vorgar_d07', to: 'vorgar_d08', style: 'SOLID' },

      { from: 'vorgar_m01', to: 'vorgar_m02', style: 'SOLID' },
      { from: 'vorgar_m01', to: 'vorgar_m03', style: 'SOLID' },
      { from: 'vorgar_m02', to: 'vorgar_m04', style: 'SOLID' },
      { from: 'vorgar_m02', to: 'vorgar_m05', style: 'SOLID' },
      { from: 'vorgar_m03', to: 'vorgar_m04', style: 'SOLID' },
      { from: 'vorgar_m04', to: 'vorgar_m06', style: 'SOLID' },
      { from: 'vorgar_m05', to: 'vorgar_m06', style: 'SOLID' },
      { from: 'vorgar_m05', to: 'vorgar_m07', style: 'SOLID' },
      { from: 'vorgar_m06', to: 'vorgar_m08', style: 'SOLID' },
      { from: 'vorgar_m07', to: 'vorgar_m08', style: 'SOLID' },

      { from: 'vorgar_f01', to: 'vorgar_f02', style: 'SOLID' },
      { from: 'vorgar_f01', to: 'vorgar_f03', style: 'SOLID' },
      { from: 'vorgar_f02', to: 'vorgar_f04', style: 'SOLID' },
      { from: 'vorgar_f03', to: 'vorgar_f04', style: 'SOLID' },
      { from: 'vorgar_f03', to: 'vorgar_f05', style: 'SOLID' },
      { from: 'vorgar_f04', to: 'vorgar_f06', style: 'SOLID' },
      { from: 'vorgar_f05', to: 'vorgar_f06', style: 'SOLID' },

      { from: 'vorgar_d08', to: 'vorgar_k01', style: 'ENERGY' },
      { from: 'vorgar_m08', to: 'vorgar_k01', style: 'ENERGY' },
      { from: 'vorgar_f06', to: 'vorgar_k02', style: 'ENERGY' }
    ]
  },
  [Archetype.SUMMONER]: {
    hunterId: Archetype.SUMMONER,
    hunterName: 'Malakar',
    title: 'O Pastor das Almas',
    accentColor: '#a855f7',
    description: 'Comandante de espíritos autônomos. Controla o Guardião de Ferro e o Predador Espectral, sobrevivendo com a Ruptura Dimensional de emergência.',
    families: [
      {
        id: 'LEGION',
        name: 'Legião',
        subtitle: 'Poder, Resistência e Retorno dos Espíritos',
        description: 'Amplifica a vida máxima, armadura e dano do Guardião e do Predador, além de reduzir substancialmente o tempo de recarga após suas mortes.',
        icon: 'Orbit',
        color: '#a855f7',
        accentColor: '#c084fc',
        bgGlow: 'rgba(168, 85, 247, 0.25)'
      },
      {
        id: 'DOMINION',
        name: 'Domínio',
        subtitle: 'Tática, Interceptação e Provocação',
        description: 'Melhora a inteligência e o alcance dos espíritos, concede bônus de proteção ao Caçador e permite que o Predador execute alvos com salto crítico.',
        icon: 'Compass',
        color: '#06b6d4',
        accentColor: '#22d3ee',
        bgGlow: 'rgba(6, 182, 212, 0.25)'
      },
      {
        id: 'ARCANE',
        name: 'Arcano',
        subtitle: 'Magia de Emergência, Sobrevivência e Fúria Solitária',
        description: 'Potencializa a Ruptura Dimensional (E) com raio ampliado e dano devastador, além de conceder bônus de velocidade e ataque quando os espíritos caem.',
        icon: 'Flame',
        color: '#f43f5e',
        accentColor: '#fb7185',
        bgGlow: 'rgba(244, 63, 94, 0.25)'
      }
    ],
    nodes: [
      {
        id: 'malakar_core',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Círculo das Almas',
        description: 'O elo primordial com os espíritos. Concede +25 Vida Máxima, +5 Poder de Habilidade e conecta-se às matrizes de Legião, Domínio e Arcano.',
        cost: 0,
        icon: 'Compass',
        nodeType: 'KEYSTONE',
        tier: 0,
        x: 0,
        y: 0,
        connections: ['malakar_l01', 'malakar_d01', 'malakar_a01'],
        prerequisites: []
      },
      // Legião Branch (Left)
      {
        id: 'malakar_l01',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Vínculo Vital',
        description: '+60 Vida Máxima para o Guardião e o Predador (+15 para Malakar).',
        cost: 1,
        icon: 'Activity',
        nodeType: 'MINOR',
        tier: 1,
        x: -120,
        y: -40,
        connections: ['malakar_l02', 'malakar_l03'],
        prerequisites: ['malakar_core']
      },
      {
        id: 'malakar_l02',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Garras Espectrais',
        description: '+25% Dano nos ataques do Predador e do Guardião.',
        cost: 1,
        icon: 'Crosshair',
        nodeType: 'MAJOR',
        tier: 2,
        x: -200,
        y: -80,
        connections: ['malakar_l04'],
        prerequisites: ['malakar_l01']
      },
      {
        id: 'malakar_l03',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Ressurgimento Rápido',
        description: 'Reduz o tempo de recarga de renascimento dos espíritos após a morte em 2.5s.',
        cost: 1,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 2,
        x: -140,
        y: -120,
        connections: ['malakar_l04', 'malakar_l05'],
        prerequisites: ['malakar_l01']
      },
      {
        id: 'malakar_l04',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Carapaça Espiritual',
        description: '+12 Armadura e +12 MR para os espíritos invocados.',
        cost: 2,
        icon: 'Shield',
        nodeType: 'MINOR',
        tier: 3,
        x: -220,
        y: -160,
        connections: ['malakar_l06'],
        prerequisites: ['malakar_l02', 'malakar_l03']
      },
      {
        id: 'malakar_l05',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Fagulha Restauradora',
        description: 'A habilidade Elo Espiritual (Q) cura +20% a mais e limpa lentidões dos espíritos.',
        cost: 2,
        icon: 'Activity',
        nodeType: 'MAJOR',
        tier: 3,
        x: -140,
        y: -200,
        connections: ['malakar_l06', 'malakar_l07'],
        prerequisites: ['malakar_l03']
      },
      {
        id: 'malakar_l06',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Pacto de Sangue Astral',
        description: 'Os espíritos transferem 5% do dano causado diretamente como cura para Malakar.',
        cost: 2,
        icon: 'Target',
        nodeType: 'MINOR',
        tier: 4,
        x: -200,
        y: -260,
        connections: ['malakar_l08'],
        prerequisites: ['malakar_l04', 'malakar_l05']
      },
      {
        id: 'malakar_l07',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Fúria Espectral',
        description: 'Quando um espírito morre, o outro ganha +40% de velocidade de ataque e dano por 6s.',
        cost: 2,
        icon: 'Flame',
        nodeType: 'MAJOR',
        tier: 4,
        x: -120,
        y: -280,
        connections: ['malakar_l08'],
        prerequisites: ['malakar_l05']
      },
      {
        id: 'malakar_l08',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Comandante da Horda Imortal',
        description: '+100 Vida Máxima para os espíritos e o tempo de retorno após a morte é reduzido para 5.0s.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: -160,
        y: -360,
        connections: ['malakar_k01'],
        prerequisites: ['malakar_l06', 'malakar_l07']
      },

      // Domínio Branch (Center-Right)
      {
        id: 'malakar_d01',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Sentidos Aguçados',
        description: 'O Predador detecta inimigos com pouca vida a 400px e corre 25% mais rápido.',
        cost: 1,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 1,
        x: 120,
        y: -40,
        connections: ['malakar_d02', 'malakar_d03'],
        prerequisites: ['malakar_core']
      },
      {
        id: 'malakar_d02',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Provocação Protetora',
        description: 'O Guardião atrai monstros normais próximos, forçando-os a focar seus ataques nele.',
        cost: 1,
        icon: 'ShieldAlert',
        nodeType: 'MAJOR',
        tier: 2,
        x: 140,
        y: -120,
        connections: ['malakar_d04', 'malakar_d05'],
        prerequisites: ['malakar_d01']
      },
      {
        id: 'malakar_d03',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Bote Predatório',
        description: 'O primeiro ataque do Predador contra um novo alvo causa +60% de dano crítico com mini-atordoamento.',
        cost: 1,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 2,
        x: 200,
        y: -80,
        connections: ['malakar_d04'],
        prerequisites: ['malakar_d01']
      },
      {
        id: 'malakar_d04',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Aura Protetora',
        description: 'Estar a até 150px do Guardião concede a Malakar +10 de Armadura e +10 de MR.',
        cost: 2,
        icon: 'Shield',
        nodeType: 'MAJOR',
        tier: 3,
        x: 180,
        y: -180,
        connections: ['malakar_d06'],
        prerequisites: ['malakar_d02', 'malakar_d03']
      },
      {
        id: 'malakar_d05',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Passo Espectral',
        description: 'Ao usar a Esquiva (Espaço), os espíritos são puxados instantaneamente para o destino.',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MINOR',
        tier: 3,
        x: 120,
        y: -220,
        connections: ['malakar_d06', 'malakar_d07'],
        prerequisites: ['malakar_d02']
      },
      {
        id: 'malakar_d06',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Marca da Presa',
        description: 'Inimigos atacados pelo Predador sofrem 20% a mais de dano de todas as fontes por 4s.',
        cost: 2,
        icon: 'Target',
        nodeType: 'MAJOR',
        tier: 4,
        x: 160,
        y: -270,
        connections: ['malakar_d08'],
        prerequisites: ['malakar_d04', 'malakar_d05']
      },
      {
        id: 'malakar_d07',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Vigilância Rúnica',
        description: '+8% Velocidade de Movimento para Malakar e seus espíritos.',
        cost: 2,
        icon: 'Crosshair',
        nodeType: 'MINOR',
        tier: 4,
        x: 90,
        y: -290,
        connections: ['malakar_d08'],
        prerequisites: ['malakar_d05']
      },
      {
        id: 'malakar_d08',
        hunterId: Archetype.SUMMONER,
        familyId: 'DOMINION',
        name: 'Mestre da Coesão Astral',
        description: 'O Guardião e o Predador ganham ataques em área aprimorados e maior tenacidade contra controle.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: 130,
        y: -360,
        connections: ['malakar_k01'],
        prerequisites: ['malakar_d06', 'malakar_d07']
      },

      // Arcano Branch (Bottom/Center)
      {
        id: 'malakar_a01',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Poder Arcano Latente',
        description: '+8 Poder de Habilidade e +25 Vida Máxima para Malakar.',
        cost: 1,
        icon: 'Flame',
        nodeType: 'MINOR',
        tier: 1,
        x: 0,
        y: 110,
        connections: ['malakar_a02', 'malakar_a03'],
        prerequisites: ['malakar_core']
      },
      {
        id: 'malakar_a02',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Eco da Ruptura',
        description: 'Aumenta o raio da Ruptura Dimensional (E) em +30% e empurra inimigos para mais longe.',
        cost: 1,
        icon: 'Flame',
        nodeType: 'MAJOR',
        tier: 2,
        x: -70,
        y: 180,
        connections: ['malakar_a04'],
        prerequisites: ['malakar_a01']
      },
      {
        id: 'malakar_a03',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Desespero Astral',
        description: 'Quando ambos os espíritos estão mortos, Malakar ganha +30% de Velocidade de Movimento e +50% de cadência de disparo.',
        cost: 1,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 2,
        x: 70,
        y: 180,
        connections: ['malakar_a04', 'malakar_a05'],
        prerequisites: ['malakar_a01']
      },
      {
        id: 'malakar_a04',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Cataclismo Dimensional',
        description: '+35% Dano na Ruptura Dimensional (E) e atordoamento ampliado para 1.5s.',
        cost: 2,
        icon: 'Flame',
        nodeType: 'MINOR',
        tier: 3,
        x: 0,
        y: 250,
        connections: ['malakar_a06'],
        prerequisites: ['malakar_a02', 'malakar_a03']
      },
      {
        id: 'malakar_a05',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Catalisador de Retorno',
        description: 'Cada inimigo atingido pela Ruptura Dimensional (E) reduz em 1.5s o tempo restante de renascimento dos espíritos.',
        cost: 2,
        icon: 'Zap',
        nodeType: 'MAJOR',
        tier: 3,
        x: 100,
        y: 260,
        connections: ['malakar_a06'],
        prerequisites: ['malakar_a03']
      },
      {
        id: 'malakar_a06',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Avatar do Vazio Espiritual',
        description: 'A Ruptura Dimensional cura Malakar em 5% por inimigo atingido e reduz a recarga da habilidade em 2.5s.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 4,
        x: 0,
        y: 350,
        connections: ['malakar_k02'],
        prerequisites: ['malakar_a04', 'malakar_a05']
      },

      // Supreme Apex Keystones
      {
        id: 'malakar_k01',
        hunterId: Archetype.SUMMONER,
        familyId: 'LEGION',
        name: 'Supremacia das Almas Gêmeas',
        description: 'O Guardião e o Predador atingem forma divina: ganham +50% de dano, escudos permanentes e atacam em sincronia.',
        cost: 3,
        icon: 'Sparkles',
        nodeType: 'KEYSTONE',
        tier: 6,
        x: 0,
        y: -440,
        connections: [],
        prerequisites: ['malakar_l08', 'malakar_d08']
      },
      {
        id: 'malakar_k02',
        hunterId: Archetype.SUMMONER,
        familyId: 'ARCANE',
        name: 'Ressurreição Instantânea',
        description: 'Usar a Ruptura Dimensional (E) revive imediatamente um dos espíritos caídos ao lado de Malakar.',
        cost: 3,
        icon: 'Crown',
        nodeType: 'KEYSTONE',
        tier: 5,
        x: 0,
        y: 430,
        connections: [],
        prerequisites: ['malakar_a06']
      }
    ],
    connections: [
      { from: 'malakar_core', to: 'malakar_l01', style: 'SOLID' },
      { from: 'malakar_core', to: 'malakar_d01', style: 'SOLID' },
      { from: 'malakar_core', to: 'malakar_a01', style: 'SOLID' },

      { from: 'malakar_l01', to: 'malakar_l02', style: 'SOLID' },
      { from: 'malakar_l01', to: 'malakar_l03', style: 'SOLID' },
      { from: 'malakar_l02', to: 'malakar_l04', style: 'SOLID' },
      { from: 'malakar_l03', to: 'malakar_l04', style: 'SOLID' },
      { from: 'malakar_l03', to: 'malakar_l05', style: 'SOLID' },
      { from: 'malakar_l04', to: 'malakar_l06', style: 'SOLID' },
      { from: 'malakar_l05', to: 'malakar_l06', style: 'SOLID' },
      { from: 'malakar_l05', to: 'malakar_l07', style: 'SOLID' },
      { from: 'malakar_l06', to: 'malakar_l08', style: 'SOLID' },
      { from: 'malakar_l07', to: 'malakar_l08', style: 'SOLID' },

      { from: 'malakar_d01', to: 'malakar_d02', style: 'SOLID' },
      { from: 'malakar_d01', to: 'malakar_d03', style: 'SOLID' },
      { from: 'malakar_d02', to: 'malakar_d04', style: 'SOLID' },
      { from: 'malakar_d02', to: 'malakar_d05', style: 'SOLID' },
      { from: 'malakar_d03', to: 'malakar_d04', style: 'SOLID' },
      { from: 'malakar_d04', to: 'malakar_d06', style: 'SOLID' },
      { from: 'malakar_d05', to: 'malakar_d06', style: 'SOLID' },
      { from: 'malakar_d05', to: 'malakar_d07', style: 'SOLID' },
      { from: 'malakar_d06', to: 'malakar_d08', style: 'SOLID' },
      { from: 'malakar_d07', to: 'malakar_d08', style: 'SOLID' },

      { from: 'malakar_a01', to: 'malakar_a02', style: 'SOLID' },
      { from: 'malakar_a01', to: 'malakar_a03', style: 'SOLID' },
      { from: 'malakar_a02', to: 'malakar_a04', style: 'SOLID' },
      { from: 'malakar_a03', to: 'malakar_a04', style: 'SOLID' },
      { from: 'malakar_a03', to: 'malakar_a05', style: 'SOLID' },
      { from: 'malakar_a04', to: 'malakar_a06', style: 'SOLID' },
      { from: 'malakar_a05', to: 'malakar_a06', style: 'SOLID' },

      { from: 'malakar_l08', to: 'malakar_k01', style: 'ENERGY' },
      { from: 'malakar_d08', to: 'malakar_k01', style: 'ENERGY' },
      { from: 'malakar_a06', to: 'malakar_k02', style: 'ENERGY' }
    ]
  }
};

/**
 * Helper to fetch a Hunter's Talent Tree, defaulting to Archetype.ARCHER if not found
 */
export function getHunterTalentTree(archetype: Archetype | string): HunterTalentTree {
  const key = archetype as Archetype;
  return HUNTER_TALENT_TREES[key] || HUNTER_TALENT_TREES[Archetype.ARCHER];
}

/**
 * Initial empty progression for any hunter with 15 initial mastery points for free exploration
 */
export function createDefaultHunterProgress(hunterId: string): HunterTalentProgress {
  let coreId = 'lyra_core';
  if (hunterId === Archetype.MAGE || hunterId === 'MAGE') {
    coreId = 'kael_core';
  } else if (hunterId === Archetype.VORGAR || hunterId === 'VORGAR') {
    coreId = 'vorgar_core';
  } else if (hunterId === Archetype.SUMMONER || hunterId === 'SUMMONER') {
    coreId = 'malakar_core';
  }
  return {
    hunterId,
    unlockedNodeIds: [coreId],
    spentPoints: 0,
    availablePoints: 15
  };
}

/**
 * Real-Time Talent Processor Engine
 * Iterates through all unlocked nodes for the active Hunter and applies precise combat stat modifiers.
 */
export function applyTalentEffectsToPlayer(p: Player, saveData: PersistentSaveData): void {
  if (!p || !p.stats || !saveData || !saveData.talentProgress) return;
  const progress = saveData.talentProgress[p.archetype];
  if (!progress || !progress.unlockedNodeIds) return;

  const tree = HUNTER_TALENT_TREES[p.archetype];
  if (!tree || !tree.nodes) return;

  const unlockedSet = new Set(progress.unlockedNodeIds);
  p.unlockedTalents = unlockedSet;

  tree.nodes.forEach(node => {
    if (!unlockedSet.has(node.id)) return;

    if (node.tier === 0) {
      // Core origin node
      p.stats.ad += p.archetype === Archetype.ARCHER ? 6 : (p.archetype === Archetype.VORGAR ? 8 : 3);
      p.stats.ap += p.archetype === Archetype.MAGE ? 10 : 3;
      p.stats.maxHp += p.archetype === Archetype.VORGAR ? 40 : 25;
    } else {
      if (node.nodeType === 'MINOR') {
        p.stats.maxHp += 15;
        if (node.familyId === 'PRECISION' || node.familyId === 'DESTRUCTION' || node.familyId === 'DEVASTATION' || node.familyId === 'ARCANE') {
          p.stats.critChance += 0.04;
          p.stats.critDamage += 0.10;
          p.stats.ad += 4;
          p.stats.ap += 5;
        } else if (node.familyId === 'STORM' || node.familyId === 'DISTORTION' || node.familyId === 'DOMINION') {
          p.stats.atkSpeed += 0.08;
          p.stats.moveSpeed += 0.20;
          p.stats.ad += 3;
          p.stats.ap += 6;
        } else if (node.familyId === 'TRAPS' || node.familyId === 'GRAVITY' || node.familyId === 'FORTRESS' || node.familyId === 'LEGION') {
          p.stats.armor += 4;
          p.stats.mr += 4;
          p.stats.regen += 0.8;
          p.stats.maxHp += 20;
        }
      } else if (node.nodeType === 'MAJOR') {
        p.stats.maxHp += 35;
        if (node.familyId === 'PRECISION' || node.familyId === 'DESTRUCTION' || node.familyId === 'DEVASTATION' || node.familyId === 'ARCANE') {
          p.stats.critChance += 0.08;
          p.stats.critDamage += 0.20;
          p.stats.ad += 8;
          p.stats.ap += 12;
        } else if (node.familyId === 'STORM' || node.familyId === 'DISTORTION' || node.familyId === 'DOMINION') {
          p.stats.atkSpeed += 0.12;
          p.stats.moveSpeed += 0.30;
          if (p.skill1MaxCooldown) p.skill1MaxCooldown = Math.max(0.8, p.skill1MaxCooldown * 0.88);
          if (p.skill2MaxCooldown) p.skill2MaxCooldown = Math.max(0.8, p.skill2MaxCooldown * 0.88);
        } else if (node.familyId === 'TRAPS' || node.familyId === 'GRAVITY' || node.familyId === 'FORTRESS' || node.familyId === 'LEGION') {
          p.stats.armor += 8;
          p.stats.mr += 8;
          p.stats.omnivamp += 0.04;
          p.stats.regen += 1.5;
        }
      } else if (node.nodeType === 'KEYSTONE' || node.nodeType === 'HYBRID') {
        p.stats.maxHp += 60;
        p.stats.ad += 12;
        p.stats.ap += 18;
        p.stats.critChance += 0.12;
        p.stats.critDamage += 0.30;
        p.stats.atkSpeed += 0.15;
        p.stats.moveSpeed += 0.35;
        if (p.archetype === Archetype.ARCHER) {
          p.stats.pierce = (p.stats.pierce || 0) + 1;
        } else if (p.archetype === Archetype.MAGE) {
          p.projectilesCount = Math.min(6, p.projectilesCount + 1);
        } else if (p.archetype === Archetype.VORGAR) {
          p.stats.armor += 10;
          p.stats.mr += 10;
          p.stats.omnivamp += 0.05;
        } else if (p.archetype === Archetype.SUMMONER) {
          p.stats.ap += 15;
          p.stats.regen += 2.0;
        }
      }
    }
  });

  // Ensure current HP reflects updated maxHp
  p.stats.hp = p.stats.maxHp;
}
