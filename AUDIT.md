# Chart2Plan independent read-only audit

## Scope and confidence
- Audited `Allindy.gs`, `Fibo.gs`, `Strategy.gs`, `Workflow.gs`; traced callers in `Analysis.gs` and momentum helpers in `Market.gs`.
- Compared against attached originals: **P1** = `1792808082766-1.txt` (All Indy 1.3.5); **P2** = `1792808082815-2.txt` (EBW-Fibo 1.10.19). Original attachment directory: `C:\Users\bazz1\aetox\.aetox-attachments\20261024-084551.264`.
- No source edits, deployment, browser, credentials, private configuration or live-provider access. `snapshot.original.json` left untouched.
- **No live rejection logs, market pack or Pine-runtime oracle were available. Cannot reproduce or attribute the reported “all rejected” live outcome.** Below separates code-proven exclusion paths from synthetic reproductions, not claimed live frequencies.

## 1. First distinguish two different admission paths
**Evidence:** `Workflow.gs:20–29` calls `afBuildAnalystContext_`, AI, then `afAdmitAiPlan_`. It does **not** call `afCompose` or `afAllindyReplay_`. `Analysis.gs:9–12,19,28–29` separately runs the strict adapter/composer. `Workflow.gs:7` explicitly disclaims the strict finalSignal gate.

**Impact:** Fixing the strict replay alone cannot fix the AI UI's no-plan outcomes. Conversely, research proposal counts are not AI acceptance counts. AI `NO_TRADE` is an early terminal result (`Workflow.gs:14`), with no enumeration proving whether any valid geometry existed.

**Precise patch:** Give each response `admissionPath`, `ruleVersion`, snapshot ID and a staged reason ledger: data/news → evidence readiness → candidate pairs → geometry → cost/RR → QC → post-AI refresh. Record stage counts plus all failed predicates per candidate; distinguish `AI_DECLINED`, `NO_ELIGIBLE_CANDIDATE`, and `AI_OUTPUT_INVALID`. Never label an upstream failure as a strategy rejection. Log only non-secret evidence/IDs.

**Tests:** Invoke both entry points with fixtures and assert path identity; fixtures failing multiple predicates retain the complete reason vector while retaining one primary reason. Assert AI calls are skipped when no eligible candidates exist.

## 2. Code-proven sources of scarcity; do not assume impossible rules
**Strict path:** `Allindy.gs:49–51` requires a trigger, HTF trend, directional body, MA separation/chase, cooldown, small true range, then a same-side zone with score ≥62, ≤1 test, rejection close and proximity ≤0.35 ATR, then obstacle room. A structure-only Balanced branch from P1 is not implemented (`P1:150,1893–1894`; adapter disclaimer `Allindy.gs:1–3`). `Strategy.gs:21,24,33–44` adds final-signal confirmation, active same-side Fibo, nearest unhit eligible target, stop/cost/RR. These conjunctions can be sparse, but are not shown to be unsatisfiable.

**AI path:** `Workflow.gs:4` exports zones with ≤2 tests and score ≥28; `:16` rejects >1 test. This sends deliberately ineligible zones to the model, consuming attention and enabling doomed choices. The model chooses only one pair/geometry, and one failure ends the run (`:15–17`), even if another pair would pass. No execution-TF relationship is enforced for the selected zone/Fibo: `executionTF` is a label and ATR baseline, not a candidate provenance rule (`:15–18`). Multi-TF POIs may be intentional, but the relation must be explicit.

**QC ceiling:** `Allindy.gs:5` has maximum fresh score 35+25+4+15 = **79**; one-test maximum **71**, before age penalty. In `Workflow.gs:17`, even perfect trend and RR yield fresh QC **93.7**, one-test QC **83.3**. Thus QC 100 rejects every currently generated candidate, and QC >93.7 is unreachable even for fresh zones. Freshness is counted inside `z.score`, then rewarded again; RR and Fibo validity also contribute bonuses after acting as gates. These are correlated evidence points, not independent probabilities.

**Precise patch:** First expose attainable score ranges and score components, reject/configure unreachable thresholds explicitly rather than silently lowering user QC. Align model candidate eligibility with admission. Version a factor-group score without double-counting freshness; calibrate on held-out paper outcomes, not a desired trade count. Keep hard gates as non-compensable booleans; do not translate “QC%” into win chance.

**Tests:** Exact-score fixtures at 79/71, age decay, trend off, RR below/above 2, threshold equal/just above score, QC 0/100/null/invalid. Maximum-score tests must use actually attainable adapter inputs.

## 3. Highest-priority safety gaps in the AI validator
**Evidence:** `Workflow.gs:15–17` tests matching IDs/side and `afBookActive_`, whose definition (`Fibo.gs:53`) only checks side and missing closure. Unlike `Strategy.gs:18–24,31–33`, it does not require broken/confirmed history, supported method, finite knownAt/sourceClose/born, as-of alignment, target-price formula, or agreement between pending and hitRatios. Current builder supplies many of these fields, but admission does not enforce its own claimed contract. Zones have no explicit completeness/departure fields (`Allindy.gs:18`), although P1's freshness scoring requires those facts (`P1:1070`).

