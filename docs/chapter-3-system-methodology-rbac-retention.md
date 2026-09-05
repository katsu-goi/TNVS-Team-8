# CHAPTER 3
# SYSTEM METHODOLOGY

## 3.1 Role-Based Authorization and Records Governance

This section presents the methodology used to define authorization, role hierarchy, separation of duties, and records-retention controls for the TNVS Facilities and Administrative Management System. The methodology translates organizational responsibilities into enforceable system permissions while preserving accountability for sensitive transactions. It combines Role-Based Access Control (RBAC), role hierarchy, constrained RBAC, and lifecycle-based records management.

The proposed authorization model follows RBAC3 principles. In this model, permissions are assigned to roles, roles are assigned to users, and senior roles may inherit selected permissions from junior roles. The model is constrained by Separation of Duties (SoD) rules, transaction-level approval requirements, department or record scope, legal holds, and workflow state. Consequently, possession of a role does not provide unrestricted access to all information in a module.

The methodology also distinguishes between the presentation layer and the security layer. Role-based navigation and dashboards are used to present functions relevant to each user. However, the frontend is not treated as a security boundary. Authorization is enforced by backend guards, database policies, workflow validation, and audit logging so that direct API requests receive the same access decision as requests initiated through the user interface.

### 3.1.1 Authorization Design Objectives

The authorization design was developed to achieve the following objectives:

1. Limit access to the minimum facilities, documents, compliance records, and security information necessary for a user's assigned responsibilities.
2. Separate governance, infrastructure, operational, privacy, legal, records, and security responsibilities.
3. Support managerial inheritance without allowing hierarchy to override SoD restrictions.
4. Require independent review for high-impact approvals, privacy reveals, legal holds, security closures, and record disposal.
5. Preserve an auditable history of role assignments, permission changes, approvals, overrides, and lifecycle actions.
6. Prevent automated disposal while a record is subject to a legal hold, investigation, regulatory request, privacy incident, unresolved data-subject request, or active dispute.

## 3.2 Permission Model and Role Matrix

### 3.2.1 Permission Notation

The role matrix uses Create, Read, Update, and Delete (CRUD) operations. In the context of this system, Delete does not represent unrestricted physical deletion. It represents a controlled lifecycle action such as archival, retirement, revocation, or submission of a disposal request. The symbols used in the matrix are defined in Table 3.1.

**Table 3.1. CRUD permission notation**

| Symbol | Meaning | Application in the TNVS system |
| --- | --- | --- |
| C | Create | Create a record, request, incident, document, configuration item, or workflow entry within the user's scope |
| R | Read | View records, summaries, logs, metadata, or status information within the user's scope |
| U | Update | Edit permitted fields, assign work, change status, or progress a workflow |
| D | Controlled delete | Archive, retire, revoke, or submit a controlled disposal action; physical deletion remains subject to retention controls |
| - | No access | No permission for the module |
| `*` | Restricted scope | Access is limited to a defined subset, such as privacy data, infrastructure telemetry, or security evidence |
| `†` | Approval or dual control | The operation requires the actor to be independent from the requestor and requires all prescribed approvals |
| `‡` | Immutable-record restriction | The role may create or read a record but cannot edit or delete the audit evidence itself |

The matrix covers four major functional modules. Facilities includes facilities, rooms, equipment, reservations, maintenance, inventory, visitor-facing facility operations, and room availability. Documents includes uploaded files, folders, categories, tags, metadata, access grants, legal documents, records archives, and document lifecycle operations. Compliance includes alerts, permits, retention policies, incidents, vendor risk, management sign-offs, data-protection governance, and disposal workflows. Security includes security logs, active sessions, account lockouts, blocked IPs, security alerts, threat-map data, physical-security incidents, access risk, cyber incidents, and security monitoring.

### 3.2.2 Role-to-Module Permission Matrix

Table 3.2 presents the proposed permissions for the eleven defined organizational roles. The permission code and its scope restriction must be interpreted together; for example, `CRUD†` does not permit a Facilities Manager to approve the manager's own request.

**Table 3.2. Role-to-module CRUD permission matrix**

