import { Biome, MapHazard } from './types';

export interface MapPillar {
  id: string;
  x: number;
  y: number;
  radius: number;
  height: number;
  color?: string;
  topColor?: string;
  runeColor?: string;
}

export interface MapRectChamber {
  type: 'RECT';
  x: number; // Center X
  y: number; // Center Y
  w: number; // Width
  h: number; // Height
}

export interface MapCircleChamber {
  type: 'CIRCLE';
  x: number; // Center X
  y: number; // Center Y
  radius: number;
}

export interface MapBridge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface FloorMapLayout {
  floorNumber: number;
  name: string;
  title: string;
  chambers: (MapRectChamber | MapCircleChamber)[];
  bridges: MapBridge[];
  pillars: MapPillar[];
  hazards: MapHazard[];
  spawnRadiusMin: number;
  spawnRadiusMax: number;
}

// Helper to test if a 2D world point is on a bridge segment
export function isPointOnBridge(px: number, py: number, bridge: MapBridge, margin = 0): boolean {
  const { x1, y1, x2, y2, width } = bridge;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1) <= (width / 2 + margin);

  // Projection scalar t on line segment
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
  const halfW = width / 2 + margin;
  return distSq <= halfW * halfW;
}

// Check if a point is inside the walkable floor geometry
export function isPointWalkable(px: number, py: number, map: FloorMapLayout, margin = 0): boolean {
  // 1. Check chambers
  const chLen = map.chambers.length;
  for (let i = 0; i < chLen; i++) {
    const ch = map.chambers[i];
    if (ch.type === 'CIRCLE') {
      const r = ch.radius + margin;
      const dSq = (px - ch.x) * (px - ch.x) + (py - ch.y) * (py - ch.y);
      if (dSq <= r * r) return true;
    } else if (ch.type === 'RECT') {
      const halfW = ch.w / 2 + margin;
      const halfH = ch.h / 2 + margin;
      if (
        px >= ch.x - halfW &&
        px <= ch.x + halfW &&
        py >= ch.y - halfH &&
        py <= ch.y + halfH
      ) {
        return true;
      }
    }
  }

  // 2. Check bridges
  const brLen = map.bridges.length;
  for (let i = 0; i < brLen; i++) {
    if (isPointOnBridge(px, py, map.bridges[i], margin)) return true;
  }

  return false;
}

// Check collision with solid pillars
export function getCollidingPillar(
  px: number,
  py: number,
  entityRadius: number,
  map: FloorMapLayout
): MapPillar | null {
  const pList = map.pillars;
  const pLen = pList.length;
  for (let i = 0; i < pLen; i++) {
    const pillar = pList[i];
    const dx = px - pillar.x;
    const dy = py - pillar.y;
    const minDist = pillar.radius + entityRadius;
    if (dx * dx + dy * dy < minDist * minDist) {
      return pillar;
    }
  }
  return null;
}

// Smooth movement resolution against map boundaries and pillars
export function resolveMovement(
  currX: number,
  currY: number,
  targetX: number,
  targetY: number,
  radius: number,
  map: FloorMapLayout,
  isFlying = false
): { x: number; y: number } {
  // Flying entities ignore void holes but stay within map bounding sphere
  if (isFlying) {
    const isNearby = isPointWalkable(targetX, targetY, map, 140);
    const destX = isNearby ? targetX : currX;
    const destY = isNearby ? targetY : currY;
    const pillar = getCollidingPillar(destX, destY, radius, map);
    if (!pillar) return { x: destX, y: destY };
    const dx = destX - pillar.x;
    const dy = destY - pillar.y;
    const dist = Math.hypot(dx, dy) || 1;
    const pushDist = pillar.radius + radius + 0.5;
    return {
      x: pillar.x + (dx / dist) * pushDist,
      y: pillar.y + (dy / dist) * pushDist
    };
  }

  const wallMargin = Math.max(-10, -radius + 4);

  // 1. Direct movement
  if (isPointWalkable(targetX, targetY, map, wallMargin)) {
    const pillar = getCollidingPillar(targetX, targetY, radius, map);
    if (!pillar) {
      return { x: targetX, y: targetY };
    }
    // Slide around pillar
    const dx = targetX - pillar.x;
    const dy = targetY - pillar.y;
    const dist = Math.hypot(dx, dy) || 1;
    const pushDist = pillar.radius + radius + 1;
    const slideX = pillar.x + (dx / dist) * pushDist;
    const slideY = pillar.y + (dy / dist) * pushDist;
    if (isPointWalkable(slideX, slideY, map, wallMargin)) {
      return { x: slideX, y: slideY };
    }
  }

  // 2. Horizontal slide
  if (isPointWalkable(targetX, currY, map, wallMargin)) {
    const pillar = getCollidingPillar(targetX, currY, radius, map);
    if (!pillar) return { x: targetX, y: currY };
  }

  // 3. Vertical slide
  if (isPointWalkable(currX, targetY, map, wallMargin)) {
    const pillar = getCollidingPillar(currX, targetY, radius, map);
    if (!pillar) return { x: currX, y: targetY };
  }

  // 4. Void recovery failsafe
  if (!isPointWalkable(currX, currY, map, 0)) {
    let bestDist = Infinity;
    let targetChamber = map.chambers[0];
    const cLen = map.chambers.length;
    for (let i = 0; i < cLen; i++) {
      const c = map.chambers[i];
      const d = Math.hypot(currX - c.x, currY - c.y);
      if (d < bestDist) {
        bestDist = d;
        targetChamber = c;
      }
    }
    if (targetChamber) {
      const d = Math.hypot(targetChamber.x - currX, targetChamber.y - currY) || 1;
      return {
        x: currX + ((targetChamber.x - currX) / d) * 20,
        y: currY + ((targetChamber.y - currY) / d) * 20
      };
    }
  }

  return { x: currX, y: currY };
}

/**
 * Enhanced smooth pathing for Enemy AI using Whisker Raycasts and Grid Navigation.
 * Prevents teleportation, oscillation, and getting stuck on pillars.
 */
export function resolveEnemySmoothPath(
  currX: number,
  currY: number,
  destX: number,
  destY: number,
  speed: number,
  dt: number,
  radius: number,
  map: FloorMapLayout,
  isFlying = false
): { x: number; y: number } {
  if (isFlying) {
    const dx = destX - currX;
    const dy = destY - currY;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(dist, speed * dt);
    const nextX = currX + (dx / dist) * step;
    const nextY = currY + (dy / dist) * step;
    return resolveMovement(currX, currY, nextX, nextY, radius, map, true);
  }

  const dx = destX - currX;
  const dy = destY - currY;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return { x: currX, y: currY };

  const desiredAngle = Math.atan2(dy, dx);
  const step = Math.min(dist, speed * dt);
  const wallMargin = Math.max(-10, -radius + 4);

  // Whisker test angles (0 = straight, followed by left/right fan)
  const angleOffsets = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.5, -1.5];

  for (let i = 0; i < angleOffsets.length; i++) {
    const testAngle = desiredAngle + angleOffsets[i];
    const testNextX = currX + Math.cos(testAngle) * step;
    const testNextY = currY + Math.sin(testAngle) * step;

    // Check if step point is walkable and free from pillars
    if (isPointWalkable(testNextX, testNextY, map, wallMargin)) {
      const pillar = getCollidingPillar(testNextX, testNextY, radius, map);
      if (!pillar) {
        return { x: testNextX, y: testNextY };
      }
    }
  }

  // Fallback to standard resolveMovement if all whiskers are obstructed
  const fallbackX = currX + Math.cos(desiredAngle) * step;
  const fallbackY = currY + Math.sin(desiredAngle) * step;
  return resolveMovement(currX, currY, fallbackX, fallbackY, radius, map, false);
}

// Find safe walkable spawn point on a map avoiding pillars
export function getSafeSpawnPoint(map: FloorMapLayout, entityRadius = 15): { x: number; y: number } {
  const mainChamber = map.chambers[0];
  if (mainChamber) {
    const testPillar = getCollidingPillar(mainChamber.x, mainChamber.y, entityRadius, map);
    if (!testPillar && isPointWalkable(mainChamber.x, mainChamber.y, map, -entityRadius + 4)) {
      return { x: mainChamber.x, y: mainChamber.y };
    }
    
    for (let r = 50; r <= 300; r += 40) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const sx = mainChamber.x + Math.cos(a) * r;
        const sy = mainChamber.y + Math.sin(a) * r;
        if (isPointWalkable(sx, sy, map, -entityRadius + 4) && !getCollidingPillar(sx, sy, entityRadius, map)) {
          return { x: sx, y: sy };
        }
      }
    }
  }

  return { x: 0, y: 0 };
}

// ----------------------------------------------------
// ARCHITECTURAL FLOOR MAPS CONFIGURATION (EXPANDED & UNIQUE)
// ----------------------------------------------------

export const FLOOR_1_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 1,
  name: 'Floresta de Cristal - Câmara dos Pilares (Fase 1)',
  title: 'ENTRANCE CHAMBER & ANCIENT PILLARS',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 500 },          // Central Main Chamber (+15% scale)
    { type: 'CIRCLE', x: 0, y: -480, radius: 280 },       // North Terrace
    { type: 'CIRCLE', x: 0, y: 480, radius: 280 },        // South Entrance Hall
    { type: 'CIRCLE', x: -480, y: 0, radius: 260 },       // West Alcove
    { type: 'CIRCLE', x: 480, y: 0, radius: 260 },        // East Alcove
  ],
  bridges: [
    { x1: 0, y1: -220, x2: 0, y2: -480, width: 160 },
    { x1: 0, y1: 220, x2: 0, y2: 480, width: 160 },
    { x1: -220, y1: 0, x2: -480, y2: 0, width: 160 },
    { x1: 220, y1: 0, x2: 480, y2: 0, width: 160 },
  ],
  pillars: [
    { id: 'f1p1_p1', x: -200, y: -200, radius: 34, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p1_p2', x: 200, y: -200, radius: 34, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p1_p3', x: -200, y: 200, radius: 34, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p1_p4', x: 200, y: 200, radius: 34, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
  ],
  hazards: [
    {
      id: 'f1p1_pil1',
      type: 'BREAKABLE_PILLAR',
      x: -120,
      y: -120,
      radius: 160,
      name: 'Pilar de Quartzo Instável',
      description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos próximos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 100,
      maxHp: 100
    },
    {
      id: 'f1p1_pil2',
      type: 'BREAKABLE_PILLAR',
      x: 120,
      y: -120,
      radius: 160,
      name: 'Pilar de Quartzo Instável',
      description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos próximos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 100,
      maxHp: 100
    },
    {
      id: 'f1p1_pil3',
      type: 'BREAKABLE_PILLAR',
      x: 0,
      y: 160,
      radius: 160,
      name: 'Pilar de Quartzo Instável',
      description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos próximos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 100,
      maxHp: 100
    },
    {
      id: 'f1p1_acid1',
      type: 'ACID_POOL',
      x: 0,
      y: 340,
      radius: 85,
      name: 'Poça de Lodo Ácido',
      description: 'Lodo corrosivo abissal que desacelera e causa dano de ácido',
      stateTimer: 999999,
      maxTimer: 999999,
      isActive: true,
      damage: 12,
      fuseTimer: 0
    }
  ],
  spawnRadiusMin: 350,
  spawnRadiusMax: 600
};

