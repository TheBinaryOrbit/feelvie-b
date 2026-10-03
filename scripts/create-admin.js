// Usage: npm run create-admin -- --email admin@feelvie.app --password "a-strong-password" --name "Admin"
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import * as adminService from '../src/services/admin.service.js';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const email = arg('email');
const password = arg('password');
const name = arg('name');

if (!email || !password) {
  console.error('Usage: npm run create-admin -- --email <email> --password <password> [--name <name>]');
  process.exit(1);
}

try {
  await connectDB();
  const admin = await adminService.create({ email, password, name });
  console.log(`Admin created: ${admin.email} (${admin._id})`);
} catch (err) {
  const details = err.errors ? Object.values(err.errors).map((e) => e.message).join('; ') : err.message;
  console.error(`Failed to create admin: ${details}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
