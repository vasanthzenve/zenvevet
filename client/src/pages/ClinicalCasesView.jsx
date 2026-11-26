import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  Plus,
  MessageSquare,
  Heart,
  Share2,
  Bookmark,
  CheckCircle2,
  MoreHorizontal,
  PawPrint,
  Stethoscope,
  Trash2
} from 'lucide-react';
import heroVetImg from '../assets/hero_vet_dog.jpg';
import { ReactionPicker } from '../components/ReactionPicker';
import { Avatar } from '../components/Avatar';

export function ClinicalCasesView({
  clinicalCases = [],
  stories = [],
  doctors = [],
  connectedDoctors = [],
  connectedMap = {},
  currentUser,
  onOpenStory,
  onOpenCreateCase,
  onSelectCase,
  onToggleLike,
  onOpenLogin,
  onDeleteCase
}) {
  const [activeTab, setActiveTab] = useState('for_you');
  const [caseReactions, setCaseReactions] = useState({});

  const handleSelectCaseReaction = (id, reactionId, voteType = null) => {
    if (!currentUser) {
      if (onOpenLogin) onOpenLogin();
      return;
    }

    setCaseReactions(prev => ({
      ...prev,
      [id]: reactionId
    }));

    if (onToggleLike) {
      onToggleLike(id, reactionId, voteType);
    }
  };

  const isAuthorConnected = (authorId, authorName) => {
    if (!currentUser) return false;
    if (authorId != null && (authorId === currentUser.id || String(authorId).replace('doc-', '') === String(currentUser.id).replace('doc-', ''))) return true;
    if (authorId === 'doc-me') return true;
    if (authorName && currentUser.name && (
      authorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === currentUser.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim() ||
      authorName.toLowerCase().includes('you')
    )) return true;

    if (authorId != null) {
      const cleanId = String(authorId).replace('doc-', '');
      if (connectedMap[authorId] || connectedMap[`doc-${authorId}`] || connectedMap[cleanId] || connectedMap[`doc-${cleanId}`]) return true;
    }

    if (Array.isArray(connectedDoctors) && connectedDoctors.length > 0) {
      return connectedDoctors.some(d => {
        if (!d) return false;
        if (authorId != null && (d.id === authorId || String(d.id).replace('doc-', '') === String(authorId).replace('doc-', ''))) return true;
        if (authorName && d.name && d.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === authorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim()) return true;
        return false;
      });
    }

    return false;
  };

  const filteredCases = useMemo(() => {
    let result = (clinicalCases || []).filter(c => {
      // Tab Filtering: Following shows strictly connected doctors (+ current user)
      if (activeTab === 'following') {
        const docId = c.authorId || c.doctorId;
        const docName = c.authorName || c.doctorName;
        if (!isAuthorConnected(docId, docName)) return false;
      }
      return true;
    });

    if (activeTab === 'popular') {
      result = [...result].sort((a, b) => {
        const scoreA = (Number(a.likes) || 0) + (Number(a.views) || 0);
        const scoreB = (Number(b.likes) || 0) + (Number(b.views) || 0);
        return scoreB - scoreA;
      });
    }

    return result;
  }, [clinicalCases, activeTab, connectedMap, connectedDoctors, currentUser]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Light Hero Banner matching reference image */}
      <div className="cases-hero-banner-light">
        <div className="hero-banner-inner">
          <div className="hero-text-content">
            <h1 className="hero-headline">Every case. A new perspective.</h1>
            <p className="hero-subtext">
              Explore the knowledge and experiences of your community.
            </p>
            <button
              className="btn-make-mark-link"
              onClick={() => onOpenCreateCase('CLINICAL_CASE')}
            >
              <span>Make your mark</span>
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="hero-photo-wrap">
            <PawPrint size={90} className="hero-paw-watermark" style={{ color: 'rgba(0, 56, 34, 0.15)' }} />
            <img
              src={heroVetImg}
              alt="Doctor and golden retriever"
              className="hero-photo-img"
            />
          </div>
        </div>
      </div>

      {/* 2. Moments from the community (Stories Carousel) */}
      <div className="stories-section-container">
        <div className="stories-section-header">
          <div className="stories-header-left">
            <MessageSquare size={17} color="#059669" />
            <span className="stories-header-title">Moments from the community</span>
          </div>

          <button
            className="stories-view-all-link"
            onClick={() => stories.length > 0 && onOpenStory(stories[0])}
          >
            <span>STORIES</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="stories-avatar-track">
          {/* Your Story Button */}
          <button className="story-circle-item" onClick={() => onOpenCreateCase && onOpenCreateCase('STORY')}>
            <div className="story-ring-circle add-your-story">
              <Plus size={20} />
            </div>
            <span className="story-doc-label">Your story</span>
          </button>

          {/* Doctor Community Stories */}
          {stories.map((story) => {
            const isStoryOwner = currentUser && (
              story.doctorId === currentUser.id ||
              story.authorId === currentUser.id ||
              story.doctorName === currentUser.name ||
              story.authorName === currentUser.name ||
              (story.doctorName && currentUser.name && story.doctorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === currentUser.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim())
            );
            const resolvedStoryAvatar = (isStoryOwner && currentUser?.avatar)
              ? currentUser.avatar
              : (story.avatar || '');

            return (
              <button
                key={story.id}
                className="story-circle-item"
                onClick={() => onOpenStory({ ...story, avatar: resolvedStoryAvatar })}
                style={{ position: 'relative' }}
              >
                <div className="story-ring-circle" style={{ position: 'relative' }}>
                  <Avatar src={resolvedStoryAvatar} name={story.doctorName} size={48} className="story-avatar-photo" />
                </div>
                <span className="story-doc-label">{story.doctorName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Filter Tabs & Controls Row */}
      <div className="feed-filter-bar">
        <div className="feed-tabs-row">
          <div className="feed-tabs-group">
            <button
              className={`feed-tab-btn ${activeTab === 'for_you' ? 'active' : ''}`}
              onClick={() => setActiveTab('for_you')}
            >
              For you
            </button>
            <button
              className={`feed-tab-btn ${activeTab === 'popular' ? 'active' : ''}`}
              onClick={() => setActiveTab('popular')}
            >
              Popular
            </button>
            <button
              className={`feed-tab-btn ${activeTab === 'following' ? 'active' : ''}`}
              onClick={() => setActiveTab('following')}
            >
              Following
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn-upload-reel-action"
              onClick={() => onOpenCreateCase('CLINICAL_CASE')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0D472B',
                color: '#FFFFFF',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(13, 71, 43, 0.2)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#00a86b'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0D472B'; }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Publish Case</span>
            </button>

            <div className="community-feed-badge">
              <span className="status-dot-green"></span>
              <span>Clinical Cases</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Clinical Cases Feed Stream */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {filteredCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FFF', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
            <PawPrint size={36} color="#059669" style={{ margin: '0 auto 10px' }} />
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '6px' }}>
              {activeTab === 'following' ? 'No Connected Clinical Cases Yet' : 'No Clinical Cases Published Yet'}
            </h3>
            <p style={{ fontSize: '13px', color: '#6B7280', maxWidth: '420px', margin: '0 auto 14px' }}>
              {activeTab === 'following'
                ? 'No case studies from your connected colleagues yet. Connect with other veterinary practitioners or switch to "For you" to view all cases across the platform.'
                : 'Publish an interesting clinical observation, surgical procedure, or diagnostic report.'}
            </p>
            {activeTab === 'following' ? (
              <button
                className="btn-make-mark"
                onClick={() => setActiveTab('for_you')}
                style={{ margin: '0 auto' }}
              >
                <span>Explore "For you" Cases</span>
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                className="btn-make-mark"
                onClick={() => onOpenCreateCase('CLINICAL_CASE')}
                style={{ margin: '0 auto' }}
              >
                <span>Publish First Clinical Case</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        ) : (
          filteredCases.map(c => {
            const isOwnCase = Boolean(currentUser && (
              (c.authorId != null && (
                c.authorId === currentUser.id ||
                String(c.authorId).replace('doc-', '') === String(currentUser.id).replace('doc-', '')
              )) ||
              (c.authorName && currentUser.name && (
                c.authorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === currentUser.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim()
              )) ||
              (c.authorName && c.authorName.toLowerCase().includes('you')) ||
              c.authorId === 'doc-me'
            ));
            const caseDoc = doctors?.find(d =>
              d.id === c.authorId ||
              (d.name && c.authorName && d.name.toLowerCase().replace(/^dr\.?\s*/i, '').trim() === c.authorName.toLowerCase().replace(/^dr\.?\s*/i, '').trim())
            );
            const resolvedAvatar = (isOwnCase && currentUser?.avatar) ? currentUser.avatar : (caseDoc?.avatar || c.authorAvatar || '');

            const images = [];
            if (Array.isArray(c.mediaUrls) && c.mediaUrls.length > 0) {
              images.push(...c.mediaUrls.filter(Boolean));
            } else if (c.mediaUrl) {
              if (typeof c.mediaUrl === 'string' && c.mediaUrl.includes(',')) {
                images.push(...c.mediaUrl.split(',').map(s => s.trim()).filter(Boolean));
              } else if (typeof c.mediaUrl === 'string' && c.mediaUrl.trim()) {
                images.push(c.mediaUrl.trim());
              }
            }

            return {
              id: c.id,
              authorName: c.authorName || 'Dr. Practitioner',
              authorSpecialty: c.authorSpecialty || 'Veterinary Surgeon',
              authorCity: 'Bengaluru',
              authorAvatar: resolvedAvatar,
              timeAgo: 'Case Study',
              content: c.presentingComplaint ? `${c.title} — ${c.presentingComplaint}` : c.title,
              images,
              likes: Math.max(0, c.likes || 0),
              dislikes: Math.max(0, c.dislikes || 0),
              isLiked: Boolean(c.isLiked),
              isDisliked: Boolean(c.isDisliked),
              userReaction: c.userReaction,
              comments: 0,
              fullCase: c,
              isOwnCase: isOwnCase
            };
          }).map((post) => {

            return (
              <article key={post.id} className="feed-post-card" id={`case-post-${post.id}`}>
                {/* Card Header: Avatar, Name, Verified Badge, Time, Options */}
                <div className="post-card-header">
                  <div className="post-author-block">
                    <Avatar
                      src={post.authorAvatar}
                      name={post.authorName}
                      size={40}
                      className="post-avatar-img"
                    />
                    <div>
                      <div className="post-author-name-row">
                        <h3 className="post-author-name">{post.authorName}</h3>
                        <CheckCircle2 size={15} fill="#059669" color="#ffffff" />
                      </div>
                      <span className="post-author-meta">{post.authorSpecialty} · {post.authorCity}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{post.timeAgo}</span>
                    {post.isOwnCase && onDeleteCase && (
                      <button
                        type="button"
                        onClick={() => onDeleteCase(post.fullCase?.id || post.id)}
                        title="Delete clinical case"
                        style={{
                          border: '1px solid #fee2e2',
                          backgroundColor: '#fff5f5',
                          color: '#dc2626',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11.5px',
                          fontWeight: 600
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Content Text */}
                <p className="post-body-text" style={{ fontSize: '14.5px', marginBottom: '14px' }}>
                  {post.content}
                </p>

                {/* Single Media Container if 1 image */}
                {post.images && post.images.length === 1 && (
                  <div
                    className="post-image-preview-container"
                    onClick={() => onSelectCase && onSelectCase(post.fullCase)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                      maxHeight: '260px',
                      backgroundColor: '#f8fafc',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Click to review complete case study"
                  >
                    <img
                      src={post.images[0]}
                      alt="Clinical case visual"
                      className="post-image-preview"
                      style={{
                        width: '100%',
                        maxHeight: '260px',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Dual Media Grid only if >= 2 images */}
                {post.images && post.images.length >= 2 && (
                  <div
                    className="case-dual-media-grid"
                    onClick={() => onSelectCase && onSelectCase(post.fullCase)}
                    style={{ cursor: 'pointer' }}
                    title="Click to review complete case study"
                  >
                    <div className="case-split-img-box">
                      <img src={post.images[0]} alt="Clinical case visual 1" className="case-split-img" />
                    </div>
                    <div className="case-split-img-box">
                      <img src={post.images[1]} alt="Clinical case visual 2" className="case-split-img" />
                    </div>
                  </div>
                )}

                {/* Card Footer Actions: ReactionPicker, Comment, Share, Bookmark */}
                <div className="post-card-footer">
                  <div className="post-actions-group">
                    <ReactionPicker
                      activeReaction={
                        caseReactions[post.id] !== undefined
                          ? caseReactions[post.id]
                          : (post.userReaction || (post.isLiked ? 'like_puppy' : (post.isDisliked ? 'sad_puppy' : null)))
                      }
                      likesCount={Math.max(0, post.likes || 0)}
                      dislikesCount={Math.max(0, post.dislikes || 0)}
                      onSelectReaction={(reactionId) => handleSelectCaseReaction(post.id, reactionId)}
                    />

                    <button
                      className="post-action-btn"
                      onClick={() => onSelectCase && onSelectCase(post.fullCase)}
                    >
                      <MessageSquare size={17} />
                      <span>{post.comments}</span>
                    </button>

                    <button className="post-action-btn">
                      <Share2 size={17} />
                      <span>Share</span>
                    </button>
                  </div>

                  <button style={{ color: '#9ca3af' }}>
                    <Bookmark size={18} />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
export default ClinicalCasesView;
