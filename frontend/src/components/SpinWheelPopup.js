import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { couponAPI } from '../services/api';

const SpinWheelPopup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reward, setReward] = useState(null);
  const [coupon, setCoupon] = useState(null);
  const canvasRef = useRef(null);

  const rewards = [
    { label: '5% OFF', color: '#1a1a1a', textColor: '#D4AF37' },
    { label: '10% OFF', color: '#D4AF37', textColor: '#1a1a1a' },
    { label: '₹100 OFF', color: '#1a1a1a', textColor: '#D4AF37' },
    { label: 'Free Delivery', color: '#D4AF37', textColor: '#1a1a1a' },
    { label: '20% OFF', color: '#1a1a1a', textColor: '#D4AF37' },
    { label: 'Better Luck Next Time', color: '#D4AF37', textColor: '#1a1a1a' },
  ];

  useEffect(() => {
    // Show popup after 7 seconds if on Home page
    if (location.pathname !== '/') return;

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 7000);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (isVisible && canvasRef.current) {
      drawWheel(0);
    }
  }, [isVisible]);

  const drawWheel = (angle) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sliceAngle = (2 * Math.PI) / rewards.length;

    rewards.forEach((reward, i) => {
      const startAngle = i * sliceAngle + angle;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.fillStyle = reward.color;
      ctx.fill();
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = reward.textColor;
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillText(reward.label, radius - 20, 5);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI);
    ctx.fillStyle = '#D4AF37';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  const handleSpin = async () => {
    if (!user) {
      toast.error('Please login to spin the wheel!');
      navigate('/login');
      setIsVisible(false);
      return;
    }

    if (isSpinning) return;

    try {
      const response = await couponAPI.spin();

      const { reward: wonReward, coupon: wonCoupon } = response.data;
      
      setIsSpinning(true);
      
      // Animation logic
      const spinDuration = 3000;
      const startTime = Date.now();
      const winningIndex = rewards.findIndex(r => r.label === wonReward);
      const safeIndex = winningIndex >= 0 ? winningIndex : 0;
      const sliceAngle = (2 * Math.PI) / rewards.length;
      // Target rotation angle so winning segment safeIndex stops exactly under the top arrow pointer (270° / 1.5π rad)
      const totalRotation = 10 * Math.PI + (1.5 * Math.PI) - ((safeIndex + 0.5) * sliceAngle);

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinDuration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const angle = easeOut * totalRotation;

        drawWheel(angle);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsSpinning(false);
          setReward(wonReward);
          setCoupon(wonCoupon);
          if (wonCoupon) {
            toast.success(`Congratulations! You won ${wonReward}`);
          } else {
            toast('Better luck next time! \ud83c\udfa9');
          }
        }
      };

      animate();

    } catch (error) {
      const message = error.response?.data?.error || 'Failed to spin wheel';
      toast.error(message);
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-2xl p-8 max-w-md w-full text-center overflow-hidden shadow-2xl">
        {/* Decorative elements */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#D4AF37]/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#D4AF37]/10 rounded-full blur-3xl"></div>

        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!reward ? (
          <>
            <h2 className="text-3xl font-bold text-white mb-2 font-serif">Spin & Win!</h2>
            <p className="text-gray-400 mb-8">Try your luck and win exclusive discount coupons for KalaStyle AI.</p>
            
            <div className="relative inline-block mb-8">
              {/* Arrow Indicator */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-[#D4AF37]"></div>
              
              <canvas 
                ref={canvasRef} 
                width={300} 
                height={300} 
                className="rounded-full shadow-[0_0_50px_rgba(212,175,55,0.2)]"
              ></canvas>
            </div>

            <button
              onClick={handleSpin}
              disabled={isSpinning}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
                isSpinning 
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-black hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]'
              }`}
            >
              {isSpinning ? 'Spinning...' : 'Spin Now'}
            </button>
            
            {!user && <p className="mt-4 text-xs text-[#D4AF37]/60">Login required to claim rewards</p>}
          </>
        ) : (
          <div className="py-8 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(212,175,55,0.5)]">
              <svg className="w-10 h-10 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-2 font-serif">
              {coupon ? 'Congratulations!' : 'Maybe Next Time!'}
            </h2>
            
            {coupon ? (
              <>
                <p className="text-gray-400 mb-6">You won <span className="text-[#D4AF37] font-bold">{reward}</span></p>
                <div className="bg-black/40 border border-dashed border-[#D4AF37] rounded-lg p-4 mb-8">
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Your Coupon Code</p>
                  <p className="text-2xl font-mono font-bold text-[#D4AF37]">{coupon.code}</p>
                </div>
                <button
                  onClick={() => setIsVisible(false)}
                  className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  Start Shopping
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400 mb-8">Don't worry, you can try again tomorrow!</p>
                <button
                  onClick={() => setIsVisible(false)}
                  className="w-full py-4 bg-[#D4AF37] text-black rounded-xl font-bold hover:bg-[#B8860B] transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SpinWheelPopup;
