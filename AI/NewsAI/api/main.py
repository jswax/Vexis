"""
POST /score — headline → impact score (heuristic until a FinBERT checkpoint is wired in).
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from inference.heuristic import score_headline_heuristic

app = FastAPI(title="NewsAI QQQ Impact", version="0.1.0")


class ScoreRequest(BaseModel):
    headline: str = Field(..., min_length=1, max_length=2000)


class ScoreResponse(BaseModel):
    score: float
    direction: str
    model: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/score", response_model=ScoreResponse)
def score_headline(req: ScoreRequest) -> ScoreResponse:
    s = score_headline_heuristic(req.headline)
    direction = "bullish" if s > 0 else "bearish" if s < 0 else "neutral"
    return ScoreResponse(score=round(s, 3), direction=direction, model="heuristic_v0")
