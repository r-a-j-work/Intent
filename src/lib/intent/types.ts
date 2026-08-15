export interface Weakness {
  category: "clarity" | "context" | "specificity" | "constraints";
  title: string;
  description: string;
}

export interface ScoreBreakdown {
  clarity: number;
  context: number;
  specificity: number;
  constraints: number;
}

export interface RefineResponse {
  score: number;
  summary: string;
  weaknesses: Weakness[];
  breakdown: ScoreBreakdown;
  refinedPrompt: string;
  expectedOutput: string[];
  expectedQuality: number;
  isMock?: boolean;
}
