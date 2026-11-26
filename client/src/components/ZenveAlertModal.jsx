import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Sparkles
} from 'lucide-react';

// Global dispatch listener & state bridge
let globalAlertHandler = null;
let globalConfirmHandler = null;

/**
 * Trigger a small, centered, professional Zenve Alert (auto-dismisses in 2s by default).
 * {
 *   title?: string,
 *   message: string,
 *   type?: 'success' | 'error' | 'warning' | 'info',
 *   autoCloseMs?: number (defaults to 2000ms)
 * }
 */
export function showZenveAlert(options) {
  const config = typeof options === 'string' ? { message: options } : (options || {});
  if (globalAlertHandler) {
    return globalAlertHandler(config);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zenve:show-alert', { detail: config }));
  }
}

/**
 * Trigger a small centered Confirmation Dialog (Returns Promise<boolean>)
 */
export function showZenveConfirm(options) {
  const config = typeof options === 'string' ? { message: options } : (options || {});
  if (globalConfirmHandler) {
    return globalConfirmHandler(config);
  }
  return new Promise((resolve) => {
    if (typeof window !== 'undefined') {
      const handleResult = (e) => {
        window.removeEventListener('zenve:confirm-response', handleResult);
        resolve(!!e.detail?.confirmed);
      };
      window.addEventListener('zenve:confirm-response', handleResult);
      window.dispatchEvent(new CustomEvent('zenve:show-confirm', { detail: config }));
    } else {
      resolve(false);
    }
  });
}

// Automatically bind window.alert to ZenveAlertModal in browser environment
if (typeof window !== 'undefined') {
  if (!window._originalNativeAlert) {
    window._originalNativeAlert = window.alert;
  }
  window.alert = function (message) {
    showZenveAlert(message);
  };
}

/**
 * Intelligently infer modal type and title from message text
 */
function inferModalMeta(message = '', explicitType, explicitTitle) {
  const text = String(message || '');
  const lower = text.toLowerCase();

  let type = explicitType;
  let title = explicitTitle;

  if (!type) {
    if (
      lower.includes('live in the community') ||
      lower.includes('story is now live') ||
      lower.includes('success') ||
      lower.includes('accepted') ||
      lower.includes('verified') ||
      lower.includes('copied to clipboard') ||
      lower.includes('updated successfully') ||
      lower.includes('saved successfully') ||
      lower.includes('sent to')
    ) {
      type = 'success';
    } else if (
      lower.includes('error') ||
      lower.includes('failed') ||
      lower.includes('unsupported') ||
      lower.includes('exceeds') ||
      lower.includes('corrupted') ||
      lower.includes('invalid')
    ) {
      type = 'error';
    } else if (
      lower.includes('delete') ||
      lower.includes('are you sure') ||
      lower.includes('warning') ||
      lower.includes('remove') ||
      lower.includes('withdrawn')
    ) {
      type = 'warning';
    } else {
      type = 'info';
    }
  }

  if (!title) {
    if (lower.includes('story') && (lower.includes('live') || lower.includes('moment'))) {
      title = 'Story Published!';
    } else if (lower.includes('connection request sent')) {
      title = 'Connection Request Sent';
    } else if (lower.includes('connection accepted')) {
      title = 'Connected Successfully!';
    } else if (lower.includes('profile photo') || lower.includes('cover photo')) {
      title = 'Photo Updated';
    } else if (lower.includes('vci registration verified')) {
      title = 'VCI Registration Verified';
    } else if (lower.includes('copied to clipboard')) {
      title = 'Copied to Clipboard';
    } else if (lower.includes('flagged for veterinary moderation')) {
      title = 'Post Reported';
    } else if (lower.includes('exceeds maximum upload limit')) {
      title = 'File Too Large';
    } else if (lower.includes('unsupported file format')) {
      title = 'Unsupported File Type';
    } else if (lower.includes('empty or corrupted')) {
      title = 'Corrupted File';
    } else if (lower.includes('failed to') || lower.includes('error')) {
      title = 'Action Failed';
    } else if (type === 'success') {
      title = 'Success!';
    } else if (type === 'error') {
      title = 'Something Went Wrong';
    } else if (type === 'warning') {
      title = 'Attention Required';
    } else {
      title = 'Notice';
    }
  }

  return { type, title };
}

