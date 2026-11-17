
-- =========================================
-- KNOWLY DATABASE
-- FINAL PHASE 1 SCHEMA
-- PostgreSQL 18
-- =========================================

-- =========================================
-- 1. BRANDS
-- =========================================

CREATE TABLE IF NOT EXISTS public.brands (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    origin_country VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =========================================
-- 2. CATEGORIES
-- =========================================

CREATE TABLE IF NOT EXISTS public.categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(160) NOT NULL UNIQUE,
    description TEXT,
    parent_id BIGINT REFERENCES public.categories(id)
        ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =========================================
-- 3. PRODUCTS
-- =========================================

CREATE TABLE IF NOT EXISTS public.products (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(500) NOT NULL,
    description TEXT,

    brand_id BIGINT REFERENCES public.brands(id)
        ON DELETE SET NULL,

    category_id BIGINT REFERENCES public.categories(id)
        ON DELETE SET NULL,

    image_url TEXT,
    barcode VARCHAR(100),

    specifications JSONB DEFAULT '{}'::jsonb,

    source_type VARCHAR(30) DEFAULT 'manual',
    source_name VARCHAR(150),
    external_id VARCHAR(255),

    product_url TEXT,
    country_of_origin VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name
ON public.products
USING GIN (to_tsvector('simple', name));

CREATE INDEX IF NOT EXISTS idx_products_category
ON public.products(category_id);

CREATE INDEX IF NOT EXISTS idx_products_barcode
ON public.products(barcode);

CREATE INDEX IF NOT EXISTS idx_products_external
ON public.products(source_name, external_id);


-- =========================================
-- 4. PRODUCT VARIANTS
-- =========================================

CREATE TABLE IF NOT EXISTS public.product_variants (
    id BIGSERIAL PRIMARY KEY,

    product_id BIGINT NOT NULL
        REFERENCES public.products(id)
        ON DELETE CASCADE,

    variant_name VARCHAR(255),

    attributes JSONB DEFAULT '{}'::jsonb,

    sku VARCHAR(150),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_product
ON public.product_variants(product_id);


-- =========================================
-- 5. STORES
-- =========================================

CREATE TABLE IF NOT EXISTS public.stores (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,

    website_url TEXT,

    country VARCHAR(100) DEFAULT 'Lebanon',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(name, country)
);


-- =========================================
-- 6. DATA SOURCES
-- =========================================

CREATE TABLE IF NOT EXISTS public.data_sources (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(150) NOT NULL UNIQUE,

    source_type VARCHAR(50),

    description TEXT,

    base_url TEXT,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =========================================
-- 7. OFFERS
-- =========================================

CREATE TABLE IF NOT EXISTS public.offers (
    id BIGSERIAL PRIMARY KEY,

    product_id BIGINT NOT NULL
        REFERENCES public.products(id)
        ON DELETE CASCADE,

    variant_id BIGINT
        REFERENCES public.product_variants(id)
        ON DELETE SET NULL,

    store_id BIGINT
        REFERENCES public.stores(id)
        ON DELETE SET NULL,

    data_source_id BIGINT
        REFERENCES public.data_sources(id)
        ON DELETE SET NULL,

    price NUMERIC(12,2),

    currency VARCHAR(10) DEFAULT 'USD',

    condition VARCHAR(50) DEFAULT 'New',

    availability VARCHAR(50) DEFAULT 'Unknown',

    product_url TEXT,

    last_checked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (price IS NULL OR price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_offers_product
ON public.offers(product_id);

CREATE INDEX IF NOT EXISTS idx_offers_price
ON public.offers(price);


-- =========================================
-- 8. PRICE HISTORY
-- =========================================

CREATE TABLE IF NOT EXISTS public.price_history (
    id BIGSERIAL PRIMARY KEY,

    offer_id BIGINT NOT NULL
        REFERENCES public.offers(id)
        ON DELETE CASCADE,

    price NUMERIC(12,2) NOT NULL,

    currency VARCHAR(10) DEFAULT 'USD',

    recorded_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_price_history_offer_date
ON public.price_history(offer_id, recorded_at DESC);


-- =========================================
-- 9. USERS
-- =========================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =========================================
-- 10. WISHLISTS
-- =========================================

CREATE TABLE IF NOT EXISTS public.wishlists (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES public.app_users(id)
        ON DELETE CASCADE,

    product_id BIGINT NOT NULL
        REFERENCES public.products(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, product_id)
);


-- =========================================
-- 11. FIVE MAIN CATEGORIES
-- =========================================

INSERT INTO public.categories
(name, slug, description)
VALUES

(
    'Electronics',
    'electronics',
    'Smartphones, televisions and electronic devices'
),

(
    'Computers & Accessories',
    'computers-accessories',
    'Laptops, monitors and computer accessories'
),

(
    'Groceries & Food',
    'groceries-food',
    'Food, beverages and grocery products'
),

(
    'Beauty & Personal Care',
    'beauty-personal-care',
    'Skincare, makeup and haircare products'
),

(
    'Automotive',
    'automotive',
    'Automotive accessories and spare parts'
)

ON CONFLICT (slug) DO NOTHING;


-- =========================================
-- 12. FIFTEEN SUBCATEGORIES
-- =========================================

INSERT INTO public.categories
(name, slug, parent_id)

SELECT
    s.name,
    s.slug,
    c.id

FROM (
    VALUES

    -- ELECTRONICS
    (
        'Smartphones',
        'smartphones',
        'electronics'
    ),
    (
        'Televisions',
        'televisions',
        'electronics'
    ),
    (
        'Cameras & Audio',
        'cameras-audio',
        'electronics'
    ),

    -- COMPUTERS
    (
        'Laptops',
        'laptops',
        'computers-accessories'
    ),
    (
        'Monitors',
        'monitors',
        'computers-accessories'
    ),
    (
        'Computer Accessories',
        'computer-accessories',
        'computers-accessories'
    ),

    -- GROCERIES
    (
        'Beverages',
        'beverages',
        'groceries-food'
    ),
    (
        'Snacks & Sweets',
        'snacks-sweets',
        'groceries-food'
    ),
    (
        'Dairy & Food',
        'dairy-food',
        'groceries-food'
    ),

    -- BEAUTY
    (
        'Skincare',
        'skincare',
        'beauty-personal-care'
    ),
    (
        'Makeup',
        'makeup',
        'beauty-personal-care'
    ),
    (
        'Haircare',
        'haircare',
        'beauty-personal-care'
    ),

    -- AUTOMOTIVE
    (
        'Car Accessories',
        'car-accessories',
        'automotive'
    ),
    (
        'Spare Parts',
        'spare-parts',
        'automotive'
    ),
    (
        'Car Electronics',
        'car-electronics',
        'automotive'
    )

) AS s(name, slug, parent_slug)

JOIN public.categories c
ON c.slug = s.parent_slug

ON CONFLICT (slug) DO NOTHING;


-- =========================================
-- 13. REGISTER EXTERNAL DATA SOURCES
-- BACKEND ONLY
-- =========================================

INSERT INTO public.data_sources
(name, source_type, description, base_url)

VALUES

(
    'LebTech',
    'MCP',
    'Lebanese electronics product and retailer price data',
    'https://lebtechlb.com/api/mcp'
),

(
    'Open Food Facts',
    'REST API',
    'Food product information',
    'https://world.openfoodfacts.org/api/v2'
),

(
    'Open Beauty Facts',
    'REST API',
    'Beauty and personal care product information',
    'https://world.openbeautyfacts.org/api/v2'
),

(
    'Speero',
    'REST API',
    'Automotive parts and Saudi Arabian product data',
    'https://speero.net'
),

(
    'UPCitemdb',
    'REST API',
    'Supplementary international product information',
    'https://api.upcitemdb.com'
)

ON CONFLICT (name) DO NOTHING;


-- =========================================
-- END OF KNOWLY DATABASE SCHEMA
-- =========================================
