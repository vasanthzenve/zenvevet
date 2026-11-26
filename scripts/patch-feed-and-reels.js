const fs = require('fs');
const path = require('path');

// 1. PATCH FeedView.jsx
const feedViewPath = path.resolve('c:/Users/hp/Downloads/projects/zenve-vet/zenve-vet/client/src/pages/FeedView.jsx');
let feedContent = fs.readFileSync(feedViewPath, 'utf8');

// Ensure lucide-react imports include Play, Volume2, VolumeX, Maximize2
if (!feedContent.includes('Volume2,')) {
  feedContent = feedContent.replace(
    "  CornerDownRight\n} from 'lucide-react';",
    "  CornerDownRight,\n  Play,\n  Pause,\n  Volume2,\n  VolumeX,\n  Maximize2\n} from 'lucide-react';"
  );
}

// Add onSelectVideo to FeedView props
if (!feedContent.includes('onSelectVideo,')) {
  feedContent = feedContent.replace(
    "  onOpenClinicalCase,",
    "  onOpenClinicalCase,\n  onSelectVideo,"
  );
}

// Insert FeedPostVideoPlayer subcomponent before FeedView definition
const feedPostVideoPlayerCode = `
// Interactive Video Player for in-feed video posts with buffering, retry, and full Reel expansion
function FeedPostVideoPlayer({ post, onSelectVideo, handleMediaDoubleTap, doubleTapHearts, REACTION_MAP, postReactions, likePuppy }) {
  const isVideo = post.videoUrl || (post.imageUrl && (/\\.(mp4|webm|mov|m4v|ogg)(\\?.*)?$/i.test(post.imageUrl) || post.imageUrl.includes('data:video')));
  const rawVideoSrc = post.videoUrl || (isVideo ? post.imageUrl : null);
  const [retryCount, setRetryCount] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);

  const videoSrc = resolveMediaUrl(rawVideoSrc);

  const togglePlay = (e) => {
    e.stopPropagation();
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
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleOpenReel = (e) => {
    e.stopPropagation();
    if (onSelectVideo) {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (_) {}
      }
      onSelectVideo({
        id: post.videoId || post.id,
        title: post.content ? post.content.slice(0, 60) : 'Clinical Video',
        videoUrl: rawVideoSrc,
        doctorName: post.authorName,
        doctorSpecialty: post.authorSpecialty,
        authorAvatar: post.authorAvatar,
        likes: post.likes,
        thumbnail: post.imageUrl
      });
    }
  };

  return (
    <div
      style={{
        borderRadius: '14px',
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
        maxHeight: '440px',
        width: '100%',
        marginBottom: '14px',
        position: 'relative',
        boxShadow: '0 4px 18px rgba(0,0,0,0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }}
      onClick={(e) => handleMediaDoubleTap(e, post)}
    >
      <video
        key={videoSrc + '_r' + retryCount}
        ref={videoRef}
        src={videoSrc ? (retryCount > 0 ? \`\${videoSrc}\${videoSrc.includes('?') ? '&' : '?'}_r=\${retryCount}\` : videoSrc) : ''}
        playsInline
        preload="metadata"
        muted={isMuted}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
          setHasError(false);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onError={(err) => {
          console.error('[FeedPostVideoPlayer] Error loading post video:', err);
          setIsBuffering(false);
          setHasError(true);
        }}
        style={{
          width: '100%',
          maxHeight: '440px',
          objectFit: 'contain',
          display: 'block',
          backgroundColor: '#000'
        }}
      />

      {/* Buffering Loading Indicator */}
      {isBuffering && !hasError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          <div style={{
            width: 36,
            height: 36,
            border: '3px solid rgba(255,255,255,0.25)',
            borderTopColor: '#10B981',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '11px', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            Buffering Video...
          </span>
        </div>
      )}

      {/* Error state with Retry button */}
      {hasError && (
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(6px)',
            padding: '16px 20px',
            borderRadius: '10px',
            textAlign: 'center',
            zIndex: 20,
            border: '1px solid rgba(239, 68, 68, 0.4)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: '#F87171', fontSize: '12px', margin: '0 0 10px 0', fontWeight: 600 }}>
            Unable to stream video
          </p>
          <button
            type="button"
            onClick={() => {
              setHasError(false);
              setIsBuffering(true);
              setRetryCount(r => r + 1);
            }}
            style={{
              backgroundColor: '#059669',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Retry Playback
          </button>
        </div>
      )}

      {/* Play / Pause Center Overlay Button */}
      {!isPlaying && !isBuffering && !hasError && (
        <div
          onClick={togglePlay}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 54,
            height: 54,
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 45, 25, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            zIndex: 10,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
          }}
        >
          <Play size={22} fill="#FFFFFF" style={{ marginLeft: 2 }} />
        </div>
      )}

      {/* Floating Bottom Control Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 15
        }}
      >
        <button
          type="button"
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          style={{
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>

        {onSelectVideo && (
          <button
            type="button"
            onClick={handleOpenReel}
            title="Expand to Full Reel View"
            style={{
              backgroundColor: 'rgba(5, 150, 105, 0.85)',
              backdropFilter: 'blur(4px)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Maximize2 size={12} />
            <span>Open Reel</span>
          </button>
        )}
      </div>

      {doubleTapHearts[post.id] && (
        <div style={{
          position: 'absolute',
          top: \`\${doubleTapHearts[post.id].y}%\`,
          left: \`\${doubleTapHearts[post.id].x}%\`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 30,
          animation: 'feedHeartBurst 0.85s ease-out forwards',
          filter: 'drop-shadow(0 8px 24px rgba(245, 158, 11, 0.65))'
        }}>
          <img
            src={REACTION_MAP[postReactions[post.id]]?.icon || likePuppy}
            alt="Liked"
            style={{ width: 92, height: 92, objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
}
`;

