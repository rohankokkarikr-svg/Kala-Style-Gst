const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const { HANDICRAFT_PRODUCTS } = require('../data/handicraftsData');

async function populateMarketplace() {
  console.log('🌿 Adding authentic master artisans and handicraft products...');

  const artisanProfiles = [
    { email: 'anand.banaras@kalastyle.ai', phone: '9876500001', name: 'Anand Kumar Mishra', store_name: 'Kashi Heritage Looms', specialization: 'Pure Banarasi Katan Silk & Brocade', location: 'Varanasi, Uttar Pradesh', bio: 'Master handloom artisan weaving traditional silver and gold zari motifs on pure mulberry silk.', profile_image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop' },
    { email: 'shamim.lucknow@kalastyle.ai', phone: '9876500002', name: 'Shamim Begum', store_name: 'Awadh Chikankari Guild', specialization: 'Lucknowi Chikankari & Mukaish', location: 'Lucknow, Uttar Pradesh', bio: 'National award-winning artisan empowering over 200 women through fine needlecraft and shadow work.', profile_image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop' },
    { email: 'syed.channapatna@kalastyle.ai', phone: '9876500003', name: 'Syed Basha', store_name: 'Channapatna Lac Craft', specialization: 'Ivory Wood & Vegetable Lac Toys', location: 'Channapatna, Karnataka', bio: 'Master artisan in the royal Toy Town of Channapatna preserving GI-protected toy craft.', profile_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop' },
    { email: 'dulari.madhubani@kalastyle.ai', phone: '9876500004', name: 'Dulari Devi', store_name: 'Mithila Folk Kala Kendra', specialization: 'Madhubani & Kohbar Art', location: 'Ranti, Bihar', bio: 'Padma Shri recipient master artisan preserving 2500-year-old Mithila folk painting traditions.', profile_image: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=400&auto=format&fit=crop' },
    { email: 'ramprasad.gorakhpur@kalastyle.ai', phone: '9876500005', name: 'Ramprasad Prajapati', store_name: 'Gorakhpur Terracotta Studio', specialization: 'Natural River Clay Pottery', location: 'Gorakhpur, Uttar Pradesh', bio: 'GI-tagged terracotta craftsman continuing clay vessel sculpting techniques.', profile_image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop' },
    { email: 'bipul.assam@kalastyle.ai', phone: '9876500006', name: 'Bipul Saikia', store_name: 'Brahmaputra Cane & Bamboo', specialization: 'Assam Bamboo & Jute Crafts', location: 'Nalbari, Assam', bio: 'Master cane and bamboo artisan crafting sustainable zero-plastic home storage.', profile_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop' },
    { email: 'meera.jaipur@kalastyle.ai', phone: '9876500007', name: 'Meera Devi', store_name: 'Jaipur Kundan & Silver Studio', specialization: 'Kundan & Meenakari Handmade Jewelry', location: 'Jaipur, Rajasthan', bio: 'Generational jeweler preserving royal Rajasthani Meenakari and hand-set Kundan gemstone adornments.', profile_image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop' },
    { email: 'rajesh.jaipur@kalastyle.ai', phone: '9876500008', name: 'Rajesh Sharma', store_name: 'Jaipur Blue Art & Living', specialization: 'Handcrafted Home Décor & Blue Glaze Furnishings', location: 'Jaipur, Rajasthan', bio: 'Heritage artisan crafting artisanal lamps, decorative hangings, and living accents with traditional motifs.', profile_image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop' }
  ];

  const salt = await bcrypt.genSalt(10);
  const artisanPasswordHash = await bcrypt.hash('Artisan@12345', salt);
  const createdArtisanMap = {};

  for (const art of artisanProfiles) {
    let { data: existingUser } = await supabase.from('users').select('id').eq('email', art.email).maybeSingle();
    let userId = existingUser?.id;

    if (!userId) {
      const { data: newUser, error: uErr } = await supabase.from('users').insert([{
        name: art.name,
        email: art.email,
        phone: art.phone,
        password: artisanPasswordHash,
        role: 'artisan',
        status: 'active'
      }]).select().single();
      if (newUser) userId = newUser.id;
      else console.error('Error creating user for', art.name, uErr?.message);
    }

    if (userId) {
      let { data: existingProf } = await supabase.from('artisan_profiles').select('id').eq('user_id', userId).maybeSingle();
      if (!existingProf) {
        const { data: newProf, error: pErr } = await supabase.from('artisan_profiles').insert([{
          user_id: userId,
          store_name: art.store_name,
          artisan_type: 'Master Craftsman',
          specialization: art.specialization,
          location: art.location,
          bio: art.bio,
          profile_image: art.profile_image,
          verification_status: 'verified',
          preferred_language: 'Hindi / English',
          earnings_total: 92400.00
        }]).select().single();
        if (newProf) createdArtisanMap[art.store_name] = newProf.id;
        else console.error('Error creating profile for', art.store_name, pErr?.message);
      } else {
        createdArtisanMap[art.store_name] = existingProf.id;
      }
    }
  }

  console.log(`✅ ${Object.keys(createdArtisanMap).length} Master Artisans ready in Supabase.`);

  // Check how many products currently exist
  const { count: existingCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log(`Current products in Supabase: ${existingCount}`);

  if (existingCount < 20 && HANDICRAFT_PRODUCTS && HANDICRAFT_PRODUCTS.length > 0) {
    console.log(`📦 Populating ${HANDICRAFT_PRODUCTS.length} authentic Indian handicrafts...`);

    const rowsToInsert = HANDICRAFT_PRODUCTS.map((p, idx) => {
      let artisanId = null;
      if (p.category === 'Handloom & Textiles') {
        artisanId = createdArtisanMap['Kashi Heritage Looms'] || createdArtisanMap['Awadh Chikankari Guild'];
      } else if (p.category === 'Wooden Handicrafts') {
        artisanId = createdArtisanMap['Channapatna Lac Craft'];
      } else if (p.category === 'Traditional Paintings & Wall Art') {
        artisanId = createdArtisanMap['Mithila Folk Kala Kendra'];
      } else if (p.category === 'Pottery & Terracotta') {
        artisanId = createdArtisanMap['Gorakhpur Terracotta Studio'];
      } else if (p.category === 'Eco-Friendly & Natural Products') {
        artisanId = createdArtisanMap['Brahmaputra Cane & Bamboo'];
      } else if (p.category === 'Handmade Jewelry & Accessories') {
        artisanId = createdArtisanMap['Jaipur Kundan & Silver Studio'];
      } else if (p.category === 'Home Décor & Furnishings') {
        artisanId = createdArtisanMap['Jaipur Blue Art & Living'];
      }

      const imgUrl = p.image_url || (p.images && p.images[0]) || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500';
      const imagesArr = p.images && p.images.length > 0 ? p.images : [imgUrl];

      return {
        name: p.name,
        description: p.description,
        price: p.price,
        original_price: p.original_price || Math.round(p.price * 1.4),
        category: p.category,
        subcategory: p.subcategory || 'Artisan Handicrafts',
        image_url: imgUrl,
        images: imagesArr,
        sizes: ['Standard'],
        stock_quantity: p.stock_quantity || 25,
        is_in_stock: p.is_in_stock !== false,
        barcode: `KALA-${Date.now().toString().slice(-6)}-${idx + 1}`,
        is_handmade: true,
        material: p.material || 'Handcrafted Natural Material',
        style: p.craft_technique || 'Traditional Indian Craft',
        ai_generated: false,
        ai_suggested_price: p.price,
        tags: p.tags || ['handicraft', 'indian', 'handmade', 'artisan'],
        artisan_id: artisanId,
        status: 'approved'
      };
    });

    const chunkSize = 20;
    let inserted = 0;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      const { data, error } = await supabase.from('products').insert(chunk).select('id');
      if (error) {
        console.error(`Error inserting chunk ${i / chunkSize + 1}:`, error.message);
      } else {
        inserted += data ? data.length : chunk.length;
        console.log(`✅ Stored chunk ${i / chunkSize + 1} (${inserted}/${rowsToInsert.length} products)`);
      }
    }
  }

  // Final check
  const { count: finalCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log(`🎉 Total products in Supabase: ${finalCount}`);
}

populateMarketplace().catch(console.error);
