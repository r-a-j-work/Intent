import type { RefineResponse } from './types';

const SYSTEM_PROMPT = `You are Intent, an expert prompt engineering system. Your job is to take a rough user prompt, analyze its core intent, score it, list its structural weaknesses, and rewrite it into a highly optimized version that conveys the user's intent with maximum clarity, specificity, and constraints.

You must return a JSON object with the following properties:
- score: number (overall score from 0 to 100 representing how effectively the prompt communicates its intent. Evaluate based on clarity of goal and scope, do NOT reward excessive length or verbosity)
- summary: string (1-2 sentence explanation of the main issues or qualities of the prompt)
- weaknesses: array of objects, containing between 2 and 4 items. Each object must have:
  * category: string (must be strictly one of: "clarity", "context", "specificity", "constraints")
  * title: string (short, punchy title summarizing the issue)
  * description: string (brief explanation of the issue)
- breakdown: object containing:
  * clarity: number (0-100 score on how clear the main goal is)
  * context: number (0-100 score on how well background info, audience, and scope are defined)
  * specificity: number (0-100 score on structural instructions and expected layout)
  * constraints: number (0-100 score on restrictions, tone limits, or prohibited patterns)
- refinedPrompt: string (the highly optimized, structured version of the prompt. Do not optimize for length; prefer precision, clear formatting, and structured markdown)
- expectedOutput: array of strings (3 to 5 clear, predicted visual or technical outcomes, e.g. "Type-safe typescript definitions", "Consistent editorial voice")
- expectedQuality: number (predicted quality score of the AI output on a scale of 1 to 10)

Keep your scoring analytical and objective. Do not assume every prompt needs every category. For example, a simple factual question may not need extensive constraints.`;

const AI_REQUEST_TIMEOUT = 30000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = AI_REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function logAIProviderResponse(provider: string, response: Response, bodyPreview: string) {
  console.log(`[${provider}] Response:`, {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('content-type'),
    bodyPreview: bodyPreview.slice(0, 500),
  });
}

// Validates and repairs responses from model output to ensure the UI never crashes
function validateResponse(data: any): RefineResponse {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Response is not a valid JSON object');
  }

  const score = typeof data.score === 'number' ? Math.max(0, Math.min(100, Math.round(data.score))) : 60;
  const summary = typeof data.summary === 'string' ? data.summary : 'Analyzed user prompt.';
  
  const weaknesses: any[] = [];
  if (Array.isArray(data.weaknesses)) {
    data.weaknesses.forEach((w: any) => {
      if (w && typeof w === 'object') {
        const cat = String(w.category || '').toLowerCase();
        let category: 'clarity' | 'context' | 'specificity' | 'constraints' = 'clarity';
        if (cat === 'context') category = 'context';
        else if (cat === 'specificity') category = 'specificity';
        else if (cat === 'constraints') category = 'constraints';
        
        weaknesses.push({
          category,
          title: typeof w.title === 'string' ? w.title : 'Weakness detected',
          description: typeof w.description === 'string' ? w.description : 'Details missing.'
        });
      }
    });
  }

  // Ensure 2-4 weaknesses
  if (weaknesses.length === 0) {
    weaknesses.push({
      category: 'clarity',
      title: 'Ambiguity',
      description: 'The overall scope of the prompt is slightly ambiguous.'
    });
  }

  const breakdown = {
    clarity: data.breakdown && typeof data.breakdown.clarity === 'number' ? Math.max(0, Math.min(100, data.breakdown.clarity)) : 60,
    context: data.breakdown && typeof data.breakdown.context === 'number' ? Math.max(0, Math.min(100, data.breakdown.context)) : 60,
    specificity: data.breakdown && typeof data.breakdown.specificity === 'number' ? Math.max(0, Math.min(100, data.breakdown.specificity)) : 60,
    constraints: data.breakdown && typeof data.breakdown.constraints === 'number' ? Math.max(0, Math.min(100, data.breakdown.constraints)) : 60,
  };

  const refinedPrompt = typeof data.refinedPrompt === 'string' ? data.refinedPrompt : 'Please specify prompt requirements.';
  
  const expectedOutput: string[] = [];
  if (Array.isArray(data.expectedOutput)) {
    data.expectedOutput.forEach((item: any) => {
      if (typeof item === 'string') {
        expectedOutput.push(item);
      }
    });
  }
  if (expectedOutput.length === 0) {
    expectedOutput.push('Structured output response');
  }

  const expectedQuality = typeof data.expectedQuality === 'number' ? Math.max(1, Math.min(10, data.expectedQuality)) : 7;

  return {
    score,
    summary,
    weaknesses,
    breakdown,
    refinedPrompt,
    expectedOutput,
    expectedQuality,
    isMock: !!data.isMock
  };
}