| Role | Facilities | Documents | Compliance | Security | Authorization boundary |
| --- | --- | --- | --- | --- | --- |
| Super Admin | `R*` | `R*` | `R*` | `R*‡` | Governance, RBAC3 administration, SoD rules, hierarchy, and controlled oversight; no routine business operations |
| System Admin | `R*` | `R*` | `R*` | `CRU*‡` | Infrastructure health, integrations, monitoring, backups, disaster recovery, AI services, sessions, and account recovery; no RBAC governance |
| Facilities Manager | `CRUD†` | `CRU*†` | `R*` | `R*` | Facilities leadership, rooms, assets, maintenance, reservations, inventory, and operational approvals |
| Facilities Officer | `CRU` | `CRU*` | `CR*` | `CR*` | Day-to-day room, reservation, facility-document, visitor, and operational request processing |
| Compliance Manager | `R*` | `CRU*†` | `CRUD†` | `R*‡` | Compliance program supervision, management sign-offs, incident escalation, and compliance oversight |
| Compliance Officer | `R*` | `CRU*` | `CRU` | `R*‡` | Regulatory evidence, permits, vendor controls, compliance incidents, alerts, and submissions for review |
| Data Protection Officer (DPO) | `R*` | `CRU*` | `CRU*†` | `R*‡` | Independent privacy governance, privacy requests, privacy incidents, masking/reveal audits, and privacy retention controls |
| Legal Counsel | `R*` | `CRU*†` | `R*` | `R*‡` | Legal authorization, counsel review, legal holds, settlement and risk review, and final legal approval |
| Legal Officer | `R*` | `CRU*` | `CRU*` | `R*‡` | Legal case, notice, contract, clause, and legal-document preparation for counsel review |
| Records Officer | `R*` | `CRUD*†` | `CRU*†` | `R*‡` | Records ingestion, metadata, custody, archiving, retention scheduling, and controlled disposal preparation |
| Security Officer | `CRU*` | `R*` | `R*` | `CRUD*‡` | Physical-security incidents, access and visitor risk, hub monitoring, emergency response, and security resolution |

### 3.2.3 Role Responsibilities and Boundaries

The Super Admin is assigned to the governance plane. This role manages the permission catalogue, role assignments, hierarchy, SoD conflict rules, and executive oversight. The role may inspect information for governance purposes, but routine business transactions remain assigned to the operational roles. Any oversight or impersonation function must be explicitly authorized, time-limited, read-only by default, and recorded in the audit log.

The System Admin is assigned to the infrastructure plane. This role operates platform health, integrations, AI configuration, backups, disaster recovery, sessions, notifications, and account lockout recovery. System Admin access does not include role assignment, permission administration, SoD modification, legal approval, privacy approval, or alteration of immutable audit evidence.

The Facilities Manager is responsible for operational leadership over facilities, rooms, maintenance, inventory, and reservations. The Facilities Officer performs day-to-day operational processing and prepares requests. The manager may approve an officer's work, but the maker-checker constraint prevents approval of a request created or materially changed by the manager.

The Compliance Manager supervises the compliance program and management sign-offs, while the Compliance Officer prepares regulatory evidence, monitors permits, manages alerts, and submits compliance work. The person who prepares a controlled compliance item must not be its final approver.

The DPO maintains independent privacy governance. The role may access privacy-relevant information from facilities, documents, compliance, and security modules, but access remains purpose-limited. Privacy reveals, sensitive-data exceptions, and related disclosures require a documented purpose, restricted scope, audit record, and, where applicable, independent approval.

The Legal Officer prepares legal cases, notices, contracts, clauses, and legal documents. Legal Counsel provides independent legal review, authorizes legal holds, and performs final counsel actions. Legal Counsel must not be the sole author and approver of a high-risk legal or contract decision.

The Records Officer manages record ingestion, metadata quality, custody, archive state, retention, and disposal preparation. The controlled-delete permission represents a lifecycle process rather than unrestricted deletion. Legal holds, investigations, privacy holds, and unresolved compliance matters suspend disposal.

The Security Officer manages physical and operational security matters, including incidents, alerts, access risk, and emergency response. Security and audit evidence is append-only or system-controlled. The Security Officer cannot administer RBAC or erase evidence to close an incident.

## 3.3 Role Hierarchy

### 3.3.1 Hierarchical RBAC Structure

The role hierarchy separates governance, infrastructure, and business operations. A senior role inherits only the capabilities of an explicitly related junior role. Seniority does not automatically grant all permissions in the system and does not override constraints established by SoD, data scope, workflow state, or legal hold.

**Figure 3.1. Proposed RBAC3 role hierarchy**

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

