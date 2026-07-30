import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, FileText, Archive, Scale, FileSignature,
  ChevronRight, AlertCircle, Clock, CheckCircle, XCircle, BookOpen,
} from 'lucide-react';
import type {
  FacilitiesKpi, VisitorKpi, DocumentKpi,
  RecordsKpi, LegalKpi, ContractKpi, GlobalKpi,
} from '../../types';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon: Icon, color, onClick, children }) => (
  <div className="card-stat p-4 text-left w-full cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group" onClick={onClick}>
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
        {label}
      </p>
      <div className="flex items-center space-x-1">
        <Icon className={`w-4 h-4 ${color || 'text-slate-400'} group-hover:scale-110 transition-transform`} />
        <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 -ml-0.5 transition-all" />
      </div>
    </div>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{sub}</p>}
    {children}
  </div>
);

interface ModuleSectionProps {
  title: string;
  icon: React.ElementType;
  color: string;
  cards: React.ReactNode;
  href: string;
}

const ModuleSection: React.FC<ModuleSectionProps> = ({ title, icon: Icon, color, cards, href }) => {
  const navigate = useNavigate();
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Icon className={`w-5 h-5 ${color}`} />
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        <button onClick={() => navigate(href)} className="text-[10px] text-emerald-600 hover:underline font-semibold flex items-center">
          View All <ChevronRight className="w-3 h-3 ml-0.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards}
      </div>
    </div>
  );
};

interface StatBadgeProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}

const StatBadge: React.FC<StatBadgeProps> = ({ label, value, icon: Icon, color }) => (
  <div className="flex items-center space-x-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
    <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-900">{value}</p>
      <p className="text-[9px] text-slate-500 truncate">{label}</p>
    </div>
  </div>
);

interface KpiCardSectionProps {
  facilities: FacilitiesKpi;
  visitors: VisitorKpi;
  documents: DocumentKpi;
  records: RecordsKpi;
  legal: LegalKpi;
  contracts: ContractKpi;
  global: GlobalKpi;
}

