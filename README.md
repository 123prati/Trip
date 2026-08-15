# Trip Planner Chat (Local)

Minimal FastAPI + single-file frontend chat that forwards messages to Azure OpenAI.

Setup (Windows):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Edit .env to set AZURE_ENDPOINT, AZURE_API_KEY
uvicorn app:app --reload
```

Open http://127.0.0.1:8000/ and use the chat UI. The server expects `AZURE_ENDPOINT`, `AZURE_DEPLOYMENT`, and `AZURE_API_KEY` to be set in the environment or `.env` file. The backend prepends one system message before sending the conversation to the model.
