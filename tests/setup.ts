import prisma from '../src/prisma.js';

export async function setup() {
  await truncateAll();
}

export async function teardown() {
  await prisma.$disconnect();
}

async function truncateAll() {
  // Order matters due to FK constraints — delete children first
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  await prisma.$executeRawUnsafe('DELETE FROM checkin_tags');
  await prisma.$executeRawUnsafe('DELETE FROM checkins');
  await prisma.$executeRawUnsafe('DELETE FROM checkin_templates');
  await prisma.$executeRawUnsafe('DELETE FROM todo_versions');
  await prisma.$executeRawUnsafe('DELETE FROM todo_tags');
  await prisma.$executeRawUnsafe('DELETE FROM todos');
  await prisma.$executeRawUnsafe('DELETE FROM projects');
  await prisma.$executeRawUnsafe('DELETE FROM transaction_tags');
  await prisma.$executeRawUnsafe('DELETE FROM transactions');
  await prisma.$executeRawUnsafe('DELETE FROM categories');
  await prisma.$executeRawUnsafe('DELETE FROM tags');
  await prisma.$executeRawUnsafe('DELETE FROM users');
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
}

export { truncateAll };
