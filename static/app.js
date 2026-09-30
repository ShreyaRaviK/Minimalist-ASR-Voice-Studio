/* ==========================================================
   Transcribe — Streamlined Audio Controller & Cleaner
   ========================================================== */

const state = {
  isRecording: false,
  startTime: 0,
  timerInterval: null,
  recognition: null,
  audioContext: null,
  analyser: null,
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  audioBlob: null,
  audioUrl: null,
  fullText: '',
  isLiveSupported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
};

const dom = {
  btnRecord: document.getElementById('btnRecord'),
  recordBtnText: document.getElementById('recordBtnText'),
  recordingTimer: document.getElementById('recordingTimer'),
  waveBox: document.getElementById('waveBox'),
  canvas: document.getElementById('audioVisualizer'),
  
  audioFileInput: document.getElementById('audioFileInput'),
  dropZone: document.getElementById('dropZone'),
  
  btnCopy: document.getElementById('btnCopy'),
  btnSpeak: document.getElementById('btnSpeak'),
  speakLabel: document.getElementById('speakLabel'),
  btnDownload: document.getElementById('btnDownload'),
  btnClear: document.getElementById('btnClear'),
  
  languageSelect: document.getElementById('languageSelect'),
  statusPill: document.getElementById('statusPill'),
  statusLabel: document.getElementById('statusLabel'),
  
  transcriptBody: document.getElementById('transcriptBody'),
  transcribeLoader: document.getElementById('transcribeLoader'),
  transcribeMessage: document.getElementById('transcribeMessage'),
  
  statWords: document.getElementById('statWords'),
  statChars: document.getElementById('statChars'),
  durationDivider: document.getElementById('durationDivider'),
  statDuration: document.getElementById('statDuration'),
  
  audioPlayerStrip: document.getElementById('audioPlayerStrip'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  playIcon: document.getElementById('playIcon'),
  pauseIcon: document.getElementById('pauseIcon'),
  stripFilename: document.getElementById('stripFilename'),
  stripSlider: document.getElementById('stripSlider'),
  stripTime: document.getElementById('stripTime'),
  htmlAudio: document.getElementById('htmlAudio'),
  
  toastBox: document.getElementById('toastBox')
};

// ==========================================================
// Initialization
// ==========================================================
function init() {
  setupEventListeners();
  setupSpeechRecognition();
  checkEngineStatus();

  // If ?demo=true or ?demo=recording, populate realistic state for screenshots
  const params = new URLSearchParams(window.location.search);
  const demoType = params.get('demo');
  if (demoType === 'true') {
    const demoSample = "Good morning everyone. We conducted a full review of our automatic speech recognition pipeline today. The neural Whisper model achieves high word accuracy across multiple languages, while the natural language cleaning engine automatically strips conversational hesitation, filler words, and stutter repetitions.\n\nMoving forward, we will deploy the streaming endpoint to our production cluster and integrate the live audio visualizer across all client platforms.";
    dom.transcriptBody.innerText = demoSample;
    state.fullText = demoSample;
    updateStats(demoSample, 14.8);
    dom.stripFilename.textContent = "product_discussion.m4a";
    dom.audioPlayerStrip.style.display = 'flex';
    dom.stripTime.textContent = "00:08 / 00:15";
    dom.stripSlider.value = 53;
  } else if (demoType === 'recording') {
    dom.btnRecord.classList.add('is-recording');
    dom.recordBtnText.textContent = "Stop";
    dom.recordingTimer.style.display = 'block';
    dom.recordingTimer.textContent = "00:12";
    dom.waveBox.style.display = 'block';
    dom.statusPill.classList.add('recording');
    dom.statusLabel.textContent = "Listening...";
    
    // Draw static demo audio waveform on canvas
    const canvas = dom.canvas;
    const ctx = canvas.getContext('2d');
    canvas.width = 90;
    canvas.height = 24;
    ctx.fillStyle = '#ef4444';
    const heights = [6, 12, 18, 10, 22, 14, 8, 16, 20, 11, 15, 7, 19, 13];
    heights.forEach((h, i) => {
      const y = (24 - h) / 2;
      ctx.fillRect(i * 6, y, 3, h);
    });

    const liveText = "We are currently testing the live voice recognition stream";
    dom.transcriptBody.innerHTML = `${liveText} <span class="live-interim">and words appear as you speak...</span>`;
    updateStats(liveText);
  }
}

async function checkEngineStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.status === 'ready') {
      dom.statusLabel.textContent = `Whisper ready`;
    }
  } catch (e) {
    dom.statusLabel.textContent = `Offline`;
  }
}

