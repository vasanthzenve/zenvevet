const fs = require('fs');
const path = require('path');

console.log('--- Applying Chat System Frontend Bug Fixes ---');

// 1. PATCH MessagesView.jsx
const messagesViewPath = path.join(__dirname, '..', 'client', 'src', 'pages', 'MessagesView.jsx');
let mvContent = fs.readFileSync(messagesViewPath, 'utf8');

// A. Add parseUtcDate and update formatTime, formatConversationTime, formatDateDivider
const oldTimeHelpers = `// Format real-time message timestamp (e.g. 12:20 PM)
const formatTime = (t) => {
  if (!t) return 'Just now';
  if (typeof t === 'string') {
    const s = t.trim();
    if (s.toLowerCase() === 'just now' || s.toLowerCase() === 'active') return s;
    if (/^\\d{1,2}:\\d{2}(\\s*(?:am|pm))?$/i.test(s)) return s;
  }
  try {
    const str = String(t).trim();
    const d = new Date(str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) { }
  return String(t);
};

// Format conversation list timestamp (e.g. 12:20 PM, Yesterday, 25 Oct)
const formatConversationTime = (t) => {
  if (!t) return 'Active';
  if (typeof t === 'string') {
    const s = t.trim();
    if (s.toLowerCase() === 'just now' || s.toLowerCase() === 'active' || s.toLowerCase() === 'connected') return s;
    if (/^\\d{1,2}:\\d{2}(\\s*(?:am|pm))?$/i.test(s)) return s;
  }
  try {
    const str = String(t).trim();
    const d = new Date(str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }
  } catch (e) { }
  return String(t);
};

// Helper to format date divider badge (e.g. "Today", "Yesterday", "October 27, 2026")
const formatDateDivider = (t) => {
  if (!t) return null;
  try {
    const str = String(t).trim();
    const d = new Date(str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return 'Today';
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }
  } catch (e) { }
  return null;
};`;

const newTimeHelpers = `// Robust parser for UTC timestamps stored by backend, converting accurately to user local Date
const parseUtcDate = (t) => {
  if (!t) return null;
  if (t instanceof Date) return isNaN(t.getTime()) ? null : t;
  let str = String(t).trim();
  if (!str) return null;
  if (str.includes(' ') && !str.includes('T')) {
    str = str.replace(' ', 'T');
  }
  // If ISO string without timezone indicator, append Z since backend stores UTC
  if (/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?$/.test(str)) {
    str += 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

// Format real-time message timestamp (e.g. 12:20 PM)
const formatTime = (t) => {
  if (!t) return 'Just now';
  if (typeof t === 'string') {
    const s = t.trim();
    if (s.toLowerCase() === 'just now' || s.toLowerCase() === 'active') return s;
    if (/^\\d{1,2}:\\d{2}(\\s*(?:am|pm))?$/i.test(s)) return s;
  }
  try {
    const d = parseUtcDate(t);
    if (d) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) { }
  return String(t);
};

// Format conversation list timestamp (e.g. 12:20 PM, Yesterday, 25 Oct)
const formatConversationTime = (t) => {
  if (!t) return 'Active';
  if (typeof t === 'string') {
    const s = t.trim();
    if (s.toLowerCase() === 'just now' || s.toLowerCase() === 'active' || s.toLowerCase() === 'connected') return s;
    if (/^\\d{1,2}:\\d{2}(\\s*(?:am|pm))?$/i.test(s)) return s;
  }
  try {
    const d = parseUtcDate(t);
    if (d) {
      const now = new Date();
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
        return 'Yesterday';
      }
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }
  } catch (e) { }
  return String(t);
};

// Helper to format date divider badge (e.g. "Today", "Yesterday", "Wed, Oct 27")
const formatDateDivider = (t) => {
  if (!t) return null;
  try {
    const d = parseUtcDate(t);
    if (d) {
      const now = new Date();
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
        return 'Today';
      }
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
        return 'Yesterday';
      }
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }
  } catch (e) { }
  return null;
};`;

// Normalize CRLF to LF for reliable string matching
mvContent = mvContent.replace(/\r\n/g, '\n');

