import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { api } from '../services/api';

export function ClinicalCaseModal({ clinicalCase, onClose }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!clinicalCase) return;
    setAiResult(null);
    setAiError(null);
    setCopied(false);
    document.body.classList.add('modal-open');

    return () => {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [clinicalCase]);

  if (!clinicalCase) return null;

  const handleUseAiAssistant = async () => {
    const rawText = [
      clinicalCase.title,
      clinicalCase.species ? `Species: ${clinicalCase.species}` : '',
      clinicalCase.presentingComplaint
    ].filter(Boolean).join('. ');

    if (!rawText.trim()) return;

    setIsAnalyzing(true);
    setAiError(null);
    try {
      const res = await api.vetscribe.paraphrase(rawText);
      if (res && (res.paraphrased_text || res.corrected_text)) {
        setAiResult(res);
      } else {
        throw new Error('Received empty response from NLP Assistant');
      }
    } catch (err) {
      console.warn('NLP Case Assistant request error:', err);
      setAiError('NLP Case Assistant is currently offline. Ensure python NLP-grammer-and-spell-checker-main/app.py is running.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyAiResult = () => {
    if (!aiResult?.paraphrased_text) return;
    navigator.clipboard?.writeText(aiResult.paraphrased_text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => { });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#0D472B', background: '#E8F3ED', padding: '3px 8px', borderRadius: '4px' }}>
              Clinical Case Study
            </span>
            <h3 className="modal-title" style={{ fontSize: '18px', marginTop: '6px' }}>{clinicalCase.title}</h3>
            <p style={{ fontSize: '13px', color: '#64726A' }}>By {clinicalCase.authorName} · {clinicalCase.authorSpecialty}</p>
          </div>
          <button className="btn-close-modal" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {clinicalCase.mediaUrl && (
            <div style={{ borderRadius: '10px', overflow: 'hidden', maxHeight: '280px' }}>
              <img src={clinicalCase.mediaUrl} alt={clinicalCase.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#F8F9FA', borderRadius: '8px', border: '1px solid #E5E9E5' }}>
            <strong style={{ fontSize: '13px', color: '#121A15', display: 'block', marginBottom: '4px' }}>Patient Signalment</strong>
            <span style={{ fontSize: '14px', color: '#0D472B', fontWeight: '600' }}>{clinicalCase.species}</span>
          </div>

          {clinicalCase.presentingComplaint && (
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#0D472B', marginBottom: '6px' }}>
                Presenting Complaint & History
              </h4>
              <p style={{ fontSize: '14px', color: '#344038', lineHeight: '1.6' }}>
                {clinicalCase.presentingComplaint}
              </p>
            </div>
          )}

            {/* AI Case Assistant Output Card */}
            {aiResult && (
              <div style={{
                background: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="#059669" />
                    <strong style={{ fontSize: '13px', color: '#065F46' }}>NLP AI Case Analysis & Polish</strong>
                    <span style={{ fontSize: '11px', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                      {aiResult.model || 'NLP Llama-3.2'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAiResult}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #A7F3D0',
                      background: '#FFFFFF',
                      color: '#065F46',
                      cursor: 'pointer'
                    }}
                  >
                    {copied ? <><Check size={13} color="#059669" /> Copied!</> : <><Copy size={13} /> Copy Polish</>}
                  </button>
                </div>

                <div style={{ fontSize: '13.5px', color: '#14532D', lineHeight: '1.6', whiteSpace: 'pre-wrap', background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                  {aiResult.paraphrased_text}
                </div>

                {aiResult.suggestions && aiResult.suggestions.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '4px' }}>
                      Vocabulary & Grammar Suggestions:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {aiResult.suggestions.map((s, idx) => (
                        <span key={idx} style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '4px', border: '1px solid #FDE68A' }}>
                          {s.word} → <strong>{s.suggestion}</strong> ({s.reason})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {aiResult.next_suggestions && aiResult.next_suggestions.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '4px' }}>
                      Suggested Next Words:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {aiResult.next_suggestions.map((word, idx) => (
                        <span key={idx} style={{ fontSize: '11px', background: '#E0E7FF', color: '#3730A3', padding: '2px 8px', borderRadius: '4px' }}>
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {aiError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '12.5px' }}>
                {aiError}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid #E5E9E5', marginTop: '4px', flexWrap: 'wrap', gap: '10px' }}>
              {/* Use AI Case Assistant Button */}
              <button
                type="button"
                id="btn-ai-case-assistant"
                data-testid="btn-ai-case-assistant"
                title="Use AI Case Assistant to polish and analyze clinical notes using NLP"
                aria-label="Use AI Case Assistant"
                onClick={handleUseAiAssistant}
                disabled={isAnalyzing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: isAnalyzing ? '#F3F4F6' : '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  color: isAnalyzing ? '#6B7280' : '#065F46',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  padding: '7px 15px',
                  borderRadius: '8px',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 3px rgba(6, 95, 70, 0.08)'
                }}
              >
                {isAnalyzing ? (
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

              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  color: '#374151',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      );
}
      export default ClinicalCaseModal;