**Synthetic result:** An otherwise passing candidate still passed after its Fibo was set `broken:false`, `historyComplete:false`, `knownAt` in the future. A NaN spread also passed and produced NaN netR: `netR<1.5` is false for NaN (`Workflow.gs:16`). This does not establish that the real quote provider emits NaN.

**Precise patch:** Extract a shared pure evidence validator for both paths. Require finite positive, ordered quote/tick/ATR/geometry and finite nonnegative costs; explicit UTC as-of/source freshness/closed-history coverage; same symbol, approved TF relation and side; broken, complete active Fibo with method 1/3; signed span and independently recomputed target formula; pending status consistent with hitRatios/hitTimes. Fail closed before scoring. Source fields must be emitted from proven detector state, not filled with unconditional `true`.

**Tests:** Missing/future/stale times, unsupported method, incorrect target formula, inconsistent hit flags, crossed quote, NaN/Infinity/negative cost, incomplete history, unconfirmed candidate. A valid baseline must still pass after validation is centralized.

## 4. Geometry must be generated deterministically, not guessed then rejected
**Evidence:** AI picks entry/stop/TP (`Workflow.gs:11,15`). Admission checks entry inside POI, stop beyond distal, risk ≥0.01 and ≤2.5 execution ATR, netRR ≥1.5. It omits protective-anchor requirement and source minimum stop/buffer logic for Pending Limit (`P1:59–61,81–85,2102,2120,2155,2172`). A stop one tick outside a zone can therefore be admitted without proving source protection. `Strategy.gs:3,41` allows 3 ATR while strict proposal generation uses 2.5 (`Allindy.gs:50`); thresholds differ by path, not one source policy.

**Targets:** Both paths correctly start normal-method eligible extensions at 2.618, neck at 1.618 (`Strategy.gs:30`; `Workflow.gs:16`; P2:1205). “Nearest” means nearest pending **eligible extension ahead of entry**, not a request to skip it until RR passes. Strict composition takes the nearer of Allindy cap and Fibo target (`Strategy.gs:36`); AI only caps submitted TP, which is a different policy.

**Obstacle omission:** The strict adapter includes opposing liquidity (`Allindy.gs:51`). AI checks only `ctx.zones`, although liquidity is available under frames (`Workflow.gs:4,16`). It also builds that obstacle set from zones already filtered by score/tests (`:4`), so omitted structural obstacles are not assessed. Synthetic fixture with opposing liquidity at 102.5 and BUY target 104 was admitted. Do not claim “first obstacle clear” from the filtered POI list alone.

**Precise patch:** Enumerate both sides and eligible zone/Fibo pairs; derive protective anchors, source-buffered stops, and nearest opposing structural zone/liquidity caps from a separate unfiltered obstacle registry. Keep invalid/expired obstacles excluded by explicit lifecycle, not display thresholds. Intersect legal tick entries with POI, pending-limit quote condition, stop bounds, obstacle room and cost-adjusted RR. Never squeeze stop or jump a nearer target to manufacture RR. Preserve a distinct, versioned Pending Limit policy instead of silently applying market-confirmation rules.

For BUY, fixed stop S, target T, cost C and required RR k imply `E <= (T + k*S - (k+1)*C)/(k+1)`. For SELL apply the same inequality to signed coordinates `E=side*entry`, `S=side*stop`, `T=side*target`. Round conservatively and revalidate the exact tick plan. An empty feasible interval is a real geometry rejection, not grounds to relax gates. AI may explain/rank passing candidate IDs, but cannot invent price levels. Revalidate after the refreshed quote/news snapshot.

**Tests:** BUY/SELL symmetry; nearest extension below minimum RR; near liquidity before a farther zone; overlapping opposing POI; stop anchor absent; minimum/maximum ATR boundaries; cost/RR equality; round-tick boundary; quote becomes marketable during AI latency; unavailable obstacle coverage produces UNKNOWN, not CLEAR.

