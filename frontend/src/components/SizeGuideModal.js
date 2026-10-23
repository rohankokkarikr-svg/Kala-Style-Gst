import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiCalculator, HiQuestionMarkCircle, HiBadgeCheck, HiChevronRight } from 'react-icons/hi';

const SIZING_DATA = {
  'T-Shirts': {
    headers: ['Size', 'Chest', 'Length', 'Shoulder'],
    rows: {
      in: [
        { size: 'S', chest: '36 - 38', length: '27', shoulder: '17' },
        { size: 'M', chest: '38 - 40', length: '28', shoulder: '18' },
        { size: 'L', chest: '40 - 42', length: '29', shoulder: '19' },
        { size: 'XL', chest: '42 - 44', length: '30', shoulder: '20' },
        { size: 'XXL', chest: '44 - 46', length: '31', shoulder: '21' },
      ],
      cm: [
        { size: 'S', chest: '91 - 97', length: '69', shoulder: '43' },
        { size: 'M', chest: '97 - 102', length: '71', shoulder: '46' },
        { size: 'L', chest: '102 - 107', length: '74', shoulder: '48' },
        { size: 'XL', chest: '107 - 112', length: '76', shoulder: '51' },
        { size: 'XXL', chest: '112 - 117', length: '79', shoulder: '53' },
      ]
    },
    calculatorType: 'chest',
    calculateSize: (val, unit) => {
      const chest = parseFloat(val);
      if (isNaN(chest)) return null;
      // Convert to inches for calculation
      const chestIn = unit === 'cm' ? chest / 2.54 : chest;
      if (chestIn < 35) return 'XS (Extra Small - Custom Order)';
      if (chestIn >= 35 && chestIn < 38) return 'S';
      if (chestIn >= 38 && chestIn < 40) return 'M';
      if (chestIn >= 40 && chestIn < 42) return 'L';
      if (chestIn >= 42 && chestIn < 44) return 'XL';
      if (chestIn >= 44 && chestIn <= 47) return 'XXL';
      return 'XXXL (Custom sizing may be required)';
    }
  },
  'Shirts': {
    headers: ['Size', 'Chest', 'Length', 'Sleeve', 'Collar'],
    rows: {
      in: [
        { size: 'S', chest: '38', length: '29', sleeve: '33', collar: '14.5' },
        { size: 'M', chest: '40', length: '30', sleeve: '34', collar: '15.5' },
        { size: 'L', chest: '43', length: '31', sleeve: '35', collar: '16.5' },
        { size: 'XL', chest: '46', length: '32', sleeve: '36', collar: '17.5' },
        { size: 'XXL', chest: '49', length: '33', sleeve: '37', collar: '18.5' },
      ],
      cm: [
        { size: 'S', chest: '96', length: '74', sleeve: '84', collar: '37' },
        { size: 'M', chest: '102', length: '76', sleeve: '86', collar: '39' },
        { size: 'L', chest: '109', length: '79', sleeve: '89', collar: '42' },
        { size: 'XL', chest: '117', length: '81', sleeve: '91', collar: '44' },
        { size: 'XXL', chest: '124', length: '84', sleeve: '94', collar: '47' },
      ]
    },
    calculatorType: 'chest',
    calculateSize: (val, unit) => {
      const chest = parseFloat(val);
      if (isNaN(chest)) return null;
      const chestIn = unit === 'cm' ? chest / 2.54 : chest;
      if (chestIn < 37) return 'S';
      if (chestIn >= 37 && chestIn < 39) return 'S';
      if (chestIn >= 39 && chestIn < 41) return 'M';
      if (chestIn >= 41 && chestIn < 44) return 'L';
      if (chestIn >= 44 && chestIn < 47) return 'XL';
      if (chestIn >= 47 && chestIn <= 50) return 'XXL';
      return 'XXXL (Custom sizing may be required)';
    }
  },
  'Pants & Jeans': {
    headers: ['Size', 'Waist', 'Hip', 'Inseam'],
    rows: {
      in: [
        { size: '30', waist: '30', hip: '36', inseam: '30' },
        { size: '32', waist: '32', hip: '38', inseam: '32' },
        { size: '34', waist: '34', hip: '40', inseam: '32' },
        { size: '36', waist: '36', hip: '42', inseam: '32' },
        { size: '38', waist: '38', hip: '44', inseam: '34' },
        { size: '40', waist: '40', hip: '46', inseam: '34' },
      ],
      cm: [
        { size: '30', waist: '76', hip: '91', inseam: '76' },
        { size: '32', waist: '81', hip: '97', inseam: '81' },
        { size: '34', waist: '86', hip: '102', inseam: '81' },
        { size: '36', waist: '91', hip: '107', inseam: '81' },
        { size: '38', waist: '97', hip: '112', inseam: '86' },
        { size: '40', waist: '102', hip: '117', inseam: '86' },
      ]
    },
    calculatorType: 'waist',
    calculateSize: (val, unit) => {
      const waist = parseFloat(val);
      if (isNaN(waist)) return null;
      const waistIn = unit === 'cm' ? waist / 2.54 : waist;
      if (waistIn < 29) return '28 (Custom Order)';
      if (waistIn >= 29 && waistIn < 31) return '30';
      if (waistIn >= 31 && waistIn < 33) return '32';
      if (waistIn >= 33 && waistIn < 35) return '34';
      if (waistIn >= 35 && waistIn < 37) return '36';
      if (waistIn >= 37 && waistIn < 39) return '38';
      if (waistIn >= 39 && waistIn <= 41) return '40';
      return '42+ (Custom sizing may be required)';
    }
  },
  'Suits & Jackets': {
    headers: ['Size', 'Chest', 'Waist', 'Shoulder', 'Sleeve'],
    rows: {
      in: [
        { size: '38 (S)', chest: '38', waist: '32', shoulder: '17.5', sleeve: '24.5' },
        { size: '40 (M)', chest: '40', waist: '34', shoulder: '18.2', sleeve: '25.0' },
        { size: '42 (L)', chest: '42', waist: '36', shoulder: '19.0', sleeve: '25.5' },
        { size: '44 (XL)', chest: '44', waist: '38', shoulder: '19.7', sleeve: '26.0' },
        { size: '46 (XXL)', chest: '46', waist: '40', shoulder: '20.5', sleeve: '26.5' },
      ],
      cm: [
        { size: '38 (S)', chest: '97', waist: '81', shoulder: '44', sleeve: '62' },
        { size: '40 (M)', chest: '102', waist: '86', shoulder: '46', sleeve: '64' },
        { size: '42 (L)', chest: '107', waist: '91', shoulder: '48', sleeve: '65' },
        { size: '44 (XL)', chest: '112', waist: '97', shoulder: '50', sleeve: '66' },
        { size: '46 (XXL)', chest: '117', waist: '102', shoulder: '52', sleeve: '67' },
      ]
    },
    calculatorType: 'chest',
    calculateSize: (val, unit) => {
      const chest = parseFloat(val);
      if (isNaN(chest)) return null;
      const chestIn = unit === 'cm' ? chest / 2.54 : chest;
      if (chestIn < 37) return '36 (Custom Order)';
      if (chestIn >= 37 && chestIn < 39) return '38 (S)';
      if (chestIn >= 39 && chestIn < 41) return '40 (M)';
      if (chestIn >= 41 && chestIn < 43) return '42 (L)';
      if (chestIn >= 43 && chestIn < 45) return '44 (XL)';
      if (chestIn >= 45 && chestIn <= 47) return '46 (XXL)';
      return '48+ (Custom sizing may be required)';
    }
  },
  'Kurtas': {
    headers: ['Size', 'Chest', 'Length', 'Sleeve'],
    rows: {
      in: [
        { size: 'S', chest: '38', length: '38', sleeve: '24' },
        { size: 'M', chest: '40', length: '40', sleeve: '24.5' },
        { size: 'L', chest: '42', length: '42', sleeve: '25' },
        { size: 'XL', chest: '44', length: '44', sleeve: '25.5' },
        { size: 'XXL', chest: '46', length: '44', sleeve: '26' },
      ],
      cm: [
        { size: 'S', chest: '97', length: '97', sleeve: '61' },
        { size: 'M', chest: '102', length: '102', sleeve: '62' },
        { size: 'L', chest: '107', length: '107', sleeve: '64' },
        { size: 'XL', chest: '112', length: '112', sleeve: '65' },
        { size: 'XXL', chest: '117', length: '117', sleeve: '66' },
      ]
    },
    calculatorType: 'chest',
    calculateSize: (val, unit) => {
      const chest = parseFloat(val);
      if (isNaN(chest)) return null;
      const chestIn = unit === 'cm' ? chest / 2.54 : chest;
      if (chestIn < 37) return 'S';
      if (chestIn >= 37 && chestIn < 39) return 'S';
      if (chestIn >= 39 && chestIn < 41) return 'M';
      if (chestIn >= 41 && chestIn < 43) return 'L';
      if (chestIn >= 43 && chestIn < 45) return 'XL';
      if (chestIn >= 45 && chestIn <= 47) return 'XXL';
      return 'XXXL (Custom sizing may be required)';
    }
  }
};

