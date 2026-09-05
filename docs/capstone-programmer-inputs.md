# Programmer Input for the TNVS Capstone Documentation

**System:** Photonic Omega TNVS Facilities and Administrative Management System
**Prepared:** 2026-09-03
**Purpose:** Technical and system description that can be used as programmer input for Chapters 1 and 2.

## How to Use This Document

This document answers the sections listed in `need-input-of-programmers.md`. It describes the current repository and cloud-connected implementation. Statements marked **Current limitation** should not be presented as completed production capability. Statements marked **Recommended future work** are possible extensions, not current features.

The attached questionnaire is treated as documentation requirements. Its text is not treated as code or as an instruction to modify unrelated system behavior.

## System Overview

The system is a web-based, role-aware facilities and administrative management platform for a transport network vehicle service (TNVS) organization. It centralizes facilities operations, room reservations, visitor processing, document and records management, legal and contract workflows, compliance monitoring, security operations, employee requests, notifications, analytics, and administrative governance.

The current implementation uses a hybrid architecture:

- **Frontend:** React 19, TypeScript, Vite, React Router, Tailwind CSS, Axios, Zustand, Recharts, Leaflet, and Supabase JavaScript client.
- **Primary backend:** Spring Boot 3.3.5 on Java 21, Spring Security, JPA/Hibernate, PostgreSQL, JWT, WebSocket/STOMP, scheduled services, and Flyway-compatible migrations.
- **Cloud backend:** Supabase PostgreSQL, Supabase Realtime, Supabase Storage configuration, and domain-based Supabase Edge Functions written in TypeScript/Deno.
- **Authentication:** Custom database-backed users, BCrypt password hashes, JWT access tokens, refresh-token rotation, server-side login lockout, and account-unlock workflows.
- **Authorization:** Database roles, permissions, role inheritance, role conflicts for Separation of Duties (SoD), route guards, permission checks, and role-specific dashboards.
- **Realtime:** Supabase Realtime change markers for selected cloud data plus the existing Spring STOMP/SockJS stream for backend-driven live dashboards.
- **Database:** PostgreSQL is the system of record. Supabase migrations define the cloud schema and security controls.

The system has separate identities and responsibilities for **Super Administrator** and **System Administrator**. The Super Administrator manages governance and RBAC. The System Administrator manages infrastructure operations, monitoring, integrations, AI configuration, backups, notifications, and account lockouts. This separation prevents infrastructure administration from automatically granting RBAC-governance powers.

## Required Project Inputs Still Needed

The following information should be confirmed by the capstone team or client before finalizing the manuscript and production deployment.

| Input needed | What to provide | Why it is needed |
|---|---|---|
| Official project title | Final title, acronym, organization name, and target users | Keeps all chapters consistent |
| Organization structure | Departments, hubs, facilities, reporting lines, and department heads | Defines data ownership and hierarchy |
| User population | Number and type of users for each role | Supports scope, capacity, and test assumptions |
| Role matrix | Approved permissions for every role | Confirms RBAC behavior and UI visibility |
| SoD rules | Role combinations that must never be assigned together | Confirms constrained RBAC policy |
| Role hierarchy | Which senior roles inherit which junior-role capabilities | Confirms hierarchical RBAC |
| Facilities data | Facility names, rooms, capacities, equipment, rates, and operating status | Seeds facilities and reservation workflows |
| Compliance rules | Permits, deadlines, retention schedules, regulatory references, and escalation rules | Makes compliance results meaningful |
| Records policy | Record categories, retention periods, legal holds, disposal approvals, and custody rules | Configures records governance |
| Legal workflow | Approval stages, counsel actions, contract statuses, and authorized signatories | Configures contract and legal controls |
| Visitor policy | Accepted IDs, watchlist process, clearance rules, and retention period | Configures visitor verification |
| Security policy | Incident severity, emergency contacts, access-review frequency, and response targets | Configures security operations |
| AI policy | Approved providers, allowed data, prohibited prompts, human review, and retention | Controls safe AI use |
| Production credentials | Supabase URL/keys, JWT secret, SMTP, storage, AI encryption key, and provider keys | Required for deployment; never place these in source control |
| Backup policy | Frequency, retention, storage location, restore owner, and recovery targets | Defines backup and disaster-recovery acceptance criteria |
| Acceptance criteria | Test cases and pass/fail requirements per role and module | Supports capstone validation |

## Chapter 1

### 1.2.1 General Problem

TNVS organizations manage facilities, rooms, visitors, documents, contracts, compliance obligations, security events, and employee requests across separate manual processes or disconnected tools. This fragmentation makes information difficult to locate, delays approvals, increases the chance of inconsistent records, and limits management visibility.

