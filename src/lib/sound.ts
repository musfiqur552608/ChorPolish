type SoundName =
  | 'click'
  | 'shuffle'
  | 'flip'
  | 'peek'
  | 'gavel'
  | 'cheer'
  | 'oops'
  | 'tick'
  | 'write'
  | 'join'
  | 'win';

class SoundEngine {
  private context: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    try {
      if (!this.context) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.context = new Ctor();
      }
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }

  private tone(
    context: AudioContext,
    options: {
      frequency: number;
      duration: number;
      type?: OscillatorType;
      volume?: number;
      delay?: number;
      endFrequency?: number;
    },
  ): void {
    const { frequency, duration, type = 'sine', volume = 0.06, delay = 0, endFrequency } = options;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private noise(
    context: AudioContext,
    duration: number,
    volume: number,
    bandFrequency: number,
    delay = 0,
  ): void {
    const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = bandFrequency;
    filter.Q.value = 0.65;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(context.currentTime + delay);
  }

  play(name: SoundName): void {
    const context = this.getContext();
    if (!context) return;
    try {
      switch (name) {
        case 'click':
          this.tone(context, { frequency: 420, duration: 0.05, type: 'triangle', volume: 0.025 });
          break;
        case 'flip':
          this.noise(context, 0.08, 0.04, 2600);
          this.tone(context, { frequency: 540, endFrequency: 310, duration: 0.12, type: 'triangle', volume: 0.04 });
          break;
        case 'peek':
          this.tone(context, { frequency: 620, endFrequency: 780, duration: 0.16, volume: 0.035 });
          break;
        case 'shuffle':
          this.noise(context, 0.22, 0.055, 1800);
          this.noise(context, 0.18, 0.04, 2800, 0.18);
          this.noise(context, 0.13, 0.035, 1300, 0.32);
          break;
        case 'gavel':
          this.tone(context, { frequency: 120, endFrequency: 55, duration: 0.25, type: 'sine', volume: 0.11 });
          this.noise(context, 0.06, 0.045, 700);
          break;
        case 'cheer':
          [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
            this.tone(context, {
              frequency,
              duration: 0.24,
              type: 'triangle',
              volume: 0.045,
              delay: index * 0.1,
            });
          });
          break;
        case 'win':
          [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
            this.tone(context, {
              frequency,
              duration: 0.32,
              type: 'triangle',
              volume: 0.045,
              delay: index * 0.12,
            });
          });
          break;
        case 'oops':
          this.tone(context, { frequency: 320, endFrequency: 220, duration: 0.2, type: 'sawtooth', volume: 0.035 });
          this.tone(context, {
            frequency: 250,
            endFrequency: 160,
            duration: 0.26,
            type: 'sawtooth',
            volume: 0.03,
            delay: 0.18,
          });
          break;
        case 'tick':
          this.tone(context, { frequency: 720, duration: 0.03, type: 'square', volume: 0.015 });
          break;
        case 'write':
          this.noise(context, 0.1, 0.018, 3200);
          break;
        case 'join':
          this.tone(context, { frequency: 523, duration: 0.12, volume: 0.03 });
          this.tone(context, { frequency: 784, duration: 0.16, volume: 0.03, delay: 0.1 });
          break;
      }
    } catch {
      // Audio is decorative; never break a turn because of it.
    }
  }
}

export const sound = new SoundEngine();
export type { SoundName };
