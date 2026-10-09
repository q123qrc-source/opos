/**
 * OPOS generative audio engine.
 *
 * Every track is synthesized in real time with the Web Audio API (drums, bass, pads, arpeggios), so
 * Music, the Floating Player and media keys work fully offline with no bundled audio assets.
 * A shared AnalyserNode feeds the visualizers.
 */
import { create } from 'zustand';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  bpm: number;
  root: number; // MIDI note
  scale: keyof typeof SCALES;
  progression: number[]; // scale degrees, one per bar
  style: 'house' | 'lofi' | 'ambient' | 'synthwave' | 'breaks';
  colors: [string, string];
  duration: number; // seconds
}

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const TRACKS: Track[] = [
  { id: 't1', title: 'Neon Cascade', artist: 'Vela Drift', album: 'Afterglow City', bpm: 122, root: 45, scale: 'minor', progression: [0, 5, 3, 4], style: 'house', colors: ['#7c3aed', '#ec4899'], duration: 168 },
  { id: 't2', title: 'Paper Lanterns', artist: 'Moku', album: 'Late Tea', bpm: 82, root: 50, scale: 'dorian', progression: [0, 3, 4, 2], style: 'lofi', colors: ['#f59e0b', '#b45309'], duration: 150 },
  { id: 't3', title: 'Low Orbit', artist: 'Halcyon Array', album: 'Satellites', bpm: 70, root: 40, scale: 'lydian', progression: [0, 1, 4, 3], style: 'ambient', colors: ['#0ea5e9', '#1e3a8a'], duration: 190 },
  { id: 't4', title: 'Chrome Highway', artist: 'Night Coupe', album: 'Overdrive', bpm: 104, root: 42, scale: 'minor', progression: [0, 6, 5, 4], style: 'synthwave', colors: ['#f43f5e', '#6d28d9'], duration: 176 },
  { id: 't5', title: 'Rainmaker', artist: 'Sora Lines', album: 'Monsoon', bpm: 136, root: 47, scale: 'minor', progression: [0, 3, 5, 4], style: 'breaks', colors: ['#10b981', '#0f766e'], duration: 160 },
  { id: 't6', title: 'Golden Hour', artist: 'Vela Drift', album: 'Afterglow City', bpm: 118, root: 48, scale: 'major', progression: [0, 4, 5, 3], style: 'house', colors: ['#fbbf24', '#f97316'], duration: 172 },
  { id: 't7', title: 'Velvet Static', artist: 'Moku', album: 'Late Tea', bpm: 76, root: 43, scale: 'minor', progression: [0, 5, 2, 6], style: 'lofi', colors: ['#a78bfa', '#4338ca'], duration: 144 },
  { id: 't8', title: 'Glass Gardens', artist: 'Halcyon Array', album: 'Satellites', bpm: 64, root: 52, scale: 'major', progression: [0, 3, 1, 4], style: 'ambient', colors: ['#5eead4', '#0369a1'], duration: 210 },
];

interface AudioState {
  playing: boolean;
  index: number;
  position: number;
  shuffle: boolean;
  repeat: boolean;
  volume: number;
  liked: string[];
}

