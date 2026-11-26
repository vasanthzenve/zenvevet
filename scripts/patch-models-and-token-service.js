const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. TokenService.java: Add resolveDoctorId
const tokenServicePath = path.join(rootDir, 'server/src/main/java/com/doctorvet/security/TokenService.java');
let tokenService = fs.readFileSync(tokenServicePath, 'utf8');
if (!tokenService.includes('public Long resolveDoctorId(')) {
  const methodToAdd = `
    public Long resolveDoctorId(jakarta.servlet.http.HttpServletRequest request) {
        if (request == null) return null;
        Object attr = request.getAttribute("authenticatedDoctorId");
        if (attr instanceof Long l) return l;
        if (attr instanceof Number n) return n.longValue();

        String auth = request.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            String token = auth.substring(7).trim();
            if (validateToken(token)) {
                return getDoctorIdFromToken(token);
            }
        }
        return null;
    }
`;
  tokenService = tokenService.replace(
    'public Long getDoctorIdFromToken(String token) {',
    methodToAdd + '\n    public Long getDoctorIdFromToken(String token) {'
  );
  fs.writeFileSync(tokenServicePath, tokenService, 'utf8');
  console.log('[OK] Added resolveDoctorId to TokenService.java');
}

// 2. ClinicalCase.java: Add authorId field and getter/setter
const casePath = path.join(rootDir, 'server/src/main/java/com/doctorvet/model/ClinicalCase.java');
let caseCode = fs.readFileSync(casePath, 'utf8');
if (!caseCode.includes('private Long authorId;')) {
  caseCode = caseCode.replace(
    'private String authorName;',
    'private Long authorId;\n    private String authorName;'
  );
  caseCode = caseCode.replace(
    'public String getAuthorName() {',
    'public Long getAuthorId() { return authorId; }\n    public void setAuthorId(Long authorId) { this.authorId = authorId; }\n\n    public String getAuthorName() {'
  );
  fs.writeFileSync(casePath, caseCode, 'utf8');
  console.log('[OK] Added authorId to ClinicalCase.java');
}

// 3. ShortVideo.java: Add doctorId field and getter/setter
const videoPath = path.join(rootDir, 'server/src/main/java/com/doctorvet/model/ShortVideo.java');
let videoCode = fs.readFileSync(videoPath, 'utf8');
if (!videoCode.includes('private Long doctorId;')) {
  videoCode = videoCode.replace(
    'private String doctorName;',
    'private Long doctorId;\n    private String doctorName;'
  );
  videoCode = videoCode.replace(
    'public String getDoctorName() {',
    'public Long getDoctorId() { return doctorId; }\n    public void setDoctorId(Long doctorId) { this.doctorId = doctorId; }\n\n    public String getDoctorName() {'
  );
  fs.writeFileSync(videoPath, videoCode, 'utf8');
  console.log('[OK] Added doctorId to ShortVideo.java');
}

console.log('Finished updating models and TokenService.');

