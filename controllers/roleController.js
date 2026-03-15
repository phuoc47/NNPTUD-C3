const mongoose = require('mongoose');
const Role = require('../models/Role');
const User = require('../models/User');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function getUnknownFields(payload, allowedFields) {
  return Object.keys(payload || {}).filter((key) => !allowedFields.has(key));
}

exports.createRole = async function createRole(req, res, next) {
  try {
    const unknownFields = getUnknownFields(req.body, new Set(['name', 'description']));
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const role = await Role.create({
      name: req.body.name,
      description: req.body.description,
    });

    return res.status(201).json({ data: role });
  } catch (error) {
    return next(error);
  }
};

exports.getAllRoles = async function getAllRoles(req, res, next) {
  try {
    const roles = await Role.find().sort({ createdAt: -1 });
    return res.status(200).json({ data: roles });
  } catch (error) {
    return next(error);
  }
};

exports.getRoleById = async function getRoleById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    return res.status(200).json({ data: role });
  } catch (error) {
    return next(error);
  }
};

exports.updateRole = async function updateRole(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const unknownFields = getUnknownFields(req.body, new Set(['name', 'description']));
    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: 'Unknown field(s) in request body',
        details: { unknownFields },
      });
    }

    const role = await Role.findByIdAndUpdate(
      id,
      {
        name: req.body.name,
        description: req.body.description,
      },
      { new: true, runValidators: true }
    );

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    return res.status(200).json({ data: role });
  } catch (error) {
    return next(error);
  }
};

exports.deleteRole = async function deleteRole(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const deletedRole = await Role.findByIdAndDelete(id);
    if (!deletedRole) {
      return res.status(404).json({ message: 'Role not found' });
    }

    return res.status(200).json({
      message: 'Role deleted successfully',
      data: deletedRole,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getUsersByRole = async function getUsersByRole(req, res, next) {
  try {
    const { roleId } = req.params;
    if (!isValidObjectId(roleId)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const users = await User.find({
      role: roleId,
      deleted: false,
    })
      .populate('role')
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: users });
  } catch (error) {
    return next(error);
  }
};
