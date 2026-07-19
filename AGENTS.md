# AI-Hackathon Agent Instructions

## Stack

- Frontend: React 19 with React Flow.
- Backend: FastAPI (Python).
- AI: Claude API.
- Persistence: no database; keep state in memory or pass it through requests.
- Streaming: Server-Sent Events (SSE).

## Implementation Conventions

- Keep the frontend and backend responsibilities separate.
- Use React Flow for interactive plan and timeline visualizations.
- Implement streaming backend endpoints with SSE and consume them incrementally
  in the React client.
- Keep Claude prompts explicit, structured, and grounded in user-provided plan
  data; avoid generic outputs.
- Do not introduce a database, authentication system, or additional services
  unless the user specifically requests them.
- Add type hints to Python functions and keep API request/response shapes clear.
- Prefer small, focused modules and components over large all-purpose files.

## Verification

- Run relevant frontend lint/build checks after frontend changes when available.
- Run relevant FastAPI/Python checks after backend changes when available.
