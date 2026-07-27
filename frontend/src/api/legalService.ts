import { supabase } from '../lib/supabaseClient';

export interface ApiLegalCase {
  id?: string;
  caseNumber?: string;
  title: string;
  courtName?: string;
  priority?: string;
  status?: string;
  filedDate?: string;
  nextHearingDate?: string;
  leadCounselor?: string;
}

export const legalService = {
  getAllCases: async (): Promise<ApiLegalCase[]> => {
    const { data, error } = await supabase.from('legal_cases').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching legal cases:', error);
      return [];
    }
    return (data || []).map(c => ({
      id: c.id,
      caseNumber: c.case_number,
      title: c.title,
      courtName: c.court_name,
      priority: c.priority,
      status: c.status,
      filedDate: c.filed_date,
      nextHearingDate: c.next_hearing_date,
      leadCounselor: c.lead_counselor,
    }));
  },

  createCase: async (legalCase: ApiLegalCase): Promise<ApiLegalCase> => {
    const caseNum = legalCase.caseNumber || `CASE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await supabase.from('legal_cases').insert([{
      case_number: caseNum,
      title: legalCase.title,
      court_name: legalCase.courtName,
      priority: legalCase.priority || 'MEDIUM',
      status: legalCase.status || 'OPEN',
      filed_date: legalCase.filedDate,
      next_hearing_date: legalCase.nextHearingDate,
      lead_counselor: legalCase.leadCounselor,
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      caseNumber: data.case_number,
      title: data.title,
      courtName: data.court_name,
      priority: data.priority,
      status: data.status,
      filedDate: data.filed_date,
      nextHearingDate: data.next_hearing_date,
      leadCounselor: data.lead_counselor,
    };
  },
};
