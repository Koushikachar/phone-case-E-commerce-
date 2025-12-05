import OrderReceivedEmail from "@/components/emails/OrderReceivedEmail";
import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { Resend } from "resend";
import Stripe from "stripe";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      return new Response("Missing Stripe signature", { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session & {
        shipping_details?: { address?: Stripe.Address };
      };

      const userId = session.metadata?.userId;
      const orderId = session.metadata?.orderId;

      if (!userId || !orderId) {
        throw new Error("Missing metadata: userId or orderId");
      }

      const billingAddress = session.customer_details?.address;
      const shippingAddress = session.shipping_details?.address;

      const updatedOrder = await db.order.update({
        where: { id: orderId },
        data: {
          isPaid: true,
          shippingAddress: {
            create: {
              name: session.customer_details?.name || "",
              city: shippingAddress?.city || "",
              country: shippingAddress?.country || "",
              postalCode: shippingAddress?.postal_code || "",
              street: shippingAddress?.line1 || "",
              state: shippingAddress?.state || "",
            },
          },
          billingAddress: {
            create: {
              name: session.customer_details?.name || "",
              city: billingAddress?.city || "",
              country: billingAddress?.country || "",
              postalCode: billingAddress?.postal_code || "",
              street: billingAddress?.line1 || "",
              state: billingAddress?.state || "",
            },
          },
        },
      });

      // 📩 SEND EMAIL CORRECTLY (JSX ELEMENT)
      await resend.emails.send({
        from: "CaseCobra <hello@joshtriedcoding.com>",
        to: ["koushikachar2017@gmail.com"],
        subject: "Thanks for your order!",
        react: OrderReceivedEmail({
          orderId,
          orderDate: updatedOrder.createdAt.toLocaleDateString(),
          // @ts-ignore
          shippingAddress: {
            name: session.customer_details!.name!,
            city: shippingAddress!.city!,
            country: shippingAddress!.country!,
            postalCode: shippingAddress!.postal_code!,
            street: shippingAddress!.line1!,
            state: shippingAddress!.state,
          },
        }),
      });
    }

    return new Response("Webhook received", { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response(`Webhook Error: ${error.message}`, { status: 400 });
  }
}
