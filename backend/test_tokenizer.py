import litellm

models_to_test = [
    "gemini/gemini-2.5-flash-lite",
    "gemini/gemini-2.5-flash",
    "gemini/gemini-3.5-flash",
    "gemini/gemma-4-31b-it",
    "groq/llama-3.3-70b-versatile",
    "groq/llama-3.1-8b-instant"
]

text = "Hello world! This is a test of the local tokenization system."

print("--- Testing LiteLLM Local Token Counter (Frontend UI Models) ---")
for model in models_to_test:
    try:
        tokens = litellm.token_counter(model=model, text=text)
        print(f"✅ Success for model '{model}': {tokens} tokens calculated!")
    except Exception as e:
        print(f"❌ Failed for model '{model}' with error: {type(e).__name__}: {str(e)}")
        print(f"   Estimated word split count: {len(text.split())} tokens.")
