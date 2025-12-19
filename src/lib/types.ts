export type GameMode = "daily" | "debug-random";

export type Alignment = "GOOD" | "EVIL";

export type VisibleProfile = {
  name: string;
  age: number;
  occupation: string;
  causeOfDeath: string;
  quote: string;
};

export type HiddenProfile = {
  bio: string;
  bestActs: [string, string, string];
  worstActs: [string, string, string];
};

export type CharacterProfile = {
  version: 1;
  dateKey?: string; // daily only
  gameId: string; // daily: equals dateKey; random: uuid
  mode: GameMode;
  alignment: Alignment;
  faceEmoji: string;
  visible: VisibleProfile;
  hidden: HiddenProfile;
};

export type QAItem = { q: string; a: string };

export type ClientGameState = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  startedAt: number;
  visible: VisibleProfile & { faceEmoji: string };
  qa: QAItem[];
  isComplete: boolean;
  judgment?: "HEAVEN" | "HELL";
  wasCorrect?: boolean;
  godMessage?: string;
};


