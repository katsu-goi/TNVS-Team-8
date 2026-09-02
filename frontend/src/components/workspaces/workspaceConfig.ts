import {
  Activity, Archive, BadgeCheck, BarChart3, Building2, Camera, ClipboardCheck,
  Database, FileCheck2, FileSearch, FileText, Fingerprint, Gavel, HardDrive,
  KeyRound, LayoutDashboard, LockKeyhole, Scale, Settings,
  ShieldAlert, ShieldCheck, Siren, Trash2, UserCheck, UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type WorkspaceNavItem = {
  section: string;
  label: string;
  icon: LucideIcon;
  group?: string;
};

export type WorkspaceConfig = {
  role: string;
  slug: string;
  portalLabel: string;
  headerLabel: string;
  description: string;
  nav: WorkspaceNavItem[];
};

export const workspaceConfigs: WorkspaceConfig[] = [
  {
    role: 'COMPLIANCE_MANAGER',
    slug: 'compliance-management',
    portalLabel: 'Compliance Management',
    headerLabel: 'Compliance Manager',
    description: 'Executive regulatory oversight, management authorization, and subordinate supervision.',
    nav: [
      { section: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
      { section: 'team-supervision', label: 'Team Supervision', icon: UsersRound },
      { section: 'signoffs', label: 'Management Sign-offs', icon: BadgeCheck },
      { section: 'incidents', label: 'Incident Escalation', icon: Siren },
      { section: 'settings', label: 'Governance Settings', icon: Settings },
    ],
  },
  {
    role: 'DATA_PROTECTION_OFFICER',
    slug: 'privacy',
    portalLabel: 'Data Protection',
    headerLabel: 'Data Protection Officer',
    description: 'Independent privacy governance, data-subject rights, and facility privacy controls.',
    nav: [
      { section: 'dashboard', label: 'Privacy Dashboard', icon: LayoutDashboard },
      { section: 'governance', label: 'Data Governance (RoPA)', icon: Database, group: 'Data Governance' },
      { section: 'inventory', label: 'Data Inventory & Mapping', icon: FileSearch },
      { section: 'retention', label: 'Data Retention Policies', icon: Archive },
      { section: 'cctv', label: 'CCTV & Surveillance Logs', icon: Camera, group: 'Physical & Facility Privacy' },
      { section: 'visitors', label: 'Hub Visitor Log Masking', icon: UserCheck },
      { section: 'biometrics', label: 'Biometric Access Audits', icon: Fingerprint },
      { section: 'decommissioning', label: 'Device Decommissioning', icon: HardDrive, group: 'Asset & Document Disposal' },
      { section: 'shredding', label: 'Physical Shredding Logs', icon: Trash2 },
      { section: 'dsr', label: 'Data Subject Requests', icon: ClipboardCheck, group: 'Incident & Rights Management' },
      { section: 'breaches', label: 'Privacy Breach Console', icon: ShieldAlert },
      { section: 'settings', label: 'Privacy Settings', icon: Settings },
    ],
  },
  {
    role: 'LEGAL_COUNSEL',
    slug: 'legal-counsel',
    portalLabel: 'Legal Counsel',
    headerLabel: 'Legal Counsel',
    description: 'Strategic legal authorization, regulatory oversight, and litigation risk management.',
    nav: [
      { section: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
      { section: 'approvals', label: 'Pending Approvals & Sign-offs', icon: FileCheck2 },
      { section: 'regulatory', label: 'Regulatory & LTFRB Oversight', icon: Building2 },
      { section: 'sod', label: 'Conflict & SoD Management', icon: ShieldCheck },
      { section: 'risk', label: 'Risk & Settlement Analytics', icon: BarChart3 },
    ],
  },
  {
    role: 'RECORDS_OFFICER',
    slug: 'records',
    portalLabel: 'Records Governance',
    headerLabel: 'Records Officer',
    description: 'Custody-controlled archives, metadata validation, retention, and defensible disposal.',
    nav: [
      { section: 'dashboard', label: 'Records Dashboard', icon: LayoutDashboard },
      { section: 'repositories', label: 'Active Records Repositories', icon: Archive },
      { section: 'ingestion', label: 'Document Ingestion Queue', icon: FileCheck2 },
      { section: 'custody', label: 'Chain of Custody Control', icon: KeyRound },
      { section: 'disposal', label: 'Lifecycle & Defensible Disposal', icon: Trash2 },
      { section: 'settings', label: 'Archival Settings', icon: Settings },
    ],
  },
  {
    role: 'DEPARTMENT_HEAD',
    slug: 'department',
    portalLabel: 'Department Leadership',
    headerLabel: 'Department Head',
    description: 'Department authority above compliance management for approvals, escalation, and operational reporting.',
    nav: [
      { section: 'dashboard', label: 'Department Dashboard', icon: LayoutDashboard },
      { section: 'approvals', label: 'Department Approvals', icon: ClipboardCheck },
      { section: 'supervision', label: 'Compliance Supervision', icon: UsersRound },
      { section: 'activity', label: 'Team Activity', icon: Activity },
      { section: 'reports', label: 'Operational Reports', icon: BarChart3 },
      { section: 'settings', label: 'Department Settings', icon: Settings },
    ],
  },
  {
    role: 'SECURITY_OFFICER',
    slug: 'security-operations',
    portalLabel: 'Security Operations',
    headerLabel: 'Security Officer',
    description: 'Physical security incidents, access risk, hub monitoring, and emergency response.',
    nav: [
      { section: 'dashboard', label: 'Security Dashboard', icon: LayoutDashboard },
      { section: 'incidents', label: 'Physical Security Incidents', icon: ShieldAlert },
      { section: 'access-risk', label: 'Access & Visitor Risk', icon: UserCheck },
      { section: 'monitoring', label: 'Patrol & Hub Monitoring', icon: Building2 },
      { section: 'emergency', label: 'Emergency Response', icon: Siren },
      { section: 'reports', label: 'Security Reports', icon: BarChart3 },
    ],
  },
  {
    role: 'INFOSEC_OFFICER',
    slug: 'information-security',
    portalLabel: 'Information Security',
    headerLabel: 'Information Security Officer',
    description: 'Technology controls, cyber incidents, vulnerabilities, and information-security risk.',
    nav: [
      { section: 'dashboard', label: 'InfoSec Dashboard', icon: LayoutDashboard },
      { section: 'controls', label: 'Security Control Health', icon: ShieldCheck },
      { section: 'risk', label: 'Technology Risk Register', icon: Scale },
      { section: 'cyber-incidents', label: 'Cyber Incidents', icon: Siren },
      { section: 'vulnerabilities', label: 'Vulnerability Management', icon: LockKeyhole },
      { section: 'access-reviews', label: 'Access Reviews', icon: KeyRound },
      { section: 'settings', label: 'InfoSec Settings', icon: Settings },
    ],
  },
  {
    role: 'COMPLIANCE_OFFICER',
    slug: 'compliance',
    portalLabel: 'Regulatory Compliance',
    headerLabel: 'Compliance Officer',
    description: 'TNVS franchise compliance, facility permits, vendor controls, and EHS corrective actions.',
    nav: [
      { section: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { section: 'franchise', label: 'Franchise & Regulatory Tracker', icon: Gavel },
      { section: 'permits', label: 'Facility Permitting Matrix', icon: Building2 },
      { section: 'contracts', label: 'Corporate Contracts & SLAs', icon: FileText },
      { section: 'incidents', label: 'Incident & Risk Management', icon: Siren },
      { section: 'settings', label: 'Profile & System Settings', icon: Settings },
    ],
  },
];

export const workspaceConfigByRole = new Map(workspaceConfigs.map((config) => [config.role, config]));
