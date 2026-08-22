export type AnswerCode =
  | "yes"
  | "no"
  | "partial"
  | "invalid_premise"
  | "unknown"
  | "irrelevant"
  | "unanswerable"
  | "unrecognized";

export type Judgement =
  | "unfounded"
  | "plausible"
  | "nearly_proven"
  | "solved"
  | "invalidated";

export interface Entity {
  id: string;
  kind: string;
  labelKey?: string;
  [key: string]: unknown;
}

export interface Event {
  id: string;
  order: number;
  participants: string[];
  locationId?: string;
  effectFactIds?: string[];
  preconditionFactIds?: string[];
  solutionRole?: string;
  [key: string]: unknown;
}

export interface Relation {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  eventId: string;
  factId: string;
  [key: string]: unknown;
}

export interface Fact {
  id: string;
  predicate: string;
  truth: boolean;
  sourceEventIds?: string[];
  sourceType?: string;
  visibilityRuleIds?: string[];
  evidenceItemIds?: string[];
  importance?: string;
  [key: string]: unknown;
}

export interface VisibilityRequirements {
  discoveredEvidenceIds?: string[];
  visitedLocationIds?: string[];
  answeredQueryIds?: string[];
}

export interface VisibilityRule {
  id: string;
  mode: "scene" | "question" | "evidence" | "chapter" | string;
  requires?: VisibilityRequirements;
  revealsFactIds: string[];
  spoilerLevel?: string;
}

export interface QuestionSemantic {
  id: string;
  answerCodeWhenVisible: AnswerCode;
  supportingFactIds?: string[];
  visibilityRuleIds?: string[];
  examplePhrases?: string[];
  matchRules?: QuestionMatchRule[];
  [key: string]: unknown;
}

export interface QuestionMatchRule {
  all?: string[];
  any?: string[];
  none?: string[];
  priority?: number;
}

export interface QuestionNormalizationResult {
  status: "matched" | "ambiguous" | "unrecognized";
  rawText: string;
  normalizedText: string;
  queryId: string | null;
  candidateQueryIds: string[];
  matchedBy: "exact" | "rule" | "none";
}

export interface EvidenceItem {
  id: string;
  defaultState: "hidden" | "available" | "discovered" | string;
  sourceFactIds?: string[];
  sourceEventIds?: string[];
  supports?: string[];
  conflicts?: string[];
  [key: string]: unknown;
}

export interface Hypothesis {
  id: string;
  kind: "canonical" | "alternative" | string;
  claim?: {
    eventIds?: string[];
    orderedRelationIds?: string[];
    motiveKey?: string;
    assertedPropositions?: string[];
  };
  requiredEvidenceIds?: string[];
  requiredContradictionResolutionIds?: string[];
  [key: string]: unknown;
}

export interface Contradiction {
  id: string;
  kind: string;
  requiresFactIds?: string[];
  invalidatesHypothesisIds?: string[];
  resolutionEvidenceIds?: string[];
  severity?: "soft" | "hard" | string;
  [key: string]: unknown;
}

export interface MinimumProofSet {
  id: string;
  evidenceIds: string[];
}

export interface SolutionCertificate {
  canonicalHypothesisId: string;
  requiredFactIds: string[];
  requiredEvidenceIds: string[];
  requiredEventOrder: string[][];
  requiredContradictionResolutionIds: string[];
  alternativeHypothesisIds: string[];
  minimumProofSetId: string;
  minimumProofSets: MinimumProofSet[];
  acceptedMotiveKeys?: string[];
  successReplayBeatIds?: string[];
  [key: string]: unknown;
}

export interface ProofReplayBeat {
  id: string;
  eventId: string;
  factIds: string[];
  captionKey?: string;
}