export const useAudio = create<AudioState>(() => ({
  playing: false,
  index: 0,
  position: 0,
  shuffle: false,
  repeat: false,
  volume: 0.8,
  liked: ['t1', 't4'],
}));

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Pattern = { kick: string; snare: string; hat: string; bass: string; arp: boolean; pad: boolean; swing: number };
const PATTERNS: Record<Track['style'], Pattern> = {
  house: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: '..x...x...x.x.x.', arp: true, pad: true, swing: 0 },
  lofi: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.....x...x.....', arp: false, pad: true, swing: 0.18 },
  ambient: { kick: '................', snare: '................', hat: '................', bass: 'x...............', arp: true, pad: true, swing: 0 },
  synthwave: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', arp: true, pad: true, swing: 0 },
  breaks: { kick: 'x.........x.....', snare: '....x..x.x..x...', hat: 'xxx.xxx.xxx.xxxx', bass: 'x..x..x...x..x..', arp: false, pad: true, swing: 0.05 },
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  analyser: AnalyserNode | null = null;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private startedAt = 0; // ctx time corresponding to position 0
  private lastUiUpdate = 0;

  get track(): Track {
    return TRACKS[useAudio.getState().index];
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = useAudio.getState().volume * 0.6;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.comp.connect(this.master).connect(this.analyser).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  setVolume(v: number) {
    useAudio.setState({ volume: v });
    if (this.ctx) this.master.gain.setTargetAtTime(v * 0.6, this.ctx.currentTime, 0.05);
  }

  play() {
    const ctx = this.ensure();
    void ctx.resume();
    if (this.timer != null) return;
    const pos = useAudio.getState().position;
    const stepDur = 60 / this.track.bpm / 4;
    this.step = Math.floor(pos / stepDur);
    this.nextTime = ctx.currentTime + 0.06;
    this.startedAt = this.nextTime - this.step * stepDur;
    this.timer = window.setInterval(() => this.tick(), 25);
    useAudio.setState({ playing: true });
    this.updateMediaSession();
  }

  pause() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    useAudio.setState({ playing: false });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  toggle() {
    if (useAudio.getState().playing) this.pause();
    else this.play();
  }

  load(index: number, autoplay = true) {
    const wasPlaying = useAudio.getState().playing;
    this.pause();
    useAudio.setState({ index: (index + TRACKS.length) % TRACKS.length, position: 0 });
    if (autoplay || wasPlaying) this.play();
    this.updateMediaSession();
  }

  next() {
    const { shuffle, index } = useAudio.getState();
    const nextIndex = shuffle ? Math.floor(Math.random() * TRACKS.length) : index + 1;
    this.load(nextIndex, true);
  }

  previous() {
    if (useAudio.getState().position > 4) this.seek(0);
    else this.load(useAudio.getState().index - 1, true);
  }

  seek(seconds: number) {
    const playing = useAudio.getState().playing;
    this.pause();
    useAudio.setState({ position: Math.max(0, Math.min(this.track.duration, seconds)) });
    if (playing) this.play();
  }

  toggleLike(id: string) {
    const liked = useAudio.getState().liked;
    useAudio.setState({ liked: liked.includes(id) ? liked.filter((x) => x !== id) : [...liked, id] });
  }

  private tick() {
    const ctx = this.ctx!;
    const track = this.track;
    const stepDur = 60 / track.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime, track, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
    const position = Math.max(0, ctx.currentTime - this.startedAt);
    if (position >= track.duration) {
      if (useAudio.getState().repeat) this.load(useAudio.getState().index, true);
      else this.next();
      return;
    }
    if (ctx.currentTime - this.lastUiUpdate > 0.25) {
      this.lastUiUpdate = ctx.currentTime;
      useAudio.setState({ position });
    }
  }

  private degreeToMidi(track: Track, degree: number) {
    const scale = SCALES[track.scale];
    const octave = Math.floor(degree / scale.length);
    return track.root + scale[((degree % scale.length) + scale.length) % scale.length] + 12 * octave;
  }

  private scheduleStep(step: number, t: number, track: Track, stepDur: number) {
    const p = PATTERNS[track.style];
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const time = t + (s % 2 === 1 ? p.swing * stepDur : 0);
    const chordDegree = track.progression[bar % track.progression.length];
    // Arrangement: intro (bars 0-3) without drums, fade drums in.
    const drumsOn = bar >= 4 || track.style === 'lofi';

    if (drumsOn && p.kick[s] === 'x') this.kick(time);
    if (drumsOn && p.snare[s] === 'x') this.snare(time);
    if (drumsOn && p.hat[s] === 'x') this.hat(time, s % 4 === 2 ? 0.16 : 0.08);
    if (p.bass[s] === 'x') this.bass(time, mtof(this.degreeToMidi(track, chordDegree) - 12), stepDur * (track.style === 'ambient' ? 14 : 1.6));
    if (p.pad && s === 0) {
      const notes = [0, 2, 4, 6].map((o) => mtof(this.degreeToMidi(track, chordDegree + o) + 12));
      this.pad(time, notes, stepDur * 16, track.style === 'ambient' ? 0.05 : 0.032);
    }
    if (p.arp && bar >= 2 && s % 2 === 0) {
      const seq = [0, 2, 4, 7, 4, 2, 4, 9];
      const n = this.degreeToMidi(track, chordDegree + seq[(s / 2) % seq.length]) + 24;
      this.pluck(time, mtof(n), stepDur * 1.8, track.style === 'ambient' ? 0.025 : 0.045);
    }
  }

  private envGain(t: number, attack: number, decay: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.envGain(t, 0.002, 0.32, 0.9);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + 0.4);
  }

  private snare(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.envGain(t, 0.002, 0.16, 0.35);
    src.connect(f).connect(g).connect(this.comp);
    src.start(t);
    src.stop(t + 0.2);
  }

  private hat(t: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = this.envGain(t, 0.001, 0.05, level);
    src.connect(f).connect(g).connect(this.comp);
    src.start(t);
    src.stop(t + 0.08);
  }

  private bass(t: number, freq: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = this.envGain(t, 0.01, dur, 0.28);
    o.connect(f).connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(t: number, freqs: number[], dur: number, level: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    f.connect(g).connect(this.comp);
    for (const freq of freqs) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  private pluck(t: number, freq: number, dur: number, level: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = this.envGain(t, 0.004, dur, level);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const tr = this.track;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: tr.title, artist: tr.artist, album: tr.album });
      navigator.mediaSession.playbackState = useAudio.getState().playing ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    } catch {
      /* MediaSession not fully supported */
    }
  }
}

export const audio = new AudioEngine();

export const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
