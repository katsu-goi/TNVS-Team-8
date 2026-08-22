const fs = require('fs');
const path = require('path');

function walkDir(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) results = results.concat(walkDir(filePath, ext));
    else if (!ext || filePath.endsWith(ext)) results.push(filePath);
  });
  return results;
}

const root = process.cwd();
const javaFiles = walkDir(path.join(root, 'backend/src/main/java'), '.java');

let scheduledJobs = [];
let stompMappings = [];
let storageRefs = [];
let aiRefs = [];
let rateLimitRefs = [];

javaFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  const relPath = path.relative(root, f);
  
  if (content.includes('@Scheduled')) {
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('@Scheduled')) {
        scheduledJobs.push({ file: relPath, line: idx + 1, code: line.trim() + ' ' + (lines[idx+1] || '').trim() });
      }
    });
  }
  
  if (content.includes('@MessageMapping') || content.includes('SimpMessagingTemplate') || content.includes('WebSocket')) {
    stompMappings.push(relPath);
  }
  
  if (content.includes('/mnt/fileserver') || content.includes('storage') || content.includes('MultipartFile')) {
    storageRefs.push(relPath);
  }
  
  if (content.includes('Ai') || content.includes('OpenAI') || content.includes('Gemini') || content.includes('Anthropic')) {
    aiRefs.push(relPath);
  }
  
  if (content.includes('Bucket4j') || content.includes('RateLimit') || content.includes('rateLimit')) {
    rateLimitRefs.push(relPath);
  }
});

console.log("=== SCHEDULED JOBS ===");
scheduledJobs.forEach(j => console.log(`[${j.file}:${j.line}] ${j.code}`));

console.log("\n=== STOMP / WEBSOCKET REFS ===");
stompMappings.forEach(s => console.log(` - ${s}`));

console.log("\n=== FRONTEND PACKAGE.JSON ===");
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf-8'));
console.log("Dependencies:", Object.keys(pkg.dependencies || {}));
console.log("DevDependencies:", Object.keys(pkg.devDependencies || {}));

fs.writeFileSync('deep_audit.json', JSON.stringify({ scheduledJobs, stompMappings, storageRefs, rateLimitRefs, pkgDependencies: pkg.dependencies, pkgDevDependencies: pkg.devDependencies }, null, 2));
