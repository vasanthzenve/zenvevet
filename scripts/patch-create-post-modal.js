const fs = require('fs');
const path = require('path');

const filePath = path.resolve('c:/Users/hp/Downloads/projects/zenve-vet/zenve-vet/client/src/components/CreatePostModal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add isSubmitting state
if (!content.includes('const [isSubmitting, setIsSubmitting] = useState(false);')) {
  content = content.replace(
    "const [uploadError, setUploadError] = useState(null);",
    "const [uploadError, setUploadError] = useState(null);\n  const [isSubmitting, setIsSubmitting] = useState(false);"
  );
}

// 2. Replace handleSubmit implementation
const oldHandleSubmitRegex = /const handleSubmit = async \(e\) => \{[\s\S]*?const doctorName = currentUser\?\.name/;

const newHandleSubmit = `const handleSubmit = async (e) => {
    e.preventDefault();
    if (isUploading || isSubmitting) return;

    setIsSubmitting(true);
    setUploadError(null);
    setUploadProgressText('Processing media...');

    // Client idempotency key to prevent duplicate post submissions across slow connections
    const idempotencyKey = 'zenve_post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    let uploadedMediaUrl = mediaUrl;
    let uploadedVideoUrl = videoFileUrl;
    let detectedMediaType = (mediaFile && mediaFile.type.startsWith('video/')) || (videoFileUrl && /\\.(mp4|webm|mov|m4v|ogg)$/i.test(videoFileUrl)) ? 'VIDEO' : 'IMAGE';

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
        alert(\`Media Upload Failed: \${errMsg}. Please verify server connection and try again.\`);
        return;
      }
    }

    setUploadProgressText('Publishing to veterinary network...');

    try {
      if (postType === 'STORY') {
        const text = storyCaption.trim() || content.trim() || 'Moments from clinical practice';
        if (!uploadedMediaUrl) {
          setIsSubmitting(false);
          setIsUploading(false);
          alert('Please upload a photo or video for your story.');
          return;
        }

        if (uploadedMediaUrl.startsWith('blob:')) {
          setIsSubmitting(false);
          setIsUploading(false);
          alert('Media upload has not completed. Please wait or re-select the file before publishing.');
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

      if (postType === 'SHORT_VIDEO') {
        const title = videoTitle.trim() || content.slice(0, 50) || 'Clinical Technique Reel';
        if (!uploadedMediaUrl && !uploadedVideoUrl) {
          setIsSubmitting(false);
          setIsUploading(false);
          alert('Please upload a clinical video or select a sample reel.');
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
        alert('Please enter post content or upload an image/video.');
        return;
      }

      await onPostSubmit({
        content: content.trim() || (postType === 'CLINICAL_CASE' ? 'Clinical case observation' : 'Clinical photograph / update'),
        postType,
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
      alert(\`Publishing Failed: \${errMsg}\`);
    }
  };

  const doctorName = currentUser?.name`;

content = content.replace(oldHandleSubmitRegex, newHandleSubmit);

// 3. Update the Submit Button with disabled and loading states, plus error banner
const oldButtonRegex = /\{\/\* Right Submit Button \*\/\}[\s\S]*?<button[\s\S]*?className="btn-submit-post"[\s\S]*?<\/button>/;

const newButton = `{/* Error Notification Banner if submission fails */}
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

            {/* Right Submit Button with immediate click prevention & status */}
            <button
              type="submit"
              className="btn-submit-post"
              disabled={isUploading || isSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: (isUploading || isSubmitting) ? '#08331f' : '#0D472B',
                color: '#FFFFFF',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 600,
                border: 'none',
                cursor: (isUploading || isSubmitting) ? 'not-allowed' : 'pointer',
                opacity: (isUploading || isSubmitting) ? 0.75 : 1,
                transition: 'all 0.15s ease'
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
                    {postType === 'STORY' && 'Publish Story'}
                    {postType === 'SHORT_VIDEO' && 'Upload Reel'}
                    {postType === 'GENERAL_POST' && 'Zenv to Network'}
                    {postType === 'CLINICAL_CASE' && 'Zenv to Network'}
                  </span>
                  <Send size={14} />
                </>
              )}
            </button>`;

content = content.replace(oldButtonRegex, newButton);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched CreatePostModal.jsx');

