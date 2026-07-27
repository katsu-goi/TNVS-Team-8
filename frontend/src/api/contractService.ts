import { supabase } from '../lib/supabaseClient';

export interface ApiContract {
  id?: string;
  contractNumber?: string;
  title: string;
  type?: string;
  counterParty?: string;
  contractValue?: number;
  status?: string;
  aiAssessedRiskLevel?: string;
  aiRiskSummary?: string;
  startDate?: string;
  endDate?: string;
}

export interface ContractAnalysis {
  overallRisk: string;
  summary: string;
}

export const contractService = {
  getAllContracts: async (): Promise<ApiContract[]> => {
    const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching contracts:', error);
      return [];
    }
    return (data || []).map(c => ({
      id: c.id,
      contractNumber: c.contract_number,
      title: c.title,
      type: c.type,
      counterParty: c.counter_party,
      contractValue: c.contract_value ? Number(c.contract_value) : 0,
      status: c.status,
      aiAssessedRiskLevel: c.ai_assessed_risk_level,
      aiRiskSummary: c.ai_risk_summary,
      startDate: c.start_date,
      endDate: c.end_date,
    }));
  },

  createContract: async (contract: ApiContract): Promise<ApiContract> => {
    const num = contract.contractNumber || `CTR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const { data, error } = await supabase.from('contracts').insert([{
      contract_number: num,
      title: contract.title,
      type: contract.type,
      counter_party: contract.counterParty,
      contract_value: contract.contractValue,
      status: contract.status || 'ACTIVE',
      ai_assessed_risk_level: contract.aiAssessedRiskLevel,
      ai_risk_summary: contract.aiRiskSummary,
      start_date: contract.startDate,
      end_date: contract.endDate,
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      contractNumber: data.contract_number,
      title: data.title,
      type: data.type,
      counterParty: data.counter_party,
      contractValue: data.contract_value ? Number(data.contract_value) : 0,
      status: data.status,
      aiAssessedRiskLevel: data.ai_assessed_risk_level,
      aiRiskSummary: data.ai_risk_summary,
      startDate: data.start_date,
      endDate: data.end_date,
    };
  },

  analyzeContract: async (id: string): Promise<ContractAnalysis> => {
    const { data, error } = await supabase.from('contracts').select('*').eq('id', id).single();
    if (error || !data) {
      throw new Error(`Contract not found: ${id}`);
    }
    return {
      overallRisk: data.ai_assessed_risk_level || 'LOW',
      summary: data.ai_risk_summary || 'No AI analysis available for this contract.',
    };
  },
};
