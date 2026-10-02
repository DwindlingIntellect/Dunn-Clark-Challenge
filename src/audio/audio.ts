import type { SurfaceKind } from '../sim/types';

/**
 * All sound is synthesised with the Web Audio API — no audio files.
 *
 * Continuous layers (wind, slide scrape, drone) are long-lived nodes whose
 * gains are steered every frame; one-shots (footsteps, landings, chimes,
 * the bell) are short node graphs created on demand.
 *
 * The AudioContext is created lazily on the first user gesture (browsers
 * refuse to start audio before one).
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private scrapeGain!: GainNode;
  private scrapeFilter!: BiquadFilterNode;
  private droneGain!: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private droneFilter!: BiquadFilterNode;
  private volume = 0.7;
  private droneHz = 55;
  private time = 0;

  /** Call from a user-gesture handler (click / keydown). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // Gentle limiter so stacked one-shots never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    // Shared white-noise buffer.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Wind: looping noise through a moving band-pass.
    const wind = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Slide scrape: brighter, narrower noise.
    const scrape = this.loopNoise();
    this.scrapeFilter = ctx.createBiquadFilter();
    this.scrapeFilter.type = 'bandpass';
    this.scrapeFilter.frequency.value = 1800;
    this.scrapeFilter.Q.value = 2.5;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    scrape.connect(this.scrapeFilter).connect(this.scrapeGain).connect(this.master);

    // Drone: detuned low oscillators through a slowly breathing low-pass.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 3;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain).connect(this.master);
    this.setDrone(this.droneHz);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start();
    return src;
  }

  /** Switch the ambient drone to a course's root note. */
  setDrone(hz: number): void {
    this.droneHz = hz;
    const ctx = this.ctx;
    if (!ctx) return;
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    this.droneOscs = [];
    const parts: [number, OscillatorType, number][] = [
      [1, 'sawtooth', 0.32],
      [1.0045, 'sawtooth', 0.28],
      [1.5, 'triangle', 0.22],
      [2.01, 'sine', 0.12],
      [0.5, 'sine', 0.4],
    ];
    for (const [ratio, type, amp] of parts) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz * ratio;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(this.droneFilter);
      o.start();
      this.droneOscs.push(o);
    }
  }

  /** Steer continuous layers. Call every frame. */
  update(dt: number, state: { speed: number; sliding: boolean; airborne: boolean; playing: boolean }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.time += dt;
    const t = ctx.currentTime;
    const s = Math.min(1, Math.max(0, (state.speed - 3) / 17));
    const windTarget = state.playing ? 0.02 + s * s * 0.32 + (state.airborne ? 0.04 : 0) : 0.015;
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(250 + s * 1400 + Math.sin(this.time * 0.7) * 60, t, 0.2);
    const scrapeTarget = state.playing && state.sliding ? 0.06 + Math.min(1, state.speed / 18) * 0.16 : 0;
    this.scrapeGain.gain.setTargetAtTime(scrapeTarget, t, 0.04);
    this.scrapeFilter.frequency.setTargetAtTime(1200 + state.speed * 70, t, 0.05);
    this.droneGain.gain.setTargetAtTime(0.11, t, 1.5);
    this.droneFilter.frequency.setTargetAtTime(200 + 90 * (1 + Math.sin(this.time * 0.13)), t, 0.5);
  }

  // ------------------------------------------------------------- one-shots

  private env(g: GainNode, peak: number, attack: number, decay: number, at: number): void {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  private noiseBurst(filterType: BiquadFilterType, freq: number, q: number, peak: number, decay: number, at = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, peak, 0.003, decay, t);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5, decay + 0.05);
  }

  private tone(freq: number, type: OscillatorType, peak: number, decay: number, at = 0, attack = 0.004): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, peak, attack, decay, t);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  footstep(surface: SurfaceKind, speed: number): void {
    if (!this.ready) return;
    const v = 0.25 + Math.min(1, speed / 12) * 0.35;
    const jitter = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'wood':
        this.noiseBurst('bandpass', 420 * jitter, 3, v * 0.9, 0.09);
        this.tone(110 * jitter, 'sine', v * 0.5, 0.08);
        break;
      case 'iron':
        this.noiseBurst('highpass', 2500, 1, v * 0.4, 0.04);
        this.tone(880 * jitter, 'triangle', v * 0.18, 0.25);
        this.tone(1310 * jitter, 'sine', v * 0.12, 0.2);
        break;
      case 'glass':
        this.tone(2400 * jitter, 'sine', v * 0.2, 0.12);
        this.noiseBurst('highpass', 4000, 1, v * 0.3, 0.03);
        break;
      default:
        // Stone: short gritty click plus a soft low knock.
        this.noiseBurst('bandpass', 1500 * jitter, 1.2, v * 0.7, 0.05);
        this.noiseBurst('lowpass', 300, 1, v * 0.5, 0.07);
    }
  }

  land(fallSpeed: number, surface: SurfaceKind): void {
    if (!this.ready || fallSpeed < 2) return;
    const v = Math.min(1, fallSpeed / 18);
    this.noiseBurst('lowpass', 220 + v * 200, 1, 0.3 + v * 0.6, 0.12 + v * 0.15);
    this.footstep(surface, 8);
  }

  jump(): void {
    if (!this.ready) return;
    this.noiseBurst('bandpass', 900, 0.8, 0.18, 0.08);
  }

  whoosh(): void {
    if (!this.ready) return;
    this.noiseBurst('bandpass', 700, 0.6, 0.3, 0.25);
  }

  mantle(): void {
    if (!this.ready) return;
    this.noiseBurst('bandpass', 600, 1.5, 0.3, 0.12);
    this.noiseBurst('bandpass', 1100, 1.5, 0.2, 0.1, 0.12);
  }

  /** Lantern lit: a small bright chime. */
  chime(): void {
    if (!this.ready) return;
    const base = 1046.5;
    [1, 1.5, 2, 3.01].forEach((r, i) => this.tone(base * r, 'sine', 0.22 / (i + 1), 1.4 - i * 0.25, i * 0.02));
    this.tone(base * 0.5, 'triangle', 0.1, 0.6);
  }

  /** The great bell at the finish: inharmonic church-bell partials with long decays. */
  bell(): void {
    if (!this.ready) return;
    const f = 98;
    const partials: [number, number, number][] = [
      // ratio, amplitude, decay seconds (hum, prime, tierce, quint, nominal, upper partials)
      [0.5, 0.5, 9],
      [1, 0.45, 6],
      [1.183, 0.3, 4.5],
      [1.506, 0.22, 3.5],
      [2, 0.35, 3.2],
      [2.514, 0.14, 2.2],
      [2.662, 0.12, 2],
      [3.011, 0.1, 1.6],
      [4.166, 0.07, 1.1],
      [5.433, 0.05, 0.8],
    ];
    for (const [r, a, d] of partials) {
      this.tone(f * r, 'sine', a * 0.5, d, 0, 0.008);
      this.tone(f * r * 1.0021, 'sine', a * 0.25, d * 0.9, 0, 0.008);
    }
    this.noiseBurst('bandpass', 1800, 0.8, 0.5, 0.15);
    // Second, softer toll.
    for (const [r, a, d] of partials.slice(0, 6)) this.tone(f * r, 'sine', a * 0.25, d * 0.8, 2.6, 0.01);
  }

  respawn(): void {
    if (!this.ready) return;
    this.tone(65, 'sine', 0.3, 0.8);
    this.noiseBurst('lowpass', 400, 1, 0.25, 0.5);
  }
}