## 5. Source fidelity: fix verifiable differences before advertising parity
- **Wrong M3 series:** `Allindy.gs:37` maps `m3` to 5m. P1's L2 machine specifically depends on M3 RSI/K (`P1:623–629`). Read real M3 or aggregate contiguous M1 into closed M3 with documented coverage. Insufficient M1 coverage must mark EBW UNKNOWN, not substitute M5. Test a fixture where M3 and M5 produce different L2 transitions.
- **Subset zone detector:** only one-base S/D is ported (`Allindy.gs:13–19`), versus secondary three/five/strong patterns in `P1:1311–1325`, plus omitted OB/QML/Flip acknowledged by `Workflow.gs:5`. Implement proven families incrementally; never ask AI to fill them from prose. Each can increase measured eligible supply without lowering gates.
- **Source timing needs parity tests:** P1's zone function uses `[1]` departure, `[2]` base, `[3]` approach and previous-closed ATR (`P1:1291–1339`); GAS evaluates current departure with current ATR (`Allindy.gs:8,13–18`). Some delay can be intentional closed-bar normalization, not automatically lookahead. Prove event knownAt and source-stamp equivalence with exported Pine fixtures before shifting indices.
- **New pivot use:** GAS updates pivot h/l then uses it for current zone PD (`Allindy.gs:12,17`), whereas P1 h0/l0 are explicitly previous pivot-registry state (`P1:1344–1347`). Test pivot-confirmation coincidence and match intended source context.
- **Family lifecycle omission:** GAS correctly ports target marking on birth and later bars, opposite-break takeover and three-record book (`Fibo.gs:33–45,54–83`; P2:1038–1052,1178–1221,848–870). However records lack role/main-family metadata, so non-main eviction branch is ineffective (`Fibo.gs:42,78`; P2:866–868). That can discard a different retained active target than Pine. Port family classification before claiming retention parity.
- **Coverage metadata is stale:** `Workflow.gs:5` says NeckDivergence is not independently computed, but `Fibo.gs:36–38,87–107` computes neck/divergence context. Label implemented-but-unverified separately from unimplemented. More source text is not runtime evidence.

## 6. Causal lifecycle is not integrated into the AI response
**Evidence:** AI plan at `Workflow.gs:18,29` has no ID/status/createdAt/expiresAt/tfMs or state transition hook. `afAdvance` is used only by the separate strict path (`Analysis.gs:20–29`). Thus an AI PAPER_SIGNAL_READY is not proof of a tracked entry, fill or outcome.

**Further causal gap:** AI rechecks latest quote relative to Fibo zero/root (`Workflow.gs:16,25`) but not the execution bars since a higher-TF Fibo snapshot. A lower-TF wick may already have invalidated that context or consumed its next target before the higher source bar closes. Synthetic supplied frame with low below Fibo root still passed. Decide and document whether this is same-source-only lifecycle or an additional execution-safety invalidation rule; never silently revive a killed planning candidate when price recovers. Keep source book state separate from execution invalidation state.

**Precise patch:** Give admitted AI plans the same immutable causal paper-plan schema and isolated paper-state namespace. Process only unseen contiguous closed execution bars, persist last processed close and terminal outcomes, dedupe by source evidence plus geometry/version, cancel pending on explicit invalidation/expiry/news as defined; lock geometry after entry. Retain `AMBIGUOUS` for unknown intrabar order; do not count it as TP. `afAdvance` models Bid-reference touches, not verified broker execution: add bid/ask-aware fill assumptions and spread history before claiming realistic fills. Keep live trading disabled.

**Tests:** Prefix-invariance of replay; same prefix produces identical earlier snapshots; birth-bar extension hits; opposite takeover only after eligible first hit plus later A/B/C; used-point revisions cannot retroactively change admitted plans; skipped/duplicate bars; pending expiry and news cancel; entry+TP same candle; SL+TP same candle; gap through stop; post-entry source invalidation does not rewrite frozen SL/TP. Synthetic checks confirmed skipped-bar rejection and ambiguity handling in `afAdvance`.

## 7. Efficient implementation order and measurable objective
1. Add staged diagnostics and path identity, plus a captured non-secret fixture from an actual rejected run. This is necessary to know which gate really dominates.
2. Unify fail-closed evidence/geometry checks; separate executable POIs from full obstacle evidence; fix nonfinite handling.
3. Deterministically enumerate and validate candidate plans **before** AI. Send compact passing candidates and decisive evidence; let AI explain/rank, not generate arbitrary levels. If none pass, show the nearest unmet condition per side and do not pay for an AI call.
4. Repair M3 provenance, source-family coverage/metadata and causal paper lifecycle; certify against Pine-exported fixtures. Cache bounded per-TF replay state keyed by last closed timestamp; invalidate/replay when history is revised. `Workflow.gs:3–4` currently replays all frames and Fibo retains every snapshot (`Fibo.gs:45`); provide latest-only mode for interactive context without altering full replay semantics.
5. Measure unique eligible plans/day, filled paper entries/day, duplicates, rejections by gate, ambiguity, net-R after declared costs, drawdown and sample coverage per style. Use walk-forward/held-out days and actual historical news availability. **1–5/day is a measured objective, never an admission quota or guaranteed frequency/profit.** If honest gates yield fewer, report the deficit and missing coverage, not fabricated trades.

## Checks actually run
Node VM loaded only the four audited source files without executing provider calls. Eight synthetic assertions passed: valid baseline; incomplete/unbroken/future Fibo acceptance gap; ignored opposing liquidity; ignored lower-TF root wick; NaN-cost acceptance; exact attainable score calculations; absent AI lifecycle fields; strict skipped-bar/ambiguity behavior. These are regression probes of current behavior, not fixes or live tests. One console test label said “tested85.7”; the actual assertion correctly used zone score 71 and verified **83.3**, which is the authoritative result above.

No patches were applied; integration belongs to the main assistant. Live rejection attribution and Pine-runtime parity remain unverified.
