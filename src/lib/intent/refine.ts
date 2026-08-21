import type { RefineResponse } from './types';

const SYSTEM_PROMPT = `You are Intent, an expert prompt engineering system. Your job is to take a rough user prompt, analyze its core intent, evaluate it across five dimensions, list its structural weaknesses, and rewrite it into a highly optimized version that conveys the user's intent with maximum clarity, specificity, and constraints.

## CORE PROCESS (follow this for every prompt):

1. **ANALYZE INTENT & DOMAIN SEMANTICALLY**: Determine the core objective and the domain of the user's request by understanding what they are actually trying to accomplish. Do NOT match keywords mechanically. The domain could be any of the following (examples, not a closed list):
   - planning (trip, event, schedule, itinerary)
   - coding (building software, apps, APIs, components)
   - debugging (fixing errors, crashes, memory leaks)
   - writing (creative, professional, personal messages)
   - education (explaining concepts, teaching, tutorials)
   - research (gathering information, literature review)
   - analysis (business metrics, root cause, strategy)
   - comparison (evaluating options, trade-offs)
   - design (visual, brand, UI/UX, packaging)
   - preparation/coaching (interview prep, exam study, skill practice)
   - brainstorming (ideation, naming, creative generation)
   - decision support (weighing options, pros/cons)
   - any other actionable domain

2. **DETERMINE THE NATURAL STRUCTURE**: Identify what structure, sections, and details would be most helpful for an AI system to execute this task successfully. Do NOT apply a rigid, universal template. The structure must adapt entirely to the domain:
   - Travel/Trip: Destination, season, duration, budget, itinerary, packing/connectivity logistics.
   - Recipe: Prep/cook time, serving size, ingredients grouped by stage, step-by-step cooking steps.
   - Code/Scripting: Language/runtime, inputs/outputs, CLI flags, logic requirements, error handling, tests.
   - Troubleshooting: Code snippet, environment details, exact error stack, debugging steps, validation.
   - Creative Writing: Recipient relationship, emotional goal, tone/style guidelines, specific details to weave in.
   - Business Analysis: Problem definition, key metrics, quantitative/qualitative data sources, hypotheses, deliverables.
   - Educational Explanation: Target audience level (e.g., child, beginner), key analogies, step-by-step concept walkthroughs, base-case rules.
   - Product Comparison: Flagship models, evaluation criteria (performance, build, camera), pros/cons, purchasing recommendations.
   - Design: Brand context, target audience, style preferences, color/typography specs, output vector formats.
   - Interview/Exam Prep: Target role, study timeline, topics to cover, practice methods, mock scenarios.
   - Brainstorming: Theme, constraints, quantity/quality goals, evaluation criteria.
   - Decision Support: Criteria, options, trade-offs, risk assessment, recommendation framework.

3. **ADD ONLY DOMAIN-SPECIFIC DETAILS**: Make sensible assumptions where necessary to make the prompt executable, or explicitly prompt the downstream AI to clarify missing parameters. Do NOT include generic sections like Executive Summary, Step-by-Step Breakdown, Common Pitfalls, Additional Resources, tone, format, or word count unless they genuinely make sense for the task.

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
- refinedPrompt: string (the highly optimized, structured version of the prompt, dynamically organized using sections that naturally fit the specific task domain. Do NOT include Executive Summary, Step-by-Step Breakdown, Common Pitfalls, Additional Resources, word limits, or generic tone/format sections unless they are genuinely appropriate for the request.)
- expectedOutput: array of strings (3 to 5 clear, predicted visual or technical outcomes, e.g., "Type-safe typescript definitions", "A Day-by-day travel route")
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
  const geminiKey = process.env.GEMINI_API_KEY || import.meta.env?.GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY || import.meta.env?.OPENAI_API_KEY;

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

function extractTopic(prompt: string): string {
  let clean = prompt.trim();
  // Strip common leading action verbs and prefixes case-insensitively
  clean = clean.replace(/^(make me a|make me|build me a|build me|write a|write an|write|create a|create an|create|plan a|plan an|plan|design a|design an|design|explain|analyze why|analyze|compare|compare the|debug this|debug|help me prepare for a|help me prepare for|help me|give me a recipe for|give me a|give me|how does|what is|how to|fix|study for)\s+/i, '');
  // Capitalize first letter
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean;
}

function getMockRefinement(prompt: string): RefineResponse {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  
  // Category detection using general heuristics
  const isPlanning = /\b(trip|travel|vacation|itinerary|camping|planning|plan|organize|schedule|party|event|wedding|housewarming|house warming)\b/i.test(prompt);
  const isDebugging = /\b(fix|debug|error|crash|issue|bug|memory leak|exception|warning|leak)\b/i.test(prompt);
  const isScripting = /\b(script|automation|convert|parse|transform|csv|json|xml|yaml|excel|pandas|utility|tool|cron|scrape)\b/i.test(prompt);
  const isCoding = /\b(app|application|mobile app|website|api|component|system|dashboard|site|backend|frontend|database|code|function|hook|endpoint|react|vue|angular|svelte|nextjs|typescript|javascript|node|python|go|rust)\b/i.test(prompt);
  const isWriting = /\b(write|draft|compose|message|letter|email|card|note|speech|toast|poem|story|apology|birthday|anniversary|congratulations|thank you)\b/i.test(prompt);
  const isAnalysis = /\b(analyze|analysis|audit|review|assess|evaluate|why|churn|retention|metrics|kpi|strategy|roadmap|launch|startup|business|summarize|summary|research|paper)\b/i.test(prompt);
  const isEducation = /\b(explain|teach|learn|understand|concept|tutorial|simple|like i'm|eli5|beginner|high-school|kid|student)\b/i.test(prompt);
  const isDesign = /\b(design|logo|brand|visual|illustration|icon|banner|poster|mockup|ui|ux|wireframe|packaging|photography|photo|sketch|drawing|painting)\b/i.test(prompt);
  const isComparison = /\b(compare|comparison|versus|vs|difference between|pros and cons)\b/i.test(prompt);
  const isPreparation = /\b(prepare|prep|study for|interview|exam|test|coaching|practice|rehearse|get ready for)\b/i.test(prompt);
  const isDecisionSupport = /\b(decide|decision|choose|choice|should i|weigh|pros and cons of|trade.?off)\b/i.test(prompt);
  const isBrainstorming = /\b(brainstorm|ideate|names for|name ideas|generate ideas|come up with)\b/i.test(prompt);

  // Quality indicators - what's actually in the prompt
  const hasTechStack = /\b(astro|tailwind|react|vue|next\.js|svelte|html|css|typescript|javascript|node|python|go|rust|stripe|postgresql|mongodb)\b/i.test(prompt);
  const hasTargetAudience = /\b(developers?|users?|customers?|audience|freelancers?|engineers?|designers?|marketers?|beginners?|experts?|enterprise|admin|brother|girlfriend|student|kid)\b/i.test(prompt);
  const hasConstraints = /\b(dark mode|mobile|responsive|accessib|SEO|performance|scalable|secure|typed|strict|validat|sanitiz|retry|timeout|cache|TTL|authentication|auth|integration|validation|error handling|loading|test|unit test|ci|configuration|heartfelt)\b/i.test(prompt);
  const hasSpecificSections = /\b(pricing|testimonials?|cta|hero|navbar|footer|sidebar|auth|dashboard|api|database|market analysis|revenue model|go.to.market|financial projection|checkout|stripe|readme|package\.json|ci|configuration|ingredients|steps|itinerary)\b/i.test(prompt);
  const hasOutputFormat = /\b(markdown|json|html|css|component|function|hook|class|interface|type|schema|spec|vector|svg|png|pdf|repository|repo|github|readme|package\.json)\b/i.test(prompt);
  const hasQuantifiers = /\b(\d+\s*(pages?|sections?|components?|items?|emails?|words?|chars?|minutes?|hours?|days?|years?|people|guests|TTL|cache)|complete|full|entire)\b/i.test(prompt);
  const hasToneVoice = /\b(tone|voice|style|brand|minimal|bold|witty|professional|casual|formal|friendly|authoritative|heartfelt|sincere)\b/i.test(prompt);
  const hasVisualDirection = /\b(minimal|clean|modern|bold|elegant|colorful|monochrome|dark|light|blue|white|red|green|black|premium)\b/i.test(prompt);

  // --- SCORE CALCULATION ---
  // Clarity
  let clarity = 0;
  if (isComparison) clarity = 55;
  else if (isDebugging) clarity = 50;
  else if (isPreparation) clarity = 55;
  else if (isDecisionSupport) clarity = 50;
  else if (isBrainstorming) clarity = 50;
  else if (isScripting || isCoding) clarity = hasTechStack ? 65 : 45;
  else if (isPlanning) clarity = 55;
  else if (isWriting) clarity = 60;
  else if (isAnalysis) clarity = 55;
  else if (isEducation) clarity = 50;
  else if (isDesign) clarity = 65;
  else clarity = 15;
  
  if (hasSpecificSections) clarity += 20;
  if (hasTechStack) clarity += 10;
  if (hasVisualDirection && (isDesign || isCoding)) clarity += 15;
  if (hasQuantifiers) clarity += 10;

  // Specificity
  let specificity = 0;
  if (isCoding || isScripting) {
    specificity = hasTechStack ? 70 : 40;
  } else if (isDebugging) {
    specificity = 30;
  } else if (isWriting) {
    specificity = hasOutputFormat ? 60 : 40;
  } else if (isDesign) {
    specificity = hasVisualDirection ? 65 : 40;
  } else if (isAnalysis || isComparison) {
    specificity = hasSpecificSections ? 65 : 35;
  } else if (isPlanning) {
    specificity = hasSpecificSections ? 60 : 35;
  } else if (isPreparation) {
    specificity = hasSpecificSections ? 55 : 30;
  } else if (isDecisionSupport) {
    specificity = hasSpecificSections ? 50 : 25;
  } else if (isBrainstorming) {
    specificity = hasSpecificSections ? 50 : 25;
  } else if (isEducation) {
    specificity = 30;
  } else {
    specificity = 15;
  }
  
  if (hasSpecificSections) specificity += 15;
  if (hasQuantifiers) specificity += 10;
  if (hasConstraints) specificity += 8;

  // Expected Output
  let expectedOutput = 0;
  if (isCoding || isScripting || isDebugging) expectedOutput = hasOutputFormat ? 80 : 60;
  else if (isWriting) expectedOutput = hasOutputFormat ? 80 : 55;
  else if (isDesign) expectedOutput = hasOutputFormat ? 80 : 55;
  else if (isAnalysis || isComparison) expectedOutput = hasOutputFormat ? 70 : 45;
  else if (isPlanning) expectedOutput = 50;
  else if (isPreparation) expectedOutput = 55;
  else if (isDecisionSupport) expectedOutput = 50;
  else if (isBrainstorming) expectedOutput = 45;
  else if (isEducation) expectedOutput = 35;
  else expectedOutput = 20;
  
  if (hasOutputFormat) expectedOutput += 10;
  if (hasQuantifiers) expectedOutput += 8;

  // Constraints
  let constraints = 0;
  if (isCoding || isScripting || isDebugging) {
    constraints = hasConstraints ? 70 : (hasTechStack ? 45 : 25);
  } else if (isWriting) {
    constraints = hasToneVoice || hasQuantifiers ? 65 : 30;
  } else if (isDesign) {
    constraints = hasVisualDirection ? 65 : (hasConstraints ? 50 : 30);
  } else if (isAnalysis || isComparison || isPlanning) {
    constraints = hasQuantifiers || hasConstraints ? 60 : 30;
  } else if (isPreparation) {
    constraints = hasConstraints ? 55 : 25;
  } else if (isDecisionSupport) {
    constraints = hasConstraints ? 50 : 20;
  } else if (isBrainstorming) {
    constraints = hasConstraints ? 45 : 15;
  } else if (isEducation) {
    constraints = hasConstraints ? 50 : 20;
  } else {
    constraints = 15;
  }
  
  if (hasConstraints) constraints += 10;
  if (hasQuantifiers) constraints += 8;
  if (hasToneVoice) constraints += 8;

  // Context
  let context = 0;
  if (isAnalysis || isComparison) context = hasTargetAudience ? 50 : 25;
  else if (isWriting || isEducation || isPreparation || isDecisionSupport || isBrainstorming) context = hasTargetAudience ? 45 : 20;
  else if (isCoding || isScripting || isDebugging || isPlanning) context = hasTargetAudience ? 40 : 20;
  else if (isDesign) context = hasTargetAudience ? 35 : 15;
  else context = 15;
  
  if (hasTargetAudience) context += 10;

  // Clamp
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  clarity = clamp(clarity);
  context = clamp(context);
  specificity = clamp(specificity);
  constraints = clamp(constraints);
  expectedOutput = clamp(expectedOutput);

  // Weaknesses
  const weaknesses: Weakness[] = [];
  if (clarity < 40) weaknesses.push({ category: "clarity", title: "Goal could be clearer", description: "The main objective is not stated with enough precision." });
  
  const needsContext = isAnalysis || isComparison || isWriting || isEducation || isPreparation || isDecisionSupport || isBrainstorming;
  if (needsContext && context < 35) weaknesses.push({ category: "context", title: "Missing audience/context", description: "No target user, use case, or background information provided." });
  
  const needsSpecificity = isCoding || isScripting || isDebugging || isDesign || isAnalysis || isComparison || isPreparation || isDecisionSupport || isBrainstorming;
  if (needsSpecificity && specificity < 40) weaknesses.push({ category: "specificity", title: "Lacks structural detail", description: "Missing specific sections, components, or technical requirements." });
  
  const needsConstraints = isCoding || isScripting || isDebugging || isWriting || isDesign || isPreparation || isDecisionSupport || isBrainstorming;
  if (needsConstraints && constraints < 35) weaknesses.push({ category: "constraints", title: "Few constraints defined", description: "No restrictions on technology, style, format, or prohibited patterns." });
  
  if (expectedOutput < 40) weaknesses.push({ category: "expectedOutput", title: "Output format unspecified", description: "Desired deliverables, file formats, or structure not described." });
  
  // Ensure 2-4 weaknesses
  if (weaknesses.length < 2) {
    if (!hasTechStack && (isCoding || isScripting || isDebugging)) {
      weaknesses.push({ category: "constraints", title: "Technology unspecified", description: "No tech stack or framework mentioned." });
    }
    if (!hasOutputFormat && isWriting) {
      weaknesses.push({ category: "expectedOutput", title: "Deliverables not defined", description: "No output format or structure specified." });
    }
    if (!hasVisualDirection && isDesign) {
      weaknesses.push({ category: "specificity", title: "Visual direction missing", description: "No style, colors, or composition guidance provided." });
    }
  }
  if (weaknesses.length === 0) {
    weaknesses.push({ category: "clarity", title: "General scope", description: "The prompt could define specific milestones or stages of implementation." });
    weaknesses.push({ category: "context", title: "Assumptions check", description: "Specify core assumptions that the AI should make while executing." });
  }
  if (weaknesses.length > 4) weaknesses.length = 4;

  // Weighted score matching the formula
  const weightedScore = Math.round(clarity * 0.30 + specificity * 0.25 + expectedOutput * 0.20 + constraints * 0.15 + context * 0.10);

  let summary = "";
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

  // Dynamic templates generation
  const topic = extractTopic(cleanPrompt);
  let refinedPrompt = "";
  let expectedOutputItems: string[] = [];

  if (isPlanning) {
    refinedPrompt = `# Objective\nCreate a comprehensive plan and execution strategy for: ${topic}.\n\n# Details & Parameters\n- Target: ${topic}\n- Scale/Group Size: [Specify number of participants or attendees]\n- Timeline & Duration: [Define dates, duration, and key milestones]\n- Budget: [Set maximum budget and allocation targets]\n- Location/Venue: [Detail destination, lodging, or venue requirements]\n\n# Logistics & Coordination\n- Resources: Travel passes, tickets, equipment, and supply lists.\n- Booking & Reservations: Travel arrangements, accommodations, or venue bookings.\n- Communication: Plan for keeping participants aligned and informed.\n- Contingency: Alternative plans for weather or last-minute changes.\n\n# Execution Checklist\n- [ ] Research and finalize location/venue options.\n- [ ] Draft initial budget and share with key stakeholders.\n- [ ] Create detailed schedule/itinerary.\n- [ ] Confirm reservations and procure necessary gear/supplies.\n- [ ] Conduct pre-event briefing or final packing check.`;
    expectedOutputItems = [
      "Complete schedule or day-by-day itinerary",
      "Itemized budget projection spreadsheet",
      "Packing list and supply checklist",
      "Contingency protocols for common risks"
    ];
  } else if (isDebugging) {
    refinedPrompt = `# Objective\nTroubleshoot, explain, and resolve the technical issue: ${topic}.\n\n# Required Context & Reproduction\n- Issue Description: ${topic}\n- Environment: [Specify framework version, operating system, and runtime version]\n- Error Trace: [Provide full error stack trace or compiler warning logs]\n- Failure Code: [Share the code snippet or component where the error occurs]\n\n# Debugging Methodology\n1. Analysis: Trace the state transitions and variables leading to the crash.\n2. Isolation: Determine if the bug originates in client state, API payload, or dependencies.\n3. Fix Strategy: Modify code logic to handle edge cases and prevent crash states.\n4. Validation: Verify resolution by asserting expected outputs under identical conditions.\n\n# Resolution Deliverables\n- Step-by-step implementation guide for the fix.\n- Clean, refactored code snippet resolving the issue.\n- Regression prevention checklist.`;
    expectedOutputItems = [
      "Detailed explanation of the root cause of the error",
      "Corrected code snippet implementing the fix",
      "Verification steps and performance assertions",
      "Long-term preventative architectural recommendations"
    ];
  } else if (isScripting) {
    refinedPrompt = `# Objective\nWrite an automated script or utility to: ${topic}.\n\n# System Specifications\n- Script Goal: ${topic}\n- Runtime/Language: [Specify language like Python, Node.js, Bash]\n- Input Source: [Define input format, directory, or API endpoint]\n- Output Target: [Define output format, destination file, or database]\n\n# Functional Requirements\n1. Configuration: Support CLI argument parsing for paths and operational modes.\n2. Data Processing: Stream, batch, or process records efficiently.\n3. Error Handling: Graceful handling of malformed records, encoding errors, and resource locks.\n4. Validation: Assert integrity of input data before transformation.\n\n# Execution Constraints\n- Use standard libraries where possible to minimize dependencies.\n- Optimize memory usage for handling large inputs.\n- Log progress and errors to stdout/stderr.`;
    expectedOutputItems = [
      "Executable script file with documented CLI flags",
      "Input validation schemas and mock sample datasets",
      "Error logs formatting structure",
      "Transformation unit tests"
    ];
  } else if (isCoding) {
    refinedPrompt = `# Objective\nDesign and implement a software solution for: ${topic}.\n\n# Technical Specifications\n- Core Objective: ${topic}\n- Platform/Target: [Specify iOS, Android, Web, or cross-platform]\n- Tech Stack: [Define frontend framework, backend runtime, and database]\n- State Management: [Define state management library or architecture]\n\n# Key Features\n1. User Management: Authentication, authorization, and profile settings.\n2. Core Domain Logic: Key screens, services, or APIs required for ${topic}.\n3. Data Sync & API: Client-server communication protocol (REST, GraphQL, WebSocket).\n4. Performance & Styling: Styling framework (Tailwind, CSS Modules) and performance bounds.\n\n# Architecture & Code Quality\n- Clean code principles with separation of concerns.\n- Type safety using strict compilation rules.\n- Modular component structure with reuse guidelines.\n- Error boundaries and user-friendly error reporting.\n\n# Testing & Deployment\n- Unit testing requirements (>80% coverage on business logic).\n- Integration and end-to-end testing strategy.\n- CI/CD automation and production deployment target.`;
    expectedOutputItems = [
      "Clean, documented, and type-safe codebase",
      "Detailed API specification and data schema",
      "Comprehensive test suite covering core functionality",
      "Deployment guide and CI/CD configuration files"
    ];
  } else if (isWriting) {
    refinedPrompt = `# Objective\nCompose a polished piece of writing for: ${topic}.\n\n# Narrative Context\n- Purpose: ${topic}\n- Target Audience/Recipient: [Define relationship and demographics]\n- Key Message: [State the primary sentiment or information to convey]\n\n# Style & Tone Guidelines\n- Tone: [Choose emotional spectrum, e.g., sincere, romantic, formal, witty]\n- Perspective: [Specify first-person, third-person, etc.]\n- Word Count: [Define target length or character constraints]\n- Delivery Format: [Specify card, email, slack message, public speech]\n\n# Content Structure\n- Hook: Open with a warm greeting or compelling statement.\n- Personalization: Incorporate specific details, anecdotes, or traits.\n- Call to Action/Closing: End with a meaningful statement or sign-off.`;
    expectedOutputItems = [
      "Polished text content ready for delivery",
      "Alternative tone variations (e.g., formal vs. casual)",
      "Delivery timing and layout advice"
    ];
  } else if (isAnalysis) {
    refinedPrompt = `# Objective\nConduct a professional analysis and strategy report for: ${topic}.\n\n# Scope of Analysis\n- Focus Area: ${topic}\n- Core Domain: [Describe business type, product, and industry]\n- Available Data: [Detail quantitative spreadsheets, user feedback, or metrics]\n\n# Analytical Approach\n1. Diagnose: Map symptoms and historical trends for the target focus area.\n2. Hypotheses: Propose 3-5 possible causes or growth levers.\n3. Verification: Filter findings against qualitative and quantitative data.\n4. Solution: Formulate prioritized strategic initiatives.\n\n# Deliverables\n- Executive Summary summarizing core findings in 1-2 paragraphs.\n- Root Cause / Market Assessment report with supporting evidence.\n- Prioritized Action Plan with owners and success KPIs.`;
    expectedOutputItems = [
      "Executive summary briefing deck or report",
      "Data-backed root cause analysis document",
      "Strategic recommendation matrix (impact vs. effort)",
      "Key performance indicators dashboard layout"
    ];
  } else if (isEducation) {
    refinedPrompt = `# Objective\nExplain the following concept in a clear, educational manner: ${topic}.\n\n# Pedagogical Profile\n- Concept to Teach: ${topic}\n- Target Student: [Define age, education level, or background knowledge]\n- Core Objective: [Detail if they need intuitive understanding or technical proficiency]\n\n# Structure of Explanation\n- The Hook: Start with a relatable real-world analogy.\n- Core Definition: State the concept in simple, jargon-free language.\n- Breakdown: Explain step-by-step how the concept operates.\n- Analogy: Map technical concepts to everyday experiences.\n- Quiz/Check: Ask questions or design a micro-exercise to verify understanding.`;
    expectedOutputItems = [
      "Jargon-free conceptual explanation",
      "Relatable, visual analogy walkthrough",
      "Interactive check-for-understanding questions",
      "Summary sheet with mnemonics"
    ];
  } else if (isPreparation) {
    refinedPrompt = `# Objective\nPrepare systematically for: ${topic}.\n\n# Target Goal\n- What: ${topic}\n- Desired Outcome: [Define what success looks like: pass interview, ace exam, deliver presentation]\n- Timeline: [Specify preparation window: days, weeks, months]\n\n# Scope & Coverage\n- Key Topics: [List core subjects, frameworks, or skills to master]\n- Depth: [High-level familiarity vs. deep technical mastery]\n- Resources: [Books, courses, documentation, practice platforms]\n\n# Preparation Strategy\n1. Diagnostic: Assess current knowledge gaps with a baseline test or review.\n2. Structured Study: Allocate time blocks per topic using spaced repetition.\n3. Active Practice: Mock interviews, timed exercises, flashcards, or past papers.\n4. Feedback Loop: Review mistakes, refine weak areas, iterate.\n\n# Mock & Simulation\n- Simulated Conditions: Replicate real environment (time limits, format).\n- Peer Review: Practice with a partner or mentor for feedback.\n\n# Readiness Checklist\n- [ ] All core topics covered at target depth.\n- [ ] Practice runs completed with target scores.\n- [ ] Reference materials organized for quick review.`;
    expectedOutputItems = [
      "Structured study plan with milestones",
      "Topic coverage checklist with progress tracking",
      "Mock interview/exam results and feedback",
      "Curated resource list (links, books, practice tools)"
    ];
  } else if (isDecisionSupport) {
    refinedPrompt = `# Objective\nStructure a decision-making process for: ${topic}.\n\n# Decision Context\n- Decision to Make: ${topic}\n- Stakeholders: [Who is affected or should be consulted]\n- Timeframe: [When must the decision be made]\n- Reversibility: [Can this be changed later?]\n\n# Options & Alternatives\n- Option A: [Describe first alternative]\n- Option B: [Describe second alternative]\n- Option C: [Additional alternatives if any]\n- Status Quo: [What happens if you do nothing]\n\n# Evaluation Criteria\n- Criterion 1: [e.g., Financial impact, weight: High/Medium/Low]\n- Criterion 2: [e.g., Career growth, weight: High/Medium/Low]\n- Criterion 3: [e.g., Lifestyle/location, weight: High/Medium/Low]\n- Criterion 4: [e.g., Risk tolerance, weight: High/Medium/Low]\n\n# Analysis Process\n1. Evidence Gathering: Data, testimonials, expert opinions for each option.\n2. Scoring: Rate each option against criteria (1-5 scale).\n3. Weighted Sum: Calculate totals to surface preferences.\n4. Sensitivity: Test how scores change if weights shift.\n\n# Risk & Mitigation\n- Worst Case per Option: [What could go wrong]\n- Mitigation: [How to reduce downside]\n- Regret Minimization: [Which choice minimizes future regret]\n\n# Decision Log\n- Final Choice: [Selected option]\n- Rationale: [Why this option won]\n- Commitment Date: [When you'll act]`;
    expectedOutputItems = [
      "Decision matrix with scored options",
      "Risk assessment per alternative",
      "Weighted criteria analysis",
      "Written rationale for final choice"
    ];
  } else if (isBrainstorming) {
    refinedPrompt = `# Objective\nGenerate creative ideas and options for: ${topic}.\n\n# Creative Brief\n- Ideation Goal: ${topic}\n- Target Audience/Context: [Who will see/use these ideas]\n- Quantity Goal: [How many ideas needed: 10, 20, 50+]\n- Quality Threshold: [Any viable ideas or only polished, differentiated concepts]\n\n# Stimulus & Constraints\n- Themes/Styles: [e.g., modern, playful, premium, minimal, local]\n- Naming Conventions: [e.g., compound words, metaphors, acronyms, foreign words]\n- Must Avoid: [Trademark conflicts, negative connotations, hard to spell]\n- Must Include: [Keywords, location reference, founder name]\n\n# Ideation Process\n1. Divergent: Rapid listing without judgment (set timer: 10-15 min).\n2. Categorize: Group by theme, tone, or structure.\n3. Screen: Filter for trademark availability, pronounceability, memorability.\n4. Refine: Polish top 5-10 candidates with taglines.\n\n# Evaluation Criteria\n- Memorability: Easy to recall and spell.\n- Distinctiveness: Stands out from competitors.\n- Relevance: Connects to brand promise.\n- Extensibility: Works for future product lines.\n\n# Deliverables\n- Long list (all raw ideas).\n- Shortlist (top 10-20 with rationale).\n- Final recommendations (3-5 with taglines and availability check).`;
    expectedOutputItems = [
      "Long list of raw creative ideas",
      "Categorized and screened shortlist",
      "Top recommendations with taglines",
      "Availability and trademark check notes"
    ];
  } else if (isDesign) {
    refinedPrompt = `# Objective\nCreate a visual design and assets guide for: ${topic}.\n\n# Brand Profile\n- Subject: ${topic}\n- Vibe/Personality: [Define style, e.g., minimalist, corporate, organic, retro]\n- Target Demographic: [Define age, preferences, and demographics]\n\n# Aesthetic Direction\n- Color System: [Specify dominant colors, neutral accents, and mood]\n- Typography: [Define typeface style: serif, sans-serif, monospaced]\n- Imagery/Mark: [Define symbols, icons, or visual concepts to explore]\n\n# Technical Deliverables\n- Export Formats: Vector (SVG, AI) and raster images (PNG, WebP).\n- Variations: Primary layout, stacked layout, and a simplified icon-only version.\n- Usability Specs: Must retain legibility at small sizes and work in monochrome.`;
    expectedOutputItems = [
      "Vector source files and production assets",
      "Brand style guide detailing colors, fonts, and grid lines",
      "Mockups showing design applied to physical/digital media"
    ];
  } else if (isComparison) {
    refinedPrompt = `# Objective\nConduct a comparative research evaluation for: ${topic}.\n\n# Scope of Evaluation\n- Comparison Targets: ${topic}\n- Target Application/Use Case: [Define where and how these technologies/products will be used]\n- Evaluation Constraints: [Specify timeframe, budget, scale, or developer skill level]\n\n# Comparison Criteria\n- Feature Set: Functional capability comparison.\n- Performance: Throughput, speed, and resource efficiency.\n- Cost & Operations: Initial cost, maintenance overhead, and scalability.\n- Ecosystem & Support: Documentation, community size, and tooling support.\n\n# Analysis Deliverables\n- Structured Comparison Matrix with side-by-side grading.\n- Pros and Cons overview for each candidate option.\n- Recommended Decision Logic mapping options to specific project scales.`;
    expectedOutputItems = [
      "Side-by-side feature comparison table",
      "Grade sheet assessing performance and operational cost",
      "Pros & cons assessment summary",
      "Final architectural or business recommendation report"
    ];
  } else {
    refinedPrompt = `# Objective\nExecute the following task: ${topic}.\n\n# Task Details\n- Core Request: ${topic}\n- Target Audience/User: [Specify who this is for]\n- Core Deliverable: [Define what success looks like]\n\n# Steps & Methodology\n1. Preparation: Gather resources and verify constraints.\n2. Draft/Build: Create the initial version based on target criteria.\n3. Review/Refine: Audit against quality standards and constraints.\n\n# Constraints\n- Tone/Style: [Specify preferred style]\n- File Format/Delivery: [Specify output format]`;
    expectedOutputItems = [
      "Actionable refined prompt",
      "Identified questions to resolve before proceeding",
      "Success criteria checklist"
    ];
  }

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

