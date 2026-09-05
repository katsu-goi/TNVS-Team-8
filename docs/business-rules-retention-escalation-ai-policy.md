# TNVS Business Rules: Retention, Compliance Escalation, and AI Use

**System:** TNVS Facilities and Administrative Management System
**Document owner:** Corporate Compliance and Data Privacy Officer
**Status:** Draft for capstone and stakeholder review
**Effective date:** Upon approval by management, legal counsel, and the DPO
**Review cycle:** At least annually and whenever law, regulator guidance, or system processing changes

> This is an internal business-rules baseline, not legal advice. The DPO and Legal Counsel must validate the final retention periods against applicable Philippine privacy, labor, tax, transport, records-management, and evidentiary requirements before production enforcement.

## 1. Policy Principles

1. Retain information only for a documented business, legal, regulatory, security, or evidentiary purpose.
2. The retention clock starts from the lifecycle event defined in the schedule, not automatically from upload date.
3. A legal hold, investigation, regulatory request, privacy incident, unresolved data-subject request, or active dispute suspends normal disposal.
4. Disposal must be authorized, auditable, irreversible for the approved data class, and completed using the approved method.
5. The Records Officer administers the retention queue. The relevant business owner confirms that the record is no longer needed. No person may approve disposal of a record they placed under legal hold or materially altered for an investigation.
6. Retention metadata must include the record class, trigger date, scheduled disposal date, hold status, owner, disposal method, authorizer, and completion timestamp.

## 2. Document Retention Schedule

### 2.1 Approved schedule

| Record class | Minimum retention | Retention trigger | Disposal action | Primary owner | Required controls |
| --- | --- | --- | --- | --- | --- |
| Visitor logs | 90 days after the visitor's departure or visit closure | Visit closed/departure recorded | Anonymize operational log fields; securely delete unnecessary identity artifacts | Facilities Manager / Facilities Officer | Access restricted to facilities and security; preserve incident-linked visits |
| Visitor verification and temporary ID data | 30 days after visit closure | Visit closed/departure recorded | Secure deletion of scanned IDs, photos, and temporary verification material | Security Officer | Do not retain a copy in local devices or uncontrolled exports |
| Executed contracts | Contract end, termination, or supersession plus 7 years | Lifecycle end event | Secure archive, then approved destruction | Legal Counsel / Legal Officer | Legal hold and dispute check; preserve signed version and audit trail |
| Contract drafts and negotiation records | 3 years after execution, rejection, or abandonment | Matter closed | Secure deletion unless linked to a dispute, advice, or legal hold | Legal Counsel / Legal Officer | Privileged material remains access-controlled; retain final decision record |
| LTFRB permits and related approvals | Permit validity period plus 5 years after expiry, replacement, or cancellation | Expiry, replacement, or cancellation | Secure archive, then approved destruction | Compliance Manager / Compliance Officer | Keep renewal evidence and regulator correspondence with the permit |
| CCTV footage, routine | 30 days from capture | Capture timestamp | Permanent deletion and storage reclamation | Security Officer / Facilities Manager | Shorter period may apply where configured; preserve incident footage before expiry |
| CCTV exported evidence | Case closure plus 1 year | Incident/case closed | Secure deletion after chain-of-custody and hold check | Security Officer with independent approver | Dual authorization, immutable custody log, export hash, and access audit |
| Driver onboarding documents rejected or withdrawn | 1 year after rejection or withdrawal | Onboarding case closed | Permanent deletion unless legal, fraud, or investigation hold applies | Compliance Officer / Records Officer | Restrict sensitive identity and eligibility data |
| Resigned employee labor records | 3 years after separation | Employment separation | Permanent deletion unless another mandatory period applies | System Admin / Records Officer | Validate applicable labor, tax, and litigation requirements first |

### 2.2 Lifecycle and disposal rules

- **Record creation:** The system assigns a record class and calculates the initial retention expiry from the applicable trigger. Uploading a replacement does not erase the superseded version before its schedule expires.
- **Active use:** A record remains `ACTIVE` while it is needed for operations, audit, a contract, a permit, a case, or a request. Access follows least privilege and role scope.
- **Hold placement:** Legal Counsel, DPO, Compliance Manager, Security Officer, or an authorized investigator may place a hold with a reason, scope, and review date. The hold must set the disposal status to `ON_HOLD` and prevent automated disposal.
- **Hold release:** Only the hold owner or an authorized successor may release it after documenting the matter status. Release does not backdate the retention clock; the system recalculates from the original lifecycle trigger.
- **Disposal review:** The Records Officer prepares the due-for-disposal queue. The business owner confirms no operational need, and an independent authorized approver confirms no hold or exception.
- **Disposal execution:** The system records who authorized and completed disposal, when it occurred, what method was used, and the affected record count or identifiers. Disposal failures remain visible and are retried or escalated; they are never silently marked complete.
- **Anonymization:** Anonymization must remove or irreversibly transform direct and reasonably linkable identifiers. A record is not considered anonymized if staff can re-identify a person using an accessible lookup table.
- **Backups and exports:** Disposal from the primary system does not authorize retention in exports, personal drives, email attachments, or backups beyond the documented backup lifecycle. Restoration jobs must reapply holds and retention metadata.

