import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { createBillingCheckout, verifyBillingPayment, fetchBilling } from "@/services/api";
import { CheckCircle2, Zap, Shield, Server, Rocket, Crown, Loader2 } from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing · Unwire AI" }] }),
  component: PricingPage,
});

const PLANS = [
  {
    id: "free", name: "Free", price: "₹0", period: "/forever",
    description: "For individuals getting started",
    features: [
      "1 server", "1 project", "2 team members",
      "20 AI requests/day", "5 deployments/month",
      "Basic monitoring", "Community support",
    ],
    cta: "Current Plan", disabled: true, popular: false,
  },
  {
    id: "pro", name: "Pro", price: "₹1,999", period: "/month",
    description: "For growing teams and businesses",
    features: [
      "20 servers", "50 projects", "15 team members",
      "500 AI requests/day", "200 deployments/month",
      "Advanced monitoring", "Deployment pipeline",
      "Audit logs", "API keys", "Custom alerts",
      "Team management", "Priority email support",
    ],
    cta: "Upgrade to Pro", disabled: false, popular: true,
  },
  {
    id: "enterprise", name: "Enterprise", price: "₹9,999", period: "/month",
    description: "For large organizations",
    features: [
      "Unlimited servers", "Unlimited projects", "Unlimited members",
      "Unlimited AI requests", "Unlimited deployments",
      "Everything in Pro", "SSO / SAML",
      "Priority support + SLA", "Custom integrations",
      "Dedicated account manager",
    ],
    cta: "Upgrade to Enterprise", disabled: false, popular: false,
  },
];

function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(planId: string) {
    if (planId === "free") return;
    setLoading(planId);

    try {
      const checkout = await createBillingCheckout(planId);

      // Open Razorpay checkout
      const options = {
        key: checkout.razorpayKeyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "Unwire AI",
        description: checkout.planName,
        order_id: checkout.orderId,
        handler: async (response: any) => {
          try {
            await verifyBillingPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success("Payment successful! Plan upgraded.");
            setTimeout(() => window.location.reload(), 1500);
          } catch {
            toast.error("Payment verification failed. Contact support.");
          }
        },
        theme: { color: "#6366f1" },
      };

      // Load Razorpay script dynamically
      if (!(window as any).Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => {
          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        };
        document.body.appendChild(script);
      } else {
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout>
        <div className="max-w-[1100px] mx-auto px-6 py-10">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold">Choose your plan</h1>
            <p className="text-muted-foreground mt-2">
              Scale your infrastructure monitoring with the right plan for your team.
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`glass rounded-2xl p-6 border relative transition hover:shadow-xl ${
                plan.popular ? "border-primary/50 shadow-lg shadow-primary/10" : "border-border/40"
              }`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full btn-primary-grad text-xs font-medium">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    {plan.id === "free" && <Server className="h-4 w-4 text-muted-foreground" />}
                    {plan.id === "pro" && <Rocket className="h-4 w-4 text-primary" />}
                    {plan.id === "enterprise" && <Crown className="h-4 w-4 text-yellow-400" />}
                    {plan.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button onClick={() => handleUpgrade(plan.id)}
                  disabled={plan.disabled || loading === plan.id}
                  className={`w-full py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50 ${
                    plan.popular
                      ? "btn-primary-grad"
                      : plan.disabled
                        ? "glass border border-border/50 text-muted-foreground"
                        : "glass border border-primary/30 text-primary hover:bg-primary/10"
                  }`}>
                  {loading === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  ) : plan.cta}
                </button>
              </div>
            ))}
          </div>

          {/* FAQ / info */}
          <div className="text-center mt-12 text-xs text-muted-foreground">
            <p>All plans include a 14-day free trial on Pro features.</p>
            <p className="mt-1">Payments processed securely via Razorpay. Cancel anytime.</p>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
