var express = require('express');
var router = express.Router();
const { query } = require('../db/mysql');
const slugify = require('slugify');

const DEFAULT_CATEGORY_IMAGE = 'https://i.imgur.com/ZANVnHE.jpeg';
const EDITABLE_FIELDS = new Set(['name', 'slug', 'description', 'image']);

function normalizeSlug(value) {
  return slugify(String(value || ''), { lower: true, strict: true });
}

function isValidNumericId(id) {
  const numberId = Number(id);
  return Number.isInteger(numberId) && numberId > 0;
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

function toCategoryResponse(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: row.image,
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCategoryById(id, includeDeleted) {
  const rows = await query(
    `
      SELECT id, name, slug, description, image, is_deleted, created_at, updated_at
      FROM categories
      WHERE id = ?
      ${includeDeleted ? '' : 'AND is_deleted = FALSE'}
      LIMIT 1
    `,
    [id]
  );

  return rows.length > 0 ? rows[0] : null;
}

// GET /api/v1/categories - list all categories (non-deleted)
router.get('/', async function (req, res, next) {
  try {
    const rows = await query(`
      SELECT id, name, slug, description, image, is_deleted, created_at, updated_at
      FROM categories
      WHERE is_deleted = FALSE
      ORDER BY id DESC
    `);

    res.status(200).json({ data: rows.map(toCategoryResponse) });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/categories/:id - get category by id
router.get('/:id', async function (req, res, next) {
  try {
    if (!isValidNumericId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category id' });
    }

    const result = await getCategoryById(Number(req.params.id), false);
    if (!result) return res.status(404).json({ message: 'Category not found' });
    res.status(200).json({ data: toCategoryResponse(result) });
  } catch (error) {
    next(error);
  }
});

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
    if (!createData.name || String(createData.name).trim().length === 0) {
      return res.status(400).json({ message: 'name is required' });
    }

    const name = String(createData.name).trim();
    const slug = createData.slug ? normalizeSlug(createData.slug) : normalizeSlug(name);
    const description = createData.description ? String(createData.description) : '';
    const image =
      createData.image && String(createData.image).trim().length > 0
        ? String(createData.image).trim()
        : DEFAULT_CATEGORY_IMAGE;

    const insertResult = await query(
      `
        INSERT INTO categories (name, slug, description, image, is_deleted)
        VALUES (?, ?, ?, ?, FALSE)
      `,
      [name, slug, description, image]
    );

    const inserted = await getCategoryById(insertResult.insertId, true);
    res.status(201).json({ data: toCategoryResponse(inserted) });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async function (req, res, next) {
  try {
    if (!isValidNumericId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category id' });
    }
    const categoryId = Number(req.params.id);

    const unknownFields = getUnknownFields(req.body);
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const existing = await getCategoryById(categoryId, false);
    if (!existing) return res.status(404).json({ message: 'Category not found' });

    const updateData = pickEditableFields(req.body);
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Request body must contain at least one editable field' });
    }

    const setClauses = [];
    const values = [];

    if (updateData.name !== undefined) {
      const name = String(updateData.name).trim();
      if (name.length === 0) {
        return res.status(400).json({ message: 'name cannot be empty' });
      }
      setClauses.push('name = ?');
      values.push(name);

      if (updateData.slug === undefined) {
        updateData.slug = normalizeSlug(name);
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

    if (updateData.description !== undefined) {
      setClauses.push('description = ?');
      values.push(String(updateData.description));
    }

    if (updateData.image !== undefined) {
      const image = String(updateData.image || '').trim();
      if (image.length === 0) {
        return res.status(400).json({ message: 'image cannot be empty' });
      }
      setClauses.push('image = ?');
      values.push(image);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    await query(
      `
        UPDATE categories
        SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_deleted = FALSE
      `,
      [...values, categoryId]
    );

    const updated = await getCategoryById(categoryId, false);
    res.status(200).json({ data: toCategoryResponse(updated) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async function (req, res, next) {
  try {
    if (!isValidNumericId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category id' });
    }
    const categoryId = Number(req.params.id);

    const result = await query(
      `
        UPDATE categories
        SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_deleted = FALSE
      `,
      [categoryId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Category not found' });

    const deleted = await getCategoryById(categoryId, true);
    res.status(200).json({ message: 'Category deleted successfully', data: toCategoryResponse(deleted) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
