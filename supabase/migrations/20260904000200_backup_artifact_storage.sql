insert into storage.buckets (id, name, public)
values ('backup-archives', 'backup-archives', false)
on conflict (id) do update set public = false;
create index if not exists idx_backup_records_file_path
  on public.backup_records(file_path)
  where file_path is not null;
