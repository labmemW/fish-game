export class AudioSystem {
  constructor(config) {
    this.config = config;
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.fxGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
    this.disabled = false;
  }

  async resume() {
    this.ensureContext();

    if (!this.context) {
      return;
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    this.ensureContext();

    if (!this.context) {
      return;
    }

    this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.02);

    if (muted) {
      this.stopMusic();
    }
  }

  startMusic() {
    this.ensureContext();

    if (!this.context) {
      return;
    }

    if (this.muted || this.musicTimer) {
      return;
    }

    this.playMusicNote();
    this.musicTimer = window.setInterval(
      () => this.playMusicNote(),
      this.config.music.stepMs,
    );
  }

  stopMusic() {
    if (!this.musicTimer) {
      return;
    }

    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  playStart() {
    this.playNotes([
      [440, 0, 0.08, 0.08],
      [660, 0.08, 0.1, 0.08],
    ]);
  }

  playEat(size) {
    const lift = Math.min(180, size * 42);
    this.playNotes([
      [620 + lift, 0, 0.05, 0.07],
      [840 + lift, 0.055, 0.08, 0.055],
    ]);
  }

  playWin() {
    this.playNotes([
      [523.25, 0, 0.12, 0.08],
      [659.25, 0.1, 0.12, 0.08],
      [783.99, 0.2, 0.18, 0.08],
      [1046.5, 0.36, 0.28, 0.065],
    ]);
  }

  playLose() {
    this.playNotes([
      [220, 0, 0.16, 0.08],
      [185, 0.13, 0.18, 0.075],
      [146.83, 0.28, 0.25, 0.07],
    ], "sawtooth");
  }

  playPause() {
    this.playNotes([[330, 0, 0.08, 0.05]]);
  }

  playResume() {
    this.playNotes([[494, 0, 0.08, 0.05]]);
  }

  ensureContext() {
    if (this.context || this.disabled) {
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      this.disabled = true;
      return;
    }

    try {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.fxGain = this.context.createGain();
    } catch {
      this.disabled = true;
      this.context = null;
      return;
    }

    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.musicGain.gain.value = this.config.music.volume;
    this.fxGain.gain.value = this.config.effects.volume;
    this.musicGain.connect(this.masterGain);
    this.fxGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
  }

  playMusicNote() {
    if (this.muted) {
      return;
    }

    const note = this.config.music.notes[this.musicStep % this.config.music.notes.length];
    this.musicStep += 1;

    if (!note) {
      return;
    }

    this.playTone(note, 0, this.config.music.noteDuration, 1, "sine", this.musicGain);
  }

  playNotes(notes, type = "triangle") {
    if (this.muted) {
      return;
    }

    this.ensureContext();

    if (!this.context) {
      return;
    }

    for (const [frequency, delay, duration, gain] of notes) {
      this.playTone(frequency, delay, duration, gain, type, this.fxGain);
    }
  }

  playTone(frequency, delay, duration, gain, type, destination) {
    this.ensureContext();

    if (!this.context) {
      return;
    }

    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const noteGain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.018);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(noteGain);
    noteGain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }
}