export const KpiCardSection: React.FC<KpiCardSectionProps> = ({
  facilities, visitors, documents, records, legal, contracts, global,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">

      <ModuleSection title="Facilities Reservation System" icon={Building2} color="text-blue-600" href="/admin/facilities">
        <KpiCard label="Total Facilities" value={facilities.totalFacilities} icon={Building2} color="text-blue-500" sub={`${facilities.activeRooms} active rooms`} onClick={() => navigate('/admin/facilities')} />
        <KpiCard label="Bookings Today" value={facilities.bookingsToday} icon={Clock} color="text-sky-500" sub="Reservations for today" onClick={() => navigate('/admin/facilities')} />
        <KpiCard label="Pending Approvals" value={facilities.pendingApprovals} icon={AlertCircle} color={facilities.pendingApprovals > 0 ? 'text-amber-500' : 'text-emerald-500'} sub="Awaiting approval" onClick={() => navigate('/admin/facilities')} />
        <KpiCard label="Checked In" value={facilities.checkedIn} icon={CheckCircle} color="text-emerald-500" sub="Currently occupied" onClick={() => navigate('/admin/facilities')} />
      </ModuleSection>

      <ModuleSection title="Visitor Management System" icon={Users} color="text-purple-600" href="/admin/visitors">
        <KpiCard label="Total Visitors" value={visitors.totalVisitors} icon={Users} color="text-purple-500" sub="All time" onClick={() => navigate('/admin/visitors')} />
        <KpiCard label="On-Site Now" value={visitors.onSite} icon={CheckCircle} color={visitors.onSite > 0 ? 'text-emerald-500' : 'text-slate-400'} sub="Currently in building" onClick={() => navigate('/admin/visitors')} />
        <KpiCard label="Registered" value={visitors.registered} icon={Clock} color="text-amber-500" sub="Expected arrivals" onClick={() => navigate('/admin/visitors')} />
        <KpiCard label="Checked Out" value={visitors.checkedOut} icon={XCircle} color="text-slate-500" sub="Departed" onClick={() => navigate('/admin/visitors')} />
      </ModuleSection>

      <ModuleSection title="Document Management (Archiving)" icon={FileText} color="text-cyan-600" href="/admin/documents">
        <KpiCard label="Total Documents" value={documents.totalDocuments} icon={FileText} color="text-cyan-500" sub="All documents" onClick={() => navigate('/admin/documents')} />
        <KpiCard label="Archived" value={documents.archived} icon={Archive} color="text-emerald-500" sub="Permanently stored" onClick={() => navigate('/admin/documents')} />
        <KpiCard label="Pending Review" value={documents.pendingReview} icon={AlertCircle} color={documents.pendingReview > 0 ? 'text-amber-500' : 'text-emerald-500'} sub="Awaiting approval" onClick={() => navigate('/admin/documents')} />
        <KpiCard label="Drafts" value={documents.draft} icon={FileText} color="text-slate-400" sub="In progress" onClick={() => navigate('/admin/documents')} />
      </ModuleSection>

      <ModuleSection title="Records Retention & Compliance" icon={Archive} color="text-teal-600" href="/admin/records">
        <KpiCard label="Retention Policies" value={records.totalPolicies} icon={BookOpen} color="text-teal-500" sub="Total policies" onClick={() => navigate('/admin/records')} />
        <KpiCard label="Active Policies" value={records.activePolicies} icon={CheckCircle} color="text-emerald-500" sub="Currently enforced" onClick={() => navigate('/admin/records')} />
      </ModuleSection>

      <ModuleSection title="Legal Management System" icon={Scale} color="text-rose-600" href="/admin/legal">
        <KpiCard label="Total Cases" value={legal.totalCases} icon={Scale} color="text-rose-500" sub="All matters" onClick={() => navigate('/admin/legal')} />
        <KpiCard label="Open" value={legal.open} icon={AlertCircle} color={legal.open > 0 ? 'text-rose-500' : 'text-emerald-500'} sub="Unresolved" onClick={() => navigate('/admin/legal')} />
        <KpiCard label="In Progress" value={legal.inProgress} icon={Clock} color="text-amber-500" sub="Active litigation" onClick={() => navigate('/admin/legal')} />
        <KpiCard label="Closed" value={legal.closed} icon={CheckCircle} color="text-emerald-500" sub="Resolved matters" onClick={() => navigate('/admin/legal')} />
      </ModuleSection>

      <ModuleSection title="Contract Management System" icon={FileSignature} color="text-indigo-600" href="/admin/contracts">
        <KpiCard label="Total Contracts" value={contracts.totalContracts} icon={FileSignature} color="text-indigo-500" sub="All contracts" onClick={() => navigate('/admin/contracts')} />
        <KpiCard label="Active" value={contracts.active} icon={CheckCircle} color="text-emerald-500" sub="In effect" onClick={() => navigate('/admin/contracts')} />
        <KpiCard label="Under Review" value={contracts.underReview} icon={Clock} color="text-amber-500" sub="Awaiting approval" onClick={() => navigate('/admin/contracts')} />
        <KpiCard label="Expiring" value={contracts.expired} icon={AlertCircle} color={contracts.expired > 0 ? 'text-rose-500' : 'text-emerald-500'} sub="Past end date" onClick={() => navigate('/admin/contracts')} />
      </ModuleSection>

      <div className="glass-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900">Global System Metrics</h3>
          </div>
          <button onClick={() => navigate('/security')} className="text-[10px] text-emerald-600 hover:underline font-semibold flex items-center">
            Security Center <ChevronRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatBadge label="Active Users" value={global.activeUsers} icon={Users} color="text-blue-500" />
          <StatBadge label="Active Sessions" value={global.activeSessions} icon={Users} color="text-emerald-500" />
          <StatBadge label="Failed Logins" value={global.failedLoginAttempts} icon={XCircle} color={global.failedLoginAttempts > 0 ? 'text-rose-500' : 'text-slate-400'} />
          <StatBadge label="Blocked IPs" value={global.blockedIps} icon={AlertCircle} color={global.blockedIps > 0 ? 'text-amber-500' : 'text-emerald-500'} />
          <StatBadge label="Active Alerts" value={global.activeAlerts} icon={AlertCircle} color={global.activeAlerts > 0 ? 'text-rose-500' : 'text-emerald-500'} />
          <StatBadge label="Unread Notifications" value={global.unreadNotifications} icon={AlertCircle} color={global.unreadNotifications > 0 ? 'text-amber-500' : 'text-slate-400'} />
        </div>
      </div>
    </div>
  );
};
