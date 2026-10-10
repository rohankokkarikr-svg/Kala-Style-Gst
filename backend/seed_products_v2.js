const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SEED_MUTATION !== 'true') {
  console.error('❌ SAFETY REFUSAL: Seed script cannot run without ALLOW_SEED_MUTATION=true and must never run in production.');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;

// ─── Config ──────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadToCloudinary(imageUrl, publicId) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder:         'style-heaven-products',
      public_id:      publicId,
      overwrite:      true,
      transformation: [{ width: 800, height: 1000, crop: 'limit', quality: 'auto' }],
    });
    console.log(`  ✅ Uploaded: ${publicId}`);
    return result.secure_url;
  } catch (err) {
    console.warn(`  ⚠️  Failed to upload ${publicId}: ${err.message}. Using original URL.`);
    return imageUrl;
  }
}

// ─── Batch 2 — 56 New Products ───────────────────────────────────────────────
const rawProducts = [

  // ══ T-SHIRTS (7 new) ══════════════════════════════════════════════════════
  {
    name: 'Washed Black Oversized Tee',
    description: 'Vintage-washed black oversized tee with a relaxed, boxy silhouette. Soft garment-dyed cotton for a lived-in aesthetic.',
    price: 479, original_price: 749, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'b2_tshirt_washed_black',
    imageUrl: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
  },
  {
    name: 'Sky Blue Terry Cloth Tee',
    description: 'Textured sky-blue terry cloth tee for a luxe casual vibe. Thick loopback fabric with ribbed crew neck.',
    price: 549, original_price: 849, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'b2_tshirt_terry_blue',
    imageUrl: 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800',
  },
  {
    name: 'Pastel Purple Acid Wash Tee',
    description: 'On-trend pastel purple acid-wash tee. Unique irregular fading makes each piece one of a kind.',
    price: 429, original_price: 699, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'b2_tshirt_purple_acid',
    imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800',
  },
  {
    name: 'Earth Tone Patchwork Tee',
    description: 'Artistic patchwork tee combining earthy tones in a relaxed regular fit. A statement piece for the creative dresser.',
    price: 599, original_price: 899, category: 'T-Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'b2_tshirt_patchwork',
    imageUrl: 'https://images.unsplash.com/photo-1503341338985-95ad5e163f34?w=800',
  },
  {
    name: 'Coral Half-Sleeve Polo',
    description: 'Fresh coral polo with a clean pique texture. Features a 2-button placket and ribbed collar for a sharp look.',
    price: 499, original_price: 749, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'b2_tshirt_coral_polo',
    imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800',
  },
  {
    name: 'Vintage College Printed Tee',
    description: 'Retro college-style printed tee in a slightly oversized fit. Distressed print adds an authentic vintage feel.',
    price: 449, original_price: 699, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'b2_tshirt_college_print',
    imageUrl: 'https://images.unsplash.com/photo-1622470953794-aa9c70b0fb9d?w=800',
  },
  {
    name: 'Tie-Dye Spiral Cotton Tee',
    description: 'Handcrafted tie-dye spiral tee in vibrant multicolour. 100% cotton, perfect for festivals and summer events.',
    price: 519, original_price: 799, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'b2_tshirt_tiedye',
    imageUrl: 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=800',
  },

  // ══ SHIRTS (7 new) ════════════════════════════════════════════════════════
  {
    name: 'Cuban Collar Camp Shirt – Ecru',
    description: 'Relaxed ecru camp shirt with a Cuban collar and all-over minimal print. Ideal for beach holidays and casual outings.',
    price: 849, original_price: 1299, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'b2_shirt_cuban_ecru',
    imageUrl: 'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=800',
  },
  {
    name: 'Burgundy Slim Formal Shirt',
    description: 'Deep burgundy slim-fit formal shirt in a stretch-cotton blend. Spread collar and French placket for a sleek finish.',
    price: 899, original_price: 1399, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'b2_shirt_burgundy_formal',
    imageUrl: 'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=800',
  },
  {
    name: 'Double Pocket Safari Shirt – Khaki',
    description: 'Classic khaki safari shirt with twin chest pockets and roll-up sleeve tabs. Lightweight cotton for warm climates.',
    price: 999, original_price: 1499, category: 'Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'b2_shirt_safari_khaki',
    imageUrl: 'https://images.unsplash.com/photo-1563630423918-b58f07336ac9?w=800',
  },
  {
    name: 'Midnight Blue Poplin Shirt',
    description: 'Smooth midnight blue poplin formal shirt. Slim fit with a point collar — pairs perfectly with dark trousers.',
    price: 799, original_price: 1199, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 65, is_in_stock: true,
    imageKey: 'b2_shirt_midnight_poplin',
    imageUrl: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800',
  },
  {
    name: 'Forest Green Linen Shirt',
    description: 'Relaxed forest-green linen shirt perfect for summer. Classic collar with a coconut button placket.',
    price: 849, original_price: 1299, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'b2_shirt_forest_linen',
    imageUrl: 'https://images.unsplash.com/photo-1590657872261-b3c57c5a1e6a?w=800',
  },
  {
    name: 'Windowpane Check Overshirt',
    description: 'Stylish windowpane-check overshirt in navy and cream. Relaxed fit to layer over tees or wear standalone.',
    price: 1049, original_price: 1599, category: 'Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'b2_shirt_windowpane',
    imageUrl: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800',
  },
  {
    name: 'Resort Print Short-Sleeve Shirt',
    description: 'Vibrant resort-print short-sleeve shirt in a relaxed fit. Coconut buttons and a chest pocket for tropical flair.',
    price: 749, original_price: 1099, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 38, is_in_stock: true,
    imageKey: 'b2_shirt_resort_print',
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800',
  },

  // ══ PANTS (7 new) ═════════════════════════════════════════════════════════
  {
    name: 'Rust Orange Slim Chinos',
    description: 'Vibrant rust-orange slim chinos made from stretch cotton. A bold colour pop for modern casual outfits.',
    price: 1099, original_price: 1699, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'b2_pants_rust_chino',
    imageUrl: 'https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=800',
  },
  {
    name: 'Slim Tapered Formal Trousers – Charcoal',
    description: 'Sleek charcoal slim-tapered formal trousers with a flat front. Subtle sheen fabric ideal for business settings.',
    price: 1299, original_price: 1999, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'b2_pants_charcoal_formal',
    imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800',
  },
  {
    name: 'Sage Green Linen Wide-Leg Pants',
    description: 'Relaxed sage-green linen wide-leg pants with an elastic waist and drawstring. Perfect for resort and beach styling.',
    price: 999, original_price: 1499, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'b2_pants_sage_linen',
    imageUrl: 'https://images.unsplash.com/photo-1479936343636-73cdc5aae0c3?w=800',
  },
  {
    name: 'Tan Cotton Cargo Pants',
    description: 'Utility tan cargo pants with six deep pockets. Relaxed straight-leg with adjustable ankle straps.',
    price: 1199, original_price: 1799, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 48, is_in_stock: true,
    imageKey: 'b2_pants_tan_cargo',
    imageUrl: 'https://images.unsplash.com/photo-1553754538-466add009c05?w=800',
  },
  {
    name: 'Pleated High-Rise Trousers – Cream',
    description: 'Elegant cream high-rise pleated trousers with a wide leg. Fashion-forward tailoring for a vintage-inspired look.',
    price: 1399, original_price: 2199, category: 'Pants',
    sizes: ['28', '30', '32', '34'], stock_quantity: 28, is_in_stock: true,
    imageKey: 'b2_pants_cream_pleated',
    imageUrl: 'https://images.unsplash.com/photo-1560060141-5f7af3a0ad28?w=800',
  },
  {
    name: 'Navy Pinstripe Trousers',
    description: 'Classic navy pinstripe dress trousers. Flat front with side pockets. Essential for corporate wardrobes.',
    price: 1249, original_price: 1899, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 42, is_in_stock: true,
    imageKey: 'b2_pants_navy_pinstripe',
    imageUrl: 'https://images.unsplash.com/photo-1519058082700-08a0b56da9b4?w=800',
  },
  {
    name: 'Fleece Lined Track Pants – Slate Grey',
    description: 'Slate-grey fleece-lined track pants with zippered side pockets and elastic cuffs. Warm and comfortable for winter.',
    price: 849, original_price: 1299, category: 'Pants',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'b2_pants_fleece_track',
    imageUrl: 'https://images.unsplash.com/photo-1550399105-c4db5fb85c18?w=800',
  },

  // ══ JEANS (7 new) ═════════════════════════════════════════════════════════
  {
    name: 'Carpenter Baggy Jeans – Medium Wash',
    description: 'On-trend carpenter-style baggy jeans with tool loop and side pocket. Medium-wash denim with a relaxed, slouchy fit.',
    price: 1499, original_price: 2299, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'b2_jeans_carpenter_baggy',
    imageUrl: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=800',
  },
  {
    name: 'Vintage Indigo Selvedge Jeans',
    description: 'Premium Japanese selvedge denim jeans in vintage indigo. Straight fit that develops beautiful fades over time.',
    price: 2499, original_price: 3999, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'b2_jeans_selvedge_indigo',
    imageUrl: 'https://images.unsplash.com/photo-1475178626620-a4d074967452?w=800',
  },
  {
    name: 'Patch Work Denim Jeans',
    description: 'Edgy patchwork denim jeans combining contrasting washes and fabrics. A conversation-starting street-style piece.',
    price: 1699, original_price: 2599, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 25, is_in_stock: true,
    imageKey: 'b2_jeans_patchwork',
    imageUrl: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=800',
  },
  {
    name: 'Dark Wash Slim Tapered Jeans',
    description: 'Clean dark-wash slim tapered jeans with a subtle fade at the thigh. Versatile enough for smart and casual occasions.',
    price: 1299, original_price: 1999, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 75, is_in_stock: true,
    imageKey: 'b2_jeans_dark_slim_tapered',
    imageUrl: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800',
  },
  {
    name: 'Washed Grey Straight Jeans',
    description: 'Casual washed-grey straight-leg jeans. Mid-rise waist and 5-pocket construction for everyday wear.',
    price: 1199, original_price: 1799, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'b2_jeans_washed_grey_straight',
    imageUrl: 'https://images.unsplash.com/photo-1548126032-079a0fb0099d?w=800',
  },
  {
    name: 'Cropped Ankle Jeans – Light Blue',
    description: 'Cropped ankle-length jeans in a fresh light-blue wash. Slim cut that shows off your footwear perfectly.',
    price: 1149, original_price: 1699, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'b2_jeans_cropped_ankle',
    imageUrl: 'https://images.unsplash.com/photo-1560243563-062bfc001d68?w=800',
  },
  {
    name: 'Mud Dye Distressed Jeans',
    description: 'Bold mud-dye distressed jeans with heavy fading and frayed details. An artistic take on classic denim.',
    price: 1399, original_price: 2099, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'b2_jeans_mud_dye',
    imageUrl: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800',
  },

  // ══ JACKETS (7 new) ═══════════════════════════════════════════════════════
  {
    name: 'Quilted Leather Biker Jacket',
    description: 'Sleek quilted faux-leather biker jacket with silver zip detailing. A rock-meets-luxury statement piece.',
    price: 3499, original_price: 5499, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'b2_jacket_quilted_biker',
    imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
  },
  {
    name: 'Waxed Cotton Moto Jacket',
    description: 'Heritage waxed-cotton motorcycle jacket with snap-button epaulettes. Aged brown wax finish develops character over time.',
    price: 2999, original_price: 4599, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 18, is_in_stock: true,
    imageKey: 'b2_jacket_waxed_moto',
    imageUrl: 'https://images.unsplash.com/photo-1592878940526-0214b0f374f6?w=800',
  },
  {
    name: 'Stone Island Inspired Harrington',
    description: 'Iconic Harrington-style jacket in a classic beige with red tartan lining. Timeless Mod silhouette.',
    price: 2199, original_price: 3299, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'b2_jacket_harrington',
    imageUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800',
  },
  {
    name: 'Colourblock Puffer Jacket – Red & Black',
    description: 'Bold colourblock puffer jacket combining red and black panels. Statement outerwear with a slim-fit silhouette.',
    price: 2799, original_price: 4299, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 25, is_in_stock: true,
    imageKey: 'b2_jacket_colorblock_puffer',
    imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800',
  },
  {
    name: 'Technical Rain Jacket – Olive',
    description: 'Fully seam-sealed technical rain jacket in olive. Breathable waterproof membrane with multiple zippered pockets.',
    price: 2499, original_price: 3799, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 32, is_in_stock: true,
    imageKey: 'b2_jacket_rain_olive',
    imageUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800',
  },
  {
    name: 'Camel Hair Overcoat',
    description: 'Luxurious camel-hair single-breasted overcoat. Peak lapels and satin-lined interior — pure elegance for winter.',
    price: 5999, original_price: 8999, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 12, is_in_stock: true,
    imageKey: 'b2_jacket_camel_hair',
    imageUrl: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800',
  },
  {
    name: 'Reversible Quilted Vest – Navy/Olive',
    description: 'Versatile reversible quilted vest — navy one side, olive the other. Lightweight warmth for layering in any season.',
    price: 1399, original_price: 2099, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'b2_jacket_reversible_vest',
    imageUrl: 'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=800',
  },

  // ══ SUITS (7 new) ═════════════════════════════════════════════════════════
  {
    name: 'Sage Green Linen Summer Suit',
    description: 'Fresh sage-green linen 2-piece summer suit. Unstructured jacket and flat-front trousers — effortlessly elegant.',
    price: 5499, original_price: 7999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 14, is_in_stock: true,
    imageKey: 'b2_suit_sage_linen',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800',
  },
  {
    name: 'Black Double-Breasted Power Suit',
    description: 'Sharp black double-breasted 2-piece suit with peak lapels. Authority-commanding design for boardrooms and events.',
    price: 7499, original_price: 10999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 10, is_in_stock: true,
    imageKey: 'b2_suit_black_db',
    imageUrl: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800',
  },
  {
    name: 'Ivory Bandhgala Wedding Suit',
    description: 'Regal ivory 3-piece Bandhgala suit with subtle brocade detailing. Crafted for Indian weddings and reception events.',
    price: 8999, original_price: 13999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 8, is_in_stock: true,
    imageKey: 'b2_suit_ivory_bandhgala',
    imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800',
  },
  {
    name: 'Slate Grey Windowpane Suit',
    description: 'Sophisticated slate-grey windowpane check 2-piece suit. A subtle pattern that commands attention in any room.',
    price: 6499, original_price: 9499, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 12, is_in_stock: true,
    imageKey: 'b2_suit_slate_windowpane',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  },
  {
    name: 'Cobalt Blue Wedding Suit',
    description: 'Vibrant cobalt blue 2-piece wedding suit. Notch lapel jacket with slim trousers — bold yet refined.',
    price: 6999, original_price: 10499, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 10, is_in_stock: true,
    imageKey: 'b2_suit_cobalt_wedding',
    imageUrl: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=800',
  },
  {
    name: 'Khaki Cotton Casual Suit',
    description: 'Relaxed khaki cotton casual suit. Unlined jacket with patch pockets and straight-cut trousers — smart casual at its best.',
    price: 4999, original_price: 7499, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 16, is_in_stock: true,
    imageKey: 'b2_suit_khaki_casual',
    imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800',
  },
  {
    name: 'Emerald Green Velvet Blazer Suit',
    description: 'Show-stopping emerald green velvet blazer paired with black slim trousers. Festive-season dressing at its finest.',
    price: 7999, original_price: 11999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 8, is_in_stock: true,
    imageKey: 'b2_suit_emerald_velvet',
    imageUrl: 'https://images.unsplash.com/photo-1590677872278-c4e6b6ccee02?w=800',
  },

  // ══ KURTAS (7 new) ════════════════════════════════════════════════════════
  {
    name: 'Off-White Khadi Cotton Kurta',
    description: 'Handspun khadi cotton kurta in off-white. A tribute to sustainable Indian craft, with a natural textured finish.',
    price: 999, original_price: 1499, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'b2_kurta_khadi_offwhite',
    imageUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=800',
  },
  {
    name: 'Royal Blue Embroidered Sherwani Kurta',
    description: 'Majestic royal blue kurta with silver embroidery on the neckline and cuffs. Perfect for festive celebrations.',
    price: 2499, original_price: 3999, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'b2_kurta_royal_sherwani',
    imageUrl: 'https://images.unsplash.com/photo-1583391733956-62e01ef05de1?w=800',
  },
  {
    name: 'Teal Mughal Print Kurta',
    description: 'Teal cotton kurta with Mughal-inspired all-over block print. Relaxed A-line silhouette for easy, ethnic dressing.',
    price: 1199, original_price: 1799, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 38, is_in_stock: true,
    imageKey: 'b2_kurta_teal_mughal',
    imageUrl: 'https://images.unsplash.com/photo-1609257373648-6a3c0f6e6b40?w=800',
  },
  {
    name: 'Saffron Festive Silk Kurta',
    description: 'Vibrant saffron silk-blend kurta for Diwali and festive occasions. Subtle gold woven border along the hem.',
    price: 1999, original_price: 3199, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 22, is_in_stock: true,
    imageKey: 'b2_kurta_saffron_silk',
    imageUrl: 'https://images.unsplash.com/photo-1607748851687-ba9a10438621?w=800',
  },
  {
    name: 'Dusty Pink Mirror Work Kurta',
    description: 'Contemporary dusty pink kurta with Rajasthani mirror-work embroidery. Fusion of traditional craft and modern cut.',
    price: 1599, original_price: 2499, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 18, is_in_stock: true,
    imageKey: 'b2_kurta_pink_mirror',
    imageUrl: 'https://images.unsplash.com/photo-1588117472013-59bb134f8029?w=800',
  },
  {
    name: 'Charcoal Grey Angrakha Kurta',
    description: 'Elegant charcoal angrakha-style kurta with asymmetric hem and tie closure. Modern ethnic wear at its best.',
    price: 1799, original_price: 2799, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 15, is_in_stock: true,
    imageKey: 'b2_kurta_charcoal_angrakha',
    imageUrl: 'https://images.unsplash.com/photo-1617375407361-c25be6a6d7f0?w=800',
  },
  {
    name: 'Lemon Yellow Embroidered Nehru Kurta',
    description: 'Lemon yellow Nehru-collar kurta with white thread embroidery. A fresh festive choice for day events and celebrations.',
    price: 1299, original_price: 1999, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 28, is_in_stock: true,
    imageKey: 'b2_kurta_lemon_nehru',
    imageUrl: 'https://images.unsplash.com/photo-1611601322175-ef8ec8c85f01?w=800',
  },

  // ══ ACCESSORIES (7 new) ═══════════════════════════════════════════════════
  {
    name: 'Tan Leather Chelsea Boots',
    description: 'Classic tan leather Chelsea boots with elastic gore sides and block heel. Timeless British style for every season.',
    price: 3499, original_price: 5499, category: 'Accessories',
    sizes: ['6', '7', '8', '9', '10', '11'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'b2_acc_chelsea_boots_tan',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
  },
  {
    name: 'Titanium Mechanical Wristwatch',
    description: 'Sleek titanium-cased automatic mechanical watch with a sapphire crystal face. Refined everyday luxury.',
    price: 4999, original_price: 7999, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'b2_acc_titanium_watch',
    imageUrl: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800',
  },
  {
    name: 'Structured Canvas Tote Bag',
    description: 'Heavy-duty structured canvas tote in charcoal with leather handles. Fits a 15" laptop — the perfect everyday carry.',
    price: 1299, original_price: 1999, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'b2_acc_canvas_tote',
    imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
  },
  {
    name: 'Merino Wool Gloves – Charcoal',
    description: 'Luxurious merino wool knit gloves in charcoal with leather palm patches. Smartphone-touch fingertip compatible.',
    price: 349, original_price: 599, category: 'Accessories',
    sizes: ['S/M', 'L/XL'], stock_quantity: 65, is_in_stock: true,
    imageKey: 'b2_acc_merino_gloves',
    imageUrl: 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=800',
  },
  {
    name: 'Patterned Silk Tie – Forest Paisley',
    description: 'Handmade forest-green paisley silk tie with a subtle sheen. Perfect with navy or charcoal formal shirts.',
    price: 449, original_price: 799, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'b2_acc_silk_tie_paisley',
    imageUrl: 'https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=800',
  },
  {
    name: 'Woven Leather Card Holder',
    description: 'Compact woven-leather card holder with 6 card slots and a centre cash pocket. RFID blocking for security.',
    price: 399, original_price: 699, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 85, is_in_stock: true,
    imageKey: 'b2_acc_card_holder',
    imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
  },
  {
    name: 'Suede Desert Boots – Camel',
    description: 'Soft suede Chukka desert boots in camel. Crepe rubber sole for comfort and a relaxed, casual elegance.',
    price: 2999, original_price: 4499, category: 'Accessories',
    sizes: ['6', '7', '8', '9', '10', '11', '12'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'b2_acc_desert_boots_camel',
    imageUrl: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800',
  },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Style Heaven — Batch 2 Product Seeder');
  console.log(`📦 Products to add: ${rawProducts.length}`);
  console.log('☁️  Uploading images to Cloudinary...\n');

  const products = [];
  let uploadedCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < rawProducts.length; i++) {
    const p = rawProducts[i];
    console.log(`[${i + 1}/${rawProducts.length}] Processing: ${p.name}`);

    const cloudinaryUrl = await uploadToCloudinary(p.imageUrl, p.imageKey);
    if (cloudinaryUrl !== p.imageUrl) uploadedCount++;
    else fallbackCount++;

    products.push({
      name:           p.name,
      description:    p.description,
      price:          p.price,
      original_price: p.original_price,
      category:       p.category,
      sizes:          p.sizes,
      image_url:      cloudinaryUrl,
      barcode:        `SH${Date.now().toString().slice(-8)}${i}`,
      stock_quantity: p.stock_quantity,
      is_in_stock:    p.is_in_stock,
    });

    await sleep(300);
  }

  console.log('\n💾 Inserting products into Supabase...');

  const BATCH_SIZE = 20;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('products').insert(batch).select();

    if (error) {
      console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      failCount += batch.length;
    } else {
      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${data.length} products`);
      successCount += data.length;
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('🎉 Batch 2 Seeding Complete!');
  console.log(`  ✅ Inserted:      ${successCount} products`);
  console.log(`  ☁️  Cloudinary:   ${uploadedCount} uploaded | ${fallbackCount} fallback URLs`);
  if (failCount > 0) console.log(`  ❌ DB Failures:   ${failCount}`);
  console.log('═══════════════════════════════════════════');

  // Report grand total
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  console.log(`\n📊 Grand Total Products in Database: ${count ?? 'check Supabase dashboard'}`);
}

seed().catch((err) => {
  console.error('💥 Fatal seeder error:', err);
  process.exit(1);
});
