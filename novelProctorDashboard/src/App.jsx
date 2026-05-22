import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// Automatically detect Gateway server IP based on the browser URL
const hostname = window.location.hostname;
const GATEWAY_API_URL = hostname === 'localhost' || hostname === '127.0.0.1' 
  ? 'http://localhost:8000' 
  : `http://${hostname}:8000`;

// Inline SVGs for elegant UI icons
const ShieldIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const AlertIcon = ({ color = "currentColor" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', flexShrink: 0 }}>
    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default function App() {
  // Session configuration states
  const [userName, setUserName] = useState("JOHN FLORES");
  const [userEmail, setUserEmail] = useState("john.flores@example.org");
  const [quizCode, setQuizCode] = useState("QUIZ-DEC-09");
  
  // Dashboard & Proctoring states
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [filterType, setFilterType] = useState("All Events");
  
  // Dynamic metrics from API/local state
  const [trustScore, setTrustScore] = useState(100);
  const [counters, setCounters] = useState({
    tabSwitched: 0,
    noFace: 0,
    multipleFaces: 0,
    noise: 0,
    multipleMonitors: "No"
  });
  const [startedAt, setStartedAt] = useState("--:--");
  const [submittedAt, setSubmittedAt] = useState(null);
  const [events, setEvents] = useState([]);
  
  // Real-time stream metrics
  const [latency, setLatency] = useState(0);
  const [detectorUsed, setDetectorUsed] = useState("none");
  const [lastFrameResult, setLastFrameResult] = useState(null);
  const [isTabSwitched, setIsTabSwitched] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [candidatePhoto, setCandidatePhoto] = useState(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVadViolationActive, setIsVadViolationActive] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const globalStreamRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const noiseThresholdCooldown = useRef(false);
  const hasReportedMultiMonitor = useRef(false);

  // Check health of ML backend on startup
  useEffect(() => {
    fetch(`${GATEWAY_API_URL}/health`)
      .then(res => {
        if (res.ok) setApiConnected(true);
      })
      .catch(err => {
        console.warn("Could not connect to ML backend on startup:", err);
      });
  }, []);

  const updateVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (e) {
      console.warn("Error enumerating devices:", e);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    updateVideoDevices();
  }, [updateVideoDevices]);

  // Update session summaries dynamically from API
  const fetchSessionSummary = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const res = await fetch(`${GATEWAY_API_URL}/api/session/${sid}/summary`);
      if (res.ok) {
        const data = await res.json();
        setTrustScore(data.trustScore);
        setCounters(data.counters);
        setEvents(data.events);
        setStartedAt(data.startedAt);
        setSubmittedAt(data.submittedAt);
      }
    } catch (e) {
      console.error("Error fetching session summary:", e);
    }
  }, []);

  // Post alert to backend API
