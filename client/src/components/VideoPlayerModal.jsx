import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Heart, 
  MessageSquare, 
  Bookmark, 
  Play, 
  Pause, 
  Send, 
  Stethoscope,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { Avatar } from './Avatar';
import { api } from '../services/api';
import { resolveMediaUrl } from '../utils/mediaUrl';
import likePuppy from '../assets/reactions/like_puppy.png';
import sadPuppy from '../assets/reactions/sad_puppy.png';

export function VideoPlayerModal({ 
  video, 
  videos = [], 
  onClose, 
  onSelectVideo, 
  currentUser, 
  doctors = [] 
}) {
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [likesCount, setLikesCount] = useState(() => Number(video?.likes) || 0);
  const [dislikesCount, setDislikesCount] = useState(() => Number(video?.dislikes) || 0);
  const [isSaved, setIsSaved] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Playback & Buffering states
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('0:00');
  const [durationStr, setDurationStr] = useState('0:00');

  const videoRef = useRef(null);

  // Background scroll lock when video player modal is open
  useEffect(() => {
    if (!video) return;
    document.body.classList.add('modal-open');

    return () => {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [video]);
  const videoPlayerAreaRef = useRef(null);
  const lastWheelTimeRef = useRef(0);

  // Calculate currentIndex in video list for Next/Previous Reel navigation
  const currentIndex = videos && videos.length > 0
    ? videos.findIndex(v => v.id === video?.id || String(v.id) === String(video?.id))
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < videos.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev && onSelectVideo) {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (_) {}
      }
      onSelectVideo(videos[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, videos, onSelectVideo]);

  const handleNext = useCallback(() => {
    if (hasNext && onSelectVideo) {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (_) {}
      }
      onSelectVideo(videos[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, videos, onSelectVideo]);

  // Pause all background feed videos when this Reel viewer is opened or changes
  useEffect(() => {
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach(v => {
      if (v !== videoRef.current) {
        try { v.pause(); } catch (_) {}
      }
    });
  }, [video?.id]);

  const videoVoteRef = useRef(null);
  const videoVoteTimerRef = useRef(null);
  const videoVoteVersionRef = useRef(0);

  // Synchronize authoritative like/dislike status & counts
  useEffect(() => {
    if (!video) return;
    videoVoteRef.current = null;
    setLikesCount(Number(video.likes) || 0);
    setDislikesCount(Number(video.dislikes) || 0);
    setIsLiked(Boolean(video.isLiked));
    setIsDisliked(Boolean(video.isDisliked));
  }, [video?.id, video?.likes, video?.dislikes, video?.isLiked, video?.isDisliked, currentUser?.id]);

  const handleToggleVote = async (e, requestedVote) => {
    if (e) e.stopPropagation();
    if (!video?.id) return;
    const docId = currentUser?.id ? String(currentUser.id).replace(/\D/g, '') : '1';

    // 1. Read most recent optimistic state if consecutive clicks occur rapidly
    const pending = videoVoteRef.current;
    const curLiked = pending ? pending.isLiked : isLiked;
    const curDisliked = pending ? pending.isDisliked : isDisliked;
    const curLikes = pending ? pending.likes : likesCount;
    const curDislikes = pending ? pending.dislikes : dislikesCount;

    let nextLiked = curLiked;
    let nextDisliked = curDisliked;
    let nextLikes = curLikes;
    let nextDislikes = curDislikes;
    let voteTypeToSend = requestedVote;
    let reactionToSend = requestedVote === 'LIKE' ? 'like_puppy' : 'sad_puppy';

    if (requestedVote === 'LIKE') {
      if (curLiked) {
        // Toggle off
        nextLiked = false;
        nextLikes = Math.max(0, curLikes - 1);
        voteTypeToSend = null;
        reactionToSend = null;
      } else if (curDisliked) {
        // Switch from dislike to like
        nextLiked = true;
        nextDisliked = false;
        nextLikes = curLikes + 1;
        nextDislikes = Math.max(0, curDislikes - 1);
      } else {
        // New like
        nextLiked = true;
        nextLikes = curLikes + 1;
      }
    } else if (requestedVote === 'DISLIKE') {
      if (curDisliked) {
        // Toggle off
        nextDisliked = false;
        nextDislikes = Math.max(0, curDislikes - 1);
        voteTypeToSend = null;
        reactionToSend = null;
      } else if (curLiked) {
        // Switch from like to dislike
        nextLiked = false;
        nextDisliked = true;
        nextLikes = Math.max(0, curLikes - 1);
        nextDislikes = curDislikes + 1;
      } else {
        // New dislike
        nextDisliked = true;
        nextDislikes = curDislikes + 1;
      }
    }

    const nextState = {
      isLiked: nextLiked,
      isDisliked: nextDisliked,
      likes: nextLikes,
      dislikes: nextDislikes,
      voteTypeToSend,
      reactionToSend
    };

    videoVoteRef.current = nextState;
    const voteVer = (videoVoteVersionRef.current || 0) + 1;
    videoVoteVersionRef.current = voteVer;

    // 2. Immediate Optimistic UI update
    setIsLiked(nextLiked);
    setIsDisliked(nextDisliked);
    setLikesCount(nextLikes);
    setDislikesCount(nextDislikes);

    // 3. Debounce backend API call
    if (videoVoteTimerRef.current) {
      clearTimeout(videoVoteTimerRef.current);
    }

    videoVoteTimerRef.current = setTimeout(async () => {
      delete videoVoteTimerRef.current;
      if (videoVoteVersionRef.current !== voteVer) return;
      const targetState = videoVoteRef.current;
      if (!targetState) return;

      try {
        const res = await api.videos.toggleVote(video.id, docId, currentUser?.name || 'Dr. You', targetState.voteTypeToSend, targetState.reactionToSend);
        if (videoVoteVersionRef.current === voteVer) {
          videoVoteRef.current = null;
          if (res && res.likes !== undefined) {
            setLikesCount(Number(res.likes));
            setDislikesCount(Number(res.dislikes || 0));
            setIsLiked(Boolean(res.isLiked));
            setIsDisliked(Boolean(res.isDisliked));
          }
        }
      } catch (err) {
        console.warn('[VideoPlayerModal] Error toggling video vote:', err);
        if (videoVoteVersionRef.current === voteVer) {
          videoVoteRef.current = null;
        }
      }
    }, 200);
  };

  // Format MM:SS helper
  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Keyboard navigation: ArrowUp (prev), ArrowDown (next), Space (play/pause), Escape (close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm') {
        toggleMute();
      } else if (e.key === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  // Mouse wheel vertical reel scrolling with debounce
  const handleWheel = (e) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 600) return; // Debounce 600ms

    if (e.deltaY > 40 && hasNext) {
      lastWheelTimeRef.current = now;
      handleNext();
    } else if (e.deltaY < -40 && hasPrev) {
      lastWheelTimeRef.current = now;
      handlePrev();
    }
  };

  // Load comments
  useEffect(() => {
    if (!video?.id) {
      setComments([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const loadComments = async () => {
      try {
        const remoteComments = await api.videos.getComments(video.id);
        if (isMounted && remoteComments && remoteComments.length > 0) {
          setComments(remoteComments);
          return;
        }
      } catch (err) { }

      try {
        const local = localStorage.getItem(`zenve_video_comments_${video.id}`);
        if (local && isMounted) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setComments(parsed);
            return;
          }
        }
      } catch (e) { }

      if (isMounted) {
        setComments([]);
      }
    };

    loadComments().finally(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [video?.id]);

  // Video source change / active autoplay handler
  useEffect(() => {
    setIsBuffering(true);
    setHasError(false);
    setProgress(0);
    setCurrentTimeStr('0:00');
    setDurationStr(video?.duration || '0:00');

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch(() => {
            // Unmuted autoplay blocked by browser policy; fall back to muted autoplay
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(() => setIsPlaying(false));
            }
          });
      }
    }
  }, [video?.id, retryCount]);

  if (!video) return null;

  // Resolve video author avatar
  const authorDoc = (doctors || []).find(d => 
    d.id === video.doctorId || 
    (d.name && video.doctorName && d.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === video.doctorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim())
  );
  const videoAuthorAvatar = authorDoc?.avatar || video.authorAvatar || '';

  const resolvedVideoSrc = resolveMediaUrl(video.videoUrl, retryCount);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().then(() => setIsPlaying(true));
        });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    const el = videoPlayerAreaRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration;
    if (!isNaN(dur) && dur > 0) {
      setProgress((curr / dur) * 100);
      setCurrentTimeStr(formatTime(curr));
      setDurationStr(formatTime(dur));
    }
  };

  const handleSeek = (e) => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (isNaN(dur) || dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    videoRef.current.currentTime = ratio * dur;
    setProgress(ratio * 100);
  };

  const handleRetryPlayback = () => {
    setHasError(false);
    setIsBuffering(true);
    setRetryCount(r => r + 1);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    const authorName = currentUser?.name || 'Dr. You (Verified)';
    const authorAvatar = currentUser?.avatar || '';
    const authorSpecialty = currentUser?.specialty || 'Veterinary Practitioner';
    const authorId = currentUser?.id ? Number(String(currentUser.id).replace('doc-', '')) : 1;

    const newComment = {
      id: Date.now(),
      authorId,
      authorName,
      authorAvatar,
      authorSpecialty,
      content: text,
      createdAt: new Date().toISOString()
    };

    setComments(prev => [...prev, newComment]);
    setCommentText('');

    try {
      const saved = await api.videos.addComment(video.id, {
        authorId,
        authorName,
        authorAvatar,
        authorSpecialty,
        content: text
      });
      if (saved && saved.id) {
        setComments(prev => prev.map(c => c.id === newComment.id ? { ...c, id: saved.id } : c));
      }
    } catch (err) {
      console.warn('Video comment server persistence note:', err);
    }

    try {
      const updated = [...comments, newComment];
      localStorage.setItem(`zenve_video_comments_${video.id}`, JSON.stringify(updated));
    } catch (e) {}

    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        style={{
          width: '840px',
          maxWidth: '96vw',
          height: '600px',
          maxHeight: '92vh',
          backgroundColor: '#0E1410',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          boxShadow: '0 25px 60px rgba(0,0,0,0.65)',
          animation: 'modalPop 0.25s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Video Player Area with Vertical Aspect Ratio support & Reel Navigation */}
        <div 
          ref={videoPlayerAreaRef}
          onWheel={handleWheel}
          style={{ 
            flex: '1.25', 
            position: 'relative', 
            backgroundColor: '#000000', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            overflow: 'hidden',
            userSelect: 'none'
          }}
        >
          {/* Blurred Background Backdrop for vertical 9:16 reels */}
          {video.thumbnail && (
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: `url(${video.thumbnail})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(28px) brightness(0.35)',
                transform: 'scale(1.15)',
                pointerEvents: 'none'
              }}
            />
          )}

          {/* Active HTML5 Video Player */}
          {resolvedVideoSrc ? (
            <video 
              ref={videoRef}
              src={resolvedVideoSrc} 
              playsInline
              preload="auto"
              muted={isMuted}
              loop
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setIsPlaying(true);
                setHasError(false);
              }}
              onCanPlay={() => setIsBuffering(false)}
              onTimeUpdate={handleTimeUpdate}
              onError={(e) => {
                console.error('[VideoPlayerModal] Video load/playback error:', e);
                setIsBuffering(false);
                setHasError(true);
              }}
              onClick={togglePlay}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain', 
                backgroundColor: 'transparent',
                position: 'relative',
                zIndex: 2,
                cursor: 'pointer'
              }}
            />
          ) : (
            <img 
              src={video.thumbnail} 
              alt={video.title}
              style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 2 }}
            />
          )}

          {/* Buffering Loading Spinner */}
          {isBuffering && !hasError && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 15,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: 44,
                height: 44,
                border: '3px solid rgba(255,255,255,0.25)',
                borderTopColor: '#10B981',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                Buffering Reel...
              </span>
            </div>
          )}

          {/* Error Recovery UI */}
          {hasError && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(8px)',
              padding: '20px 24px',
              borderRadius: '12px',
              textAlign: 'center',
              maxWidth: '300px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.5)'
            }}>
              <AlertTriangle size={32} color="#EF4444" style={{ margin: '0 auto 8px' }} />
              <h4 style={{ color: '#FFFFFF', fontSize: '13.5px', margin: '0 0 6px 0', fontWeight: 700 }}>
                Unable to Stream Reel
              </h4>
              <p style={{ color: '#9CA3AF', fontSize: '11.5px', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                The video stream encountered a network interruption or decoding delay.
              </p>
              <button
                type="button"
                onClick={handleRetryPlayback}
                style={{
                  backgroundColor: '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RotateCcw size={13} />
                <span>Retry Playback</span>
              </button>
            </div>
          )}

          {/* Center Play/Pause Indicator Burst */}
          {!isPlaying && !isBuffering && !hasError && (
            <div 
              onClick={togglePlay}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 60,
                height: 60,
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 45, 25, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                cursor: 'pointer',
                zIndex: 10
              }}
            >
              <Play size={26} fill="#FFFFFF" style={{ marginLeft: 3 }} />
            </div>
          )}

          {/* Vertical Reel Navigation Controls (Prev / Next Reel) */}
          <div style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            zIndex: 15
          }}>
            {hasPrev && (
              <button
                type="button"
                onClick={handlePrev}
                title="Previous Reel (Up Arrow)"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(5, 150, 105, 0.85)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.65)'}
              >
                <ChevronUp size={20} />
              </button>
            )}

            {hasNext && (
              <button
                type="button"
                onClick={handleNext}
                title="Next Reel (Down Arrow)"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(5, 150, 105, 0.85)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.65)'}
              >
                <ChevronDown size={20} />
              </button>
            )}
          </div>

          {/* Quick Floating Action Icons (Like, Dislike & Bookmark) */}
          <div style={{ position: 'absolute', right: 14, bottom: 95, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 12 }}>
            {/* 1. Like Button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <button 
                onClick={(e) => handleToggleVote(e, 'LIKE')} 
                style={{
                  background: isLiked ? 'rgba(245, 158, 11, 0.35)' : 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(6px)',
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isLiked ? '1.5px solid #F59E0B' : '1px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                title={isLiked ? 'Unlike Reel' : 'Like'}
              >
                <img
                  src={likePuppy}
                  alt="Like"
                  style={{
                    width: 22,
                    height: 22,
                    objectFit: 'contain',
                    filter: isLiked ? 'drop-shadow(0 2px 6px rgba(245, 158, 11, 0.5))' : 'grayscale(100%) opacity(0.8)',
                    transform: isLiked ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                />
              </button>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}>
                {likesCount}
              </span>
            </div>

            {/* 2. Dislike Button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <button 
                onClick={(e) => handleToggleVote(e, 'DISLIKE')} 
                style={{
                  background: isDisliked ? 'rgba(239, 68, 68, 0.35)' : 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(6px)',
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isDisliked ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                title={isDisliked ? 'Remove Dislike' : 'Dislike'}
              >
                <img
                  src={sadPuppy}
                  alt="Dislike"
                  style={{
                    width: 22,
                    height: 22,
                    objectFit: 'contain',
                    filter: isDisliked ? 'drop-shadow(0 2px 6px rgba(239, 68, 68, 0.5))' : 'grayscale(100%) opacity(0.8)',
                    transform: isDisliked ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                />
              </button>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}>
                {dislikesCount}
              </span>
            </div>
            <button 
              onClick={() => setIsSaved(!isSaved)} 
              style={{ 
                background: 'rgba(0,0,0,0.6)', 
                backdropFilter: 'blur(6px)', 
                width: 38, 
                height: 38, 
                borderRadius: '50%', 
                color: isSaved ? '#C5A059' : '#FFF', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                border: '1px solid rgba(255,255,255,0.2)', 
                cursor: 'pointer' 
              }}
              title="Bookmark Technique"
            >
              <Bookmark size={18} fill={isSaved ? '#C5A059' : 'none'} />
            </button>
          </div>

          {/* Video Scrubber & Playback Controls Bar */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 14px 12px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)',
            color: '#FFFFFF',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {/* Interactive Progress Scrubber */}
            <div 
              onClick={handleSeek}
              style={{
                width: '100%',
                height: '4px',
                backgroundColor: 'rgba(255,255,255,0.3)',
                borderRadius: '2px',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <div style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: '#10B981',
                borderRadius: '2px',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  right: -4,
                  top: -3,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 0 6px rgba(0,0,0,0.5)'
                }} />
              </div>
            </div>

            {/* Bottom Info & Controls Strip */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              {/* Doctor Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <Avatar src={videoAuthorAvatar} name={video.doctorName} size={32} style={{ border: '1.5px solid rgba(255,255,255,0.5)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '700', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                    {video.title}
                  </h3>
                  <p style={{ fontSize: '11px', color: '#A7F3D0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {video.doctorName} · {video.doctorSpecialty}
                  </p>
                </div>
              </div>

              {/* Playback Button Controls (Play, Mute, Time, Fullscreen) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={togglePlay}
                  style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 2 }}
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 2 }}
                  title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>

                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                  {currentTimeStr} / {durationStr}
                </span>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: 2 }}
                  title="Fullscreen (f)"
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Discussion Area */}
        <div style={{ flex: '1', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E9E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={16} color="#059669" />
              <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#0D472B' }}>
                Clinical Discussion
              </span>
              <span style={{ backgroundColor: '#ECFDF5', color: '#059669', fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px' }}>
                {comments.length}
              </span>
            </div>
            <button onClick={onClose} className="btn-close-modal" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 12px', color: '#9CA3AF' }}>
                <MessageSquare size={36} color="#D1D5DB" style={{ margin: '0 auto 10px' }} />
                <h4 style={{ fontSize: '13.5px', fontWeight: '700', color: '#374151', margin: '0 0 4px 0' }}>
                  No Clinical Comments Yet
                </h4>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: 0, lineHeight: 1.4 }}>
                  Be the first veterinarian to ask a question, share peer feedback, or comment on this technique.
                </p>
              </div>
            ) : (
              comments.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Avatar 
                    src={c.authorAvatar} 
                    name={c.authorName || c.author || 'Doctor'} 
                    size={32} 
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#111827', fontSize: '12.5px', fontWeight: '700' }}>
                        {c.authorName || c.author}
                      </strong>
                      <span style={{ color: '#059669', fontSize: '11px', fontWeight: '600' }}>
                        {c.authorSpecialty || 'Veterinary Practitioner'}
                      </span>
                    </div>
                    <p style={{ color: '#374151', fontSize: '12.5px', margin: 0, lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {c.content || c.text}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddComment} style={{ padding: '12px 16px', borderTop: '1px solid #E5E9E5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Avatar 
              src={currentUser?.avatar} 
              name={currentUser?.name || 'Dr. You'} 
              size={28} 
            />
            <input 
              type="text" 
              placeholder="Add your veterinary feedback..." 
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="custom-filter-select"
              style={{ flex: 1, padding: '8px 12px', fontSize: '12.5px', borderRadius: '8px' }}
            />
            <button 
              type="submit" 
              className="btn-submit-post" 
              disabled={!commentText.trim() || submitting}
              style={{ 
                padding: '8px 14px', 
                fontSize: '12px', 
                opacity: (!commentText.trim() || submitting) ? 0.6 : 1,
                cursor: (!commentText.trim() || submitting) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>Post</span>
              <Send size={12} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
