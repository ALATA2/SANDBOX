// Web Audio API Procedural Sound Synthesizer for ARCHIPELAGO Menu

let audioCtx = null;
let masterFilter = null;
let droneOscs = [];
let droneGain = null;
let droneFilter = null;
let filterLfo = null;
let isMuted = localStorage.getItem('game_audio_muted') === 'true';

// Ambient sounds state
let ambientGain = null;
let waveFilter = null;
let windFilter = null;
let waveLfo = null;
let windLfo = null;
let ambientNoise = null;
let waveGain = null;
let windGain = null;
let bgMusic = null;

// Initialize Audio Context on first interaction
function initAudio() {
  if (audioCtx) return;
  // Support standard and webkit audio context
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Create master biquad filter for submerged / lowpass effects
  masterFilter = audioCtx.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.frequency.setValueAtTime(20000, audioCtx.currentTime); // default fully open
  masterFilter.Q.setValueAtTime(1.0, audioCtx.currentTime);
  masterFilter.connect(audioCtx.destination);
}

export function setMute(muted) {
  isMuted = muted;
  localStorage.setItem('game_audio_muted', muted);
  if (muted) {
    stopDrone();
    stopAmbientSounds();
  } else {
    // If blocker is active (not pointer locked), start drone
    const blocker = document.getElementById('blocker');
    if (blocker && blocker.style.display !== 'none') {
      startDrone();
    } else {
      startAmbientSounds();
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
  droneGain.connect(masterFilter || audioCtx.destination);
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
  gain.connect(masterFilter || audioCtx.destination);

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
  gain.connect(masterFilter || audioCtx.destination);

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
  coreHoverGain.connect(masterFilter || audioCtx.destination);

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
  riserGain.connect(masterFilter || audioCtx.destination);
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
  noiseGain.connect(masterFilter || audioCtx.destination);
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
  subGain.connect(masterFilter || audioCtx.destination);
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
  gain.connect(masterFilter || audioCtx.destination);

  osc.start(time);
  osc.stop(time + 0.16);
}

// Muffle/Unmuffle master audio filter dynamically when diving
export function setSubmergedAudio(submerged) {
  initAudio();
  if (!audioCtx || !masterFilter) return;
  const time = audioCtx.currentTime;
  masterFilter.frequency.cancelScheduledValues(time);
  masterFilter.frequency.setValueAtTime(masterFilter.frequency.value, time);
  if (submerged) {
    // Muffle high frequencies underwater (exponential transition down to 320 Hz)
    masterFilter.frequency.exponentialRampToValueAtTime(320, time + 0.4);
  } else {
    // Restore full spectrum on surface
    masterFilter.frequency.exponentialRampToValueAtTime(20000, time + 0.3);
  }
}

// Procedural wave and wind noise ambient loops
export function startAmbientSounds() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (ambientNoise) return; // already active

  const time = audioCtx.currentTime;

  // 1. Create noise buffer
  const bufferSize = audioCtx.sampleRate * 4.0; // 4 seconds loop
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  ambientNoise = audioCtx.createBufferSource();
  ambientNoise.buffer = buffer;
  ambientNoise.loop = true;

  // 2. Wave Filter & Modulator (slow rolling lowpass waves)
  waveFilter = audioCtx.createBiquadFilter();
  waveFilter.type = 'lowpass';
  waveFilter.frequency.setValueAtTime(380, time);

  waveLfo = audioCtx.createOscillator();
  waveLfo.type = 'sine';
  waveLfo.frequency.setValueAtTime(0.12, time); // ~8 seconds wave period

  const waveLfoGain = audioCtx.createGain();
  waveLfoGain.gain.setValueAtTime(220, time); // sweep range +/- 220 Hz

  waveLfo.connect(waveLfoGain);
  waveLfoGain.connect(waveFilter.frequency);

  // 3. Wind Filter & Modulator (hissing bandpass wind)
  windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.setValueAtTime(750, time);
  windFilter.Q.setValueAtTime(1.8, time);

  windLfo = audioCtx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.setValueAtTime(0.07, time); // slow wind shifting

  const windLfoGain = audioCtx.createGain();
  windLfoGain.gain.setValueAtTime(280, time);

  windLfo.connect(windLfoGain);
  windLfoGain.connect(windFilter.frequency);

  // 4. Mix Gain Nodes
  ambientGain = audioCtx.createGain();
  ambientGain.gain.setValueAtTime(0, time);
  ambientGain.gain.linearRampToValueAtTime(0.12, time + 2.0); // fade in smoothly

  waveGain = audioCtx.createGain();
  waveGain.gain.setValueAtTime(0.75, time);

  windGain = audioCtx.createGain();
  windGain.gain.setValueAtTime(0.25, time);

  // Connection routing
  ambientNoise.connect(waveFilter);
  waveFilter.connect(waveGain);

  ambientNoise.connect(windFilter);
  windFilter.connect(windGain);

  waveGain.connect(ambientGain);
  windGain.connect(ambientGain);

  ambientGain.connect(masterFilter || audioCtx.destination);

  // Start oscillators
  waveLfo.start(time);
  windLfo.start(time);
  ambientNoise.start(time);

  // Play background music
  if (!bgMusic) {
    bgMusic = new Audio('MUSIC/Brano1-Alex-Ciarelli.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.35; // non-intrusive volume level
  }
  
  if (!isMuted) {
    bgMusic.play().catch(err => {
      console.warn("Could not play background music automatically:", err);
    });
  }
}

// Fade out and stop ambient sounds
export function stopAmbientSounds() {
  if (bgMusic) {
    try {
      bgMusic.pause();
    } catch(e) {}
  }

  if (!audioCtx || !ambientNoise) return;

  const time = audioCtx.currentTime;
  const gainNode = ambientGain;
  const noiseNode = ambientNoise;
  const lfo1 = waveLfo;
  const lfo2 = windLfo;

  // Clear references immediately
  ambientGain = null;
  ambientNoise = null;
  waveFilter = null;
  windFilter = null;
  waveLfo = null;
  windLfo = null;
  waveGain = null;
  windGain = null;

  if (gainNode) {
    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(gainNode.gain.value, time);
    gainNode.gain.linearRampToValueAtTime(0, time + 1.0);

    setTimeout(() => {
      try { noiseNode.stop(); } catch(e) {}
      try { lfo1.stop(); } catch(e) {}
      try { lfo2.stop(); } catch(e) {}
      try { gainNode.disconnect(); } catch(e) {}
    }, 1100);
  }
}

// Sizzling noise for meat cooking on campfire
export function playSizzling() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;

  // Sizzling is high-frequency crackly white noise
  const bufferSize = audioCtx.sampleRate * 1.5; // 1.5 seconds sizzling duration
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(3200, time);
  filter.Q.setValueAtTime(2.2, time);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.12, time);
  gain.gain.linearRampToValueAtTime(0.12, time + 1.0);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterFilter || audioCtx.destination);

  noise.start(time);
  noise.stop(time + 1.5);
}