/**
 * ZenveAlertModal Component
 * Small, clean, 2-second auto-dismiss alert box centered directly in the website.
 * No blocking dark backdrop. 100% robust inline styles.
 */
export function ZenveAlertModal() {
  const [modalState, setModalState] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef(null);

  const closeModal = useCallback((confirmed = false) => {
    setIsClosing(true);
    setTimeout(() => {
      setModalState((current) => {
        if (!current) return null;
        if (current.isConfirm) {
          if (current.resolvePromise) current.resolvePromise(confirmed);
          if (confirmed && current.onConfirm) current.onConfirm();
          if (!confirmed && current.onCancel) current.onCancel();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('zenve:confirm-response', { detail: { confirmed } }));
          }
        } else {
          if (current.onClose) current.onClose();
        }
        return null;
      });
      setIsClosing(false);
    }, 200);
  }, []);

  // Global Handlers
  useEffect(() => {
    globalAlertHandler = (config) => {
      const { type, title } = inferModalMeta(config.message, config.type, config.title);
      // Exactly 2 seconds auto-dismiss
      const autoCloseMs = config.autoCloseMs !== undefined ? config.autoCloseMs : 2000;
      setIsClosing(false);
      setModalState({
        isOpen: true,
        isConfirm: false,
        title,
        message: config.message || '',
        type,
        onClose: config.onClose,
        autoCloseMs
      });
    };

    globalConfirmHandler = (config) => {
      const { type, title } = inferModalMeta(config.message, config.type || 'warning', config.title);
      return new Promise((resolve) => {
        setIsClosing(false);
        setModalState({
          isOpen: true,
          isConfirm: true,
          title: title || 'Are you sure?',
          message: config.message || '',
          type: type || 'warning',
          confirmText: config.confirmText || 'Confirm',
          cancelText: config.cancelText || 'Cancel',
          isDestructive: config.isDestructive !== false,
          resolvePromise: resolve,
          onConfirm: config.onConfirm,
          onCancel: config.onCancel
        });
      });
    };

    const handleCustomAlert = (e) => {
      if (globalAlertHandler && e.detail) globalAlertHandler(e.detail);
    };

    const handleCustomConfirm = (e) => {
      if (globalConfirmHandler && e.detail) globalConfirmHandler(e.detail);
    };

    window.addEventListener('zenve:show-alert', handleCustomAlert);
    window.addEventListener('zenve:show-confirm', handleCustomConfirm);

    return () => {
      globalAlertHandler = null;
      globalConfirmHandler = null;
      window.removeEventListener('zenve:show-alert', handleCustomAlert);
      window.removeEventListener('zenve:show-confirm', handleCustomConfirm);
    };
  }, []);

  // 2-second auto-close timer
  useEffect(() => {
    if (!modalState || modalState.isConfirm) return;

    if (modalState.autoCloseMs && modalState.autoCloseMs > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        closeModal(false);
      }, modalState.autoCloseMs);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [modalState, closeModal]);

  // Escape key listener
  useEffect(() => {
    if (!modalState) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState, closeModal]);

  if (!modalState) return null;

  const { title, message, type, isConfirm, confirmText, cancelText, isDestructive, autoCloseMs } = modalState;

  // Theme palettes with pure inline colors
  const getTheme = () => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle2 size={26} color="#00a86b" strokeWidth={2.6} />,
          badgeBg: '#ecfdf5',
          badgeBorder: '#a7f3d0',
          accentColor: '#00a86b',
          barGradient: 'linear-gradient(90deg, #003822 0%, #00a86b 100%)'
        };
      case 'error':
        return {
          icon: <AlertCircle size={26} color="#e11d48" strokeWidth={2.6} />,
          badgeBg: '#fff1f2',
          badgeBorder: '#fecdd3',
          accentColor: '#e11d48',
          barGradient: 'linear-gradient(90deg, #be123c 0%, #e11d48 100%)'
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={26} color="#d97706" strokeWidth={2.6} />,
          badgeBg: '#fffbeb',
          badgeBorder: '#fde68a',
          accentColor: '#d97706',
          barGradient: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)'
        };
      case 'info':
      default:
        return {
          icon: <Info size={26} color="#0284c7" strokeWidth={2.6} />,
          badgeBg: '#f0f9ff',
          badgeBorder: '#bae6fd',
          accentColor: '#0284c7',
          barGradient: 'linear-gradient(90deg, #0369a1 0%, #0284c7 100%)'
        };
    }
  };

  const theme = getTheme();

  return (
    <>
      <style>{`
        @keyframes zenveBoxIn {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.85);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes zenveBoxOut {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.92);
          }
        }
        @keyframes zenveBarShrink {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>

      {/* Lightweight non-intrusive container - NO dark blocking wall */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999999,
          pointerEvents: isConfirm ? 'auto' : 'none',
          backgroundColor: isConfirm ? 'rgba(15, 23, 42, 0.4)' : 'transparent',
          transition: 'background-color 0.2s ease'
        }}
        onClick={() => {
          if (isConfirm) closeModal(false);
        }}
      >
        {/* Small Centered Box Alert */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!isConfirm) closeModal(false);
          }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000000,
            width: '90%',
            maxWidth: '360px',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            boxShadow: '0 20px 45px -10px rgba(0, 38, 22, 0.28), 0 8px 24px -4px rgba(0, 0, 0, 0.12)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            padding: '20px 22px 16px 22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            pointerEvents: 'auto',
            cursor: isConfirm ? 'default' : 'pointer',
            boxSizing: 'border-box',
            fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            animation: isClosing ? 'zenveBoxOut 0.2s ease forwards' : 'zenveBoxIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
          role="alert"
          aria-live="assertive"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeModal(false);
            }}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 0
            }}
            aria-label="Dismiss alert"
          >
            <X size={14} strokeWidth={2.4} />
          </button>

          {/* Icon Badge */}
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: theme.badgeBg,
              border: `2px solid ${theme.badgeBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
              boxShadow: `0 4px 14px ${theme.badgeBorder}`
            }}
          >
            {theme.icon}
          </div>

          {/* Title */}
          <h4
            style={{
              margin: '0 0 6px 0',
              fontSize: '17px',
              fontWeight: '800',
              color: '#0f172a',
              letterSpacing: '-0.02em',
              lineHeight: 1.25
            }}
          >
            {title}
          </h4>

          {/* Message Text */}
          <p
            style={{
              margin: '0 0 14px 0',
              fontSize: '13.5px',
              color: '#475569',
              lineHeight: 1.45,
              fontWeight: '400',
              padding: '0 4px'
            }}
          >
            {message}
          </p>

          {/* Confirmation Buttons if this is a confirm dialog */}
          {isConfirm ? (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                width: '100%',
                marginTop: '6px'
              }}
            >
              <button
                type="button"
                onClick={() => closeModal(false)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  fontSize: '13.5px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => closeModal(true)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '12px',
                  backgroundColor: isDestructive ? '#e11d48' : '#00a86b',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                }}
              >
                {confirmText || 'Confirm'}
              </button>
            </div>
          ) : (
            /* 2-Second Animated Progress Bar */
            <div
              style={{
                width: '100%',
                height: '3px',
                backgroundColor: '#f1f5f9',
                borderRadius: '3px',
                overflow: 'hidden',
                marginTop: '4px'
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: theme.barGradient,
                  animation: `zenveBarShrink ${autoCloseMs || 2000}ms linear forwards`
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ZenveAlertModal;
