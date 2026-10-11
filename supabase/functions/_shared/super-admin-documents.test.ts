import { canViewDocumentContent, canApproveDocumentAccess, documentAccessFlags } from './document-access.ts';
const direct = {email:'admin@test.invalid',roles:['SUPER_ADMIN'],assignedRoles:['SUPER_ADMIN'],permissions:[],oversightActive:false};
const record = {owner_email:'other@test.invalid',classification_level:'HIGHLY_RESTRICTED',department:'Other',status:'APPROVED',owning_module:'PRIVACY'};
Deno.test('direct Super Admin gets document content and all valid management actions', () => {
  const flags = documentAccessFlags(direct,record,[]);
  for (const field of ['metadata','view','download','print','share','editMetadata','classify','archive','manageRetention'] as const) if (!flags[field]) throw new Error(`Missing action ${field}`);
  if (flags.restore || !canApproveDocumentAccess(direct,record)) throw new Error('Wrong state/approval');
  if (!documentAccessFlags(direct,{...record,status:'ARCHIVED'},[]).restore) throw new Error('Restore denied');
});
Deno.test('document privilege excludes System Admin, inherited authority and target scope', () => {
  for (const context of [{...direct,assignedRoles:[]},{...direct,roles:['SYSTEM_ADMIN'],assignedRoles:['SYSTEM_ADMIN']},{...direct,oversightActive:true}]) {
    if (canViewDocumentContent(context,record,[])) throw new Error('Unauthorized content access');
  }
});
