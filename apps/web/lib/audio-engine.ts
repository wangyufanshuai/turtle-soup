export type GameSound = "inspect" | "question" | "contradiction" | "solved" | "knock";

export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private ambient?: OscillatorNode;
  private ambientGain?: GainNode;
  private muted = false;
  private effectsVolume = 0.45;
  private ambientVolume = 0.16;

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.master.context.currentTime, 0.02);
  }

  setEffectsVolume(volume: number) {
    this.effectsVolume = Math.max(0, Math.min(1, volume));
  }

  setAmbientVolume(volume: number) {
    this.ambientVolume = Math.max(0, Math.min(1, volume));
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(this.ambientVolume, this.ambientGain.context.currentTime, 0.08);
  }

  toggleAmbient(enabled: boolean) {
    if (!enabled) {
      this.ambient?.stop();
      this.ambient = undefined;
      this.ambientGain = undefined;
      return;
    }
    if (this.ambient || this.muted) return;
    const context = this.ensureContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = "sine";
    oscillator.frequency.value = 43;
    filter.type = "lowpass";
    filter.frequency.value = 90;
    gain.gain.value = this.ambientVolume;
    oscillator.connect(filter).connect(gain).connect(this.master!);
    oscillator.start();
    this.ambient = oscillator;
    this.ambientGain = gain;
  }

  play(sound: GameSound) {
    if (this.muted) return;
    const context = this.ensureContext();
    const now = context.currentTime;
    const tones: Record<GameSound, Array<[number, number, number]>> = {
      inspect: [[380, 0, 0.08], [570, 0.07, 0.1]],
      question: [[240, 0, 0.07]],
      contradiction: [[150, 0, 0.16], [118, 0.12, 0.2]],
      solved: [[220, 0, 0.16], [330, 0.12, 0.18], [495, 0.26, 0.42]],
      knock: [[78, 0, 0.08], [78, 0.18, 0.08], [78, 0.36, 0.08]],
    };
    for (const [frequency, delay, duration] of tones[sound]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === "knock" || sound === "contradiction" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, this.effectsVolume * 0.18), now + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.02);
    }
  }

  dispose() {
    this.ambient?.stop();
    void this.context?.close();
  }
}