The organization also needs to protect sensitive legal, personal, security, and operational information. A generic administrator account or a shared dashboard can give users more access than their responsibilities require. Without strong role separation, hierarchical permissions, Separation of Duties, audit trails, and account-lockout controls, unauthorized access and untraceable changes become more likely.

The general problem is therefore the lack of one secure, integrated, and role-specific platform that can coordinate TNVS facilities and administrative operations while providing timely information, controlled workflows, and accountable access to sensitive records.

### 1.2.2 Specific Problems

The study addresses the following specific problems:

1. Facilities, rooms, equipment, reservations, and maintenance information may be recorded in different places, making availability and operational status difficult to verify.
2. Visitor registration, ID verification, watchlist screening, check-in, and check-out require a consistent process and auditable history.
3. Documents and records require classification, metadata, access control, retention monitoring, legal holds, and defensible disposal.
4. Contracts, clauses, vendors, obligations, legal cases, and notices need controlled review and status tracking.
5. Compliance officers and managers need current visibility into permits, incidents, alerts, deadlines, and sign-off work.
6. Security and information-security teams need separate workspaces for physical security incidents, technology risks, access reviews, and monitoring.
7. Employees need a self-service channel for reservations, visitors, documents, requests, and notifications.
8. Administrators need reliable dashboards, audit logs, account-lockout recovery, system monitoring, and backup records.
9. Users need only the navigation, data, actions, and dashboard appropriate to their assigned role.
10. Management needs analytics and realtime change awareness without exposing raw sensitive database records to anonymous clients.
11. AI-assisted features need provider configuration, capability checks, human review, role restrictions, auditability, and safe fallback behavior.

### 1.3.1 In-Scope

| Module or feature category | Key functionalities and features | Primary users | Current status |
|---|---|---|---|
| Authentication | Login, logout, refresh tokens, password reset, heartbeat, login history, lockout, HR assistance | All users | Implemented |
| User and role governance | User-role assignments, permissions, role hierarchy, role conflicts, SoD validation, RBAC profile | Super Administrator | Implemented in cloud and frontend |
| Super Administrator portal | Executive dashboard, business analytics, security oversight, audit logs, RBAC administration, controlled oversight sessions | Super Administrator | Implemented |
| System Administrator portal | System health, monitoring, integrations, AI services, backup and DR records, notifications, sessions, account lockouts, system configuration | System Administrator | Implemented with separate access boundary |
| Facilities management | Facilities, rooms, equipment, room availability, reservations, maintenance, approvals, inventory, calendar, reports, analytics | Facilities Manager | Implemented |
| Facilities operations | Room availability, reservations, visitor assistance, facility documents, AI suggestions, notifications | Facilities Officer | Implemented |
| Employee self-service | Room reservations, visitors, documents, requests, notifications, profile, settings | Employee | Implemented |
| Visitor management | Registration, check-in, check-out, ID verification workflow, watchlist, verification history | Security and facilities staff | Implemented; external ID-reader integration is not included |
| Document management | Upload, metadata, folders, categories, tags, search, downloads, signed URLs, access grants, classification fields | Authorized staff | Implemented; storage behavior depends on deployment configuration |
| Records governance | Archives, custody events, retention policies, disposal requests, legal holds, lifecycle controls | Records Officer and Compliance Officer | Implemented in role workspace and cloud schema |
| Compliance management | Compliance alerts, retention checks, permit tracking, incidents, vendor risk, sign-offs, reports | Compliance Officer, DPO, Compliance Manager | Implemented in role workspaces and cloud schema |
| Legal management | Legal cases, notices, contracts, clauses, document approval, review stages, retention visibility | Legal Officer and Legal Counsel | Implemented |
| Contract and procurement | Contracts, clauses, vendors, obligations, notices, risk review, submit-review, approvals, activation, renewal, termination | Contract Officer | Implemented |
| Department governance | Department-scoped approvals, supervision, team activity, operational reports | Department Head | Implemented in role workspace and cloud schema |
| Security operations | Security logs, sessions, blocked IPs, alerts, threat map, physical incidents, hub monitoring, emergency response | Super Administrator and Security Officer | Implemented with role separation |
| Information security | Control health, technology risk, cyber incidents, vulnerabilities, access reviews | Information Security Officer | Implemented in role workspace and cloud schema |
| Analytics and dashboards | KPIs, operational summaries, trends, security statistics, backup analytics, live activity indicators | Authorized managers and administrators | Implemented |
| Realtime updates | Supabase Realtime event markers, online-user activity, notifications, selected dashboard refreshes, STOMP streams | Authorized users | Partially hybrid; not every module is realtime |
| AI services | Provider management, model discovery, module configuration, prompts, connection tests, AI chat, document and contract assistance | System Administrator and authorized users | Implemented as a governed AI façade; provider availability is configuration-dependent |
| Backup and disaster recovery records | Backup creation/records, latest backup visibility, storage configuration, scheduled cleanup jobs | System Administrator and Super Administrator | Implemented; restore testing remains an acceptance requirement |

