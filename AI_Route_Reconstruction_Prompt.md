# AI Assisted Route Reconstruction, Coverage Recovery & Aggressive GPS Correction

## Background

This project is a municipal solid waste vehicle tracking system built using:

- Go Backend
- PostgreSQL / TimescaleDB
- Redis
- GPS Tracking Devices
- Route Assignment System
- Route Coverage Monitoring
- Lane Point Coverage
- Playback System
- Historical Coverage Recalculation

The system tracks waste collection vehicles moving on predefined routes.

Each route contains:

- Route Geometry
- Sequential Lane Points
- Entry Lane
- Exit Lane
- Assigned Vehicles
- Coverage Rules

## Existing Challenge

Some wards have extremely poor GPS quality.

Observed GPS issues:

- GPS drift
- GPS jumps
- Multipath reflection
- Poor GSM connectivity
- Missing GPS packets
- Sudden teleports
- Zig-zag movement
- Route deviation caused only by GPS error
- Long periods of GPS silence

## Important Business Requirement

For certain wards, operational accuracy is more important than raw GPS accuracy.

Goal:
"Show the most likely route actually followed by the vehicle"

## Route-Level GPS Intelligence

Each route must support:

- GPS Quality Mode (Normal / Poor / Extremely Poor)
- AI Route Reconstruction (Enabled / Disabled)
- AI Coverage Recovery (Enabled / Disabled)
- AI Playback Correction (Enabled / Disabled)
- Aggressive Snapping (Enabled / Disabled)
- Aggressive Coverage Recovery (Enabled / Disabled)
- Aggressive Playback Reconstruction (Enabled / Disabled)

## Route Matching Requirements

- No simple nearest-point snapping
- Use route progression
- Use lane sequence validation
- Use confidence scoring
- Preserve raw GPS

## Route Entry Rules

OUTSIDE_ROUTE
→ ENTRY_CANDIDATE
→ ENTRY_CONFIRMED
→ ON_ROUTE

## Route Progression Rules

Allowed:

1 → 2 → 3 → 4 → 5

Not Allowed:

2 → 35

unless strong evidence exists.

## Route Exit Rules

Support:

- Entry
- Coverage
- Exit
- Dump Station Visit
- Re-entry
- Final Exit

## Lane Point Requirements

Statuses:

- DIRECT_HIT
- INFERRED_HIT
- UNKNOWN
- MISSED

## Playback Requirements

Store separately:

- Raw GPS
- Corrected Playback
- Matched Route Progress
- Coverage Evidence
- Confidence Scores

## Aggressive GPS Correction Mode

For poor GPS wards:

- Trust route geometry more
- Trust lane sequence more
- Trust historical route behavior more
- Trust noisy GPS less

## AI Assisted Reconstruction

Flow:

Raw GPS
→ Deterministic Matcher
→ Lane Validation
→ Confidence Calculation

If Confidence Low:
→ AI Reconstruction
→ Corrected Route
→ Coverage Result

## AI Inputs

- Assigned Route
- Route Geometry
- Lane Points
- Historical Trips
- Vehicle Speed
- Heading
- GPS Quality
- Ignition State
- Time Gaps
- Raw GPS Packets

## AI Outputs

- Most Likely Route
- Route Progress
- Lane Point Coverage
- Coverage Percentage
- Corrected Playback Path
- Confidence Score

## Restrictions

Do NOT use GPT/OpenAI API per GPS packet.

Prefer:

- Hidden Markov Models
- Viterbi Reconstruction
- Gradient Boosted Trees
- Random Forest
- Hybrid Deterministic + AI Architecture

## Expected Deliverables

1. Architecture Review
2. Existing Weaknesses
3. Why Current Snapping Fails
4. Why Current Coverage Fails
5. Route Matching Design
6. Lane Point Design
7. Playback Design
8. AI Design
9. Database Changes
10. Redis Changes
11. API Changes
12. Route Creation UI Changes
13. Route Edit UI Changes
14. AI Configuration UI Changes
15. Coverage Calculation Changes
16. Playback Changes
17. Step-by-Step Migration Plan

Do not generate code immediately.

First provide a complete architecture review and implementation strategy.
