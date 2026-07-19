# Premortem AI

AI-powered pre-mortem planning simulator that surfaces likely failure modes and the most critical overlooked risk before a plan is executed.

## What the app does

- Accepts a plan or initiative as input
- Streams checkpoint analysis through Server-Sent Events (SSE)
- Renders an interactive React Flow graph of checkpoints, failure cards, and a critical-risk callout
- Highlights the most damaging overlooked risk across the timeline
- Uses AI providers to generate structured JSON for each checkpoint result

## Current project structure

- `backend/` — FastAPI service exposing the `/premortem` SSE endpoint
    - `backend/main.py` — streaming API entry point
    - `backend/checkpoints.py` — shared checkpoint prompts and definitions
- `frontend/` — React + TypeScript UI built with Vite and React Flow
    - `frontend/src/App.tsx` — app shell, theme toggle, sample plans, and form controls
    - `frontend/src/PremortemFlow.tsx` — streaming graph UI
    - `frontend/src/premortemGraph.ts` — pure graph derivation logic used by the UI and tests
    - `frontend/src/App.test.tsx` and `frontend/src/PremortemFlow.test.tsx` — Vitest coverage
- `presentation/` — pitch deck and product narrative

## Requirements

### Backend

- Python 3.11+
- FastAPI
- Uvicorn
- OpenAI-compatible client support for Groq/OpenAI/Gemini
- `python-dotenv`

Install backend dependencies:

```bash
cd backend
pip install -r requirements.txt
```

### Frontend

- Node.js 20+
- npm

Install frontend dependencies:

```bash
cd frontend
npm install
```

## Configuration

Create a `.env` file in the `backend/` directory (or project root if you launch the backend from there) with the provider keys you want to use.

Example:

```env
OPENAI_API_KEY=your_openai_api_key
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
CHECKPOINT_TIMEOUT_SECONDS=45
```

If the frontend is running separately from the backend, also set the Vite API URL:

```env
# frontend/.env
VITE_API_URL=http://127.0.0.1
VITE_API_PORT=8000
```

## Running the app

### 1) Start the backend

```bash
cd backend
uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000/premortem`.

### 2) Start the frontend

```bash
cd frontend
npm run dev
```

Open the local Vite URL shown in the terminal to use the app.

## How it works

1. The frontend sends the plan text to the backend via a POST request to `/premortem`.
2. The backend streams checkpoint results as SSE events for `Month 1`, `Month 6`, and `Year 1`.
3. The frontend progressively renders the timeline graph and highlights the most likely critical risk.
4. The graph is derived from checkpoint results and critical-risk output, keeping the UI state and visual layout in sync.

## Development commands

```bash
# Backend
cd backend
uvicorn main:app --reload

# Frontend dev server
cd frontend
npm run dev

# Frontend production build
cd frontend
npm run build

# Frontend tests
cd frontend
npm run test:run
```

## Notes

- The backend expects AI providers to return strict JSON for checkpoint results and critical-risk analysis.
- The frontend uses React Flow for the interactive graph and Tailwind CSS for styling.
- If no provider credentials are configured, the backend returns a descriptive runtime error.
