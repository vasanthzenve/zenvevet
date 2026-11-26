const fs = require('fs');
const path = require('path');

const profileViewPath = path.resolve(__dirname, '../client/src/pages/ProfileView.jsx');
let code = fs.readFileSync(profileViewPath, 'utf8');

// 1. Add header Delete button next to Edit Profile
code = code.replace(
  /\{isOwnProfile \? \(\s*<button[\s\S]*?onClick=\{onEditProfile\}[\s\S]*?<span>Edit Profile<\/span>\s*<\/button>\s*\) : \(/,
  `{isOwnProfile ? (
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

                  {onDeleteAccount && (
                    <button
                      type="button"
                      onClick={onDeleteAccount}
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
                  )}
                </div>
              ) : (`
);

// 2. Add 'Account & Settings' tab to tabs array
code = code.replace(
  /\{\s*id:\s*'contact',\s*label:\s*'Contact'\s*\}\s*\]\.map/,
  `{ id: 'contact', label: 'Contact' },
              ...(isOwnProfile ? [{ id: 'settings', label: 'Account & Settings' }] : [])
            ].map`
);

fs.writeFileSync(profileViewPath, code, 'utf8');
console.log('[OK] ProfileView.jsx updated successfully');

