'use strict';

const ROOM_TYPES = ['Shared Room', 'Private Room', 'Bunk Bed', 'Studio Type'];
const AMENITIES = ['Wi-Fi', 'Furnished', 'Laundry', 'Utilities included', 'CCTV'];
const INQUIRY_STATUSES = ['new', 'contacted', 'closed'];
const MIN_PRICE = 1000;
const MAX_PRICE = 10000; // matches the budget slider on the Find Dorms page

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isInt = (v) => Number.isInteger(v) || (typeof v === 'string' && /^-?\d+$/.test(v.trim()));

function validateSignup(body = {}) {
  const errors = {};
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === 'owner' ? 'owner' : body.role === 'student' ? 'student' : null;
  if (name.length < 2 || name.length > 80) errors.name = 'Please enter your full name (2-80 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) errors.email = 'Please enter a valid email address.';
  if (password.length < 6 || password.length > 128) errors.password = 'Password must be 6-128 characters.';
  if (!role) errors.role = 'Please choose Student or Dormitory owner.';
  return { errors, value: { name, email, password, role } };
}

function validateDorm(body = {}) {
  const errors = {};
  const v = {};

  v.name = str(body.name);
  if (v.name.length < 3 || v.name.length > 80) errors.name = 'Dorm name must be 3-80 characters.';

  v.location = str(body.location);
  if (v.location.length < 3 || v.location.length > 160) errors.location = 'Location must be 3-160 characters.';

  if (!isInt(body.price) || +body.price < MIN_PRICE || +body.price > MAX_PRICE)
    errors.price = `Monthly rent must be a whole number from ₱${MIN_PRICE} to ₱${MAX_PRICE.toLocaleString('en-PH')}.`;
  v.price = Number(body.price);

  if (!isInt(body.utilities) || +body.utilities < 0 || +body.utilities > 50000)
    errors.utilities = 'Estimated utilities must be a whole number from ₱0 to ₱5,000.';
  v.utilities = Number(body.utilities);

  v.room = body.room;
  if (!ROOM_TYPES.includes(v.room)) errors.room = 'Please choose a valid room type.';

  if (!isInt(body.spaces) || +body.spaces < 0 || +body.spaces > 99) errors.spaces = 'Available spaces must be a whole number from 0 to 99.';
  v.spaces = Number(body.spaces);

  const dist = Number(body.distance);
  if (body.distance === '' || body.distance == null || !Number.isFinite(dist) || dist < 0 || dist > 20)
    errors.distance = 'Distance must be a number from 0 to 20 km.';
  v.distance = Math.round(dist * 10) / 10;

  v.description = str(body.description);
  if (v.description.length < 10 || v.description.length > 600) errors.description = 'Description must be 10-600 characters.';

  const amenities = Array.isArray(body.amenities) ? body.amenities : [];
  if (!amenities.every((a) => AMENITIES.includes(a))) errors.amenities = 'One or more amenities are not recognised.';
  v.amenities = [...new Set(amenities.filter((a) => AMENITIES.includes(a)))];

  v.contactName = str(body.contactName);
  if (v.contactName.length > 80) errors.contactName = 'Contact name must be 80 characters or fewer.';

  v.isPublished = body.isPublished === undefined ? true : Boolean(body.isPublished);
  return { errors, value: v };
}

function validateInquiry(body = {}) {
  const errors = {};
  const message = str(body.message);
  const phone = str(body.phone);
  if (!isInt(body.dormId)) errors.dormId = 'Please choose a dorm.';
  if (message.length < 10 || message.length > 800) errors.message = 'Message must be 10-800 characters.';
  if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) errors.phone = 'Please enter a valid contact number or leave it blank.';
  return { errors, value: { dormId: Number(body.dormId), message, phone: phone || null } };
}

function fail(res, errors) {
  return res.status(400).json({ error: 'Please check the highlighted details and try again.', details: errors });
}

module.exports = {
  ROOM_TYPES, AMENITIES, INQUIRY_STATUSES, MIN_PRICE, MAX_PRICE,
  validateSignup, validateDorm, validateInquiry, fail, isInt
};
