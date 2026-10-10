import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiCheck, HiExclamationCircle } from 'react-icons/hi';
import confetti from 'canvas-confetti';
import './GlassyOtpCard.css';

/**
 * GlassyOtpCard
 * ─────────────────────────────────────────────────────────────────
 * Pixel-accurate reproduction of the Glassy OTP Typing and Verification
 * animation from the reference showcase video:
 * 1. Frosted glassmorphism card with 4 glowing corner brackets.
 * 2. Luminous golden key badge icon with ambient pulse.
 * 3. Dynamic header: "Verify OTP" -> "Verified Successfully".
 * 4. Digit boxes with spring-animated pop entrance on typing.
 * 5. Orbital revolving carousel of digit boxes during "Verifying Code...".
 * 6. Imploding collapse into radiant emerald green checkmark on success.
 * 7. Three-state CTA button (Default -> Verifying -> Verified & Secured).
 * 8. Resend countdown formatted as MM:SS (e.g. 00:38).
 */
export default function GlassyOtpCard({
  otp = [],
  setOtp,
  length = 8,
  email = '',
  countdown = 0,
  isLoading = false,
  isSuccess = false,
  error = '',
  onVerify,
  onResend,
  onChangeEmail,
  onChange,
  onKeyDown,
  onPaste,
  changeEmailLabel = '← Use a different email',
  title = 'Verify OTP',
  subtitle,
  submitLabel = 'Verify & Proceed →',
  verifyingLabel = 'Verifying Code...',
  successLabel = 'Verified & Secured',
  otpInputsRef: externalInputsRef,
  className = '',
  compact = false,
}) {
  const localInputsRef = useRef([]);
  const inputsRef = externalInputsRef || localInputsRef;
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Trigger celebration confetti on success
  useEffect(() => {
    if (isSuccess) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#10B981', '#34D399', '#F59E0B', '#FCD34D', '#FFFFFF'],
        });
      } catch (e) {
        // Safe fallback if canvas is unavailable
      }
    }
  }, [isSuccess]);

  // Format countdown into 00:SS like the reference video
  const formatTimer = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  // Handle single digit input
  const handleChange = (index, value) => {
    if (isLoading || isSuccess) return;
    if (onChange) {
      onChange(index, value);
      const cleanDigit = value.replace(/\D/g, '');
      if (cleanDigit && index < length - 1) {
        setFocusedIndex(index + 1);
      }
      return;
    }
    const cleanDigit = value.replace(/\D/g, '');
    if (!cleanDigit && value !== '') return;

    const newOtp = [...otp];
    newOtp[index] = cleanDigit.slice(-1);
    if (setOtp) setOtp(newOtp);

    // Auto-advance focus
    if (cleanDigit && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }

    // Auto-verify when all boxes are populated
    const filled = newOtp.filter(Boolean).join('');
    if (filled.length === length && cleanDigit && onVerify) {
      onVerify(filled);
    }
  };

  // Handle keyboard navigation & backspace
  const handleKeyDown = (index, e) => {
    if (isLoading || isSuccess) return;
    if (onKeyDown) {
      onKeyDown(index, e);
      if (e.key === 'Backspace' && !otp[index] && index > 0) {
        setFocusedIndex(index - 1);
      } else if (e.key === 'ArrowLeft' && index > 0) {
        setFocusedIndex(index - 1);
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        setFocusedIndex(index + 1);
      }
      return;
    }

    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        if (setOtp) setOtp(newOtp);
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        if (setOtp) setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  // Handle paste event across all boxes
  const handlePaste = (e) => {
    if (isLoading || isSuccess) return;
    if (onPaste) {
      onPaste(e);
      return;
    }
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    const numericChars = pasted.replace(/\D/g, '').slice(0, length);
    if (!numericChars) return;

    const newOtp = Array(length).fill('');
    for (let i = 0; i < numericChars.length; i++) {
      newOtp[i] = numericChars[i];
    }
    if (setOtp) setOtp(newOtp);

    if (numericChars.length === length && onVerify) {
      onVerify(numericChars);
    } else {
      const nextIndex = Math.min(numericChars.length, length - 1);
      inputsRef.current[nextIndex]?.focus();
    }
  };

  const effectiveLength = length || 8;
  const displayOtp = Array.from({ length: effectiveLength }, (_, i) => (otp && otp[i] !== undefined ? otp[i] : ''));
  const isComplete = displayOtp.filter(Boolean).join('').length === effectiveLength;

  return (
    <div className={`glassy-otp-card px-3 sm:px-6 py-6 sm:py-8 ${className}`}>
      {/* ─── 4 Corner Accent Brackets (From Reference Video 00:00 - 00:04) ─── */}
      <div className="glassy-corner glassy-corner-tl" />
      <div className="glassy-corner glassy-corner-tr" />
      <div className="glassy-corner glassy-corner-bl" />
      <div className="glassy-corner glassy-corner-br" />

      {/* ─── Glowing Golden Key Badge Icon ─── */}
      {!isSuccess ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="glassy-key-badge"
        >
          <svg
            className="w-5 h-5 text-amber-400 rotate-45 transform drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
          </svg>
        </motion.div>
      ) : null}

      {/* ─── Header: Verify OTP -> Verified Successfully ─── */}
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white transition-colors duration-300">
          {isSuccess ? (
            <span>
              Verified <span className="text-emerald-400 font-extrabold">Successfully</span>
            </span>
          ) : (
            <span>
              Verify <span className="text-amber-400 font-extrabold">OTP</span>
            </span>
          )}
        </h2>

        <p className="mt-2 text-xs sm:text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
          {isSuccess
            ? 'Your security verification code has been confirmed.'
            : (subtitle || (
                <span>
                  Enter the {effectiveLength}-digit security code sent to{' '}
                  {email ? <strong className="text-amber-300 font-semibold">{email}</strong> : 'your device'}
                </span>
              ))}
        </p>
      </div>

      {/* ─── OTP Body: 3 States (Input Row -> Orbital Swirl -> Emerald Badge) ─── */}
      <div className="relative min-h-[90px] flex items-center justify-center my-4">
        {/* State 1: Verification Success Emerald Badge */}
        {isSuccess ? (
          <motion.div
            key="success-state"
            initial={{ scale: 0, rotate: -45, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1], rotate: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex flex-col items-center justify-center my-3"
          >
            <div className="glassy-success-badge">
              <div className="glassy-success-ripple" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
              >
                <HiCheck className="w-10 h-10 text-white stroke-[2.5]" />
              </motion.div>
            </div>
          </motion.div>
        ) : isLoading ? (
          /* State 2: Verifying Orbital Swirl Carousel (Matches Video 00:01 & 00:02) */
          <motion.div
            key="verifying-orbit"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.3 }}
            className="glassy-orbit-wrapper"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 4.5, ease: 'linear' }}
              className="relative w-40 h-40 flex items-center justify-center"
            >
              {displayOtp.map((digit, idx) => {
                const radius = 62;
                const angle = (idx / effectiveLength) * (2 * Math.PI) - Math.PI / 2;
                const x = radius * Math.cos(angle);
                const y = radius * Math.sin(angle);
                const tilt = ((idx / effectiveLength) * 40) - 20;

                return (
                  <motion.div
                    key={`orbit-${idx}`}
                    style={{
                      transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)`,
                      width: '32px',
                      height: '38px',
                    }}
                    className="glassy-orbit-box"
                  >
                    <motion.span
                      animate={{ rotate: -360 }}
                      transition={{ repeat: Infinity, duration: 4.5, ease: 'linear' }}
                      className="text-sm sm:text-base font-bold font-mono text-amber-300"
                    >
                      {digit || '•'}
                    </motion.span>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        ) : (
          /* State 3: Interactive 8 Digit Boxes Row with Entrance Micro-Animations */
          <div
            className="flex justify-center items-center gap-1 sm:gap-1.5 md:gap-2 w-full max-w-full py-2 flex-nowrap"
            onPaste={handlePaste}
          >
            {displayOtp.map((digit, index) => {
              const isBoxFocused = focusedIndex === index;
              const isFilled = Boolean(digit);

              // Exactly calibrated dimensions so 8 boxes fit effortlessly on all screens
              const boxWidth = 'w-[32px] min-w-[30px] sm:w-10 md:w-11';
              const boxHeight = 'h-11 sm:h-12 md:h-14';

              return (
                <div
                  key={index}
                  className={`glassy-digit-box ${boxWidth} ${boxHeight} ${
                    isBoxFocused ? 'is-focused' : ''
                  } ${isFilled ? 'is-filled' : ''} shrink-0 cursor-text`}
                  onClick={() => inputsRef.current[index]?.focus()}
                >
                  {/* Native input overlay for complete accessibility & keyboard support */}
                  <input
                    ref={(el) => (inputsRef.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    aria-label={`Digit ${index + 1}`}
                    onFocus={() => setFocusedIndex(index)}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    className="absolute inset-0 w-full h-full opacity-0 text-center cursor-pointer z-10"
                  />

                  {/* Digit entrance animation with spring pop and glow */}
                  <AnimatePresence mode="popLayout">
                    {digit ? (
                      <motion.span
                        key={`val-${index}-${digit}`}
                        initial={{ scale: 0.2, y: 10, opacity: 0 }}
                        animate={{ scale: [0.2, 1.25, 1], y: 0, opacity: 1 }}
                        exit={{ scale: 0.3, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
                        className="text-lg sm:text-2xl font-bold font-mono text-white select-none pointer-events-none drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                      >
                        {digit}
                      </motion.span>
                    ) : (
                      // Subtle empty indicator
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20 select-none pointer-events-none" />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Error Notification ─── */}
      <AnimatePresence>
        {error && !isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center justify-center gap-1.5 mt-2 mb-3 text-xs sm:text-sm text-red-400 font-medium text-center bg-red-500/10 border border-red-500/25 rounded-xl py-2 px-3"
          >
            <HiExclamationCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Resend Code / Countdown Section ─── */}
      <div className="text-center text-xs text-gray-400 my-4 select-none">
        {countdown > 0 ? (
          <span>
            Didn't receive the code?{' '}
            <span className="text-amber-400 font-mono font-semibold">
              Resend in {formatTimer(countdown)}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={isLoading || isSuccess}
            className="text-amber-400 hover:text-amber-300 font-semibold hover:underline cursor-pointer transition-colors"
          >
            Didn't receive the code? Resend OTP
          </button>
        )}
      </div>

      {/* ─── Primary CTA Button (3 Morphing States) ─── */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => onVerify && onVerify(otp.join(''))}
          disabled={isLoading || isSuccess || !isComplete}
          className={`w-full py-3.5 px-6 rounded-2xl text-sm sm:text-base font-bold flex items-center justify-center gap-2.5 transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isSuccess
              ? 'glassy-btn-success'
              : isLoading
              ? 'glassy-btn-verifying'
              : 'glassy-btn-default'
          }`}
        >
          {isSuccess ? (
            <>
              <HiCheck className="w-5 h-5 text-emerald-300 stroke-[2.5]" />
              <span>{successLabel}</span>
            </>
          ) : isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
              <span>{verifyingLabel}</span>
            </>
          ) : (
            <span>{submitLabel}</span>
          )}
        </button>
      </div>

      {/* ─── Optional Switch Email / Edit Action ─── */}
      {onChangeEmail && !isSuccess && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={onChangeEmail}
            disabled={isLoading}
            className="text-xs text-gray-400 hover:text-gray-200 hover:underline cursor-pointer transition-colors"
          >
            {changeEmailLabel}
          </button>
        </div>
      )}
    </div>
  );
}
