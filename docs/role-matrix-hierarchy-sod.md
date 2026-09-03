# TNVS Role Matrix, Role Hierarchy, and SoD Rules

**System:** Photonic Omega TNVS Facilities and Administrative Management System
**Document type:** Enterprise RBAC3 authorization policy
**Status:** Proposed policy for capstone and implementation review
**Prepared:** 2026-09-03

## 1. Policy Purpose

This document defines the authorization model for the TNVS Facilities and Administrative Management System. It specifies:

- Which roles can create, read, update, or delete records in each major module.
- Which roles inherit capabilities from other roles.
- Which role combinations are prohibited under Separation of Duties (SoD).
- Which actions require approval, dual control, audit logging, or legal hold protection.

The backend must enforce this policy. Frontend navigation and dashboard visibility are usability controls only and must never be treated as the security boundary.

## 2. CRUD Definitions

| Code | Meaning | TNVS interpretation |
|---|---|---|
| C | Create | Create a new record, request, incident, document, configuration item, or workflow entry within the role's scope |
| R | Read | View records, summaries, logs, metadata, or status information within the role's scope |
| U | Update | Edit permitted fields, change status, assign work, or progress a workflow |
| D | Delete | Archive, retire, revoke, or submit a controlled disposal action; it does not mean unrestricted physical deletion |
| - | No access | The role has no permission for that module |
| `*` | Restricted scope | The role can access only a named subset, such as privacy records, infrastructure telemetry, or security evidence |
| `†` | Approval or dual-control restriction | The action is allowed only when the actor is not the requestor/author and all required approvals are recorded |
| `‡` | Immutable-record restriction | The role may create or read the record but cannot edit or delete the audit evidence itself |

### 2.1 Module Boundaries

- **Facilities:** facilities, rooms, equipment, reservations, maintenance, inventory, visitor-facing facility operations, and room availability.
- **Documents:** uploaded documents, folders, categories, tags, metadata, access grants, legal documents, records archives, and document lifecycle actions.
- **Compliance:** compliance alerts, permits, retention policies, incidents, vendor risk, management sign-offs, data-protection governance, and disposal workflows.
- **Security:** security logs, active sessions, account lockouts, blocked IPs, security alerts, threat map data, physical-security incidents, access risk, cyber incidents, and security monitoring.

## 3. Role Matrix

The matrix uses the CRUD codes above. The scope and control conditions in the last column are part of the permission definition; a `CRUD` cell does not grant unrestricted access to every record in that module.

| Role | Facilities | Documents | Compliance | Security | Primary authorization boundary |
|---|---|---|---|---|---|
| **Super Admin** | `R*` | `R*` | `R*` | `R*‡` | Governance, executive oversight, RBAC3 administration, SoD rules, hierarchy, and controlled read-only oversight. Does not perform routine business operations. |
| **System Admin** | `R*` | `R*` | `R*` | `CRU*‡` | Infrastructure health, integrations, system monitoring, backups/DR, AI services, sessions, and account lockout recovery. Cannot administer roles/RBAC and cannot alter immutable audit evidence. |
| **Facilities Manager** | `CRUD†` | `CRU*†` | `R*` | `R*` | Facilities operations leadership, room and asset administration, maintenance, reservations, inventory, and operational approvals. |
| **Facilities Officer** | `CRU` | `CRU*` | `CR*` | `CR*` | Day-to-day room, reservation, facility-document, visitor, and operational request processing. No final approval for their own work. |
| **Compliance Manager** | `R*` | `CRU*†` | `CRUD†` | `R*‡` | Compliance program supervision, management sign-offs, incident escalation, and subordinate compliance oversight. |
| **Compliance Officer** | `R*` | `CRU*` | `CRU` | `R*‡` | Regulatory evidence, permits, vendor controls, compliance incidents, alerts, and submissions for manager review. |
| **DPO** | `R*` | `CRU*` | `CRU*†` | `R*‡` | Independent privacy governance, data inventory, privacy requests, privacy incidents, masking/reveal audits, and privacy retention controls. |
| **Legal Counsel** | `R*` | `CRU*†` | `R*` | `R*‡` | Legal authorization, counsel review, legal holds, settlement/risk review, and final legal approval. |
| **Legal Officer** | `R*` | `CRU*` | `CRU*` | `R*‡` | Legal case, notice, contract, clause, and legal-document preparation. Submits matters to Legal Counsel. |
| **Records Officer** | `R*` | `CRUD*†` | `CRU*†` | `R*‡` | Records ingestion, metadata, custody, archival lifecycle, retention schedules, and controlled disposal preparation. |
| **Security Officer** | `CRU*` | `R*` | `R*` | `CRUD*‡` | Physical security incidents, access/visitor risk, hub monitoring, emergency response, and operational security resolution. Cannot change RBAC or erase security evidence. |

