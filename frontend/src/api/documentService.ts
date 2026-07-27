import { supabase } from '../lib/supabaseClient';

export interface ApiDocument {
  id?: string;
  title: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  aiClassification?: string;
  classificationLevel?: string;
  aiPredictedCategory?: string;
  status?: string;
  ocrExtractedText?: string;
  aiSummary?: string;
  confidenceScore?: number;
  extractedKeywords?: string[];
  createdAt?: string;
}

export const documentService = {
  getAllDocuments: async (): Promise<ApiDocument[]> => {
    const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }
    return (data || []).map(d => ({
      id: d.id,
      title: d.title,
      fileName: d.file_name,
      fileType: d.file_type,
      fileSize: d.file_size ? Number(d.file_size) : undefined,
      classificationLevel: d.classification_level,
      status: d.status,
      aiPredictedCategory: d.ai_predicted_category,
      aiClassification: d.ai_classification,
      aiSummary: d.ai_summary,
      ocrExtractedText: d.ocr_extracted_text,
      confidenceScore: d.confidence_score ? Number(d.confidence_score) : undefined,
      extractedKeywords: d.extracted_keywords,
      createdAt: d.created_at,
    }));
  },

  uploadDocument: async (doc: ApiDocument): Promise<ApiDocument> => {
    const { data, error } = await supabase.from('documents').insert([{
      title: doc.title,
      file_name: doc.fileName,
      file_type: doc.fileType,
      file_size: doc.fileSize,
      classification_level: doc.classificationLevel,
      status: doc.status || 'ACTIVE',
      ai_predicted_category: doc.aiPredictedCategory,
      ai_classification: doc.aiClassification,
      ai_summary: doc.aiSummary,
      ocr_extracted_text: doc.ocrExtractedText,
      confidence_score: doc.confidenceScore,
      extracted_keywords: doc.extractedKeywords,
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      title: data.title,
      fileName: data.file_name,
      fileType: data.file_type,
      fileSize: data.file_size ? Number(data.file_size) : undefined,
      classificationLevel: data.classification_level,
      status: data.status,
      aiPredictedCategory: data.ai_predicted_category,
      aiClassification: data.ai_classification,
      aiSummary: data.ai_summary,
      ocrExtractedText: data.ocr_extracted_text,
      confidenceScore: data.confidence_score ? Number(data.confidence_score) : undefined,
      extractedKeywords: data.extracted_keywords,
      createdAt: data.created_at,
    };
  },

  createDocument: async (doc: ApiDocument): Promise<ApiDocument> => {
    return documentService.uploadDocument(doc);
  },

  searchDocuments: async (query: string): Promise<ApiDocument[]> => {
    const { data, error } = await supabase.from('documents')
      .select('*')
      .or(`title.ilike.%${query}%,file_name.ilike.%${query}%,ai_summary.ilike.%${query}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error searching documents:', error);
      return [];
    }
    return (data || []).map(d => ({
      id: d.id,
      title: d.title,
      fileName: d.file_name,
      fileType: d.file_type,
      fileSize: d.file_size ? Number(d.file_size) : undefined,
      classificationLevel: d.classification_level,
      status: d.status,
      aiPredictedCategory: d.ai_predicted_category,
      aiClassification: d.ai_classification,
      aiSummary: d.ai_summary,
      ocrExtractedText: d.ocr_extracted_text,
      confidenceScore: d.confidence_score ? Number(d.confidence_score) : undefined,
      extractedKeywords: d.extracted_keywords,
      createdAt: d.created_at,
    }));
  },
};
