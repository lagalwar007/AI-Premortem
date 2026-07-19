# Premortem AI

AI-powered decision simulator that identifies future risks before they happen using interactive, streaming visualizations.

## What it does

- Takes a user plan as input
- Streams timeline checkpoint analysis via Server-Sent Events (SSE)
- Builds a dynamic React Flow graph of checkpoints and failure nodes
- Highlights the most critical overlooked risk
- Uses AI backends to generate JSON-formatted failure mode predictions

## Project structure

- `main.py` — FastAPI backend that exposes a `/premortem` SSE endpoint
- `checkpoints.py` — shared prompt construction and checkpoint definitions
- `frontend/` — React + TypeScript frontend using React Flow
- `presentation/` — pitch deck content and project narrative
- `.env.example` — sample environment variables

## Requirements

### Backend

- Python 3.11+ (recommended)
- `fastapi`
- `uvicorn[standard]`
- `openai`
- `google-genai`
- `python-dotenv`

Install backend dependencies with:

```bash
pip install -r requirements.txt
```

### Frontend

- Node.js 20+ (recommended)
- `npm`

Install frontend dependencies with:

```bash
cd frontend
npm install
```

## Configuration

Create a `.env` file in the project root based on `.env.example` and provide the API keys you plan to use.

Example:

```env
OPENAI_API_KEY=your_openai_api_key
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
CHECKPOINT_TIMEOUT_SECONDS=45
```

## Running the app

### Start the backend

```bash
uvicorn main:app --reload
```

The backend will be available at `http://127.0.0.1:8000`.

### Start the frontend

```bash
cd frontend
npm run dev
```

Open the local Vite URL shown in the terminal to use the app.

## How it works

1. The frontend POSTs a plan to `/premortem` with SSE accepted.
2. The backend calls the configured AI model for each checkpoint (`Month 1`, `Month 6`, `Year 1`).
3. Each checkpoint emits a streamed SSE event with failure modes.
4. After checkpoints complete, the backend emits a critical risk event.
5. The frontend renders nodes and edges with React Flow and layouts them automatically.

## Notes

- This app expects the AI backend to return strict JSON for checkpoint results and critical risk data.
- The frontend currently uses `dagre` to compute tree-style node layouts.
- If an AI provider is not configured, the backend returns a helpful runtime error.

## Useful commands

```bash
# Backend only
uvicorn main:app --reload

# Frontend only
cd frontend
npm run dev

# Build frontend for production
cd frontend
npm run build
```

## Contact

This project was built as a Premortem AI using React, TypeScript, React Flow, FastAPI, and SSE streaming.
