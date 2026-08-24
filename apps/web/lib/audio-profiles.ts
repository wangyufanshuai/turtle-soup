export const SOUNDSCAPE_IDS = [
  "cold-room", "snow-route", "second-shadow", "mail-room", "switchboard", "harbor-ledger",
  "key-archive", "sound-lab", "rain-room", "telegraph-room", "signature-desk", "elevator-control",
  "hydrostatic-lab", "moving-boundary", "panorama-roof", "transfer-vault", "clockwork-tower", "metrology-bay",
  "dewpoint-room", "roster-grid", "frame-audit", "bridge-load", "air-route", "rotating-gallery",
  "c25-silent-second-bell", "c26-short-map-pipeline", "c27-stationary-moving-platform", "c28-ninth-minute-temperature",
  "c29-role-stamp-signature", "c30-shared-shift-id", "c31-eighth-unchecked-guest", "c32-approved-unauthorized-door",
  "c33-early-late-arrival", "c34-tomorrow-seal", "c35-extra-glass-attendant", "c36-no-one-left-terminal",
  "c37-zeroed-pressure-gauge", "c38-no-missing-seventh-packet", "c39-duplicated-heartbeat", "c40-early-liquid-front",
  "c41-hysteresis-overheat", "c42-same-weight-different-load", "c43-train-stop-reference", "c44-hidden-overload-spike",
  "c45-double-location-second", "c46-pilot-pressure-valve", "c47-offline-buffered-device", "c48-two-point-calibration",
  "c49-gimbal-turn-drone", "c50-extra-warehouse-pallet", "c51-equivalent-resistance", "c52-shorter-river-night",
  "c53-late-fiber-echo", "c54-elevator-counterweight", "c55-merged-multi-alarm", "c56-interpolated-temperature-map",
  "c57-lagging-wind-vane", "c58-same-volume-two-levels", "c59-extra-ninth-floor", "c60-last-sample-before-stop",
] as const;

export type SoundscapeId = (typeof SOUNDSCAPE_IDS)[number];

export interface SoundscapeProfile {
  id: SoundscapeId;
  label: string;
  signature: string;
  decorativeOnly: true;
  baseFrequency: number;
  harmonicFrequency: number;
  noiseGain: number;
  noiseFilter: BiquadFilterType;
  noiseFrequency: number;
  modulationFrequency: number;
  pulseSeconds: number;
  pulseFrequencies: readonly number[];
  pulseWave: OscillatorType;
  effectRatio: number;
}

