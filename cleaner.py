import re
from typing import List, Dict, Any

FILLER_WORDS = [
    r"\bum+\b",
    r"\buh+\b",
    r"\ber+\b",
    r"\berm+\b",
    r"\bah+\b",
    r"\bahm+\b",
    r"\byou know\b",
    r"\bi mean\b",
    r"\bkind of\b",
    r"\bsort of\b",
    r"\bbasically\b",
    r"\bliterally\b",
    r"\bactually\b",
]

# Combined regex pattern for filler words (case-insensitive)
FILLER_REGEX = re.compile(r"|".join(FILLER_WORDS), re.IGNORECASE)

# Repeated word regex (e.g., "the the", "I I", "and and")
REPEATED_WORDS_REGEX = re.compile(r"\b([a-zA-Z]+)\s+\1\b", re.IGNORECASE)


def clean_text(text: str, remove_fillers: bool = True, fix_repetitions: bool = True, auto_punctuate: bool = True) -> str:
    """
    Cleans transcript text by removing fillers, stutter repetitions,
    and normalizing spacing and punctuation.
    """
    if not text:
        return ""

    cleaned = text.strip()

    if remove_fillers:
        # Match filler words possibly followed by commas or hyphens
        filler_punct_regex = re.compile(
            r"\b(" + "|".join(FILLER_WORDS).replace(r"\b", "") + r")\b[\s,]*",
            re.IGNORECASE
        )
        cleaned = filler_punct_regex.sub(" ", cleaned)

    if fix_repetitions:
        # Match single word and two-word phrase repetitions (e.g. "I I", "the team the team")
        phrase_repeat_regex = re.compile(r"\b(\b[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+\1\b", re.IGNORECASE)
        prev = None
        while prev != cleaned:
            prev = cleaned
            cleaned = phrase_repeat_regex.sub(r"\1", cleaned)

    # Remove commas mistakenly placed after prepositions, conjunctions, pronouns, or modal verbs due to hesitation
    cleaned = re.sub(
        r"\b(to|and|the|a|an|in|on|at|of|for|with|that|if|or|but|we|i|you|they|he|she|it|should|could|would|can|will|must|might|is|are|was|were)\s*,\s*",
        r"\1 ",
        cleaned,
        flags=re.IGNORECASE
    )
    # Clean double spaces, spaces before punctuation
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([,.:;?!])", r"\1", cleaned)
    # Remove repeated commas or mixed punctuation like ",," or ",."
    cleaned = re.sub(r"[,;]+", ",", cleaned)
    cleaned = re.sub(r"([.?!])\s*[,;]", r"\1 ", cleaned)
    cleaned = re.sub(r"([.?!]){2,}", r"\1", cleaned)
    # Remove leading comma or colon at start of string or after period
    cleaned = re.sub(r"(^|[.?!]\s*)[,;:]\s*", r"\1", cleaned)

    if auto_punctuate:
        # Capitalize start of sentences
        sentences = re.split(r"([.?!]\s*)", cleaned)
        reconstructed = []
        for i in range(0, len(sentences), 2):
            s = sentences[i].strip()
            if s:
                s = s[0].upper() + s[1:]
            sep = sentences[i+1] if i+1 < len(sentences) else ""
            reconstructed.append(s + sep)
        cleaned = "".join(reconstructed).strip()

        # Add period if ending without punctuation
        if cleaned and cleaned[-1] not in ".?!":
            cleaned += "."

    # Final cleanup of any stranded double spaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def extract_bullet_points(text: str) -> List[str]:
    """
    Splits transcript into readable key summary bullet points.
    """
    if not text:
        return []
    
    # Split by sentence enders
    raw_sentences = [s.strip() for s in re.split(r"[.?!]\s*", text) if len(s.strip()) > 10]
    
    if not raw_sentences:
        if text.strip():
            return [text.strip()]
        return []

    # Filter and format bullets
    bullets = []
    for s in raw_sentences:
        bullet = s[0].upper() + s[1:]
        if not bullet.endswith("."):
            bullet += "."
        bullets.append(bullet)
    return bullets


def extract_action_items(text: str) -> List[str]:
    """
    Identifies sentences that look like tasks, action items, or directives.
    """
    if not text:
        return []
        
    action_keywords = [
        "need to", "have to", "should", "will", "must", "action item", 
        "don't forget", "make sure", "ensure", "follow up", "send", "schedule", "create", "assign"
    ]
    pattern = re.compile(r"\b(" + "|".join(action_keywords) + r")\b", re.IGNORECASE)

    raw_sentences = [s.strip() for s in re.split(r"[.?!]\s*", text) if len(s.strip()) > 8]
    items = []
    for s in raw_sentences:
        if pattern.search(s):
            formatted = s[0].upper() + s[1:]
            if not formatted.endswith("."):
                formatted += "."
            items.append(formatted)
    return items
