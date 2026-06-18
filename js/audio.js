// Web Audio API Procedural Sound Synthesizer for ARCHIPELAGO Menu

let audioCtx = null;
let droneOscs = [];
let droneGain = null;
let droneFilter = null;
let filterLfo = null;
let isMuted = localStorage.getItem('game_audio_muted') === 'true';

// Initialize Audio Context on first interaction
function initAudio() {
  if (audioCtx) return;
  // Support standard and webkit audio context
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

export function setMute(muted) {
  isMuted = muted;
  localStorage.setItem('game_audio_muted', muted);
  if (muted) {
    stopDrone();
  } else {
    // If blocker is active (not pointer locked), start drone
    const blocker = document.getElementById('blocker');
    if (blocker && blocker.style.display !== 'none') {
      startDrone();
    }
  }
}

export function getMuted() {
  return isMuted;
}

// Low ambient space drone (riser / pad chord)
export function startDrone() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Prevent double drones
  if (droneOscs.length > 0) return;

  // Master Gain for Drone
  droneGain = audioCtx.createGain();
  droneGain.gain.setValueAtTime(0, audioCtx.currentTime);
  // Fade in over 2 seconds
  droneGain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 2.0);

  // Bi-quad filter for warm, dark sound
  droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.Q.setValueAtTime(4.0, audioCtx.currentTime);
  droneFilter.frequency.setValueAtTime(180, audioCtx.currentTime);

  // LFO to modulate filter cutoff (creates movement)
  filterLfo = audioCtx.createOscillator();
  filterLfo.frequency.setValueAtTime(0.15, audioCtx.currentTime); // very slow 0.15 Hz
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(80, audioCtx.currentTime); // sweep filter frequency +/- 80 Hz

  filterLfo.connect(lfoGain);
  lfoGain.connect(droneFilter.frequency);
  filterLfo.start();

  // Create additive oscillators for chord: Root (55Hz), 5th (82.4Hz), Octave (110Hz)
  const frequencies = [55.0, 82.4, 110.0, 164.8];
  const types = ['sawtooth', 'triangle', 'sawtooth', 'triangle'];
  const gains = [0.4, 0.6, 0.3, 0.2];

  frequencies.forEach((freq, index) => {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    osc.type = types[index];
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    // Detune slightly for chorus effect
    osc.detune.setValueAtTime((Math.random() - 0.5) * 12, audioCtx.currentTime);
    
    oscGain.gain.setValueAtTime(gains[index], audioCtx.currentTime);
    
    osc.connect(oscGain);
    oscGain.connect(droneFilter);
    osc.start();
    
    droneOscs.push(osc);
  });

  droneFilter.connect(droneGain);
  droneGain.connect(audioCtx.destination);
}

// Fade out and stop ambient drone
export function stopDrone() {
  if (!audioCtx) return;

  const currentGain = droneGain;
  const currentOscs = [...droneOscs];
  const currentLfo = filterLfo;

  // Clear references immediately to prevent race conditions
  droneOscs = [];
  droneGain = null;
  droneFilter = null;
  filterLfo = null;

  if (currentGain) {
    // Fade out over 1.2 seconds
    currentGain.gain.cancelScheduledValues(audioCtx.currentTime);
    currentGain.gain.setValueAtTime(currentGain.gain.value, audioCtx.currentTime);
    currentGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
    
    setTimeout(() => {
      currentOscs.forEach(o => {
        try { o.stop(); } catch(e) {}
      });
      if (currentLfo) {
        try { currentLfo.stop(); } catch(e) {}
      }
      try { currentGain.disconnect(); } catch(e) {}
    }, 1300);
  }
}

// High-tech UI hover click (sonar-like beep)
export function playHover() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = 'sine';
  // Fast frequency sweep down (pitch drop) to sound clicky
  osc.frequency.setValueAtTime(1200, time);
  osc.frequency.exponentialRampToValueAtTime(300, time + 0.12);

  filter.type = 'highpass';
  filter.frequency.setValueAtTime(400, time);

  gain.gain.setValueAtTime(0.08, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + 0.15);
}

