const fs = require('fs');
const path = require('path');

const audit = JSON.parse(fs.readFileSync('audit_output.json', 'utf-8'));

console.log("=== SUMMARY ===");
console.log(`Controllers (${audit.controllers.length}):`);
audit.controllers.forEach(c => console.log(` - ${path.basename(c)}`));

console.log(`\nServices (${audit.services.length}):`);
audit.services.forEach(s => console.log(` - ${path.basename(s)}`));

console.log(`\nEntities (${audit.entities.length}):`);
audit.entities.forEach(e => console.log(` - ${path.basename(e)}`));

console.log(`\nSupabase Edge Functions / DB files:`);
audit.supabaseFiles.forEach(s => console.log(` - ${s}`));
