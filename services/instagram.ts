export interface InstagramConfig {
  accessToken: string;
  accountId: string; // Instagram Business Account ID
}

let instagramConfig: InstagramConfig | null = null;

export const initInstagram = (config: InstagramConfig) => {
  instagramConfig = config;
};

export const getInstagramConfig = (): InstagramConfig | null => {
  return instagramConfig;
};

/**
 * Uploads a video to Instagram (Reels) using the Content Publishing API.
 * Flow:
 * 1. Create Media Container (POST /media) -> Returns creation_id
 * 2. Check Status (GET /container_id) -> Wait for status_code == 'FINISHED'
 * 3. Publish Media (POST /media_publish) -> Returns id
 */
export const uploadReelToInstagram = async (
  videoUrl: string,
  caption: string,
  onProgress: (msg: string) => void
): Promise<string> => {
  if (!instagramConfig) throw new Error("Instagram not configured.");

  const { accessToken, accountId } = instagramConfig;
  const version = 'v18.0';
  const baseUrl = `https://graph.facebook.com/${version}/${accountId}`;

  // STEP 1: Create Media Container
  onProgress("Initializing Instagram Reel upload...");
  
  // Note: For Reels, we use media_type=REELS
  const createContainerUrl = `${baseUrl}/media?video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(caption)}&media_type=REELS&access_token=${accessToken}`;
  
  const createRes = await fetch(createContainerUrl, { method: 'POST' });
  const createData = await createRes.json();

  if (createData.error) {
    throw new Error(`Instagram Container Failed: ${createData.error.message}`);
  }

  const creationId = createData.id;
  onProgress("Instagram container created. Processing video...");

  // STEP 2: Poll for Status
  // Instagram needs time to download and process the video file from the URL
  let isReady = false;
  let attempts = 0;
  const maxAttempts = 20; // 20 * 5s = 100 seconds timeout

  while (!isReady && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000)); // Wait 5s
    attempts++;

    const statusUrl = `https://graph.facebook.com/${version}/${creationId}?fields=status_code,status&access_token=${accessToken}`;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json();

    if (statusData.error) {
       throw new Error(`Instagram Status Check Failed: ${statusData.error.message}`);
    }

    const statusCode = statusData.status_code;
    onProgress(`Processing Instagram video... (${statusCode})`);

    if (statusCode === 'FINISHED') {
      isReady = true;
    } else if (statusCode === 'ERROR') {
      throw new Error("Instagram processing failed on server side.");
    } else if (statusCode === 'EXPIRED') {
       throw new Error("Instagram container expired.");
    }
  }

  if (!isReady) {
    throw new Error("Instagram processing timed out.");
  }

  // STEP 3: Publish
  onProgress("Publishing Reel to Instagram feed...");
  const publishUrl = `${baseUrl}/media_publish?creation_id=${creationId}&access_token=${accessToken}`;
  const publishRes = await fetch(publishUrl, { method: 'POST' });
  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error(`Instagram Publish Failed: ${publishData.error.message}`);
  }

  return publishData.id;
};
