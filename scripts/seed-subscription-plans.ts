import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { subscriptionPlan } from '@/lib/db/schema';

config({
  path: '.env.local',
});

const seedSubscriptionPlans = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not defined');
  }

  const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  console.log('🌱 Seeding subscription plans...');

  try {
    // Insert default subscription plans
    await db.insert(subscriptionPlan).values([
      {
        name: 'Premium Monthly',
        description: 'Unlimited requests, premium support',
        priceCents: '999', // $9.99
        maxRequestsPerDay: '-1', // Unlimited
        stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID || null, // Will be set when Stripe is configured
        isActive: true,
      },
    ]);

    console.log('✅ Subscription plans seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
  } finally {
    await connection.end();
  }
};

seedSubscriptionPlans().catch((err) => {
  console.error('❌ Seeding failed');
  console.error(err);
  process.exit(1);
});