if (!feedContent.includes('function FeedPostVideoPlayer(')) {
  feedContent = feedContent.replace('export function FeedView({', feedPostVideoPlayerCode + '\nexport function FeedView({');
}

// Replace video rendering inside FeedView post mapping with FeedPostVideoPlayer
const oldVideoRenderRegex = /\{\/\* Video Player or Image Preview \*\/\}[\s\S]*?if \(videoSrc\) \{[\s\S]*?return \([\s\S]*?<video[\s\S]*?<\/div>\s*\);\s*\}/;

const newVideoRender = `{/* Video Player or Image Preview */}
                {(() => {
                  const isVideo = post.videoUrl || (post.imageUrl && (/\\.(mp4|webm|mov|m4v|ogg)(\\?.*)?$/i.test(post.imageUrl) || post.imageUrl.includes('data:video')));
                  const videoSrc = post.videoUrl || (isVideo ? post.imageUrl : null);

                  if (videoSrc) {
                    return (
                      <FeedPostVideoPlayer
                        post={post}
                        onSelectVideo={onSelectVideo}
                        handleMediaDoubleTap={handleMediaDoubleTap}
                        doubleTapHearts={doubleTapHearts}
                        REACTION_MAP={REACTION_MAP}
                        postReactions={postReactions}
                        likePuppy={likePuppy}
                      />
                    );
                  }`;

feedContent = feedContent.replace(oldVideoRenderRegex, newVideoRender);

// Also wrap post.imageUrl with resolveMediaUrl
feedContent = feedContent.replace(
  'src={post.imageUrl}\n                          alt="Clinical media"',
  'src={resolveMediaUrl(post.imageUrl)}\n                          alt="Clinical media"'
);

fs.writeFileSync(feedViewPath, feedContent, 'utf8');
console.log('Successfully patched FeedView.jsx');


// 2. PATCH ShortVideosView.jsx
const shortVideosPath = path.resolve('c:/Users/hp/Downloads/projects/zenve-vet/zenve-vet/client/src/pages/ShortVideosView.jsx');
let shortContent = fs.readFileSync(shortVideosPath, 'utf8');

// Import resolveMediaUrl if not present
if (!shortContent.includes("import { resolveMediaUrl }")) {
  shortContent = shortContent.replace(
    "import { Avatar } from '../components/Avatar';",
    "import { Avatar } from '../components/Avatar';\nimport { resolveMediaUrl } from '../utils/mediaUrl';"
  );
}

// Ensure onClick passes the full video array for next/prev navigation
shortContent = shortContent.replace(
  "onClick={() => onSelectVideo(vid)}",
  "onClick={() => onSelectVideo(vid, videos)}"
);

// Ensure vid.videoUrl uses resolveMediaUrl
shortContent = shortContent.replace(
  "src={`${vid.videoUrl}#t=0.001`}",
  "src={`${resolveMediaUrl(vid.videoUrl)}#t=0.001`}"
);

fs.writeFileSync(shortVideosPath, shortContent, 'utf8');
console.log('Successfully patched ShortVideosView.jsx');


