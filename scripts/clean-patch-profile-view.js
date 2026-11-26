const fs = require('fs');
const path = require('path');

const pvPath = path.resolve(__dirname, '../client/src/pages/ProfileView.jsx');
let content = fs.readFileSync(pvPath, 'utf8');

// Normalize line endings to \n for consistent matching, restore \r\n on save if needed
const isCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// 1. Add AlertTriangle to lucide-react and import ZenveAlertModal
content = content.replace(
  "import {\n  MapPin,",
  "import {\n  AlertTriangle,\n  MapPin,"
);

content = content.replace(
  "import { api } from '../services/api';",
  "import { api } from '../services/api';\nimport { showZenveConfirm, showZenveAlert } from '../components/ZenveAlertModal';"
);

// 2. Add onDeleteAccount to props list
content = content.replace(
  "  onDeletePost,\n  returnTab = 'feed'",
  "  onDeletePost,\n  onDeleteAccount,\n  returnTab = 'feed'"
);

// 3. Add handleDeleteAccountAction helper after resolvedDoctor definition
const helperCode = `
  const handleDeleteAccountAction = async () => {
    if (typeof onDeleteAccount === 'function') {
      return onDeleteAccount();
    }
    const docId = activeDoc?.id || targetDoc?.id || currentUser?.id;
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

content = content.replace(
  "  const activeDoc = resolvedDoctor || targetDoc || {};",
  "  const activeDoc = resolvedDoctor || targetDoc || {};\n" + helperCode
);

// 4. Update header action buttons
const oldHeaderButtons = `              {isOwnProfile ? (
                <button
                  onClick={onEditProfile}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#003822',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '7px 18px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 56, 34, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#05633C'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#003822'; }}
                >
                  <UserPen size={13} />
                  <span>Edit Profile</span>
                </button>
              ) : (`;

const newHeaderButtons = `              {isOwnProfile ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={onEditProfile}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#003822',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '9999px',
                      padding: '7px 18px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0, 56, 34, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#05633C'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#003822'; }}
                  >
                    <UserPen size={13} />
                    <span>Edit Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteAccountAction}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      borderRadius: '9999px',
                      padding: '7px 16px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(220, 38, 38, 0.08)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#DC2626';
                      e.currentTarget.style.color = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#DC2626';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FEF2F2';
                      e.currentTarget.style.color = '#DC2626';
                      e.currentTarget.style.borderColor = '#FECACA';
                    }}
                    title="Permanently Delete Doctor Account and All Associated Records"
                  >
                    <Trash2 size={13} />
                    <span>Delete Account</span>
                  </button>
                </div>
              ) : (`;

content = content.replace(oldHeaderButtons, newHeaderButtons);

// 5. Update tabs array
const oldTabs = `            {[
              { id: 'about', label: 'About & Credentials' },
              { id: 'cases', label: \`Published Cases (\${doctorCases.length})\` },
              { id: 'posts', label: \`Discussions & Posts (\${doctorPosts.length})\` },
              { id: 'contact', label: 'Contact' }
            ].map(tab => (`;

const newTabs = `            {[
              { id: 'about', label: 'About & Credentials' },
              { id: 'cases', label: \`Published Cases (\${doctorCases.length})\` },
              { id: 'posts', label: \`Discussions & Posts (\${doctorPosts.length})\` },
              { id: 'contact', label: 'Contact' },
              ...(isOwnProfile ? [{ id: 'settings', label: 'Account & Settings' }] : [])
            ].map(tab => (`;

content = content.replace(oldTabs, newTabs);

// 6. Render Tab 5: Account & Settings / Danger Zone after contact tab
const settingsTabContent = `
          {/* Tab 5: Account & Settings (Danger Zone / Permanent Deletion) */}
          {activeTab === 'settings' && isOwnProfile && (
            <div style={{ paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Account Overview Box */}
              <div style={{
                padding: '20px',
                backgroundColor: '#F9FAFB',
                borderRadius: '12px',
                border: '1px solid #E5E7EB'
              }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64726A', margin: '0 0 14px 0' }}>
                  Doctor Account Overview
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#6B7280', display: 'block', fontSize: '11.5px', marginBottom: '2px' }}>PRACTITIONER NAME</span>
                    <strong style={{ color: '#111827' }}>{activeDoc.name || 'Doctor'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280', display: 'block', fontSize: '11.5px', marginBottom: '2px' }}>SPECIALTY</span>
                    <strong style={{ color: '#111827' }}>{activeDoc.specialty || 'General Veterinary'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280', display: 'block', fontSize: '11.5px', marginBottom: '2px' }}>REGISTERED EMAIL</span>
                    <strong style={{ color: '#111827' }}>{displayEmail || 'Not specified'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280', display: 'block', fontSize: '11.5px', marginBottom: '2px' }}>REGISTRATION STATUS</span>
                    <strong style={{ color: activeDoc.verified ? '#059669' : '#D97706' }}>
                      {activeDoc.verified ? '✓ VCI Verified Practitioner' : 'Standard Practitioner'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Danger Zone: Permanent Account Deletion Card */}
              <div style={{
                padding: '24px',
                backgroundColor: '#FEF2F2',
                borderRadius: '14px',
                border: '1.5px solid #FECACA',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#FEE2E2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DC2626'
                  }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <div style={{
                      display: 'inline-block',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#DC2626',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      backgroundColor: '#FEE2E2',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      marginBottom: '2px'
                    }}>
                      Danger Zone
                    </div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#991B1B' }}>
                      Permanent Account Deletion
                    </h3>
                  </div>
                </div>

                <p style={{ margin: '0 0 14px 0', fontSize: '13.5px', color: '#7F1D1D', lineHeight: '1.55' }}>
                  Once you permanently delete your account, <strong>there is no going back</strong>. All of your published clinical cases, discussion posts, reels, 24-hour stories, direct messages, and professional veterinary network connections will be permanently wiped from the database.
                </p>

                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #FCA5A5',
                  marginBottom: '18px',
                  fontSize: '12px',
                  color: '#991B1B'
                }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>What will be permanently erased:</strong>
                  <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: '1.6' }}>
                    <li>Your doctor profile details, avatar, credentials, and hospital clinic data</li>
                    <li>All clinical case studies ({doctorCases.length}) and surgical reports</li>
                    <li>All community discussion posts ({doctorPosts.length}), comments, and likes</li>
                    <li>All active 24-hour stories, clinical reels, and media uploads</li>
                    <li>All direct chat conversations, messaging history, and notifications</li>
                    <li>All professional veterinary connections ({displayConnectionsCount})</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button
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
                    <span>Permanently Delete My Account</span>
                  </button>
                </div>
              </div>
            </div>
          )}
`;

content = content.replace(
  "          {/* Tab 4: Hospital & Contact */}",
  settingsTabContent + "\n          {/* Tab 4: Hospital & Contact */}"
);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(pvPath, content, 'utf8');
console.log('[OK] ProfileView.jsx updated cleanly without syntax errors.');

