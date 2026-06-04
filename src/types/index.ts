// ============================================================================
// Trip Types
// ============================================================================

export type TripStatus = "draft" | "planning" | "confirmed" | "completed" | "cancelled"

export interface Destination {
  name: string
  country: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface DateRange {
  startDate: Date
  endDate: Date
  days: number
}

export interface TripWeatherForecast {
  date: string
  temp_max_c?: number | null
  temp_min_c?: number | null
  precip_probability?: number | null
  condition?: string
  emoji?: string
}

export interface TripWeather {
  city?: string
  country?: string
  source?: string
  current?: {
    temp_c?: number | null
    humidity?: number | null
    wind_speed_kmh?: number | null
    condition?: string
    emoji?: string
  }
  forecast?: TripWeatherForecast[]
  travel_tip?: string
}

export interface Trip {
  id: string
  name: string
  destination: Destination
  duration: DateRange
  preferences: UserPreferences
  itinerary: DayPlan[]
  status: TripStatus
  createdAt: Date
  updatedAt: Date
  /** Conversation that produced/owns this trip (sidebar = conversation list).
   *  Persisted with the trip so a conversation can be reopened and continued. */
  messages?: ChatMessage[]
}

// ============================================================================
// Day Plan Types
// ============================================================================

export interface DayPlan {
  dayNumber: number
  date: Date
  activities: Activity[]
  notes?: string
  estimatedBudget?: number
  /** Forecast for this specific day (from the Open-Meteo weather tool). */
  weather?: TripWeatherForecast
}

// ============================================================================
// Activity Types
// ============================================================================

export type ActivityType = "transportation" | "attraction" | "dining" | "accommodation" | "shopping" | "other"

export interface Location {
  name: string
  address: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface TimeSlot {
  start: string // HH:mm format
  end: string // HH:mm format
  duration: number // in minutes
}

export interface Activity {
  id: string
  type: ActivityType
  name: string
  description?: string
  location: Location
  time: TimeSlot
  cost?: number
  rating?: number
  bookingUrl?: string
  notes?: string
}

// Tool Integration - Enhanced Activity Types
export interface EnhancedActivity extends Activity {
  toolMetadata?: {
    sourceTool?: string
    confidence?: number
    lastUpdated?: Date
    bookingStatus?: "available" | "booked" | "full" | "unavailable"
    priceFromAPI?: boolean
    provider?: string
  }
  relatedActivities?: string[] // IDs of related activities
  alternatives?: string[] // IDs of alternative activities
}

// ============================================================================
// User Preference Types
// ============================================================================

export interface BudgetRange {
  min: number
  max: number
  currency: string
}

export interface UserPreferences {
  budget?: BudgetRange
  interests: string[]
  accommodationType?: ("budget" | "mid-range" | "luxury")[]
  transportationPreference?: ("public" | "rental" | "walking" | "taxi")[]
  dietaryRestrictions?: string[]
  accessibilityNeeds?: string[]
}

// ============================================================================
// Chat Types
// ============================================================================

export type MessageRole = "user" | "assistant" | "system"
export type MessageStatus = "thinking" | "streaming" | "completed" | "error"

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  status?: MessageStatus
  metadata?: {
    tripId?: string
    tokensUsed?: number
  }
}

// ============================================================================
// Agent Types
// ============================================================================

export type AgentType = "supervisor" | "planner" | "recommender" | "booking" | "document"

export interface AgentTask {
  id: string
  type: AgentType
  description: string
  status: "pending" | "in_progress" | "completed" | "failed"
  result?: unknown
}

// AGUI - Agent Phase Types
export type AgentPhase = "idle" | "thinking" | "planning" | "executing" | "completed" | "error"

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: "pending" | "running" | "completed" | "failed"
  result?: unknown
  error?: string
  timestamp: Date
}

// ============================================================================
// Storage Types
// ============================================================================

export interface TripMetadata {
  id: string
  name: string
  destination: string
  duration: number
  status: TripStatus
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// Export Types
// ============================================================================

export interface ExportOptions {
  format: "pdf" | "json" | "markdown"
  includeItinerary: boolean
  includeBookingDetails: boolean
  includeMap: boolean
}

// ============================================================================
// Session Management Types
// ============================================================================

export interface ConversationMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  tripId?: string
  destinations?: string[]
}

export interface DestinationInteraction {
  destination: string
  queryCount: number
  lastQueried: Date
  positiveFeedback: number
  negativeFeedback: number
  saved: boolean
}

export interface RecommendationFeedback {
  id: string
  tripId: string
  recommendationType: "destination" | "hotel" | "restaurant" | "activity"
  itemName: string
  feedback: "positive" | "negative" | "neutral"
  timestamp: Date
  reason?: string
}

export interface UserSession {
  id: string
  userId?: string
  preferences: UserPreferences
  conversationHistory: ConversationMessage[]
  destinationInteractions: DestinationInteraction[]
  feedback: RecommendationFeedback[]
  recentlyViewedTrips: string[]
  favoriteDestinations: string[]
  onboardingCompleted: boolean
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// A2UI - Agent-to-User Interaction Types
// ============================================================================

export interface TripContext {
  tripId?: string
  destination?: Destination
  dateRange?: DateRange
  preferences?: UserPreferences
  currentPhase: "gathering" | "planning" | "refining" | "booking"
  completedSteps: string[]
  pendingQuestions: string[]
}

export interface Question {
  id: string
  type: "destination" | "dates" | "preferences" | "budget" | "confirmation"
  text: string
  options?: QuestionOption[]
  required: boolean
  dependsOn?: string // ID of question this depends on
  context?: TripContext
  validation?: (answer: unknown) => boolean | string
}

export interface QuestionOption {
  id: string
  label: string
  value: string | number | boolean
  icon?: string
  description?: string
}

export interface QuickTripTemplate {
  id: string
  name: string
  description: string
  destination: string
  days: number
  estimatedBudget: number
  interests: string[]
  basedOnHistory: boolean
}

export interface BehaviorAnalytics {
  topInterests: { interest: string; score: number }[]
  preferredDestinations: { destination: string; score: number }[]
  averageTripDuration: number
  preferredAccommodationTypes: string[]
  preferredTransportationTypes: string[]
  totalTripsPlanned: number
  favoriteSeasons: string[]
}

export interface DataExportRequest {
  format: "json" | "csv"
  includeHistory: boolean
  includeFeedback: boolean
  includePreferences: boolean
}