if (mvContent.includes(oldTimeHelpers.replace(/\r\n/g, '\n'))) {
  mvContent = mvContent.replace(oldTimeHelpers.replace(/\r\n/g, '\n'), newTimeHelpers);
  console.log('✓ Successfully updated date & time helpers in MessagesView.jsx');
} else {
  console.warn('! Could not find oldTimeHelpers block in MessagesView.jsx');
}

// B. Update state for isSending and sendingLockRef
const oldStateAnchor = `  const [messageText, setMessageText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentType, setAttachmentType] = useState('IMAGE');`;

const newStateAnchor = `  const [messageText, setMessageText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentType, setAttachmentType] = useState('IMAGE');
  const [isSending, setIsSending] = useState(false);
  const sendingLockRef = useRef(false);`;

if (mvContent.includes(oldStateAnchor)) {
  mvContent = mvContent.replace(oldStateAnchor, newStateAnchor);
  console.log('✓ Successfully added isSending & sendingLockRef state in MessagesView.jsx');
} else {
  console.warn('! Could not find oldStateAnchor in MessagesView.jsx');
}

// C. Update selectedConv to prevent message mixing and fallback to wrong doctor's conversation
const oldSelectedConv = `  // Selected conversation strictly belonging to this user
  const selectedConv = conversations.find(c =>
    activeChatDoctor && (
      c.doctor?.id === activeChatDoctor.id ||
      String(c.doctor?.id || '').replace('doc-', '') === String(activeChatDoctor.id || '').replace('doc-', '') ||
      c.doctor?.name === activeChatDoctor.name
    )
  ) || (conversations.length > 0 ? conversations[0] : null);`;

const newSelectedConv = `  // Selected conversation strictly belonging to this user - NEVER fall back to another doctor's chat!
  const selectedConv = useMemo(() => {
    if (activeChatDoctor) {
      const activeDocIdStr = String(activeChatDoctor.id || '').replace(/\\D/g, '');
      return conversations.find(c => {
        if (!c.doctor) return false;
        const cDocIdStr = String(c.doctor.id || '').replace(/\\D/g, '');
        return (cDocIdStr && activeDocIdStr && cDocIdStr === activeDocIdStr) ||
          (c.doctor.name && activeChatDoctor.name && c.doctor.name.toLowerCase().trim() === activeChatDoctor.name.toLowerCase().trim());
      }) || null;
    }
    return conversations.length > 0 ? conversations[0] : null;
  }, [conversations, activeChatDoctor]);`;

if (mvContent.includes(oldSelectedConv)) {
  mvContent = mvContent.replace(oldSelectedConv, newSelectedConv);
  console.log('✓ Successfully updated selectedConv isolation in MessagesView.jsx');
} else {
  console.warn('! Could not find oldSelectedConv in MessagesView.jsx');
}

// D. Update chatMessages to strictly enforce conversation data isolation and sorting
const oldChatMessages = `  // Active chat message stream (strictly from user's selected conversation, deduplicated by message ID)
  const chatMessages = useMemo(() => {
    const list = selectedConv?.messages || [];
    const seen = new Set();
    const result = [];
    for (const msg of list) {
      if (!msg) continue;
      const key = msg.id != null ? String(msg.id) : (msg.tempId || \`\${msg.senderId}-\${msg.createdAt}-\${msg.text}\`);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(msg);
      }
    }
    return result;
  }, [selectedConv?.messages]);`;

const newChatMessages = `  // Active chat message stream (strictly isolated for active pair, deduplicated & sorted)
  const chatMessages = useMemo(() => {
    if (!currentDoctor) return [];
    const list = selectedConv?.messages || [];
    const currentDocIdStr = String(currentDoctor.id || '').replace(/\\D/g, '');
    const currentUserIdStr = String(currentUser?.id || '').replace(/\\D/g, '');

    const seen = new Set();
    const result = [];
    for (const msg of list) {
      if (!msg) continue;

      // Strict conversation data isolation:
      // If msg specifies senderId/receiverId, verify it strictly belongs to this 1-on-1 pair
      if (msg.senderId != null && msg.receiverId != null) {
        const sStr = String(msg.senderId).replace(/\\D/g, '');
        const rStr = String(msg.receiverId).replace(/\\D/g, '');
        const isCurrentPair = (sStr === currentDocIdStr && rStr === currentUserIdStr) ||
                              (sStr === currentUserIdStr && rStr === currentDocIdStr);
        if (!isCurrentPair) {
          // Cross-conversation message detected! Filter out to preserve conversation boundary.
          continue;
        }
      }

      const key = msg.id != null ? String(msg.id) : (msg.clientMsgId || msg.tempId || \`\${msg.senderId}-\${msg.createdAt}-\${msg.text}\`);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(msg);
      }
    }

    // Sort strictly chronological: createdAt ASC, id ASC
    result.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      const idA = typeof a.id === 'number' ? a.id : 0;
      const idB = typeof b.id === 'number' ? b.id : 0;
      return idA - idB;
    });

    return result;
  }, [selectedConv?.messages, currentDoctor, currentUser?.id]);`;

