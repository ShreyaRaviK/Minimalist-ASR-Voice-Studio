import io
import os
import sys
import time
import logging
import numpy as np
import soundfile as sf
import torch
import whisper
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List

from cleaner import clean_text, extract_bullet_points, extract_action_items

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ASR_App")

app = FastAPI(title="Automatic Speech Recognition ASR Tool")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Target compute device: {DEVICE}")

# Global model container
whisper_model = None

def get_whisper_model(model_name: str = "base"):
    global whisper_model
    if whisper_model is None:
        logger.info(f"Loading Whisper model '{model_name}' on {DEVICE}...")
        whisper_model = whisper.load_model(model_name, device=DEVICE)
        logger.info("Whisper model loaded successfully.")
    return whisper_model

# Pre-load on startup
@app.on_event("startup")
def startup_event():
    try:
        get_whisper_model("base")
    except Exception as e:
        logger.warning(f"Whisper background preload error: {e}")

class CleanRequest(BaseModel):
    text: str
    remove_fillers: Optional[bool] = True
    fix_repetitions: Optional[bool] = True
    auto_punctuate: Optional[bool] = True

@app.get("/api/status")
def get_status():
    global whisper_model
    return {
        "status": "ready" if whisper_model is not None else "loading",
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "model_name": "base",
        "supported_languages": [
            {"code": "auto", "name": "Auto Detect"},
            {"code": "en", "name": "English"},
            {"code": "es", "name": "Spanish"},
            {"code": "fr", "name": "French"},
            {"code": "de", "name": "German"},
            {"code": "it", "name": "Italian"},
            {"code": "pt", "name": "Portuguese"},
            {"code": "hi", "name": "Hindi"},
            {"code": "zh", "name": "Chinese"},
            {"code": "ja", "name": "Japanese"},
            {"code": "ko", "name": "Korean"},
            {"code": "ru", "name": "Russian"},
            {"code": "ar", "name": "Arabic"},
            {"code": "nl", "name": "Dutch"},
            {"code": "pl", "name": "Polish"},
            {"code": "tr", "name": "Turkish"}
        ]
    }

@app.post("/api/clean-text")
def clean_text_api(req: CleanRequest):
    cleaned = clean_text(
        req.text,
        remove_fillers=req.remove_fillers,
        fix_repetitions=req.fix_repetitions,
        auto_punctuate=req.auto_punctuate
    )
    bullets = extract_bullet_points(cleaned)
    action_items = extract_action_items(cleaned)
    word_count = len(cleaned.split()) if cleaned else 0
    char_count = len(cleaned)
    return {
        "cleaned_text": cleaned,
        "bullets": bullets,
        "action_items": action_items,
        "word_count": word_count,
        "char_count": char_count
    }

def convert_audio_to_whisper_array(file_bytes: bytes) -> np.ndarray:
    """
    Reads audio bytes into a float32 16kHz mono numpy array for Whisper.
    Uses soundfile directly. If sample rate is not 16000, resamples using scipy.
    """
    buf = io.BytesIO(file_bytes)
    try:
        data, samplerate = sf.read(buf, dtype="float32")
    except Exception as e:
        raise ValueError(f"Could not decode audio format: {e}. Please use WAV or ensure browser audio converter is active.")

    # Convert multi-channel to mono
    if len(data.shape) > 1:
        data = np.mean(data, axis=1)

    # Resample to 16,000 Hz if needed
    if samplerate != 16000:
        import scipy.signal
        target_len = int(len(data) * 16000 / samplerate)
        data = scipy.signal.resample(data, target_len).astype(np.float32)

    return data

@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form("auto"),
    model_name: Optional[str] = Form("base"),
    remove_fillers: Optional[bool] = Form(True),
    fix_repetitions: Optional[bool] = Form(True),
    auto_punctuate: Optional[bool] = Form(True),
):
    try:
        t0 = time.time()
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file uploaded.")

        logger.info(f"Received audio file: {file.filename}, size: {len(file_bytes)} bytes")
        audio_array = convert_audio_to_whisper_array(file_bytes)
        
        duration_sec = round(len(audio_array) / 16000.0, 2)
        logger.info(f"Audio decoded: {duration_sec}s, shape: {audio_array.shape}")

        model = get_whisper_model(model_name)

        # Transcribe with Whisper
        transcribe_kwargs = {
            "fp16": (DEVICE == "cuda"),
            "verbose": False
        }
        if language and language != "auto":
            transcribe_kwargs["language"] = language

        result = model.transcribe(audio_array, **transcribe_kwargs)
        raw_text = result.get("text", "").strip()
        detected_language = result.get("language", language)

        # Format segments
        raw_segments = result.get("segments", [])
        segments = []
        for s in raw_segments:
            segments.append({
                "id": s.get("id"),
                "start": round(s.get("start", 0), 2),
                "end": round(s.get("end", 0), 2),
                "text": s.get("text", "").strip(),
            })

        # Process clean transcript
        cleaned_text = clean_text(
            raw_text,
            remove_fillers=remove_fillers,
            fix_repetitions=fix_repetitions,
            auto_punctuate=auto_punctuate
        )

        bullets = extract_bullet_points(cleaned_text)
        action_items = extract_action_items(cleaned_text)

        word_count = len(cleaned_text.split()) if cleaned_text else 0
        wpm = round((word_count / (duration_sec / 60.0)), 1) if duration_sec > 0.5 else 0
        processing_time = round(time.time() - t0, 2)

        return {
            "success": True,
            "raw_text": raw_text,
            "cleaned_text": cleaned_text,
            "segments": segments,
            "bullets": bullets,
            "action_items": action_items,
            "detected_language": detected_language,
            "duration": duration_sec,
            "word_count": word_count,
            "wpm": wpm,
            "processing_time": processing_time
        }

    except Exception as e:
        logger.exception("Error during transcription")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

# Mount public / static files
serve_dir = os.path.join(os.path.dirname(__file__), "public") if os.path.exists(os.path.join(os.path.dirname(__file__), "public")) else os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=serve_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"\n=======================================================")
    print(f"🎙️ ASR Automatic Speech Recognition Server Started")
    print(f"🔗 Open Web App: http://localhost:{port}")
    print(f"=======================================================\n")
    uvicorn.run("local_server:app", host="127.0.0.1", port=port, reload=False)
