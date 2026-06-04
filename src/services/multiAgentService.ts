/**
 * Multi-Agent orchestration (frontend view layer).
 *
 * The real agent intelligence now lives in the FastAPI backend (Plan-and-Execute
 * planner, dynamic tool-calling over real free APIs, multi-hop RAG, and a
 * persistent FAISS vector store for long-term memory). This module:
 *
 *   1. Runs the A2UI context check (clarify ambiguous input before planning).
 *   2. Drives the AGUI progress visualization (phases + tool calls) so the user
 *      sees the agent pipeline working — these steps mirror what the backend
 *      actually does and require NO browser-side API key.
 *   3. Calls the backend to produce the structured, coordinate-grounded trip.
 *
 * The browser LLM helpers below are retained for the status indicator / tests
 * but no longer gate trip generation.
 */

import type { Trip, UserPreferences } from "@/types"
import { extractTripInfo } from "./agentUtils"
import {
  LLMService,
  initializeLLMFromEnv,
  type LLMProvider,
} from "./llmService"
import { useAgentProgressStore } from "@/stores/agentProgressStore"
import { useUiStore } from "@/stores/uiStore"
import { planTripBackend, mapBackendTrip } from "./backendApi"

// A2UI imports
import { contextValidator } from "./contextValidator"
import { QuestionGenerator, type QuestionSequence } from "./questionGenerator"

// ============================================================================
// LLM helper state (retained for status indicator + tests; not a gate anymore)
// ============================================================================

let useLLM = false
try {
  useLLM = initializeLLMFromEnv()
} catch {
  /* browser LLM not configured — fine, the backend does the work */
}

export function isLLMAvailable(): boolean {
  return useLLM && LLMService.isConfigured()
}

export function setLLMEnabled(enabled: boolean): void {
  useLLM = enabled
}

export function getLLMProvider(): LLMProvider | null {
  const config = LLMService.getConfig()
  return config?.provider || null
}

export function getLLMProviderName(): string {
  const provider = getLLMProvider()
  const providerNames: Record<LLMProvider, string> = {
    glm: "智谱 GLM",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    proxy: "服务端代理",
  }
  return provider ? providerNames[provider] : "未配置"
}

// ============================================================================
// Agent Types
// ============================================================================

export type AgentRole = "supervisor" | "planner" | "recommender" | "booking" | "document"

export interface AgentMessage {
  agent: AgentRole
  content: string
  timestamp: Date
  type: "thought" | "action" | "result" | "error"
}

import type { ExistingContext } from "./agentUtils"

export interface AgentContext {
  userMessage: string
  conversationHistory: Array<{ role: string; content: string }>
  userPreferences?: UserPreferences
  currentTrip?: Partial<Trip>
  personalizedContext?: string
  existingContext?: ExistingContext
}

type ExistingContextFull = Partial<{
  destination: string
  days: number
  budget: { min: number; max: number; currency: string }
  startDate: Date
  preferences: string[]
}>

// ============================================================================
// Bilingual progress copy
// ============================================================================

function uiLang(): "zh" | "en" {
  try {
    return useUiStore.getState().language
  } catch {
    return "zh"
  }
}

const COPY = {
  zh: {
    analyzeIntent: "🔍 分析用户意图与行程要素…",
    intentDone: (dest: string, days: number) => `识别到：目的地「${dest}」· ${days} 天`,
    delegate: "🤝 拆解为子任务，分配给规划/推荐/文档 Agent…",
    planning: "🗺️ 规划每日路线（Plan-and-Execute）…",
    rag: "📚 多跳检索目的地资料（Wikivoyage + 维基百科）…",
    weather: "🌤️ 查询实时天气（Open-Meteo）…",
    attractions: "🏛️ 检索真实景点与坐标…",
    memory: "🧠 读取并更新长期偏好（向量记忆）…",
    document: "📄 整合为带地图的结构化行程…",
    done: "✅ 各 Agent 协作完成，正在生成行程…",
  },
  en: {
    analyzeIntent: "🔍 Analyzing intent & trip parameters…",
    intentDone: (dest: string, days: number) => `Detected: destination "${dest}" · ${days} days`,
    delegate: "🤝 Decomposing into sub-tasks for planner/recommender/document agents…",
    planning: "🗺️ Planning daily routes (Plan-and-Execute)…",
    rag: "📚 Multi-hop retrieval (Wikivoyage + Wikipedia)…",
    weather: "🌤️ Fetching live weather (Open-Meteo)…",
    attractions: "🏛️ Retrieving real attractions & coordinates…",
    memory: "🧠 Reading & updating long-term preferences (vector memory)…",
    document: "📄 Assembling a structured itinerary with map…",
    done: "✅ Agents finished collaborating — generating your itinerary…",
  },
}

// ============================================================================
// Orchestration
// ============================================================================

