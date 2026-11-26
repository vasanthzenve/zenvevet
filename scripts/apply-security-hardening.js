const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. Patch ConnectionService.java
const connServicePath = path.join(rootDir, 'server/src/main/java/com/doctorvet/service/ConnectionService.java');
let connService = fs.readFileSync(connServicePath, 'utf8');
if (!connService.includes('getRequestById(Long requestId)')) {
  connService = connService.replace(
    /public ConnectionRequest sendRequest[\s\S]*?return saved;\s*\}/,
    (match) => match + '\n\n    public Optional<ConnectionRequest> getRequestById(Long requestId) {\n        return requestRepo.findById(requestId);\n    }'
  );
  fs.writeFileSync(connServicePath, connService, 'utf8');
  console.log('[OK] Patched ConnectionService.java with getRequestById');
}

// 2. Patch ConnectionController.java for BOLA / IDOR protection
const connControllerPath = path.join(rootDir, 'server/src/main/java/com/doctorvet/controller/ConnectionController.java');
let connController = fs.readFileSync(connControllerPath, 'utf8');
if (!connController.includes('tokenService')) {
  connController = connController.replace(
    'import com.doctorvet.service.ConnectionService;',
    'import com.doctorvet.service.ConnectionService;\nimport com.doctorvet.security.TokenService;\nimport jakarta.servlet.http.HttpServletRequest;\nimport org.springframework.http.HttpStatus;'
  );
  connController = connController.replace(
    'private final ConnectionService connectionService;\n\n    public ConnectionController(ConnectionService connectionService) {\n        this.connectionService = connectionService;\n    }',
    'private final ConnectionService connectionService;\n    private final TokenService tokenService;\n\n    public ConnectionController(ConnectionService connectionService, TokenService tokenService) {\n        this.connectionService = connectionService;\n        this.tokenService = tokenService;\n    }'
  );

  // Accept request check
  connController = connController.replace(
    'public ResponseEntity<?> acceptRequest(@PathVariable Long requestId) {\n        return connectionService.acceptRequest(requestId)',
    `public ResponseEntity<?> acceptRequest(@PathVariable Long requestId, HttpServletRequest request) {
        Long authId = tokenService.resolveDoctorId(request);
        Optional<ConnectionRequest> reqOpt = connectionService.getRequestById(requestId);
        if (reqOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (authId != null && !reqOpt.get().getReceiverId().equals(authId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden: You can only accept requests addressed to you."));
        }
        return connectionService.acceptRequest(requestId)`
  );

  // Reject request check
  connController = connController.replace(
    'public ResponseEntity<?> rejectRequest(@PathVariable Long requestId) {\n        return connectionService.rejectRequest(requestId)',
    `public ResponseEntity<?> rejectRequest(@PathVariable Long requestId, HttpServletRequest request) {
        Long authId = tokenService.resolveDoctorId(request);
        Optional<ConnectionRequest> reqOpt = connectionService.getRequestById(requestId);
        if (reqOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (authId != null && !reqOpt.get().getReceiverId().equals(authId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden: You can only reject requests addressed to you."));
        }
        return connectionService.rejectRequest(requestId)`
  );

  // Cancel request check
  connController = connController.replace(
    'public ResponseEntity<?> cancelRequest(@PathVariable Long requestId) {\n        return connectionService.cancelRequest(requestId)',
    `public ResponseEntity<?> cancelRequest(@PathVariable Long requestId, HttpServletRequest request) {
        Long authId = tokenService.resolveDoctorId(request);
        Optional<ConnectionRequest> reqOpt = connectionService.getRequestById(requestId);
        if (reqOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (authId != null && !reqOpt.get().getSenderId().equals(authId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden: You can only cancel requests you sent."));
        }
        return connectionService.cancelRequest(requestId)`
  );

  fs.writeFileSync(connControllerPath, connController, 'utf8');
  console.log('[OK] Patched ConnectionController.java with BOLA/IDOR protection');
}