export interface CaseFile {
  schemaVersion: string;
  id: string;
  metadata?: {
    titleKey?: string;
    contentVersion?: number;
    canonicalHash?: string;
    difficulty?: string;
    targetMinutes?: { min: number; max: number };
    contentTags?: string[];
    [key: string]: unknown;
  };
  surface?: {
    titleKey?: string;
    textKey?: string;
    publicFactIds?: string[];
    initialQuestionPrompts?: string[];
    [key: string]: unknown;
  };
  entities: Entity[];
  events: Event[];
  relations: Relation[];
  facts: Fact[];
  visibilityRules: VisibilityRule[];
  questionSemantics: QuestionSemantic[];
  answerPolicy: {
    codes: AnswerCode[];
    templates?: Partial<Record<AnswerCode, string>>;
    [key: string]: unknown;
  };
  evidenceItems: EvidenceItem[];
  hypotheses: Hypothesis[];
  contradictions: Contradiction[];
  solutionCertificate: SolutionCertificate;
  proofReplay: ProofReplayBeat[];
  localization?: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

export interface GameState {
  caseId: string;
  discoveredEvidenceIds: string[];
  visitedLocationIds: string[];
  answeredQueryIds: string[];
  activeRuleIds: string[];
  visibleFactIds: string[];
}

export interface AskResult {
  state: GameState;
  queryId: string | null;
  code: AnswerCode;
  newlyVisibleFactIds: string[];
  unlockedEvidenceIds: string[];
}

export interface AskNaturalLanguageResult extends AskResult {
  normalization: QuestionNormalizationResult;
}

export interface MutationResult {
  state: GameState;
  accepted: boolean;
  newlyVisibleFactIds: string[];
  unlockedEvidenceIds: string[];
}

export interface TheorySubmission {
  hypothesisId: string;
  evidenceIds?: string[];
  eventIds?: string[];
  motiveKey?: string;
}

export interface JudgementResult {
  judgement: Judgement;
  hypothesisId: string;
  missingEvidenceIds: string[];
  missingFactIds: string[];
  missingContradictionResolutionIds: string[];
  missingMotiveKey?: string;
  contradictionIds: string[];
  spoilerSafeGap: string;
}

export type EvidencePlayerState =
  | "available"
  | "discovered"
  | "examined"
  | "connected"
  | "verified"
  | "dismissed";

export interface TranscriptEntry {
  id: string;
  rawQuestion: string;
  interpretedAs: string;
  answerCode: AnswerCode;
  answerText: string;
  repeated: boolean;
}

export interface TheoryDraft {
  id: "theory-a" | "theory-b";
  title: string;
  hypothesisId: string;
  eventIds: string[];
  evidenceIds: string[];
  motiveKey?: string;
}

export interface RuntimeState {
  game: GameState;
  transcript: TranscriptEntry[];
  evidenceStates: Record<string, EvidencePlayerState>;
  theoryDrafts: TheoryDraft[];
  activeTheoryId: TheoryDraft["id"];
  pendingInterpretation?: {
    rawText: string;
    candidateQueryIds: string[];
  };
  lastQuestionSnapshot?: {
    game: GameState;
    transcriptLength: number;
  };
  solved: boolean;
  replayBeatIds: string[];
  acceptedCommandCount: number;
}

export interface QuestionCandidateProjection {
  queryId: string;
  label: string;
  target: string;
  predicate: string;
  qualifier?: string;
}

export interface QuestionInterpretation {
  status: "matched" | "ambiguous" | "unrecognized";
  rawText: string;
  interpretedAs?: string;
  candidates: QuestionCandidateProjection[];
  requiresConfirmation: boolean;
}

export interface EvidenceProjection {
  id: string;
  title: string;
  observation: string;
  state: EvidencePlayerState;
  sourceLabel: string;
  isNew: boolean;
}

export interface EventOptionProjection {
  id: string;
  timeLabel: string;
  label: string;
}

export interface LocationProjection {
  id: string;
  label: string;
  visited: boolean;
}

export interface TheoryOptionProjection {
  id: string;
  label: string;
  motiveOptions: Array<{ id: string; label: string }>;
}

export interface ReplayBeatProjection {
  id: string;
  timeLabel: string;
  caption: string;
  evidenceTitles: string[];
}

export interface DebriefReport {
  proofCompleteness: number;
  questionCount: number;
  repeatedQuestionCount: number;
  verifiedEvidenceCount: number;
  contradictionCount: number;
  unlockedReplayMode?: "limited-questions";
}

export interface PlayerProjection {
  case: {
    id: string;
    version: number;
    contentHash: string;
    title: string;
    surface: string;
    difficulty: string;
    targetMinutes: { min: number; max: number };
  };
  transcript: TranscriptEntry[];
  interpretation?: QuestionInterpretation;
  evidence: EvidenceProjection[];
  locations: LocationProjection[];
  questionScaffolds: QuestionCandidateProjection[];
  eventOptions: EventOptionProjection[];
  theoryOptions: TheoryOptionProjection[];
  theoryDrafts: TheoryDraft[];
  activeTheoryId: TheoryDraft["id"];
  canSubmit: boolean;
  solved: boolean;
  replay: ReplayBeatProjection[];
  debrief?: DebriefReport;
}

export type GameCommand =
  | { type: "start_case" }
  | { type: "ask_text"; rawText: string }
  | { type: "confirm_interpretation"; queryId: string }
  | { type: "undo_last_question" }
  | { type: "visit_location"; locationId: string }
  | { type: "set_evidence_state"; evidenceId: string; state: EvidencePlayerState }
  | { type: "select_theory"; theoryId: TheoryDraft["id"] }
  | { type: "set_theory_hypothesis"; theoryId: TheoryDraft["id"]; hypothesisId: string }
  | { type: "upsert_theory_event"; theoryId: TheoryDraft["id"]; eventId: string; index?: number }
  | { type: "remove_theory_event"; theoryId: TheoryDraft["id"]; eventId: string }
  | { type: "move_theory_event"; theoryId: TheoryDraft["id"]; eventId: string; direction: -1 | 1 }
  | { type: "link_theory_evidence"; theoryId: TheoryDraft["id"]; evidenceId: string; linked: boolean }
  | { type: "set_theory_motive"; theoryId: TheoryDraft["id"]; motiveKey?: string }
  | { type: "submit_theory"; theoryId: TheoryDraft["id"] }
  | { type: "request_proof_replay" }
  | { type: "restart_case" };

export type GameEvent =
  | { type: "case_started" }
  | { type: "question_answered"; entry: TranscriptEntry }
  | { type: "interpretation_required"; interpretation: QuestionInterpretation }
  | { type: "question_rejected"; interpretation: QuestionInterpretation }
  | { type: "question_undone" }
  | { type: "evidence_updated"; evidenceId: string; state: EvidencePlayerState }
  | { type: "location_visited"; locationId: string }
  | { type: "theory_updated"; theoryId: TheoryDraft["id"] }
  | { type: "theory_judged"; judgement: Judgement; message: string }
  | { type: "case_solved" }
  | { type: "replay_ready" }
  | { type: "command_rejected"; message: string };

export interface SaveEnvelope {
  schemaVersion: 1;
  caseId: string;
  caseVersion: number;
  contentHash: string;
  commands: GameCommand[];
  updatedAt: string;
  settings?: {
    muted?: boolean;
    ambientVolume?: number;
    effectsVolume?: number;
    reducedMotion?: boolean;
    highContrast?: boolean;
  };
}

export interface RuntimeResult {
  state: RuntimeState;
  projection: PlayerProjection;
  events: GameEvent[];
  accepted: boolean;
}