// ==========================================================
// Event Listeners
// ==========================================================
function setupEventListeners() {
  // Record toggle
  dom.btnRecord.addEventListener('click', toggleRecording);

  // File upload
  dom.audioFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleAudioFile(e.target.files[0]);
    }
  });

  // Drag and drop anywhere on studio card
  ['dragenter', 'dragover'].forEach(name => {
    dom.dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dom.dropZone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(name => {
    dom.dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dom.dropZone.classList.remove('drag-over');
    });
  });
  dom.dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAudioFile(e.dataTransfer.files[0]);
    }
  });

  // Editor manual changes
  dom.transcriptBody.addEventListener('input', () => {
    state.fullText = dom.transcriptBody.innerText;
    updateStats(state.fullText);
  });

  // Action buttons
  dom.btnCopy.addEventListener('click', copyTranscript);
  dom.btnSpeak.addEventListener('click', toggleSpeak);
  dom.btnDownload.addEventListener('click', downloadTranscript);
  dom.btnClear.addEventListener('click', clearTranscript);

  // Player controls
  dom.btnPlayPause.addEventListener('click', togglePlayPause);
  dom.htmlAudio.addEventListener('timeupdate', updatePlayerTime);
  dom.htmlAudio.addEventListener('loadedmetadata', setupPlayerDuration);
  dom.htmlAudio.addEventListener('ended', () => updatePlayerState(false));
  dom.stripSlider.addEventListener('input', (e) => {
    dom.htmlAudio.currentTime = e.target.value;
  });
}

// ==========================================================
// Speech Recognition (Live Dictation & Mic)
// ==========================================================
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;

  rec.onstart = () => {
    state.isRecording = true;
    updateRecordingUi(true);
    startTimer();
    startAudioVisualizer();
  };

  rec.onresult = (event) => {
    let finalChunk = '';
    let interimChunk = '';

    for (let i = 0; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalChunk += event.results[i][0].transcript + ' ';
      } else {
        interimChunk += event.results[i][0].transcript;
      }
    }

    if (finalChunk) {
      state.fullText = cleanLiveText(finalChunk.trim());
    }

    renderTranscriptText(state.fullText, interimChunk);
  };

  rec.onerror = (e) => {
    if (e.error !== 'no-speech') {
      showToast(`Notice: ${e.error}`);
    }
    stopRecording();
  };

  rec.onend = () => {
    if (state.isRecording) {
      try { rec.start(); } catch (err) { stopRecording(); }
    } else {
      updateRecordingUi(false);
      stopTimer();
      stopAudioVisualizer();
    }
  };

  state.recognition = rec;
}

function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  if (state.isLiveSupported && state.recognition) {
    const lang = dom.languageSelect.value;
    state.recognition.lang = lang === 'auto' ? 'en-US' : (lang === 'en' ? 'en-US' : lang);
    try {
      state.recognition.start();
    } catch (e) {
      console.error(e);
    }
  } else {
    // Fallback: Record media stream directly and send to Whisper
    await startWhisperMic();
  }
}

function stopRecording() {
  state.isRecording = false;

  if (state.recognition) {
    try { state.recognition.stop(); } catch (e) {}
  }
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }

  updateRecordingUi(false);
  stopTimer();
  stopAudioVisualizer();

  // Final server cleanup for perfect grammar, punctuation and filler removal
  const currentText = dom.transcriptBody.innerText;
  if (currentText.trim()) {
    cleanOnServer(currentText);
  }
}

// Whisper mic fallback if Web Speech isn't available
async function startWhisperMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;
    startAudioVisualizer(stream);

    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };

    state.mediaRecorder.onstop = async () => {
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      await processAudioWithWhisper(blob, "voice_recording.webm");
    };

    state.mediaRecorder.start(250);
    state.isRecording = true;
    updateRecordingUi(true);
    startTimer();
  } catch (err) {
    showToast("Could not access microphone.");
  }
}

function updateRecordingUi(recording) {
  if (recording) {
    dom.btnRecord.classList.add('is-recording');
    dom.recordBtnText.textContent = "Stop";
    dom.recordingTimer.style.display = 'block';
    dom.waveBox.style.display = 'block';
    dom.statusPill.classList.add('recording');
    dom.statusLabel.textContent = "Listening...";
  } else {
    dom.btnRecord.classList.remove('is-recording');
    dom.recordBtnText.textContent = "Record";
    dom.recordingTimer.style.display = 'none';
    dom.waveBox.style.display = 'none';
    dom.statusPill.classList.remove('recording');
    dom.statusLabel.textContent = "Ready";
  }
}

