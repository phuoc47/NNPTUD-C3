var express = require('express');
var router = express.Router();
let productModel = require('../schemas/products');
const mongoose = require('mongoose');
const slugify = require('slugify');

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

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/v1/products - list all products (non-deleted)
router.get('/', async function (req, res, next) {
  try {
    let result = await productModel.find({ isDeleted: false });
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/products/:id - get product by id
router.get('/:id', async function (req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    let result = await productModel.findOne({ _id: req.params.id, isDeleted: false });
    if (!result) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ data: result });
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
    if (createData.slug) {
      createData.slug = normalizeSlug(createData.slug);
    } else if (createData.title) {
      createData.slug = normalizeSlug(createData.title);
    }

    let newProd = new productModel(createData);
    await newProd.save();
    res.status(201).json({ data: newProd });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/products/:id - update product
router.put('/:id', async function (req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const unknownFields = getUnknownFields(req.body);
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    let updateData = pickEditableFields(req.body);
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Request body must contain at least one editable field' });
    }

    if (updateData.slug) {
      updateData.slug = normalizeSlug(updateData.slug);
    } else if (updateData.title) {
      updateData.slug = normalizeSlug(updateData.title);
    }

    let updated = await productModel.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/products/:id - soft delete
router.delete('/:id', async function (req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    let deleted = await productModel.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ message: 'Product deleted successfully', data: deleted });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
