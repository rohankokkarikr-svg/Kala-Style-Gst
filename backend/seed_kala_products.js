const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const { HANDICRAFT_PRODUCTS, HANDICRAFT_CATEGORIES } = require('./data/handicraftsData');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function seedKala() {
  console.log('🚀 Starting Complete Indian Handicrafts Database Seeding...');

  // 1. Delete all existing products
  console.log('🗑️  Deleting existing products & related items...');
  try {
    await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('reviews').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (err) {
    console.log('Note on dependent cleanup:', err.message);
  }

  const { error: delError } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) {
    console.warn('Notice clearing products:', delError.message);
  } else {
    console.log('✅ Cleared old products table successfully.');
  }

  // 2. Ensure Artisan profiles
  console.log('👩‍🎨 Checking/creating Master Artisan Profiles...');
  const artisanProfiles = [
    { email: 'anand.banaras@kalastyle.ai', name: 'Anand Kumar Mishra', store_name: 'Kashi Heritage Looms', specialization: 'Pure Banarasi Katan Silk & Brocade', location: 'Varanasi, Uttar Pradesh', bio: 'Master handloom artisan weaving traditional silver and gold zari motifs on pure mulberry silk.', profile_image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop' },
    { email: 'shamim.lucknow@kalastyle.ai', name: 'Shamim Begum', store_name: 'Awadh Chikankari Guild', specialization: 'Lucknowi Chikankari & Mukaish', location: 'Lucknow, Uttar Pradesh', bio: 'National award-winning artisan empowering over 200 women through fine needlecraft and shadow work.', profile_image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop' },
    { email: 'syed.channapatna@kalastyle.ai', name: 'Syed Basha', store_name: 'Channapatna Lac Craft', specialization: 'Ivory Wood & Vegetable Lac Toys', location: 'Channapatna, Karnataka', bio: 'Master artisan in the royal Toy Town of Channapatna preserving GI-protected toy craft.', profile_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop' },
    { email: 'dulari.madhubani@kalastyle.ai', name: 'Dulari Devi', store_name: 'Mithila Folk Kala Kendra', specialization: 'Madhubani & Kohbar Art', location: 'Ranti, Bihar', bio: 'Padma Shri recipient master artisan preserving 2500-year-old Mithila folk painting traditions.', profile_image: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=400&auto=format&fit=crop' },
    { email: 'ramprasad.gorakhpur@kalastyle.ai', name: 'Ramprasad Prajapati', store_name: 'Gorakhpur Terracotta Studio', specialization: 'Natural River Clay Pottery', location: 'Gorakhpur, Uttar Pradesh', bio: 'GI-tagged terracotta craftsman continuing clay vessel sculpting techniques.', profile_image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop' },
    { email: 'bipul.assam@kalastyle.ai', name: 'Bipul Saikia', store_name: 'Brahmaputra Cane & Bamboo', specialization: 'Assam Bamboo & Jute Crafts', location: 'Nalbari, Assam', bio: 'Master cane and bamboo artisan crafting sustainable zero-plastic home storage.', profile_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop' },
    { email: 'meera.jaipur@kalastyle.ai', name: 'Meera Devi', store_name: 'Jaipur Kundan & Silver Studio', specialization: 'Kundan & Meenakari Handmade Jewelry', location: 'Jaipur, Rajasthan', bio: 'Generational jeweler preserving royal Rajasthani Meenakari and hand-set Kundan gemstone adornments.', profile_image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop' },
    { email: 'rajesh.jaipur@kalastyle.ai', name: 'Rajesh Sharma', store_name: 'Jaipur Blue Art & Living', specialization: 'Handcrafted Home Décor & Blue Glaze Furnishings', location: 'Jaipur, Rajasthan', bio: 'Heritage artisan crafting artisanal lamps, decorative hangings, and living accents with traditional motifs.', profile_image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop' }
  ];

  const createdArtisanMap = {};

  for (const art of artisanProfiles) {
    let { data: existingUser } = await supabase.from('users').select('id').eq('email', art.email).maybeSingle();
    let userId = existingUser?.id;

    if (!userId) {
      const { data: newUser } = await supabase.from('users').insert([{
        name: art.name,
        email: art.email,
        password: '$2a$10$demoHashedPasswordDummyForDemo1234567890',
        role: 'artisan'
      }]).select().single();
      if (newUser) userId = newUser.id;
    }

    if (userId) {
      let { data: existingProf } = await supabase.from('artisan_profiles').select('id').eq('user_id', userId).maybeSingle();
      if (!existingProf) {
        const { data: newProf } = await supabase.from('artisan_profiles').insert([{
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
      } else {
        createdArtisanMap[art.store_name] = existingProf.id;
      }
    }
  }

  console.log('✅ Configured Master Artisans:', Object.keys(createdArtisanMap).length);

  // 3. Format and Insert All 84 Authentic Handicrafts
  console.log(`📦 Formatting ${HANDICRAFT_PRODUCTS.length} Indian Handicrafts for database insertion...`);

  const rowsToInsert = HANDICRAFT_PRODUCTS.map((p, idx) => {
    // Determine associated artisan ID
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

    return {
      name: p.name,
      description: p.description,
      price: p.price,
      original_price: p.original_price || Math.round(p.price * 1.4),
      category: p.category,
      subcategory: p.subcategory || 'Artisan Handicrafts',
      image_url: p.image_url || (p.images && p.images[0]) || '',
      sizes: ['Standard'],
      stock_quantity: p.stock_quantity || 20,
      is_in_stock: p.is_in_stock !== false,
      barcode: `KALA-${p.id ? p.id.toUpperCase().slice(0, 10) : 'HANDI'}-${idx + 1}`,
      is_handmade: true,
      material: p.material || 'Handcrafted Natural Material',
      style: p.craft_technique || 'Traditional Indian Craft',
      ai_generated: false,
      ai_suggested_price: p.price,
      tags: p.tags || ['handicraft', 'indian', 'handmade', 'artisan'],
      artisan_id: artisanId
    };
  });

  // Batch insert in chunks of 25
  const chunkSize = 25;
  let totalInserted = 0;
  for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
    const chunk = rowsToInsert.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('products').insert(chunk).select('id');
    if (error) {
      console.error(`❌ Error inserting chunk ${i / chunkSize + 1}:`, error.message);
    } else {
      totalInserted += (data ? data.length : chunk.length);
      console.log(`✅ Inserted chunk ${i / chunkSize + 1} (${totalInserted}/${rowsToInsert.length} products)`);
    }
  }

  console.log(`\n🎉 SEEDING COMPLETE! Successfully populated ${totalInserted} authentic Indian handicraft products across all 7 categories.`);
}

seedKala().catch(console.error);
