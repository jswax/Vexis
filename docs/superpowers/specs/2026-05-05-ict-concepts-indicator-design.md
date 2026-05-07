# ICT Concepts Indicator — Design Spec

**Date:** 2026-05-05
**Status:** Approved (design phase)
**Scope:** v1 — FVG and IFVG only. Single Pine Script v6 indicator file. Live visual test on TradingView.

## Goal

Build the foundation of an ICT (Inner Circle Trader) concepts indicator on TradingView, starting with Fair Value Gaps (FVG) and Inverse Fair Value Gaps (IFVG). The indicator is intentionally narrow at v1 — detect, draw, alert. Future ICT concepts (order blocks, liquidity sweeps, BOS/CHoCH, killzones) will be added in subsequent iterations. Eventual long-term goal is to fuse this with other Vexis models (news, social) into a combined buy/sell signal, but that is **out of scope** for v1.

## Non-Goals (v1)

- No backend service, no Postgres, no API integration
- No fusion with NewsAI or any social model
- No order blocks, breaker blocks, liquidity sweeps, BOS/CHoCH
- No killzones, session filters, volatility filters
- No multi-timeframe (HTF FVGs on LTF chart)
- No strategy backtesting (this is an indicator, not a strategy)

## Architecture

A single Pine Script v6 indicator file. No external dependencies, no data adapters, no backend. Runs entirely on TradingView using native chart OHLCV. Source-controlled in this repo so we can iterate without losing history.

**Repo layout (new):**
```
pine/
├── ict-concepts.pine    # the indicator source
└── README.md            # load instructions for TradingView
```

The Pine file is the single source of truth. To run it: paste contents into TradingView's Pine Editor, save, add to chart.

## Detection Rules

### Bullish FVG
3-candle pattern where `bar[2].high < bar[0].low`. The gap between `bar[2].high` (bottom of box) and `bar[0].low` (top of box) is the inefficiency. Box is anchored to `bar[1]`'s time and extends right.

### Bearish FVG
3-candle pattern where `bar[2].low > bar[0].high`. Box from `bar[2].low` (top of box) down to `bar[0].high` (bottom of box). Anchored to `bar[1]`.

### CE (Consequent Encroachment)
The 50% midline of the FVG. Drawn as a thin dashed line inside the box for reference. Not used for state transitions in v1 — purely visual.

### Detection Timing
Detection fires only on **confirmed bar close** (`barstate.isconfirmed`). No intrabar detection — prevents repaint and false signals from in-progress candles.

## State Machine

Each detected gap progresses through three states:

```
ACTIVE_FVG  →  INVERTED_IFVG  →  SPENT
```

**Transitions:**

1. **ACTIVE_FVG → INVERTED_IFVG**
   Trigger: a candle *body* closes fully through the FVG (close beyond the far edge of the gap, in the opposite direction of the original polarity).
   Action: flip polarity (bullish FVG becomes bearish IFVG; bearish FVG becomes bullish IFVG), recolor box, keep on chart.

2. **INVERTED_IFVG → SPENT**
   Trigger: a candle body closes fully through the IFVG in the direction *opposite* to the IFVG's new polarity. Example: a bearish FVG that body-closed upward becomes a bullish IFVG; that bullish IFVG is then spent when a candle body closes downward through its lower boundary.
   Action: mark SPENT, remove box from chart.

3. **ACTIVE_FVG and INVERTED_IFVG drawing**
   Box extends rightward each new bar until the state advances to SPENT.

**Rationale:** This is faithful to ICT's pure teaching — wicks do not mitigate, only body closes flip state. CE (midline) is drawn for visual reference but does not drive state.

## Inputs (Settings Panel)

| Input | Type | Default | Notes |
|---|---|---|---|
| Show bullish FVG | bool | true | |
| Show bearish FVG | bool | true | |
| Show IFVGs after inversion | bool | true | |
| Show CE midline | bool | true | thin dashed line |
| Bullish FVG color | color | green-tinted | |
| Bearish FVG color | color | red-tinted | |
| Bullish IFVG color | color | blue-tinted | was bearish FVG that broke up |
| Bearish IFVG color | color | orange-tinted | was bullish FVG that broke down |
| Box transparency | int (0–100) | 70 | |
| Max active boxes | int | 50 | hard cap 100 (TV drawing limit) |
| Extend mode | enum | until-mitigated | options: until-mitigated, N-bars, forever |
| Extend N (if N-bars) | int | 50 | only used when extend mode = N-bars |

## Alerts

Three alert conditions, fired on bar close:

- **FVG formed** — bullish or bearish, includes price levels in alert message
- **FVG inverted to IFVG** — includes which gap inverted and new polarity
- **IFVG spent** — gap fully traded through, removed from chart

Alerts are wired up via TradingView's standard `alertcondition()` so the user can attach any TV-native action (popup, email, webhook) without code changes.

## Data Flow

```
On each new bar:
  if barstate.isconfirmed:
    1. Check 3-candle pattern (bars [-2..0])
       → if bullish FVG: push to active array (state=ACTIVE_FVG, polarity=BULL)
       → if bearish FVG: push to active array (state=ACTIVE_FVG, polarity=BEAR)
    2. For each item in active array:
       → check body-close violation rules
       → advance state: ACTIVE_FVG → INVERTED_IFVG → SPENT
       → update box color/visibility per state
    3. Housekeeping:
       → remove SPENT items
       → if active array > max boxes: FIFO-remove oldest
       → fire any alerts triggered this bar
```

## Error Handling & Edge Cases

- **Insufficient history:** skip first 2 bars (need bar[2] for 3-candle pattern)
- **TV drawing limit:** Pine Script caps at ~500 boxes per indicator instance. We hard-cap our tracked array at 100 with FIFO eviction
- **Repaint safety:** all detection and state transitions gated on `barstate.isconfirmed`
- **Overlapping FVGs:** show all of them; do not merge (simpler, more transparent)
- **Symbols / timeframes:** asset-agnostic, timeframe-agnostic — no special handling per instrument

## Testing Strategy

Pine Script does not have a unit test framework. Verification is manual:

1. **Load on multiple symbols/timeframes:** NQ 5m, EURUSD 1h, BTC 4h, SPY 15m
2. **Eyeball known FVG examples:** locate FVGs by hand on a recent chart, confirm indicator draws them in the same place
3. **Cross-reference:** compare against a reputable public FVG indicator (e.g., LuxAlgo's free FVG indicator) on the same chart — boxes should be roughly equivalent
4. **State transitions:** find a chart with a clear FVG that got body-closed-through, confirm the indicator flips it to IFVG color
5. **Performance:** scroll through ~5000 bars of history on a chart, confirm no lag and no script error from box limits

User runs all tests in TradingView directly. We iterate based on visual feedback.

## Future Roadmap (not part of v1)

In rough priority order, to be brainstormed and spec'd separately when ready:

1. Order blocks
2. Breaker blocks
3. Liquidity sweeps (equal highs/lows, stop runs)
4. BOS / CHoCH (break of structure / change of character)
5. Killzones (London, NY AM/PM)
6. Volatility / ATR-size filters on FVG
7. Multi-timeframe (display HTF FVGs on LTF chart)
8. Strategy version (entries/exits + backtest)
9. Webhook-out → backend fusion with NewsAI signals → combined buy/sell signal back to TV
 