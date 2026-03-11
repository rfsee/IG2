# IG Auto Growth OS - System Architecture v2

## 1) Product Goal
- Build an automation-first IG marketing system that increases buying desire and conversion for furniture products.
- Target flow: content exposure -> trust and intent -> DM inquiry -> checkout click -> order.

## 2) North Star and Core Metrics
- North Star: Product purchase intent conversion from IG traffic.
- Core metrics:
  - `save_rate = saves / reach`
  - `dm_rate = dms / reach`
  - `click_rate = clicks / reach`
  - `order_rate = orders / clicks`
  - `reply_rate = dm_replies / dms`

## 3) System Modules

### A. Content Engine
- Input: product pool, audience segment, campaign goal, weekly theme.
- Output: weekly post plan, captions, hooks, CTA variants, script blocks.
- Rules:
  - Ensure trigger balance (pain, proof, value, urgency, reassurance).
  - Ensure format balance (Reels, Feed, Story).

### B. Visual Prompt Engine
- Input: script summary blocks.
- Output: one Nano Banana image prompt per script requirement block.
- Rules:
  - `N requirements in script -> N prompts`.
  - enforce composition and quality guardrails.

### C. Publishing Engine
- Input: approved content items.
- Output: publish queue and status transitions.
- Rules:
  - status lifecycle: draft -> shooting -> ready -> published.
  - preflight checks before publish.

### D. Engagement Engine
- Input: comments and DMs.
- Output: auto-generated reply scripts and DM conversion scripts.
- Rules:
  - classify intent (price, size, material, shipping, style).
  - route to recommended products.

### E. Growth Analyst Engine
- Input: post-level metrics and conversion funnel data.
- Output: weekly optimization recommendations and next-week experiments.
- Rules:
  - rank winning hooks/CTA/cover patterns.
  - auto-propose next A/B tests.

## 4) Agent Specialization
- `Content Agent`: generate hook/caption/script and trigger labeling.
- `Visual Prompt Agent`: convert script blocks to image prompts.
- `Publishing Agent`: scheduling and preflight validation.
- `Engagement Agent`: DM and comment response generation.
- `Growth Analyst Agent`: experiment analysis and strategy feedback.

## 5) Event Flow (Closed Loop)
1. Product pool synced and tagged.
2. Content Engine generates weekly plan and scripts.
3. Visual Prompt Engine generates image prompts.
4. Publishing Engine runs status workflow and scheduling.
5. Engagement Engine handles inbound messages.
6. Metrics ingestion updates performance tables.
7. Growth Analyst outputs actions for next cycle.

## 6) Deployment Layers
- Frontend app (current project): planning, editing, generating, copying, and manual execution hub.
- Data layer: local first (localStorage) -> optional cloud sync.
- Automation layer: scheduled jobs for weekly generation and reporting.

## 7) Security and Reliability
- No credentials stored in frontend code.
- Graceful fallback when data import fails.
- Keep deterministic prompt templates to reduce generation drift.

## 8) v2 Scope Boundary
- In scope: content and growth automation loop with measurable performance feedback.
- Out of scope: payment processing, ERP, logistics, ad platform bidding.
