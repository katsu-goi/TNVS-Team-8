import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const labelMap: Record<string, string> = {
 '': 'Dashboard',
 'facilities': 'Facilities & Rooms',
 'reservations': 'Reservation Governance',
 'rooms': 'Room Management',
 'maintenance': 'Maintenance Control',
 'equipment': 'Equipment Inventory',
 'calendar': 'Enterprise Calendar',
  'analytics': 'Analytics',
 'visitors': 'Visitor Pass & Security',
 'clearance': 'Security Clearance',
 'approval': 'Visitor Approval Queue',
 'logs': 'Visitor Logs',
 'documents': 'AI Document Management',
 'ai-classification': 'AI Classification',
 'ocr': 'OCR Processing',
 'archive': 'Archive',
 'legal': 'Legal & Disputes',
 'hearings': 'Hearings',
 'compliance': 'Compliance',
 'evidence': 'Evidence',
 'contracts': 'Contract Analytics AI',
 'risk-analysis': 'AI Risk Analysis',
 'renewals': 'Renewals',
 'obligations': 'Obligations',
 'security': 'Security Center',
 'rbac': 'RBAC',
 'events': 'Security Events',
 'monitoring': 'System Monitoring',
};

export const Breadcrumbs: React.FC = () => {
 const location = useLocation();
 const navigate = useNavigate();
 const segments = location.pathname.split('/').filter(Boolean);

 const crumbs = [{ label: 'Dashboard', path: '/' }];
 let accumulated = '';
 for (const seg of segments) {
 accumulated += '/' + seg;
 crumbs.push({
 label: labelMap[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
 path: accumulated,
 });
 }

 if (crumbs.length <= 1) return null;

 return (
 <nav className="flex items-center space-x-1.5 text-xs text-slate-500 mb-4" aria-label="Breadcrumb">
 <Home className="w-3.5 h-3.5 text-slate-500" />
 {crumbs.map((crumb, i) => (
 <React.Fragment key={crumb.path}>
 <ChevronRight className="w-3 h-3 text-slate-600" />
 {i === crumbs.length - 1 ? (
  <span className="text-emerald-600 font-semibold">{crumb.label}</span>
 ) : (
  <button onClick={() => navigate(crumb.path)} className="hover:text-emerald-600 transition-colors capitalize">
 {crumb.label}
 </button>
 )}
 </React.Fragment>
 ))}
 </nav>
 );
};
