/** Homepage art is independent of the scenes and evidence used inside a case. */
const ROOT = "/assets/home-cinema";

export const HOME_CINEMA = {
  hero: {
    desktop: `${ROOT}/hero-desktop.webp`,
    mobile: `${ROOT}/hero-mobile.webp`,
    focus: "61% 50%",
  },
  seasons: [
    {
      id: "season-1",
      image: `${ROOT}/season-1.webp`,
      focus: "50% 50%",
      line: "每个异常，都有另一种解释。",
    },
    {
      id: "season-2",
      image: `${ROOT}/season-2.webp`,
      focus: "50% 44%",
      line: "看见的，未必是发生的。",
    },
    {
      id: "season-3",
      image: `${ROOT}/season-3.webp`,
      focus: "50% 48%",
      line: "真相藏在时间的缝隙里。",
    },
    {
      id: "season-4",
      image: `${ROOT}/season-4.webp`,
      focus: "50% 52%",
      line: "让每一份记录，回到现场。",
    },
    {
      id: "season-5",
      image: `${ROOT}/season-5.webp`,
      focus: "50% 50%",
      line: "最后一个问题，留给你。",
    },
  ],
} as const;

// Keep off-centre subjects in frame when the directory uses a narrow crop.
const CASE_FOCUS: Record<string, string> = {
  "c04-unpostable-reply": "38% 50%",
  "c07-key-returns": "77% 50%",
  "c13-second-waterline": "31% 50%",
  "c14-moving-red-box": "24% 50%",
  "c20-fifth-worker": "64% 50%",
  "c23-clean-air-sample": "38% 50%",
  "c25-silent-second-bell": "70% 50%",
  "c29-role-stamp-signature": "39% 50%",
  "c31-eighth-unchecked-guest": "62% 50%",
  "c37-zeroed-pressure-gauge": "40% 50%",
  "c38-no-missing-seventh-packet": "30% 50%",
  "c40-early-liquid-front": "61% 50%",
  "c41-hysteresis-overheat": "65% 50%",
  "c42-same-weight-different-load": "20% 50%",
  "c43-train-stop-reference": "66% 50%",
  "c44-hidden-overload-spike": "33% 50%",
  "c52-shorter-river-night": "32% 50%",
  "c67-shared-badge": "38% 50%",
  "c68-empty-seat-proof": "40% 50%",
  "c79-extra-queue-order": "70% 50%",
  "c84-handoff-after-stop": "60% 50%",
};

export function homeCaseArt(caseId: string) {
  return {
    image: `${ROOT}/${caseId}.webp`,
    thumbnail: `${ROOT}/${caseId}-thumb.webp`,
    focus: CASE_FOCUS[caseId] ?? "50% 50%",
  };
}
