import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  HiX,
  HiCamera,
  HiRefresh,
  HiCheck,
  HiSwitchHorizontal,
  HiExclamationCircle,
  HiUpload,
} from "react-icons/hi";
import toast from "react-hot-toast";

/**
 * LiveCameraModal
 * ─────────────────────────────────────────────────────────────────
 * Allows artisans to capture craft and product photos directly
 * using their device's live camera (webcam, phone back/front camera).
 *
 * Robust WebRTC handling:
 * - Persistent video DOM element ensures stream attachment is never dropped.
 * - Automatic constraint fallback from environment to basic video.
 * - Multi-camera enumeration and switching.
 * - Hardware stream cleanup on unmount or close.
 * - Fallback file upload if camera hardware is unavailable or blocked.
 */
export default function LiveCameraModal({ isOpen, onClose, onCapturePhoto }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileFallbackRef = useRef(null);

  const [facingMode, setFacingMode] = useState("environment");
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [currentStream, setCurrentStream] = useState(null);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCurrentStream(null);
  }, []);

  // Start camera stream
  const startCamera = useCallback(
    async (mode) => {
      stopCamera();
      setCameraError("");
      setIsStarting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          "Camera access is not supported on this browser. Please use a modern browser like Chrome, Edge, or Safari."
        );
        setIsStarting(false);
        return;
      }

      let stream = null;

      // 1. First attempt: with preferred facingMode
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode ? { ideal: mode } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err1) {
        console.warn("Camera attempt with facingMode failed, trying generic constraints...", err1);
        // 2. Second attempt: generic video without specific facingMode (for PC webcams)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (err2) {
          console.error("All getUserMedia attempts failed:", err2);
          if (
            err2.name === "NotAllowedError" ||
            err2.name === "PermissionDeniedError"
          ) {
            setCameraError(
              "Camera permission was blocked. Please click the camera icon in your browser's address bar to allow camera access, then click 'Retry Camera'."
            );
          } else if (
            err2.name === "NotFoundError" ||
            err2.name === "DevicesNotFoundError"
          ) {
            setCameraError(
              "No camera device was detected on your device. You can choose a photo from your files instead."
            );
          } else {
            setCameraError(
              `Camera error: ${err2.message || "Unable to access camera feed"}`
            );
          }
          setIsStarting(false);
          return;
        }
      }

      streamRef.current = stream;
      setCurrentStream(stream);

      // Attach immediately to video element if ready
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Video play error:", playErr);
        }
      }

      setIsStarting(false);
    },
    [stopCamera]
  );

  // Callback ref: ensures stream is connected the instant <video> mounts into DOM
  const setVideoRef = useCallback((element) => {
    videoRef.current = element;
    if (element && streamRef.current) {
      element.srcObject = streamRef.current;
      element.play().catch(() => {});
    }
  }, []);

  // Keep video synced with stream state
  useEffect(() => {
    if (videoRef.current && currentStream) {
      videoRef.current.srcObject = currentStream;
      videoRef.current.play().catch(() => {});
    }
  }, [currentStream]);

  // Open / Close lifecycle
  useEffect(() => {
    if (isOpen) {
      setCapturedBlob(null);
      setCapturedPreview("");
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, startCamera, stopCamera]);

  // Capture snapshot from live stream
  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      // If video dimensions not yet propagated, try fallback dimensions
      if (video && video.readyState >= 2) {
        // stream is playable
      } else {
        toast.error("Waiting for camera feed to stabilize. Please try in a second.");
        return;
      }
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Mirror image if using front camera
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not capture photo. Please try again.");
          return;
        }
        setCapturedBlob(blob);
        const previewUrl = URL.createObjectURL(blob);
        setCapturedPreview(previewUrl);
      },
      "image/jpeg",
      0.92
    );
  };

  const handleRetake = () => {
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedBlob(null);
    setCapturedPreview("");
    if (videoRef.current && streamRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleConfirm = () => {
    if (!capturedBlob) return;
    const file = new File(
      [capturedBlob],
      `artisan_craft_photo_${Date.now()}.jpg`,
      { type: "image/jpeg" }
    );
    stopCamera();
    onCapturePhoto(file);
    onClose();
  };

  const handleSwitchCamera = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
  };

  // Fallback: file upload if camera fails
  const handleFallbackFile = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
      onCapturePhoto(file);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5"
      style={{
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="relative w-full max-w-xl bg-dark-900 border border-dark-600 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{
          boxShadow:
            "0 25px 60px -15px rgba(0,0,0,0.9), 0 0 35px rgba(212,175,55,0.18)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-700/80 bg-dark-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400">
              <HiCamera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                Live Craft Camera
              </h3>
              <p className="text-[11px] text-gray-400">
                Snap product photos directly from your camera
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dark-750 hover:bg-dark-700 text-gray-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <HiX className="w-4 h-4" />
          </button>
        </div>

        {/* Viewfinder Area (Strict explicit height so it NEVER collapses) */}
        <div className="relative w-full h-[360px] sm:h-[420px] bg-black flex items-center justify-center overflow-hidden">
          {/* Permanent video element */}
          <video
            ref={setVideoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${
              capturedPreview || cameraError ? "invisible absolute" : "block"
            } ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />

          {/* Loading Overlay */}
          {isStarting && !cameraError && (
            <div className="absolute inset-0 bg-dark-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
              <div className="w-10 h-10 border-3 border-dark-700 border-t-gold-400 rounded-full animate-spin" />
              <p className="text-xs font-semibold text-gold-400 tracking-wide">
                Connecting live camera feed&hellip;
              </p>
            </div>
          )}

          {/* Error Overlay */}
          {cameraError && (
            <div className="absolute inset-0 bg-dark-950/95 p-6 flex flex-col items-center justify-center text-center space-y-3 z-30">
              <HiExclamationCircle className="w-12 h-12 text-red-400 mx-auto" />
              <h4 className="text-sm font-bold text-red-300">
                Camera Notice
              </h4>
              <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
                {cameraError}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-4 py-2 bg-dark-750 hover:bg-dark-700 border border-dark-600 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <HiRefresh className="w-3.5 h-3.5" /> Retry Camera
                </button>
                <button
                  type="button"
                  onClick={() => fileFallbackRef.current?.click()}
                  className="px-4 py-2 bg-gradient-luxury text-dark-950 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-gold hover:scale-105 transition-transform"
                >
                  <HiUpload className="w-3.5 h-3.5" /> Pick Photo From Device
                </button>
                <input
                  ref={fileFallbackRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFallbackFile}
                />
              </div>
            </div>
          )}

          {/* Captured Snapshot Preview */}
          {capturedPreview && (
            <div className="absolute inset-0 bg-black flex items-center justify-center z-20">
              <img
                src={capturedPreview}
                alt="Captured Snapshot"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-dark-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-gold-500/30 text-[11px] font-semibold text-gold-400 flex items-center gap-1.5 shadow-lg">
                <span>✨</span> Photo Captured &amp; Ready
              </div>
            </div>
          )}

          {/* Viewfinder Framing Guidelines (Shown when live camera feed is running) */}
          {!capturedPreview && !cameraError && !isStarting && (
            <>
              {/* Center Framing Reticle */}
              <div className="absolute inset-7 sm:inset-10 border border-white/20 rounded-2xl pointer-events-none z-10 shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-3 border-l-3 border-gold-400 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-3 border-r-3 border-gold-400 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-3 border-l-3 border-gold-400 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-3 border-r-3 border-gold-400 rounded-br-xl" />
              </div>

              {/* Camera Switch / Flip Button in corner */}
              <button
                type="button"
                onClick={handleSwitchCamera}
                title="Switch Camera (Front / Rear)"
                className="absolute top-4 right-4 z-20 bg-dark-900/80 hover:bg-dark-900 text-white p-2.5 rounded-full border border-white/20 backdrop-blur-md transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95"
              >
                <HiSwitchHorizontal className="w-4 h-4 text-gold-400" />
              </button>
            </>
          )}
        </div>

        {/* Action Controls Footer */}
        <div className="p-4 sm:p-5 bg-dark-850 border-t border-dark-700/80 flex items-center justify-between gap-3">
          {capturedPreview ? (
            // After Snapshot Captured: Retake or Confirm
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 bg-dark-750 hover:bg-dark-700 text-gray-200 hover:text-white font-semibold text-xs sm:text-sm rounded-xl border border-dark-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <HiRefresh className="w-4 h-4" /> Retake Photo
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 btn-primary py-3 px-4 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-gold"
              >
                <HiCheck className="w-4 h-4" /> Use This Photo
              </button>
            </>
          ) : (
            // Live Feed Controls: Shutter Button
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer px-3 py-1.5"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSnap}
                disabled={isStarting || Boolean(cameraError)}
                title="Take Photo"
                className="relative group p-1.5 rounded-full bg-gold-500/20 border-2 border-gold-400 cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(212,175,55,0.35)]"
              >
                <div className="w-14 h-14 rounded-full bg-gradient-luxury flex items-center justify-center shadow-lg">
                  <HiCamera className="w-7 h-7 text-dark-950" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleSwitchCamera}
                disabled={isStarting || Boolean(cameraError)}
                className="text-xs text-gold-400 hover:text-gold-300 transition-colors cursor-pointer flex items-center gap-1 px-3 py-1.5 disabled:opacity-30"
              >
                <HiSwitchHorizontal className="w-3.5 h-3.5" /> Flip
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
