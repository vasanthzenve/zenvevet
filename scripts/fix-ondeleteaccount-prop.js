const fs = require('fs');
const path = require('path');

const pvPath = path.resolve(__dirname, '../client/src/pages/ProfileView.jsx');
let content = fs.readFileSync(pvPath, 'utf8');

// 1. Add showZenveConfirm and showZenveAlert import
if (!content.includes('ZenveAlertModal')) {
  content = content.replace(
    "import { api } from '../services/api';",
    "import { api } from '../services/api';\nimport { showZenveConfirm, showZenveAlert } from '../components/ZenveAlertModal';"
  );
}

// 2. Add onDeleteAccount to the props destructuring list
content = content.replace(
  /onDeletePost,(\r?\n\s*)returnTab = 'feed'/,
  'onDeletePost,$1onDeleteAccount,$1returnTab = \'feed\''
);

// 3. Add robust fallback handler inside ProfileView
const fallbackHandler = `
  const handleDeleteAccountAction = async () => {
    if (typeof onDeleteAccount === 'function') {
      return onDeleteAccount();
    }
    const docId = targetDoc?.id || currentUser?.id;
    if (!docId) return;
    const confirmed = await showZenveConfirm({
      title: 'Permanently Delete Account?',
      message: 'Are you sure you want to permanently delete your doctor account? All of your clinical cases, discussions, short video reels, 24-hour stories, direct messages, and professional connections will be permanently wiped out. This action cannot be undone.',
      confirmText: 'Yes, Delete Permanently',
      cancelText: 'Cancel',
      isDestructive: true
    });
    if (!confirmed) return;
    try {
      await api.doctors.delete(docId);
      showZenveAlert({
        title: 'Account Permanently Deleted',
        message: 'Your doctor profile and all associated data have been permanently removed.',
        type: 'info',
        autoCloseMs: 3000
      });
      localStorage.removeItem('doctor_vet_user');
      localStorage.removeItem('doctor_vet_token');
      window.location.reload();
    } catch (e) {
      showZenveAlert({
        title: 'Deletion Failed',
        message: 'Could not delete account: ' + (e.message || 'Please check your connection and retry.'),
        type: 'error'
      });
    }
  };
`;

if (!content.includes('handleDeleteAccountAction = async')) {
  content = content.replace(
    'const [activeTab, setActiveTab] = useState(\'about\');',
    'const [activeTab, setActiveTab] = useState(\'about\');\n' + fallbackHandler
  );
}

// 4. Update button clicks to use handleDeleteAccountAction
content = content.replace(
  /\{onDeleteAccount && \(\s*<button[\s\S]*?onClick=\{onDeleteAccount\}/,
  `<button
                      type="button"
                      onClick={handleDeleteAccountAction}`
);

content = content.replace(
  /<button[\s\S]*?onClick=\{onDeleteAccount\}[\s\S]*?<span>Permanently Delete My Account<\/span>/,
  `<button
                    type="button"
                    onClick={handleDeleteAccountAction}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '11px 22px',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(220, 38, 38, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#B91C1C'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#DC2626'; }}
                  >
                    <Trash2 size={16} />
                    <span>Permanently Delete My Account</span>`
);

fs.writeFileSync(pvPath, content, 'utf8');
console.log('[OK] ProfileView.jsx patched with onDeleteAccount prop and fallback handler.');

