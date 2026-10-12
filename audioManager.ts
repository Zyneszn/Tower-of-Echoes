import { Biome } from './types';

export type AudioTheme = 'FOREST' | 'ICE' | 'RUINS' | 'VILLAGE' | 'MENU';

interface NoteDefinition {
  freq: number;
  duration: number;
}

// Pentatonic / Modal note scales in Hz for procedural synth themes
const SCALES = {
  // A Major / F# Minor Pentatonic (Warm, organic, lush)
  FOREST: [220.00, 246.94, 277.18, 329.63, 369.99, 440.00, 493.88, 554.37, 659.25],
  
  // E Minor / Lydian Crystal (Icy, crystalline, ethereal)
  ICE: [329.63, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00, 987.77],
  
  // D Phrygian / Minor (Mystic, ancient stone, gothic ruins)
  RUINS: [146.83, 155.56, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66, 311.13, 349.23],
  
  // C Lydian / Major (Cozy, warm, peaceful sanctuary)
  VILLAGE: [261.63, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88, 523.25],
  
  // Celestial / Void (Main Menu)
  MENU: [110.00, 164.81, 220.00, 277.18, 329.63, 440.00]
};

class AudioManagerClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;

  private currentTheme: AudioTheme = 'VILLAGE';
  private targetTheme: AudioTheme = 'VILLAGE';
  
  private musicVolume: number = 0;
  private sfxVolume: number = 0;
  private muted: boolean = true;
  private isInitialized: boolean = false;

  // Track loops & interval timers
  private themeLoopTimer: number | null = null;
  private arpeggioTimer: number | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private padOscillators: OscillatorNode[] = [];
  
  // Heartbeat loop state
  private heartbeatInterval: number | null = null;
  private isHeartbeatRunning: boolean = false;
  
  // Crossfade state
  private activeThemeGain: GainNode | null = null;
  private listeners: Array<() => void> = [];

  constructor() {
    // Lazy init via user interaction
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  public async initAudio(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);

      this.isInitialized = true;
      this.startThemeSoundscape(this.targetTheme);
      this.notify();
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  public mapBiomeToTheme(biome: Biome | 'VILLAGE' | 'MENU' | string): AudioTheme {
    if (biome === 'VILLAGE' || biome === 'FLOOR_0') return 'VILLAGE';
    if (biome === 'MENU') return 'MENU';
    if (biome === Biome.FOREST) return 'FOREST';
    if (biome === Biome.SNOW) return 'ICE';
    // Graveyard, City, Volcano, Desert maps to Ruins theme
    if (biome === Biome.GRAVEYARD || biome === Biome.CITY || biome === Biome.VOLCANO || biome === Biome.DESERT) {
      return 'RUINS';
    }
    return 'FOREST';
  }

  public setFloorBiome(biome: Biome | 'VILLAGE' | 'MENU' | string): void {
    const theme = this.mapBiomeToTheme(biome);
    this.setTheme(theme);
  }

  public setTheme(theme: AudioTheme): void {
    if (this.targetTheme === theme) return;
    this.targetTheme = theme;

    if (!this.isInitialized || !this.ctx) {
      this.currentTheme = theme;
      return;
    }

    // Smooth crossfade transition
    this.stopCurrentThemeLoop();
    this.currentTheme = theme;
    this.startThemeSoundscape(theme);
    this.notify();
  }

  private stopCurrentThemeLoop(): void {
    if (this.themeLoopTimer !== null) {
      window.clearInterval(this.themeLoopTimer);
      this.themeLoopTimer = null;
    }
    if (this.arpeggioTimer !== null) {
      window.clearInterval(this.arpeggioTimer);
      this.arpeggioTimer = null;
    }

    this.padOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    this.padOscillators = [];

    if (this.noiseNode) {
      try {
        this.noiseNode.stop();
        this.noiseNode.disconnect();
      } catch (e) {}
      this.noiseNode = null;
    }
  }

  private startThemeSoundscape(theme: AudioTheme): void {
    if (!this.ctx || !this.musicGain || !this.ambienceGain) return;

    const now = this.ctx.currentTime;

    // 1. Create Environmental Ambience (Wind / Snow / Lava / Forest rustle)
    this.startAmbienceNoise(theme);

    // 2. Create Harmonic Pad Chords
    this.startPadHarmonies(theme);

    // 3. Start Melodic Arpeggio Generator
    const intervalMs = theme === 'ICE' ? 320 : (theme === 'FOREST' ? 420 : (theme === 'RUINS' ? 580 : 480));
    this.arpeggioTimer = window.setInterval(() => {
      if (this.ctx && this.musicGain && !this.muted) {
        this.playArpeggioNote(theme);
      }
    }, intervalMs);
  }

  private startAmbienceNoise(theme: AudioTheme): void {
    if (!this.ctx || !this.ambienceGain) return;

    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds loopable noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();

    if (theme === 'FOREST') {
      filter.type = 'bandpass';
      filter.frequency.value = 450;
      filter.Q.value = 1.2;
    } else if (theme === 'ICE') {
      filter.type = 'highpass';
      filter.frequency.value = 1200;
      filter.Q.value = 2.5;
    } else if (theme === 'RUINS') {
      filter.type = 'lowpass';
      filter.frequency.value = 280;
      filter.Q.value = 3.0;
    } else {
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      filter.Q.value = 1.0;
    }

    const gain = this.ctx.createGain();
    const vol = theme === 'ICE' ? 0.08 : (theme === 'RUINS' ? 0.06 : 0.04);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambienceGain);

    noise.start();
    this.noiseNode = noise;
    this.noiseFilter = filter;
  }

  private startPadHarmonies(theme: AudioTheme): void {
    if (!this.ctx || !this.musicGain) return;

    const scale = SCALES[theme];
    if (!scale || scale.length === 0) return;

    // Pick 3 drone/pad frequencies
    const f1 = scale[0];
    const f2 = scale[Math.min(2, scale.length - 1)];
    const f3 = scale[Math.min(4, scale.length - 1)];

    [f1, f2, f3].forEach((freq, idx) => {
      if (!this.ctx || !this.musicGain) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = theme === 'ICE' ? 'sine' : (theme === 'RUINS' ? 'sawtooth' : 'triangle');
      osc.frequency.setValueAtTime(freq / (idx === 0 ? 2 : 1), this.ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(theme === 'RUINS' ? 350 : 600, this.ctx.currentTime);

      // Soft swell
      const targetGain = idx === 0 ? 0.12 : 0.06;
      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(targetGain, this.ctx.currentTime + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start();
      this.padOscillators.push(osc);
    });
  }

  private playArpeggioNote(theme: AudioTheme): void {
    if (!this.ctx || !this.musicGain || this.muted) return;

    const scale = SCALES[theme];
    if (!scale || scale.length === 0) return;

    // Random note selection biased toward harmonious pentatonics
    const randomIndex = Math.floor(Math.random() * scale.length);
    const freq = scale[randomIndex];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = theme === 'ICE' ? 'sine' : (theme === 'FOREST' ? 'triangle' : 'sine');
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(theme === 'ICE' ? 1800 : (theme === 'FOREST' ? 1200 : 800), this.ctx.currentTime);

    const now = this.ctx.currentTime;
    const noteDuration = theme === 'ICE' ? 0.45 : 0.65;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(now);
    osc.stop(now + noteDuration + 0.05);
  }

  // --- SOUND EFFECTS (SFX) ---
  public playAttackSfx(archetype: 'ARCHER' | 'MAGE' | string): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (archetype === 'ARCHER') {
      // Snappy bow release / swoosh
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } else if (archetype === 'VORGAR') {
      // Heavy iron hammer swing swoosh
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);

      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    } else if (archetype === 'SUMMONER') {
      // Mystical spectral orb cast
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.16);

      gain.gain.setValueAtTime(0.20, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    } else {
      // Magic energy hum burst
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.18);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    }

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playHitSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playDashSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.14);

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playHammerSmashSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playIronHookSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(280, now + 0.22);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playDimensionalRuptureSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);

    gain.gain.setValueAtTime(0.40, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.48);
  }

  public playItemPickSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.16); // G5

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playLevelUpSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.001, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.4);
    });
  }

  public playBossRoarSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(140, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(35, now + 1.2);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.25);
  }

  public playExplosionSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.52);
  }

  // --- TENSION & ATMOSPHERE EFFECTS ---
  public startHeartbeat(): void {
    if (this.isHeartbeatRunning) return;
    this.isHeartbeatRunning = true;
    this.playHeartbeatPulse();
    this.heartbeatInterval = window.setInterval(() => {
      if (this.isHeartbeatRunning) {
        this.playHeartbeatPulse();
      }
    }, 750); // 80 BPM tension heartbeat
  }

  public stopHeartbeat(): void {
    this.isHeartbeatRunning = false;
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private playHeartbeatPulse(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    // First lub (deeper thump)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(55, now);
    osc1.frequency.exponentialRampToValueAtTime(32, now + 0.12);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second dub (higher resonance thump)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(70, now + 0.16);
    osc2.frequency.exponentialRampToValueAtTime(36, now + 0.28);
    gain2.gain.setValueAtTime(0.28, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.32);
  }

  public playCorruptionAlertSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Dissonant dark brass drone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65.41, now); // C2
    osc2.frequency.setValueAtTime(69.30, now); // C#2 (Minor second dissonance)

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.9);
    osc2.stop(now + 1.9);
  }

  public playCampfireRestSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Warm healing harmonic arpeggio
    const chords = [261.63, 329.63, 392.00, 523.25, 659.25];
    chords.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0.001, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.8);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.9);
    });
  }

  public playPortalAscendSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  public playGreedyPathSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Dark golden gong chime
    const freqs = [110, 146.83, 220, 311.13]; // Tritone sinister chord
    freqs.forEach((f) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 1.6);
    });
  }

  public playUiClickSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playStartRunSfx(): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    this.playPortalAscendSfx();
  }

  // --- VOLUME CONTROLS ---
  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1.0, this.ctx.currentTime);
    }
    this.notify();
    return this.muted;
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
    this.notify();
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
    this.notify();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public getCurrentTheme(): AudioTheme {
    return this.currentTheme;
  }
}

export const audioManager = new AudioManagerClass();