### 3.1 Matrix Interpretation by Role

#### Super Admin

The Super Admin is the highest governance role for role assignments, permission catalogues, role hierarchy, SoD conflict rules, and executive oversight. It may inspect business and security information for governance purposes, but it should not routinely create or edit facilities, legal, compliance, or security records. Any oversight or impersonation capability must be explicitly audited, time-limited, and read-only unless an approved break-glass procedure exists.

#### System Admin

The System Admin is an infrastructure role, not an RBAC governance role. It can operate monitoring, integrations, AI configuration, backup and disaster-recovery functions, sessions, notifications, and account lockout recovery. It may inspect technical information needed to operate the platform, but it must not assign roles, change SoD rules, grant permissions, or edit/delete immutable audit logs.

#### Facilities Manager and Facilities Officer

The Facilities Manager owns operational approval and administration for facilities, rooms, maintenance, inventory, and reservations. The Facilities Officer performs daily operations and prepares requests. A Facilities Manager must not approve a request that they created or materially changed. The manager's delete permission means controlled archival, retirement, or cancellation subject to retention and audit rules.

#### Compliance Manager and Compliance Officer

The Compliance Officer prepares evidence, tracks permits, manages alerts, and submits compliance work. The Compliance Manager reviews, escalates, and signs off management decisions. The same person must not prepare and finally approve the same controlled compliance item.

#### DPO

The DPO has independent privacy authority. DPO access includes privacy-relevant facilities, documents, compliance, and security evidence, but it must not become unrestricted access to operational security or all business records. Sensitive data reveals, CCTV exports, and privacy exceptions require a purpose, scope, audit entry, and where applicable a second approval.

#### Legal Counsel and Legal Officer

The Legal Officer drafts and manages legal work. Legal Counsel provides the independent review, legal authorization, and final counsel action. Legal Counsel must not be the sole author and approver of the same high-risk legal or contract decision.

#### Records Officer

The Records Officer controls record ingestion, metadata quality, custody, archive state, retention, and disposal preparation. Deletion is a controlled lifecycle action. A legal hold, active investigation, privacy hold, or unresolved compliance matter blocks disposal regardless of the Records Officer's CRUD permission.

#### Security Officer

The Security Officer manages operational and physical security matters, not platform RBAC. It can create and update incidents, alerts, access-risk records, and response status. Security logs and audit evidence are append-only or system-controlled; the officer cannot erase evidence to close an incident.

## 4. Role Hierarchy

### 4.1 Recommended RBAC3 Hierarchy

The hierarchy separates governance, infrastructure, and business operations. A senior role inherits only the capabilities of its explicitly declared junior role. Senior status does not automatically grant every role in the system.

```text
                         GOVERNANCE PLANE
                         Super Admin
                              |
          manages role catalogue, hierarchy, SoD, and oversight

       OPERATIONS PLANE                         INFRASTRUCTURE PLANE
       Business role branches                   System Admin

       Facilities Manager                       no inheritance from Super Admin
              |
       Facilities Officer

       Compliance Manager
              |
       Compliance Officer

       Legal Counsel
              |
       Legal Officer

       DPO, Records Officer, and Security Officer
       are independent specialist roles with no automatic
       inheritance from one another.
```

### 4.2 Inheritance Rules

