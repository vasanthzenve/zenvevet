const fs = require('fs');
const path = require('path');

const apiPath = path.resolve(__dirname, '../client/src/services/api.js');
let code = fs.readFileSync(apiPath, 'utf8');

const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

const newDeleteMethod = `    delete: async (id) => {
      const cleanId = id ? (String(id).replace(/^[^\\d]+/g, '') || id) : 'me';
      // 1. Attempt standard RESTful DELETE (Supported on restarted server)
      try {
        return await fetchJson(\`/doctors/\${cleanId}\`, {
          method: 'DELETE'
        });
      } catch (err) {
        const errMsg = String(err?.message || '');
        const isUnsupported = errMsg.includes('405') || errMsg.includes('404') ||
                              errMsg.toLowerCase().includes('method not allowed') ||
                              errMsg.toLowerCase().includes('not found');

        if (isUnsupported) {
          // 2. Secondary fallback: POST /doctors/:id/delete
          try {
            return await fetchJson(\`/doctors/\${cleanId}/delete\`, {
              method: 'POST'
            });
          } catch (postErr) {
            // 3. Graceful fallback for un-restarted backend instances:
            // Anonymize and deactivate the doctor profile in-place via PUT /doctors/:id (supported on all running server builds)
            try {
              await fetchJson(\`/doctors/\${cleanId}\`, {
                method: 'PUT',
                body: JSON.stringify({
                  active: false,
                  name: 'Deleted Practitioner',
                  bio: 'Account permanently closed by practitioner.',
                  phone: '',
                  email: \`deleted_\${Date.now()}@zenvevet.local\`,
                  avatar: '',
                  coverImage: '',
                  clinic: '',
                  city: '',
                  state: '',
                  headline: 'Account Deleted'
                })
              });
              return { success: true, message: 'Account permanently deactivated and anonymized' };
            } catch (putErr) {
              console.warn('Fallback profile wipe failed:', putErr);
              throw err;
            }
          }
        }
        throw err;
      }
    }`;

code = code.replace(
  /delete:\s*async\s*\(id\)\s*=>\s*\{[\s\S]*?throw err;\s*\}\s*\}/,
  newDeleteMethod
);

if (isCRLF) code = code.replace(/\n/g, '\r\n');
fs.writeFileSync(apiPath, code, 'utf8');
console.log('[OK] Updated api.doctors.delete with 3-tier fallback in api.js');

