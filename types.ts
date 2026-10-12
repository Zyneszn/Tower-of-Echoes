export enum GameState {
  MAIN_MENU = 'MAIN_MENU',
  CHAR_SELECT = 'CHAR_SELECT',
  VILA = 'VILA', // A Vila / Lobby interativo principal
  FLOOR_0 = 'FLOOR_0', // Compatibilidade retroativa com Floor 0
  REGION_SELECT = 'REGION_SELECT', // O novo mapa de escolha de regiões
  TOWER = 'TOWER', // O combate na torre
  TRANSITION = 'TRANSITION',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export interface RunEndStats {
  floorReached: number;
  crystalsGathered: number;
  crystalsLost: number;
  crystalsSaved: number;
  regionName?: string;
  timeElapsed?: number; // In seconds
  monstersDefeated?: number;
  bossesDefeated?: string[];
  hunterClass?: string;
}

export type VillageStructureType = 'GUILD' | 'PORTAL' | 'SANCTUARY' | 'VAULT';

export interface HunterBounty {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardCrystals: number;
  completed: boolean;
  claimed: boolean;
  icon: string;
  category: 'SLAY' | 'PROGRESSION' | 'COLLECTION' | 'SURVIVAL';
}

export interface BestiaryMonster {
  id: string;
  name: string;
  subtitle: string;
  floor: number;
  type: string;
  hp: number;
  speed: string;
  dangerLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BOSS';
  weakness: string;
  description: string;
  icon: string;
  color: string;
}

export enum Archetype {
  ARCHER = 'ARCHER',
  MAGE = 'MAGE',
  VORGAR = 'VORGAR',
  SUMMONER = 'SUMMONER'
}

export type MinionRole = 'GUARDIAN' | 'PREDATOR';

export interface PlayerMinion {
  id: string;
  role: MinionRole;
  name: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  ad: number;
  armor: number;
  mr: number;
  speed: number;
  attackRange: number;
  attackCd: number;
  attackTimer: number;
  targetId: string | null;
  state: 'FOLLOW' | 'ENGAGED' | 'RETURNING' | 'DEAD';
  deathTimer: number;
  maxDeathTimer: number;
  hitFlash: number;
  color: string;
  size: number;
}

export enum Biome {
  FOREST = 'FOREST',
  DESERT = 'DESERT',
  SNOW = 'SNOW',
  GRAVEYARD = 'GRAVEYARD',
  VOLCANO = 'VOLCANO',
  CITY = 'CITY'
}

export enum Weather {
  CLEAR = 'CLEAR',
  RAIN = 'RAIN',
  SANDSTORM = 'SANDSTORM',
  BLIZZARD = 'BLIZZARD',
  NIGHT = 'NIGHT'
}

export interface Stats {
  maxHp: number;
  hp: number;
  ad: number; // Attack Damage (Dano Físico)
  ap: number; // Ability Power (Dano Mágico)
  armor: number; // Armadura (Reduz dano físico)
  mr: number; // Resistência Mágica (Reduz dano mágico)
  moveSpeed: number;
  atkSpeed: number;
  omnivamp: number; // Roubo de vida de todas as fontes
  tenacity: number; // Redução de controle de grupo
  regen: number; // Regeneração de vida por segundo
  critChance: number;
  critDamage: number;
  pierce?: number;
  skillRadiusMult?: number;
  summonPower?: number;
}

export interface Player {
  x: number; y: number; z: number;
  archetype: Archetype;
  stats: Stats;
  crystals: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
  projectilesCount: number;
  weaponTimer: number;
  skill1Timer: number;
  skill1MaxCooldown: number;
  skill2Timer: number;
  skill2MaxCooldown: number;
  skill3Timer: number;
  skill3MaxCooldown: number;
  dashTimer: number;
  dashMaxCooldown: number;
  dashCharges: number;
  dashRechargeTimer?: number;
  facing: number;
  vx?: number;
  vy?: number;
  isMoving: boolean;
  color: string;
  animFrame: number;
  hitFlash: number;
  shieldTimer: number;
  shieldAmount?: number;
  maxShieldAmount?: number;
  slowTimer: number;
  stunTimer: number;
  passiveTimer?: number;
  passiveMaxCooldown?: number;
  passiveActiveTimer?: number;
  passiveActiveDuration?: number;
  vorgarRTimer?: number;
  lyraRTimer?: number;
  malakarRTimer?: number;
  malakarSoulSpawnTimer?: number;
  lyraMarkedEnemyIds?: string[];
  unlockedTalents?: Set<string>;
  equippedUniqueEffects?: Set<string>;
  critFrenzyStacks?: number;
  critFrenzyTimer?: number;
  prismaticCharged?: boolean;
  prismaticChargeTimer?: number;
  isTetherSiphoned?: boolean;
  solarBlessingTimer?: number;
}

export type EnemyState = 'CHASING' | 'WINDUP' | 'ATTACKING' | 'RECOVERING' | 'FLEEING' | 'GUARDING' | 'PHASE_2' | 'ENRAGED' | 'PREPARE_JUMP' | 'JUMPING' | 'DASHING' | 'STAGGERED' | 'SUBMERGED' | 'CHANNELING';

export interface Enemy {
  id: string;
  x: number; y: number; z: number;
  vz?: number;
  isJumping?: boolean;
  type: string;
  isBoss: boolean;
  isElite: boolean;
  isFriendly?: boolean;
  hp: number; maxHp: number;
  ad: number; ap: number;
  armor: number; mr: number;
  speed: number;
  radius: number;
  hitboxRadius: number;
  frame: number;
  state: EnemyState;
  stateTimer: number;
  attackRange: number;
  windupTime: number;
  recoverTime: number;
  specialCooldown: number;
  specialMaxCooldown: number;
  targetX?: number; targetY?: number;
  dashVx?: number; dashVy?: number; dashTimer?: number;
  bossPhase?: number;
  stagger?: number;
  maxStagger?: number;
  isStaggered?: boolean;
  staggerTimer?: number;
  color?: string;
  vx: number; vy: number;
  hitFlash: number;
  slowTimer?: number;
  stunTimer?: number;
  frozenTimer?: number;
  orbitAngle?: number;
  flankSide?: number;
  flankAngleOffset?: number;
  tacticalRole?: 'SURROUND' | 'FLANK' | 'INTERCEPT' | 'DIRECT';
  statusEffects?: {
    wet?: number;
    burning?: number;
    shocked?: number;
    poisoned?: number;
  };
  customAttackData?: any;
}

export interface Telegraph {
  id: string;
  x: number; y: number;
  radius: number;
  duration: number;
  maxDuration: number;
  color: string;
  type: 'CIRCLE' | 'CONE' | 'LINE';
  angle?: number;
  length?: number;
  width?: number;
  damage: number;
  damageType: 'AD' | 'AP';
  sourceId: string;
  isDash?: boolean;
  isJump?: boolean;
  attachToSource?: boolean;
  projectileType?: string;
}

export interface Projectile {
  id: string;
  x: number; y: number; z: number;
  vx: number; vy: number;
  damage: number;
  damageType: 'AD' | 'AP';
  duration: number;
  radius: number;
  type: string;
  color: string;
  pierce: number;
  isEnemy?: boolean;
  hitEnemyIds?: string[];
  isSlowedInDome?: boolean;
}

export interface XpOrb {
  id: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  value: number;
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  icon: string;
  apply: (p: Player) => void;
}

export type ParticleType = 'BLOOD' | 'MAGIC' | 'FIRE' | 'TRAIL' | 'IMPACT' | 'HEAL' | 'RAIN' | 'SNOW' | 'SAND' | 'FOG' | 'EMBER' | 'SPORE' | 'SPARK' | 'ASH' | 'PETAL';

export interface Particle {
  id: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  color: string; size: number;
  type?: ParticleType;
}

export interface DamageNumber {
  id: string;
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  value: number;
  life: number;
  maxLife: number;
  isCrit: boolean;
  isPlayerDamage?: boolean;
  color?: string;
}

export interface MapHazard {
  id: string;
  type: 'RESONANT_PILLAR' | 'SPIKE_TRAP' | 'SACRIFICE_SHRINE' | 'TOXIC_GEYSER' | 'MAGMA_VENT' | 'CHALLENGE_CHEST' | 'EXPLODING_BARREL' | 'BREAKABLE_PILLAR' | 'GRAVEYARD_HANDS' | 'TESLA_COIL' | 'PROXIMITY_MINE' | 'QUICKSAND_WHIRL' | 'FROST_STALACTITE' | 'VOID_SINGULARITY' | 'ACID_POOL' | 'THERMAL_GEYSER' | 'FROST_CRYSTAL' | 'SOUL_BRAZIER' | 'SOLAR_ALTAR';
  x: number;
  y: number;
  radius: number;
  name: string;
  description: string;
  stateTimer: number;
  maxTimer: number;
  isActive: boolean;
  used?: boolean;
  progress?: number;
  hp?: number;
  maxHp?: number;
  primed?: boolean;
  fuseTimer?: number;
  damage?: number;
  angle?: number;
}

export interface PhaseConfig {
  phaseNumber: number;
  name: string;
  description: string;
  duration: number;
  spawnRate: number;
  enemyTypes: string[];
}

export interface RegionConfig {
  regionNumber: number; // Corresponds to floorNumber
  regionName: string;
  biome: Biome;
  possibleWeathers: Weather[];
  boss: string;
  phases: {
    1: PhaseConfig;
    2: PhaseConfig;
    3: PhaseConfig;
  };
}

export interface FloorConfig {
  floorNumber: number;
  regionName?: string;
  duration: number; // Backwards compatibility & Phase 1 duration
  phase1Duration?: number;
  phase2Duration?: number;
  spawnRate: number;
  enemyTypes: string[];
  boss: string;
  biome: Biome;
  possibleWeathers: Weather[];
  phases?: {
    1: PhaseConfig;
    2: PhaseConfig;
    3: PhaseConfig;
  };
}

export interface FloorAnomaly {
  floorNumber: number;
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  buffText: string;
  hazardText: string;
  playerAdMult?: number;
  playerApMult?: number;
  playerMoveSpeedMult?: number;
  enemyHpMult?: number;
  enemySpeedMult?: number;
  enemyDamageMult?: number;
  manaCrystalsMult?: number;
  dashCooldownMult?: number;
  skillCooldownMult?: number;
  critChanceBonus?: number;
  skillRadiusMult?: number;
  staggerBonusMult?: number;
}
