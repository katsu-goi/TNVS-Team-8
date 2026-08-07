# TNVS Analysis — Index

Analysis produced under `TNVS-Master-Prompt.md` for the TNVS Facilities & Administrative Management System.
**Status: analysis complete. No implementation code written. Nothing in `frontend/`, `backend/` or `supabase/` created or modified.**

| Document | Contents |
|---|---|
| [TNVS-Phase0-Report.md](TNVS-Phase0-Report.md) | Reconnaissance: dossier reconciliation (§3 vs reality), repository inventory, module coverage vs §6, seven blocking defects (P0-1…P0-7), collaboration state vs §10 |
| [TNVS-Phase1-Deliverables.md](TNVS-Phase1-Deliverables.md) | **D1** Repository Analysis · **D2** Architecture Analysis · **D3** Missing Features Assessment · **D4** Database Gap Analysis · **D5** UI Consistency Analysis · **D6** Component Reuse Plan |
| [TNVS-Phase2-Deliverables.md](TNVS-Phase2-Deliverables.md) | **D7** Required Tables · **D8** Required API Endpoints · **D9** Required Frontend Pages · **D10** Required Backend Services · **D11** Required Supabase Changes · **D12** Required AI Services · **D13** Required n8n Workflows |
| [TNVS-Phase3-Deliverables.md](TNVS-Phase3-Deliverables.md) | **D14** Development Roadmap · **D15** Sprint Breakdown · **D16** Safe Refactoring Recommendations · Implementation proposal · 10 open questions |

## Headline findings

1. **The Master Prompt's §3 stack dossier is wrong on five counts.** The backend is Spring Boot 3.3.5 / Java 21, not PHP. The frontend is Vite 6 + React 19, not Next.js. ShadCN UI is absent. AI is configured for Ollama, not OpenAI. n8n does not exist anywhere in the repository, so all five §8 workflows are greenfield.
2. **The application cannot start on its own default profile.** Six entities map to tables no migration creates, and `ddl-auto: validate` aborts on them. The `local` and `supabase` profiles route around this by disabling Flyway and switching to `ddl-auto: update` — which means the JVM issues silent DDL to the shared cloud database.
3. **Endpoint-level RBAC is effectively absent.** Authorisation is four path prefixes plus `.anyRequest().authenticated()`. Six route families — contracts, documents, legal cases, visitors, facilities, and all AI endpoints — have no role check. The codebase's single `@PreAuthorize` sits in an unscanned package and is dead code.
4. **Two disjoint role vocabularies exist.** Seven roles seeded by migration V4 are unreachable; the four created by `BootstrapAdmin` are what `SecurityConfig` and every frontend guard actually test.
5. **Two competing schema sources of truth.** Flyway owns 31 tables; a Supabase migration redefines 12 of the same names with different columns and types, under fully-permissive `using (true)` RLS policies.
6. **34 new tables, 90 new endpoints, 35 new services and 32 new pages** are required to complete §6 modules A–F — all additive, no existing table dropped or restructured.

## Blocking items

Three PRs gate all feature work, in this order:

1. `V6__backfill_missing_module_tables.sql` + re-enable Flyway on `local`/`supabase` — makes the app bootable.
2. Fix the inert `ProtectedRoute` guard + rehydrate `user` in `authStore` — makes role guards and deep links work.
3. `@PreAuthorize` across the six unguarded route families, starting with `/v1/ai/**`.

## Requires a decision before work proceeds

Ten open questions are detailed at the end of `TNVS-Phase3-Deliverables.md`. The three that block the most downstream work:

- **Credential rotation.** `application.yml` is not gitignored, so the Supabase password, anon key and default JWT secret are in git history. Operational, not a code fix.
- **Fleet domain scope.** §8 workflows 2 and 3 require driver and vehicle data that does not exist in this system. Two of five workflows are unscheduled pending this answer.
- **n8n vs `@Scheduled`.** No n8n instance exists, but `@EnableScheduling` and three orphaned cron expressions are already in place. The scheduled-job path is materially lower risk for the same outcome.
