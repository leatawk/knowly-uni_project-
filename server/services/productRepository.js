
const db = require("../db");

async function saveExternalProduct(product, categorySlug) {
    const client = await db.pool.connect();

    try {
        await client.query("BEGIN");

        // Find the product category
        const categoryResult = await client.query(
            `SELECT id FROM categories WHERE slug = $1`,
            [categorySlug]
        );

        if (categoryResult.rows.length === 0) {
            throw new Error("Product category not found");
        }

        const categoryId = categoryResult.rows[0].id;

        // Find or create the brand
        let brandId = null;

        if (product.brand) {
            const brandName = product.brand.split(",")[0].trim();

            const brandResult = await client.query(
                `INSERT INTO brands (name)
                 VALUES ($1)
                 ON CONFLICT (name)
                 DO UPDATE SET name = EXCLUDED.name
                 RETURNING id`,
                [brandName]
            );

            brandId = brandResult.rows[0].id;
        }

        // Find the registered data source
        const sourceResult = await client.query(
            `SELECT id FROM data_sources WHERE name = $1`,
            [product.source]
        );

        if (sourceResult.rows.length === 0) {
            throw new Error("Data source not registered");
        }

        // Check whether this barcode already exists
        const existing = await client.query(
            `SELECT id FROM products WHERE barcode = $1 LIMIT 1`,
            [product.barcode]
        );

        let savedProduct;

        if (existing.rows.length > 0) {
            // Update existing product
            const updated = await client.query(
                `UPDATE products
                 SET name = $1,
                     description = $2,
                     brand_id = $3,
                     category_id = $4,
                     image_url = $5,
                     specifications = $6::jsonb,
                     source_type = 'external',
                     source_name = $7,
                     external_id = $8,
                     updated_at = NOW()
                 WHERE id = $9
                 RETURNING *`,
                [
                    product.name,
                    product.ingredients || null,
                    brandId,
                    categoryId,
                    product.image,
                    JSON.stringify({
                        quantity: product.quantity,
                        externalCategory: product.category,
                        countries: product.countries
                    }),
                    product.source,
                    product.barcode,
                    existing.rows[0].id
                ]
            );

            savedProduct = updated.rows[0];

        } else {
            // Insert new product
            const inserted = await client.query(
                `INSERT INTO products (
                    name,
                    description,
                    brand_id,
                    category_id,
                    image_url,
                    barcode,
                    specifications,
                    source_type,
                    source_name,
                    external_id
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7::jsonb, 'external', $8, $9
                )
                RETURNING *`,
                [
                    product.name,
                    product.ingredients || null,
                    brandId,
                    categoryId,
                    product.image,
                    product.barcode,
                    JSON.stringify({
                        quantity: product.quantity,
                        externalCategory: product.category,
                        countries: product.countries
                    }),
                    product.source,
                    product.barcode
                ]
            );

            savedProduct = inserted.rows[0];
        }

        await client.query("COMMIT");

        return savedProduct;

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}

module.exports = {
    saveExternalProduct
};
