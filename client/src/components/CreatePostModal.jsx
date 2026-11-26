import React, { useState, useRef, useEffect } from 'react';
import { showZenveAlert } from './ZenveAlertModal';
import {
  X,
  Image as ImageIcon,
  Video,
  Send,
  UploadCloud,
  Check,
  Plus,
  Play,
  Film,
  Camera,
  Trash2,
  Clock,
  FileText,
  AlertCircle,
  Sparkles,
  Copy,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';

const SAMPLE_PHOTOS = [];
const SAMPLE_STORIES = [];
const SAMPLE_VIDEOS = [];

const resolveMediaUrl = (url) => {
  if (!url) return '';
  let str = String(url).trim();
  if (!str) return '';
  if (str.startsWith('data:') || str.startsWith('blob:')) return str;
  if (typeof window !== 'undefined' && window.location) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal && str.includes('localhost:8080')) {
      str = str.replace('localhost:8080', `${window.location.hostname}:8080`);
    }
  }
  if (str.includes('/uploads/')) {
    const uploadIndex = str.indexOf('/uploads/');
    str = str.substring(uploadIndex);
  } else if (str.startsWith('uploads/')) {
    str = `/${str}`;
  }
  return str;
};

const VALID_POST_TYPES = ['CLINICAL_CASE', 'GENERAL_POST', 'STORY', 'SHORT_VIDEO'];

const sanitizePostType = (val) => {
  if (typeof val === 'string' && VALID_POST_TYPES.includes(val)) {
    return val;
  }
  return 'CLINICAL_CASE';
};

