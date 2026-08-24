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

export type CaseId = "c01-cold-room-knock" | "c02-snow-route" | "c03-second-shadow" | (string & {});

export type SeasonId = "season-1" | "season-2" | "season-3" | (string & {});

export interface ReleaseProfile {
  profileVersion: number;
  id: string;
  title: string;
  status: "frozen-for-human-evaluation" | "internal-rc" | "published" | (string & {});
  publishable: boolean;
  humanEvaluation: "pending" | "passed" | "failed" | (string & {});
  manifests: string[];
}

export interface CasePresentationSpec {
  layoutId: "cold-room" | "snow-route" | "second-shadow" | (string & {});
  sceneAsset: string;
  sceneAssetMobile?: string;
  palette: "black-soup" | "snow-night" | "backstage-amber" | (string & {});
  accent: string;
  questionPromptMode: "host" | "radio" | "testimony" | (string & {});
  evidenceVisualMode: "archive-cards" | "route-tags" | "dossier-cards" | (string & {});
  mobileNavigation: string[];
  boardMode?: ReasoningBoardMode;
}

/** Public-copy-only overlay. It is intentionally unable to describe truth, queries or proof rules. */
export interface CasePresentationPatch {
  caseId: CaseId;
  baseCanonicalHash: string;
  presentationRevision: number;
  title?: string;
  surface?: string;
  answerTemplates?: Partial<Record<AnswerCode, string>>;
  questionLabels?: Record<string, string>;
  feedbackCopy?: Record<string, string>;
  evidenceCopy?: Record<string, { title?: string; observation?: string }>;
  hypothesisLabels?: Record<string, string>;
  chapterTitles?: Record<string, string>;
  replayCaptions?: Record<string, string>;
  /** Public replay configuration only; it cannot alter the standard proof certificate. */
  replayChallenges?: ReplayChallengeSpec[];
  sceneAsset?: string;
  sceneAssetMobile?: string;
  evidenceVisualMode?: string;
}

export type ReasoningBoardMode =
  | "timeline"
  | "state-trace"
  | "spatial-map"
  | "provenance-chain"
  | "identity-matrix"
  | "measurement-model"
  | "sampling-window"
  | "aggregate-constraint"
  | "calibration-curve"
  | "control-loop"
  | "signal-chain"
  | "network-topology"
  | "uncertainty-band"
  | "reference-frame"
  | "queue-model";

export type ProofObligationKind =
  | "time"
  | "space"
  | "source"
  | "identity"
  | "measurement"
  | "state-transition"
  | "alternative-exclusion";

export type ReplayMode = "standard" | "limited-questions" | "minimal-proof" | "no-scaffolds";

export type MasteryChallenge = Exclude<ReplayMode, "standard">;

export interface CaseMasteryChallengeResult {
  solved: boolean;
  bestQuestionCount?: number;
  bestProofCompleteness?: number;
  hintFree?: boolean;
  completedAt: string;
}

export interface CaseMasteryRecord {
  caseId: CaseId;
  caseVersion: number;
  canonicalHash: string;
  standardSolved: boolean;
  challengeResults: Partial<Record<MasteryChallenge, CaseMasteryChallengeResult>>;
  totalSolves: number;
  lastPlayedAt: string;
}

export interface ChallengeRotation {
  caseId: CaseId;
  nextChallenge: MasteryChallenge | "complete";
  completedCount: number;
}

export interface CaseChapter {
  id: string;
  titleKey: string;
  unlock?: VisibilityRequirements;
}

export interface ReasoningBoardSlotSpec {
  id: string;
  labelKey: string;
  acceptsEventIds: string[];
}

export interface ReasoningBoardSpec {
  id: string;
  titleKey: string;
  mode: ReasoningBoardMode;
  slots: ReasoningBoardSlotSpec[];
  allowedRelations?: string[];
}

export interface BoardPlacementRequirement {
  slotId: string;
  eventId: string;
}

export interface BoardConnectionRequirement {
  fromEventId: string;
  toEventId: string;
  relation: string;
}

export interface ProofObligation {
  id: string;
  kind: ProofObligationKind;
  boardId: string;
  requiredPlacements?: BoardPlacementRequirement[];
  requiredConnections?: BoardConnectionRequirement[];
  failureCategory: ProofObligationKind;
}

export interface ReplayChallengeSpec {
  mode: Exclude<ReplayMode, "standard">;
  questionLimit?: number;
}

