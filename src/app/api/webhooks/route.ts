import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      return new Response("Missing Stripe signature", { status: 400 });
    }

    // Verify webhook
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session & {
        shipping_details?: {
          address?: Stripe.Address;
        };
      };

      // Validate metadata
      const userId = session.metadata?.userId;
      const orderId = session.metadata?.orderId;

      if (!userId || !orderId) {
        throw new Error("Missing metadata: userId or orderId");
      }

      // Extract addresses safely
      const billingAddress = session.customer_details?.address || null;
      const shippingAddress = session.shipping_details?.address || null;

      // Update order
      await db.order.update({
        where: { id: orderId },
        data: {
          isPaid: true,
          shippingAddress: shippingAddress
            ? {
                create: {
                  name: session.customer_details?.name || "",
                  city: shippingAddress.city || "",
                  country: shippingAddress.country || "",
                  postalCode: shippingAddress.postal_code || "",
                  street: shippingAddress.line1 || "",
                  state: shippingAddress.state || "",
                },
              }
            : undefined,
          billingAddress: billingAddress
            ? {
                create: {
                  name: session.customer_details?.name || "",
                  city: billingAddress.city || "",
                  country: billingAddress.country || "",
                  postalCode: billingAddress.postal_code || "",
                  street: billingAddress.line1 || "",
                  state: billingAddress.state || "",
                },
              }
            : undefined,
        },
      });
    }

    return new Response("Webhook Received", { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return new Response(`Webhook Error: ${error.message}`, { status: 400 });
  }
}
