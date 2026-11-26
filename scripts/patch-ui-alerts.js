const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. CreatePostModal.jsx
const postModalPath = path.join(rootDir, 'client/src/components/CreatePostModal.jsx');
let postModal = fs.readFileSync(postModalPath, 'utf8');
if (!postModal.includes('showZenveAlert')) {
  postModal = postModal.replace(
    "import React, { useState, useRef, useEffect } from 'react';",
    "import React, { useState, useRef, useEffect } from 'react';\nimport { showZenveAlert } from './ZenveAlertModal';"
  );
  postModal = postModal.replaceAll(/\balert\(([^)]+)\)/g, 'showZenveAlert($1)');
  fs.writeFileSync(postModalPath, postModal, 'utf8');
  console.log('[OK] Replaced alert() with showZenveAlert() in CreatePostModal.jsx');
}

// 2. App.jsx remaining alerts
const appJsxPath = path.join(rootDir, 'client/src/App.jsx');
let appJsx = fs.readFileSync(appJsxPath, 'utf8');
appJsx = appJsx.replaceAll(/\balert\(([^)]+)\)/g, 'showZenveAlert($1)');
fs.writeFileSync(appJsxPath, appJsx, 'utf8');
console.log('[OK] Replaced all remaining alert() with showZenveAlert() in App.jsx');

// 3. CommunityView.jsx
const commViewPath = path.join(rootDir, 'client/src/components/CommunityView.jsx');
if (fs.existsSync(commViewPath)) {
  let commView = fs.readFileSync(commViewPath, 'utf8');
  if (!commView.includes('showZenveAlert')) {
    commView = "import { showZenveAlert } from './ZenveAlertModal';\n" + commView;
  }
  commView = commView.replaceAll(/\balert\(([^)]+)\)/g, 'showZenveAlert($1)');
  fs.writeFileSync(commViewPath, commView, 'utf8');
  console.log('[OK] Replaced alert() with showZenveAlert() in CommunityView.jsx');
}

console.log('UI alerts converted to ZenveAlertModal.');