The structure provides vertical inheritance for operational supervision while keeping specialist roles independent. Facilities Manager inherits appropriate Facilities Officer capabilities, Compliance Manager inherits appropriate Compliance Officer capabilities, and Legal Counsel inherits appropriate Legal Officer capabilities. Super Admin and System Admin remain separate planes because governance authority and infrastructure authority create different control risks.

### 3.3.2 Inheritance Rules

**Table 3.3. Role hierarchy and inherited capabilities**

| Senior role | Junior role | Inherited capability | Capabilities not inherited |
| --- | --- | --- | --- |
| Facilities Manager | Facilities Officer | Room, reservation, maintenance, facility-document, and operational facility capabilities | Approval of the manager's own request; unrestricted security or RBAC administration |
| Compliance Manager | Compliance Officer | Compliance evidence, alerts, permits, and incident-management capabilities | Approval of the manager's own submission; DPO privacy independence |
| Legal Counsel | Legal Officer | Legal case, notice, document, contract-review, and clause-management capabilities | Automatic approval of counsel-authored work; RBAC administration |
| Super Admin | None | Governance-plane administration, RBAC3 policy, and oversight controls | Automatic CRUD over business modules; System Admin infrastructure privileges unless separately approved |
| System Admin | None | Infrastructure-plane operations and system continuity | RBAC administration, role assignment, SoD editing, legal approval, privacy approval, and business-record ownership |
| DPO | None | Privacy-specific permissions only | General security-operations control and unrestricted compliance-manager authority |
| Records Officer | None | Records lifecycle and custody permissions only | Legal approval, privacy decisions, and unrestricted destruction authority |
| Security Officer | None | Physical and operational security permissions only | Information-security governance, RBAC administration, and immutable-log deletion |

The hierarchy is governed by the following conditions:

1. A role cannot inherit from itself, and hierarchy relationships must be acyclic.
2. A senior role cannot override a strict SoD conflict.
3. Inherited permissions remain subject to department scope, record scope, workflow state, legal hold, and approval requirements.
4. A user's effective permissions are calculated only after active SoD conflicts have been evaluated.
5. Removal of a senior role immediately removes its inherited permissions from the affected user.
6. Changes to role permissions or hierarchy relationships require Super Admin authorization and an immutable administrative audit entry.
7. System Admin must not receive `RBAC_ADMINISTER` as part of ordinary infrastructure access.

## 3.4 Separation of Duties Controls

Separation of Duties is implemented as a constrained-RBAC mechanism. Its purpose is to prevent one individual from controlling incompatible stages of a sensitive process, such as preparation and approval, access administration and evidence custody, or privacy evaluation and operational data collection. The conflicts in Table 3.4 apply to normal production accounts. A temporary exception requires documented justification, named approvers, an expiry date, compensating controls, and an audit record.

**Table 3.4. Role-level SoD conflict rules**

| Rule | Prohibited role combination | Academic rationale | Required system control |
| --- | --- | --- | --- |
| SOD-001 | Super Admin and System Admin | Combining RBAC governance with infrastructure operations would allow one person to grant access and operate or conceal the technical evidence of that access. | Require separate production users. Break-glass access requires dual approval and post-event review. |
| SOD-002 | DPO and Security Officer | The DPO independently evaluates privacy impact and disclosure, whereas the Security Officer operates visitor screening, access risk, and security response. Combining them permits self-approval of privacy justifications for collected security data. | Maintain independent role holders. Security operations cannot approve their own privacy exception or CCTV/data reveal. |
| SOD-003 | Legal Counsel and Records Officer | Legal Counsel determines legal holds and preservation requirements, while Records Officer controls custody and disposal. Combining them could permit self-authorized disposal of held evidence. | Separate hold authorization from records execution; require independent authorization before disposal. |
| SOD-004 | Legal Counsel and Legal Officer | The Legal Officer prepares legal work and Legal Counsel performs independent review. Combining the roles eliminates the maker-checker control for legal decisions. | The preparer cannot provide final counsel approval for the same high-risk matter. |
| SOD-005 | Compliance Manager and Compliance Officer | The Compliance Officer prepares evidence and the Compliance Manager reviews and signs off. Combining the roles allows self-approval of a compliance conclusion. | Require separate preparer and approver for sign-offs, incident closure, permit exceptions, and disposal decisions. |
| SOD-006 | DPO and Compliance Manager | The DPO must independently assess privacy compliance while the Compliance Manager owns program supervision and management sign-offs. | The person owning the compliance program cannot finally approve their own privacy finding. |
| SOD-007 | Records Officer and Compliance Officer | The Compliance Officer may prepare evidence or disposal requests while the Records Officer executes custody and lifecycle actions. | Require separate requestor and records custodian for disposal, retention overrides, and hold release. |
| SOD-008 | Security Officer and System Admin | Combining operational incident ownership with platform administration permits one person to alter the technical evidence or access state used in an investigation. | Separate incident ownership and technical platform operation for high- and critical-severity incidents. |
| SOD-009 | Super Admin and Records Officer | Combining RBAC governance with record disposal could allow a user to change access policy and dispose of evidence under one identity. | Super Admin may review records but cannot execute routine disposal or custody actions. |
| SOD-010 | Facilities Manager and Facilities Officer for the same transaction | The officer prepares or performs an operational action and the manager approves it. One person cannot be both requestor and final approver. | Enforce transaction-level maker-checker validation even under an approved multi-role exception. |

