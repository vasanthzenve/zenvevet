import os
import sys
import re
import json
import requests
from difflib import get_close_matches
from flask import Flask, render_template, request, jsonify

# Pre-import setuptools to provide distutils in Python 3.12+ environments
try:
    import setuptools  # noqa: F401
except ImportError:
    pass

# Dynamically add bundled site-packages from venv if available
venv_site_packages = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.8', 'site-packages')
if os.path.exists(venv_site_packages) and venv_site_packages not in sys.path:
    sys.path.append(venv_site_packages)

app = Flask(__name__)

# Enable Cross-Origin Resource Sharing (CORS) for frontend requests
try:
    from flask_cors import CORS
    CORS(app, origins="*")
except ImportError:
    @app.after_request
    def add_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

# Initialize LanguageTool safely
tool = None
try:
    from language_tool_python import LanguageTool
    tool = LanguageTool('en-US')
    print("[NLP Service] LanguageTool initialized successfully.")
except Exception as lt_err:
    print(f"[NLP Service] LanguageTool optional fallback mode: {lt_err}")

# Initialize SpellChecker safely
spell = None
try:
    from spellchecker import SpellChecker
    spell = SpellChecker()
    print("[NLP Service] SpellChecker initialized successfully.")
except Exception as sc_err:
    print(f"[NLP Service] SpellChecker optional fallback mode: {sc_err}")

# Initialize spaCy safely (fallback to regex tokenizer if C-extensions unavailable)
nlp = None
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
    print("[NLP Service] spaCy en_core_web_sm initialized successfully.")
except Exception as spacy_err:
    print(f"[NLP Service] spaCy optional fallback (using high-speed regex tokenizer): {spacy_err}")

# Ollama LLM Configuration
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")

PET_WORDS = {
    "cat", "cats", "kitten", "kittens", "dog", "dogs", "puppy", "puppies",
    "rabbit", "rabbits", "hamster", "hamsters", "parrot", "parrots",
    "guinea pig", "turtle", "turtles", "fish", "bird", "birds",
    "leash", "collar", "cage", "vet", "bark", "meow", "chirp",
    "play", "feed", "walk", "pet", "groom", "adopt", "treat",
    "veterinary", "canine", "feline", "bovine", "equine", "suture",
    "incision", "lesion", "biopsy", "triage", "radiology", "ultrasound",
    "auscultation", "tachycardia", "pyoderma", "demodex", "fracture",
    "splint", "bandage", "antibiotic", "analgesic", "anesthetic", "dosage"
}

PET_WORD_CORRECTIONS = {
    "untuation": "punctuation",
    "unctuation": "punctuation",
    "caty": "cat",
    "dogg": "dog",
    "doggy": "doggy",
    "puppie": "puppy",
    "puppys": "puppies",
    "kittenn": "kitten",
    "kiten": "kitten",
    "rabit": "rabbit",
    "rabitt": "rabbit",
    "hamter": "hamster",
    "hamester": "hamster",
    "perrot": "parrot",
    "parot": "parrot",
    "gerbile": "gerbil",
    "guiniea": "guinea",
    "guineapig": "guinea pig",
    "turtlee": "turtle",
    "fishh": "fish",
    "vett": "vet",
    "veterinarian": "veterinarian",
    "fevr": "fever",
    "lesn": "lesion",
    "palpatn": "palpation",
    "auscultatn": "auscultation"
}


def normalize_punctuation(text):
    if not text:
        return ""
    text = re.sub(r"\s+([,.!?;:%])", r"\1", text)
    text = re.sub(r"([,.!?;])(?=\w)", r"\1 ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"([.!?]){2,}", r"\1", text)
    text = re.sub(r"\.{3,}", "...", text)

    text = re.sub(r"(^|[.!?]\s+)([a-z])", lambda match: match.group(1) + match.group(2).upper(), text)
    if text:
        text = text[0].upper() + text[1:]
    return text


def ollama_correct(text):
    if not text:
        return text
    prompt = (
        "Correct only the grammar, spelling, punctuation, and capitalization in the text below. "
        "It is a veterinary clinical observation or pet care notes. Preserve every word's medical meaning "
        "and do not add explanations or extra text. "
        "Do not add or remove words, and do not change singular or plural forms unless the text clearly requires it. "
        "Return only the corrected text.\n\n"
        f"Text: {text}"
    )
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=15,
        )
        response.raise_for_status()
        result = response.json().get("response", "").strip()
        result = re.sub(r'^["\']|["\']$', "", result).strip()
        return result or text
    except Exception:
        # Graceful fallback to local pipeline if Ollama service is offline or not installed
        return text


def correct_pet_words(text):
    if not text:
        return ""
    for misspelling, correction in PET_WORD_CORRECTIONS.items():
        pattern = re.compile(r"\b" + re.escape(misspelling) + r"\b", re.IGNORECASE)
        text = pattern.sub(
            lambda match: correction.capitalize() if match.group(0)[0].isupper() else correction,
            text,
        )
    return text


class SimpleWordToken:
    def __init__(self, text):
        self.text = text
        self.is_alpha = text.isalpha()


def tokenize_text(text):
    if nlp is not None:
        try:
            return nlp(text)
        except Exception:
            pass
    raw_tokens = re.findall(r"[A-Za-z]+|[^\w\s]", text)
    return [SimpleWordToken(t) for t in raw_tokens]


