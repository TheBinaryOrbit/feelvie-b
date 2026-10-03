import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// The only module that calls the Feelvie virtual try-on (VTON) API.
// Tests replace fetch with setFetchForTests().
let fetchImpl = (...args) => fetch(...args);

export const setFetchForTests = (fake) => {
  fetchImpl = fake || ((...args) => fetch(...args));
};

const toBlobPart = (file) => new Blob([file.buffer], { type: file.mimetype });

/**
 * Sends the two images and waits for the result.
 * Returns { providerJobId, personImageUrl, garmentImageUrl, outputImageUrl }.
 * Throws ApiError 504 on timeout and 502 on any other failure.
 */
export const generateTryOn = async ({ personImage, garmentImage }) => {
  if (!env.vton.apiKey) throw new ApiError(503, 'Image generation is not configured. Set VTON_API_KEY');

  const form = new FormData();
  form.append('personImage', toBlobPart(personImage), personImage.originalname || 'person.jpg');
  form.append('garmentImage', toBlobPart(garmentImage), garmentImage.originalname || 'garment.jpg');

  let response;
  try {
    response = await fetchImpl(env.vton.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.vton.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(env.vton.timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new ApiError(504, 'Image generation timed out');
    }
    logger.error(`VTON request failed: ${err.message}`);
    throw new ApiError(502, 'Image generation service is unreachable');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const data = body?.data;
  if (!response.ok || !body?.success || !data) {
    const reason = body?.message || body?.error || `HTTP ${response.status}`;
    logger.error(`VTON returned an error: ${reason}`);
    throw new ApiError(502, 'Image generation failed', { reason });
  }
  if (data.status !== 'completed' || !data.outputImagePath) {
    logger.error(`VTON job ${data._id} ended with status ${data.status}`);
    throw new ApiError(502, 'Image generation failed', { reason: `Job status: ${data.status}` });
  }

  return {
    providerJobId: data._id,
    personImageUrl: data.personImagePath,
    garmentImageUrl: data.garmentImagePath,
    outputImageUrl: data.outputImagePath,
  };
};
