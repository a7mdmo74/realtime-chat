/**
 * prisma/seed.ts
 *
 * Seeds the database with development data.
 * Run with: npm run prisma:seed
 *
 * WHY SEED FILES MATTER:
 * - Onboarding: new devs can clone & immediately have working data
 * - Testing: deterministic data for manual QA
 * - Demos: show off product features without manual setup
 */

import { PrismaClient, Role, ChatType, MemberRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const BCRYPT_ROUNDS = 10; // Lower for seed speed
  const PASSWORD_HASH = await bcrypt.hash('Password123!', BCRYPT_ROUNDS);

  // ─── Users ──────────────────────────────────────────────────────────────────
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      username: 'alice',
      displayName: 'Alice Johnson',
      passwordHash: PASSWORD_HASH,
      bio: 'Frontend wizard and coffee enthusiast',
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      username: 'bob',
      displayName: 'Bob Smith',
      passwordHash: PASSWORD_HASH,
      bio: 'Backend engineer. Loves distributed systems.',
      emailVerified: true,
    },
  });

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@example.com' },
    update: {},
    create: {
      email: 'charlie@example.com',
      username: 'charlie',
      displayName: 'Charlie Brown',
      passwordHash: PASSWORD_HASH,
      emailVerified: true,
    },
  });

  console.log('✅ Users created:', alice.username, bob.username, charlie.username);

  // ─── Private Chat (Alice ↔ Bob) ──────────────────────────────────────────────
  const existingDM = await prisma.chat.findFirst({
    where: {
      type: ChatType.PRIVATE,
      AND: [
        { members: { some: { userId: alice.id } } },
        { members: { some: { userId: bob.id } } },
      ],
    },
  });

  const dmChat = existingDM ?? await prisma.chat.create({
    data: {
      type: ChatType.PRIVATE,
      members: {
        create: [
          { userId: alice.id, role: MemberRole.OWNER },
          { userId: bob.id, role: MemberRole.MEMBER },
        ],
      },
    },
  });

  // ─── Group Chat ──────────────────────────────────────────────────────────────
  const existingGroup = await prisma.chat.findFirst({
    where: { name: 'Engineering Team', type: ChatType.GROUP },
  });

  const groupChat = existingGroup ?? await prisma.chat.create({
    data: {
      name: 'Engineering Team',
      description: 'Backend and frontend discussions',
      type: ChatType.GROUP,
      members: {
        create: [
          { userId: alice.id, role: MemberRole.OWNER },
          { userId: bob.id, role: MemberRole.ADMIN },
          { userId: charlie.id, role: MemberRole.MEMBER },
        ],
      },
    },
  });

  console.log('✅ Chats created');

  // ─── Messages ────────────────────────────────────────────────────────────────
  const dmMsgCount = await prisma.message.count({ where: { chatId: dmChat.id } });

  if (dmMsgCount === 0) {
    await prisma.message.createMany({
      data: [
        {
          chatId: dmChat.id,
          senderId: alice.id,
          content: 'Hey Bob! How\'s the new Redis integration going?',
        },
        {
          chatId: dmChat.id,
          senderId: bob.id,
          content: 'Going great! Just got the pub/sub working for multi-instance scaling.',
        },
        {
          chatId: dmChat.id,
          senderId: alice.id,
          content: 'Amazing! Let\'s review it in the group chat.',
        },
      ],
    });

    await prisma.message.createMany({
      data: [
        {
          chatId: groupChat.id,
          senderId: alice.id,
          content: 'Welcome everyone to the Engineering Team chat! 🚀',
        },
        {
          chatId: groupChat.id,
          senderId: bob.id,
          content: 'Excited to be here. Let\'s ship some great features!',
        },
        {
          chatId: groupChat.id,
          senderId: charlie.id,
          content: 'Ready to contribute! What\'s on the roadmap?',
        },
      ],
    });

    console.log('✅ Messages seeded');
  }

  console.log('\n📋 Seed Summary:');
  console.log('─────────────────────────────────────');
  console.log('Test credentials (all users):');
  console.log('  alice@example.com / Password123!  (ADMIN)');
  console.log('  bob@example.com   / Password123!  (USER)');
  console.log('  charlie@example.com / Password123!  (USER)');
  console.log('─────────────────────────────────────');
  console.log(`  Private chat ID: ${dmChat.id}`);
  console.log(`  Group chat ID:   ${groupChat.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
