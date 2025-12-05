import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import OrderReceivedEmail from "@/components/emails/OrderReceivedEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      return new Response("Invalid signature", { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (!session.customer_details?.email) {
        throw new Error("Missing user email");
      }

      const { userId, orderId } = session.metadata || {
        userId: null,
        orderId: null,
      };

      if (!userId || !orderId) {
        throw new Error("Invalid request metadata");
      }

      // Use billing address for both shipping and billing
      const billingAddress = session.customer_details?.address;
      const customerName = session.customer_details?.name;
      const customerPhone = session.customer_details?.phone;

      if (!billingAddress || !customerName) {
        throw new Error("Missing billing address or customer name");
      }

      // Create shipping address (using billing address data)
      const createdShippingAddress = await db.shippingAddress.create({
        data: {
          name: customerName,
          street: billingAddress.line1 || "",
          city: billingAddress.city || "",
          postalCode: billingAddress.postal_code || "",
          country: billingAddress.country || "",
          state: billingAddress.state || null,
          phoneNumber: customerPhone || null,
        },
      });

      // Create billing address
      const createdBillingAddress = await db.billingAddress.create({
        data: {
          name: customerName,
          street: billingAddress.line1 || "",
          city: billingAddress.city || "",
          postalCode: billingAddress.postal_code || "",
          country: billingAddress.country || "",
          state: billingAddress.state || null,
          phoneNumber: customerPhone || null,
        },
      });

      // Update order
      const updatedOrder = await db.order.update({
        where: {
          id: orderId,
        },
        data: {
          isPaid: true,
          shippingAddressId: createdShippingAddress.id,
          billingAddressId: createdBillingAddress.id,
        },
      });

      // Send email
      await resend.emails.send({
        from: "CaseCobra <koushikachar2017@gmail.com>",
        to: [session.customer_details.email],
        subject: "Thanks for your order!",
        react: OrderReceivedEmail({
          orderId,
          orderDate: updatedOrder.createdAt.toLocaleDateString(),
          shippingAddress: {
            id: createdShippingAddress.id,
            name: customerName,
            street: billingAddress.line1 || "",
            city: billingAddress.city || "",
            postalCode: billingAddress.postal_code || "",
            country: billingAddress.country || "",
            state: billingAddress.state || null,
            phoneNumber: customerPhone || null,
          },
        }),
      });
    }

    return NextResponse.json({ result: event, ok: true });
  } catch (err) {
    console.error("Webhook error:", err);

    return NextResponse.json(
      {
        message: "Something went wrong",
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
