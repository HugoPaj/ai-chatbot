import 'server-only';

import { stripe } from './config';
import type Stripe from 'stripe';
import { userSubscription, subscriptionPlan } from '@/lib/db/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, } from 'drizzle-orm';

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface SubscriptionData {
  id: string;
  customerId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  priceId: string;
}

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession({
  userId,
  userEmail,
  priceId,
  successUrl,
  cancelUrl,
}: CreateCheckoutSessionParams) {
  try {
    // Check if customer already exists in Stripe
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw new Error('Failed to create checkout session');
  }
}

/**
 * Create a customer portal session for subscription management
 */
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string,
) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    throw new Error('Failed to create customer portal session');
  }
}

/**
 * Sync subscription data from Stripe to database
 */
export async function syncSubscriptionFromStripe(
  subscriptionId: string,
): Promise<void> {
  try {
    const subscription: Stripe.Subscription =
      await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['customer'],
      });

    const customer = subscription.customer as Stripe.Customer;
    const userId = customer.metadata?.userId;

    if (!userId) {
      console.error('No userId found in customer metadata');
      return;
    }

    // Get the subscription plan based on price ID
    const priceId = subscription.items.data[0].price.id;
    const plans = await db
      .select()
      .from(subscriptionPlan)
      .where(eq(subscriptionPlan.stripePriceId, priceId));

    if (plans.length === 0) {
      console.error(`No subscription plan found for price ID: ${priceId}`);
      return;
    }

    const plan = plans[0];

    // Check if subscription already exists
    const existingSubscription = await db
      .select()
      .from(userSubscription)
      .where(eq(userSubscription.stripeSubscriptionId, subscriptionId))
      .limit(1);

    const subscriptionData = {
      userId,
      planId: plan.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customer.id,
      status: subscription.status,
      currentPeriodStart: new Date(
        (subscription as any).current_period_start * 1000,
      ),
      currentPeriodEnd: new Date(
        (subscription as any).current_period_end * 1000,
      ),
      cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
      updatedAt: new Date(),
    };

    if (existingSubscription.length > 0) {
      // Update existing subscription
      await db
        .update(userSubscription)
        .set(subscriptionData)
        .where(eq(userSubscription.stripeSubscriptionId, subscriptionId));
    } else {
      // Create new subscription
      await db.insert(userSubscription).values({
        ...subscriptionData,
        createdAt: new Date(),
      });
    }
  } catch (error) {
    console.error('Error syncing subscription from Stripe:', error);
    throw error;
  }
}

/**
 * Cancel subscription in Stripe
 */
export async function cancelSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Sync the updated subscription to database
    await syncSubscriptionFromStripe(subscriptionId);

    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    // Sync the updated subscription to database
    await syncSubscriptionFromStripe(subscriptionId);

    return subscription;
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw new Error('Failed to reactivate subscription');
  }
}
