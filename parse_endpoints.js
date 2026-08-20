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
const javaFiles = walkDir(path.join(root, 'backend/src/main/java'), '.java');

let fullEndpointList = [];

javaFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  if (content.includes('@RestController') || content.includes('@Controller')) {
    const controllerName = path.basename(f, '.java');
    const relPath = path.relative(root, f);
    
    // Get class level RequestMapping
    const classReqMatch = content.match(/@RequestMapping\((?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/);
    const baseUri = classReqMatch ? classReqMatch[1] : '';
    
    // Find all methods
    const methodRegex = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)(?:\(([^)]*)\))?[\s\S]*?public\s+[\w<>,?\s]+\s+(\w+)\s*\(([^)]*)\)/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const httpType = match[1].replace('Mapping', '').toUpperCase();
      let subUri = '';
      const params = match[2] || '';
      const methodName = match[3];
      
      const uriMatch = params.match(/(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/);
      if (uriMatch) {
        subUri = uriMatch[1];
      }
      
      let fullPath = (baseUri + '/' + subUri).replace(/\/+/g, '/');
      if (fullPath.endsWith('/') && fullPath.length > 1) {
        fullPath = fullPath.slice(0, -1);
      }
      
      fullEndpointList.push({
        controller: controllerName,
        method: httpType === 'REQUEST' ? 'GET/POST' : httpType,
        path: fullPath,
        handler: methodName,
        file: relPath
      });
    }
  }
});

console.log(`Total Endpoints extracted: ${fullEndpointList.length}`);
fs.writeFileSync('endpoints_detailed.json', JSON.stringify(fullEndpointList, null, 2));