function renderTranscriptText(finalText, interimText) {
  let html = escapeHtml(finalText);
  if (interimText) {
    html += ` <span class="live-interim">${escapeHtml(interimText)}</span>`;
  }
  dom.transcriptBody.innerHTML = html;
  dom.transcriptBody.scrollTop = dom.transcriptBody.scrollHeight;
  updateStats(finalText + ' ' + interimText);
}

// Quick client-side filter during live stream
function cleanLiveText(text) {
  let cleaned = text.replace(/\b(um+|uh+|er+|erm+|ah+|you know|i mean|basically|literally)\b/gi, '');
  cleaned = cleaned.replace(/\b([a-zA-Z]+)\s+\1\b/gi, '$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (!/[.?!]$/.test(cleaned)) cleaned += '.';
  }
  return cleaned;
}

// Server text cleaning
async function cleanOnServer(text) {
  try {
    const res = await fetch('/api/clean-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        remove_fillers: true,
        fix_repetitions: true,
        auto_punctuate: true
      })
    });
    const data = await res.json();
    state.fullText = data.cleaned_text;
    dom.transcriptBody.innerText = data.cleaned_text;
    updateStats(data.cleaned_text);
  } catch (err) {
    console.error("Clean error:", err);
  }
}

// ==========================================================
// Audio File Upload & Whisper Processing
// ==========================================================
async function handleAudioFile(file) {
  state.audioBlob = file;
  setupAudioPlayer(file, file.name);
  await processAudioWithWhisper(file, file.name);
}

// In-browser Whisper pipeline cache
let inBrowserWhisper = null;

async function processAudioWithWhisper(fileOrBlob, filename) {
  showLoader(true, "Transcribing with Whisper AI...");
  
  try {
    // 1. Try server endpoint first (works locally or if API key configured)
    const wavBlob = await convertTo16kWav(fileOrBlob);
    const formData = new FormData();
    formData.append("file", wavBlob, filename.replace(/\.[^/.]+$/, "") + ".wav");
    formData.append("language", dom.languageSelect.value);
    formData.append("remove_fillers", "true");
    formData.append("fix_repetitions", "true");
    formData.append("auto_punctuate", "true");

    let serverSuccess = false;
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.success) {
        state.fullText = data.cleaned_text || "No speech detected.";
        dom.transcriptBody.innerText = state.fullText;
        updateStats(state.fullText, data.duration);
        showToast("Transcription complete.");
        serverSuccess = true;
      }
    } catch (e) {
      serverSuccess = false;
    }

    // 2. If server has no PyTorch/Groq (Vercel serverless mode), run in-browser Whisper
    if (!serverSuccess) {
      showLoader(true, "Processing with in-browser Whisper (WebAssembly)...");
      await transcribeInBrowser(fileOrBlob);
    }

  } catch (err) {
    console.error("Transcription error:", err);
    showToast(`Error: ${err.message}`);
  } finally {
    showLoader(false);
  }
}

async function transcribeInBrowser(fileOrBlob) {
  try {
    if (!inBrowserWhisper) {
      showLoader(true, "Initializing in-browser Whisper model...");
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      env.allowLocalModels = false;
      inBrowserWhisper = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    }

    showLoader(true, "Transcribing speech from audio...");
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    // Resample to 16,000 Hz mono
    const targetRate = 16000;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const src = offlineCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(offlineCtx.destination);
    src.start(0);

    const rendered = await offlineCtx.startRendering();
    const channelData = rendered.getChannelData(0);

    const output = await inBrowserWhisper(channelData);
    const rawText = output.text || "";

    // Clean text via serverless endpoint or client cleaner
    await cleanOnServer(rawText);
    showToast("Transcription complete.");

  } catch (err) {
    console.error("In-browser Whisper fallback notice:", err);
    showToast("Could not process audio format.");
  }
}

// Convert any browser-decoded audio into 16kHz WAV
async function convertTo16kWav(blobOrFile) {
  try {
    const arrayBuffer = await blobOrFile.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    const targetRate = 16000;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const channelData = rendered.getChannelData(0);

    return encodePcmWav(channelData, targetRate);
  } catch (e) {
    return blobOrFile;
  }
}

function encodePcmWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

// ==========================================================
// Minimal Audio Player
// ==========================================================
function setupAudioPlayer(blob, title) {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(blob);

  dom.htmlAudio.src = state.audioUrl;
  dom.stripFilename.textContent = title;
  dom.audioPlayerStrip.style.display = 'flex';
  updatePlayerState(false);
}

function togglePlayPause() {
  if (!dom.htmlAudio.src) return;
  if (dom.htmlAudio.paused) {
    dom.htmlAudio.play();
    updatePlayerState(true);
  } else {
    dom.htmlAudio.pause();
    updatePlayerState(false);
  }
}

function updatePlayerState(playing) {
  dom.playIcon.style.display = playing ? 'none' : 'block';
  dom.pauseIcon.style.display = playing ? 'block' : 'none';
}

function setupPlayerDuration() {
  const dur = dom.htmlAudio.duration || 0;
  dom.stripSlider.max = Math.floor(dur);
  updateTimeDisplay(0, dur);
}

function updatePlayerTime() {
  const cur = dom.htmlAudio.currentTime || 0;
  const dur = dom.htmlAudio.duration || 0;
  dom.stripSlider.value = Math.floor(cur);
  updateTimeDisplay(cur, dur);
}

function updateTimeDisplay(cur, dur) {
  dom.stripTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
}

// ==========================================================
// Audio Waveform
// ==========================================================
async function startAudioVisualizer(existingStream = null) {
  try {
    const stream = existingStream || await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.audioContext = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 32;
    state.analyser = analyser;

    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    const canvas = dom.canvas;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!state.isRecording) return;
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const barW = 3;
      const gap = 3;
      let x = 0;

      ctx.fillStyle = '#ef4444';
      for (let i = 0; i < data.length; i++) {
        const barH = Math.max(2, (data[i] / 255) * h * 0.9);
        const y = (h - barH) / 2;
        ctx.fillRect(x, y, barW, barH);
        x += barW + gap;
        if (x > w) break;
      }
    }
    draw();

  } catch (e) {
    console.warn("Visualizer init notice:", e);
  }
}

function stopAudioVisualizer() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  if (state.audioContext) {
    try { state.audioContext.close(); } catch (e) {}
    state.audioContext = null;
  }
}

// ==========================================================
// Actions: Copy, Listen, Download, Clear
// ==========================================================
function copyTranscript() {
  const text = dom.transcriptBody.innerText.trim();
  if (!text) {
    showToast("Nothing to copy.");
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied to clipboard.");
  });
}

function toggleSpeak() {
  if (!('speechSynthesis' in window)) {
    showToast("Speech synthesis not supported.");
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    dom.speakLabel.textContent = "Listen";
    return;
  }

  const text = dom.transcriptBody.innerText.trim();
  if (!text) {
    showToast("Nothing to read.");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => { dom.speakLabel.textContent = "Listen"; };
  dom.speakLabel.textContent = "Stop";
  window.speechSynthesis.speak(utterance);
}

function downloadTranscript() {
  const text = dom.transcriptBody.innerText.trim();
  if (!text) {
    showToast("Nothing to download.");
    return;
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `transcript_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("Downloaded transcript.");
}

function clearTranscript() {
  state.fullText = '';
  dom.transcriptBody.innerText = '';
  updateStats('', 0);
  dom.audioPlayerStrip.style.display = 'none';
  if (dom.htmlAudio.src) {
    dom.htmlAudio.pause();
    dom.htmlAudio.src = '';
  }
}

// ==========================================================
// Stats & Helpers
// ==========================================================
function updateStats(text, duration = null) {
  const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const chars = text ? text.length : 0;

  dom.statWords.textContent = `${words} word${words === 1 ? '' : 's'}`;
  dom.statChars.textContent = `${chars} character${chars === 1 ? '' : 's'}`;

  if (duration !== null && duration > 0) {
    dom.durationDivider.style.display = 'inline';
    dom.statDuration.style.display = 'inline';
    dom.statDuration.textContent = `${duration}s`;
  }
}

function startTimer() {
  state.startTime = Date.now();
  dom.recordingTimer.textContent = "00:00";
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    dom.recordingTimer.textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function showLoader(show, msg = "Transcribing audio...") {
  dom.transcribeLoader.style.display = show ? 'flex' : 'none';
  dom.transcribeMessage.textContent = msg;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = msg;
  dom.toastBox.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener("DOMContentLoaded", init);
