import os
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import openai


load_dotenv()

AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT")
AZURE_DEPLOYMENT = os.getenv("AZURE_DEPLOYMENT")
AZURE_API_KEY = os.getenv("AZURE_API_KEY")

app = FastAPI()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]


SYSTEM_PROMPT = (
    "You are an expert trip-planning assistant. Provide concise, practical travel advice, "
    "ask clarifying questions when necessary, and remind users to verify details like visas, "
    "travel restrictions, and bookings. Be friendly and safety-minded."
)


def validate_env():
    if not AZURE_ENDPOINT or not AZURE_DEPLOYMENT or not AZURE_API_KEY:
        raise RuntimeError("Missing required Azure environment variables")


def configure_openai():
    openai.api_type = "azure"
    openai.api_base = AZURE_ENDPOINT
    # Azure requires an API version; default to a common supported version if not set
    openai.api_version = os.getenv("AZURE_API_VERSION", "2023-05-15")
    openai.api_key = AZURE_API_KEY


@app.get("/")
async def root():
    return FileResponse("index.html")


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        validate_env()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    configure_openai()

    # Build the messages list, prepending a single system message.
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    # Call Azure OpenAI via the OpenAI Python SDK using the ChatCompletion API.
    try:
        resp = openai.ChatCompletion.create(
            engine=AZURE_DEPLOYMENT,
            messages=messages,
            max_tokens=512,
            temperature=0.2,
        )
    except Exception as e:
        # Log the exception traceback for debugging (do not print secrets)
        import traceback

        print("OpenAI call failed:", repr(e))
        print(traceback.format_exc())
        return JSONResponse(status_code=502, content={"error": "AI service error"})

    # Extract reply text safely
    try:
        reply = resp.choices[0].message.get("content", "")
    except Exception:
        reply = ""

    return {"reply": reply}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