// Clean, deeper select beep (click)
export function playSelect() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(350, time);
  osc.frequency.exponentialRampToValueAtTime(100, time + 0.2);

  gain.gain.setValueAtTime(0.18, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + 0.22);
}

// REACTOR HOVER: Rising power-up tone
let coreHoverOsc = null;
let coreHoverGain = null;

export function startCoreHover() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (coreHoverOsc) return;

  const time = audioCtx.currentTime;
  coreHoverOsc = audioCtx.createOscillator();
  coreHoverGain = audioCtx.createGain();

  coreHoverOsc.type = 'sine';
  coreHoverOsc.frequency.setValueAtTime(150, time);
  // Linear ramp up to 500 Hz over 1.5s
  coreHoverOsc.frequency.linearRampToValueAtTime(550, time + 1.5);

  coreHoverGain.gain.setValueAtTime(0, time);
  coreHoverGain.gain.linearRampToValueAtTime(0.12, time + 0.3);

  coreHoverOsc.connect(coreHoverGain);
  coreHoverGain.connect(audioCtx.destination);

  coreHoverOsc.start(time);
}

export function stopCoreHover() {
  if (!audioCtx || !coreHoverOsc) return;

  const osc = coreHoverOsc;
  const gain = coreHoverGain;

  coreHoverOsc = null;
  coreHoverGain = null;

  const time = audioCtx.currentTime;
  gain.gain.cancelScheduledValues(time);
  gain.gain.setValueAtTime(gain.gain.value, time);
  gain.gain.linearRampToValueAtTime(0, time + 0.2);

  setTimeout(() => {
    try { osc.stop(); } catch(e) {}
    try { gain.disconnect(); } catch(e) {}
  }, 250);
}

// Cinematic Game Launch Sweep & Sub Explosion
export function playLaunch() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  
  // 1. Sweeping Riser (Siren / Laser sweep)
  const riser = audioCtx.createOscillator();
  const riserGain = audioCtx.createGain();
  riser.type = 'sawtooth';
  riser.frequency.setValueAtTime(100, time);
  riser.frequency.exponentialRampToValueAtTime(2000, time + 1.0);
  
  riserGain.gain.setValueAtTime(0.01, time);
  riserGain.gain.linearRampToValueAtTime(0.15, time + 0.8);
  riserGain.gain.linearRampToValueAtTime(0.001, time + 1.0);
  
  const riserFilter = audioCtx.createBiquadFilter();
  riserFilter.type = 'lowpass';
  riserFilter.frequency.setValueAtTime(500, time);
  riserFilter.frequency.exponentialRampToValueAtTime(3000, time + 1.0);

  riser.connect(riserFilter);
  riserFilter.connect(riserGain);
  riserGain.connect(audioCtx.destination);
  riser.start(time);
  riser.stop(time + 1.05);

  // 2. White noise explosion (after 0.9s, near the launch transition)
  const explodeTime = time + 0.8;
  
  // Create noise buffer
  const bufferSize = audioCtx.sampleRate * 2.0; // 2 seconds
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(1000, explodeTime);
  noiseFilter.frequency.exponentialRampToValueAtTime(10, explodeTime + 1.8);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.35, explodeTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, explodeTime + 1.8);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(explodeTime);
  noise.stop(explodeTime + 2.0);

  // 3. Sub-bass drop oscillator
  const sub = audioCtx.createOscillator();
  const subGain = audioCtx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(150, explodeTime);
  sub.frequency.exponentialRampToValueAtTime(30, explodeTime + 1.2);

  subGain.gain.setValueAtTime(0.5, explodeTime);
  subGain.gain.exponentialRampToValueAtTime(0.001, explodeTime + 1.5);

  sub.connect(subGain);
  subGain.connect(audioCtx.destination);
  sub.start(explodeTime);
  sub.stop(explodeTime + 1.6);
}

// Wood chop impact sound (triangle wave pitch drop)
export function playWoodChop() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);

  gain.gain.setValueAtTime(0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + 0.16);
}
