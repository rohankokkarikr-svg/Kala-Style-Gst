const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SEED_MUTATION !== 'true') {
  console.error('❌ SAFETY REFUSAL: Seed script cannot run without ALLOW_SEED_MUTATION=true and must never run in production.');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadToCloudinary(imageUrl, publicId) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'style-heaven-products',
      public_id: publicId,
      overwrite: true,
      transformation: [{ width: 800, height: 1000, crop: 'limit', quality: 'auto' }],
    });
    console.log(`  ✅ Uploaded: ${publicId}`);
    return result.secure_url;
  } catch (err) {
    console.warn(`  ⚠️  Failed to upload ${publicId}: ${err.message}. Using original URL.`);
    return imageUrl; // fallback to original URL
  }
}

// ─── Product Definitions ─────────────────────────────────────────────────────
// Categories: t-shirts, shirts, pants, jeans, jackets, suits, kurtas, accessories
// Images are sourced from Unsplash (free, no-auth, high quality)

const rawProducts = [
  // ── T-SHIRTS (18 products) ──────────────────────────────────────────────
  {
    name: 'Classic White Crew Neck T-Shirt',
    description: 'A timeless white crew neck tee crafted from 100% premium cotton. Breathable, soft, and perfect for everyday wear.',
    price: 299, original_price: 499, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 120, is_in_stock: true,
    imageKey: 'tshirt_white_crew',
    imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
  },
  {
    name: 'Midnight Black Graphic Tee',
    description: 'Bold graphic print on a soft black tee. Made from combed cotton for superior comfort. Street-style ready.',
    price: 399, original_price: 599, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 80, is_in_stock: true,
    imageKey: 'tshirt_black_graphic',
    imageUrl: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800',
  },
  {
    name: 'Navy Blue Polo T-Shirt',
    description: 'Premium navy blue polo with a clean collar design. Ideal for casual outings and smart-casual occasions.',
    price: 499, original_price: 799, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 90, is_in_stock: true,
    imageKey: 'tshirt_navy_polo',
    imageUrl: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=800',
  },
  {
    name: 'Olive Green Henley T-Shirt',
    description: 'Stylish Henley collar tee in earthy olive green. Features a 3-button placket for a modern look.',
    price: 449, original_price: 649, category: 'T-Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'tshirt_olive_henley',
    imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800',
  },
  {
    name: 'Striped Half-Sleeve T-Shirt',
    description: 'Classic horizontal stripes in navy and white. Lightweight fabric, perfect for summer days.',
    price: 349, original_price: 549, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 75, is_in_stock: true,
    imageKey: 'tshirt_striped',
    imageUrl: 'https://images.unsplash.com/photo-1622470953794-aa9c70b0fb9d?w=800',
  },
  {
    name: 'Burgundy Slim Fit Tee',
    description: 'Slim-fit tee in rich burgundy. Stretchy fabric ensures a comfortable, form-flattering fit.',
    price: 399, original_price: 599, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'tshirt_burgundy',
    imageUrl: 'https://images.unsplash.com/photo-1527719327859-c6ce80353573?w=800',
  },
  {
    name: 'Grey Melange Round Neck Tee',
    description: 'Versatile grey melange round neck tee. Pairs with anything, perfect for layering or standalone wear.',
    price: 279, original_price: 449, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'], stock_quantity: 150, is_in_stock: true,
    imageKey: 'tshirt_grey_melange',
    imageUrl: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800',
  },
  {
    name: 'Tropical Print Summer Tee',
    description: 'Vibrant tropical print tee, perfect for beach outings and casual summer events. Lightweight and breezy.',
    price: 429, original_price: 699, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'tshirt_tropical',
    imageUrl: 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=800',
  },
  {
    name: 'V-Neck Cotton T-Shirt – White',
    description: 'Clean white V-neck tee in 100% combed cotton. Ideal for both layering under shirts or solo wear.',
    price: 319, original_price: 499, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 100, is_in_stock: true,
    imageKey: 'tshirt_vneck_white',
    imageUrl: 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=800',
  },
  {
    name: 'Printed Oversized Drop-Shoulder Tee',
    description: 'Trendy oversized drop-shoulder tee with minimal print. Street-style staple for the modern man.',
    price: 549, original_price: 799, category: 'T-Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'tshirt_oversized',
    imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=800',
  },
  {
    name: 'Yellow Solid Polo',
    description: 'Bright yellow polo tee with ribbed collar and cuffs. A pop of colour for your casual wardrobe.',
    price: 479, original_price: 699, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'tshirt_yellow_polo',
    imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800',
  },
  {
    name: 'Raglan Baseball Tee',
    description: 'Classic raglan sleeve baseball tee in white body with contrasting navy sleeves. Sporty yet casual.',
    price: 369, original_price: 549, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 65, is_in_stock: true,
    imageKey: 'tshirt_raglan',
    imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
  },
  {
    name: 'Red Solid Round Neck Tee',
    description: 'Bold red solid tee in a comfortable round neck style. Made from breathable jersey cotton.',
    price: 299, original_price: 449, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 80, is_in_stock: true,
    imageKey: 'tshirt_red',
    imageUrl: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800',
  },
  {
    name: 'Charcoal Crew Neck Long Sleeve',
    description: 'Charcoal long-sleeve crew neck tee perfect for transitional weather. Soft brushed interior for warmth.',
    price: 499, original_price: 749, category: 'T-Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'tshirt_charcoal_long',
    imageUrl: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800',
  },
  {
    name: 'Abstract Art Print Tee',
    description: 'Unique abstract art printed tee. Limited-edition design on premium cotton. For the fashion-forward man.',
    price: 599, original_price: 899, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'tshirt_abstract',
    imageUrl: 'https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=800',
  },
  {
    name: 'Sky Blue Linen T-Shirt',
    description: 'Breathable sky blue linen-blend tee for hot summer days. Relaxed fit with a washed texture finish.',
    price: 459, original_price: 699, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'tshirt_linen_blue',
    imageUrl: 'https://images.unsplash.com/photo-1516762689617-e1cffcef479d?w=800',
  },
  {
    name: 'Dark Green Typography Tee',
    description: 'Dark forest green tee with embossed typography on the chest. Minimal yet impactful design.',
    price: 429, original_price: 649, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 48, is_in_stock: true,
    imageKey: 'tshirt_typography_green',
    imageUrl: 'https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=800',
  },
  {
    name: 'Muscle Fit Gym Tee – Black',
    description: 'Performance muscle-fit gym tee in black. Moisture-wicking fabric, perfect for workouts and training.',
    price: 349, original_price: 549, category: 'T-Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 90, is_in_stock: true,
    imageKey: 'tshirt_muscle_gym',
    imageUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
  },

  // ── SHIRTS (18 products) ────────────────────────────────────────────────
  {
    name: 'White Oxford Formal Shirt',
    description: 'Crisp white Oxford shirt with a button-down collar. Tailored fit, perfect for office and formal occasions.',
    price: 799, original_price: 1199, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'shirt_white_oxford',
    imageUrl: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800',
  },
  {
    name: 'Sky Blue Slim Fit Formal Shirt',
    description: 'Light sky blue slim-fit formal shirt with a spread collar. Wrinkle-resistant fabric for all-day freshness.',
    price: 849, original_price: 1299, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'shirt_skyblue_formal',
    imageUrl: 'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=800',
  },
  {
    name: 'Floral Print Casual Shirt',
    description: 'Vibrant floral print on a relaxed-fit shirt. Short sleeves and a camp collar — perfect for summer outings.',
    price: 699, original_price: 999, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'shirt_floral_casual',
    imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4b984d?w=800',
  },
  {
    name: 'Denim Chambray Shirt',
    description: 'Versatile denim chambray shirt. Wear it buttoned up, as a layering piece, or half-tucked for casual cool.',
    price: 899, original_price: 1399, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'shirt_denim_chambray',
    imageUrl: 'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=800',
  },
  {
    name: 'Black Linen Casual Shirt',
    description: 'Solid black linen shirt for warm weather. Relaxed fit with mother-of-pearl buttons and patch pocket.',
    price: 799, original_price: 1199, category: 'Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'shirt_black_linen',
    imageUrl: 'https://images.unsplash.com/photo-1590657872261-b3c57c5a1e6a?w=800',
  },
  {
    name: 'Check Print Flannel Shirt',
    description: 'Classic check flannel shirt in warm earth tones. Soft brushed fabric ideal for winter layers.',
    price: 949, original_price: 1499, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'shirt_flannel_check',
    imageUrl: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800',
  },
  {
    name: 'Mandarin Collar Cotton Shirt',
    description: 'Elegant mandarin-collar shirt in white cotton. Minimalist design with clean lines for a polished look.',
    price: 849, original_price: 1299, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'shirt_mandarin_white',
    imageUrl: 'https://images.unsplash.com/photo-1563630423918-b58f07336ac9?w=800',
  },
  {
    name: 'Olive Safari Shirt',
    description: 'Military-inspired olive safari shirt with large chest pockets and epaulettes. Rugged yet stylish.',
    price: 999, original_price: 1599, category: 'Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'shirt_safari_olive',
    imageUrl: 'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=800',
  },
  {
    name: 'Pink Herringbone Formal Shirt',
    description: 'Pale pink herringbone weave formal shirt. A subtle pattern that elevates any office ensemble.',
    price: 899, original_price: 1399, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 42, is_in_stock: true,
    imageKey: 'shirt_pink_herringbone',
    imageUrl: 'https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?w=800',
  },
  {
    name: 'Batik Print Vacation Shirt',
    description: 'Artistic batik-inspired print on a relaxed-fit shirt. Perfect for holidays and beach vacations.',
    price: 749, original_price: 1099, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 38, is_in_stock: true,
    imageKey: 'shirt_batik_vacation',
    imageUrl: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800',
  },
  {
    name: 'Dark Navy Slim Formal Shirt',
    description: 'Deep navy slim-fit formal shirt. Pairs effortlessly with grey or black trousers for a sharp look.',
    price: 849, original_price: 1299, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'shirt_navy_slim',
    imageUrl: 'https://images.unsplash.com/photo-1548769240-8d424cdcaddb?w=800',
  },
  {
    name: 'Geometric Print Short-Sleeve Shirt',
    description: 'Bold geometric print on a short-sleeve shirt. Makes a statement at parties and casual outings.',
    price: 699, original_price: 999, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'shirt_geometric_print',
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800',
  },
  {
    name: 'White Linen Half-Sleeve Shirt',
    description: 'Pure linen half-sleeve shirt in off-white. Lightweight and breathable — summer essential.',
    price: 799, original_price: 1199, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 65, is_in_stock: true,
    imageKey: 'shirt_white_linen_half',
    imageUrl: 'https://images.unsplash.com/photo-1609234656388-0ff363383899?w=800',
  },
  {
    name: 'Satin Finish Party Shirt – Charcoal',
    description: 'Charcoal satin-finish shirt for parties and night-outs. Slim fit with a subtle sheen for a luxe look.',
    price: 1099, original_price: 1699, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 25, is_in_stock: true,
    imageKey: 'shirt_satin_charcoal',
    imageUrl: 'https://images.unsplash.com/photo-1593032465175-481ac7f401a0?w=800',
  },
  {
    name: 'Indigo Dip-Dye Casual Shirt',
    description: 'Artisan indigo dip-dye casual shirt. Each piece is uniquely different. Relaxed and washed finish.',
    price: 849, original_price: 1249, category: 'Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 28, is_in_stock: true,
    imageKey: 'shirt_indigo_dipdye',
    imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
  },
  {
    name: 'Terracotta Ethnic Printed Shirt',
    description: 'Terracotta-toned ethnic printed cotton shirt. Block-print motifs inspired by Rajasthani craft.',
    price: 749, original_price: 1099, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'shirt_terracotta_ethnic',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800',
  },
  {
    name: 'Houndstooth Pattern Formal Shirt',
    description: 'Classic houndstooth pattern formal shirt in black and white. Timeless check design for professional settings.',
    price: 949, original_price: 1399, category: 'Shirts',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 32, is_in_stock: true,
    imageKey: 'shirt_houndstooth',
    imageUrl: 'https://images.unsplash.com/photo-1510020965881-3bfb0f3f62f1?w=800',
  },
  {
    name: 'Corduroy Overshirt – Brown',
    description: 'Warm corduroy overshirt in rich brown. Chest pockets and a relaxed fit — great as a layering piece.',
    price: 1099, original_price: 1699, category: 'Shirts',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 22, is_in_stock: true,
    imageKey: 'shirt_corduroy_brown',
    imageUrl: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800',
  },

  // ── PANTS (14 products) ─────────────────────────────────────────────────
  {
    name: 'Black Slim Fit Chino Pants',
    description: 'Clean-cut black chino pants with a slim silhouette. Stretch fabric for all-day comfort and flexibility.',
    price: 999, original_price: 1499, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'pants_black_chino',
    imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800',
  },
  {
    name: 'Khaki Relaxed Fit Chinos',
    description: 'Classic khaki chinos with a relaxed fit and mid-rise waist. Weekend-perfect with loafers or sneakers.',
    price: 1099, original_price: 1699, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'pants_khaki_chino',
    imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800',
  },
  {
    name: 'Navy Blue Formal Trousers',
    description: 'Tailored navy blue formal trousers with a flat front and clean drape. Ideal for office and business wear.',
    price: 1299, original_price: 1999, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'pants_navy_formal',
    imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800',
  },
  {
    name: 'Olive Cargo Pants',
    description: 'Rugged olive cargo pants with multi-pocket design. Straight leg and drawstring waist for utility style.',
    price: 1199, original_price: 1799, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'pants_olive_cargo',
    imageUrl: 'https://images.unsplash.com/photo-1553754538-466add009c05?w=800',
  },
  {
    name: 'Grey Slim Formal Trousers',
    description: 'Sharply tailored grey trousers in a slim fit. Goes with blazers, shirts, and formal shoes for a crisp look.',
    price: 1199, original_price: 1799, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'pants_grey_formal',
    imageUrl: 'https://images.unsplash.com/photo-1560060141-5f7af3a0ad28?w=800',
  },
  {
    name: 'White Linen Trousers',
    description: 'Breezy white linen trousers for summer. Wide-leg silhouette, ideal for beach days and casual dining.',
    price: 999, original_price: 1499, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'pants_white_linen',
    imageUrl: 'https://images.unsplash.com/photo-1479936343636-73cdc5aae0c3?w=800',
  },
  {
    name: 'Camel Wool Blend Trousers',
    description: 'Luxurious camel wool-blend trousers for winter. Tailored cut with a warm drape and side-adjusters.',
    price: 1799, original_price: 2799, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 25, is_in_stock: true,
    imageKey: 'pants_camel_wool',
    imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800',
  },
  {
    name: 'Mint Green Chino Pants',
    description: 'Fresh mint green chinos for a vibrant warm-weather look. Slim fit with a slightly tapered leg.',
    price: 999, original_price: 1499, category: 'Pants',
    sizes: ['28', '30', '32', '34'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'pants_mint_chino',
    imageUrl: 'https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=800',
  },
  {
    name: 'Charcoal Jogger Track Pants',
    description: 'Comfortable charcoal jogger pants with elastic waist and drawstring. Great for workouts and lounging.',
    price: 799, original_price: 1199, category: 'Pants',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 80, is_in_stock: true,
    imageKey: 'pants_charcoal_jogger',
    imageUrl: 'https://images.unsplash.com/photo-1550399105-c4db5fb85c18?w=800',
  },
  {
    name: 'Brown Corduroy Pants',
    description: 'Warm brown corduroy pants with a classic ribbed texture. Straight-cut and mid-rise for a retro vibe.',
    price: 1299, original_price: 1999, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'pants_brown_corduroy',
    imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
  },
  {
    name: 'Burgundy Slim Chinos',
    description: 'Bold burgundy slim-fit chinos. A rich colour that works for both casual and smart-casual occasions.',
    price: 1099, original_price: 1599, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'pants_burgundy_chino',
    imageUrl: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800',
  },
  {
    name: 'Beige Linen Pants',
    description: 'Relaxed beige linen pants for laid-back summer style. Breathable natural fabric with a drawstring waist.',
    price: 899, original_price: 1399, category: 'Pants',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'pants_beige_linen',
    imageUrl: 'https://images.unsplash.com/photo-1561365452-adb940139ffa?w=800',
  },
  {
    name: 'Plaid Tartan Trousers',
    description: 'Fashion-forward plaid tartan trousers in earthy tones. Wide-leg fit with a high-rise waist.',
    price: 1399, original_price: 2099, category: 'Pants',
    sizes: ['28', '30', '32', '34'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'pants_plaid_tartan',
    imageUrl: 'https://images.unsplash.com/photo-1519058082700-08a0b56da9b4?w=800',
  },
  {
    name: 'Athletic Sweatpants – Black',
    description: 'High-performance athletic sweatpants with zippered pockets. Moisture-wicking fleece for training sessions.',
    price: 899, original_price: 1299, category: 'Pants',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 75, is_in_stock: true,
    imageKey: 'pants_athletic_sweat',
    imageUrl: 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?w=800',
  },

  // ── JEANS (14 products) ─────────────────────────────────────────────────
  {
    name: 'Classic Blue Slim Fit Jeans',
    description: 'Iconic medium-wash blue slim-fit jeans. Stretchy denim for a comfortable, body-flattering cut.',
    price: 1299, original_price: 1999, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 100, is_in_stock: true,
    imageKey: 'jeans_blue_slim',
    imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800',
  },
  {
    name: 'Black Raw Denim Jeans',
    description: 'Sleek black raw-denim jeans with a clean silhouette. Minimal fading for a refined, polished look.',
    price: 1499, original_price: 2299, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 65, is_in_stock: true,
    imageKey: 'jeans_black_raw',
    imageUrl: 'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=800',
  },
  {
    name: 'Light Wash Distressed Jeans',
    description: 'On-trend light-wash distressed jeans with ripped knee detailing. Effortlessly casual and youthful.',
    price: 1199, original_price: 1899, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'jeans_light_distressed',
    imageUrl: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=800',
  },
  {
    name: 'Dark Navy Straight Leg Jeans',
    description: 'Deep dark navy straight-leg jeans. Versatile enough to dress up with a blazer or down with a tee.',
    price: 1399, original_price: 2099, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36', '38'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'jeans_dark_navy_straight',
    imageUrl: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800',
  },
  {
    name: 'Grey Melange Denim Jeans',
    description: 'Unique grey melange denim with a smooth, modern wash. Slim fit and zip-fly construction.',
    price: 1299, original_price: 1999, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'jeans_grey_melange',
    imageUrl: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=800',
  },
  {
    name: 'Acid Wash Blue Jeans',
    description: 'Retro acid-wash denim jeans with a distinctive faded pattern. Regular fit with a vintage appeal.',
    price: 1199, original_price: 1799, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'jeans_acid_wash',
    imageUrl: 'https://images.unsplash.com/photo-1548126032-079a0fb0099d?w=800',
  },
  {
    name: 'Skinny Fit Dark Wash Jeans',
    description: 'Body-hugging skinny fit dark wash jeans. Super-stretch denim ensures maximum comfort and mobility.',
    price: 1099, original_price: 1699, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'jeans_skinny_dark',
    imageUrl: 'https://images.unsplash.com/photo-1475178626620-a4d074967452?w=800',
  },
  {
    name: 'Wide Leg Retro Denim',
    description: 'Fashion-forward wide-leg denim in a mid-indigo wash. High-rise cut with a relaxed, flowy silhouette.',
    price: 1599, original_price: 2499, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'jeans_wide_leg_retro',
    imageUrl: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800',
  },
  {
    name: 'Jogger Style Denim – Blue',
    description: 'Innovative jogger-style denim with elastic cuffs and waistband. The comfort of joggers meets denim style.',
    price: 1199, original_price: 1799, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 48, is_in_stock: true,
    imageKey: 'jeans_jogger_blue',
    imageUrl: 'https://images.unsplash.com/photo-1582418702059-97ebafb35d09?w=800',
  },
  {
    name: 'Coloured Jeans – Brick Red',
    description: 'Statement brick-red coloured jeans. Slim silhouette with a stretch twill feel. Bold casual wear.',
    price: 1199, original_price: 1799, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 32, is_in_stock: true,
    imageKey: 'jeans_brick_red',
    imageUrl: 'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=800',
  },
  {
    name: 'Indigo Classic Regular Fit Jeans',
    description: 'No-fuss classic indigo regular-fit jeans. Traditional 5-pocket construction with sturdy denim.',
    price: 1099, original_price: 1699, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36', '38', '40'], stock_quantity: 90, is_in_stock: true,
    imageKey: 'jeans_indigo_regular',
    imageUrl: 'https://images.unsplash.com/photo-1555689502-c4b22d76c56f?w=800',
  },
  {
    name: 'Bleached White Denim Jeans',
    description: 'Head-turning bleached white denim jeans. Slim cut with a clean, modern aesthetic. Summer essential.',
    price: 1299, original_price: 1999, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 28, is_in_stock: true,
    imageKey: 'jeans_bleached_white',
    imageUrl: 'https://images.unsplash.com/photo-1560243563-062bfc001d68?w=800',
  },
  {
    name: 'Black Skinny Ripped Jeans',
    description: 'Edgy black skinny jeans with strategic rips at the knees. Rock-and-roll attitude meets urban street style.',
    price: 1249, original_price: 1899, category: 'Jeans',
    sizes: ['28', '30', '32', '34'], stock_quantity: 42, is_in_stock: true,
    imageKey: 'jeans_black_ripped',
    imageUrl: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800',
  },
  {
    name: 'Stone Wash Vintage Jeans',
    description: 'Classic stone-wash vintage jeans with a faded, lived-in look. Regular fit that ages beautifully.',
    price: 1199, original_price: 1799, category: 'Jeans',
    sizes: ['28', '30', '32', '34', '36'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'jeans_stone_wash',
    imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800',
  },

  // ── JACKETS (14 products) ───────────────────────────────────────────────
  {
    name: 'Classic Black Leather Jacket',
    description: 'Iconic black faux-leather biker jacket with silver hardware. Slim fit with a zip closure — a wardrobe staple.',
    price: 2999, original_price: 4999, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'jacket_black_leather',
    imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
  },
  {
    name: 'Navy Blue Puffer Jacket',
    description: 'Warm navy blue quilted puffer jacket with a lightweight down-fill. Packable design for travel convenience.',
    price: 2499, original_price: 3999, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'jacket_navy_puffer',
    imageUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800',
  },
  {
    name: 'Olive Military Field Jacket',
    description: 'Rugged olive-green military-inspired field jacket with multiple pockets. Warm cotton-blend with a drawstring hem.',
    price: 2199, original_price: 3499, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'jacket_olive_military',
    imageUrl: 'https://images.unsplash.com/photo-1592878940526-0214b0f374f6?w=800',
  },
  {
    name: 'Camel Overcoat Jacket',
    description: 'Elegant camel-colored wool-blend overcoat. Double-breasted design with peak lapels for a refined look.',
    price: 3999, original_price: 5999, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'jacket_camel_overcoat',
    imageUrl: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800',
  },
  {
    name: 'Denim Blue Trucker Jacket',
    description: 'Classic denim trucker jacket in mid-wash blue. Relaxed fit with chest flap pockets. A timeless piece.',
    price: 1799, original_price: 2799, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'jacket_denim_trucker',
    imageUrl: 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800',
  },
  {
    name: 'Grey Fleece Zip-Up Jacket',
    description: 'Cozy grey fleece zip-up jacket perfect for cold evenings. Anti-pill fleece with zippered side pockets.',
    price: 1299, original_price: 1999, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 65, is_in_stock: true,
    imageKey: 'jacket_grey_fleece',
    imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800',
  },
  {
    name: 'Bomber Jacket – Black',
    description: 'Sleek black MA-1 bomber jacket with ribbed collar, cuffs, and hem. A versatile streetwear essential.',
    price: 2299, original_price: 3499, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'jacket_bomber_black',
    imageUrl: 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=800',
  },
  {
    name: 'Brown Suede Casual Jacket',
    description: 'Rich brown suede-finish casual jacket with a relaxed silhouette. Lined interior for added warmth.',
    price: 2799, original_price: 4299, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 22, is_in_stock: true,
    imageKey: 'jacket_brown_suede',
    imageUrl: 'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=800',
  },
  {
    name: 'Windbreaker Jacket – Royal Blue',
    description: 'Lightweight royal blue windbreaker with a packable design. Water-resistant shell for unpredictable weather.',
    price: 1599, original_price: 2499, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'jacket_windbreaker_blue',
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800',
  },
  {
    name: 'Plaid Wool Blazer Jacket',
    description: 'Smart plaid wool blazer jacket in earthy tones. Notched lapels and two-button front for a classic look.',
    price: 3299, original_price: 4999, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 18, is_in_stock: true,
    imageKey: 'jacket_plaid_blazer',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  },
  {
    name: 'Quilted Puffer Vest – Grey',
    description: 'Sleeveless grey quilted puffer vest for layering. Lightweight yet warm — ideal for cool autumn days.',
    price: 1199, original_price: 1799, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'jacket_puffer_vest_grey',
    imageUrl: 'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=800',
  },
  {
    name: 'Cream Sherpa Fleece Jacket',
    description: 'Plush cream sherpa fleece jacket with a zip-through design. Ultra-cozy for winter comfort at home or outdoors.',
    price: 1799, original_price: 2799, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 32, is_in_stock: true,
    imageKey: 'jacket_cream_sherpa',
    imageUrl: 'https://images.unsplash.com/photo-1516826957135-700dedea698c?w=800',
  },
  {
    name: 'Trench Coat – Beige',
    description: 'Sophisticated beige double-breasted trench coat. Belted waist and storm flap for classic British style.',
    price: 4999, original_price: 7499, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 15, is_in_stock: true,
    imageKey: 'jacket_trench_beige',
    imageUrl: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800',
  },
  {
    name: 'Varsity Letterman Jacket',
    description: 'Collegiate varsity letterman jacket with contrasting sleeves and ribbed trim. School-spirit style meets streetwear.',
    price: 2499, original_price: 3799, category: 'Jackets',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 28, is_in_stock: true,
    imageKey: 'jacket_varsity_letterman',
    imageUrl: 'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?w=800',
  },

  // ── SUITS (8 products) ──────────────────────────────────────────────────
  {
    name: 'Midnight Blue 3-Piece Suit',
    description: 'Premium midnight blue 3-piece suit: jacket, trousers, and waistcoat. Tailored fit in Italian wool-blend fabric.',
    price: 6999, original_price: 9999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 15, is_in_stock: true,
    imageKey: 'suit_midnight_blue_3piece',
    imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4b984d?w=800',
  },
  {
    name: 'Charcoal Grey 2-Piece Suit',
    description: 'Classic charcoal grey 2-piece suit. Notched lapels and single-breasted jacket. Timeless corporate wear.',
    price: 5499, original_price: 7999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'suit_charcoal_2piece',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  },
  {
    name: 'Black Slim Fit Tuxedo Suit',
    description: 'Sleek black tuxedo suit with satin lapels. Slim cut for a sharp, modern silhouette at black-tie events.',
    price: 7999, original_price: 11999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 10, is_in_stock: true,
    imageKey: 'suit_black_tuxedo',
    imageUrl: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=800',
  },
  {
    name: 'Light Grey Summer Suit',
    description: 'Lightweight light grey summer suit in a breathable linen-wool blend. Perfect for weddings and outdoor events.',
    price: 5999, original_price: 8999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 18, is_in_stock: true,
    imageKey: 'suit_light_grey_summer',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800',
  },
  {
    name: 'Navy Pinstripe Suit',
    description: 'Authoritative navy pinstripe suit with double-breasted jacket. Power dressing at its finest.',
    price: 6499, original_price: 9499, category: 'Suits',
    sizes: ['M', 'L', 'XL', 'XXL'], stock_quantity: 12, is_in_stock: true,
    imageKey: 'suit_navy_pinstripe',
    imageUrl: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800',
  },
  {
    name: 'Brown Tweed Heritage Suit',
    description: 'Heritage brown tweed suit with herringbone pattern. A nod to classic British tailoring in every stitch.',
    price: 7499, original_price: 10999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 8, is_in_stock: true,
    imageKey: 'suit_brown_tweed',
    imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800',
  },
  {
    name: 'Beige Linen Wedding Suit',
    description: 'Elegant beige linen 2-piece suit for summer weddings. Relaxed fit and breathable fabric for outdoor events.',
    price: 5999, original_price: 8999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 14, is_in_stock: true,
    imageKey: 'suit_beige_linen_wedding',
    imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800',
  },
  {
    name: 'Burgundy Velvet Blazer Suit',
    description: 'Rich burgundy velvet blazer suit for festive occasions. Luxurious feel with peak lapels and satin trim.',
    price: 6999, original_price: 9999, category: 'Suits',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 10, is_in_stock: true,
    imageKey: 'suit_burgundy_velvet',
    imageUrl: 'https://images.unsplash.com/photo-1590677872278-c4e6b6ccee02?w=800',
  },

  // ── KURTAS (12 products) ─────────────────────────────────────────────────
  {
    name: 'White Cotton Straight Kurta',
    description: 'Pure white cotton straight-cut kurta with fine pintuck detailing. Ideal for festive and casual occasions.',
    price: 799, original_price: 1199, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 80, is_in_stock: true,
    imageKey: 'kurta_white_cotton_straight',
    imageUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=800',
  },
  {
    name: 'Navy Blue A-Line Kurta',
    description: 'Elegant navy blue A-line kurta with embroidered neckline. Flowy silhouette perfect for ethnic occasions.',
    price: 999, original_price: 1499, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'kurta_navy_aline',
    imageUrl: 'https://images.unsplash.com/photo-1583391733956-62e01ef05de1?w=800',
  },
  {
    name: 'Maroon Zari Embroidered Kurta',
    description: 'Rich maroon kurta with gold zari embroidery on the neckline and cuffs. Perfect for weddings and festivals.',
    price: 1499, original_price: 2499, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'kurta_maroon_zari',
    imageUrl: 'https://images.unsplash.com/photo-1609257373648-6a3c0f6e6b40?w=800',
  },
  {
    name: 'Cream Lucknowi Chikankari Kurta',
    description: 'Handcrafted cream kurta with delicate Lucknowi chikankari embroidery. A celebration of artisan craftsmanship.',
    price: 1799, original_price: 2999, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 25, is_in_stock: true,
    imageKey: 'kurta_cream_chikankari',
    imageUrl: 'https://images.unsplash.com/photo-1607748851687-ba9a10438621?w=800',
  },
  {
    name: 'Olive Green Pathani Kurta Set',
    description: 'Traditional olive Pathani kurta with matching salwar. Comfortable loose fit and authentic ethnic design.',
    price: 1299, original_price: 1999, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'kurta_olive_pathani',
    imageUrl: 'https://images.unsplash.com/photo-1588117472013-59bb134f8029?w=800',
  },
  {
    name: 'Terracotta Ethnic Print Kurta',
    description: 'Earthy terracotta cotton kurta with block-printed ethnic motifs. Relaxed fit with mandarin collar.',
    price: 949, original_price: 1399, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 45, is_in_stock: true,
    imageKey: 'kurta_terracotta_print',
    imageUrl: 'https://images.unsplash.com/photo-1617375407361-c25be6a6d7f0?w=800',
  },
  {
    name: 'Blue Ikat Woven Kurta',
    description: 'Handwoven ikat-pattern kurta in vibrant shades of blue. A fusion of traditional craft and modern silhouette.',
    price: 1199, original_price: 1799, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 30, is_in_stock: true,
    imageKey: 'kurta_blue_ikat',
    imageUrl: 'https://images.unsplash.com/photo-1611601322175-ef8ec8c85f01?w=800',
  },
  {
    name: 'Indigo Cotton Linen Kurta',
    description: 'Cool indigo cotton-linen blend kurta for summer festivals. Pintuck front with self-coloured buttons.',
    price: 899, original_price: 1399, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'kurta_indigo_linen',
    imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
  },
  {
    name: 'Peach Floral Embroidered Kurta',
    description: 'Soft peach kurta with floral thread embroidery on the yoke. Elegant and festive without being over the top.',
    price: 1299, original_price: 1999, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 28, is_in_stock: true,
    imageKey: 'kurta_peach_floral',
    imageUrl: 'https://images.unsplash.com/photo-1566479179817-e6a5c77e3f1b?w=800',
  },
  {
    name: 'Dark Green Bandhgala Kurta',
    description: 'Formal dark green bandhgala (Nehru collar) kurta. Perfect for wedding receptions and formal ethnic events.',
    price: 1799, original_price: 2799, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 20, is_in_stock: true,
    imageKey: 'kurta_green_bandhgala',
    imageUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=800',
  },
  {
    name: 'Yellow Chanderi Silk Kurta',
    description: 'Luxurious yellow Chanderi silk kurta with subtle shine and drape. A festive showstopper for Diwali and Eid.',
    price: 2199, original_price: 3499, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL'], stock_quantity: 18, is_in_stock: true,
    imageKey: 'kurta_yellow_chanderi',
    imageUrl: 'https://images.unsplash.com/photo-1583391733956-62e01ef05de1?w=800',
  },
  {
    name: 'Grey Striped Kurta Pajama Set',
    description: 'Comfortable grey striped cotton kurta-pajama set. Casual ethnic wear for everyday home and outings.',
    price: 1099, original_price: 1699, category: 'Kurtas',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'kurta_grey_striped_set',
    imageUrl: 'https://images.unsplash.com/photo-1609257373648-6a3c0f6e6b40?w=800',
  },

  // ── ACCESSORIES (14 products) ────────────────────────────────────────────
  {
    name: 'Black Genuine Leather Belt',
    description: 'Classic black genuine leather belt with a silver-tone pin buckle. Essential for formal and casual outfits.',
    price: 499, original_price: 799, category: 'Accessories',
    sizes: ['32', '34', '36', '38', '40', '42'], stock_quantity: 100, is_in_stock: true,
    imageKey: 'acc_belt_black_leather',
    imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
  },
  {
    name: 'Navy Silk Necktie',
    description: 'Premium navy silk necktie with a subtle diagonal weave pattern. Essential accessory for professional attire.',
    price: 399, original_price: 699, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 80, is_in_stock: true,
    imageKey: 'acc_tie_navy_silk',
    imageUrl: 'https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=800',
  },
  {
    name: 'Aviator Sunglasses – Gold Frame',
    description: 'Classic metal-frame aviator sunglasses with gold rims and brown gradient lenses. UV400 protection.',
    price: 699, original_price: 1299, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'acc_sunglasses_aviator',
    imageUrl: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800',
  },
  {
    name: 'Slim Bifold Leather Wallet – Brown',
    description: 'Slim brown genuine leather bifold wallet with RFID-blocking lining. Card slots and bill compartment.',
    price: 549, original_price: 899, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 90, is_in_stock: true,
    imageKey: 'acc_wallet_brown_leather',
    imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
  },
  {
    name: 'Woolen Scarf – Grey Herringbone',
    description: 'Warm grey herringbone wool scarf. Extra-long length for versatile wrapping styles in winter.',
    price: 449, original_price: 799, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 55, is_in_stock: true,
    imageKey: 'acc_scarf_grey_wool',
    imageUrl: 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=800',
  },
  {
    name: 'Leather Watch Strap – Tan',
    description: 'Genuine tan leather watch strap compatible with standard 20mm lugs. Classic stitching and quick-release pin.',
    price: 349, original_price: 599, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 70, is_in_stock: true,
    imageKey: 'acc_watch_strap_tan',
    imageUrl: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800',
  },
  {
    name: 'Beanie Hat – Charcoal',
    description: 'Snug charcoal ribbed knit beanie hat. One-size stretch fit, perfect for cold weather outings.',
    price: 299, original_price: 499, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 85, is_in_stock: true,
    imageKey: 'acc_beanie_charcoal',
    imageUrl: 'https://images.unsplash.com/photo-1510598969022-c4c6c5d05769?w=800',
  },
  {
    name: 'Classic Leather Oxfords – Black',
    description: 'Timeless black leather Oxford shoes with a cap-toe design. Rubber sole for comfort and durability.',
    price: 2499, original_price: 3999, category: 'Accessories',
    sizes: ['6', '7', '8', '9', '10', '11', '12'], stock_quantity: 40, is_in_stock: true,
    imageKey: 'acc_oxford_black',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
  },
  {
    name: 'White Canvas Sneakers',
    description: 'Clean white canvas low-top sneakers. Minimalist design with vulcanized rubber sole. Casual everyday footwear.',
    price: 1299, original_price: 1999, category: 'Accessories',
    sizes: ['6', '7', '8', '9', '10', '11'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'acc_sneaker_white_canvas',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
  },
  {
    name: 'Laptop Backpack – Charcoal Grey',
    description: 'Padded 15.6" laptop backpack with USB charging port and multiple compartments. Durable water-resistant fabric.',
    price: 1799, original_price: 2999, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 35, is_in_stock: true,
    imageKey: 'acc_backpack_charcoal',
    imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
  },
  {
    name: 'Flat Cap – Brown Tweed',
    description: 'Heritage brown tweed flat cap. Fully lined interior with a snap brim. Adds a vintage edge to any outfit.',
    price: 399, original_price: 699, category: 'Accessories',
    sizes: ['S/M', 'L/XL'], stock_quantity: 50, is_in_stock: true,
    imageKey: 'acc_flatcap_tweed',
    imageUrl: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=800',
  },
  {
    name: 'Silk Pocket Square – Burgundy',
    description: 'Premium silk pocket square in rich burgundy with a subtle paisley print. Elevates any suit or blazer.',
    price: 199, original_price: 399, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 100, is_in_stock: true,
    imageKey: 'acc_pocket_square',
    imageUrl: 'https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=800',
  },
  {
    name: 'Braided Leather Bracelet',
    description: 'Handcrafted braided leather bracelet with stainless steel clasp. Minimalist accessory for the modern man.',
    price: 249, original_price: 449, category: 'Accessories',
    sizes: ['S/M', 'L/XL'], stock_quantity: 75, is_in_stock: true,
    imageKey: 'acc_bracelet_leather',
    imageUrl: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800',
  },
  {
    name: 'Stainless Steel Cufflinks',
    description: 'Sleek gunmetal stainless steel cufflinks with brushed finish. Essential for formal shirt sleeves.',
    price: 299, original_price: 599, category: 'Accessories',
    sizes: ['One Size'], stock_quantity: 60, is_in_stock: true,
    imageKey: 'acc_cufflinks_steel',
    imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
  },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Starting Style Heaven Product Seeder');
  console.log(`📦 Total products to add: ${rawProducts.length}`);
  console.log('☁️  Uploading images to Cloudinary...\n');

  const products = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < rawProducts.length; i++) {
    const p = rawProducts[i];
    console.log(`[${i + 1}/${rawProducts.length}] Processing: ${p.name}`);

    const cloudinaryUrl = await uploadToCloudinary(p.imageUrl, p.imageKey);
    const barcode = `SH${Date.now().toString().slice(-8)}${i}`;

    products.push({
      name: p.name,
      description: p.description,
      price: p.price,
      original_price: p.original_price,
      category: p.category,
      sizes: p.sizes,
      image_url: cloudinaryUrl,
      barcode: barcode,
      stock_quantity: p.stock_quantity,
      is_in_stock: p.is_in_stock,
    });

    // Small delay to avoid hammering Cloudinary rate limits
    await sleep(300);
  }

  console.log('\n💾 Inserting products into Supabase...');

  // Insert in batches of 20
  const BATCH_SIZE = 20;
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
  console.log(`🎉 Seeding Complete!`);
  console.log(`  ✅ Successfully inserted: ${successCount} products`);
  if (failCount > 0) console.log(`  ❌ Failed: ${failCount} products`);
  console.log('═══════════════════════════════════════════\n');

  const { data: count } = await supabase.from('products').select('id', { count: 'exact', head: true });
  console.log(`📊 Total products now in database: ${count || 'unknown'}`);
}

seed().catch((err) => {
  console.error('💥 Fatal seeder error:', err);
  process.exit(1);
});