| Senior role | Junior role | Inherited capability | Explicitly not inherited |
|---|---|---|---|
| Facilities Manager | Facilities Officer | Room, reservation, maintenance, facility-document, and operational facility capabilities | Final approval of the manager's own request; unrestricted security or RBAC administration |
| Compliance Manager | Compliance Officer | Compliance evidence, alerts, permits, and incident-management capabilities | Approval of the manager's own submission; privacy independence of the DPO |
| Legal Counsel | Legal Officer | Legal case, notice, document, contract-review, and clause-management capabilities | Automatic approval of counsel-authored work; RBAC administration |
| Super Admin | No operational junior role | Governance-plane administration, RBAC3 policy, and oversight controls | Automatic CRUD over all business modules; System Admin infrastructure privileges unless separately assigned and approved |
| System Admin | No business junior role | Infrastructure-plane operations and system continuity | RBAC administration, role assignment, SoD editing, legal approval, privacy approval, or business-record ownership |
| DPO | No automatic child role | Privacy-specific permissions only | General security-operations control and unrestricted compliance-manager authority |
| Records Officer | No automatic child role | Records lifecycle and custody permissions only | Legal approval, privacy decisions, and unrestricted destruction authority |
| Security Officer | No automatic child role | Physical/operational security permissions only | Information-security governance, RBAC administration, and immutable log deletion |

### 4.3 Hierarchy Safety Rules

1. No role may inherit from itself.
2. Inheritance must be acyclic; a role hierarchy cycle is invalid.
3. A senior role does not override SoD conflicts.
4. A permission inherited through hierarchy is still restricted by record scope, department scope, workflow state, legal hold, and approval requirements.
5. A user with multiple roles receives the union of allowed permissions only after all active SoD conflicts are evaluated.
6. Revoking a senior role must immediately remove inherited capabilities from the user.
7. Changes to hierarchy, permissions, or SoD rules require Super Admin authorization and an immutable audit record.
8. System Admin must not be granted `RBAC_ADMINISTER` as part of ordinary infrastructure access.

## 5. Separation of Duties Conflict Rules

The following are strict role-assignment conflicts for normal production accounts. Each rule should be stored as an active conflict pair in the RBAC policy and checked before a role is assigned. A temporary exception requires documented business justification, named approvers, an expiration date, compensating controls, and an audit record.

| Rule ID | Prohibited combination | Why the combination is prohibited | Control that must be enforced |
|---|---|---|---|
| `SOD-001` | **Super Admin + System Admin** | The Super Admin controls RBAC, permissions, and oversight while the System Admin controls infrastructure, logs, integrations, backups, and operational continuity. Combining them allows one person to grant access and operate or conceal the technical evidence of that access. | Separate named accounts and separate people in production. Emergency break-glass access requires dual approval and post-event review. |
| `SOD-002` | **DPO + Security Officer** | The DPO independently evaluates privacy impact, lawful processing, data minimization, and disclosure. The Security Officer operates physical security, visitor screening, access risk, and incident response. One person could collect or expose personal data and then approve their own privacy justification. | DPO may review security evidence, but cannot own operational security response. Security Officer cannot approve their own privacy exception or CCTV/data reveal. |
| `SOD-003` | **Legal Counsel + Records Officer** | Legal Counsel determines legal holds, litigation risk, and legal preservation needs. Records Officer controls custody, retention, archival state, and disposal. One person could impose, modify, or release a hold and then dispose of the affected record. | Legal hold release and disposal require independent legal authorization plus records execution; the same person cannot perform both sides. |
| `SOD-004` | **Legal Counsel + Legal Officer** | The Legal Officer prepares cases, contracts, notices, or clauses; Legal Counsel provides independent legal review and authorization. Combining them removes the maker-checker control for legal decisions. | Legal Officer may draft and submit. Legal Counsel must approve high-risk legal or contract actions that the counsel did not author. |
| `SOD-005` | **Compliance Manager + Compliance Officer** | The Compliance Officer prepares evidence and submissions while the Compliance Manager reviews and signs off. Combining them allows a user to create the evidence and approve its own compliance conclusion. | Separate preparer and approver for the same sign-off, incident closure, permit exception, or disposal decision. |
| `SOD-006` | **DPO + Compliance Manager** | The DPO must independently oversee privacy compliance and challenge operational decisions. The Compliance Manager supervises the compliance program and management sign-offs. Combining them weakens independent privacy escalation. | DPO privacy findings cannot be finally approved by the same person who owns the compliance program being assessed. |
| `SOD-007` | **Records Officer + Compliance Officer** | The Compliance Officer may submit evidence or disposal requests, while the Records Officer controls custody, retention, and execution. Combining them permits a person to create a compliance disposal rationale and execute the record lifecycle action. | Separate requestor and records custodian for disposal, retention override, or legal-hold release. |
| `SOD-008` | **Security Officer + System Admin** | The Security Officer manages operational incidents and evidence, while the System Admin can manage infrastructure, sessions, integrations, and monitoring. Combining them allows one person to create a security incident and alter the platform evidence or access state used to investigate it. | Security incident owner and technical platform operator must be distinct for high or critical incidents. |
| `SOD-009` | **Super Admin + Records Officer** | The Super Admin can alter RBAC governance and oversight visibility; the Records Officer controls archive and disposal actions. Combining the roles makes it possible to change access policy and dispose of evidence under the same identity. | Super Admin may review records but cannot execute routine disposal or custody actions. |
| `SOD-010` | **Facilities Manager + Facilities Officer for the same transaction** | The officer prepares or performs an operational action and the manager approves it. The same person cannot be the requestor and final approver for a reservation, asset reorder, maintenance closure, or facility change. | Enforce transaction-level maker-checker validation even if the account has both roles under an approved exception. |