### 1.3.2 Out-of-Scope

| Category | Excluded feature | What it means | Why it is excluded |
|---|---|---|---|
| Fleet operations | Vehicle dispatch, driver onboarding, passenger booking, fare calculation, GPS fleet tracking | The platform manages facilities and administration, not the transport dispatch business | Requires a separate fleet or ride-hailing domain |
| Payments | Payment gateway, payroll, billing, invoicing settlement, and accounting ledger | No financial transaction is executed by this system | Requires financial controls and external payment integration |
| Physical IoT | Live sensors, smart locks, RFID hardware, CCTV camera feeds, environmental sensors, and automatic building controls | The application can record operational data but does not directly operate physical devices | Hardware, networking, calibration, and vendor integration are outside the capstone boundary |
| Biometric implementation | Biometric enrollment, biometric template storage, and biometric matching hardware | The workspace supports biometric access audit records, not biometric identification | Requires specialized hardware, legal review, and biometric privacy controls |
| Public customer portal | Unauthenticated public access for passengers, vendors, or visitors | The application is an authenticated internal platform | Public workflows require separate identity, abuse, and privacy design |
| Government API automation | Guaranteed direct integration with LTFRB, NPC, National Archives, BIR, SEC, or other government systems | Regulations can be referenced and tracked, but records are not automatically synchronized from those agencies | External API access, credentials, contracts, and data formats are not controlled by the project |
| Custom model training | Training a new machine-learning or deep-learning model using an institutional dataset | The system can call configured AI providers and use deterministic fallback logic; it does not train a model | Training requires a curated dataset, evaluation protocol, compute resources, and governance approval |
| Fully autonomous decisions | AI-only approval, legal advice, visitor clearance, contract signing, disposal execution, or disciplinary action | AI output is advisory and human-controlled | High-impact decisions require accountable authorized personnel |
| Full production OCR/KYC | Guaranteed OCR accuracy for every document or government ID | OCR and verification are workflow capabilities; accuracy must be validated with real samples and any external provider | The current code includes simulated or provider-dependent processing in some paths |
| Multi-region high availability | Automatic active-active failover, defined RPO/RTO, and tested cross-region restoration | The project includes backup and DR concepts, not a proven enterprise HA operation | Requires infrastructure ownership, budget, and disaster exercises |
| Formal certification | ISO 27001, ISO 9001, SOC 2, or legal certification | The system may apply practices aligned with these standards but is not certified by them | Certification requires an independent audit and organizational controls beyond software |

### 1.4.2 Specific Objectives

| No. | Specific objective | Measurable or demonstrable result |
|---:|---|---|
| 1 | Centralize facilities, rooms, equipment, reservations, and maintenance information | Authorized users can create, view, update, approve, and monitor facilities records through one platform |
| 2 | Provide secure authentication and account recovery | Valid users can log in and refresh sessions; repeated failed attempts trigger server-side lockout; authorized administrators can unlock accounts |
| 3 | Implement Symmetric RBAC/RBAC3 | Roles, permissions, inherited roles, role conflicts, and effective permissions are stored and enforced by the backend |
| 4 | Enforce Separation of Duties | Conflicting combinations such as privacy/security, legal/records, and physical-security/information-security roles are rejected or identified |
| 5 | Provide role-based UI and dynamic dashboards | Each role is routed to an appropriate dashboard and sees only its permitted navigation and actions |
| 6 | Improve document, records, legal, and compliance control | Documents, retention policies, custody events, cases, contracts, alerts, approvals, and disposal workflows have statuses and audit trails |
| 7 | Provide security and information-security visibility | Authorized users can review logs, active sessions, blocked IPs, alerts, threat information, control health, and incidents |
| 8 | Provide realtime operational awareness | Changes in selected database-backed workflows produce realtime markers or refreshed dashboard data without exposing raw protected records publicly |
| 9 | Provide governed AI assistance | Administrators can configure providers and modules; AI calls use capability checks, encrypted provider credentials, audit records, and safe fallback behavior |
| 10 | Provide backup, monitoring, and administrative continuity | System health, backup records, integrations, notifications, and lockout recovery are visible to the correct administrator role |
| 11 | Support evidence-based management decisions | KPI, trend, security, compliance, and operational summaries are available from persisted system data |

### 1.5.1 Theoretical Relevance