export const FLOOR_1_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 1,
  name: 'Floresta de Cristal - Núcleo Rúnico (Fase 2)',
  title: 'RUNIC CRYSTAL CORE',
  chambers: [
    { type: 'CIRCLE', x: -360, y: 0, radius: 460 },        // West Crystal Processing Chamber (+15%)
    { type: 'CIRCLE', x: 360, y: 0, radius: 460 },         // East Runic Sanctuary Chamber (+15%)
    { type: 'CIRCLE', x: 0, y: -460, radius: 280 },        // North Overlook
    { type: 'CIRCLE', x: 0, y: 460, radius: 280 },         // South Overlook
  ],
  bridges: [
    { x1: -180, y1: 0, x2: 180, y2: 0, width: 220 },       // Wide Central Connecting Bridge
    { x1: -280, y1: -200, x2: 0, y2: -460, width: 140 },
    { x1: 280, y1: -200, x2: 0, y2: -460, width: 140 },
    { x1: -280, y1: 200, x2: 0, y2: 460, width: 140 },
    { x1: 280, y1: 200, x2: 0, y2: 460, width: 140 },
  ],
  pillars: [
    { id: 'f1p2_p1', x: -360, y: -160, radius: 30, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p2_p2', x: -360, y: 160, radius: 30, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p2_p3', x: 360, y: -160, radius: 30, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p2_p4', x: 360, y: 160, radius: 30, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
  ],
  hazards: [
    {
      id: 'f1p2_bar1',
      type: 'EXPLODING_BARREL',
      x: -360,
      y: 200,
      radius: 180,
      name: 'Barril de Explosivos Rúnico',
      description: 'Detona uma enorme explosão em área queimando e repelindo inimigos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 40,
      maxHp: 40
    },
    {
      id: 'f1p2_bar2',
      type: 'EXPLODING_BARREL',
      x: 360,
      y: -200,
      radius: 180,
      name: 'Barril de Explosivos Rúnico',
      description: 'Detona uma enorme explosão em área queimando e repelindo inimigos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 40,
      maxHp: 40
    },
    {
      id: 'f1p2_bar3',
      type: 'EXPLODING_BARREL',
      x: 0,
      y: -420,
      radius: 180,
      name: 'Barril de Explosivos Rúnico',
      description: 'Detona uma enorme explosão em área queimando e repelindo inimigos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 40,
      maxHp: 40
    },
    {
      id: 'f1p2_shrine',
      type: 'SACRIFICE_SHRINE',
      x: 360,
      y: 0,
      radius: 70,
      name: 'Altar do Sacrifício Rúnico',
      description: 'Aperte [ESPAÇO] perto do altar para trocar 20% de Vida por +25% de Dano na rodada',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      used: false
    }
  ],
  spawnRadiusMin: 350,
  spawnRadiusMax: 650
};

export const FLOOR_1_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 1,
  name: 'Floresta de Cristal - Altar do Golias (Fase 3 - Chefe)',
  title: 'GOLIATH\'S ANCIENT ALTAR',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 620 },          // Grand Boss Arena (+15%)
    { type: 'CIRCLE', x: 0, y: -580, radius: 220 },       // Ritual Overlook Balcony
  ],
  bridges: [
    { x1: 0, y1: -300, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f1p3_p1', x: -440, y: 0, radius: 28, height: 120, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    { id: 'f1p3_p2', x: 440, y: 0, radius: 28, height: 120, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
  ],
  hazards: [
    {
      id: 'f1p3_res1',
      type: 'RESONANT_PILLAR',
      x: -280,
      y: -280,
      radius: 65,
      name: 'Pilar Ressonante Sintonizado (Norte-Oeste)',
      description: 'Emite pulso de energia. Destrua os pilares para remover o escudo de invencibilidade do Golias',
      stateTimer: 8.0,
      maxTimer: 8.0,
      isActive: true,
      hp: 120,
      maxHp: 120
    },
    {
      id: 'f1p3_res2',
      type: 'RESONANT_PILLAR',
      x: 280,
      y: -280,
      radius: 65,
      name: 'Pilar Ressonante Sintonizado (Norte-Leste)',
      description: 'Emite pulso de energia. Destrua os pilares para remover o escudo de invencibilidade do Golias',
      stateTimer: 8.0,
      maxTimer: 8.0,
      isActive: true,
      hp: 120,
      maxHp: 120
    },
    {
      id: 'f1p3_res3',
      type: 'RESONANT_PILLAR',
      x: -280,
      y: 280,
      radius: 65,
      name: 'Pilar Ressonante Sintonizado (Sul-Oeste)',
      description: 'Emite pulso de energia. Destrua os pilares para remover o escudo de invencibilidade do Golias',
      stateTimer: 8.0,
      maxTimer: 8.0,
      isActive: true,
      hp: 120,
      maxHp: 120
    },
    {
      id: 'f1p3_res4',
      type: 'RESONANT_PILLAR',
      x: 280,
      y: 280,
      radius: 65,
      name: 'Pilar Ressonante Sintonizado (Sul-Leste)',
      description: 'Emite pulso de energia. Destrua os pilares para remover o escudo de invencibilidade do Golias',
      stateTimer: 8.0,
      maxTimer: 8.0,
      isActive: true,
      hp: 120,
      maxHp: 120
    }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

export const FLOOR_2_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 2,
  name: 'Pântano dos Sussurros - Margens Nebulosas (Fase 1)',
  title: 'MISTY MARSHLANDS & ROOT PATHS',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 480 },          // Central Mire Islet
    { type: 'CIRCLE', x: -460, y: -260, radius: 260 },   // NW Spore Mound
    { type: 'CIRCLE', x: 460, y: -260, radius: 260 },    // NE Slime Basin
    { type: 'CIRCLE', x: -400, y: 360, radius: 240 },    // SW Bog Haven
    { type: 'CIRCLE', x: 400, y: 360, radius: 240 },     // SE Toxic Marsh
  ],
  bridges: [
    { x1: -180, y1: -70, x2: -360, y2: -180, width: 140 },
    { x1: 180, y1: -70, x2: 360, y2: -180, width: 140 },
    { x1: -160, y1: 180, x2: -320, y2: 290, width: 140 },
    { x1: 160, y1: 180, x2: 320, y2: 290, width: 140 },
  ],
  pillars: [
    { id: 'f2p1_r1', x: -160, y: -80, radius: 30, height: 115, color: '#3b0764', topColor: '#c084fc', runeColor: '#e879f9' },
    { id: 'f2p1_r2', x: 160, y: -80, radius: 30, height: 115, color: '#3b0764', topColor: '#c084fc', runeColor: '#e879f9' },
    { id: 'f2p1_r3', x: 0, y: 160, radius: 34, height: 120, color: '#3b0764', topColor: '#c084fc', runeColor: '#e879f9' },
  ],
  hazards: [
    {
      id: 'f2p1_geys1',
      type: 'TOXIC_GEYSER',
      x: -260,
      y: -115,
      radius: 65,
      name: 'Gêiser de Bile Corrosiva',
      description: 'Cospe nuvens de ácido tóxico que reduzem armadura e desaceleram.',
      stateTimer: 2.0,
      maxTimer: 4.0,
      isActive: false
    },
    {
      id: 'f2p1_geys2',
      type: 'TOXIC_GEYSER',
      x: 260,
      y: -115,
      radius: 65,
      name: 'Gêiser de Bile Corrosiva',
      description: 'Cospe nuvens de ácido tóxico que reduzem armadura e desaceleram.',
      stateTimer: 3.5,
      maxTimer: 4.0,
      isActive: false
    },
    {
      id: 'f2p1_acid1',
      type: 'ACID_POOL',
      x: -120,
      y: 120,
      radius: 85,
      name: 'Poça de Lodo Ácido',
      description: 'Causa dano corrosivo contínuo e lentidão extrema de 50%.',
      stateTimer: 99999,
      maxTimer: 99999,
      isActive: true,
      damage: 14
    },
    {
      id: 'f2p1_acid2',
      type: 'ACID_POOL',
      x: 120,
      y: 120,
      radius: 85,
      name: 'Poça de Lodo Ácido',
      description: 'Causa dano corrosivo contínuo e lentidão extrema de 50%.',
      stateTimer: 99999,
      maxTimer: 99999,
      isActive: true,
      damage: 14
    },
    {
      id: 'f2p1_bar1',
      type: 'EXPLODING_BARREL',
      x: -400,
      y: 360,
      radius: 180,
      name: 'Barril de Esporos Instáveis',
      description: 'Detona uma explosão de esporos venenosos em área',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 40,
      maxHp: 40
    },
    {
      id: 'f2p1_pil1',
      type: 'BREAKABLE_PILLAR',
      x: 0,
      y: -220,
      radius: 160,
      name: 'Pilar de Pedra Antiga do Pântano',
      description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 100,
      maxHp: 100
    }
  ],
  spawnRadiusMin: 480,
  spawnRadiusMax: 820
};

export const FLOOR_2_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 2,
  name: 'Pântano dos Sussurros - Lagoa de Lodo Abissal (Fase 2)',
  title: 'ABYSSAL SLIME LAGOON & ROOT BRIDGES',
  chambers: [
    { type: 'CIRCLE', x: -380, y: -280, radius: 310 },   // NW Islet
    { type: 'CIRCLE', x: 380, y: -280, radius: 310 },    // NE Islet
    { type: 'CIRCLE', x: -380, y: 280, radius: 310 },    // SW Islet
    { type: 'CIRCLE', x: 380, y: 280, radius: 310 },     // SE Islet
    { type: 'CIRCLE', x: 0, y: -520, radius: 230 },      // North Sacrifice Terrace
  ],
  bridges: [
    { x1: -220, y1: -280, x2: 220, y2: -280, width: 140 }, // North Cross Bridge
    { x1: -220, y1: 280, x2: 220, y2: 280, width: 140 },   // South Cross Bridge
    { x1: -380, y1: -120, x2: -380, y2: 120, width: 140 }, // West Connecting Bridge
    { x1: 380, y1: -120, x2: 380, y2: 120, width: 140 },   // East Connecting Bridge
    { x1: -200, y1: -280, x2: 0, y2: -520, width: 120 },   // Path to Sacrifice
    { x1: 200, y1: -280, x2: 0, y2: -520, width: 120 },    // Path to Sacrifice
  ],
  pillars: [
    { id: 'f2p2_r1', x: -380, y: -280, radius: 32, height: 120, color: '#3b0764', topColor: '#a855f7', runeColor: '#e879f9' },
    { id: 'f2p2_r2', x: 380, y: -280, radius: 32, height: 120, color: '#3b0764', topColor: '#a855f7', runeColor: '#e879f9' },
    { id: 'f2p2_r3', x: -380, y: 280, radius: 32, height: 120, color: '#3b0764', topColor: '#a855f7', runeColor: '#e879f9' },
    { id: 'f2p2_r4', x: 380, y: 280, radius: 32, height: 120, color: '#3b0764', topColor: '#a855f7', runeColor: '#e879f9' },
  ],
  hazards: [
    {
      id: 'f2p2_acid1',
      type: 'ACID_POOL',
      x: 0,
      y: -280,
      radius: 95,
      name: 'Poça de Lodo Ácido',
      description: 'Causa dano corrosivo contínuo e lentidão extrema de 50%.',
      stateTimer: 99999,
      maxTimer: 99999,
      isActive: true,
      damage: 16
    },
    {
      id: 'f2p2_acid2',
      type: 'ACID_POOL',
      x: 0,
      y: 280,
      radius: 95,
      name: 'Poça de Lodo Ácido',
      description: 'Causa dano corrosivo contínuo e lentidão extrema de 50%.',
      stateTimer: 99999,
      maxTimer: 99999,
      isActive: true,
      damage: 16
    },
    {
      id: 'f2p2_hnd1',
      type: 'GRAVEYARD_HANDS',
      x: -380,
      y: 0,
      radius: 75,
      name: 'Mãos dos Mortos-Vivos',
      description: 'Mãos arcanas que reduzem a velocidade em 50% e drenam vida.',
      stateTimer: 2.5,
      maxTimer: 4.5,
      isActive: false
    },
    {
      id: 'f2p2_hnd2',
      type: 'GRAVEYARD_HANDS',
      x: 380,
      y: 0,
      radius: 75,
      name: 'Mãos dos Mortos-Vivos',
      description: 'Mãos arcanas que reduzem a velocidade em 50% e drenam vida.',
      stateTimer: 4.0,
      maxTimer: 4.5,
      isActive: false
    },
    {
      id: 'f2p2_shr1',
      type: 'SACRIFICE_SHRINE',
      x: 0,
      y: -520,
      radius: 50,
      name: 'Altar de Sangue do Pântano',
      description: 'Sacrifique 20 HP para ganhar +25% Vel. Ataque e +15% Movimento',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      used: false
    },
    {
      id: 'f2p2_bar1',
      type: 'EXPLODING_BARREL',
      x: -380,
      y: 280,
      radius: 180,
      name: 'Barril de Esporos Instáveis',
      description: 'Detona uma explosão de esporos venenosos em área',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 40,
      maxHp: 40
    },
    {
      id: 'f2p2_bar2',
      type: 'EXPLODING_BARREL',
      x: 380,
      y: 280,
      radius: 180,
      name: 'Barril de Esporos Instáveis',
      description: 'Detona uma explosão de esporos venenosos em área',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 40,
      maxHp: 40
    }
  ],
  spawnRadiusMin: 500,
  spawnRadiusMax: 850
};