if (mvContent.includes(oldChatMessages)) {
  mvContent = mvContent.replace(oldChatMessages, newChatMessages);
  console.log('✓ Successfully updated chatMessages strict isolation in MessagesView.jsx');
} else {
  console.warn('! Could not find oldChatMessages in MessagesView.jsx');
}

// E. Update handleSend to prevent duplicate rapid clicks and send clientMsgId + verified conversationId
const oldHandleSend = `  // Handle Send: instant UI dispatch and smooth bottom scroll
  const handleSend = (e) => {
    e?.preventDefault();
    if (!isPeerConnected) {
      alert(\`You must connect with \${currentDoctor?.name || 'this doctor'} first before messaging.\`);
      return;
    }
    const trimmed = messageText.trim();
    if (!trimmed && !attachmentUrl) return;

    userJustSentRef.current = true;
    setMessageText('');
    const currentAttUrl = attachmentUrl;
    const currentAttType = attachmentType;
    setAttachmentUrl('');
    setAttachmentType('IMAGE');

    if (onSendMessage) {
      onSendMessage({
        conversationId: selectedConv?.id || \`chat-\${currentDoctor?.id || Date.now()}\`,
        receiverId: currentDoctor?.id || 1,
        text: trimmed,
        attachmentUrl: currentAttUrl || null,
        attachmentType: currentAttUrl ? (currentAttType || 'IMAGE') : null
      });
    }

    requestAnimationFrame(() => {
      scrollToBottom('smooth');
    });
  };`;

const newHandleSend = `  // Handle Send: instant UI dispatch, duplicate prevention & smooth bottom scroll
  const handleSend = (e) => {
    e?.preventDefault();
    if (sendingLockRef.current) return;
    if (!isPeerConnected) {
      alert(\`You must connect with \${currentDoctor?.name || 'this doctor'} first before messaging.\`);
      return;
    }
    const trimmed = messageText.trim();
    if (!trimmed && !attachmentUrl) return;

    sendingLockRef.current = true;
    setIsSending(true);
    userJustSentRef.current = true;

    const currentAttUrl = attachmentUrl;
    const currentAttType = attachmentType;
    const clientMsgId = 'cmsg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    setMessageText('');
    setAttachmentUrl('');
    setAttachmentType('IMAGE');

    if (onSendMessage) {
      onSendMessage({
        conversationId: (selectedConv && typeof selectedConv.id === 'number') ? selectedConv.id : null,
        receiverId: currentDoctor?.id || 1,
        text: trimmed,
        attachmentUrl: currentAttUrl || null,
        attachmentType: currentAttUrl ? (currentAttType || 'IMAGE') : null,
        clientMsgId
      });
    }

    requestAnimationFrame(() => {
      scrollToBottom('smooth');
    });

    setTimeout(() => {
      sendingLockRef.current = false;
      setIsSending(false);
    }, 350);
  };`;

if (mvContent.includes(oldHandleSend)) {
  mvContent = mvContent.replace(oldHandleSend, newHandleSend);
  console.log('✓ Successfully updated handleSend in MessagesView.jsx');
} else {
  console.warn('! Could not find oldHandleSend in MessagesView.jsx');
}

