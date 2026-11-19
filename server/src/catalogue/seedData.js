// Sample data for development only (npm run seed:dev). Ported from the 28 demo meals in the original
// NaijaBites app. Photos are the original hotlinked images; real vendors upload their own.
// Vendor addresses are made up (areas only).

export const SEED_CATEGORIES = [
  { slug: 'cafes-bakery', name: 'Cafés & Bakery' },
  { slug: 'fast-food', name: 'Fast Food' },
  { slug: 'main-dishes', name: 'Main Dishes' },
  { slug: 'local-meals', name: 'Local Meals' },
  { slug: 'groceries', name: 'Groceries' },
  { slug: 'livestock', name: 'Livestock' },
];

export const SEED_VENDORS = [
  {
    "name": "Mama Africa Kitchen",
    "slug": "mama-africa-kitchen",
    "area": "Lekki Phase 1"
  },
  {
    "name": "Taste Hub",
    "slug": "taste-hub",
    "area": "Ikeja"
  },
  {
    "name": "Burger Spot",
    "slug": "burger-spot",
    "area": "Yaba"
  },
  {
    "name": "Suya Palace",
    "slug": "suya-palace",
    "area": "Surulere"
  },
  {
    "name": "Royal Kitchen",
    "slug": "royal-kitchen",
    "area": "Victoria Island"
  },
  {
    "name": "Mama's Pot",
    "slug": "mamas-pot",
    "area": "Ikoyi"
  },
  {
    "name": "Ocean View Grill",
    "slug": "ocean-view-grill",
    "area": "Maryland"
  },
  {
    "name": "Naija Food Corner",
    "slug": "naija-food-corner",
    "area": "Ajah"
  },
  {
    "name": "Daily Grind Café",
    "slug": "daily-grind-cafe",
    "area": "Gbagada"
  },
  {
    "name": "Sweet Crumbs Bakery",
    "slug": "sweet-crumbs-bakery",
    "area": "Oshodi"
  },
  {
    "name": "Lagos Bakehouse",
    "slug": "lagos-bakehouse",
    "area": "Magodo"
  },
  {
    "name": "Pizza Corner",
    "slug": "pizza-corner",
    "area": "Festac"
  },
  {
    "name": "Mama Put Kitchen",
    "slug": "mama-put-kitchen",
    "area": "Ikorodu"
  },
  {
    "name": "Fresh Basket Store",
    "slug": "fresh-basket-store",
    "area": "Epe"
  },
  {
    "name": "Market Square Provisions",
    "slug": "market-square-provisions",
    "area": "Badagry"
  },
  {
    "name": "Farmgate Foods",
    "slug": "farmgate-foods",
    "area": "Agege"
  },
  {
    "name": "Oke-Aro Livestock Farm",
    "slug": "oke-aro-livestock-farm",
    "area": "Apapa"
  },
  {
    "name": "Idera Cattle Ranch",
    "slug": "idera-cattle-ranch",
    "area": "Ojota"
  },
  {
    "name": "Green Pastures Farm",
    "slug": "green-pastures-farm",
    "area": "Ketu"
  }
];

