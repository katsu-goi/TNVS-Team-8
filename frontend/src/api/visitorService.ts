import { supabase } from '../lib/supabaseClient';

export interface ApiVisitor {
  id?: string;
  fullName: string;
  email?: string;
  company?: string;
  phone?: string;
  purposeOfVisit: string;
  expectedArrival?: string;
  actualArrival?: string;
  actualDeparture?: string;
  hostEmployeeId?: string;
  status?: string;
  qrCodeToken?: string;
}

export const visitorService = {
  getAllVisitors: async (): Promise<ApiVisitor[]> => {
    const { data, error } = await supabase.from('visitors').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(v => ({
      id: v.id,
      fullName: v.full_name,
      email: v.email,
      company: v.company,
      phone: v.phone,
      purposeOfVisit: v.purpose_of_visit,
      expectedArrival: v.expected_arrival,
      actualArrival: v.actual_arrival,
      actualDeparture: v.actual_departure,
      hostEmployeeId: v.host_employee_id,
      status: v.status,
      qrCodeToken: v.qr_code_token,
    }));
  },

  registerVisitor: async (visitor: ApiVisitor): Promise<ApiVisitor> => {
    const { data, error } = await supabase.from('visitors').insert([{
      full_name: visitor.fullName,
      email: visitor.email,
      company: visitor.company,
      phone: visitor.phone,
      purpose_of_visit: visitor.purposeOfVisit,
      expected_arrival: visitor.expectedArrival,
      status: visitor.status || 'REGISTERED',
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      purposeOfVisit: data.purpose_of_visit,
      expectedArrival: data.expected_arrival,
      actualArrival: data.actual_arrival,
      actualDeparture: data.actual_departure,
      hostEmployeeId: data.host_employee_id,
      status: data.status,
      qrCodeToken: data.qr_code_token,
    };
  },

  checkIn: async (id: string): Promise<ApiVisitor> => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('visitors')
      .update({ status: 'CHECKED_IN', actual_arrival: now })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      purposeOfVisit: data.purpose_of_visit,
      expectedArrival: data.expected_arrival,
      actualArrival: data.actual_arrival,
      actualDeparture: data.actual_departure,
      hostEmployeeId: data.host_employee_id,
      status: data.status,
      qrCodeToken: data.qr_code_token,
    };
  },

  checkOut: async (id: string): Promise<ApiVisitor> => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('visitors')
      .update({ status: 'CHECKED_OUT', actual_departure: now })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      purposeOfVisit: data.purpose_of_visit,
      expectedArrival: data.expected_arrival,
      actualArrival: data.actual_arrival,
      actualDeparture: data.actual_departure,
      hostEmployeeId: data.host_employee_id,
      status: data.status,
      qrCodeToken: data.qr_code_token,
    };
  },
};