// F. Update Send Button to disable during isSending
const oldSendBtn = `                  {/* Send Circular Button */}
                  <button
                    type="submit"
                    disabled={!messageText.trim() && !attachmentUrl}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: (!messageText.trim() && !attachmentUrl) ? '#E5E7EB' : '#0D4B2D',
                      color: (!messageText.trim() && !attachmentUrl) ? '#9CA3AF' : '#FFFFFF',`;

const newSendBtn = `                  {/* Send Circular Button */}
                  <button
                    type="submit"
                    disabled={(!messageText.trim() && !attachmentUrl) || isSending}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: ((!messageText.trim() && !attachmentUrl) || isSending) ? '#E5E7EB' : '#0D4B2D',
                      color: ((!messageText.trim() && !attachmentUrl) || isSending) ? '#9CA3AF' : '#FFFFFF',`;

if (mvContent.includes(oldSendBtn)) {
  mvContent = mvContent.replace(oldSendBtn, newSendBtn);
  console.log('✓ Successfully updated Send button disabled state in MessagesView.jsx');
} else {
  console.warn('! Could not find oldSendBtn in MessagesView.jsx');
}

// G. Update Date divider calculation in loop
const oldDividerCalc = `                // Date divider calculation
                const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
                const currentRawDate = msg.createdAt ? new Date(String(msg.createdAt).replace(' ', 'T')) : null;
                const prevRawDate = prevMsg?.createdAt ? new Date(String(prevMsg.createdAt).replace(' ', 'T')) : null;
                const currentDateKey = currentRawDate && !isNaN(currentRawDate.getTime()) ? currentRawDate.toDateString() : null;
                const prevDateKey = prevRawDate && !isNaN(prevRawDate.getTime()) ? prevRawDate.toDateString() : null;
                const showDateDivider = currentDateKey && currentDateKey !== prevDateKey;
                const dateDividerLabel = showDateDivider ? formatDateDivider(msg.createdAt) : null;`;

const newDividerCalc = `                // Date divider calculation
                const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
                const currentRawDate = parseUtcDate(msg.createdAt);
                const prevRawDate = prevMsg?.createdAt ? parseUtcDate(prevMsg.createdAt) : null;
                const currentDateKey = currentRawDate ? \`\${currentRawDate.getFullYear()}-\${currentRawDate.getMonth()}-\${currentRawDate.getDate()}\` : null;
                const prevDateKey = prevRawDate ? \`\${prevRawDate.getFullYear()}-\${prevRawDate.getMonth()}-\${prevRawDate.getDate()}\` : null;
                const showDateDivider = currentDateKey && currentDateKey !== prevDateKey;
                const dateDividerLabel = showDateDivider ? formatDateDivider(msg.createdAt) : null;`;

if (mvContent.includes(oldDividerCalc)) {
  mvContent = mvContent.replace(oldDividerCalc, newDividerCalc);
  console.log('✓ Successfully updated date divider calculation in MessagesView.jsx');
} else {
  console.warn('! Could not find oldDividerCalc in MessagesView.jsx');
}

fs.writeFileSync(messagesViewPath, mvContent, 'utf8');
console.log('Saved MessagesView.jsx successfully.');


// 2. PATCH App.jsx
const appPath = path.join(__dirname, '..', 'client', 'src', 'App.jsx');
let appContent = fs.readFileSync(appPath, 'utf8');
appContent = appContent.replace(/\r\n/g, '\n');

// A. Update STOMP incoming message handling in App.jsx
const oldStompFindConv = `            setConversations(prev => {
              const convIdx = prev.findIndex(c =>
                (c.id != null && incoming.conversationId != null && String(c.id).replace(/\\D/g, '') === String(incoming.conversationId).replace(/\\D/g, '')) ||
                (c.doctor && (
                  (c.doctor.id != null && (String(c.doctor.id).replace(/\\D/g, '') === String(incoming.senderId).replace(/\\D/g, '') || String(c.doctor.id).replace(/\\D/g, '') === String(incoming.receiverId).replace(/\\D/g, '')))
                ))
              );`;