The system is relevant to the following theories and principles:

- **Role-Based Access Control:** Access is granted through organizational roles rather than individually hard-coded users. This reduces administrative complexity and supports least privilege.
- **Symmetric RBAC/RBAC3:** The implementation combines role hierarchies, permissions, and constraints. Senior roles can inherit approved capabilities while SoD rules restrict incompatible role assignments.
- **Separation of Duties:** Sensitive workflows are divided among different responsibilities so one person cannot control every stage of a high-risk process.
- **Defense in depth:** Authentication, JWT validation, backend authorization, database access controls, lockout, rate limiting, audit logs, encrypted AI keys, and realtime data minimization provide multiple protection layers.
- **Privacy by design:** The design limits data visibility by role, keeps raw protected records out of anonymous realtime streams, audits sensitive reveals, supports retention and disposal, and separates privacy governance from operational security.
- **Information systems success:** System quality, information quality, service quality, use, user satisfaction, and organizational benefit can be evaluated through usability tests, response behavior, data accuracy, and workflow completion.
- **Decision support systems:** Dashboards, KPIs, risk indicators, alerts, and trend summaries transform operational records into information for managers.
- **Socio-technical systems:** The software is effective only when technical controls match real organizational responsibilities, policies, approval chains, and user behavior.

These ideas can support the Review of Related Literature and Studies. The capstone team should add academic sources and organization-specific evidence during the research-writing stage.

### 1.6 Definition of Terms

| Term | Definition in this system |
|---|---|
| TNVS | Transport Network Vehicle Service; the organizational context for the platform |
| Facilities management | Planning, operating, maintaining, and monitoring facilities, rooms, equipment, and related services |
| Authentication | Verifying the identity of a user before access is granted |
| Authorization | Determining what an authenticated user is allowed to view or do |
| Role | A named organizational responsibility such as System Administrator, DPO, or Records Officer |
| Permission | A specific capability over a module, resource, and action |
| RBAC | Role-Based Access Control, where permissions are assigned to roles and roles are assigned to users |
| RBAC3 | A constrained RBAC model combining role permissions, role hierarchy, and constraints such as SoD |
| Role hierarchy | A senior-to-junior relationship through which approved capabilities can be inherited |
| Separation of Duties | A constraint preventing incompatible responsibilities from being assigned to one user |
| Constrained RBAC | RBAC that applies business and security constraints to role assignments or actions |
| Effective role | The role capability available after assigned roles and permitted hierarchy are evaluated |
| Least privilege | Giving a user only the access required for assigned work |
| Dynamic dashboard | A dashboard whose content, navigation, actions, and data are selected using the current user role and permissions |
| JWT | JSON Web Token used to carry signed authentication claims between client and server |
| Access token | Short-lived token used to authorize API requests |
| Refresh token | Longer-lived token used to obtain a new access token; stored and rotated server-side |
| Account lockout | Temporary or prolonged denial of login after repeated failed attempts |
| Audit trail | A chronological record of security, administrative, workflow, and data actions |
| Realtime | Delivery of a change notification or refreshed data soon after a persisted event occurs |
| Supabase | Cloud platform used here for PostgreSQL, Realtime, Edge Functions, and related services |
| Edge Function | A server-side TypeScript/Deno function exposed through a Supabase function endpoint |
| Row-Level Security | PostgreSQL policy enforcement that controls which rows a database role may access |
| SoD conflict | A stored rule identifying two roles that should not be assigned together |
| Oversight session | A controlled, audited, read-only session used by an authorized administrator to review another user workspace |
| Retention policy | A rule defining how long a record should be preserved and what happens at expiry |
| Legal hold | A restriction that prevents disposal while a legal or investigative matter requires preservation |
| Chain of custody | The recorded sequence of custody events for a controlled record |
| KPI | Key Performance Indicator used to summarize operational performance |
| AI provider | An external or local model service configured for approved AI operations |
| Human-in-the-loop | A control requiring an authorized person to review or approve an AI-assisted result |

## Chapter 2

### 2.4 Emerging Technologies, Intelligent Systems, and Standards

#### 2.4.1 Microservices Architecture

The system follows a **modular and service-oriented approach**, but it should not be described as a pure microservices deployment. The Spring Boot backend is organized into bounded modules such as authentication, administration, analytics, documents, facilities, visitor management, legal, procurement, compliance, employee services, notifications, security, and monitoring. The cloud side also contains domain-based Supabase Edge Functions for authentication, administration, governance, facilities, legal, compliance, analytics, monitoring, security, and other modules.

This structure supports separation of responsibilities and future service extraction. However, the Spring implementation is still a modular monolith because the modules run within one JVM application and share a database. The Edge Functions are independently routed serverless modules, not proof that every domain is an independently deployed microservice.

