import type { APIRoute } from 'astro';
import { refinePrompt } from '../../lib/intent/refine';

export const prerender = false;

const USER_FACING_ERROR = 'Intent couldn\'t refine that prompt right now. Try again.';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { prompt } = body;
    
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing prompt parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      return new Response(JSON.stringify({ error: 'Prompt cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (cleanPrompt.length > 5000) {
      return new Response(JSON.stringify({ error: 'Prompt exceeds maximum length of 5000 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await refinePrompt(cleanPrompt);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('API Error in /api/refine:', error);
    
    let message = USER_FACING_ERROR;
    let status = 500;
    
    if (error?.name === 'AbortError' || error?.message?.includes('timeout')) {
      message = 'The request timed out. Try a shorter prompt or try again.';
      status = 504;
    } else if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
      message = 'Too many requests. Please wait a moment and try again.';
      status = 429;
    } else if (error?.message?.includes('500') || error?.message?.includes('502') || error?.message?.includes('503') || error?.message?.includes('504')) {
      message = 'The AI service is temporarily unavailable. Try again in a moment.';
      status = 503;
    } else if (error?.message?.includes('maximum length')) {
      message = error.message;
      status = 400;
    } else if (error?.message?.includes('empty')) {
      message = 'Prompt cannot be empty';
      status = 400;
    }
    
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
