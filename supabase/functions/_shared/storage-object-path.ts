export function isValidStorageObjectPath(filePath: string): boolean {
  const path = filePath.trim();
  if (path === '' || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) return false;
  if (path.includes('\\')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