**Benefits:** modular ownership, smaller domain boundaries, independent cloud function routes, easier role-specific authorization, and a clear path to future extraction.
**Current limitation:** there is no measured independent deployment, scaling, or failure isolation for every Spring module.

##### API Gateway

The frontend sends requests through one API client. Requests can target the Spring `/api/v1` backend or the Supabase `/functions/v1` entry point depending on deployment configuration. Supabase provides the cloud HTTP edge entry point, while the shared Edge Function handler performs route matching, CORS handling, token extraction, role/permission checks, error envelopes, and request dispatch.

The API client also normalizes legacy `/api/v1` paths and maps module paths to their corresponding Supabase function. This behaves as an application-level API gateway or façade. It is not a separately deployed Kong, NGINX, or enterprise API-management product configured by this repository.

##### Service Discovery

The current implementation uses static configuration and known function names. The frontend maps route prefixes such as `auth`, `admin`, `governance`, `facilities`, `legal`, and `monitoring` to fixed Supabase function names. The Spring application uses fixed controllers and a fixed database configuration.

There is **no Eureka, Consul, Kubernetes service discovery, or dynamic registry** in the repository. Service discovery is therefore not an implemented feature. A future distributed deployment could introduce a service registry, but it is unnecessary for the current hybrid and serverless routing model.

##### Containerization

No Dockerfile or Docker Compose deployment artifact is currently included in the repository. The frontend is compatible with Vite/Vercel-style deployment, Supabase functions are deployed through the Supabase CLI, and the Spring backend can be packaged as a Java archive through Maven.

Containerization should be listed as a possible deployment improvement, not as a completed system feature. A future container plan would define images for the Spring backend, frontend, worker jobs, and local development services, together with secret injection and health checks.

#### 2.4.2 Artificial Intelligence (AI)

The system includes a governed AI services area. It stores AI provider and module configuration in the backend/cloud data layer, supports model discovery and connection tests, associates providers with modules, records AI activity, and exposes AI assistance through role-controlled endpoints.

The configured AI module categories are:

1. Document Classification and OCR.
2. Contract and Legal Risk Analysis.
3. Visitor Verification and ID Parsing.
4. Legal Retention and Records Compliance.
5. Smart Search and Metadata Tagging.

AI output is advisory. The system prompt instructs the assistant not to expose credentials, bypass RBAC, fabricate records, provide unauthorized legal advice, or claim that an action occurred without confirmation. High-impact operations remain with authorized human users.

##### Machine Learning

The repository does not train a custom machine-learning model. When an approved external provider is configured, the system can call provider models through server-side requests. When a usable provider is unavailable, the system uses safe fallback processing or reports that live AI is unavailable.

Some existing backend paths use deterministic keyword classification, truncated-text summaries, fixed demonstration contract results, or simulated OCR output. These paths should be described as prototype or fallback intelligence rather than as a validated machine-learning model.

##### Deep Learning

Deep learning is represented only through the ability to call configured large language or other external model providers. The project does not implement neural-network training, dataset preparation, model fine-tuning, or independent deep-learning evaluation.

##### Predictive Analytics

The platform provides risk indicators and forward-looking operational signals such as contract and vendor risk, permit expiry, compliance deadlines, incident severity, security threat classification, inventory alerts, and analytics trends. Most current indicators are rule-based or derived from persisted status data. They should not be described as statistically validated predictions until a labeled dataset and evaluation metrics exist.

##### Generative AI

When a valid provider and model are configured, the AI service can generate chat responses, summaries, clause analysis, classification assistance, and operational recommendations. Provider API keys are intended to stay server-side and are encrypted before persistence. Generated results require role checks and human review where the result can affect a legal, privacy, security, compliance, or records decision.

#### 2.4.3 Internet of Things (IoT)

IoT is not implemented in the current system. The platform records facilities, rooms, equipment, visitor, security, and maintenance information, but it does not directly receive telemetry from sensors or control physical devices.

IoT may be a future integration area for room occupancy sensors, environmental monitoring, smart access control, CCTV event ingestion, or equipment health data. Any future integration must define device identity, message security, data retention, network reliability, and privacy controls.

#### 2.4.4 Data Analytics and Business Intelligence

The system provides operational analytics and business-intelligence functions through KPI endpoints, role-specific summaries, trend data, security metrics, backup analytics, compliance indicators, and dashboard visualizations. Recharts is used for selected frontend visualizations, while Leaflet is used for geographic threat-map presentation.

The analytics process is:

