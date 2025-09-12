import { type NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { stripe, STRIPE_CONFIG } from '@/lib/stripe/config';
import { syncSubscriptionFromStripe } from '@/lib/stripe/subscription';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    console.error('No Stripe signature found');
    return NextResponse.json({ error: 'No signature found' }, { status: 400 });
  }

  if (!STRIPE_CONFIG.webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_CONFIG.webhookSecret,
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(subscription.id);
        console.log(
          `Processed ${event.type} for subscription ${subscription.id}`,
        );
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (
          session.mode === 'subscription' &&
          session.subscription &&
          typeof session.subscription === 'string'
        ) {
          await syncSubscriptionFromStripe(session.subscription);
          console.log(
            `Processed checkout completion for subscription ${session.subscription}`,
          );
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any; // Using any to access subscription property
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          await syncSubscriptionFromStripe(subscriptionId);
          console.log(
            `Processed payment success for subscription ${subscriptionId}`,
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any; // Using any to access subscription property
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          await syncSubscriptionFromStripe(subscriptionId);
          console.log(
            `Processed payment failure for subscription ${subscriptionId}`,
          );
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }
}