### 2.3 Exceptions

The longer period applies when schedules overlap. A shorter period may be used only when approved in writing by the DPO and Legal Counsel and when no law, regulator, contract, investigation, or hold requires longer retention. Any exception must record the reason, approver, affected class, revised expiry, and review date.

## 3. Compliance Escalation Rules

### 3.1 Permit status thresholds

The compliance service evaluates each permit daily using calendar days until `expiration_date` and refreshes its status. Status is operational, not a substitute for the underlying permit or regulator decision.

| Days until expiry | System status | Required action | Notification and ownership |
| --- | --- | --- | --- |
| More than 90 days | `ACTIVE` | Maintain the permit record and renewal evidence; no escalation | Compliance Officer monitors; Compliance Manager owns portfolio visibility |
| 31-90 days | `WATCH` | Confirm renewal owner, required documents, fees, and target submission date | Notify Compliance Officer and Compliance Manager at status entry; weekly dashboard visibility |
| 8-30 days | `CRITICAL` | Open a renewal task, complete document checklist, obtain management attention, and record a recovery plan | Immediate in-app notification; email Compliance Manager, department head, and permit owner; daily monitoring |
| 1-7 days | `URGENT` | Escalate to executive management, submit or finalize renewal immediately, and document a service-continuity contingency | Immediate notification to Compliance Manager, department head, System Admin, and affected operational owner; daily or more frequent review |
| 0 days | `EXPIRED` | Block the permit from being treated as valid; open an incident and stop affected activity unless a documented lawful exception exists | Immediate critical alert to Compliance Manager, department head, Legal Counsel, System Admin, and affected facility owner |
| Less than 0 days | `EXPIRED` | Continue incident handling, verify suspension or remediation, and record regulator contact and corrective action | Critical escalation remains open until renewed, replaced, formally closed, or risk accepted by authorized management and Legal Counsel |

If the application supports only `ACTIVE`, `WATCH`, `CRITICAL`, `EXPIRED`, and `RENEWED`, the 1-7 day `URGENT` condition must be represented by `CRITICAL` plus an `urgent_escalation` flag or equivalent task priority. It must not be silently treated as ordinary `CRITICAL`.

### 3.2 Notification and acknowledgement rules

1. A notification is created when a permit enters a new threshold, not repeatedly on every refresh unless the acknowledgement SLA has elapsed.
2. The owner must acknowledge `WATCH` within 2 business days, `CRITICAL` within 1 business day, and `URGENT` or `EXPIRED` within 4 hours.
3. An unacknowledged alert escalates to the Compliance Manager at the end of the acknowledgement window. A further missed response escalates to the department head and System Admin.
4. The Compliance Manager records the renewal decision: submitted, renewed, replacement pending, exception approved, or incident opened. A note alone is not closure evidence.
5. A permit may be marked `RENEWED` only after the replacement permit or official evidence is attached, independently checked, and linked to the superseded permit.
6. A permit nearing expiry while a renewal is pending remains subject to the threshold rules. Pending renewal does not equal valid authorization.
7. Every status change, notification, acknowledgement, escalation, attachment, and override is immutable in the audit log.

### 3.3 Other compliance triggers

- **Privacy incident:** The DPO opens an incident record, preserves evidence, limits access, performs impact assessment, and coordinates notification decisions with Legal Counsel and management under the applicable response deadline.
- **Regulatory request:** Compliance and Legal Counsel place a hold on relevant records, assign a response owner, record the due date, and approve the final response before release.
- **Unresolved data-subject request:** The DPO tracks the request to its statutory or policy deadline. Records cannot be disposed of if they are needed to answer or defend the request.
- **Critical security event:** The Security Officer contains the event and preserves evidence. Legal Counsel and the DPO are notified where personal data, privilege, or regulatory reporting may be involved.

## 4. AI Policy

### 4.1 Purpose and scope

This policy governs every AI feature, provider, model, prompt, retrieval operation, generated output, and AI-assisted workflow connected to TNVS. It applies to employees, contractors, administrators, and service providers using the system or exporting TNVS data to an AI service.

### 4.2 Data classification before AI processing

