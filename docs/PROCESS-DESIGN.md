# TNVS Facilities & Administrative System — Process Design

*Written as if I owned TNVS and had to defend this system to a board, an auditor, and a
frustrated employee on the same afternoon. The bar it is measured against is ServiceNow
Workplace Service Delivery + Now Assist.*

---

## 1. The one principle everything hangs on

> **AI recommends. A human decides. The system records. And no single person can finish an
> irreversible act alone.**

Every design choice below is downstream of that sentence. If a feature would let the AI
*decide*, let a human *escape the record*, or let *one person* delete/terminate/dispose on
their own authority, it does not ship. This is what separates a governance platform from a
form-router.

---

## 2. Why "make it like Grab" is the right instinct

Grab did not win because it had more features than a taxi dispatcher. It won because it
turned an opaque, trust-me process into a **tracked, one-front-door, proactively-communicated**
one. The same five moves apply directly to facilities & administrative governance:

| Grab move | TNVS equivalent | What it replaces |
|---|---|---|
| One app, one "Book" button, routing hidden behind it | **One intake** for every request — room, visitor, document, contract, disposal — that classifies and routes itself | Six departmental inboxes and "email the right person and hope" |
| Live map: you watch the driver approach | **Live request timeline** REQUEST→…→ARCHIVE, visible to the requester | "Submitted. Await email." black box |
| ETA / price / driver-match engine suggests, you confirm | **AI triage at intake**: risk score, drafted rationale, suggested approver, SLA-breach prediction — advisory only | Manual triage; risk assessed (or not) in someone's head |
| Payments need separate authorization | **Two-person rule** on anything irreversible | One officer deletes a record at 4:59pm on a Friday |
| Trip history you cannot rewrite | **Append-only audit trail**, including "approved against AI advice" | Editable logs, or no logs |

None of these are cosmetic. Each is a control that an auditor can test and an employee can feel.

---

## 3. The lifecycle (the spine of the system)

Every governed action — regardless of department — travels the same ten stations. The
value of a *shared* lifecycle is that monitoring, audit, and SLA logic are written once and
inherited everywhere.

```
REQUEST → VALIDATE → REVIEW → APPROVE → EXECUTE → DOCUMENT → MONITOR → ALERT → RESOLVE → ARCHIVE
```

| Stage | Who acts | What the AI does | What the system records |
|---|---|---|---|
| **REQUEST** | Requester (any role) | Classifies the request, predicts the right rail & approver | Requester id, timestamp, payload |
| **VALIDATE** | System | Flags missing fields, duplicate/again-requests, policy conflicts | Validation verdict + reasons |
| **REVIEW** | Reviewer (role-scoped) | Drafts a risk summary from **deterministic signals only** | Reviewer id, notes, AI risk level + rationale |
| **APPROVE** | Approver — **must differ from requester** | Suggests approve/deny, never executes | Each vote as a separate row (one vote per approver, DB-enforced) |
| **EXECUTE** | System (only from APPROVED) | — | Executor id, before/after, correlation id |
| **DOCUMENT** | System | Auto-drafts the record-of-decision | Immutable decision document |
| **MONITOR** | System (scheduled) | Watches clocks: retention, renewals, SLAs, obligations | Monitored entity + next-check time |
| **ALERT** | System → human | Predicts breaches *before* they happen | Alert, severity, recipient |
| **RESOLVE** | Human | Recommends next step | Resolution + actor |
| **ARCHIVE** | System | — | Final state, retained per policy |

The irreversible verbs (dispose, delete, terminate, revoke, declassify, grant-role) can only
be reached at **EXECUTE**, and EXECUTE is only reachable from **APPROVE**. Mutation lives in
exactly one place per action — the executor — so there is no side door.

---

## 4. Separation of duties (the RBAC the owner insisted on)

Two rules that are load-bearing, not decorative:

1. **The System Administrator administers the system; they do not gain the business.**
   The admin cannot read confidential documents or approve a records disposal *simply because*
   they hold the keys to the box. In the code, both `SUPER_ADMIN` and `SYSTEM_ADMINISTRATOR`
   are deliberately excluded from the `/v1/compliance/**` prefix, and no administrator role
   appears in any records-approval set.