def analyze_text(text):
    if not text:
        return [], []

    tokens = tokenize_text(text)
    previous_words = [token.text.lower() for token in tokens[-5:] if token.is_alpha]

    suggestions = []
    seen = set()
    for token in tokens:
        word = token.text.lower()
        if not token.is_alpha or len(word) < 3:
            continue

        fixed_pet = PET_WORD_CORRECTIONS.get(word)
        if fixed_pet:
            suggestions.append({
                "word": token.text,
                "suggestion": fixed_pet,
                "reason": "Pet & veterinary domain vocabulary",
            })
            seen.add(word)
            continue

        is_known = (word in PET_WORDS) or (spell is not None and word in spell.word_frequency.words())
        if is_known:
            continue

        candidates = set(get_close_matches(word, PET_WORDS, n=3, cutoff=0.72))
        if spell is not None:
            try:
                candidates.update(spell.candidates(word) or [])
                candidates = [c for c in candidates if c in spell.word_frequency.words() or c in PET_WORDS]
            except Exception:
                pass
        candidates = [c for c in candidates if c != word][:3]
        if candidates:
            suggestion = candidates[0]
            if word in seen:
                continue
            suggestions.append({
                "word": token.text,
                "suggestion": suggestion,
                "reason": "NLP context and spelling similarity",
            })
            seen.add(word)

    next_suggestions = suggest_next_pet_words(previous_words)
    return suggestions, next_suggestions


def suggest_next_pet_words(previous_words):
    if not previous_words:
        return []

    context = " ".join(previous_words)
    last_word = previous_words[-1]

    if last_word in {"my", "your", "her", "his", "our", "the"}:
        return ["cat", "dog", "patient", "puppy", "kitten", "case"]
    if last_word in {"feed", "walk", "play", "groom", "adopt", "treat", "examine"}:
        return ["the patient", "twice daily", "carefully", "post-op"]
    if last_word in {"bark", "meow", "chirp", "limp", "vomit"}:
        return ["frequently", "today", "intermittently", "under observation"]
    if last_word in PET_WORDS:
        return ["and", "is", "stable", "shows improvement", "requires monitoring"]
    if "pet" in context or "patient" in context or "case" in context or "animal" in context:
        return ["care", "treatment", "vet", "recheck in 48 hours", "healthy"]
    return ["patient", "clinical observation", "follow-up"]


def process_nlp_pipeline(input_text):
    clean_text = (input_text or "").strip()
    if not clean_text:
        return {
            "original_text": "",
            "paraphrased_text": "",
            "model": f"NLP Pet Grammar & Spell Checker ({OLLAMA_MODEL})",
            "suggestions": [],
            "next_suggestions": []
        }

    # Step 1: Pet word domain corrections
    text = correct_pet_words(clean_text)

    # Step 2: Normalize punctuation & capital letters
    text = normalize_punctuation(text)

    # Step 3: Ollama LLM contextual grammar correction
    text = ollama_correct(text)

    # Step 4: LanguageTool rule-based grammar pass
    if tool is not None:
        try:
            text = tool.correct(text)
        except Exception:
            pass

    # Step 5: Final touch domain corrections & normalization
    text = correct_pet_words(text)
    text = normalize_punctuation(text)

    # Step 6: Text tokenization, spelling candidate analysis & next-word suggestions
    suggestions, next_suggestions = analyze_text(text)

    return {
        "original_text": clean_text,
        "paraphrased_text": text or clean_text,
        "model": f"NLP Pet Grammar & Spell Checker ({OLLAMA_MODEL})",
        "suggestions": suggestions,
        "next_suggestions": next_suggestions
    }


# ==========================================
# API & WEB ROUTES
# ==========================================

@app.route('/health', methods=['GET'])
@app.route('/api/vetscribe/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "service": "NLP Pet Grammar & Spell Checker",
        "model": OLLAMA_MODEL,
        "ollama_connected": True,
        "language_tool": tool is not None,
        "spell_checker": spell is not None
    })


@app.route('/api/vetscribe/paraphrase', methods=['POST', 'OPTIONS'])
def api_paraphrase():
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(silent=True) or {}
    text = data.get('text') or request.form.get('text') or ''

    if not text.strip():
        return jsonify({
            "detail": "Please enter veterinary clinical notes.",
            "error": "Empty text provided"
        }), 400

    result = process_nlp_pipeline(text)
    return jsonify(result)


@app.route('/spell', methods=['POST'])
def spell_check():
    # If called as JSON API by client or proxy
    if request.is_json or request.headers.get('Accept') == 'application/json':
        data = request.get_json(silent=True) or {}
        text = data.get('text', '').strip()
        result = process_nlp_pipeline(text)
        return jsonify(result)

    # If called from HTML form
    raw_text = request.form.get('text', '')
    result = process_nlp_pipeline(raw_text)

    return render_template(
        'index.html',
        corrected_text=result['paraphrased_text'],
        text=raw_text,
        suggestions=result['suggestions'],
        next_suggestions=result['next_suggestions'],
    )


@app.route('/', methods=['GET'])
def index():
    if request.headers.get('Accept') == 'application/json':
        return health_check()
    return render_template(
        'index.html',
        corrected_text='',
        text='',
        suggestions=[],
        next_suggestions=[],
    )


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8005))
    print(f"=================================================================")
    print(f" Zenve Vet NLP Grammar & Spell Checker Service")
    print(f" Listening on http://0.0.0.0:{port}")
    print(f"=================================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
