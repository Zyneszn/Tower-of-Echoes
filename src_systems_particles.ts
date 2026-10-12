import { Particle, ParticleType, Biome } from './types';

// Pre-allocated object pool for zero garbage collection
const MAX_PARTICLES = 650;

export interface ParticleEffectConfig {
  x: number;
  y: number;
  z?: number;
  color?: string;
  count?: number;
  type?: ParticleType;
  speed?: number;
  spread?: number;
  life?: number;
  size?: number;
}

export class LightweightParticleManager {
  private static pool: Particle[] = [];
  private static activeParticles: Particle[] = [];
  private static nextId = 1;

  static {
    // Pre-populate pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        id: `p_${i}`,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        size: 3,
        type: 'IMPACT'
      });
    }
  }

  public static getActiveParticles(): Particle[] {
    return this.activeParticles;
  }

  public static clear(): void {
    while (this.activeParticles.length > 0) {
      const p = this.activeParticles.pop()!;
      if (this.pool.length < MAX_PARTICLES) {
        this.pool.push(p);
      }
    }
  }

  /**
   * Spawns batched impact particles for projectile collisions or explosions
   */
  public static spawnImpact(config: ParticleEffectConfig): void {
    const count = Math.min(config.count || 6, MAX_PARTICLES - this.activeParticles.length);
    if (count <= 0) return;

    const baseZ = config.z ?? 10;
    const baseColor = config.color || '#f3a65a';
    const pType = config.type || 'IMPACT';
    const baseSpeed = config.speed || 180;
    const baseLife = config.life || 0.45;
    const baseSize = config.size || 3.5;

    for (let i = 0; i < count; i++) {
      let p = this.pool.pop();
      if (!p) {
        p = {
          id: `p_${++this.nextId}`,
          x: config.x,
          y: config.y,
          z: baseZ,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: baseLife,
          color: baseColor,
          size: baseSize,
          type: pType
        };
      }

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = baseSpeed * (0.6 + Math.random() * 0.8);

      p.x = config.x + (Math.random() - 0.5) * 6;
      p.y = config.y + (Math.random() - 0.5) * 6;
      p.z = baseZ;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.vz = 80 + Math.random() * 160;
      p.life = baseLife * (0.7 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.color = baseColor;
      p.size = baseSize * (0.8 + Math.random() * 0.5);
      p.type = pType;

      this.activeParticles.push(p);
    }
  }

  /**
   * Spawns environmental weather or ambient particles
   */
  public static spawnWeather(x: number, y: number, type: 'RAIN' | 'SNOW' | 'SAND', color: string): void {
    if (this.activeParticles.length >= MAX_PARTICLES - 10) return;

    let p = this.pool.pop();
    if (!p) {
      p = {
        id: `p_${++this.nextId}`,
        x,
        y,
        z: 600,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.5,
        color,
        size: 2,
        type
      };
    }

    p.x = x;
    p.y = y;
    p.z = 600;
    p.type = type;
    p.color = color;

    if (type === 'RAIN') {
      p.vx = -120;
      p.vy = -120;
      p.vz = -1400;
      p.life = 0.8;
      p.maxLife = 0.8;
      p.size = 2;
    } else if (type === 'SNOW') {
      p.vx = (Math.random() - 0.5) * 60;
      p.vy = (Math.random() - 0.5) * 60;
      p.vz = -220;
      p.life = 3.2;
      p.maxLife = 3.2;
      p.size = 3;
    } else {
      p.vx = 750;
      p.vy = 220;
      p.vz = 0;
      p.life = 1.8;
      p.maxLife = 1.8;
      p.size = 3.5;
    }

    this.activeParticles.push(p);
  }

  /**
   * Spawns dynamic thematic ambient particles tailored to the current floor and biome
   */
  public static spawnAmbientBiome(
    camX: number,
    camY: number,
    floorNumber: number,
    biome: Biome | string,
    isRestRoom: boolean
  ): void {
    if (this.activeParticles.length >= MAX_PARTICLES - 15) return;

    let p = this.pool.pop();
    if (!p) {
      p = {
        id: `p_${++this.nextId}`,
        x: camX,
        y: camY,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 3,
        color: '#ffffff',
        size: 3,
        type: 'FOG'
      };
    }

    const spawnArea = 1600;
    p.x = camX + (Math.random() - 0.5) * spawnArea;
    p.y = camY + (Math.random() - 0.5) * spawnArea;

    if (isRestRoom) {
      // Warm Campfire embers floating gently upwards
      p.z = 2 + Math.random() * 20;
      p.type = 'EMBER';
      p.vx = (Math.random() - 0.5) * 35;
      p.vy = (Math.random() - 0.5) * 35;
      p.vz = 45 + Math.random() * 65;
      p.life = 2.4 + Math.random() * 1.5;
      p.maxLife = p.life;
      p.color = Math.random() > 0.4 ? '#f97316' : (Math.random() > 0.5 ? '#fbbf24' : '#ef4444');
      p.size = 2.5 + Math.random() * 3.5;
    } else if (floorNumber === 8) {
      // ANDAR 8: As Criptas Esquecidas (Névoa Espessa Sombria e Almas Ectoplásmicas)
      if (Math.random() > 0.45) {
        // Drifting ethereal purple/dark mist clouds
        p.z = 5 + Math.random() * 25;
        p.type = 'FOG';
        p.vx = -25 + (Math.random() - 0.5) * 30;
        p.vy = 15 + (Math.random() - 0.5) * 20;
        p.vz = 3 + Math.random() * 8;
        p.life = 4.5 + Math.random() * 2.5;
        p.maxLife = p.life;
        p.color = Math.random() > 0.5 ? 'rgba(88, 28, 135, 0.42)' : 'rgba(59, 7, 100, 0.38)';
        p.size = 35 + Math.random() * 45; // Broad mist puffs
      } else {
        // Ectoplasm soul wisps / shadow sparkles
        p.z = 10 + Math.random() * 40;
        p.type = 'MAGIC';
        p.vx = (Math.random() - 0.5) * 45;
        p.vy = (Math.random() - 0.5) * 45;
        p.vz = 15 + Math.random() * 35;
        p.life = 2.8 + Math.random() * 1.6;
        p.maxLife = p.life;
        p.color = Math.random() > 0.3 ? '#c084fc' : '#a855f7';
        p.size = 3 + Math.random() * 4;
      }
    } else if (floorNumber === 10) {
      // ANDAR 10: O Coração do Vazio Cósmico (Motes Cósmicos e Fendas Escuras)
      p.z = 5 + Math.random() * 50;
      p.type = 'MAGIC';
      p.vx = (Math.random() - 0.5) * 60;
      p.vy = (Math.random() - 0.5) * 60;
      p.vz = (Math.random() - 0.5) * 40;
      p.life = 3.2 + Math.random() * 2.0;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? '#f43f5e' : (Math.random() > 0.5 ? '#818cf8' : '#e0e7ff');
      p.size = 2.5 + Math.random() * 4.5;
    } else if (floorNumber === 9) {
      // ANDAR 9: Santuário Celestial (Partículas de Luz Dourada & Pétalas Sagradas)
      p.z = 10 + Math.random() * 60;
      p.type = 'SPARK';
      p.vx = -15 + Math.sin(p.x * 0.05) * 20;
      p.vy = 20 + Math.cos(p.y * 0.05) * 20;
      p.vz = -10 + Math.random() * 20;
      p.life = 3.5 + Math.random() * 2.0;
      p.maxLife = p.life;
      p.color = Math.random() > 0.4 ? '#fef08a' : '#fbbf24';
      p.size = 2.5 + Math.random() * 3.5;
    } else if (biome === Biome.VOLCANO || floorNumber === 3) {
      // Vulcão: Cinzas incandescentes e brasas que sobem
      p.z = 0;
      p.type = 'EMBER';
      p.vx = -30 + (Math.random() - 0.5) * 40;
      p.vy = -10 + (Math.random() - 0.5) * 30;
      p.vz = 55 + Math.random() * 85;
      p.life = 2.2 + Math.random() * 1.8;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? '#ea580c' : (Math.random() > 0.5 ? '#f97316' : '#ef4444');
      p.size = 2 + Math.random() * 4;
    } else if (biome === Biome.SNOW || floorNumber === 6) {
      // Neve: Névoa gelada e cristais de gelo flutuantes
      p.z = 10 + Math.random() * 50;
      p.type = 'FOG';
      p.vx = 40 + (Math.random() - 0.5) * 30;
      p.vy = 20 + (Math.random() - 0.5) * 20;
      p.vz = -10 + (Math.random() - 0.5) * 15;
      p.life = 3.5 + Math.random() * 2.0;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? 'rgba(224, 242, 254, 0.45)' : 'rgba(186, 230, 253, 0.35)';
      p.size = 28 + Math.random() * 32;
    } else if (biome === Biome.DESERT || floorNumber === 5) {
      // Deserto: Motes de poeira dourada e estática elétrica
      p.z = 5 + Math.random() * 30;
      p.type = 'SPARK';
      p.vx = 65 + (Math.random() - 0.5) * 40;
      p.vy = 25 + (Math.random() - 0.5) * 30;
      p.vz = 5 + Math.random() * 15;
      p.life = 2.5 + Math.random() * 1.5;
      p.maxLife = p.life;
      p.color = Math.random() > 0.3 ? '#fde047' : '#f59e0b';
      p.size = 2 + Math.random() * 3;
    } else if (biome === Biome.CITY || floorNumber === 4 || floorNumber === 7) {
      // Cidade / Cidadela Cibernética: Poeira urbana de neon / faíscas tecno
      p.z = 5 + Math.random() * 40;
      p.type = 'SPARK';
      p.vx = (Math.random() - 0.5) * 40;
      p.vy = (Math.random() - 0.5) * 40;
      p.vz = 20 + Math.random() * 40;
      p.life = 2.0 + Math.random() * 1.5;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? '#38bdf8' : (Math.random() > 0.5 ? '#a855f7' : '#06b6d4');
      p.size = 2 + Math.random() * 3;
    } else if (biome === Biome.GRAVEYARD || floorNumber === 2) {
      // Pântano e Cemitério: Esporos venenosos e névoa tóxica rasteira
      p.z = 5 + Math.random() * 20;
      p.type = 'SPORE';
      p.vx = (Math.random() - 0.5) * 25;
      p.vy = (Math.random() - 0.5) * 25;
      p.vz = 8 + Math.random() * 18;
      p.life = 3.5 + Math.random() * 2.0;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? 'rgba(163, 230, 53, 0.45)' : 'rgba(34, 197, 94, 0.4)';
      p.size = 20 + Math.random() * 25;
    } else {
      // Floresta / Vila / Padrão: Pólen mágico esmeralda e pétalas
      p.z = 5 + Math.random() * 35;
      p.type = 'PETAL';
      p.vx = -15 + Math.sin(p.x * 0.02) * 25;
      p.vy = 12 + Math.cos(p.y * 0.02) * 20;
      p.vz = 2 + (Math.random() - 0.5) * 10;
      p.life = 3.2 + Math.random() * 1.8;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? '#86efac' : (Math.random() > 0.5 ? '#34d399' : '#a7f3d0');
      p.size = 2.5 + Math.random() * 3;
    }

    this.activeParticles.push(p);
  }

  /**
   * Updates all active particles with zero GC recycling
   */
  public static update(dt: number): void {
    let writeIdx = 0;
    const len = this.activeParticles.length;

    for (let i = 0; i < len; i++) {
      const p = this.activeParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Gravity applied only to non-ambient floating types
      const isAmbientFloat =
        p.type === 'RAIN' ||
        p.type === 'SNOW' ||
        p.type === 'SAND' ||
        p.type === 'FOG' ||
        p.type === 'EMBER' ||
        p.type === 'SPORE' ||
        p.type === 'SPARK' ||
        p.type === 'PETAL';

      if (!isAmbientFloat) {
        p.vz -= 980 * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz *= -0.4;
          p.vx *= 0.75;
          p.vy *= 0.75;
        }
      }

      p.life -= dt;

      if (p.life > 0 && p.z >= 0) {
        if (writeIdx !== i) {
          this.activeParticles[writeIdx] = p;
        }
        writeIdx++;
      } else {
        if (this.pool.length < MAX_PARTICLES) {
          this.pool.push(p);
        }
      }
    }

    this.activeParticles.length = writeIdx;
  }

  /**
   * Batched isometric rendering of pooled particles
   */
  public static draw(ctx: CanvasRenderingContext2D, toIso: (x: number, y: number, z: number) => { x: number; y: number }): void {
    const len = this.activeParticles.length;
    for (let i = 0; i < len; i++) {
      const p = this.activeParticles[i];
      const iso = toIso(p.x, p.y, p.z);
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;

      if (p.type === 'RAIN') {
        ctx.fillRect(iso.x, iso.y, 1, 15);
      } else if (p.type === 'SNOW') {
        ctx.beginPath();
        ctx.arc(iso.x, iso.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'SAND') {
        ctx.fillRect(iso.x, iso.y, p.size * 3, p.size);
      } else if (p.type === 'FOG' || p.type === 'SPORE') {
        // Soft billowing volumetric mist puff
        const pulse = Math.sin((p.life / p.maxLife) * Math.PI);
        const r = p.size * (0.8 + pulse * 0.4);
        ctx.globalAlpha = alpha * 0.35 * pulse;
        ctx.beginPath();
        ctx.ellipse(iso.x, iso.y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'EMBER') {
        // Bright glowing ember with slight flicker
        const flicker = 0.8 + Math.sin(p.life * 15) * 0.2;
        ctx.globalAlpha = alpha * flicker;
        ctx.beginPath();
        ctx.arc(iso.x, iso.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'SPARK' || p.type === 'PETAL') {
        // Rotating motes / sparkling diamonds
        ctx.beginPath();
        ctx.ellipse(iso.x, iso.y, p.size * 1.2, p.size * 0.7, Math.sin(p.life * 3), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(iso.x - p.size / 2, iso.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