const newStompFindConv = `            setConversations(prev => {
              const isFromMe = String(incoming.senderId).replace(/\\D/g, '') === String(currentUser.id).replace(/\\D/g, '');
              const peerId = isFromMe ? incoming.receiverId : incoming.senderId;
              const peerIdStr = String(peerId != null ? peerId : '').replace(/\\D/g, '');

              const convIdx = prev.findIndex(c => {
                if (c.id != null && incoming.conversationId != null && typeof c.id === 'number' && typeof incoming.conversationId === 'number' && c.id === incoming.conversationId) {
                  return true;
                }
                if (c.doctor && c.doctor.id != null && String(c.doctor.id).replace(/\\D/g, '') === peerIdStr) {
                  return true;
                }
                return false;
              });`;

if (appContent.includes(oldStompFindConv)) {
  appContent = appContent.replace(oldStompFindConv, newStompFindConv);
  console.log('✓ Successfully fixed STOMP peer matching in App.jsx');
} else {
  console.warn('! Could not find oldStompFindConv in App.jsx');
}

// B. Update STOMP formattedMsg & replacement in App.jsx
const oldFormattedMsgBlock = `              const formattedMsg = {
                id: incoming.id || Date.now(),
                sender: incoming.senderId === currentUser.id ? 'user' : 'doctor',
                senderId: incoming.senderId,
                receiverId: incoming.receiverId,
                text: incoming.text || incoming.message,
                attachmentUrl: incoming.attachmentUrl,
                attachmentType: incoming.attachmentType,
                status: isChatOpenAndVisible ? 'SEEN' : (incoming.receiverId === currentUser.id ? 'DELIVERED' : (incoming.status || 'SENT')),
                isRead: isChatOpenAndVisible ? true : (incoming.isRead || false),
                createdAt: incoming.createdAt,
                deliveredAt: incoming.deliveredAt || (incoming.receiverId === currentUser.id ? new Date().toISOString() : null),
                readAt: isChatOpenAndVisible ? new Date().toISOString() : incoming.readAt,
                time: incoming.createdAt ? new Date(incoming.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : nowTime
              };

              if (convIdx >= 0) {
                const updated = [...prev];
                const existingList = updated[convIdx].messages || [];

                // Check if this incoming message replaces an optimistic message from currentUser
                const optIdx = existingList.findIndex(m =>
                  String(m.id) === String(incoming.id) ||
                  (incoming.senderId === currentUser.id && (
                    (m.tempId && m.text === formattedMsg.text) ||
                    (typeof m.id === 'string' && m.id.startsWith('temp-') && m.text === formattedMsg.text)
                  ))
                );`;

const newFormattedMsgBlock = `              const formattedMsg = {
                id: incoming.id || Date.now(),
                clientMsgId: incoming.clientMsgId || null,
                conversationId: incoming.conversationId || null,
                sender: String(incoming.senderId).replace(/\\D/g, '') === String(currentUser.id).replace(/\\D/g, '') ? 'user' : 'doctor',
                senderId: incoming.senderId,
                receiverId: incoming.receiverId,
                text: incoming.text || incoming.message,
                attachmentUrl: incoming.attachmentUrl,
                attachmentType: incoming.attachmentType,
                status: isChatOpenAndVisible ? 'SEEN' : (incoming.receiverId === currentUser.id ? 'DELIVERED' : (incoming.status || 'SENT')),
                isRead: isChatOpenAndVisible ? true : (incoming.isRead || false),
                createdAt: incoming.createdAt,
                deliveredAt: incoming.deliveredAt || (incoming.receiverId === currentUser.id ? new Date().toISOString() : null),
                readAt: isChatOpenAndVisible ? new Date().toISOString() : incoming.readAt,
                time: incoming.createdAt ? new Date(incoming.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : nowTime
              };

              if (convIdx >= 0) {
                const updated = [...prev];
                const existingList = updated[convIdx].messages || [];

                // Check if this incoming message replaces an optimistic message from currentUser
                const optIdx = existingList.findIndex(m =>
                  String(m.id) === String(incoming.id) ||
                  (incoming.clientMsgId && m.clientMsgId && incoming.clientMsgId === m.clientMsgId) ||
                  (incoming.senderId === currentUser.id && (
                    (m.tempId && m.text === formattedMsg.text) ||
                    (typeof m.id === 'string' && m.id.startsWith('temp-') && m.text === formattedMsg.text)
                  ))
                );`;