const reportAlert = useCallback(async (violationType, message, evidenceBase64 = null) => {
  if (!sessionId) return;
  try {
    const payload = {
      violationType: violationType,
      message: message,
      evidence: evidenceBase64
    };
    const response = await fetch(`${GATEWAY_API_URL}/api/session/${sessionId}/alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const sessionData = await response.json();
      // Update UI with new session data from main.py
      setEvents(sessionData.events);
      setTrustScore(sessionData.trustScore);
      setCounters(sessionData.counters);
    }
  } catch (err) {
    console.error("Error reporting alert:", err);
  }
}, [sessionId]);

  // Tab/Window change detection (tab switches & losing focus)
  useEffect(() => {
    let active = true;
    let focusCooldown = false;

    const handleViolation = (message) => {
      if (!sessionActive || !sessionId || !active || focusCooldown) return;

      focusCooldown = true;
      setTimeout(() => { focusCooldown = false; }, 2000);

      setIsTabSwitched(true);
      // Grab current frame on hidden canvas for evidence
      let currentFrame = null;
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        currentFrame = canvasRef.current.toDataURL("image/jpeg", 0.6);
      }
      reportAlert("TAB_SWITCHED", message, currentFrame);
      setTimeout(() => setIsTabSwitched(false), 2000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation("Switched to different application/tab");
      }
    };

    const handleWindowBlur = () => {
      handleViolation("Browser window lost focus");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [sessionActive, sessionId, reportAlert]);

  // Audio monitor loop (Web Audio mic level checking & VAD analysis)
  useEffect(() => {
    if (!sessionActive || !sessionId) return;

    let audioContext = null;
    let animationFrameId = null;
    let scriptNode = null;
    let vadInterval = null;
    let accumulatedSamples = [];

    const startMonitor = async () => {
      try {
        const stream = globalStreamRef.current;
        if (!stream || stream.getAudioTracks().length === 0) {
          console.warn("No audio tracks available in media stream. Audio monitoring disabled.");
          return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        // Instantiating with 16000Hz automatically resamples the input
        const audioCtx = new AudioCtx({ sampleRate: 16000 });
        audioContext = audioCtx;
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        // ScriptProcessor for PCM extraction (16000 Hz, mono input, mono output)
        scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        source.connect(scriptNode);
        scriptNode.connect(audioCtx.destination);

        scriptNode.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            accumulatedSamples.push(s < 0 ? s * 0x8000 : s * 0x7FFF);
          }
          // Keep only the latest 2 seconds (32,000 samples at 16kHz)
          if (accumulatedSamples.length > 32000) {
            accumulatedSamples = accumulatedSamples.slice(accumulatedSamples.length - 32000);
          }
        };

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
          if (!audioCtx || audioCtx.state === 'closed') return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;

          // If average frequency amplitude exceeds threshold
          if (average > 35 && !noiseThresholdCooldown.current) {
            noiseThresholdCooldown.current = true;

            let currentFrame = null;
            if (videoRef.current && canvasRef.current) {
              const ctx = canvasRef.current.getContext("2d");
              ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
              currentFrame = canvasRef.current.toDataURL("image/jpeg", 0.6);
            }

            reportAlert("NOISE", "Significant background noise detected", currentFrame);

            // Cooldown for 3 seconds to prevent duplicate logs
            setTimeout(() => {
              noiseThresholdCooldown.current = false;
            }, 3000);
          }

          animationFrameId = requestAnimationFrame(checkVolume);
        };

        checkVolume();

        // Periodically base64-encode and send the last 2s audio window to VAD backend
        vadInterval = setInterval(async () => {
          if (accumulatedSamples.length < 32000) return;

          // Clone the array to avoid concurrency issues during processing
          const samples = [...accumulatedSamples];
          const buffer = new ArrayBuffer(samples.length * 2);
          const view = new DataView(buffer);
          samples.forEach((val, idx) => {
            view.setInt16(idx * 2, val, true); // true = little-endian PCM
          });

          // Fast Base64 conversion
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Audio = btoa(binary);

          try {
            const resp = await fetch(`${GATEWAY_API_URL}/audio-analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio_base64: base64Audio })
            });
            if (resp.ok) {
              const result = await resp.json();
              
              // Trigger temporary indicator if voice is active
              if (result.speech_confidence > 0.15) {
                setIsVoiceActive(true);
                setTimeout(() => setIsVoiceActive(false), 800);
              }

              if (result.multi_speaker) {
                setIsVadViolationActive(true);
                let currentFrame = null;
                if (videoRef.current && canvasRef.current) {
                  const ctx = canvasRef.current.getContext("2d");
                  ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
                  currentFrame = canvasRef.current.toDataURL("image/jpeg", 0.6);
                }
                reportAlert("AUDIO_VAD", "Sustained overlapping speech / multiple voices detected", currentFrame);
                setTimeout(() => setIsVadViolationActive(false), 3000);
              }
            }
          } catch (err) {
            console.warn("VAD check failed:", err);
          }
        }, 1000);

      } catch (err) {
        console.warn("Could not start audio monitoring:", err);
      }
    };

    startMonitor();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (vadInterval) {
        clearInterval(vadInterval);
      }
      if (scriptNode) {
        scriptNode.disconnect();
      }
      if (audioContext) {
        audioContext.close();
        if (audioContextRef.current === audioContext) {
          audioContextRef.current = null;
        }
      }
    };
  }, [sessionActive, sessionId, reportAlert]);

  // Multi-monitor detection
  useEffect(() => {
    if (!sessionActive || !sessionId) return;

    const checkMonitors = async () => {
      let isMulti = false;
      if (window.screen && window.screen.isExtended) {
        isMulti = true;
      } else if ('getScreenDetails' in window) {
        try {
          const details = await window.getScreenDetails();
          if (details.screens && details.screens.length > 1) {
            isMulti = true;
          }
        } catch (e) {
          console.warn("Could not get screen details:", e);
        }
      }

      if (isMulti && !hasReportedMultiMonitor.current) {
        hasReportedMultiMonitor.current = true;
        reportAlert("MULTIPLE_MONITORS", "Multiple monitors/screens detected on the system");
      }
    };

    // Check immediately on startup
    checkMonitors();

    // Listen for changes
    const handleScreenChange = () => {
      checkMonitors();
    };

    if (window.screen) {
      window.screen.addEventListener('change', handleScreenChange);
    }

    return () => {
      if (window.screen) {
        window.screen.removeEventListener('change', handleScreenChange);
      }
    };
  }, [sessionActive, sessionId, reportAlert]);

  // Perform frame capture and ML analysis
  const processFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || !sessionActive) return;

    const ctx = canvas.getContext("2d");
    // Draw mirrored view on canvas to keep coordinates aligned with mirrored preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const base64Image = canvas.toDataURL("image/jpeg", 0.6);

    try {
      const response = await fetch(`${GATEWAY_API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image })
      });

      if (response.ok) {
        const result = await response.json();
        setLatency(result.processingTimeMs);
        setDetectorUsed(result.detector_used || "YuNet");
        setLastFrameResult(result);

        // Capture candidate photo once if not yet captured, and candidate is looking straight
        if (!candidatePhoto && result.faceDetected && result.headPose) {
          const pose = result.headPose;
          if (Math.abs(pose.yaw) <= 10 && Math.abs(pose.pitch) <= 10) {
            setCandidatePhoto(base64Image);
          }
        }

        // Run client-side checks based on the ML results and push violations
        if (result.faceCount === 0) {
          reportAlert("NO_FACE", "No face detected in video feed", base64Image);
        } else if (result.faceCount > 1) {
          reportAlert("MULTIPLE_FACED", "Multiple faces detected in frame", base64Image);
        } else {
          // If only 1 face exists, check gaze / pose / occlusion
          if (result.lookingAway) {
            reportAlert("LOOKING_AWAY", "Looking away from screen", base64Image);
          }
          if (result.faceCovered) {
            reportAlert("FACE_COVERED", "Candidate's face is partially covered", base64Image);
          }
        }

        // YOLO suspicious object detections
        if (result.detectedObjects) {
          result.detectedObjects.forEach(obj => {
            if (obj.label === "cell phone") {
              reportAlert("OBJECT_DETECTED", "Mobile phone usage detected", base64Image);
            } else if (obj.label === "laptop" || obj.label === "tv") {
              reportAlert("OBJECT_DETECTED", `Secondary monitor/screen detected (${obj.label})`, base64Image);
            }
          });
        }
      }
    } catch (err) {
      console.error("Frame analysis loop error:", err);
    }
  }, [sessionActive, reportAlert, candidatePhoto]);

  // Frame analysis loop (runs every 750ms when session is active)
  useEffect(() => {
    if (!sessionActive || !sessionId) return;

    analysisIntervalRef.current = setInterval(() => {
      processFrame();
    }, 750);

    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
    };
  }, [sessionActive, sessionId, processFrame]);

  // Session toggles
  const startSession = async () => {
    setCandidatePhoto(null);
    try {
      hasReportedMultiMonitor.current = false;
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Camera access is not available. This is likely because the site is not served over HTTPS. Please access via localhost or enable HTTPS.");
        return;
      }
      
      // Request BOTH audio and video together, with a fallback to video-only if microphone is not available or blocked
      let mediaStream;
      const videoConstraints = { 
        width: { ideal: 640 }, 
        height: { ideal: 480 }, 
        facingMode: "user" 
      };
      if (selectedDeviceId) {
        videoConstraints.deviceId = { exact: selectedDeviceId };
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: videoConstraints
        });
      } catch (audioErr) {
        console.warn("Could not access microphone, falling back to video only:", audioErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints
        });
      }
      globalStreamRef.current = mediaStream;
      
      // Refresh devices to get user-friendly labels now that camera permission is granted
      updateVideoDevices();

      const response = await fetch(`${GATEWAY_API_URL}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName,
          userEmail,
          deviceInfo: "Desktop, Chrome",
          quizCode
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSessionId(data.sessionId);
        setTrustScore(data.trustScore);
        setCounters(data.counters);
        setEvents(data.events);
        setStartedAt(data.startedAt);
        setSubmittedAt(null);
        setSessionActive(true);

        if (videoRef.current) {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().catch(e => console.error("Error playing video:", e));
          };
          videoRef.current.srcObject = mediaStream;
        }
      }
    } catch (err) {
      alert("Failed to initialize session. Please check your camera permissions or ML service.");
      console.error("Session initialize failed:", err);
    }
  };

  const restartCameraWithDevice = async (deviceId) => {
    try {
      // Stop old tracks to release resources
      if (globalStreamRef.current) {
        globalStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const videoConstraints = {
        width: { ideal: 640 }, 
        height: { ideal: 480 }, 
        facingMode: "user",
        deviceId: { exact: deviceId }
      };

      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: videoConstraints
        });
      } catch (audioErr) {
        console.warn("Could not access microphone, falling back to video only:", audioErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints
        });
      }

      globalStreamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(e => console.error("Error playing video:", e));
        };
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Failed to switch camera:", err);
      alert("Failed to switch to the selected camera. It might be in use by another application.");
    }
  };

  const endSession = async () => {
    if (!sessionId) return;
    setSessionActive(false);
    
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }

    try {
      const response = await fetch(`${GATEWAY_API_URL}/api/session/${sessionId}/end`, { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        setSubmittedAt(data.submittedAt);
      }
    } catch (err) {
      console.error("End session error:", err);
    }
  };

  const downloadReportCSV = () => {
    if (events.length === 0) {
      alert("No events to download.");
      return;
    }
    const headers = ["Violation Type", "Occurred At", "Details"];
    const rows = events.map(e => [
      e.violationType,
      e.occurredAt,
      `Type: ${e.type}`
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `proctoring_report_${sessionId || "session"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render SVG bounding box coordinates mapped to client screen
  const renderBoundingBoxes = () => {
    if (!lastFrameResult || !videoRef.current) return null;
    const container = videoRef.current;
    const vw = container.clientWidth;
    const vh = container.clientHeight;

    const boxes = [];

    // Face Box (Green)
    if (lastFrameResult.faceDetected && lastFrameResult.faceBox) {
      const { x, y, w, h, img_w, img_h } = lastFrameResult.faceBox;
      const scaleX = vw / img_w;
      const scaleY = vh / img_h;
      // Mirror the bounding box x coordinate
      const rx = vw - (x * scaleX) - (w * scaleX);
      boxes.push(
        <div key="face" className="bbox bbox-face" style={{
          left: rx,
          top: y * scaleY,
          width: w * scaleX,
          height: h * scaleY,
          position: 'absolute',
          border: '2px solid #10b981',
          boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)',
          borderRadius: '4px',
          pointerEvents: 'none'
        }}>
          <span className="bbox-label label-face" style={{
            position: 'absolute', top: -20, left: -2, background: '#10b981', color: 'white',
            fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px 4px 0 0', textTransform: 'uppercase'
          }}>
            Face
          </span>
        </div>
      );
    }

    // Body Box (Red)
    if (lastFrameResult.bodyDetected && lastFrameResult.bodyBox) {
      const { x, y, w, h, img_w, img_h, type } = lastFrameResult.bodyBox;
      const scaleX = vw / img_w;
      const scaleY = vh / img_h;
      const rx = vw - (x * scaleX) - (w * scaleX);
      boxes.push(
        <div key="body" className="bbox bbox-body" style={{
          left: rx,
          top: y * scaleY,
          width: w * scaleX,
          height: h * scaleY,
          position: 'absolute',
          border: '2px dashed #ef4444',
          boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)',
          borderRadius: '4px',
          pointerEvents: 'none'
        }}>
          <span className="bbox-label label-body" style={{
            position: 'absolute', top: -20, left: -2, background: '#ef4444', color: 'white',
            fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px 4px 0 0', textTransform: 'uppercase'
          }}>
            Body ({type})
          </span>
        </div>
      );
    }

    // Suspicious objects (Orange)
    if (lastFrameResult.detectedObjects) {
      lastFrameResult.detectedObjects.forEach((obj, idx) => {
        const { x, y, w, h, label, confidence } = obj;
        const img_w = (lastFrameResult.bodyBox && lastFrameResult.bodyBox.img_w) || (lastFrameResult.faceBox && lastFrameResult.faceBox.img_w) || 640;
        const img_h = (lastFrameResult.bodyBox && lastFrameResult.bodyBox.img_h) || (lastFrameResult.faceBox && lastFrameResult.faceBox.img_h) || 480;
        const scaleX = vw / img_w;
        const scaleY = vh / img_h;
        const rx = vw - (x * scaleX) - (w * scaleX);
        boxes.push(
          <div key={`obj-${idx}`} className="bbox bbox-object" style={{
            left: rx,
            top: y * scaleY,
            width: w * scaleX,
            height: h * scaleY,
            position: 'absolute',
            border: '2px solid #f97316',
            boxShadow: '0 0 10px rgba(249, 115, 22, 0.3)',
            borderRadius: '4px',
            pointerEvents: 'none'
          }}>
            <span className="bbox-label label-object" style={{
              position: 'absolute', top: -20, left: -2, background: '#f97316', color: 'white',
              fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px 4px 0 0', textTransform: 'uppercase', whiteSpace: 'nowrap'
            }}>
              {label} ({(confidence * 100).toFixed(0)}%)
            </span>
          </div>
        );
      });
    }

    return boxes;
  };

  // Determine trust score status color
  const getTrustScoreColor = () => {
    if (trustScore >= 80) return "#10b981"; // Success (Green)
    if (trustScore >= 50) return "#f59e0b"; // Warning (Orange)
    return "#ef4444"; // Danger (Red)
  };

  // Circular Trust Score Stroke calculations
  const radius = 36;
  const strokeCircumference = 2 * Math.PI * radius; // ~226.19
  const strokeOffset = strokeCircumference - (strokeCircumference * trustScore) / 100;

  // Filter events
  const filteredEvents = events.filter(e => {
    if (filterType === "All Events") return true;
    return e.violationType.toLowerCase().includes(filterType.toLowerCase()) || e.type.toLowerCase().includes(filterType.toLowerCase());
  });

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0a0d17', color: '#f8fafc' }}>
      {/* Header bar */}
      <header style={{
        padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)', background: 'rgba(10, 13, 23, 0.85)', backdropFilter: 'blur(16px)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          <span>ProctorTool <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '16px' }}>Dashboard API Client</span></span>
        </div>
        
        <div style={{
          background: apiConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${apiConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
          color: apiConnected ? '#10b981' : '#ef4444',
          padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', background: apiConnected ? '#10b981' : '#ef4444',
            boxShadow: `0 0 8px ${apiConnected ? '#10b981' : '#ef4444'}`, display: 'inline-block'
          }}></span>
          {apiConnected ? "ML Service: Connected" : "ML Service: Disconnected"}
        </div>
      </header>

      {/* Main Grid split */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '400px 1fr', gap: '30px', padding: '30px 40px', maxWidth: '1700px', margin: '0 auto', width: '100%' }}>
        
        {/* Left column: Controls & Camera view */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Controls Card */}
          <div className="card" style={{
            background: 'rgba(18, 25, 47, 0.65)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '20px',
            backdropFilter: 'blur(20px)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
          }}>
            <h3 style={{ fontSize: '15px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '14px' }}>Session Manager</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Candidate Name</label>
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} disabled={sessionActive} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff',
                  padding: '8px 12px', fontSize: '13px', outline: 'none'
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Candidate Email</label>
                <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} disabled={sessionActive} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff',
                  padding: '8px 12px', fontSize: '13px', outline: 'none'
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Quiz Code</label>
                <input type="text" value={quizCode} onChange={(e) => setQuizCode(e.target.value)} disabled={sessionActive} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#fff',
                  padding: '8px 12px', fontSize: '13px', outline: 'none'
                }} />
              </div>

              {!sessionActive ? (
                <button onClick={startSession} style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none',
                  padding: '12px', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex',
                  justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}>
                  <ShieldIcon /> Start Session
                </button>
              ) : (
                <button onClick={endSession} style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', border: 'none',
                  padding: '12px', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex',
                  justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)'
                }}>
                  <ShieldIcon /> End & Submit Exam
                </button>
              )}
            </div>
          </div>

          {/* Video Feed Card */}
          <div className="card" style={{
            background: 'rgba(18, 25, 47, 0.65)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '16px',
            backdropFilter: 'blur(20px)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', position: 'relative'
          }}>
            <h3 style={{ fontSize: '15px', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '12px' }}>Camera Feed</h3>
            
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '4/3', borderRadius: '10px', overflow: 'hidden', background: '#07090f',
              border: '2px solid rgba(255,255,255,0.06)'
            }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}></video>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                {renderBoundingBoxes()}
              </div>
              {sessionActive && !candidatePhoto && (
                <div className={`gaze-guide-overlay ${lastFrameResult && lastFrameResult.faceDetected && lastFrameResult.headPose && Math.abs(lastFrameResult.headPose.yaw) <= 10 && Math.abs(lastFrameResult.headPose.pitch) <= 10 ? 'gaze-locked' : ''}`} />
              )}
              {!sessionActive && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(7, 9, 15, 0.85)', color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px'
                }}>
                  Camera stream offline.<br />Start session to activate live proctoring.
                </div>
              )}
              {isTabSwitched && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(239, 68, 68, 0.8)', color: '#fff', fontSize: '18px', fontWeight: 800, textAlign: 'center', zIndex: 10
                }}>
                  ⚠️ TAB SWITCH DETECTED!
                </div>
              )}
            </div>

            {videoDevices.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Camera Device</label>
                <select 
                  value={selectedDeviceId} 
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedDeviceId(newId);
                    if (sessionActive) {
                      restartCameraWithDevice(newId);
                    }
                  }} 
                  style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px',
                    color: '#fff', padding: '8px 12px', fontSize: '13px', outline: 'none', width: '100%', cursor: 'pointer'
                  }}
                >
                  {videoDevices.map((device, idx) => (
                    <option key={device.deviceId || idx} value={device.deviceId} style={{ background: '#0a0d17', color: '#fff' }}>
                      {device.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '11px', color: '#64748b' }}>
              <span>ML Latency: {latency} ms</span>
              <span>Detector: {detectorUsed}</span>
            </div>
          </div>
        </section>

        {/* Right column: High-Fidelity Proctoring Dashboard */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Top row cards: Profile, Trust Score, Session Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: '20px' }}>
            
            {/* Student Profile Card */}
            <div style={{ background: '#fff', color: '#1e293b', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <div style={{
                width: '82px', height: '82px', borderRadius: '50%',
                background: candidatePhoto ? '#000' : '#f1f5f9',
                border: candidatePhoto ? '3px solid #10b981' : '3px solid #e2e8f0',
                overflow: 'hidden', marginBottom: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: candidatePhoto ? '0 0 0 4px rgba(16,185,129,0.15)' : 'none',
                transition: 'border-color 0.4s, box-shadow 0.4s'
              }}>
                {candidatePhoto ? (
                  <img src={candidatePhoto} alt="candidate" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#94a3b8' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, textTransform: 'uppercase' }}>{userName}</h2>
              <span style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{userEmail}</span>
              <span style={{
                fontSize: '10px', fontWeight: 700, marginTop: '8px', padding: '3px 10px', borderRadius: '99px',
                background: candidatePhoto ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.10)',
                color: candidatePhoto ? '#10b981' : '#94a3b8'
              }}>
                {candidatePhoto ? '📸 Photo Captured' : sessionActive ? '⏳ Capturing…' : '📷 No Photo Yet'}
              </span>
            </div>

            {/* Circular Trust Score Card */}
            <div style={{ background: '#fff', color: '#1e293b', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', position: 'relative' }}>
              <div style={{ position: 'relative', width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="96" height="96" viewBox="0 0 96 96">
                  {/* Track */}
                  <circle cx="48" cy="48" r={radius} stroke="#e2e8f0" strokeWidth="7" fill="transparent" />
                  {/* Score arc */}
                  <circle cx="48" cy="48" r={radius} stroke={getTrustScoreColor()} strokeWidth="7" fill="transparent"
                          strokeDasharray={strokeCircumference} strokeDashoffset={strokeOffset} strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '48px 48px' }} />
                </svg>
                <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: getTrustScoreColor(), transition: 'color 0.4s' }}>
                    {trustScore}%
                  </span>
                </div>
              </div>
              <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginTop: '10px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                TRUST SCORE
                <span style={{ cursor: 'help', color: '#94a3b8' }} title="Overall security evaluation. Decreases as violations occur.">ⓘ</span>
              </h3>
              <span style={{
                fontSize: '11px', fontWeight: 700, marginTop: '6px', padding: '3px 12px', borderRadius: '99px',
                background: trustScore >= 80 ? 'rgba(16,185,129,0.10)' : trustScore >= 50 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)',
                color: getTrustScoreColor(),
                transition: 'background 0.4s, color 0.4s'
              }}>
                {trustScore >= 80 ? '✓ TRUSTED' : trustScore >= 50 ? '⚠ MODERATE' : '✗ HIGH RISK'}
              </span>
            </div>

            {/* Session Metadata Card */}
            <div style={{ background: '#fff', color: '#1e293b', borderRadius: '14px', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: '13px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8' }}></span> STARTED
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '4px' }}>{startedAt}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8' }}></span> SUBMITTED
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '4px', color: submittedAt ? '#10b981' : '#f59e0b' }}>
                    {submittedAt ? submittedAt : "In Progress..."}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '1px solid #e2e8f0', paddingLeft: '16px' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }}></span> TRACKING
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', color: '#64748b', alignItems: 'center' }}>
                    {/* Icons showing tracking states */}
                    <span title="Video Feed Active" style={{ padding: '4px 6px', background: sessionActive ? '#e2f9f0' : '#f1f5f9', color: sessionActive ? '#10b981' : '#94a3b8', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>CAM</span>
                    <span 
                      title="Microphone Active" 
                      className={
                        isVadViolationActive 
                          ? "mic-pulse-red" 
                          : isVoiceActive 
                            ? "mic-pulse-green" 
                            : ""
                      }
                      style={{ 
                        padding: '4px 6px', 
                        background: isVadViolationActive 
                          ? '#fef2f2' 
                          : isVoiceActive 
                            ? '#ecfdf5' 
                            : sessionActive 
                              ? '#e2f9f0' 
                              : '#f1f5f9', 
                        color: isVadViolationActive 
                          ? '#ef4444' 
                          : isVoiceActive || sessionActive 
                            ? '#10b981' 
                            : '#94a3b8', 
                        borderRadius: '4px', 
                        fontSize: '10px', 
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      MIC
                      {sessionActive && (
                        <span className={`voice-wave-container ${isVadViolationActive ? 'violation' : ''}`} style={{ display: isVoiceActive || isVadViolationActive ? 'inline-flex' : 'none' }}>
                          <span className="voice-wave-bar"></span>
                          <span className="voice-wave-bar"></span>
                          <span className="voice-wave-bar"></span>
                          <span className="voice-wave-bar"></span>
                          <span className="voice-wave-bar"></span>
                        </span>
                      )}
                    </span>
                    <span title="Tab Focus Active" style={{ padding: '4px 6px', background: sessionActive ? '#e2f9f0' : '#f1f5f9', color: sessionActive ? '#10b981' : '#94a3b8', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>TAB</span>
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>DEVICE, BROWSER</div>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '4px' }}>Desktop, Chrome</div>
                </div>
              </div>

            </div>

          </div>

          {/* Violations Counter Grid Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
            
            {/* Tab Switched */}
            <div style={{ background: '#fff', color: '#1e293b', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tab Switched</span>
              <span style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: counters.tabSwitched > 0 ? '#f97316' : '#1e293b' }}>
                {counters.tabSwitched}
              </span>
            </div>

            {/* No Face */}
            <div style={{ background: '#fff', color: '#1e293b', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>No Face Detected</span>
              <span style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: counters.noFace > 0 ? '#ef4444' : '#1e293b' }}>
                {counters.noFace}
              </span>
            </div>

            {/* Multiple Faces */}
            <div style={{ background: '#fff', color: '#1e293b', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Multiple Faces</span>
              <span style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: counters.multipleFaces > 0 ? '#ef4444' : '#1e293b' }}>
                {counters.multipleFaces}
              </span>
            </div>

            {/* Noise Detected */}
            <div style={{ background: '#fff', color: '#1e293b', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Noise Detected</span>
              <span style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: counters.noise > 0 ? '#f97316' : '#1e293b' }}>
                {counters.noise}
              </span>
            </div>

            {/* Multiple Monitors */}
            <div style={{ background: '#fff', color: '#1e293b', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Multiple Monitors</span>
              <span style={{ fontSize: '24px', fontWeight: 800, marginTop: '6px', color: counters.multipleMonitors === "Yes" ? '#ef4444' : '#1e293b' }}>
                {counters.multipleMonitors}
              </span>
            </div>

          </div>

          {/* Tab Selection Row & Event Filtering */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginTop: '10px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <button onClick={() => setActiveTab("summary")} style={{
                background: 'none', border: 'none', color: activeTab === "summary" ? '#10b981' : '#94a3b8', fontSize: '15px',
                fontWeight: 700, cursor: 'pointer', paddingBottom: '8px', borderBottom: activeTab === "summary" ? '2px solid #10b981' : 'none',
                outline: 'none'
              }}>
                Proctoring Summary
              </button>
              <button onClick={() => setActiveTab("recording")} style={{
                background: 'none', border: 'none', color: activeTab === "recording" ? '#10b981' : '#94a3b8', fontSize: '15px',
                fontWeight: 700, cursor: 'pointer', paddingBottom: '8px', borderBottom: activeTab === "recording" ? '2px solid #10b981' : 'none',
                outline: 'none'
              }}>
                Session Recording
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px',
                color: '#fff', padding: '6px 12px', fontSize: '13px', outline: 'none'
              }}>
                <option value="All Events">All Events</option>
                <option value="TAB_SWITCHED">Tab Switches</option>
                <option value="NO_FACE">No Face Detected</option>
                <option value="MULTIPLE">Multiple People</option>
                <option value="NOISE">Noise Detected</option>
                <option value="OBJECT_DETECTED">Suspicious Objects</option>
              </select>

              <button onClick={downloadReportCSV} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff',
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center',
                cursor: 'pointer', transition: 'background 0.2s'
              }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                 onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                <DownloadIcon /> Download Report
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div style={{ background: 'rgba(18, 25, 47, 0.65)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '10px 0', minHeight: '260px' }}>
            {activeTab === "summary" ? (
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px 24px', fontWeight: 600 }}>VIOLATION TYPE</th>
                      <th style={{ padding: '12px 24px', fontWeight: 600 }}>OCCURRED AT</th>
                      <th style={{ padding: '12px 24px', fontWeight: 600 }}>EVIDENCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                          No violations recorded yet for this session.
                        </td>
                      </tr>
                    ) : (
                      filteredEvents.map((evt, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', transition: 'background 0.2s' }}>
                          <td style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                            <AlertIcon color={evt.type === 'tab_switched' ? '#f97316' : '#ef4444'} />
                            {evt.violationType}
                          </td>
                          <td style={{ padding: '14px 24px', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {evt.occurredAt}
                          </td>
                          <td style={{ padding: '14px 24px' }}>
                            {evt.evidence ? (
                              <div style={{
                                width: '60px', height: '45px', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
                                cursor: 'zoom-in', background: '#000'
                              }} onClick={() => {
                                // Simple modal popup of the evidence frame
                                const w = window.open();
                                w.document.write(`<img src="${evt.evidence}" style="max-width:100%; height:auto;" />`);
                              }}>
                                <img src={evt.evidence} alt="evidence" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ) : (
                              <span style={{ color: '#475569', fontSize: '11px' }}>None</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                📹 Full video session recording will be saved in your Frappe backend on submit.
              </div>
            )}
          </div>

        </section>

      </main>

      {/* Hidden canvas for image data extraction */}
      <canvas ref={canvasRef} width="640" height="480" style={{ display: 'none' }}></canvas>
    </div>
  );
}
