/**
 * Canonical preference option keys shared by the onboarding flow and the
 * profile panel. The stored value is the canonical key (stable across
 * languages); the display label comes from i18n (`interest.*`, `acc.*`,
 * `trans.*`). This keeps stored data consistent regardless of UI language.
 */

export const INTEREST_KEYS = [
  "history", "nature", "food", "shopping",
  "nightlife", "art", "adventure", "leisure",
  "family", "business", "photography", "religion", "sports",
] as const

export const ACCOMMODATION_OPTIONS = [
  { value: "budget", icon: "💰" },
  { value: "mid-range", icon: "🏨" },
  { value: "luxury", icon: "🌟" },
] as const

export const TRANSPORT_OPTIONS = [
  { value: "public", icon: "🚌" },
  { value: "walking", icon: "🚶" },
  { value: "rental", icon: "🚗" },
  { value: "taxi", icon: "🚕" },
] as const
