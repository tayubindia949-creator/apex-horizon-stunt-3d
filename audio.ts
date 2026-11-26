/**
 * 100% Procedural Web Audio API sound synthesizer for engine RPM, nitro boost,
 * tire drift screech, coin pickups, stunt ring passes, ramp launches, and UI feedback.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private nitroGain: GainNode | null = null;
  private driftGain: GainNode | null = null;
  private isMuted = false;
  private isAdMuted = false;
  private isRunning = false;

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.syncMasterGain();
  }

  public setAdMuted(muted: boolean) {
    this.isAdMuted = muted;
    this.syncMasterGain();
  }

  private syncMasterGain() {
    if (!this.masterGain || !this.ctx) return;
    const target = this.isMuted || this.isAdMuted ? 0 : 0.45;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  public unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted || this.isAdMuted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    // Engine dual-oscillator synth routed through warm lowpass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 2.2;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = 110;

    this.engineOsc1.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

    // Procedural noise buffer for Nitro jet + Tire screech
    const bufferSize = this.ctx.sampleRate * 1.5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const nitroSource = this.ctx.createBufferSource();
    nitroSource.buffer = noiseBuffer;
    nitroSource.loop = true;
    const nitroFilter = this.ctx.createBiquadFilter();
    nitroFilter.type = 'bandpass';
    nitroFilter.frequency.value = 650;
    nitroFilter.Q.value = 1.4;
    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.value = 0;
    nitroSource.connect(nitroFilter);
    nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.masterGain);
    nitroSource.start();

    const driftSource = this.ctx.createBufferSource();
    driftSource.buffer = noiseBuffer;
    driftSource.loop = true;
    const driftFilter = this.ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 1750;
    driftFilter.Q.value = 6.5;
    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.value = 0;
    driftSource.connect(driftFilter);
    driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    driftSource.start();

    this.isRunning = true;
  }

  public updateDrivingAudio(active: boolean, speedRatio: number, throttle: boolean, nitro: boolean, driftIntensity: number) {
    if (!this.ctx || !this.isRunning) return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
      this.driftGain?.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const rpmFreq = 46 + speedRatio * 115 + (nitro ? 32 : 0) + (throttle ? 12 : 0);
    this.engineOsc1?.frequency.setTargetAtTime(rpmFreq, now, 0.06);
    this.engineOsc2?.frequency.setTargetAtTime(rpmFreq * 1.98, now, 0.06);
    this.engineGain?.gain.setTargetAtTime(0.12 + (throttle ? 0.07 : 0.02), now, 0.08);

    this.nitroGain?.gain.setTargetAtTime(nitro ? 0.22 : 0, now, 0.04);
    this.driftGain?.gain.setTargetAtTime(Math.min(0.14, driftIntensity * 0.14), now, 0.05);
  }

  public playCoin() {
    this.playTone(987.77, 1318.5, 0.09, 'sine', 0.22);
  }

  public playRing() {
    this.playTone(523.25, 1046.5, 0.22, 'triangle', 0.28);
  }

  public playCheckpoint() {
    this.playTone(659.25, 880, 0.18, 'sine', 0.24);
  }

  public playRampLaunch() {
    this.playTone(220, 580, 0.24, 'sawtooth', 0.14);
  }

  public playLanding(impactStrength: number) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.14);
    gain.gain.setValueAtTime(Math.min(0.35, impactStrength * 0.25), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playMissionComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, freq * 1.02, 0.18, 'triangle', 0.25), idx * 95);
    });
  }

  public playClick() {
    this.playTone(640, 720, 0.04, 'sine', 0.12);
  }

  private playTone(startFreq: number, endFreq: number, duration: number, type: OscillatorType, volume: number) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public dispose() {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.ctx?.close();
    } catch {
      // Ignore audio cleanup errors on unmount
    }
    this.ctx = null;
  }
}