const FIRST_SEASON_PROFILES: Readonly<Record<string, SoundscapeProfile>> = {
  "cold-room": { id: "cold-room", label: "冷凝机低鸣", signature: "compressor-hum-relay", decorativeOnly: true, baseFrequency: 43, harmonicFrequency: 86, noiseGain: 0.01, noiseFilter: "lowpass", noiseFrequency: 180, modulationFrequency: 0.11, pulseSeconds: 7.5, pulseFrequencies: [78], pulseWave: "triangle", effectRatio: 0.88 },
  "snow-route": { id: "snow-route", label: "雪夜风压", signature: "filtered-wind-metal", decorativeOnly: true, baseFrequency: 54, harmonicFrequency: 108, noiseGain: 0.032, noiseFilter: "bandpass", noiseFrequency: 900, modulationFrequency: 0.07, pulseSeconds: 10.2, pulseFrequencies: [620, 470], pulseWave: "sine", effectRatio: 1.12 },
  "second-shadow": { id: "second-shadow", label: "舞台空场共振", signature: "dimmer-wood-resonance", decorativeOnly: true, baseFrequency: 61, harmonicFrequency: 183, noiseGain: 0.009, noiseFilter: "lowpass", noiseFrequency: 2400, modulationFrequency: 0.14, pulseSeconds: 8.4, pulseFrequencies: [220, 330], pulseWave: "triangle", effectRatio: 1.05 },
  "mail-room": { id: "mail-room", label: "夜班分拣节拍", signature: "roller-clock-paper", decorativeOnly: true, baseFrequency: 48, harmonicFrequency: 96, noiseGain: 0.014, noiseFilter: "bandpass", noiseFrequency: 650, modulationFrequency: 0.09, pulseSeconds: 5.6, pulseFrequencies: [740, 510], pulseWave: "square", effectRatio: 0.95 },
  "switchboard": { id: "switchboard", label: "断电线路余振", signature: "mains-relay-glass", decorativeOnly: true, baseFrequency: 50, harmonicFrequency: 100, noiseGain: 0.008, noiseFilter: "highpass", noiseFrequency: 1250, modulationFrequency: 0.33, pulseSeconds: 6.4, pulseFrequencies: [880, 440], pulseWave: "square", effectRatio: 1.18 },
  "harbor-ledger": { id: "harbor-ledger", label: "港池低潮", signature: "harbor-fog-waterline", decorativeOnly: true, baseFrequency: 37, harmonicFrequency: 74, noiseGain: 0.028, noiseFilter: "lowpass", noiseFrequency: 560, modulationFrequency: 0.06, pulseSeconds: 12, pulseFrequencies: [82, 123], pulseWave: "sine", effectRatio: 0.78 },
  "key-archive": { id: "key-archive", label: "金属柜余响", signature: "cabinet-cable-metal", decorativeOnly: true, baseFrequency: 66, harmonicFrequency: 198, noiseGain: 0.006, noiseFilter: "bandpass", noiseFrequency: 1800, modulationFrequency: 0.18, pulseSeconds: 4.8, pulseFrequencies: [1100, 1650], pulseWave: "triangle", effectRatio: 1.25 },
  "sound-lab": { id: "sound-lab", label: "磁带底噪", signature: "tape-hiss-buffer-flutter", decorativeOnly: true, baseFrequency: 57, harmonicFrequency: 114, noiseGain: 0.04, noiseFilter: "highpass", noiseFrequency: 1400, modulationFrequency: 0.22, pulseSeconds: 9.6, pulseFrequencies: [320, 480, 300], pulseWave: "sawtooth", effectRatio: 1.08 },
  "rain-room": { id: "rain-room", label: "管道残雨", signature: "roof-water-drip", decorativeOnly: true, baseFrequency: 46, harmonicFrequency: 92, noiseGain: 0.036, noiseFilter: "bandpass", noiseFrequency: 1200, modulationFrequency: 0.13, pulseSeconds: 3.9, pulseFrequencies: [900, 620], pulseWave: "sine", effectRatio: 0.9 },
  "telegraph-room": { id: "telegraph-room", label: "交换机线路噪声", signature: "pbx-line-queue", decorativeOnly: true, baseFrequency: 52, harmonicFrequency: 104, noiseGain: 0.012, noiseFilter: "bandpass", noiseFrequency: 720, modulationFrequency: 0.25, pulseSeconds: 7.2, pulseFrequencies: [660, 440], pulseWave: "square", effectRatio: 1 },
  "signature-desk": { id: "signature-desk", label: "档案室纸声", signature: "paper-clock-seal", decorativeOnly: true, baseFrequency: 42, harmonicFrequency: 126, noiseGain: 0.016, noiseFilter: "bandpass", noiseFrequency: 420, modulationFrequency: 0.08, pulseSeconds: 11.3, pulseFrequencies: [390, 585], pulseWave: "triangle", effectRatio: 0.86 },
  "elevator-control": { id: "elevator-control", label: "曳引机待机声", signature: "motor-relay-floor", decorativeOnly: true, baseFrequency: 45, harmonicFrequency: 90, noiseGain: 0.013, noiseFilter: "lowpass", noiseFrequency: 300, modulationFrequency: 0.17, pulseSeconds: 6.8, pulseFrequencies: [520, 780], pulseWave: "sine", effectRatio: 0.93 },
};

