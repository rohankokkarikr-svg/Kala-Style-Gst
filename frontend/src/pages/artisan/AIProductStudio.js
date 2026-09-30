import React, { useState, useRef, useCallback, useEffect } from 'react';
import { HiMicrophone, HiSparkles, HiCheck, HiX, HiRefresh, HiChevronRight, HiChevronLeft, HiGlobe, HiCurrencyRupee, HiPhotograph } from 'react-icons/hi';
import { aiAPI, productAPI, categoryAPI, adminAPI, apiCache } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';


// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'upload',      label: 'Upload Photo',       icon: '📸' },
  { id: 'describe',    label: 'Describe Product',   icon: '🎤' },
  { id: 'generate',    label: 'AI Analysis',        icon: '🤖' },
  { id: 'review',      label: 'Review & Edit',      icon: '✨' },
  { id: 'price',       label: 'Price Suggestion',   icon: '💰' },
  { id: 'translate',   label: 'Multilingual',       icon: '🌐' },
  { id: 'publish',     label: 'Publish',            icon: '🚀' },
  { id: 'ai_images',   label: 'AI Photos',          icon: '🎨' },
];

const SEVEN_CATEGORIES = [
  'Handloom & Textiles',
  'Home Décor & Furnishings',
  'Handmade Jewelry & Accessories',
  'Pottery & Terracotta',
  'Wooden Handicrafts',
  'Traditional Paintings & Wall Art',
  'Eco-Friendly & Natural Products',
];

const LANGUAGES = [
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi',    flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada',  flag: 'ಕ' },
  { code: 'mr', label: 'Marathi',  flag: 'म' },
];

const AI_LOADING_MESSAGES = [
  '⏳ AI is analyzing your product...',
  '🧠 Understanding craftsmanship...',
  '📝 Creating your catalog...',
  '🏷️ Selecting the best category...',
  '💰 Calculating price suggestion...',
  '✨ Your smart catalog is ready!',
];

