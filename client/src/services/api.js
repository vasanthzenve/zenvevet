// Zenve Vet™ — API Client for Spring Boot Backend (http://localhost:8080/api/v1)

const resolveBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    return '/api/v1';
  }
  return 'http://localhost:8080/api/v1';
};

const BASE_URL = resolveBaseUrl();

let lastAuthUnauthorizedTime = 0;

async function fetchJson(endpoint, options = {}) {
  const isAdvertiser = options.isAdvertiser || endpoint.startsWith('/advertisers') || endpoint.startsWith('/campaigns');

  let authHeader = null;
  if (isAdvertiser) {
    if (options.headers?.Authorization) {
      authHeader = options.headers.Authorization;
    } else {
      const advToken = localStorage.getItem('zenve_advertiser_token');
      if (advToken) authHeader = `Bearer ${advToken}`;
    }
  } else {
    if (options.headers?.Authorization) {
      authHeader = options.headers.Authorization;
    } else {
      const docToken = localStorage.getItem('doctor_vet_token');
      if (docToken) authHeader = `Bearer ${docToken}`;
    }
  }

  function getDeviceId() {
    try {
      let id = localStorage.getItem('zenve_device_id');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('zenve_device_id', id);
      }
      return id;
    } catch (_) {
      return 'dev_client_default';
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-Id': getDeviceId(),
    ...(authHeader ? { 'Authorization': authHeader } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      if (isAdvertiser) {
        console.warn(`Unauthorized advertiser request on ${endpoint}. Clearing advertiser credentials.`);
        localStorage.removeItem('zenve_advertiser_token');
        localStorage.removeItem('zenve_advertiser_account');
        window.dispatchEvent(new CustomEvent('advertiser:unauthorized', { detail: { endpoint } }));
        throw new Error('Unauthorized: Advertiser session expired or invalid credentials');
      } else {
        const isAuthPublic =
          endpoint.startsWith('/auth/login') ||
          endpoint.startsWith('/auth/register') ||
          endpoint.startsWith('/auth/forgot-password') ||
          endpoint.startsWith('/auth/verify-code') ||
          endpoint.startsWith('/auth/verify-otp') ||
          endpoint.startsWith('/auth/reset-password') ||
          endpoint.startsWith('/auth/send-login-otp') ||
          endpoint.startsWith('/auth/login-with-otp');
        if (!isAuthPublic) {
          const now = Date.now();
          if (now - lastAuthUnauthorizedTime > 1500) {
            lastAuthUnauthorizedTime = now;
            console.warn(`Unauthorized request on ${endpoint}. Clearing doctor session.`);
            localStorage.removeItem('doctor_vet_user');
            localStorage.removeItem('doctor_vet_token');
            window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { endpoint } }));
          }
        }
        throw new Error('Unauthorized: Session expired or invalid credentials');
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `HTTP ${res.status}: ${errText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.message) errorMsg = parsed.message;
        else if (parsed.error) errorMsg = parsed.error;
      } catch (e) { }
      throw new Error(errorMsg);
    }
    return await res.json();
  } catch (err) {
    if (err.message?.includes('Unauthorized')) {
      throw err;
    }
    console.warn(`Fetch error for ${endpoint}:`, err.message);
    throw err;
  }
}

export const api = {
  // Auth
  auth: {
    sendOtp: async (phone) => {
      return await fetchJson('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone })
      });
    },
    verifyOtp: async (identifierOrPhone, otp) => {
      const target = identifierOrPhone ? String(identifierOrPhone).trim() : '';
      const cleanOtp = otp ? String(otp).trim() : '';
      const isEmail = target.includes('@');
      try {
        return await fetchJson('/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({
            phone: isEmail ? '' : target,
            email: isEmail ? target : '',
            identifier: target,
            otp: cleanOtp,
            code: cleanOtp
          })
        });
      } catch (err) {
        if (isEmail) {
          return await api.auth.verifyResetCode(target, cleanOtp);
        }
        throw err;
      }
    },
    login: (identifier, password) =>
      fetchJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      }),
    register: (userData) =>
      fetchJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      }),
    forgotPassword: async (identifier) => {
      return await fetchJson('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier ? String(identifier).trim() : '' })
      });
    },
    verifyResetCode: async (identifier, code) => {
      const target = identifier ? String(identifier).trim() : '';
      const cleanCode = code ? String(code).trim() : '';
      return await fetchJson('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({
          identifier: target,
          email: target,
          code: cleanCode,
          otp: cleanCode
        })
      });
    },
    resetPassword: async (identifier, code, newPassword) => {
      const target = identifier ? String(identifier).trim() : '';
      const cleanCode = code ? String(code).trim() : '';
      const pwd = newPassword ? String(newPassword).trim() : '';
      return await fetchJson('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier: target,
          email: target,
          code: cleanCode,
          otp: cleanCode,
          newPassword: pwd
        })
      });
    },
    sendLoginOtp: async (phone) => {
      try {
        return await fetchJson('/auth/send-otp', {
          method: 'POST',
          body: JSON.stringify({ phone })
        });
      } catch (err) {
        return await fetchJson('/auth/send-login-otp', {
          method: 'POST',
          body: JSON.stringify({ phone })
        });
      }
    },
    loginWithOtp: async (phone, code) => {
      try {
        const res = await fetchJson('/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ phone, otp: code, code })
        });
        if (res?.token && !res.user) {
          return res;
        }
        return res?.user || res?.doctor || res;
      } catch (err) {
        return await fetchJson('/auth/login-with-otp', {
          method: 'POST',
          body: JSON.stringify({ phone, code })
        });
      }
    },
    getMe: () => fetchJson('/auth/me'),
    logout: () => fetchJson('/auth/logout', { method: 'POST' }).catch(() => ({}))
  },

  // Doctors / Profiles
  doctors: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return fetchJson(`/doctors${qs ? '?' + qs : ''}`);
    },
    getById: (id) => fetchJson(`/doctors/${id}`),
    update: (id, data) => {
      const cleanId = id ? (String(id).replace(/^[^\d]+/g, '') || id) : '1';
      return fetchJson(`/doctors/${cleanId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    create: (data) => fetchJson('/doctors', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    delete: async (id) => {
      const cleanId = id ? (String(id).replace(/^[^\d]+/g, '') || id) : 'me';
      // 1. Attempt standard RESTful DELETE (Supported on restarted server)
      try {
        return await fetchJson(`/doctors/${cleanId}`, {
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
            return await fetchJson(`/doctors/${cleanId}/delete`, {
              method: 'POST'
            });
          } catch (postErr) {
            // 3. Graceful fallback for un-restarted backend instances:
            // Anonymize and deactivate the doctor profile in-place via PUT /doctors/:id (supported on all running server builds)
            try {
              await fetchJson(`/doctors/${cleanId}`, {
                method: 'PUT',
                body: JSON.stringify({
                  active: false,
                  name: 'Deleted Practitioner',
                  bio: 'Account permanently closed by practitioner.',
                  phone: '',
                  email: `deleted_${Date.now()}@zenvevet.local`,
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
    }
  },


  connections: {
    getSuggestions: (doctorId) => fetchJson(`/connections/suggestions?doctorId=${doctorId}`),
    getPending: (doctorId) => fetchJson(`/connections/pending?doctorId=${doctorId}`),
    getSent: (doctorId) => fetchJson(`/connections/sent?doctorId=${doctorId}`),
    getMy: (doctorId) => fetchJson(`/connections/my?doctorId=${doctorId}`),
    sendRequest: (senderId, senderName, senderAvatar, senderSpecialty, receiverId) =>
      fetchJson('/connections/request', {
        method: 'POST',
        body: JSON.stringify({ senderId, senderName, senderAvatar, senderSpecialty, receiverId })
      }),
    acceptRequest: (requestId) =>
      fetchJson(`/connections/${requestId}/accept`, { method: 'POST' }),
    rejectRequest: (requestId) =>
      fetchJson(`/connections/${requestId}/reject`, { method: 'POST' }),
    cancelRequest: (requestId) =>
      fetchJson(`/connections/${requestId}/cancel`, { method: 'DELETE' }),
    disconnect: (currentDoctorId, targetDoctorId) =>
      fetchJson(`/connections/disconnect/${targetDoctorId}?currentDoctorId=${currentDoctorId}`, { method: 'DELETE' })
  },

  // Feed & Posts
  feed: {
    getPosts: (type, doctorId) => {
      const params = new URLSearchParams();
      if (type && type !== 'all') params.append('type', type);
      if (doctorId) params.append('doctorId', doctorId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return fetchJson(`/feed${qs}`);
    },
    createPost: (post) =>
      fetchJson('/feed/posts', {
        method: 'POST',
        body: JSON.stringify(post)
      }),
    updatePost: (id, data) =>
      fetchJson(`/feed/posts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    deletePost: (id) => {
      const cleanId = String(id).replace(/^post-/i, '');
      if (isNaN(Number(cleanId))) {
        return Promise.resolve({ message: 'Deleted locally' });
      }
      return fetchJson(`/feed/posts/${cleanId}`, { method: 'DELETE' });
    },
    toggleVote: (postId, doctorId, doctorName = 'Dr. You', voteType = null, reaction = null) => {
      const cleanPostId = typeof postId === 'string' ? (postId.replace(/\D/g, '') || postId) : postId;
      const cleanDoctorId = doctorId != null ? (typeof doctorId === 'string' ? (doctorId.replace(/\D/g, '') || doctorId) : doctorId) : null;
      const queryParams = new URLSearchParams();
      if (cleanDoctorId) queryParams.append('doctorId', cleanDoctorId);
      if (doctorName) queryParams.append('doctorName', doctorName);
      if (voteType) queryParams.append('voteType', voteType);
      if (reaction) queryParams.append('reaction', reaction);
      const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';
      return fetchJson(`/feed/posts/${cleanPostId}/vote${qs}`, {
        method: 'POST'
      });
    },
    toggleLike: (postId, doctorId, doctorName = 'Dr. You', voteType = null, reaction = null) =>
      api.feed.toggleVote(postId, doctorId, doctorName, voteType, reaction),
    getComments: (postId) => fetchJson(`/feed/posts/${postId}/comments`),
    addComment: (postId, comment) =>
      fetchJson(`/feed/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify(comment)
      }),
    deleteComment: (postId, commentId, doctorId = 1) =>
      fetchJson(`/feed/posts/${postId}/comments/${commentId}?doctorId=${doctorId}`, {
        method: 'DELETE'
      }),
    editComment: (postId, commentId, content, doctorId = 1) =>
      fetchJson(`/feed/posts/${postId}/comments/${commentId}?doctorId=${doctorId}`, {
        method: 'PUT',
        body: JSON.stringify({ content })
      }),
    recordShare: (postId) =>
      fetchJson(`/feed/posts/${postId}/share`, {
        method: 'POST'
      }),
    toggleBookmark: (postId, doctorId = 1) =>
      fetchJson(`/feed/posts/${postId}/bookmark?doctorId=${doctorId}`, {
        method: 'POST'
      }),
    getSaved: (doctorId = 1) => fetchJson(`/feed/posts/saved?doctorId=${doctorId}`),
    reportPost: (postId, reporterId = 1, reason = 'Inappropriate content') =>
      fetchJson(`/feed/posts/${postId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reporterId, reason })
      })
  },

  // Stories (24h ephemeral)
  stories: {
    getAll: (doctorId) => fetchJson(`/stories${doctorId ? `?doctorId=${doctorId}` : ''}`),
    create: (story) => fetchJson('/stories', {
      method: 'POST',
      body: JSON.stringify(story)
    }),
    toggleLike: (storyId, doctorId, doctorName) => {
      const q = new URLSearchParams();
      if (doctorId) q.append('doctorId', doctorId);
      if (doctorName) q.append('doctorName', doctorName);
      return fetchJson(`/stories/${storyId}/like?${q.toString()}`, {
        method: 'POST'
      });
    },
    recordShare: (storyId) => fetchJson(`/stories/${storyId}/share`, {
      method: 'POST'
    }),
    recordView: (storyId, viewerDoctorId, viewerDoctorName, viewerDoctorAvatar, viewerSpecialty) => {
      const q = new URLSearchParams();
      if (viewerDoctorId) q.append('viewerDoctorId', viewerDoctorId);
      if (viewerDoctorName) q.append('viewerDoctorName', viewerDoctorName);
      if (viewerDoctorAvatar) q.append('viewerDoctorAvatar', viewerDoctorAvatar);
      if (viewerSpecialty) q.append('viewerSpecialty', viewerSpecialty);
      return fetchJson(`/stories/${storyId}/view?${q.toString()}`, {
        method: 'POST'
      });
    },
    getViewers: (storyId) => fetchJson(`/stories/${storyId}/viewers`),
    delete: (id) => {
      const cleanId = String(id).replace(/^story-/i, '');
      if (isNaN(Number(cleanId))) {
        return Promise.resolve({ message: 'Deleted locally' });
      }
      return fetchJson(`/stories/${cleanId}`, { method: 'DELETE' });
    }
  },

  // Media File Upload
  media: {
    upload: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/media/upload`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        throw new Error(`Media upload failed with HTTP ${res.status}`);
      }
      return await res.json();
    }
  },

  // Unified Search
  search: {
    query: (q) => fetchJson(`/search?q=${encodeURIComponent(q || '')}`)
  },

  // VetScribe Veterinary Clinical AI Assistant & Paraphraser
  vetscribe: {
    health: async () => {
      const endpoints = [
        '/api/v1/vetscribe/health',
        'http://127.0.0.1:8005/api/vetscribe/health',
        'http://127.0.0.1:8005/health',
        'http://127.0.0.1:5000/api/vetscribe/health'
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (res.ok) return await res.json();
        } catch (_) { }
      }
      return { status: 'offline', ollama_connected: false, model_available: false };
    },
    paraphrase: async (text) => {
      const endpoints = [
        '/api/v1/vetscribe/paraphrase',
        'http://127.0.0.1:8005/api/vetscribe/paraphrase',
        'http://127.0.0.1:8005/spell',
        'http://127.0.0.1:5000/api/vetscribe/paraphrase',
        'http://127.0.0.1:5000/spell'
      ];
      let lastErr = null;
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ text })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && (data.paraphrased_text || data.corrected_text)) {
              return {
                original_text: data.original_text || text,
                paraphrased_text: data.paraphrased_text || data.corrected_text,
                model: data.model || 'NLP Pet Grammar & Spell Checker',
                suggestions: data.suggestions || [],
                next_suggestions: data.next_suggestions || []
              };
            }
          }
        } catch (e) {
          lastErr = e;
        }
      }
      throw new Error(lastErr?.message || 'NLP Case Assistant service is currently offline. Please start the NLP service.');
    }
  },


  // 1-to-1 Chat
  chat: {
    getConversations: (doctorId = 1) => fetchJson(`/chat/conversations?doctorId=${doctorId}`),
    startConversation: (doctor1Id, doctor2Id, initialMessage) =>
      fetchJson('/chat/conversations/start', {
        method: 'POST',
        body: JSON.stringify({ doctor1Id, doctor2Id, initialMessage })
      }),
    getMessages: (conversationId, doctorId) => {
      const qs = doctorId ? `?doctorId=${doctorId}` : '';
      return fetchJson(`/chat/conversations/${conversationId}/messages${qs}`);
    },
    sendMessage: (msg) =>
      fetchJson('/chat/messages', {
        method: 'POST',
        body: JSON.stringify(msg)
      }),
    markAsRead: (conversationId, doctorId = 1) =>
      fetchJson(`/chat/conversations/${conversationId}/read?doctorId=${doctorId}`, {
        method: 'PUT'
      }),
    markMessageAsRead: (messageId, doctorId = 1) =>
      fetchJson(`/chat/messages/${messageId}/read?doctorId=${doctorId}`, {
        method: 'PUT'
      }),
    markDelivered: (conversationId, doctorId = 1) =>
      fetchJson(`/chat/conversations/${conversationId}/delivered?doctorId=${doctorId}`, {
        method: 'PUT'
      }),
    markMessageDelivered: (messageId, doctorId = 1) =>
      fetchJson(`/chat/messages/${messageId}/delivered?doctorId=${doctorId}`, {
        method: 'PUT'
      })
  },

  // Notifications
  notifications: {
    getNotifications: (doctorId = 1) => fetchJson(`/notifications?doctorId=${doctorId}`),
    getUnreadCount: (doctorId = 1) => fetchJson(`/notifications/unread-count?doctorId=${doctorId}`),
    markAsRead: (id) => fetchJson(`/notifications/${id}/read`, { method: 'PUT' }),
    markAllAsRead: (doctorId = 1) => fetchJson(`/notifications/read-all?doctorId=${doctorId}`, { method: 'PUT' }),
    broadcast: (data) => fetchJson('/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  // Short Videos
  videos: {
    getAll: () => fetchJson('/videos'),
    create: (video) => fetchJson('/videos', {
      method: 'POST',
      body: JSON.stringify(video)
    }),
    delete: (id) => {
      const cleanId = String(id).replace(/^vid-/i, '');
      if (isNaN(Number(cleanId))) {
        return Promise.resolve({ message: 'Deleted locally' });
      }
      return fetchJson(`/videos/${cleanId}`, { method: 'DELETE' });
    },
    toggleVote: (id, doctorId = 1, doctorName = 'Dr. You', voteType = null, reaction = null) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = typeof doctorId === 'string' ? (doctorId.replace(/\D/g, '') || 1) : (doctorId || 1);
      const queryParams = new URLSearchParams();
      queryParams.append('doctorId', cleanDocId);
      if (doctorName) queryParams.append('doctorName', doctorName);
      if (voteType) queryParams.append('voteType', voteType);
      if (reaction) queryParams.append('reaction', reaction);
      return fetchJson(`/videos/${cleanId}/vote?${queryParams.toString()}`, {
        method: 'POST'
      });
    },
    toggleLike: (id, doctorId = 1, doctorName = 'Dr. You', voteType = null, reaction = null) =>
      api.videos.toggleVote(id, doctorId, doctorName, voteType, reaction),
    getComments: (id) => fetchJson(`/videos/${id}/comments`).catch(() => []),
    addComment: (id, comment) => fetchJson(`/videos/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(comment)
    })
  },

  // Clinical Cases
  cases: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return fetchJson(`/cases${qs ? '?' + qs : ''}`);
    },
    getById: (id) => fetchJson(`/cases/${id}`),
    create: (caseData) => fetchJson('/cases', {
      method: 'POST',
      body: JSON.stringify(caseData)
    }),
    delete: (id) => {
      const cleanId = String(id).replace(/^case-/i, '');
      if (isNaN(Number(cleanId))) {
        return Promise.resolve({ message: 'Deleted locally' });
      }
      return fetchJson(`/cases/${cleanId}`, { method: 'DELETE' });
    },
    toggleVote: (caseId, doctorId, doctorName = 'Dr. You', voteType = null, reaction = null) => {
      const cleanId = String(caseId).replace(/^case-/i, '').replace(/\D/g, '') || caseId;
      const cleanDoctorId = doctorId != null ? (typeof doctorId === 'string' ? (doctorId.replace(/\D/g, '') || doctorId) : doctorId) : null;
      const queryParams = new URLSearchParams();
      if (cleanDoctorId) queryParams.append('doctorId', cleanDoctorId);
      if (doctorName) queryParams.append('doctorName', doctorName);
      if (voteType) queryParams.append('voteType', voteType);
      if (reaction) queryParams.append('reaction', reaction);
      const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';
      return fetchJson(`/cases/${cleanId}/vote${qs}`, {
        method: 'POST'
      });
    },
    toggleLike: (caseId, doctorId, doctorName = 'Dr. You', voteType = null, reaction = null) =>
      api.cases.toggleVote(caseId, doctorId, doctorName, voteType, reaction)
  },

  // Communities (Dynamic Veterinary Groups)
  communities: {
    getAll: (currentDoctorId) => {
      const cleanDocId = currentDoctorId ? String(currentDoctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?currentDoctorId=${cleanDocId}` : '';
      return fetchJson(`/communities${qs}`);
    },
    getById: (id, currentDoctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = currentDoctorId ? String(currentDoctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?currentDoctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}${qs}`);
    },
    create: (data, creatorId) => {
      const cleanCreatorId = creatorId ? String(creatorId).replace(/\D/g, '') : null;
      const qs = cleanCreatorId ? `?creatorId=${cleanCreatorId}` : '';
      return fetchJson(`/communities${qs}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    delete: (id, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}${qs}`, {
        method: 'DELETE'
      });
    },
    updateCover: (id, coverImage, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/cover${qs}`, {
        method: 'PUT',
        body: JSON.stringify({ coverImage })
      });
    },
    join: (id, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/join${qs}`, {
        method: 'POST'
      });
    },
    leave: (id, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/leave${qs}`, {
        method: 'POST'
      });
    },
    invite: (id, targetDoctorId, currentDoctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanTarget = targetDoctorId ? String(targetDoctorId).replace(/\D/g, '') : '';
      const cleanCurrent = currentDoctorId ? String(currentDoctorId).replace(/\D/g, '') : '';
      const qs = `?doctorId=${cleanTarget}${cleanCurrent ? `&currentDoctorId=${cleanCurrent}` : ''}`;
      return fetchJson(`/communities/${cleanId}/invite${qs}`, {
        method: 'POST'
      });
    },
    addPost: (id, postData, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/posts${qs}`, {
        method: 'POST',
        body: JSON.stringify(postData)
      });
    },
    deletePost: (id, postId, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanPostId = String(postId).replace(/\D/g, '') || postId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/posts/${cleanPostId}${qs}`, {
        method: 'DELETE'
      });
    },
    toggleVote: (id, postId, doctorId, voteType = null, reaction = null) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanPostId = String(postId).replace(/\D/g, '') || postId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const queryParams = new URLSearchParams();
      if (cleanDocId) queryParams.append('doctorId', cleanDocId);
      if (voteType) queryParams.append('voteType', voteType);
      if (reaction) queryParams.append('reaction', reaction);
      const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';
      return fetchJson(`/communities/${cleanId}/posts/${cleanPostId}/vote${qs}`, {
        method: 'POST'
      });
    },
    toggleLike: (id, postId, doctorId, voteType = null, reaction = null) =>
      api.communities.toggleVote(id, postId, doctorId, voteType, reaction),
    addComment: (id, postId, text, authorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanPostId = String(postId).replace(/\D/g, '') || postId;
      const cleanAuthorId = authorId ? String(authorId).replace(/\D/g, '') : null;
      const qs = cleanAuthorId ? `?authorId=${cleanAuthorId}` : '';
      return fetchJson(`/communities/${cleanId}/posts/${cleanPostId}/comments${qs}`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
    },
    addCase: (id, caseData, authorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanAuthorId = authorId ? String(authorId).replace(/\D/g, '') : null;
      const qs = cleanAuthorId ? `?authorId=${cleanAuthorId}` : '';
      return fetchJson(`/communities/${cleanId}/cases${qs}`, {
        method: 'POST',
        body: JSON.stringify(caseData)
      });
    },
    deleteCase: (id, caseId, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanCaseId = String(caseId).replace(/\D/g, '') || caseId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/cases/${cleanCaseId}${qs}`, {
        method: 'DELETE'
      });
    },
    addReel: (id, reelData, authorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanAuthorId = authorId ? String(authorId).replace(/\D/g, '') : null;
      const qs = cleanAuthorId ? `?authorId=${cleanAuthorId}` : '';
      return fetchJson(`/communities/${cleanId}/reels${qs}`, {
        method: 'POST',
        body: JSON.stringify(reelData)
      });
    },
    deleteReel: (id, reelId, doctorId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanReelId = String(reelId).replace(/\D/g, '') || reelId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/reels/${cleanReelId}${qs}`, {
        method: 'DELETE'
      });
    },
    sendMessage: (id, text, senderId) => {
      const cleanId = String(id).replace(/\D/g, '') || id;
      const cleanSenderId = senderId ? String(senderId).replace(/\D/g, '') : null;
      const qs = cleanSenderId ? `?senderId=${cleanSenderId}` : '';
      return fetchJson(`/communities/${cleanId}/messages${qs}`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
    },
    joinByCode: (code, doctorId) => {
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/join-by-code${qs}`, {
        method: 'POST',
        body: JSON.stringify({ code })
      });
    },
    acceptInvite: (inviteId, doctorId) => {
      const cleanInviteId = String(inviteId).replace(/\D/g, '') || inviteId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/invites/${cleanInviteId}/accept${qs}`, {
        method: 'POST'
      });
    },
    rejectInvite: (inviteId, doctorId) => {
      const cleanInviteId = String(inviteId).replace(/\D/g, '') || inviteId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/invites/${cleanInviteId}/reject${qs}`, {
        method: 'POST'
      });
    },
    acceptCommunityInvite: (communityId, doctorId) => {
      const cleanId = String(communityId).replace(/\D/g, '') || communityId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/accept-invite${qs}`, {
        method: 'POST'
      });
    },
    rejectCommunityInvite: (communityId, doctorId) => {
      const cleanId = String(communityId).replace(/\D/g, '') || communityId;
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/${cleanId}/reject-invite${qs}`, {
        method: 'POST'
      });
    },
    getPendingInvites: (doctorId) => {
      const cleanDocId = doctorId ? String(doctorId).replace(/\D/g, '') : null;
      const qs = cleanDocId ? `?doctorId=${cleanDocId}` : '';
      return fetchJson(`/communities/invites/pending${qs}`);
    }
  },

  // Advertiser Account & Campaign Management
  advertisers: {
    register: (data) => fetchJson('/advertisers/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    login: (email, password) => fetchJson('/advertisers/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    loginWithKey: (accessKey) => fetchJson('/advertisers/login-with-key', {
      method: 'POST',
      body: JSON.stringify({ accessKey })
    }),
    getMe: (token, accessKey) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (accessKey) headers['X-Advertiser-Key'] = accessKey;
      return fetchJson('/advertisers/me', { headers });
    },
    regenerateKey: (token) => fetchJson('/advertisers/regenerate-key', {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }),
    forgotPassword: (email) => fetchJson('/advertisers/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    })
  },

  campaigns: {
    getAll: (token, accessKey) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (accessKey) headers['X-Advertiser-Key'] = accessKey;
      return fetchJson('/campaigns', { headers });
    },
    getById: (id) => fetchJson(`/campaigns/${id}`),
    create: (data, token, accessKey) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (accessKey) headers['X-Advertiser-Key'] = accessKey;
      return fetchJson('/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
        headers
      });
    },
    update: (id, data, token, accessKey) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (accessKey) headers['X-Advertiser-Key'] = accessKey;
      return fetchJson(`/campaigns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers
      });
    },
    delete: (id, token, accessKey) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (accessKey) headers['X-Advertiser-Key'] = accessKey;
      return fetchJson(`/campaigns/${id}`, {
        method: 'DELETE',
        headers
      });
    },
    updateStatus: (id, status) => fetchJson(`/campaigns/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    }),
      recordEvent: (id, eventType, doctorId, deviceId, sessionId) => {
        let effectiveSession = sessionId;
        if (!effectiveSession && typeof localStorage !== 'undefined') {
          try {
            effectiveSession = localStorage.getItem('zenve_device_id') || ('anon_' + Math.random().toString(36).substring(2, 9));
          } catch (_) { }
        }
        let effectiveDocId = doctorId;
        if (!effectiveDocId && typeof localStorage !== 'undefined') {
          try {
            const userStr = localStorage.getItem('doctor_vet_user');
            if (userStr) {
              const u = JSON.parse(userStr);
              if (u && u.id) effectiveDocId = u.id;
            }
          } catch (_) { }
        }
        let effectiveDeviceId = deviceId;
        if (!effectiveDeviceId && typeof localStorage !== 'undefined') {
          try {
            effectiveDeviceId = localStorage.getItem('zenve_device_id');
          } catch (_) { }
        }
        return fetchJson(`/campaigns/${id}/events`, {
          method: 'POST',
        body: JSON.stringify({
            eventType,
            sessionId: effectiveSession,
            doctorId: effectiveDocId,
            deviceId: effectiveDeviceId
          })
        });
      },
        getReports: (params = {}, token, accessKey) => {
          const headers = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (accessKey) headers['X-Advertiser-Key'] = accessKey;
          const qs = new URLSearchParams(params).toString();
          return fetchJson(`/campaigns/reports${qs ? '?' + qs : ''}`, { headers });
        },
          getCsvUrl: (from, to, token, accessKey) => {
            let url = `${BASE_URL}/campaigns/reports/csv?from=${from || ''}&to=${to || ''}`;
            return url;
          },
            getPublicLive: (placement) => fetchJson(`/campaigns/public/live${placement ? '?placement=' + encodeURIComponent(placement) : ''}`)
    }
  };
