const fs = require('fs');
const path = require('path');

function walkDir(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(filePath, ext));
    } else {
      if (!ext || filePath.endsWith(ext)) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const root = process.cwd();
console.log("--- BACKEND JAVA FILES ---");
const javaFiles = walkDir(path.join(root, 'backend/src/main/java'), '.java');
console.log(`Total Java Files: ${javaFiles.length}`);

let controllers = [];
let endpoints = [];
let services = [];
let repos = [];
let entities = [];
let dtos = [];

javaFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  const relPath = path.relative(root, f);
  
  if (content.includes('@RestController') || content.includes('@Controller')) {
    controllers.push(relPath);
    // Parse endpoints
    const classBaseMatch = content.match(/@RequestMapping\((?:value\s*=\s*)?["']([^"']+)["']\)/);
    const classBase = classBaseMatch ? classBaseMatch[1] : '';
    
    const lines = content.split('\n');
    let currentMapping = null;
    let currentPath = '';
    
    lines.forEach((line, idx) => {
      const mappingMatch = line.match(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\((?:value\s*=\s*|path\s*=\s*)?["']?([^"'\)]*)["']?\))?/);
      if (mappingMatch) {
        const method = mappingMatch[1].replace('Mapping', '').toUpperCase();
        let subPath = mappingMatch[2] || '';
        if (subPath.startsWith('/')) subPath = subPath;
        let fullPath = (classBase + '/' + subPath).replace(/\/+/g, '/');
        endpoints.push({ method: method === 'REQUEST' ? 'ALL' : method, path: fullPath, controller: path.basename(f), file: relPath });
      }
    });
  }
  
  if (content.includes('@Service')) services.push(relPath);
  if (content.includes('@Repository')) repos.push(relPath);
  if (content.includes('@Entity') || content.includes('@Table')) entities.push(relPath);
  if (f.includes('dto') || f.includes('Dto') || content.includes('Record') || f.includes('DTO')) dtos.push(relPath);
});

console.log("\n--- CONTROLLER AUDIT ---");
console.log(`Controllers count: ${controllers.length}`);
console.log(`Endpoints count detected: ${endpoints.length}`);

console.log("\n--- FRONTEND AUDIT ---");
const frontendFiles = walkDir(path.join(root, 'frontend/src'));
console.log(`Frontend src files count: ${frontendFiles.length}`);

const apiFiles = frontendFiles.filter(f => f.includes('/api/') || f.includes('Service') || f.includes('store'));
console.log(`API / Store / Service files: ${apiFiles.map(f => path.relative(root, f)).join(', ')}`);

console.log("\n--- SUPABASE / DB AUDIT ---");
const supabaseFiles = walkDir(path.join(root, 'supabase'));
console.log(`Supabase files: ${supabaseFiles.map(f => path.relative(root, f)).join(', ')}`);

fs.writeFileSync('audit_output.json', JSON.stringify({ javaFiles, controllers, endpoints, services, repos, entities, apiFiles, supabaseFiles }, null, 2));
console.log("Written audit_output.json");
