import React, { useEffect, useRef, useState } from 'react';
import { GameState, Archetype, Player, Enemy, Projectile, Particle, DamageNumber, Telegraph, Weather, XpOrb, Upgrade, Biome, VillageStructureType, MapHazard, FloorAnomaly, RunEndStats, PlayerMinion, Stats } from '../types';
import { COLORS, BASE_STATS, SKILL_CONFIG, ZOOM_LEVEL, FLOOR_CONFIGS, FLOOR_ANOMALIES, getFloorAnomaly, getFloor1Instability, setCanvasSize, REGION_TREE_NODES } from '../constants';
import { getFloorMap, resolveMovement, resolveEnemySmoothPath, isPointWalkable, getSafeSpawnPoint, getCollidingPillar, FloorMapLayout, MapPillar } from '../mapLayouts';
import { LightweightParticleManager } from '../src_systems_particles';
import { GuildModal } from './GuildModal';
import { TalentTreeModal } from './TalentTreeModal';
import { RegionSelectMap } from './RegionSelectMap';
import { PersistentSaveData, EquipmentItem, ActiveLootDraft } from '../src_types_progression';
import { SaveManager } from '../src_systems_progression';
import { HUNTERS } from '../src_data_catalog';
import { applyTalentEffectsToPlayer } from '../src_data_talents';
import { GameItem, rollLootForItem, ITEMS_DATABASE, rollLootItem } from '../src_data_items';
import { rollBossRewardDraft } from '../src_data_loot';
import { LootRewardModal } from './LootRewardModal';
import { VaultModal } from './VaultModal';
import { ForgeModal } from './ForgeModal';
import { Heart, Shield, Zap, Skull, Gem, Award, Target, Sparkles, Compass, Flame, AlertCircle, RefreshCw, Crown } from 'lucide-react';
import { audioManager } from '../audioManager';
import { AudioControlWidget } from './AudioControlWidget';

interface GameCanvasProps {
  initialState: GameState;
  archetype: Archetype;
  onGameOver: (stats?: RunEndStats) => void;
}

// --- UTILS & ATOMIC ID GENERATOR (ZERO-GC) ---
let _nextEntityId = 1;
const getNextId = () => (++_nextEntityId).toString();

// In-Place array compaction utility (Zero-GC, O(N))
function compactArray<T>(arr: T[], predicate: (item: T) => boolean): void {
  let writeIdx = 0;
  for (let readIdx = 0; readIdx < arr.length; readIdx++) {
    if (predicate(arr[readIdx])) {
      if (writeIdx !== readIdx) {
        arr[writeIdx] = arr[readIdx];
      }
      writeIdx++;
    }
  }
  arr.length = writeIdx;
}

// --- OBJECT POOLS (ZERO-GC ALLOCATION & RECYCLING) ---
export class ProjectilePool {
  private static pool: Projectile[] = [];

  public static acquire(config: Omit<Projectile, 'id'> & { id?: string }): Projectile {
    let proj = this.pool.pop();
    if (!proj) {
      proj = {
        id: config.id || getNextId(),
        x: config.x,
        y: config.y,
        z: config.z || 0,
        vx: config.vx,
        vy: config.vy,
        damage: config.damage,
        damageType: config.damageType,
        duration: config.duration,
        radius: config.radius,
        type: config.type,
        color: config.color,
        pierce: config.pierce,
        isEnemy: config.isEnemy || false,
        hitEnemyIds: config.hitEnemyIds || []
      };
    } else {
      proj.id = config.id || getNextId();
      proj.x = config.x;
      proj.y = config.y;
      proj.z = config.z || 0;
      proj.vx = config.vx;
      proj.vy = config.vy;
      proj.damage = config.damage;
      proj.damageType = config.damageType;
      proj.duration = config.duration;
      proj.radius = config.radius;
      proj.type = config.type;
      proj.color = config.color;
      proj.pierce = config.pierce;
      proj.isEnemy = config.isEnemy || false;
      if (proj.hitEnemyIds) {
        proj.hitEnemyIds.length = 0;
      } else {
        proj.hitEnemyIds = [];
      }
    }
    return proj;
  }

  public static release(proj: Projectile): void {
    if (proj.hitEnemyIds) proj.hitEnemyIds.length = 0;
    if (this.pool.length < 500) {
      this.pool.push(proj);
    }
  }

  public static clear(): void {
    this.pool.length = 0;
  }
}

export class EnemyPool {
  private static pool: Enemy[] = [];

  public static acquire(config: Enemy): Enemy {
    let enemy = this.pool.pop();
    if (!enemy) {
      enemy = { ...config };
    } else {
      Object.assign(enemy, config);
      enemy.statusEffects = {};
      enemy.customAttackData = {};
      enemy.orbitAngle = undefined;
      enemy.hitFlash = 0;
    }
    return enemy;
  }

  public static release(enemy: Enemy): void {
    if (enemy.statusEffects) {
      enemy.statusEffects.wet = 0;
      enemy.statusEffects.burning = 0;
      enemy.statusEffects.shocked = 0;
      enemy.statusEffects.poisoned = 0;
    }
    if (this.pool.length < 300) {
      this.pool.push(enemy);
    }
  }

  public static clear(): void {
    this.pool.length = 0;
  }
}

function compactAndReleaseProjectiles(arr: Projectile[]): void {
  let writeIdx = 0;
  for (let readIdx = 0; readIdx < arr.length; readIdx++) {
    const proj = arr[readIdx];
    if (proj.duration > 0) {
      if (writeIdx !== readIdx) {
        arr[writeIdx] = proj;
      }
      writeIdx++;
    } else {
      ProjectilePool.release(proj);
    }
  }
  arr.length = writeIdx;
}

function compactAndReleaseEnemies(arr: Enemy[]): void {
  let writeIdx = 0;
  for (let readIdx = 0; readIdx < arr.length; readIdx++) {
    const enemy = arr[readIdx];
    if (enemy.hp > 0) {
      if (writeIdx !== readIdx) {
        arr[writeIdx] = enemy;
      }
      writeIdx++;
    } else {
      EnemyPool.release(enemy);
    }
  }
  arr.length = writeIdx;
}

const toIso = (x: number, y: number, z: number = 0) => ({ x: x - y, y: (x + y) / 2 - z });
const toWorldFromIso = (isoX: number, isoY: number) => ({ x: (isoX + 2 * isoY) / 2, y: (2 * isoY - isoX) / 2 });
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

// Cached font constants to prevent canvas font cache invalidation
const FONT_DAMAGE_CRIT = "900 28px 'JetBrains Mono', monospace";
const FONT_DAMAGE_NORM = "900 18px 'JetBrains Mono', monospace";
const FONT_HAZARD_LABEL = "900 11px 'JetBrains Mono', monospace";
const FONT_HUD_PORTAL = "900 13px 'JetBrains Mono', monospace";
const FONT_HUD_SUB = "10px 'JetBrains Mono', monospace";

interface RenderItem {
  kind: 'PLAYER' | 'ENEMY' | 'PILLAR' | 'HAZARD' | 'MINION';
  sortY: number;
  enemy?: Enemy;
  pillar?: any;
  hazard?: MapHazard;
  minion?: PlayerMinion;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  initialState, 
  archetype, 
  onGameOver 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [currentGameState, setCurrentGameState] = useState<GameState>(initialState);
  const isFreshRunRef = useRef<boolean>(true);
  
  // React UI States
  const [activeVillageModal, setActiveVillageModal] = useState<VillageStructureType | 'FORGE' | null>(null);
  const [nearbyStructure, setNearbyStructure] = useState<VillageStructureType | 'PORTAL' | null>(null);
  const [nearbyHazard, setNearbyHazard] = useState<MapHazard | null>(null);
  const [modalRefreshKey, setModalRefreshKey] = useState(0);
  const [showTransition, setShowTransition] = useState(false);
  const [hudData, setHudData] = useState<any>({});

  // Progression & Tower Exit Portal State
  const [saveData, setSaveData] = useState<PersistentSaveData>(() => SaveManager.loadSave());
  const [isNearPortal, setIsNearPortal] = useState<boolean>(false);
  const portalActiveRef = useRef<boolean>(false);
  const mapPortalPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const nearPortalRef = useRef<boolean>(false);

  // Relic Chest & Loot Draft Reward states
  const [relicChestState, setRelicChestState] = useState<'CLOSED' | 'OPENING' | 'REVEALED' | 'NONE'>('NONE');
  const [rolledLootItem, setRolledLootItem] = useState<GameItem | null>(null);
  const [rolledEquipmentItem, setRolledEquipmentItem] = useState<EquipmentItem | null>(null);
  const [activeLootDraft, setActiveLootDraft] = useState<ActiveLootDraft | null>(null);
  const [isLootRewardModalOpen, setIsLootRewardModalOpen] = useState<boolean>(false);

  // Mid-Run Progression
  const activeRunBlessingsRef = useRef<any[]>([]);

  // Phase Transition Portal State (Multi-Map Region Progression)
  const [nearPhasePortal, setNearPhasePortal] = useState<boolean>(false);
  const phasePortalActiveRef = useRef<boolean>(false);
  const phasePortalPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const nearPhasePortalRef = useRef<boolean>(false);

  // Tower Exploration & Risk/Reward Mechanics
  const climbBonusMultRef = useRef<number>(1.0);
  const greedyPathOfferedRef = useRef<boolean>(false);
  const isGreedyFloorRef = useRef<boolean>(false);
  const isRestRoomRef = useRef<boolean>(false);
  const floorCombatTimerRef = useRef<number>(0);
  const corruptionMistActiveRef = useRef<boolean>(false);
  const isLowHpActiveRef = useRef<boolean>(false);
  const crystalHazardTimerRef = useRef<number>(0);
  const [nearbyRestAction, setNearbyRestAction] = useState<'CAMPFIRE' | 'VILA_PORTAL' | 'TOWER_PORTAL' | null>(null);
  
  // Decoupled refs for high-frequency tracking
  const nearbyStructureRef = useRef<VillageStructureType | 'PORTAL' | null>(null);
  const nearbyHazardRef = useRef<MapHazard | null>(null);
  const hazardToastRef = useRef<{ text: string; timer: number; maxTimer: number } | null>(null);
  const currentAnomalyRef = useRef<FloorAnomaly | null>(null);
  const anomalyToastTimerRef = useRef<number>(0);
  const [showAnomalyInfoModal, setShowAnomalyInfoModal] = useState<boolean>(false);
  const depthQueueRef = useRef<RenderItem[]>([]);
  const fogGradientRef = useRef<CanvasGradient | null>(null);
  const fogGradSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Game State Refs
  const gameStateRef = useRef<GameState>(initialState);
  const floorRef = useRef<number>(initialState === GameState.VILA || initialState === GameState.FLOOR_0 ? 0 : 1);
  const phaseRef = useRef<number>(1);
  const timeRef = useRef<number>(0);
  const waveTimerRef = useRef<number>(0);
  const crystalsRef = useRef<number>(0);
  const weatherRef = useRef<Weather>(Weather.CLEAR);

  // Run statistics tracking (Rich Stats)
  const runTimerRef = useRef<number>(0);
  const runKillsRef = useRef<number>(0);
  const runBossesDefeatedRef = useRef<string[]>([]);
  const deathSequenceActiveRef = useRef<boolean>(false);
  const deathTimerRef = useRef<number>(0);
  
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const aimingSkillRef = useRef<'Q' | 'E' | 'R' | null>(null);
  const mouseScreenRef = useRef({ x: 0, y: 0 });
  const mouseWorldRef = useRef({ x: 0, y: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef({ x: 0, y: 0 });
  const cameraZoomRef = useRef(ZOOM_LEVEL);
  const shakeRef = useRef(0);
  const staticMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticMapCacheKeyRef = useRef<string>('');
  const staticMapBoundsRef = useRef<{ minIsoX: number; minIsoY: number }>({ minIsoX: 0, minIsoY: 0 });
  const hitStopRef = useRef<number>(0);
  const isAttackingRef = useRef(false);
  const hazardsRef = useRef<MapHazard[]>([]);

  // Entities
  const playerRef = useRef<Player>({
    x: 0, y: 0, z: 0, archetype: archetype,
    stats: JSON.parse(JSON.stringify(BASE_STATS[archetype])),
    crystals: 0, xp: 0, level: 1, xpToNextLevel: 100, projectilesCount: 1,
    unlockedRunes: [], equippedRunes: [],
    slotR: null, slotRCd: 0, slotF: null, slotFCd: 0,
    weaponTimer: 0, 
    skill1Timer: 0, skill1MaxCooldown: SKILL_CONFIG[archetype].skill1Cd,
    skill2Timer: 0, skill2MaxCooldown: SKILL_CONFIG[archetype].skill2Cd,
    skill3Timer: 0, skill3MaxCooldown: SKILL_CONFIG[archetype].skill3Cd,
    dashTimer: 0, dashMaxCooldown: SKILL_CONFIG[archetype].dashCd, dashCharges: SKILL_CONFIG[archetype].dashChargesMax, dashRechargeTimer: 0,
    facing: 0, isMoving: false, color: COLORS[archetype], animFrame: 0, hitFlash: 0, shieldTimer: 0, slowTimer: 0, stunTimer: 0
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const minionsRef = useRef<PlayerMinion[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const telegraphsRef = useRef<Telegraph[]>([]);
  const xpOrbsRef = useRef<XpOrb[]>([]);
  const offeredUpgradesRef = useRef<Upgrade[]>([]);
  const appliedUpgradesRef = useRef<Array<(p: Player) => void>>([]);
  const eventRef = useRef<{ type: string, timer: number, x: number, y: number, active: boolean, progress?: number }>({ type: 'NONE', timer: 0, x: 0, y: 0, active: false });

  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const bossSpawnedRef = useRef<boolean>(false);
  const uiTimerRef = useRef<number>(0);
  const lavaSurgeTimerRef = useRef<number>(30.0);
  const frostbiteRef = useRef<number>(0);
  const frostWarmthTimerRef = useRef<number>(0);
  const phoenixRebirthUsedRef = useRef<boolean>(false);

  // --- SAVE/LOAD SYSTEM ---
  useEffect(() => {
    const loaded = SaveManager.loadSave();
    setSaveData(loaded);
    applyRunes(true);
  }, []);

  const saveGame = (customSave?: PersistentSaveData) => {
    const toSave = customSave || saveData;
    SaveManager.saveGame(toSave);
  };

  const applyRunes = (resetToFullHp = false, customHp?: number) => {
    const p = playerRef.current;
    const currentHp = customHp !== undefined ? customHp : p.stats?.hp;
    const baseStats = BASE_STATS[p.archetype];
    p.stats = JSON.parse(JSON.stringify(baseStats));

    // Reapply accumulated Level Up upgrades
    appliedUpgradesRef.current.forEach(upgradeFn => {
      upgradeFn(p);
    });

    // Reapply active mid-run blessings
    activeRunBlessingsRef.current.forEach(blessing => {
      if (blessing.statsBonus) {
        Object.entries(blessing.statsBonus).forEach(([statKey, val]) => {
          if (val !== undefined && typeof val === 'number') {
            const currentVal = p.stats[statKey as keyof Stats] || 0;
            (p.stats as any)[statKey] = parseFloat((currentVal + val).toFixed(3));
          }
        });
      }
      if (blessing.specialEffectKey === 'bonus_projectiles') {
        p.projectilesCount = (BASE_STATS[p.archetype]?.ad ? 1 : 1) + (blessing.specialEffectValue || 1);
      }
    });

    // Always fetch fresh save state from SaveManager
    const freshSave = SaveManager.loadSave();
    setSaveData(freshSave);

    // Apply real-time unlocked Talent Tree effects
    applyTalentEffectsToPlayer(p, freshSave);

    // Reapply equipped items attributes & unique passives
    p.equippedUniqueEffects = new Set<string>();
    const equippedIds = freshSave.equippedItems?.[p.archetype] || {};
    Object.entries(equippedIds).forEach(([slot, instanceId]) => {
      if (!instanceId) return;
      const item = freshSave.inventory?.find(i => i.id === instanceId);
      if (item) {
        if (item.uniqueEffectId) {
          p.equippedUniqueEffects?.add(item.uniqueEffectId);
        }
        Object.entries(item.stats).forEach(([statKey, value]) => {
          if (value !== undefined && typeof value === 'number') {
            if (statKey === 'moveSpeed') {
              const baseSpeed = BASE_STATS[p.archetype]?.moveSpeed || 3.0;
              const speedBonus = baseSpeed * (value / 100);
              const currentVal = p.stats.moveSpeed || baseSpeed;
              p.stats.moveSpeed = parseFloat((currentVal + speedBonus).toFixed(3));
            } else {
              const currentVal = p.stats[statKey as keyof Stats] || 0;
              (p.stats as any)[statKey] = parseFloat((currentVal + value).toFixed(3));
            }
          }
        });
      }
    });

    // Handle Frenzy stacks from ring_critical_frenzy
    if (p.critFrenzyStacks && p.critFrenzyStacks > 0 && p.critFrenzyTimer && p.critFrenzyTimer > 0) {
      p.stats.atkSpeed = parseFloat((p.stats.atkSpeed * (1 + p.critFrenzyStacks * 0.15)).toFixed(3));
    }

    // Vorgar Gladiator Blood passive: +1.5% Omnivamp per 10% lost HP
    if (p.equippedUniqueEffects?.has('vorgar_gladiator_blood') && currentHp !== undefined && p.stats.maxHp > 0) {
      const lostHpRatio = Math.max(0, (p.stats.maxHp - currentHp) / p.stats.maxHp);
      const bonusVamp = Math.floor(lostHpRatio * 10) * 0.015;
      p.stats.omnivamp = parseFloat(((p.stats.omnivamp || 0) + bonusVamp).toFixed(3));
    }

    if (resetToFullHp || currentHp === undefined) {
      p.stats.hp = p.stats.maxHp;
    } else {
      p.stats.hp = Math.max(1, Math.min(p.stats.maxHp, currentHp));
    }
  };

  const handleSelectArchetype = (newArchetype: Archetype) => {
    const p = playerRef.current;
    p.archetype = newArchetype;
    p.color = COLORS[newArchetype];
    p.skill1MaxCooldown = SKILL_CONFIG[newArchetype].skill1Cd;
    p.skill2MaxCooldown = SKILL_CONFIG[newArchetype].skill2Cd;
    p.skill3MaxCooldown = SKILL_CONFIG[newArchetype].skill3Cd;
    p.dashMaxCooldown = SKILL_CONFIG[newArchetype].dashCd;
    p.dashCharges = SKILL_CONFIG[newArchetype].dashChargesMax;
    applyRunes(true);
    saveGame();
    setModalRefreshKey(k => k + 1);
  };

  const handleAscendToTower = () => {
    isFreshRunRef.current = true;
    gameStateRef.current = GameState.REGION_SELECT;
    setCurrentGameState(GameState.REGION_SELECT);
    setNearbyStructure(null);
    setActiveVillageModal(null);
  };

  const handleSelectRegionFromMap = (floorNumber: number, isReplay: boolean) => {
    const p = playerRef.current;
    
    if (isFreshRunRef.current) {
      p.level = 1;
      p.xp = 0;
      p.xpToNextLevel = 100;
      appliedUpgradesRef.current = [];
      activeRunBlessingsRef.current = [];
      climbBonusMultRef.current = 1.0;
      greedyPathOfferedRef.current = false;
      isGreedyFloorRef.current = false;
      isRestRoomRef.current = false;
      floorCombatTimerRef.current = 0;
      corruptionMistActiveRef.current = false;
      phoenixRebirthUsedRef.current = false;
    }

    gameStateRef.current = GameState.TOWER;
    setCurrentGameState(GameState.TOWER);
    floorRef.current = floorNumber;
    
    resetFloor();
    applyRunes(isFreshRunRef.current);
    audioManager.playPortalAscendSfx();
    isFreshRunRef.current = false;
  };

  const handleReturnToVillageFromMap = () => {
    isFreshRunRef.current = true;
    gameStateRef.current = GameState.VILA;
    setCurrentGameState(GameState.VILA);
  };

  const advancePhase = () => {
    if (!phasePortalActiveRef.current) return;
    phasePortalActiveRef.current = false;
    nearPhasePortalRef.current = false;
    setNearPhasePortal(false);

    // 1. Auto-collect all XP orbs on floor
    xpOrbsRef.current.forEach(orb => {
      playerRef.current.xp += orb.value;
      while (playerRef.current.xp >= playerRef.current.xpToNextLevel) {
        applyAutomaticLevelUpStats(playerRef.current);
      }
    });
    xpOrbsRef.current = [];

    // 2. Advance Phase counter & reset timers
    phaseRef.current += 1;
    timeRef.current = 0;
    waveTimerRef.current = 0;

    // 3. Clear existing hostiles & projectiles
    enemiesRef.current.forEach(e => EnemyPool.release(e));
    enemiesRef.current.length = 0;
    projectilesRef.current.forEach(pr => ProjectilePool.release(pr));
    projectilesRef.current.length = 0;
    telegraphsRef.current.length = 0;
    particlesRef.current.length = 0;
    LightweightParticleManager.clear();

    // 4. Retrieve Phase Map Layout
    const nextMap = getFloorMap(floorRef.current, phaseRef.current);

    // 5. Load Stage Hazards for Phase Map
    hazardsRef.current = (nextMap.hazards || []).map(h => ({
      ...h,
      stateTimer: h.stateTimer || 0,
      isActive: h.type === 'RESONANT_PILLAR' || h.type === 'SACRIFICE_SHRINE' || h.type === 'EXPLODING_BARREL' || h.type === 'BREAKABLE_PILLAR',
      used: false,
      progress: 0,
      hp: h.hp ?? (h.type === 'EXPLODING_BARREL' ? 40 : (h.type === 'BREAKABLE_PILLAR' ? 100 : (h.type === 'RESONANT_PILLAR' ? 120 : 50))),
      maxHp: h.maxHp ?? (h.type === 'EXPLODING_BARREL' ? 40 : (h.type === 'BREAKABLE_PILLAR' ? 100 : (h.type === 'RESONANT_PILLAR' ? 120 : 50))),
      primed: false,
      fuseTimer: 0
    }));

    // 6. Safe spawn player and camera
    const safeSpawn = getSafeSpawnPoint(nextMap, 15);
    playerRef.current.x = safeSpawn.x;
    playerRef.current.y = safeSpawn.y;
    playerRef.current.z = 0;
    playerRef.current.vx = 0;
    playerRef.current.vy = 0;
    playerRef.current.isMoving = false;

    const pIso = toIso(safeSpawn.x, safeSpawn.y, 0);
    cameraRef.current.x = -pIso.x;
    cameraRef.current.y = -pIso.y;

    // 7. Reset static map cache to force re-render of new map geometry
    staticMapCacheKeyRef.current = '';

    // Equipment Passive: Couraça de Ferro da Sentinela (Escudo ao entrar em nova fase da Torre)
    if (playerRef.current.equippedUniqueEffects?.has('chest_sentinel_barrier')) {
      playerRef.current.shieldTimer = 5.0;
      createParticle(playerRef.current.x, playerRef.current.y, 25, '#94a3b8', 15, 'MAGIC');
    }

    // 8. SFX & Toast
    audioManager.playPortalAscendSfx();

    if (phaseRef.current === 3) {
      spawnBoss();
      bossSpawnedRef.current = true;
      audioManager.playCorruptionAlertSfx();
      
      let emoji = '⚔️';
      if (floorRef.current === 1) emoji = '🏛️';
      else if (floorRef.current === 2) emoji = '👁️';
      else if (floorRef.current === 3) emoji = '🐉';
      else if (floorRef.current === 4) emoji = '⚔️';
      else if (floorRef.current === 5) emoji = '🔱';
      else if (floorRef.current === 6) emoji = '👑';
      else if (floorRef.current === 7) emoji = '🤖';
      else if (floorRef.current === 8) emoji = '⚰️';
      else if (floorRef.current === 9) emoji = '👼';
      else if (floorRef.current === 10) emoji = '🪐';

      hazardToastRef.current = {
        text: `${emoji} BEM-VINDO A: ${nextMap.name.toUpperCase()}!`,
        timer: 4.5,
        maxTimer: 4.5
      };
    } else {
      let emoji = '🔮';
      if (floorRef.current === 1) emoji = '🔮';
      else if (floorRef.current === 2) emoji = '🌫️';
      else if (floorRef.current === 3) emoji = '🔥';
      else if (floorRef.current === 4) emoji = '⚙️';
      else if (floorRef.current === 5) emoji = '⚡';
      else if (floorRef.current === 6) emoji = '❄️';
      else if (floorRef.current === 7) emoji = '🔬';
      else if (floorRef.current === 8) emoji = '💀';
      else if (floorRef.current === 9) emoji = '☀️';
      else if (floorRef.current === 10) emoji = '🌌';

      hazardToastRef.current = {
        text: `${emoji} BEM-VINDO A: ${nextMap.name.toUpperCase()}!`,
        timer: 4.0,
        maxTimer: 4.0
      };
    }
  };

  const resetFloor = () => {
    timeRef.current = 0;
    waveTimerRef.current = 0;
    bossSpawnedRef.current = false;
    phaseRef.current = 1;
    phasePortalActiveRef.current = false;
    nearPhasePortalRef.current = false;
    setNearPhasePortal(false);
    floorCombatTimerRef.current = 0;
    corruptionMistActiveRef.current = false;
    frostbiteRef.current = 0;
    frostWarmthTimerRef.current = 0;
    enemiesRef.current.forEach(e => EnemyPool.release(e));
    enemiesRef.current.length = 0;
    projectilesRef.current.forEach(p => ProjectilePool.release(p));
    projectilesRef.current.length = 0;
    telegraphsRef.current.length = 0;
    particlesRef.current.length = 0;
    minionsRef.current.length = 0;
    LightweightParticleManager.clear();

    setRolledLootItem(null);
    setRolledEquipmentItem(null);
    setRelicChestState('NONE');
    setActiveLootDraft(null);
    setIsLootRewardModalOpen(false);

    // Reset player Ultimate active buffs, scales and timers to prevent leakage
    const p = playerRef.current;
    p.vorgarRTimer = 0;
    p.lyraRTimer = 0;
    p.malakarRTimer = 0;
    p.malakarSoulSpawnTimer = 0;
    p.lyraMarkedEnemyIds = [];
    
    const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
    const floorNum = isVila ? 0 : (isRestRoomRef.current ? -1 : floorRef.current);
    const currentMap = getFloorMap(floorNum, phaseRef.current);
    const safeSpawn = getSafeSpawnPoint(currentMap, 15);
    
    // Equipment Passive: Couraça de Ferro da Sentinela (Escudo ao entrar em nova fase da Torre)
    if (!isVila && p.equippedUniqueEffects?.has('chest_sentinel_barrier')) {
      p.shieldTimer = 5.0;
      createParticle(p.x, p.y, 25, '#94a3b8', 15, 'MAGIC');
    }
    playerRef.current.z = 0;
    playerRef.current.vx = 0;
    playerRef.current.vy = 0;
    playerRef.current.isMoving = false;

    // Load Stage Hazards
    hazardsRef.current = (currentMap.hazards || []).map(h => ({
      ...h,
      stateTimer: h.stateTimer || 0,
      isActive: h.type === 'RESONANT_PILLAR' || h.type === 'SACRIFICE_SHRINE' || h.type === 'EXPLODING_BARREL' || h.type === 'BREAKABLE_PILLAR',
      used: false,
      progress: 0,
      hp: h.hp ?? (h.type === 'EXPLODING_BARREL' ? 40 : (h.type === 'BREAKABLE_PILLAR' ? 100 : 50)),
      maxHp: h.maxHp ?? (h.type === 'EXPLODING_BARREL' ? 40 : (h.type === 'BREAKABLE_PILLAR' ? 100 : 50)),
      primed: false,
      fuseTimer: 0
    }));
    setNearbyHazard(null);

    const config = FLOOR_CONFIGS[floorRef.current - 1] || FLOOR_CONFIGS[0];
    if (config.possibleWeathers && config.possibleWeathers.length > 0) {
      weatherRef.current = config.possibleWeathers[Math.floor(Math.random() * config.possibleWeathers.length)];
    } else {
      weatherRef.current = Weather.CLEAR;
    }

    // Shift Audio Theme based on current floor's Biome or Village state
    const currentBiome = isVila ? 'VILLAGE' : (config ? config.biome : Biome.FOREST);
    audioManager.setFloorBiome(currentBiome);

    if (!isVila && !isRestRoomRef.current) {
      // 60% chance no anomaly, 40% chance of having the floor's anomaly
      if (Math.random() < 0.40) {
        currentAnomalyRef.current = getFloorAnomaly(floorRef.current);
        anomalyToastTimerRef.current = 4.5;
      } else {
        currentAnomalyRef.current = null;
        anomalyToastTimerRef.current = 0;
      }
    } else {
      currentAnomalyRef.current = null;
      anomalyToastTimerRef.current = 0;
    }

    if (isRestRoomRef.current) {
      hazardToastRef.current = { text: '🔥 CÂMARA DA FOGUEIRA ANCESTRAL (ANDAR DE DESCANSO)', timer: 4.0, maxTimer: 4.0 };
    } else if (isGreedyFloorRef.current && !isVila) {
      hazardToastRef.current = { text: '💀 ANDAR DA GANÂNCIA: 2X CRISTAIS | INIMIGOS +25% VEL / +40% ATK!', timer: 4.5, maxTimer: 4.5 };
    }
  };

  // --- INIT & EVENT LISTENERS ---
  useEffect(() => {
    const updateSize = () => {
      const w = window.innerWidth; const h = window.innerHeight;
      setDimensions({ width: w, height: h }); setCanvasSize(w, h);
    };
    window.addEventListener('resize', updateSize); updateSize();

    const handleKeyDown = (e: KeyboardEvent) => { 
      keysRef.current[e.code] = true; 
      if (e.code === 'Escape') {
        aimingSkillRef.current = null;
        setActiveVillageModal(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    const handleWindowBlur = () => { 
      keysRef.current = {}; 
      isAttackingRef.current = false; 
    };
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if(rect) { mouseScreenRef.current = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 }; }
    };
    const handleMouseDown = (e: MouseEvent) => { if (e.button === 0) isAttackingRef.current = true; };
    const handleMouseUp = (e: MouseEvent) => { if (e.button === 0) isAttackingRef.current = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    lastTimeRef.current = performance.now();
    resetFloor(); // Initialize floor, weather, and safe spawn
    const loop = (time: number) => {
      // Frame-rate independent delta time (clamped between 1ms and 50ms)
      const dt = Math.max(0.001, Math.min((time - lastTimeRef.current) / 1000, 0.05));
      lastTimeRef.current = time;
      
      if (hitStopRef.current > 0) {
        hitStopRef.current -= dt;
      } else {
        const isGameActive = gameStateRef.current === GameState.TOWER || 
                             gameStateRef.current === GameState.FLOOR_0 || 
                             gameStateRef.current === GameState.VILA;
        if (isGameActive) {
          update(dt);
        }
      }
      draw(dt);
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', updateSize);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // --- COMBAT LOGIC ---
  const createParticle = (x: number, y: number, z: number, color: string, count: number, type: any = 'BLOOD') => {
    LightweightParticleManager.spawnImpact({
      x, y, z, color, count, type: type === 'BLOOD' ? 'IMPACT' : type
    });
  };

  const bossDefeatedProcessedRef = useRef<boolean>(false);
  const earnedRunCrystalsRef = useRef<number>(0);

  const handleBossDefeated = (e: Enemy) => {
    if (bossDefeatedProcessedRef.current) return;
    bossDefeatedProcessedRef.current = true;

    let bossName = "Chefe Desconhecido";
    if (e.type === 'BOSS_PRIME_COLOSSUS') bossName = "Colosso Primordial";
    else if (e.type === 'BOSS_CELESTIAL_EMPEROR') bossName = "Imperador Celestial Aurelius";
    else if (e.type === 'BOSS_VOID_REAPER') bossName = "Ceifador do Vazio Malakar";
    else if (e.type === 'BOSS_YMIR') bossName = "Ymir, o Titã do Gelo";
    else bossName = e.type.replace('BOSS_', '').replace('_', ' ');

    if (!runBossesDefeatedRef.current.includes(bossName)) {
      runBossesDefeatedRef.current.push(bossName);
    }

    hitStopRef.current = 0.35;
    shakeRef.current = 28;
    audioManager.playLevelUpSfx();

    const p = playerRef.current;
    
    // Boss defeat drops bonus Run Crystals scaled by current floor & bonuses!
    const bossBonusCrystals = Math.floor((25 + floorRef.current * 15) * climbBonusMultRef.current * (isGreedyFloorRef.current ? 2 : 1));
    p.crystals = (p.crystals || 0) + bossBonusCrystals;

    // Drop large XP burst
    xpOrbsRef.current.push({
      id: getNextId(), x: e.x, y: e.y, z: 30,
      vx: 0, vy: 0, vz: 350,
      value: 600
    });

    LightweightParticleManager.spawnImpact({
      x: e.x, y: e.y, z: 20, color: '#f59e0b', count: 35, type: 'IMPACT', speed: 300
    });

    // Wipe any remaining boss minions & clear hostile telegraphs
    enemiesRef.current.forEach(other => {
      if (!other.isFriendly && other.id !== e.id) {
        other.hp = 0;
      }
    });
    enemiesRef.current = enemiesRef.current.filter(other => other.id !== e.id && other.hp > 0);
    telegraphsRef.current = telegraphsRef.current.filter(t => t.sourceId?.startsWith('player'));

    // 10% chance to offer Greed Path bifurcation
    greedyPathOfferedRef.current = Math.random() < 0.10;

    // Spawn Tower Exit Portal at Boss position
    portalActiveRef.current = true;
    mapPortalPosRef.current = { x: e.x, y: e.y };
  };

  const handleConcludeRegion = () => {
    const currentFloor = floorRef.current;
    const currentConcluded = saveData.concludedRegions || [];
    const isNewUnlock = !currentConcluded.includes(currentFloor);
    
    let updatedConcluded = [...currentConcluded];
    if (isNewUnlock) {
      updatedConcluded.push(currentFloor);
    }
    
    // Increment clear counts
    const updatedClears = { ...(saveData.regionClears || {}) };
    updatedClears[currentFloor] = (updatedClears[currentFloor] || 0) + 1;

    const updatedSave: PersistentSaveData = {
      ...saveData,
      concludedRegions: updatedConcluded,
      regionClears: updatedClears,
      highestFloorReached: Math.max(saveData.highestFloorReached || 1, currentFloor + 1)
    };
    
    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
    
    bossDefeatedProcessedRef.current = false;
    portalActiveRef.current = false;
    nearPortalRef.current = false;
    setIsNearPortal(false);
    isRestRoomRef.current = false;
    greedyPathOfferedRef.current = false;
    isGreedyFloorRef.current = false;
    floorCombatTimerRef.current = 0;
    corruptionMistActiveRef.current = false;
    
    climbBonusMultRef.current += 0.20;

    gameStateRef.current = GameState.REGION_SELECT;
    setCurrentGameState(GameState.REGION_SELECT);
  };

  const rollFloorRewardChest = () => {
    const currentFloor = floorRef.current;
    
    // Find region node details to get bossName
    const regionNode = REGION_TREE_NODES.find(n => n.floorNumber === currentFloor);
    const bossName = regionNode?.bossName || 'Crystal Golias';

    const freshSave = SaveManager.loadSave();

    // Check if we already have an active loot draft for this floor in the save file
    if (freshSave.activeLootDraft && freshSave.activeLootDraft.floor === currentFloor) {
      setActiveLootDraft(freshSave.activeLootDraft);
      setIsLootRewardModalOpen(true);
      return;
    }

    if (activeLootDraft && activeLootDraft.floor === currentFloor) {
      setIsLootRewardModalOpen(true);
      return;
    }

    // Roll a new 3-choice draft or mana crystal cache via the hybrid loot engine
    const draftResult = rollBossRewardDraft(currentFloor, bossName, freshSave);
    const newDraft: ActiveLootDraft = {
      floor: currentFloor,
      bossName,
      isChest: draftResult.isChest,
      offers: draftResult.offers,
      crystalsReward: draftResult.crystalsReward
    };

    const updatedSave: PersistentSaveData = {
      ...freshSave,
      activeLootDraft: newDraft,
      consecutiveBossKillsWithoutChest: draftResult.updatedPity.consecutiveBossKillsWithoutChest,
      consecutiveChestsWithoutLegendary: draftResult.updatedPity.consecutiveChestsWithoutLegendary
    };

    setActiveLootDraft(newDraft);
    setIsLootRewardModalOpen(true);
    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
  };

  const handleSelectLootReward = (chosenItem: EquipmentItem) => {
    const freshSave = SaveManager.loadSave();
    const currentInventory = freshSave.inventory || [];
    const newInventory = [...currentInventory];
    if (!newInventory.some(i => i.id === chosenItem.id)) {
      newInventory.push(chosenItem);
    }
    const updatedDraft = activeLootDraft ? { ...activeLootDraft, pickedIndex: 0 } : null;
    const updatedSave: PersistentSaveData = {
      ...freshSave,
      inventory: newInventory,
      activeLootDraft: updatedDraft
    };
    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
  };

  const handleCollectLootCrystals = (amount: number) => {
    const p = playerRef.current;
    p.crystals = (p.crystals || 0) + amount;
    const freshSave = SaveManager.loadSave();
    const updatedDraft = activeLootDraft ? { ...activeLootDraft, pickedIndex: 0 } : null;
    const updatedSave: PersistentSaveData = {
      ...freshSave,
      activeLootDraft: updatedDraft
    };
    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
  };

  const handleProceedToMapFromLoot = () => {
    setIsLootRewardModalOpen(false);
    setActiveLootDraft(null);
    const freshSave = SaveManager.loadSave();
    const updatedSave: PersistentSaveData = {
      ...freshSave,
      activeLootDraft: null
    };
    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
    handleConcludeRegion();
  };

  const applyAutomaticLevelUpStats = (p: Player) => {
    p.level++;
    p.xp -= p.xpToNextLevel;
    p.xpToNextLevel = Math.floor(p.xpToNextLevel * 1.4);

    // General HP boost & heal
    p.stats.maxHp = Math.round(p.stats.maxHp * 1.05);
    p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + Math.round(p.stats.maxHp * 0.25));

    // Archetype specific automatic stat increases
    switch (p.archetype) {
      case Archetype.ARCHER:
        p.stats.ad = (p.stats.ad || 0) + 3;
        p.stats.critChance = parseFloat(((p.stats.critChance || 0) + 0.02).toFixed(3));
        p.stats.atkSpeed = parseFloat(((p.stats.atkSpeed || 1) + 0.02).toFixed(3));
        break;
      case Archetype.MAGE:
        p.stats.ap = (p.stats.ap || 0) + 4;
        p.stats.armor = (p.stats.armor || 0) + 1;
        p.stats.mr = (p.stats.mr || 0) + 1;
        break;
      case Archetype.VORGAR:
        p.stats.ad = (p.stats.ad || 0) + 3;
        p.stats.armor = (p.stats.armor || 0) + 2;
        p.stats.mr = (p.stats.mr || 0) + 2;
        p.stats.maxHp += 25;
        p.stats.hp += 25;
        break;
      case Archetype.SUMMONER:
        p.stats.ad = (p.stats.ad || 0) + 2;
        p.stats.ap = (p.stats.ap || 0) + 3;
        p.stats.armor = (p.stats.armor || 0) + 1;
        break;
    }

    // Play Level Up SFX & spawn level-up particles
    audioManager.playLevelUpSfx();
    LightweightParticleManager.spawnImpact({
      x: p.x, y: p.y, z: 25, color: '#38bdf8', count: 24, type: 'MAGIC'
    });

    // Display floating screen banner / toast
    hazardToastRef.current = {
      text: `⚡ LEVEL UP! NÍVEL ${p.level} (+ATRIBUTOS AUMENTADOS)`,
      timer: 2.5,
      maxTimer: 2.5
    };
  };

  const handleReturnToVilaFromLoot = () => {
    setIsLootRewardModalOpen(false);
    setActiveLootDraft(null);
    const freshSave = SaveManager.loadSave();
    const updatedSave: PersistentSaveData = {
      ...freshSave,
      activeLootDraft: null
    };
    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);
    handleLeaveTower();
  };

  const handleGreedyPath = () => {
    // Greed Path: Guaranteed Rest Room first, then Greed Floor with 2x crystals!
    isGreedyFloorRef.current = true;
    greedyPathOfferedRef.current = false;
    isRestRoomRef.current = true; // Guaranteed Rest Room before Greed Floor!

    bossDefeatedProcessedRef.current = false;
    portalActiveRef.current = false;
    nearPortalRef.current = false;
    setIsNearPortal(false);
    floorCombatTimerRef.current = 0;
    corruptionMistActiveRef.current = false;

    audioManager.playGreedyPathSfx();
    resetFloor();
    applyRunes(false);
    gameStateRef.current = GameState.TOWER;
  };

  const handleAscendFromRest = () => {
    isRestRoomRef.current = false;
    floorRef.current++;
    bossDefeatedProcessedRef.current = false;
    portalActiveRef.current = false;
    nearPortalRef.current = false;
    setIsNearPortal(false);
    floorCombatTimerRef.current = 0;
    corruptionMistActiveRef.current = false;

    audioManager.playPortalAscendSfx();
    resetFloor();
    applyRunes(false);
    gameStateRef.current = GameState.TOWER;
  };

  const handleLeaveTower = () => {
    const p = playerRef.current;
    const runCrystalsGained = p.crystals || 0;
    p.crystals = 0;

    const updatedSave: PersistentSaveData = {
      ...saveData,
      permanentManaCrystals: (saveData.permanentManaCrystals || 0) + runCrystalsGained,
      highestFloorReached: Math.max(saveData.highestFloorReached || 1, floorRef.current),
      totalRunsCompleted: (saveData.totalRunsCompleted || 0) + 1
    };

    setSaveData(updatedSave);
    SaveManager.saveGame(updatedSave);

    bossDefeatedProcessedRef.current = false;
    portalActiveRef.current = false;
    nearPortalRef.current = false;
    setIsNearPortal(false);
    floorRef.current = 0;
    climbBonusMultRef.current = 1.0;
    greedyPathOfferedRef.current = false;
    isGreedyFloorRef.current = false;
    isRestRoomRef.current = false;
    floorCombatTimerRef.current = 0;
    corruptionMistActiveRef.current = false;
    isLowHpActiveRef.current = false;
    audioManager.stopHeartbeat();

    // Clear mid-run upgrades, level and XP
    p.level = 1;
    p.xp = 0;
    p.xpToNextLevel = 100;
    appliedUpgradesRef.current = [];
    activeRunBlessingsRef.current = [];

    gameStateRef.current = GameState.VILA;
    setCurrentGameState(GameState.VILA);
    resetFloor();
    applyRunes(true);
  };

  const triggerActualGameOver = () => {
    const p = playerRef.current;
    if (!p) return;
    gameStateRef.current = GameState.GAME_OVER;

    let currentRegionName = "Torre de Ecos";
    const currentFloor = floorRef.current;
    const regionNode = REGION_TREE_NODES.find(n => n.floorNumber === currentFloor);
    if (regionNode) {
      currentRegionName = regionNode.regionName;
    }

    if (floorRef.current > 0 || isGreedyFloorRef.current) {
      const gathered = p.crystals || 0;
      const lost = Math.floor(gathered * 0.80);
      const saved = gathered - lost;
      p.crystals = 0;

      const freshSave = SaveManager.loadSave();
      const updatedSave: PersistentSaveData = {
        ...freshSave,
        permanentManaCrystals: (freshSave.permanentManaCrystals || 0) + saved,
        highestFloorReached: Math.max(freshSave.highestFloorReached || 1, floorRef.current),
        totalRunsCompleted: (freshSave.totalRunsCompleted || 0) + 1
      };
      setSaveData(updatedSave);
      SaveManager.saveGame(updatedSave);

      onGameOver({
        floorReached: floorRef.current,
        crystalsGathered: gathered,
        crystalsLost: lost,
        crystalsSaved: saved,
        regionName: currentRegionName,
        timeElapsed: Math.floor(runTimerRef.current),
        monstersDefeated: runKillsRef.current,
        bossesDefeated: [...runBossesDefeatedRef.current],
        hunterClass: p.archetype
      });
    } else {
      saveGame();
      onGameOver();
    }
  };

  const takeDamage = (p: Player, amount: number, type: 'AD' | 'AP') => {
    // Malakar Passive: Soul Sync (25% damage redirected to Iron Guardian if alive)
    if (p.archetype === Archetype.SUMMONER) {
      const guardian = minionsRef.current.find(m => m.type === 'GUARDIAN' && m.hp > 0);
      if (guardian) {
        const redirected = amount * 0.25;
        amount *= 0.75;
        guardian.hp = Math.max(0, guardian.hp - redirected);
        createParticle(guardian.x, guardian.y, 20, '#a855f7', 8, 'IMPACT');
      }
    }
    
    let rawMitigation = type === 'AD' ? (p.stats.armor ?? 0) : (p.stats.mr ?? 0);

    // Vorgar Passive: Baluarte Inquebrável (+80 Armor and +80 MR when active)
    if (p.archetype === Archetype.VORGAR && (p.passiveActiveTimer || 0) > 0) {
      rawMitigation += 80;
    }

    const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
    
    if (mutator) {
      if (mutator.enemyDamageMult !== undefined) {
        amount *= mutator.enemyDamageMult;
      }
      if (mutator.id === 'ANOMALY_VOLCANO') {
        rawMitigation *= 0.8; // Reduce armor/mr by 20%
      }
    }

    const mitigation = Math.max(0, isFinite(rawMitigation) ? rawMitigation : 0);
    const multiplier = 100 / (100 + mitigation);
    const calculatedDmg = amount * multiplier;
    const finalDmg = Math.max(1, isFinite(calculatedDmg) ? calculatedDmg : 1);
    
    // Shield absorption
    if (p.shieldTimer > 0) {
      if (p.shieldAmount && p.shieldAmount > 0) {
        if (finalDmg <= p.shieldAmount) {
          p.shieldAmount -= finalDmg;
          createParticle(p.x, p.y, (p.z || 0) + 20, '#10b981', 8, 'IMPACT');
          return;
        } else {
          const overflow = finalDmg - p.shieldAmount;
          p.shieldAmount = 0;
          p.shieldTimer = 0;
          p.stats.hp = Math.max(0, p.stats.hp - overflow);
        }
      } else {
        // Invulnerability or untracked shield
        return;
      }
    } else {
      p.stats.hp = Math.max(0, p.stats.hp - finalDmg);
    }

    p.hitFlash = 0.2;
    audioManager.playHitSfx();
    
    // Dynamic 2.5D screen shake based on damage ratio
    const dmgRatio = finalDmg / Math.max(1, p.stats.maxHp);
    shakeRef.current = Math.min(24, shakeRef.current + Math.max(8, dmgRatio * 35));
    hitStopRef.current = Math.min(0.08, 0.03 + dmgRatio * 0.08);
    
    if (damageNumbersRef.current.length < 80) {
      damageNumbersRef.current.push({ 
        id: getNextId(), x: p.x, y: p.y, z: p.z + 40, 
        vx: (Math.random()-0.5)*180, vy: (Math.random()-0.5)*180, vz: 280, 
        value: finalDmg, life: 0.9, maxLife: 0.9, isCrit: false, isPlayerDamage: true, color: '#ff3333' 
      });
    }
    if (p.stats.hp <= 0 && !deathSequenceActiveRef.current) {
      // Equipment Passive: Manto das Chamas da Fênix (Ressurreição Lendária 1x por run)
      if (p.equippedUniqueEffects?.has('chest_phoenix_rebirth') && !phoenixRebirthUsedRef.current) {
        phoenixRebirthUsedRef.current = true;
        p.stats.hp = Math.round(p.stats.maxHp * 0.35);
        p.shieldTimer = 3.0;
        shakeRef.current = 28;
        audioManager.playLevelUpSfx();
        hazardToastRef.current = {
          text: '🔥 RENASCIMENTO DA FÊNIX ATIVADO: 35% DE VIDA RESTAURADA E EXPLOSÃO DE CHAMAS!',
          timer: 4.0,
          maxTimer: 4.0
        };

        // Phoenix blastwave dealing AP damage around player
        for (let i = 0; i < 45; i++) {
          const randA = Math.random() * Math.PI * 2;
          const randD = Math.random() * 220;
          createParticle(p.x + Math.cos(randA) * randD, p.y + Math.sin(randA) * randD, 20, '#f97316', 30, 'FIRE');
        }

        enemiesRef.current.forEach(e => {
          if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= 240) {
            damageEnemy(e, (p.stats.ap || 20) * 4.0 + 80, 'AP', p);
            e.stunTimer = 1.0;
            createParticle(e.x, e.y, e.z || 0, '#f97316', 15, 'FIRE');
          }
        });
        return;
      }

      p.stats.hp = 0;
      shakeRef.current = 32;
      deathSequenceActiveRef.current = true;
      deathTimerRef.current = 2.5;
      audioManager.stopHeartbeat();
      isLowHpActiveRef.current = false;

      // Spawn extra spectacular blood and echo particles around the player!
      for (let i = 0; i < 40; i++) {
        createParticle(p.x, p.y, p.z + 10, '#ef4444', 12, 'BLOOD');
      }
    }
  };

  const damageHazard = (h: MapHazard, amount: number, p: Player) => {
    if (h.used || (h.hp !== undefined && h.hp <= 0)) return;
    h.hp = (h.hp ?? 100) - amount;
    const impactColor = h.type === 'EXPLODING_BARREL' ? '#f97316' 
      : (h.type === 'SOUL_BRAZIER' ? '#fbbf24' 
      : (h.type === 'RESONANT_PILLAR' ? '#34d399' 
      : (h.type === 'FROST_CRYSTAL' ? '#38bdf8' : '#a855f7')));
    createParticle(h.x, h.y, 25, impactColor, 10, 'IMPACT');

    if (damageNumbersRef.current.length < 80) {
      damageNumbersRef.current.push({
        id: getNextId(), x: h.x, y: h.y, z: 45,
        vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, vz: 200,
        value: Math.max(1, Math.round(amount)), life: 0.75, maxLife: 0.75, isCrit: false, color: impactColor
      });
    }

    if (h.type === 'EXPLODING_BARREL' && h.hp <= 0 && !h.primed) {
      h.primed = true;
      h.fuseTimer = 0.15;
    } else if (h.hp <= 0) {
      h.used = true;
      h.isActive = false;
      audioManager.playLevelUpSfx();
      shakeRef.current = 24;

      for (let i = 0; i < 25; i++) {
        createParticle(h.x, h.y, 30, impactColor, 18, 'IMPACT');
      }

      const remaining = hazardsRef.current.filter(other => other.type === h.type && !other.used && (other.hp || 0) > 0).length;
      const boss = enemiesRef.current.find(b => b.isBoss && b.hp > 0);
      const objName = h.name || 'OBJETO';

      if (remaining > 0) {
        hazardToastRef.current = {
          text: `💥 ${objName.toUpperCase()} DESTRUÍDO! RESTAM ${remaining} ATIVOS!`,
          timer: 3.5,
          maxTimer: 3.5
        };
        if (boss) {
          boss.isStaggered = true;
          boss.staggerTimer = Math.max(boss.staggerTimer || 0, 2.0);
          boss.state = 'STAGGERED';
          boss.stateTimer = Math.max(boss.stateTimer || 0, 2.0);
        }
      } else {
        hazardToastRef.current = {
          text: `⚡ TODOS OS ${objName.toUpperCase()} FORAM DESTRUÍDOS! O ESCUDO DO CHEFE COLAPSOU (-100% DEFESA / EXAUSTÃO)!`,
          timer: 6.5,
          maxTimer: 6.5
        };
        if (boss) {
          boss.isStaggered = true;
          boss.staggerTimer = 6.5;
          boss.state = 'STAGGERED';
          boss.stateTimer = 6.5;
        }
      }
    }
  };

  const damageEnemy = (e: Enemy, amount: number, type: 'AD' | 'AP', p: Player) => {
    if (e.isFriendly) return;
    
    // Normal guarding state on regular enemies
    if (e.state === 'GUARDING' && !e.isBoss) amount *= 0.35;

    // SHADOW_STALKER: Spectral Step Evasion on hit (35% chance to blink away into shadow)
    if (e.type === 'SHADOW_STALKER' && Math.random() < 0.35 && e.state !== 'WINDUP') {
      const escapeAng = Math.atan2(e.y - p.y, e.x - p.x) + (Math.random() - 0.5) * 0.8;
      e.x += Math.cos(escapeAng) * 90;
      e.y += Math.sin(escapeAng) * 90;
      createParticle(e.x, e.y, 10, '#1e1b4b', 8, 'MAGIC');
    }

    // Floor 7 RESONANT_PILLAR: Takes massive 3x damage during Prismatic Overload, baseline 35% damage without buff
    if (e.type === 'RESONANT_PILLAR') {
      if (p.prismaticCharged) {
        amount *= 3.0;
        createParticle(e.x, e.y, e.z + 15, '#c084fc', 12, 'MAGIC');
      } else {
        amount *= 0.35;
        createParticle(e.x, e.y, e.z + 10, '#8b5cf6', 2, 'IMPACT');
      }
    }

    // Permafrost Warden has 60% damage reduction when attacked from the front
    if (e.type === 'PERMAFROST_WARDEN') {
      amount *= 0.40;
      createParticle(e.x, e.y, 18, '#38bdf8', 4, 'IMPACT');
    }

    const mutator = currentAnomalyRef.current;
    if (mutator) {
      if (type === 'AD' && mutator.playerAdMult !== undefined) {
        amount *= mutator.playerAdMult;
      } else if (type === 'AP' && mutator.playerApMult !== undefined) {
        amount *= mutator.playerApMult;
      }
    }

    // Stagger Break 3x Damage Multiplier!
    if (e.isStaggered) {
      amount *= 3.0;
    }

    // --- AUDIT: BOSS SPECIFIC MECHANICS & FAIR SHIELD REDUCTION ---
    let isPrecisionHit = false;
    let extraCritChance = 0;
    let extraCritDamageMult = 1.0;
    let bossMechanicReduction = 1.0;

    if (e.isBoss) {
      if (e.type === 'BOSS_CRYSTAL_GOLIAS') {
        const activePillars = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
        const activeGuards = enemiesRef.current.filter(g => g.state === 'GUARDING' && g.hp > 0).length;
        let red = 0;
        if (activePillars > 0) red += activePillars * 0.20; // 20% per standing pillar
        if (activeGuards > 0) {
          red += activeGuards * 0.08; // 8% per orbiting golem
          isPrecisionHit = true;
          extraCritChance = 0.50; // Gap strike crit bonus!
          extraCritDamageMult = 1.35;
        }
        bossMechanicReduction = Math.max(0.35, 1.0 - red);
        if (red > 0) createParticle(e.x, e.y, e.z + 20, '#34d399', 4, 'SHIELD');

      } else if (e.type === 'BOSS_CORRUPTED_LEVIATHAN') {
        if (e.state === 'SUBMERGED') {
          bossMechanicReduction = 0; // Underwater submersion
        } else {
          const activeTotems = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
          if (activeTotems > 0) {
            bossMechanicReduction = Math.max(0.40, 1.0 - activeTotems * 0.15); // -15% per totem
            createParticle(e.x, e.y, e.z + 20, '#a855f7', 4, 'SHIELD');
          }
        }

      } else if (e.type === 'BOSS_FORGE_DRAGON') {
        const activeFissures = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
        if (activeFissures > 0) {
          bossMechanicReduction = Math.max(0.40, 1.0 - activeFissures * 0.15); // -15% per fissure
          createParticle(e.x, e.y, e.z + 20, '#f97316', 4, 'SHIELD');
        }

      } else if (e.type === 'BOSS_ARTILLERY_WARLORD') {
        const activeCoils = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
        const activeTurrets = enemiesRef.current.filter(g => g.type === 'CYBER_AUTOMATON' && g.hp > 0).length;
        let red = 0;
        if (activeCoils > 0) red += activeCoils * 0.125;
        if (activeTurrets > 0) red += activeTurrets * 0.15;
        bossMechanicReduction = Math.max(0.35, 1.0 - red);
        if (red > 0) createParticle(e.x, e.y, e.z + 20, '#ef4444', 4, 'SHIELD');

      } else if (e.type === 'BOSS_THUNDER_PHARAOH') {
        const activeSarcophagi = enemiesRef.current.filter(g => g.type === 'TESLA_SARCOPHAGUS' && g.hp > 0).length;
        if (activeSarcophagi > 0) {
          bossMechanicReduction = Math.max(0.35, 1.0 - activeSarcophagi * 0.20); // -20% per active sarcophagus
          createParticle(e.x, e.y, e.z + 20, '#fbbf24', 4, 'SHIELD');
        }

      } else if (e.type === 'BOSS_YETI_OVERLORD') {
        const activeCrystals = enemiesRef.current.filter(g => g.type === 'FROST_CRYSTAL' && g.hp > 0).length;
        if (activeCrystals > 0) {
          bossMechanicReduction = Math.max(0.35, 1.0 - activeCrystals * 0.20); // -20% per crystal
          createParticle(e.x, e.y, e.z + 20, '#38bdf8', 4, 'SHIELD');
        }

      } else if (e.type === 'BOSS_PRIME_COLOSSUS') {
        const activePillars = enemiesRef.current.filter(pil => pil.type === 'RESONANT_PILLAR' && pil.hp > 0).length;
        if (activePillars > 0) {
          bossMechanicReduction = Math.max(0.35, 1.0 - activePillars * 0.20); // -20% per pillar
          createParticle(e.x, e.y, e.z + 20, '#a78bfa', 4, 'SHIELD');
        }

      } else if (e.type === 'BOSS_NIGHT_REAPER') {
        const activeAltars = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
        if (e.customAttackData?.shadowVeil && !e.isStaggered) {
          const veilBonus = activeAltars > 0 ? (activeAltars * 0.08) : 0;
          bossMechanicReduction = Math.max(0.40, 0.70 - veilBonus);
          createParticle(e.x, e.y, e.z + 20, '#4c1d95', 4, 'SHIELD');
        }

      } else if (e.type === 'BOSS_CELESTIAL_EMPEROR') {
        const activeRelics = enemiesRef.current.filter(g => g.type === 'SOLAR_RELIC' && g.hp > 0).length;
        if (e.bossPhase === 2 && activeRelics > 0) {
          bossMechanicReduction = Math.max(0.35, 1.0 - activeRelics * 0.16); // -16% per active relic
          createParticle(e.x, e.y, e.z + 20, '#fbbf24', 4, 'SHIELD');
        } else if (e.bossPhase === 1) {
          bossMechanicReduction = 0.85;
        }

      } else if (e.type === 'BOSS_VOID_SOVEREIGN') {
        const activeVoidCrystals = enemiesRef.current.filter(g => g.type === 'VOID_CRYSTAL' && g.hp > 0).length;
        if (e.bossPhase === 2 && activeVoidCrystals > 0) {
          bossMechanicReduction = Math.max(0.35, 1.0 - activeVoidCrystals * 0.20);
          createParticle(e.x, e.y, e.z + 20, '#7e22ce', 4, 'SHIELD');
        }
      }

      amount *= bossMechanicReduction;
    }

    // Crit
    let isCrit = false;
    if (Math.random() < (p.stats.critChance ?? 0) + (mutator?.critChanceBonus || 0) + extraCritChance) {
      isCrit = true;
      amount *= (p.stats.critDamage ?? 1.5) * extraCritDamageMult;

      // Lyra Talent P-02: Precision Crit Armor Shred
      if (p.unlockedTalents?.has('lyra_p02') && e.armor) {
        e.armor = Math.max(0, e.armor * 0.80);
      }

      // Floor 4 Anomaly: Miasma Venenoso (Golpes críticos causam explosão de veneno contagioso em área)
      if (floorRef.current === 4 || mutator?.id === 'ANOMALY_TOXIC') {
        spawnAcidPool(e.x, e.y, 90, 5.0, amount * 0.35);
        for (let i = 0; i < 8; i++) {
          createParticle(e.x, e.y, 10, '#a3e635', 12, 'MAGIC');
        }
      }
    }

    // Lyra Talent T-03: Ricochete Elétrico (30% chance on hit to ricochet to nearby target)
    if (p.archetype === Archetype.ARCHER && p.unlockedTalents?.has('lyra_t03') && Math.random() < 0.35) {
      const nearest = enemiesRef.current.find(other => other.id !== e.id && other.hp > 0 && Math.hypot(other.x - e.x, other.y - e.y) < 220);
      if (nearest) {
        const ricAngle = Math.atan2(nearest.y - e.y, nearest.x - e.x);
        projectilesRef.current.push(ProjectilePool.acquire({
          x: e.x, y: e.y, z: 20,
          vx: Math.cos(ricAngle) * 950, vy: Math.sin(ricAngle) * 950,
          damage: amount * 0.5, damageType: 'AD', duration: 0.6, radius: 7, type: 'ARROW', color: '#38bdf8', pierce: 0
        }));
        createParticle(e.x, e.y, 20, '#38bdf8', 6, 'IMPACT');
      }
    }

    let mobGuardReduction = 1.0;
    if (e.type === 'SOLAR_PALADIN') {
      // Frontal shield guard
      mobGuardReduction = 0.60;
      createParticle(e.x, e.y, e.z + 10, '#f59e0b', 3, 'IMPACT');
    }

    let effectiveAmount = amount;
    if (p.solarBlessingTimer && p.solarBlessingTimer > 0) {
      effectiveAmount *= 1.30; // +30% Holy Damage from Solar Altar Blessing
    }

    const rawMitigation = type === 'AD' ? (e.armor ?? 0) : (e.mr ?? 0);
    const mitigation = Math.max(0, isFinite(rawMitigation) ? rawMitigation : 0);
    const multiplier = 100 / (100 + mitigation);
    const calculatedDmg = effectiveAmount * multiplier * mobGuardReduction;
    const finalDmg = Math.max(1, isFinite(calculatedDmg) ? calculatedDmg : 1);
    
    e.hp -= finalDmg;
    e.hitFlash = 0.08;

    // Aurelius Boss Phase Transitions
    if (e.isBoss && e.type === 'BOSS_CELESTIAL_EMPEROR') {
      if (e.bossPhase === 1 && e.hp <= e.maxHp * 0.66) {
        e.bossPhase = 2;
        e.x = 0;
        e.y = 0;
        e.z = 15;
        e.state = 'CHANNELING';
        e.stateTimer = 999;
        e.customAttackData = { phase: 2, beamAngle: 0, rotationSpeed: 0.55, beamPulseTimer: 0 };

        // Spawn 4 Solar Relics at 4 cardinal chambers
        const relicCoords = [
          { x: 0, y: -380 }, { x: 0, y: 380 }, { x: -380, y: 0 }, { x: 380, y: 0 }
        ];
        relicCoords.forEach(c => {
          enemiesRef.current.push(EnemyPool.acquire({
            id: getNextId(), x: c.x, y: c.y, z: 0, type: 'SOLAR_RELIC', isBoss: false, isElite: true,
            hp: 450, maxHp: 450, ad: 0, ap: 0, armor: 30, mr: 30, speed: 0, radius: 28, hitboxRadius: 28,
            frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
            windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
            vx: 0, vy: 0, hitFlash: 0, color: '#f59e0b'
          }));
        });

        // Spawn defenders
        spawnEnemy(-180, -180, 'SOLAR_PRIESTESS', true);
        spawnEnemy(180, 180, 'SOLAR_PRIESTESS', true);
        spawnEnemy(-180, 180, 'SOLAR_MONK', false);
        spawnEnemy(180, -180, 'SOLAR_MONK', false);

        shakeRef.current = 28;
        audioManager.playLevelUpSfx();
        hazardToastRef.current = {
          text: '☀️ FASE 2: O DESPERTAR DAS RELÍQUIAS! DESTRUA AS 4 RELÍQUIAS SOLARES (-100% IMUNE)!',
          timer: 8.0,
          maxTimer: 8.0
        };
      } else if (e.bossPhase === 2 && e.hp <= e.maxHp * 0.33) {
        e.bossPhase = 3;
        e.speed *= 1.30;
        e.ad *= 1.25;
        e.ap *= 1.25;
        e.state = 'CHASING';
        e.customAttackData = { phase: 3, supernovaTimer: 8.0 };
        shakeRef.current = 32;
        audioManager.playExplosionSfx();
        hazardToastRef.current = {
          text: '🔥 FASE 3: ASCENSÃO DE SUPERNOVA! AURELIUS LIBEROU TODA A FÚRIA DO SOL!',
          timer: 8.0,
          maxTimer: 8.0
        };
      }
    }

    // Elite Stagger Accumulation (Bosses are immune to break/stagger)
    if (e.isElite && !e.isStaggered && e.maxStagger) {
      const staggerGain = (finalDmg * 0.85) * (isCrit ? 1.5 : 1.0) * (mutator?.staggerBonusMult || 1.0);
      e.stagger = Math.min(e.maxStagger, (e.stagger || 0) + staggerGain);

      if (e.stagger >= e.maxStagger) {
        // TRIGGER STAGGER BREAK!
        e.isStaggered = true;
        e.staggerTimer = 4.0;
        e.state = 'STAGGERED';
        e.stateTimer = 4.0;
        shakeRef.current = 24;
        audioManager.playLevelUpSfx();
        createParticle(e.x, e.y, 40, '#f59e0b', 35, 'IMPACT');

        if (damageNumbersRef.current.length < 80) {
          damageNumbersRef.current.push({
            id: getNextId(), x: e.x, y: e.y, z: e.z + 65,
            vx: 0, vy: -50, vz: 300,
            value: 0, life: 2.0, maxLife: 2.0, isCrit: true, color: '#f59e0b'
          });
        }
      }
    }
    
    // Omnivamp
    if ((p.stats.omnivamp ?? 0) > 0) {
      p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + finalDmg * p.stats.omnivamp);
    }

    if (isCrit) {
      hitStopRef.current = 0.02;
      shakeRef.current = Math.max(shakeRef.current, 5);

      // Equipment Passive: Anel da Fúria Crítica (+15% velocidade de ataque por 3s ao acertar crítico, acumula 3x)
      if (p.equippedUniqueEffects?.has('ring_critical_frenzy')) {
        p.critFrenzyStacks = Math.min(3, (p.critFrenzyStacks || 0) + 1);
        p.critFrenzyTimer = 3.0;
        applyRunes(false, p.stats.hp);
        createParticle(p.x, p.y, 25, '#fbbf24', 6, 'MAGIC');
      }
    }

    if (damageNumbersRef.current.length < 80) {
      const damageColor = isPrecisionHit && isCrit ? '#38bdf8' : (e.isStaggered ? '#fbbf24' : (isCrit ? '#ffea00' : '#ffffff'));
      damageNumbersRef.current.push({ 
        id: getNextId(), x: e.x, y: e.y, z: e.z + 40, 
        vx: (Math.random()-0.5)*180, vy: (Math.random()-0.5)*180, vz: isCrit ? 500 : 260, 
        value: finalDmg, life: isCrit ? 1.2 : 0.85, maxLife: isCrit ? 1.2 : 0.85, 
        isCrit: isCrit || e.isStaggered || isPrecisionHit, color: damageColor
      });
      if (isPrecisionHit && isCrit) {
        createParticle(e.x, e.y, e.z + 20, '#38bdf8', 8, 'IMPACT');
      }
    }

    if (e.hp <= 0) {
      if (!e.isFriendly && e.type !== 'RESONANT_PILLAR' && e.type !== 'SOLAR_RELIC' && e.type !== 'FROST_CRYSTAL') {
        runKillsRef.current++;
      }
      if (e.type === 'RESONANT_PILLAR') {
        const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_PRIME_COLOSSUS');
        if (boss) {
          const remainingPillars = enemiesRef.current.filter(g => g.type === 'RESONANT_PILLAR' && g.hp > 0 && g.id !== e.id).length;
          if (remainingPillars === 0) {
            // No pillars left! Stagger the boss!
            boss.isStaggered = true;
            boss.staggerTimer = 7.0; // 7 seconds of stagger vulnerability!
            boss.state = 'STAGGERED';
            boss.stateTimer = 7.0;
            shakeRef.current = 32;
            audioManager.playLevelUpSfx();
            hazardToastRef.current = {
              text: '⚡ TODOS OS PILARES DESTRUÍDOS! O COLOSSO PRIMORDIAL ENTROU EM EXAUSTÃO (-90% DEFESAS / +100% CRÍTICO)!',
              timer: 7.0,
              maxTimer: 7.0
            };
            for (let i = 0; i < 40; i++) {
              createParticle(boss.x, boss.y, 45, '#a78bfa', 30, 'IMPACT');
            }
          } else {
            // Inform remaining pillars
            hazardToastRef.current = {
              text: `💥 PILAR DESTRUÍDO! RESTAM ${remainingPillars} PILARES RESSUNANTES ATIVOS!`,
              timer: 4.0,
              maxTimer: 4.0
            };
            // Stagger the boss slightly for 2.0 seconds to reward player!
            boss.isStaggered = true;
            boss.staggerTimer = 2.0;
            boss.state = 'STAGGERED';
            boss.stateTimer = 2.0;
            for (let i = 0; i < 15; i++) {
              createParticle(boss.x, boss.y, 35, '#8b5cf6', 15, 'IMPACT');
            }
          }
        }
      } else if (e.type === 'SOLAR_RELIC') {
        // Refill player dash charges
        p.dashCharges = SKILL_CONFIG[p.archetype].dashChargesMax;
        // Holy explosion damaging nearby monsters
        enemiesRef.current.forEach(other => {
          if (other.id !== e.id && other.hp > 0 && !other.isFriendly) {
            if (Math.hypot(other.x - e.x, other.y - e.y) < 260) {
              other.hp -= 150;
              createParticle(other.x, other.y, 20, '#fbbf24', 15, 'IMPACT');
            }
          }
        });
        const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_CELESTIAL_EMPEROR');
        if (boss) {
          const remainingRelics = enemiesRef.current.filter(g => g.type === 'SOLAR_RELIC' && g.hp > 0 && g.id !== e.id).length;
          if (remainingRelics === 0) {
            boss.isStaggered = true;
            boss.staggerTimer = 7.0;
            boss.state = 'STAGGERED';
            boss.stateTimer = 7.0;
            shakeRef.current = 32;
            audioManager.playLevelUpSfx();
            hazardToastRef.current = {
              text: '💥 TODAS AS RELÍQUIAS FORAM DESTRUÍDAS! AURELIUS ENTROU EM EXAUSTÃO DIVINA (-80% DEFESAS)!',
              timer: 7.0,
              maxTimer: 7.0
            };
            for (let i = 0; i < 40; i++) {
              createParticle(boss.x, boss.y, 45, '#fbbf24', 30, 'IMPACT');
            }
          } else {
            hazardToastRef.current = {
              text: `💥 RELÍQUIA DESTRUÍDA! RESTAM ${remainingRelics} RELÍQUIAS SOLARES ATIVAS!`,
              timer: 4.0,
              maxTimer: 4.0
            };
            boss.isStaggered = true;
            boss.staggerTimer = 1.8;
            boss.state = 'STAGGERED';
            boss.stateTimer = 1.8;
            for (let i = 0; i < 15; i++) {
              createParticle(boss.x, boss.y, 35, '#f59e0b', 15, 'IMPACT');
            }
          }
        }
      } else if (e.type === 'TESLA_SARCOPHAGUS') {
        const remaining = enemiesRef.current.filter(g => g.type === 'TESLA_SARCOPHAGUS' && g.hp > 0 && g.id !== e.id).length;
        const pharaoh = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_THUNDER_PHARAOH');
        shakeRef.current = 24;
        audioManager.playLevelUpSfx();
        for (let i = 0; i < 20; i++) {
          createParticle(e.x, e.y, 25, '#fbbf24', 15, 'IMPACT');
        }
        if (remaining === 0) {
          if (pharaoh) {
            pharaoh.isStaggered = true;
            pharaoh.staggerTimer = 7.0;
            pharaoh.state = 'STUNNED';
            pharaoh.stateTimer = 7.0;
            hazardToastRef.current = {
              text: '💥 TODOS OS SARCOFAGOS FORAM DESTRUÍDOS! O FARAÓ ESTÁ ATORDUADO E TOTALMENTE EXPOSTO!',
              timer: 7.0,
              maxTimer: 7.0
            };
          }
        } else {
          hazardToastRef.current = {
            text: `⚡ SARCOFAGO TESLA DESTRUÍDO! RESTAM ${remaining} ATIVOS!`,
            timer: 3.5,
            maxTimer: 3.5
          };
          if (pharaoh) {
            pharaoh.isStaggered = true;
            pharaoh.staggerTimer = 2.0;
            pharaoh.state = 'STAGGERED';
            pharaoh.stateTimer = 2.0;
          }
        }
      } else if (e.type === 'FROST_CRYSTAL') {
        const remaining = enemiesRef.current.filter(g => g.type === 'FROST_CRYSTAL' && g.hp > 0 && g.id !== e.id).length;
        const ymir = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_YETI_OVERLORD');
        shakeRef.current = 24;
        audioManager.playLevelUpSfx();
        for (let i = 0; i < 25; i++) {
          createParticle(e.x, e.y, 25, '#38bdf8', 15, 'IMPACT');
        }
        if (remaining === 0) {
          if (ymir) {
            ymir.isStaggered = true;
            ymir.staggerTimer = 6.5;
            ymir.state = 'STAGGERED';
            ymir.stateTimer = 6.5;
            hazardToastRef.current = {
              text: '❄️ TODOS OS CRISTAIS CRIOGÊNICOS FORAM DESTRUÍDOS! YMIR ENTROU EM EXAUSTÃO (-80% DEFESA / 3x DANO)!',
              timer: 6.5,
              maxTimer: 6.5
            };
          }
        } else {
          hazardToastRef.current = {
            text: `❄️ CRISTAL DE GELO DESTRUÍDO! RESTAM ${remaining} CRISTAIS ATIVOS!`,
            timer: 3.5,
            maxTimer: 3.5
          };
          if (ymir) {
            ymir.isStaggered = true;
            ymir.staggerTimer = 2.0;
            ymir.state = 'STAGGERED';
            ymir.stateTimer = 2.0;
          }
        }
      } else if (e.type === 'VOID_CRYSTAL') {
        const remaining = enemiesRef.current.filter(g => g.type === 'VOID_CRYSTAL' && g.hp > 0 && g.id !== e.id).length;
        const voidBoss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_VOID_SOVEREIGN');
        shakeRef.current = 26;
        audioManager.playLevelUpSfx();
        for (let i = 0; i < 25; i++) {
          createParticle(e.x, e.y, 25, '#c084fc', 15, 'IMPACT');
        }
        if (remaining === 0) {
          if (voidBoss) {
            voidBoss.isStaggered = true;
            voidBoss.staggerTimer = 7.0;
            voidBoss.state = 'STAGGERED';
            voidBoss.stateTimer = 7.0;
            hazardToastRef.current = {
              text: '🔮 TODOS OS CRISTAIS DE ENTROPIA FORAM DESTRUÍDOS! O HORIZONTE DE EVENTOS COLAPSOU (-80% DEFESA)!',
              timer: 7.0,
              maxTimer: 7.0
            };
          }
        } else {
          hazardToastRef.current = {
            text: `🔮 CRISTAL DE ENTROPIA DESTRUÍDO! RESTAM ${remaining} CRISTAIS ATIVOS!`,
            timer: 3.5,
            maxTimer: 3.5
          };
          if (voidBoss) {
            voidBoss.isStaggered = true;
            voidBoss.staggerTimer = 2.0;
            voidBoss.state = 'STAGGERED';
            voidBoss.stateTimer = 2.0;
          }
        }
      }

      if (e.isBoss) {
        handleBossDefeated(e);
      } else if (e.isElite) {
        shakeRef.current = Math.max(shakeRef.current, 9);
      }
      createParticle(e.x, e.y, e.z, e.color || '#ef4444', e.isBoss ? 50 : 10);

      // Earn Run Tower Gold / Mana Crystals
      const baseGold = e.isBoss ? 60 : (e.isElite ? 10 : 1);
      let earnedGold = baseGold;
      const mutator = currentAnomalyRef.current;
      if (mutator && mutator.manaCrystalsMult !== undefined) {
        earnedGold = Math.floor(earnedGold * mutator.manaCrystalsMult);
      }
      p.crystals += earnedGold;

      // Drop XP Orb
      if (!e.isBoss) {
        xpOrbsRef.current.push({
          id: getNextId(), x: e.x, y: e.y, z: 20,
          vx: (Math.random()-0.5)*200, vy: (Math.random()-0.5)*200, vz: 300,
          value: e.isElite ? 50 : 10
        });
      }

      // Equipment Passive: Amuleto da Sombra Vampírica (Cura 15 HP ao abater inimigos)
      if (p.equippedUniqueEffects?.has('amulet_vampiric_shadow')) {
        p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + 15);
        createParticle(p.x, p.y, p.z + 20, '#10b981', 8, 'MAGIC');
      }

      // Equipment Passive: Cinto da Colheita de Almas (+0.5% AP cumulativo permanente por abate na run)
      if (p.equippedUniqueEffects?.has('belt_soul_harvest')) {
        p.stats.ap = parseFloat((p.stats.ap * 1.005).toFixed(3));
        createParticle(p.x, p.y, p.z + 15, '#c084fc', 6, 'MAGIC');
      }

      // Equipment Passive: Anel da Mana Eterna (Restaura 0.5s de recarga em todas as habilidades por abate)
      if (p.equippedUniqueEffects?.has('ring_eternal_mana')) {
        p.skill1Timer = Math.max(0, p.skill1Timer - 0.5);
        p.skill2Timer = Math.max(0, p.skill2Timer - 0.5);
        p.skill3Timer = Math.max(0, p.skill3Timer - 0.5);
        createParticle(p.x, p.y, p.z + 25, '#38bdf8', 6, 'MAGIC');
      }

      // Equipment Passive: Malakar Necrotic Harvest (Recupera 5% HP dos lacaios ao abater)
      if (p.equippedUniqueEffects?.has('summoner_necrotic_harvest') && minionsRef.current.length > 0) {
        minionsRef.current.forEach(m => {
          if (m.state !== 'DEAD') {
            m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.05);
            createParticle(m.x, m.y, 20, '#a855f7', 8, 'MAGIC');
          }
        });
      }

      if (!e.isBoss) {
        if (e.isElite) {
          if (Math.random() < 0.10) p.crystals += 2;
        } else {
          if (Math.random() < 0.01) p.crystals += 1;
        }
      }
    }
  };

  // --- ACTIONS ---
  const useDash = () => {
    const p = playerRef.current;
    const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
    const currentMap = getFloorMap(isVila ? 0 : floorRef.current);
    const angle = Math.atan2(mouseWorldRef.current.y - p.y, mouseWorldRef.current.x - p.x);
    audioManager.playDashSfx();
    
    if (p.archetype === Archetype.MAGE) {
      // Blink
      const targetX = p.x + Math.cos(angle) * 320;
      const targetY = p.y + Math.sin(angle) * 320;
      const resolved = resolveMovement(p.x, p.y, targetX, targetY, 15, currentMap);
      p.x = resolved.x;
      p.y = resolved.y;
      createParticle(p.x, p.y, 10, '#a855f7', 18, 'MAGIC');

      // Kael Talent: Barrier / Distortion Shield on Dash (S-01, S-03, K-01, K-02)
      if (p.unlockedTalents?.has('kael_s01') || p.unlockedTalents?.has('kael_s03') || p.unlockedTalents?.has('kael_k01') || p.unlockedTalents?.has('kael_k02')) {
        p.shieldTimer = 3.5;
        createParticle(p.x, p.y, 25, '#38bdf8', 15, 'MAGIC');
      }
    } else if (p.archetype === Archetype.VORGAR) {
      // Vorgar: Investida Inexorável - Heavy Armored Bull Charge with Enemy Trample
      const dist = 200;
      const targetX = p.x + Math.cos(angle) * dist;
      const targetY = p.y + Math.sin(angle) * dist;
      const resolved = resolveMovement(p.x, p.y, targetX, targetY, 20, currentMap);
      const movedX = resolved.x - p.x;
      const movedY = resolved.y - p.y;
      p.x = resolved.x;
      p.y = resolved.y;
      p.slowTimer = 0; // Cleanses slows
      shakeRef.current = Math.max(shakeRef.current, 8); // Heavy colossus landing impact

      // Heavy green/metallic shockwave trail
      for (let i = 0; i < 7; i++) {
        createParticle(p.x - (movedX * 0.15 * i), p.y - (movedY * 0.15 * i), 15, '#10b981', 12, 'IMPACT');
      }

      // Trample damage & knock aside enemies caught in charge path
      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d <= 95) {
            damageEnemy(e, p.stats.ad * 0.85, 'AD', p);
            e.slowTimer = 1.0;
            createParticle(e.x, e.y, e.z || 0, '#34d399', 8, 'IMPACT');
          }
        }
      });
    } else if (p.archetype === Archetype.SUMMONER) {
      // Malakar: Salto de Névoa Astral - Deslize etéreo que deixa uma névoa espectral de despistamento
      const startX = p.x;
      const startY = p.y;
      const dist = 280;
      const targetX = p.x + Math.cos(angle) * dist;
      const targetY = p.y + Math.sin(angle) * dist;
      const resolved = resolveMovement(p.x, p.y, targetX, targetY, 15, currentMap);
      p.x = resolved.x;
      p.y = resolved.y;
      p.slowTimer = 0;
      // Névoa astral de partículas espectrais
      for (let i = 0; i < 10; i++) {
        createParticle(startX, startY, 15, '#a855f7', 15, 'MAGIC');
        createParticle(p.x, p.y, 15, '#c084fc', 10, 'MAGIC');
      }
      // Provocação/confusão rápida nos monstros próximos ao ponto de origem
      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - startX, e.y - startY) < 280) {
          e.stunTimer = Math.max(e.stunTimer || 0, 0.4);
          createParticle(e.x, e.y, e.z || 0, '#c084fc', 6, 'IMPACT');
        }
      });
    } else {
      // Archer Dash (Lyra)
      const dist = 320;
      const targetX = p.x + Math.cos(angle) * dist;
      const targetY = p.y + Math.sin(angle) * dist;
      const resolved = resolveMovement(p.x, p.y, targetX, targetY, 15, currentMap);
      const movedX = resolved.x - p.x;
      const movedY = resolved.y - p.y;
      p.x = resolved.x;
      p.y = resolved.y;
      for(let i=0; i<5; i++) createParticle(p.x - (movedX * 0.1 * i), p.y - (movedY * 0.1 * i), 10, p.color, 8, 'TRAIL');

      // Lyra Talent: Soberana do Campo (S-02) / Speed surge on dash
      if (p.unlockedTalents?.has('lyra_s02') || p.unlockedTalents?.has('lyra_p06')) {
        p.slowTimer = 0;
        createParticle(p.x, p.y, 15, '#34d399', 12, 'TRAIL');
      }
    }

    // Equipment Passive: Pluma Rúnica do Zéfiro (35% de velocidade de movimento por 2s após dash)
    if (p.equippedUniqueEffects?.has('amulet_dash_haste')) {
      p.slowTimer = 0;
      createParticle(p.x, p.y, 15, '#38bdf8', 10, 'TRAIL');
    }
  };

  const useSkillQ = (tx?: number, ty?: number) => {
    const p = playerRef.current;
    const spawnDist = 30; // Offset to prevent green box overlap
    shakeRef.current = Math.max(shakeRef.current, p.archetype === Archetype.ARCHER ? 6 : 14);
    
    if (p.archetype === Archetype.ARCHER) {
      audioManager.playAttackSfx(p.archetype);
      const angle = Math.atan2(mouseWorldRef.current.y - p.y, mouseWorldRef.current.x - p.x);
      // Salva de Fótons (T-02): +2 extra arrows & Arc of the Wind (+1 arrow, +20% speed)
      const hasPhotonSalvo = p.unlockedTalents?.has('lyra_t02');
      const hasWindStrike = p.equippedUniqueEffects?.has('archer_wind_strike');
      const bonusArrows = (hasPhotonSalvo ? 2 : 0) + (hasWindStrike ? 1 : 0);
      const count = 5 + (p.projectilesCount - 1) * 2 + bonusArrows;
      const spread = 0.18;
      const startAngle = angle - (Math.floor(count/2) * spread);
      const projSpeed = hasWindStrike ? 1320 : 1100;
      
      for(let i=0; i<count; i++) {
        const a = startAngle + i * spread;
        const spawnX = p.x + Math.cos(a) * spawnDist;
        const spawnY = p.y + Math.sin(a) * spawnDist;
        projectilesRef.current.push(ProjectilePool.acquire({
          x: spawnX, y: spawnY, z: 20,
          vx: Math.cos(a)*projSpeed, vy: Math.sin(a)*projSpeed,
          damage: p.stats.ad * (hasPhotonSalvo ? 1.4 : 1.2),
          damageType: 'AD', duration: 1.1, radius: 8, type: 'ARROW', color: hasWindStrike ? '#38bdf8' : '#e2e8f0', pierce: (p.stats.pierce || 1)
        }));
      }
    } else if (p.archetype === Archetype.VORGAR) {
      // Vorgar Q: Martelo Cataclísmico - Directional Heavy Slam Shockwave (No displacement, Mordekaiser Q style)
      audioManager.playHammerSmashSfx();
      shakeRef.current = Math.max(shakeRef.current, 22);

      const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentMap = getFloorMap(isVila ? 0 : floorRef.current);

      const targetX = tx ?? mouseWorldRef.current.x;
      const targetY = ty ?? mouseWorldRef.current.y;
      const distToTarget = Math.hypot(targetX - p.x, targetY - p.y);
      const angle = Math.atan2(targetY - p.y, targetX - p.x);

      // Turn Vorgar to face attack direction
      p.facing = angle;

      // Max reach of the shockwave impact center (280px)
      const maxReachDist = 280;
      const actualDist = Math.min(distToTarget, maxReachDist);
      const slamCenterX = p.x + Math.cos(angle) * actualDist;
      const slamCenterY = p.y + Math.sin(angle) * actualDist;

      const areaAreaMult = p.unlockedTalents?.has('vorgar_d02') ? 1.30 : 1.0;
      const slamRadius = 120 * areaAreaMult;

      // Fissure shockwave particles connecting Vorgar to impact zone
      const fissureSteps = 12;
      for (let i = 0; i <= fissureSteps; i++) {
        const t = i / fissureSteps;
        const fx = p.x + (slamCenterX - p.x) * t;
        const fy = p.y + (slamCenterY - p.y) * t;
        createParticle(fx, fy, 5, '#10b981', 18, 'IMPACT');
      }

      // Count enemies in blast zone to test Isolation Bonus
      let enemiesInZone: Enemy[] = [];
      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const dist = Math.hypot(e.x - slamCenterX, e.y - slamCenterY);
          if (dist <= slamRadius + (e.hitboxRadius || 15)) {
            enemiesInZone.push(e);
          }
        }
      });

      const isIsolated = enemiesInZone.length === 1;
      const isoMult = isIsolated ? (p.unlockedTalents?.has('vorgar_d05') ? 2.0 : 1.60) : 1.0;
      const executeMult = p.unlockedTalents?.has('vorgar_d03') ? 1.35 : 1.0;
      const baseQDamage = p.stats.ad * 3.8;

      // Visual ground rupture telegraph and dust particles
      telegraphsRef.current.push({
        id: getNextId(),
        x: slamCenterX,
        y: slamCenterY,
        radius: slamRadius,
        duration: 0,
        maxDuration: 0.40,
        color: isIsolated ? 'rgba(239, 68, 68, 0.75)' : 'rgba(16, 185, 129, 0.65)',
        type: 'CIRCLE',
        damage: 0,
        damageType: 'AD',
        sourceId: 'vorgar_hammer_slam'
      });

      // Rock shrapnel and green sparks
      for (let i = 0; i < 20; i++) {
        const randA = Math.random() * Math.PI * 2;
        const randD = Math.random() * slamRadius;
        createParticle(slamCenterX + Math.cos(randA) * randD, slamCenterY + Math.sin(randA) * randD, 18, '#10b981', 25, 'IMPACT');
      }

      enemiesInZone.forEach(e => {
        let finalDmg = baseQDamage * isoMult;
        if (e.hp < e.maxHp * 0.5) finalDmg *= executeMult;
        damageEnemy(e, finalDmg, 'AD', p);
        e.slowTimer = 2.0;
        e.stunTimer = Math.max(e.stunTimer || 0, 0.75);
        e.hitFlash = 0.30;

        // Knock enemies slightly away from impact center
        const eAngle = Math.atan2(e.y - slamCenterY, e.x - slamCenterX);
        const pushPos = resolveMovement(e.x, e.y, e.x + Math.cos(eAngle) * 90, e.y + Math.sin(eAngle) * 90, e.hitboxRadius || 15, currentMap);
        e.x = pushPos.x;
        e.y = pushPos.y;

        createParticle(e.x, e.y, e.z || 0, '#ef4444', 15, 'IMPACT');
      });

    } else if (p.archetype === Archetype.SUMMONER) {
      // Malakar Q: Investida e Convergência de Espíritos no Alvo Almejado (Skillshot AoE)
      const targetX = tx ?? mouseWorldRef.current.x;
      const targetY = ty ?? mouseWorldRef.current.y;

      audioManager.playLevelUpSfx();
      shakeRef.current = Math.max(shakeRef.current, 18);

      const areaMult = p.unlockedTalents?.has('malakar_a02') ? 1.25 : 1.0;
      const qRadius = 220 * areaMult;
      const baseDmg = p.stats.ap * 4.2;

      // 1. If minions don't exist yet, spawn them at target!
      if (minionsRef.current.length === 0) {
        spawnMinionsForPlayer(p);
      }

      // 2. Teleport / Rally both spirits to target coordinates
      minionsRef.current.forEach(m => {
        m.x = targetX + (m.role === 'GUARDIAN' ? -25 : 25);
        m.y = targetY + (m.role === 'GUARDIAN' ? -25 : 25);
        m.state = 'ENGAGED';
        m.hp = m.maxHp; // Heal to full on convergence
        m.hitFlash = 0.25;
        m.deathTimer = 0;
        createParticle(m.x, m.y, 20, m.color, 30, 'MAGIC');
      });

      // 3. Impact Shockwave Burst at (targetX, targetY)
      createParticle(targetX, targetY, 25, '#a855f7', 45, 'MAGIC');

      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const d = Math.hypot(e.x - targetX, e.y - targetY);
          if (d <= qRadius + (e.hitboxRadius || 15)) {
            damageEnemy(e, baseDmg, 'AP', p);
            e.stunTimer = Math.max(e.stunTimer || 0, 1.5);
            e.hitFlash = 0.25;
            createParticle(e.x, e.y, e.z || 0, '#c084fc', 12, 'IMPACT');
          }
        }
      });

      // 4. Soul Shield for Malakar if near target
      const distToMalakar = Math.hypot(p.x - targetX, p.y - targetY);
      if (distToMalakar <= 300) {
        p.shieldTimer = 5.0;
        createParticle(p.x, p.y, 25, '#a855f7', 20, 'HEAL');
      }

      telegraphsRef.current.push({
        id: getNextId(),
        x: targetX, y: targetY,
        radius: qRadius,
        duration: 0, maxDuration: 0.35,
        color: 'rgba(168, 85, 247, 0.55)', type: 'CIRCLE', damage: 0, damageType: 'AP', sourceId: 'player_convergencia_espiritual'
      });

    } else {
      // Kael Nova Cósmica Q: Detonação Arcana Esférica no Local do Cursor com Onda de Choque, Repulsão e Atordoamento
      audioManager.playAttackSfx(p.archetype);
      const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
      const anomalyRadiusMult = (mutator && mutator.skillRadiusMult !== undefined) ? mutator.skillRadiusMult : 1.0;
      
      const destBonus = (p.unlockedTalents?.has('kael_d01') || p.unlockedTalents?.has('kael_d02') || p.unlockedTalents?.has('kael_d03') || p.unlockedTalents?.has('kael_k01') || p.unlockedTalents?.has('kael_k02')) ? 1.35 : 1.0;
      const dmgBonus = (p.unlockedTalents?.has('kael_d02') || p.unlockedTalents?.has('kael_k01')) ? 1.3 : 1.0;

      const hasArcaneEcho = p.equippedUniqueEffects?.has('mage_arcane_echo');
      const novaRadius = 220 * (p.stats.skillRadiusMult || 1.0) * anomalyRadiusMult * destBonus * (hasArcaneEcho ? 1.25 : 1.0);
      const novaDamage = p.stats.ap * 2.8 * dmgBonus;

      shakeRef.current = Math.max(shakeRef.current, 16);

      // Coordenadas Alvo no Cursor do Mouse (limitadas ao alcance máximo de conjuração de 520px)
      const rawTargetX = tx ?? mouseWorldRef.current.x;
      const rawTargetY = ty ?? mouseWorldRef.current.y;
      const distToTarget = Math.hypot(rawTargetX - p.x, rawTargetY - p.y);
      const maxCastDist = 520;
      const actualDist = Math.min(distToTarget, maxCastDist);
      const castAngle = Math.atan2(rawTargetY - p.y, rawTargetX - p.x);
      const targetX = p.x + Math.cos(castAngle) * actualDist;
      const targetY = p.y + Math.sin(castAngle) * actualDist;

      // Trajetória e Feixe de Magia Cósmica conectando Kael ao Epicentro
      const raySteps = 10;
      for (let i = 0; i <= raySteps; i++) {
        const t = i / raySteps;
        createParticle(p.x + (targetX - p.x) * t, p.y + (targetY - p.y) * t, 12, '#c084fc', 8, 'MAGIC');
      }

      // Detonação de partículas estelares no local do mouse (targetX, targetY)
      createParticle(targetX, targetY, 25, '#c084fc', 35, 'MAGIC');
      createParticle(targetX, targetY, 30, '#38bdf8', 25, 'MAGIC');
      if (hasArcaneEcho) {
        createParticle(targetX, targetY, 35, '#e879f9', 25, 'MAGIC');
      }

      // Passiva do Kael: Escudo Singular (gera barreira mágica ao conjurar habilidades)
      p.shieldTimer = Math.max(p.shieldTimer || 0, 4.0);
      createParticle(p.x, p.y, 25, '#c084fc', 14, 'MAGIC');

      // Immediate Spherical Shockwave at Target Location
      const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentMap = getFloorMap(isVila ? 0 : floorRef.current);

      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const dist = Math.hypot(e.x - targetX, e.y - targetY);
          if (dist <= novaRadius + (e.hitboxRadius || 15)) {
            damageEnemy(e, novaDamage, 'AP', p);
            
            // Knockback away from Target Nova Center
            const kbAngle = dist > 0 ? Math.atan2(e.y - targetY, e.x - targetX) : Math.random() * Math.PI * 2;
            const kbDist = 140 * destBonus;
            const resolved = resolveMovement(e.x, e.y, e.x + Math.cos(kbAngle) * kbDist, e.y + Math.sin(kbAngle) * kbDist, e.hitboxRadius || 15, currentMap);
            e.x = resolved.x;
            e.y = resolved.y;
            e.slowTimer = 1.5;
            e.stunTimer = Math.max(e.stunTimer || 0, 0.6);
            e.hitFlash = 0.25;
            createParticle(e.x, e.y, e.z || 0, '#e879f9', 8, 'IMPACT');
          }
        }
      });

      // Visual Telegraph Wave at Target Location
      telegraphsRef.current.push({
        id: getNextId(),
        x: targetX,
        y: targetY,
        radius: novaRadius,
        duration: 0,
        maxDuration: 0.35,
        color: 'rgba(192, 132, 252, 0.60)',
        type: 'CIRCLE',
        damage: 0,
        damageType: 'AP',
        sourceId: 'player_nova'
      });
    }
  };

  const useSkillW = (tx?: number, ty?: number) => {
    const p = playerRef.current;
    shakeRef.current = Math.max(shakeRef.current, p.archetype === Archetype.ARCHER ? 12 : 15);
    
    if (p.archetype === Archetype.ARCHER) {
      audioManager.playAttackSfx(p.archetype);
      // Disparo Perfurante Sombrio - Ultra high-speed piercing sniper laser
      const angle = Math.atan2(mouseWorldRef.current.y - p.y, mouseWorldRef.current.x - p.x);
      const spawnDist = 35;
      const spawnX = p.x + Math.cos(angle) * spawnDist;
      const spawnY = p.y + Math.sin(angle) * spawnDist;
      
      createParticle(p.x, p.y, 20, '#00e5ff', 20, 'MAGIC');
      
      // Flecha Pesada (P-03): +25% bonus damage
      const hasHeavyArrow = p.unlockedTalents?.has('lyra_p03');
      const dmgMult = hasHeavyArrow ? 1.25 : 1.0;

      projectilesRef.current.push(ProjectilePool.acquire({
        x: spawnX,
        y: spawnY,
        z: 20,
        vx: Math.cos(angle) * 1600,
        vy: Math.sin(angle) * 1600,
        damage: p.stats.ad * 2.8 * dmgMult,
        damageType: 'AD',
        duration: 1.3,
        radius: 20,
        type: 'BEAM_ARROW',
        color: '#00f0ff',
        pierce: 999
      }));
      
      // Line beam particles starting at spawn distance to full length
      for (let step = 1; step <= 12; step++) {
        const px = p.x + Math.cos(angle) * (35 + step * 60);
        const py = p.y + Math.sin(angle) * (35 + step * 60);
        createParticle(px, py, 15, '#38bdf8', 3, 'MAGIC');
      }
    } else if (p.archetype === Archetype.VORGAR) {
      // Vorgar E: Garra da Ruína - Spectral Hook/Pull dragging all enemies into melee range
      audioManager.playIronHookSfx();
      shakeRef.current = Math.max(shakeRef.current, 14);

      const targetX = tx ?? mouseWorldRef.current.x;
      const targetY = ty ?? mouseWorldRef.current.y;
      const angle = Math.atan2(targetY - p.y, targetX - p.x);
      const rangeMult = p.unlockedTalents?.has('vorgar_m01') ? 1.30 : 1.0;
      const hookRange = 380 * rangeMult;
      const hookWidth = 95;
      const stunExtra = p.unlockedTalents?.has('vorgar_m02') ? 0.6 : 0;
      const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentMap = getFloorMap(isVila ? 0 : floorRef.current);

      // Visual line tether effects
      for (let step = 1; step <= 10; step++) {
        const px = p.x + Math.cos(angle) * (step * (hookRange / 10));
        const py = p.y + Math.sin(angle) * (step * (hookRange / 10));
        createParticle(px, py, 15, '#10b981', 4, 'MAGIC');
      }

      let pulledCount = 0;
      const pullTargetDist = 80;
      const pullTargetX = p.x + Math.cos(angle) * pullTargetDist;
      const pullTargetY = p.y + Math.sin(angle) * pullTargetDist;

      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          // Check if enemy is along the hook line segment
          const toEnemyX = e.x - p.x;
          const toEnemyY = e.y - p.y;
          const projDist = toEnemyX * Math.cos(angle) + toEnemyY * Math.sin(angle);
          
          if (projDist > 0 && projDist <= hookRange) {
            const perpDist = Math.abs(-toEnemyX * Math.sin(angle) + toEnemyY * Math.cos(angle));
            if (perpDist <= hookWidth) {
              pulledCount++;
              damageEnemy(e, p.stats.ad * 1.8, 'AD', p);
              
              if (!e.isBoss) {
                // Drag non-boss enemy to Vorgar's front
                const resolved = resolveMovement(e.x, e.y, pullTargetX, pullTargetY, e.hitboxRadius || 15, currentMap);
                e.x = resolved.x;
                e.y = resolved.y;
                e.stunTimer = 0.75 + stunExtra;
              } else {
                // Bosses receive stagger and interrupt
                e.hitFlash = 0.3;
                e.stunTimer = 0.35 + stunExtra;
              }
              
              createParticle(e.x, e.y, e.z || 0, '#34d399', 10, 'IMPACT');
            }
          }
        }
      });

      // Dominion Shield on 2+ targets pulled
      if (pulledCount >= 2 && p.unlockedTalents?.has('vorgar_m04')) {
        p.shieldTimer = 3.0;
        createParticle(p.x, p.y, 25, '#10b981', 15, 'MAGIC');
      }

      // Apex Keystone Combo: Avatar da Ruína Eterna resets Q cooldown
      if (p.unlockedTalents?.has('vorgar_k01')) {
        p.skill1Timer = 0;
        createParticle(p.x, p.y, 30, '#ef4444', 20, 'FIRE');
      }

    } else if (p.archetype === Archetype.SUMMONER) {
      // Malakar E: Invocação Dimensional dos Espíritos no Local Alvo com Provocação & Dano Massivo
      const targetX = tx ?? mouseWorldRef.current.x;
      const targetY = ty ?? mouseWorldRef.current.y;

      audioManager.playDimensionalRuptureSfx();
      shakeRef.current = Math.max(shakeRef.current, 24);

      const areaMult = p.unlockedTalents?.has('malakar_a02') ? 1.35 : 1.0;
      const eRadius = 240 * areaMult;
      const baseDmg = p.stats.ap * 5.5;

      const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentMap = getFloorMap(isVila ? 0 : floorRef.current);

      // 1. Ensure minions exist and manifest/teleport them to (targetX, targetY)
      if (minionsRef.current.length === 0) {
        spawnMinionsForPlayer(p);
      }

      minionsRef.current.forEach(m => {
        m.x = targetX + (m.role === 'GUARDIAN' ? -30 : 30);
        m.y = targetY + (m.role === 'GUARDIAN' ? -30 : 30);
        m.state = 'ENGAGED';
        m.hp = m.maxHp; // Full restore and revive!
        m.deathTimer = 0;
        m.hitFlash = 0.3;
        createParticle(m.x, m.y, 25, m.color, 35, 'MAGIC');
      });

      // 2. Massive Portal Rupture Impact
      for (let i = 0; i < 35; i++) {
        const randA = Math.random() * Math.PI * 2;
        const randD = Math.random() * eRadius;
        createParticle(targetX + Math.cos(randA) * randD, targetY + Math.sin(randA) * randD, 20, '#38bdf8', 18, 'IMPACT');
      }

      // 3. Damage, Knockback, Stun & PROVOCAÇÃO (TAUNT)
      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const d = Math.hypot(e.x - targetX, e.y - targetY);
          if (d <= eRadius + (e.hitboxRadius || 15)) {
            damageEnemy(e, baseDmg, 'AP', p);
            e.stunTimer = Math.max(e.stunTimer || 0, 1.2);
            e.hitFlash = 0.3;

            // Knockback away from portal center
            const kbAngle = d > 0 ? Math.atan2(e.y - targetY, e.x - targetX) : Math.random() * Math.PI * 2;
            const kbDist = 180 * areaMult;
            const resolved = resolveMovement(e.x, e.y, e.x + Math.cos(kbAngle) * kbDist, e.y + Math.sin(kbAngle) * kbDist, e.hitboxRadius || 15, currentMap);
            e.x = resolved.x;
            e.y = resolved.y;

            createParticle(e.x, e.y, e.z || 0, '#38bdf8', 10, 'IMPACT');
          }
        }
      });

      telegraphsRef.current.push({
        id: getNextId(),
        x: targetX, y: targetY,
        radius: eRadius,
        duration: 0, maxDuration: 0.45,
        color: 'rgba(56, 189, 248, 0.65)', type: 'CIRCLE', damage: 0, damageType: 'AP', sourceId: 'player_invocacao_espiritos'
      });

    } else {
      audioManager.playAttackSfx(p.archetype);
      // Fenda Gravitacional Arcana - Gravitational Singularity Vortex
      const targetX = tx ?? mouseWorldRef.current.x;
      const targetY = ty ?? mouseWorldRef.current.y;
      createParticle(targetX, targetY, 0, '#c084fc', 25, 'MAGIC');
      
      const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
      const anomalyRadiusMult = (mutator && mutator.skillRadiusMult !== undefined) ? mutator.skillRadiusMult : 1.0;

      // Kael Gravity talent bonus (G-01, G-03, K-01, K-02) & Arcane Echo (+25% area)
      const hasArcaneEcho = p.equippedUniqueEffects?.has('mage_arcane_echo');
      const gravBonus = ((p.unlockedTalents?.has('kael_g01') || p.unlockedTalents?.has('kael_g03') || p.unlockedTalents?.has('kael_k01') || p.unlockedTalents?.has('kael_k02')) ? 1.35 : 1.0) * (hasArcaneEcho ? 1.25 : 1.0);

      // Passiva do Kael: Escudo Singular (gera barreira mágica ao conjurar habilidades)
      p.shieldTimer = Math.max(p.shieldTimer || 0, 4.0);
      createParticle(p.x, p.y, 25, '#c084fc', 12, 'MAGIC');

      telegraphsRef.current.push({
        id: getNextId(),
        x: targetX,
        y: targetY,
        radius: 175 * (p.stats.skillRadiusMult || 1.0) * anomalyRadiusMult * gravBonus,
        duration: 0,
        maxDuration: 1.2,
        color: 'rgba(168, 85, 247, 0.45)',
        type: 'CIRCLE',
        damage: p.stats.ap * 2.8,
        damageType: 'AP',
        sourceId: 'player_singularity'
      });

      // Singularity gravitational pull on nearby enemies
      const pullRadius = 320 * gravBonus;
      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const d = Math.hypot(e.x - targetX, e.y - targetY);
          if (d < pullRadius) {
            const pullAngle = Math.atan2(targetY - e.y, targetX - e.x);
            const pullForce = (pullRadius - d) * 0.7;
            e.x += Math.cos(pullAngle) * pullForce;
            e.y += Math.sin(pullAngle) * pullForce;
            e.hitFlash = 0.15;
            createParticle(e.x, e.y, e.z || 0, '#a855f7', 4, 'MAGIC');
          }
        }
      });
    }
  };

  const useSkillR = (tx?: number, ty?: number) => {
    const p = playerRef.current;
    shakeRef.current = Math.max(shakeRef.current, 25);

    if (p.archetype === Archetype.VORGAR) {
      audioManager.playLevelUpSfx();
      p.vorgarRTimer = 10.0;
      p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + 200);
      
      for (let i = 0; i < 35; i++) {
        const randA = Math.random() * Math.PI * 2;
        const randD = Math.random() * 100;
        createParticle(p.x + Math.cos(randA) * randD, p.y + Math.sin(randA) * randD, 20, '#ef4444', 35, 'FIRE');
      }
      
      hazardToastRef.current = {
        text: '🔥 AVATAR DA RUÍNA ATIVADO: RECARGA DE Q REDUZIDA, IMUNIDADE A CONTROLE E ATAQUES MASSIVOS!',
        timer: 4.0,
        maxTimer: 4.0
      };

    } else if (p.archetype === Archetype.ARCHER) {
      audioManager.playDashSfx();
      p.lyraRTimer = 1.5;
      
      for (let i = 0; i < 20; i++) {
        const randA = Math.random() * Math.PI * 2;
        createParticle(p.x + Math.cos(randA) * 15, p.y + Math.sin(randA) * 15, 10, '#374151', 15, 'TRAIL');
      }

      // Mark all enemies on screen
      p.lyraMarkedEnemyIds = [];
      enemiesRef.current.forEach(e => {
        if (!e.isFriendly && e.hp > 0) {
          const dist = Math.hypot(e.x - p.x, e.y - p.y);
          if (dist < 900) {
            p.lyraMarkedEnemyIds?.push(e.id);
            createParticle(e.x, e.y, e.z || 0, '#ef4444', 10, 'IMPACT');
          }
        }
      });

      hazardToastRef.current = {
        text: '🌑 ECLIPSE DO VAZIO: INVISÍVEL E VELOZ! PRÓXIMO ATAQUE DISPARA FLECHAS PERSEGUIDORAS!',
        timer: 4.0,
        maxTimer: 4.0
      };

    } else if (p.archetype === Archetype.MAGE) {
      audioManager.playHammerSmashSfx();
      const targetX = tx ?? mouseWorldRef.current.x;
      const targetY = ty ?? mouseWorldRef.current.y;

      const meteorRadius = 200;
      const meteorDamage = p.stats.ap * 11.5;

      telegraphsRef.current.push({
        id: getNextId(),
        x: targetX,
        y: targetY,
        radius: meteorRadius,
        duration: 0,
        maxDuration: 0.7,
        color: 'rgba(249, 115, 22, 0.75)',
        type: 'CIRCLE',
        damage: meteorDamage,
        damageType: 'AP',
        sourceId: 'player_meteor'
      });

      for (let i = 0; i < 15; i++) {
        const randOffsetAngle = Math.random() * Math.PI * 2;
        const startX = targetX + Math.cos(randOffsetAngle) * 300;
        const startY = targetY + Math.sin(randOffsetAngle) * 300 - 400;
        createParticle(startX, startY, 150, '#f97316', 30, 'FIRE');
      }

      // Passiva do Kael: Escudo Singular (+20% AP como barreira estelar por 5s)
      p.shieldTimer = Math.max(p.shieldTimer || 0, 5.0);
      createParticle(p.x, p.y, 30, '#c084fc', 20, 'MAGIC');

      hazardToastRef.current = {
        text: '☄️ CATACLISMO ESTELAR: EVOCANDO METEORITO MASSIVO!',
        timer: 3.0,
        maxTimer: 3.0
      };

    } else if (p.archetype === Archetype.SUMMONER) {
      audioManager.playLevelUpSfx();
      p.malakarRTimer = 8.0;

      if (minionsRef.current.length === 0) {
        spawnMinionsForPlayer(p);
      }

      minionsRef.current.forEach(m => {
        m.hp = m.maxHp;
        createParticle(m.x, m.y, 20, '#a855f7', 40, 'MAGIC');
      });

      for (let i = 0; i < 30; i++) {
        const randA = Math.random() * Math.PI * 2;
        createParticle(p.x, p.y, 10, '#c084fc', 25, 'MAGIC');
      }

      hazardToastRef.current = {
        text: '💀 EXÉRCITO DAS ALMAS ATIVADO: ESPÍRITOS EM FÚRIA!',
        timer: 4.0,
        maxTimer: 4.0
      };
    }
  };

  const getDynamicUpgrades = (p: Player): Upgrade[] => {
    const pool: Upgrade[] = [];

    // Generic
    pool.push({ id: 'dmg', name: 'Força Bruta', description: '+15% Dano Geral', icon: '💪', apply: (p) => { p.stats.ad *= 1.15; p.stats.ap *= 1.15; } });
    pool.push({ id: 'spd', name: 'Agilidade', description: '+15% Velocidade', icon: '👟', apply: (p) => { p.stats.moveSpeed *= 1.15; } });
    pool.push({ id: 'atk_spd', name: 'Frenesi', description: '+15% Vel. Ataque', icon: '⚔️', apply: (p) => { p.stats.atkSpeed *= 1.15; } });
    pool.push({ id: 'hp', name: 'Vitalidade', description: '+25% Vida Máxima', icon: '❤️', apply: (p) => { p.stats.maxHp *= 1.25; p.stats.hp = p.stats.maxHp; } });

    // Archetype
    if (p.archetype === Archetype.ARCHER) {
      pool.push({ id: 'arch_multi', name: 'Tiro Duplo', description: 'Dispara +1 Flecha', icon: '🏹', apply: (p) => { p.projectilesCount = (p.projectilesCount || 1) + 1; } });
      pool.push({ id: 'arch_pierce', name: 'Flecha Perfurante', description: 'Flechas perfuram +1 inimigo', icon: '🎯', apply: (p) => { p.stats.pierce = (p.stats.pierce || 0) + 1; } });
    } else if (p.archetype === Archetype.MAGE) {
      pool.push({ id: 'mage_multi', name: 'Chuva de Meteoros', description: 'Invoca +1 Meteoro', icon: '☄️', apply: (p) => { p.projectilesCount = (p.projectilesCount || 1) + 1; } });
      pool.push({ id: 'mage_area', name: 'Impacto Massivo', description: '+25% Área de Explosão', icon: '💥', apply: (p) => { p.stats.skillRadiusMult = (p.stats.skillRadiusMult || 1) + 0.25; } });
    } else if (p.archetype === Archetype.VORGAR) {
      pool.push({ id: 'vorgar_cleave', name: 'Varredura Titânica', description: '+30% Dano de Golpe da Marreta', icon: '🔨', apply: (p) => { p.stats.ad *= 1.30; } });
      pool.push({ id: 'vorgar_armor', name: 'Encouraçado', description: '+15 Armadura & +15 MR', icon: '🛡️', apply: (p) => { p.stats.armor += 15; p.stats.mr += 15; } });
      pool.push({ id: 'vorgar_vamp', name: 'Sede Ruinosa', description: '+5% Omnivamp Físico', icon: '🩸', apply: (p) => { p.stats.omnivamp += 0.05; } });
    } else if (p.archetype === Archetype.SUMMONER) {
      pool.push({ id: 'summon_fury', name: 'Fúria da Legião', description: '+25% Dano das Invocações', icon: '🐺', apply: (p) => { p.stats.ap *= 1.25; minionsRef.current.forEach(m => m.ad *= 1.25); } });
      pool.push({ id: 'summon_vitality', name: 'Escudo de Almas', description: '+30% Vida das Invocações', icon: '🛡️', apply: (p) => { minionsRef.current.forEach(m => { m.maxHp *= 1.3; m.hp = m.maxHp; }); } });
      pool.push({ id: 'summon_haste', name: 'Vínculo Acelerado', description: '-25% Tempo de Recarga da Morte', icon: '🌀', apply: (p) => { minionsRef.current.forEach(m => m.maxDeathTimer *= 0.75); } });
    }

    // Shuffle and pick 3
    return pool.sort(() => 0.5 - Math.random()).slice(0, 3);
  };

  // --- ACID POOL SPAWNER ---
  const spawnAcidPool = (x: number, y: number, radius = 75, duration = 6.0, damage = 14) => {
    const dynamicPools = hazardsRef.current.filter(h => h.type === 'ACID_POOL' && (h.maxTimer || 0) < 90000);
    if (dynamicPools.length > 20) {
      const oldest = dynamicPools[0];
      const idx = hazardsRef.current.indexOf(oldest);
      if (idx !== -1) hazardsRef.current.splice(idx, 1);
    }
    hazardsRef.current.push({
      id: getNextId(),
      type: 'ACID_POOL',
      x,
      y,
      radius,
      name: 'Poça de Lodo Ácido',
      description: 'Lodo corrosivo abissal que desacelera e corrói defesas.',
      stateTimer: duration,
      maxTimer: duration,
      isActive: true,
      damage,
      fuseTimer: 0
    });
    createParticle(x, y, 5, '#22c55e', 8, 'IMPACT');
  };

  // --- SPAWNING ---
  const spawnEnemy = (x: number, y: number, type: string, isElite = false) => {
    const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
    const currentMap = getFloorMap(isVila ? 0 : floorRef.current);
    
    // Strict validation: candidate must be well within walkable area and not inside a pillar
    let spawnX = x;
    let spawnY = y;
    const isValid = isPointWalkable(spawnX, spawnY, currentMap, -12) && !getCollidingPillar(spawnX, spawnY, 20, currentMap);
    
    if (!isValid) {
      // Pick a random chamber and place enemy comfortably inside
      let found = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const chamber = currentMap.chambers[Math.floor(Math.random() * currentMap.chambers.length)];
        let cx = chamber.x;
        let cy = chamber.y;
        if (chamber.type === 'CIRCLE') {
          const randAngle = Math.random() * Math.PI * 2;
          const randR = Math.random() * (chamber.radius * 0.7);
          cx += Math.cos(randAngle) * randR;
          cy += Math.sin(randAngle) * randR;
        } else {
          cx += (Math.random() - 0.5) * (chamber.w * 0.7);
          cy += (Math.random() - 0.5) * (chamber.h * 0.7);
        }
        if (isPointWalkable(cx, cy, currentMap, -12) && !getCollidingPillar(cx, cy, 20, currentMap)) {
          spawnX = cx;
          spawnY = cy;
          found = true;
          break;
        }
      }
      if (!found) {
        const safe = getSafeSpawnPoint(currentMap, 20);
        spawnX = safe.x;
        spawnY = safe.y;
      }
    }

    let hp = 100 + floorRef.current * 35;
    let ad = 16 + floorRef.current * 5;
    let ap = ad;
    let speed = 100;
    let radius = 20;
    let color = '#ef4444';
    let attackRange = 60;
    let armor = 10;
    let mr = 10;

    // --- UNIQUE ENEMY ARCHETYPES PER FLOOR ---
    if (type === 'QUARTZ_GOLEM') {
      hp = 360;
      ad = 32;
      speed = 110;
      radius = 28;
      armor = 25;
      mr = 25;
      color = '#10b981'; // Emerald Quartz
      attackRange = 75;
    } else if (type === 'MARSH_JUMPER') {
      hp = 140 + floorRef.current * 28;
      ad = 22;
      speed = 130;
      radius = 22;
      color = '#a855f7'; // Purple-green mire jumper
      attackRange = 60;
    } else if (type === 'SPORE_SPITTER') {
      hp = 115 + floorRef.current * 22;
      ad = 18;
      ap = 24;
      speed = 100;
      radius = 19;
      color = '#10b981'; // Toxic green spitter
      attackRange = 360;
    } else if (type === 'MAGMA_BAT') {
      hp = 70 + floorRef.current * 15;
      ad = 14;
      speed = 125;
      radius = 18;
      color = '#f97316'; // Fiery orange
      attackRange = 80;
    } else if (type === 'CANNON_ARCHER') {
      hp = 130 + floorRef.current * 25;
      ad = 30;
      speed = 90;
      radius = 22;
      color = '#e11d48';
      attackRange = 420;
    } else if (type === 'TESLA_MUMMY') {
      hp = 180 + floorRef.current * 35;
      ad = 24;
      speed = 105;
      radius = 24;
      color = '#f59e0b';
      attackRange = 80;
    } else if (type === 'PERMAFROST_WARDEN') {
      hp = 360 + floorRef.current * 45;
      ad = 32;
      speed = 75;
      radius = 28;
      color = '#0284c7';
      attackRange = 100;
    } else if (type === 'BLIZZARD_WRAITH' || type === 'FROST_WRAITH') {
      hp = 175 + floorRef.current * 28;
      ad = 24;
      speed = 120;
      radius = 22;
      color = '#7dd3fc';
      attackRange = 260;
    } else if (type === 'CRYO_SPIKER') {
      hp = 220 + floorRef.current * 32;
      ad = 36;
      speed = 85;
      radius = 24;
      color = '#0369a1';
      attackRange = 400;
    } else if (type === 'CYBER_AUTOMATON') {
      hp = 260 + floorRef.current * 40;
      ad = 32;
      speed = 85;
      radius = 28;
      color = '#64748b';
      attackRange = 90;
    } else if (type === 'PRISM_SIPHON') {
      hp = 180 + floorRef.current * 25;
      ad = 0;
      ap = 20 + floorRef.current * 4;
      speed = 105;
      radius = 18;
      color = '#c084fc';
      attackRange = 600;
      armor = 15;
      mr = 25;
    } else if (type === 'INERTIA_SENTINEL') {
      hp = 380 + floorRef.current * 45;
      ad = 34 + floorRef.current * 6;
      ap = 0;
      speed = 70;
      radius = 28;
      color = '#475569';
      attackRange = 80;
      armor = 35;
      mr = 15;
    } else if (type === 'SHADOW_STALKER') {
      hp = 300 + floorRef.current * 35;
      ad = 38;
      speed = 130;
      radius = 22;
      color = '#1e1b4b';
      attackRange = 65;
      armor = 20;
      mr = 25;
    } else if (type === 'CRYPT_NECROMANCER') {
      hp = 260 + floorRef.current * 30;
      ad = 0;
      ap = 36 + floorRef.current * 5;
      speed = 85;
      radius = 22;
      color = '#a855f7';
      attackRange = 400;
      armor = 15;
      mr = 35;
    } else if (type === 'GRAVE_EXECUTIONER') {
      hp = 520 + floorRef.current * 55;
      ad = 44 + floorRef.current * 7;
      ap = 0;
      speed = 75;
      radius = 32;
      color = '#334155';
      attackRange = 100;
      armor = 40;
      mr = 30;
    } else if (type === 'SOLAR_MONK') {
      hp = 280 + floorRef.current * 30;
      ad = 34;
      ap = 40;
      speed = 125;
      radius = 22;
      color = '#fbbf24';
      attackRange = 180;
      armor = 25;
      mr = 30;
    } else if (type === 'SOLAR_PALADIN') {
      hp = 500 + floorRef.current * 55;
      ad = 42;
      ap = 20;
      speed = 80;
      radius = 30;
      color = '#d97706';
      attackRange = 120;
      armor = 45;
      mr = 35;
    } else if (type === 'SOLAR_PRIESTESS') {
      hp = 220 + floorRef.current * 25;
      ad = 0;
      ap = 46 + floorRef.current * 5;
      speed = 95;
      radius = 20;
      color = '#fef08a';
      attackRange = 450;
      armor = 15;
      mr = 40;
    } else if (type === 'SOLAR_RELIC') {
      hp = 450;
      ad = 0;
      ap = 0;
      speed = 0;
      radius = 28;
      color = '#f59e0b';
      attackRange = 0;
      armor = 30;
      mr = 30;
    } else if (type === 'VOID_ABERRATION') {
      hp = 420 + floorRef.current * 40;
      ad = 50;
      speed = 115;
      radius = 25;
      color = '#a21caf';
      attackRange = 80;
    } else if (type === 'ENTROPY_BEHEMOTH') {
      hp = 750 + floorRef.current * 70;
      ad = 55;
      speed = 75;
      radius = 36;
      color = '#581c87';
      attackRange = 100;
      armor = 50;
      mr = 35;
    } else if (type === 'RIFT_CALLER') {
      hp = 280 + floorRef.current * 30;
      ad = 0;
      ap = 55 + floorRef.current * 6;
      speed = 90;
      radius = 22;
      color = '#c084fc';
      attackRange = 460;
      armor = 15;
      mr = 45;
    } else if (type === 'VOID_CRYSTAL') {
      hp = 500;
      ad = 0;
      ap = 0;
      speed = 0;
      radius = 30;
      color = '#7e22ce';
      attackRange = 0;
      armor = 30;
      mr = 30;
    } else if (type === 'SLIME') { 
      color = COLORS.slime; 
    } else if (type === 'BAT') { 
      hp *= 0.6; speed *= 1.4; color = '#a855f7'; 
    } else if (type === 'GOLEM') { 
      hp *= 2.5; speed *= 0.6; color = '#57534e'; radius = 30; 
    } else if (type === 'SKELETON') { 
      hp *= 0.8; color = '#e2e8f0'; attackRange = 380;
    }

    if (isElite) {
      hp *= 2.8; ad *= 1.5; speed *= 1.2; radius *= 1.4;
    }

    const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
    if (mutator) {
      if (mutator.enemyHpMult !== undefined) {
        hp *= mutator.enemyHpMult;
      }
      if (mutator.enemySpeedMult !== undefined) {
        speed *= mutator.enemySpeedMult;
      }
    }

    if (isGreedyFloorRef.current) {
      speed *= 1.25;
      ad *= 1.40;
      ap = (ap || ad) * 1.40;
    }

    if (corruptionMistActiveRef.current) {
      speed *= 1.35;
      ad *= 1.30;
      ap = (ap || ad) * 1.30;
    }

    const flankSide = Math.random() < 0.5 ? -1 : 1;
    const flankAngleOffset = (Math.random() * 0.8 + 0.4) * flankSide;
    const roles: ('SURROUND' | 'FLANK' | 'INTERCEPT' | 'DIRECT')[] = ['SURROUND', 'FLANK', 'INTERCEPT', 'DIRECT'];
    const tacticalRole = roles[Math.floor(Math.random() * roles.length)];

    enemiesRef.current.push(EnemyPool.acquire({
      id: getNextId(), x: spawnX, y: spawnY, z: 0, type, isBoss: false, isElite,
      hp, maxHp: hp, ad, ap: ad, armor, mr, speed, radius, hitboxRadius: radius,
      frame: 0, state: 'CHASING', stateTimer: 0, attackRange,
      windupTime: 0.5, recoverTime: 1.0, specialCooldown: 0, specialMaxCooldown: 4.5,
      vx: 0, vy: 0, hitFlash: 0, color,
      flankSide,
      flankAngleOffset,
      tacticalRole
    }));
  };

  const spawnBoss = () => {
    const floor = FLOOR_CONFIGS[floorRef.current - 1] || FLOOR_CONFIGS[0];
    const currentMap = getFloorMap(floorRef.current);
    // Find highest or furthest chamber for boss
    let bossX = 0;
    let bossY = -350;
    if (currentMap.chambers.length > 1) {
      const topChamber = [...currentMap.chambers].sort((a, b) => a.y - b.y)[0];
      bossX = topChamber.x;
      bossY = topChamber.y;
    }

    let hp = 1000;
    let ad = 15;
    let ap = 15;
    let armor = 10;
    let mr = 10;
    let speed = 90;
    let radius = 75;
    let color = '#b91c1c';

    if (floor.boss === 'BOSS_CRYSTAL_GOLIAS') {
      hp = 3200;
      ad = 28;
      ap = 28;
      armor = 20;
      mr = 20;
      speed = 95;
      radius = 75;
      color = '#059669'; // Emerald Crystal Boss
    } else if (floor.boss === 'BOSS_CORRUPTED_LEVIATHAN') {
      hp = 4800;
      ad = 28;
      ap = 28;
      armor = 25;
      mr = 25;
      speed = 105;
      radius = 95;
      color = '#7e22ce'; // Corrupted Leviathan Zhaerith Boss
    } else if (floor.boss === 'BOSS_FORGE_DRAGON') {
      hp = 2500;
      ad = 30;
      ap = 30;
      armor = 22;
      mr = 22;
      speed = 115;
      radius = 110;
      color = '#ea580c'; // Magma Dragon Boss (Ignis)
    } else if (floor.boss === 'BOSS_ARTILLERY_WARLORD') {
      hp = 4200;
      ad = 36;
      ap = 36;
      armor = 25;
      mr = 25;
      speed = 100;
      radius = 85;
      color = '#e11d48'; // Warlord Boss
    } else if (floor.boss === 'BOSS_THUNDER_PHARAOH') {
      hp = 4600;
      ad = 38;
      ap = 38;
      armor = 30;
      mr = 30;
      speed = 110;
      radius = 85;
      color = '#f59e0b'; // Electric Pharaoh Boss
    } else if (floor.boss === 'BOSS_YETI_OVERLORD') {
      hp = 5000;
      ad = 42;
      ap = 42;
      armor = 35;
      mr = 35;
      speed = 90;
      radius = 95;
      color = '#38bdf8'; // Frost Yeti Boss (Ymir)
    } else if (floor.boss === 'BOSS_PRIME_COLOSSUS') {
      hp = 3500;
      ad = 40;
      ap = 40;
      armor = 35;
      mr = 35;
      speed = 90;
      radius = 95;
      color = '#475569'; // Prime Automaton Boss
    } else if (floor.boss === 'BOSS_NIGHT_REAPER') {
      hp = 4200;
      ad = 45;
      ap = 45;
      armor = 30;
      mr = 40;
      speed = 115;
      radius = 85;
      color = '#4c1d95'; // Shadow Reaper Boss
    } else if (floor.boss === 'BOSS_CELESTIAL_EMPEROR') {
      hp = 5000;
      ad = 52;
      ap = 52;
      armor = 40;
      mr = 40;
      speed = 110;
      radius = 90;
      color = '#fbbf24'; // Holy Light Emperor Boss
    } else if (floor.boss === 'BOSS_VOID_SOVEREIGN') {
      hp = 6500;
      ad = 60;
      ap = 60;
      armor = 45;
      mr = 45;
      speed = 120;
      radius = 100;
      color = '#f43f5e'; // Void Sovereign Final Boss
    } else {
      hp = 800 + floorRef.current * 200;
      ad = 15 + floorRef.current * 3;
      ap = 15 + floorRef.current * 3;
      radius = 65 + floorRef.current * 3;
    }

    const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
    if (mutator) {
      if (mutator.enemyHpMult !== undefined) hp *= mutator.enemyHpMult;
      if (mutator.enemySpeedMult !== undefined) speed *= mutator.enemySpeedMult;
    }

    if (isGreedyFloorRef.current) {
      speed *= 1.25;
      ad *= 1.40;
      ap *= 1.40;
    }

    if (corruptionMistActiveRef.current) {
      speed *= 1.35;
      ad *= 1.30;
      ap *= 1.30;
    }

    const maxStagger = Math.floor(hp * 0.35); // 35% of Boss Max HP

    enemiesRef.current.push(EnemyPool.acquire({
      id: 'BOSS', x: bossX, y: bossY, z: 0, type: floor.boss, isBoss: true, isElite: false,
      hp, maxHp: hp, ad, ap, armor, mr, speed, radius, hitboxRadius: radius,
      frame: 0, state: 'CHASING', stateTimer: 0, attackRange: 160,
      windupTime: 0.8, recoverTime: 1.4, specialCooldown: 0, specialMaxCooldown: 3.5,
      vx: 0, vy: 0, hitFlash: 0, color, bossPhase: 1,
      stagger: 0, maxStagger: maxStagger, isStaggered: false, staggerTimer: 0
    }));

    if (floor.boss === 'BOSS_THUNDER_PHARAOH') {
      // Spawn 3 Sarcophagi surrounding the Pharaoh in a triangle
      for (let k = 0; k < 3; k++) {
        const angle = (Math.PI * 2 / 3) * k - Math.PI / 2;
        const dist = 240; // distance from boss
        const sx = bossX + Math.cos(angle) * dist;
        const sy = bossY + Math.sin(angle) * dist;
        enemiesRef.current.push(EnemyPool.acquire({
          id: getNextId(), x: sx, y: sy, z: 0, type: 'TESLA_SARCOPHAGUS', isBoss: false, isElite: true,
          hp: 120, maxHp: 120, ad: 0, ap: 0, armor: 40, mr: 40, speed: 0, radius: 26, hitboxRadius: 26,
          frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
          windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
          vx: 0, vy: 0, hitFlash: 0, color: '#eab308'
        }));
      }
      hazardToastRef.current = {
        text: '⚡ RAMESSÉS: ESCUDO DIVINO ATIVO! FAÇA OS RELÂMPAGOS DO CHEFE ATINGIREM OS 3 SARCOFAGOS TESLA!',
        timer: 8.0,
        maxTimer: 8.0
      };
    } else if (floor.boss === 'BOSS_YETI_OVERLORD') {
      const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_YETI_OVERLORD');
      if (boss) {
        boss.customAttackData = { crystalsActive: true };
      }
      // Spawn 3 Frost Crystals on the 3 outlying platforms
      const crystalPositions = [
        { x: -300, y: -220 }, // NW Platform
        { x: 300, y: -220 },  // NE Platform
        { x: 0, y: 320 }      // South Platform
      ];
      crystalPositions.forEach(pos => {
        enemiesRef.current.push(EnemyPool.acquire({
          id: getNextId(), x: pos.x, y: pos.y, z: 0, type: 'FROST_CRYSTAL', isBoss: false, isElite: true,
          hp: 300, maxHp: 300, ad: 0, ap: 0, armor: 25, mr: 25, speed: 0, radius: 32, hitboxRadius: 32,
          frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
          windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
          vx: 0, vy: 0, hitFlash: 0, color: '#38bdf8'
        }));
      });
      hazardToastRef.current = {
        text: '❄️ YMIR, O COLOSSO DO ZERO ABSOLUTO! DESTRUA OS 3 CRISTAIS NAS PLATAFORMAS (-90% ESCUDO)!',
        timer: 8.0,
        maxTimer: 8.0
      };
    } else if (floor.boss === 'BOSS_PRIME_COLOSSUS') {
      const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_PRIME_COLOSSUS');
      if (boss) {
        boss.customAttackData = { activePillars: 3 };
      }
      // Spawn 3 Resonant Pillars in a triangle around the Colossus
      const pillarAngles = [
        -Math.PI / 2, // North-ish
        Math.PI / 6,   // South-East-ish
        Math.PI * 5 / 6 // South-West-ish
      ];
      pillarAngles.forEach((ang, i) => {
        const dist = 280;
        const px = bossX + Math.cos(ang) * dist;
        const py = bossY + Math.sin(ang) * dist;
        enemiesRef.current.push(EnemyPool.acquire({
          id: getNextId(), x: px, y: py, z: 0, type: 'RESONANT_PILLAR', isBoss: false, isElite: true,
          hp: 400, maxHp: 400, ad: 0, ap: 0, armor: 40, mr: 40, speed: 0, radius: 28, hitboxRadius: 28,
          frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
          windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
          vx: 0, vy: 0, hitFlash: 0, color: '#a78bfa'
        }));
      });
      hazardToastRef.current = {
        text: '⚡ COLOSSO PRIMORDIAL ATIVO! FIQUE NOS NÓDULOS PRISMÁTICOS PARA CARREGAR ENERGIA E DESTRUIR OS PILARES!',
        timer: 8.0,
        maxTimer: 8.0
      };
    } else if (floor.boss === 'BOSS_NIGHT_REAPER') {
      const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_NIGHT_REAPER');
      if (boss) {
        boss.customAttackData = { shadowVeil: true, veilTimer: 0 };
      }
      hazardToastRef.current = {
        text: '☠️ MORS\'THAR, O CEIFADOR NOTURNO! VÉU DAS TREVAS ATIVO (-80% DANO)! ATIVE OS BRASEROS SAGRADOS NAS CRIPTAS!',
        timer: 8.0,
        maxTimer: 8.0
      };
    } else if (floor.boss === 'BOSS_CELESTIAL_EMPEROR') {
      const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_CELESTIAL_EMPEROR');
      if (boss) {
        boss.customAttackData = { phase: 1, solarBladesTimer: 0, supernovaTimer: 12.0, relicCount: 0 };
      }
      hazardToastRef.current = {
        text: '☀️ AURELIUS, O IMPERADOR CELESTIAL! CUIDADO COM AS LÂMINAS DE LUZ E O JULGAMENTO DIVINO!',
        timer: 8.0,
        maxTimer: 8.0
      };
    }
  };

  const spawnMinionsForPlayer = (p: Player) => {
    if (p.archetype !== Archetype.SUMMONER) {
      minionsRef.current = [];
      return;
    }

    if (minionsRef.current.length === 2) return;

    const hasLegionHp = p.unlockedTalents?.has('malakar_l01');
    const hpBonus = hasLegionHp ? 250 : 0;
    const hpKeystone = p.unlockedTalents?.has('malakar_l08') ? 400 : 0;
    const armorBonus = p.unlockedTalents?.has('malakar_l04') ? 25 : 0;
    const adBonus = p.unlockedTalents?.has('malakar_l02') ? 1.35 : 1.0;

    const maxHpGuardian = 1400 + Math.round(p.stats.maxHp * 0.8) + hpBonus + hpKeystone;
    const maxHpPredator = 700 + Math.round(p.stats.maxHp * 0.5) + hpBonus + hpKeystone;

    const adGuardian = Math.round((45 + p.stats.ap * 0.45) * adBonus);
    const adPredator = Math.round((75 + p.stats.ap * 0.70) * adBonus);

    minionsRef.current = [
      {
        id: 'minion_guardian',
        role: 'GUARDIAN',
        name: 'Guardião de Ferro',
        x: p.x - 30,
        y: p.y - 30,
        z: 0,
        hp: maxHpGuardian,
        maxHp: maxHpGuardian,
        ad: adGuardian,
        armor: 45 + Math.round((p.stats.armor || 0) * 0.8) + armorBonus,
        mr: 40 + Math.round((p.stats.mr || 0) * 0.8) + armorBonus,
        speed: 230,
        attackRange: 85,
        attackCd: 0.8,
        attackTimer: 0,
        targetId: null,
        state: 'FOLLOW',
        deathTimer: 0,
        maxDeathTimer: p.unlockedTalents?.has('malakar_l08') ? 4.0 : (p.unlockedTalents?.has('malakar_l03') ? 6.5 : 9.0),
        hitFlash: 0,
        color: '#a855f7',
        size: 24
      },
      {
        id: 'minion_predator',
        role: 'PREDATOR',
        name: 'Fera Predadora',
        x: p.x + 30,
        y: p.y + 30,
        z: 0,
        hp: maxHpPredator,
        maxHp: maxHpPredator,
        ad: adPredator,
        armor: 25 + Math.round((p.stats.armor || 0) * 0.4) + armorBonus,
        mr: 25 + Math.round((p.stats.mr || 0) * 0.4) + armorBonus,
        speed: 310,
        attackRange: 60,
        attackCd: 0.4,
        attackTimer: 0,
        targetId: null,
        state: 'FOLLOW',
        deathTimer: 0,
        maxDeathTimer: p.unlockedTalents?.has('malakar_l08') ? 4.0 : (p.unlockedTalents?.has('malakar_l03') ? 5.5 : 8.0),
        hitFlash: 0,
        color: '#38bdf8',
        size: 18
      }
    ];
  };

  // --- SYSTEMS (ECS SIMPLIFIED) ---
  const systems = {
    minions: (dt: number) => {
      const p = playerRef.current;
      spawnMinionsForPlayer(p);
      if (p.archetype !== Archetype.SUMMONER || minionsRef.current.length === 0) return;

      const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentMap = getFloorMap(isVila ? 0 : floorRef.current);

      minionsRef.current.forEach(m => {
        if (m.hitFlash > 0) m.hitFlash = Math.max(0, m.hitFlash - dt * 5);
        if (m.attackTimer > 0) m.attackTimer = Math.max(0, m.attackTimer - dt);

        // Dynamically update minion AD scaling with player AP
        const adBonus = p.unlockedTalents?.has('malakar_l02') ? 1.35 : 1.0;
        if (m.role === 'GUARDIAN') {
          m.ad = Math.round((45 + p.stats.ap * 0.45) * adBonus);
        } else {
          m.ad = Math.round((75 + p.stats.ap * 0.70) * adBonus);
        }

        if (m.state === 'DEAD') {
          m.deathTimer -= dt;
          if (m.deathTimer <= 0) {
            // Revive Minion
            m.state = 'FOLLOW';
            m.hp = m.maxHp;
            m.x = p.x + (m.role === 'GUARDIAN' ? -25 : 25);
            m.y = p.y + (m.role === 'GUARDIAN' ? -25 : 25);
            createParticle(m.x, m.y, 20, m.color, 25, 'MAGIC');
          }
          return;
        }

        // Guardião de Ferro emits periodic Taunt Aura (Aura de Provocação)
        if (m.role === 'GUARDIAN') {
          enemiesRef.current.forEach(e => {
            if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - m.x, e.y - m.y) <= 260) {
              e.hitFlash = Math.max(e.hitFlash || 0, 0.05);
            }
          });
        }

        // Find closest enemy
        let closestEnemy: Enemy | null = null;
        let closestDist = Infinity;
        enemiesRef.current.forEach(e => {
          if (!e.isFriendly && e.hp > 0) {
            const d = Math.hypot(e.x - m.x, e.y - m.y);
            if (d < closestDist) {
              closestDist = d;
              closestEnemy = e;
            }
          }
        });

        const distToPlayer = Math.hypot(p.x - m.x, p.y - m.y);

        if (distToPlayer > 500) {
          m.x = p.x + (m.role === 'GUARDIAN' ? -25 : 25);
          m.y = p.y + (m.role === 'GUARDIAN' ? -25 : 25);
          m.state = 'FOLLOW';
        } else if (distToPlayer > 350) {
          m.state = 'FOLLOW';
          const angle = Math.atan2(p.y - m.y, p.x - m.x);
          const nextPos = resolveMovement(m.x, m.y, m.x + Math.cos(angle) * m.speed * dt, m.y + Math.sin(angle) * m.speed * dt, m.size, currentMap);
          m.x = nextPos.x;
          m.y = nextPos.y;
        } else if (closestEnemy && closestDist < 350) {
          m.state = 'ENGAGED';
          const enemy = closestEnemy as Enemy;
          const targetAngle = Math.atan2(enemy.y - m.y, enemy.x - m.x);

          if (closestDist > m.attackRange) {
            const nextPos = resolveMovement(m.x, m.y, m.x + Math.cos(targetAngle) * m.speed * dt, m.y + Math.sin(targetAngle) * m.speed * dt, m.size, currentMap);
            m.x = nextPos.x;
            m.y = nextPos.y;
          } else if (m.attackTimer <= 0) {
            m.attackTimer = m.attackCd;

            if (m.role === 'GUARDIAN') {
              // Guardião de Ferro: AoE Cleave attack hitting all enemies in front
              enemiesRef.current.forEach(other => {
                if (!other.isFriendly && other.hp > 0 && Math.hypot(other.x - m.x, other.y - m.y) <= 90) {
                  damageEnemy(other, m.ad, 'AD', p);
                  other.hitFlash = 0.2;
                  createParticle(other.x, other.y, other.z || 0, m.color, 8, 'IMPACT');
                }
              });
            } else {
              // Fera Predadora: Rapid single target strikes with slow & lifesteal
              damageEnemy(enemy, m.ad, 'AD', p);
              enemy.slowTimer = 1.2;
              enemy.hitFlash = 0.2;
              createParticle(enemy.x, enemy.y, enemy.z || 0, m.color, 10, 'IMPACT');

              if (p.unlockedTalents?.has('malakar_p02')) {
                m.hp = Math.min(m.maxHp, m.hp + m.ad * 0.25);
              }
            }
          }
        } else {
          m.state = 'FOLLOW';
          if (distToPlayer > 60) {
            const angle = Math.atan2(p.y - m.y, p.x - m.x);
            const nextPos = resolveMovement(m.x, m.y, m.x + Math.cos(angle) * (m.speed * 0.8) * dt, m.y + Math.sin(angle) * (m.speed * 0.8) * dt, m.size, currentMap);
            m.x = nextPos.x;
            m.y = nextPos.y;
          }
        }
      });
    },
    camera: (dt: number) => {
      const p = playerRef.current;
      const pIso = toIso(p.x, p.y, p.z);
      
      // Smooth follow
      let targetX = -pIso.x; 
      let targetY = -pIso.y;
      
      // Look ahead based on mouse position (subtle)
      const mouseOffsetMult = 0.15;
      targetX -= mouseScreenRef.current.x * mouseOffsetMult;
      targetY -= mouseScreenRef.current.y * mouseOffsetMult;
      
      cameraTargetRef.current.x = targetX;
      cameraTargetRef.current.y = targetY;
      
      const camAlpha = 1 - Math.exp(-8 * dt);
      cameraRef.current.x = lerp(cameraRef.current.x, cameraTargetRef.current.x, camAlpha);
      cameraRef.current.y = lerp(cameraRef.current.y, cameraTargetRef.current.y, camAlpha);
      
      // Responsive Dynamic Zoom for sufficiently long distance across all screen aspect ratios
      const targetZoomRatio = Math.max(0.38, Math.min(0.52, (dimensions.width / 1920) * 0.45));
      let targetZoom = targetZoomRatio * (p.isMoving ? 0.98 : 1.0);
      if (deathSequenceActiveRef.current) {
        targetZoom = targetZoomRatio * 1.85; // Dramatic cinematic close-up zoom!
      }
      const zoomAlpha = 1 - Math.exp(-3 * dt);
      cameraZoomRef.current = lerp(cameraZoomRef.current, targetZoom, zoomAlpha);
    },

    player: (dt: number) => {
      const p = playerRef.current;
      const isVilaState = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentMap = getFloorMap(isVilaState ? 0 : floorRef.current);
      
      if (gameStateRef.current === GameState.TOWER || isVilaState) {
        timeRef.current += dt; waveTimerRef.current += dt;
        
        const cdReductionRate = p.isTetherSiphoned ? 0.50 : 1.0;
        if (p.weaponTimer > 0) p.weaponTimer -= dt;
        if (p.skill1Timer > 0) p.skill1Timer -= dt * cdReductionRate;
        if (p.skill2Timer > 0) p.skill2Timer -= dt * cdReductionRate;
        if (p.skill3Timer > 0) p.skill3Timer -= dt * cdReductionRate;
        if (p.solarBlessingTimer && p.solarBlessingTimer > 0) p.solarBlessingTimer -= dt;
        p.isTetherSiphoned = false; // Reset for next frame check
        if (p.vorgarRTimer && p.vorgarRTimer > 0) p.vorgarRTimer -= dt;
        if (p.lyraRTimer && p.lyraRTimer > 0) p.lyraRTimer -= dt;
        if (p.malakarRTimer && p.malakarRTimer > 0) p.malakarRTimer -= dt;

        // --- RESUNANT METROPOLIS PRISMATIC NODULES CHARGING MECHANIC ---
        if (floorRef.current === 7 && gameStateRef.current === GameState.TOWER && !isRestRoomRef.current) {
          p.prismaticChargeTimer = p.prismaticChargeTimer || 0;
          if (!p.prismaticCharged) {
            const PRISMATIC_NODULES = [{ x: -180, y: -180 }, { x: 180, y: -180 }, { x: 0, y: 180 }];
            let standingOnNodule = false;
            for (let nod of PRISMATIC_NODULES) {
              const dNod = Math.hypot(p.x - nod.x, p.y - nod.y);
              if (dNod < 75) {
                standingOnNodule = true;
                break;
              }
            }

            if (standingOnNodule) {
              p.prismaticChargeTimer += dt;
              if (Math.random() < 0.25) {
                createParticle(p.x, p.y, p.z + 5, '#c084fc', 3, 'MAGIC');
              }
              if (p.prismaticChargeTimer >= 1.2) {
                p.prismaticCharged = true;
                p.prismaticChargeTimer = 8.0; // 8 seconds of Prismatic Overload!
                shakeRef.current = 15;
                audioManager.playLevelUpSfx();
                hazardToastRef.current = {
                  text: '⚡ SOBRECARGA PRISMÁTICA ATIVA (8s)! +200% DANO NOS PILARES RESSUNANTES!',
                  timer: 4.0,
                  maxTimer: 4.0
                };
                for (let i = 0; i < 20; i++) {
                  createParticle(p.x, p.y, p.z + 15, '#c084fc', 12, 'MAGIC');
                }
              }
            } else {
              p.prismaticChargeTimer = Math.max(0, p.prismaticChargeTimer - dt * 0.5); // slowly decay if not standing on it
            }
          } else {
            // Prismatic Overload is active: count down duration
            p.prismaticChargeTimer -= dt;
            if (Math.random() < 0.20) {
              createParticle(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20, p.z + 10, '#c084fc', 2, 'MAGIC');
            }
            if (p.prismaticChargeTimer <= 0) {
              p.prismaticCharged = false;
              p.prismaticChargeTimer = 0;
              hazardToastRef.current = {
                text: '⚡ CARGA PRISMÁTICA ESGOTADA! RECARREGUE NOS NÓDULOS!',
                timer: 2.5,
                maxTimer: 2.5
              };
            }
          }
        }

        // Vorgar R: Crowd Control Immunity (Remove atordoamentos e lentidões)
        if (p.archetype === Archetype.VORGAR && p.vorgarRTimer && p.vorgarRTimer > 0) {
          p.stunTimer = 0;
          p.slowTimer = 0;
        }

        // Malakar R: Disparo de Almas Púrpura teleguiadas
        if (p.archetype === Archetype.SUMMONER && p.malakarRTimer && p.malakarRTimer > 0) {
          p.malakarSoulSpawnTimer = (p.malakarSoulSpawnTimer || 0) - dt;
          if (p.malakarSoulSpawnTimer <= 0) {
            p.malakarSoulSpawnTimer = 0.35;
            const activeEnemies = enemiesRef.current.filter(e => !e.isFriendly && e.hp > 0);
            if (activeEnemies.length > 0) {
              const target = activeEnemies[Math.floor(Math.random() * activeEnemies.length)];
              const angle = Math.atan2(target.y - p.y, target.x - p.x);
              projectilesRef.current.push(ProjectilePool.acquire({
                x: p.x, y: p.y, z: 30,
                vx: Math.cos(angle) * 750, vy: Math.sin(angle) * 750,
                damage: p.stats.ap * 0.95, // 95% do AP de Malakar
                damageType: 'AP',
                duration: 1.5, radius: 12, type: 'SOUL_SKULL',
                color: '#c084fc', pierce: 1
              }));
              createParticle(p.x, p.y, 25, '#c084fc', 4, 'MAGIC');
            }
          }
        }

        if (p.dashTimer > 0) p.dashTimer -= dt;
        if (p.dashRechargeTimer! > 0) p.dashRechargeTimer! -= dt;
        if (p.slotRCd > 0) p.slotRCd -= dt;
        if (p.slotFCd > 0) p.slotFCd -= dt;
        if (p.shieldTimer > 0) p.shieldTimer -= dt;
        if (p.passiveTimer && p.passiveTimer > 0) p.passiveTimer -= dt;
        if (p.passiveActiveTimer && p.passiveActiveTimer > 0) {
          p.passiveActiveTimer -= dt;
          if (p.passiveActiveTimer <= 0) {
            p.passiveActiveTimer = 0;
            if (p.archetype === Archetype.VORGAR) {
              p.shieldTimer = 0;
              p.shieldAmount = 0;
            }
          }
        }

        // Vorgar Passive: Baluarte Inquebrável (Trigger at <=35% HP)
        if (p.archetype === Archetype.VORGAR) {
          if (p.stats.hp / Math.max(1, p.stats.maxHp) <= 0.35 && (p.passiveTimer || 0) <= 0 && (p.passiveActiveTimer || 0) <= 0 && p.stats.hp > 0) {
            p.passiveActiveTimer = 8.0;
            p.passiveActiveDuration = 8.0;
            p.passiveTimer = 45.0;
            p.passiveMaxCooldown = 45.0;
            p.shieldTimer = 8.0;
            p.shieldAmount = p.stats.maxHp * 0.40;
            p.maxShieldAmount = p.stats.maxHp * 0.40;
            audioManager.playLevelUpSfx();
            shakeRef.current = Math.max(shakeRef.current, 20);
            hazardToastRef.current = {
              text: '🛡️ BALUARTE INQUEBRÁVEL ATIVADO: ESCUDO ABSORVENTE (40% HP) & +80 DEFESA!',
              timer: 4.0,
              maxTimer: 4.0
            };
            for (let i = 0; i < 30; i++) {
              const randA = Math.random() * Math.PI * 2;
              createParticle(p.x + Math.cos(randA) * 35, p.y + Math.sin(randA) * 35, 20, '#10b981', 30, 'HEAL');
            }
          }
        }

        if (p.hitFlash > 0) p.hitFlash -= dt;
        if (p.stunTimer > 0) p.stunTimer -= dt;
        if (p.slowTimer > 0) p.slowTimer -= dt;

        // Crit Frenzy Timer decrement
        if (p.critFrenzyTimer && p.critFrenzyTimer > 0) {
          p.critFrenzyTimer -= dt;
          if (p.critFrenzyTimer <= 0) {
            p.critFrenzyStacks = 0;
            applyRunes(false, p.stats.hp);
          }
        }

        if (p.stats.regen > 0) p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + p.stats.regen * dt);

        // --- 8-WAY MOVEMENT SYSTEM (Isometric screen to world projection) ---
        let sx = 0;
        let sy = 0;
        if (p.stunTimer <= 0) {
          if (keysRef.current['KeyW'] || keysRef.current['ArrowUp']) sy -= 1;
          if (keysRef.current['KeyS'] || keysRef.current['ArrowDown']) sy += 1;
          if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft']) sx -= 1;
          if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) sx += 1;
        }
        
        const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;

        // Proximity detection for village structures (Guild, Sanctuary, Portal, Vault)
        if (isVila) {
          const distGuild = Math.hypot(p.x - (-380), p.y - (-140));
          const distSanctuary = Math.hypot(p.x - 380, p.y - (-140));
          const distPortal = Math.hypot(p.x - 0, p.y - (-440));
          const distVault = Math.hypot(p.x - 0, p.y - 180);

          let closeStruct: VillageStructureType | 'PORTAL' | null = null;
          if (distGuild < 140) closeStruct = 'GUILD';
          else if (distSanctuary < 140) closeStruct = 'SANCTUARY';
          else if (distPortal < 130) closeStruct = 'PORTAL';
          else if (distVault < 120) closeStruct = 'VAULT';

          if (nearbyStructureRef.current !== closeStruct) {
            nearbyStructureRef.current = closeStruct;
            setNearbyStructure(closeStruct);
          }

          // Interaction with SPACE or E key in village
          if (keysRef.current['Space'] || keysRef.current['KeyE']) {
            if (closeStruct === 'GUILD' && !activeVillageModal) {
              setActiveVillageModal('GUILD');
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            } else if (closeStruct === 'SANCTUARY' && !activeVillageModal) {
              setActiveVillageModal('SANCTUARY');
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            } else if (closeStruct === 'PORTAL') {
              handleAscendToTower();
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            } else if (closeStruct === 'VAULT' && !activeVillageModal) {
              setActiveVillageModal('VAULT');
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            }
          }
        } else if (isRestRoomRef.current) {
          // In Rest Room: Check Campfire & Portals
          const distCampfire = Math.hypot(p.x - 0, p.y - 0);
          const distVilaPortal = Math.hypot(p.x - (-280), p.y - (-180));
          const distTowerPortal = Math.hypot(p.x - 280, p.y - (-180));

          let closeAction: 'CAMPFIRE' | 'VILA_PORTAL' | 'TOWER_PORTAL' | null = null;
          if (distCampfire < 90) closeAction = 'CAMPFIRE';
          else if (distVilaPortal < 90) closeAction = 'VILA_PORTAL';
          else if (distTowerPortal < 90) closeAction = 'TOWER_PORTAL';

          setNearbyRestAction(closeAction);

          if (keysRef.current['Space'] || keysRef.current['KeyE']) {
            if (closeAction === 'CAMPFIRE') {
              const campfire = hazardsRef.current.find(h => h.id === 'rest_campfire');
              if (campfire && !campfire.used) {
                campfire.used = true;
                const healAmt = Math.round(p.stats.maxHp * 0.80);
                p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + healAmt);
                audioManager.playCampfireRestSfx();
                LightweightParticleManager.spawnImpact({
                  x: p.x, y: p.y, z: 25, color: '#10b981', count: 30, type: 'HEAL'
                });
                hazardToastRef.current = { text: '🔥 FOGUEIRA ANCESTRAL: +80% DE VIDA RESTAURADA!', timer: 3.5, maxTimer: 3.5 };
              }
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            } else if (closeAction === 'VILA_PORTAL') {
              handleLeaveTower();
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            } else if (closeAction === 'TOWER_PORTAL') {
              handleAscendFromRest();
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            }
          }
        } else {
          // In Normal/Greed Tower Floor: Check proximity to interactive hazards
          let closestHazard: MapHazard | null = null;
          let minHDist = Infinity;

          hazardsRef.current.forEach(h => {
            const d = Math.hypot(p.x - h.x, p.y - h.y);
            const interactRange = (h.radius || 30) + 40;
            if (d < interactRange && d < minHDist) {
              minHDist = d;
              closestHazard = h;
            }
          });

          if (nearbyHazardRef.current !== closestHazard) {
            nearbyHazardRef.current = closestHazard;
            setNearbyHazard(closestHazard);
          }

          if (portalActiveRef.current) {
            const dPortal = Math.hypot(p.x - mapPortalPosRef.current.x, p.y - mapPortalPosRef.current.y);
            const isNear = dPortal < 130;
            if (nearPortalRef.current !== isNear) {
              nearPortalRef.current = isNear;
              setIsNearPortal(isNear);
              if (isNear) {
                rollFloorRewardChest();
              }
            }
          }

          if (phasePortalActiveRef.current) {
            const dPhasePortal = Math.hypot(p.x - phasePortalPosRef.current.x, p.y - phasePortalPosRef.current.y);
            const isNearPhase = dPhasePortal < 110;
            if (nearPhasePortalRef.current !== isNearPhase) {
              nearPhasePortalRef.current = isNearPhase;
              setNearPhasePortal(isNearPhase);
            }

            if (isNearPhase && (keysRef.current['Space'] || keysRef.current['KeyE'])) {
              advancePhase();
              keysRef.current['Space'] = false;
              keysRef.current['KeyE'] = false;
            }
          }
        }

        const sLen = Math.hypot(sx, sy);
        if (sLen > 0) {
          // Normalize screen displacement for uniform 8-way speed
          const normSx = sx / sLen;
          const normSy = sy / sLen;

          // Convert screen displacement vector to world displacement vector
          const worldDx = (normSx + 2 * normSy) / 2;
          const worldDy = (2 * normSy - normSx) / 2;
          const wLen = Math.hypot(worldDx, worldDy) || 1;
          const dirX = worldDx / wLen;
          const dirY = worldDy / wLen;

          let speedMult = 1;
          if (p.slowTimer > 0) speedMult *= 0.52;
          if (frostWarmthTimerRef.current > 0) speedMult *= 1.20; // +20% Warmth Speed Boost from Thermal Geysers

          // Floor 2 Mud Terrain Drag
          if (floorRef.current === 2 && !isVila && (p.z || 0) <= 0) {
            const distFromCenter = Math.hypot(p.x, p.y - 30);
            if (distFromCenter < 380) {
              speedMult *= 0.88;
            }
          }

          const currentSpeed = p.stats.moveSpeed * 60 * speedMult;
          p.vx = dirX * currentSpeed;
          p.vy = dirY * currentSpeed;
          const resolved = resolveMovement(p.x, p.y, p.x + p.vx * dt, p.y + p.vy * dt, 15, currentMap);
          p.x = resolved.x;
          p.y = resolved.y;
          p.isMoving = true; p.animFrame += dt * 10;
        } else {
          p.vx = 0;
          p.vy = 0;
          p.isMoving = false;
          p.animFrame = 0;
        }

        p.facing = Math.atan2(mouseWorldRef.current.y - p.y, mouseWorldRef.current.x - p.x);

        // Auto-attack system: automatically fires towards cursor aim when in combat/Tower
        const shouldAttack = (!isVila && !isRestRoomRef.current && gameStateRef.current === GameState.TOWER) || isAttackingRef.current;
        if (shouldAttack && p.weaponTimer <= 0 && p.stunTimer <= 0 && !isVila && !isRestRoomRef.current) {
          if (p.archetype === Archetype.VORGAR) {
            // Vorgar: Melee Cleave Sweep (Maça Colossal)
            audioManager.playAttackSfx(Archetype.VORGAR);
            const isVorgarR = p.vorgarRTimer && p.vorgarRTimer > 0;
            shakeRef.current = Math.max(shakeRef.current, isVorgarR ? 12 : 6);
            
            const cleaveRange = (150 + (p.unlockedTalents?.has('vorgar_d08') ? 30 : 0)) * (isVorgarR ? 1.4 : 1.0);
            const cleaveAngle = isVorgarR ? 1.60 : 1.35; // Wider sweep in R form
            const facingAngle = p.facing;
            
            // Visual cleave slash arc particle effects
            for (let i = -3; i <= 3; i++) {
              const subA = facingAngle + (i * (cleaveAngle / 6));
              const px = p.x + Math.cos(subA) * (cleaveRange * 0.75);
              const py = p.y + Math.sin(subA) * (cleaveRange * 0.75);
              createParticle(px, py, 15, isVorgarR ? '#ef4444' : '#10b981', isVorgarR ? 15 : 10, 'IMPACT');
            }

            // Hit detection in frontal arc
            enemiesRef.current.forEach(e => {
              if (!e.isFriendly && e.hp > 0) {
                const dist = Math.hypot(e.x - p.x, e.y - p.y);
                if (dist <= cleaveRange + (e.hitboxRadius || 15)) {
                  const angleToTarget = Math.atan2(e.y - p.y, e.x - p.x);
                  let diff = angleToTarget - facingAngle;
                  while (diff < -Math.PI) diff += Math.PI * 2;
                  while (diff > Math.PI) diff -= Math.PI * 2;
                  
                  if (Math.abs(diff) <= cleaveAngle / 2) {
                    const dmg = p.stats.ad * (isVorgarR ? 1.45 : 1.0);
                    damageEnemy(e, dmg, 'AD', p);
                    createParticle(e.x, e.y, e.z || 0, isVorgarR ? '#ef4444' : '#34d399', isVorgarR ? 16 : 8, 'IMPACT');
                    
                    // Minor knockback from heavy hammer (stronger in R form)
                    const currentMap = getFloorMap(floorRef.current);
                    const kbDist = isVorgarR ? 65 : 35;
                    const resolved = resolveMovement(e.x, e.y, e.x + Math.cos(facingAngle) * kbDist, e.y + Math.sin(facingAngle) * kbDist, e.hitboxRadius || 15, currentMap);
                    e.x = resolved.x;
                    e.y = resolved.y;
                  }
                }
              }
            });

            // Vorgar melee cleave also hits destructible hazards in arc
            hazardsRef.current.forEach(h => {
              if (!h.used && (h.hp !== undefined || h.type === 'EXPLODING_BARREL' || h.type === 'BREAKABLE_PILLAR' || h.type === 'SOUL_BRAZIER' || h.type === 'RESONANT_PILLAR' || h.type === 'FROST_CRYSTAL' || h.type === 'VOID_CRYSTAL')) {
                const dist = Math.hypot(h.x - p.x, h.y - p.y);
                if (dist <= cleaveRange + (h.radius ? Math.min(45, h.radius) : 32)) {
                  const angleToTarget = Math.atan2(h.y - p.y, h.x - p.x);
                  let diff = angleToTarget - facingAngle;
                  while (diff < -Math.PI) diff += Math.PI * 2;
                  while (diff > Math.PI) diff -= Math.PI * 2;
                  if (Math.abs(diff) <= cleaveAngle / 2) {
                    const dmg = p.stats.ad * (isVorgarR ? 1.45 : 1.0);
                    damageHazard(h, dmg, p);
                  }
                }
              }
            });

            p.weaponTimer = 1 / p.stats.atkSpeed;
          } else {
            // Ranged Projectile Archetypes (Archer / Mage)
            const spawnDist = 30;
            const spread = 0.15;
            const startAngle = p.facing - (Math.floor(p.projectilesCount/2) * spread);
            
            for(let i=0; i<p.projectilesCount; i++) {
              const a = startAngle + i * spread;
              const vx = Math.cos(a) * 800; const vy = Math.sin(a) * 800;
              const spawnX = p.x + Math.cos(a) * spawnDist;
              const spawnY = p.y + Math.sin(a) * spawnDist;
              projectilesRef.current.push(ProjectilePool.acquire({
                x: spawnX, y: spawnY, z: 30, vx, vy,
                damage: p.archetype === Archetype.ARCHER ? p.stats.ad : p.stats.ap,
                damageType: p.archetype === Archetype.ARCHER ? 'AD' : 'AP',
                duration: 1.5, radius: p.archetype === Archetype.ARCHER ? 8 : 15, type: p.archetype === Archetype.ARCHER ? 'ARROW' : 'MAGIC_ORB',
                color: p.archetype === Archetype.ARCHER ? '#e2e8f0' : p.color, pierce: p.archetype === Archetype.MAGE ? 2 : (p.stats.pierce || 0)
              }));
            }

            // Lyra Eclipse Mark Consume: fires homing spectral arrows to all marked enemies
            if (p.archetype === Archetype.ARCHER && p.lyraMarkedEnemyIds && p.lyraMarkedEnemyIds.length > 0) {
              const markedIds = [...p.lyraMarkedEnemyIds];
              p.lyraMarkedEnemyIds = []; // Consume marks
              markedIds.forEach(eid => {
                const enemy = enemiesRef.current.find(e => e.id === eid && e.hp > 0);
                if (enemy) {
                  const angleToEnemy = Math.atan2(enemy.y - p.y, enemy.x - p.x);
                  projectilesRef.current.push(ProjectilePool.acquire({
                    x: p.x, y: p.y, z: 30,
                    vx: Math.cos(angleToEnemy) * 1100, vy: Math.sin(angleToEnemy) * 1100,
                    damage: p.stats.ad * 2.2, // Deals 220% AD on consumed mark
                    damageType: 'AD',
                    duration: 1.5, radius: 10, type: 'ARROW',
                    color: '#f87171', pierce: 1
                  }));
                  createParticle(enemy.x, enemy.y, enemy.z || 0, '#f87171', 12, 'IMPACT');
                }
              });
            }

            p.weaponTimer = 1 / p.stats.atkSpeed;
          }
        }

        if (p.stunTimer <= 0) {
          // Skill 1 [Q]
          if (keysRef.current['KeyQ'] && p.skill1Timer <= 0) { 
            const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
            let cdMult = (mutator && mutator.skillCooldownMult !== undefined) ? mutator.skillCooldownMult : 1.0;
            if (p.archetype === Archetype.VORGAR && p.vorgarRTimer && p.vorgarRTimer > 0) {
              cdMult *= 0.5; // Reduz tempo de recarga pela metade durante o Avatar
            }

            if (p.archetype === Archetype.MAGE || p.archetype === Archetype.SUMMONER) {
              if (aimingSkillRef.current === 'Q') {
                useSkillQ(mouseWorldRef.current.x, mouseWorldRef.current.y);
                p.skill1Timer = p.skill1MaxCooldown * cdMult;
                aimingSkillRef.current = null;
              } else {
                aimingSkillRef.current = 'Q';
              }
            } else if (p.archetype === Archetype.VORGAR) {
              useSkillQ(mouseWorldRef.current.x, mouseWorldRef.current.y);
              p.skill1Timer = p.skill1MaxCooldown * cdMult;
              aimingSkillRef.current = null;
            } else {
              useSkillQ(mouseWorldRef.current.x, mouseWorldRef.current.y); 
              p.skill1Timer = p.skill1MaxCooldown * cdMult; 
              aimingSkillRef.current = null;
            }
            keysRef.current['KeyQ'] = false;
          }
          
          // Skill 2 [E]
          if (keysRef.current['KeyE'] && p.skill2Timer <= 0 && !isVila) {
            const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
            const cdMult = (mutator && mutator.skillCooldownMult !== undefined) ? mutator.skillCooldownMult : 1.0;

            if (p.archetype === Archetype.SUMMONER || p.archetype === Archetype.VORGAR || p.archetype === Archetype.MAGE) {
              if (aimingSkillRef.current === 'E') {
                useSkillW(mouseWorldRef.current.x, mouseWorldRef.current.y);
                p.skill2Timer = p.skill2MaxCooldown * cdMult;
                aimingSkillRef.current = null;
              } else {
                aimingSkillRef.current = 'E';
              }
            } else {
              useSkillW(mouseWorldRef.current.x, mouseWorldRef.current.y);
              p.skill2Timer = p.skill2MaxCooldown * cdMult;
              aimingSkillRef.current = null;
            }
            keysRef.current['KeyE'] = false;
          }

          // Skill 3 [R] (Ultimate)
          if (keysRef.current['KeyR'] && p.skill3Timer <= 0 && !isVila) {
            const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
            const cdMult = (mutator && mutator.skillCooldownMult !== undefined) ? mutator.skillCooldownMult : 1.0;

            if (p.archetype === Archetype.MAGE) {
              if (aimingSkillRef.current === 'R') {
                useSkillR(mouseWorldRef.current.x, mouseWorldRef.current.y);
                p.skill3Timer = p.skill3MaxCooldown * cdMult;
                aimingSkillRef.current = null;
              } else {
                aimingSkillRef.current = 'R';
              }
            } else {
              useSkillR();
              p.skill3Timer = p.skill3MaxCooldown * cdMult;
              aimingSkillRef.current = null;
            }
            keysRef.current['KeyR'] = false;
          }
          
          // Space handling: Hazard interaction OR Dash
          const isSpacePressed = keysRef.current['Space'];
          if (isSpacePressed && !isVila && nearbyHazard) {
            const h = nearbyHazard;
            if (h.type === 'RESONANT_PILLAR' && (h.stateTimer || 0) <= 0) {
              // Trigger instant Resonant Wave
              h.stateTimer = h.maxTimer || 6.0;
              shakeRef.current = 16;
              createParticle(h.x, h.y, 10, '#10b981', 30, 'IMPACT');
              
              // Knockback and damage all enemies within 360px
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0) {
                  const d = Math.hypot(e.x - h.x, e.y - h.y);
                  if (d < 360) {
                    const angle = Math.atan2(e.y - h.y, e.x - h.x);
                    const push = 280;
                    e.x += Math.cos(angle) * push;
                    e.y += Math.sin(angle) * push;
                    damageEnemy(e, 160 + floorRef.current * 30, 'AP', p);
                  }
                }
              });
              hazardToastRef.current = { text: '⚡ ONDA RESSONANTE DETONADA (-160 DANO EM ÁREA)!', timer: 2.5, maxTimer: 2.5 };
              keysRef.current['Space'] = false;
            } else if (h.type === 'SACRIFICE_SHRINE' && !h.used) {
              // Sacrifice 20 HP for frenzy
              p.stats.hp = Math.max(1, p.stats.hp - 20);
              p.stats.atkSpeed = (p.stats.atkSpeed || 1) * 1.25;
              p.stats.moveSpeed = (p.stats.moveSpeed || 4) * 1.15;
              h.used = true;
              shakeRef.current = 12;
              createParticle(h.x, h.y, 10, '#ef4444', 25, 'IMPACT');
              hazardToastRef.current = { text: '🩸 PACTO DE SANGUE: +25% VEL. ATAQUE & +15% VELOCIDADE!', timer: 3.0, maxTimer: 3.0 };
              keysRef.current['Space'] = false;
            } else if (h.type === 'EXPLODING_BARREL' && !h.used && !h.primed) {
              h.primed = true;
              h.fuseTimer = 0.35;
              shakeRef.current = 10;
              createParticle(h.x, h.y, 15, '#fbbf24', 20, 'FIRE');
              hazardToastRef.current = { text: '💥 BARRIL IGNITADO! AFASTE-SE DA EXPLOSÃO!', timer: 2.0, maxTimer: 2.0 };
              keysRef.current['Space'] = false;
            } else if (h.type === 'BREAKABLE_PILLAR' && !h.used) {
              h.hp = 0;
              keysRef.current['Space'] = false;
            } else if (h.type === 'SOLAR_ALTAR' && (h.stateTimer || 0) <= 0) {
              // Bless the player with holy energy: +30% holy damage and a solar radiant shield
              h.stateTimer = h.maxTimer || 18.0;
              p.shieldTimer = 8.0;
              p.solarBlessingTimer = 8.0;
              p.slowTimer = 0;
              shakeRef.current = 14;
              audioManager.playLevelUpSfx();
              createParticle(p.x, p.y, 25, '#fbbf24', 35, 'MAGIC');
              hazardToastRef.current = { text: '☀️ BÊNÇÃO DA AURORA ATIVADA (+30% DANO SAGRADO & ESCUDO POR 8s)!', timer: 3.5, maxTimer: 3.5 };
              keysRef.current['Space'] = false;
            } else if (h.type === 'VOID_SINGULARITY' && (h.stateTimer || 0) <= 0) {
              h.stateTimer = h.maxTimer || 22.0;
              shakeRef.current = 16;
              audioManager.playExplosionSfx();
              createParticle(h.x, h.y, 25, '#c084fc', 40, 'MAGIC');
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < 320) {
                  damageEnemy(e, 150 + floorRef.current * 30, 'AP', p);
                  if (!e.statusEffects) e.statusEffects = {};
                  e.statusEffects.stunned = 3.5;
                  const angle = Math.atan2(h.y - e.y, h.x - e.x);
                  e.x = h.x + Math.cos(angle) * 30;
                  e.y = h.y + Math.sin(angle) * 30;
                }
              });
              hazardToastRef.current = { text: '🌀 DISTORÇÃO ESPAÇO-TEMPORAL ATIVADA! INIMIGOS ATORDOADOS E RECARGAS ACELERADAS (+50%)!', timer: 3.5, maxTimer: 3.5 };
              keysRef.current['Space'] = false;
            } else if (h.type === 'CHALLENGE_CHEST' && !h.used && !h.isActive) {
              // Start 15s survive challenge
              h.isActive = true;
              h.stateTimer = h.maxTimer || 15.0;
              shakeRef.current = 14;
              createParticle(h.x, h.y, 10, '#f59e0b', 30, 'IMPACT');
              // Spawn 4 elite guards around chest
              for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 / 4) * i;
                spawnEnemy(h.x + Math.cos(a) * 80, h.y + Math.sin(a) * 80, 'GOLEM', true);
              }
              hazardToastRef.current = { text: '⚔️ DESAFIO DO BAÚ: SOBREVIVA POR 15 SEGUNDOS!', timer: 3.0, maxTimer: 3.0 };
              keysRef.current['Space'] = false;
            }
          }

          // Dash on SPACE if not interacting with structure or hazard
          if (keysRef.current['Space'] && p.dashCharges > 0 && p.dashTimer <= 0 && (!isVila || !nearbyStructure)) { 
            useDash(); 
            p.dashCharges--; 
            p.dashTimer = 0.2;
            keysRef.current['Space'] = false;
            if (p.dashCharges === SKILL_CONFIG[p.archetype].dashChargesMax - 1) {
              const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
              const cdMult = (mutator && mutator.dashCooldownMult !== undefined) ? mutator.dashCooldownMult : 1.0;
              p.dashRechargeTimer = p.dashMaxCooldown * cdMult;
            }
          }
        }

        if (p.dashCharges < SKILL_CONFIG[p.archetype].dashChargesMax) {
          if (p.dashRechargeTimer! <= 0) {
            p.dashCharges++;
            if (p.dashCharges < SKILL_CONFIG[p.archetype].dashChargesMax) {
              const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
              const cdMult = (mutator && mutator.dashCooldownMult !== undefined) ? mutator.dashCooldownMult : 1.0;
              p.dashRechargeTimer = p.dashMaxCooldown * cdMult;
            }
          }
        }
      }
    },

    hazards: (dt: number) => {
      const p = playerRef.current;

      // Update hazard toast ref without triggering React re-renders
      if (hazardToastRef.current) {
        hazardToastRef.current.timer -= dt;
        if (hazardToastRef.current.timer <= 0) {
          hazardToastRef.current = null;
        }
      }

      hazardsRef.current.forEach(h => {
        h.stateTimer = (h.stateTimer || 0) - dt;

        if (h.type === 'RESONANT_PILLAR') {
          // Autonomous periodic resonant pulse every 8s
          if (h.stateTimer <= 0) {
            h.stateTimer = h.maxTimer || 8.0;
            // Create minor shockwave particle
            createParticle(h.x, h.y, 10, '#10b981', 12, 'IMPACT');
            // Slight knockback to close enemies
            enemiesRef.current.forEach(e => {
              if (!e.isFriendly && e.hp > 0) {
                const d = Math.hypot(e.x - h.x, e.y - h.y);
                if (d < 180) {
                  damageEnemy(e, 35 + floorRef.current * 10, 'AP', p);
                  const angle = Math.atan2(e.y - h.y, e.x - h.x);
                  e.x += Math.cos(angle) * 80;
                  e.y += Math.sin(angle) * 80;
                }
              }
            });
          }
        } else if (h.type === 'SPIKE_TRAP') {
          // Cycles between Active (spikes UP) and Inactive (spikes DOWN)
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 1.8 : 2.5; // 1.8s UP, 2.5s DOWN
            if (h.isActive) {
              createParticle(h.x, h.y, 0, '#94a3b8', 4, 'IMPACT');
            }
          }

          // Lightweight tick-based damage (3 ticks / sec)
          if (h.isActive) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.35; // Tick every 0.35s
              const radius = h.radius || 35;
              const distP = Math.hypot(p.x - h.x, p.y - h.y);
              if (distP < radius) {
                takeDamage(p, h.damage || 15, 'AD');
              }
              const trapDamage = (h.damage || 30) + p.stats.ad * 0.2;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && e.z <= 0) {
                  const distE = Math.hypot(e.x - h.x, e.y - h.y);
                  if (distE < radius) {
                    damageEnemy(e, trapDamage, 'AD', p);
                  }
                }
              });
            }
          }
        } else if (h.type === 'TOXIC_GEYSER') {
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 2.0 : 3.5;
            if (h.isActive) {
              createParticle(h.x, h.y, 0, '#22c55e', 8, 'IMPACT');
            }
          }
          if (h.isActive) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.35;
              const radius = h.radius || 45;
              const distP = Math.hypot(p.x - h.x, p.y - h.y);
              if (distP < radius) {
                takeDamage(p, h.damage || 12, 'AP');
                p.slowTimer = 0.5;
              }
              const trapDamage = (h.damage || 35) + p.stats.ap * 0.2;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0) {
                  const distE = Math.hypot(e.x - h.x, e.y - h.y);
                  if (distE < radius) {
                    damageEnemy(e, trapDamage, 'AP', p);
                    if (!e.statusEffects) e.statusEffects = {};
                    e.statusEffects.poisoned = (e.statusEffects.poisoned || 0) + 0.5;
                  }
                }
              });
            }
          }
        } else if (h.type === 'MAGMA_VENT') {
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 2.0 : 4.0;
            if (h.isActive) {
              createParticle(h.x, h.y, 0, '#ef4444', 10, 'IMPACT');
            }
          }
          if (h.isActive) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.35;
              const radius = h.radius || 40;
              const distP = Math.hypot(p.x - h.x, p.y - h.y);
              if (distP < radius) {
                takeDamage(p, h.damage || 20, 'AP');
              }
              const trapDamage = (h.damage || 45) + p.stats.ap * 0.25;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0) {
                  const distE = Math.hypot(e.x - h.x, e.y - h.y);
                  if (distE < radius) {
                    damageEnemy(e, trapDamage, 'AP', p);
                    if (!e.statusEffects) e.statusEffects = {};
                    e.statusEffects.burning = (e.statusEffects.burning || 0) + 0.5;
                  }
                }
              });
            }
          }
        } else if (h.type === 'GRAVEYARD_HANDS') {
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 3.0 : 4.0;
            if (h.isActive) createParticle(h.x, h.y, 0, '#8b5cf6', 15, 'IMPACT');
          }
          if (h.isActive) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.5;
              const radius = h.radius || 60;
              const distP = Math.hypot(p.x - h.x, p.y - h.y);
              if (distP < radius) {
                takeDamage(p, h.damage || 15, 'AP');
                p.slowTimer = 0.8;
              }
              const trapDamage = (h.damage || 40) + p.stats.ap * 0.2;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0) {
                  const distE = Math.hypot(e.x - h.x, e.y - h.y);
                  if (distE < radius) {
                    damageEnemy(e, trapDamage, 'AP', p);
                  }
                }
              });
            }
          }
        } else if (h.type === 'TESLA_COIL') {
          h.fuseTimer = (h.fuseTimer || 0) - dt;
          if (h.fuseTimer <= 0) {
            h.fuseTimer = 1.2; // pulse every 1.2s
            const radius = h.radius || 90;
            createParticle(h.x, h.y, 0, '#06b6d4', 5, 'IMPACT');
            const distP = Math.hypot(p.x - h.x, p.y - h.y);
            if (distP < radius) takeDamage(p, h.damage || 20, 'AP');
            const trapDamage = (h.damage || 50) + p.stats.ap * 0.3;
            enemiesRef.current.forEach(e => {
              if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < radius) {
                damageEnemy(e, trapDamage, 'AP', p);
                if (!e.statusEffects) e.statusEffects = {};
                e.statusEffects.shocked = (e.statusEffects.shocked || 0) + 1.0;
              }
            });
          }
        } else if (h.type === 'PROXIMITY_MINE') {
          if (h.isActive && !h.used) {
            const distP = Math.hypot(p.x - h.x, p.y - h.y);
            if (distP < 40) {
              h.isActive = false; h.used = true;
              createParticle(h.x, h.y, 0, '#ef4444', 30, 'IMPACT');
              takeDamage(p, h.damage || 40, 'AD');
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < (h.radius||60)) {
                  damageEnemy(e, (h.damage || 80) + p.stats.ad * 0.5, 'AD', p);
                }
              });
            }
          }
        } else if (h.type === 'QUICKSAND_WHIRL') {
          const radius = h.radius || 100;
          const distP = Math.hypot(p.x - h.x, p.y - h.y);
          if (distP < radius && distP > 5) {
            const angle = Math.atan2(h.y - p.y, h.x - p.x);
            p.x += Math.cos(angle) * 80 * dt;
            p.y += Math.sin(angle) * 80 * dt;
          }
        } else if (h.type === 'FROST_STALACTITE') {
          if (h.stateTimer <= 0) {
            h.stateTimer = 4.0;
            h.fuseTimer = 0.5; // Warning time before dropping
            h.primed = true;
          }
          if (h.primed) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.primed = false;
              createParticle(h.x, h.y, 0, '#93c5fd', 20, 'IMPACT');
              const radius = h.radius || 60;
              const distP = Math.hypot(p.x - h.x, p.y - h.y);
              if (distP < radius) {
                takeDamage(p, h.damage || 35, 'AP');
                p.slowTimer = 1.5;
              }
              const trapDamage = (h.damage || 60) + p.stats.ap * 0.4;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < radius) {
                  damageEnemy(e, trapDamage, 'AP', p);
                  if (!e.statusEffects) e.statusEffects = {};
                  e.statusEffects.frozen = (e.statusEffects.frozen || 0) + 1.0;
                }
              });
            }
          }
        } else if (h.type === 'VOID_SINGULARITY') {
          if (h.stateTimer <= 0) {
            h.stateTimer = 6.0;
            h.fuseTimer = 1.5;
            h.primed = true;
          }
          if (h.primed) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            const radius = h.radius || 120;
            // pull
            const distP = Math.hypot(p.x - h.x, p.y - h.y);
            if (distP < radius * 1.5 && distP > 10) {
              const angle = Math.atan2(h.y - p.y, h.x - p.x);
              p.x += Math.cos(angle) * 120 * dt;
              p.y += Math.sin(angle) * 120 * dt;
            }
            if (h.fuseTimer <= 0) {
              h.primed = false;
              createParticle(h.x, h.y, 0, '#c084fc', 40, 'IMPACT');
              if (distP < radius) takeDamage(p, h.damage || 60, 'AP');
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) < radius) {
                  damageEnemy(e, (h.damage || 100) + p.stats.ap * 0.6, 'AP', p);
                }
              });
            }
          }
        } else if (h.type === 'CHALLENGE_CHEST' && h.isActive && !h.used) {
          if (h.stateTimer <= 0) {
            // Challenge Completed!
            h.used = true;
            h.isActive = false;
            shakeRef.current = 18;
            createParticle(h.x, h.y, 10, '#fbbf24', 40, 'IMPACT');
            // Reward 15 XP orbs and 10 crystals
            for (let i = 0; i < 15; i++) {
              xpOrbsRef.current.push({
                id: getNextId(),
                x: h.x,
                y: h.y,
                z: 20,
                vx: (Math.random() - 0.5) * 350,
                vy: (Math.random() - 0.5) * 350,
                vz: 450,
                value: 80
              });
            }
            p.crystals += 10;
            hazardToastRef.current = { text: '🏆 DESAFIO CONCLUÍDO! +10 CRISTAIS & SUPER XP!', timer: 4.0, maxTimer: 4.0 };
          }
        }
      });

      // Floor 1 Instability Hazard Spawns (Falling Crystal Shards in Stages 3, 4, 5)
      if (gameStateRef.current === GameState.TOWER && floorRef.current === 1 && !isRestRoomRef.current) {
        const timeSec = floorCombatTimerRef.current;
        crystalHazardTimerRef.current -= dt;
        if (timeSec >= 240) { // Stage 3 (04:00+), 4 (06:00+), 5 (08:00+)
          const interval = timeSec >= 480 ? 2.5 : (timeSec >= 360 ? 3.5 : 5.0);
          const count = timeSec >= 480 ? 3 : (timeSec >= 360 ? 2 : 1);
          if (crystalHazardTimerRef.current <= 0) {
            crystalHazardTimerRef.current = interval;
            for (let c = 0; c < count; c++) {
              const offsetAngle = Math.random() * Math.PI * 2;
              const offsetDist = 60 + Math.random() * 220;
              const tx = p.x + Math.cos(offsetAngle) * offsetDist;
              const ty = p.y + Math.sin(offsetAngle) * offsetDist;
              telegraphsRef.current.push({
                id: getNextId(),
                x: tx,
                y: ty,
                radius: 85,
                duration: 0,
                maxDuration: 1.1,
                color: 'rgba(52, 211, 153, 0.45)',
                type: 'CIRCLE',
                damage: 24,
                damageType: 'AP',
                sourceId: 'FLOOR1_INSTABILITY_SHARD'
              });
            }
          }
        }
      }

      // Floor 3 Lava Surge Event (Periodic Eruption & Magma Overflow)
      if (gameStateRef.current === GameState.TOWER && floorRef.current === 3 && !isRestRoomRef.current && !bossSpawnedRef.current) {
        lavaSurgeTimerRef.current -= dt;
        if (lavaSurgeTimerRef.current <= 0) {
          lavaSurgeTimerRef.current = 28.0;
          hazardToastRef.current = {
            text: '🌋 ALERTA DE ERUPÇÃO: O MAGMA ESTÁ SUBINDO! PROCURE OS PLATÔS ALTOS!',
            timer: 4.5,
            maxTimer: 4.5
          };
          shakeRef.current = 22;
          audioManager.playExplosionSfx();
          hazardsRef.current.forEach(h => {
            if (h.type === 'MAGMA_VENT') {
              h.isActive = true;
              h.stateTimer = 4.5;
            }
          });
          for (let l = 0; l < 6; l++) {
            const lAngle = (Math.PI * 2 / 6) * l;
            spawnAcidPool(Math.cos(lAngle) * 320, Math.sin(lAngle) * 320, 85, 4.5, 20);
          }
        }
      }

      // Floor 6 Frostbite & Thermal Geysers Mechanic
      if (gameStateRef.current === GameState.TOWER && floorRef.current === 6 && !isRestRoomRef.current) {
        let standingNearGeyser = false;
        hazardsRef.current.forEach(h => {
          if (h.type === 'THERMAL_GEYSER') {
            const d = Math.hypot(p.x - h.x, p.y - h.y);
            if (d < (h.radius || 65)) {
              standingNearGeyser = true;
            }
          }
        });

        if (standingNearGeyser) {
          // Rapid warmth dissipation
          frostbiteRef.current = Math.max(0, frostbiteRef.current - dt * 50);
          frostWarmthTimerRef.current = 3.0; // 3 seconds warmth speed boost
          if (Math.random() < 0.25) {
            createParticle(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20, p.z + 5, '#fdba74', 8, 'HEAL');
          }
        } else {
          // Accumulate Frostbite (accelerated during Blizzard weather)
          const accumulationRate = weatherRef.current === Weather.BLIZZARD ? 6.5 : 3.8;
          frostbiteRef.current = Math.min(100, frostbiteRef.current + dt * accumulationRate);
        }

        if (frostWarmthTimerRef.current > 0) {
          frostWarmthTimerRef.current -= dt;
        }

        // At 100% Frostbite, apply persistent frost slow and periodic ice shivers
        if (frostbiteRef.current >= 100) {
          p.slowTimer = Math.max(p.slowTimer, 0.4);
          if (Math.random() < 0.15) {
            createParticle(p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.5) * 20, p.z + 10, '#38bdf8', 4, 'IMPACT');
          }
        }
      }
    },

    spawning: (dt: number) => {
      if (isRestRoomRef.current) return;
      const p = playerRef.current;
      const floor = FLOOR_CONFIGS[floorRef.current - 1] || FLOOR_CONFIGS[0];
      const currentMap = getFloorMap(floorRef.current);
      const activeEnemiesCount = enemiesRef.current.filter(e => !e.isFriendly && !e.isBoss && e.hp > 0).length;

      if (!bossSpawnedRef.current) {
        // Obter configuração da fase ativa de forma estruturada (se disponível)
        const phaseConfig = floor.phases?.[phaseRef.current as 1 | 2 | 3];
        const activeEnemyTypes = phaseConfig ? phaseConfig.enemyTypes : floor.enemyTypes;
        const baseSpawnRate = phaseConfig ? phaseConfig.spawnRate : floor.spawnRate;

        // --- FASE 1: HORDA (Inimigos Padrão) ---
        if (phaseRef.current === 1) {
          const p1Duration = phaseConfig ? phaseConfig.duration : (floor.phase1Duration || floor.duration || 30);
          const progress = Math.min(1.0, timeRef.current / p1Duration);
          const maxEnemies = progress >= 0.7 ? 14 : (progress >= 0.3 ? 11 : 9);

          if (timeRef.current < p1Duration) {
            const spawnInterval = Math.max(0.2, (baseSpawnRate / 1000) - (timeRef.current * 0.01));
            if (waveTimerRef.current > spawnInterval && activeEnemiesCount < maxEnemies) {
              waveTimerRef.current = 0;
              const type = activeEnemyTypes[Math.floor(Math.random() * activeEnemyTypes.length)];
              
              let spawned = false;
              for (let attempt = 0; attempt < 6; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 360 + Math.random() * 240;
                const candX = p.x + Math.cos(angle) * dist;
                const candY = p.y + Math.sin(angle) * dist;
                if (isPointWalkable(candX, candY, currentMap, -12) && !getCollidingPillar(candX, candY, 20, currentMap)) {
                  spawnEnemy(candX, candY, type, Math.random() < 0.05);
                  spawned = true;
                  break;
                }
              }
              if (!spawned) {
                spawnEnemy(p.x, p.y, type, Math.random() < 0.05);
              }
            }
          } else {
            // Tempo da Fase 1 finalizado -> aguardar eliminação da horda para abrir portal para Fase 2
            if (activeEnemiesCount === 0) {
              if (!phasePortalActiveRef.current) {
                phasePortalActiveRef.current = true;
                phasePortalPosRef.current = { x: p.x, y: p.y - 120 };
                audioManager.playPortalAscendSfx();
              }
              if (!hazardToastRef.current || hazardToastRef.current.timer <= 0) {
                const nextPhase = floor.phases?.[2];
                const nextPhaseName = nextPhase ? nextPhase.name.toUpperCase() : 'MAPA 2';
                hazardToastRef.current = {
                  text: `🌀 ${floor.regionName?.toUpperCase()} - FASE 1 COMPLETA! PORTAL PARA "${nextPhaseName}" ABERTO! [ESPAÇO] PARA AVANÇAR.`,
                  timer: 3.5,
                  maxTimer: 3.5
                };
              }
            } else {
              if (!hazardToastRef.current || hazardToastRef.current.timer <= 0) {
                hazardToastRef.current = {
                  text: `⚠️ DERROTE OS ${activeEnemiesCount} INIMIGOS RESTANTES PARA ABRIR O PORTAL DA FASE 2!`,
                  timer: 2.0,
                  maxTimer: 2.0
                };
              }
            }
          }
        }
        // --- FASE 2: ELITE / INTENSA (Inimigos Elites) ---
        else if (phaseRef.current === 2) {
          const p2Duration = phaseConfig ? phaseConfig.duration : (floor.phase2Duration || 20);
          const maxEnemies = 12;

          if (timeRef.current < p2Duration) {
            const spawnInterval = Math.max(0.35, (baseSpawnRate / 1000) * (phaseConfig ? 1.0 : 1.1));
            if (waveTimerRef.current > spawnInterval && activeEnemiesCount < maxEnemies) {
              waveTimerRef.current = 0;
              const type = activeEnemyTypes[Math.floor(Math.random() * activeEnemyTypes.length)];
              
              // 50% de chance de spawnar Elite na Fase 2
              const isElite = Math.random() < 0.50;
              let spawned = false;
              for (let attempt = 0; attempt < 6; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 320 + Math.random() * 200;
                const candX = p.x + Math.cos(angle) * dist;
                const candY = p.y + Math.sin(angle) * dist;
                if (isPointWalkable(candX, candY, currentMap, -12) && !getCollidingPillar(candX, candY, 20, currentMap)) {
                  spawnEnemy(candX, candY, type, isElite);
                  spawned = true;
                  break;
                }
              }
              if (!spawned) {
                spawnEnemy(p.x, p.y, type, isElite);
              }
            }
          } else {
            // Tempo da Fase 2 finalizado -> aguardar eliminação dos elites para abrir portal do Chefe (Mapa 3)
            if (activeEnemiesCount === 0) {
              if (!phasePortalActiveRef.current) {
                phasePortalActiveRef.current = true;
                phasePortalPosRef.current = { x: p.x, y: p.y - 120 };
                audioManager.playPortalAscendSfx();
              }
              if (!hazardToastRef.current || hazardToastRef.current.timer <= 0) {
                const nextPhase = floor.phases?.[3];
                const nextPhaseName = nextPhase ? nextPhase.name.toUpperCase() : 'ARENA DO CHEFE (MAPA 3)';
                hazardToastRef.current = {
                  text: `🌀 ${floor.regionName?.toUpperCase()} - FASE 2 COMPLETA! PORTAL PARA "${nextPhaseName}" ABERTO! [ESPAÇO] PARA LUTAR.`,
                  timer: 3.5,
                  maxTimer: 3.5
                };
              }
            } else {
              if (!hazardToastRef.current || hazardToastRef.current.timer <= 0) {
                hazardToastRef.current = {
                  text: `⚠️ DERROTE OS ${activeEnemiesCount} ELITES RESTANTES PARA ABRIR O PORTAL DO CHEFE!`,
                  timer: 2.0,
                  maxTimer: 2.0
                };
              }
            }
          }
        }
      }
    },

    enemies: (dt: number) => {
      const p = playerRef.current;
      const playerSpeed = Math.hypot(p.vx || 0, p.vy || 0);
      const playerMoveAngle = playerSpeed > 5 ? Math.atan2(p.vy || 0, p.vx || 0) : null;

      const SECTOR_COUNT = 8;
      const sectorDensity = [0, 0, 0, 0, 0, 0, 0, 0];
      const enList = enemiesRef.current;
      const enLen = enList.length;

      for (let i = 0; i < enLen; i++) {
        const other = enList[i];
        if (other.hp > 0 && !other.isFriendly) {
          const angle = Math.atan2(other.y - p.y, other.x - p.x);
          const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
          const sectorIndex = Math.floor((normalized / (Math.PI * 2)) * SECTOR_COUNT) % SECTOR_COUNT;
          sectorDensity[sectorIndex]++;
        }
      }

      enList.forEach((e, enemyIndex) => {
        if (e.hp <= 0) return;
        if (e.hitFlash > 0) e.hitFlash -= dt;
        e.specialCooldown -= dt;

        if (e.isStaggered) {
          e.staggerTimer = (e.staggerTimer || 0) - dt;
          if (e.staggerTimer <= 0) {
            e.isStaggered = false;
            e.stagger = 0;
            e.state = e.bossPhase >= 3 ? 'ENRAGED' : 'CHASING';
            e.stateTimer = 0;
            
            // If the boss is the Pharaoh and still in a Sarcophagi phase, regenerate them!
            if (e.isBoss && e.type === 'BOSS_THUNDER_PHARAOH' && e.bossPhase < 3) {
              shakeRef.current = 26;
              audioManager.playCorruptionAlertSfx();
              hazardToastRef.current = {
                text: '⚡ RAMESSÉS SE RECUPERA! REGENERANDO ESCUDO E SARCOFAGOS TESLA!',
                timer: 4.0,
                maxTimer: 4.0
              };
              
              // Clear any leftover sarcophagi first, then spawn a fresh set of 3
              enemiesRef.current = enemiesRef.current.filter(g => g.type !== 'TESLA_SARCOPHAGUS');
              for (let k = 0; k < 3; k++) {
                const angle = (Math.PI * 2 / 3) * k - Math.PI / 2;
                const dist = 240;
                const sx = e.x + Math.cos(angle) * dist;
                const sy = e.y + Math.sin(angle) * dist;
                enemiesRef.current.push(EnemyPool.acquire({
                  id: getNextId(), x: sx, y: sy, z: 0, type: 'TESLA_SARCOPHAGUS', isBoss: false, isElite: true,
                  hp: 120, maxHp: 120, ad: 0, ap: 0, armor: 40, mr: 40, speed: 0, radius: 26, hitboxRadius: 26,
                  frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
                  windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
                  vx: 0, vy: 0, hitFlash: 0, color: '#eab308'
                }));
              }
            }

            // If boss is Ymir and still in Phase 1 or 2, regenerate Frost Crystals!
            if (e.isBoss && e.type === 'BOSS_YETI_OVERLORD' && e.bossPhase < 3) {
              shakeRef.current = 26;
              audioManager.playCorruptionAlertSfx();
              hazardToastRef.current = {
                text: '❄️ YMIR SE RECUPERA! RECONSTITUINDO OS CRISTAIS GLACIAIS NAS PLATAFORMAS!',
                timer: 4.0,
                maxTimer: 4.0
              };
              e.customAttackData = e.customAttackData || {};
              e.customAttackData.crystalsActive = true;
              enemiesRef.current = enemiesRef.current.filter(g => g.type !== 'FROST_CRYSTAL');
              const crystalPositions = [
                { x: -300, y: -220 },
                { x: 300, y: -220 },
                { x: 0, y: 320 }
              ];
              crystalPositions.forEach(pos => {
                enemiesRef.current.push(EnemyPool.acquire({
                  id: getNextId(), x: pos.x, y: pos.y, z: 0, type: 'FROST_CRYSTAL', isBoss: false, isElite: true,
                  hp: 340, maxHp: 340, ad: 0, ap: 0, armor: 25, mr: 25, speed: 0, radius: 32, hitboxRadius: 32,
                  frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
                  windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
                  vx: 0, vy: 0, hitFlash: 0, color: '#38bdf8'
                }));
              });
            }
          }
        }
        
        const distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);
        const angleToPlayer = Math.atan2(p.y - e.y, p.x - e.x);
        
        // --- BOSS LOGIC ---
        if (e.isBoss) {
          if (e.type === 'BOSS_CRYSTAL_GOLIAS') {
            // --- ARKHON 4-PHASE PROGRESSION ---
            // Phase 2 Transition (HP <= 75%)
            if (e.hp <= e.maxHp * 0.75 && e.bossPhase === 1) {
              e.bossPhase = 2;
              e.stateTimer = 1.0;
              shakeRef.current = 24;
              audioManager.playLevelUpSfx();
              hazardToastRef.current = {
                text: '💎 ARKHON: FASE 2 - MURALHA ORBITAL DE QUARTZO! ATIRE NAS BRECHAS PARA CRÍTICO (+50%)!',
                timer: 5.0,
                maxTimer: 5.0
              };
              // Radial shockwave
              telegraphsRef.current.push({
                id: getNextId(), x: e.x, y: e.y, radius: 480, duration: 0,
                maxDuration: 0.9, color: 'rgba(16, 185, 129, 0.45)', type: 'CIRCLE',
                damage: e.ap * 1.3, damageType: 'AP', sourceId: e.id
              });
              // Spawn 6 Guard Golems orbiting the boss in a full 360 degree ring
              const guardCount = 6;
              for (let k = 0; k < guardCount; k++) {
                const gAngle = (Math.PI * 2 / guardCount) * k;
                const gx = e.x + Math.cos(gAngle) * 140;
                const gy = e.y + Math.sin(gAngle) * 140;
                enemiesRef.current.push(EnemyPool.acquire({
                  id: getNextId(), x: gx, y: gy, z: 0, type: 'QUARTZ_GOLEM', isBoss: false, isElite: true,
                  hp: 320, maxHp: 320, ad: 35, ap: 35, armor: 25, mr: 25, speed: 110, radius: 28, hitboxRadius: 28,
                  frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 80,
                  windupTime: 0.6, recoverTime: 0.8, specialCooldown: 0, specialMaxCooldown: 3.5,
                  vx: 0, vy: 0, hitFlash: 0, color: '#10b981', orbitAngle: gAngle
                }));
              }
            }

            // Phase 3 Transition (HP <= 50%)
            if (e.hp <= e.maxHp * 0.50 && e.bossPhase === 2) {
              e.bossPhase = 3;
              e.stateTimer = 1.0;
              shakeRef.current = 26;
              audioManager.playLevelUpSfx();
              hazardToastRef.current = {
                text: '⚡ ARKHON: FASE 3 - RESSONÂNCIA INSTÁVEL! CHUVA DE CRISTAIS E SALTO CONSTANTE!',
                timer: 5.0,
                maxTimer: 5.0
              };
              // Transition burst
              telegraphsRef.current.push({
                id: getNextId(), x: e.x, y: e.y, radius: 520, duration: 0,
                maxDuration: 1.0, color: 'rgba(52, 211, 153, 0.45)', type: 'CIRCLE',
                damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
              });
              // Refill guards up to 6 if any were destroyed
              const curGuards = enemiesRef.current.filter(g => g.state === 'GUARDING' && g.hp > 0).length;
              const needToSpawn = Math.max(0, 6 - curGuards);
              for (let k = 0; k < needToSpawn; k++) {
                const gAngle = (Math.PI * 2 / 6) * k + (Math.PI / 6);
                const gx = e.x + Math.cos(gAngle) * 140;
                const gy = e.y + Math.sin(gAngle) * 140;
                enemiesRef.current.push(EnemyPool.acquire({
                  id: getNextId(), x: gx, y: gy, z: 0, type: 'QUARTZ_GOLEM', isBoss: false, isElite: true,
                  hp: 320, maxHp: 320, ad: 35, ap: 35, armor: 25, mr: 25, speed: 110, radius: 28, hitboxRadius: 28,
                  frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 80,
                  windupTime: 0.6, recoverTime: 0.8, specialCooldown: 0, specialMaxCooldown: 3.5,
                  vx: 0, vy: 0, hitFlash: 0, color: '#10b981', orbitAngle: gAngle
                }));
              }
            }

            // Phase 4 Transition (HP <= 35% - Overload / Enrage)
            if (e.hp <= e.maxHp * 0.35 && e.bossPhase === 3) {
              e.bossPhase = 4;
              e.state = 'ENRAGED';
              e.stateTimer = 1.0;
              e.color = '#059669';
              e.speed *= 1.30;
              e.ad *= 1.25;
              e.ap *= 1.25;
              e.specialMaxCooldown *= 0.65;
              shakeRef.current = 26;
              audioManager.playCorruptionAlertSfx();
              hazardToastRef.current = {
                text: '🔥 ARKHON: FASE 4 - SOBRECARGA DE CRISTAL (FÚRIA MÁXIMA)!',
                timer: 5.0,
                maxTimer: 5.0
              };
              telegraphsRef.current.push({
                id: getNextId(), x: e.x, y: e.y, radius: 460, duration: 0,
                maxDuration: 1.0, color: 'rgba(239, 68, 68, 0.45)', type: 'CIRCLE',
                damage: e.ap * 1.6, damageType: 'AP', sourceId: e.id
              });
              for (let i = 0; i < 15; i++) {
                createParticle(e.x, e.y, 25, '#10b981', 30, 'IMPACT');
              }
            }

            if (e.bossPhase === 4 && Math.random() < 0.25) {
              createParticle(e.x, e.y, 35, '#10b981', 3, 'IMPACT');
            }
          } else {
            if (e.type === 'BOSS_CORRUPTED_LEVIATHAN') {
              // Zhaerith Phase 2 Transition (HP <= 75% - Submersion & Ambush)
              if (e.hp <= e.maxHp * 0.75 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.state = 'SUBMERGED';
                e.stateTimer = 4.5;
                shakeRef.current = 24;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '🐍 ZHAERITH: FASE 2 - MERGULHO NO LODO ABISSAL! ELE SURGIRÁ SOB SEUS PÉS!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                for (let k = 0; k < 4; k++) {
                  const a = (Math.PI * 2 / 4) * k;
                  spawnEnemy(e.x + Math.cos(a) * 160, e.y + Math.sin(a) * 160, 'MARSH_JUMPER', true);
                }
              }

              // Zhaerith Phase 3 Transition (HP <= 45% - Maelstrom & Rain of Bile)
              if (e.hp <= e.maxHp * 0.45 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.stateTimer = 1.0;
                shakeRef.current = 26;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '🌀 ZHAERITH: FASE 3 - VÓRTICE CORROSIVO & CHUVA TÓXICA EM TODA A ARENA!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                for (let m = 0; m < 8; m++) {
                  const ma = Math.random() * Math.PI * 2;
                  const md = Math.random() * 320;
                  spawnAcidPool(p.x + Math.cos(ma) * md, p.y + Math.sin(ma) * md, 75, 8.0, 15);
                }
              }

              // Zhaerith Phase 4 Transition (HP <= 20% - Soft Enrage / Chain Leaps)
              if (e.hp <= e.maxHp * 0.20 && e.bossPhase === 3) {
                e.bossPhase = 4;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.speed *= 1.35;
                e.ad *= 1.30;
                e.ap *= 1.30;
                e.specialMaxCooldown = 1.8;
                shakeRef.current = 28;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '☠️ ZHAERITH: FASE 4 - FÚRIA DESESPERADA DO LEVIATÃ! SALTOS CONSTANTES!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
              }
            } else if (e.type === 'BOSS_FORGE_DRAGON') {
              // Ignis Phase 2 Transition (HP <= 65% - Unlocks Meteor Ring Barrage & Pillar Overcharge)
              if (e.hp <= e.maxHp * 0.65 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.stateTimer = 1.0;
                shakeRef.current = 26;
                audioManager.playLevelUpSfx();
                hazardToastRef.current = {
                  text: '🔥 IGNIS: FASE 2 - CATACLISMO DE METEOROS EM ANEL & SOBRECARGA DOS PILARES!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 500, duration: 0,
                  maxDuration: 1.0, color: 'rgba(239, 68, 68, 0.45)', type: 'CIRCLE',
                  damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                });
                hazardsRef.current.forEach(h => {
                  if (h.type === 'MAGMA_VENT') {
                    h.isActive = true;
                    h.stateTimer = 3.5;
                  }
                });
              }

              // Ignis Phase 3 Transition (HP <= 30% - Fúria Incandescente / Enrage)
              if (e.hp <= e.maxHp * 0.30 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.color = '#ff0000';
                e.speed *= 1.35;
                e.ad *= 1.30;
                e.ap *= 1.30;
                e.specialMaxCooldown *= 0.60;
                shakeRef.current = 28;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '💥 IGNIS: FASE 3 - FÚRIA INCANDESCENTE! CHUVA DE METEOROS CATACLÍSMICA EM DOBRO!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
              }
            } else if (e.type === 'BOSS_ARTILLERY_WARLORD') {
              // Warlord Phase 2 Transition (HP <= 70% - Energy Shield & Automated Turrets)
              if (e.hp <= e.maxHp * 0.70 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.stateTimer = 1.0;
                shakeRef.current = 26;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '💥 WARLORD: FASE 2 - ESCUDO ORBITAL DE ENERGIA & TORRES AUTOMÁTICAS DE ASSÉDIO!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 500, duration: 0,
                  maxDuration: 1.0, color: 'rgba(225, 29, 72, 0.45)', type: 'CIRCLE',
                  damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                });
                // Spawn 2 Guard Turrets
                for (let k = 0; k < 2; k++) {
                  const gAngle = Math.PI * k + (Math.PI / 4);
                  const gx = e.x + Math.cos(gAngle) * 160;
                  const gy = e.y + Math.sin(gAngle) * 160;
                  enemiesRef.current.push(EnemyPool.acquire({
                    id: getNextId(), x: gx, y: gy, z: 0, type: 'CYBER_AUTOMATON', isBoss: false, isElite: true,
                    hp: 450, maxHp: 450, ad: 32, ap: 32, armor: 25, mr: 25, speed: 0, radius: 30, hitboxRadius: 30,
                    frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 500,
                    windupTime: 0.6, recoverTime: 0.8, specialCooldown: 0, specialMaxCooldown: 2.5,
                    vx: 0, vy: 0, hitFlash: 0, color: '#f43f5e'
                  }));
                }
              }

              // Warlord Phase 3 Transition (HP <= 35% - Overload / Enrage & 360 Missiles)
              if (e.hp <= e.maxHp * 0.35 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.color = '#be123c';
                e.speed *= 1.40;
                e.ad *= 1.30;
                e.ap *= 1.30;
                e.specialMaxCooldown *= 0.50;
                shakeRef.current = 28;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '⚡ WARLORD: FASE 3 - TEMPESTADE DE MÍSSEIS 360° EM SOBRECARGA!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 550, duration: 0,
                  maxDuration: 1.0, color: 'rgba(225, 29, 72, 0.50)', type: 'CIRCLE',
                  damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                });
              }
            } else if (e.type === 'BOSS_THUNDER_PHARAOH') {
              // Pharaoh Phase 2 Transition (HP <= 65% - Respawns Sarcophagi + Sandstorm)
              if (e.hp <= e.maxHp * 0.65 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.stateTimer = 1.0;
                shakeRef.current = 28;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '⚡ RAMESSÉS: FASE 2 - TEMPESTADE DE AREIA ESTÁTICA & REATIVAÇÃO DOS SARCOFAGOS!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                
                // Clear any existing sarcophagi and spawn a fresh, powered up set of 3
                enemiesRef.current = enemiesRef.current.filter(g => g.type !== 'TESLA_SARCOPHAGUS');
                for (let k = 0; k < 3; k++) {
                  const angle = (Math.PI * 2 / 3) * k + Math.PI / 6;
                  const dist = 240;
                  const sx = e.x + Math.cos(angle) * dist;
                  const sy = e.y + Math.sin(angle) * dist;
                  enemiesRef.current.push(EnemyPool.acquire({
                    id: getNextId(), x: sx, y: sy, z: 0, type: 'TESLA_SARCOPHAGUS', isBoss: false, isElite: true,
                    hp: 180, maxHp: 180, ad: 0, ap: 0, armor: 45, mr: 45, speed: 0, radius: 26, hitboxRadius: 26,
                    frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
                    windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
                    vx: 0, vy: 0, hitFlash: 0, color: '#f59e0b'
                  }));
                }

                // Push player back
                const p = playerRef.current;
                const dx = p.x - e.x;
                const dy = p.y - e.y;
                const dLen = Math.hypot(dx, dy) || 1;
                p.x += (dx / dLen) * 150;
                p.y += (dy / dLen) * 150;
                
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 450, duration: 0,
                  maxDuration: 0.8, color: 'rgba(234, 179, 8, 0.45)', type: 'CIRCLE',
                  damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                });
              }

              // Pharaoh Phase 3 Transition (HP <= 35% - Sarcophagi explode forever, boss goes Overdrive)
              if (e.hp <= e.maxHp * 0.35 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.color = '#eab308';
                e.speed *= 1.40;
                e.ad *= 1.35;
                e.ap *= 1.35;
                e.specialMaxCooldown *= 0.50;
                shakeRef.current = 30;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '💥 RAMESSÉS: FASE 3 - SOBRECARGA DIVINA! ANÉIS DE CHOQUE CONCÊNTRICOS EXPANSIVOS!',
                  timer: 5.0,
                  maxTimer: 5.0
                };
                
                // Explode all sarcophagi permanently
                enemiesRef.current.forEach(g => {
                  if (g.type === 'TESLA_SARCOPHAGUS' && g.hp > 0) {
                    g.hp = 0;
                    for (let i = 0; i < 8; i++) {
                      createParticle(g.x, g.y, 25, '#fbbf24', 20, 'IMPACT');
                    }
                  }
                });
                enemiesRef.current = enemiesRef.current.filter(g => g.type !== 'TESLA_SARCOPHAGUS');

                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 550, duration: 0,
                  maxDuration: 1.0, color: 'rgba(234, 179, 8, 0.55)', type: 'CIRCLE',
                  damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id
                });
              }
            } else if (e.type === 'BOSS_YETI_OVERLORD') {
              // Crystal break detection during Phase 1 & 2
              const activeCrystals = enemiesRef.current.filter(g => g.type === 'FROST_CRYSTAL' && g.hp > 0).length;
              if (activeCrystals === 0 && e.customAttackData?.crystalsActive) {
                e.customAttackData.crystalsActive = false;
                e.isStaggered = true;
                e.staggerTimer = 6.0;
                e.state = 'STAGGERED';
                e.stateTimer = 6.0;
                shakeRef.current = 30;
                audioManager.playLevelUpSfx();
                hazardToastRef.current = {
                  text: '❄️ CRISTAIS DESTRUÍDOS! YMIR ESTÁ VULNERÁVEL (-90% DEFESA QUEBRADA / +100% CRÍTICO)!',
                  timer: 6.0,
                  maxTimer: 6.0
                };
                for (let i = 0; i < 35; i++) {
                  createParticle(e.x, e.y, 35, '#38bdf8', 25, 'IMPACT');
                }
              }

              // Ymir Phase 2 Transition (HP <= 60% - Blizzard Weather, Respawns Crystals & Minions)
              if (e.hp <= e.maxHp * 0.60 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.stateTimer = 1.0;
                weatherRef.current = Weather.BLIZZARD;
                shakeRef.current = 28;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '🌪️ YMIR: FASE 2 - TEMPESTADE GLACIAL & RECONEXÃO DOS CRISTAIS! ESPECTROS DA NEVASCA INVOCADOS!',
                  timer: 5.5,
                  maxTimer: 5.5
                };
                
                // Reposition / respawn 3 fresh crystals
                enemiesRef.current = enemiesRef.current.filter(g => g.type !== 'FROST_CRYSTAL');
                e.customAttackData = e.customAttackData || {};
                e.customAttackData.crystalsActive = true;
                const crystalPositions = [
                  { x: -300, y: -220 },
                  { x: 300, y: -220 },
                  { x: 0, y: 320 }
                ];
                crystalPositions.forEach(pos => {
                  enemiesRef.current.push(EnemyPool.acquire({
                    id: getNextId(), x: pos.x, y: pos.y, z: 0, type: 'FROST_CRYSTAL', isBoss: false, isElite: true,
                    hp: 360, maxHp: 360, ad: 0, ap: 0, armor: 25, mr: 25, speed: 0, radius: 32, hitboxRadius: 32,
                    frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
                    windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
                    vx: 0, vy: 0, hitFlash: 0, color: '#38bdf8'
                  }));
                });

                // Spawn 2 Blizzard Wraiths over bridges
                spawnEnemy(-180, 0, 'BLIZZARD_WRAITH', true);
                spawnEnemy(180, 0, 'BLIZZARD_WRAITH', true);

                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 520, duration: 0,
                  maxDuration: 0.9, color: 'rgba(56, 189, 248, 0.55)', type: 'CIRCLE',
                  damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                });
              }

              // Ymir Phase 3 Transition (HP <= 25% - Zero Absoluto / Colossus Enrage)
              if (e.hp <= e.maxHp * 0.25 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.color = '#0284c7';
                e.speed *= 1.40;
                e.ad *= 1.35;
                e.ap *= 1.35;
                e.specialMaxCooldown *= 0.50;
                shakeRef.current = 32;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '❄️ YMIR: FASE 3 - FÚRIA DO ZERO ABSOLUTO! O COLOSSO ABSORVEU TODO O PERMAFROST!',
                  timer: 5.5,
                  maxTimer: 5.5
                };
                
                // Explode all remaining crystals
                enemiesRef.current.forEach(g => {
                  if (g.type === 'FROST_CRYSTAL' && g.hp > 0) {
                    g.hp = 0;
                    for (let i = 0; i < 10; i++) {
                      createParticle(g.x, g.y, 25, '#38bdf8', 20, 'IMPACT');
                    }
                  }
                });
                enemiesRef.current = enemiesRef.current.filter(g => g.type !== 'FROST_CRYSTAL');

                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 600, duration: 0,
                  maxDuration: 1.0, color: 'rgba(2, 132, 199, 0.60)', type: 'CIRCLE',
                  damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id
                });
              }
            } else if (e.type === 'BOSS_NIGHT_REAPER') {
              // Mors'thar Phase 2 Transition (HP <= 65% - Eclipse do Submundo + Clones Ilusórios)
              if (e.hp <= e.maxHp * 0.65 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.stateTimer = 1.0;
                shakeRef.current = 28;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '🌑 MORS\'THAR: FASE 2 - ECLIPSE DO SUBMUNDO! CLONES DE SOMBRA & GRITO DA CONDENAÇÃO!',
                  timer: 5.5,
                  maxTimer: 5.5
                };

                // Spawn 2 Shadow Clones
                for (let k = -1; k <= 1; k += 2) {
                  const cloneAng = Math.atan2(p.y - e.y, p.x - e.x) + k * (Math.PI / 3);
                  const cloneDist = 180;
                  enemiesRef.current.push(EnemyPool.acquire({
                    id: getNextId(), x: e.x + Math.cos(cloneAng) * cloneDist, y: e.y + Math.sin(cloneAng) * cloneDist, z: 0,
                    type: 'SHADOW_CLONE', isBoss: false, isElite: true,
                    hp: 350, maxHp: 350, ad: e.ad * 0.6, ap: e.ap * 0.6, armor: 15, mr: 20, speed: e.speed * 1.15, radius: 24, hitboxRadius: 24,
                    frame: 0, state: 'CHASING', stateTimer: 0, attackRange: 75,
                    windupTime: 0.4, recoverTime: 0.8, specialCooldown: 0, specialMaxCooldown: 2.0,
                    vx: 0, vy: 0, hitFlash: 0, color: 'rgba(76, 29, 149, 0.75)'
                  }));
                }

                // Disparar anel sônico expansivo
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 520, duration: 0,
                  maxDuration: 0.9, color: 'rgba(126, 34, 206, 0.55)', type: 'CIRCLE',
                  damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                });
              }

              // Mors'thar Phase 3 Transition (HP <= 30% - A Colheita Final / Lâmina do Julgamento)
              if (e.hp <= e.maxHp * 0.30 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.color = '#7c3aed';
                e.speed *= 1.35;
                e.ad *= 1.30;
                e.ap *= 1.30;
                e.specialMaxCooldown *= 0.55;
                shakeRef.current = 32;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '💀 MORS\'THAR: FASE 3 - A COLHEITA FINAL! FUGAM PARA AS 4 CRIPTAS LATERAIS!',
                  timer: 6.0,
                  maxTimer: 6.0
                };

                // Detonar a câmara central inteira forçando fuga para as criptas
                telegraphsRef.current.push({
                  id: getNextId(), x: 0, y: 0, radius: 520, duration: 0,
                  maxDuration: 2.2, color: 'rgba(147, 51, 234, 0.65)', type: 'CIRCLE',
                  damage: e.ap * 3.0, damageType: 'AP', sourceId: 'MORSTHAR_HARVEST'
                });
              }
            } else if (e.type === 'BOSS_VOID_SOVEREIGN') {
              // Check if Phase 2 crystals are all destroyed
              const activeVoidCrystals = enemiesRef.current.filter(g => g.type === 'VOID_CRYSTAL' && g.hp > 0).length;
              if (activeVoidCrystals === 0 && e.customAttackData?.crystalsActive) {
                e.customAttackData.crystalsActive = false;
                e.isStaggered = true;
                e.staggerTimer = 6.0;
                e.state = 'STAGGERED';
                e.stateTimer = 6.0;
                shakeRef.current = 32;
                audioManager.playLevelUpSfx();
                hazardToastRef.current = {
                  text: '🔮 CRISTAIS DE ENTROPIA DESTRUÍDOS! MAL\'GHAROK ESTÁ ATORDOADO E VULNERÁVEL (-50% DEFESA)!',
                  timer: 6.0,
                  maxTimer: 6.0
                };
                for (let i = 0; i < 35; i++) {
                  createParticle(e.x, e.y, 35, '#c084fc', 25, 'IMPACT');
                }
              }

              // Phase 2 Transition (HP <= 66% - Event Horizon & Spawns 3 Entropy Crystals)
              if (e.hp <= e.maxHp * 0.66 && e.bossPhase === 1) {
                e.bossPhase = 2;
                e.state = 'CHANNELING';
                e.stateTimer = 999;
                e.x = 0; e.y = 0;
                e.customAttackData = { type: 'EVENT_HORIZON', crystalsActive: true };
                shakeRef.current = 30;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '🌌 MAL\'GHAROK: FASE 2 - HORIZONTE DE EVENTOS! DESTRUA OS 3 CRISTAIS DE ENTROPIA PARA QUEBRAR A IMUNIDADE!',
                  timer: 6.0,
                  maxTimer: 6.0
                };

                const crystalLocs = [
                  { x: 0, y: -360 },
                  { x: -320, y: 220 },
                  { x: 320, y: 220 }
                ];
                crystalLocs.forEach(loc => {
                  enemiesRef.current.push(EnemyPool.acquire({
                    id: getNextId(), x: loc.x, y: loc.y, z: 0, type: 'VOID_CRYSTAL', isBoss: false, isElite: true,
                    hp: 500, maxHp: 500, ad: 0, ap: 0, armor: 35, mr: 35, speed: 0, radius: 30, hitboxRadius: 30,
                    frame: 0, state: 'GUARDING', stateTimer: 0, attackRange: 0,
                    windupTime: 0, recoverTime: 0, specialCooldown: 0, specialMaxCooldown: 0,
                    vx: 0, vy: 0, hitFlash: 0, color: '#7e22ce'
                  }));
                });

                telegraphsRef.current.push({
                  id: getNextId(), x: 0, y: 0, radius: 600, duration: 0,
                  maxDuration: 1.0, color: 'rgba(126, 34, 206, 0.60)', type: 'CIRCLE',
                  damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                });
              }

              // Phase 3 Transition (HP <= 33% - Cosmic Collapse)
              if (e.hp <= e.maxHp * 0.33 && e.bossPhase === 2) {
                e.bossPhase = 3;
                e.state = 'ENRAGED';
                e.stateTimer = 1.0;
                e.color = '#7e22ce';
                e.speed *= 1.30;
                e.ad *= 1.30;
                e.ap *= 1.30;
                e.specialMaxCooldown *= 0.55;
                shakeRef.current = 34;
                audioManager.playCorruptionAlertSfx();
                hazardToastRef.current = {
                  text: '💥 MAL\'GHAROK: FASE 3 - COLAPSO CÓSMICO! VÓRTICE DO FIM E RUPTURAS DIMENSIONAIS!',
                  timer: 6.0,
                  maxTimer: 6.0
                };

                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 650, duration: 0,
                  maxDuration: 1.0, color: 'rgba(244, 63, 94, 0.65)', type: 'CIRCLE',
                  damage: e.ap * 2.5, damageType: 'AP', sourceId: e.id
                });
              }
            } else {
              // Other bosses: Enrage transition (< 35% HP)
              if (e.hp < e.maxHp * 0.35 && e.bossPhase === 1) {
                e.bossPhase = 2; e.state = 'ENRAGED'; e.stateTimer = 1.0;
                e.color = '#ff0000'; 
                e.speed *= 1.40; 
                e.ad *= 1.35;
                e.ap *= 1.35;
                e.specialMaxCooldown *= 0.60;
                shakeRef.current = 25;
                
                // Enrage Nova Burst
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 450, duration: 0,
                  maxDuration: 1.0, color: 'rgba(255, 0, 0, 0.4)', type: 'CIRCLE',
                  damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                });
                for (let i=0; i<10; i++) {
                  createParticle(e.x, e.y, 20, '#ff0000', 30, 'IMPACT');
                }
              }

              if (e.bossPhase === 2 && Math.random() < 0.2) {
                createParticle(e.x, e.y, 40, '#ff0000', 2, 'IMPACT');
              }
            }
          }

          if (e.state === 'CHASING' || e.state === 'ENRAGED') {
            if (distToPlayer > e.attackRange) {
              const currentMap = getFloorMap(floorRef.current);
              const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 24, currentMap, false);
              e.x = nextPos.x;
              e.y = nextPos.y;
            } else if (e.specialCooldown <= 0) {
              e.state = 'WINDUP';
              e.stateTimer = e.type === 'BOSS_FORGE_DRAGON' ? (e.bossPhase >= 3 ? 0.35 : 0.50) : (e.bossPhase >= 4 ? 0.6 : (e.bossPhase >= 3 ? 0.7 : e.windupTime));
              e.specialCooldown = e.type === 'BOSS_FORGE_DRAGON' ? (e.bossPhase >= 3 ? 0.5 : 1.1) : e.specialMaxCooldown;
              const r = Math.random();

              if (e.type === 'BOSS_CRYSTAL_GOLIAS') {
                if (e.bossPhase === 1) {
                  // Phase 1 Attacks (High Leap frequency: 50% chance, Huge Leap AoE: 320px)
                  if (r < 0.50) {
                    // Attack 1: Salto Sísmico Colossal (Persegue o jogador com grande AoE e Atordoamento)
                    const predX = p.x + (p.vx || 0) * e.windupTime * 0.75;
                    const predY = p.y + (p.vy || 0) * e.windupTime * 0.75;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 320, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(16, 185, 129, 0.45)', type: 'CIRCLE',
                      damage: e.ad * 2.5, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else if (r < 0.80) {
                    // Attack 2: Rajada de Quartzo Gigante (Leque Amplo de 620px)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 620, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(52, 211, 153, 0.45)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI / 2.2, damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  } else {
                    // Attack 3: Prisão Sísmica de Cristais (6 zonas simultâneas cercando a arena)
                    for (let k = 0; k < 6; k++) {
                      const ringAngle = (Math.PI * 2 / 6) * k + (Math.random() - 0.5) * 0.2;
                      const ringX = p.x + Math.cos(ringAngle) * 140;
                      const ringY = p.y + Math.sin(ringAngle) * 140;
                      telegraphsRef.current.push({
                        id: getNextId(), x: ringX, y: ringY, radius: 110, duration: 0,
                        maxDuration: e.windupTime * 1.15, color: 'rgba(16, 185, 129, 0.45)', type: 'CIRCLE',
                        damage: e.ap * 1.6, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                } else if (e.bossPhase === 2) {
                  // Phase 2 Attacks (Leap 50%, Huge Cone 30%, Chuva de Fragmentos 20%)
                  if (r < 0.50) {
                    const predX = p.x + (p.vx || 0) * 0.7;
                    const predY = p.y + (p.vy || 0) * 0.7;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 330, duration: 0,
                      maxDuration: 0.85, color: 'rgba(16, 185, 129, 0.45)', type: 'CIRCLE',
                      damage: e.ad * 2.6, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else if (r < 0.80) {
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 650, duration: 0,
                      maxDuration: 0.85, color: 'rgba(52, 211, 153, 0.45)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI / 2.0, damage: e.ap * 2.1, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  } else {
                    // Chuva de Estilhaços Massiva (7 impactos na arena)
                    for (let m = 0; m < 7; m++) {
                      const mOffsetAngle = Math.random() * Math.PI * 2;
                      const mOffsetDist = 40 + Math.random() * 260;
                      telegraphsRef.current.push({
                        id: getNextId(), x: p.x + Math.cos(mOffsetAngle) * mOffsetDist,
                        y: p.y + Math.sin(mOffsetAngle) * mOffsetDist, radius: 120, duration: 0,
                        maxDuration: 1.05, color: 'rgba(52, 211, 153, 0.50)', type: 'CIRCLE',
                        damage: e.ap * 1.7, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                } else if (e.bossPhase === 3) {
                  // Phase 3 Attacks (Leap 50%, Pulso Sísmico 30%, Linhas Telúricas 20%)
                  if (r < 0.50) {
                    const predX = p.x + (p.vx || 0) * 0.65;
                    const predY = p.y + (p.vy || 0) * 0.65;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 350, duration: 0,
                      maxDuration: 0.80, color: 'rgba(16, 185, 129, 0.50)', type: 'CIRCLE',
                      damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else if (r < 0.80) {
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 680, duration: 0,
                      maxDuration: 0.75, color: 'rgba(52, 211, 153, 0.50)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI / 1.8, damage: e.ap * 2.3, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  } else {
                    for (let k = 0; k < 6; k++) {
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 55, duration: 0,
                        maxDuration: 0.85, color: 'rgba(16, 185, 129, 0.50)', type: 'LINE',
                        angle: (Math.PI * 2 / 6) * k + (timeRef.current * 0.6), length: 700,
                        damage: e.ad * 1.9, damageType: 'AD', sourceId: e.id, attachToSource: false
                      });
                    }
                  }
                } else {
                  // Phase 4: Overload (Leap 55%, Rapid Cone 45%)
                  if (r < 0.55) {
                    const predX = p.x + (p.vx || 0) * 0.55;
                    const predY = p.y + (p.vy || 0) * 0.55;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 360, duration: 0,
                      maxDuration: 0.70, color: 'rgba(239, 68, 68, 0.50)', type: 'CIRCLE',
                      damage: e.ad * 3.0, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else {
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 720, duration: 0,
                      maxDuration: 0.65, color: 'rgba(239, 68, 68, 0.50)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI / 1.6, damage: e.ap * 2.5, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  }
                }
              } else if (e.type === 'BOSS_CORRUPTED_LEVIATHAN') {
                // Boss 2 Zhaerith: 4-Phase dynamic toxic mechanics
                if (e.bossPhase <= 2) {
                  if (r < 0.55) {
                    // Attack 1: Bote Abissal Global (Persegue o jogador em qualquer ponto do mapa com raio 380px)
                    const predX = p.x + (p.vx || 0) * 0.7;
                    const predY = p.y + (p.vy || 0) * 0.7;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 380, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(34, 197, 94, 0.45)', type: 'CIRCLE',
                      damage: e.ad * 2.5, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else {
                    // Attack 2: Cuspe Tóxico Frontal em Leque 120° (700px de alcance)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 700, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(34, 197, 94, 0.45)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI * 0.67, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  }
                } else {
                  // Phase 3 & 4: Maelstrom & Chain Global Leaps
                  if (r < 0.50) {
                    const predX = p.x + (p.vx || 0) * 0.55;
                    const predY = p.y + (p.vy || 0) * 0.55;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 400, duration: 0,
                      maxDuration: e.windupTime * 0.85, color: 'rgba(34, 197, 94, 0.50)', type: 'CIRCLE',
                      damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else if (r < 0.75) {
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 750, duration: 0,
                      maxDuration: e.windupTime * 0.85, color: 'rgba(34, 197, 94, 0.50)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI * 0.75, damage: e.ap * 2.5, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  } else {
                    // Dilúvio de Bile (8 zonas de impacto de ácido)
                    for (let m = 0; m < 8; m++) {
                      const mAngle = Math.random() * Math.PI * 2;
                      const mDist = 40 + Math.random() * 280;
                      telegraphsRef.current.push({
                        id: getNextId(), x: p.x + Math.cos(mAngle) * mDist,
                        y: p.y + Math.sin(mAngle) * mDist, radius: 130, duration: 0,
                        maxDuration: e.windupTime * 1.1, color: 'rgba(22, 101, 52, 0.50)', type: 'CIRCLE',
                        damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                }
              } else if (e.type === 'BOSS_FORGE_DRAGON') {
                // Boss 3 (Ignis): 3 Main Mechanics + Phase scaling (5x Radius & Screen-Wide Range)
                if (e.bossPhase === 1) {
                  if (r < 0.45) {
                    // Attack 1: Investida Flamejante Mega (Melee Dash - 220px width, 1800px length)
                    const predX = p.x + (p.vx || 0) * 0.4;
                    const predY = p.y + (p.vy || 0) * 0.4;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 220, duration: 0,
                      maxDuration: 0.50, color: 'rgba(239, 68, 68, 0.55)', type: 'LINE',
                      angle: Math.atan2(predY - e.y, predX - e.x), length: 1800,
                      damage: e.ad * 2.5, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                    });
                  } else {
                    // Attack 2: Sopro de Magma Global (5x Radius: 1800px cone, 150° broad fan)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 1800, duration: 0,
                      maxDuration: 0.55, color: 'rgba(249, 115, 22, 0.55)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI * 0.85, damage: e.ap * 2.4, damageType: 'AP', sourceId: 'boss_ignis_breath', attachToSource: true
                    });
                  }
                } else {
                  // Phase 2 & 3 Mechanics (High Frequency & Colossal Cataclysmic AoE)
                  if (r < 0.25) {
                    // Attack 1: Investida Flamejante Mega (Super Fast Dash)
                    const predX = p.x + (p.vx || 0) * 0.35;
                    const predY = p.y + (p.vy || 0) * 0.35;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 240, duration: 0,
                      maxDuration: 0.45, color: 'rgba(239, 68, 68, 0.60)', type: 'LINE',
                      angle: Math.atan2(predY - e.y, predX - e.x), length: 2000,
                      damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                    });
                  } else if (r < 0.70) {
                    // Attack 2 (Mecânica 1): Cataclismo de Meteoros Colossais (5x Meteor Radius: 550px each!)
                    const totalMeteors = e.bossPhase === 3 ? 16 : 8;
                    // Direct Meteor centered EXACTLY on player
                    telegraphsRef.current.push({
                      id: getNextId(), x: p.x, y: p.y,
                      radius: 550, duration: 0, maxDuration: 0.50,
                      color: 'rgba(220, 38, 38, 0.60)', type: 'CIRCLE',
                      damage: e.ap * 2.5, damageType: 'AP', sourceId: 'boss_ignis_meteor'
                    });
                    // Massive surrounding meteor shower
                    for (let m = 1; m < totalMeteors; m++) {
                      const ringAng = ((Math.PI * 2) / (totalMeteors - 1)) * m + (Math.random() - 0.5) * 0.3;
                      const ringDist = 350 + Math.random() * 450;
                      telegraphsRef.current.push({
                        id: getNextId(),
                        x: p.x + Math.cos(ringAng) * ringDist,
                        y: p.y + Math.sin(ringAng) * ringDist,
                        radius: 500,
                        duration: 0,
                        maxDuration: 0.50,
                        color: 'rgba(239, 68, 68, 0.55)',
                        type: 'CIRCLE',
                        damage: e.ap * 2.2,
                        damageType: 'AP',
                        sourceId: 'boss_ignis_meteor'
                      });
                    }
                  } else {
                    // Attack 3 (Mecânica 3): Terremoto Magmático (Cross Slam 280px thick, 2200px long)
                    for (let k = 0; k < 4; k++) {
                      const crossAngle = (Math.PI / 2) * k;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 280, duration: 0,
                        maxDuration: 0.45, color: 'rgba(239, 68, 68, 0.60)', type: 'LINE',
                        angle: crossAngle, length: 2200, damage: e.ad * 2.6, damageType: 'AD', sourceId: e.id, attachToSource: false
                      });
                    }
                    // Overcharge all magma vents & pillars
                    hazardsRef.current.forEach(h => {
                      if (h.type === 'MAGMA_VENT') {
                        h.isActive = true;
                        h.stateTimer = 4.0;
                      }
                    });
                    shakeRef.current = 28;
                  }
                }
              } else if (e.type === 'BOSS_ARTILLERY_WARLORD') {
                // BOSS_ARTILLERY_WARLORD Mechanics
                if (e.bossPhase === 1) {
                  if (r < 0.50) {
                    // Attack 1: Triple Mortar Barrage on predicted positions
                    for (let m = 0; m < 3; m++) {
                      const predX = p.x + (p.vx || 0) * (0.4 + m * 0.25) + (Math.random() - 0.5) * 60;
                      const predY = p.y + (p.vy || 0) * (0.4 + m * 0.25) + (Math.random() - 0.5) * 60;
                      telegraphsRef.current.push({
                        id: getNextId(), x: predX, y: predY, radius: 190, duration: 0,
                        maxDuration: 0.75 + m * 0.15, color: 'rgba(225, 29, 72, 0.55)', type: 'CIRCLE',
                        damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else {
                    // Attack 2: Dual Laser Cannon Beams
                    const baseAngle = angleToPlayer;
                    for (let b = -1; b <= 1; b += 2) {
                      const beamAngle = baseAngle + b * 0.15;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 70, duration: 0,
                        maxDuration: 0.65, color: 'rgba(244, 63, 94, 0.55)', type: 'LINE',
                        angle: beamAngle, length: 900, damage: e.ad * 2.4, damageType: 'AD', sourceId: e.id, attachToSource: true
                      });
                    }
                  }
                } else if (e.bossPhase === 2) {
                  if (r < 0.40) {
                    // Attack 1: Triple Mortar Barrage
                    for (let m = 0; m < 3; m++) {
                      const predX = p.x + (p.vx || 0) * (0.35 + m * 0.2) + (Math.random() - 0.5) * 50;
                      const predY = p.y + (p.vy || 0) * (0.35 + m * 0.2) + (Math.random() - 0.5) * 50;
                      telegraphsRef.current.push({
                        id: getNextId(), x: predX, y: predY, radius: 210, duration: 0,
                        maxDuration: 0.65 + m * 0.15, color: 'rgba(225, 29, 72, 0.60)', type: 'CIRCLE',
                        damage: e.ap * 2.4, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else if (r < 0.75) {
                    // Attack 2: Dual Laser Cannon Beams
                    const baseAngle = angleToPlayer;
                    for (let b = -1; b <= 1; b += 2) {
                      const beamAngle = baseAngle + b * 0.12;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 80, duration: 0,
                        maxDuration: 0.55, color: 'rgba(244, 63, 94, 0.60)', type: 'LINE',
                        angle: beamAngle, length: 1000, damage: e.ad * 2.6, damageType: 'AD', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else {
                    // Attack 3: Global Arena Bombardment (6 circular strikes)
                    for (let g = 0; g < 6; g++) {
                      const gAngle = Math.random() * Math.PI * 2;
                      const gDist = 60 + Math.random() * 320;
                      telegraphsRef.current.push({
                        id: getNextId(), x: p.x + Math.cos(gAngle) * gDist, y: p.y + Math.sin(gAngle) * gDist,
                        radius: 170, duration: 0, maxDuration: 0.85, color: 'rgba(225, 29, 72, 0.55)', type: 'CIRCLE',
                        damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                } else {
                  // Phase 3 Overload (360° Missiles Volley + Rapid Mortars)
                  if (r < 0.55) {
                    // Attack 1: 360° Rotating Volley (8 directional line blasts around boss)
                    for (let k = 0; k < 8; k++) {
                      const volleyAngle = (Math.PI * 2 / 8) * k + (timeRef.current * 0.5);
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 75, duration: 0,
                        maxDuration: 0.50, color: 'rgba(225, 29, 72, 0.65)', type: 'LINE',
                        angle: volleyAngle, length: 1100, damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id, attachToSource: false
                      });
                    }
                  } else {
                    // Attack 2: Rapid Quad Mortar Barrage
                    for (let m = 0; m < 4; m++) {
                      const predX = p.x + (p.vx || 0) * (0.3 + m * 0.15) + (Math.random() - 0.5) * 70;
                      const predY = p.y + (p.vy || 0) * (0.3 + m * 0.15) + (Math.random() - 0.5) * 70;
                      telegraphsRef.current.push({
                        id: getNextId(), x: predX, y: predY, radius: 220, duration: 0,
                        maxDuration: 0.50 + m * 0.10, color: 'rgba(225, 29, 72, 0.65)', type: 'CIRCLE',
                        damage: e.ap * 2.6, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                }
              } else if (e.type === 'BOSS_THUNDER_PHARAOH') {
                // BOSS_THUNDER_PHARAOH Gameplay Attack Patterns
                if (e.bossPhase === 1) {
                  if (r < 0.60) {
                    // Attack 1: Focused Lightning Beam (Fires a line designed to target Sarcophagi!)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 70, duration: 0,
                      maxDuration: 1.5, color: 'rgba(251, 191, 36, 0.70)', type: 'LINE',
                      angle: angleToPlayer, length: 1300, damage: e.ap * 2.2, damageType: 'AP', sourceId: 'PHARAOH_LIGHTNING', attachToSource: true
                    });
                  } else {
                    // Attack 2: Slow Tracking Static Orbs (3 local circles)
                    for (let b = 0; b < 3; b++) {
                      const orbAngle = angleToPlayer + (b - 1) * 0.35;
                      const predX = p.x + Math.cos(orbAngle) * 110;
                      const predY = p.y + Math.sin(orbAngle) * 110;
                      telegraphsRef.current.push({
                        id: getNextId(), x: predX, y: predY, radius: 160, duration: 0,
                        maxDuration: 1.2, color: 'rgba(234, 179, 8, 0.45)', type: 'CIRCLE',
                        damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                } else if (e.bossPhase === 2) {
                  // Phase 2: Unstable Thunderstorms
                  if (r < 0.50) {
                    // Attack 1: Focused Lightning Beam (Shorter windup)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 80, duration: 0,
                      maxDuration: 1.2, color: 'rgba(251, 191, 36, 0.75)', type: 'LINE',
                      angle: angleToPlayer, length: 1400, damage: e.ap * 2.5, damageType: 'AP', sourceId: 'PHARAOH_LIGHTNING', attachToSource: true
                    });
                  } else if (r < 0.85) {
                    // Attack 2: Thunderstorm local strikes (3 circles)
                    for (let s = 0; s < 3; s++) {
                      const sx = p.x + (Math.random() - 0.5) * 220;
                      const sy = p.y + (Math.random() - 0.5) * 220;
                      telegraphsRef.current.push({
                        id: getNextId(), x: sx, y: sy, radius: 180, duration: 0,
                        maxDuration: 0.85, color: 'rgba(251, 191, 36, 0.50)', type: 'CIRCLE',
                        damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else {
                    // Attack 3: Static Sand Tornadoes (5 circles)
                    for (let s = 0; s < 5; s++) {
                      const tAngle = Math.random() * Math.PI * 2;
                      const tDist = 80 + Math.random() * 260;
                      telegraphsRef.current.push({
                        id: getNextId(), x: p.x + Math.cos(tAngle) * tDist, y: p.y + Math.sin(tAngle) * tDist,
                        radius: 140, duration: 0, maxDuration: 1.0, color: 'rgba(234, 179, 8, 0.45)', type: 'CIRCLE',
                        damage: e.ad * 1.5, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                } else {
                  // Phase 3: Infinite Overdrive Storm (Expanding Shock rings + 8-Way Lightning Storm)
                  if (r < 0.50) {
                    // Attack 1: Expanding shockwaves
                    for (let ring = 0; ring < 3; ring++) {
                      const delay = ring * 0.25;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 160 + ring * 140, duration: 0,
                        maxDuration: 0.60 + delay, color: 'rgba(234, 179, 8, 0.60)', type: 'CIRCLE',
                        damage: e.ap * 2.8, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else {
                    // Attack 2: 8-Way Rotating Laser Storm
                    for (let l = 0; l < 8; l++) {
                      const beamAngle = (Math.PI * 2 / 8) * l + (timeRef.current * 0.4);
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 65, duration: 0,
                        maxDuration: 0.60, color: 'rgba(251, 191, 36, 0.65)', type: 'LINE',
                        angle: beamAngle, length: 1400, damage: e.ap * 2.4, damageType: 'AP', sourceId: e.id, attachToSource: false
                      });
                    }
                    // Micro ground targets
                    for (let s = 0; s < 4; s++) {
                      const sx = p.x + (Math.random() - 0.5) * 260;
                      const sy = p.y + (Math.random() - 0.5) * 260;
                      telegraphsRef.current.push({
                        id: getNextId(), x: sx, y: sy, radius: 155, duration: 0,
                        maxDuration: 0.70, color: 'rgba(234, 179, 8, 0.50)', type: 'CIRCLE',
                        damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                }
              } else if (e.type === 'BOSS_YETI_OVERLORD') {
                // --- YMIR, O COLOSSO DO ZERO ABSOLUTO (3 PHASES ATTACK SUITE) ---
                if (e.bossPhase === 1) {
                  if (r < 0.35) {
                    // Attack 1: Glacial Leap & Stomp
                    const predX = p.x + (p.vx || 0) * e.windupTime * 0.7;
                    const predY = p.y + (p.vy || 0) * e.windupTime * 0.7;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 210, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(56, 189, 248, 0.55)', type: 'CIRCLE',
                      damage: e.ad * 2.5, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  } else if (r < 0.70) {
                    // Attack 2: Frost Breath Cone
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 480, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(125, 211, 252, 0.55)', type: 'CONE',
                      angle: angleToPlayer, width: Math.PI / 2.5, damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  } else {
                    // Attack 3: Cryo Shard Line
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 55, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(2, 132, 199, 0.60)', type: 'LINE',
                      angle: angleToPlayer, length: 750, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                    });
                  }
                } else if (e.bossPhase === 2) {
                  // Phase 2 Tempestade Glacial
                  if (r < 0.40) {
                    // Attack 1: Triple Ice Wave Cones
                    for (let c = -1; c <= 1; c++) {
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 520, duration: 0,
                        maxDuration: 0.65, color: 'rgba(125, 211, 252, 0.55)', type: 'CONE',
                        angle: angleToPlayer + c * 0.35, width: Math.PI / 3.5, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else if (r < 0.75) {
                    // Attack 2: Blizzard Hailstorm (6 circular bombardments)
                    for (let g = 0; g < 6; g++) {
                      const gAngle = Math.random() * Math.PI * 2;
                      const gDist = 50 + Math.random() * 300;
                      telegraphsRef.current.push({
                        id: getNextId(), x: p.x + Math.cos(gAngle) * gDist, y: p.y + Math.sin(gAngle) * gDist,
                        radius: 160, duration: 0, maxDuration: 0.75, color: 'rgba(56, 189, 248, 0.55)', type: 'CIRCLE',
                        damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else {
                    // Attack 3: Permafrost Trample Charge
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 60, duration: 0,
                      maxDuration: 0.60, color: 'rgba(3, 105, 161, 0.60)', type: 'LINE',
                      angle: angleToPlayer, length: 850, damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                    });
                  }
                } else {
                  // Phase 3 Zero Absoluto Overdrive
                  if (r < 0.50) {
                    // Attack 1: Absolute Zero Expansive Nova
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 580, duration: 0,
                      maxDuration: 0.75, color: 'rgba(2, 132, 199, 0.65)', type: 'CIRCLE',
                      damage: e.ap * 2.8, damageType: 'AP', sourceId: e.id
                    });
                  } else {
                    // Attack 2: Quad Glacial Prison Strikes
                    for (let m = 0; m < 4; m++) {
                      const predX = p.x + (p.vx || 0) * (0.3 + m * 0.15) + (Math.random() - 0.5) * 60;
                      const predY = p.y + (p.vy || 0) * (0.3 + m * 0.15) + (Math.random() - 0.5) * 60;
                      telegraphsRef.current.push({
                        id: getNextId(), x: predX, y: predY, radius: 190, duration: 0,
                        maxDuration: 0.55 + m * 0.10, color: 'rgba(56, 189, 248, 0.65)', type: 'CIRCLE',
                        damage: e.ap * 2.4, damageType: 'AP', sourceId: e.id
                      });
                    }
                  }
                }
              } else if (e.type === 'BOSS_PRIME_COLOSSUS') {
                // --- PRIME COLOSSUS (PUZZLE CHASSIS / HIGH POWER RESUNANT ATTACKS) ---
                if (e.isStaggered) {
                  // No attacks while staggered
                } else {
                  if (r < 0.35) {
                    // Attack 1: Chrono-Laser Sweep (Rays sweeping from the colossus)
                    for (let l = 0; l < 4; l++) {
                      const beamAngle = (Math.PI * 2 / 4) * l + (timeRef.current * 0.25);
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 55, duration: 0,
                        maxDuration: e.windupTime, color: 'rgba(167, 139, 250, 0.65)', type: 'LINE',
                        angle: beamAngle, length: 1300, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else if (r < 0.70) {
                    // Attack 2: Resonant Fragment Rain (Falling heavy crystals)
                    for (let f = 0; f < 5; f++) {
                      const rx = p.x + (Math.random() - 0.5) * 450;
                      const ry = p.y + (Math.random() - 0.5) * 450;
                      telegraphsRef.current.push({
                        id: getNextId(), x: rx, y: ry, radius: 140, duration: 0,
                        maxDuration: e.windupTime + f * 0.15, color: 'rgba(139, 92, 246, 0.55)', type: 'CIRCLE',
                        damage: e.ap * 1.9, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else {
                    // Attack 3: Quantum Pulse Shockwave (Wide circle stomp)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 400, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(124, 58, 237, 0.45)', type: 'CIRCLE',
                      damage: e.ad * 2.3, damageType: 'AD', sourceId: e.id
                    });
                  }
                }
              } else if (e.type === 'BOSS_NIGHT_REAPER') {
                // --- MORS'THAR, THE NIGHT REAPER (SHADOW SCYTHES, CLONES & HARVEST) ---
                if (e.isStaggered) {
                  // Staggered by Holy Brazier Nova: completely vulnerable
                } else if (e.bossPhase === 1) {
                  if (r < 0.40) {
                    // Attack 1: Twin Boomerang Scythes
                    for (let s = -1; s <= 1; s += 2) {
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 45, duration: 0,
                        maxDuration: 0.60, color: 'rgba(147, 51, 234, 0.65)', type: 'LINE',
                        angle: angleToPlayer + s * 0.35, length: 700, damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else if (r < 0.75) {
                    // Attack 2: Teleport and Crescent Cleave
                    const frontX = p.x + Math.cos(angleToPlayer) * 70;
                    const frontY = p.y + Math.sin(angleToPlayer) * 70;
                    e.x = frontX; e.y = frontY;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 260, duration: 0,
                      maxDuration: 0.45, color: 'rgba(76, 29, 149, 0.65)', type: 'CONE',
                      angle: Math.atan2(p.y - e.y, p.x - e.x), width: Math.PI * 0.85,
                      damage: e.ad * 2.4, damageType: 'AD', sourceId: e.id, attachToSource: true
                    });
                  } else {
                    // Attack 3: Shadow Leap Slam
                    const predX = p.x + (p.vx || 0) * e.windupTime * 0.7;
                    const predY = p.y + (p.vy || 0) * e.windupTime * 0.7;
                    telegraphsRef.current.push({
                      id: getNextId(), x: predX, y: predY, radius: 190, duration: 0,
                      maxDuration: e.windupTime, color: 'rgba(126, 34, 206, 0.55)', type: 'CIRCLE',
                      damage: e.ad * 2.3, damageType: 'AD', sourceId: e.id, isJump: true
                    });
                  }
                } else if (e.bossPhase === 2) {
                  // Phase 2: Nether Eclipse (Quad Scythes & Nether Howl)
                  if (r < 0.35) {
                    // Attack 1: Quad Scythe Barrage
                    for (let s = 0; s < 4; s++) {
                      const fAng = angleToPlayer + (Math.PI / 2) * s;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 45, duration: 0,
                        maxDuration: 0.55, color: 'rgba(168, 85, 247, 0.65)', type: 'LINE',
                        angle: fAng, length: 750, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else if (r < 0.70) {
                    // Attack 2: Nether Howl (Expanding sonic circle)
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 440, duration: 0,
                      maxDuration: 0.65, color: 'rgba(126, 34, 206, 0.60)', type: 'CIRCLE',
                      damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id
                    });
                  } else {
                    // Attack 3: Phantom Ambush Cleave
                    e.x = p.x + (Math.random() - 0.5) * 100;
                    e.y = p.y + (Math.random() - 0.5) * 100;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 250, duration: 0,
                      maxDuration: 0.40, color: 'rgba(88, 28, 135, 0.70)', type: 'CONE',
                      angle: Math.atan2(p.y - e.y, p.x - e.x), width: Math.PI,
                      damage: e.ad * 2.6, damageType: 'AD', sourceId: e.id, attachToSource: true
                    });
                  }
                } else {
                  // Phase 3: The Final Harvest Overdrive
                  if (r < 0.40) {
                    // Continuous central room detonation
                    telegraphsRef.current.push({
                      id: getNextId(), x: 0, y: 0, radius: 490, duration: 0,
                      maxDuration: 1.3, color: 'rgba(147, 51, 234, 0.65)', type: 'CIRCLE',
                      damage: e.ap * 2.8, damageType: 'AP', sourceId: 'MORSTHAR_HARVEST'
                    });
                  } else if (r < 0.75) {
                    // Hexagonal Shadow Scythe Wheel
                    for (let c = 0; c < 6; c++) {
                      const crAng = (Math.PI * 2 / 6) * c + timeRef.current;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 50, duration: 0,
                        maxDuration: 0.50, color: 'rgba(192, 132, 252, 0.65)', type: 'LINE',
                        angle: crAng, length: 800, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else {
                    // Instant Critical Shadow Strike
                    e.x = p.x + (Math.random() - 0.5) * 80;
                    e.y = p.y + (Math.random() - 0.5) * 80;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 280, duration: 0,
                      maxDuration: 0.35, color: 'rgba(107, 33, 168, 0.75)', type: 'CIRCLE',
                      damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id
                    });
                  }
                }
              } else if (e.type === 'BOSS_CELESTIAL_EMPEROR') {
                // --- AURELIUS, THE CELESTIAL EMPEROR (3-PHASE SOLAR OVERHAUL) ---
                if (e.isStaggered) {
                  // Staggered: vulnerable state
                } else if (e.bossPhase === 1) {
                  // Phase 1: Holy Light Emperor
                  if (r < 0.35) {
                    // Solar Pillars of Judgement (4 targeted falling solar rays)
                    for (let j = 0; j < 4; j++) {
                      const pOffX = p.x + (p.vx || 0) * (0.3 + j * 0.15) + (Math.random() - 0.5) * 70;
                      const pOffY = p.y + (p.vy || 0) * (0.3 + j * 0.15) + (Math.random() - 0.5) * 70;
                      telegraphsRef.current.push({
                        id: getNextId(), x: pOffX, y: pOffY, radius: 140, duration: 0,
                        maxDuration: 0.65 + j * 0.12, color: 'rgba(251, 191, 36, 0.65)', type: 'CIRCLE',
                        damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else if (r < 0.70) {
                    // Quad Imperial Blade Wheel
                    for (let b = 0; b < 4; b++) {
                      const bAng = angleToPlayer + (Math.PI / 2) * b;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 55, duration: 0,
                        maxDuration: 0.55, color: 'rgba(245, 158, 11, 0.60)', type: 'LINE',
                        angle: bAng, length: 750, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else {
                    // Imperial Solar Thrust
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 55, duration: 0,
                      maxDuration: 0.50, color: 'rgba(251, 191, 36, 0.65)', type: 'LINE',
                      angle: angleToPlayer, length: 700, damage: e.ad * 2.2, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                    });
                  }
                } else if (e.bossPhase === 2) {
                  // Handled by CHANNELING state (rotating quad beam)
                } else {
                  // Phase 3: Supernova Ascendant
                  if (r < 0.35) {
                    // Supernova Expansion Blast
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 520, duration: 0,
                      maxDuration: 0.75, color: 'rgba(239, 68, 68, 0.65)', type: 'CIRCLE',
                      damage: e.ap * 2.8, damageType: 'AP', sourceId: e.id
                    });
                  } else if (r < 0.70) {
                    // Hexagonal Divine Starburst
                    for (let s = 0; s < 6; s++) {
                      const sAng = (Math.PI * 2 / 6) * s + timeRef.current * 0.5;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 50, duration: 0,
                        maxDuration: 0.50, color: 'rgba(251, 191, 36, 0.65)', type: 'LINE',
                        angle: sAng, length: 850, damage: e.ap * 2.4, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else {
                    // Radiant Teleport Smite
                    e.x = p.x + (Math.random() - 0.5) * 60;
                    e.y = p.y + (Math.random() - 0.5) * 60;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 240, duration: 0,
                      maxDuration: 0.40, color: 'rgba(245, 158, 11, 0.75)', type: 'CIRCLE',
                      damage: e.ad * 2.8, damageType: 'AD', sourceId: e.id
                    });
                  }
                }
              } else if (e.type === 'BOSS_VOID_SOVEREIGN') {
                // --- MAL'GHAROK, THE VOID SOVEREIGN (3-PHASE ATTACK PATTERNS) ---
                if (e.isStaggered) {
                  // Staggered state from shattering Phase 2 crystals
                } else if (e.bossPhase === 1) {
                  // Phase 1: Lord of Rifts (100% to 66% HP)
                  if (r < 0.35) {
                    // Crossed Void Blade ('X' wave pattern)
                    for (let cb = 0; cb < 2; cb++) {
                      const cbAng = angleToPlayer + (cb === 0 ? -0.35 : 0.35);
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 60, duration: 0,
                        maxDuration: 0.55, color: 'rgba(192, 132, 252, 0.65)', type: 'LINE',
                        angle: cbAng, length: 850, damage: e.ap * 2.2, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else if (r < 0.70) {
                    // Antimatter Comet Shower (4 targeted AoEs in series)
                    for (let c = 0; c < 4; c++) {
                      const cX = p.x + (p.vx || 0) * (0.3 + c * 0.15) + (Math.random() - 0.5) * 60;
                      const cY = p.y + (p.vy || 0) * (0.3 + c * 0.15) + (Math.random() - 0.5) * 60;
                      telegraphsRef.current.push({
                        id: getNextId(), x: cX, y: cY, radius: 135, duration: 0,
                        maxDuration: 0.60 + c * 0.12, color: 'rgba(147, 51, 234, 0.65)', type: 'CIRCLE',
                        damage: e.ap * 2.0, damageType: 'AP', sourceId: e.id
                      });
                    }
                  } else {
                    // Spectral Shift (Teleport leaving exploding decoy)
                    const oldX = e.x; const oldY = e.y;
                    const backAngle = angleToPlayer + Math.PI + (Math.random() - 0.5) * 0.5;
                    e.x = p.x + Math.cos(backAngle) * 220;
                    e.y = p.y + Math.sin(backAngle) * 220;
                    createParticle(oldX, oldY, 10, '#c084fc', 25, 'MAGIC');
                    telegraphsRef.current.push({
                      id: getNextId(), x: oldX, y: oldY, radius: 160, duration: 0,
                      maxDuration: 0.70, color: 'rgba(88, 28, 135, 0.70)', type: 'CIRCLE',
                      damage: e.ap * 2.4, damageType: 'AP', sourceId: e.id
                    });
                  }
                } else if (e.bossPhase === 2) {
                  // Handled by CHANNELING state (Event Horizon Black Hole + 3 Void Crystals)
                } else {
                  // Phase 3: Cosmic Collapse (Below 33% HP)
                  if (r < 0.35) {
                    // Vortex of the End (8 rotating spiral laser beams)
                    for (let v = 0; v < 8; v++) {
                      const vAng = (Math.PI * 2 / 8) * v + timeRef.current * 0.6;
                      telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 50, duration: 0,
                        maxDuration: 0.50, color: 'rgba(244, 63, 94, 0.70)', type: 'LINE',
                        angle: vAng, length: 950, damage: e.ap * 2.6, damageType: 'AP', sourceId: e.id, attachToSource: true
                      });
                    }
                  } else if (r < 0.70) {
                    // Execution of the Void (Huge dark circle around player)
                    telegraphsRef.current.push({
                      id: getNextId(), x: p.x, y: p.y, radius: 300, duration: 0,
                      maxDuration: 0.70, color: 'rgba(168, 85, 247, 0.75)', type: 'CIRCLE',
                      damage: e.ap * 3.2, damageType: 'AP', sourceId: e.id
                    });
                  } else {
                    // Dimensional Rupture Teleport Smite
                    e.x = p.x + (Math.random() - 0.5) * 50;
                    e.y = p.y + (Math.random() - 0.5) * 50;
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 220, duration: 0,
                      maxDuration: 0.40, color: 'rgba(126, 34, 206, 0.80)', type: 'CIRCLE',
                      damage: e.ad * 3.0, damageType: 'AD', sourceId: e.id
                    });
                  }
                }
              } else {
                // Floors 4-10 Bosses: 3 attacks (Melee Slam/Dash, Ranged Cone, Arena Circles)
                if (r < 0.35) {
                  const predX = p.x + (p.vx || 0) * e.windupTime * 0.7;
                  const predY = p.y + (p.vy || 0) * e.windupTime * 0.7;
                  telegraphsRef.current.push({
                    id: getNextId(), x: predX, y: predY, radius: 180, duration: 0,
                    maxDuration: e.windupTime, color: 'rgba(220,38,38,0.35)', type: 'CIRCLE',
                    damage: e.ad * 2.4, damageType: 'AD', sourceId: e.id, isJump: true
                  });
                } else if (r < 0.70) {
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 450, duration: 0,
                    maxDuration: e.windupTime, color: 'rgba(249,115,22,0.35)', type: 'CONE',
                    angle: angleToPlayer, width: Math.PI / 3, damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id, attachToSource: true
                  });
                } else {
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 50, duration: 0,
                    maxDuration: e.windupTime, color: 'rgba(220,38,38,0.35)', type: 'LINE',
                    angle: angleToPlayer, length: 650, damage: e.ad * 1.8, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                  });
                }
              }
            }
          } else if (e.state === 'DASHING') {
            e.x += (e.dashVx || 0) * dt;
            e.y += (e.dashVy || 0) * dt;
            e.dashTimer = (e.dashTimer || 0) - dt;
            if (particlesRef.current.length < 250 && Math.random() < 0.5) {
              createParticle(e.x, e.y, e.z + 10, e.color || '#ef4444', 3, 'IMPACT');
            }
            const distP = Math.hypot(p.x - e.x, p.y - e.y);
            if (distP < e.radius + 28) {
              e.customAttackData = e.customAttackData || {};
              e.customAttackData.dashHitTimer = (e.customAttackData.dashHitTimer || 0) - dt;
              if (e.customAttackData.dashHitTimer <= 0) {
                 e.customAttackData.dashHitTimer = 0.5;
                 takeDamage(p, e.ad * 1.5, 'AD');
                 p.stunTimer = 0.2;
              }
            }
            if (e.dashTimer <= 0) {
              e.state = 'RECOVERING';
              e.stateTimer = e.recoverTime || 0.8;
            }
          } else if (e.state === 'JUMPING') {
            e.x += (e.vx || 0) * dt;
            e.y += (e.vy || 0) * dt;
            e.z += (e.vz || 0) * dt;
            e.vz = (e.vz || 0) - 950 * dt;
            if (e.z <= 0) {
              e.z = 0;
              e.state = 'RECOVERING';
              e.stateTimer = e.recoverTime || 0.8;
              e.vx = 0; e.vy = 0; e.vz = 0;
              shakeRef.current = e.isBoss ? 26 : 8;
              audioManager.playExplosionSfx();
              createParticle(e.x, e.y, 0, e.color || '#ef4444', e.isBoss ? 35 : 12, 'IMPACT');
              
              // Shockwave ring particles
              for (let i = 0; i < 20; i++) {
                const ang = (Math.PI * 2 / 20) * i;
                const spd = 260;
                particlesRef.current.push({
                  id: getNextId(),
                  x: e.x, y: e.y, z: 5,
                  vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, vz: 100,
                  life: 0.6, maxLife: 0.6,
                  color: e.color || '#10b981', size: 6, type: 'IMPACT'
                });
              }

              const distP = Math.hypot(p.x - e.x, p.y - e.y);
              const impactRadius = e.isBoss ? (e.radius + 180) : (e.radius + 60);
              if (distP < impactRadius) {
                takeDamage(p, e.isBoss ? e.ad * 2.2 : e.ad * 1.5, 'AD');
                if (e.isBoss) {
                  if (e.type === 'BOSS_CORRUPTED_LEVIATHAN') {
                    p.slowTimer = 2.5;
                    hazardToastRef.current = { text: '🐍 BOTE ABISSAL! LODO TÓXICO APLICOU 60% DE LENTIDÃO!', timer: 2.0, maxTimer: 2.0 };
                    for (let poolIdx = 0; poolIdx < 4; poolIdx++) {
                      const poolAng = (Math.PI / 2) * poolIdx;
                      spawnAcidPool(e.x + Math.cos(poolAng) * 110, e.y + Math.sin(poolAng) * 110, 80, 7.0, 16);
                    }
                  } else {
                    p.stunTimer = 1.2; // 1.2s Stun on Boss Jump Impact!
                    hazardToastRef.current = { text: '💥 IMPACTO COLOSSAL! VOCÊ FOI ATORDOADO POR 1.2s!', timer: 2.0, maxTimer: 2.0 };
                  }
                }
              }
            }
          } else if (e.state === 'SUBMERGED') {
            e.stateTimer -= dt;
            const subAngle = Math.atan2(p.y - e.y, p.x - e.x);
            e.x += Math.cos(subAngle) * e.speed * 1.35 * dt;
            e.y += Math.sin(subAngle) * e.speed * 1.35 * dt;
            if (Math.random() < 0.7) {
              createParticle(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, 2, '#22c55e', 5, 'MAGIC');
            }
            if (e.stateTimer <= 0) {
              e.state = 'CHASING';
              e.z = 0;
              shakeRef.current = 24;
              audioManager.playExplosionSfx();
              createParticle(e.x, e.y, 10, '#16a34a', 30, 'IMPACT');
              const distP = Math.hypot(p.x - e.x, p.y - e.y);
              if (distP < 200) {
                takeDamage(p, e.ad * 2.2, 'AD');
                p.slowTimer = 2.5;
                hazardToastRef.current = { text: '💥 EMBOSCADA ABISSAL! ZHAERITH EMERGIU DO LODO!', timer: 2.0, maxTimer: 2.0 };
              }
              for (let poolIdx = 0; poolIdx < 4; poolIdx++) {
                const poolAng = (Math.PI / 2) * poolIdx;
                spawnAcidPool(e.x + Math.cos(poolAng) * 90, e.y + Math.sin(poolAng) * 90, 75, 7.0, 15);
              }
            }
          } else if (e.state === 'PHASE_2') {
            e.stateTimer -= dt;
            if (distToPlayer < 400) {
              e.x -= ((p.x - e.x)/distToPlayer) * e.speed * dt;
              e.y -= ((p.y - e.y)/distToPlayer) * e.speed * dt;
            }
            if (e.stateTimer <= 0) e.state = 'CHASING';
          } else if (e.state === 'WINDUP') {
            e.stateTimer -= dt;
            if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
          } else if (e.state === 'RECOVERING') {
            e.stateTimer -= dt;
            if (e.stateTimer <= 0) e.state = e.bossPhase >= 2 ? 'ENRAGED' : 'CHASING';
          } else if (e.state === 'CHANNELING') {
            e.stateTimer -= dt;
            if (e.customAttackData) {
              if (e.customAttackData.type === 'ROTATIONAL_CROSS') {
                e.customAttackData.angleOffset += (15 * Math.PI / 180) * dt; // 15 degrees per sec
                const ang = e.customAttackData.angleOffset;
                const dmg = e.customAttackData.damage;
                // Emit multiple overlapping line telegraphs per frame that expire very fast 
                // OR we just create a custom telegraph object handled in combat loop.
                // Let's spawn 4 short telegraphs every 0.1s that instantly pop
                e.customAttackData.pulseTimer = (e.customAttackData.pulseTimer || 0) - dt;
                if (e.customAttackData.pulseTimer <= 0) {
                  e.customAttackData.pulseTimer = 0.1;
                  for (let i = 0; i < 4; i++) {
                     telegraphsRef.current.push({
                        id: getNextId(), x: e.x, y: e.y, radius: 120, duration: 0,
                        maxDuration: 0.15, color: 'rgba(239, 68, 68, 0.5)', type: 'LINE',
                        angle: ang + (Math.PI / 2) * i, length: 1500,
                        damage: dmg, damageType: 'AP', sourceId: e.id, attachToSource: false
                     });
                  }
                }
              } else if (e.customAttackData.type === 'NOVA_RING') {
                e.customAttackData.progress += (1000 / 4) * dt; // 4 seconds to reach 1000
                const radius = e.customAttackData.progress;
                createParticle(e.x, e.y, 10, '#c084fc', 2, 'IMPACT');
                const distP = Math.hypot(p.x - e.x, p.y - e.y);
                // Hit if within ring border (thickness 40)
                if (Math.abs(distP - radius) < 40 && p.z <= 0) {
                  e.customAttackData.hitPlayer = (e.customAttackData.hitPlayer || 0) - dt;
                  if (e.customAttackData.hitPlayer <= 0) {
                    takeDamage(p, e.customAttackData.damage, 'AP');
                    e.customAttackData.hitPlayer = 1.0; // immune for 1s
                  }
                }
              } else if (e.type === 'BOSS_CELESTIAL_EMPEROR') {
                e.customAttackData.beamAngle = (e.customAttackData.beamAngle || 0) + (e.customAttackData.rotationSpeed || 0.55) * dt;
                const bAng = e.customAttackData.beamAngle;
                e.customAttackData.beamPulseTimer = (e.customAttackData.beamPulseTimer || 0) - dt;
                if (e.customAttackData.beamPulseTimer <= 0) {
                  e.customAttackData.beamPulseTimer = 0.12;
                  for (let i = 0; i < 4; i++) {
                    telegraphsRef.current.push({
                      id: getNextId(), x: e.x, y: e.y, radius: 100, duration: 0,
                      maxDuration: 0.18, color: 'rgba(251, 191, 36, 0.60)', type: 'LINE',
                      angle: bAng + (Math.PI / 2) * i, length: 1400,
                      damage: e.ap * 0.8, damageType: 'AP', sourceId: e.id, attachToSource: false
                    });
                  }
                }
              } else if (e.customAttackData?.type === 'EVENT_HORIZON') {
                // Pull player slowly toward (0,0)
                const distP0 = Math.hypot(p.x, p.y);
                if (distP0 > 20 && distP0 < 700) {
                  const pAngle = Math.atan2(-p.y, -p.x);
                  p.x += Math.cos(pAngle) * 90 * dt;
                  p.y += Math.sin(pAngle) * 90 * dt;
                }
                if (Math.random() < 0.4) {
                  createParticle(e.x + (Math.random() - 0.5) * 80, e.y + (Math.random() - 0.5) * 80, 10, '#c084fc', 3, 'MAGIC');
                }
              }
            }
            if (e.stateTimer <= 0) {
              e.state = 'RECOVERING'; 
              e.stateTimer = e.recoverTime; 
              e.customAttackData = null;
            }
          }
        } else {
          // --- COMMON & ELITE ENEMIES WITH UNIQUE ARCHETYPES ---
          if (e.type === 'PRISM_SIPHON') {
            if (e.state === 'CHASING') {
              if (distToPlayer < 200) {
                // Kite / run away from player
                const kiteAngle = Math.atan2(e.y - p.y, e.x - p.x);
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, e.x + Math.cos(kiteAngle) * 150, e.y + Math.sin(kiteAngle) * 150, e.speed, dt, e.radius || 15, currentMap, false);
                e.x = nextPos.x;
                e.y = nextPos.y;
              } else if (distToPlayer > 420) {
                // Move closer to player to stay in channeling range
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 15, currentMap, false);
                e.x = nextPos.x;
                e.y = nextPos.y;
              }

              // Channel link to drain player cooldown recharge rate and heal nearby monsters periodically
              if (distToPlayer < 600) {
                p.isTetherSiphoned = true; // Set siphoned flag

                e.specialCooldown = (e.specialCooldown || 0) - dt;
                if (e.specialCooldown <= 0) {
                  e.specialCooldown = 2.0; // Every 2s, heal nearby monsters
                  const nearbyMonsters = enemiesRef.current.filter(other => other.id !== e.id && other.hp > 0 && Math.hypot(other.x - e.x, other.y - e.y) < 250);
                  nearbyMonsters.forEach(other => {
                    other.hp = Math.min(other.maxHp, other.hp + 40);
                    createParticle(other.x, other.y, 15, '#c084fc', 3, 'MAGIC');
                  });
                }
              }
            }
          } else if (e.type === 'INERTIA_SENTINEL') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 80) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 24, currentMap, false);
                e.x = nextPos.x;
                e.y = nextPos.y;
              } else if (e.specialCooldown <= 0) {
                // Shockwave stomp
                e.state = 'WINDUP';
                e.stateTimer = 0.8;
                e.specialCooldown = 4.0;

                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 150, duration: 0,
                  maxDuration: 0.8, color: 'rgba(148, 163, 184, 0.55)', type: 'CIRCLE',
                  damage: e.ad * 1.5, damageType: 'AD', sourceId: e.id
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) {
                e.state = 'CHASING';
                createParticle(e.x, e.y, 0, '#64748b', 12, 'IMPACT');
                const distP = Math.hypot(p.x - e.x, p.y - e.y);
                if (distP < 150) {
                  takeDamage(p, e.ad * 1.5, 'AD');
                  p.slowTimer = 2.0;
                }
              }
            }
          } else if (e.type === 'MARSH_JUMPER' || e.type === 'SLIME') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const jumpChance = distToPlayer < 350 ? 0.03 : 0.01;
                if (Math.random() < jumpChance && e.z <= 0) {
                  e.state = 'PREPARE_JUMP'; 
                  e.stateTimer = 0.4;
                  const jumpDuration = 0.8;
                  const leadX = (p.vx || 0) * jumpDuration * 0.85;
                  const leadY = (p.vy || 0) * jumpDuration * 0.85;
                  const spreadAngle = (enemyIndex % 8) * (Math.PI / 4);
                  const spreadDist = 40 + Math.random() * 35;
                  e.targetX = p.x + leadX + Math.cos(spreadAngle) * spreadDist;
                  e.targetY = p.y + leadY + Math.sin(spreadAngle) * spreadDist;
                } else if (e.z <= 0) {
                  const currentMap = getFloorMap(floorRef.current);
                  const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 15, currentMap, false);
                  e.x = nextPos.x;
                  e.y = nextPos.y;
                }
              } else if (e.specialCooldown <= 0) {
                e.state = 'WINDUP'; e.stateTimer = e.windupTime; e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: e.attackRange, duration: 0,
                  maxDuration: e.windupTime, color: 'rgba(34, 197, 94, 0.35)', type: 'CIRCLE',
                  damage: e.ad, damageType: 'AD', sourceId: e.id
                });
              }
            } else if (e.state === 'PREPARE_JUMP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) {
                e.state = 'JUMPING'; e.vz = 460;
                const jumpTime = (e.vz * 2) / 800;
                e.vx = (e.targetX! - e.x) / jumpTime;
                e.vy = (e.targetY! - e.y) / jumpTime;
              }
            } else if (e.state === 'JUMPING') {
              e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz! * dt; e.vz! -= 800 * dt;
              if (e.z <= 0) {
                e.z = 0; e.state = 'CHASING'; e.vx = 0; e.vy = 0; e.vz = 0;
                createParticle(e.x, e.y, 0, '#22c55e', 8, 'IMPACT');
                if (Math.hypot(p.x - e.x, p.y - e.y) < (e.radius || 20) + 55) takeDamage(p, e.ad, 'AD');
                if (e.type === 'MARSH_JUMPER') {
                  spawnAcidPool(e.x, e.y, 65, 5.0, 12);
                }
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SPORE_SPITTER') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 300) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 19, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else if (distToPlayer < 140) {
                const currentMap = getFloorMap(floorRef.current);
                const fleeX = e.x + Math.cos(angleToPlayer + Math.PI) * 120;
                const fleeY = e.y + Math.sin(angleToPlayer + Math.PI) * 120;
                const nextPos = resolveEnemySmoothPath(e.x, e.y, fleeX, fleeY, e.speed * 0.85, dt, e.radius || 19, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 380) {
                e.state = 'WINDUP'; e.stateTimer = e.windupTime; e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 35, duration: 0,
                  maxDuration: e.windupTime, color: 'rgba(34, 197, 94, 0.45)', type: 'LINE',
                  angle: angleToPlayer, length: 420, damage: e.ap * 1.6, damageType: 'AP', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'CANNON_ARCHER') {
            // Long range artillery archer
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 15, currentMap, false);
                e.x = nextPos.x;
                e.y = nextPos.y;
              } else if (distToPlayer < 120) {
                const currentMap = getFloorMap(floorRef.current);
                const fleeX = e.x + Math.cos(angleToPlayer + Math.PI) * 100;
                const fleeY = e.y + Math.sin(angleToPlayer + Math.PI) * 100;
                const nextPos = resolveEnemySmoothPath(e.x, e.y, fleeX, fleeY, e.speed * 0.8, dt, e.radius || 15, currentMap, false);
                e.x = nextPos.x;
                e.y = nextPos.y;
              } else if (e.specialCooldown <= 0) {
                e.state = 'WINDUP'; e.stateTimer = e.windupTime; e.specialCooldown = e.specialMaxCooldown;
                // Line telegraph artillery shot
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 30, duration: 0,
                  maxDuration: e.windupTime, color: 'rgba(239, 68, 68, 0.4)', type: 'LINE',
                  angle: angleToPlayer, length: 550, damage: e.ad * 1.6, damageType: 'AD', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'MAGMA_BAT') {
            if (e.state === 'CHASING') {
              if (distToPlayer < 200) {
                const escapeAngle = Math.atan2(e.y - p.y, e.x - p.x);
                e.x += Math.cos(escapeAngle) * e.speed * dt;
                e.y += Math.sin(escapeAngle) * e.speed * dt;
              } else if (distToPlayer > 360) {
                const chaseAngle = Math.atan2(p.y - e.y, p.x - e.x);
                e.x += Math.cos(chaseAngle) * e.speed * dt;
                e.y += Math.sin(chaseAngle) * e.speed * dt;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 450) {
                e.state = 'WINDUP';
                e.stateTimer = 1.50;
                e.specialCooldown = 3.2;
                
                // Continuous Triple Bombardment Attack (Direct Hit + Predictive + Trap Ring)
                // 1. Direct Target: Centered EXACTLY on player's current position (Fixes standing still / moving miss issue)
                telegraphsRef.current.push({
                  id: getNextId(), x: p.x, y: p.y, radius: 125, duration: 0,
                  maxDuration: 1.50, color: 'rgba(239, 68, 68, 0.55)', type: 'CIRCLE',
                  damage: e.ap * 1.6, damageType: 'AP', sourceId: 'magma_bat_infernal_strike'
                });

                // 2. Predictive Target: Intercepts player's movement trajectory (adapted for 1.5s delay)
                const predX = p.x + (p.vx || 0) * 1.1;
                const predY = p.y + (p.vy || 0) * 1.1;
                telegraphsRef.current.push({
                  id: getNextId(), x: predX, y: predY, radius: 125, duration: 0,
                  maxDuration: 1.50, color: 'rgba(239, 68, 68, 0.50)', type: 'CIRCLE',
                  damage: e.ap * 1.5, damageType: 'AP', sourceId: 'magma_bat_infernal_strike'
                });

                // 3. Trap Ring Target: Flanks around player
                const offsetAngle = angleToPlayer + (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 3);
                telegraphsRef.current.push({
                  id: getNextId(),
                  x: p.x + Math.cos(offsetAngle) * 115,
                  y: p.y + Math.sin(offsetAngle) * 115,
                  radius: 120,
                  duration: 0,
                  maxDuration: 1.50,
                  color: 'rgba(249, 115, 22, 0.50)',
                  type: 'CIRCLE',
                  damage: e.ap * 1.4,
                  damageType: 'AP',
                  sourceId: 'magma_bat_infernal_strike'
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = 0.3; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'TESLA_MUMMY') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 15, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              
              // Cast lightning chain at the player instead of spamming telegraphs to each other
              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = 1.2;
                e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 15, duration: 0,
                  maxDuration: 1.2, color: 'rgba(6, 182, 212, 0.5)', type: 'LINE',
                  angle: angleToPlayer, length: 350, damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'PERMAFROST_WARDEN') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 28, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= e.attackRange + 30) {
                e.state = 'WINDUP'; e.stateTimer = 0.65; e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 45, duration: 0,
                  maxDuration: 0.65, color: 'rgba(2, 132, 199, 0.55)', type: 'LINE',
                  angle: angleToPlayer, length: 340, damage: e.ad * 2.2, damageType: 'AD', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'BLIZZARD_WRAITH' || e.type === 'FROST_WRAITH') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 22, currentMap, true);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              
              if (distToPlayer < 140 && p.z <= 0) {
                p.slowTimer = Math.max(p.slowTimer, 0.4);
                e.customAttackData = e.customAttackData || {};
                e.customAttackData.auraTimer = (e.customAttackData.auraTimer || 0) - dt;
                if (e.customAttackData.auraTimer <= 0) {
                  e.customAttackData.auraTimer = 0.5;
                  takeDamage(p, e.ap * 0.6, 'AP');
                }
              }

              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP'; e.stateTimer = 0.60; e.specialCooldown = e.specialMaxCooldown;
                const rAttack = Math.random();
                if (rAttack < 0.5) {
                  telegraphsRef.current.push({
                    id: getNextId(), x: p.x, y: p.y, radius: 110, duration: 0,
                    maxDuration: 0.60, color: 'rgba(125, 211, 252, 0.55)', type: 'CIRCLE',
                    damage: e.ap * 1.6, damageType: 'AP', sourceId: e.id
                  });
                } else {
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 35, duration: 0,
                    maxDuration: 0.60, color: 'rgba(56, 189, 248, 0.55)', type: 'LINE',
                    angle: angleToPlayer, length: 380, damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id, attachToSource: true
                  });
                }
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'CRYO_SPIKER') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 360) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 24, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else if (distToPlayer < 220) {
                const curMap = getFloorMap(floorRef.current);
                const backAngle = angleToPlayer + Math.PI;
                const nextPos = resolveMovement(e.x, e.y, e.x + Math.cos(backAngle) * e.speed * dt, e.y + Math.sin(backAngle) * e.speed * dt, e.radius || 24, curMap);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP'; e.stateTimer = 0.70; e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: p.x, y: p.y, radius: 100, duration: 0,
                  maxDuration: 0.70, color: 'rgba(3, 105, 161, 0.60)', type: 'CIRCLE',
                  damage: e.ad * 2.0, damageType: 'AD', sourceId: e.id
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'FROST_CRYSTAL') {
            if (Math.random() < 0.25) {
              createParticle(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, 20, '#38bdf8', 2, 'MAGIC');
            }
          } else if (e.type === 'CYBER_AUTOMATON') {
            if (e.state === 'GUARDING') {
              if (e.specialCooldown <= 0 && distToPlayer <= e.attackRange) {
                e.state = 'WINDUP';
                e.stateTimer = e.windupTime || 0.6;
                e.specialCooldown = e.specialMaxCooldown || 2.5;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 40, duration: 0,
                  maxDuration: e.windupTime || 0.6, color: 'rgba(244, 63, 94, 0.55)', type: 'LINE',
                  angle: angleToPlayer, length: 500, damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 28, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP'; e.stateTimer = e.windupTime; e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 45, duration: 0,
                  maxDuration: e.windupTime, color: 'rgba(234, 179, 8, 0.4)', type: 'LINE',
                  angle: angleToPlayer, length: 400, damage: e.ad * 2.0, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) {
                e.state = e.speed === 0 ? 'GUARDING' : 'CHASING';
              }
            }
          } else if (e.type === 'PRISM_SIPHON') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 480) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 18, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else if (distToPlayer < 240) {
                const curMap = getFloorMap(floorRef.current);
                const backAngle = angleToPlayer + Math.PI;
                const nextPos = resolveMovement(e.x, e.y, e.x + Math.cos(backAngle) * e.speed * dt, e.y + Math.sin(backAngle) * e.speed * dt, e.radius || 18, curMap);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 550) {
                e.state = 'WINDUP';
                e.stateTimer = 0.60;
                e.specialCooldown = e.specialMaxCooldown || 3.0;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 35, duration: 0,
                  maxDuration: 0.60, color: 'rgba(192, 132, 252, 0.60)', type: 'LINE',
                  angle: angleToPlayer, length: 550, damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.7; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'INERTIA_SENTINEL') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 28, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 250) {
                e.state = 'WINDUP';
                e.stateTimer = 0.65;
                e.specialCooldown = e.specialMaxCooldown || 3.8;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 55, duration: 0,
                  maxDuration: 0.65, color: 'rgba(71, 85, 105, 0.65)', type: 'LINE',
                  angle: angleToPlayer, length: 480, damage: e.ad * 2.2, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.9; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SHADOW_STALKER') {
            if (e.state === 'CHASING') {
              // Cloaked (almost invisible, moving with 1.6x haste)
              e.color = 'rgba(0,0,0,0.08)';
              if (distToPlayer > 65) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed * 1.6, dt, e.radius || 22, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else {
                // Ambush Strike: Blink behind player and strike
                const backAngle = Math.atan2(p.y - e.y, p.x - e.x);
                e.x = p.x + Math.cos(backAngle) * 45;
                e.y = p.y + Math.sin(backAngle) * 45;
                e.state = 'WINDUP';
                e.stateTimer = 0.25;
                e.specialCooldown = e.specialMaxCooldown || 2.5;
                e.color = '#0f172a'; // decloak
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 85, duration: 0,
                  maxDuration: 0.25, color: 'rgba(76, 29, 149, 0.65)', type: 'CONE',
                  angle: Math.atan2(p.y - e.y, p.x - e.x), width: Math.PI / 2,
                  damage: e.ad * 2.2, damageType: 'AD', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) {
                e.state = 'RECOVERING'; e.stateTimer = 0.8;
                if (distToPlayer < 90) {
                  takeDamage(p, e.ad * 2.2, 'AD');
                  shakeRef.current = Math.max(shakeRef.current, 8);
                }
                createParticle(e.x, e.y, 10, '#3b0764', 18, 'IMPACT');
              }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'CRYPT_NECROMANCER') {
            if (e.state === 'CHASING') {
              const currentMap = getFloorMap(floorRef.current);
              if (distToPlayer > 380) {
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 22, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else if (distToPlayer < 220) {
                const backAng = angleToPlayer + Math.PI;
                const nextPos = resolveMovement(e.x, e.y, e.x + Math.cos(backAng) * e.speed * dt, e.y + Math.sin(backAng) * e.speed * dt, e.radius || 22, currentMap);
                e.x = nextPos.x; e.y = nextPos.y;
              }

              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = 0.65;
                e.specialCooldown = e.specialMaxCooldown || 3.2;
                if (Math.random() < 0.5) {
                  // Underworld Chains: Fast linear root line
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 40, duration: 0,
                    maxDuration: 0.65, color: 'rgba(168, 85, 247, 0.65)', type: 'LINE',
                    angle: angleToPlayer, length: 500, damage: e.ap * 1.6, damageType: 'AP', sourceId: e.id, attachToSource: true
                  });
                } else {
                  // Triple Spectral Skulls
                  for (let s = -1; s <= 1; s++) {
                    const skX = p.x + Math.cos(angleToPlayer + s * 0.4) * 80;
                    const skY = p.y + Math.sin(angleToPlayer + s * 0.4) * 80;
                    telegraphsRef.current.push({
                      id: getNextId(), x: skX, y: skY, radius: 95, duration: 0,
                      maxDuration: 0.75 + Math.abs(s) * 0.15, color: 'rgba(147, 51, 234, 0.55)', type: 'CIRCLE',
                      damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id
                    });
                  }
                }
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.9; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'GRAVE_EXECUTIONER') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 32, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 140) {
                e.state = 'WINDUP';
                e.stateTimer = 0.75;
                e.specialCooldown = e.specialMaxCooldown || 3.5;
                // 360 Spin Anchor Cleave
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 170, duration: 0,
                  maxDuration: 0.75, color: 'rgba(71, 85, 105, 0.65)', type: 'CIRCLE',
                  damage: e.ad * 2.0, damageType: 'AD', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) {
                e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 1.1;
                if (distToPlayer <= 170) {
                  takeDamage(p, e.ad * 2.0, 'AD');
                  // Knockback
                  const kbAng = Math.atan2(p.y - e.y, p.x - e.x);
                  p.x += Math.cos(kbAng) * 120;
                  p.y += Math.sin(kbAng) * 120;
                  shakeRef.current = Math.max(shakeRef.current, 14);
                }
                createParticle(e.x, e.y, 15, '#475569', 22, 'IMPACT');
              }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SHADOW_CLONE') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 24, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 90) {
                e.state = 'WINDUP';
                e.stateTimer = 0.35;
                e.specialCooldown = e.specialMaxCooldown || 2.0;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 95, duration: 0,
                  maxDuration: 0.35, color: 'rgba(126, 34, 206, 0.55)', type: 'CONE',
                  angle: angleToPlayer, width: Math.PI / 2.5,
                  damage: e.ad * 1.3, damageType: 'AD', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = 0.6; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SOLAR_MONK') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 80) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 22, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = 0.40;
                e.specialCooldown = e.specialMaxCooldown || 2.8;
                const rAttack = Math.random();
                if (rAttack < 0.55) {
                  // Solar Palm Dash
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 45, duration: 0,
                    maxDuration: 0.40, color: 'rgba(251, 191, 36, 0.65)', type: 'LINE',
                    angle: angleToPlayer, length: 480, damage: e.ad * 1.8, damageType: 'AD', sourceId: e.id, isDash: true, attachToSource: true
                  });
                } else {
                  // Solar Flurry Strike
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 130, duration: 0,
                    maxDuration: 0.40, color: 'rgba(245, 158, 11, 0.60)', type: 'CIRCLE',
                    damage: e.ap * 1.5, damageType: 'AP', sourceId: e.id, attachToSource: true
                  });
                }
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.65; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SOLAR_PALADIN') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 30, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 220) {
                e.state = 'WINDUP';
                e.stateTimer = 0.65;
                e.specialCooldown = e.specialMaxCooldown || 3.5;
                const rAttack = Math.random();
                if (rAttack < 0.60) {
                  // Aegis Shield Cleave & Knockback
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 150, duration: 0,
                    maxDuration: 0.65, color: 'rgba(217, 119, 6, 0.65)', type: 'CONE',
                    angle: angleToPlayer, width: Math.PI / 2, damage: e.ad * 2.0, damageType: 'AD', sourceId: e.id, attachToSource: true
                  });
                } else {
                  // Radiant Judgment Leap
                  const predX = p.x + (p.vx || 0) * 0.6;
                  const predY = p.y + (p.vy || 0) * 0.6;
                  telegraphsRef.current.push({
                    id: getNextId(), x: predX, y: predY, radius: 160, duration: 0,
                    maxDuration: 0.70, color: 'rgba(245, 158, 11, 0.60)', type: 'CIRCLE',
                    damage: e.ad * 2.2, damageType: 'AD', sourceId: e.id, isJump: true
                  });
                }
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.9; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SOLAR_PRIESTESS') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 420) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 20, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else if (distToPlayer < 240) {
                // Back away from player
                const currentMap = getFloorMap(floorRef.current);
                const fleeAngle = angleToPlayer + Math.PI;
                const nextPos = resolveEnemySmoothPath(e.x, e.y, e.x + Math.cos(fleeAngle) * 160, e.y + Math.sin(fleeAngle) * 160, e.speed * 0.9, dt, e.radius || 20, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = 0.70;
                e.specialCooldown = e.specialMaxCooldown || 3.8;
                // Dual Solar Pillar Strikes
                for (let k = 0; k < 2; k++) {
                  const spX = p.x + (p.vx || 0) * (0.4 + k * 0.25) + (Math.random() - 0.5) * 50;
                  const spY = p.y + (p.vy || 0) * (0.4 + k * 0.25) + (Math.random() - 0.5) * 50;
                  telegraphsRef.current.push({
                    id: getNextId(), x: spX, y: spY, radius: 125, duration: 0,
                    maxDuration: 0.70 + k * 0.20, color: 'rgba(254, 240, 138, 0.65)', type: 'CIRCLE',
                    damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                  });
                }
                // Heal nearby allies
                enemiesRef.current.forEach(other => {
                  if (other.id !== e.id && other.hp > 0 && !other.isFriendly && Math.hypot(other.x - e.x, other.y - e.y) < 260) {
                    other.hp = Math.min(other.maxHp, other.hp + other.maxHp * 0.15);
                    createParticle(other.x, other.y, 25, '#fbbf24', 8, 'MAGIC');
                  }
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.8; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'SOLAR_RELIC') {
            if (Math.random() < 0.20) {
              createParticle(e.x + (Math.random() - 0.5) * 35, e.y + (Math.random() - 0.5) * 35, 25, '#fbbf24', 2, 'MAGIC');
            }
          } else if (e.type === 'VOID_ABERRATION') {
            if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 25, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0) {
                // Dimensional Leap behind player + Void Claws combo
                const backAngle = angleToPlayer + Math.PI + (Math.random() - 0.5) * 0.4;
                const oldX = e.x; const oldY = e.y;
                e.x = p.x + Math.cos(backAngle) * 110;
                e.y = p.y + Math.sin(backAngle) * 110;
                createParticle(oldX, oldY, 10, '#a21caf', 15, 'MAGIC');
                createParticle(e.x, e.y, 10, '#a21caf', 15, 'MAGIC');

                e.state = 'WINDUP';
                e.stateTimer = 0.35;
                e.specialCooldown = e.specialMaxCooldown || 3.5;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 110, duration: 0,
                  maxDuration: 0.35, color: 'rgba(162, 28, 175, 0.65)', type: 'CONE',
                  angle: Math.atan2(p.y - e.y, p.x - e.x), width: Math.PI / 2.2,
                  damage: e.ad * 1.6, damageType: 'AD', sourceId: e.id, attachToSource: true
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.6; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'ENTROPY_BEHEMOTH') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 90) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 36, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0 && distToPlayer <= 320) {
                // Gravitational Pulse: pull player & projectiles, then heavy stomp
                e.state = 'WINDUP';
                e.stateTimer = 0.8;
                e.specialCooldown = e.specialMaxCooldown || 5.0;
                const pullAngle = Math.atan2(e.y - p.y, e.x - p.x);
                p.x += Math.cos(pullAngle) * 90;
                p.y += Math.sin(pullAngle) * 90;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 220, duration: 0,
                  maxDuration: 0.8, color: 'rgba(88, 28, 135, 0.65)', type: 'CIRCLE',
                  damage: e.ad * 2.2, damageType: 'AD', sourceId: e.id
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 1.0; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'RIFT_CALLER') {
            if (e.state === 'CHASING') {
              if (distToPlayer > 440) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 22, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              } else if (distToPlayer < 240) {
                const backAng = angleToPlayer + Math.PI;
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, e.x + Math.cos(backAng) * 140, e.y + Math.sin(backAng) * 140, e.speed * 0.9, dt, e.radius || 22, currentMap, false);
                e.x = nextPos.x; e.y = nextPos.y;
              }
              if (e.specialCooldown <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = 0.5;
                e.specialCooldown = e.specialMaxCooldown || 4.2;
                // Unstable Rift (Ground AoE + 4 cross lasers)
                const predX = p.x + (p.vx || 0) * 0.5;
                const predY = p.y + (p.vy || 0) * 0.5;
                telegraphsRef.current.push({
                  id: getNextId(), x: predX, y: predY, radius: 130, duration: 0,
                  maxDuration: 0.75, color: 'rgba(192, 132, 252, 0.65)', type: 'CIRCLE',
                  damage: e.ap * 1.8, damageType: 'AP', sourceId: e.id
                });
                for (let k = 0; k < 4; k++) {
                  const crossAng = (Math.PI / 2) * k;
                  telegraphsRef.current.push({
                    id: getNextId(), x: predX, y: predY, radius: 45, duration: 0,
                    maxDuration: 0.85, color: 'rgba(168, 85, 247, 0.55)', type: 'LINE',
                    angle: crossAng, length: 450, damage: e.ap * 1.4, damageType: 'AP', sourceId: e.id
                  });
                }
                // Distortion Cloak shield to allies
                enemiesRef.current.forEach(other => {
                  if (other.id !== e.id && other.hp > 0 && !other.isFriendly && Math.hypot(other.x - e.x, other.y - e.y) < 240) {
                    other.hp = Math.min(other.maxHp * 1.3, other.hp + 120);
                    createParticle(other.x, other.y, 20, '#c084fc', 6, 'MAGIC');
                  }
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime || 0.8; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else if (e.type === 'VOID_CRYSTAL') {
            if (Math.random() < 0.25) {
              createParticle(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, 20, '#7e22ce', 2, 'MAGIC');
            }
          } else if (e.type === 'QUARTZ_GOLEM') {
            if (e.state === 'GUARDING') {
              const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_CRYSTAL_GOLIAS');
              if (boss && boss.hp > 0) {
                const guards = enemiesRef.current.filter(m => m.state === 'GUARDING' && m.hp > 0);
                const myIndex = guards.indexOf(e);
                const targetAngle = (Math.PI * 2 / Math.max(1, guards.length)) * myIndex + (timeRef.current * 0.75);
                if (e.orbitAngle === undefined) e.orbitAngle = targetAngle;
                let diff = targetAngle - e.orbitAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                e.orbitAngle += diff * 5 * dt;
                const targetX = boss.x + Math.cos(e.orbitAngle) * 140;
                const targetY = boss.y + Math.sin(e.orbitAngle) * 140;
                e.x += (targetX - e.x) * 6 * dt;
                e.y += (targetY - e.y) * 6 * dt;

                // Guardian defensive melee shock if player gets too close to guard (< 70px)
                if (distToPlayer < 70 && e.specialCooldown <= 0) {
                  e.specialCooldown = 2.0;
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: 90, duration: 0,
                    maxDuration: 0.55, color: 'rgba(16, 185, 129, 0.45)', type: 'CIRCLE',
                    damage: e.ad * 1.4, damageType: 'AD', sourceId: e.id
                  });
                }
              } else {
                // Boss dead or missing: transition from guarding to active chasing
                e.state = 'CHASING';
              }
            } else if (e.state === 'CHASING') {
              if (distToPlayer > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const nextPos = resolveEnemySmoothPath(e.x, e.y, p.x, p.y, e.speed, dt, e.radius || 28, currentMap, false);
                e.x = nextPos.x;
                e.y = nextPos.y;
              }

              // 100% MELEE ATTACK ONLY (Pancada Sísmica Pesada de Curta Distância)
              if (distToPlayer <= e.attackRange + 15 && e.specialCooldown <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = e.windupTime;
                e.specialCooldown = e.specialMaxCooldown;
                telegraphsRef.current.push({
                  id: getNextId(), x: e.x, y: e.y, radius: 105, duration: 0,
                  maxDuration: e.windupTime, color: 'rgba(16, 185, 129, 0.45)', type: 'CIRCLE',
                  damage: e.ad * 1.6, damageType: 'AD', sourceId: e.id
                });
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          } else {
            // General enemies (QUARTZ_GOLEM, SLIME fallback, etc.)
            if (e.state === 'GUARDING') {
              const boss = enemiesRef.current.find(b => b.isBoss);
              if (boss) {
                const minions = enemiesRef.current.filter(m => m.state === 'GUARDING');
                const myIndex = minions.indexOf(e);
                const targetAngle = (Math.PI * 2 / Math.max(1, minions.length)) * myIndex + (timeRef.current * 0.5);
                if (e.orbitAngle === undefined) e.orbitAngle = targetAngle;
                let diff = targetAngle - e.orbitAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                e.orbitAngle += diff * 5 * dt;
                const targetX = boss.x + Math.cos(e.orbitAngle)*120;
                const targetY = boss.y + Math.sin(e.orbitAngle)*120;
                e.x += (targetX - e.x) * 5 * dt; e.y += (targetY - e.y) * 5 * dt;
              } else { e.hp = 0; }
            } else if (e.state === 'CHASING') {
              let targetX = p.x; let targetY = p.y; let targetDist = distToPlayer;
              if (e.isFriendly) {
                let nearestDist = Infinity; let nearestEnemy = null;
                enemiesRef.current.forEach(other => {
                  if (!other.isFriendly && other.hp > 0) {
                    const d = Math.hypot(other.x - e.x, other.y - e.y);
                    if (d < nearestDist) { nearestDist = d; nearestEnemy = other; }
                  }
                });
                if (nearestEnemy) { targetX = nearestEnemy.x; targetY = nearestEnemy.y; targetDist = nearestDist; }
              }

              if (targetDist > e.attackRange) {
                const currentMap = getFloorMap(floorRef.current);
                const isFlying = e.type === 'BAT' || e.type === 'MAGMA_BAT' || e.type === 'FIRE_BAT' || e.type === 'GHOST';
                const nextPos = resolveEnemySmoothPath(e.x, e.y, targetX, targetY, e.speed, dt, (e.radius || 15) * (isFlying ? 0.5 : 1), currentMap, isFlying);
                e.x = nextPos.x;
                e.y = nextPos.y;
              } else if (e.specialCooldown <= 0) {
                e.state = 'WINDUP'; e.stateTimer = e.windupTime; e.specialCooldown = e.specialMaxCooldown;
                if (e.isFriendly) {
                  enemiesRef.current.forEach(other => {
                    if (!other.isFriendly && Math.hypot(other.x - e.x, other.y - e.y) <= e.attackRange) {
                      other.hp -= e.ad; other.hitFlash = 0.1; createParticle(other.x, other.y, other.z, '#ef4444', 5);
                    }
                  });
                } else {
                  telegraphsRef.current.push({
                    id: getNextId(), x: e.x, y: e.y, radius: e.attackRange, duration: 0,
                    maxDuration: e.windupTime, color: 'rgba(220,38,38,0.35)', type: 'CIRCLE',
                    damage: e.ad, damageType: 'AD', sourceId: e.id
                  });
                }
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) { e.state = 'RECOVERING'; e.stateTimer = e.recoverTime; }
            } else if (e.state === 'RECOVERING') {
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) e.state = 'CHASING';
            }
          }
        }
      });
      enemiesRef.current.forEach(e => {
        if (e.isBoss && e.hp <= 0 && gameStateRef.current === GameState.TOWER) {
          handleBossDefeated(e);
        }
      });
      compactAndReleaseEnemies(enemiesRef.current);
    },

    combat: (dt: number) => {
      const p = playerRef.current;
      const currentMap = getFloorMap(gameStateRef.current === GameState.FLOOR_0 ? 0 : floorRef.current);
      
      const enemyMap = new Map<string, Enemy>();
      for (let i = 0; i < enemiesRef.current.length; i++) {
        if (enemiesRef.current[i].hp > 0) {
           enemyMap.set(enemiesRef.current[i].id, enemiesRef.current[i]);
        }
      }

      // --- TELEGRAPHS ---
      telegraphsRef.current.forEach(t => {
        // Track position and angle if attached to source
        if (t.attachToSource) {
          const caster = enemyMap.get(t.sourceId);
          if (caster && caster.hp > 0) {
            t.x = caster.x;
            t.y = caster.y;
            if (t.type === 'CONE' || t.type === 'LINE') {
              t.angle = Math.atan2(p.y - caster.y, p.x - caster.x);
            }
          }
        }

        // Continuous tick effects for active telegraphs
        if (t.sourceId === 'player_singularity' && t.duration < t.maxDuration) {
          enemiesRef.current.forEach(e => {
            if (!e.isFriendly && e.hp > 0) {
              const d = Math.hypot(e.x - t.x, e.y - t.y);
              if (d <= t.radius * 1.5) {
                const pullAngle = Math.atan2(t.y - e.y, t.x - e.x);
                e.x += Math.cos(pullAngle) * 160 * dt;
                e.y += Math.sin(pullAngle) * 160 * dt;
                if (Math.random() < 0.15) {
                  damageEnemy(e, (p.stats.ap * 0.4) * dt, 'AP', p);
                  createParticle(e.x, e.y, e.z || 0, '#c084fc', 2, 'MAGIC');
                }
              }
            }
          });
        }

        t.duration += dt;
        if (t.duration >= t.maxDuration) {
          const caster = enemyMap.get(t.sourceId);

          if (t.isJump) {
            if (caster && caster.hp > 0) {
              caster.state = 'JUMPING';
              caster.z = 10;
              caster.vz = 550;
              const jumpTime = (caster.vz * 2) / 950;
              caster.vx = (t.x - caster.x) / jumpTime;
              caster.vy = (t.y - caster.y) / jumpTime;
              caster.ad = t.damage;
            }
          } else if (t.isDash) {
            if (caster && caster.hp > 0) {
              caster.state = 'DASHING';
              const dashSpeed = 820;
              const angle = t.angle ?? Math.atan2(p.y - caster.y, p.x - caster.x);
              caster.dashVx = Math.cos(angle) * 820;
              caster.dashVy = Math.sin(angle) * 820;
              caster.dashTimer = t.length! / 820;
              caster.ad = t.damage;
            }
          } else if (t.type === 'CIRCLE') {
            if (t.sourceId === 'player_meteor' || t.sourceId === 'player_singularity' || t.sourceId === 'player_nova' || t.sourceId?.startsWith('player_')) {
              createParticle(t.x, t.y, 0, t.color.includes('168') ? '#a855f7' : '#f97316', 30, 'IMPACT');
              shakeRef.current = Math.max(shakeRef.current, 10);
              if (t.damage > 0) {
                enemiesRef.current.forEach(e => {
                  if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= t.radius + (e.hitboxRadius || 15)) {
                    damageEnemy(e, t.damage, t.damageType, p);
                    if (t.sourceId === 'player_meteor') {
                      e.stunTimer = Math.max(e.stunTimer || 0, 2.0);
                      if (!e.statusEffects) e.statusEffects = {};
                      e.statusEffects.burning = 5.0; // Queima por 5 segundos
                    }
                  }
                });
                hazardsRef.current.forEach(h => {
                  if (!h.used && (h.hp !== undefined || h.type === 'EXPLODING_BARREL' || h.type === 'BREAKABLE_PILLAR' || h.type === 'SOUL_BRAZIER' || h.type === 'RESONANT_PILLAR' || h.type === 'FROST_CRYSTAL' || h.type === 'VOID_CRYSTAL')) {
                    if (Math.hypot(h.x - t.x, h.y - t.y) <= t.radius + (h.radius ? Math.min(45, h.radius) : 32)) {
                      damageHazard(h, t.damage, p);
                    }
                  }
                });
              }
            } else if (t.sourceId === 'magma_bat_infernal_strike') {
              createParticle(t.x, t.y, 10, '#f97316', 20, 'IMPACT');
              if (Math.hypot(p.x - t.x, p.y - t.y) <= t.radius) {
                takeDamage(p, t.damage, t.damageType);
              }
              spawnAcidPool(t.x, t.y, 60, 2.0, 10);
            } else if (t.sourceId === 'boss_ignis_meteor') {
              createParticle(t.x, t.y, 10, '#ef4444', 28, 'IMPACT');
              shakeRef.current = 14;
              if (Math.hypot(p.x - t.x, p.y - t.y) <= t.radius) {
                takeDamage(p, t.damage, t.damageType);
              }
              spawnAcidPool(t.x, t.y, 75, 3.5, 15);
            } else {
              // Spawn falling meteor/hazard projectile or impact
              createParticle(t.x, t.y, 10, t.color.includes('34, 197') ? '#22c55e' : '#ef4444', 15, 'IMPACT');
              if (Math.hypot(p.x - t.x, p.y - t.y) <= t.radius) {
                takeDamage(p, t.damage, t.damageType);
              }
            }
          } else if (t.type === 'CONE') {
            if (t.sourceId === 'boss_ignis_breath') {
              for (let poolI = 1; poolI <= 5; poolI++) {
                const pDist = poolI * 110;
                const pAngle = (t.angle || 0) + (Math.random() - 0.5) * 0.5;
                spawnAcidPool(t.x + Math.cos(pAngle) * pDist, t.y + Math.sin(pAngle) * pDist, 75, 6.0, 18);
              }
            }
            // Spawn visible fan of enemy projectiles
            // Spawn visible fan of enemy projectiles
            const count = 5;
            const startA = t.angle! - t.width! / 2;
            const stepA = t.width! / Math.max(1, count - 1);
            const projSpeed = 480;
            const projColor = t.color.includes('34, 197') ? '#22c55e' : (t.color.includes('52, 211') ? '#34d399' : '#f97316');
            for (let i = 0; i < count; i++) {
              const a = startA + stepA * i;
              projectilesRef.current.push({
                id: getNextId(), x: t.x, y: t.y, z: 20,
                vx: Math.cos(a) * projSpeed, vy: Math.sin(a) * projSpeed,
                damage: t.damage, damageType: t.damageType,
                duration: t.radius / projSpeed, radius: 14,
                type: 'ENEMY_CONE_PROJ', color: projColor,
                pierce: 0, isEnemy: true
              });
            }
          } else if (t.type === 'LINE') {
            if (t.sourceId === 'PHARAOH_LIGHTNING') {
              // Custom Pharaoh Lightning Beam detonation!
              const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
                const dx = bx - ax;
                const dy = by - ay;
                const l2 = dx * dx + dy * dy;
                if (l2 === 0) return Math.hypot(px - ax, py - ay);
                let segmentT = ((px - ax) * dx + (py - ay) * dy) / l2;
                segmentT = Math.max(0, Math.min(1, segmentT));
                return Math.hypot(px - (ax + segmentT * dx), py - (ay + segmentT * dy));
              };

              const ax = t.x;
              const ay = t.y;
              const bx = t.x + Math.cos(t.angle || 0) * (t.length || 1300);
              const by = t.y + Math.sin(t.angle || 0) * (t.length || 1300);

              // 1. Gorgeous lightning bolt visual particles along the line
              const beamSteps = 15;
              for (let step = 0; step <= beamSteps; step++) {
                const ratio = step / beamSteps;
                const px = ax + (bx - ax) * ratio;
                const py = ay + (by - ay) * ratio;
                createParticle(px, py, 15, '#fbbf24', 5, 'IMPACT');
              }
              shakeRef.current = 24;

              // 2. Deal damage to player if hit
              const dPlayer = distToSegment(p.x, p.y, ax, ay, bx, by);
              if (dPlayer <= (t.radius || 70) + 15) {
                takeDamage(p, t.damage, t.damageType);
              }

              // 3. Destructive overload check for Sarcophagi
              enemiesRef.current.forEach(e => {
                if (e.type === 'TESLA_SARCOPHAGUS' && e.hp > 0) {
                  const dSarc = distToSegment(e.x, e.y, ax, ay, bx, by);
                  if (dSarc <= e.radius + 40) {
                    // Explode!
                    e.hp = 0;
                    for (let i = 0; i < 15; i++) {
                      createParticle(e.x, e.y, 25, '#fbbf24', 20, 'IMPACT');
                    }
                    shakeRef.current = 26;
                    audioManager.playLevelUpSfx();

                    // Count remaining active sarcophagi
                    const remaining = enemiesRef.current.filter(g => g.type === 'TESLA_SARCOPHAGUS' && g.hp > 0).length;
                    if (remaining === 0) {
                      // Find Pharaoh and stagger him!
                      const pharaoh = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_THUNDER_PHARAOH');
                      if (pharaoh) {
                        pharaoh.isStaggered = true;
                        pharaoh.staggerTimer = 8.0;
                        pharaoh.state = 'STUNNED';
                        pharaoh.stateTimer = 8.0;
                        hazardToastRef.current = {
                          text: '💥 ESCUDO DO FARAÓ DESTRUÍDO! ELE ESTÁ ATORDUADO E EXPOSTO! CAUSE DANO MÁXIMO!',
                          timer: 8.0,
                          maxTimer: 8.0
                        };
                      }
                    } else {
                      hazardToastRef.current = {
                        text: `⚡ SARCOFAGO TESLA SOBRECARREGADO! RESTAM ${remaining} ATIVOS!`,
                        timer: 4.0,
                        maxTimer: 4.0
                      };
                    }
                  }
                }
              });
            } else {
              // Spawn visible line projectile (cannonball/laser)
              const projSpeed = 680;
              const projColor = t.color.includes('239, 68') ? '#ef4444' : (t.color.includes('34, 197') ? '#22c55e' : '#f97316');
              projectilesRef.current.push({
                id: getNextId(), x: t.x, y: t.y, z: 22,
                vx: Math.cos(t.angle!) * projSpeed, vy: Math.sin(t.angle!) * projSpeed,
                damage: t.damage, damageType: t.damageType,
                duration: t.length! / projSpeed, radius: 16,
                type: 'ENEMY_LINE_PROJ', color: projColor,
                pierce: 0, isEnemy: true
              });
            }
          }
        }
      });
      compactArray(telegraphsRef.current, (t: Telegraph) => t.duration < t.maxDuration);

      // --- PROJECTILES ---
      projectilesRef.current.forEach(proj => {
        // If projectile is not hostile, check if it enters any Inertia Sentinel's active dome (180 range)
        if (proj.duration > 0 && !proj.isEnemy) {
          const sentinels = enemiesRef.current.filter(e => e.type === 'INERTIA_SENTINEL' && e.hp > 0);
          for (let s of sentinels) {
            const sDist = Math.hypot(proj.x - s.x, proj.y - s.y);
            if (sDist < 180) {
              if (!proj.isSlowedInDome) {
                proj.isSlowedInDome = true;
                proj.vx *= 0.10;
                proj.vy *= 0.10;
                proj.duration = Math.min(proj.duration, 0.45); // quickly drops/decays
              }
              break;
            }
          }
        }

        proj.x += proj.vx * dt; proj.y += proj.vy * dt; proj.duration -= dt;
        
        if (proj.duration <= 0 && proj.type === 'ENEMY_VOID_ORB') {
           // Split into 4 smaller projectiles
           for (let i = 0; i < 4; i++) {
             const ang = (Math.PI / 2) * i + Math.PI/4;
             const vSpeed = 200;
             projectilesRef.current.push({
               id: getNextId(), x: proj.x, y: proj.y, z: proj.z,
               vx: Math.cos(ang) * vSpeed, vy: Math.sin(ang) * vSpeed,
               damage: proj.damage * 0.5, damageType: 'AP',
               duration: 2.0, radius: 10,
               type: 'ENEMY_CONE_PROJ', color: '#a855f7',
               pierce: 0, isEnemy: true
             });
           }
           createParticle(proj.x, proj.y, proj.z, '#c084fc', 20, 'IMPACT');
        }

        // Pillar obstacle collision
        if (currentMap.pillars) {
          for (let pil of currentMap.pillars) {
            if (pil.height > 20) {
              const dx = proj.x - pil.x;
              const dy = proj.y - pil.y;
              if (dx * dx + dy * dy < (proj.radius + pil.radius) * (proj.radius + pil.radius)) {
                proj.duration = 0;
                createParticle(proj.x, proj.y, proj.z || 10, '#94a3b8', 6, 'IMPACT');
                break;
              }
            }
          }
        }

        if (proj.duration > 0 && !proj.isEnemy) {
          // Check collision with destructible/ignitable hazards (barrels, pillars, totems, crystals, altars)
          hazardsRef.current.forEach(h => {
            if (!h.used && (h.hp !== undefined || h.type === 'EXPLODING_BARREL' || h.type === 'BREAKABLE_PILLAR' || h.type === 'SOUL_BRAZIER' || h.type === 'RESONANT_PILLAR' || h.type === 'FROST_CRYSTAL' || h.type === 'VOID_CRYSTAL')) {
              const dx = proj.x - h.x;
              const dy = proj.y - h.y;
              const hitRadius = proj.radius + (h.radius ? Math.min(45, h.radius) : 32);
              if (dx * dx + dy * dy < hitRadius * hitRadius) {
                proj.duration = 0;
                damageHazard(h, proj.damage, p);
              }
            }
          });

          if (!proj.hitEnemyIds) proj.hitEnemyIds = [];
          enemiesRef.current.forEach(e => {
            if (!e.isFriendly && e.hp > 0 && !proj.hitEnemyIds!.includes(e.id)) {
              const dx = proj.x - e.x;
              const dy = proj.y - e.y;
              const hitRadius = proj.radius + e.hitboxRadius;
              if (dx * dx + dy * dy < hitRadius * hitRadius) {
                proj.hitEnemyIds!.push(e.id);
                damageEnemy(e, proj.damage, proj.damageType, p);
                proj.pierce--;
                if (proj.pierce < 0) proj.duration = 0;
              }
            }
          });
        } else if (proj.duration > 0 && proj.isEnemy) {
          const dx = proj.x - p.x;
          const dy = proj.y - p.y;
          const hitRadius = proj.radius + 18;
          if (dx * dx + dy * dy < hitRadius * hitRadius) {
            proj.duration = 0;
            takeDamage(p, proj.damage, proj.damageType);
            createParticle(p.x, p.y, p.z + 15, proj.color || '#ef4444', 8, 'IMPACT');
          }
        }
      });
      compactAndReleaseProjectiles(projectilesRef.current);
    },

    world: (dt: number) => {
      const p = playerRef.current;
      // --- XP ORBS ---
      xpOrbsRef.current.forEach(orb => {
        orb.x += orb.vx * dt; orb.y += orb.vy * dt; orb.z += orb.vz * dt;
        orb.vz -= 800 * dt;
        if (orb.z < 0) { orb.z = 0; orb.vz *= -0.5; orb.vx *= 0.8; orb.vy *= 0.8; }
        const dist = Math.hypot(p.x - orb.x, p.y - orb.y);
        if (dist < 150) {
          orb.vx += (p.x - orb.x) * 10 * dt;
          orb.vy += (p.y - orb.y) * 10 * dt;
        }
        if (dist < 30) {
          p.xp += orb.value;
          orb.value = 0;
          audioManager.playItemPickSfx();
          while (p.xp >= p.xpToNextLevel) {
            applyAutomaticLevelUpStats(p);
          }
        }
      });
      compactArray(xpOrbsRef.current, (o: XpOrb) => o.value > 0);

      // --- HAZARD SYSTEMS UPDATE ---
      hazardsRef.current.forEach(h => {
        if (h.used) return;

        // 1. EXPLODING BARREL
        if (h.type === 'EXPLODING_BARREL') {
          if (h.primed) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (Math.random() < 0.6) {
              createParticle(h.x + (Math.random() - 0.5) * 15, h.y + (Math.random() - 0.5) * 15, 25, '#fbbf24', 3, 'FIRE');
            }
            if (h.fuseTimer! <= 0) {
              h.used = true;
              shakeRef.current = 24;

              for (let i = 0; i < 35; i++) {
                const a = Math.random() * Math.PI * 2;
                const spd = 150 + Math.random() * 350;
                particlesRef.current.push({
                  id: getNextId(),
                  x: h.x,
                  y: h.y,
                  z: 15,
                  vx: Math.cos(a) * spd,
                  vy: Math.sin(a) * spd,
                  vz: 200 + Math.random() * 300,
                  life: 0.8 + Math.random() * 0.4,
                  maxLife: 1.2,
                  color: Math.random() > 0.3 ? '#f97316' : '#ef4444',
                  size: 6 + Math.random() * 8,
                  type: 'FIRE'
                });
              }

              const dmg = 320 + floorRef.current * 40;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0) {
                  const dist = Math.hypot(e.x - h.x, e.y - h.y);
                  if (dist <= h.radius) {
                    damageEnemy(e, dmg, 'AP', p);
                    if (!e.statusEffects) e.statusEffects = {};
                    e.statusEffects.burning = (e.statusEffects.burning || 0) + 4.0;
                    const angle = Math.atan2(e.y - h.y, e.x - h.x);
                    const push = 300 * (1 - dist / h.radius);
                    e.x += Math.cos(angle) * push;
                    e.y += Math.sin(angle) * push;
                  }
                }
              });

              const pDist = Math.hypot(p.x - h.x, p.y - h.y);
              if (pDist < 100) {
                takeDamage(p, 25, 'AP');
                const pAngle = Math.atan2(p.y - h.y, p.x - h.x);
                p.x += Math.cos(pAngle) * 140;
                p.y += Math.sin(pAngle) * 140;
              }

              hazardToastRef.current = { text: '💥 BARRIL DETONADO! DANO & QUEIMADURA EM ÁREA!', timer: 2.5, maxTimer: 2.5 };
            }
          } else if ((h.hp || 0) <= 0) {
            h.primed = true;
            h.fuseTimer = 0.1;
          }
        }

        // 2. BREAKABLE PILLAR
        else if (h.type === 'BREAKABLE_PILLAR') {
          if ((h.hp || 0) <= 0) {
            h.used = true;
            shakeRef.current = 20;

            for (let i = 0; i < 30; i++) {
              const a = Math.random() * Math.PI * 2;
              const spd = 100 + Math.random() * 250;
              particlesRef.current.push({
                id: getNextId(),
                x: h.x,
                y: h.y,
                z: 20,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                vz: 100 + Math.random() * 250,
                life: 0.9,
                maxLife: 0.9,
                color: Math.random() > 0.5 ? '#94a3b8' : '#64748b',
                size: 7 + Math.random() * 6,
                type: 'IMPACT'
              });
            }

            const dmg = 280 + floorRef.current * 35;
            enemiesRef.current.forEach(e => {
              if (!e.isFriendly && e.hp > 0) {
                const dist = Math.hypot(e.x - h.x, e.y - h.y);
                if (dist <= h.radius) {
                  damageEnemy(e, dmg, 'AD', p);
                  e.frozenTimer = (e.frozenTimer || 0) + 2.0;
                  const angle = Math.atan2(e.y - h.y, e.x - h.x);
                  e.x += Math.cos(angle) * 120;
                  e.y += Math.sin(angle) * 120;
                }
              }
            });

            hazardToastRef.current = { text: '🏛️ PILAR DESMORONADO! DANO FISICO & ATORDOAMENTO!', timer: 2.5, maxTimer: 2.5 };
          }
        }

        // 3. SPIKE TRAP
        else if (h.type === 'SPIKE_TRAP') {
          h.stateTimer -= dt;
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 1.5 : 3.5;
          }
          if (h.isActive) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.5;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
                  damageEnemy(e, (80 + floorRef.current * 15) * 0.5, 'AD', p);
                  e.hitFlash = 0.1;
                }
              });
              if (Math.hypot(p.x - h.x, p.y - h.y) <= h.radius) {
                 takeDamage(p, 12 * 0.5, 'AD');
              }
            }
          }
        }

        // 4. TOXIC GEYSER
        else if (h.type === 'TOXIC_GEYSER') {
          h.stateTimer -= dt;
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 2.5 : 4.0;
          }
          if (h.isActive) {
            if (Math.random() < 0.4) {
              createParticle(h.x + (Math.random() - 0.5) * 40, h.y + (Math.random() - 0.5) * 40, 10, '#22c55e', 4, 'MAGIC');
            }
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.5;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
                  damageEnemy(e, (60 + floorRef.current * 10) * 0.5, 'AP', p);
                  if (!e.statusEffects) e.statusEffects = {};
                  e.statusEffects.poisoned = (e.statusEffects.poisoned || 0) + 0.5;
                }
              });
              if (Math.hypot(p.x - h.x, p.y - h.y) <= h.radius) {
                 takeDamage(p, 15 * 0.5, 'AP');
              }
            }
          }
        }

        // 5. MAGMA VENT
        else if (h.type === 'MAGMA_VENT') {
          h.stateTimer -= dt;
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 2.0 : 4.5;
          }
          if (h.isActive) {
            if (Math.random() < 0.5) {
              createParticle(h.x + (Math.random() - 0.5) * 40, h.y + (Math.random() - 0.5) * 40, 15, '#ef4444', 5, 'FIRE');
            }
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.5;
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
                  damageEnemy(e, (120 + floorRef.current * 20) * 0.5, 'AP', p);
                  if (!e.statusEffects) e.statusEffects = {};
                  e.statusEffects.burning = (e.statusEffects.burning || 0) + 0.5;
                }
              });
              if (Math.hypot(p.x - h.x, p.y - h.y) <= h.radius) {
                 takeDamage(p, 25 * 0.5, 'AP');
              }
            }
          }
        }

        // 6. RESONANT PILLAR
        else if (h.type === 'RESONANT_PILLAR') {
          if (h.stateTimer > 0) {
            h.stateTimer -= dt;
          }
        }

        // 7. ACID POOL
        else if (h.type === 'ACID_POOL') {
          if (h.maxTimer && h.maxTimer < 90000) {
            h.stateTimer -= dt;
            if (h.stateTimer <= 0) {
              h.used = true;
            }
          }
          if (!h.used) {
            if (Math.random() < 0.25) {
              createParticle(h.x + (Math.random() - 0.5) * h.radius, h.y + (Math.random() - 0.5) * h.radius, 2, '#22c55e', 3, 'MAGIC');
            }
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.3;
              const pDist = Math.hypot(p.x - h.x, p.y - h.y);
              if (pDist <= h.radius) {
                takeDamage(p, (h.damage || 14) * 0.3, 'AP');
                p.slowTimer = Math.max(p.slowTimer || 0, 0.4);
              }
              enemiesRef.current.forEach(e => {
                if (!e.isFriendly && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
                  damageEnemy(e, (h.damage || 14) * 0.2, 'AP', p);
                }
              });
            }
          }
        }

        // 8. GRAVEYARD HANDS
        else if (h.type === 'GRAVEYARD_HANDS') {
          h.stateTimer -= dt;
          if (h.stateTimer <= 0) {
            h.isActive = !h.isActive;
            h.stateTimer = h.isActive ? 3.0 : 2.5;
          }
          if (h.isActive) {
            h.fuseTimer = (h.fuseTimer || 0) - dt;
            if (h.fuseTimer <= 0) {
              h.fuseTimer = 0.4;
              const pDist = Math.hypot(p.x - h.x, p.y - h.y);
              if (pDist <= h.radius) {
                takeDamage(p, 6, 'AP');
                p.slowTimer = Math.max(p.slowTimer || 0, 0.5);
              }
            }
          }
        }

        // 9. SOUL BRAZIER (Brasero Sagrado das Criptas)
        else if (h.type === 'SOUL_BRAZIER') {
          const pDist = Math.hypot(p.x - h.x, p.y - h.y);
          if ((h.hp || 0) <= 0 || (pDist <= 85 && keysRef.current[' '])) {
            h.used = true;
            shakeRef.current = 26;
            audioManager.playLevelUpSfx();

            // Holy Nova Burst
            for (let i = 0; i < 40; i++) {
              const a = Math.random() * Math.PI * 2;
              const spd = 140 + Math.random() * 300;
              particlesRef.current.push({
                id: getNextId(),
                x: h.x,
                y: h.y,
                z: 20,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                vz: 150 + Math.random() * 250,
                life: 1.1,
                maxLife: 1.1,
                color: Math.random() > 0.4 ? '#fef08a' : '#f59e0b',
                size: 7 + Math.random() * 6,
                type: 'MAGIC'
              });
            }

            // Damage and stun all regular enemies in chamber
            enemiesRef.current.forEach(e => {
              if (!e.isFriendly && e.hp > 0) {
                const dist = Math.hypot(e.x - h.x, e.y - h.y);
                if (dist <= 350) {
                  damageEnemy(e, 320 + floorRef.current * 40, 'AP', p);
                  e.stunTimer = 2.5;
                }
              }
            });

            // Find Mors'thar and break his Shadow Veil, inflicting 6s Stagger
            const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_NIGHT_REAPER');
            if (boss && boss.hp > 0) {
              boss.customAttackData = boss.customAttackData || {};
              boss.customAttackData.shadowVeil = false;
              boss.isStaggered = true;
              boss.staggerTimer = 6.0;
              boss.state = 'STUNNED';
              boss.stateTimer = 6.0;
              for (let i = 0; i < 25; i++) {
                createParticle(boss.x, boss.y, boss.z + 25, '#fbbf24', 12, 'MAGIC');
              }
              hazardToastRef.current = {
                text: '✨ BRASERO SAGRADO ATIVADO! VÉU DE MORS\'THAR DISSIPADO (STAGGER 6S + DANO DOBRADO)!',
                timer: 6.0,
                maxTimer: 6.0
              };
            } else {
              hazardToastRef.current = {
                text: '✨ BRASERO SAGRADO ATIVADO! PURIFICAÇÃO EM ÁREA LIBERADA!',
                timer: 3.5,
                maxTimer: 3.5
              };
            }
          }
        }
      });

      // --- RANDOM EVENTS ---
      if (gameStateRef.current === GameState.TOWER && !bossSpawnedRef.current) {
        if (timeRef.current > 30 && !eventRef.current.active && timeRef.current < 35 && Math.random() < 0.01) {
          const canMeteor = floorRef.current >= 3;
          const eventType = canMeteor ? (Math.random() > 0.5 ? 'METEOR' : 'CHEST') : 'CHEST';
          eventRef.current = { 
            type: eventType, 
            timer: 20, 
            x: p.x + (Math.random() > 0.5 ? 1 : -1) * (400 + Math.random() * 300), 
            y: p.y + (Math.random() > 0.5 ? 1 : -1) * (400 + Math.random() * 300), 
            active: true,
            progress: 0
          };
        }
        if (eventRef.current.active) {
          eventRef.current.timer -= dt;
          if (eventRef.current.type === 'METEOR') {
            if (Math.random() < 0.1) {
              telegraphsRef.current.push({ 
                id: getNextId(), x: p.x + (Math.random()-0.5)*800, y: p.y + (Math.random()-0.5)*800, 
                radius: 100, duration: 0, maxDuration: 1.5, color: 'rgba(239,68,68,0.4)', type: 'CIRCLE', 
                damage: 50, damageType: 'AP', sourceId: 'event_meteor' 
              });
            }
          } else if (eventRef.current.type === 'CHEST') {
            const dist = Math.hypot(p.x - eventRef.current.x, p.y - eventRef.current.y);
            if (dist < 100) {
              eventRef.current.progress = (eventRef.current.progress || 0) + dt;
              if (eventRef.current.progress > 5) {
                for(let i=0; i<10; i++) {
                  xpOrbsRef.current.push({
                    id: getNextId(), x: eventRef.current.x, y: eventRef.current.y, z: 20,
                    vx: (Math.random()-0.5)*300, vy: (Math.random()-0.5)*300, vz: 400, value: 50
                  });
                }
                p.crystals += 5;
                eventRef.current.active = false;
              }
            }
          }
          if (eventRef.current.timer <= 0) eventRef.current.active = false;
        }
      }

      // --- WEATHER & BIOME AMBIENT PARTICLES ---
      const isVilaState = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
      const currentFloorId = isVilaState ? 0 : floorRef.current;
      const currentBiomeId = isVilaState ? 'VILLAGE' : (FLOOR_CONFIGS[floorRef.current - 1]?.biome || Biome.FOREST);

      // 1. Specific Weather Overrides
      if (weatherRef.current === Weather.RAIN) {
        for (let i = 0; i < 3; i++) {
          LightweightParticleManager.spawnWeather(
            cameraRef.current.x + (Math.random() - 0.5) * 2000,
            cameraRef.current.y + (Math.random() - 0.5) * 2000,
            'RAIN',
            'rgba(147, 197, 253, 0.75)'
          );
        }
      } else if (weatherRef.current === Weather.BLIZZARD) {
        for (let i = 0; i < 4; i++) {
          LightweightParticleManager.spawnWeather(
            cameraRef.current.x + (Math.random() - 0.5) * 2000,
            cameraRef.current.y + (Math.random() - 0.5) * 2000,
            'SNOW',
            'rgba(255, 255, 255, 0.9)'
          );
        }
      } else if (weatherRef.current === Weather.SANDSTORM) {
        for (let i = 0; i < 3; i++) {
          LightweightParticleManager.spawnWeather(
            cameraRef.current.x + (Math.random() - 0.5) * 2000,
            cameraRef.current.y + (Math.random() - 0.5) * 2000,
            'SAND',
            'rgba(251, 191, 36, 0.5)'
          );
        }
      }

      // 2. Dynamic Biome-Specific Atmosphere (E.g. Fog & ectoplasm for Floor 8, embers for Volcano, pollen for Forest)
      const ambientRate = currentFloorId === 8 ? 3 : (isRestRoomRef.current ? 2 : 1);
      for (let i = 0; i < ambientRate; i++) {
        LightweightParticleManager.spawnAmbientBiome(
          cameraRef.current.x,
          cameraRef.current.y,
          currentFloorId,
          currentBiomeId,
          isRestRoomRef.current
        );
      }

      compactArray(particlesRef.current, (p: Particle) => { 
        p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; 
        p.vz -= 1200*dt;
        if(p.z<0){ p.z=0; p.vz *= -0.5; p.vx *= 0.8; p.vy *= 0.8; }
        p.life -= dt; return p.life > 0 && p.z >= 0; 
      });

      LightweightParticleManager.update(dt);

      compactArray(damageNumbersRef.current, (d: DamageNumber) => { 
        if(d.vx) d.x += d.vx*dt; if(d.vy) d.y += d.vy*dt; 
        if(d.vz !== undefined) { d.z += d.vz*dt; d.vz -= 800*dt; if(d.z<0){d.z=0; d.vz *= -0.4;} }
        d.life -= dt; return d.life > 0; 
      });

      if (shakeRef.current > 0) shakeRef.current -= dt * 30; if (shakeRef.current < 0) shakeRef.current = 0;
    },

    ui: (dt: number) => {
      if (anomalyToastTimerRef.current > 0) {
        anomalyToastTimerRef.current = Math.max(0, anomalyToastTimerRef.current - dt);
      }

      uiTimerRef.current += dt;
      // Throttle React state updates to 12-15 FPS to eliminate React thrashing while keeping HUD smooth
      if (uiTimerRef.current < 0.08) return;
      uiTimerRef.current = 0;

      const p = playerRef.current;
      const boss = enemiesRef.current.find(e => e.isBoss);
      const activeGuardsCount = enemiesRef.current.filter(g => g.state === 'GUARDING' && g.hp > 0).length;
      const activeFrostCrystalsCount = enemiesRef.current.filter(g => g.type === 'FROST_CRYSTAL' && g.hp > 0).length;
      const floorInstability = floorRef.current === 1 ? getFloor1Instability(floorCombatTimerRef.current) : null;

      let bossMechanicsStatus = '';
      if (boss && boss.hp > 0) {
        if (boss.isStaggered) {
          bossMechanicsStatus = '💥 VULNERÁVEL (3x DANO)!';
        } else if (boss.type === 'BOSS_CRYSTAL_GOLIAS') {
          const pil = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
          const grd = enemiesRef.current.filter(g => g.state === 'GUARDING' && g.hp > 0).length;
          if (pil > 0 || grd > 0) bossMechanicsStatus = `🛡️ ESCUDO: ${pil} PILARES | ${grd} GUARDIÕES`;
        } else if (boss.type === 'BOSS_CORRUPTED_LEVIATHAN') {
          const tot = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
          if (tot > 0) bossMechanicsStatus = `🍄 TOTENS: ${tot}/4`;
        } else if (boss.type === 'BOSS_FORGE_DRAGON') {
          const fis = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
          if (fis > 0) bossMechanicsStatus = `🌋 FENDAS: ${fis}/4`;
        } else if (boss.type === 'BOSS_ARTILLERY_WARLORD') {
          const coi = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
          const tur = enemiesRef.current.filter(g => g.type === 'CYBER_AUTOMATON' && g.hp > 0).length;
          if (coi > 0 || tur > 0) bossMechanicsStatus = `⚡ ${coi} BOBINAS | ${tur} TORRES`;
        } else if (boss.type === 'BOSS_THUNDER_PHARAOH') {
          const sarc = enemiesRef.current.filter(g => g.type === 'TESLA_SARCOPHAGUS' && g.hp > 0).length;
          if (sarc > 0) bossMechanicsStatus = `⚡ SARCOFAGOS: ${sarc}/3`;
        } else if (boss.type === 'BOSS_YETI_OVERLORD') {
          const cry = enemiesRef.current.filter(g => g.type === 'FROST_CRYSTAL' && g.hp > 0).length;
          if (cry > 0) bossMechanicsStatus = `❄️ CRISTAIS: ${cry}/3`;
        } else if (boss.type === 'BOSS_PRIME_COLOSSUS') {
          const pil = enemiesRef.current.filter(g => g.type === 'RESONANT_PILLAR' && g.hp > 0).length;
          if (pil > 0) bossMechanicsStatus = `⚡ PILARES: ${pil}/3 ${p.prismaticCharged ? '⚡' : '🔒'}`;
        } else if (boss.type === 'BOSS_NIGHT_REAPER') {
          const alt = hazardsRef.current.filter(h => h.type === 'RESONANT_PILLAR' && !h.used && (h.hp || 0) > 0).length;
          if (alt > 0) bossMechanicsStatus = `🕯️ ALTARES: ${alt}/4`;
        } else if (boss.type === 'BOSS_CELESTIAL_EMPEROR') {
          const rel = enemiesRef.current.filter(g => g.type === 'SOLAR_RELIC' && g.hp > 0).length;
          if (rel > 0) bossMechanicsStatus = `☀️ RELÍQUIAS: ${rel}/4`;
        } else if (boss.type === 'BOSS_VOID_SOVEREIGN') {
          const cry = enemiesRef.current.filter(g => g.type === 'VOID_CRYSTAL' && g.hp > 0).length;
          if (cry > 0) bossMechanicsStatus = `🔮 ENTROPIA: ${cry}/3`;
        }
      }

      setHudData({
        hp: p.stats.hp, maxHp: p.stats.maxHp,
        manaCrystals: saveData.permanentManaCrystals,
        runCrystals: p.crystals || 0,
        xp: p.xp, xpToNextLevel: p.xpToNextLevel, level: p.level,
        qCd: p.skill1Timer, qMax: p.skill1MaxCooldown,
        wCd: p.skill2Timer, wMax: p.skill2MaxCooldown,
        rCd: p.skill3Timer, rMax: p.skill3MaxCooldown,
        dashCd: p.dashTimer, dashMax: p.dashMaxCooldown, dashCharges: p.dashCharges,
        passiveCd: p.passiveTimer || 0,
        passiveActiveTimer: p.passiveActiveTimer || 0,
        shield: p.shieldTimer > 0 ? (p.stats.maxHp * 0.40) : 0,
        floorCombatTime: floorCombatTimerRef.current,
        floorInstability: floorInstability,
        bossGuardsCount: activeGuardsCount,
        bossFrostCrystalsCount: activeFrostCrystalsCount,
        bossMechanicsStatus,
        prismaticCharged: p.prismaticCharged || false,
        prismaticChargeTimer: p.prismaticChargeTimer || 0,
        frostbite: frostbiteRef.current,
        frostWarmth: frostWarmthTimerRef.current,
        bossHp: boss?.hp || 0,
        bossMaxHp: boss?.maxHp || 0,
        bossStagger: boss?.stagger || 0,
        bossMaxStagger: boss?.maxStagger || 100,
        bossIsStaggered: boss?.isStaggered || false,
        bossPhase: boss?.bossPhase || 1,
        bossType: boss?.type || '',
        activeAnomaly: currentAnomalyRef.current || (floorRef.current > 0 ? getFloorAnomaly(floorRef.current) : null),
        hunter: HUNTERS[p.archetype],
      });
    }
  };

  // --- UPDATE LOOP ---
  const update = (dt: number) => {
    if (deathSequenceActiveRef.current) {
      systems.camera(dt);
      deathTimerRef.current -= dt;
      if (deathTimerRef.current <= 0) {
        deathSequenceActiveRef.current = false;
        triggerActualGameOver();
      }
      return;
    }

    if (hitStopRef.current > 0) {
      hitStopRef.current -= dt;
      return;
    }

    // --- SYSTEM: INPUT & CAMERA TARGET ---
    const mouseIsoX = (mouseScreenRef.current.x / cameraZoomRef.current) - cameraRef.current.x;
    const mouseIsoY = (mouseScreenRef.current.y / cameraZoomRef.current) - cameraRef.current.y;
    mouseWorldRef.current = toWorldFromIso(mouseIsoX, mouseIsoY);

    // Run Systems
    systems.player(dt);
    systems.minions(dt);
    systems.camera(dt);

    const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
    if (gameStateRef.current === GameState.TOWER || isVila) {
      if (gameStateRef.current === GameState.TOWER) {
        runTimerRef.current += dt;
        systems.hazards(dt);
        systems.spawning(dt);
        systems.enemies(dt);
        systems.combat(dt);

        // Soft Enrage check: 10 minutes (600s) on Floor 1, 2.5 minutes (150s) on other combat floors
        if (!isRestRoomRef.current) {
          floorCombatTimerRef.current += dt;
          const enrageLimit = floorRef.current === 1 ? 600 : 150;
          if (floorCombatTimerRef.current >= enrageLimit && !corruptionMistActiveRef.current) {
            corruptionMistActiveRef.current = true;
            audioManager.playCorruptionAlertSfx();
            shakeRef.current = 20;
            hazardToastRef.current = {
              text: floorRef.current === 1
                ? '☠️ COLAPSO CRISTALINO TOTAL (10:00): A FLORESTA ENTROU EM SOBRECARGA! INIMIGOS E CHEFE ENFURECIDOS (+35% VEL / +30% ATK)!'
                : '☠️ NÉVOA DA CORRUPÇÃO: O TEMPO ESGOTOU! INIMIGOS ESTÃO ENFURECIDOS (+35% VEL / +30% ATK)!',
              timer: 6.0,
              maxTimer: 6.0
            };
          }
        }

        // Low HP Heartbeat audio tension (< 25% maxHp)
        const p = playerRef.current;
        const hpRatio = p.stats.hp / Math.max(1, p.stats.maxHp);
        if (hpRatio < 0.25 && p.stats.hp > 0) {
          if (!isLowHpActiveRef.current) {
            isLowHpActiveRef.current = true;
            audioManager.startHeartbeat();
          }
        } else {
          if (isLowHpActiveRef.current) {
            isLowHpActiveRef.current = false;
            audioManager.stopHeartbeat();
          }
        }
      }
      systems.world(dt);
    }
    
    systems.ui(dt);
  };

  // --- STATIC MAP CACHING ---
  const renderStaticMapToCache = (currentFloorNum: number, currentMap: any, biomeColors: any) => {
    const voidDepthH = 36;
    const padding = 160;
    let minIsoX = Infinity, maxIsoX = -Infinity, minIsoY = Infinity, maxIsoY = -Infinity;

    currentMap.chambers.forEach((chamber: any) => {
      const cIso = toIso(chamber.x, chamber.y, 0);
      const rx = (chamber.type === 'CIRCLE' ? chamber.radius : chamber.w / 2) * 1.45;
      const ry = (chamber.type === 'CIRCLE' ? chamber.radius : chamber.h / 2) * 0.75;
      minIsoX = Math.min(minIsoX, cIso.x - rx);
      maxIsoX = Math.max(maxIsoX, cIso.x + rx);
      minIsoY = Math.min(minIsoY, cIso.y - ry);
      maxIsoY = Math.max(maxIsoY, cIso.y + ry + voidDepthH);
    });

    currentMap.bridges.forEach((bridge: any) => {
      const p1 = toIso(bridge.x1, bridge.y1, 0);
      const p2 = toIso(bridge.x2, bridge.y2, 0);
      const hw = (bridge.width || 40) * 1.5;
      minIsoX = Math.min(minIsoX, p1.x - hw, p2.x - hw);
      maxIsoX = Math.max(maxIsoX, p1.x + hw, p2.x + hw);
      minIsoY = Math.min(minIsoY, p1.y - hw, p2.y - hw);
      maxIsoY = Math.max(maxIsoY, p1.y + hw + voidDepthH, p2.y + hw + voidDepthH);
    });

    if (!isFinite(minIsoX)) { minIsoX = -1000; maxIsoX = 1000; minIsoY = -800; maxIsoY = 800; }
    minIsoX -= padding;
    maxIsoX += padding;
    minIsoY -= padding;
    maxIsoY += padding;

    const w = Math.ceil(maxIsoX - minIsoX);
    const h = Math.ceil(maxIsoY - minIsoY);

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(100, w);
    offscreen.height = Math.max(100, h);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    // Translate so (0,0) in world ISO coordinates corresponds to (-minIsoX, -minIsoY)
    ctx.translate(-minIsoX, -minIsoY);

    const platformFloor = currentFloorNum === 0 ? '#1e293b' : (biomeColors?.floor || '#1e293b');
    const platformTop = currentFloorNum === 0 ? '#334155' : (biomeColors?.floorTop || '#475569');
    const accentColor = currentFloorNum === 0 ? '#6366f1' : (biomeColors?.alt || '#38bdf8');
    const voidEdgeColor = '#090d16';

    // --- 1. RENDER 3D VOID EXTENSION & BRIDGES UNDERLAY ---
    currentMap.bridges.forEach((bridge: any) => {
      const perpAngle = Math.atan2(bridge.y2 - bridge.y1, bridge.x2 - bridge.x1) + Math.PI / 2;
      const hw = bridge.width / 2;
      const ox = Math.cos(perpAngle) * hw;
      const oy = Math.sin(perpAngle) * hw;

      const p2 = toIso(bridge.x2 - ox, bridge.y2 - oy, 0);
      const p3 = toIso(bridge.x2 + ox, bridge.y2 + oy, 0);

      ctx.fillStyle = voidEdgeColor;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p3.x, p3.y + voidDepthH);
      ctx.lineTo(p2.x, p2.y + voidDepthH);
      ctx.closePath();
      ctx.fill();
    });

    currentMap.chambers.forEach((chamber: any) => {
      if (chamber.type === 'CIRCLE') {
        const cIso = toIso(chamber.x, chamber.y, 0);
        const rx = chamber.radius * 1.414;
        const ry = chamber.radius * 0.707;

        ctx.fillStyle = voidEdgeColor;
        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y + voidDepthH, rx, ry, 0, 0, Math.PI);
        ctx.lineTo(cIso.x - rx, cIso.y);
        ctx.ellipse(cIso.x, cIso.y, rx, ry, 0, Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y + voidDepthH, rx, ry, 0, 0, Math.PI);
        ctx.stroke();
      } else {
        const hw = chamber.w / 2;
        const hh = chamber.h / 2;
        const p2 = toIso(chamber.x + hw, chamber.y - hh, 0);
        const p3 = toIso(chamber.x + hw, chamber.y + hh, 0);
        const p4 = toIso(chamber.x - hw, chamber.y + hh, 0);

        ctx.fillStyle = voidEdgeColor;
        ctx.beginPath();
        ctx.moveTo(p4.x, p4.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p2.x, p2.y + voidDepthH);
        ctx.lineTo(p3.x, p3.y + voidDepthH);
        ctx.lineTo(p4.x, p4.y + voidDepthH);
        ctx.closePath();
        ctx.fill();
      }
    });

    // --- 2. RENDER PLATFORM TOP FACES & BRIDGES ---
    currentMap.bridges.forEach((bridge: any) => {
      const perpAngle = Math.atan2(bridge.y2 - bridge.y1, bridge.x2 - bridge.x1) + Math.PI / 2;
      const hw = bridge.width / 2;
      const ox = Math.cos(perpAngle) * hw;
      const oy = Math.sin(perpAngle) * hw;

      const p1 = toIso(bridge.x1 - ox, bridge.y1 - oy, 0);
      const p2 = toIso(bridge.x2 - ox, bridge.y2 - oy, 0);
      const p3 = toIso(bridge.x2 + ox, bridge.y2 + oy, 0);
      const p4 = toIso(bridge.x1 + ox, bridge.y1 + oy, 0);

      ctx.fillStyle = platformFloor;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y);
      ctx.stroke();

      const startIso = toIso(bridge.x1, bridge.y1, 0);
      const endIso = toIso(bridge.x2, bridge.y2, 0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(startIso.x, startIso.y);
      ctx.lineTo(endIso.x, endIso.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    currentMap.chambers.forEach((chamber: any) => {
      if (chamber.type === 'CIRCLE') {
        const cIso = toIso(chamber.x, chamber.y, 0);
        const rx = chamber.radius * 1.414;
        const ry = chamber.radius * 0.707;

        ctx.fillStyle = platformFloor;
        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = platformTop;
        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y - 2, rx * 0.96, ry * 0.96, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y, rx * 0.35, ry * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cIso.x, cIso.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const hw = chamber.w / 2;
        const hh = chamber.h / 2;
        const p1 = toIso(chamber.x - hw, chamber.y - hh, 0);
        const p2 = toIso(chamber.x + hw, chamber.y - hh, 0);
        const p3 = toIso(chamber.x + hw, chamber.y + hh, 0);
        const p4 = toIso(chamber.x - hw, chamber.y + hh, 0);

        ctx.fillStyle = platformFloor;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();

        const ip1 = toIso(chamber.x - hw + 8, chamber.y - hh + 8, 0);
        const ip2 = toIso(chamber.x + hw - 8, chamber.y - hh + 8, 0);
        const ip3 = toIso(chamber.x + hw - 8, chamber.y + hh - 8, 0);
        const ip4 = toIso(chamber.x - hw + 8, chamber.y + hh - 8, 0);

        ctx.fillStyle = platformTop;
        ctx.beginPath();
        ctx.moveTo(ip1.x, ip1.y);
        ctx.lineTo(ip2.x, ip2.y);
        ctx.lineTo(ip3.x, ip3.y);
        ctx.lineTo(ip4.x, ip4.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();
      }
    });

    // --- 3. RENDER STATIC PILLAR BASE SHADOWS ---
    if (currentMap.pillars) {
      currentMap.pillars.forEach((pil: any) => {
        const pilIso = toIso(pil.x, pil.y, 0);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(pilIso.x, pilIso.y + 4, pil.radius * 1.2, pil.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    staticMapCanvasRef.current = offscreen;
    staticMapBoundsRef.current = { minIsoX, minIsoY };
  };

  // --- RENDER ---
  const draw = (dt: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    const { width, height } = dimensions;
    if(canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }

    const floorConfig = FLOOR_CONFIGS[floorRef.current - 1] || FLOOR_CONFIGS[0];
    const biomeColors = COLORS[floorConfig.biome] as any;
    const isVila = gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA;
    const currentFloorNum = isVila ? 0 : floorRef.current;
    const currentMap = getFloorMap(currentFloorNum);
    const accentColor = currentFloorNum === 0 ? '#6366f1' : (biomeColors?.alt || '#38bdf8');
    
    const cx = width / 2; const cy = height / 2;

    // Background color based on biome and weather
    let bgColor = biomeColors ? biomeColors.bg : COLORS.background;
    if (weatherRef.current === Weather.NIGHT) bgColor = '#1e1b4b';
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Organic Background Pattern (Vivid Pop Aesthetics)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    const spotSize = 120 * ZOOM_LEVEL;
    const offsetX = (cx - cameraRef.current.x * ZOOM_LEVEL) % spotSize;
    const offsetY = (cy - cameraRef.current.y * ZOOM_LEVEL) % spotSize;
    for(let x = offsetX - spotSize; x < width + spotSize; x += spotSize) {
      for(let y = offsetY - spotSize; y < height + spotSize; y += spotSize) {
        ctx.beginPath();
        ctx.ellipse(x, y, 22 * ZOOM_LEVEL, 14 * ZOOM_LEVEL, -0.26, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2.5D Camera Shake (Isometric depth weighting)
    const shakeAngle = Math.random() * Math.PI * 2;
    const shakeDist = shakeRef.current;
    const sx = Math.cos(shakeAngle) * shakeDist;
    const sy = Math.sin(shakeAngle) * shakeDist * 0.65; // Optical 2.5D isometric ratio

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(cameraZoomRef.current, cameraZoomRef.current); ctx.translate(Math.floor(cameraRef.current.x + sx), Math.floor(cameraRef.current.y + sy));

    // --- SEPARATED STATIC LAYER (Pre-rendered Cached Map Geometry) ---
    const cacheKey = `${currentFloorNum}_${phaseRef.current}_${floorConfig.biome}_${weatherRef.current}`;
    if (staticMapCacheKeyRef.current !== cacheKey || !staticMapCanvasRef.current) {
      renderStaticMapToCache(currentFloorNum, currentMap, biomeColors);
      staticMapCacheKeyRef.current = cacheKey;
    }

    if (staticMapCanvasRef.current) {
      ctx.drawImage(
        staticMapCanvasRef.current,
        staticMapBoundsRef.current.minIsoX,
        staticMapBoundsRef.current.minIsoY
      );
    }

    // Floor 0 / Vila Interactive Structures & Portals
    if (currentFloorNum === 0) {
      const float = Math.sin(timeRef.current * 2) * 8;
      const rot = timeRef.current * 0.7;

      // 1. Central Plaza Monument (0, 0)
      const cpIso = toIso(0, 0, 0);
      ctx.save();
      ctx.translate(cpIso.x, cpIso.y - 30 + float * 0.5);
      
      // Base dais
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 30, 30, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Runic Core
      ctx.rotate(rot * 0.5);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, 20);
      ctx.lineTo(-14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '900 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PRAÇA CENTRAL', cpIso.x, cpIso.y - 75 + float * 0.5);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.fillText('REFÚGIO DA ASCENSÃO', cpIso.x, cpIso.y - 62 + float * 0.5);

      // 2. Adventurers Guild (-380, -140)
      const gIso = toIso(-380, -140, 0);
      const isNearGuild = nearbyStructure === 'GUILD';
      ctx.save();
      ctx.translate(gIso.x, gIso.y - 40 + float);
      
      // Guild Crest Emblem / Shield
      ctx.fillStyle = isNearGuild ? '#0284c7' : '#0369a1';
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(24, -10);
      ctx.lineTo(18, 25);
      ctx.lineTo(0, 35);
      ctx.lineTo(-18, 25);
      ctx.lineTo(-24, -10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isNearGuild ? '#38bdf8' : '#7dd3fc';
      ctx.lineWidth = isNearGuild ? 3 : 2;
      ctx.stroke();

      // Crossed swords glyph
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -12); ctx.lineTo(12, 12);
      ctx.moveTo(12, -12); ctx.lineTo(-12, 12);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px "JetBrains Mono", monospace';
      ctx.fillText('GUILDA DOS AVENTUREIROS', gIso.x, gIso.y - 95 + float);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isNearGuild ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(isNearGuild ? '★ [ESPAÇO] ARQUÉTIPOS & HERÓIS' : 'SELEÇÃO DE ARQUÉTIPO', gIso.x, gIso.y - 80 + float);

      // 3.5. Santuário dos Ecos (380, -140) - Talent Constellation Sanctuary
      const sIso = toIso(380, -140, 0);
      const isNearSanctuary = nearbyStructure === 'SANCTUARY';
      const sanctFloat = Math.sin(timeRef.current * 2.8) * 8;
      const sanctSpin = timeRef.current * 1.5;

      // Sanctuary Astral Base Ground Ring
      ctx.save();
      ctx.strokeStyle = isNearSanctuary ? '#c084fc' : '#a855f7';
      ctx.lineWidth = isNearSanctuary ? 3.5 : 2;
      ctx.beginPath();
      ctx.ellipse(sIso.x, sIso.y, 65, 36, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Astral Concentric Inner Ring
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sIso.x, sIso.y, 45, 25, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Floating Rune Monolith / Astral Orb
      const sCenterY = sIso.y - 55 + sanctFloat;

      // Outer Pulsing Glow
      const sanctGrad = ctx.createRadialGradient(sIso.x, sCenterY, 5, sIso.x, sCenterY, 40);
      sanctGrad.addColorStop(0, isNearSanctuary ? 'rgba(192, 132, 252, 0.9)' : 'rgba(168, 85, 247, 0.7)');
      sanctGrad.addColorStop(0.6, 'rgba(147, 51, 234, 0.3)');
      sanctGrad.addColorStop(1, 'rgba(126, 34, 206, 0)');
      ctx.fillStyle = sanctGrad;
      ctx.beginPath();
      ctx.arc(sIso.x, sCenterY, 40, 0, Math.PI * 2);
      ctx.fill();

      // Rotating Constellation Geometric Ring
      ctx.strokeStyle = '#e9d5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = sanctSpin + (i * Math.PI / 2);
        const rx = sIso.x + Math.cos(ang) * 26;
        const ry = sCenterY + Math.sin(ang) * 14;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.stroke();

      // Core Star Diamond
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(sIso.x, sCenterY - 14);
      ctx.lineTo(sIso.x + 10, sCenterY);
      ctx.lineTo(sIso.x, sCenterY + 14);
      ctx.lineTo(sIso.x - 10, sCenterY);
      ctx.closePath();
      ctx.fill();

      // Sanctuary Floating Particles
      for (let i = 0; i < 4; i++) {
        const pAng = timeRef.current * 2 + i * (Math.PI / 2);
        const px = sIso.x + Math.cos(pAng) * 22;
        const py = sCenterY + Math.sin(pAng * 1.5) * 18;
        ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#c084fc';
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      ctx.restore();

      // Sanctuary Text Titles
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px "JetBrains Mono", monospace';
      ctx.fillText('SANTUÁRIO DOS ECOS', sIso.x, sIso.y - 105 + sanctFloat);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isNearSanctuary ? '#c084fc' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(isNearSanctuary ? '★ [ESPAÇO] REDE DE TALENTOS' : 'MATRIZ DE TALENTOS', sIso.x, sIso.y - 90 + sanctFloat);

      // 3.8. Cofre de Relíquias (0, 180) - Thematic Vault of Relics
      const vIso = toIso(0, 180, 0);
      const isNearVault = nearbyStructure === 'VAULT';
      const vaultFloat = Math.sin(timeRef.current * 2.2) * 4;

      ctx.save();
      ctx.translate(vIso.x, vIso.y - 15 + vaultFloat);

      // Draw a sleek pedestal base
      ctx.fillStyle = isNearVault ? '#475569' : '#334155';
      ctx.strokeStyle = isNearVault ? '#fbbf24' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-25, 20);
      ctx.lineTo(25, 20);
      ctx.lineTo(15, 35);
      ctx.lineTo(-15, 35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw a glorious glowing chest shape
      ctx.fillStyle = isNearVault ? '#d97706' : '#b45309';
      ctx.fillRect(-18, -12, 36, 24);

      // Draw chest metallic bands
      ctx.fillStyle = isNearVault ? '#fbbf24' : '#f59e0b';
      ctx.fillRect(-14, -12, 4, 24);
      ctx.fillRect(10, -12, 4, 24);

      // Chest golden lock lockplate
      ctx.fillStyle = isNearVault ? '#fef08a' : '#fde047';
      ctx.beginPath();
      ctx.arc(0, 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw a subtle chest lid lid curve
      ctx.fillStyle = isNearVault ? '#ea580c' : '#b45309';
      ctx.beginPath();
      ctx.ellipse(0, -12, 18, 10, 0, Math.PI, 0);
      ctx.fill();

      // Swirling golden aura particles
      for (let i = 0; i < 3; i++) {
        const auraAng = timeRef.current * 1.8 + i * (Math.PI * 2 / 3);
        const ax = Math.cos(auraAng) * 28;
        const ay = Math.sin(auraAng) * 12 - 5;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(ax, ay, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Vault Text Titles
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px "JetBrains Mono", monospace';
      ctx.fillText('COFRE DE RELÍQUIAS', vIso.x, vIso.y - 55 + vaultFloat);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isNearVault ? '#fbbf24' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(isNearVault ? '★ [ESPAÇO] REVELAR COFRE' : 'INVENTÁRIO DE RELÍQUIAS', vIso.x, vIso.y - 40 + vaultFloat);

      // 4. Tower Ascension Portal (0, -440)
      const ptIso = toIso(0, -440, 0);
      const isNearPortal = nearbyStructure === 'PORTAL';
      const portalPulse = Math.sin(timeRef.current * 4) * 6;
      
      // Portal base vortex
      ctx.strokeStyle = isNearPortal ? '#a855f7' : '#818cf8';
      ctx.lineWidth = isNearPortal ? 4 : 3;
      ctx.beginPath();
      ctx.ellipse(ptIso.x, ptIso.y, 50 + portalPulse, 28 + portalPulse * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Portal energy core
      const pGrad = ctx.createLinearGradient(ptIso.x, ptIso.y + 10, ptIso.x, ptIso.y - 90);
      pGrad.addColorStop(0, 'rgba(129, 140, 248, 0.1)');
      pGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.6)');
      pGrad.addColorStop(1, 'rgba(192, 132, 252, 0.9)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.ellipse(ptIso.x, ptIso.y - 45, 40, 80, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ascending portal sparks
      for (let i = 0; i < 6; i++) {
        const sparkTime = (timeRef.current * 1.5 + i * 0.3) % 1;
        const sparkX = ptIso.x + Math.sin(i * 2 + timeRef.current * 3) * (20 * (1 - sparkTime));
        const sparkY = ptIso.y - sparkTime * 90;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sparkX - 2, sparkY - 2, 4, 4);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.fillText('PORTAL DA ASCENSÃO', ptIso.x, ptIso.y - 145);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isNearPortal ? '#c084fc' : '#a5b4fc';
      ctx.fillText(isNearPortal ? '★ [ESPAÇO] ASCENDER À TORRE (ANDAR 1)' : 'ENTRAR NA TORRE (ANDAR 1)', ptIso.x, ptIso.y - 130);
    }

    // Active Tower Exit Portal
    if (gameStateRef.current === GameState.TOWER && portalActiveRef.current) {
      const ptIso = toIso(mapPortalPosRef.current.x, mapPortalPosRef.current.y, 0);
      const isNear = nearPortalRef.current;
      const portalPulse = Math.sin(timeRef.current * 4) * 6;

      ctx.strokeStyle = isNear ? '#38bdf8' : '#c084fc';
      ctx.lineWidth = isNear ? 4 : 3;
      ctx.beginPath();
      ctx.ellipse(ptIso.x, ptIso.y, 45 + portalPulse, 24 + portalPulse * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      const pGrad = ctx.createLinearGradient(ptIso.x, ptIso.y + 10, ptIso.x, ptIso.y - 80);
      pGrad.addColorStop(0, 'rgba(56, 189, 248, 0.1)');
      pGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.6)');
      pGrad.addColorStop(1, 'rgba(56, 189, 248, 0.9)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.ellipse(ptIso.x, ptIso.y - 40, 35, 70, 0, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 6; i++) {
        const sparkTime = (timeRef.current * 1.5 + i * 0.3) % 1;
        const sparkX = ptIso.x + Math.sin(i * 2 + timeRef.current * 3) * (20 * (1 - sparkTime));
        const sparkY = ptIso.y - sparkTime * 80;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sparkX - 2, sparkY - 2, 4, 4);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`PORTAL DO ANDAR ${floorRef.current}`, ptIso.x, ptIso.y - 125);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isNear ? '#38bdf8' : '#c084fc';
      ctx.fillText(isNear ? '★ PORTAL ATIVO - ESCOLHA A OPÇÃO NA TELA' : 'APROXIME-SE PARA CONTINUAR OU RETORNAR', ptIso.x, ptIso.y - 110);
    }

    // Active Phase Transition Portal (Between Map 1 -> Map 2, and Map 2 -> Map 3)
    if (gameStateRef.current === GameState.TOWER && phasePortalActiveRef.current) {
      const ptIso = toIso(phasePortalPosRef.current.x, phasePortalPosRef.current.y, 0);
      const isNear = nearPhasePortalRef.current;
      const portalPulse = Math.sin(timeRef.current * 4) * 6;

      ctx.strokeStyle = isNear ? '#34d399' : '#38bdf8';
      ctx.lineWidth = isNear ? 4 : 3;
      ctx.beginPath();
      ctx.ellipse(ptIso.x, ptIso.y, 45 + portalPulse, 24 + portalPulse * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      const pGrad = ctx.createLinearGradient(ptIso.x, ptIso.y + 10, ptIso.x, ptIso.y - 80);
      pGrad.addColorStop(0, 'rgba(52, 211, 153, 0.1)');
      pGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.6)');
      pGrad.addColorStop(1, 'rgba(52, 211, 153, 0.9)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.ellipse(ptIso.x, ptIso.y - 40, 35, 70, 0, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 6; i++) {
        const sparkTime = (timeRef.current * 1.5 + i * 0.3) % 1;
        const sparkX = ptIso.x + Math.sin(i * 2 + timeRef.current * 3) * (20 * (1 - sparkTime));
        const sparkY = ptIso.y - sparkTime * 80;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sparkX - 2, sparkY - 2, 4, 4);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const activeFloor = FLOOR_CONFIGS[floorRef.current - 1] || FLOOR_CONFIGS[0];
      const nextPhaseConfig = activeFloor?.phases?.[(phaseRef.current + 1) as 1 | 2 | 3];
      const nextMapObj = getFloorMap(floorRef.current, phaseRef.current + 1);
      const nextPhaseName = nextPhaseConfig ? nextPhaseConfig.name.toUpperCase() : (nextMapObj ? nextMapObj.name.toUpperCase() : `FASE ${phaseRef.current + 1}`);
      ctx.fillText(`PORTAL: ${nextPhaseName}`, ptIso.x, ptIso.y - 125);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = isNear ? '#34d399' : '#38bdf8';
      ctx.fillText(isNear ? '★ [ESPAÇO] ENTRAR NO PORTAL DE FASE' : 'APROXIME-SE PARA AVANÇAR DE FASE', ptIso.x, ptIso.y - 110);
    }

    // --- REST ROOM: CAMPFIRE & DUAL PORTALS RENDERING ---
    if (gameStateRef.current === GameState.TOWER && isRestRoomRef.current) {
      // 1. Campfire at (0, 0)
      const fireIso = toIso(0, 0, 0);
      const firePulse = Math.sin(timeRef.current * 12) * 5;
      const campfireObj = hazardsRef.current.find(h => h.id === 'rest_campfire');
      const isFireUsed = campfireObj?.used;

      // Warm Ground Glow
      ctx.save();
      const fireGlow = ctx.createRadialGradient(fireIso.x, fireIso.y, 10, fireIso.x, fireIso.y, isFireUsed ? 40 : 120);
      fireGlow.addColorStop(0, isFireUsed ? 'rgba(100, 116, 139, 0.3)' : 'rgba(249, 115, 22, 0.45)');
      fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fireGlow;
      ctx.beginPath();
      ctx.ellipse(fireIso.x, fireIso.y, isFireUsed ? 50 : 130, (isFireUsed ? 50 : 130) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Stone ring
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(fireIso.x, fireIso.y, 35, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (!isFireUsed) {
        // Logs & Flames
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(fireIso.x - 15, fireIso.y - 6, 30, 8);

        // Dancing flame layers
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(fireIso.x, fireIso.y - 15 + firePulse * 0.4, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(fireIso.x, fireIso.y - 18 + firePulse * 0.6, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fireIso.x, fireIso.y - 20 + firePulse * 0.8, 5, 0, Math.PI * 2);
        ctx.fill();

        // Fire text
        ctx.fillStyle = '#f59e0b';
        ctx.font = '900 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔥 FOGUEIRA ANCESTRAL (+80% HP)', fireIso.x, fireIso.y - 50);
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '900 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✨ FOGUEIRA UTILIZADA', fireIso.x, fireIso.y - 30);
      }
      ctx.restore();

      // 2. Vila Return Portal at (-280, -180)
      const vIso = toIso(-280, -180, 0);
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(vIso.x, vIso.y, 40, 20, 0, 0, Math.PI * 2);
      ctx.stroke();

      const vGrad = ctx.createLinearGradient(vIso.x, vIso.y + 10, vIso.x, vIso.y - 70);
      vGrad.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
      vGrad.addColorStop(1, 'rgba(52, 211, 153, 0.85)');
      ctx.fillStyle = vGrad;
      ctx.beginPath();
      ctx.ellipse(vIso.x, vIso.y - 35, 30, 60, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#34d399';
      ctx.font = '900 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🏡 RETORNAR À VILA', vIso.x, vIso.y - 80);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('(Salvar 100% dos Cristais)', vIso.x, vIso.y - 68);
      ctx.restore();

      // 3. Ascend to Next Floor Portal at (280, -180)
      const aIso = toIso(280, -180, 0);
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(aIso.x, aIso.y, 40, 20, 0, 0, Math.PI * 2);
      ctx.stroke();

      const aGrad = ctx.createLinearGradient(aIso.x, aIso.y + 10, aIso.x, aIso.y - 70);
      aGrad.addColorStop(0, 'rgba(168, 85, 247, 0.1)');
      aGrad.addColorStop(1, 'rgba(192, 132, 252, 0.85)');
      ctx.fillStyle = aGrad;
      ctx.beginPath();
      ctx.ellipse(aIso.x, aIso.y - 35, 30, 60, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#c084fc';
      ctx.font = '900 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`⚡ SUBIR P/ ANDAR ${floorRef.current + 1}`, aIso.x, aIso.y - 80);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(isGreedyFloorRef.current ? '💀 (ANDAR DA GANÂNCIA 2X)' : '⚔ (CONTINUAR JORNADA)', aIso.x, aIso.y - 68);
      ctx.restore();
    }

    // --- DRAW FLOOR 7 PRISMATIC NODULES ---
    if (floorRef.current === 7 && gameStateRef.current === GameState.TOWER && !isRestRoomRef.current) {
      const PRISMATIC_NODULES = [{ x: -180, y: -180 }, { x: 180, y: -180 }, { x: 0, y: 180 }];
      PRISMATIC_NODULES.forEach((nod, idx) => {
        const nodIso = toIso(nod.x, nod.y, 0);
        ctx.save();
        
        // Pulse glow
        const glowPulse = 1.0 + Math.sin(timeRef.current * 4 + idx) * 0.15;
        const radius = 65 * glowPulse;
        
        // Draw elegant glowing outer hexagon/circle
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#a855f7';
        ctx.beginPath();
        ctx.ellipse(nodIso.x, nodIso.y, radius, radius / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        // Semi-transparent center fill
        ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
        ctx.beginPath();
        ctx.ellipse(nodIso.x, nodIso.y, radius - 4, (radius - 4) / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Glowing core triangle
        ctx.fillStyle = '#d8b4fe';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        const p1 = toIso(nod.x, nod.y - 25, 0);
        const p2 = toIso(nod.x - 22, nod.y + 15, 0);
        const p3 = toIso(nod.x + 22, nod.y + 15, 0);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();

        // Standing on node feedback text
        const distP = Math.hypot(playerRef.current.x - nod.x, playerRef.current.y - nod.y);
        if (distP < 75 && !playerRef.current.prismaticCharged) {
          ctx.fillStyle = '#e9d5ff';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.shadowBlur = 0;
          ctx.textAlign = 'center';
          const chargePct = Math.min(100, Math.round(((playerRef.current.prismaticChargeTimer || 0) / 1.5) * 100));
          ctx.fillText(`CARREGANDO: ${chargePct}%`, nodIso.x, nodIso.y - 28);
        } else {
          ctx.fillStyle = '#c084fc';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.shadowBlur = 0;
          ctx.textAlign = 'center';
          ctx.fillText(playerRef.current.prismaticCharged ? 'RECARREGADO' : 'NÓDULO PRISMÁTICO', nodIso.x, nodIso.y - 28);
        }
        
        ctx.restore();
      });
    }

    // Telegraphs
    telegraphsRef.current.forEach(t => {
      const iso = toIso(t.x, t.y, 0);
      const progress = Math.min(1, Math.max(0, t.duration / (t.maxDuration || 1)));

      ctx.save();
      if (t.type === 'CIRCLE') {
        // Base outer circle
        ctx.fillStyle = t.color || 'rgba(239, 68, 68, 0.3)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(iso.x, iso.y, t.radius, t.radius / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Charge progress circle filling up
        const fillR = t.radius * progress;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.beginPath();
        ctx.ellipse(iso.x, iso.y, fillR, fillR / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.type === 'CONE') {
        const angle = t.angle ?? 0;
        const width = t.width ?? (Math.PI / 3);
        const radius = t.radius;
        const steps = 12;
        const startA = angle - width / 2;
        const stepA = width / steps;

        // Base outer cone
        ctx.fillStyle = t.color || 'rgba(239, 68, 68, 0.3)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y);
        for (let i = 0; i <= steps; i++) {
          const a = startA + stepA * i;
          const pt = toIso(t.x + Math.cos(a) * radius, t.y + Math.sin(a) * radius, 0);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Charge progress cone
        const fillRadius = radius * progress;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y);
        for (let i = 0; i <= steps; i++) {
          const a = startA + stepA * i;
          const pt = toIso(t.x + Math.cos(a) * fillRadius, t.y + Math.sin(a) * fillRadius, 0);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fill();
      } else if (t.type === 'LINE') {
        const angle = t.angle ?? 0;
        const length = t.length ?? 500;
        const halfWidth = (t.radius || 30);

        const perpX = -Math.sin(angle) * halfWidth;
        const perpY = Math.cos(angle) * halfWidth;

        const p1 = toIso(t.x + perpX, t.y + perpY, 0);
        const p2 = toIso(t.x - perpX, t.y - perpY, 0);
        const p3 = toIso(t.x + Math.cos(angle) * length - perpX, t.y + Math.sin(angle) * length - perpY, 0);
        const p4 = toIso(t.x + Math.cos(angle) * length + perpX, t.y + Math.sin(angle) * length + perpY, 0);

        ctx.fillStyle = t.color || 'rgba(239, 68, 68, 0.3)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Charge progress line
        const fillLen = length * progress;
        const fp3 = toIso(t.x + Math.cos(angle) * fillLen - perpX, t.y + Math.sin(angle) * fillLen - perpY, 0);
        const fp4 = toIso(t.x + Math.cos(angle) * fillLen + perpX, t.y + Math.sin(angle) * fillLen + perpX, 0);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(fp3.x, fp3.y);
        ctx.lineTo(fp4.x, fp4.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });

    // --- 3. SORTED DEPTH RENDER: PILLARS + PLAYER + ENEMIES ---
    const p = playerRef.current;
    const pIso = toIso(p.x, p.y, p.z || 0);

    const depthQueue = depthQueueRef.current;
    depthQueue.length = 0;

    depthQueue.push({ kind: 'PLAYER', x: p.x, y: p.y, z: p.z || 0, sortY: pIso.y });

    minionsRef.current.forEach(m => {
      if (m.state !== 'DEAD') {
        const mIso = toIso(m.x, m.y, m.z || 0);
        depthQueue.push({ kind: 'MINION', minion: m, sortY: mIso.y });
      }
    });

    enemiesRef.current.forEach(e => {
      if (e.hp > 0) {
        const eIso = toIso(e.x, e.y, e.z || 0);
        depthQueue.push({ kind: 'ENEMY', enemy: e, sortY: eIso.y });
      }
    });

    currentMap.pillars.forEach(pil => {
      const pilIso = toIso(pil.x, pil.y, 0);
      depthQueue.push({ kind: 'PILLAR', pillar: pil, sortY: pilIso.y });
    });

    hazardsRef.current.forEach(h => {
      const hIso = toIso(h.x, h.y, 0);
      depthQueue.push({ kind: 'HAZARD', hazard: h, sortY: hIso.y });
    });

    depthQueue.sort((a, b) => a.sortY - b.sortY);

    depthQueue.forEach(item => {
      if (item.kind === 'HAZARD') {
        const h = item.hazard;
        const hIso = toIso(h.x, h.y, 0);
        const isNear = nearbyHazardRef.current?.id === h.id;
        const float = Math.sin(timeRef.current * 3) * 4;

        if (h.type === 'RESONANT_PILLAR') {
          // Resonant Crystal Monolith
          const pulse = Math.sin(timeRef.current * 5) * 0.15 + 0.85;
          ctx.save();
          ctx.translate(hIso.x, hIso.y - 25);
          
          // Outer energy field indicator if player is charged
          if (playerRef.current.prismaticCharged) {
            ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.ellipse(0, 25, 38, 19, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Shadow
          ctx.fillStyle = 'rgba(124, 58, 237, 0.2)';
          ctx.beginPath();
          ctx.ellipse(0, 25, 28, 14, 0, 0, Math.PI * 2);
          ctx.fill();

          // Body - Prism Crystal Obelisk
          const hpPct = h.hp / h.maxHp;
          ctx.fillStyle = `rgba(139, 92, 246, ${0.4 + hpPct * 0.6})`;
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#c084fc';
          
          ctx.beginPath();
          ctx.moveTo(0, -60); // Taller, majestic tip
          ctx.lineTo(20, -10);
          ctx.lineTo(14, 25);
          ctx.lineTo(-14, 25);
          ctx.lineTo(-20, -10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Crystal inner shards
          ctx.fillStyle = '#f3e8ff';
          ctx.beginPath();
          ctx.moveTo(0, -50);
          ctx.lineTo(6, -10);
          ctx.lineTo(0, 20);
          ctx.lineTo(-6, -10);
          ctx.closePath();
          ctx.fill();

          // HP Bar for Pillar (Only show if damaged)
          if (h.hp < h.maxHp && h.hp > 0) {
            const barW = 44;
            const barX = -barW / 2;
            const barY = -75;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(barX, barY, barW, 5);
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(barX, barY, barW * hpPct, 5);
          }

          ctx.restore();

          // Energy link from this pillar to the Colossus boss if boss is alive
          const boss = enemiesRef.current.find(b => b.isBoss && b.type === 'BOSS_PRIME_COLOSSUS');
          if (boss && boss.hp > 0) {
            const bossIso = toIso(boss.x, boss.y, 30);
            ctx.save();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
            ctx.lineWidth = 2.5 + Math.sin(timeRef.current * 8) * 1.0;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#c084fc';
            ctx.beginPath();
            ctx.moveTo(hIso.x, hIso.y - 25);
            ctx.lineTo(bossIso.x, bossIso.y);
            ctx.stroke();
            ctx.restore();
          }

          if (isNear && !h.used) {
            ctx.fillStyle = '#34d399';
            ctx.font = '900 11px "JetBrains Mono", monospace';
            ctx.fillText('★ [ESPAÇO] DETONAR PILAR', hIso.x, hIso.y - 75 + float);
          }
        } else if (h.type === 'SPIKE_TRAP') {
          // Mechanical Ground Spikes
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          // Base grate
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = h.isActive ? '#ef4444' : '#475569';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 32, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Spikes extending upwards when active
          if (h.isActive) {
            ctx.fillStyle = '#cbd5e1';
            for (let s = -2; s <= 2; s++) {
              ctx.beginPath();
              ctx.moveTo(s * 10, -2);
              ctx.lineTo(s * 10 + 3, -24);
              ctx.lineTo(s * 10 + 6, -2);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        } else if (h.type === 'TOXIC_GEYSER') {
          // Acid Geyser Well
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          ctx.fillStyle = '#14532d';
          ctx.strokeStyle = h.isActive ? '#22c55e' : '#166534';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 36, 18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (h.isActive) {
            const toxicPulse = Math.sin(timeRef.current * 8) * 8;
            ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
            ctx.beginPath();
            ctx.ellipse(0, -15 - toxicPulse, 20, 35, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (h.type === 'MAGMA_VENT') {
          // Magma Vent
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          ctx.fillStyle = '#450a0a';
          ctx.strokeStyle = h.isActive ? '#ef4444' : '#991b1b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 34, 17, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (h.isActive) {
            const magmaPulse = Math.sin(timeRef.current * 10) * 10;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
            ctx.beginPath();
            ctx.ellipse(0, -20 - magmaPulse, 22, 40, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (h.type === 'GRAVEYARD_HANDS') {
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
          ctx.beginPath();
          ctx.ellipse(0, 0, h.radius || 60, (h.radius || 60) * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          if (h.isActive) {
            ctx.fillStyle = '#c084fc';
            ctx.font = '20px sans-serif';
            ctx.fillText('🫲', -15, -10 + float);
            ctx.fillText('🫱', 5, 0 - float);
          }
          ctx.restore();
        } else if (h.type === 'TESLA_COIL') {
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
          ctx.beginPath();
          ctx.ellipse(0, 0, h.radius || 90, (h.radius || 90) * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2;
          ctx.fillRect(-10, -30, 20, 30);
          ctx.strokeRect(-10, -30, 20, 30);
          
          const charge = (h.fuseTimer || 0) / 1.2;
          ctx.fillStyle = 'rgba(6, 182, 212, ' + (1 - charge) + ')';
          ctx.beginPath();
          ctx.arc(0, -35, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (h.type === 'PROXIMITY_MINE') {
          if (!h.used) {
            ctx.save();
            ctx.translate(hIso.x, hIso.y);
            ctx.fillStyle = '#450a0a';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            const blink = Math.sin(timeRef.current * 15) > 0;
            if (blink) {
              ctx.fillStyle = '#ef4444';
              ctx.beginPath();
              ctx.arc(0, -4, 3, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        } else if (h.type === 'QUICKSAND_WHIRL') {
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          const swirl = timeRef.current * 2;
          ctx.strokeStyle = 'rgba(217, 119, 6, 0.4)';
          ctx.lineWidth = 2;
          for (let i=0; i<3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, (h.radius || 100) - i*20, ((h.radius || 100) - i*20)*0.5, swirl + i, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (h.type === 'FROST_STALACTITE') {
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          if (h.primed) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 0, h.radius || 60, (h.radius || 60)*0.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (h.type === 'VOID_SINGULARITY') {
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          if (h.primed) {
            ctx.fillStyle = 'rgba(192, 132, 252, 0.2)';
            ctx.beginPath();
            ctx.ellipse(0, 0, h.radius || 120, (h.radius || 120)*0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            const pullRadius = ((h.fuseTimer || 0) / 1.5) * (h.radius || 120);
            ctx.strokeStyle = '#c084fc';
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(pullRadius, 1), Math.max(pullRadius*0.5, 1), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (h.type === 'ACID_POOL') {
          if (!h.used) {
            ctx.save();
            ctx.translate(hIso.x, hIso.y);
            const r = h.radius || 75;
            const alpha = (h.maxTimer && h.maxTimer < 90000) ? Math.min(1, h.stateTimer / 0.5) : 1;
            
            // Outer toxic pool shadow/glow
            ctx.fillStyle = `rgba(20, 83, 45, ${alpha * 0.55})`;
            ctx.strokeStyle = `rgba(34, 197, 94, ${alpha * 0.8})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner vibrant sludge core
            ctx.fillStyle = `rgba(34, 197, 94, ${alpha * 0.65})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();

            // Animated toxic bubbles
            ctx.fillStyle = `rgba(187, 247, 208, ${alpha * 0.85})`;
            for (let b = 0; b < 4; b++) {
              const bAngle = timeRef.current * 2.5 + b * (Math.PI / 2);
              const bDist = (r * 0.4) * (0.4 + 0.6 * Math.sin(timeRef.current * 3 + b));
              const bx = Math.cos(bAngle) * bDist;
              const by = Math.sin(bAngle) * bDist * 0.5;
              const bRadius = 3.5 + Math.sin(timeRef.current * 6 + b) * 1.5;
              ctx.beginPath();
              ctx.arc(bx, by, Math.max(1, bRadius), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        } else if (h.type === 'EXPLODING_BARREL') {
          // Explosive Gunpowder Barrel
          ctx.save();
          ctx.translate(hIso.x, hIso.y);

          if (h.used) {
            // Scorched mark on ground
            ctx.fillStyle = 'rgba(23, 23, 23, 0.7)';
            ctx.beginPath();
            ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(0, 4, 18, 9, 0, 0, Math.PI * 2);
            ctx.fill();

            // Barrel Body
            const bWidth = 24;
            const bHeight = 32;
            const isPrimed = h.primed;
            const pulse = isPrimed ? Math.sin(timeRef.current * 25) * 3 : 0;

            // Wooden barrel gradient
            ctx.fillStyle = isPrimed ? '#ef4444' : (isNear ? '#f97316' : '#78350f');
            ctx.strokeStyle = isNear ? '#fbbf24' : '#451a03';
            ctx.lineWidth = isNear ? 2.5 : 1.5;

            ctx.beginPath();
            ctx.roundRect(-bWidth / 2 - pulse / 2, -bHeight - pulse, bWidth + pulse, bHeight + pulse, 5);
            ctx.fill();
            ctx.stroke();

            // Iron hoops
            ctx.fillStyle = '#475569';
            ctx.fillRect(-bWidth / 2 - 1, -bHeight * 0.75, bWidth + 2, 4);
            ctx.fillRect(-bWidth / 2 - 1, -bHeight * 0.25, bWidth + 2, 4);

            // Explosive Skull Symbol / Fuse
            if (isPrimed) {
              // Spark fuse animation
              ctx.fillStyle = '#fbbf24';
              ctx.beginPath();
              ctx.arc(0, -bHeight - 6, 5 + Math.random() * 3, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Danger skull marker
              ctx.fillStyle = '#fef08a';
              ctx.font = 'bold 10px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('💣', 0, -bHeight * 0.4);
            }

            // Health bar if damaged
            if (h.hp !== undefined && h.maxHp !== undefined && h.hp < h.maxHp && h.hp > 0) {
              const hpPercent = Math.max(0, h.hp / h.maxHp);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(-18, -bHeight - 14, 36, 5);
              ctx.fillStyle = '#f97316';
              ctx.fillRect(-18, -bHeight - 14, 36 * hpPercent, 5);
            }

            if (isNear) {
              ctx.fillStyle = '#fbbf24';
              ctx.font = '900 11px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('★ [ESPAÇO] DETONAR BARRIL', 0, -bHeight - 22 + float);
            }
          }
          ctx.restore();

        } else if (h.type === 'BREAKABLE_PILLAR') {
          // Destructible Pillar
          ctx.save();
          ctx.translate(hIso.x, hIso.y);

          if (h.used) {
            // Fallen rubble debris
            ctx.fillStyle = '#475569';
            for (let r = 0; r < 6; r++) {
              const rx = (r % 3 - 1) * 12;
              const ry = (Math.floor(r / 3) - 0.5) * 8;
              ctx.fillRect(rx, ry, 10, 6);
            }
          } else {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(0, 6, 22, 11, 0, 0, Math.PI * 2);
            ctx.fill();

            // Pillar Body
            const pWidth = 28;
            const pHeight = 55;

            ctx.fillStyle = isNear ? '#38bdf8' : '#334155';
            ctx.strokeStyle = isNear ? '#38bdf8' : '#1e293b';
            ctx.lineWidth = isNear ? 2.5 : 1.5;

            ctx.beginPath();
            ctx.roundRect(-pWidth / 2, -pHeight, pWidth, pHeight, 4);
            ctx.fill();
            ctx.stroke();

            // Glowing Rune / Crack lines
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-6, -pHeight * 0.8);
            ctx.lineTo(4, -pHeight * 0.5);
            ctx.lineTo(-4, -pHeight * 0.2);
            ctx.stroke();

            // Health bar if damaged
            if (h.hp !== undefined && h.maxHp !== undefined && h.hp < h.maxHp && h.hp > 0) {
              const hpPercent = Math.max(0, h.hp / h.maxHp);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(-20, -pHeight - 14, 40, 5);
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(-20, -pHeight - 14, 40 * hpPercent, 5);
            }

            if (isNear) {
              ctx.fillStyle = '#38bdf8';
              ctx.font = '900 11px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('★ [ESPAÇO] DESMORONAR PILAR', 0, -pHeight - 22 + float);
            }
          }
          ctx.restore();

        } else if (h.type === 'SOUL_BRAZIER') {
          // Holy Soul Brazier of the Crypts
          ctx.save();
          ctx.translate(hIso.x, hIso.y);

          if (h.used) {
            // Extinguished / Purified Brazier
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(0, 5, 20, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            // Gothic stone base
            ctx.fillStyle = '#1e1b4b';
            ctx.strokeStyle = '#4c1d95';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-14, -30, 28, 30, 4);
            ctx.fill();
            ctx.stroke();

            // Residual golden sparks
            ctx.fillStyle = '#fbbf24';
            ctx.font = '900 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('✨ PURIFICADO', 0, -40);
          } else {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(0, 6, 26, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            // Gothic Stone Pedestal
            const bW = 28;
            const bH = 46;
            ctx.fillStyle = isNear ? '#312e81' : '#1e1b4b';
            ctx.strokeStyle = isNear ? '#fbbf24' : '#6d28d9';
            ctx.lineWidth = isNear ? 2.5 : 2;

            ctx.beginPath();
            ctx.roundRect(-bW / 2, -bH, bW, bH, 5);
            ctx.fill();
            ctx.stroke();

            // Rune Inscription
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-5, -bH * 0.7);
            ctx.lineTo(0, -bH * 0.4);
            ctx.lineTo(5, -bH * 0.7);
            ctx.moveTo(0, -bH * 0.4);
            ctx.lineTo(0, -bH * 0.15);
            ctx.stroke();

            // Golden Brazier Bowl
            ctx.fillStyle = '#b45309';
            ctx.strokeStyle = '#f59e0b';
            ctx.beginPath();
            ctx.ellipse(0, -bH, 18, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Sacred Holy Flame
            const fPulse = Math.sin(timeRef.current * 7) * 4;
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(0, -bH - 12 + fPulse * 0.4, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(0, -bH - 15 + fPulse * 0.6, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, -bH - 17 + fPulse * 0.8, 4, 0, Math.PI * 2);
            ctx.fill();

            // Holy Sparkles
            for (let i = 0; i < 3; i++) {
              const spAng = timeRef.current * 3 + i * (Math.PI * 2 / 3);
              const spX = Math.cos(spAng) * 14;
              const spY = -bH - 16 + Math.sin(spAng) * 10;
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(spX - 1.5, spY - 1.5, 3, 3);
            }

            // Health bar if damaged
            if (h.hp !== undefined && h.maxHp !== undefined && h.hp < h.maxHp && h.hp > 0) {
              const hpPercent = Math.max(0, h.hp / h.maxHp);
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(-20, -bH - 32, 40, 5);
              ctx.fillStyle = '#fbbf24';
              ctx.fillRect(-20, -bH - 32, 40 * hpPercent, 5);
            }

            if (isNear) {
              ctx.fillStyle = '#fef08a';
              ctx.font = '900 11px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('★ [ESPAÇO] PURIFICAR BRASERO (ANULAR VÉU)', 0, -bH - 36 + float);
            }
          }
          ctx.restore();

        } else if (h.type === 'SOLAR_ALTAR') {
          // Floor 9 Solar Altar (Bênção da Aurora)
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          const aH = 28;
          const aReady = (h.stateTimer || 0) <= 0;

          // Golden Base Pedestal
          ctx.fillStyle = '#78350f';
          ctx.strokeStyle = aReady ? '#fbbf24' : '#92400e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 32, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Golden Altar Shaft
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.moveTo(-14, 0);
          ctx.lineTo(14, 0);
          ctx.lineTo(18, -aH);
          ctx.lineTo(-18, -aH);
          ctx.closePath();
          ctx.fill();

          // Golden Altar Basin / Sun Sigil
          ctx.fillStyle = '#d97706';
          ctx.strokeStyle = '#fef08a';
          ctx.beginPath();
          ctx.ellipse(0, -aH, 20, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (aReady) {
            // Radiant Solar Core
            const sPulse = Math.sin(timeRef.current * 6) * 4;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(0, -aH - 12 + sPulse * 0.3, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, -aH - 14 + sPulse * 0.5, 6, 0, Math.PI * 2);
            ctx.fill();

            // Solar Radiance Rays
            for (let r = 0; r < 4; r++) {
              const rAng = timeRef.current * 2 + r * (Math.PI / 2);
              const rx = Math.cos(rAng) * 16;
              const ry = -aH - 12 + Math.sin(rAng) * 10;
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(rx - 2, ry - 2, 4, 4);
            }

            if (isNear) {
              ctx.fillStyle = '#fef08a';
              ctx.font = '900 11px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('★ [ESPAÇO] RECEBER BÊNÇÃO DA AURORA (+30% DANO & ESCUDO)', 0, -aH - 32 + float);
            }
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '900 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`☀️ RECARREGANDO: ${Math.ceil(h.stateTimer || 0)}s`, 0, -aH - 26 + float);
          }
          ctx.restore();

        } else if (h.type === 'CHALLENGE_CHEST') {
          // Challenge Chest
          ctx.save();
          ctx.translate(hIso.x, hIso.y - 15);
          ctx.fillStyle = h.used ? '#334155' : (h.isActive ? '#dc2626' : '#d97706');
          ctx.strokeStyle = isNear ? '#fbbf24' : '#f59e0b';
          ctx.lineWidth = isNear ? 3 : 2;
          ctx.beginPath();
          ctx.roundRect(-18, -12, 36, 24, 4);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          if (isNear && !h.used && !h.isActive) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = '900 11px "JetBrains Mono", monospace';
            ctx.fillText('★ [ESPAÇO] INICIAR DESAFIO', hIso.x, hIso.y - 50 + float);
          } else if (h.isActive && !h.used) {
            ctx.fillStyle = '#ef4444';
            ctx.font = '900 11px "JetBrains Mono", monospace';
            ctx.fillText(`⚔ SOBREVIVA: ${Math.ceil(h.stateTimer || 0)}s`, hIso.x, hIso.y - 50 + float);
          }
        } else if (h.type === 'THERMAL_GEYSER') {
          // Floor 6 Thermal Steam Geyser
          ctx.save();
          ctx.translate(hIso.x, hIso.y);
          const steamRadius = h.radius || 65;
          const steamPulse = Math.sin(timeRef.current * 4) * 6;

          // Warm ground heat aura
          const heatGlow = ctx.createRadialGradient(0, 0, 10, 0, 0, steamRadius + steamPulse);
          heatGlow.addColorStop(0, 'rgba(251, 146, 60, 0.45)');
          heatGlow.addColorStop(0.6, 'rgba(234, 88, 12, 0.25)');
          heatGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = heatGlow;
          ctx.beginPath();
          ctx.ellipse(0, 0, steamRadius + steamPulse, (steamRadius + steamPulse) * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Stone geothermal rim
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#ea580c';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, 32, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Boiling molten thermal core
          ctx.fillStyle = '#fdba74';
          ctx.beginPath();
          ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
          ctx.fill();

          // Rising steam vapor particles
          for (let s = 0; s < 4; s++) {
            const sTime = (timeRef.current * 1.5 + s * 0.25) % 1;
            const sx = Math.sin(s * 2 + timeRef.current * 3) * 12;
            const sy = -sTime * 45;
            ctx.fillStyle = `rgba(254, 215, 170, ${1 - sTime})`;
            ctx.beginPath();
            ctx.arc(sx, sy, 5 + sTime * 8, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = '#fed7aa';
          ctx.font = '900 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('♨ VAPOR TÉRMICO', 0, -50 + float * 0.4);
          ctx.restore();
        }
      } else if (item.kind === 'PILLAR') {
        const pil = item.pillar;
        const baseIso = toIso(pil.x, pil.y, 0);
        const topIso = toIso(pil.x, pil.y, pil.height);
        const r = pil.radius;
        const rx = r * 1.414;
        const ry = r * 0.707;

        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(baseIso.x + 8, baseIso.y + 4, rx * 1.2, ry * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left facet
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(baseIso.x - rx, baseIso.y);
        ctx.lineTo(baseIso.x, baseIso.y + ry);
        ctx.lineTo(topIso.x, topIso.y + ry);
        ctx.lineTo(topIso.x - rx, topIso.y);
        ctx.closePath();
        ctx.fill();

        // Right facet
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(baseIso.x, baseIso.y + ry);
        ctx.lineTo(baseIso.x + rx, baseIso.y);
        ctx.lineTo(topIso.x + rx, topIso.y);
        ctx.lineTo(topIso.x, topIso.y + ry);
        ctx.closePath();
        ctx.fill();

        // Top platform / Cap
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.ellipse(topIso.x, topIso.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glowing crystal/rune on top
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.ellipse(topIso.x, topIso.y, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pillar edges
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(baseIso.x, baseIso.y + ry);
        ctx.lineTo(topIso.x, topIso.y + ry);
        ctx.stroke();

      } else if (item.kind === 'PLAYER') {
        let bob = 0; let leanX = 0; let leanY = 0;
        if (p.isMoving) {
          bob = Math.abs(Math.sin(timeRef.current * 15)) * 6;
          leanX = Math.cos(p.facing) * 2;
          leanY = Math.sin(p.facing) * 2;
        }
        const iso = toIso(p.x, p.y, (p.z || 0) + bob);
        const shadowIso = toIso(p.x, p.y, 0);

        // Save current context opacity
        const prevAlpha = ctx.globalAlpha;
        if (p.archetype === Archetype.ARCHER && p.lyraRTimer && p.lyraRTimer > 0) {
          ctx.globalAlpha = 0.30;
        }

        // Player Shadow
        ctx.save();
        ctx.translate(shadowIso.x, shadowIso.y);
        ctx.scale(1, 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        const shadowSize = p.archetype === Archetype.VORGAR && p.vorgarRTimer && p.vorgarRTimer > 0 ? 25 : 15;
        ctx.beginPath(); ctx.arc(0, 0, shadowSize, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        const isVorgarR = p.archetype === Archetype.VORGAR && p.vorgarRTimer && p.vorgarRTimer > 0;
        const layers = p.archetype === Archetype.VORGAR ? (isVorgarR ? 9 : 6) : 4;
        const scale = isVorgarR ? 4 : 3;
        for (let i = 0; i < layers; i++) {
          const ly = iso.y - (i * scale * 2);
          const lx = iso.x + (i * leanX);
          const finalLy = ly + (i * leanY * 0.5);
          const w = p.archetype === Archetype.VORGAR ? (isVorgarR ? 50 : 30) : 24;
          let color = p.hitFlash > 0 ? '#ffffff' : (p.archetype === Archetype.MAGE ? COLORS[Archetype.MAGE] : (p.archetype === Archetype.VORGAR ? COLORS[Archetype.VORGAR] : COLORS[Archetype.ARCHER]));
          if (p.archetype === Archetype.VORGAR && i === layers - 1) {
            color = isVorgarR ? '#f87171' : '#34d399'; // Glowing red core/helmet in Avatar form, green otherwise
          }
          ctx.fillStyle = color;
          ctx.strokeStyle = p.archetype === Archetype.VORGAR ? '#064e3b' : '#ffffff';
          ctx.lineWidth = 2;

          ctx.beginPath();
          if (p.archetype === Archetype.MAGE) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
              const px = lx + Math.cos(a) * (w/2);
              const py = finalLy + Math.sin(a) * (w/2) * 0.5;
              if (a === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
          } else if (p.archetype === Archetype.VORGAR) {
            // Heavy octagon fortress silhouette
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
              const px = lx + Math.cos(a) * (w/2);
              const py = finalLy + Math.sin(a) * (w/2) * 0.55;
              if (a === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
          } else {
            ctx.moveTo(lx, finalLy - w/2);
            ctx.lineTo(lx + w/2, finalLy);
            ctx.lineTo(lx, finalLy + w/2);
            ctx.lineTo(lx - w/2, finalLy);
          }
          ctx.closePath();
          ctx.fill();
          if (i === layers - 1 || i === 0) {
            ctx.stroke();
          }
        }

        // Restore context opacity
        ctx.globalAlpha = prevAlpha;

        if (p.shieldTimer > 0) {
          ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(iso.x, iso.y - layers*scale, 30, 40, 0, 0, Math.PI*2); ctx.stroke();
        }
        if (p.stunTimer > 0) {
          ctx.fillStyle = '#fbbf24';
          for(let i=0; i<3; i++) {
            const a = (timeRef.current * 5) + (i * Math.PI * 2 / 3);
            ctx.beginPath(); ctx.arc(iso.x + Math.cos(a)*20, iso.y - 40 + Math.sin(a)*5, 3, 0, Math.PI*2); ctx.fill();
          }
        }

      } else if (item.kind === 'MINION') {
        const m = item.minion!;
        const mIso = toIso(m.x, m.y, m.z || 0);

        ctx.save();
        ctx.translate(mIso.x, mIso.y);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, m.size, m.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Minion Body
        ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : m.color;
        ctx.strokeStyle = m.role === 'GUARDIAN' ? '#d8b4fe' : '#7dd3fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -m.size, m.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Minion Aura / Inner Core
        ctx.fillStyle = m.role === 'GUARDIAN' ? 'rgba(168, 85, 247, 0.45)' : 'rgba(56, 189, 248, 0.45)';
        ctx.beginPath();
        ctx.arc(0, -m.size, m.size * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Health Bar above Minion
        if (m.hp < m.maxHp) {
          const hpPct = Math.max(0, m.hp / m.maxHp);
          const barW = 32;
          const barH = 4;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(-barW / 2, -m.size * 2 - 8, barW, barH);
          ctx.fillStyle = m.color;
          ctx.fillRect(-barW / 2, -m.size * 2 - 8, barW * hpPct, barH);
        }

        ctx.restore();

      } else if (item.kind === 'ENEMY') {
        const e = item.enemy;
        let bob = 0; let leanX = 0; let leanY = 0;
        if (e.state === 'CHASING') {
          bob = Math.abs(Math.sin(timeRef.current * 10)) * 4;
          const angle = Math.atan2(p.y - e.y, p.x - e.x);
          leanX = Math.cos(angle) * 1.5;
          leanY = Math.sin(angle) * 1.5;
        }

        const iso = toIso(e.x, e.y, (e.z || 0) + bob);
        const shadowIso = toIso(e.x, e.y, 0);

        // Enemy Shadow
        ctx.save();
        ctx.translate(shadowIso.x, shadowIso.y);
        ctx.scale(1, 0.5);
        const shadowAlpha = Math.max(0.1, 0.5 - ((e.z || 0) * 0.002));
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.beginPath(); ctx.arc(0, 0, (e.radius || 15), 0, Math.PI*2); ctx.fill();
        ctx.restore();

        const layers = e.isBoss ? 8 : (e.isElite ? 6 : 3);
        const scale = 3;

        if (e.state === 'SUBMERGED') {
          ctx.save();
          ctx.translate(shadowIso.x, shadowIso.y);
          ctx.scale(1, 0.5);
          
          // Bubbling sludge whirlpool on ground
          const pulse = Math.sin(timeRef.current * 12) * 8;
          ctx.fillStyle = 'rgba(20, 83, 45, 0.7)';
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, (e.radius || 40) + pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Toxic ripples
          ctx.strokeStyle = '#86efac';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, (e.radius || 40) * 0.6 + pulse * 0.5, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        } else {
          for (let i = 0; i < layers; i++) {
            const ly = iso.y - (i * scale * 2);
            const lx = iso.x + (i * leanX);
            const finalLy = ly + (i * leanY * 0.5);
            let w = (e.radius || 15) * 1.5;
            let color = e.color || '#e65c5c';
            if (e.hitFlash > 0) color = '#ffffff';

            ctx.fillStyle = color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            if (e.type === 'SLIME' || e.type === 'MARSH_JUMPER') {
              ctx.beginPath();
              for (let a = 0; a <= Math.PI * 2; a += 0.2) {
                const wobble = Math.sin(a * 4 + timeRef.current * 10) * (w * 0.15);
                const r = (w/2) + wobble;
                const px = lx + Math.cos(a) * r;
                const py = finalLy + Math.sin(a) * r * 0.5;
                if (a === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.fill();
              if (i === layers - 1) ctx.stroke();
            } else if (e.type === 'BAT') {
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w/2);
              ctx.lineTo(lx + w, finalLy - w/4);
              ctx.lineTo(lx, finalLy + w/2);
              ctx.lineTo(lx - w, finalLy - w/4);
              ctx.closePath();
              ctx.fill();
              if (i === layers - 1) ctx.stroke();
            } else if (e.type === 'FROST_CRYSTAL') {
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.75);
              ctx.lineTo(lx + w * 0.45, finalLy);
              ctx.lineTo(lx, finalLy + w * 0.75);
              ctx.lineTo(lx - w * 0.45, finalLy);
              ctx.closePath();
              ctx.fillStyle = i === layers - 1 ? '#bae6fd' : '#0284c7';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#e0f2fe';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              }
            } else if (e.type === 'PRISM_SIPHON') {
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.75);
              ctx.lineTo(lx + w * 0.5, finalLy);
              ctx.lineTo(lx, finalLy + w * 0.75);
              ctx.lineTo(lx - w * 0.5, finalLy);
              ctx.closePath();
              ctx.fillStyle = i === layers - 1 ? '#d8b4fe' : '#7c3aed';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#f3e8ff';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              }
            } else if (e.type === 'INERTIA_SENTINEL') {
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.6);
              ctx.lineTo(lx + w * 0.6, finalLy - w * 0.3);
              ctx.lineTo(lx + w * 0.6, finalLy + w * 0.3);
              ctx.lineTo(lx, finalLy + w * 0.6);
              ctx.lineTo(lx - w * 0.6, finalLy + w * 0.3);
              ctx.lineTo(lx - w * 0.6, finalLy - w * 0.3);
              ctx.closePath();
              ctx.fillStyle = i === layers - 1 ? '#94a3b8' : '#334155';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#f1f5f9';
                ctx.lineWidth = 3;
                ctx.stroke();
              }
            } else if (e.type === 'BOSS_PRIME_COLOSSUS') {
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.85);
              ctx.lineTo(lx + w * 0.7, finalLy - w * 0.2);
              ctx.lineTo(lx + w * 0.5, finalLy + w * 0.6);
              ctx.lineTo(lx - w * 0.5, finalLy + w * 0.6);
              ctx.lineTo(lx - w * 0.7, finalLy - w * 0.2);
              ctx.closePath();
              ctx.fillStyle = e.isStaggered ? '#475569' : (i === layers - 1 ? '#d8b4fe' : '#7c3aed');
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = e.isStaggered ? '#94a3b8' : '#c084fc';
                ctx.lineWidth = 4;
                ctx.stroke();
              }
            } else if (e.type === 'BOSS_NIGHT_REAPER') {
              // Reaper Shadow Mantle & Floating Scythe Wings
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.9);
              ctx.lineTo(lx + w * 0.7, finalLy - w * 0.1);
              ctx.lineTo(lx + w * 0.4, finalLy + w * 0.7);
              ctx.lineTo(lx - w * 0.4, finalLy + w * 0.7);
              ctx.lineTo(lx - w * 0.7, finalLy - w * 0.1);
              ctx.closePath();
              ctx.fillStyle = e.isStaggered ? '#475569' : (i === layers - 1 ? '#a855f7' : '#3b0764');
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = e.isStaggered ? '#94a3b8' : '#c084fc';
                ctx.lineWidth = 3.5;
                ctx.stroke();
              }
            } else if (e.type === 'CRYPT_NECROMANCER') {
              // Necromancer Robes
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.8);
              ctx.lineTo(lx + w * 0.5, finalLy + w * 0.5);
              ctx.lineTo(lx - w * 0.5, finalLy + w * 0.5);
              ctx.closePath();
              ctx.fillStyle = i === layers - 1 ? '#c084fc' : '#581c87';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#d8b4fe';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            } else if (e.type === 'GRAVE_EXECUTIONER') {
              // Executioner Armored Silhouette
              ctx.beginPath();
              ctx.roundRect(lx - w * 0.6, finalLy - w * 0.6, w * 1.2, w * 1.2, 6);
              ctx.fillStyle = i === layers - 1 ? '#64748b' : '#1e293b';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 3;
                ctx.stroke();
              }
            } else if (e.type === 'SOLAR_MONK') {
              // Martial Golden Robe
              ctx.beginPath();
              ctx.roundRect(lx - w * 0.45, finalLy - w * 0.45, w * 0.9, w * 0.9, 8);
              ctx.fillStyle = i === layers - 1 ? '#fbbf24' : '#b45309';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#fef08a';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            } else if (e.type === 'SOLAR_PALADIN') {
              // Heavy Solar Aegis Armor
              ctx.beginPath();
              ctx.roundRect(lx - w * 0.6, finalLy - w * 0.6, w * 1.2, w * 1.2, 5);
              ctx.fillStyle = i === layers - 1 ? '#f59e0b' : '#78350f';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#fde68a';
                ctx.lineWidth = 3;
                ctx.stroke();
              }
            } else if (e.type === 'SOLAR_PRIESTESS') {
              // Radiant Priestess Vestment
              ctx.beginPath();
              ctx.arc(lx, finalLy, w * 0.5, 0, Math.PI * 2);
              ctx.fillStyle = i === layers - 1 ? '#fef08a' : '#d97706';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            } else if (e.type === 'SOLAR_RELIC') {
              // Hovering Solar Diamond Obelisk
              ctx.beginPath();
              ctx.moveTo(lx, finalLy - w * 0.7);
              ctx.lineTo(lx + w * 0.6, finalLy);
              ctx.lineTo(lx, finalLy + w * 0.7);
              ctx.lineTo(lx - w * 0.6, finalLy);
              ctx.closePath();
              ctx.fillStyle = i === layers - 1 ? '#fbbf24' : '#d97706';
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                ctx.stroke();
              }
            } else if (e.type === 'BOSS_CELESTIAL_EMPEROR') {
              // Majestic Celestial Emperor Plate
              ctx.beginPath();
              ctx.roundRect(lx - w * 0.55, finalLy - w * 0.55, w * 1.1, w * 1.1, 10);
              ctx.fillStyle = i === layers - 1 ? '#fef08a' : (i > layers / 2 ? '#fbbf24' : '#b45309');
              ctx.fill();
              if (i === layers - 1) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3.5;
                ctx.stroke();
              }
            } else {
              ctx.beginPath();
              ctx.fillRect(lx - w/2, finalLy - w/2, w, w);
              ctx.closePath();
              if (i === layers - 1) {
                ctx.strokeRect(lx - w/2, finalLy - w/2, w, w);
              }
            }
          }
        }

        // Arkhon guardian link beams and protective shield aura
        if (e.isBoss && e.type === 'BOSS_CRYSTAL_GOLIAS') {
          const guards = enemiesRef.current.filter(g => g.state === 'GUARDING' && g.hp > 0);
          if (guards.length > 0) {
            ctx.save();
            // Protective crystalline shield bubble
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 55, 30, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Crystalline tether beams to guards
            guards.forEach(g => {
              const gIso = toIso(g.x, g.y, g.z || 0);
              ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(iso.x, iso.y - (layers * scale * 0.5));
              ctx.lineTo(gIso.x, gIso.y - 15);
              ctx.stroke();
              ctx.setLineDash([]);
            });
            ctx.restore();
          }
        }

        if (e.isBoss && e.type === 'BOSS_ARTILLERY_WARLORD') {
          const guards = enemiesRef.current.filter(g => g.state === 'GUARDING' && g.hp > 0);
          if (guards.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 58, 32, 0, 0, Math.PI * 2);
            ctx.stroke();

            guards.forEach(g => {
              const gIso = toIso(g.x, g.y, g.z || 0);
              ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(iso.x, iso.y - (layers * scale * 0.5));
              ctx.lineTo(gIso.x, gIso.y - 15);
              ctx.stroke();
              ctx.setLineDash([]);
            });
            ctx.restore();
          }
        }

        if (e.isBoss && e.type === 'BOSS_THUNDER_PHARAOH') {
          const sarcophagi = enemiesRef.current.filter(g => g.type === 'TESLA_SARCOPHAGUS' && g.hp > 0);
          if (sarcophagi.length > 0) {
            ctx.save();
            // Golden circular energy dome
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 62, 34, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Glow backing
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 62, 34, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Electrical tethers
            sarcophagi.forEach(g => {
              const gIso = toIso(g.x, g.y, g.z || 0);
              
              // Draw a jagged lightning bolt from sarcophagus to boss!
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              
              const startX = gIso.x;
              const startY = gIso.y - 15;
              const endX = iso.x;
              const endY = iso.y - (layers * scale * 0.5);
              
              // Generate 5 jagged midpoints
              ctx.moveTo(startX, startY);
              const segments = 5;
              for (let k = 1; k < segments; k++) {
                const ratio = k / segments;
                const mx = startX + (endX - startX) * ratio;
                const my = startY + (endY - startY) * ratio;
                
                // Add perpendicular displacement
                const perpX = -(endY - startY);
                const perpY = endX - startX;
                const perpLen = Math.hypot(perpX, perpY) || 1;
                const displace = (Math.random() - 0.5) * 20;
                
                ctx.lineTo(mx + (perpX / perpLen) * displace, my + (perpY / perpLen) * displace);
              }
              ctx.lineTo(endX, endY);
              ctx.stroke();
            });
            ctx.restore();
          }
        }

        if (e.isBoss && e.type === 'BOSS_YETI_OVERLORD') {
          const crystals = enemiesRef.current.filter(g => g.type === 'FROST_CRYSTAL' && g.hp > 0);
          if (crystals.length > 0) {
            ctx.save();
            // Permafrost Ice Shield Bubble
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 64, 36, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Frost aura glow
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 64, 36, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Crystalline frost tethers connecting Ymir to the 3 crystals
            crystals.forEach(g => {
              const gIso = toIso(g.x, g.y, g.z || 0);
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
              ctx.lineWidth = 2.5;
              ctx.setLineDash([8, 4]);
              ctx.beginPath();
              ctx.moveTo(iso.x, iso.y - (layers * scale * 0.5));
              ctx.lineTo(gIso.x, gIso.y - 20);
              ctx.stroke();
              ctx.setLineDash([]);
            });
            ctx.restore();
          }
        }

        if (e.isBoss && e.type === 'BOSS_PRIME_COLOSSUS') {
          const activePillars = enemiesRef.current.filter(pil => pil.type === 'RESONANT_PILLAR' && pil.hp > 0).length;
          if (activePillars > 0) {
            // Invincibility Barrier Shield Visual Bubble
            ctx.save();
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 4 + Math.sin(timeRef.current * 5) * 1.5;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#a855f7';
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 80, 40, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Soft colored fill
            ctx.fillStyle = 'rgba(168, 85, 247, 0.07)';
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 78, 38, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        if (e.isBoss && e.type === 'BOSS_NIGHT_REAPER') {
          if (e.customAttackData?.shadowVeil && !e.isStaggered) {
            // Shadow Veil of the Underworld: Dark billowing mist & shield
            ctx.save();
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 4 + Math.sin(timeRef.current * 6) * 1.5;
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#6d28d9';
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 75, 38, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Dark shadowy inner mist
            ctx.fillStyle = 'rgba(76, 29, 149, 0.22)';
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 72, 36, 0, 0, Math.PI * 2);
            ctx.fill();

            // Orbiting shadow wisps
            for (let w = 0; w < 4; w++) {
              const wAng = timeRef.current * 3 + w * (Math.PI / 2);
              const wx = iso.x + Math.cos(wAng) * 65;
              const wy = (iso.y - layers * scale) + Math.sin(wAng) * 32;
              ctx.fillStyle = '#c084fc';
              ctx.beginPath();
              ctx.arc(wx, wy, 4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        if (e.isBoss && e.type === 'BOSS_CELESTIAL_EMPEROR') {
          const relics = enemiesRef.current.filter(g => g.type === 'SOLAR_RELIC' && g.hp > 0);
          if (relics.length > 0 && e.bossPhase === 2) {
            ctx.save();
            // Divine Sun Shield Bubble
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 4 + Math.sin(timeRef.current * 6) * 1.5;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f59e0b';
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 85, 45, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Radiant golden inner warmth
            ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
            ctx.beginPath();
            ctx.ellipse(iso.x, iso.y - (layers * scale), 82, 42, 0, 0, Math.PI * 2);
            ctx.fill();

            // Solar tethers connecting Aurelius to the active relics
            relics.forEach(g => {
              const gIso = toIso(g.x, g.y, g.z || 0);
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
              ctx.lineWidth = 2.5;
              ctx.setLineDash([8, 4]);
              ctx.beginPath();
              ctx.moveTo(iso.x, iso.y - (layers * scale * 0.5));
              ctx.lineTo(gIso.x, gIso.y - 25);
              ctx.stroke();
              ctx.setLineDash([]);
            });
            ctx.restore();
          }
        }

        if (e.type === 'PRISM_SIPHON' && e.hp > 0) {
          const distP = Math.hypot(p.x - e.x, p.y - e.y);
          if (distP < 600) {
            // Draw a beautiful glowing electric siphoning tether from the siphon to the player!
            const pIso = toIso(p.x, p.y, 30);
            const eIso = toIso(e.x, e.y, (e.z || 0) + 20);
            ctx.save();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.75)';
            ctx.lineWidth = 2.0 + Math.sin(timeRef.current * 10) * 0.8;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#c084fc';
            ctx.beginPath();
            ctx.moveTo(eIso.x, eIso.y);
            ctx.lineTo(pIso.x, pIso.y);
            ctx.stroke();
            ctx.restore();
          }
        }

        if (e.type === 'INERTIA_SENTINEL' && e.hp > 0) {
          // Draw the semi-transparent inertia slow dome on the ground around the Sentinel!
          ctx.save();
          ctx.translate(shadowIso.x, shadowIso.y);
          ctx.scale(1, 0.5);
          
          ctx.fillStyle = 'rgba(100, 116, 139, 0.07)';
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 180, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw subtle rotating clockwork patterns inside the dome to convey time/inertia slowing!
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
          ctx.setLineDash([5, 15]);
          ctx.beginPath();
          ctx.arc(0, 0, 120, timeRef.current * 0.3, timeRef.current * 0.3 + Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Lyra Eclipse Hunt Mark Crosshair above marked enemies
        if (p.archetype === Archetype.ARCHER && p.lyraMarkedEnemyIds?.includes(e.id)) {
          ctx.save();
          const markY = iso.y - (layers * scale) - 30;
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(iso.x, markY, 14, 0, Math.PI * 2);
          ctx.stroke();
          // Crosshairs
          ctx.beginPath();
          ctx.moveTo(iso.x - 20, markY); ctx.lineTo(iso.x + 20, markY);
          ctx.moveTo(iso.x, markY - 20); ctx.lineTo(iso.x, markY + 20);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.font = '900 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('ALVO MARCADO', iso.x, markY - 18);
          ctx.restore();
        }
      }
    });

    // Aiming Laser
    if (gameStateRef.current === GameState.TOWER) {
      const pIso = toIso(playerRef.current.x, playerRef.current.y, playerRef.current.z + 10);
      const mIso = toIso(mouseWorldRef.current.x, mouseWorldRef.current.y, 0);
      ctx.beginPath();
      ctx.moveTo(pIso.x, pIso.y);
      ctx.lineTo(mIso.x, mIso.y);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)'; // Red laser
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Projectiles (Crisp, High-Contrast Rendering)
    projectilesRef.current.forEach(p => {
      const iso = toIso(p.x, p.y, p.z);
      const mainColor = p.color || (p.isEnemy ? '#ef4444' : '#34b293');
      ctx.save();
      ctx.translate(iso.x, iso.y);

      if (p.type === 'ARROW') {
        const screenVx = p.vx - p.vy;
        const screenVy = (p.vx + p.vy) / 2;
        ctx.rotate(Math.atan2(screenVy, screenVx));

        // 1. Dark Crisp Outline
        ctx.beginPath();
        ctx.moveTo(-11, -3); ctx.lineTo(4, -3); ctx.lineTo(4, -7); ctx.lineTo(15, 0); ctx.lineTo(4, 7); ctx.lineTo(4, 3); ctx.lineTo(-11, 3);
        ctx.closePath();
        ctx.fillStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#020617';
        ctx.stroke();

        // 2. Solid Color Body
        ctx.fillStyle = mainColor;
        ctx.fill();

        // 3. Bright White Inner Core Line
        ctx.beginPath();
        ctx.moveTo(-8, -1); ctx.lineTo(3, -1); ctx.lineTo(3, -3); ctx.lineTo(11, 0); ctx.lineTo(3, 3); ctx.lineTo(3, 1); ctx.lineTo(-8, 1);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (p.type === 'SOUL_SKULL') {
        const r = p.radius || 12;
        // Desenha uma alma fantasmagórica
        ctx.beginPath();
        ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = '#1e1b4b'; // Sombra roxa escura
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7'; // Corpo roxo vibrante
        ctx.fill();

        // Olhos brilhantes da alma fantasmagórica
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3, -2, 2.5, 0, Math.PI * 2);
        ctx.arc(3, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Brilho interno
        ctx.beginPath();
        ctx.arc(0, 2, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#f3e8ff';
        ctx.fill();
      } else {
        const r = p.radius || 10;

        // 1. Dark Crisp Outer Ring
        ctx.beginPath();
        ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#020617';
        ctx.fill();

        // 2. Solid Color Body
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();

        // 3. Bright White Core
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, r * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    });

    // XP Orbs
    xpOrbsRef.current.forEach(orb => {
      const iso = toIso(orb.x, orb.y, orb.z);
      ctx.fillStyle = '#22d3ee'; // Cyan
      ctx.beginPath();
      ctx.arc(iso.x, iso.y, 4 + (orb.value/100), 0, Math.PI*2);
      ctx.fill();
    });

    // Events
    if (eventRef.current.active && eventRef.current.type === 'CHEST') {
      const iso = toIso(eventRef.current.x, eventRef.current.y, 0);
      ctx.fillStyle = '#fbbf24'; // Gold
      ctx.fillRect(iso.x - 20, iso.y - 30, 40, 30);
      ctx.fillStyle = '#0891b2'; // Dark cyan outline or lock
      ctx.fillRect(iso.x - 5, iso.y - 15, 10, 10);
    }

    // Particles
    particlesRef.current.forEach(p => {
      const iso = toIso(p.x, p.y, p.z);
      ctx.fillStyle = p.color; 
      ctx.globalAlpha = p.life / p.maxLife; 
      if (p.type === 'RAIN') {
        ctx.fillRect(iso.x, iso.y, 1, 15);
      } else if (p.type === 'SNOW') {
        ctx.beginPath(); ctx.arc(iso.x, iso.y, p.size, 0, Math.PI*2); ctx.fill();
      } else if (p.type === 'SAND') {
        ctx.fillRect(iso.x, iso.y, p.size * 3, p.size);
      } else {
        ctx.fillRect(iso.x, iso.y, p.size, p.size); 
      }
      ctx.globalAlpha = 1;
    });

    LightweightParticleManager.draw(ctx, toIso);

    // Damage Numbers
    ctx.textAlign = 'center';
    damageNumbersRef.current.forEach(d => {
      const iso = toIso(d.x, d.y, d.z);
      
      ctx.fillStyle = d.color || '#fff';
      ctx.font = d.isCrit ? FONT_DAMAGE_CRIT : FONT_DAMAGE_NORM;
      
      ctx.globalAlpha = Math.min(1, d.life * 2);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = d.isCrit ? 4 : 2;
      const textVal = d.value === 0 ? "⚡ BREAK 3X!" : Math.floor(d.value).toString();
      ctx.strokeText(textVal, iso.x, iso.y);
      ctx.fillText(textVal, iso.x, iso.y);
      ctx.globalAlpha = 1;
    });

    // Skill Aiming Ground Reticle Indicator for All Hunters (Q / E / R)
    if (aimingSkillRef.current) {
      const p = playerRef.current;
      const targetPos = mouseWorldRef.current;
      const skill = aimingSkillRef.current;
      const pulse = Math.sin(timeRef.current * 8) * 5;
      const pIso = toIso(p.x, p.y, p.z + 10);

      ctx.save();

      if (p.archetype === Archetype.MAGE) {
        // ==================== KAEL (MAGE) ====================
        if (skill === 'Q') {
          // --- KAEL Q: NOVA CÓSMICA DE ENERGIA ---
          const maxCastDist = 520;
          const distToTarget = Math.hypot(targetPos.x - p.x, targetPos.y - p.y);
          const actualDist = Math.min(distToTarget, maxCastDist);
          const angle = Math.atan2(targetPos.y - p.y, targetPos.x - p.x);
          const castX = p.x + Math.cos(angle) * actualDist;
          const castY = p.y + Math.sin(angle) * actualDist;
          const tIso = toIso(castX, castY, 0);

          // 1. Faint Max Range Ring around Kael
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.ellipse(pIso.x, pIso.y, maxCastDist * 1.414, maxCastDist * 0.707, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // 2. Cosmic Tether Beam connecting Kael to target location
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([10, 6]);
          ctx.lineDashOffset = -timeRef.current * 30;
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(tIso.x, tIso.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // 3. Ground Nova Area
          const novaRadius = 220 * (p.stats.skillRadiusMult || 1.0);
          const rx = (novaRadius + pulse) * 1.414;
          const ry = (novaRadius + pulse) * 0.707;

          // Inner cosmic nebula fill
          ctx.fillStyle = 'rgba(192, 132, 252, 0.22)';
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // Outer pulsing violet dashed ring
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 3;
          ctx.setLineDash([12, 8]);
          ctx.lineDashOffset = -timeRef.current * 35;
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Inner rotating cyan astral ring
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 12]);
          ctx.lineDashOffset = timeRef.current * 45;
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx * 0.65, ry * 0.65, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Center target reticle crosshairs & core dot
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tIso.x - 20, tIso.y); ctx.lineTo(tIso.x + 20, tIso.y);
          ctx.moveTo(tIso.x, tIso.y - 12); ctx.lineTo(tIso.x, tIso.y + 12);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(tIso.x, tIso.y, 4, 0, Math.PI * 2);
          ctx.fill();

          // Label
          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
          ctx.fillText('🔮 [CLIQUE COM O MOUSE: NOVA CÓSMICA DE ENERGIA]', tIso.x, tIso.y - ry - 18);
          ctx.shadowBlur = 0;
        } else if (skill === 'E') {
          // --- KAEL E: FENDA GRAVITACIONAL ARCANA ---
          const tIso = toIso(targetPos.x, targetPos.y, 0);
          const vortexRadius = 175 * (p.stats.skillRadiusMult || 1.0);
          const rx = (vortexRadius + pulse) * 1.414;
          const ry = (vortexRadius + pulse) * 0.707;

          // Tether line
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(tIso.x, tIso.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Swirling vortex background fill
          ctx.fillStyle = 'rgba(139, 92, 246, 0.25)';
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // Rotating spiral rings
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 3;
          ctx.setLineDash([14, 8]);
          ctx.lineDashOffset = timeRef.current * 50;
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 10]);
          ctx.lineDashOffset = -timeRef.current * 60;
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Inward suction arrows
          for (let i = 0; i < 4; i++) {
            const rot = (Math.PI / 2) * i + timeRef.current * 2;
            const ax = tIso.x + Math.cos(rot) * (rx * 0.85);
            const ay = tIso.y + Math.sin(rot) * (ry * 0.85);
            const inX = tIso.x + Math.cos(rot) * (rx * 0.35);
            const inY = tIso.y + Math.sin(rot) * (ry * 0.35);
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(inX, inY);
            ctx.stroke();
          }

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🌀 [CLIQUE COM O MOUSE: FENDA GRAVITACIONAL ARCANA]', tIso.x, tIso.y - ry - 18);
        } else if (skill === 'R') {
          // --- KAEL R: CATACLISMO ESTELAR ---
          const tIso = toIso(targetPos.x, targetPos.y, 0);
          const meteorRadius = 200;
          const rx = (meteorRadius + pulse) * 1.414;
          const ry = (meteorRadius + pulse) * 0.707;

          // Fiery crimson/orange crater reticle
          ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([12, 6]);
          ctx.lineDashOffset = -timeRef.current * 45;
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Solar targeting crosshair
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(tIso.x - 26, tIso.y); ctx.lineTo(tIso.x + 26, tIso.y);
          ctx.moveTo(tIso.x, tIso.y - 16); ctx.lineTo(tIso.x, tIso.y + 16);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('☄️ [CLIQUE COM O MOUSE: CATACLISMO ESTELAR]', tIso.x, tIso.y - ry - 18);
        }
      } else if (p.archetype === Archetype.VORGAR) {
        // ==================== VORGAR ====================
        if (skill === 'E') {
          // --- VORGAR E: GARRA DA RUÍNA (Corredor de Puxão) ---
          const rangeMult = p.unlockedTalents?.has('vorgar_m01') ? 1.30 : 1.0;
          const hookRange = 380 * rangeMult;
          const halfWidth = 95 / 2;
          const angle = Math.atan2(targetPos.y - p.y, targetPos.x - p.x);

          const c1World = { x: p.x + Math.cos(angle + Math.PI / 2) * halfWidth, y: p.y + Math.sin(angle + Math.PI / 2) * halfWidth };
          const c2World = { x: p.x + Math.cos(angle - Math.PI / 2) * halfWidth, y: p.y + Math.sin(angle - Math.PI / 2) * halfWidth };
          const c3World = {
            x: p.x + Math.cos(angle) * hookRange + Math.cos(angle - Math.PI / 2) * halfWidth,
            y: p.y + Math.sin(angle) * hookRange + Math.sin(angle - Math.PI / 2) * halfWidth
          };
          const c4World = {
            x: p.x + Math.cos(angle) * hookRange + Math.cos(angle + Math.PI / 2) * halfWidth,
            y: p.y + Math.sin(angle) * hookRange + Math.sin(angle + Math.PI / 2) * halfWidth
          };

          const c1 = toIso(c1World.x, c1World.y, 0);
          const c2 = toIso(c2World.x, c2World.y, 0);
          const c3 = toIso(c3World.x, c3World.y, 0);
          const c4 = toIso(c4World.x, c4World.y, 0);

          ctx.fillStyle = 'rgba(16, 185, 129, 0.20)';
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.setLineDash([12, 8]);
          ctx.lineDashOffset = -timeRef.current * 40;
          ctx.stroke();
          ctx.setLineDash([]);

          const endIso = toIso(p.x + Math.cos(angle) * hookRange, p.y + Math.sin(angle) * hookRange, 0);
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(endIso.x, endIso.y);
          ctx.stroke();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(endIso.x - 16, endIso.y); ctx.lineTo(endIso.x + 16, endIso.y);
          ctx.moveTo(endIso.x, endIso.y - 10); ctx.lineTo(endIso.x, endIso.y + 10);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🧲 [CLIQUE COM O MOUSE: GARRA DA RUÍNA - CORRENTES]', endIso.x, endIso.y - 25);
        } else if (skill === 'Q') {
          // --- VORGAR Q: MARTELO CATACLÍSMICO ---
          const distToTarget = Math.hypot(targetPos.x - p.x, targetPos.y - p.y);
          const angle = Math.atan2(targetPos.y - p.y, targetPos.x - p.x);
          const maxReachDist = 280;
          const actualDist = Math.min(distToTarget, maxReachDist);
          const slamCenterX = p.x + Math.cos(angle) * actualDist;
          const slamCenterY = p.y + Math.sin(angle) * actualDist;
          const tIso = toIso(slamCenterX, slamCenterY, 0);

          // Fissure corridor from Vorgar to slam zone
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(tIso.x, tIso.y);
          ctx.stroke();
          ctx.setLineDash([]);

          const areaMult = p.unlockedTalents?.has('vorgar_m03') ? 1.25 : 1.0;
          const radius = 120 * areaMult;
          const rx = (radius + pulse) * 1.414;
          const ry = (radius + pulse) * 0.707;

          ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([12, 8]);
          ctx.lineDashOffset = -timeRef.current * 35;
          ctx.beginPath();
          ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tIso.x - 18, tIso.y); ctx.lineTo(tIso.x + 18, tIso.y);
          ctx.moveTo(tIso.x, tIso.y - 10); ctx.lineTo(tIso.x, tIso.y + 10);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🔨 [CLIQUE COM O MOUSE: MARTELO CATACLÍSMICO]', tIso.x, tIso.y - ry - 18);
        }
      } else if (p.archetype === Archetype.SUMMONER) {
        // ==================== MALAKAR ====================
        const isQ = skill === 'Q';
        const tIso = toIso(targetPos.x, targetPos.y, 0);
        const radius = isQ ? 220 : 240;
        const rx = (radius + pulse) * 1.414;
        const ry = (radius + pulse) * 0.707;
        const color = isQ ? '#a855f7' : '#38bdf8';

        // Connect tether
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(pIso.x, pIso.y);
        ctx.lineTo(tIso.x, tIso.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.fillStyle = isQ ? 'rgba(168, 85, 247, 0.22)' : 'rgba(56, 189, 248, 0.22)';
        ctx.beginPath();
        ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -timeRef.current * 40;
        ctx.beginPath();
        ctx.ellipse(tIso.x, tIso.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tIso.x - 18, tIso.y); ctx.lineTo(tIso.x + 18, tIso.y);
        ctx.moveTo(tIso.x, tIso.y - 10); ctx.lineTo(tIso.x, tIso.y + 10);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const textMsg = isQ
          ? '✨ [CLIQUE COM O MOUSE: CONVERGÊNCIA ESPIRITUAL]'
          : '🌀 [CLIQUE COM O MOUSE: INVOCAR LEGIÃO DE ESPÍRITOS]';
        ctx.fillText(textMsg, tIso.x, tIso.y - ry - 18);
      } else if (p.archetype === Archetype.ARCHER) {
        // ==================== LYRA (ARCHER) ====================
        const angle = Math.atan2(targetPos.y - p.y, targetPos.x - p.x);
        if (skill === 'Q') {
          // --- LYRA Q: SALVA DE FÓTONS (Cone de Disparo de Flechas) ---
          const coneRange = 360;
          const spread = 0.65;
          const halfSpread = spread / 2;

          const leftAngle = angle - halfSpread;
          const rightAngle = angle + halfSpread;
          const leftIso = toIso(p.x + Math.cos(leftAngle) * coneRange, p.y + Math.sin(leftAngle) * coneRange, 0);
          const rightIso = toIso(p.x + Math.cos(rightAngle) * coneRange, p.y + Math.sin(rightAngle) * coneRange, 0);
          const centerIso = toIso(p.x + Math.cos(angle) * coneRange, p.y + Math.sin(angle) * coneRange, 0);

          ctx.fillStyle = 'rgba(52, 211, 153, 0.18)';
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(leftIso.x, leftIso.y);
          ctx.lineTo(centerIso.x, centerIso.y);
          ctx.lineTo(rightIso.x, rightIso.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(leftIso.x, leftIso.y);
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(rightIso.x, rightIso.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // 5 arrow trajectory lines
          for (let i = 0; i < 5; i++) {
            const arrAngle = leftAngle + (i / 4) * spread;
            const tipIso = toIso(p.x + Math.cos(arrAngle) * (coneRange * 0.9), p.y + Math.sin(arrAngle) * (coneRange * 0.9), 0);
            ctx.strokeStyle = '#a7f3d0';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(pIso.x, pIso.y);
            ctx.lineTo(tipIso.x, tipIso.y);
            ctx.stroke();
          }

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🏹 [CLIQUE COM O MOUSE: SALVA DE FÓTONS]', centerIso.x, centerIso.y - 20);
        } else if (skill === 'E') {
          // --- LYRA E: DISPARO PERFURANTE SOMBRIO (Linha de Sniper) ---
          const beamLen = 750;
          const endIso = toIso(p.x + Math.cos(angle) * beamLen, p.y + Math.sin(angle) * beamLen, 0);

          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.lineWidth = 24;
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(endIso.x, endIso.y);
          ctx.stroke();

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.setLineDash([12, 6]);
          ctx.beginPath();
          ctx.moveTo(pIso.x, pIso.y);
          ctx.lineTo(endIso.x, endIso.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Center crosshair
          const tIso = toIso(targetPos.x, targetPos.y, 0);
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tIso.x - 16, tIso.y); ctx.lineTo(tIso.x + 16, tIso.y);
          ctx.moveTo(tIso.x, tIso.y - 10); ctx.lineTo(tIso.x, tIso.y + 10);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '900 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🎯 [CLIQUE COM O MOUSE: DISPARO PERFURANTE]', tIso.x, tIso.y - 20);
        }
      }

      ctx.restore();
    }

    ctx.restore();

    // Weather, Biome & Abyss Fog Overlays
    if (weatherRef.current === Weather.NIGHT) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
      ctx.fillRect(0, 0, width, height);
    } else if (weatherRef.current === Weather.SANDSTORM) {
      ctx.fillStyle = 'rgba(180, 83, 9, 0.25)'; // Deeper amber atmospheric sandstorm overlay
      ctx.fillRect(0, 0, width, height);
    } else if (weatherRef.current === Weather.BLIZZARD) {
      ctx.fillStyle = 'rgba(186, 230, 253, 0.22)'; // Richer cool frost blizzard overlay
      ctx.fillRect(0, 0, width, height);
    }

    // Floor 8: Gothic Crypts Creeping Mist Atmosphere Tint
    if (currentFloorNum === 8 && !isVila) {
      ctx.fillStyle = 'rgba(46, 16, 101, 0.18)'; // Atmospheric gothic lavender shadow tint
      ctx.fillRect(0, 0, width, height);
    } else if (currentFloorNum === 9 && !isVila) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.08)'; // Radiant celestial golden sun haze
      ctx.fillRect(0, 0, width, height);
    } else if (currentFloorNum === 3 && !isVila) {
      ctx.fillStyle = 'rgba(124, 45, 18, 0.14)'; // Volcanic heat aura
      ctx.fillRect(0, 0, width, height);
    } else if (isRestRoomRef.current) {
      ctx.fillStyle = 'rgba(234, 88, 12, 0.10)'; // Cozy warm hearth glow
      ctx.fillRect(0, 0, width, height);
    }

    // Outer Abyss Fog Vignette (Cached Gradient)
    if (!fogGradientRef.current || fogGradientRef.current.w !== width || fogGradientRef.current.h !== height) {
      const fogGrad = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.4, cx, cy, Math.max(width, height) * 0.75);
      fogGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      fogGrad.addColorStop(0.7, 'rgba(3, 7, 18, 0.4)');
      fogGrad.addColorStop(1, 'rgba(2, 4, 10, 0.92)');
      fogGradientRef.current = { grad: fogGrad, w: width, h: height };
    }
    ctx.fillStyle = fogGradientRef.current.grad;
    ctx.fillRect(0, 0, width, height);

    // Hazard Toast Canvas Overlay (Instant, buttery smooth notification)
    if (hazardToastRef.current && hazardToastRef.current.timer > 0) {
      const toast = hazardToastRef.current;
      const alpha = Math.min(1, Math.sin((toast.timer / (toast.maxTimer || 3)) * Math.PI));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      
      const bannerW = 460;
      const bannerH = 44;
      const bx = cx - bannerW / 2;
      const by = 80;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bannerW, bannerH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.fillText(toast.text, cx, by + 27);
      ctx.restore();
    }

    // Death Sequence Overlay (Dramatic dark vignette consuming the screen)
    if (deathSequenceActiveRef.current) {
      const elapsed = 2.5 - deathTimerRef.current;
      const progress = Math.min(1, elapsed / 2.5);
      
      const deathGrad = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.1 * (1 - progress * 0.8), cx, cy, Math.max(width, height) * 0.65 * (1 - progress * 0.5));
      deathGrad.addColorStop(0, `rgba(0, 0, 0, ${progress * 0.7})`);
      deathGrad.addColorStop(0.5, `rgba(0, 0, 0, ${progress * 0.95})`);
      deathGrad.addColorStop(1, `rgba(2, 4, 10, ${progress * 1.0})`);
      
      ctx.fillStyle = deathGrad;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(1, progress * 1.5)})`;
      ctx.font = '900 36px sans-serif';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 12;
      ctx.fillText("SUA EXPEDIÇÃO ACABOU", cx, cy - 25);
      
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, Math.max(0, progress * 1.5 - 0.5))})`;
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.shadowBlur = 4;
      ctx.fillText("Sua essência retorna à vila dos ecos...", cx, cy + 25);
      ctx.restore();
    }
  };

  return (
    <div className="relative w-full h-full bg-sky-100 cursor-crosshair select-none overflow-hidden font-mono touch-none">
      {currentGameState === GameState.REGION_SELECT && (
        <RegionSelectMap
          saveData={saveData}
          activeArchetype={playerRef.current?.archetype || archetype}
          currentRunLevel={playerRef.current?.level || 1}
          currentRunCrystals={playerRef.current?.crystals || 0}
          climbBonusMult={climbBonusMultRef.current}
          onSelectRegion={handleSelectRegionFromMap}
          onReturnToVillage={handleReturnToVillageFromMap}
        />
      )}
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full touch-none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseScreenRef.current = {
            x: e.clientX - rect.left - dimensions.width / 2,
            y: e.clientY - rect.top - dimensions.height / 2
          };
        }}
        onPointerDown={(e) => {
          if (e.button === 2) {
            aimingSkillRef.current = null;
            return;
          }
          if (e.button === 0 && aimingSkillRef.current) {
            const skillToCast = aimingSkillRef.current;
            aimingSkillRef.current = null;
            isAttackingRef.current = false;
            const p = playerRef.current;
            const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
            const cdMult = (mutator && mutator.skillCooldownMult !== undefined) ? mutator.skillCooldownMult : 1.0;

            if (skillToCast === 'Q') {
              useSkillQ(mouseWorldRef.current.x, mouseWorldRef.current.y);
              let qCd = p.skill1MaxCooldown * cdMult;
              if (p.archetype === Archetype.VORGAR && p.vorgarRTimer && p.vorgarRTimer > 0) qCd *= 0.5;
              p.skill1Timer = qCd;
            } else if (skillToCast === 'E') {
              useSkillW(mouseWorldRef.current.x, mouseWorldRef.current.y);
              p.skill2Timer = p.skill2MaxCooldown * cdMult;
            } else if (skillToCast === 'R') {
              useSkillR(mouseWorldRef.current.x, mouseWorldRef.current.y);
              p.skill3Timer = p.skill3MaxCooldown * cdMult;
            }
            return;
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {activeVillageModal === 'GUILD' && (
        <GuildModal
          key={`guild-${modalRefreshKey}`}
          isOpen={true}
          currentArchetype={archetype}
          saveData={saveData}
          onSelectHunter={(chosenArchetype) => {
            handleSelectArchetype(chosenArchetype);
            applyRunes(false);
          }}
          onClose={() => {
            setActiveVillageModal(null);
            applyRunes(false);
          }}
          onStartRun={() => {
            setActiveVillageModal(null);
            handleAscendToTower();
          }}
        />
      )}

      {activeVillageModal === 'SANCTUARY' && (
        <TalentTreeModal
          key={`sanctuary-${modalRefreshKey}`}
          player={playerRef.current}
          onClose={() => {
            setActiveVillageModal(null);
            applyRunes(false);
          }}
          onSelectArchetype={handleSelectArchetype}
        />
      )}

      {activeVillageModal === 'VAULT' && (
        <VaultModal
          saveData={saveData}
          onClose={() => {
            setActiveVillageModal(null);
            applyRunes(false);
          }}
        />
      )}

      {activeVillageModal === 'FORGE' && (
        <ForgeModal
          saveData={saveData}
          playerArchetype={playerRef.current.archetype}
          onClose={() => {
            setActiveVillageModal(null);
            applyRunes(false);
          }}
          onRefreshPlayerStats={() => {
            applyRunes(false);
          }}
        />
      )}

      {/* LOW HP HEARTBEAT TENSION VIGNETTE */}
      {gameStateRef.current === GameState.TOWER && (hudData.hp / Math.max(1, hudData.maxHp)) < 0.25 && hudData.hp > 0 && (
        <div className="absolute inset-0 z-30 pointer-events-none border-8 border-rose-600/40 shadow-[inset_0_0_90px_rgba(225,29,72,0.65)] animate-pulse" />
      )}

      {/* NÉVOA DA CORRUPÇÃO ATMOSPHERIC OVERLAY */}
      {gameStateRef.current === GameState.TOWER && corruptionMistActiveRef.current && (
        <div className="absolute inset-0 z-30 pointer-events-none bg-purple-950/20 shadow-[inset_0_0_120px_rgba(147,51,234,0.55)] animate-pulse" />
      )}

      {/* REST ROOM PROXIMITY ACTION PROMPT */}
      {isRestRoomRef.current && nearbyRestAction && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto animate-in fade-in zoom-in duration-200">
          <button
            onClick={() => {
              if (nearbyRestAction === 'CAMPFIRE') {
                const campfire = hazardsRef.current.find(h => h.id === 'rest_campfire');
                if (campfire && !campfire.used) {
                  campfire.used = true;
                  const p = playerRef.current;
                  const healAmt = Math.round(p.stats.maxHp * 0.80);
                  p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + healAmt);
                  audioManager.playCampfireRestSfx();
                  LightweightParticleManager.spawnImpact({
                    x: p.x, y: p.y, z: 25, color: '#10b981', count: 30, type: 'HEAL'
                  });
                  hazardToastRef.current = { text: '🔥 FOGUEIRA ANCESTRAL: +80% DE VIDA RESTAURADA!', timer: 3.5, maxTimer: 3.5 };
                }
              } else if (nearbyRestAction === 'VILA_PORTAL') {
                handleLeaveTower();
              } else if (nearbyRestAction === 'TOWER_PORTAL') {
                handleAscendFromRest();
              }
            }}
            className="bg-slate-950/85 border border-emerald-400 px-6 py-3 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.35)] flex items-center gap-3 text-white backdrop-blur-xl hover:scale-105 transition-all cursor-pointer font-mono text-xs"
          >
            <span className="bg-emerald-400 text-slate-950 px-2 py-0.5 font-black rounded-full text-[10px]">ESPAÇO</span>
            <span className="font-bold text-white uppercase tracking-wider">
              {nearbyRestAction === 'CAMPFIRE' && '🔥 Fogueira Ancestral (Descansar e Recuperar +80% HP)'}
              {nearbyRestAction === 'VILA_PORTAL' && '🏡 Portal da Vila (Retornar com 100% dos Cristais)'}
              {nearbyRestAction === 'TOWER_PORTAL' && '⚡ Portal da Ascensão (Subir para o Próximo Andar)'}
            </span>
          </button>
        </div>
      )}

      {/* TOWER EXIT PORTAL / BIFURCATION CHOICE OVERLAY */}
      {gameStateRef.current === GameState.TOWER && portalActiveRef.current && isNearPortal && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-cyan-400 p-6 rounded-2xl shadow-[0_0_40px_rgba(6,182,212,0.3)] flex flex-col items-center gap-4 z-50 pointer-events-auto backdrop-blur-md max-w-xl w-[92vw] animate-fade-in font-mono">
          <style>{`
            @keyframes chest-wobble {
              0%, 100% { transform: rotate(0deg) scale(1); }
              15% { transform: rotate(-8deg) scale(1.08); }
              30% { transform: rotate(6deg) scale(1.08); }
              45% { transform: rotate(-6deg) scale(1.08); }
              60% { transform: rotate(4deg) scale(1.08); }
              75% { transform: rotate(-4deg) scale(1.08); }
              90% { transform: rotate(2deg) scale(1.08); }
            }
            .animate-chest-wobble {
              animation: chest-wobble 0.5s ease-in-out infinite;
            }
            @keyframes chest-glorious {
              0%, 100% { filter: drop-shadow(0 0 15px rgba(245, 158, 11, 0.3)); }
              50% { filter: drop-shadow(0 0 35px rgba(245, 158, 11, 0.75)); }
            }
            .animate-chest-glorious {
              animation: chest-glorious 1.5s ease-in-out infinite;
            }
            @keyframes card-reveal {
              0% { transform: scale(0.8) translateY(20px); opacity: 0; }
              100% { transform: scale(1) translateY(0); opacity: 1; }
            }
            .animate-card-reveal {
              animation: card-reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>

          {relicChestState === 'CLOSED' && (
            <div className="flex flex-col items-center text-center p-2 w-full animate-fade-in">
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 mb-2">
                <Crown className="w-5 h-5 text-amber-400 animate-pulse" />
              </div>
              <h3 className="text-base font-black uppercase text-amber-400 tracking-wider">
                Caixa de Recompensas de Vitória!
              </h3>
              <p className="text-[11px] text-slate-400 max-w-md mt-1 mb-4 leading-relaxed">
                Você conquistou a Região {floorRef.current}. Uma antiga relíquia ressoa no interior deste cofre celestial...
              </p>

              {/* Big pulsating glowing chest */}
              <div className="w-28 h-28 flex items-center justify-center bg-slate-900/60 rounded-full border border-amber-500/20 relative animate-chest-glorious mb-5">
                <span className="text-6xl select-none animate-bounce" style={{ animationDuration: '2s' }}>🎁</span>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
              </div>

              <button
                onClick={() => {
                  setRelicChestState('OPENING');
                  audioManager.playLevelUpSfx();
                  setTimeout(() => {
                    setRelicChestState('REVEALED');
                  }, 1200);
                }}
                className="w-full sm:w-auto px-10 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider text-xs rounded-xl shadow-lg shadow-amber-500/15 hover:shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 animate-pulse" />
                Abrir Caixa de Recompensas
              </button>
            </div>
          )}

          {relicChestState === 'OPENING' && (
            <div className="flex flex-col items-center text-center py-8 w-full">
              <div className="w-28 h-28 flex items-center justify-center bg-slate-900/40 rounded-full border border-amber-500/40 relative animate-chest-wobble mb-5">
                <span className="text-6xl select-none">🎁</span>
              </div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400 animate-pulse">
                Canalizando Essência de Purificação...
              </h4>
              <p className="text-[10px] text-slate-400 mt-1">Sintonizando o Cofre de Relíquias da Vila</p>
            </div>
          )}

          {relicChestState === 'REVEALED' && rolledLootItem && (
            <div className="flex flex-col items-center text-center w-full animate-card-reveal max-w-4xl">
              <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-3">
                <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                Tesouros Descobertos!
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-4">
                {/* RELIC CARD */}
                <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl text-left relative overflow-hidden flex flex-col justify-between">
                  <div className={`absolute -right-12 -top-12 w-24 h-24 rounded-full blur-2xl opacity-20 ${
                    rolledLootItem.rarity === 'LENDARIO' ? 'bg-amber-500' :
                    rolledLootItem.rarity === 'EPICO' ? 'bg-purple-500' :
                    rolledLootItem.rarity === 'RARO' ? 'bg-cyan-500' :
                    rolledLootItem.rarity === 'INCOMUM' ? 'bg-emerald-500' : 'bg-slate-500'
                  }`} />

                  <div>
                    <div className="flex items-start gap-3.5">
                      <div className={`w-14 h-14 shrink-0 rounded-xl flex items-center justify-center text-3xl border-2 bg-slate-950/40 ${
                        rolledLootItem.rarity === 'LENDARIO' ? 'border-amber-500 text-amber-400 bg-amber-500/5' :
                        rolledLootItem.rarity === 'EPICO' ? 'border-purple-500 text-purple-400 bg-purple-500/5' :
                        rolledLootItem.rarity === 'RARO' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' :
                        rolledLootItem.rarity === 'INCOMUM' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' :
                        'border-slate-500 text-slate-400 bg-slate-500/5'
                      }`}>
                        {rolledLootItem.icon}
                      </div>
                      <div>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 border border-white/10 ${
                          rolledLootItem.rarity === 'LENDARIO' ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
                          rolledLootItem.rarity === 'EPICO' ? 'text-purple-400 border-purple-500/20 bg-purple-500/10' :
                          rolledLootItem.rarity === 'RARO' ? 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10' :
                          rolledLootItem.rarity === 'INCOMUM' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
                          'text-slate-400'
                        }`}>
                          Relíquia • {rolledLootItem.rarity}
                        </span>
                        <h4 className="text-slate-100 font-black text-sm mt-1.5 uppercase tracking-wide">
                          {rolledLootItem.name}
                        </h4>
                        <p className="text-[9px] text-slate-400 uppercase mt-0.5">Origem: Região {rolledLootItem.regionNumber} • {rolledLootItem.biome}</p>
                      </div>
                    </div>
                    
                    <p className="text-[11px] text-slate-300 italic mt-3 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40 leading-relaxed">
                      "{rolledLootItem.description}"
                    </p>
                  </div>

                  <div className="mt-3 bg-amber-500/5 border border-amber-500/15 p-2.5 rounded-lg flex flex-col gap-0.5 text-[10px]">
                    <span className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Efeito Latente Permanente
                    </span>
                    <span className="text-slate-200">{rolledLootItem.statsDesc}</span>
                  </div>
                </div>

                {/* EQUIPMENT CARD */}
                {rolledEquipmentItem && (
                  <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl text-left relative overflow-hidden flex flex-col justify-between">
                    <div className={`absolute -right-12 -top-12 w-24 h-24 rounded-full blur-2xl opacity-20 ${
                      rolledEquipmentItem.rarity === 'LEGENDARY' ? 'bg-amber-500' :
                      rolledEquipmentItem.rarity === 'RARE' ? 'bg-cyan-500' :
                      rolledEquipmentItem.rarity === 'UNCOMMON' ? 'bg-emerald-500' : 'bg-slate-500'
                    }`} />

                    <div>
                      <div className="flex items-start gap-3.5">
                        <div className={`w-14 h-14 shrink-0 rounded-xl flex items-center justify-center text-3xl border-2 bg-slate-950/40 ${
                          rolledEquipmentItem.rarity === 'LEGENDARY' ? 'border-amber-500 text-amber-400 bg-amber-500/5' :
                          rolledEquipmentItem.rarity === 'RARE' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' :
                          rolledEquipmentItem.rarity === 'UNCOMMON' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' :
                          'border-slate-500 text-slate-400 bg-slate-500/5'
                        }`}>
                          {rolledEquipmentItem.slot === 'WEAPON' ? '⚔️' :
                           rolledEquipmentItem.slot === 'CHEST' ? '🛡️' :
                           rolledEquipmentItem.slot === 'RING' ? '💍' : '📿'}
                        </div>
                        <div>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 border border-white/10 ${
                            rolledEquipmentItem.rarity === 'LEGENDARY' ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
                            rolledEquipmentItem.rarity === 'RARE' ? 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10' :
                            rolledEquipmentItem.rarity === 'UNCOMMON' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
                            'text-slate-400'
                          }`}>
                            Equipamento • {
                              rolledEquipmentItem.rarity === 'LEGENDARY' ? 'Lendário' :
                              rolledEquipmentItem.rarity === 'RARE' ? 'Raro' :
                              rolledEquipmentItem.rarity === 'UNCOMMON' ? 'Incomum' : 'Comum'
                            }
                          </span>
                          <h4 className="text-slate-100 font-black text-sm mt-1.5 uppercase tracking-wide">
                            {rolledEquipmentItem.name} {rolledEquipmentItem.level > 0 ? `+${rolledEquipmentItem.level}` : ''}
                          </h4>
                          <p className="text-[9px] text-slate-400 uppercase mt-0.5">
                            {rolledEquipmentItem.slot === 'WEAPON' ? 'Arma Principal' :
                             rolledEquipmentItem.slot === 'CHEST' ? 'Armadura Corporal' :
                             rolledEquipmentItem.slot === 'RING' ? 'Anel do Pacto' : 'Amuleto Relíquia'}
                            {rolledEquipmentItem.hunterClass && ` • Exclusivo de: ${rolledEquipmentItem.hunterClass}`}
                          </p>
                        </div>
                      </div>

                      {rolledEquipmentItem.lore && (
                        <p className="text-[11px] text-slate-300 italic mt-3 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40 leading-relaxed">
                          "{rolledEquipmentItem.lore}"
                        </p>
                      )}
                    </div>

                    <div className="mt-3 bg-slate-950/50 border border-slate-800/80 p-2.5 rounded-lg flex flex-col gap-1 text-[10px] font-mono">
                      <span className="text-slate-300 font-bold uppercase tracking-wider mb-1">
                        Atributos Fornecidos:
                      </span>
                      {Object.entries(rolledEquipmentItem.stats).map(([k, v]) => {
                        if (typeof v !== 'number') return null;
                        const isPercent = ['critChance', 'critDamage', 'omnivamp', 'summonPower', 'skillRadiusMult', 'atkSpeed'].includes(k);
                        const label = k === 'maxHp' ? 'Vida Máx' :
                                      k === 'ad' ? 'Dano (AD)' :
                                      k === 'ap' ? 'Poder Mag (AP)' :
                                      k === 'armor' ? 'Armadura' :
                                      k === 'mr' ? 'Resistência Mag' :
                                      k === 'moveSpeed' ? 'Velocidade' :
                                      k === 'atkSpeed' ? 'Vel. Ataque' :
                                      k === 'omnivamp' ? 'Vampirismo' :
                                      k === 'critChance' ? 'Chance Crítica' :
                                      k === 'critDamage' ? 'Dano Crítico' :
                                      k === 'summonPower' ? 'Poder de Evocação' :
                                      k === 'skillRadiusMult' ? 'Área Hab.' : k;
                        const valStr = isPercent ? `+${(v * 100).toFixed(0)}%` : `+${v.toFixed(0)}`;
                        return (
                          <div key={k} className="flex justify-between text-slate-400">
                            <span>{label}:</span>
                            <span className="text-emerald-400 font-bold">{valStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-4 animate-pulse">
                ✓ Relíquia e Equipamento salvos permanentemente
              </div>

              {/* Standard progression buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm mx-auto">
                <button
                  onClick={handleConcludeRegion}
                  className="p-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer flex flex-col items-center gap-1"
                >
                  <span>Avançar para o Mapa de Regiões</span>
                  <span className="text-[10px] font-semibold opacity-90">+20% Bônus Cristais (Desbloquear Novos Caminhos)</span>
                </button>

                <button
                  onClick={handleLeaveTower}
                  className="p-3.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-400 text-emerald-300 font-bold uppercase tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer flex flex-col items-center gap-1"
                >
                  <span>Retornar à Vila</span>
                  <span className="text-[10px] font-semibold text-emerald-200">Salvar 100% dos Cristais no Cofre</span>
                </button>
              </div>
            </div>
          )}

          {relicChestState === 'NONE' && (
            <div className="flex flex-col items-center text-center w-full animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
                <span className="text-xs uppercase font-mono tracking-widest text-cyan-400 font-bold">
                  Portal Dimensional Revelado
                </span>
              </div>

              <h3 className="text-xl font-black uppercase text-white tracking-wider text-center mt-2">
                Região {floorRef.current} Concluída!
              </h3>

              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono bg-white/5 px-4 py-2 rounded-xl border border-white/10 w-full text-center mt-2 mb-4">
                <span className="text-cyan-300 font-bold">💎 Cristais Acumulados: +{playerRef.current.crystals || 0}</span>
                <span className="text-amber-300 font-bold">⚡ Bônus Atual: +{Math.round((climbBonusMultRef.current - 1) * 100)}% Cristais</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <button
                  onClick={handleConcludeRegion}
                  className="p-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer flex flex-col items-center gap-1"
                >
                  <span>Avançar para o Mapa de Regiões</span>
                  <span className="text-[10px] font-semibold opacity-90">+20% Bônus Cristais (Desbloquear Novos Caminhos)</span>
                </button>

                <button
                  onClick={handleLeaveTower}
                  className="p-3.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-400 text-emerald-300 font-bold uppercase tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer flex flex-col items-center gap-1"
                >
                  <span>Retornar à Vila</span>
                  <span className="text-[10px] font-semibold text-emerald-200">Salvar 100% dos Cristais no Cofre</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOP RIGHT GLOBAL AUDIO CONTROL WIDGET */}
      <div className="absolute top-4 right-5 z-50 pointer-events-auto">
        <AudioControlWidget />
      </div>

      {/* DEDICATED BOSS LOOT DRAFT REWARD MODAL (DRAFT 1 OF 3 / CRYSTAL CACHE) */}
      <LootRewardModal
        isOpen={isLootRewardModalOpen}
        floor={floorRef.current}
        bossName={activeLootDraft?.bossName || 'Crystal Golias'}
        isFirstVictory={saveData.regionClears?.[floorRef.current] === 0 || !saveData.concludedRegions?.includes(floorRef.current)}
        draft={activeLootDraft}
        saveData={saveData}
        playerClass={archetype}
        onSelectReward={handleSelectLootReward}
        onCollectCrystals={handleCollectLootCrystals}
        onProceedToMap={handleProceedToMapFromLoot}
        onReturnToVila={handleReturnToVilaFromLoot}
      />

      {/* IN-GAME COMBAT HUD */}
      {gameStateRef.current === GameState.TOWER && (
        <div className="absolute inset-0 z-40 pointer-events-none font-sans">

          {/* Top Left: Clean Health Bar (Minimalist Square Border) */}
          <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-auto bg-transparent border border-white/20 p-2.5 rounded-xl backdrop-blur-md shadow-lg">
            {/* Square Character Avatar Container */}
            <div className="w-10 h-10 bg-black/40 border border-white/25 rounded-lg flex items-center justify-center text-xl shrink-0 text-cyan-300 font-black">
              {hudData.hunter?.icon || '🐸'}
            </div>

            <div className="flex flex-col gap-1 min-w-[150px]">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-md bg-black/40 border border-white/20 text-emerald-400 font-black text-[10px]">
                  LVL {hudData.level}
                </span>
                {hudData.shield > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 font-black flex items-center gap-1">
                    🛡️ {Math.ceil(hudData.shield)}
                  </span>
                )}
              </div>

              {/* Main HP Bar */}
              <div className="w-full h-3.5 bg-slate-900/80 border border-white/20 rounded-lg overflow-hidden relative shadow-md">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, (hudData.hp / hudData.maxHp) * 100))}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {Math.ceil(hudData.hp)} / {hudData.maxHp}
                </div>
              </div>

              {/* In-Run XP Progress Bar */}
              <div className="w-full h-1.5 bg-slate-950/90 border border-white/10 rounded-full overflow-hidden relative mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (hudData.xp / Math.max(1, hudData.xpToNextLevel)) * 100))}%` }}
                />
              </div>

              {/* Active Run Blessings Rack */}
              {activeRunBlessingsRef.current.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {activeRunBlessingsRef.current.map((blessing, bIdx) => (
                    <span 
                      key={bIdx}
                      className="w-5 h-5 rounded-md bg-slate-900/90 border border-white/20 flex items-center justify-center text-[10px] shadow-sm"
                      title={`${blessing.name}: ${blessing.description}`}
                    >
                      {blessing.icon}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Right: Mana Crystals ONLY (Minimalist Square Border) */}
          <div className="absolute top-4 right-4 flex items-center gap-3 pointer-events-auto">
            <div className="bg-transparent border border-white/20 px-3.5 py-2 rounded-xl backdrop-blur-md shadow-lg flex items-center gap-2 text-cyan-300 font-bold font-mono text-sm tracking-wide">
              <span className="text-base">💎</span>
              <span>{hudData.manaCrystals ?? saveData.permanentManaCrystals}</span>
            </div>
          </div>

          {/* Top Center: Current Floor Pill, Global Timer & Instability Tracker */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-auto">
            <div className="bg-transparent border border-white/20 px-4 py-2 rounded-xl backdrop-blur-md shadow-lg flex items-center gap-3 text-xs font-mono font-bold tracking-wide text-white">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {isRestRoomRef.current 
                    ? 'CÂMARA DE DESCANSO' 
                    : (() => {
                        const activeFloor = FLOOR_CONFIGS[floorRef.current - 1] || FLOOR_CONFIGS[0];
                        const activePhase = activeFloor?.phases?.[phaseRef.current as 1 | 2 | 3];
                        const phaseName = activePhase ? activePhase.name.toUpperCase() : (phaseRef.current === 1 ? 'HORDA' : (phaseRef.current === 2 ? 'ELITE' : 'CHEFÃO'));
                        return `REGIÃO ${floorRef.current} • ${phaseName} (${phaseRef.current}/3)`;
                      })()}
                </span>
              </div>
              <div className="w-px h-3 bg-white/20" />
              <div className="flex items-center gap-1 text-cyan-300">
                <span>⏱️</span>
                <span>
                  {Math.floor((hudData.floorCombatTime || 0) / 60).toString().padStart(2, '0')}:
                  {Math.floor((hudData.floorCombatTime || 0) % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Floor 1 Instability Stage Pill */}
            {floorRef.current === 1 && hudData.floorInstability && (
              <div 
                className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border backdrop-blur-md shadow-lg flex items-center gap-1.5"
                style={{
                  backgroundColor: `transparent`,
                  borderColor: `${hudData.floorInstability.color}88`,
                  color: hudData.floorInstability.color
                }}
              >
                <span>ESTÁGIO {hudData.floorInstability.stage}: {hudData.floorInstability.name}</span>
              </div>
            )}

            {/* Floor 6 Frostbite / Warmth Meter */}
            {floorRef.current === 6 && (
              <div className="flex items-center gap-2 bg-slate-950/80 border border-sky-400/60 px-3 py-1 rounded-xl backdrop-blur-md shadow-md">
                <span className="text-[11px]">❄️</span>
                <div className="flex flex-col gap-0.5 min-w-[120px]">
                  <div className="flex justify-between items-center text-[9px] font-mono font-bold">
                    <span className={hudData.frostWarmth && hudData.frostWarmth > 0 ? "text-amber-300 animate-pulse" : "text-sky-300"}>
                      {hudData.frostWarmth && hudData.frostWarmth > 0 ? `♨ AQUECIDO (${Math.ceil(hudData.frostWarmth)}s)` : "FRIO EXTREMO"}
                    </span>
                    <span className="text-sky-200">{Math.round(hudData.frostbite || 0)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-sky-900">
                    <div 
                      className={`h-full transition-all duration-150 ${
                        (hudData.frostbite || 0) > 75 ? "bg-rose-500 animate-pulse" :
                        (hudData.frostbite || 0) > 40 ? "bg-sky-400" : "bg-sky-200"
                      }`}
                      style={{ width: `${Math.min(100, hudData.frostbite || 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Floor Anomaly Toast Banner */}
          {hudData.activeAnomaly && anomalyToastTimerRef.current > 0 && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/60 border border-amber-400/50 rounded-2xl px-4 py-2 flex flex-col items-center gap-0.5 pointer-events-none z-50 text-center max-w-lg w-full font-sans select-none drop-shadow-lg">
              <div className="flex items-center gap-2 text-amber-400 font-black tracking-wider text-xs uppercase">
                <span>{hudData.activeAnomaly.icon}</span>
                <span>{hudData.activeAnomaly.name} ATIVADO</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-4 text-[10px] text-zinc-200 font-semibold">
                <span className="text-emerald-400 font-bold">⚡ Bônus: <span className="font-normal text-zinc-200">{hudData.activeAnomaly.buffText}</span></span>
                <span className="text-rose-400 font-bold">⚠️ Perigo: <span className="font-normal text-zinc-200">{hudData.activeAnomaly.hazardText}</span></span>
              </div>
            </div>
          )}

          {/* Top Thin XP Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/40">
            <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${(hudData.xp / hudData.xpToNextLevel) * 100}%` }} />
          </div>

          {/* Boss Health Bar (Bottom Center) */}
          {hudData.bossHp > 0 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[480px] max-w-[92vw] pointer-events-auto">
              <div className="bg-slate-950/90 border-2 border-white p-2.5 rounded-2xl backdrop-blur-md shadow-2xl text-center flex flex-col gap-1.5 font-sans">
                {/* Boss Name Header & Phase Indicators */}
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      {hudData.bossType === 'BOSS_CRYSTAL_GOLIAS' ? 'Arkhon, o Golias de Cristal' :
                       hudData.bossType === 'BOSS_CORRUPTED_LEVIATHAN' ? 'Zhaerith, o Leviatã Corrompido' :
                       hudData.bossType === 'BOSS_FORGE_DRAGON' ? 'Ignis, o Dragão da Forja' :
                       hudData.bossType === 'BOSS_ARTILLERY_WARLORD' ? 'Kalthor, o Senhor da Guerra' :
                       hudData.bossType === 'BOSS_THUNDER_PHARAOH' ? 'Ramessés, o Faraó do Trovão' :
                       hudData.bossType === 'BOSS_YETI_OVERLORD' ? 'Ymir, o Colosso do Zero Absoluto' :
                       hudData.bossType === 'BOSS_PRIME_COLOSSUS' ? 'Colosso Primordial' :
                       hudData.bossType === 'BOSS_NIGHT_REAPER' ? 'Mors\'thar, o Ceifador Noturno' :
                       hudData.bossType === 'BOSS_CELESTIAL_EMPEROR' ? 'Aurelius, o Imperador Celestial' :
                       hudData.bossType === 'BOSS_VOID_SOVEREIGN' ? 'Mal\'Gharok, o Soberano do Vazio' : 'Chefe Ancestral'}
                    </span>
                    {hudData.bossMechanicsStatus && (
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wide border animate-pulse ${
                        hudData.bossIsStaggered 
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.5)]' 
                          : 'bg-emerald-950 border-emerald-400 text-emerald-300'
                      }`}>
                        {hudData.bossMechanicsStatus}
                      </span>
                    )}
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border whitespace-nowrap ${
                    hudData.bossPhase === 4 ? 'bg-emerald-900 border-emerald-400 text-emerald-200 animate-pulse' :
                    hudData.bossPhase === 3 ? 'bg-amber-950 border-amber-400 text-amber-300' :
                    hudData.bossPhase === 2 ? 'bg-cyan-950 border-cyan-400 text-cyan-300' :
                    'bg-slate-900 border-white/30 text-white'
                  }`}>
                    {hudData.bossPhase >= 4 ? 'FASE 4 - FÚRIA' : hudData.bossPhase === 3 ? 'FASE 3 - CAOS' : hudData.bossPhase === 2 ? 'FASE 2 - ENFURECIDO' : 'FASE 1'}
                  </div>
                </div>

                {/* HP Progress Bar with Solid Red Fill & Border */}
                <div className="relative h-5 rounded-xl border-2 border-white bg-slate-900 overflow-hidden">
                  <div 
                    className="h-full bg-[#ff4757] transition-all duration-200"
                    style={{ width: `${Math.max(0, Math.min(100, (hudData.bossHp / hudData.bossMaxHp) * 100))}%` }} 
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow-md">
                    {Math.ceil(hudData.bossHp)} / {hudData.bossMaxHp}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prismatic Overload Indicator (Floor 7) */}
          {hudData.prismaticCharged && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-purple-950/90 border-2 border-purple-400 text-purple-200 text-xs font-black shadow-[0_0_25px_rgba(168,85,247,0.7)] animate-pulse flex items-center gap-2 pointer-events-none z-30">
              <span>⚡ SOBRECARGA PRISMÁTICA: {Math.max(0, hudData.prismaticChargeTimer).toFixed(1)}s</span>
              <span className="text-[10px] text-amber-300 font-bold">(+200% DANO NOS PILARES)</span>
            </div>
          )}

          {/* Bottom Skill Dock - Centered & Minimalist Square Framed */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none bg-black/20 border border-white/15 p-2 rounded-2xl backdrop-blur-md shadow-2xl">
            {/* Action Dash Button with [ESP] Tag */}
            <div className="relative group">
              <div
                className={`relative w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all border ${
                  hudData.dashCd > 0 
                    ? 'bg-black/40 border-white/10 text-white/30' 
                    : 'bg-black/30 border-white/20 text-white'
                }`}
              >
                <span className="text-xl">💨</span>
                {hudData.dashCd > 0 && (
                  <div className="absolute inset-0 bg-black/85 rounded-xl flex items-center justify-center z-20">
                    <span className="text-emerald-400 text-xs font-black">{Math.ceil(hudData.dashCd)}</span>
                  </div>
                )}
              </div>
              <span className="absolute -top-2 -left-2 bg-black/80 border border-white/20 text-[9px] font-black px-1.5 py-0.5 rounded text-white shadow">
                ESP
              </span>
            </div>

            {/* Skill Q */}
            <div 
              className="relative group pointer-events-auto cursor-pointer"
              onClick={() => {
                if (hudData.qCd <= 0) {
                  aimingSkillRef.current = aimingSkillRef.current === 'Q' ? null : 'Q';
                }
              }}
            >
              <div
                className={`relative w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all border ${
                  aimingSkillRef.current === 'Q'
                    ? 'bg-purple-900/80 border-purple-400 text-purple-200 animate-pulse shadow-[0_0_20px_rgba(168,85,247,0.6)]'
                    : (hudData.qCd > 0 
                      ? 'bg-black/40 border-white/10 text-white/30' 
                      : 'bg-black/30 border-white/20 text-white')
                }`}
              >
                <span className="text-xl">{hudData.hunter?.skill1?.icon || '🎯'}</span>
                {hudData.qCd > 0 && (
                  <div className="absolute inset-0 bg-black/85 rounded-xl flex items-center justify-center z-20">
                    <span className="text-emerald-400 text-xs font-black">{Math.ceil(hudData.qCd)}</span>
                  </div>
                )}
              </div>
              <span className="absolute -top-2 -left-2 bg-black/80 border border-white/20 text-[9px] font-black px-1.5 py-0.5 rounded text-white shadow">
                Q
              </span>
            </div>

            {/* Skill E */}
            <div 
              className="relative group pointer-events-auto cursor-pointer"
              onClick={() => {
                if (hudData.wCd <= 0) {
                  aimingSkillRef.current = aimingSkillRef.current === 'E' ? null : 'E';
                }
              }}
            >
              <div
                className={`relative w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all border ${
                  aimingSkillRef.current === 'E'
                    ? 'bg-cyan-900/80 border-cyan-400 text-cyan-200 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.6)]'
                    : (hudData.wCd > 0 
                      ? 'bg-black/40 border-white/10 text-white/30' 
                      : 'bg-black/30 border-white/20 text-white')
                }`}
              >
                <span className="text-xl">{hudData.hunter?.skill2?.icon || '⚡'}</span>
                {hudData.wCd > 0 && (
                  <div className="absolute inset-0 bg-black/85 rounded-xl flex items-center justify-center z-20">
                    <span className="text-emerald-400 text-xs font-black">{Math.ceil(hudData.wCd)}</span>
                  </div>
                )}
              </div>
              <span className="absolute -top-2 -left-2 bg-black/80 border border-white/20 text-[9px] font-black px-1.5 py-0.5 rounded text-white shadow">
                E
              </span>
            </div>

            {/* Skill R (Ultimate) */}
            <div 
              className="relative group pointer-events-auto cursor-pointer"
              onClick={() => {
                if (hudData.rCd <= 0) {
                  const p = playerRef.current;
                  const mutator = (gameStateRef.current === GameState.TOWER && floorRef.current > 0) ? currentAnomalyRef.current : null;
                  const cdMult = (mutator && mutator.skillCooldownMult !== undefined) ? mutator.skillCooldownMult : 1.0;
                  if (p.archetype === Archetype.MAGE) {
                    aimingSkillRef.current = aimingSkillRef.current === 'R' ? null : 'R';
                  } else {
                    useSkillR();
                    p.skill3Timer = p.skill3MaxCooldown * cdMult;
                    aimingSkillRef.current = null;
                  }
                }
              }}
            >
              <div
                className={`relative w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all border ${
                  aimingSkillRef.current === 'R'
                    ? 'bg-amber-900/80 border-amber-400 text-amber-200 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.6)]'
                    : (hudData.rCd > 0 
                      ? 'bg-black/40 border-white/10 text-white/30' 
                      : 'bg-red-950/40 border-red-500/50 text-red-200 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]')
                }`}
              >
                <span className="text-xl">
                  {hudData.hunter?.id === 'VORGAR' ? '🌋' : (hudData.hunter?.id === 'ARCHER' ? '🌑' : (hudData.hunter?.id === 'MAGE' ? '☄️' : '💀'))}
                </span>
                {hudData.rCd > 0 && (
                  <div className="absolute inset-0 bg-black/85 rounded-xl flex items-center justify-center z-20">
                    <span className="text-emerald-400 text-xs font-black">{Math.ceil(hudData.rCd)}</span>
                  </div>
                )}
              </div>
              <span className="absolute -top-2 -left-2 bg-red-950 border border-red-500/50 text-[9px] font-black px-1.5 py-0.5 rounded text-red-300 shadow">
                R
              </span>
            </div>

            {/* Passive Skill Badge */}
            {hudData.hunter?.passive && (
              <div className="relative group pointer-events-auto cursor-help" title={`${hudData.hunter.passive.name}: ${hudData.hunter.passive.description}`}>
                <div
                  className={`relative w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all border ${
                    (hudData.passiveActiveTimer || 0) > 0
                      ? 'bg-emerald-900/90 border-emerald-400 text-emerald-200 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.8)]'
                      : ((hudData.passiveCd || 0) > 0
                        ? 'bg-black/50 border-white/10 text-white/30'
                        : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300')
                  }`}
                >
                  <span className="text-lg">{hudData.hunter.passive.icon || '🛡️'}</span>
                  {(hudData.passiveCd || 0) > 0 && (hudData.passiveActiveTimer || 0) <= 0 && (
                    <div className="absolute inset-0 bg-black/85 rounded-xl flex items-center justify-center z-20">
                      <span className="text-emerald-400 text-[10px] font-black">{Math.ceil(hudData.passiveCd)}s</span>
                    </div>
                  )}
                </div>
                <span className="absolute -top-2 -left-2 bg-emerald-950 border border-emerald-400 text-[8px] font-black px-1 rounded text-emerald-300 shadow uppercase">
                  PAS
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VILLAGE OVERLAY (VILA DOS ECOS) */}
      {(gameStateRef.current === GameState.FLOOR_0 || gameStateRef.current === GameState.VILA) && !activeVillageModal && (
        <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between p-4">
          {/* Top Center Minimalist Translucent Status Pill */}
          <div className="flex justify-center items-center pointer-events-auto">
            <div className="bg-slate-950/50 border border-white/15 px-5 py-2 rounded-full backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex items-center gap-4 text-xs font-mono text-white/90">
              <div className="flex items-center gap-2 font-black text-emerald-400 uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                <span>Vila dos Ecos</span>
              </div>

              <div className="w-px h-3.5 bg-white/15" />

              <div className="flex items-center gap-1.5 font-bold text-cyan-300 uppercase tracking-wide">
                <span>{HUNTERS[playerRef.current.archetype]?.icon || '🏹'}</span>
                <span>{HUNTERS[playerRef.current.archetype]?.name?.split(',')[0] || playerRef.current.archetype}</span>
              </div>

              <div className="w-px h-3.5 bg-white/15" />

              <div className="flex items-center gap-1.5 font-bold text-cyan-300" title="Cristais de Mana Permanentes">
                <span className="text-cyan-400">💎</span>
                <span>{saveData.permanentManaCrystals} Cristais</span>
              </div>

              <div className="w-px h-3.5 bg-white/15" />

              <div className="text-[10px] text-white/50 uppercase font-semibold">
                [WASD] Mover • [ESPAÇO] Interagir
              </div>
            </div>
          </div>

          {/* Bottom Center Proximity Interaction Prompt */}
          {nearbyStructure && (
            <div className="self-center pointer-events-auto animate-in fade-in zoom-in duration-200 mb-4">
              <button
                onClick={() => {
                  if (nearbyStructure === 'GUILD') {
                    setActiveVillageModal('GUILD');
                  } else if (nearbyStructure === 'PORTAL') {
                    handleAscendToTower();
                  }
                }}
                className="bg-slate-950/60 border border-cyan-400/60 hover:border-cyan-300 px-6 py-2.5 rounded-full shadow-[0_0_25px_rgba(6,182,212,0.25)] flex items-center gap-3 text-white backdrop-blur-xl hover:scale-105 transition-all cursor-pointer font-mono text-xs group"
              >
                <span className="bg-cyan-400 text-slate-950 px-2 py-0.5 font-black rounded-full text-[10px] group-hover:bg-cyan-300">ESPAÇO</span>
                <span className="font-bold text-white uppercase tracking-wider">
                  {nearbyStructure === 'GUILD' && 'Guilda dos Caçadores (Trocar Caçador & Arsenal)'}
                  {nearbyStructure === 'PORTAL' && 'Portal da Ascensão (Entrar na Torre)'}
                </span>
              </button>
            </div>
          )}

          {/* Bottom Right Discreet Glass Action Dock */}
          <div className="absolute bottom-5 right-5 flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => {
                setActiveVillageModal('GUILD');
              }}
              className="w-10 h-10 rounded-full bg-slate-950/50 border border-white/15 hover:border-cyan-400/80 hover:bg-slate-900/70 text-white flex items-center justify-center text-base transition-all backdrop-blur-xl shadow-lg hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-pointer"
              title="Guilda dos Caçadores"
            >
              🛡️
            </button>
            <button
              onClick={() => {
                setActiveVillageModal('FORGE');
              }}
              className="w-10 h-10 rounded-full bg-slate-950/50 border border-white/15 hover:border-amber-400/80 hover:bg-slate-900/70 text-white flex items-center justify-center text-base transition-all backdrop-blur-xl shadow-lg hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer"
              title="Forja e Inventário"
            >
              🔨
            </button>
            <button
              onClick={handleAscendToTower}
              className="w-10 h-10 rounded-full bg-purple-950/50 border border-purple-500/60 hover:border-purple-400 text-purple-200 flex items-center justify-center text-base transition-all backdrop-blur-xl shadow-lg hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-105 cursor-pointer"
              title="Ascender à Torre"
            >
              ⚡
            </button>
          </div>
        </div>
      )}
      {/* FLOOR ANOMALY DETAILS MODAL */}
      {showAnomalyInfoModal && hudData.activeAnomaly && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-slate-950 border border-amber-500/50 rounded-2xl max-w-sm w-full p-6 flex flex-col gap-4 text-center shadow-2xl relative">
            <button
              onClick={() => setShowAnomalyInfoModal(false)}
              className="absolute top-3 right-3 text-white/50 hover:text-white font-mono text-sm cursor-pointer"
            >
              ✕
            </button>
            <div className="text-4xl mx-auto">{hudData.activeAnomaly.icon}</div>
            <div>
              <div className="text-xs uppercase font-mono tracking-widest text-amber-400 font-bold">
                Anomalia do Andar {floorRef.current}
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-wider font-mono">
                {hudData.activeAnomaly.name}
              </h3>
            </div>
            <p className="text-xs font-mono text-white/70 bg-white/5 p-3 rounded-xl border border-white/10">
              {hudData.activeAnomaly.description}
            </p>
            <div className="flex flex-col gap-2 font-mono text-left text-xs">
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                <span className="font-bold uppercase block text-[10px] text-emerald-400 mb-0.5">⚡ Efeito Positivo:</span>
                {hudData.activeAnomaly.buffText}
              </div>
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300">
                <span className="font-bold uppercase block text-[10px] text-rose-400 mb-0.5">⚠️ Efeito Negativo:</span>
                {hudData.activeAnomaly.hazardText}
              </div>
            </div>
            <button
              onClick={() => setShowAnomalyInfoModal(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono uppercase text-xs rounded-xl shadow-lg transition-all cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameCanvas;
