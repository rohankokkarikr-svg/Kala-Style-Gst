import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  HiShieldCheck, 
  HiLockClosed, 
  HiDocumentText, 
  HiUser, 
  HiCreditCard, 
  HiTruck, 
  HiMail, 
  HiSparkles,
  HiCheckCircle,
  HiArrowLeft
} from 'react-icons/hi';
import Footer from '../components/Footer';

export default function PrivacyPolicy() {
  const [activeSection, setActiveSection] = useState('collection');
  const lastUpdated = 'September 24, 2026';

  const sections = [
    { id: 'collection', label: '1. Information We Collect', icon: HiUser },
    { id: 'usage', label: '2. How We Use Information', icon: HiSparkles },
    { id: 'security', label: '3. Data Security & Storage', icon: HiLockClosed },
    { id: 'payments', label: '4. Payments & Razorpay', icon: HiCreditCard },
    { id: 'shipping', label: '5. Logistics & Shiprocket', icon: HiTruck },
    { id: 'artisan', label: '6. Artisan Data Protection', icon: HiShieldCheck },
    { id: 'rights', label: '7. Your Rights (DPDPA 2023)', icon: HiDocumentText },
    { id: 'contact', label: '8. Grievance & Contact', icon: HiMail },
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
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-gold-400/5 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <HiShieldCheck className="w-4 h-4" />
            <span>DPDPA 2023 & IT Act Compliant</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white mb-4 tracking-tight">
            Privacy <span className="gold-text">Policy</span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Your trust is our cornerstone. Learn how KalaStyle AI collects, safeguards, and respects the personal information of our patrons and master artisans across India.
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
              Policy Table of Contents
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
                Questions about our privacy practices? Contact our Data Privacy Officer at{' '}
                <a href="mailto:privacy@kalastyle.ai" className="text-gold-400 hover:underline">privacy@kalastyle.ai</a>
              </p>
            </div>
          </aside>

          {/* Policy Text Content */}
          <main className="lg:col-span-8 space-y-8">
            
            {/* Section 1 */}
            <article id="collection" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiUser className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">1. Information We Collect</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                When you browse our storefront, register an account, order handcrafted treasures, or join our artisan collective, we collect information necessary to fulfill our ethical commerce commitments:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-dark-900 p-4 rounded-xl border border-dark-700">
                  <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-1.5">
                    <HiCheckCircle className="text-gold-400 w-4 h-4" /> Account & Identity
                  </h4>
                  <p className="text-xs text-gray-400">
                    Full name, email address, phone number, and verified Supabase/Google authentication credentials.
                  </p>
                </div>
                <div className="bg-dark-900 p-4 rounded-xl border border-dark-700">
                  <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-1.5">
                    <HiCheckCircle className="text-gold-400 w-4 h-4" /> Shipping & Delivery
                  </h4>
                  <p className="text-xs text-gray-400">
                    Postal delivery addresses, pin codes, landmarks, and contact numbers passed securely to logistics partners.
                  </p>
                </div>
                <div className="bg-dark-900 p-4 rounded-xl border border-dark-700">
                  <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-1.5">
                    <HiCheckCircle className="text-gold-400 w-4 h-4" /> Artisan Verification Data
                  </h4>
                  <p className="text-xs text-gray-400">
                    Artisan craft specialty, studio location, government artisan card/heritage credentials, and bank/UPI details for direct earnings.
                  </p>
                </div>
                <div className="bg-dark-900 p-4 rounded-xl border border-dark-700">
                  <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-1.5">
                    <HiCheckCircle className="text-gold-400 w-4 h-4" /> AI Product Studio Prompts
                  </h4>
                  <p className="text-xs text-gray-400">
                    Uploaded product images, generated craft stories, and pricing parameters analyzed to assist artisan marketing.
                  </p>
                </div>
              </div>
            </article>

            {/* Section 2 */}
            <article id="usage" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiSparkles className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">2. How We Use Your Information</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                Your data is strictly utilized for genuine platform operations. KalaStyle AI will never sell, rent, or trade your personal data with third-party advertisers. We use collected information to:
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li><strong className="text-gray-200">Process & Track Orders:</strong> Coordinate packing, real-time Shiprocket dispatch, and automated delivery notifications.</li>
                <li><strong className="text-gray-200">Direct Artisan Remittance:</strong> Credit artisan earnings directly without predatory middlemen margins.</li>
                <li><strong className="text-gray-200">Authentication & Security:</strong> Deliver 8-digit verification OTP codes and secure Google OAuth session tokens.</li>
                <li><strong className="text-gray-200">AI Assistant Optimization:</strong> Help artisans automatically craft rich product descriptions, smart pricing, and authentic regional artisan narratives.</li>
                <li><strong className="text-gray-200">Compliance & Fraud Prevention:</strong> Comply with GST invoicing rules, dispute resolution, and consumer protection regulations.</li>
              </ul>
            </article>

            {/* Section 3 */}
            <article id="security" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiLockClosed className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">3. Data Security & Storage</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                We implement industry-standard cryptographic practices to safeguard your identity across all touchpoints:
              </p>
              <div className="bg-dark-900/80 p-5 rounded-xl border border-dark-700 space-y-3 text-xs text-gray-300">
                <p>
                  🔒 <strong>End-to-End Encryption:</strong> All browser-to-server traffic is enforced over HTTPS (TLS 1.3 encryption).
                </p>
                <p>
                  🛡️ <strong>Password & Token Hashing:</strong> Passwords are never stored in plaintext and are salted and hashed using bcrypt (10 rounds). Supabase sessions utilize cryptographic JWT signatures.
                </p>
                <p>
                  🗄️ <strong>Access Controls & Audit Logging:</strong> Database access is guarded with strict Row Level Security (RLS) policies and safe audit logging without leaking tokens or credentials.
                </p>
              </div>
            </article>

            {/* Section 4 */}
            <article id="payments" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiCreditCard className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">4. Payment Processing (Razorpay)</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                Financial transactions are processed through our PCI-DSS Level 1 certified payment gateway partner, <strong>Razorpay Software Private Limited</strong>:
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li>KalaStyle AI does <span className="text-red-400 font-semibold">NOT</span> store, log, or have access to your full credit card numbers, debit card numbers, CVVs, or net-banking passwords.</li>
                <li>Card tokenization conforms to Reserve Bank of India (RBI) security directives.</li>
                <li>UPI payments are authorized directly in your preferred UPI application (Google Pay, PhonePe, Paytm, BHIM) with zero credential retention on our servers.</li>
              </ul>
            </article>

            {/* Section 5 */}
            <article id="shipping" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiTruck className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">5. Logistics & Delivery Partners (Shiprocket)</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                To deliver fragile, masterfully crafted handicraft items directly from artisan workshops to your doorstep, we partner with <strong>Shiprocket</strong> and contracted courier networks (BlueDart, Delhivery, DTDC):
              </p>
              <p className="text-sm text-gray-400 leading-relaxed">
                Only information essential for courier dispatch—recipient name, shipping address, landmark, pin code, and contact phone number—is shared with the courier partner for airway bill generation and delivery coordination.
              </p>
            </article>

            {/* Section 6 */}
            <article id="artisan" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiShieldCheck className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">6. Artisan Intellectual Property & Data</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                Our artisans are cultural custodians. We take extraordinary measures to protect artisan craft designs and heritage information:
              </p>
              <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
                <li>Craft photographs, weaving motifs, and artisan biographical narratives remain the intellectual property of the artisan.</li>
                <li>Artisan financial details (bank account / UPI ID) are used solely for automatic payout disbursement and are stored with restricted admin-only authorization.</li>
              </ul>
            </article>

            {/* Section 7 */}
            <article id="rights" className="card p-6 sm:p-8 border border-dark-600 bg-dark-950/60 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiDocumentText className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">7. Your Rights under DPDPA 2023</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                Under India's Digital Personal Data Protection Act, 2023, you retain full autonomy over your personal data:
              </p>
              <div className="space-y-2 text-sm text-gray-400">
                <p>• <strong>Right to Access:</strong> Request a summary of personal data processed about you.</p>
                <p>• <strong>Right to Correction & Updating:</strong> Edit your addresses, profile details, and contact numbers at any time from your account.</p>
                <p>• <strong>Right to Erasure:</strong> Request permanent deactivation of your account and deletion of non-statutory data.</p>
                <p>• <strong>Right to Grievance Redressal:</strong> Prompt resolution of privacy inquiries within statutory deadlines.</p>
              </div>
            </article>

            {/* Section 8 */}
            <article id="contact" className="card p-6 sm:p-8 border border-gold-500/30 bg-dark-950/80 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 text-gold-400">
                <HiMail className="w-6 h-6 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">8. Grievance Officer & Inquiries</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                In compliance with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 and DPDPA, you may reach our designated Grievance Officer:
              </p>
              <div className="bg-dark-900 p-4 rounded-xl border border-dark-700 text-xs text-gray-300 space-y-1.5">
                <p><strong className="text-white">Grievance Officer:</strong> Rohan Kokkari</p>
                <p><strong className="text-white">Designation:</strong> Compliance & Data Protection Head, KalaStyle AI</p>
                <p><strong className="text-white">Email:</strong> <a href="mailto:support@kalastyle.ai" className="text-gold-400 hover:underline">support@kalastyle.ai</a></p>
                <p><strong className="text-white">Helpline:</strong> +91 7676558335 (Mon-Sat, 9:30 AM – 6:30 PM IST)</p>
                <p><strong className="text-white">Registered Address:</strong> KalaStyle AI Marketplace, Karnataka, India</p>
              </div>
            </article>

          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
