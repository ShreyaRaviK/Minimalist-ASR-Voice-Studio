import os
import sys
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add root folder to sys.path to import cleaner
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from cleaner import clean_text
except ImportError:
    # Fallback if cleaner is alongside index.py
    import re
    FILLER_WORDS = [r"\bum+\b", r"\buh+\b", r"\ber+\b", r"\berm+\b", r"\bah+\b", r"\byou know\b", r"\bi mean\b", r"\bkind of\b", r"\bsort of\b", r"\bbasically\b", r"\bliterally\b"]
    def clean_text(text: str, remove_fillers=True, fix_repetitions=True, auto_punctuate=True):
        if not text: return ""
        cleaned = text.strip()
        if remove_fillers:
            regex = re.compile(r"\b(" + "|".join(FILLER_WORDS).replace(r"\b", "") + r")\b[\s,]*", re.IGNORECASE)
            cleaned = regex.sub(" ", cleaned)
        if fix_repetitions:
            cleaned = re.sub(r"\b(\b[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+\1\b", r"\1", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if auto_punctuate and cleaned:
            cleaned = cleaned[0].upper() + cleaned[1:]
            if not cleaned[-1] in ".?!": cleaned += "."
        return cleaned

app = FastAPI(title="Transcribe API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CleanRequest(BaseModel):
    text: str
    remove_fillers: Optional[bool] = True
    fix_repetitions: Optional[bool] = True
    auto_punctuate: Optional[bool] = True

@app.get("/api/status")
def status():
    return {
        "status": "ready",
        "deployment": "vercel-serverless",
        "engine": "web-speech-and-in-browser-whisper"
    }

@app.post("/api/clean-text")
def clean_text_endpoint(req: CleanRequest):
    cleaned = clean_text(
        req.text,
        remove_fillers=req.remove_fillers,
        fix_repetitions=req.fix_repetitions,
        auto_punctuate=req.auto_punctuate
    )
    words = len(cleaned.split()) if cleaned else 0
    chars = len(cleaned)
    return {
        "cleaned_text": cleaned,
        "word_count": words,
        "char_count": chars
    }

@app.post("/api/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: Optional[str] = Form("auto"),
    groq_api_key: Optional[str] = Form(None)
):
    """
    Serverless Whisper transcription endpoint using Groq or OpenAI Whisper API
    if an API key is provided, or guidance for client-side processing.
    """
    api_key = groq_api_key or os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY")
    file_bytes = await file.read()

    if api_key:
        import requests
        # If Groq API key is present
        if api_key.startswith("gsk_") or os.environ.get("GROQ_API_KEY"):
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            headers = {"Authorization": f"Bearer {api_key}"}
            files = {"file": (file.filename or "audio.wav", file_bytes, file.content_type or "audio/wav")}
            data = {"model": "whisper-large-v3-turbo"}
            if language and language != "auto":
                data["language"] = language
            resp = requests.post(url, headers=headers, files=files, data=data)
            if resp.status_code == 200:
                raw_text = resp.json().get("text", "")
                cleaned = clean_text(raw_text)
                return {
                    "success": True,
                    "raw_text": raw_text,
                    "cleaned_text": cleaned,
                    "duration": 0
                }

    # If no server cloud key is set, client-side Transformers.js handles it directly in browser
    return {
        "success": False,
        "message": "Use client-side in-browser Whisper or configure GROQ_API_KEY on Vercel."
    }
