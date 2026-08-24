import { getSoundscapeProfile, type SoundscapeId, type SoundscapeProfile } from "./audio-profiles";

export type GameSound = "inspect" | "question" | "contradiction" | "solved" | "replay" | "knock";

type StoppableSource = AudioScheduledSourceNode & { stop(when?: number): void };

export class AudioEngine {
  private readonly profile: SoundscapeProfile;
  private context?: AudioContext;
  private master?: GainNode;
  private ambientGain?: GainNode;
  private ambientSources: StoppableSource[] = [];
  private ambientTimer?: ReturnType<typeof setInterval>;
  private ambientEnabled = false;
  private muted = false;
  private pageHidden = false;
  private effectsVolume = 0.45;
  private ambientVolume = 0.16;

  constructor(soundscape: SoundscapeId | string = "cold-room", presentationLayoutId?: string) {
    this.profile = getSoundscapeProfile(soundscape, presentationLayoutId);
  }

  static isSupported() {
    return typeof globalThis.AudioContext !== "undefined";
  }

  get soundscape() {
    return this.profile;
  }

  private ensureContext(): AudioContext | undefined {
    if (!this.context) {
      if (!AudioEngine.isSupported()) return undefined;
      try {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.context.destination);
      } catch {
        this.context = undefined;
        this.master = undefined;
        return undefined;
      }
    }
    if (this.context.state === "suspended" && !this.pageHidden) void this.context.resume().catch(() => undefined);
    return this.context;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.master.context.currentTime, 0.025);
    this.syncAmbient();
  }

  setEffectsVolume(volume: number) {
    this.effectsVolume = Math.max(0, Math.min(1, volume));
  }

  setAmbientVolume(volume: number) {
    this.ambientVolume = Math.max(0, Math.min(0.5, volume));
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(this.ambientVolume, this.ambientGain.context.currentTime, 0.12);
  }

  setPageHidden(hidden: boolean) {
    this.pageHidden = hidden;
    if (hidden) {
      this.stopAmbient();
      void this.context?.suspend().catch(() => undefined);
    } else {
      void this.context?.resume().catch(() => undefined);
      this.syncAmbient();
    }
  }

  toggleAmbient(enabled: boolean) {
    this.ambientEnabled = enabled;
    this.syncAmbient();
  }

  private syncAmbient() {
    const shouldPlay = this.ambientEnabled && !this.muted && !this.pageHidden;
    if (!shouldPlay) {
      this.stopAmbient();
      return;
    }
    if (this.ambientSources.length === 0) this.startAmbient();
  }

  private startAmbient() {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const bus = context.createGain();
    bus.gain.value = this.ambientVolume;
    bus.connect(this.master);
    this.ambientGain = bus;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.max(110, this.profile.baseFrequency * 7);
    filter.Q.value = 0.6;
    filter.connect(bus);

    const base = context.createOscillator();
    base.type = "sine";
    base.frequency.value = this.profile.baseFrequency;
    const baseGain = context.createGain();
    baseGain.gain.value = 0.055;
    base.connect(baseGain).connect(filter);

    const harmonic = context.createOscillator();
    harmonic.type = this.profile.pulseWave === "square" ? "triangle" : this.profile.pulseWave;
    harmonic.frequency.value = this.profile.harmonicFrequency;
    harmonic.detune.value = -4;
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.012;
    harmonic.connect(harmonicGain).connect(filter);

    const modulation = context.createOscillator();
    modulation.type = "sine";
    modulation.frequency.value = this.profile.modulationFrequency;
    const modulationGain = context.createGain();
    modulationGain.gain.value = 0.014;
    modulation.connect(modulationGain).connect(baseGain.gain);

    const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let seed = [...this.profile.signature].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
    for (let index = 0; index < samples.length; index += 1) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      samples[index] = ((seed / 0xffffffff) * 2 - 1) * 0.7;
    }
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = this.profile.noiseFilter;
    noiseFilter.frequency.value = this.profile.noiseFrequency;
    noiseFilter.Q.value = 0.7;
    const noiseGain = context.createGain();
    noiseGain.gain.value = this.profile.noiseGain;
    noise.connect(noiseFilter).connect(noiseGain).connect(bus);

    const now = context.currentTime;
    for (const source of [base, harmonic, modulation, noise]) source.start(now);
    this.ambientSources = [base, harmonic, modulation, noise];
    this.ambientTimer = setInterval(() => this.playAmbientPulse(), this.profile.pulseSeconds * 1000);
  }

  private playAmbientPulse() {
    if (!this.ambientEnabled || this.muted || this.pageHidden) return;
    const context = this.ensureContext();
    if (!context || !this.ambientGain) return;
    const now = context.currentTime;
    this.profile.pulseFrequencies.forEach((frequency, index) => {
      this.createTone(frequency, now + index * 0.09, 0.11 + index * 0.025, 0.014, this.profile.pulseWave, this.ambientGain!);
    });
  }

  private stopAmbient() {
    if (this.ambientTimer) clearInterval(this.ambientTimer);
    this.ambientTimer = undefined;
    for (const source of this.ambientSources) {
      try { source.stop(); } catch { /* The source may already be stopped during teardown. */ }
      source.disconnect();
    }
    this.ambientSources = [];
    this.ambientGain?.disconnect();
    this.ambientGain = undefined;
  }

  private createTone(frequency: number, start: number, duration: number, level: number, wave: OscillatorType, destination: AudioNode) {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, level), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  play(sound: GameSound) {
    if (this.muted || this.pageHidden) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const ratio = this.profile.effectRatio;
    const tones: Record<GameSound, Array<[number, number, number]>> = {
      inspect: [[380, 0, 0.08], [570, 0.07, 0.1]],
      question: [[240, 0, 0.07]],
      contradiction: [[150, 0, 0.16], [118, 0.12, 0.2]],
      solved: [[220, 0, 0.16], [330, 0.12, 0.18], [495, 0.26, 0.42]],
      replay: [[294, 0, 0.09], [392, 0.08, 0.16]],
      knock: [[78, 0, 0.08], [78, 0.18, 0.08], [78, 0.36, 0.08]],
    };
    const wave: OscillatorType = sound === "knock" || sound === "contradiction" ? "triangle" : sound === "inspect" ? this.profile.pulseWave : "sine";
    for (const [frequency, delay, duration] of tones[sound]) {
      this.createTone(frequency * ratio, context.currentTime + delay, duration, this.effectsVolume * 0.18, wave, this.master);
    }
  }

  dispose() {
    this.stopAmbient();
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
  }
}