### 5.1 Transaction-Level SoD

Role-level conflicts are not sufficient. The system must also enforce transaction-level separation:

- A user cannot approve, reject, close, or sign off a record they created.
- A user cannot approve a record they materially edited after submission.
- A user cannot release a legal hold and execute disposal of the same record.
- A user cannot reveal masked privacy data and approve the justification for their own reveal.
- A user cannot create a security alert, alter the supporting evidence, and mark the alert resolved without independent review for high or critical severity.
- A user cannot assign themselves a role, permission, hierarchy edge, or SoD exception.
- Any emergency override must be time-limited, reason-coded, fully audited, and reviewed by an independent authority.

### 5.2 SoD Evaluation Algorithm

The authorization service should evaluate role changes in this order:

1. Normalize role names and remove duplicates.
2. Load active roles assigned to the target user.
3. Add the proposed role to the candidate assignment set.
4. Check every active conflict pair against the candidate set.
5. Reject the assignment if any strict conflict is found.
6. Resolve permitted role hierarchy and calculate effective permissions.
7. Apply department, record-scope, workflow-state, legal-hold, and approval constraints.
8. Write the assignment result and reason to the immutable administrative audit log.

The same validation must run for direct API requests, administrative screens, imports, seed scripts, and background provisioning. Frontend validation alone is insufficient.

## 6. Privileged Actions Requiring Extra Control

| Action | Required control |
|---|---|
| Assign or revoke a role | Super Admin only; active SoD check; immutable audit log |
| Create or change a role permission | Super Admin only; impact review; immutable audit log |
| Add or remove hierarchy inheritance | Super Admin only; cycle check; immutable audit log |
| Create, activate, or remove an SoD conflict | Super Admin only; reason, policy reference, and audit log |
| Unlock a user account | System Admin may unlock; action records actor, target, reason, timestamp, and prior lockout state |
| Change system configuration | System Admin; sensitive changes require re-authentication and audit log |
| Create or restore a backup | System Admin; result, location, checksum/status, and retention recorded |
| Start an oversight session | Super Admin or specifically authorized oversight role; target, purpose, expiry, and read-only state recorded |
| Reveal masked privacy data | DPO or explicitly authorized role; purpose and data scope required; reveal audit written |
| Approve legal or compliance work | Independent approver; maker-checker validation; comments and decision timestamp required |
| Execute record disposal | Records Officer after legal/compliance holds and approvals are clear; disposal event is immutable |
| Resolve high/critical security incident | Security Officer with independent review for closure; evidence cannot be deleted |

## 7. Recommended Permission Catalogue

The CRUD matrix should be implemented from named permissions rather than broad role strings alone.

