export type KnowledgeSelectionMode = 'keyword' | 'ai' | 'ai-deep' | 'ai-ultra'

export type AIAnalysisStepStatus = 'pending' | 'running' | 'completed' | 'error'

export interface AIAnalysisStepStats {
  activeKnowledgeCount?: number
  candidateCount?: number
  selectedCount?: number
  beforeSelectedCount?: number
}

export interface AIAnalysisStepDiff {
  addedSources?: string[]
  removedSources?: string[]
}

export interface AIAnalysisStep {
  id: string
  label: string
  status: AIAnalysisStepStatus
  detail?: string
  stats?: AIAnalysisStepStats
  diff?: AIAnalysisStepDiff
  startTime?: number
  endTime?: number
}

export interface AIAnalysisMeta {
  mode?: KnowledgeSelectionMode | string
  sources?: string[]
}

export type AIStepReporter = (stepId: string, updates: Partial<AIAnalysisStep>) => void