| Classification | Examples | AI handling rule |
| --- | --- | --- |
| Public or low-risk operational | Anonymized counts, room availability, non-personal schedules | May be processed by an approved provider for an approved module |
| Internal business data | Aggregated facility metrics, non-sensitive workflow metadata, redacted documents | Allowed with access control, provider approval, and audit logging |
| Personal data | Driver names, contact details, license or permit numbers, visitor logs, employee records | Minimize and redact first; process only for a documented purpose with authorized access and approved provider |
| Sensitive personal data | Government IDs, biometrics, health information, disciplinary details, identity verification, security footage | Do not send raw data to external AI. On-platform or approved private processing requires DPO approval, strict minimization, and human review |
| Restricted legal and security data | Privileged legal advice, litigation strategy, investigation evidence, credentials, secrets, vulnerability details, raw CCTV | Prohibited for external AI. Use only an approved isolated environment when specifically authorized by Legal Counsel, DPO, and the Security Officer |

### 4.3 Permitted AI uses

AI may assist with the following when the user is authorized for the underlying data:

- Classifying and extracting fields from redacted documents, permits, and records.
- Summarizing operational records, compliance evidence, or contracts after sensitive content is minimized.
- Suggesting risk indicators, missing fields, duplicate records, or renewal priorities for human review.
- Searching and answering questions over approved, access-filtered TNVS data without expanding the user's permissions.
- Drafting workflow notices, checklists, non-final reports, and response templates.
- Producing aggregate dashboards and trend analysis that do not expose unnecessary individual-level details.

### 4.4 Prohibited or restricted AI uses

AI must not:

1. Make or finalize a decision to approve, reject, suspend, discipline, hire, terminate, or deny a driver, visitor, employee, vendor, permit, contract, legal matter, or access request.
2. Determine guilt, fraud, legal liability, regulatory liability, or disciplinary outcome without qualified human investigation and approval.
3. Generate or infer sensitive traits, health conditions, biometrics, criminal propensity, protected characteristics, or risk scores about a person unless a separately approved lawful purpose and assessment exists.
4. Process raw government IDs, facial images, biometric templates, health data, privileged legal advice, litigation strategy, credentials, API keys, or vulnerability details through an unapproved external provider.
5. Use one person's data to answer another user's question when the user's RBAC scope does not authorize that data.
6. Circumvent legal holds, retention schedules, access controls, SoD rules, audit logging, or approval workflows.
7. Train a provider's general model on TNVS data unless an explicit written agreement, DPO assessment, security approval, and management authorization permit it.
8. Delete, alter, disclose, or publish source records based solely on generated output.

### 4.5 Human review and accountability

- AI output is advisory and must display that it requires human verification where it affects a person, legal matter, compliance status, security event, or retention decision.
- The authorized human decision-maker remains accountable for the final action and must record the evidence and reasoning used.
- High-impact actions require review by the responsible role and, where applicable, a second independent approver under SoD. AI cannot serve as the independent approver.
- Prompts, model/provider, relevant data classification, user, timestamp, output, corrections, and final disposition are logged subject to the applicable retention schedule.
- Users must report materially incorrect, biased, unsafe, leaked, or unauthorized output to the System Admin, Security Officer, and DPO. The provider or feature may be disabled while the incident is investigated.

### 4.6 AI incident response

If restricted data is sent to an unauthorized provider, or an output exposes or materially misuses personal or privileged data:

1. Stop the affected integration, preserve logs, prompts, outputs, and provider-response evidence.
2. Notify the Security Officer, DPO, Legal Counsel, and System Admin immediately.
3. Assess scope, recipients, provider retention/training behavior, affected data subjects, and containment options.
4. Rotate exposed credentials and request provider deletion or isolation where contractually and technically possible.
5. Document corrective action, notification decisions, and whether the AI feature can be safely re-enabled.

## 5. Implementation Alignment and Gaps

The current schema already provides useful foundations: `retention_policies`, archive expiry metadata, legal-workflow immutability, privacy-reveal auditing, CCTV export custody and dual approval, permit statuses, and daily permit-status refresh logic. The AI edge function also has role protection and provider/module configuration controls.

Before production approval, the implementation must additionally verify:

- The visitor, contract, LTFRB, CCTV, driver-document, and employee-record schedules above are represented as versioned policies, not only seed values.
- Retention expiry is calculated from lifecycle events and is blocked by legal holds, investigations, unresolved requests, and regulatory matters.
- `URGENT` handling for the 1-7 day permit window is visible and cannot be confused with ordinary `CRITICAL`.
- Disposal uses dual control where required, writes an immutable audit event, covers exports and backups, and can prove completion.
- AI requests enforce field-level redaction and provider allowlists before data leaves the approved environment; prompts and outputs are auditable without retaining prohibited raw content.
- Human approval and SoD checks are enforced server-side, including for AI-assisted decisions, permit overrides, legal workflows, privacy reveals, and disposal.
- Automated tests cover threshold transitions, hold blocking, anonymization, permanent deletion, unauthorized AI data access, provider restrictions, and audit-log integrity.

**Approval record:** Record approver name, role, decision, date, policy version, and required exceptions in the system's governance register before enabling enforcement.