const SECOND_SEASON_LABELS: Readonly<Record<string, string>> = {
  "hydrostatic-lab": "玻璃液位与低频水压",
  "moving-boundary": "地轨与隔离栏摩擦",
  "panorama-roof": "旋转快门与天台风",
  "transfer-vault": "旋转柜筒与机械互锁",
  "clockwork-tower": "报时轮与落锤余响",
  "metrology-bay": "计量台与校准脉冲",
  "dewpoint-room": "冷表面与稀薄雾流",
  "roster-grid": "夜班终端与纸面翻页",
  "frame-audit": "低帧率监控扫描",
  "bridge-load": "桥跨应变与道闸",
  "air-route": "采样管气流与阀鸣",
  "rotating-gallery": "展墙轴承与空馆回声",
  "c25-silent-second-bell": "门铃继电器与一次余振",
  "c26-short-map-pipeline": "竖井管流与测距脉冲",
  "c27-stationary-moving-platform": "磁轨低鸣与空载回程",
  "c28-ninth-minute-temperature": "热舱风噪与迟滞脉冲",
  "c29-role-stamp-signature": "岗位印章与纸面摩擦",
  "c30-shared-shift-id": "交接终端与午夜继电",
  "c31-eighth-unchecked-guest": "旅店走廊与钥匙轻响",
  "c32-approved-unauthorized-door": "门锁电磁与权限确认",
  "c33-early-late-arrival": "异步时钟与缓存滴答",
  "c34-tomorrow-seal": "封装带与打印轮余声",
  "c35-extra-glass-attendant": "玻璃厅低鸣与衣架轻响",
  "c36-no-one-left-terminal": "终点风洞与空车回响",
  "c37-zeroed-pressure-gauge": "压力表温漂与泄压尾音",
  "c38-no-missing-seventh-packet": "交换机确认脉冲与去重节拍",
  "c39-duplicated-heartbeat": "监护回放与单次心跳包",
  "c40-early-liquid-front": "管线前沿与采样口涌流",
  "c41-hysteresis-overheat": "热舱继电与滞回保持",
  "c42-same-weight-different-load": "桥面应变与重心偏移",
  "c43-train-stop-reference": "制动回路与轨端低鸣",
  "c44-hidden-overload-spike": "瞬时尖峰与平均窗脉冲",
  "c45-double-location-second": "授时脉冲与双时间戳",
  "c46-pilot-pressure-valve": "先导气路与阀芯回弹",
  "c47-offline-buffered-device": "离线缓存与批量补传",
  "c48-two-point-calibration": "校准端点与中段曲线",
  "c49-gimbal-turn-drone": "云台伺服与旋翼远鸣",
  "c50-extra-warehouse-pallet": "仓储队列与托盘扫描",
  "c51-equivalent-resistance": "并联回路与测量脉冲",
  "c52-shorter-river-night": "水位基准与夜间水流",
  "c53-late-fiber-echo": "光纤回波与缓冲延迟",
  "c54-elevator-counterweight": "配重导轨与检修继电",
  "c55-merged-multi-alarm": "告警队列与单次蜂鸣",
  "c56-interpolated-temperature-map": "稀疏采样与插值扫描",
  "c57-lagging-wind-vane": "机械风标与阵风滞后",
  "c58-same-volume-two-levels": "异形容器与液面回响",
  "c59-extra-ninth-floor": "气压估层与设备层低鸣",
  "c60-last-sample-before-stop": "终止链与最后缓存窗",
};

function generatedProfile(id: SoundscapeId, index: number): SoundscapeProfile {
  const base = 39 + ((index * 7) % 29);
  return {
    id,
    label: SECOND_SEASON_LABELS[id] ?? "档案室环境层",
    signature: `${id}-deterministic-soundscape`,
    decorativeOnly: true,
    baseFrequency: base,
    harmonicFrequency: base * (index % 3 + 2),
    noiseGain: 0.009 + (index % 5) * 0.005,
    noiseFilter: (["lowpass", "bandpass", "highpass"] as BiquadFilterType[])[index % 3],
    noiseFrequency: 380 + index * 97,
    modulationFrequency: 0.06 + (index % 7) * 0.035,
    pulseSeconds: 5.1 + (index % 6) * 1.17,
    pulseFrequencies: [base * 5, base * 7],
    pulseWave: (["sine", "triangle", "sawtooth"] as OscillatorType[])[index % 3],
    effectRatio: 0.82 + (index % 7) * 0.055,
  };
}

export const SOUNDSCAPE_PROFILES: Readonly<Record<string, SoundscapeProfile>> = {
  ...FIRST_SEASON_PROFILES,
  ...Object.fromEntries(SOUNDSCAPE_IDS.slice(12).map((id, index) => [id, generatedProfile(id, index + 12)])),
};

export function getSoundscapeProfile(id: string, presentationLayoutId?: string): SoundscapeProfile {
  return SOUNDSCAPE_PROFILES[id]
    ?? (presentationLayoutId ? SOUNDSCAPE_PROFILES[presentationLayoutId] : undefined)
    ?? SOUNDSCAPE_PROFILES["cold-room"];
}
