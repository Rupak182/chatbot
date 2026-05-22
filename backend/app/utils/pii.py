import re

def redact_pii(text: str) -> str:
    """
    Scrubs sensitive Personally Identifiable Information (PII) such as
    emails, credit card numbers, phone numbers, and API keys before database commitment.
    """
    if not text:
        return text
    
    # 1. Redact API Keys (highly sensitive developer credentials)
    # Matches Gemini keys starting with AIzaSy and Groq keys starting with gsk_
    text = re.sub(r'\b(?:gsk_|AIzaSy)[a-zA-Z0-9_-]{20,}\b', '[API_KEY_REDACTED]', text)
    
    # 2. Redact Email Addresses
    text = re.sub(r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b', '[EMAIL_REDACTED]', text)
    
    # 3. Redact Credit Card Numbers (Matches standard formats with space/dash separators)
    text = re.sub(r'\b(?:\d[ -]*?){13,16}\b', '[CREDIT_CARD_REDACTED]', text)
    
    # 4. Redact Phone Numbers (Basic international and local format coverage)
    text = re.sub(r'\b(?:\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b', '[PHONE_REDACTED]', text)
    
    return text