// Robust JSON parsing that handles markdown code fences and common AI response issues
function parseAIResponse(text: string): any {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty response from AI');
  }

  let cleaned = text.trim();

  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  const codeFenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeFenceMatch) {
    cleaned = codeFenceMatch[1].trim();
  }

  // Remove any leading/trailing non-JSON text (e.g., explanatory text before/after JSON)
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${e instanceof Error ? e.message : 'Unknown error'}. Response preview: ${cleaned.slice(0, 200)}`);
  }
}

export async function refinePrompt(prompt: string): Promise<RefineResponse> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('Prompt cannot be empty');
  }

  // Max prompt length check (e.g. 5000 characters)
  if (cleanPrompt.length > 5000) {
    throw new Error('Prompt exceeds maximum length of 5000 characters');
  }

  // Check for API Keys
  const geminiKey = process.env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY;

  console.log('[refinePrompt] Provider check:', {
    hasGeminiKey: !!geminiKey,
    hasOpenAIKey: !!openAIKey,
    promptLength: cleanPrompt.length,
  });

  if (geminiKey) {
    try {
      console.log('[refinePrompt] Attempting Gemini API...');
      return await refineWithGemini(cleanPrompt, geminiKey);
    } catch (e) {
      console.error('[refinePrompt] Gemini API failed, falling back:', e instanceof Error ? e.message : e);
    }
  }

  if (openAIKey) {
    try {
      console.log('[refinePrompt] Attempting OpenAI API...');
      return await refineWithOpenAI(cleanPrompt, openAIKey);
    } catch (e) {
      console.error('[refinePrompt] OpenAI API failed, falling back:', e instanceof Error ? e.message : e);
    }
  }

  // Fallback to Mock Mode if no keys are configured
  console.log('[refinePrompt] No API keys configured, using mock mode');
  return getMockRefinement(cleanPrompt);
}

async function refineWithGemini(prompt: string, apiKey: string): Promise<RefineResponse> {
  // Use a valid, current Gemini model
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Prompt to refine:\n"${prompt}"` }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            score: { type: 'INTEGER' },
            summary: { type: 'STRING' },
            weaknesses: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  category: { type: 'STRING', enum: ['clarity', 'context', 'specificity', 'constraints'] },
                  title: { type: 'STRING' },
                  description: { type: 'STRING' }
                },
                required: ['category', 'title', 'description']
              }
            },
            breakdown: {
              type: 'OBJECT',
              properties: {
                clarity: { type: 'INTEGER' },
                context: { type: 'INTEGER' },
                specificity: { type: 'INTEGER' },
                constraints: { type: 'INTEGER' }
              },
              required: ['clarity', 'context', 'specificity', 'constraints']
            },
            refinedPrompt: { type: 'STRING' },
            expectedOutput: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            expectedQuality: { type: 'INTEGER' }
          },
          required: ['score', 'summary', 'weaknesses', 'breakdown', 'refinedPrompt', 'expectedOutput', 'expectedQuality']
        }
      }
    })
  });

  // Read raw response body for logging
  const responseText = await response.text();
  logAIProviderResponse('Gemini', response, responseText);

  if (!response.ok) {
    // Handle non-JSON error responses (e.g., HTML error pages)
    let errorDetail = responseText;
    try {
      const errJson = JSON.parse(responseText);
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      // Keep raw text if not JSON
    }
    throw new Error(`Gemini API error ${response.status}: ${errorDetail.slice(0, 500)}`);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Gemini API returned invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}. Response preview: ${responseText.slice(0, 200)}`);
  }

  const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new Error('Gemini API returned an empty response (no text in candidates)');
  }

  const parsed = parseAIResponse(jsonText);
  return validateResponse({ ...parsed, isMock: false });
}

async function refineWithOpenAI(prompt: string, apiKey: string): Promise<RefineResponse> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\nOutput must be JSON matching the required schema. Ensure weaknesses categories are one of: clarity, context, specificity, constraints.` },
        { role: 'user', content: prompt }
      ]
    })
  });

  // Read raw response body for logging
  const responseText = await response.text();
  logAIProviderResponse('OpenAI', response, responseText);

  if (!response.ok) {
    // Handle non-JSON error responses
    let errorDetail = responseText;
    try {
      const errJson = JSON.parse(responseText);
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      // Keep raw text if not JSON
    }
    throw new Error(`OpenAI API error ${response.status}: ${errorDetail.slice(0, 500)}`);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`OpenAI API returned invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}. Response preview: ${responseText.slice(0, 200)}`);
  }

  const jsonText = data.choices?.[0]?.message?.content;
  if (!jsonText) {
    throw new Error('OpenAI API returned an empty response (no content in choices)');
  }

  const parsed = parseAIResponse(jsonText);
  return validateResponse({ ...parsed, isMock: false });
}

