import type { APIRoute } from 'astro';
import { refinePrompt } from '../../lib/intent/refine';

export const prerender = false;

const USER_FACING_ERROR = 'Intent couldn\'t refine that prompt right now. Try again.';

function logRequestInfo(request: Request, body: any) {
  console.log('[/api/refine] Request received:', {
    method: request.method,
    contentType: request.headers.get('content-type'),
    contentLength: request.headers.get('content-length'),
    hasBody: !!body,
    promptLength: body?.prompt?.length || 0,
  });
}

function logResponseInfo(status: number, isError: boolean, resultOrError: any) {
  console.log('[/api/refine] Response:', {
    status,
    isError,
    resultKeys: isError ? null : Object.keys(resultOrError || {}),
    resultIsMock: isError ? null : resultOrError?.isMock,
    errorMessage: isError ? resultOrError : null,
  });
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

export const POST: APIRoute = async ({ request }) => {
  let requestBody: any = null;
  try {
    requestBody = await request.json();
    logRequestInfo(request, requestBody);
    
    const { prompt } = requestBody;
    
    if (!prompt || typeof prompt !== 'string') {
      const errorResponse = { error: 'Missing prompt parameter' };
      logResponseInfo(400, true, errorResponse);
      return jsonResponse(errorResponse, 400);
    }

    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      const errorResponse = { error: 'Prompt cannot be empty' };
      logResponseInfo(400, true, errorResponse);
      return jsonResponse(errorResponse, 400);
    }

    if (cleanPrompt.length > 5000) {
      const errorResponse = { error: 'Prompt exceeds maximum length of 5000 characters' };
      logResponseInfo(400, true, errorResponse);
      return jsonResponse(errorResponse, 400);
    }

    const result = await refinePrompt(cleanPrompt);
    logResponseInfo(200, false, result);
    
    return jsonResponse(result, 200);
  } catch (error: any) {
    console.error('[/api/refine] Uncaught error:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      requestBody: requestBody ? { promptLength: requestBody.prompt?.length || 0 } : null,
    });
    
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
    
    const errorResponse = { error: message };
    logResponseInfo(status, true, errorResponse);
    
    return jsonResponse(errorResponse, status);
  }
};

// Top-level safety net - ensures we ALWAYS return valid JSON
export const ALL: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  return POST({ request } as any);
};
