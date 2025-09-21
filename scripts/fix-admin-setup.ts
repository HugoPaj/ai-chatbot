import { db } from '../lib/db/index.js';
import { org, user } from '../lib/db/schema.js';
import { createUser } from '../lib/db/queries.js';

async function fixAdminSetup() {
  console.log('🔍 Checking current database state...\n');

  // Check organizations
  console.log('=== Organizations ===');
  const orgs = await db.select().from(org);
  console.log(orgs);

  // Check users
  console.log('\n=== Users ===');
  const users = await db.select().from(user);
  console.log(users);

  // Check if gmail.com organization exists
  const gmailOrg = orgs.find((o) => o.domain === 'gmail.com');

  if (!gmailOrg) {
    console.log('\n❌ Gmail.com organization not found. Creating...');
    const newOrg = await db
      .insert(org)
      .values({
        name: 'Platform Admin',
        domain: 'gmail.com',
        type: 'company',
        isActive: true,
        maxUsersPerDay: '-1',
      })
      .returning();
    console.log('✅ Created organization:', newOrg[0]);
  } else {
    console.log('\n✅ Gmail.com organization exists:', gmailOrg);
  }

  // Check if admin user exists
  const adminUser = users.find((u) => u.email === 'hugo.paja05@gmail.com');

  if (!adminUser) {
    console.log('\n❌ Admin user not found. Creating...');
    try {
      await createUser('hugo.paja05@gmail.com', 'admin123');
      console.log('✅ Created admin user with password: admin123');
    } catch (error) {
      console.error('❌ Failed to create admin user:', error);
    }
  } else {
    console.log('\n✅ Admin user exists:', adminUser);
  }

  console.log('\n🎉 Setup complete! You can now login with:');
  console.log('Email: hugo.paja05@gmail.com');
  console.log('Password: admin123');
}

fixAdminSetup().catch(console.error);