export function CreatePostModal({
  isOpen,
  onClose,
  onPostSubmit,
  initialType = 'CLINICAL_CASE',
  currentUser
}) {
  const [postType, setPostType] = useState(() => sanitizePostType(initialType));
  const activeType = sanitizePostType(postType);
  const [content, setContent] = useState('');
  const [species, setSpecies] = useState('Canine');

  // Media states
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [fileDetails, setFileDetails] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'url'
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Video specific states
  const [videoTitle, setVideoTitle] = useState('');
  const [videoSpecialty, setVideoSpecialty] = useState('Veterinary Surgery');
  const [videoDuration, setVideoDuration] = useState('0:45');
  const [isDurationAnalyzed, setIsDurationAnalyzed] = useState(false);
  const [videoFileUrl, setVideoFileUrl] = useState('');

  // Auto-analyze video duration from File, Blob, or URL
  const analyzeVideoDuration = (source) => {
    return new Promise((resolve) => {
      try {
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        let objectUrl = null;
        if (source instanceof File || source instanceof Blob) {
          objectUrl = URL.createObjectURL(source);
          tempVideo.src = objectUrl;
        } else if (typeof source === 'string' && source.trim()) {
          tempVideo.src = resolveMediaUrl(source.trim());
        } else {
          resolve(null);
          return;
        }

        const cleanup = () => {
          if (objectUrl) {
            try { URL.revokeObjectURL(objectUrl); } catch (e) { }
          }
          tempVideo.onloadedmetadata = null;
          tempVideo.onerror = null;
        };

        tempVideo.onloadedmetadata = () => {
          const durationSec = tempVideo.duration;
          cleanup();
          if (!isNaN(durationSec) && durationSec > 0) {
            const totalSec = Math.round(durationSec);
            const mins = Math.floor(totalSec / 60);
            const secs = totalSec % 60;
            const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            resolve(formatted);
          } else {
            resolve(null);
          }
        };

        tempVideo.onerror = () => {
          cleanup();
          resolve(null);
        };

        setTimeout(() => {
          cleanup();
          resolve(null);
        }, 5000);
      } catch (e) {
        resolve(null);
      }
    });
  };

  // Story specific states
  const [storyCaption, setStoryCaption] = useState('');

  // VetScribe AI Case Assistant states
  const [isAiParaphrasing, setIsAiParaphrasing] = useState(false);
  const [aiResult, setAiResult] = useState(null); // { original_text, paraphrased_text, model, targetField }
  const [aiNotice, setAiNotice] = useState(null); // { type: 'empty' | 'error' | 'applied', text: string }
  const [aiUndoHistory, setAiUndoHistory] = useState([]);
  const [isAiCopied, setIsAiCopied] = useState(false);

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const storyInputRef = useRef(null);

  // Sync initial type when modal opens or initialType changes
  useEffect(() => {
    if (isOpen) {
      setPostType(sanitizePostType(initialType));
    }
  }, [isOpen, initialType]);

  // Background scroll lock when modal is open or when file uploading/submitting is active
  useEffect(() => {
    if (isOpen || isUploading || isSubmitting) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen, isUploading, isSubmitting]);

  // Clean reset
  const handleReset = () => {
    setContent('');
    setMediaUrl('');
    setMediaFile(null);
    setFileDetails(null);
    setVideoTitle('');
    setVideoFileUrl('');
    setVideoDuration('0:45');
    setIsDurationAnalyzed(false);
    setStoryCaption('');
    setAiResult(null);
    setAiNotice(null);
    setAiUndoHistory([]);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const getActiveTextAndField = () => {
    if (activeType === 'STORY') {
      return { text: storyCaption, field: 'storyCaption', label: 'Story Caption' };
    }
    if (activeType === 'SHORT_VIDEO') {
      if (content && content.trim()) {
        return { text: content, field: 'content', label: 'Video Description' };
      }
      if (videoTitle && videoTitle.trim()) {
        return { text: videoTitle, field: 'videoTitle', label: 'Video Title' };
      }
      return { text: content, field: 'content', label: 'Video Description' };
    }
    return {
      text: content,
      field: 'content',
      label: activeType === 'CLINICAL_CASE' ? 'Clinical Case Notes' : 'Post Content'
    };
  };

  const updateActiveText = (field, newText) => {
    if (field === 'storyCaption') {
      setStoryCaption(newText);
    } else if (field === 'videoTitle') {
      setVideoTitle(newText);
    } else {
      setContent(newText);
    }
  };

  const handleVetScribeParaphrase = async () => {
    const { text, field } = getActiveTextAndField();

    if (!text || text.trim().length < 3) {
      setAiNotice({
        type: 'empty',
        text: 'Please enter clinical notes (at least 3 characters) to polish.'
      });
      setTimeout(() => setAiNotice(prev => prev?.type === 'empty' ? null : prev), 4000);
      return;
    }

    setIsAiParaphrasing(true);
    setAiNotice(null);
    setAiResult(null);

    try {
      const res = await api.vetscribe.paraphrase(text.trim());
      if (res && res.paraphrased_text) {
        setAiResult({
          original_text: res.original_text || text.trim(),
          paraphrased_text: res.paraphrased_text,
          model: res.model || 'llama3.2:3b',
          targetField: field
        });
      } else {
        throw new Error('Empty response from VetScribe');
      }
    } catch (err) {
      console.error('VetScribe paraphrasing error:', err);
      setAiNotice({
        type: 'error',
        text: 'NLP AI Case Assistant service is currently offline. Ensure python NLP-grammer-and-spell-checker-main/app.py is running.'
      });
    } finally {
      setIsAiParaphrasing(false);
    }
  };

  const handleApplyParaphrase = () => {
    if (!aiResult) return;
    const { targetField, paraphrased_text } = aiResult;
    const { text: currentText } = getActiveTextAndField();

    setAiUndoHistory(prev => [...prev, { field: targetField, text: currentText }]);
    updateActiveText(targetField, paraphrased_text);
    setAiResult(null);
    setAiNotice({
      type: 'applied',
      text: '✓ Polished clinical notes applied to your case! You can review or edit.'
    });
    setTimeout(() => setAiNotice(prev => prev?.type === 'applied' ? null : prev), 5000);
  };

  const handleClearContent = () => {
    const { field, text } = getActiveTextAndField();
    if (text && text.trim()) {
      setAiUndoHistory(prev => [...prev, { field, text }]);
    }
    updateActiveText(field, '');
    setAiResult(null);
    setAiNotice(null);
  };

  const handleUndoParaphrase = () => {
    if (aiUndoHistory.length === 0) return;
    const last = aiUndoHistory[aiUndoHistory.length - 1];
    updateActiveText(last.field, last.text);
    setAiUndoHistory(prev => prev.slice(0, -1));
    setAiResult(null);
    setAiNotice({
      type: 'applied',
      text: 'Reverted to previous notes.'
    });
    setTimeout(() => setAiNotice(prev => prev?.type === 'applied' ? null : prev), 3000);
  };

  const handleCopyParaphrase = () => {
    if (!aiResult?.paraphrased_text) return;
    navigator.clipboard.writeText(aiResult.paraphrased_text);
    setIsAiCopied(true);
    setTimeout(() => setIsAiCopied(false), 2000);
  };

  const renderVetScribeAssistant = () => {
    const { text } = getActiveTextAndField();
    const hasText = Boolean(text && text.trim());
    const canClear = hasText || Boolean(aiResult);

    return (
      <div style={{ marginBottom: '14px' }}>
        {/* Trigger Button & Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: (aiNotice || aiResult) ? '10px' : '0'
        }}>
          <button
            type="button"
            id="btn-vetscribe-assistant"
            data-testid="btn-vetscribe-assistant"
            title="Use AI Case Assistant to polish notes into professional veterinary medical records"
            aria-label="Use AI Case Assistant"
            onClick={handleVetScribeParaphrase}
            disabled={isAiParaphrasing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              background: isAiParaphrasing ? '#F3F4F6' : '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: isAiParaphrasing ? '#6B7280' : '#065F46',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isAiParaphrasing ? 'not-allowed' : 'pointer',
              padding: '6px 13px',
              borderRadius: '7px',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(6, 95, 70, 0.06)'
            }}
          >
            {isAiParaphrasing ? (
              <>
                <Loader2 size={15} color="#059669" className="zenve-spin" />
                <span>Checking with AI Assistant...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} color="#059669" />
                <span>Use AI Case Assistant</span>
              </>
            )}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {canClear && (
              <button
                type="button"
                id="btn-clear-content"
                onClick={handleClearContent}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '7px',
                  padding: '5.5px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#4B5563',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#DC2626';
                  e.currentTarget.style.borderColor = '#FCA5A5';
                  e.currentTarget.style.backgroundColor = '#FEF2F2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#4B5563';
                  e.currentTarget.style.borderColor = '#E5E7EB';
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
                title="Clear contents"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            )}

            {aiUndoHistory.length > 0 && !aiResult && (
              <button
                type="button"
                onClick={handleUndoParaphrase}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '7px',
                  padding: '5.5px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#4B5563',
                  cursor: 'pointer'
                }}
                title="Undo last change"
              >
                <RotateCcw size={12} />
                <span>Undo</span>
              </button>
            )}
          </div>
        </div>

        {/* Notice Banner */}
        {aiNotice && (
          <div
            style={{
              padding: '9px 13px',
              borderRadius: '8px',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: aiResult ? '10px' : '0',
              border: '1px solid',
              borderColor:
                aiNotice.type === 'empty'
                  ? '#FDE68A'
                  : aiNotice.type === 'error'
                    ? '#FECACA'
                    : '#A7F3D0',
              backgroundColor:
                aiNotice.type === 'empty'
                  ? '#FFFBEB'
                  : aiNotice.type === 'error'
                    ? '#FEF2F2'
                    : '#ECFDF5',
              color:
                aiNotice.type === 'empty'
                  ? '#92400E'
                  : aiNotice.type === 'error'
                    ? '#991B1B'
                    : '#065F46'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {aiNotice.type === 'empty' || aiNotice.type === 'error' ? (
                <AlertCircle size={15} />
              ) : (
                <Check size={15} />
              )}
              <span style={{ fontWeight: 500 }}>{aiNotice.text}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {aiUndoHistory.length > 0 && aiNotice.type === 'applied' && (
                <button
                  type="button"
                  onClick={handleUndoParaphrase}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#FFF',
                    border: '1px solid #A7F3D0',
                    color: '#065F46',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <RotateCcw size={11} />
                  <span>Undo</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAiNotice(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  padding: '2px',
                  display: 'flex'
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Result Card */}
        {aiResult && aiResult.paraphrased_text && (
          <div
            id="vetscribe-result-card"
            style={{
              border: '1.5px solid #A7F3D0',
              background: '#F9FDFB',
              borderRadius: '10px',
              padding: '13px 15px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 2px 8px rgba(6, 95, 70, 0.05)'
            }}
          >
            {/* Header: Title badge + Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} color="#059669" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#065F46' }}>VetScribe AI Clinical Finding</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <button
                  type="button"
                  onClick={() => setAiResult(null)}
                  style={{
                    background: '#FFF',
                    color: '#64726A',
                    borderRadius: '6px',
                    padding: '4px 9px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid #D1D5DB'
                  }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  id="btn-copy-vetscribe-output"
                  onClick={handleCopyParaphrase}
                  style={{
                    padding: '4px 9px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid #E5E7EB',
                    background: '#FFFFFF',
                    color: '#374151',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {isAiCopied ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  <span>{isAiCopied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  id="btn-apply-vetscribe-output"
                  onClick={handleApplyParaphrase}
                  style={{
                    background: '#0D472B',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  <Check size={13} />
                  <span>Apply to Case</span>
                </button>
              </div>
            </div>

            {/* Paraphrased Text Content */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '10px 12px'
              }}
            >
              <p
                id="vetscribe-paraphrased-output"
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#111827',
                  lineHeight: '1.55',
                  fontWeight: 450
                }}
              >
                {aiResult.paraphrased_text}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file) => {
    if (!file) return;

    // Validate against corrupted or 0-byte files
    if (file.size <= 0) {
      showZenveAlert('Selected file is empty or corrupted (0 bytes). Please choose a valid file.');
      return;
    }

    // Limit maximum file size to 100 MB for clinical high-res media
    if (file.size > 100 * 1024 * 1024) {
      showZenveAlert('Selected file exceeds maximum upload limit of 100 MB. Please choose a smaller file.');
      return;
    }

    // Format & MIME validation
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i.test(file.name);

    if (!isImage && !isVideo) {
      showZenveAlert('Unsupported file format. Please upload an image (JPG, PNG, WEBP, GIF) or video (MP4, WEBM, MOV).');
      return;
    }

    setUploadError(null);
    setMediaFile(file);
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    setFileDetails({
      name: file.name,
      size: `${sizeInMB} MB`,
      type: file.type
    });

    if (isVideo) {
      const blobUrl = URL.createObjectURL(file);
      setVideoFileUrl(blobUrl);
      setMediaUrl(blobUrl);

      // Automatically analyze video duration from the uploaded file
      analyzeVideoDuration(file).then((detected) => {
        if (detected) {
          setVideoDuration(detected);
          setIsDurationAnalyzed(true);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setMediaUrl(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectSamplePhoto = (sample) => {
    setMediaUrl(sample.url);
    setMediaFile(null);
    setFileDetails({ name: sample.label, size: 'Sample Preset', type: 'image/jpeg' });
  };

  const handleSelectSampleStory = (sample) => {
    setMediaUrl(sample.url);
    setStoryCaption(sample.caption);
    setMediaFile(null);
    setFileDetails({ name: sample.label, size: 'Sample Story', type: 'image/jpeg' });
  };

  const handleSelectSampleVideo = (sample) => {
    setVideoTitle(sample.title);
    setVideoDuration(sample.duration);
    setIsDurationAnalyzed(true);
    setVideoSpecialty(sample.specialty);
    setMediaUrl(sample.thumbnail);
    setVideoFileUrl(sample.videoUrl);
    setMediaFile(null);
    setFileDetails({ name: sample.title, size: 'Clinical Reel', type: 'video/mp4' });
  };

  const handleClearMedia = () => {
    setMediaUrl('');
    setMediaFile(null);
    setFileDetails(null);
    setVideoFileUrl('');
    setIsDurationAnalyzed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (storyInputRef.current) storyInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isUploading || isSubmitting) return;

    setIsSubmitting(true);
    setUploadError(null);
    setUploadProgressText('Processing media...');

    // Client idempotency key to prevent duplicate post submissions across slow connections
    const idempotencyKey = 'zenve_post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    let uploadedMediaUrl = mediaUrl;
    let uploadedVideoUrl = videoFileUrl;
    let detectedMediaType = (mediaFile && mediaFile.type.startsWith('video/')) || (videoFileUrl && /\.(mp4|webm|mov|m4v|ogg)$/i.test(videoFileUrl)) ? 'VIDEO' : 'IMAGE';

    if (mediaFile) {
      try {
        setIsUploading(true);
        setUploadProgressText('Uploading media to server...');
        const uploadRes = await api.media.upload(mediaFile);
        if (!uploadRes || (!uploadRes.url && !uploadRes.fullUrl)) {
          throw new Error(uploadRes?.error || 'Server did not return a valid media URL');
        }
        uploadedMediaUrl = uploadRes.url || uploadRes.fullUrl;
        if (mediaFile.type.startsWith('video/') || uploadRes.mediaType === 'VIDEO') {
          uploadedVideoUrl = uploadedMediaUrl;
          detectedMediaType = 'VIDEO';
        } else {
          detectedMediaType = 'IMAGE';
        }
        setIsUploading(false);
      } catch (uploadErr) {
        console.error('[CreatePostModal] Media upload failed:', uploadErr);
        setIsUploading(false);
        setIsSubmitting(false);
        const errMsg = uploadErr.message || 'Media upload failed';
        setUploadError(errMsg);
        showZenveAlert(`Media Upload Failed: ${errMsg}. Please verify server connection and try again.`);
        return;
      }
    }

    setUploadProgressText('Publishing to veterinary network...');

    try {
      if (activeType === 'STORY') {
        const text = storyCaption.trim() || content.trim() || 'Moments from clinical practice';
        if (!uploadedMediaUrl) {
          setIsSubmitting(false);
          setIsUploading(false);
          showZenveAlert('Please upload a photo or video for your story.');
          return;
        }

        if (uploadedMediaUrl.startsWith('blob:')) {
          setIsSubmitting(false);
          setIsUploading(false);
          showZenveAlert('Media upload has not completed. Please wait or re-select the file before publishing.');
          return;
        }

        await onPostSubmit({
          postType: 'STORY',
          content: text,
          imageUrl: uploadedMediaUrl,
          videoUrl: detectedMediaType === 'VIDEO' ? uploadedMediaUrl : null,
          mediaType: detectedMediaType,
          species,
          idempotencyKey
        });
        setIsSubmitting(false);
        setIsUploading(false);
        handleClose();
        return;
      }

      if (activeType === 'SHORT_VIDEO') {
        const title = videoTitle.trim() || content.slice(0, 50) || 'Clinical Technique Reel';
        if (!uploadedMediaUrl && !uploadedVideoUrl) {
          setIsSubmitting(false);
          setIsUploading(false);
          showZenveAlert('Please upload a clinical video or select a sample reel.');
          return;
        }
        await onPostSubmit({
          postType: 'SHORT_VIDEO',
          content: content.trim() || title,
          videoTitle: title,
          specialty: videoSpecialty,
          duration: videoDuration,
          imageUrl: uploadedMediaUrl || null,
          videoUrl: uploadedVideoUrl || uploadedMediaUrl,
          species,
          idempotencyKey
        });
        setIsSubmitting(false);
        setIsUploading(false);
        handleClose();
        return;
      }

      // GENERAL_POST or CLINICAL_CASE
      if (!content.trim() && !uploadedMediaUrl && !uploadedVideoUrl) {
        setIsSubmitting(false);
        setIsUploading(false);
        showZenveAlert('Please enter post content or upload an image/video.');
        return;
      }

      await onPostSubmit({
        content: content.trim() || (activeType === 'CLINICAL_CASE' ? 'Clinical case observation' : 'Clinical photograph / update'),
        postType: activeType,
        imageUrl: (detectedMediaType === 'IMAGE' && uploadedMediaUrl) ? uploadedMediaUrl.trim() : (mediaUrl && !mediaUrl.endsWith('.mp4') ? mediaUrl : null),
        videoUrl: uploadedVideoUrl || (detectedMediaType === 'VIDEO' ? uploadedMediaUrl : null),
        species,
        idempotencyKey
      });

      setIsSubmitting(false);
      setIsUploading(false);
      handleClose();
    } catch (submitErr) {
      console.error('[CreatePostModal] Post publishing error:', submitErr);
      setIsSubmitting(false);
      setIsUploading(false);
      const errMsg = submitErr?.message || 'Failed to publish post. Please check your network and retry.';
      setUploadError(errMsg);
      showZenveAlert(`Publishing Failed: ${errMsg}`);
    }
  };

  const doctorName = currentUser?.name || 'Dr. You (Verified)';
  const doctorAvatar = currentUser?.avatar || '';

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '100%',
          borderRadius: '16px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3 className="modal-title">Share to Zenve Vet</h3>
          <button className="btn-close-modal" onClick={handleClose} type="button">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {/* Scrollable Modal Content */}
          <div
            className="modal-body custom-scrollbar"
            style={{
              padding: '20px 24px 32px 24px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}
          >
            {/* Top Tabs - Exact design from reference screenshot */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}>
              {[
                { id: 'CLINICAL_CASE', label: 'Clinical Case' },
                { id: 'GENERAL_POST', label: 'Photo / Post' },
                { id: 'STORY', label: '24h Story' },
                { id: 'SHORT_VIDEO', label: 'Upload Reel / Video' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPostType(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '36px',
                    padding: '0 16px',
                    lineHeight: '1',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    border: '1px solid',
                    borderColor: activeType === tab.id ? '#0D472B' : '#E5E9E5',
                    background: activeType === tab.id ? '#E8F3ED' : '#FFFFFF',
                    color: activeType === tab.id ? '#0D472B' : '#64726A',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    flexShrink: 0,
                    outline: 'none',
                    userSelect: 'none'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ======================================================== */}
            {/* TAB 1: CLINICAL CASE                                     */}
            {/* ======================================================== */}
            {activeType === 'CLINICAL_CASE' && (
              <>
                {/* Species and Case meta selector */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: '600', color: '#121A15' }}>Patient Species:</label>
                  <select
                    className="pill-select-control"
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    <option value="Canine">Canine (Dog)</option>
                    <option value="Feline">Feline (Cat)</option>
                    <option value="Equine">Equine (Horse)</option>
                    <option value="Bovine">Bovine (Cattle)</option>
                    <option value="Avian">Avian (Bird)</option>
                    <option value="Exotic / Wildlife">Exotic / Wildlife</option>
                  </select>
                </div>

                {/* Textarea */}
                <textarea
                  rows="4"
                  className="custom-filter-select"
                  style={{
                    width: '100%',
                    minHeight: '110px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #D1D5DB',
                    backgroundColor: '#FFFFFF',
                    fontSize: '13.5px',
                    lineHeight: '1.5',
                    color: '#111827',
                    outline: 'none',
                    resize: 'vertical',
                    marginBottom: '8px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Share a clinical discovery, diagnosis, surgical technique, or discussion with peer veterinarians..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />

                {/* VetScribe AI Case Assistant */}
                {renderVetScribeAssistant()}

                {/* Upload Scan / Photo section */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: '600', color: '#121A15' }}>
                      Add Clinical Scan or Radiograph (Optional)
                    </label>
                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                      X-Ray · CT · Cytology
                    </span>
                  </div>

                  {/* File Upload Box */}
                  {!mediaUrl ? (
                    <div>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          border: isDragging ? '2px dashed #059669' : '1.5px dashed #D1D5DB',
                          backgroundColor: isDragging ? '#ECFDF5' : '#F9FAFB',
                          borderRadius: '10px',
                          padding: '16px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          marginBottom: '8px'
                        }}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileInputChange}
                          accept="image/*"
                          style={{ display: 'none' }}
                        />
                        <UploadCloud size={24} color="#059669" style={{ margin: '0 auto 6px auto', display: 'block' }} />
                        <p style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                          Click to upload scan <span style={{ fontWeight: 400, color: '#6B7280' }}>or drag and drop</span>
                        </p>
                        <span style={{ fontSize: '11.5px', color: '#9CA3AF' }}>
                          JPG, PNG, WEBP, DICOM image (up to 25MB)
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>Or paste direct URL:</span>
                        <input
                          type="text"
                          placeholder="https://... (radiograph, cytology, or surgical photo)"
                          className="custom-filter-select"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value.trim())}
                        />
                      </div>

                      {/* Quick sample chips */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Samples:</span>
                        {SAMPLE_PHOTOS.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectSamplePhoto(s)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: '#F3F4F6',
                              border: '1px solid #E5E7EB',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Preview card */
                    <div style={{
                      position: 'relative',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px'
                    }}>
                      <img
                        src={resolveMediaUrl(mediaUrl)}
                        alt="Clinical scan preview"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80';
                        }}
                        style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fileDetails?.name || 'Clinical Scan Attached'}
                        </p>
                        <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600 }}>
                          {fileDetails?.size || 'Attached photo'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearMedia}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          background: '#FEE2E2',
                          color: '#DC2626',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        title="Remove image"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ======================================================== */}
            {/* TAB 2: PHOTO / POST                                      */}
            {/* ======================================================== */}
            {activeType === 'GENERAL_POST' && (
              <>
                {/* Species tag */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: '600', color: '#121A15' }}>Category / Species:</label>
                  <select
                    className="pill-select-control"
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    <option value="Canine">Canine</option>
                    <option value="Feline">Feline</option>
                    <option value="Equine">Equine</option>
                    <option value="Bovine">Bovine</option>
                    <option value="Avian & Exotics">Avian & Exotics</option>
                    <option value="General Practice">General Practice</option>
                  </select>
                </div>

                {/* Textarea */}
                <textarea
                  rows="4"
                  className="custom-filter-select"
                  style={{
                    width: '100%',
                    minHeight: '110px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #D1D5DB',
                    backgroundColor: '#FFFFFF',
                    fontSize: '13.5px',
                    lineHeight: '1.5',
                    color: '#111827',
                    outline: 'none',
                    resize: 'vertical',
                    marginBottom: '8px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Share clinical photographs, patient recovery milestone, surgical prep, or an update..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required={!mediaUrl}
                />

                {/* VetScribe AI Case Assistant */}
                {renderVetScribeAssistant()}

                {/* Photo Upload Zone */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: '600', color: '#121A15' }}>
                      Upload Photos (Clinical & Practice)
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setUploadMode('file')}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: uploadMode === 'file' ? '#E8F3ED' : '#F3F4F6',
                          color: uploadMode === 'file' ? '#0D472B' : '#6B7280',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Browse Device
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadMode('url')}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: uploadMode === 'url' ? '#E8F3ED' : '#F3F4F6',
                          color: uploadMode === 'url' ? '#0D472B' : '#6B7280',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Image URL
                      </button>
                    </div>
                  </div>

                  {!mediaUrl ? (
                    <div>
                      {uploadMode === 'file' ? (
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            border: isDragging ? '2px dashed #059669' : '1.5px dashed #D1D5DB',
                            backgroundColor: isDragging ? '#ECFDF5' : '#F9FAFB',
                            borderRadius: '10px',
                            padding: '22px 16px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            marginBottom: '8px'
                          }}
                        >
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileInputChange}
                            accept="image/*"
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: '#E8F3ED',
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 8px auto'
                          }}>
                            <Camera size={22} />
                          </div>
                          <p style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: 600, color: '#111827' }}>
                            Click to select photos <span style={{ fontWeight: 400, color: '#6B7280' }}>or drag & drop</span>
                          </p>
                          <span style={{ fontSize: '11.5px', color: '#9CA3AF' }}>
                            High resolution JPG, PNG, WEBP, HEIC supported (up to 25MB)
                          </span>
                        </div>
                      ) : (
                        <div style={{ marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="Paste image URL (https://...)"
                            className="custom-filter-select"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value.trim())}
                          />
                        </div>
                      )}

                      {/* Sample preset buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Try sample:</span>
                        {SAMPLE_PHOTOS.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectSamplePhoto(s)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: '#F3F4F6',
                              border: '1px solid #E5E7EB',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Photo Preview Card with Image */
                    <div style={{
                      position: 'relative',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #E5E7EB',
                      backgroundColor: '#111827',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}>
                      <img
                        src={resolveMediaUrl(mediaUrl)}
                        alt="Uploaded preview"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80';
                        }}
                        style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        display: 'flex',
                        gap: '8px'
                      }}>
                        <button
                          type="button"
                          onClick={handleClearMedia}
                          style={{
                            background: 'rgba(0,0,0,0.65)',
                            backdropFilter: 'blur(4px)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Remove photo"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '8px 12px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: '#FFFFFF',
                        fontSize: '12px'
                      }}>
                        <span style={{ fontWeight: 600 }}>{fileDetails?.name || 'Photo Ready for Community'}</span>
                        <span style={{ color: '#D1FAE5' }}>{fileDetails?.size || 'High Res'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ======================================================== */}
            {/* TAB 3: STORY                                             */}
            {/* ======================================================== */}
            {activeType === 'STORY' && (
              <>
                {/* 24-Hour Expiration Notice Banner */}
                <div style={{
                  padding: '10px 14px',
                  background: 'linear-gradient(135deg, #ECFDF5 0%, #E0F2FE 100%)',
                  borderRadius: '8px',
                  border: '1px solid #A7F3D0',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <Clock size={18} color="#059669" style={{ flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: '#065F46' }}>
                      Moments from the Community · 24-Hour Story
                    </p>
                    <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: '#047857' }}>
                      Appears in the story circle carousel at the top of the feed and automatically expires after 24 hours.
                    </p>
                  </div>
                </div>

                {/* Story Caption Input */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#121A15', marginBottom: '4px' }}>
                    Story Caption / Patient Update
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Prepped for laparoscopic gastropexy in OR 2 🩺"
                    className="custom-filter-select"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #D1D5DB',
                      backgroundColor: '#FFFFFF',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    value={storyCaption}
                    onChange={(e) => setStoryCaption(e.target.value)}
                    required
                  />
                </div>

                {/* Story Upload & Live Preview Grid */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#121A15', marginBottom: '6px' }}>
                    Upload Story Photo or Vertical Clip
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: mediaUrl ? '1fr 200px' : '1fr', gap: '14px' }}>
                    {/* Left: Upload Dropzone & Controls */}
                    <div>
                      {!mediaUrl ? (
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => storyInputRef.current?.click()}
                          style={{
                            border: isDragging ? '2px dashed #059669' : '1.5px dashed #D1D5DB',
                            backgroundColor: isDragging ? '#ECFDF5' : '#F9FAFB',
                            borderRadius: '10px',
                            padding: '24px 16px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            marginBottom: '8px'
                          }}
                        >
                          <input
                            type="file"
                            ref={storyInputRef}
                            onChange={handleFileInputChange}
                            accept="image/*,video/*"
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: '#ECFDF5',
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 8px auto'
                          }}>
                            <Plus size={24} />
                          </div>
                          <p style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: 600, color: '#111827' }}>
                            Upload Story Photo or Video
                          </p>
                          <span style={{ fontSize: '11.5px', color: '#9CA3AF' }}>
                            Optimized for 9:16 vertical view · JPG, PNG, MP4
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          padding: '12px',
                          background: '#F9FAFB',
                          borderRadius: '8px',
                          border: '1px solid #E5E7EB',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#111827' }}>Story Media Attached</span>
                            <button
                              type="button"
                              onClick={handleClearMedia}
                              style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Replace
                            </button>
                          </div>
                          <p style={{ margin: 0, fontSize: '11.5px', color: '#6B7280' }}>
                            {fileDetails?.name || 'Selected media'}
                          </p>
                        </div>
                      )}

                      {/* Or URL Input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280', whiteSpace: 'nowrap' }}>Or Image URL:</span>
                        <input
                          type="text"
                          placeholder="https://..."
                          className="custom-filter-select"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value.trim())}
                        />
                      </div>

                      {/* Sample Story Presets */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Quick presets:</span>
                        {SAMPLE_STORIES.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectSampleStory(s)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: '#F3F4F6',
                              border: '1px solid #E5E7EB',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Right: Live Mobile Story Simulator Card */}
                    {mediaUrl && (
                      <div style={{
                        width: '200px',
                        height: '280px',
                        backgroundColor: '#000',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        position: 'relative',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        {/* Top Story Progress Bar */}
                        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, height: 2.5, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 2, zIndex: 5 }} />

                        {/* Header in Preview */}
                        <div style={{ position: 'absolute', top: 14, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6, zIndex: 5 }}>
                          <img
                            src={doctorAvatar}
                            alt="Doctor"
                            style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #10B981' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: '#FFF', fontSize: 10.5, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doctorName}
                            </p>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>Just now · 24h</span>
                          </div>
                        </div>

                        {/* Story Media with Video Preview Support */}
                        {mediaFile?.type?.startsWith('video/') || (videoFileUrl && /\.(mp4|webm|mov|m4v|ogg)$/i.test(videoFileUrl)) || mediaUrl?.startsWith('data:video') ? (
                          <video
                            src={resolveMediaUrl(videoFileUrl || mediaUrl)}
                            autoPlay
                            loop
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        ) : (
                          <img
                            src={resolveMediaUrl(mediaUrl)}
                            alt="Story preview"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80';
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}

                        {/* Caption Overlay */}
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          padding: '16px 8px 10px 8px',
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                          color: '#FFF'
                        }}>
                          <p style={{ fontSize: 11, margin: 0, lineHeight: 1.3, fontWeight: 500 }}>
                            {storyCaption || 'Your story caption...'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ======================================================== */}
            {/* TAB 4: SHORT VIDEO                                       */}
            {/* ======================================================== */}
            {activeType === 'SHORT_VIDEO' && (
              <>
                {/* Video Title */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#121A15', marginBottom: '4px' }}>
                    Clinical Reel Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rapid Subdermal Suture Pattern for Tension Relief"
                    className="custom-filter-select"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #D1D5DB',
                      backgroundColor: '#FFFFFF',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    required
                  />
                </div>

                {/* Video Category and Duration */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#121A15', marginBottom: '4px' }}>
                      Specialty / Category
                    </label>
                    <select
                      className="pill-select-control"
                      value={videoSpecialty}
                      onChange={(e) => setVideoSpecialty(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '12px' }}
                    >
                      <option value="Veterinary Surgery">Veterinary Surgery</option>
                      <option value="Critical Care & TFAST">Critical Care & TFAST</option>
                      <option value="Feline Practice">Feline Practice</option>
                      <option value="Avian & Exotics">Avian & Exotics</option>
                      <option value="Dermatology">Dermatology</option>
                      <option value="Ophthalmology">Ophthalmology</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#121A15', margin: 0 }}>
                        Duration
                      </label>
                      {isDurationAnalyzed && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Check size={12} /> Auto-detected
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="text"
                        className="custom-filter-select"
                        value={videoDuration}
                        onChange={(e) => {
                          setVideoDuration(e.target.value);
                          setIsDurationAnalyzed(false);
                        }}
                        placeholder="e.g. 0:50 or 1:15"
                        style={{ flex: 1, padding: '7px 10px', fontSize: '12px' }}
                      />
                      <select
                        className="pill-select-control"
                        value={['0:30', '0:45', '0:50', '0:58', '1:00', '1:15'].includes(videoDuration) ? videoDuration : 'custom'}
                        onChange={(e) => {
                          if (e.target.value !== 'custom') {
                            setVideoDuration(e.target.value);
                            setIsDurationAnalyzed(false);
                          }
                        }}
                        style={{ padding: '7px 8px', fontSize: '12px', minWidth: '90px' }}
                      >
                        {videoDuration && !['0:30', '0:45', '0:50', '0:58', '1:00', '1:15'].includes(videoDuration) && (
                          <option value="custom">{videoDuration} (detected)</option>
                        )}
                        <option value="0:30">0:30 sec</option>
                        <option value="0:45">0:45 sec</option>
                        <option value="0:50">0:50 sec</option>
                        <option value="0:58">0:58 sec</option>
                        <option value="1:00">1:00 min</option>
                        <option value="1:15">1:15 min</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Description textarea */}
                <textarea
                  rows="3"
                  className="custom-filter-select"
                  style={{ width: '100%', resize: 'vertical', marginBottom: '14px', fontSize: '13px' }}
                  placeholder="Briefly explain the clinical technique, instrumentation used, or pearls for colleagues..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />

                {/* VetScribe AI Case Assistant */}
                {renderVetScribeAssistant()}

                {/* Short Video Upload Zone */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#121A15', marginBottom: '6px' }}>
                    Upload Video File or Clinical Reel URL
                  </label>

                  {!videoFileUrl && !mediaUrl ? (
                    <div>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => videoInputRef.current?.click()}
                        style={{
                          border: isDragging ? '2px dashed #059669' : '1.5px dashed #D1D5DB',
                          backgroundColor: isDragging ? '#ECFDF5' : '#F9FAFB',
                          borderRadius: '10px',
                          padding: '24px 16px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          marginBottom: '8px'
                        }}
                      >
                        <input
                          type="file"
                          ref={videoInputRef}
                          onChange={handleFileInputChange}
                          accept="video/mp4,video/webm,video/quicktime,image/*"
                          style={{ display: 'none' }}
                        />
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: '#E8F3ED',
                          color: '#0D472B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 8px auto'
                        }}>
                          <Video size={24} />
                        </div>
                        <p style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: 600, color: '#111827' }}>
                          Click to upload clinical video <span style={{ fontWeight: 400, color: '#6B7280' }}>or drag & drop</span>
                        </p>
                        <span style={{ fontSize: '11.5px', color: '#9CA3AF' }}>
                          MP4, WebM, MOV clips (recommended under 60 seconds)
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: '#6B7280', whiteSpace: 'nowrap' }}>Or Video/Thumbnail URL:</span>
                        <input
                          type="text"
                          placeholder="https://... (direct video link or reel thumbnail)"
                          className="custom-filter-select"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                          value={mediaUrl}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setMediaUrl(val);
                            setVideoFileUrl(val);
                            if (val && !val.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                              analyzeVideoDuration(val).then(detected => {
                                if (detected) {
                                  setVideoDuration(detected);
                                  setIsDurationAnalyzed(true);
                                }
                              });
                            }
                          }}
                        />
                      </div>

                      {/* Quick Sample Clinical Reels */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Sample Reels:</span>
                        {SAMPLE_VIDEOS.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectSampleVideo(s)}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: '#F3F4F6',
                              border: '1px solid #E5E7EB',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            {s.specialty}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Video Live Player Preview */
                    <div style={{
                      position: 'relative',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #E5E7EB',
                      backgroundColor: '#000',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      marginBottom: '16px'
                    }}>
                      {videoFileUrl && (/\.(mp4|webm|mov|m4v|ogg)$/i.test(videoFileUrl) || videoFileUrl.startsWith('blob:') || videoFileUrl.startsWith('data:video') || !mediaUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) ? (
                        <video
                          src={resolveMediaUrl(videoFileUrl || mediaUrl)}
                          controls
                          playsInline
                          onLoadedMetadata={(e) => {
                            const sec = e.target.duration;
                            if (!isNaN(sec) && sec > 0) {
                              const totalSec = Math.round(sec);
                              const mins = Math.floor(totalSec / 60);
                              const s = totalSec % 60;
                              const formatted = `${mins}:${s < 10 ? '0' : ''}${s}`;
                              setVideoDuration(formatted);
                              setIsDurationAnalyzed(true);
                            }
                          }}
                          style={{ width: '100%', maxHeight: '250px', objectFit: 'contain', backgroundColor: '#000', display: 'block' }}
                        />
                      ) : (
                        <img
                          src={resolveMediaUrl(mediaUrl)}
                          alt="Reel preview"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80';
                          }}
                          style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }}
                        />
                      )}

                      <div style={{
                        padding: '10px 14px',
                        background: '#1F2937',
                        color: '#FFF',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{videoTitle || 'Clinical Video Attached'}</p>
                          <span style={{ fontSize: '11.5px', color: '#9CA3AF' }}>{videoSpecialty} · {videoDuration}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearMedia}
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ======================================================== */}
          {/* FOOTER ACTIONS ROW - Fixed at bottom, never overlaps body */}
          {/* ======================================================== */}
          <div className="modal-footer" style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '14px 24px',
            borderTop: '1px solid #E5E9E5',
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
            zIndex: 10
          }}>

            {/* Error Notification Banner if submission fails */}
            {uploadError && (
              <div style={{
                marginRight: 'auto',
                padding: '6px 12px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '6px',
                color: '#991B1B',
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span><strong>Publishing error:</strong> {uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Action Buttons Group */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading || isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #E5E7EB',
                  cursor: (isUploading || isSubmitting) ? 'not-allowed' : 'pointer',
                  opacity: (isUploading || isSubmitting) ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isUploading && !isSubmitting) e.currentTarget.style.backgroundColor = '#E5E7EB';
                }}
                onMouseLeave={(e) => {
                  if (!isUploading && !isSubmitting) e.currentTarget.style.backgroundColor = '#F3F4F6';
                }}
              >
                Cancel
              </button>

              {/* Right Submit Button with immediate click prevention & status */}
              <button
                type="submit"
                className="btn-submit-post"
                disabled={isUploading || isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: (isUploading || isSubmitting) ? '#08331f' : '#0D472B',
                  color: '#FFFFFF',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: (isUploading || isSubmitting) ? 'not-allowed' : 'pointer',
                  opacity: (isUploading || isSubmitting) ? 0.75 : 1,
                  transition: 'all 0.15s ease',
                  boxShadow: '0 2px 6px rgba(13, 71, 43, 0.2)'
                }}
                onMouseEnter={(e) => {
                  if (!isUploading && !isSubmitting) e.currentTarget.style.backgroundColor = '#072e1c';
                }}
                onMouseLeave={(e) => {
                  if (!isUploading && !isSubmitting) e.currentTarget.style.backgroundColor = '#0D472B';
                }}
              >
                {(isUploading || isSubmitting) ? (
                  <>
                    <span style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#FFFFFF',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    <span>{uploadProgressText || 'Publishing...'}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {activeType === 'STORY' && 'Publish Story'}
                      {activeType === 'SHORT_VIDEO' && 'Upload Reel'}
                      {activeType === 'GENERAL_POST' && 'Zenv to Network'}
                      {activeType === 'CLINICAL_CASE' && 'Zenv to Network'}
                    </span>
                    <Send size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