const MEASUREMENT_GUIDES = {
  chest: {
    title: 'Chest',
    desc: 'Measure around the fullest part of your chest, keeping the tape horizontal under your arms and flat across your back.',
  },
  waist: {
    title: 'Waist',
    desc: 'Measure around your natural waistline, where you usually wear your pants, keeping one finger between the tape and your body.',
  },
  sleeve: {
    title: 'Sleeve',
    desc: 'Measure from the center back of your neck, across the shoulder and down to your wrist bone.',
  },
  shoulder: {
    title: 'Shoulder',
    desc: 'Measure from the outer edge of one shoulder bone straight across your back to the outer edge of the other shoulder bone.',
  },
  inseam: {
    title: 'Inseam',
    desc: 'Measure from the top of your inner thigh (crotch) straight down to the bottom of your ankle.',
  }
};

export default function SizeGuideModal({ isOpen, onClose, productCategory }) {
  const [activeTab, setActiveTab] = useState('Shirts');
  const [unit, setUnit] = useState('in'); // 'in' or 'cm'
  const [calculatorInput, setCalculatorInput] = useState('');
  const [recommendedSize, setRecommendedSize] = useState(null);

  // Auto-detect and set default tab based on product category
  useEffect(() => {
    if (!productCategory) return;
    const cat = productCategory.toLowerCase();
    if (cat.includes('t-shirt') || cat.includes('tshirt')) {
      setActiveTab('T-Shirts');
    } else if (cat.includes('shirt')) {
      setActiveTab('Shirts');
    } else if (cat.includes('pant') || cat.includes('jeans') || cat.includes('trouser')) {
      setActiveTab('Pants & Jeans');
    } else if (cat.includes('jacket') || cat.includes('suit') || cat.includes('blazer') || cat.includes('coat')) {
      setActiveTab('Suits & Jackets');
    } else if (cat.includes('kurta')) {
      setActiveTab('Kurtas');
    } else {
      setActiveTab('Shirts'); // Default fallback
    }
  }, [productCategory, isOpen]);

  // Recalculate recommendation when tab, unit, or input changes
  useEffect(() => {
    if (!calculatorInput) {
      setRecommendedSize(null);
      return;
    }
    const categoryData = SIZING_DATA[activeTab];
    if (categoryData && categoryData.calculateSize) {
      const rec = categoryData.calculateSize(calculatorInput, unit);
      setRecommendedSize(rec);
    }
  }, [calculatorInput, activeTab, unit]);

  // Reset calculator input when switching tabs
  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setCalculatorInput('');
    setRecommendedSize(null);
  };

  if (!isOpen) return null;

  const activeData = SIZING_DATA[activeTab];
  const headers = activeData?.headers || [];
  const rows = activeData?.rows[unit] || [];
  const calculatorType = activeData?.calculatorType || 'chest';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-dark-800 border border-dark-600 rounded-2xl shadow-gold-lg w-full max-w-4xl overflow-hidden my-8"
        >
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-dark-600 bg-dark-900/50">
            <div>
              <h2 className="text-2xl font-serif font-bold text-white tracking-wide">
                Size Guide & <span className="text-gold-400">Fit Finder</span>
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Find your perfect fit with our interactive sizing chart
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2.5 rounded-lg hover:bg-dark-700 transition-colors"
              aria-label="Close modal"
            >
              <HiX className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="flex overflow-x-auto border-b border-dark-600 bg-dark-900/30 hide-scrollbar scroll-smooth">
            {Object.keys(SIZING_DATA).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`py-4 px-6 text-sm font-semibold tracking-wide whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab
                    ? 'border-gold-500 text-gold-400 bg-gold-500/5'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-dark-700/30'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 max-h-[70vh] overflow-y-auto">
            
            {/* Left Column: Sizing Table & Unit Selector */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-serif text-lg font-bold text-white flex items-center gap-2">
                  <span>Sizing Chart</span>
                  <span className="text-xs font-sans text-gray-400 font-normal">
                    (Measurements are in {unit === 'in' ? 'inches' : 'centimeters'})
                  </span>
                </h3>

                {/* Unit Switcher */}
                <div className="flex border border-dark-500 rounded-lg p-0.5 bg-dark-900">
                  <button
                    onClick={() => setUnit('in')}
                    className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                      unit === 'in'
                        ? 'bg-gold-500 text-dark-900 shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Inches (in)
                  </button>
                  <button
                    onClick={() => setUnit('cm')}
                    className={`px-3 py-1 text-xs font-bold rounded transition-all ${
                      unit === 'cm'
                        ? 'bg-gold-500 text-dark-900 shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    CM (cm)
                  </button>
                </div>
              </div>

              {/* Sizing Table */}
              <div className="border border-dark-600 rounded-xl overflow-hidden bg-dark-900/50 shadow-inner">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-dark-700/60 border-b border-dark-600 text-gray-300">
                      {headers.map((h) => (
                        <th key={h} className="py-3 px-4 font-semibold text-gold-400/90 tracking-wider capitalize">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-dark-600/50 text-gray-200 transition-colors hover:bg-dark-700/30 ${
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-dark-800/20'
                        }`}
                      >
                        {headers.map((h) => {
                          const key = h.toLowerCase();
                          const val = row[key];
                          return (
                            <td
                              key={h}
                              className={`py-3 px-4 ${
                                h === 'Size' ? 'font-bold text-white' : ''
                              }`}
                            >
                              {val} {h !== 'Size' && (unit === 'in' ? '"' : ' cm')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Fit Finder Calculator Widget */}
              <div className="bg-gradient-to-br from-dark-900 to-dark-700/80 p-5 rounded-2xl border border-gold-500/20 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <HiCalculator className="w-5 h-5 text-gold-400" />
                  <h4 className="font-serif text-base font-bold text-white">
                    Fit Finder Recommendation
                  </h4>
                </div>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  Enter your body measurements to instantly discover your recommended size in {activeTab}.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Your Body {calculatorType === 'chest' ? 'Chest' : 'Waist'} ({unit === 'in' ? 'inches' : 'cm'})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="20"
                        max="200"
                        step="0.5"
                        value={calculatorInput}
                        onChange={(e) => setCalculatorInput(e.target.value)}
                        placeholder={`e.g. ${calculatorType === 'chest' ? (unit === 'in' ? '40' : '102') : (unit === 'in' ? '34' : '86')}`}
                        className="input-field w-full pr-12 text-sm bg-dark-800/80 focus:bg-dark-800 border-dark-600 focus:border-gold-500"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-gray-500 font-bold pointer-events-none">
                        {unit}
                      </span>
                    </div>
                  </div>

                  <div className="min-h-[70px] flex items-center justify-center bg-dark-800/40 rounded-xl border border-dark-600 p-3 text-center">
                    {recommendedSize ? (
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest block">
                          Suggested Size
                        </span>
                        <div className="flex items-center justify-center gap-1.5 text-gold-400 font-bold text-lg">
                          <HiBadgeCheck className="w-5 h-5 text-green-400 shrink-0" />
                          <span>{recommendedSize}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">
                        Enter your {calculatorType} measurement to see recommendations.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: How to Measure */}
            <div className="lg:col-span-5 space-y-6 lg:border-l lg:border-dark-600 lg:pl-8">
              <h3 className="font-serif text-lg font-bold text-white flex items-center gap-2">
                <HiQuestionMarkCircle className="w-5 h-5 text-gold-400" />
                <span>How to Measure</span>
              </h3>

              <div className="space-y-5">
                {/* SVG mannequin/diagram to make it feel super premium */}
                <div className="flex justify-center py-4 bg-dark-900/40 rounded-2xl border border-dark-600/50">
                  <svg
                    width="120"
                    height="180"
                    viewBox="0 0 120 180"
                    fill="none"
                    className="text-gray-600"
                  >
                    {/* Outline of mannequin */}
                    <path
                      d="M60 15 C65 15, 68 20, 68 25 C68 30, 64 34, 60 34 C56 34, 52 30, 52 25 C52 20, 55 15, 60 15 Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      d="M52 32 L40 37 L30 45 L35 75 L38 100 L44 105 L44 170 L55 170 L58 120 L62 120 L65 170 L76 170 L76 105 L82 100 L85 75 L90 45 L80 37 L68 32"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    
                    {/* Measurement Lines */}
                    {/* Chest Line (red/gold dot indicator) */}
                    {calculatorType === 'chest' ? (
                      <>
                        <line x1="33" y1="65" x2="87" y2="65" stroke="#D4AF37" strokeWidth="2" strokeDasharray="3,3" />
                        <circle cx="33" cy="65" r="3.5" fill="#D4AF37" />
                        <circle cx="87" cy="65" r="3.5" fill="#D4AF37" />
                        <text x="60" y="60" fill="#D4AF37" fontSize="8" textAnchor="middle" fontWeight="bold">Chest</text>
                      </>
                    ) : (
                      <line x1="33" y1="65" x2="87" y2="65" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                    )}

                    {/* Waist Line */}
                    {calculatorType === 'waist' ? (
                      <>
                        <line x1="37" y1="92" x2="83" y2="92" stroke="#D4AF37" strokeWidth="2" strokeDasharray="3,3" />
                        <circle cx="37" cy="92" r="3.5" fill="#D4AF37" />
                        <circle cx="83" cy="92" r="3.5" fill="#D4AF37" />
                        <text x="60" y="87" fill="#D4AF37" fontSize="8" textAnchor="middle" fontWeight="bold">Waist</text>
                      </>
                    ) : (
                      <line x1="37" y1="92" x2="83" y2="92" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                    )}

                    {/* Inseam Line */}
                    <line x1="58" y1="120" x2="58" y2="165" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                    <line x1="62" y1="120" x2="62" y2="165" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                  </svg>
                </div>

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {Object.entries(MEASUREMENT_GUIDES).map(([key, guide]) => {
                    const isHighlighted = calculatorType === key;
                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-xl border transition-all ${
                          isHighlighted
                            ? 'bg-gold-500/5 border-gold-500/40'
                            : 'bg-dark-900/20 border-dark-600/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <HiChevronRight className={`w-4 h-4 ${isHighlighted ? 'text-gold-400' : 'text-gray-500'}`} />
                          <h5 className={`text-sm font-semibold ${isHighlighted ? 'text-gold-400' : 'text-white'}`}>
                            {guide.title}
                          </h5>
                          {isHighlighted && (
                            <span className="text-[9px] uppercase font-extrabold bg-gold-500/10 text-gold-400 border border-gold-500/20 px-1.5 py-0.5 rounded ml-auto">
                              Active Fit Finder
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          {guide.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-dark-600 bg-dark-900/50">
            <button
              onClick={onClose}
              className="btn-outline px-6 py-2.5 text-sm"
            >
              Close Guide
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
