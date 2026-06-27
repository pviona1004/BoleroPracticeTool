const MIN_BPM = 40;
const MAX_BPM = 220;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.12;
const STEPS_PER_BEAT = 6;
const PATTERN_STEPS = 36;

const playButton = document.querySelector("#playButton");
const playLabel = document.querySelector("#playLabel");
const statusText = document.querySelector("#statusText");
const statusLight = document.querySelector("#statusLight");
const bpmInput = document.querySelector("#bpmInput");
const bpmSlider = document.querySelector("#bpmSlider");
const decreaseBpm = document.querySelector("#decreaseBpm");
const increaseBpm = document.querySelector("#increaseBpm");
const pulseGrid = document.querySelector("#pulseGrid");

const hitSteps = [
  0,
  3,
  4,
  5,
  6,
  9,
  10,
  11,
  12,
  15,
  18,
  21,
  22,
  23,
  24,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
];

const strongBeats = new Set([0, 18]);
const mediumBeats = new Set([12, 15, 30, 33]);
const hits = new Map(
  hitSteps.map((step) => {
    if (strongBeats.has(step)) return [step, 1];
    if (mediumBeats.has(step)) return [step, 0.88];
    return [step, 0.72];
  }),
);

const accents = new Set([0, 6, 12, 18, 24, 30]);
const pulses = [];

let audioContext;
let noiseBuffer;
let schedulerId;
let isPlaying = false;
let nextPulseTime = 0;
let currentPulse = 0;
let visualTimeouts = [];
let audioUnlocked = false;

for (let i = 0; i < PATTERN_STEPS; i += 1) {
  const pulse = document.createElement("span");
  pulse.className = "pulse";
  if (hits.has(i)) pulse.classList.add("hit");
  if (accents.has(i)) pulse.classList.add("accent");
  pulseGrid.appendChild(pulse);
  pulses.push(pulse);
}

function clampBpm(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 72;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, numeric));
}

function getBpm() {
  return clampBpm(bpmInput.value);
}

function rhythmStepDuration() {
  return 60 / getBpm() / STEPS_PER_BEAT;
}

function setBpm(value) {
  const bpm = clampBpm(value);
  bpmInput.value = bpm;
  bpmSlider.value = bpm;
}

function ensureAudio() {
  if (audioContext) return;

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio is not supported in this browser.");
  }

  audioContext = new AudioContextConstructor();
  const sampleCount = audioContext.sampleRate * 0.18;
  noiseBuffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
}

async function unlockAudio() {
  if (audioUnlocked) return true;

  const silentBuffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
  const source = audioContext.createBufferSource();
  source.buffer = silentBuffer;
  source.connect(audioContext.destination);
  source.start(0);

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  audioUnlocked = audioContext.state === "running";
  return audioUnlocked;
}

function playSnare(time, velocity) {
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = noiseBuffer;
  filter.type = "highpass";
  filter.frequency.setValueAtTime(1300, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.35 * velocity, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.075);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  source.start(time);
  source.stop(time + 0.1);

  const body = audioContext.createOscillator();
  const bodyGain = audioContext.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(180, time);
  body.frequency.exponentialRampToValueAtTime(105, time + 0.055);
  bodyGain.gain.setValueAtTime(0.0001, time);
  bodyGain.gain.exponentialRampToValueAtTime(0.12 * velocity, time + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
  body.connect(bodyGain);
  bodyGain.connect(audioContext.destination);
  body.start(time);
  body.stop(time + 0.08);
}

function flashPulse(index, time) {
  const delay = Math.max(0, (time - audioContext.currentTime) * 1000);

  const timeoutId = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      pulses.forEach((pulse) => pulse.classList.remove("active"));
      pulses[index].classList.add("active");
    });
  }, delay);

  visualTimeouts.push(timeoutId);
}

function schedulePulse(index, time) {
  const velocity = hits.get(index);
  if (!velocity) return;

  playSnare(time, velocity);
  flashPulse(index, time);
}

function scheduler() {
  while (nextPulseTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
    schedulePulse(currentPulse, nextPulseTime);
    nextPulseTime += rhythmStepDuration();
    currentPulse = (currentPulse + 1) % PATTERN_STEPS;
  }
}

async function start() {
  try {
    ensureAudio();
    const canPlay = await unlockAudio();
    if (!canPlay) {
      statusText.textContent = "소리 허용 필요";
      return;
    }
  } catch (error) {
    statusText.textContent = "오디오 미지원";
    return;
  }

  isPlaying = true;
  currentPulse = 0;
  nextPulseTime = audioContext.currentTime + 0.06;
  schedulerId = window.setInterval(scheduler, LOOKAHEAD_MS);
  scheduler();

  playButton.classList.add("is-playing");
  playButton.setAttribute("aria-pressed", "true");
  playLabel.textContent = "정지";
  statusText.textContent = "연주 중";
  statusLight.classList.add("live");
}

function stop() {
  isPlaying = false;
  window.clearInterval(schedulerId);
  schedulerId = undefined;
  visualTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  visualTimeouts = [];
  pulses.forEach((pulse) => pulse.classList.remove("active"));

  playButton.classList.remove("is-playing");
  playButton.setAttribute("aria-pressed", "false");
  playLabel.textContent = "재생";
  statusText.textContent = "대기 중";
  statusLight.classList.remove("live");
}

playButton.addEventListener("click", () => {
  if (isPlaying) {
    stop();
  } else {
    start();
  }
});

bpmInput.addEventListener("input", () => {
  setBpm(bpmInput.value);
});

bpmInput.addEventListener("blur", () => {
  setBpm(bpmInput.value);
});

bpmSlider.addEventListener("input", () => {
  setBpm(bpmSlider.value);
});

decreaseBpm.addEventListener("click", () => {
  setBpm(getBpm() - 1);
});

increaseBpm.addEventListener("click", () => {
  setBpm(getBpm() + 1);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    playButton.click();
  }
});

setBpm(72);