### 3.4.1 Transaction-Level Constraints

Role-level conflict detection is supplemented by transaction-level controls. The system shall prevent a user from approving, rejecting, closing, or signing off a record that the same user created or materially edited. The system shall also prevent the same user from releasing a legal hold and executing disposal of the related record, revealing masked privacy data and approving the justification for that reveal, or creating a high-severity security alert and resolving it without independent review.

Role assignment itself is subject to SoD. A user cannot assign a role, permission, hierarchy relationship, or SoD exception to the user's own account. Emergency overrides must be time-limited, reason-coded, fully audited, and subject to independent post-event review.

### 3.4.2 SoD Evaluation Procedure

The authorization service evaluates a role change using the following sequence:

1. Normalize the proposed and existing role names and remove duplicates.
2. Load all active roles assigned to the target user.
3. Add the proposed role to the candidate assignment set.
4. Compare the candidate set with every active SoD conflict pair.
5. Reject the assignment when a strict conflict is identified.
6. Resolve permitted hierarchy relationships and calculate effective permissions.
7. Apply department scope, record scope, workflow-state, legal-hold, and approval constraints.
8. Record the assignment result and reason in the immutable administrative audit log.

This procedure must be applied consistently to direct API calls, administrative screens, imports, seed scripts, and background provisioning. Frontend validation alone is insufficient because it can be bypassed by a direct request to the backend.

## 3.5 Document Retention Methodology

The system uses a lifecycle-based retention methodology. Under this approach, a record is assigned a classification, a responsible owner, a lifecycle trigger, a retention period, and a disposal action. The retention clock begins at the event identified in the schedule rather than automatically beginning when a file is uploaded. This distinction is important because a contract, permit, visitor record, or investigation record may remain active after its initial creation date.

The schedule is based on the principle of storage limitation: information is retained only for a documented operational, legal, regulatory, security, or evidentiary purpose. Where two retention requirements apply to the same record, the longer period is used. The schedule is an operational baseline and must be reviewed by the Data Protection Officer and Legal Counsel against applicable Philippine privacy, labor, tax, transport, records-management, and evidentiary requirements before production enforcement.

### 3.5.1 Retention Schedule

**Table 3.5. TNVS document retention schedule**

| Record classification | Minimum retention period | Lifecycle trigger | Disposal method | Responsible role |
| --- | --- | --- | --- | --- |
| Visitor logs | Ninety days after visitor departure or visit closure | Visit closed or departure recorded | Anonymize operational fields and securely delete unnecessary identity artifacts | Facilities Manager or Facilities Officer |
| Visitor verification and temporary identification data | Thirty days after visit closure | Visit closed or departure recorded | Securely delete scanned IDs, photographs, and temporary verification materials | Security Officer |
| Executed contracts | Contract end, termination, or supersession plus seven years | Contract lifecycle ends | Secure archive followed by approved destruction | Legal Counsel or Legal Officer |
| Contract drafts and negotiation records | Three years after execution, rejection, or abandonment | Legal matter is closed | Secure deletion unless linked to a dispute, legal advice, or legal hold | Legal Counsel or Legal Officer |
| LTFRB permits and related approvals | Permit validity period plus five years after expiry, replacement, or cancellation | Permit expires, is replaced, or is cancelled | Secure archive followed by approved destruction | Compliance Manager or Compliance Officer |
| Routine CCTV footage | Thirty days from capture | Capture timestamp | Permanent deletion and storage reclamation | Security Officer or Facilities Manager |
| Exported CCTV evidence | Case closure plus one year | Security incident or case is closed | Secure deletion after chain-of-custody and hold verification | Security Officer with an independent approver |
| Rejected or withdrawn driver onboarding documents | One year after rejection or withdrawal | Onboarding case is closed | Permanent deletion unless a legal, fraud, or investigation hold applies | Compliance Officer or Records Officer |
| Resigned employee labor records | Three years after separation | Employment relationship ends | Permanent deletion unless another mandatory period applies | System Admin or Records Officer |

