import type { RefineResponse } from './types';

const SYSTEM_PROMPT = `You are Intent, an expert prompt engineering system. Your job is to take a rough user prompt, analyze its core intent, evaluate it across five dimensions, list its structural weaknesses, and rewrite it into a highly optimized version that conveys the user's intent with maximum clarity, specificity, and constraints.

You must return a JSON object with the following properties:
- summary: string (1-2 sentence explanation of the main issues or qualities of the prompt)
- weaknesses: array of objects, containing between 2 and 4 items. Each object must have:
  * category: string (must be strictly one of: "clarity", "context", "specificity", "constraints", "expectedOutput")
  * title: string (short, punchy title summarizing the issue)
  * description: string (brief explanation of the issue)
- breakdown: object containing scores (0-100) for each dimension:
  * clarity: number (0-100) - how clear and unambiguous the main goal is
  * context: number (0-100) - how well background info, audience, and scope are defined
  * specificity: number (0-100) - how detailed the structural instructions and expected layout are
  * constraints: number (0-100) - how well restrictions, tone limits, or prohibited patterns are defined
  * expectedOutput: number (0-100) - how clearly the desired output format, structure, and deliverables are specified
- refinedPrompt: string (the highly optimized, structured version of the prompt. Do not optimize for length; prefer precision, clear formatting, and structured markdown)
- expectedOutput: array of strings (3 to 5 clear, predicted visual or technical outcomes, e.g. "Type-safe typescript definitions", "Consistent editorial voice")
- expectedQuality: number (predicted quality score of the AI output on a scale of 1 to 10)

IMPORTANT SCORING GUIDELINES:
- Score each dimension independently from 0-100. Do NOT inflate scores.
- A prompt like "Hi" or "Hello" should score near 0 on ALL dimensions.
- A prompt like "Build me a website" should score low (10-30) on most dimensions.
- A prompt like "Build a landing page for a SaaS product" should score medium (30-60).
- A detailed, well-structured prompt with clear goals, context, specifics, constraints, and output format should score high (70-95).
- Do not assume every prompt needs every category equally. A simple factual question may not need extensive constraints, but it should still be scored honestly on each dimension.
- The overall score will be calculated by the application using weighted averages. You only provide the five dimension scores.`;

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
function validateResponse(data: any, opts?: { promptLength?: number; provider?: string }): RefineResponse {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Response is not a valid JSON object');
  }

  const summary = typeof data.summary === 'string' ? data.summary : 'Analyzed user prompt.';
  
  const weaknesses: any[] = [];
  if (Array.isArray(data.weaknesses)) {
    data.weaknesses.forEach((w: any) => {
      if (w && typeof w === 'object') {
        const cat = String(w.category || '').toLowerCase();
        let category: 'clarity' | 'context' | 'specificity' | 'constraints' | 'expectedOutput' = 'clarity';
        if (cat === 'context') category = 'context';
        else if (cat === 'specificity') category = 'specificity';
        else if (cat === 'constraints') category = 'constraints';
        else if (cat === 'expectedoutput') category = 'expectedOutput';
        
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

  // Extract and clamp dimension scores
  const getClampedScore = (val: any): number => {
    if (typeof val !== 'number') return 0;
    return Math.max(0, Math.min(100, Math.round(val)));
  };

  const clarity = getClampedScore(data.breakdown?.clarity);
  const context = getClampedScore(data.breakdown?.context);
  const specificity = getClampedScore(data.breakdown?.specificity);
  const constraints = getClampedScore(data.breakdown?.constraints);
  const expectedOutputScore = getClampedScore(data.breakdown?.expectedOutput);

  const breakdown = {
    clarity,
    context,
    specificity,
    constraints,
    expectedOutput: expectedOutputScore,
  };

  // Calculate overall score using weighted average
  // Clarity: 30%, Specificity: 25%, Expected Output: 20%, Constraints: 15%, Context: 10%
  const overallScore = Math.round(
    clarity * 0.30 +
    specificity * 0.25 +
    expectedOutputScore * 0.20 +
    constraints * 0.15 +
    context * 0.10
  );

  // DIAGNOSTIC LOGGING
  console.log('[refinePrompt] SCORE CALCULATION:', {
    promptLength: opts?.promptLength || 0,
    dimensions: { clarity, context, specificity, constraints, expectedOutput: expectedOutputScore },
    overallScore,
    isMock: !!data.isMock,
    provider: opts?.provider || data.provider || 'gemini'
  });

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
    score: overallScore,
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

  // Detect non-actionable prompts (greetings, pleasantries, etc.)
  // These should receive very low scores rather than being analyzed as actionable prompts
  const nonActionablePatterns = [
    /^(hi|hello|hey|hiya|howdy|greetings|salutations)[\s!.?]*$/i,
    /^(what'?s up|whats up|how are you|how'?s it going|how do you do)[\s!.?]*$/i,
    /^(thanks|thank you|thx|ty|appreciate it)[\s!.?]*$/i,
    /^(bye|goodbye|see you|later|farewell)[\s!.?]*$/i,
    /^(ok|okay|k|sure|yeah|yep|yup)[\s!.?]*$/i,
    /^(please|plz|pls)[\s!.?]*$/i,
    /^(test|testing|asdf|qwerty|foo|bar)[\s!.?]*$/i,
  ];

  const isNonActionable = nonActionablePatterns.some(pattern => pattern.test(cleanPrompt));

  if (isNonActionable) {
    console.log('[refinePrompt] Non-actionable prompt detected, returning minimal score');
    const result = {
      score: 1,
      summary: 'This appears to be a greeting or conversational fragment, not an actionable prompt.',
      weaknesses: [
        { category: 'clarity', title: 'No actionable intent', description: 'The input is a greeting or social pleasantry without a clear task or question.' },
        { category: 'context', title: 'No context provided', description: 'No background, audience, or scope is defined.' },
        { category: 'specificity', title: 'No specific request', description: 'There are no structural instructions or expected deliverables.' },
        { category: 'constraints', title: 'No constraints', description: 'No restrictions, tone limits, or prohibited patterns are specified.' },
        { category: 'expectedOutput', title: 'No output format', description: 'The desired output format and deliverables are not specified.' }
      ],
      breakdown: {
        clarity: 1,
        context: 0,
        specificity: 0,
        constraints: 0,
        expectedOutput: 0
      },
      refinedPrompt: `# Clarified Request
Please provide a specific, actionable prompt describing what you would like me to help you with. For example:
- "Build a landing page for a SaaS product using Astro and Tailwind"
- "Write a blog post about AI ethics for a technical audience"
- "Create a React component for a data table with sorting and filtering"`,
      expectedOutput: ['A clear, actionable prompt with defined goals and constraints'],
      expectedQuality: 1,
      isMock: true,
      provider: 'non-actionable'
    };
    console.log('[refinePrompt] SCORE CALCULATION:', {
      promptLength: cleanPrompt.length,
      dimensions: result.breakdown,
      overallScore: result.score,
      isMock: true,
      provider: 'non-actionable'
    });
    return result;
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
  const mockResult = getMockRefinement(cleanPrompt);
  const result = validateResponse({ ...mockResult, isMock: true, provider: 'mock' }, { promptLength: cleanPrompt.length, provider: 'mock' });
  return result;
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
            summary: { type: 'STRING' },
            weaknesses: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  category: { type: 'STRING', enum: ['clarity', 'context', 'specificity', 'constraints', 'expectedOutput'] },
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
                constraints: { type: 'INTEGER' },
                expectedOutput: { type: 'INTEGER' }
              },
              required: ['clarity', 'context', 'specificity', 'constraints', 'expectedOutput']
            },
            refinedPrompt: { type: 'STRING' },
            expectedOutput: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            expectedQuality: { type: 'INTEGER' }
          },
          required: ['summary', 'weaknesses', 'breakdown', 'refinedPrompt', 'expectedOutput', 'expectedQuality']
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
  return validateResponse({ ...parsed, isMock: false }, { promptLength: prompt.length, provider: 'gemini' });
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
        { role: 'system', content: `${SYSTEM_PROMPT}\nOutput must be JSON matching the required schema. Ensure weaknesses categories are one of: clarity, context, specificity, constraints, expectedOutput. The breakdown must include: clarity, context, specificity, constraints, expectedOutput (all 0-100 integers). Do NOT include an overall score field.` },
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
  return validateResponse({ ...parsed, isMock: false }, { promptLength: prompt.length, provider: 'openai' });
}

function getMockRefinement(prompt: string): RefineResponse {
  const lower = prompt.toLowerCase();
  
  // Task type detection
  const isBuildTask = /\b(build|create|make|develop|implement|design)\b/i.test(prompt);
  const isWriteTask = /\b(write|draft|compose|generate)\b/i.test(prompt);
  const isCodeTask = /\b(code|script|function|hook|component|api|endpoint)\b/i.test(prompt);
  const isImageTask = /\b(generate|create|make|design)\b.*\b(logo|image|illustration|icon|banner|mockup)\b/i.test(prompt) ||
                      /\b(image|illustration|icon|logo|banner|mockup)\b.*\b(generate|create|make|design)\b/i.test(prompt);
  const isBusinessTask = /\b(business plan|strategy|roadmap|proposal|analysis|plan)\b/i.test(prompt);
  const isQuestion = /^(what|how|why|when|where|who|which|can you|could you|tell me|explain)\b/i.test(prompt);
  
  // Quality indicators - what's actually in the prompt
  const hasTechStack = /\b(astro|tailwind|react|vue|next\.js|svelte|html|css|typescript|javascript|node|python|go|rust|stripe)\b/i.test(prompt);
  const hasTargetAudience = /\b(developers?|users?|customers?|audience|freelancers?|engineers?|designers?|marketers?|beginners?|experts?|enterprise|admin)\b/i.test(prompt);
  const hasConstraints = /\b(dark mode|mobile|responsive|accessib|SEO|performance|scalable|secure|typed|strict|validat|sanitiz|retry|timeout|cache|TTL|authentication|auth|integration|validation|error handling|loading|test|unit test|ci|configuration)\b/i.test(prompt);
  const hasSpecificSections = /\b(pricing|testimonials?|cta|hero|navbar|footer|sidebar|auth|dashboard|api|database|market analysis|revenue model|go.to.market|financial projection|checkout|stripe|readme|package\.json|ci|configuration)\b/i.test(prompt);
  const hasOutputFormat = /\b(markdown|json|html|css|component|function|hook|class|interface|type|schema|spec|vector|svg|png|pdf|repository|repo|github|readme|package\.json)\b/i.test(prompt);
  const hasQuantifiers = /\b(\d+\s*(pages?|sections?|components?|items?|emails?|words?|chars?|minutes?|hours?|days?|years?|TTL|cache)|complete|full|entire)\b/i.test(prompt);
  const hasToneVoice = /\b(tone|voice|style|brand|minimal|bold|witty|professional|casual|formal|friendly|authoritative)\b/i.test(prompt);
  const hasVisualDirection = /\b(minimal|clean|modern|bold|elegant|colorful|monochrome|dark|light|blue|white|red|green|black)\b/i.test(prompt);
  
  // --- EXECUTION RELIABILITY RUBRIC ---
  // Score each dimension based on whether the AI can execute reliably
  
  // CLARITY (30%): Is the core task unambiguous?
  let clarity = 0;
  if (isQuestion) clarity = 40; // Questions are clear but not instructions
  else if (isCodeTask || isImageTask) clarity = 65; // Code/image tasks typically have clear intent
  else if (isWriteTask) clarity = 60;
  else if (isBusinessTask) clarity = 55;
  else if (isBuildTask) {
    // Build tasks vary - only clear if tech/specifics present
    clarity = (hasTechStack || hasSpecificSections) ? 60 : 35;
  } else clarity = 15; // Vague
  
  // Specificity boosts clarity when task details are concrete
  if (hasSpecificSections) clarity += 20;
  if (hasTechStack) clarity += 10;
  if (hasVisualDirection && isImageTask) clarity += 15;
  if (hasQuantifiers) clarity += 10;
  
  // SPECIFICITY (25%): Are the structural/technical details sufficient?
  let specificity = 0;
  if (isCodeTask) {
    specificity = hasTechStack ? 70 : 40; // Code task needs tech stack
  } else if (isBuildTask) {
    if (hasTechStack && hasSpecificSections) specificity = 70;
    else if (hasTechStack || hasSpecificSections) specificity = 50;
    else specificity = 25;
  } else if (isWriteTask) {
    specificity = hasOutputFormat ? 60 : 40;
  } else if (isImageTask) {
    specificity = hasVisualDirection ? 65 : 40;
  } else if (isBusinessTask) {
    specificity = hasSpecificSections ? 65 : 35;
  } else if (isQuestion) {
    specificity = 20;
  } else {
    specificity = 15;
  }
  
  // Additional specificity boosters
  if (hasSpecificSections) specificity += 15;
  if (hasQuantifiers) specificity += 10;
  if (hasConstraints) specificity += 8;
  
  // EXPECTED OUTPUT (20%): Is the deliverable clear?
  let expectedOutput = 0;
  if (isCodeTask) expectedOutput = hasOutputFormat ? 80 : 60; // Code implies code files
  else if (isBuildTask) {
    if (hasOutputFormat) expectedOutput = 75;
    else if (hasTechStack || hasSpecificSections) expectedOutput = 50;
    else expectedOutput = 30; // Vague build task
  }
  else if (isWriteTask) expectedOutput = hasOutputFormat ? 80 : 55;
  else if (isImageTask) expectedOutput = hasOutputFormat ? 80 : 55;
  else if (isBusinessTask) expectedOutput = hasOutputFormat ? 70 : 45;
  else if (isQuestion) expectedOutput = 25;
  else expectedOutput = 20;
  
  if (hasOutputFormat) expectedOutput += 10;
  if (hasQuantifiers) expectedOutput += 8;
  
  // CONSTRAINTS (15%): Are boundaries/requirements specified?
  let constraints = 0;
  if (isCodeTask) {
    constraints = hasConstraints ? 70 : (hasTechStack ? 45 : 25);
  } else if (isBuildTask) {
    if (hasConstraints) constraints = 70;
    else if (hasTechStack && hasSpecificSections) constraints = 50;
    else if (hasTechStack || hasSpecificSections) constraints = 35;
    else constraints = 20;
  } else if (isWriteTask) {
    constraints = hasToneVoice || hasQuantifiers ? 65 : 30;
  } else if (isImageTask) {
    constraints = hasVisualDirection ? 65 : (hasConstraints ? 50 : 30);
  } else if (isBusinessTask) {
    constraints = hasQuantifiers || hasConstraints ? 60 : 30;
  } else if (isQuestion) {
    constraints = 10;
  } else {
    constraints = 15;
  }
  
  if (hasConstraints) constraints += 10;
  if (hasQuantifiers) constraints += 8;
  if (hasToneVoice) constraints += 8;
  
  // CONTEXT (10%): Is there relevant background? (Low weight - not critical for execution)
  let context = 0;
  if (isQuestion) context = 15;
  else if (isBusinessTask) context = hasTargetAudience ? 50 : 25;
  else if (isWriteTask) context = hasTargetAudience ? 45 : 20;
  else if (isBuildTask || isCodeTask) context = hasTargetAudience ? 40 : 20;
  else if (isImageTask) context = hasTargetAudience ? 35 : 15;
  else context = 15;
  
  if (hasTargetAudience) context += 10;
  
  // Clamp all scores
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  clarity = clamp(clarity);
  context = clamp(context);
  specificity = clamp(specificity);
  constraints = clamp(constraints);
  expectedOutput = clamp(expectedOutput);
  
  // Build weaknesses based on genuine gaps for the task type
  const weaknesses = [];
  
  // Only flag clarity if genuinely unclear
  if (clarity < 40) weaknesses.push({ category: "clarity" as const, title: "Goal could be clearer", description: "The main objective is not stated with enough precision." });
  
  // Context - only flag for tasks that actually need it
  const needsContext = isBusinessTask || isWriteTask;
  if (needsContext && context < 35) weaknesses.push({ category: "context" as const, title: "Missing audience/context", description: "No target user, use case, or background information provided." });
  
  // Specificity - flag if critical details missing for the task type
  const needsSpecificity = isCodeTask || isBuildTask || isImageTask || isBusinessTask;
  if (needsSpecificity && specificity < 40) weaknesses.push({ category: "specificity" as const, title: "Lacks structural detail", description: "Missing specific sections, components, or technical requirements." });
  
  // Constraints - flag if critical boundaries missing
  const needsConstraints = isCodeTask || isBuildTask || isWriteTask || isImageTask;
  if (needsConstraints && constraints < 35) weaknesses.push({ category: "constraints" as const, title: "Few constraints defined", description: "No restrictions on technology, style, format, or prohibited patterns." });
  
  // Expected output - flag if deliverable unclear
  if (expectedOutput < 40) weaknesses.push({ category: "expectedOutput" as const, title: "Output format unspecified", description: "Desired deliverables, file formats, or structure not described." });
  
  // Ensure 2-4 weaknesses
  if (weaknesses.length < 2) {
    if (!hasTechStack && (isCodeTask || isBuildTask)) weaknesses.push({ category: "constraints" as const, title: "Technology unspecified", description: "No tech stack or framework mentioned." });
    if (!hasOutputFormat && isWriteTask) weaknesses.push({ category: "expectedOutput" as const, title: "Deliverables not defined", description: "No output format or structure specified." });
    if (!hasVisualDirection && isImageTask) weaknesses.push({ category: "specificity" as const, title: "Visual direction missing", description: "No style, colors, or composition guidance provided." });
  }
  if (weaknesses.length > 4) weaknesses.length = 4;
  
  // Generate summary based on overall execution reliability
  let summary = "";
  // Weighted score matching the formula
  const weightedScore = Math.round(clarity * 0.30 + specificity * 0.25 + expectedOutput * 0.20 + constraints * 0.15 + context * 0.10);
  
  if (weightedScore < 20) {
    summary = "This prompt is very unclear. The AI would need significant clarification to produce a useful result.";
  } else if (weightedScore < 40) {
    summary = "The prompt states a general intent but has important gaps. The AI would likely need clarification on key details.";
  } else if (weightedScore < 60) {
    summary = "Usable prompt with some gaps. The AI could produce a result but may make assumptions on missing details.";
  } else if (weightedScore < 80) {
    summary = "Strong prompt. The AI has enough information to execute reliably with minimal assumptions.";
  } else if (weightedScore < 95) {
    summary = "Very well specified. The prompt clearly communicates intent, constraints, and expected output.";
  } else {
    summary = "Exceptional prompt. Unusually complete with all critical details specified.";
  }
  
  // Generate appropriate refined prompt
  let refinedPrompt = generateRefinedPrompt(prompt, hasTechStack, hasTargetAudience, hasConstraints, hasSpecificSections, hasOutputFormat);
  
  // Generate expected output
  const expectedOutputItems = generateExpectedOutput(prompt, hasTechStack, hasTargetAudience, hasOutputFormat, hasSpecificSections);
  
  const expectedQuality = clamp(Math.round(weightedScore / 10));
  
  return {
    summary,
    weaknesses,
    breakdown: { clarity, context, specificity, constraints, expectedOutput },
    refinedPrompt,
    expectedOutput: expectedOutputItems,
    expectedQuality,
    isMock: true
  };
}

function generateRefinedPrompt(original: string, hasTechStack: boolean, hasTargetAudience: boolean, hasConstraints: boolean, hasSpecificSections: boolean, hasOutputFormat: boolean): string {
  const lower = original.toLowerCase();
  
  if (lower.includes('landing') || lower.includes('website') || lower.includes('page')) {
    return `# System Instructions
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
- Performance: Highly responsive, fast loading, zero external library requirements`;
  }
  
  if (lower.includes('blog') || lower.includes('article') || lower.includes('write')) {
    return `# Context
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
- CTA: Clear text button`;
  }
  
  // Default generic refined prompt
  return `# Objective
Provide a highly structured, accurate, and comprehensive guide explaining: "${original}"

# Instructions
1. Executive Summary: Provide a 1-paragraph explanation of the topic.
2. Step-by-Step Breakdown: Divide the core process into 4 logical phases, explaining the key requirements for each.
3. Common Pitfalls: List 3 typical mistakes people make and explain how to avoid them.
4. Additional Resources: Provide advice on what to read or implement next.

# Constraints & Tone
- Tone: Technical, precise, authoritative, and direct
- Format: Clean markdown using H1 (#) for Title, H2 (##) for Main Sections, and H3 (###) for steps
- Length: Keep the entire output under 600 words for maximum readability`;
}

function generateExpectedOutput(original: string, hasTechStack: boolean, hasTargetAudience: boolean, hasOutputFormat: boolean, hasSpecificSections: boolean): string[] {
  const lower = original.toLowerCase();
  
  if (lower.includes('landing') || lower.includes('website') || lower.includes('page')) {
    return [
      "Editorial layout matching the modern aesthetic",
      "Semantic HTML5 page structure with clean classes",
      "Responsive stylesheet configured with CSS variables",
      "Interactive navigation and theme toggle functionality"
    ];
  }
  
  if (lower.includes('blog') || lower.includes('article') || lower.includes('write')) {
    return [
      "Two polished email drafts ready for sequencing",
      "Punchy subject lines adhering to character constraints",
      "Direct copy addressing developer-specific pain points",
      "No marketing clichés or corporate jargon"
    ];
  }
  
  return [
    "Structured markdown document with clear headings",
    "Actionable instructions with step-by-step guidance",
    "Identified pitfalls with mitigation strategies",
    "Highly concise explanation within word count limits"
  ];
}