1. Collect persisted operational, security, audit, workflow, and backup records.
2. Apply authorization and module scope before returning data.
3. Aggregate counts, statuses, trends, risk levels, deadlines, and activity summaries.
4. Present results through dashboards, cards, tables, charts, alerts, and realtime refresh indicators.
5. Allow authorized personnel to use the information for monitoring, prioritization, escalation, and planning.

The system is an operational BI platform, not a full data warehouse or enterprise lakehouse. Data quality depends on complete and accurate source records.

#### 2.4.5 Polyglot Persistence

PostgreSQL is the primary and authoritative persistence layer. The application also uses several supporting storage mechanisms:

- Supabase PostgreSQL for users, roles, permissions, business records, workflow records, audit data, realtime markers, and configuration.
- Supabase Storage configuration for cloud document or backup storage when enabled.
- Local filesystem or configured fallback path for Spring document and backup operations in deployments that use local storage.
- Browser `localStorage` for client session tokens and the cached user summary; it is not the authoritative database.
- Caffeine and process memory for selected short-lived caches and runtime state.

This is a heterogeneous storage arrangement, but it is not a strict polyglot database architecture because PostgreSQL remains the system of record. File storage and ephemeral caches must be configured and tested separately in production.

#### 2.4.6 Cybersecurity

The principal cybersecurity controls are:

- BCrypt password hashing with configurable strength, currently set to cost 12.
- Short-lived signed JWT access tokens and database-backed refresh-token rotation.
- Server-side failed-login counters, progressive lockout, and administrator unlock capability.
- IP blocking, suspicious-request pattern checks, and rate limiting. Cloud Edge Functions use database-backed rate-limit counters; the legacy Spring path also contains process-local Bucket4j state.
- Backend route guards and method-level authorization; frontend guards are only a usability layer.
- RBAC3 role hierarchy and SoD conflict controls.
- Audit and security logs for authentication, administrative, workflow, and data actions.
- Realtime data minimization through sanitized change markers instead of unrestricted anonymous database change feeds.
- CORS configuration, error handling, token invalidation, and active-session cleanup.
- AES-256-GCM encryption for persisted AI provider API keys when the encryption key is configured.
- Read-only oversight sessions that prevent mutations while reviewing another workspace.
- Secret scanning through the GitHub Actions Gitleaks workflow.

Security claims should be limited to implemented controls and test evidence. The system is not a substitute for penetration testing, independent code review, network security, endpoint security, or organizational security policy.

#### 2.4.7 Data Privacy

The platform supports privacy governance by limiting access to role-authorized data and by providing a dedicated Data Protection Officer workspace. Relevant controls include data inventory and mapping, privacy reveal audits, visitor-log masking workflows, CCTV decision workflows, data-subject requests, retention policies, breach incident records, records custody, disposal controls, audit trails, and role separation between privacy and security responsibilities.

The system is designed to support principles such as:

- Purpose limitation through module-specific access.
- Data minimization through scoped endpoints and sanitized realtime events.
- Accountability through audit logs and immutable workflow records.
- Retention limitation through retention and disposal workflows.
- Confidentiality through authentication, authorization, encryption, and restricted storage.
- Human review for legal, privacy, security, and compliance decisions.

The software should be described as **supporting privacy compliance**, not as automatically guaranteeing compliance with the Philippine Data Privacy Act, National Privacy Commission requirements, or any other regulation. Legal and organizational review remains necessary.

#### 2.4.8 Software Quality Standards

The implementation uses the following engineering practices and technical standards:

- Java 21 and Spring Boot 3.3.5 for the primary backend.
- TypeScript with strict compiler settings for the frontend.
- React and Vite for component-based, buildable frontend delivery.
- REST-style HTTP endpoints with JSON response envelopes.
- OpenAPI/Swagger configuration for backend API documentation.
- PostgreSQL SQL migrations for reproducible cloud schema changes.
- Git and GitHub for version control and branch collaboration.
- Environment variables for deployment secrets and environment-specific configuration.
- Input validation, error handling, role guards, audit records, and database constraints.
- Production checks used during this work: frontend production build, backend Maven compile under Java 21, `git diff --check`, and cloud authentication/RBAC smoke tests.

These are engineering practices, not formal certification. The repository currently has a Gitleaks workflow but does not contain a complete automated build, lint, and test workflow for every change. Additional unit, integration, accessibility, performance, and security testing should be included in the final capstone validation plan.

### 2.5 DevOps Culture and CI/CD Practices

The development workflow uses Git branches and GitHub as the collaboration and review system. Environment configuration is separated from source code, and Supabase schema changes are represented as ordered migration files. The frontend has Vite build and preview commands, while the backend is built with Maven.

The repository includes a GitHub Actions secret-scanning workflow that:

1. Checks out the complete commit history.
2. Installs Gitleaks.
3. Determines the correct commit range for pushes or pull requests.
4. Runs `gitleaks detect` with redaction.
5. Fails the workflow when newly introduced secrets are found.

Vercel configuration provides the frontend build command, output directory, and single-page application rewrite. Supabase CLI configuration supports cloud migration and Edge Function deployment.

The current CI/CD limitation is that the repository does not contain a complete automated pipeline for frontend build, backend compile/test, lint, migration verification, deployment, and rollback. A recommended pipeline is:

1. Pull request validation: secret scan, frontend type-check/build, backend compile/test, SQL migration checks, and authorization tests.
2. Review gate: manual capstone or maintainer approval.
3. Staging deployment: deploy frontend, Edge Functions, and migrations to a non-production Supabase project.
4. Smoke tests: login, role routing, RBAC denial, SoD assignment, realtime event, lockout/unlock, upload, and critical workflows.
5. Production deployment: promote only after staging passes.
6. Recovery: retain the previous frontend build, migration plan, database backup, and rollback owner.

### 2.6 Enterprise Architecture and System Integration

The system can be described using the following layers:

| Layer | Components | Responsibility |
|---|---|---|
| Presentation | React, TypeScript, Vite, role workspaces, dashboards, forms, charts, maps | User interaction and role-specific presentation |
| Client integration | Axios API client, Zustand stores, Supabase client, realtime subscriptions | Request routing, session state, and live change handling |
| API and edge | Spring controllers and Supabase Edge Function routers | HTTP endpoints, validation, authorization, and response contracts |
| Application services | Spring services and Edge Function handlers | Business rules, workflows, AI orchestration, notifications, and analytics |
| Security | JWT, BCrypt, Spring Security, Edge guards, lockout, rate limits, audit logging | Identity, authorization, accountability, and abuse prevention |
| Data | Supabase PostgreSQL, migrations, RLS, indexes, workflow tables | Persistent system records and constraints |
| Realtime and jobs | Supabase Realtime markers, STOMP/SockJS, scheduled services, pg_cron functions | Change awareness, notifications, cleanup, and scheduled operations |
| External integrations | AI providers, SMTP, IP geolocation, Supabase services, optional storage | Provider-backed capabilities and communication |

Important integration boundaries are:

- The frontend communicates through a single API client and does not directly use privileged database keys.
- Supabase Edge Functions use server-side database access and centralized authentication/authorization guards.
- The Spring backend and cloud functions use compatible user, role, permission, workflow, and response concepts.
- Supabase Realtime publishes sanitized change markers so clients can refetch authorized data through protected endpoints.
- SMTP supports password-reset and HR-assistance messages when configured.
- AI provider keys are intended to be kept server-side and encrypted at rest.
- Scheduled jobs perform cleanup and operational checks, but every job must be monitored and audited.

### 2.7 Conceptual Framework

The recommended conceptual framework is an Input-Process-Output-Outcome (IPOO) model.

| IPOO element | System content |
|---|---|
| Input | User credentials, role assignments, permissions, SoD constraints, facility data, room data, visitor data, documents, contracts, incidents, compliance rules, configuration, and realtime events |
| Process | Authenticate the user; evaluate roles and permissions; validate constraints; apply business workflows; store and audit records; calculate KPIs; invoke configured AI assistance; publish sanitized change markers; send notifications |
| Output | Role-specific dashboards, approved or rejected workflow statuses, facility availability, visitor status, document classifications, compliance alerts, legal and contract status, security indicators, analytics, audit records, and notifications |
| Outcome | Faster and more accountable administration, improved visibility, reduced unauthorized access, better records governance, and more consistent facilities operations |

The framework connects the technical controls to the capstone problem: reliable inputs are processed using controlled workflows and authorization, producing useful information and organizational outcomes.

### 2.8 Theoretical Paradigm

The primary theoretical paradigm is a **security-centered design-science and systems-development paradigm**. The project identifies an operational problem, designs a working information-system artifact, implements security and governance controls, and evaluates whether the artifact addresses the identified problems.

The paradigm has four connected viewpoints:

1. **Organizational viewpoint:** Roles, departments, approval chains, policies, SoD, and accountability define what users should be allowed to do.
2. **Information-systems viewpoint:** The platform integrates people, processes, data, software, and infrastructure into one operational system.
3. **Security viewpoint:** Least privilege, RBAC3, defense in depth, auditability, lockout, privacy, and human approval reduce risk.
4. **Evaluation viewpoint:** The system is evaluated through functional tests, role-based access tests, workflow completion, response correctness, realtime behavior, usability feedback, and security checks.