if (appContent.includes(oldFormattedMsgBlock)) {
  appContent = appContent.replace(oldFormattedMsgBlock, newFormattedMsgBlock);
  console.log('✓ Successfully updated STOMP formattedMsg in App.jsx');
} else {
  console.warn('! Could not find oldFormattedMsgBlock in App.jsx');
}

// C. Update handleSendMessage in App.jsx
const oldHandleSendMsg = `  const handleSendMessage = async ({ conversationId, receiverId, text, attachmentUrl, attachmentType }) => {
    let targetConvId = conversationId;
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tempId = \`temp-\${Date.now()}-\${Math.random().toString(36).substring(2, 7)}\`;
    const optimisticMsg = {
      id: tempId,
      tempId: tempId,
      sender: 'user',
      senderId: currentUser?.id,
      receiverId: receiverId,
      text,
      attachmentUrl,
      attachmentType,
      status: 'SENT',
      isRead: false,
      createdAt: now.toISOString(),
      deliveredAt: null,
      readAt: null,
      time: timeFormatted
    };

    // 1. Immediate optimistic UI update (0ms response - renders sent message instantly)
    setConversations(prev => {
      const matchIndex = prev.findIndex(conv =>
        conv.id === conversationId ||
        (conv.doctor?.id && (conv.doctor.id === receiverId || String(conv.doctor.id).replace(/\\D/g, '') === String(receiverId).replace(/\\D/g, ''))) ||
        (conv.doctor?.name && activeChatDoctor?.name && conv.doctor.name === activeChatDoctor.name)
      );

      if (matchIndex >= 0) {
        const copy = [...prev];
        const target = copy[matchIndex];
        copy[matchIndex] = {
          ...target,
          lastMessage: text || 'Sent an attachment',
          timestamp: timeFormatted,
          messages: [...(target.messages || []), optimisticMsg]
        };
        return copy;
      }

      const newConv = {
        id: conversationId,
        doctor: activeChatDoctor || { id: receiverId, name: 'Doctor', specialty: 'Veterinary Practitioner' },
        lastMessage: text || 'Sent an attachment',
        timestamp: timeFormatted,
        unread: 0,
        messages: [optimisticMsg]
      };
      return [newConv, ...prev];
    });

    // 2. Asynchronous backend persistence: Non-blocking background sync
    try {
      if (typeof conversationId !== 'number' && receiverId) {
        try {
          const started = await api.chat.startConversation(currentUser?.id || 1, receiverId, text);
          if (started?.id) targetConvId = started.id;
        } catch (e) { }
      }

      const numericConvId = typeof targetConvId === 'number'
        ? targetConvId
        : parseInt(String(targetConvId || '').replace(/\\D/g, ''), 10);

      const saved = await api.chat.sendMessage({
        conversationId: !isNaN(numericConvId) && numericConvId > 0 ? numericConvId : 1,
        senderId: currentUser?.id,
        receiverId: receiverId,
        text,
        attachmentUrl,
        attachmentType
      });

      if (saved && saved.id) {
        setConversations(prev => prev.map(conv => {
          const isMatch = conv.id === targetConvId || conv.id === conversationId ||
            (conv.doctor?.id && (conv.doctor.id === receiverId || String(conv.doctor.id).replace(/\\D/g, '') === String(receiverId).replace(/\\D/g, '')));

          if (isMatch) {
            const existing = conv.messages || [];
            const alreadyHasSaved = existing.some(m => String(m.id) === String(saved.id));
            let updatedMessages;
            if (alreadyHasSaved) {
              // STOMP already added saved.id, remove the temp message to avoid duplicate keys
              updatedMessages = existing.filter(m => m.id !== tempId);
            } else {
              updatedMessages = existing.map(m => {
                if (m.id === tempId) {
                  return {
                    ...m,
                    id: saved.id,
                    status: saved.status || 'SENT',
                    createdAt: saved.createdAt || m.createdAt,
                    deliveredAt: saved.deliveredAt,
                    readAt: saved.readAt
                  };
                }
                return m;
              });
            }

            const seenIds = new Set();
            const deduplicated = updatedMessages.filter(m => {
              const k = String(m.id);
              if (seenIds.has(k)) return false;
              seenIds.add(k);
              return true;
            });

            return {
              ...conv,
              id: targetConvId,
              messages: deduplicated
            };
          }
          return conv;
        }));
      }
    } catch (e) {
      console.warn('Real-time chat persistence fallback:', e);
    }

  };`;