export const SEED_PRODUCTS = [
  {
    "vendor": "Mama Africa Kitchen",
    "name": "Jollof Rice & Grilled Chicken",
    "priceNaira": 6500,
    "unit": "item",
    "description": "Smoky party-style jollof rice served with juicy grilled chicken and fresh vegetables.",
    "image": "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "lunch",
      "buka",
      "dinner"
    ],
    "badge": "popular",
    "category": "fast-food",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Taste Hub",
    "name": "Chicken Shawarma",
    "priceNaira": 4500,
    "unit": "item",
    "description": "Warm flatbread packed with grilled chicken, crisp vegetables and creamy house sauce.",
    "image": "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "lunch"
    ],
    "badge": "popular",
    "category": "fast-food",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Burger Spot",
    "name": "Beef Burger & Fries",
    "priceNaira": 5800,
    "unit": "item",
    "description": "A grilled beef burger with fresh lettuce, tomato and golden fries.",
    "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "lunch"
    ],
    "badge": null,
    "category": "fast-food",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Suya Palace",
    "name": "Suya (Beef)",
    "priceNaira": 4000,
    "unit": "item",
    "description": "Peppery Nigerian beef suya, grilled and served with onions and tomatoes.",
    "image": "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "lunch",
      "dinner",
      "buka"
    ],
    "badge": "new",
    "category": "fast-food",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Royal Kitchen",
    "name": "Fried Rice & Chicken",
    "priceNaira": 5200,
    "unit": "item",
    "description": "Colourful vegetable fried rice with well-seasoned chicken and a side of plantain.",
    "image": "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "lunch",
      "buka",
      "dinner"
    ],
    "badge": null,
    "category": "fast-food",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Mama's Pot",
    "name": "Plantain & Egg Stew",
    "priceNaira": 3900,
    "unit": "item",
    "description": "Sweet ripe plantain served with a rich Nigerian tomato and egg stew.",
    "image": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "breakfast",
      "buka"
    ],
    "badge": null,
    "category": "cafes-bakery",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Ocean View Grill",
    "name": "Grilled Fish (Tilapia)",
    "priceNaira": 7500,
    "unit": "item",
    "description": "Whole tilapia seasoned with local spices and grilled, served with fresh sides.",
    "image": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "dinner"
    ],
    "badge": null,
    "category": "main-dishes",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Naija Food Corner",
    "name": "Egusi Soup & Fufu",
    "priceNaira": 5900,
    "unit": "item",
    "description": "Traditional melon-seed soup with leafy greens, served with soft fufu.",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "dinner",
      "buka"
    ],
    "badge": null,
    "category": "main-dishes",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Daily Grind Café",
    "name": "Cappuccino",
    "priceNaira": 2500,
    "unit": "cup",
    "description": "Freshly prepared espresso with steamed milk, served hot.",
    "image": "https://6ae0469806a8db5b90f276e4.imgix.net/sandbox/mine.jpg",
    "markets": [
      "breakfast"
    ],
    "badge": "popular",
    "category": "cafes-bakery",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Sweet Crumbs Bakery",
    "name": "Fresh Bread Loaf",
    "priceNaira": 1800,
    "unit": "loaf",
    "description": "Soft, freshly baked bread loaf from a local bakery.",
    "image": "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "breakfast"
    ],
    "badge": null,
    "category": "cafes-bakery",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Lagos Bakehouse",
    "name": "Meat Pie",
    "priceNaira": 1200,
    "unit": "piece",
    "description": "Golden pastry filled with seasoned minced beef and vegetables.",
    "image": "https://images.unsplash.com/photo-1608039829572-78524f79c4c7?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "breakfast"
    ],
    "badge": null,
    "category": "cafes-bakery",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Sweet Crumbs Bakery",
    "name": "Chocolate Cake Slice",
    "priceNaira": 2200,
    "unit": "slice",
    "description": "A rich chocolate cake slice, baked fresh for a sweet treat.",
    "image": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "breakfast"
    ],
    "badge": null,
    "category": "cafes-bakery",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Pizza Corner",
    "name": "Chicken Pizza",
    "priceNaira": 7500,
    "unit": "pizza",
    "description": "A freshly baked pizza topped with chicken, cheese and vegetables.",
    "image": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "lunch"
    ],
    "badge": null,
    "category": "fast-food",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Mama Put Kitchen",
    "name": "Amala, Ewedu & Gbegiri",
    "priceNaira": 3500,
    "unit": "plate",
    "description": "A local buka favourite served with ewedu, gbegiri and stew.",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "buka"
    ],
    "badge": null,
    "category": "local-meals",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Suya Palace",
    "name": "Beef Suya",
    "priceNaira": 4000,
    "unit": "portion",
    "description": "Peppery Nigerian beef suya, grilled and served with onions and tomatoes.",
    "image": "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "buka"
    ],
    "badge": "new",
    "category": "local-meals",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Fresh Basket Store",
    "name": "Local Rice",
    "priceNaira": 4200,
    "unit": "5 kg bag",
    "description": "Locally sourced rice for everyday home cooking. Price shown per 5 kg bag.",
    "image": "https://6ae0469806a8db5b90f276e4.imgix.net/sandbox/mama-gold-rice%20(1).webp",
    "markets": [
      "groceries"
    ],
    "badge": null,
    "category": "groceries",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Market Square Provisions",
    "name": "Brown Beans",
    "priceNaira": 2800,
    "unit": "2 kg bag",
    "description": "Clean dried brown beans, sold for household cooking. Price shown per 2 kg bag.",
    "image": "https://6ae0469806a8db5b90f276e4.imgix.net/sandbox/images.jpg",
    "markets": [
      "groceries"
    ],
    "badge": null,
    "category": "groceries",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Farmgate Foods",
    "name": "Garri",
    "priceNaira": 1600,
    "unit": "2 kg bag",
    "description": "Cassava garri for drinking or preparing eba. Price shown per 2 kg bag.",
    "image": "https://6ae0469806a8db5b90f276e4.imgix.net/sandbox/Golden-Penny-Garri-1.png",
    "markets": [
      "groceries"
    ],
    "badge": null,
    "category": "groceries",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Fresh Basket Store",
    "name": "Palm Oil",
    "priceNaira": 3500,
    "unit": "litre",
    "description": "Red palm oil for traditional soups and stews. Price shown per litre.",
    "image": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "groceries"
    ],
    "badge": null,
    "category": "groceries",
    "fulfilmentMode": "standard"
  },
  {
    "vendor": "Oke-Aro Livestock Farm",
    "name": "Live Ram",
    "priceNaira": 180000,
    "unit": "animal",
    "description": "Live ram offered by a livestock vendor for celebration or ceremonial purchase. Confirm size, weight, health condition, delivery and final price with the seller.",
    "image": "https://images.unsplash.com/photo-1484557985045-edf25e08da73?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "livestock"
    ],
    "badge": "celebration",
    "category": "livestock",
    "fulfilmentMode": "quote_required"
  },
  {
    "vendor": "Idera Cattle Ranch",
    "name": "Live Cow",
    "priceNaira": 650000,
    "unit": "animal",
    "description": "Live cow listing for celebration and family events. Contact the vendor to confirm approximate weight, condition, transport and availability.",
    "image": "https://6ae0469806a8db5b90f276e4.imgix.net/sandbox/cow.jpg",
    "markets": [
      "livestock"
    ],
    "badge": null,
    "category": "livestock",
    "fulfilmentMode": "quote_required"
  },
  {
    "vendor": "Green Pastures Farm",
    "name": "Live Goat",
    "priceNaira": 95000,
    "unit": "animal",
    "description": "Live goat from a local farm. Confirm size, health condition, availability and pickup or delivery details with the vendor.",
    "image": "https://images.unsplash.com/photo-1524024973431-2ad916746881?auto=format&fit=crop&w=700&q=80",
    "markets": [
      "livestock"
    ],
    "badge": null,
    "category": "livestock",
    "fulfilmentMode": "quote_required"
  }
];