function generateExpectedOutput(original: string, hasTechStack: boolean, hasTargetAudience: boolean, hasOutputFormat: boolean, hasSpecificSections: boolean): string[] {
  const lower = original.toLowerCase();
  
  // Script / Automation - Check first to avoid colliding with creative writing "write"
  if (/\b(script|automation|convert|parse|transform|csv|json|xml|yaml|excel|pandas|python|bash|shell|cli|utility|tool)\b/i.test(original)) {
    return [
      "Working, tested script with CLI interface",
      "Error handling and input validation",
      "Documentation with usage examples",
      "Test suite with edge cases",
      "Configurable for reuse"
    ];
  }
  
  // Planning / Event
  if (/\b(plan|planning|organize|organising|schedule|itinerary|party|event|wedding|housewarming|house warming|trip|vacation|travel)\b/i.test(original)) {
    return [
      "Complete event timeline with time blocks",
      "Guest list tracker with RSVP status",
      "Budget breakdown with actual vs planned",
      "Shopping and preparation checklists",
      "Contingency plans for common issues"
    ];
  }
  
  // Mobile app
  if (/\b(app|application|mobile app|ios|android|flutter|react native|swift|kotlin)\b/i.test(original)) {
    return [
      "Functional mobile app with core features",
      "Clean, documented codebase with architecture",
      "CI/CD pipeline for automated builds",
      "Test suite with unit and integration tests",
      "App store deployment configuration"
    ];
  }
  
  // Writing / Creative
  if (/\b(write|compose|draft|message|letter|email|card|note|speech|toast|poem|story|birthday|anniversary|congratulations|condolences|thank you|apology)\b/i.test(original)) {
    return [
      "Polished message ready to send",
      "Alternative versions for different tones",
      "Guidance on timing and delivery",
      "Personal touches that show genuine care"
    ];
  }
  
  // Analysis / Business
  if (/\b(analyze|analysis|audit|review|assess|evaluate|why|churn|retention|customers|startup|business|metrics|kpi|roi|conversion|funnel)\b/i.test(original)) {
    return [
      "Root cause analysis with supporting evidence",
      "Prioritized actionable recommendations",
      "Implementation roadmap with owners",
      "Success metrics and monitoring plan",
      "Executive summary for stakeholders"
    ];
  }
  
  // Educational / Explanation
  if (/\b(explain|teach|learn|understand|how does|what is|concept|tutorial|like i'm|eli5|simply|beginner)\b/i.test(original)) {
    return [
      "Clear explanation with relatable analogy",
      "Step-by-step walkthrough with examples",
      "Mental model or mnemonic for retention",
      "Common misconceptions addressed",
      "Micro-exercise to verify understanding"
    ];
  }
  
  // Preparation / Coaching
  if (/\b(prepare|prep|study for|interview|exam|test|coaching|practice|rehearse|get ready for)\b/i.test(original)) {
    return [
      "Structured study plan with milestones",
      "Topic coverage checklist with progress tracking",
      "Mock interview/exam results and feedback",
      "Curated resource list (links, books, practice tools)"
    ];
  }
  
  // Decision Support
  if (/\b(decide|decision|choose|choice|should i|weigh|pros and cons of|trade.?off)\b/i.test(original)) {
    return [
      "Decision matrix with scored options",
      "Risk assessment per alternative",
      "Weighted criteria analysis",
      "Written rationale for final choice"
    ];
  }
  
  // Brainstorming / Ideation
  if (/\b(brainstorm|ideate|names for|name ideas|generate ideas|come up with)\b/i.test(original)) {
    return [
      "Long list of raw creative ideas",
      "Categorized and screened shortlist",
      "Top recommendations with taglines",
      "Availability and trademark check notes"
    ];
  }
  
  // Design / Visual
  if (/\b(logo|design|brand|visual|illustration|icon|banner|poster|flyer|mockup|ui|ux|wireframe|prototype|figma)\b/i.test(original)) {
    return [
      "Complete logo system with variations",
      "Brand style guide with specs",
      "Production-ready vector files",
      "Usage examples across touchpoints",
      "Technical specifications for vendors"
    ];
  }
  
  // General fallback
  return [
    "Clear, actionable refined prompt",
    "Identified missing information to resolve",
    "Task-appropriate structure and detail level"
  ];
}