export const FLOOR_2_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 2,
  name: 'Pântano dos Sussurros - Covil do Leviatã (Fase 3 - Chefe)',
  title: 'LEVIATHAN\'S CORRUPTED LAIR',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },          // Grand Submerged Arena
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },       // North Overlook Balcony
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f2p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#022c22', topColor: '#a855f7', runeColor: '#e879f9' },
    { id: 'f2p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#022c22', topColor: '#a855f7', runeColor: '#e879f9' },
    { id: 'f2p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#022c22', topColor: '#a855f7', runeColor: '#e879f9' },
    { id: 'f2p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#022c22', topColor: '#a855f7', runeColor: '#e879f9' },
  ],
  hazards: [
    {
      id: 'f2p3_tot1',
      type: 'RESONANT_PILLAR',
      x: -240,
      y: -240,
      radius: 170,
      name: 'Totem de Esporos Ácidos',
      description: 'Emite névoa tóxica e concede escudo de invulnerabilidade ao Leviatã Corrompido. Destrua os 4 totens!',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 120,
      maxHp: 120
    },
    {
      id: 'f2p3_tot2',
      type: 'RESONANT_PILLAR',
      x: 240,
      y: -240,
      radius: 170,
      name: 'Totem de Esporos Ácidos',
      description: 'Emite névoa tóxica e concede escudo de invulnerabilidade ao Leviatã Corrompido. Destrua os 4 totens!',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 120,
      maxHp: 120
    },
    {
      id: 'f2p3_tot3',
      type: 'RESONANT_PILLAR',
      x: -240,
      y: 240,
      radius: 170,
      name: 'Totem de Esporos Ácidos',
      description: 'Emite névoa tóxica e concede escudo de invulnerabilidade ao Leviatã Corrompido. Destrua os 4 totens!',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 120,
      maxHp: 120
    },
    {
      id: 'f2p3_tot4',
      type: 'RESONANT_PILLAR',
      x: 240,
      y: 240,
      radius: 170,
      name: 'Totem de Esporos Ácidos',
      description: 'Emite névoa tóxica e concede escudo de invulnerabilidade ao Leviatã Corrompido. Destrua os 4 totens!',
      stateTimer: 0,
      maxTimer: 0,
      isActive: true,
      hp: 120,
      maxHp: 120
    }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

export const FLOOR_MAPS: Record<number, FloorMapLayout> = {
  // FLOOR 0: VILA DOS ECOS / THE VOID SANCTUARY (INTERACTIVE HUB)
  0: {
    floorNumber: 0,
    name: 'Vila dos Ecos',
    title: 'THE HALLOWED REFUGE',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 460 },        // Praça Central (Main Plaza)
      { type: 'CIRCLE', x: 0, y: -440, radius: 160 },     // Portal de Ascensão (Tower Portal)
      { type: 'CIRCLE', x: -380, y: -140, radius: 150 },  // Guilda dos Caçadores (Guild)
      { type: 'CIRCLE', x: 380, y: -140, radius: 150 },   // Santuário dos Ecos (Talent Sanctuary)
    ],
    bridges: [
      { x1: 0, y1: -200, x2: 0, y2: -440, width: 140 },
      { x1: -180, y1: -70, x2: -380, y2: -140, width: 120 },
      { x1: 180, y1: -70, x2: 380, y2: -140, width: 120 },
    ],
    pillars: [
      { id: 'hub_p1', x: -160, y: -160, radius: 28, height: 100, color: '#1e293b', topColor: '#38bdf8', runeColor: '#38bdf8' },
      { id: 'hub_p2', x: 160, y: -160, radius: 28, height: 100, color: '#1e293b', topColor: '#38bdf8', runeColor: '#38bdf8' },
      { id: 'hub_p3', x: -160, y: 160, radius: 28, height: 100, color: '#1e293b', topColor: '#38bdf8', runeColor: '#38bdf8' },
      { id: 'hub_p4', x: 160, y: 160, radius: 28, height: 100, color: '#1e293b', topColor: '#38bdf8', runeColor: '#38bdf8' },
      { id: 'hub_p_sanct1', x: 330, y: -200, radius: 18, height: 85, color: '#1e1b4b', topColor: '#c084fc', runeColor: '#a855f7' },
      { id: 'hub_p_sanct2', x: 430, y: -200, radius: 18, height: 85, color: '#1e1b4b', topColor: '#c084fc', runeColor: '#a855f7' },
    ],
    hazards: [
      {
        id: 'hub_bar1',
        type: 'EXPLODING_BARREL',
        x: -200,
        y: 200,
        radius: 180,
        name: 'Barril de Pólvora Explosiva',
        description: 'Atire ou aperte [ESPAÇO] para detonar uma explosão em área que queima e repele inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'hub_bar2',
        type: 'EXPLODING_BARREL',
        x: 200,
        y: 200,
        radius: 180,
        name: 'Barril de Pólvora Explosiva',
        description: 'Atire ou aperte [ESPAÇO] para detonar uma explosão em área que queima e repele inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'hub_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 0,
        y: 220,
        radius: 160,
        name: 'Pilar Rúnico Frágil',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar o pilar, causando dano massivo e atordoando inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 400,
    spawnRadiusMax: 600
  },

  // FLOOR 1: FLORESTA DE CRISTAL
  1: {
    floorNumber: 1,
    name: 'Floresta de Cristal',
    title: 'CRYSTAL FOREST',
    chambers: [
      // Natural central courtyard & winding plateau wings
      { type: 'CIRCLE', x: 0, y: 0, radius: 440 },
      { type: 'CIRCLE', x: -420, y: -260, radius: 250 }, // NW Sanctuary Wing
      { type: 'CIRCLE', x: 420, y: -260, radius: 250 },  // NE Runic Terrace
      { type: 'CIRCLE', x: -380, y: 320, radius: 230 },  // SW Overgrown Garden
      { type: 'CIRCLE', x: 380, y: 320, radius: 230 },   // SE Crystal Basin
      { type: 'CIRCLE', x: 0, y: -540, radius: 200 },    // North Altar Peak
    ],
    bridges: [
      // Multiple curved and wide connecting paths
      { x1: -180, y1: -120, x2: -360, y2: -220, width: 140 },
      { x1: 180, y1: -120, x2: 360, y2: -220, width: 140 },
      { x1: -160, y1: 160, x2: -320, y2: 260, width: 130 },
      { x1: 160, y1: 160, x2: 320, y2: 260, width: 130 },
      { x1: 0, y1: -280, x2: 0, y2: -480, width: 130 },
      { x1: -320, y1: -220, x2: -100, y2: -460, width: 100 }, // Perimeter shortcut
      { x1: 320, y1: -220, x2: 100, y2: -460, width: 100 },  // Perimeter shortcut
    ],
    pillars: [
      // Tactical cover pillars to hide behind from projectiles
      { id: 'f1_cov1', x: -160, y: -160, radius: 32, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
      { id: 'f1_cov2', x: 160, y: -160, radius: 32, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
      { id: 'f1_cov3', x: -160, y: 160, radius: 32, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
      { id: 'f1_cov4', x: 160, y: 160, radius: 32, height: 110, color: '#064e3b', topColor: '#34d399', runeColor: '#6ee7b7' },
    ],
    hazards: [
      // 2 Ancient Spike Traps
      {
        id: 'f1_spk1',
        type: 'SPIKE_TRAP',
        x: -20,
        y: 120,
        radius: 60,
        name: 'Espinhos de Cristal',
        description: 'Erompem do solo cristalino periodicamente',
        stateTimer: 2.0,
        maxTimer: 4.0,
        isActive: false
      },
      {
        id: 'f1_spk2',
        type: 'SPIKE_TRAP',
        x: 0,
        y: -140,
        radius: 60,
        name: 'Espinhos de Cristal',
        description: 'Erompem do solo cristalino periodicamente',
        stateTimer: 4.0,
        maxTimer: 4.0,
        isActive: false
      },
      // Exploding Barrels & Breakable Pillars
      {
        id: 'f1_bar1',
        type: 'EXPLODING_BARREL',
        x: -380,
        y: 320,
        radius: 180,
        name: 'Barril de Explosivos Rúnico',
        description: 'Detona uma enorme explosão em área queimando inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f1_bar2',
        type: 'EXPLODING_BARREL',
        x: 380,
        y: 320,
        radius: 180,
        name: 'Barril de Explosivos Rúnico',
        description: 'Detona uma enorme explosão em área queimando inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f1_pil1',
        type: 'BREAKABLE_PILLAR',
        x: -160,
        y: 160,
        radius: 160,
        name: 'Pilar de Quartzo Instável',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos próximos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      },
      {
        id: 'f1_pil2',
        type: 'BREAKABLE_PILLAR',
        x: 160,
        y: 160,
        radius: 160,
        name: 'Pilar de Quartzo Instável',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos próximos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 480,
    spawnRadiusMax: 820
  },

  // FLOOR 2: OS PÂNTANOS CORROMPIDOS DO VAZIO (TOXIC MIRE & SHIFTING ISLETS)
  2: {
    floorNumber: 2,
    name: 'Pântanos Corrompidos do Vazio',
    title: 'THE CORRUPTED ARCHIPELAGO',
    chambers: [
      // Archipelago of 5 irregular mire islands
      { type: 'CIRCLE', x: 0, y: 30, radius: 400 },        // Central Mire Islet
      { type: 'CIRCLE', x: -440, y: -200, radius: 240 },   // NW Spore Mound
      { type: 'CIRCLE', x: 440, y: -200, radius: 240 },    // NE Slime Pool
      { type: 'CIRCLE', x: -380, y: 360, radius: 220 },    // SW Bog Haven
      { type: 'CIRCLE', x: 380, y: 360, radius: 220 },     // SE Toxic Marsh
      { type: 'CIRCLE', x: 0, y: -480, radius: 210 },      // North Sacrifice Mound
    ],
    bridges: [
      // Curved root bridges with narrow choke points
      { x1: -180, y1: -70, x2: -340, y2: -160, width: 110 },
      { x1: 180, y1: -70, x2: 340, y2: -160, width: 110 },
      { x1: -160, y1: 180, x2: -300, y2: 290, width: 110 },
      { x1: 160, y1: 180, x2: 300, y2: 290, width: 110 },
      { x1: 0, y1: -220, x2: 0, y2: -400, width: 100 },
      { x1: -340, y1: -160, x2: -120, y2: -420, width: 90 }, // Narrow root bridge
      { x1: 340, y1: -160, x2: 120, y2: -420, width: 90 },   // Narrow root bridge
    ],
    pillars: [
      { id: 'f2_root1', x: -140, y: -60, radius: 30, height: 115, color: '#3b0764', topColor: '#c084fc', runeColor: '#e879f9' },
      { id: 'f2_root2', x: 140, y: -60, radius: 30, height: 115, color: '#3b0764', topColor: '#c084fc', runeColor: '#e879f9' },
      { id: 'f2_root3', x: 0, y: 150, radius: 34, height: 120, color: '#3b0764', topColor: '#c084fc', runeColor: '#e879f9' },
    ],
    hazards: [
      // 2 Toxic Geysers that spew acid mist on narrow bridges
      {
        id: 'f2_geys1',
        type: 'TOXIC_GEYSER',
        x: -260,
        y: -115,
        radius: 65,
        name: 'Gêiser de Bile Corrosiva',
        description: 'Cospe nuvens de ácido tóxico que reduzem armadura e desaceleram.',
        stateTimer: 2.0,
        maxTimer: 4.0,
        isActive: false
      },
      {
        id: 'f2_geys2',
        type: 'TOXIC_GEYSER',
        x: 260,
        y: -115,
        radius: 65,
        name: 'Gêiser de Bile Corrosiva',
        description: 'Cospe nuvens de ácido tóxico que reduzem armadura e desaceleram.',
        stateTimer: 3.5,
        maxTimer: 4.0,
        isActive: false
      },
      // 2 Graveyard Hands traps
      {
        id: 'f2_hnd1',
        type: 'GRAVEYARD_HANDS',
        x: -230,
        y: 235,
        radius: 70,
        name: 'Mãos dos Mortos-Vivos',
        description: 'Mãos arcanas que reduzem a velocidade em 50% e drenam vida.',
        stateTimer: 2.5,
        maxTimer: 4.5,
        isActive: false
      },
      {
        id: 'f2_hnd2',
        type: 'GRAVEYARD_HANDS',
        x: 230,
        y: 235,
        radius: 70,
        name: 'Mãos dos Mortos-Vivos',
        description: 'Mãos arcanas que reduzem a velocidade em 50% e drenam vida.',
        stateTimer: 4.0,
        maxTimer: 4.5,
        isActive: false
      },
      // 2 Persistent Acid Pools on Map Chokepoints
      {
        id: 'f2_acid1',
        type: 'ACID_POOL',
        x: -110,
        y: 80,
        radius: 85,
        name: 'Poça de Lodo Ácido',
        description: 'Causa dano corrosivo contínuo e lentidão extrema de 50%.',
        stateTimer: 99999,
        maxTimer: 99999,
        isActive: true,
        damage: 14
      },
      {
        id: 'f2_acid2',
        type: 'ACID_POOL',
        x: 110,
        y: 80,
        radius: 85,
        name: 'Poça de Lodo Ácido',
        description: 'Causa dano corrosivo contínuo e lentidão extrema de 50%.',
        stateTimer: 99999,
        maxTimer: 99999,
        isActive: true,
        damage: 14
      },
      // 1 Blood Sacrifice Shrine
      {
        id: 'f2_shr1',
        type: 'SACRIFICE_SHRINE',
        x: 0,
        y: -480,
        radius: 50,
        name: 'Altar de Sangue do Pântano',
        description: 'Sacrifique 20 HP para ganhar +25% Vel. Ataque e +15% Movimento',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        used: false
      },
      // Exploding Spore Barrels & Breakable Pillars
      {
        id: 'f2_bar1',
        type: 'EXPLODING_BARREL',
        x: -380,
        y: 360,
        radius: 180,
        name: 'Barril de Esporos Instáveis',
        description: 'Detona uma explosão de esporos venenosos em área',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f2_bar2',
        type: 'EXPLODING_BARREL',
        x: 380,
        y: 360,
        radius: 180,
        name: 'Barril de Esporos Instáveis',
        description: 'Detona uma explosão de esporos venenosos em área',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f2_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 0,
        y: 150,
        radius: 160,
        name: 'Pilar de Raízes Corrompidas',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 480,
    spawnRadiusMax: 840
  },

  // FLOOR 3: AS CAVERNAS DE OBSIDIANA & MAGMA (VOLCANIC CRAGS & MOLTEN CORE)
  3: {
    floorNumber: 3,
    name: 'Cavernas de Obsidiana & Magma',
    title: 'THE MOLTEN BASALT CRAGS',
    chambers: [
      // Basalt caldera ring surrounding central magma basin
      { type: 'CIRCLE', x: 0, y: 0, radius: 420 },        // Central Obsidian Hub
      { type: 'CIRCLE', x: -450, y: -250, radius: 240 },  // NW Basalt Crag
      { type: 'CIRCLE', x: 450, y: -250, radius: 240 },   // NE Basalt Crag
      { type: 'CIRCLE', x: -450, y: 250, radius: 240 },   // SW Ash Plateau
      { type: 'CIRCLE', x: 450, y: 250, radius: 240 },    // SE Ash Plateau
      { type: 'CIRCLE', x: 0, y: 480, radius: 200 },      // South Lava Fall
    ],
    bridges: [
      // Molten stone bridges over lava chasms
      { x1: -180, y1: -100, x2: -360, y2: -200, width: 120 },
      { x1: 180, y1: -100, x2: 360, y2: -200, width: 120 },
      { x1: -180, y1: 100, x2: -360, y2: 200, width: 120 },
      { x1: 180, y1: 100, x2: 360, y2: 200, width: 120 },
      { x1: 0, y1: 240, x2: 0, y2: 400, width: 130 },
      { x1: -360, y1: -200, x2: -360, y2: 200, width: 90 }, // Outer crescent loop
      { x1: 360, y1: -200, x2: 360, y2: 200, width: 90 },   // Outer crescent loop
    ],
    pillars: [
      { id: 'f3_obs1', x: -160, y: -140, radius: 34, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
      { id: 'f3_obs2', x: 160, y: -140, radius: 34, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
      { id: 'f3_obs3', x: -160, y: 140, radius: 34, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
      { id: 'f3_obs4', x: 160, y: 140, radius: 34, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
    ],
    hazards: [
      // 3 Magma Eruption Vents (damage enemies and player on eruption)
      {
        id: 'f3_vent1',
        type: 'MAGMA_VENT',
        x: -460,
        y: 200,
        radius: 65,
        name: 'Gêiser de Magma',
        description: 'Dispara projéteis de fogo e aplica Burning.',
        stateTimer: 2.0,
        maxTimer: 6.0,
        isActive: false
      },
      {
        id: 'f3_vent2',
        type: 'MAGMA_VENT',
        x: 460,
        y: 200,
        radius: 65,
        name: 'Gêiser de Magma',
        description: 'Dispara projéteis de fogo e aplica Burning.',
        stateTimer: 5.0,
        maxTimer: 6.0,
        isActive: false
      },
      {
        id: 'f3_vent3',
        type: 'MAGMA_VENT',
        x: 0,
        y: 480,
        radius: 65,
        name: 'Fenda de Erupção Magmática',
        description: 'Erompe lava incandescente causando 200 de dano em área',
        stateTimer: 1.0,
        maxTimer: 4.5,
        isActive: false
      },
      // 1 Molten Challenge Chest
      {
        id: 'f3_ch1',
        type: 'CHALLENGE_CHEST',
        x: 0,
        y: 0,
        radius: 50,
        name: 'Baú do Desafio das Chamas',
        description: 'Ative com [ESPAÇO] e sobreviva 15s para obter +10 Cristais e Grande XP',
        stateTimer: 0,
        maxTimer: 15.0,
        isActive: false,
        used: false,
        progress: 0
      },
      // Exploding Barrels & Breakable Pillars
      {
        id: 'f3_bar1',
        type: 'EXPLODING_BARREL',
        x: -450,
        y: 250,
        radius: 200,
        name: 'Barril Volátil de Magma',
        description: 'Explosão incandescente com alto dano de fogo',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f3_bar2',
        type: 'EXPLODING_BARREL',
        x: 450,
        y: 250,
        radius: 200,
        name: 'Barril Volátil de Magma',
        description: 'Explosão incandescente com alto dano de fogo',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f3_pil1',
        type: 'BREAKABLE_PILLAR',
        x: -160,
        y: -140,
        radius: 160,
        name: 'Pilar de Obsidiana Frágil',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar rocha vulcânica',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 480,
    spawnRadiusMax: 860
  },

  // FLOOR 4: O NINHO DOS CANHONEIROS / BASTIÃO DE FERRO
  4: {
    floorNumber: 4,
    name: 'Bastião dos Canhoneiros',
    title: 'THE FORTIFIED FORTRESS',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 500 },
      { type: 'CIRCLE', x: -520, y: 0, radius: 240 },
      { type: 'CIRCLE', x: 520, y: 0, radius: 240 },
      { type: 'CIRCLE', x: 0, y: -520, radius: 240 },
      { type: 'CIRCLE', x: 0, y: 520, radius: 240 },
    ],
    bridges: [
      { x1: -280, y1: 0, x2: -420, y2: 0, width: 130 },
      { x1: 280, y1: 0, x2: 420, y2: 0, width: 130 },
      { x1: 0, y1: -280, x2: 0, y2: -420, width: 130 },
      { x1: 0, y1: 280, x2: 0, y2: 420, width: 130 },
    ],
    pillars: [
      { id: 'f4_p1', x: -180, y: -180, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
      { id: 'f4_p2', x: 180, y: -180, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
      { id: 'f4_p3', x: -180, y: 180, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
      { id: 'f4_p4', x: 180, y: 180, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
    ],
    hazards: [
      {
        id: 'f4_bar1',
        type: 'EXPLODING_BARREL',
        x: -520,
        y: 0,
        radius: 190,
        name: 'Barril de Pólvora de Canhão',
        description: 'Explosão devastadora em área que estilhaça armaduras',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f4_bar2',
        type: 'EXPLODING_BARREL',
        x: 520,
        y: 0,
        radius: 190,
        name: 'Barril de Pólvora de Canhão',
        description: 'Explosão devastadora em área que estilhaça armaduras',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f4_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 0,
        y: 280,
        radius: 160,
        name: 'Coluna de Ferro Corrompido',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 550,
    spawnRadiusMax: 900
  },

  // FLOOR 5: O TEMPLO DOS ECOS ELÉTRICOS (DESERT / TESLA)
  5: {
    floorNumber: 5,
    name: 'Templo dos Ecos Elétricos',
    title: 'THE SUNKEN TESLA SANCTUARY',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 540 },
      { type: 'CIRCLE', x: -560, y: 0, radius: 260 },
      { type: 'CIRCLE', x: 560, y: 0, radius: 260 },
      { type: 'CIRCLE', x: 0, y: -560, radius: 240 },
    ],
    bridges: [
      { x1: -340, y1: 0, x2: -450, y2: 0, width: 150 },
      { x1: 340, y1: 0, x2: 450, y2: 0, width: 150 },
      { x1: 0, y1: -340, x2: 0, y2: -450, width: 140 },
    ],
    pillars: [
      { id: 'f5_p1', x: -200, y: -140, radius: 34, height: 140, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
      { id: 'f5_p2', x: 200, y: -140, radius: 34, height: 140, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
      { id: 'f5_p3', x: -200, y: 140, radius: 34, height: 140, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
      { id: 'f5_p4', x: 200, y: 140, radius: 34, height: 140, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
    ],
    hazards: [
      {
        id: 'f5_bar1',
        type: 'EXPLODING_BARREL',
        x: -560,
        y: 0,
        radius: 180,
        name: 'Capacitor Elétrico Incandescente',
        description: 'Detona rajada de plasma chocando e queimando alvos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f5_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 0,
        y: -200,
        radius: 160,
        name: 'Pilar Elétrico Sobregregado',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e eletrocutar/atordoar',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 550,
    spawnRadiusMax: 900
  },

  // FLOOR 6: A GEADA ETERNA (SNOW / ICE FLOES)
  6: {
    floorNumber: 6,
    name: 'Geleira da Geada Eterna',
    title: 'THE FROZEN ICE FLOES',
    chambers: [
      { type: 'CIRCLE', x: -300, y: -220, radius: 320 },
      { type: 'CIRCLE', x: 300, y: -220, radius: 320 },
      { type: 'CIRCLE', x: 0, y: 320, radius: 360 },
    ],
    bridges: [
      { x1: -120, y1: -220, x2: 120, y2: -220, width: 130 },
      { x1: -200, y1: -60, x2: -100, y2: 140, width: 120 },
      { x1: 200, y1: -60, x2: 100, y2: 140, width: 120 },
    ],
    pillars: [
      { id: 'f6_p1', x: -300, y: -140, radius: 36, height: 135, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
      { id: 'f6_p2', x: 300, y: -140, radius: 36, height: 135, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
      { id: 'f6_p3', x: 0, y: 220, radius: 38, height: 140, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
    ],
    hazards: [
      {
        id: 'f6_geyser_nw',
        type: 'THERMAL_GEYSER',
        x: -220,
        y: -220,
        radius: 70,
        name: 'Gêiser de Vapor Térmico',
        description: 'Fique sobre o vapor para dissipar o Congelamento e ganhar velocidade',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true
      },
      {
        id: 'f6_geyser_ne',
        type: 'THERMAL_GEYSER',
        x: 220,
        y: -220,
        radius: 70,
        name: 'Gêiser de Vapor Térmico',
        description: 'Fique sobre o vapor para dissipar o Congelamento e ganhar velocidade',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true
      },
      {
        id: 'f6_geyser_s',
        type: 'THERMAL_GEYSER',
        x: 0,
        y: 260,
        radius: 70,
        name: 'Gêiser de Vapor Térmico',
        description: 'Fique sobre o vapor para dissipar o Congelamento e ganhar velocidade',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true
      },
      {
        id: 'f6_bar1',
        type: 'EXPLODING_BARREL',
        x: -380,
        y: -220,
        radius: 190,
        name: 'Barril de Geada Explosiva',
        description: 'Explode congelando e causando dano em área',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f6_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 380,
        y: -220,
        radius: 160,
        name: 'Obelisco de Gelo Glacial',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e congelar inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 550,
    spawnRadiusMax: 920
  },

  // FLOOR 7: O LABORATÓRIO DOS AUTÔMATOS (CITY / STEEL)
  7: {
    floorNumber: 7,
    name: 'Laboratório dos Autômatos',
    title: 'THE PRIME FOUNDRY',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 520 },
      { type: 'CIRCLE', x: -480, y: -360, radius: 220 },
      { type: 'CIRCLE', x: 480, y: -360, radius: 220 },
      { type: 'CIRCLE', x: -480, y: 360, radius: 220 },
      { type: 'CIRCLE', x: 480, y: 360, radius: 220 },
    ],
    bridges: [
      { x1: -240, y1: -180, x2: -380, y2: -280, width: 120 },
      { x1: 240, y1: -180, x2: 380, y2: -280, width: 120 },
      { x1: -240, y1: 180, x2: -380, y2: 280, width: 120 },
      { x1: 240, y1: 180, x2: 380, y2: 280, width: 120 },
    ],
    pillars: [
      { id: 'f7_p1', x: -180, y: 0, radius: 36, height: 140, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
      { id: 'f7_p2', x: 180, y: 0, radius: 36, height: 140, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
    ],
    hazards: [
      {
        id: 'f7_bar1',
        type: 'EXPLODING_BARREL',
        x: -480,
        y: -360,
        radius: 190,
        name: 'Tambor de Óleo Pressurizado',
        description: 'Explode em labaredas de vapor e fogo em área',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f7_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 180,
        y: 0,
        radius: 160,
        name: 'Pilar Mecânico de Aço',
        description: 'Aperte [ESPAÇO] ou atire para colapsar a estrutura',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 550,
    spawnRadiusMax: 900
  },

  // FLOOR 8: AS CATACUMBAS DAS SOMBRAS (GRAVEYARD)
  8: {
    floorNumber: 8,
    name: 'Catacumbas das Sombras',
    title: 'THE SHADOW MAUSOLEUM',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 520 },
      { type: 'CIRCLE', x: -500, y: -280, radius: 220 },
      { type: 'CIRCLE', x: 500, y: -280, radius: 220 },
      { type: 'CIRCLE', x: -500, y: 280, radius: 220 },
      { type: 'CIRCLE', x: 500, y: 280, radius: 220 },
    ],
    bridges: [
      { x1: -240, y1: -140, x2: -380, y2: -220, width: 120 },
      { x1: 240, y1: -140, x2: 380, y2: -220, width: 120 },
      { x1: -240, y1: 140, x2: -380, y2: 220, width: 120 },
      { x1: 240, y1: 140, x2: 380, y2: 220, width: 120 },
    ],
    pillars: [
      { id: 'f8_p1', x: -160, y: -160, radius: 36, height: 135, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
      { id: 'f8_p2', x: 160, y: -160, radius: 36, height: 135, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
    ],
    hazards: [
      {
        id: 'f8_braz1',
        type: 'SOUL_BRAZIER',
        x: -500,
        y: -280,
        radius: 110,
        name: 'Brasero Sagrado Noroeste',
        description: 'Aperte [ESPAÇO] ou atire para liberar Luz Sagrada e dissipar o Véu de Mors\'thar',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 60,
        maxHp: 60
      },
      {
        id: 'f8_braz2',
        type: 'SOUL_BRAZIER',
        x: 500,
        y: -280,
        radius: 110,
        name: 'Brasero Sagrado Nordeste',
        description: 'Aperte [ESPAÇO] ou atire para liberar Luz Sagrada e dissipar o Véu de Mors\'thar',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 60,
        maxHp: 60
      },
      {
        id: 'f8_braz3',
        type: 'SOUL_BRAZIER',
        x: -500,
        y: 280,
        radius: 110,
        name: 'Brasero Sagrado Sudoeste',
        description: 'Aperte [ESPAÇO] ou atire para liberar Luz Sagrada e dissipar o Véu de Mors\'thar',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 60,
        maxHp: 60
      },
      {
        id: 'f8_braz4',
        type: 'SOUL_BRAZIER',
        x: 500,
        y: 280,
        radius: 110,
        name: 'Brasero Sagrado Sudeste',
        description: 'Aperte [ESPAÇO] ou atire para liberar Luz Sagrada e dissipar o Véu de Mors\'thar',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 60,
        maxHp: 60
      },
      {
        id: 'f8_bar1',
        type: 'EXPLODING_BARREL',
        x: 0,
        y: -240,
        radius: 190,
        name: 'Urna de Almas Sombrias',
        description: 'Explode liberando chamas espectrais devastadoras',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f8_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 160,
        y: -160,
        radius: 160,
        name: 'Obelisco de Ossos Rúnicos',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e amaldiçoar inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 550,
    spawnRadiusMax: 920
  },

  // FLOOR 9: A CIDADELA CELESTE (CELESTIAL / SOLAR SANCTUARY)
  9: {
    floorNumber: 9,
    name: 'Cidadela Celeste dos Monges',
    title: 'THE CELESTIAL ARENA',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 560 },
      { type: 'CIRCLE', x: 0, y: -580, radius: 240 },
      { type: 'CIRCLE', x: 0, y: 580, radius: 240 },
      { type: 'CIRCLE', x: -580, y: 0, radius: 240 },
      { type: 'CIRCLE', x: 580, y: 0, radius: 240 }
    ],
    bridges: [
      { x1: 0, y1: -320, x2: 0, y2: -460, width: 150 },
      { x1: 0, y1: 320, x2: 0, y2: 460, width: 150 },
      { x1: -320, y1: 0, x2: -460, y2: 0, width: 150 },
      { x1: 320, y1: 0, x2: 460, y2: 0, width: 150 }
    ],
    pillars: [
      { id: 'f9_p1', x: -220, y: -220, radius: 36, height: 150, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
      { id: 'f9_p2', x: 220, y: -220, radius: 36, height: 150, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
      { id: 'f9_p3', x: -220, y: 220, radius: 36, height: 150, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
      { id: 'f9_p4', x: 220, y: 220, radius: 36, height: 150, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' }
    ],
    hazards: [
      {
        id: 'f9_altar1',
        type: 'SOLAR_ALTAR',
        x: 0,
        y: -580,
        radius: 80,
        name: 'Altar da Luz Solar Superior',
        description: 'Aperte [ESPAÇO]: Bênção da Aurora (+30% Dano & Escudo Solar por 8s)',
        stateTimer: 0,
        maxTimer: 18.0,
        isActive: true
      },
      {
        id: 'f9_altar2',
        type: 'SOLAR_ALTAR',
        x: 0,
        y: 580,
        radius: 80,
        name: 'Altar da Luz Solar Inferior',
        description: 'Aperte [ESPAÇO]: Bênção da Aurora (+30% Dano & Escudo Solar por 8s)',
        stateTimer: 0,
        maxTimer: 18.0,
        isActive: true
      },
      {
        id: 'f9_pil1',
        type: 'BREAKABLE_PILLAR',
        x: -580,
        y: 0,
        radius: 180,
        name: 'Coluna Sagrada do Julgamento',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e causar dano sagrado massivo',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 120,
        maxHp: 120
      },
      {
        id: 'f9_pil2',
        type: 'BREAKABLE_PILLAR',
        x: 580,
        y: 0,
        radius: 180,
        name: 'Coluna Sagrada da Alvorada',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e causar dano sagrado massivo',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 120,
        maxHp: 120
      }
    ],
    spawnRadiusMin: 550,
    spawnRadiusMax: 950
  },

  // FLOOR 10: O TRONO DO VAZIO ABSOLUTO (COSMIC APEX)
  10: {
    floorNumber: 10,
    name: 'Trono do Vazio Absoluto',
    title: 'THE ASTRAL SOVEREIGN APEX',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 580 },
      { type: 'CIRCLE', x: 0, y: -640, radius: 220 },
      { type: 'CIRCLE', x: 640, y: 0, radius: 220 },
      { type: 'CIRCLE', x: 0, y: 640, radius: 220 },
      { type: 'CIRCLE', x: -640, y: 0, radius: 220 },
    ],
    bridges: [
      { x1: 0, y1: -360, x2: 0, y2: -500, width: 140 },
      { x1: 360, y1: 0, x2: 500, y2: 0, width: 140 },
      { x1: 0, y1: 360, x2: 0, y2: 500, width: 140 },
      { x1: -360, y1: 0, x2: -500, y2: 0, width: 140 },
    ],
    pillars: [
      { id: 'f10_1', x: 0, y: -260, radius: 32, height: 150, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
      { id: 'f10_2', x: 260, y: 0, radius: 32, height: 150, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
      { id: 'f10_3', x: 0, y: 260, radius: 32, height: 150, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
      { id: 'f10_4', x: -260, y: 0, radius: 32, height: 150, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
    ],
    hazards: [
      {
        id: 'f10_sing1',
        type: 'VOID_SINGULARITY',
        x: -640,
        y: 0,
        radius: 200,
        name: 'Núcleo de Singularidade Neutro',
        description: 'Aperte [ESPAÇO] para distorcer o espaço-tempo: atordoa inimigos e acelera recargas em +50%',
        stateTimer: 0,
        maxTimer: 22.0,
        isActive: false
      },
      {
        id: 'f10_sing2',
        type: 'VOID_SINGULARITY',
        x: 640,
        y: 0,
        radius: 200,
        name: 'Núcleo de Singularidade Neutro',
        description: 'Aperte [ESPAÇO] para distorcer o espaço-tempo: atordoa inimigos e acelera recargas em +50%',
        stateTimer: 0,
        maxTimer: 22.0,
        isActive: false
      },
      {
        id: 'f10_bar1',
        type: 'EXPLODING_BARREL',
        x: 0,
        y: -640,
        radius: 220,
        name: 'Singularidade de Pólvora Cósmica',
        description: 'Explosão cataclísmica que vaporiza inimigos próximos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f10_bar2',
        type: 'EXPLODING_BARREL',
        x: 0,
        y: 640,
        radius: 220,
        name: 'Singularidade de Pólvora Cósmica',
        description: 'Explosão cataclísmica que vaporiza inimigos próximos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 40,
        maxHp: 40
      },
      {
        id: 'f10_pil1',
        type: 'BREAKABLE_PILLAR',
        x: 260,
        y: 0,
        radius: 180,
        name: 'Monólito Cósmico Instável',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar o chefe/inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      },
      {
        id: 'f10_pil2',
        type: 'BREAKABLE_PILLAR',
        x: -260,
        y: 0,
        radius: 180,
        name: 'Monólito Cósmico Instável',
        description: 'Aperte [ESPAÇO] ou atire para desmoronar e atordoar o chefe/inimigos',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        hp: 100,
        maxHp: 100
      }
    ],
    spawnRadiusMin: 580,
    spawnRadiusMax: 980
  },

  // REST FLOOR (-1): CÂMARA DE DESCANSO DA FOGUEIRA ANCESTRAL
  [-1]: {
    floorNumber: -1,
    name: 'Santuário da Fogueira Ancestral',
    title: 'THE HALLOWED REST CHAMBER',
    chambers: [
      { type: 'CIRCLE', x: 0, y: 0, radius: 380 },
      { type: 'CIRCLE', x: -280, y: -180, radius: 130 },
      { type: 'CIRCLE', x: 280, y: -180, radius: 130 }
    ],
    bridges: [
      { x1: 0, y1: 0, x2: -280, y2: -180, width: 110 },
      { x1: 0, y1: 0, x2: 280, y2: -180, width: 110 }
    ],
    pillars: [
      { id: 'rest_p1', x: -160, y: 120, radius: 24, height: 110, color: '#18182b', topColor: '#f97316', runeColor: '#fbbf24' },
      { id: 'rest_p2', x: 160, y: 120, radius: 24, height: 110, color: '#18182b', topColor: '#f97316', runeColor: '#fbbf24' }
    ],
    hazards: [
      {
        id: 'rest_campfire',
        type: 'SACRIFICE_SHRINE',
        x: 0,
        y: 0,
        radius: 65,
        name: 'Fogueira Ancestral',
        description: 'Aperte [ESPAÇO] para aquecer-se e restaurar +80% do seu HP máximo',
        stateTimer: 0,
        maxTimer: 0,
        isActive: true,
        used: false
      }
    ],
    spawnRadiusMin: 0,
    spawnRadiusMax: 0
  }
};


// Define custom phases for all other floors

// FLOOR 3
export const FLOOR_3_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 3,
  name: 'Cavernas de Obsidiana - Entrada das Fendas (Fase 1)',
  title: 'VOLCANIC BASALT CRAGS',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 420 },
    { type: 'CIRCLE', x: -350, y: -200, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: -350, y2: -200, width: 120 },
  ],
  pillars: [
    { id: 'f3p1_p1', x: -120, y: -80, radius: 30, height: 110, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
  ],
  hazards: [
    { id: 'f3p1_h1', type: 'MAGMA_VENT', x: -180, y: -100, radius: 65, name: 'Gêiser de Magma', description: 'Dispara projéteis de fogo.', stateTimer: 2.0, maxTimer: 6.0, isActive: false },
    { id: 'f3p1_h2', type: 'BREAKABLE_PILLAR', x: 0, y: 150, radius: 160, name: 'Pilar de Obsidiana', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_3_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 3,
  name: 'Cavernas de Obsidiana - Caldeira de Cinzas (Fase 2)',
  title: 'THE MOLTEN ASH FLOW',
  chambers: [
    { type: 'CIRCLE', x: -280, y: -200, radius: 240 },
    { type: 'CIRCLE', x: 280, y: -200, radius: 240 },
    { type: 'CIRCLE', x: 0, y: 220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: -200, x2: 0, y2: 220, width: 100 },
    { x1: 280, y1: -200, x2: 0, y2: 220, width: 100 },
  ],
  pillars: [
    { id: 'f3p2_p1', x: -120, y: 40, radius: 30, height: 115, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f3p2_p2', x: 120, y: 40, radius: 30, height: 115, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
  ],
  hazards: [
    { id: 'f3p2_h1', type: 'MAGMA_VENT', x: -140, y: -80, radius: 65, name: 'Fenda de Erupção', description: 'Causa dano de fogo em área', stateTimer: 2.0, maxTimer: 4.5, isActive: false },
    { id: 'f3p2_h2', type: 'MAGMA_VENT', x: 140, y: -80, radius: 65, name: 'Fenda de Erupção', description: 'Causa dano de fogo em área', stateTimer: 3.5, maxTimer: 4.5, isActive: false },
    { id: 'f3p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: 150, radius: 160, name: 'Pilar Instável', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_3_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 3,
  name: 'Cavernas de Obsidiana - Coração da Forja (Fase 3 - Chefe)',
  title: 'CORE OF THE FIERY FORGE',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f3p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f3p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f3p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f3p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#450a0a', topColor: '#f97316', runeColor: '#fdba74' },
  ],
  hazards: [
    { id: 'f3p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Fenda de Erupção', description: 'Expele magma e concede imunidade ao Dragão da Forja. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f3p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Fenda de Erupção', description: 'Expele magma e concede imunidade ao Dragão da Forja. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f3p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Fenda de Erupção', description: 'Expele magma e concede imunidade ao Dragão da Forja. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f3p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Fenda de Erupção', description: 'Expele magma e concede imunidade ao Dragão da Forja. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 4
export const FLOOR_4_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 4,
  name: 'Bastião dos Canhoneiros - Pátio de Artilharia (Fase 1)',
  title: 'FORTIFIED COURTYARD',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: 380, y: -180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: 380, y2: -180, width: 120 },
  ],
  pillars: [
    { id: 'f4p1_p1', x: 180, y: -80, radius: 30, height: 110, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
  ],
  hazards: [
    { id: 'f4p1_h1', type: 'SPIKE_TRAP', x: 100, y: -50, radius: 60, name: 'Espinhos Metálicos', description: 'Erompem do piso de ferro periodicamente', stateTimer: 2.0, maxTimer: 4.0, isActive: false },
    { id: 'f4p1_h2', type: 'EXPLODING_BARREL', x: 380, y: -180, radius: 190, name: 'Barril de Pólvora', description: 'Explosão devastadora em área', stateTimer: 0, maxTimer: 0, isActive: true, hp: 40, maxHp: 40 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_4_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 4,
  name: 'Bastião dos Canhoneiros - Arsenal Blindado (Fase 2)',
  title: 'ARMORED ARSENAL',
  chambers: [
    { type: 'CIRCLE', x: -280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: 220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: -180, x2: 0, y2: 220, width: 100 },
    { x1: 280, y1: -180, x2: 0, y2: 220, width: 100 },
  ],
  pillars: [
    { id: 'f4p2_p1', x: -120, y: 40, radius: 30, height: 115, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
    { id: 'f4p2_p2', x: 120, y: 40, radius: 30, height: 115, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
  ],
  hazards: [
    { id: 'f4p2_h1', type: 'SPIKE_TRAP', x: -120, y: -20, radius: 60, name: 'Espinhos', description: 'Causa dano se pisado', stateTimer: 2.5, maxTimer: 4.0, isActive: false },
    { id: 'f4p2_h2', type: 'SPIKE_TRAP', x: 120, y: -20, radius: 60, name: 'Espinhos', description: 'Causa dano se pisado', stateTimer: 3.5, maxTimer: 4.0, isActive: false },
    { id: 'f4p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: 150, radius: 160, name: 'Coluna de Ferro', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_4_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 4,
  name: 'Bastião dos Canhoneiros - Câmara de Controle (Fase 3 - Chefe)',
  title: 'CONTROL CHAMBER OF METAL',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f4p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
    { id: 'f4p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
    { id: 'f4p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
    { id: 'f4p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#170d24', topColor: '#e11d48', runeColor: '#fb7185' },
  ],
  hazards: [
    { id: 'f4p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Bobina de Energia', description: 'Emite radiação e protege o Senhor da Artilharia. Destrua as 4 bobinas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f4p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Bobina de Energia', description: 'Emite radiação e protege o Senhor da Artilharia. Destrua as 4 bobinas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f4p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Bobina de Energia', description: 'Emite radiação e protege o Senhor da Artilharia. Destrua as 4 bobinas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f4p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Bobina de Energia', description: 'Emite radiação e protege o Senhor da Artilharia. Destrua as 4 bobinas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 5
export const FLOOR_5_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 5,
  name: 'Deserto das Tempestades - Dunas Solares (Fase 1)',
  title: 'SCORCHING SUN DUNES',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: -380, y: 180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: -380, y2: 180, width: 120 },
  ],
  pillars: [
    { id: 'f5p1_p1', x: -180, y: 80, radius: 30, height: 110, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
  ],
  hazards: [
    { id: 'f5p1_h1', type: 'TOXIC_GEYSER', x: -100, y: 50, radius: 65, name: 'Gêiser de Areia Ácida', description: 'Cospe areia corrosiva lenta', stateTimer: 2.0, maxTimer: 4.0, isActive: false },
    { id: 'f5p1_h2', type: 'EXPLODING_BARREL', x: -380, y: 180, radius: 190, name: 'Capacitor Instável', description: 'Rajada de plasma solar em área', stateTimer: 0, maxTimer: 0, isActive: true, hp: 40, maxHp: 40 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_5_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 5,
  name: 'Deserto das Tempestades - Ruínas de Âmbar (Fase 2)',
  title: 'AMBER RUINS STORM',
  chambers: [
    { type: 'CIRCLE', x: -280, y: 180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: 180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: -220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: 180, x2: 0, y2: -220, width: 100 },
    { x1: 280, y1: 180, x2: 0, y2: -220, width: 100 },
  ],
  pillars: [
    { id: 'f5p2_p1', x: -120, y: -40, radius: 30, height: 115, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
    { id: 'f5p2_p2', x: 120, y: -40, radius: 30, height: 115, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
  ],
  hazards: [
    { id: 'f5p2_h1', type: 'TOXIC_GEYSER', x: -120, y: 20, radius: 65, name: 'Condutor Elétrico', description: 'Causa dano elétrico em área', stateTimer: 2.5, maxTimer: 4.0, isActive: false },
    { id: 'f5p2_h2', type: 'TOXIC_GEYSER', x: 120, y: 20, radius: 65, name: 'Condutor Elétrico', description: 'Causa dano elétrico em área', stateTimer: 3.5, maxTimer: 4.0, isActive: false },
    { id: 'f5p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: -150, radius: 160, name: 'Pilar Sônico', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_5_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 5,
  name: 'Deserto das Tempestades - Templo do Trovão (Fase 3 - Chefe)',
  title: 'THUNDER TEMPLE PYRAMID',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f5p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
    { id: 'f5p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
    { id: 'f5p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
    { id: 'f5p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#2d1b00', topColor: '#f59e0b', runeColor: '#fbbf24' },
  ],
  hazards: [
    { id: 'f5p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Obelisco Condutor', description: 'Alimenta o escudo do Faraó do Trovão. Destrua os 4 obeliscos!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f5p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Obelisco Condutor', description: 'Alimenta o escudo do Faraó do Trovão. Destrua os 4 obeliscos!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f5p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Obelisco Condutor', description: 'Alimenta o escudo do Faraó do Trovão. Destrua os 4 obeliscos!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f5p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Obelisco Condutor', description: 'Alimenta o escudo do Faraó do Trovão. Destrua os 4 obeliscos!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 6
export const FLOOR_6_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 6,
  name: 'Pico do Zero Absoluto - Encostas Congeladas (Fase 1)',
  title: 'FROZEN SLOPE ENTRANCE',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: 380, y: 180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: 380, y2: 180, width: 120 },
  ],
  pillars: [
    { id: 'f6p1_p1', x: 180, y: 80, radius: 30, height: 110, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
  ],
  hazards: [
    { id: 'f6p1_h1', type: 'THERMAL_GEYSER', x: 100, y: 50, radius: 70, name: 'Gêiser de Vapor', description: 'Dissipa o Congelamento e dá velocidade', stateTimer: 0, maxTimer: 0, isActive: true },
    { id: 'f6p1_h2', type: 'EXPLODING_BARREL', x: 380, y: 180, radius: 190, name: 'Barril de Geada', description: 'Explode congelando inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 40, maxHp: 40 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_6_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 6,
  name: 'Pico do Zero Absoluto - Fenda da Nevasca (Fase 2)',
  title: 'BLIZZARD CHASM DEPTHS',
  chambers: [
    { type: 'CIRCLE', x: -280, y: 180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: 180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: -220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: 180, x2: 0, y2: -220, width: 100 },
    { x1: 280, y1: 180, x2: 0, y2: -220, width: 100 },
  ],
  pillars: [
    { id: 'f6p2_p1', x: -120, y: -40, radius: 30, height: 115, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
    { id: 'f6p2_p2', x: 120, y: -40, radius: 30, height: 115, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
  ],
  hazards: [
    { id: 'f6p2_h1', type: 'THERMAL_GEYSER', x: -120, y: 20, radius: 70, name: 'Gêiser Térmico', description: 'Acelera movimentação e derrete congelamento', stateTimer: 0, maxTimer: 0, isActive: true },
    { id: 'f6p2_h2', type: 'THERMAL_GEYSER', x: 120, y: 20, radius: 70, name: 'Gêiser Térmico', description: 'Acelera movimentação e derrete congelamento', stateTimer: 0, maxTimer: 0, isActive: true },
    { id: 'f6p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: -150, radius: 160, name: 'Obelisco Glacial', description: 'Desmorona congelando inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_6_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 6,
  name: 'Pico do Zero Absoluto - Trono da Geada (Fase 3 - Chefe)',
  title: 'THE FROST KING THRONE',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f6p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
    { id: 'f6p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
    { id: 'f6p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
    { id: 'f6p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#0f2338', topColor: '#38bdf8', runeColor: '#7dd3fc' },
  ],
  hazards: [
    { id: 'f6p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Cristal Criogênico', description: 'Gera geada protetora e imuniza o Lorde Yeti. Destrua os 4 cristais!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f6p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Cristal Criogênico', description: 'Gera geada protetora e imuniza o Lorde Yeti. Destrua os 4 cristais!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f6p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Cristal Criogênico', description: 'Gera geada protetora e imuniza o Lorde Yeti. Destrua os 4 cristais!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f6p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Cristal Criogênico', description: 'Gera geada protetora e imuniza o Lorde Yeti. Destrua os 4 cristais!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 7
export const FLOOR_7_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 7,
  name: 'Metrópole Ressonante - Periferia de Néon (Fase 1)',
  title: 'NEON RUNWAY CITY',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: -380, y: -180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: -380, y2: -180, width: 120 },
  ],
  pillars: [
    { id: 'f7p1_p1', x: -180, y: -80, radius: 30, height: 110, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
  ],
  hazards: [
    { id: 'f7p1_h1', type: 'SPIKE_TRAP', x: -100, y: -50, radius: 60, name: 'Grade Eletrostática', description: 'Erompe do piso industrial', stateTimer: 2.0, maxTimer: 4.0, isActive: false },
    { id: 'f7p1_h2', type: 'EXPLODING_BARREL', x: -380, y: -180, radius: 190, name: 'Tambor de Óleo', description: 'Explode em vapor e labaredas', stateTimer: 0, maxTimer: 0, isActive: true, hp: 40, maxHp: 40 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_7_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 7,
  name: 'Metrópole Ressonante - Plataforma Antigravidade (Fase 2)',
  title: 'GRAVITY CORE CELLS',
  chambers: [
    { type: 'CIRCLE', x: -280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: 220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: -180, x2: 0, y2: 220, width: 100 },
    { x1: 280, y1: -180, x2: 0, y2: 220, width: 100 },
  ],
  pillars: [
    { id: 'f7p2_p1', x: -120, y: 40, radius: 30, height: 115, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f7p2_p2', x: 120, y: 40, radius: 30, height: 115, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
  ],
  hazards: [
    { id: 'f7p2_h1', type: 'SPIKE_TRAP', x: -120, y: -20, radius: 60, name: 'Eletrogrelha', description: 'Dispara eletricidade periodicamente', stateTimer: 2.5, maxTimer: 4.0, isActive: false },
    { id: 'f7p2_h2', type: 'SPIKE_TRAP', x: 120, y: -20, radius: 60, name: 'Eletrogrelha', description: 'Dispara eletricidade periodicamente', stateTimer: 3.5, maxTimer: 4.0, isActive: false },
    { id: 'f7p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: 150, radius: 160, name: 'Pilar Mecânico', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_7_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 7,
  name: 'Metrópole Ressonante - Núcleo de Singularidade (Fase 3 - Chefe)',
  title: 'PRIME CENTRAL CORE',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f7p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f7p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f7p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
    { id: 'f7p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#1e293b', topColor: '#f97316', runeColor: '#fdba74' },
  ],
  hazards: [
    { id: 'f7p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Âncora Gravitacional', description: 'Estabiliza a barreira e protege o Colosso Primordial. Destrua as 4 âncoras!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f7p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Âncora Gravitacional', description: 'Estabiliza a barreira e protege o Colosso Primordial. Destrua as 4 âncoras!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f7p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Âncora Gravitacional', description: 'Estabiliza a barreira e protege o Colosso Primordial. Destrua as 4 âncoras!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f7p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Âncora Gravitacional', description: 'Estabiliza a barreira e protege o Colosso Primordial. Destrua as 4 âncoras!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 8
export const FLOOR_8_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 8,
  name: 'Criptas Góticas - Jardim de Lápides (Fase 1)',
  title: 'GRAVEYARD TOMB STONES',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: 380, y: -180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: 380, y2: -180, width: 120 },
  ],
  pillars: [
    { id: 'f8p1_p1', x: 180, y: -80, radius: 30, height: 110, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
  ],
  hazards: [
    { id: 'f8p1_h1', type: 'GRAVEYARD_HANDS', x: 100, y: -50, radius: 70, name: 'Mãos Zumbis', description: 'Abraçam e drenam vida', stateTimer: 2.0, maxTimer: 4.5, isActive: false },
    { id: 'f8p1_h2', type: 'EXPLODING_BARREL', x: 380, y: -180, radius: 190, name: 'Urna de Almas', description: 'Chamas espectrais devastadoras', stateTimer: 0, maxTimer: 0, isActive: true, hp: 40, maxHp: 40 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_8_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 8,
  name: 'Criptas Góticas - Catacumbas de Ossos (Fase 2)',
  title: 'DARK ASHEN CRYPT',
  chambers: [
    { type: 'CIRCLE', x: -280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: 220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: -180, x2: 0, y2: 220, width: 100 },
    { x1: 280, y1: -180, x2: 0, y2: 220, width: 100 },
  ],
  pillars: [
    { id: 'f8p2_p1', x: -120, y: 40, radius: 30, height: 115, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
    { id: 'f8p2_p2', x: 120, y: 40, radius: 30, height: 115, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
  ],
  hazards: [
    { id: 'f8p2_h1', type: 'GRAVEYARD_HANDS', x: -120, y: -20, radius: 70, name: 'Mãos Sobrenaturais', description: 'Drenam vida ao aproximar-se', stateTimer: 2.5, maxTimer: 4.5, isActive: false },
    { id: 'f8p2_h2', type: 'GRAVEYARD_HANDS', x: 120, y: -20, radius: 70, name: 'Mãos Sobrenaturais', description: 'Drenam vida ao aproximar-se', stateTimer: 3.5, maxTimer: 4.5, isActive: false },
    { id: 'f8p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: 150, radius: 160, name: 'Obelisco de Ossos', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_8_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 8,
  name: 'Criptas Góticas - Mausoléu Ancestral (Fase 3 - Chefe)',
  title: 'SOUL REAPER MAUSOLEUM',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f8p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
    { id: 'f8p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
    { id: 'f8p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
    { id: 'f8p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#2a0a0a', topColor: '#ef4444', runeColor: '#f87171' },
  ],
  hazards: [
    { id: 'f8p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Altar de Almas', description: 'Envia sombras e imuniza o Ceifador da Noite. Destrua os 4 altares!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f8p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Altar de Almas', description: 'Envia sombras e imuniza o Ceifador da Noite. Destrua os 4 altares!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f8p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Altar de Almas', description: 'Envia sombras e imuniza o Ceifador da Noite. Destrua os 4 altares!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f8p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Altar de Almas', description: 'Envia sombras e imuniza o Ceifador da Noite. Destrua os 4 altares!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 9
export const FLOOR_9_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 9,
  name: 'Santuário Celestial - Jardins Suspensos (Fase 1)',
  title: 'GOLDEN HANGING GARDENS',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: -380, y: 180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: -380, y2: 180, width: 120 },
  ],
  pillars: [
    { id: 'f9p1_p1', x: -180, y: 80, radius: 30, height: 110, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
  ],
  hazards: [
    { id: 'f9p1_h1', type: 'SOLAR_ALTAR', x: -100, y: 50, radius: 80, name: 'Altar da Luz', description: 'Dá bênção de ataque e escudo', stateTimer: 0, maxTimer: 18.0, isActive: true },
    { id: 'f9p1_h2', type: 'BREAKABLE_PILLAR', x: -380, y: 180, radius: 180, name: 'Coluna Sagrada', description: 'Causa dano sagrado em área', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_9_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 9,
  name: 'Santuário Celestial - Caminho da Iluminação (Fase 2)',
  title: 'CELESTIAL HIGHWAY OF LIGHT',
  chambers: [
    { type: 'CIRCLE', x: -280, y: 180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: 180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: -220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: 180, x2: 0, y2: -220, width: 100 },
    { x1: 280, y1: 180, x2: 0, y2: -220, width: 100 },
  ],
  pillars: [
    { id: 'f9p2_p1', x: -120, y: -40, radius: 30, height: 115, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
    { id: 'f9p2_p2', x: 120, y: -40, radius: 30, height: 115, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
  ],
  hazards: [
    { id: 'f9p2_h1', type: 'SOLAR_ALTAR', x: -120, y: 20, radius: 80, name: 'Bênção Solar', description: 'Restaura vitalidade e dá bônus sagrado', stateTimer: 0, maxTimer: 18.0, isActive: true },
    { id: 'f9p2_h2', type: 'SOLAR_ALTAR', x: 120, y: 20, radius: 80, name: 'Bênção Solar', description: 'Restaura vitalidade e dá bônus sagrado', stateTimer: 0, maxTimer: 18.0, isActive: true },
    { id: 'f9p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: -150, radius: 180, name: 'Coluna Celestial', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_9_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 9,
  name: 'Santuário Celestial - Cúpula da Aurora (Fase 3 - Chefe)',
  title: 'GOLDEN DOME THRONE',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f9p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
    { id: 'f9p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
    { id: 'f9p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
    { id: 'f9p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#451a03', topColor: '#fbbf24', runeColor: '#fef08a' },
  ],
  hazards: [
    { id: 'f9p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Lente de Foco Celeste', description: 'Foca calor solar e protege o Imperador Celestial. Destrua as 4 lentes!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f9p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Lente de Foco Celeste', description: 'Foca calor solar e protege o Imperador Celestial. Destrua as 4 lentes!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f9p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Lente de Foco Celeste', description: 'Foca calor solar e protege o Imperador Celestial. Destrua as 4 lentes!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f9p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Lente de Foco Celeste', description: 'Foca calor solar e protege o Imperador Celestial. Destrua as 4 lentes!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// FLOOR 10
export const FLOOR_10_MAP_PHASE_1: FloorMapLayout = {
  floorNumber: 10,
  name: 'Abisso do Vazio - Fronteira da Existência (Fase 1)',
  title: 'VOID STARDUST BOUNDARY',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 460 },
    { type: 'CIRCLE', x: 380, y: -180, radius: 240 },
  ],
  bridges: [
    { x1: 0, y1: 0, x2: 380, y2: -180, width: 120 },
  ],
  pillars: [
    { id: 'f10p1_p1', x: 180, y: -80, radius: 30, height: 110, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
  ],
  hazards: [
    { id: 'f10p1_h1', type: 'VOID_SINGULARITY', x: 100, y: -50, radius: 200, name: 'Singularidade Cósmica', description: 'Atordoa inimigos e acelera recarga em 50%', stateTimer: 0, maxTimer: 22.0, isActive: false },
    { id: 'f10p1_h2', type: 'EXPLODING_BARREL', x: 380, y: -180, radius: 220, name: 'Pólvora Cósmica', description: 'Vaporiza alvos próximos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 40, maxHp: 40 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 700
};

export const FLOOR_10_MAP_PHASE_2: FloorMapLayout = {
  floorNumber: 10,
  name: 'Abisso do Vazio - Singularidade Negra (Fase 2)',
  title: 'BLACK HOLE CHAOS CELLS',
  chambers: [
    { type: 'CIRCLE', x: -280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 280, y: -180, radius: 240 },
    { type: 'CIRCLE', x: 0, y: 220, radius: 260 },
  ],
  bridges: [
    { x1: -280, y1: -180, x2: 0, y2: 220, width: 100 },
    { x1: 280, y1: -180, x2: 0, y2: 220, width: 100 },
  ],
  pillars: [
    { id: 'f10p2_p1', x: -120, y: 40, radius: 30, height: 115, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
    { id: 'f10p2_p2', x: 120, y: 40, radius: 30, height: 115, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
  ],
  hazards: [
    { id: 'f10p2_h1', type: 'VOID_SINGULARITY', x: -120, y: -20, radius: 200, name: 'Singularidade', description: 'Cria uma distorção temporal no espaço', stateTimer: 0, maxTimer: 22.0, isActive: false },
    { id: 'f10p2_h2', type: 'VOID_SINGULARITY', x: 120, y: -20, radius: 200, name: 'Singularidade', description: 'Cria uma distorção temporal no espaço', stateTimer: 0, maxTimer: 22.0, isActive: false },
    { id: 'f10p2_h3', type: 'BREAKABLE_PILLAR', x: 0, y: 150, radius: 180, name: 'Monólito Cósmico', description: 'Atordoa inimigos', stateTimer: 0, maxTimer: 0, isActive: true, hp: 100, maxHp: 100 }
  ],
  spawnRadiusMin: 400,
  spawnRadiusMax: 750
};

export const FLOOR_10_MAP_PHASE_3: FloorMapLayout = {
  floorNumber: 10,
  name: 'Abisso do Vazio - Coração do Caos (Fase 3 - Chefe)',
  title: 'VOID SOVEREIGN HEART',
  chambers: [
    { type: 'CIRCLE', x: 0, y: 0, radius: 640 },
    { type: 'CIRCLE', x: 0, y: -580, radius: 230 },
  ],
  bridges: [
    { x1: 0, y1: -320, x2: 0, y2: -580, width: 160 },
  ],
  pillars: [
    { id: 'f10p3_p1', x: -280, y: -280, radius: 36, height: 130, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
    { id: 'f10p3_p2', x: 280, y: -280, radius: 36, height: 130, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
    { id: 'f10p3_p3', x: -280, y: 280, radius: 36, height: 130, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
    { id: 'f10p3_p4', x: 280, y: 280, radius: 36, height: 130, color: '#110e28', topColor: '#a855f7', runeColor: '#c084fc' },
  ],
  hazards: [
    { id: 'f10p3_tot1', type: 'RESONANT_PILLAR', x: -240, y: -240, radius: 170, name: 'Fenda de Singularidade', description: 'Drena a luz estelar e protege o Soberano do Vazio. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f10p3_tot2', type: 'RESONANT_PILLAR', x: 240, y: -240, radius: 170, name: 'Fenda de Singularidade', description: 'Drena a luz estelar e protege o Soberano do Vazio. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f10p3_tot3', type: 'RESONANT_PILLAR', x: -240, y: 240, radius: 170, name: 'Fenda de Singularidade', description: 'Drena a luz estelar e protege o Soberano do Vazio. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 },
    { id: 'f10p3_tot4', type: 'RESONANT_PILLAR', x: 240, y: 240, radius: 170, name: 'Fenda de Singularidade', description: 'Drena a luz estelar e protege o Soberano do Vazio. Destrua as 4 fendas!', stateTimer: 0, maxTimer: 0, isActive: true, hp: 120, maxHp: 120 }
  ],
  spawnRadiusMin: 0,
  spawnRadiusMax: 0
};

// Complete floor phases index
export const FLOOR_PHASE_MAPS: Record<number, Record<number, FloorMapLayout>> = {
  1: {
    1: FLOOR_1_MAP_PHASE_1,
    2: FLOOR_1_MAP_PHASE_2,
    3: FLOOR_1_MAP_PHASE_3
  },
  2: {
    1: FLOOR_2_MAP_PHASE_1,
    2: FLOOR_2_MAP_PHASE_2,
    3: FLOOR_2_MAP_PHASE_3
  },
  3: {
    1: FLOOR_3_MAP_PHASE_1,
    2: FLOOR_3_MAP_PHASE_2,
    3: FLOOR_3_MAP_PHASE_3
  },
  4: {
    1: FLOOR_4_MAP_PHASE_1,
    2: FLOOR_4_MAP_PHASE_2,
    3: FLOOR_4_MAP_PHASE_3
  },
  5: {
    1: FLOOR_5_MAP_PHASE_1,
    2: FLOOR_5_MAP_PHASE_2,
    3: FLOOR_5_MAP_PHASE_3
  },
  6: {
    1: FLOOR_6_MAP_PHASE_1,
    2: FLOOR_6_MAP_PHASE_2,
    3: FLOOR_6_MAP_PHASE_3
  },
  7: {
    1: FLOOR_7_MAP_PHASE_1,
    2: FLOOR_7_MAP_PHASE_2,
    3: FLOOR_7_MAP_PHASE_3
  },
  8: {
    1: FLOOR_8_MAP_PHASE_1,
    2: FLOOR_8_MAP_PHASE_2,
    3: FLOOR_8_MAP_PHASE_3
  },
  9: {
    1: FLOOR_9_MAP_PHASE_1,
    2: FLOOR_9_MAP_PHASE_2,
    3: FLOOR_9_MAP_PHASE_3
  },
  10: {
    1: FLOOR_10_MAP_PHASE_1,
    2: FLOOR_10_MAP_PHASE_2,
    3: FLOOR_10_MAP_PHASE_3
  }
};

export function getFloorMap(floorNumber: number, phaseNumber: number = 1): FloorMapLayout {
  const floorPhases = FLOOR_PHASE_MAPS[floorNumber];
  if (floorPhases) {
    const layout = floorPhases[phaseNumber];
    if (layout) return layout;
  }
  return FLOOR_MAPS[floorNumber] || FLOOR_MAPS[1];
}
