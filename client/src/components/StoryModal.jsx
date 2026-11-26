import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Heart,
  Share2,
  Send,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Stethoscope,
  Sparkles,
  Eye,
  Search,
  Users,
  Smile,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Avatar } from './Avatar';
import likePuppy from '../assets/reactions/like_puppy.png';
import { LIKE_REACTIONS, DISLIKE_REACTIONS } from '../data/reactions';
import { api } from '../services/api';
import { showZenveConfirm } from './ZenveAlertModal';

const resolveMediaUrl = (url, retryCount = 0) => {
  if (!url) return '';
  let str = String(url).trim();
  if (!str) return '';
  if (str.startsWith('data:') || str.startsWith('blob:')) return str;

  // Adapt for mobile and LAN access so other devices don't fail connecting to localhost:8080
  if (typeof window !== 'undefined' && window.location) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal && str.includes('localhost:8080')) {
      str = str.replace('localhost:8080', `${window.location.hostname}:8080`);
    }
  }

  // Normalize /uploads/ paths to relative so it uses same-origin proxy (Vite :5173 or Gateway :8000)
  if (str.includes('/uploads/')) {
    const uploadIndex = str.indexOf('/uploads/');
    str = str.substring(uploadIndex);
  } else if (str.startsWith('uploads/')) {
    str = `/${str}`;
  }

  let finalUrl = str;

  if (retryCount > 0) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    return `${finalUrl}${separator}_r=${retryCount}`;
  }
  return finalUrl;
};

const QUICK_REACTIONS = ['❤️', '🔥', '👏', '😮', '😂', '🩺', '🐾'];