function getMockRefinement(prompt: string): RefineResponse {
  const lower = prompt.toLowerCase();

  // 1. Landing Page / Website / Startup
  if (lower.includes('page') || lower.includes('site') || lower.includes('landing') || lower.includes('startup') || lower.includes('portfolio') || lower.includes('app')) {
    return {
      score: 52,
      summary: "The prompt lacks clear styling guidelines, a defined user persona, and technology stack choices, forcing the AI to make arbitrary design decisions.",
      weaknesses: [
        {
          category: "specificity",
          title: "Style is open to interpretation",
          description: "Terms like 'cool' or 'clean' do not define visual constraints, grids, or accent limits."
        },
        {
          category: "context",
          title: "No target user profile",
          description: "Without defining who the page is for, the AI cannot craft appropriate copywriting or layout priorities."
        },
        {
          category: "constraints",
          title: "Technology is unspecified",
          description: "Does not define if this should be built in HTML/CSS, Tailwind, Next.js, or React, leading to mismatched code."
        }
      ],
      breakdown: {
        clarity: 60,
        context: 45,
        specificity: 55,
        constraints: 30
      },
      refinedPrompt: `# System Instructions
You are an expert frontend designer and engineer. Build a high-converting, single-page landing page for a modern software product.

# Visual & Styling Guidelines
- Theme: Sleek, dark-mode-first aesthetic with a paper-like charcoal base (#0c0c0e) and a crimson accent (#e11d48)
- Spacing: Restrained spacing with generous padding-y (6rem to 8rem for sections) and crisp, 1px thin borders
- Fonts: Serif headings (e.g. Playfair Display or Instrument Serif) paired with a geometric sans-serif for body copy (e.g. Inter or Geist)

# Section Architecture
1. Navigation: Minimal header containing Logo (left), links to Github / docs (center), and Theme Toggle (right)
2. Hero Section: Editorial typography with a bold header ("Say exactly what you mean"), a single paragraph of copy, and a prominent CTA button
3. Features Grid: 3-column layout highlighting product features with micro-borders and subtle hover transitions
4. CTA Block: High-contrast section with a bold secondary conversion action

# Technical constraints
- Tech stack: Pure semantic HTML, modern CSS (using custom properties), and vanilla JavaScript
- Performance: Highly responsive, fast loading, zero external library requirements`,
      expectedOutput: [
        "Editorial layout matching the modern aesthetic",
        "Semantic HTML5 page structure with clean classes",
        "Responsive stylesheet configured with CSS variables",
        "Interactive navigation and theme toggle functionality"
      ],
      expectedQuality: 9,
      isMock: true
    };
  }

  // 2. Code / React / Technical
  if (lower.includes('code') || lower.includes('react') || lower.includes('function') || lower.includes('css') || lower.includes('typescript') || lower.includes('javascript') || lower.includes('api')) {
    return {
      score: 64,
      summary: "While technical intent is present, the prompt misses specifications for typescript type-safety, edge-case validation, and performance constraints.",
      weaknesses: [
        {
          category: "specificity",
          title: "Ambiguous state handling",
          description: "Missing instruction on how to handle user interface loading, empty, and error feedback states."
        },
        {
          category: "context",
          title: "Version and style unmentioned",
          description: "Does not specify React version, custom hook preferences, or layout styling methodologies (e.g. CSS Modules vs Tailwind)."
        },
        {
          category: "constraints",
          title: "No input sanitation or errors",
          description: "Does not instruct the model to handle invalid parameters or API network failure modes."
        }
      ],
      breakdown: {
        clarity: 70,
        context: 65,
        specificity: 60,
        constraints: 40
      },
      refinedPrompt: `# Role
You are a senior React developer and TypeScript architect.

# Task
Create a reusable, highly optimized custom React hook called \`useFetchData\` for fetching and caching API resources.

# Requirements
- Type Safety: Fully generic TypeScript interface representing request parameters and response models
- State Management: Track \`data\`, \`loading\`, \`error\`, and \`isRefetching\` states using a clean \`useReducer\` pattern
- Caching: Implement a simple in-memory cache to prevent duplicate requests to the same endpoint within 5 minutes
- Resilience: Support an optional automatic retry configuration (up to 3 attempts) for transient 5xx HTTP errors

# Output Format
Provide only complete, commented, and type-checked code. Include a brief example demonstrating hook consumption in a component.`,
      expectedOutput: [
        "Complete, compile-ready React hook source code",
        "TypeScript interfaces for inputs, responses, and config",
        "State machine transitions utilizing useReducer",
        "In-memory caching and request deduplication mechanism"
      ],
      expectedQuality: 8,
      isMock: true
    };
  }

  // 3. Writing / Copywriting / Content Creation
  if (lower.includes('write') || lower.includes('copy') || lower.includes('article') || lower.includes('blog') || lower.includes('email') || lower.includes('text') || lower.includes('marketing')) {
    return {
      score: 58,
      summary: "The prompt asks for copywriting without defining the voice guidelines, tone constraints, length limits, or specific target demographic.",
      weaknesses: [
        {
          category: "clarity",
          title: "Lacks brand voice details",
          description: "Words like 'engaging' or 'interesting' are subjective and do not give structural voice guidance."
        },
        {
          category: "specificity",
          title: "Output formatting is unconstrained",
          description: "Fails to specify paragraph limits, heading distributions, or calls to action placement."
        },
        {
          category: "context",
          title: "Demographics are unspecified",
          description: "Does not target the message to a specific level of user expertise or pain point."
        }
      ],
      breakdown: {
        clarity: 62,
        context: 50,
        specificity: 58,
        constraints: 38
      },
      refinedPrompt: `# Context
We are launching a minimalist task tracker aimed at developer freelancers who are exhausted by overly complex project management systems.

# Task
Write a punchy, high-converting launch email sequence (2 emails) introducing our product.

# Brand Tone & Voice
- Minimalist, bold, and slightly witty
- Direct and conversational, avoiding typical corporate marketing fluff
- Prohibited words: 'revolutionary', 'game-changing', 'streamlined', 'innovative'

# Email 1 Structure
- Subject Line: Short (under 5 words), lowercase, curiosity-inducing
- Opening: Address the main pain point (spending more time tracking tasks than writing code)
- Solution: Introducing our tracker (explain the 1-click flow)
- CTA: Simple link ("Try it out in 10 seconds. Free.")

# Email 2 Structure (Sent 2 days later)
- Subject Line: Quick follow up
- Body: Address the fear of migration ("It takes 30 seconds to import from CSV")
- CTA: Clear text button`,
      expectedOutput: [
        "Two polished email drafts ready for sequencing",
        "Punchy subject lines adhering to character constraints",
        "Direct copy addressing developer-specific pain points",
        "No marketing clichés or corporate jargon"
      ],
      expectedQuality: 9,
      isMock: true
    };
  }

  // 4. Default Fallback
  return {
    score: 60,
    summary: "The prompt gives a general direction but misses step-by-step guidance, output formatting rules, and strict operational constraints.",
    weaknesses: [
      {
        category: "specificity",
        title: "Ambiguous task limits",
        description: "The request is stated generally without dividing it into sub-tasks or logical stages."
      },
      {
        category: "constraints",
        title: "No formatting or content rules",
        description: "Fails to set limits on size, tone, structure, or prohibited topics, allowing AI hallucinations."
      },
      {
        category: "clarity",
        title: "Success criteria is unstated",
        description: "Does not define what a successful or finished output looks like."
      }
    ],
    breakdown: {
      clarity: 65,
      context: 55,
      specificity: 62,
      constraints: 40
    },
    refinedPrompt: `# Objective
Provide a highly structured, accurate, and comprehensive guide explaining: "${prompt}"

# Instructions
1. Executive Summary: Provide a 1-paragraph explanation of the topic.
2. Step-by-Step Breakdown: Divide the core process into 4 logical phases, explaining the key requirements for each.
3. Common Pitfalls: List 3 typical mistakes people make and explain how to avoid them.
4. Additional Resources: Provide advice on what to read or implement next.

# Constraints & Tone
- Tone: Technical, precise, authoritative, and direct
- Format: Clean markdown using H1 (#) for Title, H2 (##) for Main Sections, and H3 (###) for steps
- Length: Keep the entire output under 600 words for maximum readability`,
    expectedOutput: [
      "Structured markdown document with clear headings",
      "Actionable instructions with step-by-step guidance",
      "Identified pitfalls with mitigation strategies",
      "Highly concise explanation within word count limits"
    ],
    expectedQuality: 9,
    isMock: true
  };
}