export interface CaseCatalogEntry {
  id: CaseId;
  title: string;
  surface: string;
  difficulty: string;
  targetMinutes: { min: number; max: number };
  contentTags: string[];
  layoutId: string;
  sceneAsset: string;
  sceneAssetMobile?: string;
  accent: string;
  seasonId?: SeasonId;
  seasonTitle?: string;
  status?: "frozen" | "internal-rc" | "public-preview" | "published";
  mechanicTags?: string[];
  replayChallenges?: ReplayChallengeSpec[];
}

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
  visualAsset?: string;
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
  proofObligations?: ProofObligation[];
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
  presentation?: CasePresentationSpec;
  chapters?: CaseChapter[];
  reasoningBoards?: ReasoningBoardSpec[];
  replayChallenges?: ReplayChallengeSpec[];
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
  unlockedChapterIds: string[];
  reasoningBoards: Record<string, ReasoningBoardDraft>;
  replayMode: ReplayMode;
}

export interface ReasoningBoardConnection {
  fromItemId: string;
  toItemId: string;
  relation: string;
}

export interface ReasoningBoardDraft {
  placements: Record<string, string>;
  connections: ReasoningBoardConnection[];
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
  visualAsset?: string;
}

export interface RasterAssetRecord {
  id: string;
  caseId: CaseId;
  role: "scene-desktop" | "scene-mobile" | "evidence";
  path: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  alt: string;
  prompt: string;
  generatedAt: string;
  generator: string;
  humanEdits: string[];
  licenseStatus: "generated-for-project" | "verified" | "blocked";
}

export interface RasterAssetManifest {
  manifestVersion: 1;
  releaseProfile: string;
  generatedAt: string;
  assets: RasterAssetRecord[];
}

export type HostRewriteStyle = "冷静" | "低语" | "档案" | "紧张";

export interface PresentationContext {
  caseId: CaseId;
  caseVersion: number;
  language: "zh-CN" | (string & {});
  answerCode: AnswerCode;
  deterministicText: string;
  playerQuestion: string;
  visibleEvidence: Array<{ title: string; observation: string }>;
  hintLevel: "none" | "light" | "direct";
  requestedStyle: HostRewriteStyle;
}

export interface HostRewriteRequest {
  endpoint: string;
  model: string;
  context: PresentationContext;
}

export interface HostRewriteResponse {
  text: string;
  style?: HostRewriteStyle;
  warnings?: string[];
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

export interface ChapterProjection {
  id: string;
  title: string;
  unlocked: boolean;
}

export interface ReasoningBoardSlotProjection {
  id: string;
  label: string;
  itemId?: string;
}

export interface ReasoningBoardProjection {
  id: string;
  title: string;
  mode: ReasoningBoardMode;
  slots: ReasoningBoardSlotProjection[];
  items: EventOptionProjection[];
  connections: ReasoningBoardConnection[];
  allowedRelations: string[];
  behavior?: {
    interaction: string;
    slotRoles: string[];
    connectionVerbs: string[];
    requiredDistinctRoles: number;
  };
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
    id: CaseId;
    version: number;
    contentHash: string;
    title: string;
    surface: string;
    difficulty: string;
    targetMinutes: { min: number; max: number };
    contentTags: string[];
    presentation: CasePresentationSpec;
    presentationRevision?: number;
    presentationPatchHash?: string;
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
  chapters: ChapterProjection[];
  reasoningBoards: ReasoningBoardProjection[];
  replayMode: ReplayMode;
  replayChallenges: ReplayChallengeSpec[];
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
  | { type: "place_reasoning_item"; boardId: string; slotId: string; itemId: string }
  | { type: "remove_reasoning_item"; boardId: string; slotId: string }
  | { type: "connect_reasoning_items"; boardId: string; fromItemId: string; toItemId: string; relation: string }
  | { type: "disconnect_reasoning_items"; boardId: string; fromItemId: string; toItemId: string; relation: string }
  | { type: "set_replay_mode"; mode: ReplayMode }
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
  | { type: "theory_judged"; judgement: Judgement; message: string; proofFailureCategory?: ProofObligationKind }
  | { type: "case_solved" }
  | { type: "replay_ready" }
  | { type: "chapter_unlocked"; chapterId: string }
  | { type: "reasoning_board_updated"; boardId: string }
  | { type: "replay_mode_started"; mode: ReplayMode }
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
  completed?: boolean;
}

export interface RuntimeResult {
  state: RuntimeState;
  projection: PlayerProjection;
  events: GameEvent[];
  accepted: boolean;
}
