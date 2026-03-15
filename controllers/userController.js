const mongoose = require('mongoose');
const Role = require('../models/Role');
const User = require('../models/User');

const EDITABLE_FIELDS = new Set([
  'username',
  'password',
  'email',
  'fullName',
  'avatarUrl',
  'status',
  'role',
  'loginCount',
]);

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username).trim();
}

function getUnknownFields(payload) {
  return Object.keys(payload || {}).filter((key) => !EDITABLE_FIELDS.has(key));
}

async function validateRole(roleId) {
  if (roleId === undefined || roleId === null) return;

  if (!isValidObjectId(roleId)) {
    const error = new Error('Invalid role id');
    error.status = 400;
    throw error;
  }

  const role = await Role.findById(roleId);
  if (!role) {
    const error = new Error('Role not found');
    error.status = 404;
    throw error;
  }
}

async function updateStatus(req, res, next, status) {
  try {
    const { email, username } = req.body;
    if (!email || !username) {
      return res.status(400).json({ message: 'email and username are required' });
    }

    const user = await User.findOneAndUpdate(
      {
        email: normalizeEmail(email),
        username: normalizeUsername(username),
        deleted: false,
      },
      { status },
      { new: true, runValidators: true }
    ).populate('role');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ data: user });
  } catch (error) {
    return next(error);
  }
}

exports.createUser = async function createUser(req, res, next) {
  try {
    const unknownFields = getUnknownFields(req.body);
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const payload = { ...req.body };
    if (payload.email !== undefined) {
      payload.email = normalizeEmail(payload.email);
    }
    if (payload.username !== undefined) {
      payload.username = normalizeUsername(payload.username);
    }

    await validateRole(payload.role);

    const created = await User.create(payload);
    const user = await User.findById(created._id).populate('role');

    return res.status(201).json({ data: user });
  } catch (error) {
    return next(error);
  }
};

exports.getAllUsers = async function getAllUsers(req, res, next) {
  try {
    const users = await User.find({ deleted: false })
      .populate('role')
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: users });
  } catch (error) {
    return next(error);
  }
};

exports.getUserById = async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await User.findOne({
      _id: id,
      deleted: false,
    }).populate('role');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ data: user });
  } catch (error) {
    return next(error);
  }
};

exports.updateUser = async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const unknownFields = getUnknownFields(req.body);
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const updates = { ...req.body };
    if (updates.email !== undefined) {
      updates.email = normalizeEmail(updates.email);
    }
    if (updates.username !== undefined) {
      updates.username = normalizeUsername(updates.username);
    }
    if (updates.deleted !== undefined) {
      delete updates.deleted;
    }

    await validateRole(updates.role);

    const user = await User.findOneAndUpdate(
      { _id: id, deleted: false },
      updates,
      { new: true, runValidators: true }
    ).populate('role');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ data: user });
  } catch (error) {
    return next(error);
  }
};

exports.softDeleteUser = async function softDeleteUser(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, deleted: false },
      { deleted: true },
      { new: true, runValidators: true }
    ).populate('role');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      message: 'User deleted successfully',
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

exports.enableUser = async function enableUser(req, res, next) {
  return updateStatus(req, res, next, true);
};

exports.disableUser = async function disableUser(req, res, next) {
  return updateStatus(req, res, next, false);
};