The IPOO framework explains how inputs become outcomes, while RBAC3 and defense in depth explain how access and risk are controlled during processing. This combination is suitable for a capstone focused on developing and evaluating a secure enterprise management system.

## Role and Governance Summary

| Role | Main responsibility | Dashboard/workspace |
|---|---|---|
| Super Administrator | RBAC governance, role hierarchy, SoD conflicts, executive analytics, security oversight, controlled oversight sessions | Super Administration |
| System Administrator | Infrastructure, integrations, AI services, system health, backups/DR, notifications, sessions, lockout recovery | System Administration |
| Facilities Manager | Facilities, rooms, reservations, maintenance, inventory, approvals, reports | Facilities Management |
| Facilities Officer | Daily facilities operations, room availability, reservations, visitors, documents | Facilities Operations |
| Compliance Manager | Compliance supervision, management sign-offs, incident escalation, subordinate oversight | Compliance Management |
| Compliance Officer | Regulatory tracking, permits, contracts, incidents, vendor controls | Regulatory Compliance |
| Data Protection Officer | Privacy governance, data inventory, retention, CCTV/privacy logs, DSRs, breach console | Data Protection |
| Legal Counsel | Legal authorization, approvals, regulatory oversight, SoD/legal risk | Legal Counsel |
| Legal Officer | Legal cases, notices, contracts, documents, legal workflows | Legal Operations |
| Records Officer | Archives, ingestion, custody, retention, disposal | Records Governance |
| Contract Officer | Procurement, contracts, vendors, obligations, notices | Contract/Procurement |
| Department Head | Department approvals, supervision, team activity, reports | Department Leadership |
| Security Officer | Physical security incidents, access risk, hub monitoring, emergency response | Security Operations |
| Information Security Officer | Security controls, technology risks, cyber incidents, vulnerabilities, access reviews | Information Security |
| Employee | Self-service reservations, visitors, documents, requests, and notifications | Employee Self-Service |

The final role matrix must be approved by the project owner. The role names and responsibilities above reflect the current implementation and should be reconciled with the official capstone organization chart.

## Programmer Verification Notes

The following evidence supports the technical statements in this document:

- Frontend package and build configuration: `frontend/package.json`, `frontend/tsconfig.json`, and `frontend/vite.config.ts`.
- Main route and role guard definitions: `frontend/src/App.tsx` and `frontend/src/stores/authStore.ts`.
- Role-specific navigation and workspaces: `frontend/src/components/layout/AppLayout.tsx` and `frontend/src/components/workspaces/workspaceConfig.ts`.
- Backend modules and dependencies: `backend/pom.xml` and `backend/src/main/java/com/photonicomega/facilities/`.
- Backend security configuration: `backend/src/main/java/com/photonicomega/facilities/security/SecurityConfig.java`.
- Login lockout behavior: `backend/src/main/java/com/photonicomega/facilities/module/auth/service/LoginAttemptService.java`.
- Cloud RBAC3 schema and constraints: `supabase/migrations/00009_rbac3_hierarchy_constraints.sql`.
- Cloud role separation and oversight: `supabase/migrations/00011_role_separation_and_oversight.sql` and `supabase/migrations/20260902000200_repair_admin_role_separation.sql`.
- Cloud realtime hardening: `supabase/migrations/00010_realtime_access_hardening.sql`.
- Cloud workflow and live-data schema: `supabase/migrations/00012_role_workflow_foundations.sql` and `supabase/migrations/00014_role_workspace_live_data.sql`.
- Cloud rate limiting and scheduled cleanup: `supabase/migrations/002_add_rate_limit_counts.sql` and `supabase/migrations/003_pg_cron_background_jobs.sql`.
- Cloud route guards and authorization: `supabase/functions/_shared/guard.ts`.
- Cloud AI façade: `supabase/functions/ai/index.ts`.
- Secret scanning: `.github/workflows/secret-scanning.yml`.

## Final Capstone Writing Cautions

- Do not claim that the system is a full microservices platform, because the Spring backend remains a modular monolith.
- Do not claim that IoT, biometric hardware, government API synchronization, payments, or fleet dispatch are implemented.
- Do not describe deterministic or simulated AI fallback behavior as a trained machine-learning or deep-learning model.
- Do not claim formal ISO, SOC, or legal certification without independent evidence.
- Do not publish real passwords, API keys, JWT secrets, Supabase service-role keys, or SMTP credentials in the manuscript.
- Do not claim that every module is realtime; identify the specific workflows and event streams that were tested.
- Do not claim disaster recovery is complete until a backup has been restored in a controlled test and the recovery result has been recorded.
- Do not rely on frontend hiding alone as proof of authorization; backend and database enforcement are the security boundary.
