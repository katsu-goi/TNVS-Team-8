import { assertEquals } from 'jsr:@std/assert@1';
import { isValidStorageObjectPath } from './storage-object-path.ts';

Deno.test('storage object availability accepts only usable object paths', () => {
  assertEquals(isValidStorageObjectPath('documents/2026/permit.pdf'), true);
  for (const path of ['', '   ', '/absolute/file.pdf', 'C:\\file.pdf', 'documents\\file.pdf', 'documents/../file.pdf']) {
    assertEquals(isValidStorageObjectPath(path), false, path);
  }
});
