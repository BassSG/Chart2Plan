# Chart2Plan — Pine rule alignment, 25 October 2026

Revision: `2026-10-25-pine-rules-1`.

This release implements the requested source rules against the two local Pine references. Price geometry and approval remain deterministic; the model selects a computed candidate ID and writes its explanation.

| Requested rule | Implementation |
| --- | --- |
| Intrinsic Source Q; HTF context and MTF breadth are zero | `afZoneScore_` uses the source default Grouped evidence caps and supports Legacy weights. MTF and TF relevance appear only in view ranking. |
| MAJOR ≥ 76 with core and source evidence | `afZoneRole_`, `evaluateZoneEligibility_`; source labels alone cannot provide a SOURCE tag. |
| Direct Limit and adaptive depths | MAJOR tests ≤ 1; REACTION score ≥ 70 and zero tests. Exact depth branches, extension cap 0.12, maximum depth 0.65. |
| Registry | Canonical and secondary S/D, FVG, four-pivot QML with activation audit, swing/equal H/L and IDM. OB uses volume pivot 10, Low–HL2 or HL2–High bounds, historical departure/retest audit. OB, Flip and chart swings are calculated only on the execution chart TF. |
| Protective anchor | Deepest same-side liquidity edge within 1.50 chart ATR. Base buffer 0.15 ATR; nearby mapped liquidity within 0.60 ATR raises it to 0.25 ATR. |
| Higher-TF knowability | Workflow chooses the latest source snapshot at or before the execution chart close. A larger source close is not rejected solely because it is older than the smaller chart close. |
| Intrabar kill latch | Closed smaller-TF highs/lows after source asof check zero, root and final 5.472 target. Intermediate extension hits advance pending targets while status stays 2. Source records are not mutated by the planner. |
| Fibo role and takeover | BookFamily roles Main=0, Joint=1, Continuation=2; Neck retains role 0 and method 3. An opposite later confirmed Break can close a previously first-target-hit book with closedKind=2. |
| Zone–Fibo relation | Same direction alone is insufficient. A child zone must follow C, remain on the protected side of zero, and lie inside the parent leg with 0.03 ATR tolerance or have an explicit book link. |
| TP and admission | Choose the nearer pending extension and first opposing liquidity/Defend/FVG obstacle. Defend/FVG Source Q floor is 28. Require room ≥ 0.75 chart ATR and `(reward − cost) / (risk + cost) ≥ 1.5`. |

The source references are `work/reference/All-Indy-1.3.5_Map-Fixes.pine` and `work/reference/EBW-Fibo-1.10.19_Performance.pine`. Relevant source functions include `f_z_score`, `f_z_role`, `f_z_qmAudit`, `f_r_protectiveAnchor`, `f_r_adaptiveDepth`, `f_r_directLimitOK`, `f_closedSource`, `f_familyRole`, `f_bookAdvance`, `f_relation` and `f_bookRelated`.

Validation: 62 Planner groups, 73 ResearchLog cases and 3 original-details UI cases passed. All 19 GAS files parsed and initialized together in local V8, with no duplicate global functions. The tests use synthetic OHLC and mocked services; they make no provider, model or broker calls.

Deployment 30 was pulled back and matched all 26 staged files. A real web-app diagnostic returned 3,256 candidates with 9 eligible candidates and rendered them successfully. This diagnostic used the existing data providers and made no model or broker calls. Screenshot evidence is stored in `outputs/daytrade-validation/live-v30.png` outside the public source package.

Full Pine runtime parity is not certified. Matching the complete Pine engines requires comparing their outputs on identical OHLC, inputs, session boundaries and source history in the actual Pine runtime. The separate legacy `afAllindyReplay_` signal-state replay is not a complete port of Pine `finalBuy/finalSell` or the visual cluster engine. The web planner uses the zone registry and Fibo book replay directly. `pineRuntimeParityVerified` remains false and execution remains paper only.
