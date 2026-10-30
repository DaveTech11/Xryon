import { Crown, Sparkles, Zap } from "lucide-react";

// The Xyron plans, shared by the Premium page and the Codex plans screen.
export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₦0",
    period: "forever",
    description: "A simple way to start with Xyron.",
    features: ["10 AI messages/day", "5 image generations/day", "5 file uploads/day", "5 documentation requests/day"],
    icon: Sparkles,
  },
  {
    id: "premium",
    name: "Premium",
    price: "₦5,000",
    period: "/ month",
    description: "More room for work, images and files.",
    features: ["500 AI messages/day", "50 image generations/day", "100 file uploads/day", "100 documentation requests/day", "Codex & advanced features", "Priority processing"],
    icon: Zap,
  },
  {
    id: "premium_plus",
    name: "Premium+",
    price: "₦10,000",
    period: "/ month",
    description: "Maximum Xyron access for power users.",
    features: ["Unlimited AI messages", "200 image generations/day", "500 file uploads/day", "Unlimited documentation", "Advanced Codex", "Highest priority processing"],
    icon: Crown,
    popular: true,
  },
];