// 3. PATCH App.jsx
const appPath = path.resolve('c:/Users/hp/Downloads/projects/zenve-vet/zenve-vet/client/src/App.jsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Pass onSelectVideo to FeedView in App.jsx
if (!appContent.includes('onSelectVideo={(v) => setSelectedVideo(v)}')) {
  appContent = appContent.replace(
    "onOpenClinicalCase={(c) => setSelectedCase(c)}",
    "onOpenClinicalCase={(c) => setSelectedCase(c)}\n                  onSelectVideo={(v) => setSelectedVideo(v)}"
  );
}

// Pass videos and onSelectVideo to VideoPlayerModal in App.jsx
appContent = appContent.replace(
  `<VideoPlayerModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}`,
  `<VideoPlayerModal
        video={selectedVideo}
        videos={videos}
        onSelectVideo={(v) => setSelectedVideo(v)}
        onClose={() => setSelectedVideo(null)}`
);

// Update handleCreatePost in App.jsx to handle idempotencyKey and deduplicate state updates
const oldHandleCreatePostRegex = /const handleCreatePost = async \(\{ content, postType, imageUrl, videoUrl, videoTitle, specialty, duration, species \}\) => \{[\s\S]*?try \{\s*const savedPost = await api\.feed\.createPost\(postPayload\);[\s\S]*?setPosts\(prev => \[\{ \.\.\.savedPost, caseId: createdCaseId, videoId: createdVideoId \}, \.\.\.prev\]\);[\s\S]*?\} catch \(e\) \{[\s\S]*?setPosts\(prev => \[\{ \.\.\.postPayload, id: `post-\$\{Date\.now\(\)\}`, comments: \[\] \}, \.\.\.prev\]\);[\s\S]*?\}/;

const newHandleCreatePost = `const inFlightPostsRef = useRef(new Set());

  const handleCreatePost = async ({ content, postType, imageUrl, videoUrl, videoTitle, specialty, duration, species, idempotencyKey }) => {
    const authorName = currentUser?.name || 'Dr. You (Verified)';
    const authorSpecialty = currentUser?.specialty || specialty || 'Veterinary Medicine';
    const authorAvatar = currentUser?.avatar || '';

    const clientKey = idempotencyKey || ('zenve_post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));

    // In-flight submission lock to prevent parallel duplicate calls
    if (inFlightPostsRef.current.has(clientKey)) {
      console.warn('[App] Duplicate post submission skipped in flight:', clientKey);
      return;
    }
    inFlightPostsRef.current.add(clientKey);

    const isVideoMedia = !!videoUrl || (imageUrl && (/\\.(mp4|webm|mov|m4v|ogg)(\\?.*)?$/i.test(imageUrl) || imageUrl.includes('data:video')));
    const effectiveVideoUrl = videoUrl || (isVideoMedia ? imageUrl : null);

    try {
      if (postType === 'STORY') {
        const isStoryVid = isVideoMedia || (imageUrl && /\\.(mp4|webm|mov|m4v|ogg|ogv|mkv)(\\?.*)?$/i.test(imageUrl));
        const storyPayload = {
          doctorId: currentUser?.id ? Number(String(currentUser.id).replace('doc-', '')) : 1,
          doctorName: currentUser?.name || 'Dr. You',
          avatar: authorAvatar,
          mediaUrl: imageUrl || 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=800&q=80',
          mediaType: isStoryVid ? 'VIDEO' : 'IMAGE',
          caption: content || 'Moments from clinical practice'
        };
        try {
          const savedStory = await api.stories.create(storyPayload);
          const formattedStory = {
            id: savedStory.id || \`story-\${Date.now()}\`,
            doctorId: currentUser?.id || 1,
            doctorName: currentUser?.name ? currentUser.name.replace(/^dr\\.?\\s*/i, '').split(' ')[0] : 'You',
            fullDoctorName: authorName,
            avatar: authorAvatar,
            image: savedStory.mediaUrl || imageUrl,
            videoUrl: (savedStory.mediaType === 'VIDEO' || isStoryVid) ? (savedStory.mediaUrl || imageUrl) : null,
            mediaType: savedStory.mediaType || (isStoryVid ? 'VIDEO' : 'IMAGE'),
            caption: savedStory.caption || content,
            time: 'Just now',
            likes: 0,
            shares: 0,
            isLiked: false
          };
          setStories(prev => {
            if (prev.some(s => s.id === formattedStory.id)) return prev;
            return [formattedStory, ...prev];
          });
        } catch (e) {
          console.error('Backend story persistence error:', e);
          alert('Notice: Could not persist story to backend server. ' + (e.message || ''));
        }

        alert('Your 24-hour story is now live in the community moments bar!');
        return;
      }

      let createdVideoId = null;
      let createdCaseId = null;

      if (postType === 'SHORT_VIDEO') {
        createdVideoId = \`vid-\${Date.now()}\`;
        const videoPayload = {
          title: videoTitle || (content ? content.slice(0, 50) : 'Clinical Technique Reel'),
          doctorName: authorName,
          doctorSpecialty: \`\${authorSpecialty} · \${currentUser?.city || 'Bengaluru'}\`,
          views: '1',
          duration: duration || '0:45',
          thumbnail: (imageUrl && !imageUrl.endsWith('.mp4') && !imageUrl.includes('543a7dc6') && !imageUrl.includes('bcb16239') && !imageUrl.includes('43090d16')) ? imageUrl : null,
          videoUrl: effectiveVideoUrl,
          likes: 0,
          comments: 0,
          idempotencyKey: clientKey
        };
        try {
          const savedVideo = await api.videos.create(videoPayload);
          createdVideoId = savedVideo?.id || createdVideoId;
          setVideos(prev => {
            if (prev.some(v => v.id === savedVideo.id || (savedVideo.title && v.title === savedVideo.title && v.videoUrl === savedVideo.videoUrl))) return prev;
            return [savedVideo, ...prev];
          });
        } catch (e) {
          setVideos(prev => [{ ...videoPayload, id: createdVideoId }, ...prev]);
        }

        notifyReelUploaded({
          doctorName: authorName,
          reelTitle: videoPayload.title,
          videoId: createdVideoId
        });

        api.notifications.broadcast({
          senderId: currentUser?.id || 1,
          senderName: authorName,
          senderAvatar: authorAvatar,
          type: 'REEL_UPLOAD',
          message: \`\${authorName} uploaded a new surgical reel: "\${videoPayload.title}"\`,
          targetId: createdVideoId
        }).catch(() => { });
      }

      if (postType === 'CLINICAL_CASE') {
        createdCaseId = \`case-\${Date.now()}\`;
        const casePayload = {
          title: (videoTitle || content).slice(0, 50) + '...',
          authorName,
          authorSpecialty,
          species: species || 'Canine',
          presentingComplaint: content,
          clinicalFindings: 'Physical exam and diagnostic tests evaluated.',
          diagnostics: 'Diagnostics completed.',
          diagnosis: 'Case under peer review',
          treatmentProtocol: 'Evidence-based veterinary protocol.',
          outcome: 'Active management',
          views: 1,
          comments: 0,
          mediaUrl: imageUrl,
          idempotencyKey: clientKey
        };
        try {
          const savedCase = await api.cases.create(casePayload);
          createdCaseId = savedCase?.id || createdCaseId;
          setClinicalCases(prev => {
            if (prev.some(c => c.id === savedCase.id || (savedCase.title && c.title === savedCase.title))) return prev;
            return [savedCase, ...prev];
          });
        } catch (e) {
          setClinicalCases(prev => [{ ...casePayload, id: createdCaseId }, ...prev]);
        }

        notifyCaseShared({
          doctorName: authorName,
          caseTitle: casePayload.title,
          caseId: createdCaseId
        });

        api.notifications.broadcast({
          senderId: currentUser?.id || 1,
          senderName: authorName,
          senderAvatar: authorAvatar,
          type: 'CLINICAL_CASE_SHARED',
          message: \`\${authorName} shared a clinical case: "\${casePayload.title}" (\${casePayload.species})\`,
          targetId: createdCaseId
        }).catch(() => { });
      }

      const postPayload = {
        authorId: currentUser?.id ? Number(String(currentUser.id).replace('doc-', '')) : 1,
        authorName,
        authorSpecialty,
        authorCity: currentUser?.city || 'Bengaluru',
        authorAvatar,
        postType,
        caseId: createdCaseId,
        videoId: createdVideoId,
        badgeLabel: postType === 'CLINICAL_CASE'
          ? 'CLINICAL CASE REPORT'
          : postType === 'SHORT_VIDEO'
            ? 'CLINICAL REEL · VIDEO'
            : 'CLINICAL UPDATE',
        content: videoTitle ? \`\${videoTitle} — \${content}\` : content,
        imageUrl: (imageUrl && !imageUrl.endsWith('.mp4')) ? imageUrl : null,
        videoUrl: effectiveVideoUrl,
        species: species || 'Canine',
        likes: 1,
        commentsCount: 0,
        idempotencyKey: clientKey
      };

      try {
        const savedPost = await api.feed.createPost(postPayload);
        setPosts(prev => {
          if (prev.some(p => p.id === savedPost.id || (p.idempotencyKey && p.idempotencyKey === clientKey))) {
            return prev;
          }
          return [{ ...savedPost, caseId: createdCaseId, videoId: createdVideoId }, ...prev];
        });
      } catch (e) {
        setPosts(prev => {
          if (prev.some(p => p.idempotencyKey === clientKey)) return prev;
          return [{ ...postPayload, id: \`post-\${Date.now()}\`, comments: [] }, ...prev];
        });
      }
    } finally {
      inFlightPostsRef.current.delete(clientKey);
    }`;

appContent = appContent.replace(oldHandleCreatePostRegex, newHandleCreatePost);

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Successfully patched App.jsx');

