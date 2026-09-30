# Transcribe — Minimalist ASR Voice Studio

A clean, distraction-free Automatic Speech Recognition (ASR) tool with live voice dictation, neural audio transcription, and intelligent text cleaning.

---

## 🛠️ Tools & Technologies Used

### Backend
- **Python 3.12**: Core server runtime.
- **FastAPI**: Asynchronous web framework for high-performance API endpoints.
- **Uvicorn**: Lightning-fast ASGI production web server.
- **OpenAI Whisper (`openai-whisper`)**: Deep neural network architecture for state-of-the-art automatic speech recognition.
- **PyTorch (`torch`)**: Machine learning tensor runtime executing the Whisper ASR model on CPU / CUDA.
- **SoundFile (`soundfile`)**: Low-level audio I/O library for reading PCM audio arrays without external binary dependencies.
- **SciPy (`scipy`)**: Signal processing library for high-quality audio resampling.

### Frontend
- **HTML5 & Semantic Elements**: Clean document structure.
- **Vanilla CSS3**: Minimalist dark theme inspired by Linear and Notion, responsive flexbox layout, and CSS custom properties.
- **Vanilla JavaScript (ES6+)**:
  - **Web Speech API (`webkitSpeechRecognition`)**: Native browser streaming ASR for instant real-time live dictation.
  - **Web Audio API (`AudioContext`, `OfflineAudioContext`, `AnalyserNode`)**: Decodes any user audio format (`.mp3`, `.m4a`, `.wav`, etc.) directly in the browser and drives the real-time waveform visualizer.
  - **HTML5 Canvas**: Frame-by-frame animated frequency waveform strip.
  - **Speech Synthesis API (`speechSynthesis`)**: Built-in Text-to-Speech (TTS) for listening back to transcripts.

---

## 🚀 How to Run the Project

### Prerequisites
Make sure you have Python 3.10+ installed on your system.

### 1. Install Dependencies
Open PowerShell or Command Prompt in the project folder and run:
```bash
pip install -r requirements.txt
```

### 2. Start the Server

#### Option A: One-Click Launcher (Windows)
Double-click `run.bat` in the project root.

#### Option B: Terminal Command
Run the following command:
```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

### 3. Open in Browser
Navigate to:
```
http://localhost:8000
```

---

## 💡 How to Use

1. **Speak**: Click `Record` to start speaking. Click `Stop` when finished.
2. **Upload Audio**: Click `Upload audio` or drag and drop any audio file (`.mp3`, `.wav`, `.m4a`, etc.) directly into the card.
3. **Clean Output**: Fillers (`um`, `uh`, `you know`, `like`), stutters, and hesitation commas are automatically cleaned up.
4. **Actions**: Use the top-right toolbar buttons to **Copy**, **Listen** (read aloud), **Download** as `.txt`, or **Clear** the editor.