// Gulp sound for drinking water
export function playDrink() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  
  // Two soft gulping pulses
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.15);
  osc.frequency.setValueAtTime(160, time + 0.18);
  osc.frequency.exponentialRampToValueAtTime(110, time + 0.35);
  
  gain.gain.setValueAtTime(0.15, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  gain.gain.setValueAtTime(0.12, time + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  
  osc.connect(gain);
  gain.connect(masterFilter || audioCtx.destination);
  
  osc.start(time);
  osc.stop(time + 0.4);
}

// Metallic spark sound for lighting fire with stones
export function playSpark() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  
  // Two quick high-pitched crack/click sounds
  for (let i = 0; i < 2; i++) {
    const clickTime = time + i * 0.12;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, clickTime);
    osc.frequency.exponentialRampToValueAtTime(100, clickTime + 0.05);
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, clickTime);
    filter.Q.setValueAtTime(3.0, clickTime);
    
    gain.gain.setValueAtTime(0.2, clickTime);
    gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.05);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterFilter || audioCtx.destination);
    
    osc.start(clickTime);
    osc.stop(clickTime + 0.06);
  }
}

// Low-poly water splash sound effect for rowing
export function playRowingSplash() {
  if (isMuted) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const time = audioCtx.currentTime;
  
  // Use bandpass filtered white noise for splash sound
  const bufferSize = audioCtx.sampleRate * 0.4; // 0.4 seconds
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, time);
  filter.frequency.exponentialRampToValueAtTime(300, time + 0.35);
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.08, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  
  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(masterFilter || audioCtx.destination);
  
  noiseNode.start(time);
}

// Bind to window for global access
window.playRowingSplash = playRowingSplash;

export function updateAmbientAudioParams(isWinterOrSnow, isStorm) {
  if (!audioCtx || !waveGain || !windGain) return;
  const time = audioCtx.currentTime;
  
  let targetWaveVal = 0.75;
  let targetWindVal = 0.25;
  let windFreq = 750;
  let windQ = 1.8;
  
  if (isStorm) {
    targetWaveVal = 0.55;
    targetWindVal = 0.75;
    windFreq = 950;
    windQ = 2.5;
  } else if (isWinterOrSnow) {
    targetWaveVal = 0.20; // quiet waves
    targetWindVal = 0.70; // loud cold wind
    windFreq = 1100;      // high whistling wind
    windQ = 3.5;          // whistle resonance
  }
  
  waveGain.gain.setTargetAtTime(targetWaveVal, time, 0.5);
  windGain.gain.setTargetAtTime(targetWindVal, time, 0.5);
  
  if (windFilter) {
    windFilter.frequency.setTargetAtTime(windFreq, time, 0.5);
    windFilter.Q.setTargetAtTime(windQ, time, 0.5);
  }
}
window.updateAmbientAudioParams = updateAmbientAudioParams;

