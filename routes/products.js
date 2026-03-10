var express = require('express');
var router = express.Router();
const { query } = require('../db/mysql');
const slugify = require('slugify');

const DEFAULT_IMAGE = 'https://i.imgur.com/ZANVnHE.jpeg';
const EDITABLE_FIELDS = new Set([
  'title',
  'slug',
  'price',
  'description',
  'images',
  'category',
]);

function normalizeSlug(value) {
  return slugify(String(value || ''), { lower: true, strict: true });
}

function getUnknownFields(payload) {
  return Object.keys(payload || {}).filter((key) => !EDITABLE_FIELDS.has(key));
}

function pickEditableFields(payload) {
  const result = {};
  for (const key of Object.keys(payload || {})) {
    if (EDITABLE_FIELDS.has(key)) {
      result[key] = payload[key];
    }
  }
  return result;
}

function isValidNumericId(id) {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
}

function toProductResponse(row) {
  let images = [DEFAULT_IMAGE];
  try {
    const parsed = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
    if (Array.isArray(parsed) && parsed.length > 0) {
      images = parsed;
    }
  } catch (error) {
    images = [DEFAULT_IMAGE];
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    price: Number(row.price),
    description: row.description,
    images,
    category: row.category_id,
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseImages(value, useFallback) {
  if (value === undefined) {
    return useFallback ? [DEFAULT_IMAGE] : undefined;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return cleaned.length > 0 ? cleaned : useFallback ? [DEFAULT_IMAGE] : [];
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  const err = new Error('images must be a string or array of strings');
  err.status = 400;
  throw err;
}

function parseCategoryId(value) {
  const categoryId = Number(value);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    const err = new Error('category must be a positive integer');
    err.status = 400;
    throw err;
  }
  return categoryId;
}

function parsePrice(value) {
  const price = Number(value);
  if (Number.isNaN(price) || price < 0) {
    const err = new Error('price must be a non-negative number');
    err.status = 400;
    throw err;
  }
  return price;
}

async function getProductById(id, includeDeleted) {
  const params = includeDeleted ? [id] : [id];
  const rows = await query(
    `
      SELECT id, title, slug, price, description, images, category_id, is_deleted, created_at, updated_at
      FROM products
      WHERE id = ?
      ${includeDeleted ? '' : 'AND is_deleted = FALSE'}
      LIMIT 1
    `,
    params
  );

  return rows.length > 0 ? rows[0] : null;
}

// GET /api/v1/products - list all products (non-deleted)
router.get('/', async function (req, res, next) {
  try {
    const rows = await query(`
      SELECT id, title, slug, price, description, images, category_id, is_deleted, created_at, updated_at
      FROM products
      WHERE is_deleted = FALSE
      ORDER BY id DESC
    `);

    res.status(200).json({ data: rows.map(toProductResponse) });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/products/:id - get product by id
router.get('/:id', async function (req, res, next) {
  try {
    if (!isValidNumericId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const result = await getProductById(Number(req.params.id), false);
    if (!result) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ data: toProductResponse(result) });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/products - create product
router.post('/', async function (req, res, next) {
  try {
    const unknownFields = getUnknownFields(req.body);
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const createData = pickEditableFields(req.body);
    if (!createData.title || String(createData.title).trim().length === 0) {
      return res.status(400).json({ message: 'title is required' });
    }

    createData.title = String(createData.title).trim();
    if (createData.slug) {
      createData.slug = normalizeSlug(createData.slug);
    } else if (createData.title) {
      createData.slug = normalizeSlug(createData.title);
    }

    const price = createData.price === undefined ? 0 : parsePrice(createData.price);
    const description = createData.description ? String(createData.description) : '';
    const images = parseImages(createData.images, true);
    const categoryId = parseCategoryId(createData.category);

    const insertResult = await query(
      `
        INSERT INTO products (title, slug, price, description, images, category_id, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, FALSE)
      `,
      [createData.title, createData.slug, price, description, JSON.stringify(images), categoryId]
    );

    const inserted = await getProductById(insertResult.insertId, true);
    res.status(201).json({ data: toProductResponse(inserted) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/products/:id - update product
router.put('/:id', async function (req, res, next) {
  try {
    if (!isValidNumericId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const productId = Number(req.params.id);

    const unknownFields = getUnknownFields(req.body);
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const existing = await getProductById(productId, false);
    if (!existing) return res.status(404).json({ message: 'Product not found' });

    const updateData = pickEditableFields(req.body);
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Request body must contain at least one editable field' });
    }

    const setClauses = [];
    const values = [];

    if (updateData.title !== undefined) {
      const title = String(updateData.title).trim();
      if (title.length === 0) {
        return res.status(400).json({ message: 'title cannot be empty' });
      }
      setClauses.push('title = ?');
      values.push(title);

      if (updateData.slug === undefined) {
        updateData.slug = normalizeSlug(title);
      }
    }

    if (updateData.slug !== undefined) {
      const slug = normalizeSlug(updateData.slug);
      if (slug.length === 0) {
        return res.status(400).json({ message: 'slug cannot be empty' });
      }
      setClauses.push('slug = ?');
      values.push(slug);
    }

    if (updateData.price !== undefined) {
      setClauses.push('price = ?');
      values.push(parsePrice(updateData.price));
    }

    if (updateData.description !== undefined) {
      setClauses.push('description = ?');
      values.push(String(updateData.description));
    }

    if (updateData.images !== undefined) {
      setClauses.push('images = ?');
      values.push(JSON.stringify(parseImages(updateData.images, false)));
    }

    if (updateData.category !== undefined) {
      setClauses.push('category_id = ?');
      values.push(parseCategoryId(updateData.category));
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    await query(
      `
        UPDATE products
        SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_deleted = FALSE
      `,
      [...values, productId]
    );

    const updated = await getProductById(productId, false);
    res.status(200).json({ data: toProductResponse(updated) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/products/:id - soft delete
router.delete('/:id', async function (req, res, next) {
  try {
    if (!isValidNumericId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }
    const productId = Number(req.params.id);

    const result = await query(
      `
        UPDATE products
        SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_deleted = FALSE
      `,
      [productId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Product not found' });

    const deleted = await getProductById(productId, true);
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ message: 'Product deleted successfully', data: toProductResponse(deleted) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
