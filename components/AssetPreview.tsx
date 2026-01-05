import React, { useRef, useState, useEffect } from 'react';
import { GeneratedAssets } from '../types';
import { Play, Pause, Image as ImageIcon, Video, MonitorPlay, Film, Check } from 'lucide-react';

interface Props {
  assets: GeneratedAssets;
  thumbnailText?: string;
  onSelectThumbnail?: (url: string) => void;
}

const AssetPreview: React.FC<Props> = ({ assets, thumbnailText, onSelectThumbnail }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'thumbnail'>('preview');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(null);

  // Sync custom timeline with actual media
  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const play = () => {
    setIsPlaying(true);
    // Play Audio (Master Timeline)
    if (audioRef.current) {
        if (currentTime >= duration) {
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
        } else {
            audioRef.current.currentTime = currentTime;
        }
        audioRef.current.play().catch(() => {});
    }
    
    // Play Intro Video if available and within first few seconds
    if (currentTime < 6 && videoRef.current && assets.videoUrl) {
        videoRef.current.currentTime = currentTime;
        videoRef.current.play().catch(() => {});
    }
  };

  const pause = () => {
    setIsPlaying(false);
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) audioRef.current.currentTime = newTime;
    
    // Manage video element visibility/playback based on seek
    if (newTime < 6 && assets.videoUrl) {
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
            if (isPlaying) videoRef.current.play();
        }
    } else {
        if (videoRef.current) videoRef.current.pause();
    }
  };

  // Update duration when audio loads
  const onAudioLoaded = () => {
      if (audioRef.current) {
          setDuration(audioRef.current.duration || 0);
      }
  };

  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now() - (currentTime * 1000);
      const loop = () => {
        const now = Date.now();
        const newTime = (now - startTime) / 1000;
        
        if (newTime >= duration && duration > 0) {
          setCurrentTime(duration);
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.pause();
        } else {
          setCurrentTime(newTime);
          // @ts-ignore
          rafRef.current = requestAnimationFrame(loop);
        }
      };
      // @ts-ignore
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, duration]);

  // Determine what to show based on time
  const renderVisuals = () => {
    // 0-6 seconds: Show Veo Video OR Thumbnail Fallback
    if (currentTime < 6) {
        if (assets.videoUrl) {
            return (
                <video 
                    ref={videoRef}
                    src={assets.videoUrl} 
                    className="w-full h-full object-cover" 
                    muted 
                    playsInline
                />
            );
        } else if (assets.thumbnailUrl) {
            return (
                <div className="w-full h-full relative">
                    <img src={assets.thumbnailUrl} className="w-full h-full object-cover" alt="Static Intro" />
                    <div className="absolute top-2 right-2 bg-yellow-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded">
                        STATIC INTRO (FALLBACK)
                    </div>
                </div>
            )
        }
    }

    // After 6 seconds: Show Storyboard Slideshow
    if (assets.storyboardUrls.length > 0) {
       // Cycle through images every 8 seconds
       const imageIndex = Math.floor((currentTime - 6) / 8) % assets.storyboardUrls.length;
       return (
         <div className="w-full h-full relative bg-black">
            <img 
                src={assets.storyboardUrls[imageIndex]} 
                alt={`Scene ${imageIndex + 1}`} 
                className="w-full h-full object-cover animate-in fade-in duration-700"
            />
            <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white backdrop-blur-sm">
                Generated Visual • Scene {imageIndex + 2}
            </div>
         </div>
       );
    }

    // Fallback
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-500">
            <Film className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">Rendering Simulation...</p>
        </div>
    );
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderThumbnailGrid = () => {
    if (!assets.thumbnailVariants || assets.thumbnailVariants.length === 0) {
         if (assets.thumbnailUrl) {
             // Fallback to single if legacy or no variants
             return (
                 <div className="relative w-full h-full">
                    <img src={assets.thumbnailUrl} alt="Generated Thumbnail" className="w-full h-full object-cover" />
                 </div>
             );
         }
         return (
            <div className="text-gray-600 flex flex-col items-center h-full justify-center">
              <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
              <span className="text-sm">Thumbnail not generated</span>
            </div>
         );
    }

    return (
        <div className="grid grid-cols-2 gap-2 w-full h-full overflow-y-auto p-2 bg-gray-900">
            {assets.thumbnailVariants.map((url, idx) => {
                const isSelected = url === assets.thumbnailUrl;
                return (
                    <div 
                        key={idx} 
                        className={`relative aspect-video group cursor-pointer border-2 rounded-lg overflow-hidden transition-all
                        ${isSelected ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'border-transparent hover:border-gray-500'}`}
                        onClick={() => onSelectThumbnail && onSelectThumbnail(url)}
                    >
                        <img src={url} className="w-full h-full object-cover" alt={`Variant ${idx}`} />

                        {isSelected && (
                            <div className="absolute top-2 right-2 bg-cyan-500 text-black p-1 rounded-full z-10">
                                <Check className="w-3 h-3" />
                            </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1 text-[10px] text-center text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            Variant {idx + 1}
                        </div>
                    </div>
                )
            })}
        </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-300 font-bold flex items-center gap-2">
            <MonitorPlay className="w-4 h-4 text-cyan-400" />
            Content Preview
        </h3>
        <div className="flex gap-2 bg-gray-900/50 p-1 rounded-lg">
            <button 
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
            Video
            </button>
            <button 
            onClick={() => setActiveTab('thumbnail')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'thumbnail' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
            Thumbnails
            </button>
        </div>
      </div>

      <div className="flex-1 bg-black rounded-lg overflow-hidden relative group border border-gray-700 flex items-center justify-center">
        {activeTab === 'thumbnail' ? (
           renderThumbnailGrid()
        ) : (
           <div className="w-full h-full relative">
              {renderVisuals()}
              
              {/* Overlay Controls */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                 <div className="flex items-center gap-4 mb-2">
                    <button onClick={togglePlay} className="text-white hover:text-cyan-400 transition-colors">
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <span className="text-xs font-mono text-gray-300">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                 </div>
                 <input 
                    type="range" 
                    min="0" 
                    max={duration || 100} 
                    value={currentTime} 
                    onChange={handleSeek}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full"
                 />
              </div>
           </div>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500 font-mono flex items-center justify-between">
         <div className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
             PREVIEW MODE
         </div>
         <div>
            Audio: English
         </div>
      </div>

      {assets.audioUrl && (
         <audio ref={audioRef} src={assets.audioUrl} className="hidden" onLoadedMetadata={onAudioLoaded} />
      )}
    </div>
  );
};

export default AssetPreview;