The retention periods in Table 3.5 represent minimum operational periods. They do not authorize disposal when a longer statutory, contractual, regulatory, evidentiary, or litigation requirement applies. Similarly, a record may not be disposed of merely because its minimum period has elapsed if the record remains necessary for an active business process or authorized investigation.

### 3.5.2 Retention States and Lifecycle Controls

The system models the lifecycle of a record through the following controls:

1. **Creation and classification.** A record is assigned a record class, owner, trigger event, retention policy, and initial expiry date. A replacement upload does not erase the superseded version before its scheduled expiry.
2. **Active use.** A record remains active while it supports operations, audits, contracts, permits, cases, or data-subject requests. Access is limited according to role and record scope.
3. **Hold placement.** Legal Counsel, the DPO, Compliance Manager, Security Officer, or an authorized investigator may place a hold with a reason, scope, and review date. The hold changes the record to an on-hold state and prevents automated disposal.
4. **Hold release.** The hold owner or an authorized successor releases the hold after documenting the matter's status. The original lifecycle trigger is retained, and the expiry date is recalculated rather than backdated.
5. **Disposal review.** The Records Officer prepares the due-for-disposal queue. The relevant business owner confirms that the record is no longer needed, and an independent authorized approver verifies that no hold or exception applies.
6. **Disposal execution.** The system records the authorizer, executor, timestamp, disposal method, affected record identifiers or count, and completion status. A failed disposal remains visible for retry or escalation.
7. **Anonymization.** Anonymization removes or irreversibly transforms direct and reasonably linkable identifiers. A record is not considered anonymized if an accessible lookup table can be used to re-identify an individual.
8. **Exports and backups.** Disposal from the primary system does not authorize indefinite retention in exports, personal storage, email attachments, or backups. Restoration procedures must reapply retention metadata and active holds.

### 3.5.3 Retention Exceptions and Accountability

A shorter retention period may be approved only in writing by the DPO and Legal Counsel and only when no law, regulator, contract, investigation, or legal hold requires a longer period. Each exception must identify the affected record class, the reason, the approver, the revised expiry date, and the review date. This requirement provides an auditable explanation for departures from the standard schedule.

The Records Officer administers the retention queue, but does not possess unrestricted disposal authority. The business owner confirms operational necessity, while an independent approver verifies the absence of a hold or exception. A person who placed a record under legal hold or materially altered it for an investigation cannot approve its disposal.

## 3.6 Security and Governance Verification

The proposed design is considered methodologically complete only when the authorization and retention controls are verified at the server and database layers. The following verification activities are therefore included in the system methodology:

| Verification area | Expected result |
| --- | --- |
| Role assignment | A proposed role is rejected when it creates an active SoD conflict, and the rejection reason is audited |
| Hierarchy | Inherited permissions are calculated without hierarchy cycles, and removing a senior role removes inherited capabilities |
| Transaction approval | A user cannot approve a record that the same user created or materially edited |
| Privacy and security | DPO privacy decisions remain independent from operational security actions, and security evidence cannot be erased by its owner |
| Retention hold | An active legal, privacy, investigation, or regulatory hold blocks automated and manual disposal |
| Disposal audit | Completed disposal records contain the responsible actors, timestamps, method, scope, and completion status |
| Direct API enforcement | Requests that bypass the frontend receive the same authorization result as role-based interface actions |
| Schedule calculation | Expiry dates are calculated from lifecycle triggers and use the longer period when schedules overlap |

These verification activities support both functional validation and governance accountability. In particular, they demonstrate that the system's security controls are not dependent solely on visible navigation and that its records-management controls are not dependent solely on manual staff action.

## 3.7 Chapter Summary

This methodology defines how TNVS converts organizational responsibilities into a structured authorization and records-governance model. The role matrix assigns scoped CRUD capabilities to each role, the hierarchy enables controlled inheritance, and the SoD rules prevent incompatible duties from being combined. The retention schedule establishes lifecycle triggers, minimum periods, responsible owners, and disposal methods for major records. Together, these controls support least privilege, independent review, auditability, and defensible records management within the proposed system.