// ── Utility ──────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, multiline }) {
  const cls = 'w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/60 placeholder-gray-600 transition-colors';
  return multiline
    ? <textarea rows={3} className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    : <input className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AIProductStudio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef();
  const recognitionRef = useRef(null);

  // Step state
  const [step, setStep] = useState(0);

  // Step 1 — Image
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Step 2 — Description & Language
  const [description, setDescription] = useState('');
  const [inputLanguage, setInputLanguage] = useState('English');
  const [isListening, setIsListening] = useState(false);

  // Step 3 — AI Processing
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const loadingInterval = useRef(null);

  // Step 4 — Review & Edit catalog
  const [catalog, setCatalog] = useState(null);

  // Step 5 — Price
  const [priceInputs, setPriceInputs] = useState({ rawMaterial: '', labor: '', expenses: '', margin: 30 });
  const [priceSuggestion, setPriceSuggestion] = useState(null);
  const [isCalcPrice, setIsCalcPrice] = useState(false);
  const [finalPrice, setFinalPrice] = useState('');

  // Step 6 — Translations
  const [translations, setTranslations] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState(['Hindi']);

  // Step 7 — Publish
  const [isPublishing, setIsPublishing] = useState(false);

  // Step 8 — AI Image Generation
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [imageGenProgress, setImageGenProgress] = useState(0);
  const [publishedProductId, setPublishedProductId] = useState(null);

  // Dynamic Categories from Admin updates
  const [availableCategories, setAvailableCategories] = useState(SEVEN_CATEGORIES);
  const [artisansList, setArtisansList] = useState([]);
  const [selectedArtisanId, setSelectedArtisanId] = useState('');

  useEffect(() => {
    categoryAPI.getAll().then(({ data }) => {
      if (data && data.length > 0) {
        setAvailableCategories(data.map(c => c.name));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      adminAPI.getArtisans().then(({ data }) => {
        if (data && data.length > 0) {
          setArtisansList(data);
          const defaultArtisan = data.find(a => a.users?.role === 'artisan' || a.id !== user?.artisan_profile?.id) || data[0];
          setSelectedArtisanId(defaultArtisan?.id || user?.artisan_profile?.id || '');
        }
      }).catch(() => {});
    }
  }, [user]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const startLoadingMessages = () => {
    let i = 0;
    setLoadingMsgIdx(0);
    loadingInterval.current = setInterval(() => {
      i++;
      if (i < AI_LOADING_MESSAGES.length - 1) setLoadingMsgIdx(i);
      else clearInterval(loadingInterval.current);
    }, 1400);
  };

  const stopLoadingMessages = () => {
    clearInterval(loadingInterval.current);
    setLoadingMsgIdx(AI_LOADING_MESSAGES.length - 1);
  };

  const updateCatalogField = (field, value) => setCatalog(prev => ({ ...prev, [field]: value }));

  // ── Step 1: Image Upload ───────────────────────────────────────────────────

  const uploadToCloudinary = async (file) => {
    setIsUploadingImage(true);
    const id = toast.loading('Uploading image...');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await productAPI.uploadDirect(fd);
      if (data?.imageUrl) {
        setImageUrl(data.imageUrl);
        toast.success('Image uploaded!', { id });
        return data.imageUrl;
      }
      throw new Error('No URL returned');
    } catch {
      toast.dismiss(id);
      const reader = new FileReader();
      reader.onloadend = () => { setImageUrl(reader.result); };
      reader.readAsDataURL(file);
      return null;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files[0] || e.target.files?.[0];
    if (!file?.type.startsWith('image/')) { toast.error('Please upload a valid image.'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    await uploadToCloudinary(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Voice Input ────────────────────────────────────────────────────

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input not supported in this browser.'); return; }
    const langMap = { 'English': 'en-IN', 'Hindi': 'hi-IN', 'Kannada': 'kn-IN', 'Marathi': 'mr-IN' };
    const rec = new SR();
    rec.continuous = false; rec.lang = langMap[inputLanguage] || 'en-IN';
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => setDescription(prev => (prev + ' ' + e.results[0][0].transcript).trim());
    rec.onend = () => setIsListening(false);
    rec.onerror = () => { setIsListening(false); toast.error('Voice recognition failed. Please type instead.'); };
    rec.start();
    recognitionRef.current = rec;
  };

  const stopVoice = () => { recognitionRef.current?.stop(); setIsListening(false); };

  // ── Step 3: AI Generation ──────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!imageFile && !description.trim()) {
      toast.error('Please upload a photo or describe your product.');
      return;
    }
    setStep(2);
    setIsGenerating(true);
    startLoadingMessages();

    try {
      let cloudUrl = imageUrl;
      if (!cloudUrl && imageFile) cloudUrl = await uploadToCloudinary(imageFile);

      const { data } = await aiAPI.generateFullCatalog({
        description: description.trim(),
        image_url: cloudUrl || '',
        language: inputLanguage,
      });

      const cat = data.catalog || data;
      setCatalog({
        productName:      cat.productName      || cat.product_name      || 'Artisan Product',
        shortDescription: cat.shortDescription || cat.short_description || '',
        fullDescription:  cat.fullDescription  || cat.full_description  || cat.description || '',
        category:         cat.category         || SEVEN_CATEGORIES[0],
        subcategory:      cat.subcategory       || '',
        materials:        Array.isArray(cat.materials) ? cat.materials.join(', ') : (cat.material || ''),
        craftTechnique:   cat.craftTechnique    || cat.craft_technique   || '',
        suggestedTags:    Array.isArray(cat.suggestedTags) ? cat.suggestedTags.join(', ') : (Array.isArray(cat.tags) ? cat.tags.join(', ') : ''),
        keyFeatures:      Array.isArray(cat.keyFeatures) ? cat.keyFeatures.join('\n') : '',
        careInstructions: Array.isArray(cat.careInstructions) ? cat.careInstructions.join('\n') : '',
        priceMin:         cat.suggestedPriceRange?.minimum || cat.price_range?.min || 499,
        priceMax:         cat.suggestedPriceRange?.maximum || cat.price_range?.max || 2999,
        isAIGenerated:    data.isAIGenerated !== false,
      });
      stopLoadingMessages();
      setStep(3);
      toast.success(data.isAIGenerated ? 'AI catalog generated! ✨' : 'Smart catalog ready!');
    } catch (err) {
      console.warn('AI catalog call warning, applying smart fallback:', err);
      stopLoadingMessages();
      const desc = description.trim() || 'Handmade Artisan Craft';
      const words = desc.split(' ').slice(0, 5).join(' ');
      const fallbackName = words.charAt(0).toUpperCase() + words.slice(1);
      
      setCatalog({
        productName:      fallbackName,
        shortDescription: `Authentic handcrafted artisan piece in ${inputLanguage}.`,
        fullDescription:  `Handcrafted with care by skilled Indian artisans. ${desc}. Each piece is created with exquisite attention to detail, preserving rich traditional Indian heritage.`,
        category:         SEVEN_CATEGORIES[0],
        subcategory:      'Artisan Collection',
        materials:        'Pure Natural Materials',
        craftTechnique:   'Handcrafted',
        suggestedTags:    'handmade, artisan, indian-craft, exclusive',
        keyFeatures:      '100% handmade\nAuthentic craft\nUnique piece',
        careInstructions: 'Handle with care\nStore in cool dry place',
        priceMin:         499,
        priceMax:         2499,
        isAIGenerated:    false,
      });
      setStep(3);
      toast.success('Product details ready! Review and edit below. ✨');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Step 5: Price Calculation ──────────────────────────────────────────────

  const handleCalculatePrice = async () => {
    const raw = parseFloat(priceInputs.rawMaterial) || 0;
    const labor = parseFloat(priceInputs.labor) || 0;
    const exp = parseFloat(priceInputs.expenses) || 0;
    const margin = parseFloat(priceInputs.margin) || 30;
    if (raw + labor + exp === 0) { toast.error('Please enter at least one cost.'); return; }
    setIsCalcPrice(true);
    try {
      const { data } = await aiAPI.suggestPrice({
        rawMaterialCost: raw, laborCost: labor, additionalExpenses: exp,
        desiredMarginPercent: margin,
        category: catalog?.category || '',
        description: catalog?.productName || '',
      });
      setPriceSuggestion(data);
      setFinalPrice(String(data.breakdown?.suggestedPrice || ''));
    } catch {
      const base = raw + labor + exp;
      const suggested = Math.round(base * (1 + margin / 100));
      setPriceSuggestion({
        breakdown: { rawMaterialCost: raw, laborCost: labor, additionalExpenses: exp, baseCost: base, marginPercent: margin, suggestedPrice: suggested },
        aiRange: { minimum: Math.round(suggested * 0.9), maximum: Math.round(suggested * 1.3) },
        aiExplanation: 'Calculated from your actual costs.',
        disclaimer: 'AI-generated estimate — final pricing decision belongs to the artisan.',
      });
      setFinalPrice(String(suggested));
    } finally {
      setIsCalcPrice(false);
    }
  };

  // ── Step 6: Translation ────────────────────────────────────────────────────

  const handleTranslate = async () => {
    if (!catalog?.productName) { toast.error('Please complete the catalog first.'); return; }
    setIsTranslating(true);
    try {
      const { data } = await aiAPI.translateProduct({
        productName: catalog.productName,
        description: catalog.shortDescription,
        targetLanguages: ['English', ...selectedLangs],
      });
      setTranslations(data.translations);
    } catch {
      setTranslations({
        English: { productName: catalog.productName, description: catalog.shortDescription },
      });
    } finally {
      setIsTranslating(false);
    }
  };

  // ── Step 7: Publish ────────────────────────────────────────────────────────

  const handlePublish = async (isDraft = false) => {
    if (!catalog?.productName) { toast.error('Product name is required.'); return; }
    if (isUploadingImage) { toast.error('Please wait for image upload to finish.'); return; }
    setIsPublishing(true);
    try {
      let finalUrl = imageUrl;
      if (!finalUrl && imageFile) finalUrl = await uploadToCloudinary(imageFile);

      const price = parseFloat(finalPrice) || catalog?.priceMin || 999;
      const targetArtisanId = user?.role === 'admin'
        ? (selectedArtisanId || user?.artisan_profile?.id || user?.id)
        : (user?.artisan_profile?.id || user?.id);

      const chosenArtisan = artisansList.find(a => a.id === targetArtisanId);
      const targetArtisanName = chosenArtisan?.store_name || user?.artisan_profile?.store_name || user?.name;

      const productData = {
        name:           catalog.productName,
        description:    catalog.fullDescription || catalog.shortDescription,
        price,
        original_price: Math.round(price * 1.2),
        category:       catalog.category,
        subcategory:    catalog.subcategory,
        material:       catalog.materials,
        style:          catalog.craftTechnique,
        tags:           catalog.suggestedTags?.split(',').map(t => t.trim()).filter(Boolean),
        image_url:      finalUrl || '',
        sizes:          ['Free Size'],
        stock_quantity: 10,
        artisan_id:     targetArtisanId,
        artisan_name:   targetArtisanName,
        status:         isDraft ? 'draft' : 'pending',
        ai_generated:   catalog.isAIGenerated,
      };

      const { data: createdProduct } = await productAPI.create(productData);
      apiCache.invalidateProducts();
      window.dispatchEvent(new CustomEvent('kala:sync:products_updated', {
        detail: { payload: { action: 'create' } }
      }));

      const productId = createdProduct?.id;
      setPublishedProductId(productId);
      toast.success(isDraft ? 'Saved as draft!' : 'Product submitted! Now generating AI photos... 🎨');

      // ── Advance to Step 8: AI Image Generation ──
      if (!isDraft && finalUrl) {
        setStep(7);
        setIsGeneratingImages(true);
        setImageGenProgress(8);

        // Animate progress bar during generation
        const progressTimer = setInterval(() => {
          setImageGenProgress(prev => prev < 82 ? prev + 4 : prev);
        }, 3000);

        try {
          const { data: imgResult } = await aiAPI.generateProductImages({
            image_url:        finalUrl,
            product_name:     catalog.productName,
            category:         catalog.category,
            material:         catalog.materials,
            craft_technique:  catalog.craftTechnique,
            product_id:       productId,
          });

          clearInterval(progressTimer);
          setImageGenProgress(100);
          const imgs = imgResult?.images || [finalUrl];
          setGeneratedImages(imgs);

          if (imgs.length > 1) {
            toast.success(`🌟 ${imgs.length} AI product photos generated and saved to your product!`);
          } else {
            toast('📸 Product saved! AI photos will appear after approval.');
          }
        } catch (imgErr) {
          clearInterval(progressTimer);
          setImageGenProgress(100);
          setGeneratedImages(finalUrl ? [finalUrl] : []);
          console.warn('Image generation notice:', imgErr.message);
          toast('Product published! AI photo generation is running in the background.');
        } finally {
          setIsGeneratingImages(false);
        }
      } else {
        // Draft or no image: navigate away immediately
        navigate(user?.role === 'admin' ? '/admin/products' : '/artisan/products');
      }
    } catch (err) {
      console.error('Publish error:', err);
      toast.error('Publish failed. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };


  // ── Step Progress Bar ──────────────────────────────────────────────────────

  const ProgressBar = () => (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <button
            onClick={() => i < step && setStep(i)}
            className={`flex flex-col items-center gap-1 shrink-0 transition-all duration-300 ${i <= step ? 'opacity-100' : 'opacity-40'}`}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              i < step ? 'bg-gold-500 border-gold-500 text-dark-900' :
              i === step ? 'border-gold-500 text-gold-400 bg-gold-500/10' :
              'border-dark-600 text-gray-500 bg-dark-800'
            }`}>
              {i < step ? <HiCheck className="w-4 h-4" /> : s.icon}
            </div>
            <span className={`text-[9px] font-medium whitespace-nowrap ${i === step ? 'text-gold-400' : 'text-gray-500'}`}>{s.label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <div className={`h-px flex-1 mx-1 min-w-[12px] transition-colors ${i < step ? 'bg-gold-500/60' : 'bg-dark-600'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-white flex items-center gap-3">
          <HiSparkles className="text-gold-400 w-7 h-7" /> AI Smart Catalog Studio
        </h1>
        <p className="text-gray-400 text-sm mt-1">From photo to published product in 7 simple steps.</p>
      </div>

      <ProgressBar />

      {/* ── STEP 1: Upload ── */}
      {step === 0 && (
        <div className="card p-8 space-y-6">
          <h2 className="text-lg font-semibold text-white">Step 1 — Upload Product Photo</h2>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging ? 'border-gold-500 bg-gold-500/5' : 'border-dark-600 hover:border-gold-500/50'}`}
            onDrop={handleFileDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <div className="space-y-3">
                <img src={imagePreview} alt="Product" className="max-h-64 mx-auto rounded-xl object-cover shadow-xl" />
                <p className="text-gold-400 text-sm font-medium">
                  {isUploadingImage ? '⏳ Uploading...' : '✅ Image ready'}
                </p>
                <button onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(''); setImageUrl(''); }}
                  className="text-gray-500 hover:text-red-400 text-xs flex items-center gap-1 mx-auto transition-colors">
                  <HiX className="w-3 h-3" /> Remove
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <HiPhotograph className="w-16 h-16 text-gray-600 mx-auto" />
                <div>
                  <p className="text-white font-medium">Drag & drop your product photo here</p>
                  <p className="text-gray-500 text-sm mt-1">or click to browse — JPG, PNG, WEBP</p>
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileDrop} />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-gray-500 text-xs">Photo helps AI identify your product accurately</p>
            <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-2">
              Skip photo <HiChevronRight className="w-4 h-4" />
            </button>
          </div>

          {imagePreview && (
            <button
              onClick={() => setStep(1)}
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={isUploadingImage}
            >
              Continue to Description <HiChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ── STEP 2: Describe ── */}
      {step === 1 && (
        <div className="card p-8 space-y-6">
          <h2 className="text-lg font-semibold text-white">Step 2 — Describe Your Product</h2>

          {/* Language selector */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-gray-400 self-center">Describe in:</span>
            {LANGUAGES.map(l => (
              <button key={l.code}
                onClick={() => setInputLanguage(l.label)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${inputLanguage === l.label ? 'bg-gold-500/20 border-gold-500 text-gold-400' : 'border-dark-600 text-gray-400 hover:border-dark-500'}`}>
                {l.flag} {l.label}
              </button>
            ))}
          </div>

          {/* Voice input */}
          <div className="flex items-start gap-3">
            <button
              onClick={isListening ? stopVoice : startVoice}
              className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all border-2 ${isListening ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'border-gold-500/40 text-gold-400 hover:bg-gold-500/10'}`}
              title={isListening ? 'Stop recording' : 'Start voice input'}
            >
              <HiMicrophone className="w-5 h-5" />
            </button>
            <div className="flex-1 space-y-2">
              <textarea
                rows={5}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={`Describe your product in ${inputLanguage}...\n\nExample: This basket is handmade using natural bamboo. It takes two days to make. The technique has been passed down in my family for generations.`}
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold-500/60 placeholder-gray-600 transition-colors resize-none"
              />
              {isListening && (
                <div className="flex items-center gap-2 text-red-400 text-xs animate-pulse">
                  <span className="w-2 h-2 bg-red-400 rounded-full" />
                  Listening... speak now
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="btn-secondary flex items-center gap-2">
              <HiChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={!description.trim() && !imageUrl}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <HiSparkles className="w-4 h-4" /> Generate Smart Catalog
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: AI Processing ── */}
      {step === 2 && (
        <div className="card p-12 flex flex-col items-center justify-center gap-6 text-center min-h-64">
          <div className="w-16 h-16 border-4 border-gold-500/20 border-t-gold-500 rounded-full animate-spin" />
          <div className="space-y-2">
            <p className="text-white font-semibold text-lg">{AI_LOADING_MESSAGES[loadingMsgIdx]}</p>
            <p className="text-gray-500 text-sm">Powered by Gemini AI — analyzing your artisan product</p>
          </div>
          <div className="flex gap-1">
            {AI_LOADING_MESSAGES.slice(0, -1).map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i <= loadingMsgIdx ? 'w-8 bg-gold-500' : 'w-2 bg-dark-600'}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 4: Review & Edit ── */}
      {step === 3 && catalog && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Step 4 — Review & Edit AI Catalog</h2>
            <div className="flex items-center gap-2">
              {catalog.isAIGenerated ? (
                <span className="text-xs px-2 py-1 bg-gold-500/15 text-gold-400 border border-gold-500/30 rounded-full">AI Generated</span>
              ) : (
                <span className="text-xs px-2 py-1 bg-dark-700 text-gray-400 border border-dark-600 rounded-full">Smart Fallback</span>
              )}
              <button onClick={handleGenerate} className="text-gray-400 hover:text-gold-400 transition-colors" title="Regenerate">
                <HiRefresh className="w-4 h-4" />
              </button>
            </div>
          </div>

          {imagePreview && (
            <div className="flex gap-4 p-4 bg-dark-700/50 rounded-xl border border-dark-600">
              <img src={imagePreview} alt="Product" className="w-20 h-20 object-cover rounded-lg shrink-0" />
              <div className="text-xs text-gray-400 space-y-1 self-center">
                <p className="text-white font-medium text-sm">{catalog.productName}</p>
                <p className="text-gold-400">{catalog.category}</p>
                <p>AI confidence: {catalog.isAIGenerated ? 'High — Gemini analyzed your product' : 'Smart fallback mode'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Product Name *">
              <Input value={catalog.productName} onChange={v => updateCatalogField('productName', v)} placeholder="Product name" />
            </Field>
            <Field label="Category *">
              <select
                value={catalog.category}
                onChange={e => updateCatalogField('category', e.target.value)}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/60"
              >
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subcategory">
              <Input value={catalog.subcategory} onChange={v => updateCatalogField('subcategory', v)} placeholder="e.g. Wooden Toys" />
            </Field>
            <Field label="Materials">
              <Input value={catalog.materials} onChange={v => updateCatalogField('materials', v)} placeholder="e.g. Bamboo, Jute" />
            </Field>
            <Field label="Craft Technique">
              <Input value={catalog.craftTechnique} onChange={v => updateCatalogField('craftTechnique', v)} placeholder="e.g. Handwoven, Hand-carved" />
            </Field>
            <Field label="Tags (comma-separated)">
              <Input value={catalog.suggestedTags} onChange={v => updateCatalogField('suggestedTags', v)} placeholder="handmade, artisan, bamboo" />
            </Field>
          </div>

          <Field label="Short Description">
            <Input value={catalog.shortDescription} onChange={v => updateCatalogField('shortDescription', v)} placeholder="1-2 sentence product summary" multiline />
          </Field>
          <Field label="Full Description">
            <Input value={catalog.fullDescription} onChange={v => updateCatalogField('fullDescription', v)} placeholder="Full product description" multiline />
          </Field>
          <Field label="Key Features (one per line)">
            <Input value={catalog.keyFeatures} onChange={v => updateCatalogField('keyFeatures', v)} placeholder="100% handmade&#10;Authentic craft" multiline />
          </Field>
          <Field label="Care Instructions (one per line)">
            <Input value={catalog.careInstructions} onChange={v => updateCatalogField('careInstructions', v)} placeholder="Handle with care&#10;Store in cool place" multiline />
          </Field>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-2">
              <HiChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1 flex items-center justify-center gap-2">
              Next: Price Suggestion <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Price Suggestion ── */}
      {step === 4 && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <HiCurrencyRupee className="text-gold-400 w-5 h-5" /> Step 5 — AI Price Suggestion
          </h2>
          <p className="text-gray-400 text-sm">Enter your costs for a transparent price calculation. AI will suggest a fair range.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: 'rawMaterial', label: 'Raw Material (₹)', placeholder: '200' },
              { key: 'labor',       label: 'Labor Cost (₹)',   placeholder: '300' },
              { key: 'expenses',    label: 'Other Expenses (₹)', placeholder: '100' },
              { key: 'margin',      label: 'Profit Margin (%)', placeholder: '30' },
            ].map(({ key, label, placeholder }) => (
              <Field key={key} label={label}>
                <input
                  type="number" min="0"
                  value={priceInputs[key]}
                  onChange={e => setPriceInputs(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/60"
                />
              </Field>
            ))}
          </div>

          <button onClick={handleCalculatePrice} disabled={isCalcPrice} className="btn-primary w-full flex items-center justify-center gap-2">
            {isCalcPrice ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Calculating...</> : <><HiSparkles className="w-4 h-4" /> Calculate AI Price</>}
          </button>

          {priceSuggestion && (
            <div className="bg-dark-700/50 rounded-xl p-5 space-y-4 border border-dark-600">
              <h3 className="text-white font-semibold">Price Breakdown</h3>
              <div className="space-y-2 text-sm">
                {[
                  ['Raw Material', `₹${priceSuggestion.breakdown.rawMaterialCost}`],
                  ['Labor Cost',   `₹${priceSuggestion.breakdown.laborCost}`],
                  ['Other Expenses', `₹${priceSuggestion.breakdown.additionalExpenses}`],
                  ['Base Cost',    `₹${priceSuggestion.breakdown.baseCost}`],
                  [`Profit (${priceSuggestion.breakdown.marginPercent}%)`, `₹${priceSuggestion.breakdown.marginAmount || Math.round(priceSuggestion.breakdown.baseCost * priceSuggestion.breakdown.marginPercent / 100)}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-gray-400">
                    <span>{k}</span><span>{v}</span>
                  </div>
                ))}
                <div className="flex justify-between text-white font-bold border-t border-dark-600 pt-2">
                  <span>Suggested Price</span><span className="text-gold-400">₹{priceSuggestion.breakdown.suggestedPrice}</span>
                </div>
              </div>

              {priceSuggestion.aiRange && (
                <div className="bg-gold-500/10 border border-gold-500/30 rounded-lg p-3 space-y-1">
                  <p className="text-gold-400 text-xs font-semibold">AI Recommended Range</p>
                  <p className="text-white font-bold">₹{priceSuggestion.aiRange.minimum} – ₹{priceSuggestion.aiRange.maximum}</p>
                  {priceSuggestion.aiExplanation && <p className="text-gray-400 text-xs">{priceSuggestion.aiExplanation}</p>}
                </div>
              )}

              <p className="text-gray-500 text-xs italic">{priceSuggestion.disclaimer}</p>

              <Field label="Your Final Price (₹)">
                <input
                  type="number" min="0"
                  value={finalPrice}
                  onChange={e => setFinalPrice(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/60"
                  placeholder="Enter your final price"
                />
              </Field>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="btn-secondary flex items-center gap-2">
              <HiChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep(5)} className="btn-primary flex-1 flex items-center justify-center gap-2">
              Next: Languages <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 6: Multilingual ── */}
      {step === 5 && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <HiGlobe className="text-gold-400 w-5 h-5" /> Step 6 — Multilingual Catalog
          </h2>
          <p className="text-gray-400 text-sm">Generate your product listing in multiple Indian languages to reach more buyers.</p>

          <div className="flex gap-2 flex-wrap">
            {['Hindi', 'Kannada', 'Marathi'].map(lang => (
              <button key={lang}
                onClick={() => setSelectedLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${selectedLangs.includes(lang) ? 'bg-gold-500/20 border-gold-500 text-gold-400' : 'border-dark-600 text-gray-400 hover:border-dark-500'}`}>
                {lang}
              </button>
            ))}
          </div>

          <button onClick={handleTranslate} disabled={isTranslating || selectedLangs.length === 0} className="btn-primary flex items-center gap-2">
            {isTranslating ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Translating...</> : <><HiGlobe className="w-4 h-4" /> Generate Translations</>}
          </button>

          {translations && (
            <div className="space-y-3">
              {Object.entries(translations).map(([lang, content]) => (
                <div key={lang} className="bg-dark-700/50 border border-dark-600 rounded-xl p-4 space-y-2">
                  <p className="text-gold-400 text-xs font-semibold uppercase tracking-wide">{lang}</p>
                  <p className="text-white font-medium text-sm">{content.productName}</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{content.description}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="btn-secondary flex items-center gap-2">
              <HiChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep(6)} className="btn-primary flex-1 flex items-center justify-center gap-2">
              Next: Publish <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 7: Publish ── */}
      {step === 6 && catalog && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white">Step 7 — Publish Your Product</h2>

          {/* Final summary */}
          <div className="bg-dark-700/50 rounded-xl p-5 border border-dark-600 space-y-3">
            <div className="flex gap-4">
              {imagePreview && <img src={imagePreview} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />}
              <div className="space-y-1">
                <h3 className="text-white font-bold">{catalog.productName}</h3>
                <p className="text-gold-400 text-sm">{catalog.category}</p>
                <p className="text-gray-400 text-xs line-clamp-2">{catalog.shortDescription}</p>
                {finalPrice && <p className="text-green-400 font-semibold">₹{finalPrice}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {catalog.suggestedTags?.split(',').slice(0, 5).map(tag => (
                <span key={tag.trim()} className="px-2 py-0.5 text-xs bg-dark-600 text-gray-300 rounded-full">{tag.trim()}</span>
              ))}
            </div>
          </div>

          {/* Artisan Attribution Display / Selector */}
          {user?.role === 'admin' ? (
            <div className="p-4 rounded-xl bg-dark-750 border border-gold-500/40 space-y-2">
              <label className="text-xs font-bold text-gold-400 block uppercase tracking-wider flex items-center gap-1.5">
                <span>👑 Admin Action: Assign to Artisan Store</span>
              </label>
              <select
                value={selectedArtisanId}
                onChange={(e) => setSelectedArtisanId(e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold-500"
              >
                {artisansList.map((art) => (
                  <option key={art.id} value={art.id}>
                    {art.store_name} ({art.artisan_type || 'Artisan'}) {art.users?.name ? `— by ${art.users.name}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400">
                This listing will be attributed to this artisan store and will show up in their artisan dashboard.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-dark-800/80 border border-gold-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-gold-500 text-dark-950 font-black text-[10px] tracking-wider uppercase">ARTISAN STORE</span>
                <span className="text-gray-200">
                  Publishing to: <strong className="text-gold-400 font-bold">{user?.artisan_profile?.store_name || user?.name}</strong>
                </span>
              </div>
              <span className="text-gray-400 text-[11px]">
                {user?.artisan_profile?.artisan_type || 'Artisan'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handlePublish(true)} disabled={isPublishing}
              className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-40">
              Save as Draft
            </button>
            <button onClick={() => handlePublish(false)} disabled={isPublishing}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
              {isPublishing ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Publishing...</> : '🚀 Publish Now'}
            </button>
          </div>

          <button onClick={() => setStep(5)} className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1 transition-colors">
            <HiChevronLeft className="w-4 h-4" /> Back to translations
          </button>
        </div>
      )}

      {/* ── STEP 8: AI Image Generation ── */}
      {step === 7 && (
        <div className="card p-8 space-y-8 text-center">
          {isGeneratingImages ? (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-3xl animate-bounce">🎨</span>
                  <h2 className="text-xl font-serif font-bold text-white">AI is Generating Your Product Photos</h2>
                </div>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                  Gemini Imagen AI is creating <strong className="text-gold-400">3–4 professional product photos</strong> — studio shot, lifestyle photo, close-up detail, and festive background. This takes about 60–90 seconds.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="max-w-md mx-auto space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Generating photos via AI...</span>
                  <span className="text-gold-400 font-bold">{imageGenProgress}%</span>
                </div>
                <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-300 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${imageGenProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>📸 Studio shot</span>
                  <span>🌿 Lifestyle</span>
                  <span>🔍 Detail</span>
                  <span>✨ Festive</span>
                </div>
              </div>

              {/* Spinning loader */}
              <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
                <div className="w-5 h-5 border-2 border-gold-500/30 border-t-gold-400 rounded-full animate-spin" />
                <span>Please don't close this page while photos are being created...</span>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-3xl">🌟</span>
                  <h2 className="text-xl font-serif font-bold text-white">AI Photos Generated!</h2>
                </div>
                <p className="text-gray-400 text-sm">
                  {generatedImages.length > 1
                    ? `${generatedImages.length} professional product photos were created and saved to your product.`
                    : 'Your product has been published successfully.'}
                </p>
              </div>

              {/* Image Gallery Preview */}
              {generatedImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
                  {generatedImages.map((img, idx) => (
                    <div key={idx} className={`relative rounded-xl overflow-hidden aspect-square border-2 ${idx === 0 ? 'border-gold-500' : 'border-dark-600'}`}>
                      <img src={img} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute bottom-1 left-1 right-1 bg-dark-900/80 text-[9px] text-gold-400 font-bold text-center py-0.5 rounded">Your Photo</span>
                      )}
                      {idx > 0 && (
                        <span className="absolute bottom-1 left-1 right-1 bg-dark-900/80 text-[9px] text-emerald-400 font-bold text-center py-0.5 rounded">AI Photo</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {publishedProductId && (
                  <button
                    onClick={() => navigate(`/products/${publishedProductId}`)}
                    className="btn-primary px-8 py-3 flex items-center justify-center gap-2"
                  >
                    <HiCheck className="w-5 h-5" /> View Product Page
                  </button>
                )}
                <button
                  onClick={() => navigate(user?.role === 'admin' ? '/admin/products' : '/artisan/products')}
                  className={publishedProductId ? 'btn-secondary px-6 py-3' : 'btn-primary px-8 py-3 flex items-center justify-center gap-2'}
                >
                  Manage Products
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="btn-secondary px-6 py-3"
                >
                  Marketplace
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