const newHandleSendMsg = `  const handleSendMessage = async ({ conversationId, receiverId, text, attachmentUrl, attachmentType, clientMsgId }) => {
    let targetConvId = typeof conversationId === 'number' ? conversationId : null;
    const effectiveClientMsgId = clientMsgId || \`cmsg_\${Date.now()}_\${Math.random().toString(36).substring(2, 9)}\`;
    const receiverIdStr = String(receiverId || '').replace(/\\D/g, '');
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tempId = \`temp-\${Date.now()}-\${Math.random().toString(36).substring(2, 7)}\`;
    const optimisticMsg = {
      id: tempId,
      tempId: tempId,
      clientMsgId: effectiveClientMsgId,
      conversationId: targetConvId,
      sender: 'user',
      senderId: currentUser?.id,
      receiverId: receiverId,
      text,
      attachmentUrl,
      attachmentType,
      status: 'SENT',
      isRead: false,
      createdAt: now.toISOString(),
      deliveredAt: null,
      readAt: null,
      time: timeFormatted
    };

    // 1. Immediate optimistic UI update (0ms response - renders sent message instantly)
    setConversations(prev => {
      const matchIndex = prev.findIndex(conv => {
        if (conv.doctor?.id != null) {
          const dIdStr = String(conv.doctor.id).replace(/\\D/g, '');
          if (dIdStr && receiverIdStr && dIdStr === receiverIdStr) return true;
        }
        if (conv.doctor?.name && activeChatDoctor?.name && conv.doctor.name.toLowerCase().trim() === activeChatDoctor.name.toLowerCase().trim()) {
          return true;
        }
        if (typeof targetConvId === 'number' && typeof conv.id === 'number' && conv.id === targetConvId) {
          return true;
        }
        return false;
      });

      if (matchIndex >= 0) {
        const copy = [...prev];
        const target = copy[matchIndex];
        copy[matchIndex] = {
          ...target,
          lastMessage: text || 'Sent an attachment',
          timestamp: timeFormatted,
          messages: [...(target.messages || []), optimisticMsg]
        };
        return copy;
      }

      const newConv = {
        id: targetConvId || \`temp-conv-\${Date.now()}\`,
        doctor: activeChatDoctor || { id: receiverId, name: 'Doctor', specialty: 'Veterinary Practitioner' },
        lastMessage: text || 'Sent an attachment',
        timestamp: timeFormatted,
        unread: 0,
        messages: [optimisticMsg]
      };
      return [newConv, ...prev];
    });

    // 2. Asynchronous backend persistence: Non-blocking background sync with strict validation & deduplication
    try {
      const saved = await api.chat.sendMessage({
        conversationId: typeof targetConvId === 'number' && targetConvId > 0 ? targetConvId : null,
        senderId: currentUser?.id,
        receiverId: receiverId,
        text,
        attachmentUrl,
        attachmentType,
        clientMsgId: effectiveClientMsgId
      });

      if (saved && saved.id) {
        const authoritativeConvId = saved.conversationId;
        setConversations(prev => prev.map(conv => {
          const isMatch = (targetConvId && conv.id === targetConvId) ||
            (authoritativeConvId && conv.id === authoritativeConvId) ||
            (conv.doctor?.id && (String(conv.doctor.id).replace(/\\D/g, '') === receiverIdStr));

          if (isMatch) {
            const existing = conv.messages || [];
            const alreadyHasSaved = existing.some(m =>
              String(m.id) === String(saved.id) ||
              (m.clientMsgId && saved.clientMsgId && m.clientMsgId === saved.clientMsgId)
            );
            let updatedMessages;
            if (alreadyHasSaved) {
              updatedMessages = existing.map(m => {
                if (m.id === tempId || (m.clientMsgId && m.clientMsgId === effectiveClientMsgId) || String(m.id) === String(saved.id)) {
                  return {
                    ...m,
                    id: saved.id,
                    clientMsgId: effectiveClientMsgId,
                    conversationId: authoritativeConvId || m.conversationId,
                    status: saved.status || 'SENT',
                    createdAt: saved.createdAt || m.createdAt,
                    deliveredAt: saved.deliveredAt,
                    readAt: saved.readAt
                  };
                }
                return m;
              });
            } else {
              updatedMessages = existing.map(m => {
                if (m.id === tempId || (m.clientMsgId && m.clientMsgId === effectiveClientMsgId)) {
                  return {
                    ...m,
                    id: saved.id,
                    clientMsgId: effectiveClientMsgId,
                    conversationId: authoritativeConvId || m.conversationId,
                    status: saved.status || 'SENT',
                    createdAt: saved.createdAt || m.createdAt,
                    deliveredAt: saved.deliveredAt,
                    readAt: saved.readAt
                  };
                }
                return m;
              });
            }

            const seenKeys = new Set();
            const deduplicated = updatedMessages.filter(m => {
              const k = m.id != null ? String(m.id) : (m.clientMsgId || m.tempId);
              if (seenKeys.has(k)) return false;
              seenKeys.add(k);
              return true;
            });

            return {
              ...conv,
              id: authoritativeConvId || conv.id,
              lastMessage: saved.text || text || 'Sent an attachment',
              timestamp: timeFormatted,
              messages: deduplicated
            };
          }
          return conv;
        }));
      }
    } catch (e) {
      console.warn('Real-time chat persistence fallback:', e);
    }

  };`;