| Permission family | Example permissions |
|---|---|
| Facilities | `FACILITIES_READ`, `FACILITIES_MANAGE`, `ROOMS_MANAGE`, `RESERVATIONS_CREATE`, `RESERVATIONS_APPROVE`, `MAINTENANCE_MANAGE`, `INVENTORY_MANAGE` |
| Documents | `DOCUMENTS_READ`, `DOCUMENTS_CREATE`, `DOCUMENTS_UPDATE`, `DOCUMENTS_ARCHIVE`, `DOCUMENTS_DOWNLOAD`, `DOCUMENTS_GRANT_ACCESS`, `DOCUMENTS_DISPOSAL_REQUEST` |
| Compliance | `COMPLIANCE_READ`, `COMPLIANCE_EVIDENCE_MANAGE`, `COMPLIANCE_ALERT_MANAGE`, `COMPLIANCE_SIGNOFF`, `PERMIT_MANAGE`, `RETENTION_POLICY_MANAGE`, `DISPOSAL_APPROVE` |
| Privacy | `PRIVACY_READ`, `PRIVACY_REVEAL`, `PRIVACY_DSR_MANAGE`, `PRIVACY_BREACH_MANAGE`, `CCTV_PRIVACY_REVIEW` |
| Legal | `LEGAL_CASE_MANAGE`, `LEGAL_DOCUMENT_MANAGE`, `CONTRACT_DRAFT`, `CONTRACT_REVIEW`, `LEGAL_COUNSEL_APPROVE`, `LEGAL_HOLD_MANAGE` |
| Security | `SECURITY_LOG_READ`, `SECURITY_INCIDENT_CREATE`, `SECURITY_INCIDENT_MANAGE`, `SECURITY_ALERT_RESOLVE`, `SESSION_REVOKE`, `IP_BLOCK_MANAGE`, `THREAT_MAP_READ` |
| System operations | `SYSTEM_MONITOR`, `INTEGRATION_MANAGE`, `AI_CONFIGURE`, `BACKUP_MANAGE`, `ACCOUNT_UNLOCK`, `SYSTEM_CONFIGURE` |
| RBAC governance | `RBAC_ADMINISTER`, `ROLE_ASSIGN`, `PERMISSION_MANAGE`, `HIERARCHY_MANAGE`, `SOD_CONFLICT_MANAGE`, `OVERSIGHT_START` |

Permissions should be granted to roles, not directly to ordinary users. Direct user grants should be reserved for documented break-glass cases with an expiry and audit record.

## 8. Implementation Alignment

The current RBAC3 implementation already contains the core structures needed for this policy:

- `roles` and `permissions` catalogue organizational capabilities.
- `user_roles` assigns roles to users.
- `role_permissions` connects roles to permissions.
- `role_hierarchy` stores senior-to-junior inheritance.
- `role_conflicts` stores active SoD conflict pairs.
- `oversight_sessions` and administrative audit records support controlled review.
- Frontend workspaces provide role-specific navigation and dashboards.
- Supabase Edge Function guards and Spring Security enforce backend authorization.

The current cloud seed includes hierarchy examples for Facilities Manager to Facilities Officer and Legal Counsel to Legal Officer, plus specialist relationships. It also includes privacy/security, legal/records, and physical-security/information-security conflict examples. The strict policy rules in this document expand that baseline and should be approved before being added as additional migration data.

## 9. Acceptance Tests

The following tests should pass before the policy is considered operational:

1. Super Admin can create an SoD conflict but System Admin receives `403` for the same endpoint.
2. System Admin can unlock a locked account but cannot open RBAC administration or change a role assignment.
3. A Facilities Officer can create a reservation, but cannot approve their own reservation.
4. A Facilities Manager can approve an officer's reservation, but cannot approve a reservation they created themselves.
5. DPO can read permitted security evidence, but cannot resolve or modify an operational security incident as Security Officer.
6. Security Officer can manage security incidents, but cannot perform a privacy reveal or modify an SoD rule.
7. Legal Officer can submit a contract for review, but cannot perform the Legal Counsel approval action.
8. Records Officer cannot dispose of a record under an active legal hold.
9. Assigning DPO to a user who already has Security Officer is rejected with a clear SoD conflict code.
10. Assigning System Admin to a Super Admin account is rejected in production unless an approved break-glass exception is recorded.
11. Removing a senior role removes its inherited permissions immediately.
12. Direct API calls that bypass the frontend produce the same authorization result as the role-based UI.

## 10. Governance Decision Required

The project owner should approve the following before implementation is treated as final:

- Whether Super Admin and System Admin are always separate people in production.
- Whether DPO and Compliance Manager are globally incompatible or only separated for privacy decisions.
- Which records qualify as immutable audit evidence.
- Who provides independent approval for legal holds, privacy reveals, disposal, and critical security closure.
- Whether approved emergency exceptions are permitted, and the maximum expiry period.
- Which departments, facilities, and records each role may access beyond the module-level matrix.
