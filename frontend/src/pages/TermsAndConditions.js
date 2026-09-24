import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  HiScale, 
  HiDocumentText, 
  HiShieldCheck, 
  HiCurrencyRupee, 
  HiTruck, 
  HiRefresh, 
  HiSparkles, 
  HiExclamationCircle,
  HiCheckCircle,
  HiArrowLeft
} from 'react-icons/hi';
import Footer from '../components/Footer';

export default function TermsAndConditions() {
  const [activeSection, setActiveSection] = useState('acceptance');
  const lastUpdated = 'September 24, 2026';

  const sections = [
    { id: 'acceptance', label: '1. Acceptance of Terms', icon: HiDocumentText },
    { id: 'marketplace', label: '2. Artisan Marketplace Model', icon: HiSparkles },
    { id: 'accounts', label: '3. Account Security & OTP', icon: HiShieldCheck },
    { id: 'authenticity', label: '4. Handcrafted Authenticity', icon: HiCheckCircle },
    { id: 'pricing', label: '5. Pricing, GST & Orders', icon: HiCurrencyRupee },
    { id: 'shipping', label: '6. Shipping & Delivery', icon: HiTruck },
    { id: 'returns', label: '7. Returns & Refund Policy', icon: HiRefresh },
    { id: 'ai-studio', label: '8. AI Product Studio Rules', icon: HiSparkles },
    { id: 'liability', label: '9. Limitation of Liability', icon: HiExclamationCircle },
    { id: 'governing', label: '10. Governing Law & Contact', icon: HiScale },
  ];

  const scrollTo = (id) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 text-gray-200">
      {/* Hero Header */}
      <section className="relative py-16 px-4 sm:px-6 lg:px-8 border-b border-dark-700/80 bg-gradient-to-b from-dark-950 via-dark-900 to-dark-900 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gold-400/5 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <HiScale className="w-4 h-4" />
            <span>Marketplace Terms & Consumer Safeguards</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white mb-4 tracking-tight">
            Terms & <span className="gold-text">Conditions</span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Please read these terms carefully before accessing or using KalaStyle AI. They govern your rights, orders, artisan partnerships, and platform privileges.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-gray-500">
            <span>Last Updated: {lastUpdated}</span>
            <span>•</span>
            <Link to="/" className="text-gold-400 hover:text-gold-300 inline-flex items-center gap-1">
              <HiArrowLeft className="w-3.5 h-3.5" /> Return to Storefront
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Quick Nav Sidebar (Desktop) */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-24 space-y-2 card p-4 border border-dark-600/80 bg-dark-950/80 backdrop-blur-md">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-400 px-3 py-2">
              Terms Navigation
            </h3>
            <nav className="space-y-1">
              {sections.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => scrollTo(sec.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                      isActive 
                        ? 'bg-gold-500/20 text-gold-300 border border-gold-500/40 shadow-sm' 
                        : 'text-gray-400 hover:text-white hover:bg-dark-800'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-gold-400' : 'text-gray-500'}`} />
                    <span className="truncate">{sec.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-dark-700/80 px-3">
              <p className="text-[11px] text-gray-400 leading-normal">
                Need clarification on any provision? Our legal and support team is ready to assist at{' '}
                <a href="mailto:support@kalastyle.ai" className="text-gold-400 hover:underline">support@kalastyle.ai</a>
              </p>
            </div>
          </aside>

          {/* Terms Text Content */}
          <main className="lg:col-span-8 space-y-8">
            
            {/* Section 1 */}
            <article id="acceptance" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiDocumentText className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">1. Acceptance of Terms</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                By browsing, registering, placing an order, or listing crafts on <strong>KalaStyle AI</strong> (operated under KalaStyle GST / Style Heaven), you signify your unconditional agreement to be bound by these Terms and Conditions and our Privacy Policy.
              </p>
              <p className="text-sm text-gray-400 leading-relaxed">
                These terms constitute an electronic record in accordance with the Information Technology Act, 2000 and applicable consumer protection rules. If you do not agree to all terms, please refrain from using our marketplace.
              </p>
            </article>

            {/* Section 2 */}
            <article id="marketplace" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiSparkles className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">2. Artisan Marketplace Model</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                KalaStyle AI is an artisan-first digital marketplace that directly connects discerning patrons with verified Indian master craftspeople, weavers, sculptors, and folk artisans:
              </p>
              <div className="bg-dark-900 p-4 rounded-xl border border-dark-700 space-y-2 text-xs text-gray-300">
                <p>• <strong>Direct Support:</strong> Patrons purchase authentic crafts directly from artisans, ensuring that creators receive fair, dignified earnings without middleman exploitation.</p>
                <p>• <strong>Artisan Verification:</strong> All artisans go through onboarding verification to validate regional heritage craft techniques, GI certifications, and workshop authenticity.</p>
              </div>
            </article>

            {/* Section 3 */}
            <article id="accounts" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiShieldCheck className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">3. Account Security & OTP Verification</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                You may register as a Customer or apply as an Artisan. To maintain the highest security:
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li>Authentication is verified via 8-digit email OTPs, passwords, or verified Google OAuth accounts.</li>
                <li>You are solely responsible for maintaining the confidentiality of your login credentials and preventing unauthorized access to your account.</li>
                <li>You agree to notify us immediately at <a href="mailto:support@kalastyle.ai" className="text-gold-400 hover:underline">support@kalastyle.ai</a> of any suspected unauthorized account activity.</li>
              </ul>
            </article>

            {/* Section 4 */}
            <article id="authenticity" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiCheckCircle className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">4. Handcrafted Authenticity & Natural Variations</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                Handcrafted products celebrate human artistry and age-old traditions:
              </p>
              <div className="p-4 rounded-xl bg-gold-500/10 border border-gold-500/20 text-xs text-gold-300 leading-relaxed">
                🌟 <strong>The Beauty of the Handmade:</strong> Because our goods are crafted manually using traditional looms, clay spinning, lost-wax bronze casting, and hand-block printing, slight variations in weave texture, wood grain, dye shade, or hand-painted details are inherent hallmarks of authentic craftsmanship, not manufacturing defects.
              </div>
            </article>

            {/* Section 5 */}
            <article id="pricing" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiCurrencyRupee className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">5. Pricing, GST & Payments</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                All prices are denominated in Indian Rupees (₹ INR) and include all applicable Goods & Services Tax (GST) in accordance with Indian statutory requirements.
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li>Payments are processed securely via Razorpay (UPI, Credit/Debit Cards, Net Banking, EMI, and Mobile Wallets).</li>
                <li>We reserve the right to correct any inadvertent pricing errors prior to shipment dispatch.</li>
              </ul>
            </article>

            {/* Section 6 */}
            <article id="shipping" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiTruck className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">6. Shipping, Delivery & Tracking</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                Shipments are dispatched directly from regional artisan workshops through Shiprocket logistics:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
                <div className="bg-dark-900 p-3 rounded-lg border border-dark-700">
                  <strong className="text-white block mb-1">Standard Delivery Window</strong>
                  Expected delivery across India within 3 to 7 business days from dispatch.
                </div>
                <div className="bg-dark-900 p-3 rounded-lg border border-dark-700">
                  <strong className="text-white block mb-1">Live Tracking</strong>
                  Real-time tracking updates via SMS, WhatsApp, and the KalaStyle AI tracking portal.
                </div>
              </div>
            </article>

            {/* Section 7 */}
            <article id="returns" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiRefresh className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">7. 7-Day Handcrafted Return & Refund Policy</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                We take immense pride in our artisan treasures. If you receive an item that is damaged in transit, defective, or fundamentally different from its listing:
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li><strong className="text-white">Reporting Window:</strong> Report transit damage or defects within <strong>7 days</strong> of delivery with clear unboxing photos/video.</li>
                <li><strong className="text-white">Return Eligibility:</strong> Items must be unused, in their original heritage packaging with all authentic tags intact.</li>
                <li><strong className="text-white">Refund Processing:</strong> Approved refunds are credited directly to your original payment method via Razorpay within 5–7 business days of warehouse inspection.</li>
                <li><strong className="text-white">Custom & Commissioned Items:</strong> Specially custom-ordered or personalized artisan commissions are non-returnable unless arrived damaged.</li>
              </ul>
            </article>

            {/* Section 8 */}
            <article id="ai-studio" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiSparkles className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">8. AI Product Studio & Artisan Intellectual Property</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                KalaStyle AI provides proprietary AI tools to help rural and traditional craftspeople create rich product descriptions, market intelligence, and smart pricing suggestions:
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li>Artisans retain full copyright ownership of their original product designs, photographs, and craft styles.</li>
                <li>AI-generated descriptions and translations are provided as suggestions; the artisan or store owner remains responsible for product accuracy.</li>
              </ul>
            </article>

            {/* Section 9 */}
            <article id="liability" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiExclamationCircle className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">9. Limitation of Liability</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                To the maximum extent permitted by Indian law, KalaStyle AI and its affiliates shall not be liable for any indirect, incidental, punitive, or consequential damages arising out of the use or inability to use the platform. Our aggregate liability for any claims related to an order is limited strictly to the total purchase price paid for that order.
              </p>
            </article>

            {/* Section 10 */}
            <article id="governing" className="card p-6 sm:p-8 border border-gold-500/30 bg-dark-950/80 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiScale className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">10. Governing Law, Jurisdiction & Support</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                These terms are governed by the laws of the Republic of India. Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the competent courts in Karnataka, India.
              </p>
              <div className="bg-dark-900 p-4 rounded-xl border border-dark-700 text-xs text-gray-300 space-y-1.5">
                <p><strong className="text-white">Customer Support:</strong> <a href="mailto:support@kalastyle.ai" className="text-gold-400 hover:underline">support@kalastyle.ai</a></p>
                <p><strong className="text-white">Artisan Onboarding:</strong> <a href="mailto:artisans@kalastyle.ai" className="text-gold-400 hover:underline">artisans@kalastyle.ai</a></p>
                <p><strong className="text-white">Phone Support:</strong> +91 7676558335 (Mon-Sat, 9:30 AM – 6:30 PM IST)</p>
              </div>
            </article>

          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
