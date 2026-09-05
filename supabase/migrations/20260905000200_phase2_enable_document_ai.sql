-- Phase 2 activates only the Document Classification & OCR module.
insert into public.ai_module_config (
  id, module_key, enabled, provider_id, model, fallback_model,
  execution_mode, features, created_at, updated_at, is_deleted
)
values (
  gen_random_uuid(), 'mod-1', true, null, null, null,
  'REALTIME', '["documentClassification","ocrExtraction","aiSummarization"]',
  now(), now(), false
)
on conflict (module_key) do update set
  enabled = true,
  execution_mode = 'REALTIME',
  is_deleted = false,
  deleted_at = null,
  deleted_by = null,
  updated_at = now();