// 3. Patch CommunityController.java resolveDoctorId priority
const communityControllerPath = path.join(rootDir, 'server/src/main/java/com/doctorvet/controller/CommunityController.java');
let commController = fs.readFileSync(communityControllerPath, 'utf8');
if (commController.includes('if (fallbackId != null && fallbackId > 0) return fallbackId;')) {
  commController = commController.replace(
    `    private Long resolveDoctorId(HttpServletRequest request, Long fallbackId) {
        if (fallbackId != null && fallbackId > 0) return fallbackId;
        String auth = request.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            String token = auth.substring(7).trim();
            if (tokenService.validateToken(token)) {
                return tokenService.getDoctorIdFromToken(token);
            }
        }
        return null;
    }`,
    `    private Long resolveDoctorId(HttpServletRequest request, Long fallbackId) {
        String auth = request.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            String token = auth.substring(7).trim();
            if (tokenService.validateToken(token)) {
                return tokenService.getDoctorIdFromToken(token);
            }
        }
        return (fallbackId != null && fallbackId > 0) ? fallbackId : null;
    }`
  );
  fs.writeFileSync(communityControllerPath, commController, 'utf8');
  console.log('[OK] Patched CommunityController.java resolveDoctorId token priority');
}

// 4. Patch UnifiedSearchService.java with pagination / stream limit(50)
const searchServicePath = path.join(rootDir, 'server/src/main/java/com/doctorvet/service/UnifiedSearchService.java');
let searchService = fs.readFileSync(searchServicePath, 'utf8');
if (!searchService.includes('.limit(50)')) {
  searchService = searchService.replace(
    'List<DoctorProfile> allDocs = doctorRepo.findAll();',
    'List<DoctorProfile> allDocs = doctorRepo.findAll().stream().limit(50).toList();'
  );
  searchService = searchService.replace(
    'List<ClinicalCase> allCases = caseRepo.findAll();',
    'List<ClinicalCase> allCases = caseRepo.findAll().stream().limit(50).toList();'
  );
  searchService = searchService.replace(
    'List<Post> allPosts = postRepo.findAll();',
    'List<Post> allPosts = postRepo.findAll().stream().limit(50).toList();'
  );
  searchService = searchService.replace(
    'List<ShortVideo> allVideos = videoRepo.findAll();',
    'List<ShortVideo> allVideos = videoRepo.findAll().stream().limit(50).toList();'
  );
  searchService = searchService.replace(
    /List<DoctorProfile> matchedDocs = doctorRepo\.findAll\(\)\.stream\(\)[\s\S]*?\.toList\(\);/,
    `List<DoctorProfile> matchedDocs = doctorRepo.findAll().stream()
                .filter(d -> (d.getName() != null && d.getName().toLowerCase().contains(q)) ||
                             (d.getSpecialty() != null && d.getSpecialty().toLowerCase().contains(q)) ||
                             (d.getClinic() != null && d.getClinic().toLowerCase().contains(q)) ||
                             (d.getCity() != null && d.getCity().toLowerCase().contains(q)) ||
                             (d.getState() != null && d.getState().toLowerCase().contains(q)))
                .limit(50)
                .toList();`
  );
  searchService = searchService.replace(
    /List<ClinicalCase> matchedCases = caseRepo\.findAll\(\)\.stream\(\)[\s\S]*?\.toList\(\);/,
    `List<ClinicalCase> matchedCases = caseRepo.findAll().stream()
                .filter(c -> (c.getTitle() != null && c.getTitle().toLowerCase().contains(q)) ||
                             (c.getPresentingComplaint() != null && c.getPresentingComplaint().toLowerCase().contains(q)) ||
                             (c.getDiagnosis() != null && c.getDiagnosis().toLowerCase().contains(q)) ||
                             (c.getSpecies() != null && c.getSpecies().toLowerCase().contains(q)) ||
                             (c.getAuthorSpecialty() != null && c.getAuthorSpecialty().toLowerCase().contains(q)))
                .limit(50)
                .toList();`
  );
  searchService = searchService.replace(
    /List<Post> matchedPosts = postRepo\.findAll\(\)\.stream\(\)[\s\S]*?\.toList\(\);/,
    `List<Post> matchedPosts = postRepo.findAll().stream()
                .filter(p -> (p.getContent() != null && p.getContent().toLowerCase().contains(q)) ||
                             (p.getBadgeLabel() != null && p.getBadgeLabel().toLowerCase().contains(q)) ||
                             (p.getAuthorName() != null && p.getAuthorName().toLowerCase().contains(q)) ||
                             (p.getSpecies() != null && p.getSpecies().toLowerCase().contains(q)))
                .limit(50)
                .toList();`
  );
  searchService = searchService.replace(
    /List<ShortVideo> matchedVideos = videoRepo\.findAll\(\)\.stream\(\)[\s\S]*?\.toList\(\);/,
    `List<ShortVideo> matchedVideos = videoRepo.findAll().stream()
                .filter(v -> (v.getTitle() != null && v.getTitle().toLowerCase().contains(q)) ||
                             (v.getDoctorName() != null && v.getDoctorName().toLowerCase().contains(q)) ||
                             (v.getDoctorSpecialty() != null && v.getDoctorSpecialty().toLowerCase().contains(q)))
                .limit(50)
                .toList();`
  );
  fs.writeFileSync(searchServicePath, searchService, 'utf8');
  console.log('[OK] Patched UnifiedSearchService.java with memory protection limits');
}

