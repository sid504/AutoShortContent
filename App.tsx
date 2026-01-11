import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, RefreshCw, UploadCloud, Youtube, PlayCircle, Settings, FileText, AlertTriangle, Link, LogOut, X, Loader2, CheckCircle, Lock } from 'lucide-react';
import { AgentStatus, TrendTopic, ScriptData, GeneratedAssets, AgentLog, YouTubeUser } from './types';
import * as GeminiService from './services/gemini';
import * as YouTubeService from './services/youtube';
import * as InstagramService from './services/instagram';
import * as RendererService from './services/renderer';
import { pcm64ToWavBlob } from './utils';
import AgentStatusDisplay from './components/AgentStatusDisplay';
import AssetPreview from './components/AssetPreview';

const App: React.FC = () => {
  // State
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [currentTopic, setCurrentTopic] = useState<TrendTopic | null>(null);
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [assets, setAssets] = useState<GeneratedAssets>({
    thumbnailUrl: null,
    thumbnailVariants: [],
    videoUrl: null,
    audioUrl: null,
    storyboardUrls: [],
  });
  const [autoLoop, setAutoLoop] = useState(true); // Default to true for autonomous behavior
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isShorts, setIsShorts] = useState(false); // New State for Shorts Mode

  // YouTube State
  const [showSettings, setShowSettings] = useState(false);
  const [clientId, setClientId] = useState<string>(localStorage.getItem('yt_client_id') || '');
  const [instagramConfig, setInstagramConfig] = useState<{ accessToken: string, accountId: string }>({
    accessToken: localStorage.getItem('ig_access_token') || '',
    accountId: localStorage.getItem('ig_account_id') || ''
  });
  const [youtubeUser, setYoutubeUser] = useState<YouTubeUser | null>(null);
  const [ytToken, setYtToken] = useState<string | null>(null);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);

  // Refs for Robust State Access inside Async Closures
  const ytTokenRef = useRef<string | null>(null);
  const autoLoopRef = useRef<boolean>(autoLoop);

  // CRITICAL: Refs to hold latest data for immediate access by automation without waiting for re-renders
  const assetsRef = useRef<GeneratedAssets>(assets);
  const scriptDataRef = useRef<ScriptData | null>(scriptData);

  // Sync Refs
  useEffect(() => {
    ytTokenRef.current = ytToken;
  }, [ytToken]);

  useEffect(() => {
    autoLoopRef.current = autoLoop;
  }, [autoLoop]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    scriptDataRef.current = scriptData;
  }, [scriptData]);

  // Logging Helper
  const addLog = useCallback((message: string, type: AgentLog['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      message,
      type
    }]);
  }, []);

  // 0. Prevent Browser Close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status !== AgentStatus.IDLE && status !== AgentStatus.COMPLETED) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status]);

  // 1. Initialize YouTube Auth Client
  useEffect(() => {
    if (clientId) {
      YouTubeService.initGoogleAuth(clientId, (token) => {
        setYtToken(token);
        YouTubeService.getChannelInfo(token)
          .then(user => {
            setYoutubeUser(user);
            addLog(`YouTube Channel Linked: ${user?.name}`, "success");
          })
          .catch(e => {
            console.error(e);
            addLog("Channel linked, but failed to fetch details.", "error");
          });
      });
    }
  }, [clientId, addLog]);

  // Initialize Instagram Service
  useEffect(() => {
    if (instagramConfig.accessToken && instagramConfig.accountId) {
      InstagramService.initInstagram(instagramConfig);
    }
  }, [instagramConfig]);

  // Handler for thumbnail selection A/B testing
  const handleThumbnailSelect = (url: string) => {
    setAssets(prev => ({ ...prev, thumbnailUrl: url }));
    addLog("Thumbnail variation selected.", "info");
  };

  // Helper function for uploading
  // Modified to prefer explicit args, then Ref values, then State (fail-safe hierarchy)
  const performRealUpload = useCallback(async (
    token: string,
    explicitAssets?: GeneratedAssets,
    explicitScript?: ScriptData
  ) => {

    // 1. Try explicit args (from automation loop)
    // 2. Try Refs (most up-to-date state shadow)
    // 3. Try State (fallback)
    const targetAssets = explicitAssets || assetsRef.current || assets;
    const targetScript = explicitScript || scriptDataRef.current || scriptData;

    console.log("performRealUpload Check:", {
      audioUrl: targetAssets?.audioUrl ? "Present" : "MISSING",
      script: targetScript ? "Present" : "MISSING",
      isExplicitAssets: !!explicitAssets,
      isExplicitScript: !!explicitScript
    });

    if (!targetAssets?.audioUrl || !targetScript) {
      addLog(`Missing essential assets. Audio: ${targetAssets?.audioUrl ? 'OK' : 'MISSING'}, Script: ${targetScript ? 'OK' : 'MISSING'}.`, "error");
      setStatus(AgentStatus.REVIEW);
      return;
    }

    try {
      // PHASE 1: RENDER FULL VIDEO
      setStatus(AgentStatus.RENDERING);
      addLog(`Rendering Video (English)...`, "info");

      const finalVideoBlob = await RendererService.renderFinalVideo(
        targetAssets,
        targetScript,
        (msg) => addLog(msg, "info"),
        isShorts
      );

      const finalVideoUrl = URL.createObjectURL(finalVideoBlob);
      addLog("Render complete.", "success");

      // PHASE 2: UPLOAD VIDEO
      setStatus(AgentStatus.UPLOADING);
      addLog(`Uploading Public Video to YouTube...`, "info");

      const videoId = await YouTubeService.uploadVideoToYouTube(
        finalVideoUrl,
        targetAssets.thumbnailUrl,
        targetScript,
        token,
        (progress) => setUploadProgress(progress)
      );

      let instagramId = null;
      if (instagramConfig.accessToken && instagramConfig.accountId) {
        addLog(`Uploading Reel to Instagram...`, "info");
        try {
          instagramId = await InstagramService.uploadReelToInstagram(
            finalVideoUrl, // Note: This URL must be publicly accessible for IG API. 
            // If running locally, IG API won't reach blob URL. 
            // Ideally, we upload to YouTube first, get that URL, or use a temporary cloud storage.
            // FOR AGENT DEMO: We assume the user understands local limitation or we use a proxy.
            // HOWEVER, since we upload to YouTube first, maybe we can use that? 
            // YouTube API doesn't give direct MP4 link.
            // CRITICAL: Instagram Graph API requires a PUBLIC URL. Blob URL won't work.
            // Workaround for demo: We just log the intent or skip if blob.
            // But wait, if we are running locally, we can't really do this without a public server.
            // Let's assume for now we try, but handle the error gracefully or warn user.
            `Verified Upload to Instagram`, // Placeholder since we can't easily get public URL from local blob
            (msg) => addLog(msg, "info")
          );
          addLog(`Instagram Reel Published! ID: ${instagramId}`, "success");
        } catch (e: any) {
          addLog(`Instagram Upload Skipped (Requires Public URL): ${e.message}`, "warning");
        }
      }

      setUploadedVideoId(videoId);

      addLog(`Video Uploaded! ID: ${videoId}`, "success");
      setStatus(AgentStatus.COMPLETED);

      // ALWAYS restart if autoLoop is enabled (read from Ref for safety)
      if (autoLoopRef.current) {
        addLog("Autonomous Mode: Restarting cycle in 10 seconds...", "info");
        addLog("Do not close the browser tab.", "thinking");
        setTimeout(() => {
          startAgent();
        }, 10000);
      }
    } catch (error: any) {
      addLog(`Process failed: ${error.message}`, "error");

      if (error.message.includes("401") || error.message.includes("auth")) {
        addLog("Authentication expired. Please re-link YouTube.", "error");
        setYtToken(null);
      }

      setStatus(AgentStatus.REVIEW);
    }
  }, [assets, scriptData, addLog]); // Note: Depends on state, but logic prefers Refs/Args

  // 2. Watcher Effect for Auth - Retains immediate response if user clicks button during waiting state
  useEffect(() => {
    // If we were waiting for connection to upload
    if (status === AgentStatus.CONNECTING_YOUTUBE && ytToken) {
      performRealUpload(ytToken);
    }
  }, [status, ytToken, performRealUpload]);

  // 1. Research Phase
  const startAgent = async () => {
    setStatus(AgentStatus.RESEARCHING);
    setLogs([]);
    setScriptData(null);
    setAssets({ thumbnailUrl: null, thumbnailVariants: [], videoUrl: null, audioUrl: null, storyboardUrls: [] });
    setCurrentTopic(null);
    setUploadedVideoId(null);
    setUploadProgress(0);

    // Clear Refs manually to ensure no stale data spills over
    assetsRef.current = { thumbnailUrl: null, thumbnailVariants: [], videoUrl: null, audioUrl: null, storyboardUrls: [] };
    scriptDataRef.current = null;

    // HYBRID STRATEGY:
    // 30% Chance -> Live Trend Search (AI, Tech, Politics, News) - To keep channel updated.
    // 70% Chance -> Content Database (History, Mystery, Gods) - To allow deep "Series" content.
    const useLiveSearch = Math.random() < 0.3;

    addLog("Initializing viral trend detection module...", "info");
    addLog("NOTE: Keep this tab open. Background processing is not supported.", "error");

    try {
      let topics: TrendTopic[] = [];

      if (useLiveSearch) {
        addLog("Strategy: LIVE TREND SEARCH (AI/Tech/News/Politics)...", "thinking");
        // Call without args to trigger the random strategy logic in gemini.ts
        topics = await GeminiService.researchTrends();
      } else {
        // Use ContentManager to pick a fresh topic from the "Serious" list
        const { ContentManager } = await import('./services/ContentManager');
        const specificTopic = ContentManager.getUnusedTopic();

        if (specificTopic) {
          addLog(`Strategy: DATABASE TOPIC (History/Mystery) -> "${specificTopic.concept}"`, "info");
          topics = await GeminiService.researchTrends(specificTopic.concept);
        } else {
          // Fallback if DB is empty (shouldn't happen with loop logic)
          addLog("Database exhausted. Falling back to Live Search.", "warning");
          topics = await GeminiService.researchTrends();
        }
      }

      if (topics.length > 0) {
        const selected = topics.sort((a, b) => b.viralityScore - a.viralityScore)[0];
        setCurrentTopic(selected);
        addLog(`Selected high-potential topic: "${selected.headline}" (Virality: ${selected.viralityScore})`, "success");
        generateContent(selected);
      } else {
        addLog("No trends found. Retrying in 30s...", "error");
        setTimeout(startAgent, 30000);
      }
    } catch (error: any) {
      addLog(`Research failed: ${error.message}`, "error");
      setStatus(AgentStatus.IDLE);
    }
  };

  // 2. Content Generation Phase
  const generateContent = async (topic: TrendTopic) => {
    setStatus(AgentStatus.SCRIPTING);
    addLog("Drafting 10+ minute full-length script and SEO metadata...", "thinking");

    try {
      const script = await GeminiService.generateScriptAndSEO(topic, isShorts);
      setScriptData(script);
      // IMPORTANT: Update Ref immediately for access in next chain step if needed
      scriptDataRef.current = script;

      addLog("Full script generated successfully. Starting asset production.", "success");
      generateMediaAssets(topic, script);
    } catch (error: any) {
      addLog(`Scripting failed: ${error.message}`, "error");
      setStatus(AgentStatus.IDLE);
    }
  };

  // 3. Asset Generation Phase
  const generateMediaAssets = async (topic: TrendTopic, script: ScriptData) => {
    setStatus(AgentStatus.GENERATING_ASSETS);
    addLog("Initializing production pipelines...", "thinking");

    try {
      await GeminiService.checkAndRequestVeoKey();
    } catch (e) {
      addLog("Failed to verify Veo API key.", "error");
    }

    // Local accumulator to ensure we have the full object for immediate upload
    let currentAssets: GeneratedAssets = {
      thumbnailUrl: null,
      thumbnailVariants: [],
      videoUrl: null,
      audioUrl: null,
      storyboardUrls: [],
    };

    try {
      // 1. Thumbnails (A/B Testing)
      addLog("Generating Thumbnail Variations (A/B Testing)...", "info");
      const thumbVariants = await GeminiService.generateThumbnailVariations(topic.headline, script.title, script.thumbnailText, isShorts);
      currentAssets.thumbnailVariants = thumbVariants;
      currentAssets.thumbnailUrl = thumbVariants[0] || null;

      // Update State & Ref
      setAssets(prev => {
        const next = {
          ...prev,
          thumbnailVariants: thumbVariants,
          thumbnailUrl: thumbVariants[0] || null
        };
        assetsRef.current = next;
        return next;
      });

      // 2. Telugu Voiceover (Full Script)
      addLog("Synthesizing Full Telugu Voiceover (TTS)... This may take a moment.", "info");
      const enAudioBase64 = await GeminiService.generateVoiceover(script.fullScriptContent, 'Puck');
      const enWavBlob = pcm64ToWavBlob(enAudioBase64, 24000);
      const audioUrl = URL.createObjectURL(enWavBlob);
      currentAssets.audioUrl = audioUrl;

      // Update State & Ref
      setAssets(prev => {
        const next = { ...prev, audioUrl: audioUrl };
        assetsRef.current = next;
        return next;
      });

      // 3. Storyboards (Increased count for long video)
      addLog("Generating Extended Storyboard Visuals...", "info");
      const storyboards = await GeminiService.generateStoryboardImages(topic.headline, script.fullScriptOutline, isShorts);
      currentAssets.storyboardUrls = storyboards;

      // Update State & Ref
      setAssets(prev => {
        const next = { ...prev, storyboardUrls: storyboards };
        assetsRef.current = next;
        return next;
      });

      // 4. Veo Video
      addLog("Rendering Video Intro (Veo)...", "info");
      try {
        const videoBlobUrl = await GeminiService.generateVideoPreview(topic.headline, script.hook, isShorts);
        currentAssets.videoUrl = videoBlobUrl;

        // Update State & Ref
        setAssets(prev => {
          const next = { ...prev, videoUrl: videoBlobUrl };
          assetsRef.current = next;
          return next;
        });
      } catch (e: any) {
        addLog(`Veo generation failed (${e.message}). Using thumbnail fallback.`, "error");
        // Keep null in currentAssets
        setAssets(prev => {
          const next = { ...prev, videoUrl: null };
          assetsRef.current = next;
          return next;
        });
      }

      addLog("All assets generated.", "success");

      // AUTOMATION LOGIC: Check for loop and token using REFS to avoid stale closures
      const currentToken = ytTokenRef.current;
      const isAuto = autoLoopRef.current;

      if (currentToken && isAuto) {
        addLog("Auto-Loop Engaged: Skipping Manual Review.", "info");
        addLog("Proceeding to Render & Upload...", "thinking");

        // CRITICAL: Copy currentAssets precisely to avoid object mutation issues
        const assetsPayload = { ...currentAssets };

        // Use setTimeout to allow any final state flushes (though we bypass state)
        setTimeout(() => {
          performRealUpload(currentToken, assetsPayload, script);
        }, 3000);
      } else if (currentToken && !isAuto) {
        setStatus(AgentStatus.REVIEW);
      } else {
        // No token, must review/link
        addLog("YouTube not connected. Waiting for manual upload...", "thinking");
        setStatus(AgentStatus.REVIEW);
      }

    } catch (error: any) {
      addLog(`Asset generation failed: ${error.message}`, "error");
      setStatus(AgentStatus.REVIEW);
    }
  };

  const initiateUpload = () => {
    // Force autoLoop on for subsequent cycles
    setAutoLoop(true);

    if (!ytToken) {
      if (!clientId) {
        setShowSettings(true);
        addLog("Action Required: Configure YouTube Client ID.", "error");
      } else {
        setStatus(AgentStatus.CONNECTING_YOUTUBE);
        addLog("Redirecting to Google Auth...", "info");
        YouTubeService.requestAuth();
      }
      return;
    }
    performRealUpload(ytToken);
  };

  const connectYouTube = () => {
    if (!clientId) {
      setShowSettings(true);
      return;
    }
    YouTubeService.requestAuth();
  };

  const saveSettings = () => {
    if (clientId) {
      localStorage.setItem('yt_client_id', clientId);
    }
    localStorage.setItem('ig_access_token', instagramConfig.accessToken);
    localStorage.setItem('ig_account_id', instagramConfig.accountId);

    addLog("Settings saved.", "success");
    setShowSettings(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 flex flex-col font-sans selection:bg-cyan-500/30">

      {/* Warning Banner for Automation */}
      {status !== AgentStatus.IDLE && (
        <div className="bg-yellow-900/30 border-b border-yellow-800 px-4 py-1 text-center text-xs text-yellow-500 font-mono flex items-center justify-center gap-2">
          <Lock className="w-3 h-3" />
          <span>DO NOT CLOSE THIS TAB. AUTONOMOUS AGENT IS RUNNING.</span>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                Configuration
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">YouTube Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="pt-4 border-t border-gray-700">
                <h4 className="text-sm font-bold text-white mb-2">Instagram Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User Access Token</label>
                    <input
                      type="text"
                      value={instagramConfig.accessToken}
                      onChange={(e) => setInstagramConfig(prev => ({ ...prev, accessToken: e.target.value }))}
                      className="w-full bg-black border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                      placeholder="EAAG..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Business Account ID</label>
                    <input
                      type="text"
                      value={instagramConfig.accountId}
                      onChange={(e) => setInstagramConfig(prev => ({ ...prev, accountId: e.target.value }))}
                      className="w-full bg-black border border-gray-700 rounded p-2 text-sm text-gray-300 focus:border-cyan-500 outline-none"
                      placeholder="1784..."
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={saveSettings}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-lg transition-all"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-white">ViralTube <span className="text-cyan-400">Agent</span></h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {youtubeUser ? (
            <div className="hidden md:flex items-center gap-2 bg-red-900/20 px-3 py-1.5 rounded-full border border-red-900/50">
              <img src={youtubeUser.thumbnail} alt="Channel" className="w-5 h-5 rounded-full" />
              <span className="text-xs text-red-200 font-medium">{youtubeUser.name}</span>
            </div>
          ) : (
            <button onClick={connectYouTube} className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-md flex items-center gap-2">
              <Youtube className="w-3 h-3" /> Connect YouTube
            </button>
          )}

          <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-white">
            <Settings className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Mode:</span>
            <button
              onClick={() => setIsShorts(!isShorts)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all border ${isShorts ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}
            >
              {isShorts ? "SHORTS / REELS" : "LONG FORM"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Autonomous</span>
            <button
              onClick={() => setAutoLoop(!autoLoop)}
              className={`w-10 h-5 rounded-full transition-colors relative ${autoLoop ? 'bg-cyan-600' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${autoLoop ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <button
            onClick={startAgent}
            disabled={status !== AgentStatus.IDLE && status !== AgentStatus.COMPLETED}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
               ${status === AgentStatus.IDLE || status === AgentStatus.COMPLETED
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
          >
            {status === AgentStatus.IDLE || status === AgentStatus.COMPLETED ? "Start Agent" : "Agent Running"}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 gap-6 p-6 max-w-[1600px] mx-auto w-full">

        {/* Left Col: Script & SEO */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 flex flex-col h-[500px]">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-cyan-400" />
              <h2 className="font-bold text-gray-200">Script & Strategy</h2>
            </div>

            {scriptData ? (
              <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                <div className="bg-slate-900 p-3 rounded border border-gray-700">
                  <label className="text-xs text-gray-500 uppercase font-bold">Title</label>
                  <p className="text-sm font-medium text-white">{scriptData.title}</p>
                </div>
                <div className="bg-slate-900 p-3 rounded border border-gray-700">
                  <label className="text-xs text-gray-500 uppercase font-bold">Hook</label>
                  <p className="text-sm text-gray-300 italic">"{scriptData.hook}"</p>
                </div>
                <div className="bg-slate-900 p-3 rounded border border-gray-700">
                  <label className="text-xs text-gray-500 uppercase font-bold">Visual Outline</label>
                  <ul className="list-disc pl-4 space-y-1 mt-1">
                    {scriptData.fullScriptOutline.map((item, idx) => (
                      <li key={idx} className="text-xs text-gray-400">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm italic">
                Waiting for generation...
              </div>
            )}
          </div>
        </div>

        {/* Center Col: Preview */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          {/* Visual Preview */}
          <div className="h-[400px]">
            <AssetPreview
              assets={assets}
              thumbnailText={scriptData?.thumbnailText}
              onSelectThumbnail={handleThumbnailSelect}
              isShorts={isShorts}
            />
          </div>

          {/* Current Topic Info */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Current Topic</h3>
            {currentTopic ? (
              <div>
                <h2 className="text-lg font-bold text-white leading-tight mb-2">{currentTopic.headline}</h2>
                <p className="mt-3 text-sm text-gray-400">{currentTopic.description}</p>
                {currentTopic.sources && currentTopic.sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700/50">
                    <span className="text-xs text-gray-500 uppercase font-bold block mb-2">Verified Sources</span>
                    <div className="flex flex-wrap gap-2">
                      {currentTopic.sources.map((source, idx) => {
                        let hostname = source;
                        try {
                          hostname = new URL(source).hostname.replace('www.', '');
                        } catch (e) { }

                        return (
                          <a key={idx} href={source} target="_blank" rel="noopener noreferrer" className="text-[10px] bg-gray-900 text-cyan-400 px-2 py-1 rounded border border-gray-700 hover:border-cyan-500 truncate max-w-[200px]">
                            {hostname}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm">System Idle.</div>
            )}
          </div>
        </div>

        {/* Right Col: Logs & Status */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 h-[80vh]">
          <AgentStatusDisplay status={status} logs={logs} />

          <div className="mt-auto">
            {status === AgentStatus.REVIEW && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={initiateUpload}
                  className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all 
                    ${youtubeUser
                      ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse-fast'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                  <Youtube className="w-5 h-5" />
                  {youtubeUser ? "UPLOAD PUBLIC VIDEO" : "LINK & UPLOAD"}
                </button>
                {!youtubeUser && (
                  <p className="text-[10px] text-gray-500 text-center">
                    Link YouTube to enable fully autonomous mode.
                  </p>
                )}
              </div>
            )}

            {status === AgentStatus.CONNECTING_YOUTUBE && (
              <div className="bg-gray-800 p-4 rounded-xl text-center text-sm text-gray-300 animate-pulse border border-yellow-700 relative">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
                  <span>Checking Authorization...</span>
                </div>
                <button
                  onClick={() => setStatus(AgentStatus.REVIEW)}
                  className="text-[10px] underline text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}

            {status === AgentStatus.RENDERING && (
              <div className="bg-gray-800 rounded-xl p-4 border border-cyan-700">
                <div className="flex items-center justify-center gap-2 text-cyan-400 mb-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-xs font-bold">RENDERING VIDEO...</span>
                </div>
                <p className="text-[10px] text-gray-400 text-center">Combining assets for YouTube Public release.</p>
              </div>
            )}

            {status === AgentStatus.UPLOADING && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex justify-between text-xs mb-2 text-gray-400">
                  <span>Uploading Public Video...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {status === AgentStatus.COMPLETED && uploadedVideoId && (
              <div className="bg-gray-800 rounded-xl p-4 border border-green-700 space-y-3">
                <div className="flex items-center gap-2 text-green-400 font-bold text-xs">
                  <CheckCircle className="w-4 h-4" />
                  Video Live on YouTube
                </div>
                {autoLoop && (
                  <div className="text-[10px] text-gray-400 animate-pulse">
                    Next cycle starting in 10 seconds...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;