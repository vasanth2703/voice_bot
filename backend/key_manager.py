import os
import google.generativeai as genai
import time
from google.api_core.exceptions import ResourceExhausted

# Global list of keys and current index
_api_keys = []
_current_index = 0

def init_keys():
    global _api_keys, _current_index
    # Read GEMINI_API_KEYS (comma-separated list) or fallback to GEMINI_API_KEY
    keys_str = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY") or ""
    _api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    _current_index = 0
    if _api_keys:
        genai.configure(api_key=_api_keys[0])
        print(f"Gemini API configured with primary key (ending in ...{_api_keys[0][-4:] if len(_api_keys[0]) > 4 else _api_keys[0]})")
    else:
        print("WARNING: No GEMINI_API_KEY or GEMINI_API_KEYS configured.")

def get_api_keys():
    global _api_keys
    if not _api_keys:
        # Lazy initialization if not initialized yet
        init_keys()
    return _api_keys

def rotate_key():
    global _api_keys, _current_index
    if not _api_keys or len(_api_keys) <= 1:
        return False
    _current_index = (_current_index + 1) % len(_api_keys)
    next_key = _api_keys[_current_index]
    genai.configure(api_key=next_key)
    print(f"Switched Gemini API key to key index {_current_index} (ending in ...{next_key[-4:] if len(next_key) > 4 else next_key}) due to rate limit/quota.")
    return True

def execute_with_retry(func, *args, **kwargs):
    """Executes a google-generativeai function. If a 429 quota or rate limit is hit,
    rotates the API key and retries up to the number of available keys."""
    global _api_keys
    keys = get_api_keys()
    max_attempts = max(1, len(keys))
    
    for attempt in range(max_attempts):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            err_msg = str(e)
            # Detect 429, ResourceExhausted, rate limits, or quota errors
            is_429 = isinstance(e, ResourceExhausted) or "429" in err_msg or "quota" in err_msg.lower() or "limit" in err_msg.lower()
            
            if is_429 and attempt < max_attempts - 1:
                print(f"API Call failed (Attempt {attempt + 1}/{max_attempts}): {err_msg}")
                if rotate_key():
                    time.sleep(0.5)  # small delay before retry
                    continue
            # If not a 429 or we ran out of keys, raise the exception
            raise e
