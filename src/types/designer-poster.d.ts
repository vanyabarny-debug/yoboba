declare module '@/lib/designer/posterGenerate.mjs' {
  export function getPosterStatus(): {
    gemini: boolean;
    model: string;
    referenceSupported: boolean;
  };
  export function setGeminiApiKey(rawKey: string): {
    gemini: boolean;
    model: string;
    referenceSupported: boolean;
  };
  export function generatePoster(input: {
    prompt?: string;
    referenceImage?: string;
    currentImage?: string;
    brandName?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }): Promise<Record<string, unknown>>;
}
