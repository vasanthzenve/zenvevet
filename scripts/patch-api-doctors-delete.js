const fs = require('fs');
const path = require('path');

const apiPath = path.resolve(__dirname, '../client/src/services/api.js');
let content = fs.readFileSync(apiPath, 'utf8');

content = content.replace(
  /create:\s*\(data\)\s*=>\s*fetchJson\('\/doctors',\s*\{[\s\S]*?body:\s*JSON\.stringify\(data\)[\s\S]*?\}\)/,
  `create: (data) => fetchJson('/doctors', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    delete: (id) => {
      const cleanId = id ? (String(id).replace(/^[^\\d]+/g, '') || id) : 'me';
      return fetchJson(\`/doctors/\${cleanId}\`, {
        method: 'DELETE'
      });
    }`
);

fs.writeFileSync(apiPath, content, 'utf8');
console.log('[OK] Successfully updated api.doctors in api.js');