export function StoryModal({
  story,
  stories = [],
  onSelectStory,
  onClose,
  currentUser,
  doctors = [],
  connectedDoctors = [],
  connectedMap = {},
  onSendMessage,
  onUpdateStory,
  onDeleteStory
}) {
  // Filter for connected colleagues only, strictly excluding the current user ("not him itself")
  const colleagueDoctors = useMemo(() => {
    let effectiveUser = currentUser;
    if (!effectiveUser) {
      try {
        const stored = localStorage.getItem('doctor_vet_user');
        if (stored) effectiveUser = JSON.parse(stored);
      } catch (e) { }
    }

    const curId = effectiveUser?.id != null ? String(effectiveUser.id).replace(/\D/g, '') : '';
    const curName = effectiveUser?.name ? effectiveUser.name.toLowerCase().replace(/^dr\.?\s*/i, '').replace(/[^a-z0-9]/g, '') : '';
    const curEmail = effectiveUser?.email ? effectiveUser.email.toLowerCase().trim() : '';

    const isSelf = (d) => {
      if (!d) return true;
      const dId = d.id != null ? String(d.id).replace(/\D/g, '') : '';
      if (curId && dId && curId === dId) return true;
      const dName = d.name ? d.name.toLowerCase().replace(/^dr\.?\s*/i, '').replace(/[^a-z0-9]/g, '') : '';
      if (curName && dName && (curName === dName || curName.includes(dName) || dName.includes(curName))) return true;
      if (curEmail && d.email && curEmail === d.email.toLowerCase().trim()) return true;
      if (effectiveUser?.username && d.username && effectiveUser.username.toLowerCase() === d.username.toLowerCase()) return true;
      return false;
    };

    const isConnected = (d) => {
      if (!d || isSelf(d)) return false;
      const dId = d.id != null ? String(d.id).replace(/\D/g, '') : '';

      // Check connectedMap
      if (connectedMap && typeof connectedMap === 'object') {
        if (connectedMap[d.id] || connectedMap[`doc-${d.id}`] || (dId && (connectedMap[dId] || connectedMap[`doc-${dId}`]))) {
          return true;
        }
      }

      // Check connectedDoctors list
      if (Array.isArray(connectedDoctors) && connectedDoctors.length > 0) {
        return connectedDoctors.some(c => {
          if (isSelf(c)) return false;
          const cId = c.id != null ? String(c.id).replace(/\D/g, '') : '';
          if (dId && cId && dId === cId) return true;
          if (c.id === d.id) return true;
          const cName = c.name ? c.name.toLowerCase().replace(/^dr\.?\s*/i, '').replace(/[^a-z0-9]/g, '') : '';
          const dName = d.name ? d.name.toLowerCase().replace(/^dr\.?\s*/i, '').replace(/[^a-z0-9]/g, '') : '';
          if (cName && dName && (cName === dName || cName.includes(dName) || dName.includes(cName))) return true;
          if (c.email && d.email && c.email.toLowerCase().trim() === d.email.toLowerCase().trim()) return true;
          return false;
        });
      }
      return false;
    };

    // 1. Gather all connected doctors from doctors list
    const result = doctors.filter(d => isConnected(d) && !isSelf(d));

    // 2. Also ensure any connected doctor from connectedDoctors is included if not in doctors
    if (Array.isArray(connectedDoctors)) {
      connectedDoctors.forEach(cd => {
        if (!isSelf(cd)) {
          const cdId = cd.id != null ? String(cd.id).replace(/\D/g, '') : '';
          const already = result.some(r => {
            const rId = r.id != null ? String(r.id).replace(/\D/g, '') : '';
            return (rId && cdId && rId === cdId) || (r.id === cd.id) || (r.name === cd.name);
          });
          if (!already) {
            result.push(cd);
          }
        }
      });
    }

    return result.filter(d => !isSelf(d));
  }, [doctors, connectedDoctors, connectedMap, currentUser]);
  // Active story index in the stories list
  const activeStories = (stories && stories.length > 0) ? stories : (story ? [story] : []);
  const activeIndex = story ? activeStories.findIndex(s => s.id === story.id || String(s.id) === String(story.id)) : -1;
  const currentStory = (activeIndex !== -1 ? activeStories[activeIndex] : story) || {};

  const isVideo = Boolean(
    currentStory.videoUrl ||
    currentStory.mediaType === 'VIDEO' ||
    (currentStory.image && (
      /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(currentStory.image) ||
      currentStory.image.startsWith('data:video')
    )) ||
    (currentStory.mediaUrl && (
      /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(currentStory.mediaUrl) ||
      currentStory.mediaUrl.startsWith('data:video')
    ))
  );

  // Check if current user is the owner of this story
  const isStoryOwner = Boolean(currentStory.isOwner || (currentUser && (
    (currentStory.doctorId != null && (
      currentStory.doctorId === currentUser.id ||
      String(currentStory.doctorId).replace('doc-', '') === String(currentUser.id).replace('doc-', '')
    )) ||
    (currentStory.doctorName && currentUser.name && (
      currentStory.doctorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === currentUser.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim()
    )) ||
    (currentStory.doctorName && currentStory.doctorName.toLowerCase().includes('you')) ||
    currentStory.doctorId === 'doc-me'
  )));

  // Story playback states
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const viewedStoriesRef = useRef(new Set());
  const isLikingRef = useRef(false);
  const isSendingReplyRef = useRef(false);
  const isReplyingStaticRef = useRef(false);
  const [isReplying, setIsReplying] = useState(false);
  const replyHoldTimeoutRef = useRef(null);
  const [, setVideoDuration] = useState(0);

  // Clean up any pending reply hold timer when component unmounts
  useEffect(() => {
    return () => {
      if (replyHoldTimeoutRef.current) {
        clearTimeout(replyHoldTimeoutRef.current);
      }
    };
  }, []);

  // Like states
  // Media Loading & Error Recovery States
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState([]);
  const [doubleTapHeart, setDoubleTapHeart] = useState(null);

  // Share states
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sharesCount, setSharesCount] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sentDoctors, setSentDoctors] = useState({});

  // Viewers states (Story viewer count and list)
  const [viewsCount, setViewsCount] = useState(0);
  const [isViewersOpen, setIsViewersOpen] = useState(false);
  const [viewersList, setViewersList] = useState([]);
  const [viewerSearch, setViewerSearch] = useState('');
  const [loadingViewers, setLoadingViewers] = useState(false);

  // Reactions & Reply states
  const [replyText, setReplyText] = useState('');
  const [replyToast, setReplyToast] = useState('');
  const [showReactionsBar, setShowReactionsBar] = useState(false);

  // Story navigation handlers
  const handleNextStory = () => {
    if (replyHoldTimeoutRef.current) {
      clearTimeout(replyHoldTimeoutRef.current);
      replyHoldTimeoutRef.current = null;
    }
    setIsReplying(false);
    isReplyingStaticRef.current = false;
    if (activeIndex < activeStories.length - 1) {
      if (onSelectStory) onSelectStory(activeStories[activeIndex + 1]);
    } else {
      if (onClose) onClose();
    }
  };

  const handlePrevStory = () => {
    if (replyHoldTimeoutRef.current) {
      clearTimeout(replyHoldTimeoutRef.current);
      replyHoldTimeoutRef.current = null;
    }
    setIsReplying(false);
    isReplyingStaticRef.current = false;
    if (activeIndex > 0) {
      if (onSelectStory) onSelectStory(activeStories[activeIndex - 1]);
    }
  };

  // Sync state whenever active story changes
  useEffect(() => {
    if (!currentStory?.id) return;
    if (replyHoldTimeoutRef.current) {
      clearTimeout(replyHoldTimeoutRef.current);
      replyHoldTimeoutRef.current = null;
    }
    setIsReplying(false);
    isReplyingStaticRef.current = false;
    setVideoDuration(0);
    setIsLiked(!!currentStory.isLiked);
    setLikesCount(currentStory.likes || 0);
    setSharesCount(currentStory.shares || 0);
    setViewsCount(currentStory.views || 0);
    setProgress(0);
    setIsPaused(false);
    setIsShareOpen(false);
    setIsViewersOpen(false);
    setCopiedLink(false);
    setSentDoctors({});
    setReplyText('');
    setFloatingHearts([]);
    setDoubleTapHeart(null);
    setShowReactionsBar(false);
    setMediaLoading(true);
    setMediaError(false);
    setRetryCount(0);

    // Record view in backend automatically (ONLY for other users, NEVER for the story owner!)
    if (!isStoryOwner && !viewedStoriesRef.current.has(currentStory.id)) {
      viewedStoriesRef.current.add(currentStory.id);
      const viewerDoctorId = currentUser?.id ? Number(String(currentUser.id).replace('doc-', '')) : null;
      const viewerDoctorName = currentUser?.name || 'Dr. Colleague';
      const viewerDoctorAvatar = currentUser?.avatar || '';
      const viewerSpecialty = currentUser?.specialty || 'Veterinary Practitioner';

      if (viewerDoctorId) {
        api.stories.recordView(currentStory.id, viewerDoctorId, viewerDoctorName, viewerDoctorAvatar, viewerSpecialty)
          .then(res => {
            if (res && res.views != null) {
              setViewsCount(res.views);
              if (onUpdateStory) {
                onUpdateStory({ id: currentStory.id, views: res.views });
              }
            }
          })
          .catch(() => { });
      }
    }
  }, [currentStory?.id, isStoryOwner]);

  // Keep viewsCount accurately updated in real time as viewers change
  useEffect(() => {
    if (currentStory?.views != null) {
      setViewsCount(currentStory.views);
    }
  }, [currentStory?.views]);

  // Video event handlers: video progress is driven by actual playback timestamp, not arbitrary fixed timer
  const handleVideoLoadedMetadata = (e) => {
    const dur = e.target.duration;
    if (dur && !isNaN(dur) && isFinite(dur)) {
      setVideoDuration(dur);
    }
  };

  const handleVideoTimeUpdate = (e) => {
    const vid = e.target;
    if (vid && vid.duration && !isNaN(vid.duration) && isFinite(vid.duration)) {
      const pct = (vid.currentTime / vid.duration) * 100;
      setProgress(Math.min(100, pct));
    }
  };

  const handleVideoEnded = () => {
    // Only advance if not paused, not replying, and not holding after sending a reply
    if (isPaused || isReplying || isReplyingStaticRef.current || replyHoldTimeoutRef.current || replyText.trim()) {
      return;
    }
    setProgress(100);
    handleNextStory();
  };

  // Photo Story progress timer (pure state update without calling parent setState inside updater)
  const PHOTO_STORY_DURATION_MS = 7500;
  useEffect(() => {
    if (!story || isVideo || isPaused || isShareOpen || isViewersOpen || mediaLoading || mediaError || isReplying || isReplyingStaticRef.current || replyHoldTimeoutRef.current || replyText.trim()) return;

    const intervalMs = 50;
    const increment = (intervalMs / PHOTO_STORY_DURATION_MS) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + increment;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [story, isVideo, isPaused, isShareOpen, isViewersOpen, mediaLoading, mediaError, isReplying, replyText, currentStory?.id]);

  // When photo progress reaches 100%, advance to next story cleanly (unless paused or static reply mode)
  useEffect(() => {
    if (!isVideo && progress >= 100) {
      if (isPaused || isReplying || isReplyingStaticRef.current || replyHoldTimeoutRef.current || replyText.trim()) {
        return;
      }
      setProgress(0);
      handleNextStory();
    }
  }, [progress, isPaused, isReplying, isVideo, replyText]);

  // Prevent background scrolling when story modal is open (Issue 10)
  useEffect(() => {
    if (!story) return;
    document.body.classList.add('modal-open');

    return () => {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [story]);

  // Handle video autoplay, muting fallback, and play/pause state synchronization
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const vid = videoRef.current;

    if (isPaused || isReplying || isReplyingStaticRef.current || replyHoldTimeoutRef.current || replyText.trim()) {
      vid.pause();
    } else if (!mediaLoading && !mediaError) {
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[StoryModal] Autoplay unmuted was blocked by browser policy; trying muted:', err);
          vid.muted = true;
          setIsMuted(true);
          vid.play().catch(e => console.warn('[StoryModal] Muted autoplay also blocked:', e));
        });
      }
    }
  }, [isVideo, currentStory?.id, isPaused, isReplying, replyText, mediaLoading, mediaError, retryCount]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        handleNextStory();
      } else if (e.key === 'ArrowLeft') {
        handlePrevStory();
      } else if (e.key === 'Escape') {
        if (isViewersOpen) {
          setIsViewersOpen(false);
          setIsPaused(false);
        } else if (isShareOpen) {
          setIsShareOpen(false);
          setIsPaused(false);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === ' ' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, activeStories, isShareOpen, isViewersOpen]);

  // Spawn floating emoji/heart particle
  const spawnFloatingParticles = (itemOrSymbol = '❤️', x = null, y = null) => {
    const id = Date.now() + Math.random();
    const isObj = typeof itemOrSymbol === 'object' && itemOrSymbol !== null;
    const newParticle = {
      id,
      symbol: isObj ? itemOrSymbol.label : itemOrSymbol,
      icon: isObj ? itemOrSymbol.icon : null,
      x: x !== null ? x : 50 + (Math.random() * 20 - 10),
      size: isObj ? 32 : (itemOrSymbol === '❤️' ? (18 + Math.floor(Math.random() * 12)) : 24),
      rotation: Math.floor(Math.random() * 36 - 18)
    };
    setFloatingHearts(prev => [...prev.slice(-6), newParticle]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h.id !== id));
    }, 1200);
  };

  // Like / Unlike action
  // Like / Unlike action with duplicate-click protection and remote sync
  const handleToggleLike = async (e) => {
    if (e) e.stopPropagation();
    if (isLikingRef.current) return;
    isLikingRef.current = true;

    const nextLiked = !isLiked;
    const nextCount = nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

    setIsLiked(nextLiked);
    setLikesCount(nextCount);
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 450);

    if (nextLiked) {
      spawnFloatingParticles('❤️');
    }

    if (onUpdateStory) {
      onUpdateStory({ id: currentStory.id, likes: nextCount, isLiked: nextLiked });
    }

    const doctorId = currentUser?.id ? Number(String(currentUser.id).replace('doc-', '')) : 1;
    const doctorName = currentUser?.name || 'Dr. You';

    try {
      await api.stories.toggleLike(currentStory.id, doctorId, doctorName);
      const res = await api.stories.toggleLike(currentStory.id, doctorId, doctorName);
      if (res && res.likes != null) {
        setLikesCount(res.likes);
        setIsLiked(Boolean(res.isLiked));
        if (onUpdateStory) {
          onUpdateStory({ id: currentStory.id, likes: res.likes, isLiked: Boolean(res.isLiked) });
        }
      }
    } catch (err) {
      console.warn('Story like remote sync notice:', err);
    } finally {
      setTimeout(() => {
        isLikingRef.current = false;
      }, 300);
    }
  };

  // Double tap to like on story media
  const handleMediaTouchOrClick = (e) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap triggered
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
      const y = e.clientY ? ((e.clientY - rect.top) / rect.height) * 100 : 50;

      setDoubleTapHeart({ x, y, id: now });
      setTimeout(() => setDoubleTapHeart(null), 900);

      if (!isLiked) {
        handleToggleLike();
      } else {
        spawnFloatingParticles('❤️', x, y);
      }
    }
    lastTapRef.current = now;
  };

  // Story Reactions
  const handleSendReaction = (item) => {
    spawnFloatingParticles(item);
    setShowReactionsBar(false);

    const label = item?.label || (typeof item === 'string' ? item : 'Reaction');
    const receiverId = currentStory.doctorId ? Number(String(currentStory.doctorId).replace('doc-', '')) : null;
    const rawMedia = currentStory.videoUrl || currentStory.image || currentStory.mediaUrl || '';
    const media = resolveMediaUrl(rawMedia);
    const isVid = Boolean(currentStory.videoUrl || currentStory.mediaType === 'VIDEO' || isVideo || (media && /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(media)));
    if (onSendMessage && receiverId) {
      onSendMessage({
        receiverId,
        storyId: currentStory.id,
        text: `Reacted with ${label} to your story`,
        attachmentUrl: media,
        attachmentType: isVid ? 'VIDEO' : 'IMAGE'
      });
    }

    setReplyToast(`Sent ${label}!`);
    setTimeout(() => setReplyToast(''), 2500);
  };

  // Story Viewers Drawer
  const handleOpenViewers = async () => {
    setIsViewersOpen(true);
    setIsPaused(true);
    setLoadingViewers(true);
    try {
      const data = await api.stories.getViewers(currentStory.id);
      // Filter out any potential owner entry defensively on the client as well
      const ownerDocId = currentStory.doctorId != null ? String(currentStory.doctorId).replace('doc-', '') : null;
      const ownerName = currentStory.doctorName ? currentStory.doctorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim() : '';
      const cleanList = (data || []).filter(v => {
        if (!v) return false;
        if (ownerDocId && String(v.viewerDoctorId).replace('doc-', '') === ownerDocId) return false;
        if (ownerName && v.viewerDoctorName && v.viewerDoctorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === ownerName) return false;
        return true;
      });
      setViewersList(cleanList);
      setViewsCount(cleanList.length);
      if (onUpdateStory) {
        onUpdateStory({ id: currentStory.id, views: cleanList.length });
      }
    } catch (e) {
      setViewersList([]);
    } finally {
      setLoadingViewers(false);
    }
  };

  // Share story: copy link
  const handleCopyStoryLink = () => {
    const url = `${window.location.origin}/?story=${currentStory.id}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => { });
    }
    setCopiedLink(true);
    setSharesCount(prev => prev + 1);
    if (onUpdateStory) onUpdateStory({ id: currentStory.id, shares: sharesCount + 1 });
    api.stories.recordShare(currentStory.id).catch(() => { });
    setTimeout(() => setCopiedLink(false), 2400);
  };

  // Share story: native device share
  const handleNativeShare = async () => {
    const url = `${window.location.origin}/?story=${currentStory.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Dr. ${currentStory.doctorName}'s Story on Zenve Vet`,
          text: currentStory.caption || 'Moments from clinical veterinary practice on Zenve Vet',
          url
        });
        setSharesCount(prev => prev + 1);
        if (onUpdateStory) onUpdateStory({ id: currentStory.id, shares: sharesCount + 1 });
        api.stories.recordShare(currentStory.id).catch(() => { });
      } catch (err) {
        // User cancelled share
      }
    } else {
      handleCopyStoryLink();
    }
  };

  // Direct share to a colleague doctor
  const handleSendToDoctor = async (doc) => {
    if (sentDoctors[doc.id]) return;

    setSentDoctors(prev => ({ ...prev, [doc.id]: true }));
    setSharesCount(prev => prev + 1);
    if (onUpdateStory) onUpdateStory({ id: currentStory.id, shares: sharesCount + 1 });
    api.stories.recordShare(currentStory.id).catch(() => { });

    const receiverId = doc.id ? Number(String(doc.id).replace('doc-', '')) : null;
    const shareMessage = `Shared a 24h story by Dr. ${currentStory.doctorName}:\n"${currentStory.caption || 'Clinical update'}"\n${window.location.origin}/?story=${currentStory.id}`;
    const rawMedia = currentStory.videoUrl || currentStory.image || currentStory.mediaUrl || '';
    const media = resolveMediaUrl(rawMedia);
    const isVid = Boolean(currentStory.videoUrl || currentStory.mediaType === 'VIDEO' || isVideo || (media && /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(media)));

    if (onSendMessage) {
      onSendMessage({
        receiverId,
        storyId: currentStory.id,
        text: shareMessage,
        attachmentUrl: media,
        attachmentType: isVid ? 'VIDEO' : 'IMAGE'
      });
    }

    setReplyToast(`Story shared with Dr. ${doc.name.replace(/^dr\.?\s*/i, '')}!`);
    setTimeout(() => setReplyToast(''), 3000);
  };

  // Submit reply message: maintains static story position, attaches storyId, prevents premature termination
  const handleSendReply = (e) => {
    if (e) e.preventDefault();
    const text = replyText.trim();
    if (!text || isSendingReplyRef.current) return;

    isSendingReplyRef.current = true;
    if (replyHoldTimeoutRef.current) {
      clearTimeout(replyHoldTimeoutRef.current);
      replyHoldTimeoutRef.current = null;
    }
    // Lock current story in static position — never auto-advance, reset, or close
    setIsReplying(true);
    isReplyingStaticRef.current = true;
    setIsPaused(true);

    const receiverId = currentStory.doctorId ? Number(String(currentStory.doctorId).replace('doc-', '')) : null;
    const rawMedia = currentStory.videoUrl || currentStory.image || currentStory.mediaUrl || '';
    const media = resolveMediaUrl(rawMedia);
    const isVid = Boolean(currentStory.videoUrl || currentStory.mediaType === 'VIDEO' || isVideo || (media && /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(media)));

    if (onSendMessage) {
      onSendMessage({
        receiverId,
        storyId: currentStory.id,
        text: `Replied to your story: "${text}"`,
        attachmentUrl: media,
        attachmentType: isVid ? 'VIDEO' : 'IMAGE'
      });
    }

    // Immediately clear input so the user can send multiple replies
    setReplyText('');
    setReplyToast(`Reply sent to Dr. ${currentStory.doctorName || 'colleague'}!`);

    // Reset sending lock quickly to allow immediate subsequent replies
    setTimeout(() => {
      isSendingReplyRef.current = false;
    }, 400);

    // After 2.2s confirmation toast, resume playback smoothly from exact position left off (if input is not re-focused)
    replyHoldTimeoutRef.current = setTimeout(() => {
      setReplyToast('');
      setIsReplying(false);
      isReplyingStaticRef.current = false;

      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (!isInputActive && !isShareOpen && !isViewersOpen) {
        setIsPaused(false);
        if (isVideo && videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }
    }, 2200);
  };

  // Delete current story
  const handleDeleteCurrentStory = async (e) => {
    if (e) e.stopPropagation();
    setIsPaused(true);
    const confirmed = await showZenveConfirm({ title: 'Delete 24h Story?', message: 'Are you sure you want to delete this 24-hour story? It will be permanently removed.', confirmText: 'Delete Story', cancelText: 'Keep Story', isDestructive: true });
    if (!confirmed) {
      setIsPaused(false);
      return;
    }
    const storyIdToDelete = currentStory.id;
    if (onDeleteStory) {
      await onDeleteStory(storyIdToDelete);
    }
    if (activeStories.length > 1) {
      if (activeIndex < activeStories.length - 1) {
        handleNextStory();
      } else if (activeIndex > 0) {
        handlePrevStory();
      } else {
        if (onClose) onClose();
      }
    } else {
      if (onClose) onClose();
    }
  };

  const filteredViewers = viewersList.filter(v => {
    if (!viewerSearch.trim()) return true;
    const q = viewerSearch.toLowerCase();
    return (
      (v.viewerDoctorName && v.viewerDoctorName.toLowerCase().includes(q)) ||
      (v.viewerSpecialty && v.viewerSpecialty.toLowerCase().includes(q))
    );
  });

  if (!story) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      style={{ zIndex: 12000, overflow: 'hidden' }}
    >
      <style>{`
        @keyframes heartPulse {
          0% { transform: scale(1); }
          45% { transform: scale(1.35); }
          75% { transform: scale(0.92); }
          100% { transform: scale(1); }
        }
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0) scale(0.8) rotate(0deg); }
          50% { opacity: 0.95; transform: translateY(-70px) scale(1.15) rotate(-10deg); }
          100% { opacity: 0; transform: translateY(-140px) scale(1.35) rotate(15deg); }
        }
        @keyframes bigHeartBurst {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
          75% { opacity: 0.95; transform: translate(-50%, -50%) scale(1.05); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.4); }
        }
        @keyframes toastFade {
          0% { opacity: 0; transform: translate(-50%, 15px); }
          15% { opacity: 1; transform: translate(-50%, 0); }
          85% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Left Desktop Nav Button */}
      {activeIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); handlePrevStory(); }}
          style={{
            position: 'absolute',
            left: 'calc(50% - 240px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.18)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 12010,
            transition: 'all 0.2s ease'
          }}
          title="Previous story (Left arrow)"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Right Desktop Nav Button */}
      {activeIndex < activeStories.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); handleNextStory(); }}
          style={{
            position: 'absolute',
            right: 'calc(50% - 240px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.18)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 12010,
            transition: 'all 0.2s ease'
          }}
          title="Next story (Right arrow)"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Main Story Phone Simulator Card */}
      <div
        style={{
          width: '390px',
          maxWidth: '94vw',
          height: '670px',
          maxHeight: '92vh',
          backgroundColor: '#000000',
          borderRadius: '24px',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)',
          animation: 'modalPop 0.25s ease',
          userSelect: 'none'
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          if (e.target.closest('input, textarea, button, form')) return;
          setIsPaused(true);
        }}
        onMouseUp={(e) => {
          if (e.target.closest('input, textarea, button, form')) return;
          const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
          const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
          if (!isReplying && !isReplyingStaticRef.current && !replyHoldTimeoutRef.current && !replyText.trim() && !isInputActive && !isShareOpen && !isViewersOpen) {
            setIsPaused(false);
          }
        }}
        onTouchStart={(e) => {
          if (e.target.closest('input, textarea, button, form')) return;
          setIsPaused(true);
        }}
        onTouchEnd={(e) => {
          if (e.target.closest('input, textarea, button, form')) return;
          const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
          const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
          if (!isReplying && !isReplyingStaticRef.current && !replyHoldTimeoutRef.current && !replyText.trim() && !isInputActive && !isShareOpen && !isViewersOpen) {
            setIsPaused(false);
          }
        }}
      >
        {/* Story Multi-Segment Progress Bars */}
        <div style={{
          position: 'absolute',
          top: 14,
          left: 14,
          right: 14,
          display: 'flex',
          gap: 4,
          zIndex: 30
        }}>
          {activeStories.map((s, idx) => {
            let fillPercent = 0;
            if (idx < activeIndex) fillPercent = 100;
            else if (idx === activeIndex) fillPercent = progress;

            return (
              <div
                key={s.id || idx}
                style={{
                  height: 3,
                  flex: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.32)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectStory) onSelectStory(s);
                }}
              >
                <div style={{
                  height: '100%',
                  width: `${fillPercent}%`,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 2,
                  transition: idx === activeIndex ? 'width 50ms linear' : 'none'
                }} />
              </div>
            );
          })}
        </div>

        {/* Story Top Header Bar */}
        <div style={{
          position: 'absolute',
          top: 26,
          left: 14,
          right: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              src={currentStory.avatar}
              name={currentStory.doctorName || currentStory.fullDoctorName}
              size={38}
              style={{ border: '2px solid #10B981', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 13.5,
                  margin: 0,
                  textShadow: '0 1px 3px rgba(0,0,0,0.85)'
                }}>
                  {currentStory.fullDoctorName || currentStory.doctorName}
                </p>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(16, 185, 129, 0.25)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(16, 185, 129, 0.6)',
                  color: '#a7f3d0',
                  fontSize: 9.5,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 6
                }}>
                  VET
                </span>
              </div>
              <span style={{
                color: 'rgba(255,255,255,0.78)',
                fontSize: 11,
                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
              }}>
                {currentStory.time || '24h Story'} · Tap to pause
              </span>
            </div>
          </div>

          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Play / Pause Toggle */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setIsPaused(p => !p); }}
              style={{
                color: '#FFFFFF',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title={isPaused ? "Play story" : "Pause story"}
            >
              {isPaused ? <Play size={14} fill="#FFF" /> : <Pause size={14} fill="#FFF" />}
            </button>

            {/* Video Mute Toggle */}
            {isVideo && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (videoRef.current) {
                    videoRef.current.muted = nextMuted;
                    if (!nextMuted) {
                      videoRef.current.play().catch(() => { });
                    }
                  }
                }}
                style={{
                  color: '#FFFFFF',
                  background: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title={isMuted ? "Unmute audio" : "Mute audio"}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            )}

            {/* Owner Story Delete Button */}
            {isStoryOwner && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={handleDeleteCurrentStory}
                style={{
                  color: '#FFFFFF',
                  background: 'rgba(220, 38, 38, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(254, 202, 202, 0.45)',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.45)',
                  transition: 'all 0.15s ease'
                }}
                title="Delete your story"
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Close Button */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); if (onClose) onClose(); }}
              style={{
                color: '#FFFFFF',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Close story"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Story Media with Ambient Backdrop & Tap Zone */}
        <div
          style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer', backgroundColor: '#000000', overflow: 'hidden' }}
          onClick={handleMediaTouchOrClick}
        >
          {/* Ambient Blurred Background to ensure 100% full content framing without letterbox black voids */}
          <div
            style={{
              position: 'absolute',
              inset: -16,
              overflow: 'hidden',
              pointerEvents: 'none',
              zIndex: 1,
              filter: 'blur(28px) brightness(0.42)',
              transform: 'scale(1.15)',
              display: mediaError ? 'none' : 'block',
              opacity: mediaLoading ? 0 : 1,
              transition: 'opacity 0.25s ease'
            }}
          >
            {isVideo ? (
              <video
                src={resolveMediaUrl(currentStory.videoUrl || currentStory.image || currentStory.mediaUrl, retryCount)}
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <img
                src={resolveMediaUrl(currentStory.image || currentStory.mediaUrl, retryCount)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>

          {isVideo ? (
            <video
              ref={videoRef}
              key={`vid-${currentStory.id}-${retryCount}`}
              src={resolveMediaUrl(currentStory.videoUrl || currentStory.image || currentStory.mediaUrl, retryCount)}
              autoPlay
              muted={isMuted}
              playsInline
              preload="auto"
              onLoadedMetadata={handleVideoLoadedMetadata}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              onLoadedData={() => {
                setMediaLoading(false);
                setMediaError(false);
              }}
              onCanPlay={() => {
                setMediaLoading(false);
              }}
              onWaiting={() => {
                setMediaLoading(true);
              }}
              onPlaying={() => {
                setMediaLoading(false);
                setMediaError(false);
              }}
              onError={(e) => {
                console.error('[StoryModal] Video playback error for story:', currentStory.id, e);
                setMediaLoading(false);
                setMediaError(true);
              }}
              style={{
                position: 'relative',
                zIndex: 2,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: mediaError ? 'none' : 'block',
                opacity: mediaLoading ? 0 : 1,
                transition: 'opacity 0.2s ease'
              }}
            />
          ) : (
            <img
              key={`img-${currentStory.id}-${retryCount}`}
              src={resolveMediaUrl(currentStory.image || currentStory.mediaUrl, retryCount)}
              alt={currentStory.caption || 'Clinical story'}
              onLoad={() => {
                setMediaLoading(false);
                setMediaError(false);
              }}
              onError={(e) => {
                console.error('[StoryModal] Image load error for story:', currentStory.id, e);
                setMediaLoading(false);
                setMediaError(true);
              }}
              style={{
                position: 'relative',
                zIndex: 2,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: mediaError ? 'none' : 'block',
                opacity: mediaLoading ? 0 : 1,
                transition: 'opacity 0.2s ease'
              }}
            />
          )}

          {/* Loading Indicator Spinner: Eliminates blank/black screen while loading media */}
          {mediaLoading && !mediaError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(8px)',
                zIndex: 20,
                color: '#FFFFFF'
              }}
            >
              <Loader2 size={38} color="#10B981" className="zenve-spin" style={{ marginBottom: 12 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E5E7EB', letterSpacing: '0.2px' }}>
                Loading story...
              </span>
            </div>
          )}

          {/* Media Error State Screen: Replaces black screen with interactive recovery UI */}
          {mediaError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#111827',
                zIndex: 25,
                padding: '24px',
                textAlign: 'center',
                color: '#FFFFFF'
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14
                }}
              >
                <AlertCircle size={28} color="#EF4444" />
              </div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>
                Unable to Display Story
              </h4>
              <p style={{ margin: '0 0 20px 0', fontSize: 12, color: '#9CA3AF', maxWidth: 260, lineHeight: 1.4 }}>
                The uploaded media could not be retrieved or is in an unsupported format.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMediaError(false);
                    setMediaLoading(true);
                    setRetryCount(c => c + 1);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#10B981',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Try Again</span>
                </button>
                {activeStories.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextStory();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255,255,255,0.2)',
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span>Next Story</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Left / Right Tap Navigation Hotspots */}
          <div
            style={{ position: 'absolute', top: 80, bottom: 120, left: 0, width: '25%', zIndex: 15 }}
            onClick={(e) => { e.stopPropagation(); handlePrevStory(); }}
            title="Previous story"
          />
          <div
            style={{ position: 'absolute', top: 80, bottom: 120, right: 0, width: '25%', zIndex: 15 }}
            onClick={(e) => { e.stopPropagation(); handleNextStory(); }}
            title="Next story"
          />

          {/* Double-tap large pulsing heart burst */}
          {doubleTapHeart && (
            <div
              style={{
                position: 'absolute',
                top: `${doubleTapHeart.y}%`,
                left: `${doubleTapHeart.x}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 40,
                pointerEvents: 'none',
                animation: 'bigHeartBurst 0.85s ease-out forwards',
                filter: 'drop-shadow(0 6px 20px rgba(239,68,68,0.7))'
              }}
            >
              <img src={likePuppy} alt="Liked" style={{ width: 88, height: 88, objectFit: 'contain' }} />
            </div>
          )}

          {/* Floating heart/emoji particles on like or reaction */}
          {floatingHearts.map(h => (
            <div
              key={h.id}
              style={{
                position: 'absolute',
                bottom: 85,
                right: 56,
                zIndex: 35,
                pointerEvents: 'none',
                animation: 'floatUp 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards',
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                fontSize: h.size
              }}
            >
              {h.icon ? (
                <img src={h.icon} alt={h.symbol} style={{ width: h.size, height: h.size, objectFit: 'contain' }} />
              ) : h.symbol === '❤️' ? (
                <img src={likePuppy} alt="Like" style={{ width: h.size, height: h.size, objectFit: 'contain' }} />
              ) : (
                <span>{h.symbol}</span>
              )}
            </div>
          ))}
        </div>

        {/* Temporary Feedback Notification Toast */}
        {replyToast && (
          <div style={{
            position: 'absolute',
            top: 76,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(16, 185, 129, 0.95)',
            backdropFilter: 'blur(12px)',
            color: '#FFFFFF',
            padding: '7px 16px',
            borderRadius: 20,
            fontSize: 12.5,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            zIndex: 45,
            animation: 'toastFade 3s ease forwards'
          }}>
            <Sparkles size={14} />
            <span>{replyToast}</span>
          </div>
        )}

        {/* Story Viewers Bar (for Story Owner) */}
        {isStoryOwner && (
          <div style={{
            position: 'absolute',
            bottom: 74,
            left: 14,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            zIndex: 35
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenViewers();
              }}
              style={{
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                borderRadius: 20,
                padding: '5px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                transition: 'all 0.2s ease'
              }}
              title="See who viewed your story"
            >
              <Eye size={15} color="#34D399" />
              <span>{viewsCount} {viewsCount === 1 ? 'Viewer' : 'Viewers'}</span>
            </button>
          </div>
        )}

        {/* Quick Reactions Bar Popup */}
        {/* Quick Reactions Bar Popup with all 6 Like and 6 Dislike options */}
        {showReactionsBar && (
          <div
            style={{
              position: 'absolute',
              bottom: 74,
              left: 12,
              right: 12,
              background: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 22,
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              zIndex: 38,
              animation: 'modalPop 0.2s ease',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Likes Row */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
                Likes & Hearts
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {LIKE_REACTIONS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSendReaction(item)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 3,
                      transition: 'transform 0.15s ease'
                    }}
                    title={item.label}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <img src={item.icon} alt={item.label} style={{ width: 30, height: 30, objectFit: 'contain' }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Dislikes Row */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
                Dislikes & Grumpy
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {DISLIKE_REACTIONS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSendReaction(item)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 3,
                      transition: 'transform 0.15s ease'
                    }}
                    title={item.label}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <img src={item.icon} alt={item.label} style={{ width: 30, height: 30, objectFit: 'contain' }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Story Action & Engagement Bar */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '24px 14px 18px 14px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 65%, rgba(0,0,0,0) 100%)',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          zIndex: 30
        }}>
          {/* Story Caption */}
          {currentStory.caption && (
            <p
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => {
                if (!isReplying && !isReplyingStaticRef.current && !replyHoldTimeoutRef.current && !replyText.trim() && !isShareOpen && !isViewersOpen) {
                  setIsPaused(false);
                }
              }}
              onTouchStart={(e) => { e.stopPropagation(); setIsPaused(true); }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                if (!isReplying && !isReplyingStaticRef.current && !replyHoldTimeoutRef.current && !replyText.trim() && !isShareOpen && !isViewersOpen) {
                  setIsPaused(false);
                }
              }}
              style={{
                fontSize: 13.5,
                fontWeight: 500,
                margin: 0,
                lineHeight: 1.45,
                color: '#F9FAFB',
                textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                maxHeight: '60px',
                overflowY: 'auto'
              }}
            >
              {currentStory.caption}
            </p>
          )}

          {/* Controls: Reply Input + Smile Reaction + Like + Share */}
          <div
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {/* Direct Message / Reply Form */}
            <form
              onSubmit={handleSendReply}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.16)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                borderRadius: 24,
                padding: '4px 6px 4px 12px'
              }}
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => {
                  if (replyHoldTimeoutRef.current) {
                    clearTimeout(replyHoldTimeoutRef.current);
                    replyHoldTimeoutRef.current = null;
                  }
                  setReplyText(e.target.value);
                  setIsReplying(true);
                  isReplyingStaticRef.current = true;
                  setIsPaused(true);
                }}
                onFocus={() => {
                  if (replyHoldTimeoutRef.current) {
                    clearTimeout(replyHoldTimeoutRef.current);
                    replyHoldTimeoutRef.current = null;
                  }
                  setIsReplying(true);
                  isReplyingStaticRef.current = true;
                  setIsPaused(true);
                }}
                onBlur={() => {
                  if (replyText.trim() || isReplying || isReplyingStaticRef.current || replyHoldTimeoutRef.current || isShareOpen || isViewersOpen) {
                    setIsPaused(true);
                    return;
                  }
                  setIsPaused(false);
                }}
                placeholder={`Reply to Dr. ${currentStory.doctorName}...`}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReactionsBar(b => !b);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.7)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title="React with emoji"
              >
                <Smile size={18} />
              </button>
              <button
                type="submit"
                disabled={!replyText.trim()}
                style={{
                  background: replyText.trim() ? '#10B981' : 'transparent',
                  border: 'none',
                  color: replyText.trim() ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: replyText.trim() ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
                title="Send reply"
              >
                <Send size={15} />
              </button>
            </form>

            {/* Like Button */}
            <button
              onClick={handleToggleLike}
              style={{
                background: isLiked ? 'rgba(245, 158, 11, 0.22)' : 'rgba(255, 255, 255, 0.16)',
                backdropFilter: 'blur(12px)',
                border: `1.5px solid ${isLiked ? '#F59E0B' : 'rgba(255, 255, 255, 0.35)'}`,
                width: 42,
                height: 42,
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isLiked ? '#EF4444' : '#FFFFFF',
                transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                animation: heartAnim ? 'heartPulse 0.4s ease' : 'none',
                position: 'relative'
              }}
              title={isLiked ? "Unlike story" : "Like story"}
            >
              <img
                src={likePuppy}
                alt="Like"
                style={{
                  width: 24,
                  height: 24,
                  objectFit: 'contain',
                  filter: isLiked
                    ? 'drop-shadow(0 2px 6px rgba(245, 158, 11, 0.5))'
                    : 'grayscale(100%) opacity(0.75)',
                  transform: isLiked ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
              />
              {likesCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -6,
                  right: -4,
                  background: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: 9.5,
                  fontWeight: 800,
                  borderRadius: 10,
                  padding: '1px 5px',
                  boxShadow: '0 2px 5px rgba(239,68,68,0.5)'
                }}>
                  {likesCount}
                </span>
              )}
            </button>

            {/* Share Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsShareOpen(true);
                setIsPaused(true);
              }}
              style={{
                background: isShareOpen ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.16)',
                backdropFilter: 'blur(12px)',
                border: `1.5px solid ${isShareOpen ? '#10B981' : 'rgba(255, 255, 255, 0.35)'}`,
                width: 42,
                height: 42,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isShareOpen ? '#34D399' : '#FFFFFF',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              title="Share story"
            >
              <Share2 size={19} />
              {sharesCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -6,
                  right: -4,
                  background: '#10B981',
                  color: '#FFFFFF',
                  fontSize: 9.5,
                  fontWeight: 800,
                  borderRadius: 10,
                  padding: '1px 5px',
                  boxShadow: '0 2px 5px rgba(16,185,129,0.5)'
                }}>
                  {sharesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ====================================================================== */}
        {/* Story Viewers Sheet Modal ("User view how many people view story") */}
        {/* ====================================================================== */}
        {isViewersOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#0F172A',
              borderTop: '1px solid rgba(255,255,255,0.18)',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '18px 16px 20px 16px',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: '68%',
              boxShadow: '0 -15px 50px rgba(0,0,0,0.8)',
              animation: 'slideUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={18} color="#10B981" />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                  Story Viewers ({viewersList.length})
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsViewersOpen(false);
                  setIsPaused(false);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#FFFFFF',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Viewer Search Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '6px 10px'
            }}>
              <Search size={14} color="#94A3B8" />
              <input
                type="text"
                placeholder="Search viewers..."
                value={viewerSearch}
                onChange={(e) => setViewerSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: 12.5,
                  outline: 'none',
                  width: '100%'
                }}
              />
            </div>

            {/* Viewers List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 140,
              maxHeight: 250,
              paddingRight: 4
            }}>
              {loadingViewers ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: 13 }}>
                  Loading story viewers...
                </div>
              ) : filteredViewers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 12px', color: '#94A3B8' }}>
                  <Users size={32} color="#64748B" style={{ margin: '0 auto 8px' }} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                    {viewerSearch ? 'No viewers matching your search' : 'No viewers yet'}
                  </p>
                  <span style={{ fontSize: 11.5, color: '#64748B' }}>
                    Veterinarians who view your 24h story will appear here.
                  </span>
                </div>
              ) : (
                filteredViewers.map(v => (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar
                        src={v.viewerDoctorAvatar}
                        name={v.viewerDoctorName}
                        size={34}
                      />
                      <div style={{ textAlign: 'left' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
                          {v.viewerDoctorName}
                        </p>
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>
                          {v.viewerSpecialty || 'Veterinary Practitioner'}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                      Viewed
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Zenve Vet Interactive Share Sheet Drawer */}
        {isShareOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#0F172A',
              borderTop: '1px solid rgba(255,255,255,0.15)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: '18px 16px 20px 16px',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
              animation: 'slideUp 0.22s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Share Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Share2 size={17} color="#10B981" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>
                  Share 24h Story
                </span>
              </div>
              <button
                onClick={() => {
                  setIsShareOpen(false);
                  setIsPaused(false);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#FFFFFF',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Actions: Copy Link & Native Share */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCopyStoryLink}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 12px',
                  borderRadius: 12,
                  backgroundColor: copiedLink ? '#065F46' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${copiedLink ? '#10B981' : 'rgba(255,255,255,0.15)'}`,
                  color: copiedLink ? '#A7F3D0' : '#FFFFFF',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {copiedLink ? <Check size={15} color="#34D399" /> : <Copy size={15} />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
              </button>

              <button
                onClick={handleNativeShare}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 12px',
                  borderRadius: 12,
                  backgroundColor: '#10B981',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <Share2 size={15} />
                <span>Share Via...</span>
              </button>
            </div>

            {/* Send Directly to Colleague Doctors */}
            <div>
              <span style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                display: 'block',
                marginBottom: 8
              }}>
                Send to Veterinarian Colleagues
              </span>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 180,
                overflowY: 'auto',
                paddingRight: 4
              }}>
                {colleagueDoctors.length > 0 ? (
                  colleagueDoctors.map(doc => {
                    const isSent = !!sentDoctors[doc.id];
                    return (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: 10,
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar
                            src={doc.avatar}
                            name={doc.name}
                            size={32}
                          />
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ fontSize: 12.5, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
                              {doc.name}
                            </p>
                            <span style={{ fontSize: 11, color: '#94A3B8' }}>
                              {doc.specialty || 'Veterinary Practitioner'}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSendToDoctor(doc)}
                          disabled={isSent}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 8,
                            backgroundColor: isSent ? 'rgba(16, 185, 129, 0.2)' : '#10B981',
                            border: `1px solid ${isSent ? '#10B981' : 'transparent'}`,
                            color: isSent ? '#34D399' : '#FFFFFF',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: isSent ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          {isSent ? (
                            <>
                              <Check size={12} />
                              <span>Sent</span>
                            </>
                          ) : (
                            <span>Send</span>
                          )}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div style={{
                    padding: '16px 12px',
                    textAlign: 'center',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: 10,
                    border: '1px dashed rgba(255,255,255,0.1)'
                  }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>
                      No connected colleagues yet
                    </p>
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      Connect with colleagues in the Vet Network to share stories directly.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