2. **The requester of an irreversible act can never be its approver.**
   Enforced on the user's **id** — not their role, email, or token, all of which one person can
   hold in both hands. A records officer may *request* a disposal; a Compliance Manager, Data
   Protection Officer, or Legal Counsel must *approve* it. Granting oneself an approver role is
   itself a gated, two-person action, which closes the self-escalation loop.

This is why three approver accounts had to be seeded (§6): the rule was enforced but
*unsatisfiable* without a second, differently-roled human who could actually sign.

---

## 5. Where the AI sits — and where it is not allowed to sit (Now Assist parity)

TNVS's AI reaches **Now Assist parity on assistance and exceeds it on discipline**:

- **Risk severity is computed from deterministic signal providers**, never from the language
  model. The model writes the *prose* around a verdict it did not set. Consequence: an AI
  outage, or a cleverly-worded request, **cannot soften a risk level**. ServiceNow's LLM
  summaries have no such firewall by default.
- **A `BLOCK` is advice, not a veto.** The AI can recommend refusal; a human with authority can
  still approve — and when they do, the system stamps `approvedAgainstAiAdvice = true`. The AI
  never *punishes or rejects a user on its own*, exactly as required.
- **The AI never mutates.** It cannot dispose, delete, or grant. It fills the REQUEST, REVIEW,
  and ALERT stages with recommendations; humans own APPROVE; the system owns EXECUTE.

"AI = Recommend / Human = Decide / System = Record" is not a slogan here; it is the call graph.

---

## 6. Integration posture (how other departments connect)

Other TNVS departments own their operational data; this system is the governance, records,
approval, and compliance **source of truth**. They do **not** get direct database access —
that would make every department a potential corruptor of the record. Instead:

- **Inbound:** departments call versioned APIs and emit events; the intake classifies and
  routes them onto the lifecycle.
- **Outbound:** the system emits decision/alert events others can subscribe to.

One database, many rails, no shared tables. This is the boundary that keeps the audit trail
trustworthy.

---

## 7. What is built vs. what remains (honest status)

**Built and wired (pending compilation — see the note below):**
- Zero-config `dev` boot (file-backed H2, one command, no external DB) — *verified end-to-end.*
- The two-person approval gate: 15 gated actions, request/decision entities, the gate service
  and its seven invariants, controller (shared governance inbox), the disposal executor, a
  deterministic risk advisor, and an approver notifier.
- The live disposal path routed through the gate: `decideDisposal` no longer deletes; it
  delegates to the gate, and the only deletion lives in `DocumentDisposalExecutor`, reachable
  only from `APPROVED`.
- Three approver accounts seeded so the rule is *satisfiable* (§6 of the credentials handoff).
- The client-error mapping fix (400/415/406 no longer fall through to a 500).

**Deliberately not yet built (would be reckless on an uncompiled base):**
- The remaining 12 destructive routes (contract terminate ×2, clause delete ×2, obligation
  delete, IP unblock, session revoke, and the admin/AI actions) still mutate on a single call
  and must be rewired through the gate.
- 13 of the 15 gated actions have no executor yet; they **fail closed** at execute time with an
  explicit configuration error rather than silently doing nothing.
- The granular responsibility-based roles and their in-app dashboards, plus registering those
  roles in the frontend router.

**Constraint honoured throughout:** not one frontend design file was restyled. The existing
UI already presented request-then-decide with a mandatory reason and a separate Disposal
Approvals queue; only the enforcement behind it was missing.

---

## 8. The one blocker

The build/test toolchain (Bash → Maven) has been unavailable for six consecutive sessions, so
everything above marked "pending compilation" is verified **by reading** — every cross-file
signature it calls has been confirmed to exist with the right shape — but not yet by a compiler
or a green test run. The commands to compile, test, and run are in the handoff message. Once a
green run is confirmed, the remaining executors and route rewiring can proceed on a trusted base.
