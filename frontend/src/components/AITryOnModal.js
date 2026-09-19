import React, { useState, useRef } from 'react';
import { HiX, HiCamera, HiUpload, HiDownload, HiShare, HiRefresh, HiEye } from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';

export default function AITryOnModal({ product, isOpen, onClose }) {
  const [mode, setMode] = useState('mirror'); // mirror, runway, casual
  const [userImage, setUserImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setUserImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facing: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access denied:', err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      setUserImage(canvas.toDataURL());
      // Stop camera
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const processAITryOn = async () => {
    if (!userImage) return;
    
    setIsProcessing(true);
    
    // Simulate realistic AI processing steps
    setTimeout(() => {
      // Step 1: Body detection
    }, 500);
    
    setTimeout(() => {
      // Step 2: Clothing mapping
    }, 1500);
    
    setTimeout(() => {
      // Step 3: Generate realistic result with actual clothing overlay
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const userImg = new Image();
      const productImg = new Image();
      
      userImg.onload = () => {
        // Set canvas to reasonable size for display
        const maxWidth = 800;
        const maxHeight = 600;
        
        let width = userImg.width;
        let height = userImg.height;
        
        // Scale down if image is too large
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw original user image to fit canvas
        ctx.drawImage(userImg, 0, 0, width, height);
        
        // Load and overlay the product image
        productImg.onload = () => {
          // AI Body Detection Simulation - calculate body position and proportions
          const category = product.category?.toLowerCase();
          let itemWidth, itemHeight, itemX, itemY;
          
          // Adjust positioning based on clothing category
          if (category === 'shirts') {
            // Shirts go on upper body
            itemWidth = width * 0.65; // 65% of canvas width
            itemHeight = height * 0.35; // 35% of canvas height
            itemX = (width - itemWidth) / 2; // Center horizontally
            itemY = height * 0.12; // Upper chest position
            
          } else if (category === 'trousers') {
            // Trousers go on lower body
            itemWidth = width * 0.45; // 45% of canvas width
            itemHeight = height * 0.4; // 40% of canvas height
            itemX = (width - itemWidth) / 2; // Center horizontally
            itemY = height * 0.45; // Waist to knees position
            
          } else if (category === 'accessories') {
            // Accessories (watches, ties, etc.) go on specific positions
            itemWidth = width * 0.15; // 15% of canvas width
            itemHeight = height * 0.08; // 8% of canvas height
            itemX = width * 0.35; // Left wrist area
            itemY = height * 0.25; // Arm position
            
          } else {
            // Default positioning for other items
            itemWidth = width * 0.5;
            itemHeight = height * 0.3;
            itemX = (width - itemWidth) / 2;
            itemY = height * 0.2;
          }
          
          // Adjust for different view modes
          if (mode === 'runway') {
            // Runway mode - slightly larger, more prominent
            itemWidth *= 1.1;
            itemHeight *= 1.1;
            itemY *= 0.9; // Move up slightly
          } else if (mode === 'casual') {
            // Casual mode - more relaxed fit
            itemWidth *= 1.05;
            itemHeight *= 1.05;
          }
          
          // Set transparency and blend mode for realistic overlay
          ctx.globalAlpha = 0.85;
          ctx.globalCompositeOperation = 'multiply';
          
          // Draw the product image with proper positioning
          ctx.drawImage(productImg, itemX, itemY, itemWidth, itemHeight);
          
          // Add realistic shadows and highlights based on category
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.2;
          
          if (category === 'shirts') {
            // Add shirt-specific shading
            const gradient = ctx.createLinearGradient(itemX, itemY, itemX + itemWidth, itemY + itemHeight);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
            gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
            ctx.fillStyle = gradient;
            ctx.fillRect(itemX, itemY, itemWidth, itemHeight);
            
          } else if (category === 'trousers') {
            // Add trouser-specific shading
            const gradient = ctx.createLinearGradient(itemX, itemY, itemX + itemWidth, itemY + itemHeight);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
            gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
            ctx.fillStyle = gradient;
            ctx.fillRect(itemX, itemY, itemWidth, itemHeight);
            
          } else if (category === 'accessories') {
            // Add accessory-specific highlights
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(itemX, itemY, itemWidth, itemHeight);
          }
          
          // Add text overlay to show it's AI processed
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'white';
          ctx.font = 'bold 18px Arial';
          ctx.fillText(`AI ${category} Try-On Applied`, 20, 40);
          ctx.font = '14px Arial';
          ctx.fillText(`${product.name} - ${mode} view`, 20, 65);
          
          const resultDataUrl = canvas.toDataURL();
          setResultImage(resultDataUrl);
          setIsProcessing(false);
        };
        
        // Use the actual product image
        productImg.src = product.image_url || '';
      };
      
      userImg.src = userImage;
    }, 3000);
  };

  const downloadImage = () => {
    if (resultImage) {
      const link = document.createElement('a');
      link.download = `style-heaven-ai-${product.name}.png`;
      link.href = resultImage;
      link.click();
    }
  };

  const shareImage = async () => {
    if (navigator.share && resultImage) {
      try {
        await navigator.share({
          title: `KalaStyle AI - ${product.name}`,
          text: `Check out how I look in ${product.name}!`,
          url: window.location.href
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    }
  };

  const resetModal = () => {
    setUserImage(null);
    setResultImage(null);
    setShowComparison(false);
    setMode('mirror');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-gradient-to-br from-dark-800 via-dark-900 to-dark-800 rounded-2xl 
                     border border-gold-500/30 max-w-4xl w-full max-h-[90vh] overflow-hidden
                     shadow-2xl shadow-purple-500/20"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-dark-700">
              <div>
                <h2 className="text-2xl font-serif font-bold text-white mb-1">
                  AI Virtual Try-On
                </h2>
                <p className="text-gold-400 text-sm">
                  {product.name} - {product.category}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <HiX className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!userImage ? (
                /* Upload/Camera Section */
                <div className="p-6">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Choose Your Photo Method
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Upload a photo or use your camera for the best AI try-on experience
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Upload Option */}
                    <div className="border-2 border-dashed border-gold-500/50 rounded-xl p-6 
                                hover:border-gold-500 transition-colors cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}>
                      <div className="text-center">
                        <div className="bg-gold-500/10 w-16 h-16 rounded-full 
                                    flex items-center justify-center mx-auto mb-3">
                          <HiUpload className="w-8 h-8 text-gold-500" />
                        </div>
                        <h4 className="text-white font-semibold mb-1">Upload Photo</h4>
                        <p className="text-gray-400 text-sm">
                          Choose from your device
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Camera Option */}
                    <div className="border-2 border-dashed border-gold-500/50 rounded-xl p-6 
                                hover:border-gold-500 transition-colors cursor-pointer"
                          onClick={startCamera}>
                      <div className="text-center">
                        <div className="bg-gold-500/10 w-16 h-16 rounded-full 
                                    flex items-center justify-center mx-auto mb-3">
                          <HiCamera className="w-8 h-8 text-gold-500" />
                        </div>
                        <h4 className="text-white font-semibold mb-1">Use Camera</h4>
                        <p className="text-gray-400 text-sm">
                          Take a live photo
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Camera Preview */}
                  {videoRef.current && (
                    <div className="mb-4">
                      <video
                        ref={videoRef}
                        autoPlay
                        className="w-full rounded-lg"
                      />
                      <button
                        onClick={capturePhoto}
                        className="w-full btn-primary mt-2"
                      >
                        Capture Photo
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Processing & Results Section */
                <div className="p-6">
                  {/* Mode Selector */}
                  <div className="flex justify-center gap-2 mb-6">
                    {[
                      { value: 'mirror', label: 'Mirror', icon: '🪞' },
                      { value: 'runway', label: 'Runway', icon: '��' },
                      { value: 'casual', label: 'Casual', icon: '📸' },
                    ].map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setMode(m.value)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          mode === m.value
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                            : 'bg-dark-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        <span className="mr-2">{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* AI Processing */}
                  {isProcessing && (
                    <div className="text-center py-8">
                      <div className="bg-dark-800 rounded-lg p-6 max-w-sm mx-auto">
                        <div className="w-16 h-16 border-4 border-gold-500 border-t-transparent 
                                    rounded-full animate-spin mx-auto mb-4" />
                        
                        <div className="space-y-2">
                          <h4 className="text-gold-400 font-semibold text-lg">
                            AI Virtual Try-On Processing
                          </h4>
                          <div className="text-left space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <span className="text-gray-300 text-sm">Detecting body shape...</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                              <span className="text-gray-300 text-sm">Mapping clothing fit...</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                              <span className="text-gray-300 text-sm">Applying shadows & lighting...</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-gold-500 rounded-full animate-pulse" />
                              <span className="text-gray-300 text-sm">Generating final result...</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4 text-xs text-gray-500">
                          Processing {product.name} in {mode} view
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  {resultImage && !isProcessing && (
                    <div className="space-y-4">
                      {/* Comparison Toggle */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => setShowComparison(!showComparison)}
                          className="flex items-center gap-2 px-4 py-2 bg-gold-500/10 
                                       rounded-lg text-gold-400 hover:bg-gold-500/20"
                        >
                          <HiEye className="w-4 h-4" />
                          {showComparison ? 'Hide' : 'Show'} Comparison
                        </button>
                      </div>

                      {/* Image Display */}
                      <div className="relative">
                        {showComparison ? (
                          /* Before/After Slider */
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <h4 className="text-white font-medium mb-2 text-center">Original</h4>
                              <img
                                src={userImage}
                                alt="Original"
                                className="w-full rounded-lg"
                              />
                            </div>
                            <div>
                              <h4 className="text-gold-400 font-medium mb-2 text-center">AI Result</h4>
                              <img
                                src={resultImage}
                                alt="AI Try-On Result"
                                className="w-full rounded-lg"
                              />
                            </div>
                          </div>
                        ) : (
                          /* Single Result */
                          <img
                            src={resultImage}
                            alt="AI Try-On Result"
                            className="w-full rounded-lg"
                          />
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-center gap-3 flex-wrap">
                        <button
                          onClick={downloadImage}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r 
                                       from-green-600 to-emerald-600 text-white rounded-lg
                                       hover:from-green-700 hover:to-emerald-700"
                        >
                          <HiDownload className="w-4 h-4" />
                          Download
                        </button>
                        <button
                          onClick={shareImage}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r 
                                       from-blue-600 to-cyan-600 text-white rounded-lg
                                       hover:from-blue-700 hover:to-cyan-700"
                        >
                          <HiShare className="w-4 h-4" />
                          Share
                        </button>
                        <button
                          onClick={resetModal}
                          className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-white 
                                       rounded-lg hover:bg-dark-600"
                        >
                          <HiRefresh className="w-4 h-4" />
                          Try Again
                        </button>
                      </div>

                      {/* AI Recommendations */}
                      <div className="bg-gold-500/5 rounded-lg p-4">
                        <h4 className="text-gold-400 font-semibold mb-3">
                          🤖 AI Style Analysis
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <h5 className="text-white font-medium mb-1">Fit Rating</h5>
                            <div className="flex items-center gap-2">
                              <div className="flex">
                                {[1,2,3,4,5].map(i => (
                                  <span key={i} className={`text-lg ${i <= 4 ? 'text-gold-400' : 'text-gray-600'}`}>⭐</span>
                                ))}
                              </div>
                              <span className="text-gray-400 text-sm">(4/5)</span>
                            </div>
                          </div>
                          
                          <div>
                            <h5 className="text-white font-medium mb-1">Style Recommendations</h5>
                            <ul className="text-gray-300 text-sm space-y-1">
                              <li>• Perfect fit for your body type</li>
                              <li>• Gold watch would complement this outfit</li>
                              <li>• Brown leather shoes recommended</li>
                              <li>• Works for business meetings & dinner dates</li>
                            </ul>
                          </div>
                          
                          <div>
                            <h5 className="text-white font-medium mb-1">Color Coordination</h5>
                            <div className="flex gap-2 mt-2">
                              <div className="w-8 h-8 bg-gold-500 rounded-full border-2 border-white" title="Gold accents" />
                              <div className="w-8 h-8 bg-blue-900 rounded-full border-2 border-white" title="Navy blue" />
                              <div className="w-8 h-8 bg-gray-800 rounded-full border-2 border-white" title="Charcoal gray" />
                              <div className="w-8 h-8 bg-white rounded-full border-2 border-gray-300" title="White" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Process Button */}
                  {userImage && !resultImage && !isProcessing && (
                    <div className="text-center">
                      <button
                        onClick={processAITryOn}
                        className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-lg"
                      >
                        <span className="animate-pulse">✨</span>
                        Generate AI Try-On
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