// 5. Patch application.properties
const appPropPath = path.join(rootDir, 'server/src/main/resources/application.properties');
let appProps = fs.readFileSync(appPropPath, 'utf8');
if (appProps.includes('spring.mail.properties.mail.smtp.ssl.trust=*')) {
  appProps = appProps.replace(
    'spring.mail.properties.mail.smtp.ssl.trust=*',
    'spring.mail.properties.mail.smtp.ssl.trust=${SPRING_MAIL_HOST:mail.zenvevet.com}'
  );
  appProps = appProps.replace(
    'spring.mail.password=${SPRING_MAIL_PASSWORD:REDACTED_MAIL_PWD}',
    'spring.mail.password=${SPRING_MAIL_PASSWORD:}'
  );
  fs.writeFileSync(appPropPath, appProps, 'utf8');
  console.log('[OK] Hardened application.properties SMTP and credentials');
}

// 6. Patch api.js dynamic host resolution
const apiJsPath = path.join(rootDir, 'client/src/services/api.js');
let apiJs = fs.readFileSync(apiJsPath, 'utf8');
if (apiJs.includes("const BASE_URL = 'http://localhost:8080/api/v1';")) {
  apiJs = apiJs.replace(
    "const BASE_URL = 'http://localhost:8080/api/v1';",
    `const resolveBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location;
    if (port === '5173') {
      return \`\${protocol}//\${hostname}:8080/api/v1\`;
    }
    if (port === '8000' || port === '80' || port === '443') {
      return \`\${protocol}//\${hostname}\${port ? ':' + port : ''}/api/v1\`;
    }
    return \`\${protocol}//\${hostname}:8080/api/v1\`;
  }
  return 'http://localhost:8080/api/v1';
};

const BASE_URL = resolveBaseUrl();`
  );
  fs.writeFileSync(apiJsPath, apiJs, 'utf8');
  console.log('[OK] Patched api.js with dynamic host resolution');
}

// 7. Ensure main.jsx imports ZenveAlertModal immediately
const mainJsxPath = path.join(rootDir, 'client/src/main.jsx');
let mainJsx = fs.readFileSync(mainJsxPath, 'utf8');
if (!mainJsx.includes('ZenveAlertModal')) {
  mainJsx = `import './components/ZenveAlertModal';\n` + mainJsx;
  fs.writeFileSync(mainJsxPath, mainJsx, 'utf8');
  console.log('[OK] Patched main.jsx to initialize ZenveAlertModal early');
}

console.log('Patch completed successfully.');

