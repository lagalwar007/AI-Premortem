"""FastAPI service for streaming checkpoint-based plan pre-mortems."""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from checkpoints import CHECKPOINTS, build_checkpoint_prompt

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment]
else:
    load_dotenv()

try:
    from openai import AsyncOpenAI
except ImportError:  # Allows the service to return a useful SSE error if uninstalled.
    AsyncOpenAI = None  # type: ignore[assignment,misc]

try:
    from google import genai
except ImportError:
    genai = None  # type: ignore[assignment]


app = FastAPI(title="Plan Pre-mortem API")

CHECKPOINT_TIMEOUT_SECONDS = float(os.getenv("CHECKPOINT_TIMEOUT_SECONDS", "45"))
# Groq's free plan makes this a useful out-of-the-box choice for local demos.
DEFAULT_MODEL = "llama-3.3-70b-versatile"
SUPPORTED_MODELS = {
    "llama-3.3-70b-versatile": ("groq", "llama-3.3-70b-versatile"),
    "llama-3.1-8b-instant": ("groq", "llama-3.1-8b-instant"),
    "gpt-4.1-mini": ("openai", "gpt-4.1-mini"),
    "gpt-4.1": ("openai", "gpt-4.1"),
    "gemini-2.5-flash": ("gemini", "gemini-2.5-flash"),
    "gemini-2.5-pro": ("gemini", "gemini-2.5-pro"),
}


class PremortemRequest(BaseModel):
    plan: str = Field(min_length=1, description="The plan to assess.")
    model: str = Field(default=DEFAULT_MODEL, description="A supported AI model identifier.")


def _sse(event: str, data: dict[str, Any]) -> str:
    """Encode one Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _json_from_model(text: str) -> Any:
    """Parse a model's JSON response, accepting a fenced JSON code block."""
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    return json.loads(fenced.group(1) if fenced else text)


async def _ask_model(prompt: str, model: str) -> Any:
    """Send one prompt to the selected provider and decode its JSON response."""
    provider_config = SUPPORTED_MODELS.get(model)
    if provider_config is None:
        raise ValueError(f"Unsupported model: {model}")
    provider, provider_model = provider_config

    if provider == "openai":
        if AsyncOpenAI is None:
            raise RuntimeError("The openai package is not installed.")
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        response = await AsyncOpenAI().responses.create(
            model=provider_model,
            input=prompt,
            max_output_tokens=1_200,
        )
        text = response.output_text
    elif provider == "groq":
        if AsyncOpenAI is None:
            raise RuntimeError("The openai package is not installed.")
        if not os.getenv("GROQ_API_KEY"):
            raise RuntimeError("GROQ_API_KEY is not configured.")
        # Groq exposes an OpenAI-compatible Chat Completions API.
        client = AsyncOpenAI(
            api_key=os.environ["GROQ_API_KEY"],
            base_url="https://api.groq.com/openai/v1",
        )
        response = await client.chat.completions.create(
            model=provider_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_completion_tokens=1_200,
        )
        text = response.choices[0].message.content if response.choices else None
    else:
        if genai is None:
            raise RuntimeError("The google-genai package is not installed.")
        if not os.getenv("GEMINI_API_KEY"):
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        response = await client.aio.models.generate_content(
            model=provider_model,
            contents=prompt,
        )
        text = response.text

    if not text:
        raise ValueError(f"{provider.title()} returned no text content.")
    return _json_from_model(text)


async def _ask_checkpoint(prompt: str, model: str) -> Any:
    """Call the selected model with one retry only for a timeout."""
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            return await asyncio.wait_for(
                _ask_model(prompt, model), timeout=CHECKPOINT_TIMEOUT_SECONDS
            )
        except TimeoutError as exc:
            last_error = exc
            if attempt == 0:
                continue
        except Exception:
            # Authentication, quota, and malformed-response errors cannot be
            # fixed by immediately replaying the identical request.
            raise

    raise RuntimeError(
        f"Checkpoint model request failed after two attempts: {last_error}"
    ) from last_error


def _checkpoint_prompt(plan: str, checkpoint: str, prior_failures: str) -> str:
    """Constrain the shared pre-mortem prompt to one checkpoint call."""
    return f"""{build_checkpoint_prompt(plan, prior_failures)}

IMPORTANT: This is the call for **{checkpoint}** only. Return exactly a JSON
array containing 2-3 failure-mode objects for {checkpoint}; do not analyze the
other checkpoints in this response. Each object must have `description`,
`probability` (low, medium, or high), `severity` (integer 1-5), and
`mitigation` (one sentence) keys. Return JSON only, with no Markdown.
"""


def _critical_risk_prompt(plan: str, checkpoint_results: list[dict[str, Any]]) -> str:
    return f"""Review this plan and the checkpoint pre-mortem results.

Select the single most damaging failure that is still plausibly overlooked
across the full timeline. It must be grounded in the supplied plan and must
not be a generic risk. Select one of the supplied failure modes rather than
inventing a new one. Return JSON only, as one object with `description`,
`why_overlooked`, `severity` (integer 1-5), `mitigation` (one concrete
sentence), `source_checkpoint`, and `source_failure_description` keys. The
source fields must exactly identify the selected checkpoint result and its
failure-mode description.

PLAN:
{plan}

CHECKPOINT RESULTS:
{json.dumps(checkpoint_results)}
"""


async def _premortem_events(plan: str, model: str) -> AsyncIterator[str]:
    """Run calls in timeline order and yield a completed SSE event per call."""
    completed_results: list[dict[str, Any]] = []

    for checkpoint in CHECKPOINTS:
        prior_failures = json.dumps(completed_results) if completed_results else "None identified yet."
        try:
            failure_modes = await _ask_checkpoint(
                _checkpoint_prompt(plan, checkpoint, prior_failures), model
            )
            if not isinstance(failure_modes, list):
                raise ValueError("The selected model did not return a JSON array of failure modes.")
            result = {"checkpoint": checkpoint, "failure_modes": failure_modes}
            completed_results.append(result)
            yield _sse("checkpoint", result)
        except Exception as exc:
            # Each checkpoint has an independent failure boundary: later calls continue.
            yield _sse(
                "checkpoint",
                {
                    "checkpoint": checkpoint,
                    "failure_modes": [],
                    "error": str(exc),
                },
            )

    try:
        critical_risk = await _ask_model(_critical_risk_prompt(plan, completed_results), model)
        yield _sse("critical_risk", {"critical_risk": critical_risk})
    except Exception as exc:
        yield _sse("critical_risk", {"critical_risk": None, "error": str(exc)})


@app.post("/premortem")
async def premortem(request: PremortemRequest) -> StreamingResponse:
    """Stream checkpoint analyses followed by the cross-timeline critical risk."""
    return StreamingResponse(
        _premortem_events(request.plan, request.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