if (appContent.includes(oldHandleSendMsg)) {
  appContent = appContent.replace(oldHandleSendMsg, newHandleSendMsg);
  console.log('✓ Successfully updated handleSendMessage in App.jsx');
} else {
  console.warn('! Could not find oldHandleSendMsg in App.jsx');
}

// D. Update polling fallback in App.jsx to prevent parseInt(chat-3) = 3
const oldPollingCheck = `        const convId = targetConv?.id;
        const numId = typeof convId === 'number' ? convId : parseInt(String(convId || '').replace(/\\D/g, ''), 10);
        if (!isNaN(numId) && numId > 0) {`;

const newPollingCheck = `        const convId = targetConv?.id;
        const numId = typeof convId === 'number' && convId > 0 ? convId : null;
        if (numId) {`;

if (appContent.includes(oldPollingCheck)) {
  appContent = appContent.replace(oldPollingCheck, newPollingCheck);
  console.log('✓ Successfully fixed polling convId check in App.jsx');
} else {
  console.warn('! Could not find oldPollingCheck in App.jsx');
}

// E. Update handleSelectConversation in App.jsx to prevent parseInt(chat-3) = 3
const oldSelectConvCheck = `    const numId = typeof conv.id === 'number' ? conv.id : parseInt(String(conv.id).replace(/\\D/g, ''), 10);
    if (!isNaN(numId) && numId > 0) {`;

const newSelectConvCheck = `    const numId = typeof conv.id === 'number' && conv.id > 0 ? conv.id : null;
    if (numId) {`;

if (appContent.includes(oldSelectConvCheck)) {
  appContent = appContent.replace(oldSelectConvCheck, newSelectConvCheck);
  console.log('✓ Successfully fixed handleSelectConversation convId check in App.jsx');
} else {
  console.warn('! Could not find oldSelectConvCheck in App.jsx');
}

// F. Update onMarkAsRead in App.jsx
const oldMarkAsReadCheck = `              onMarkAsRead={(convId) => {
                const num = typeof convId === 'number' ? convId : parseInt(String(convId || '').replace(/\\D/g, ''), 10);
                if (!isNaN(num) && num > 0) {`;

const newMarkAsReadCheck = `              onMarkAsRead={(convId) => {
                const num = typeof convId === 'number' && convId > 0 ? convId : null;
                if (num) {`;

if (appContent.includes(oldMarkAsReadCheck)) {
  appContent = appContent.replace(oldMarkAsReadCheck, newMarkAsReadCheck);
  console.log('✓ Successfully fixed onMarkAsRead convId check in App.jsx');
} else {
  console.warn('! Could not find oldMarkAsReadCheck in App.jsx');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Saved App.jsx successfully.');
console.log('--- Chat Frontend Bug Fixes Completed ---');
