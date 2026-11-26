const fs = require('fs');
const path = require('path');

const apiPath = path.resolve(__dirname, '../client/src/services/api.js');
let code = fs.readFileSync(apiPath, 'utf8');

const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

code = code.replace(
  /delete:\s*\(id\)\s*=>\s*\{[\s\S]*?method:\s*'DELETE'[\s\S]*?\}\s*\}\s*,/,
  `delete: async (id) => {
      const cleanId = id ? (String(id).replace(/^[^\\d]+/g, '') || id) : 'me';
      try {
        return await fetchJson(\`/doctors/\${cleanId}\`, {
          method: 'DELETE'
        });
      } catch (err) {
        const errMsg = String(err?.message || '');
        if (errMsg.includes('405') || errMsg.toLowerCase().includes('method not allowed')) {
          return await fetchJson(\`/doctors/\${cleanId}/delete\`, {
            method: 'POST'
          });
        }
        throw err;
      }
    },`
);

if (isCRLF) code = code.replace(/\n/g, '\r\n');
fs.writeFileSync(apiPath, code, 'utf8');
console.log('[OK] Updated api.doctors.delete with automatic POST fallback on 405.');