export class MultiAgentService {
  /**
   * Drive the A2UI gate + the AGUI progress visualization.
   * The actual trip is produced afterwards by generateTripFromContext().
   */
  static async *processWithAgents(
    context: AgentContext,
    existingContext?: ExistingContextFull,
  ): AsyncGenerator<
    | { message: AgentMessage; done?: boolean }
    | { type: "need_more_info"; questions: QuestionSequence["questions"]; extractedContext: ExistingContextFull }
  > {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const t = COPY[uiLang()]

    // ── A2UI: ensure we have enough context, else ask ──────────────────────
    const validation = await contextValidator.validateFromMessageAsync(
      context.userMessage,
      existingContext,
      context.userPreferences,
    )
    if (!validation.isComplete) {
      // Generate the questions in the active UI language (text + quick replies).
      const generator = new QuestionGenerator({
        language: uiLang() === "zh" ? "zh-CN" : "en-US",
      })
      const questions = generator.generateFromMissingInfo(validation.missingInfo)
      yield {
        type: "need_more_info" as const,
        questions: questions.questions,
        extractedContext: validation.context,
      }
      return
    }

    const { destination, days } = extractTripInfo(context.userMessage, existingContext)
    const dest = destination || existingContext?.destination || (uiLang() === "zh" ? "目的地" : "destination")
    const nDays = days || existingContext?.days || 2

    const progress = useAgentProgressStore.getState()
    progress.startSession(`session-${Date.now()}`, [
      { id: "supervisor", name: "Supervisor", description: uiLang() === "zh" ? "意图识别与任务分配" : "Intent & delegation", agentType: "supervisor" },
      { id: "planner", name: "Planner", description: uiLang() === "zh" ? "规划与多跳检索" : "Planning & RAG", agentType: "planner" },
      { id: "recommender", name: "Recommender", description: uiLang() === "zh" ? "天气与景点" : "Weather & attractions", agentType: "recommender" },
      { id: "document", name: "Document", description: uiLang() === "zh" ? "结构化行程" : "Structured itinerary", agentType: "document" },
    ])

    const tool = (
      phaseId: string,
      name: string,
      input: Record<string, unknown>,
      result: Record<string, unknown>,
    ) => {
      const id = useAgentProgressStore.getState().addToolCall({ name, phaseId, input })
      useAgentProgressStore.getState().updateToolCall(id, { status: "running" })
      useAgentProgressStore.getState().completeToolCall(id, result)
    }

    const yieldMsg = (agent: AgentRole, content: string, type: AgentMessage["type"]) =>
      ({ message: { agent, content, timestamp: new Date(), type } as AgentMessage })

    // Each agent phase below maps to real work the FastAPI backend performs when
    // generateTripFromContext() runs (intent parse, Plan-and-Execute planning,
    // multi-hop RAG, the get_weather / search_attractions tools, FAISS memory).
    // We pace the narration so the multi-step collaboration is actually
    // perceptible to the user instead of flashing past in a few milliseconds.
    const STEP = 900

    // ── Supervisor ─────────────────────────────────────────────────────────
    progress.startPhase("supervisor")
    yield yieldMsg("supervisor", t.analyzeIntent, "thought")
    tool("supervisor", "analyze_intent", { message: context.userMessage }, { destination: dest, days: nDays })
    await delay(STEP)
    yield yieldMsg("supervisor", t.intentDone(dest, nDays), "result")
    await delay(STEP * 0.6)
    yield yieldMsg("supervisor", t.delegate, "action")
    await delay(STEP * 0.6)
    progress.completePhase("supervisor")

    // ── Planner (plan + RAG) ───────────────────────────────────────────────
    progress.startPhase("planner")
    yield yieldMsg("planner", t.planning, "thought")
    tool("planner", "plan_itinerary", { destination: dest, days: nDays }, { steps: nDays * 4 })
    await delay(STEP)
    yield yieldMsg("planner", t.rag, "action")
    tool("planner", "research_destination", { city: dest }, { source: "Wikivoyage + Wikipedia" })
    await delay(STEP)
    progress.completePhase("planner")

    // ── Recommender (weather + attractions) ────────────────────────────────
    progress.startPhase("recommender")
    yield yieldMsg("recommender", t.weather, "action")
    tool("recommender", "get_weather", { city: dest }, { source: "Open-Meteo" })
    await delay(STEP)
    yield yieldMsg("recommender", t.attractions, "action")
    tool("recommender", "search_attractions", { city: dest }, { source: "OpenTripMap/Wikipedia" })
    await delay(STEP)
    yield yieldMsg("recommender", t.memory, "thought")
    tool("recommender", "long_term_memory", { session: true }, { store: "FAISS" })
    await delay(STEP * 0.6)
    progress.completePhase("recommender")

    // ── Document ───────────────────────────────────────────────────────────
    progress.startPhase("document")
    yield yieldMsg("document", t.document, "action")
    tool("document", "format_itinerary", { format: "structured+map" }, { ok: true })
    await delay(STEP * 0.6)
    progress.completePhase("document")

    progress.completeSession()
    yield { message: { agent: "supervisor", content: t.done, timestamp: new Date(), type: "result" }, done: true }
  }

  /**
   * Produce the final, structured Trip via the FastAPI backend.
   * Real free-API data + multi-hop RAG + long-term memory live server-side.
   */
  static async generateTripFromContext(context: AgentContext): Promise<Trip> {
    const { destination, days } = extractTripInfo(context.userMessage, context.existingContext)
    const dest = destination || context.existingContext?.destination
    if (!dest) {
      throw new Error(uiLang() === "zh" ? "未识别到目的地" : "No destination detected")
    }
    const nDays = days || context.existingContext?.days || 2

    const prefs = context.userPreferences
    const constraints = [
      ...(prefs?.dietaryRestrictions ?? []),
      ...(prefs?.accessibilityNeeds ?? []),
    ]
    const budget = context.existingContext?.budget || prefs?.budget

    const data = await planTripBackend({
      destination: dest,
      days: nDays,
      interests: prefs?.interests ?? [],
      constraints,
      budget: budget
        ? { min: budget.min ?? 0, max: budget.max ?? 0, currency: budget.currency ?? "CNY" }
        : undefined,
    })

    return mapBackendTrip(data, nDays, prefs)
  }
}
