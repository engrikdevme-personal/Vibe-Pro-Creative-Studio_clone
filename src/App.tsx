import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  Mic, MicOff, Play, Download, Save, Plus, Trash2, Wand2, Sparkles,
  Menu, X, Volume2, StopCircle, FastForward, CheckCircle2,
  MessageSquare, FileText, Split, Code, Undo2, Redo2, Eye, Terminal,
  Settings, Layout, MessageCircle, Send, Key, ToggleLeft, ToggleRight, User,
  Copy, BrainCircuit, Sun, Moon
} from 'lucide-react';

const defaultApiKey = "";

const workerCode = `
self.onmessage = function(e) {
  const pcmData = e.data.pcm;
  const sampleRate = e.data.rate;
  const buffer = new ArrayBuffer(44 + pcmData.byteLength);
  const view = new DataView(buffer);
  const writeString = (v, offset, string) => {
    for (let i = 0; i < string.length; i++) v.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.byteLength, true);
  const pcmArray = new Uint8Array(pcmData);
  const dataView = new Uint8Array(buffer, 44);
  dataView.set(pcmArray);
  self.postMessage(buffer, [buffer]);
};
`;

const App = () => {
  const [user, setUser] = useState<any>(null);
  const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);
  const [activeModule, setActiveModule] = useState('creative'); 
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  
  const [textHistory, setTextHistory] = useState([""]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [studioHistory, setStudioHistory] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  
  const [customApiKey, setCustomApiKey] = useState("");
  const [useCustomApi, setUseCustomApi] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [isRecording, setIsRecording] = useState(false);
  const [viewMode, setViewMode] = useState("preview"); 
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const saveTimeoutRef = useRef<any>(null);

  const toolColors: Record<string, string> = {
    purple: "border-purple-500/30 text-purple-300 hover:bg-purple-500/10",
    blue: "border-blue-500/30 text-blue-300 hover:bg-blue-500/10",
    green: "border-green-500/30 text-green-300 hover:bg-green-500/10",
    pink: "border-pink-500/30 text-pink-300 hover:bg-pink-500/10",
    yellow: "border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10",
    indigo: "border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10",
    emerald: "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10",
    orange: "border-orange-500/30 text-orange-300 hover:bg-orange-500/10",
    cyan: "border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('vibe_custom_api_key');
    const useKey = localStorage.getItem('vibe_use_custom_api') === 'true';
    const savedTheme = localStorage.getItem('vibe_dark_mode');
    if (savedKey) setCustomApiKey(savedKey);
    setUseCustomApi(useKey);
    
    if (savedTheme !== null) {
      setIsDarkMode(savedTheme === 'true');
    }

    const unsubscribe = onAuthStateChanged(auth, setUser);

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));

    return () => {
      unsubscribe();
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('vibe_dark_mode', isDarkMode.toString());
  }, [isDarkMode]);

  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}/sessions`;
    const sessionsRef = collection(db, path);
    const unsubscribe = onSnapshot(sessionsRef, (snapshot) => {
      const fetchedSessions: any[] = [];
      snapshot.forEach(doc => {
        fetchedSessions.push({ ...doc.data() });
      });
      fetchedSessions.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
      setSessions(fetchedSessions);
      setIsInitialFetchDone(true);
    }, (error) => {
      setSaveStatus("error");
      handleFirestoreError(error, OperationType.LIST, path);
    });
    
    return () => {
      unsubscribe();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [user, audioUrl]);

  const lastSaveTimeRef = useRef<number>(Date.now());
  const pendingDataRef = useRef<any>(null);

  const saveToFirestore = useCallback(async (sessionId: string, data: any) => {
    if (!user || !sessionId) return;
    setSaveStatus("saving");
    const path = `users/${user.uid}/sessions/${sessionId}`;
    try {
      const sessionRef = doc(db, path);
      await setDoc(sessionRef, { ...data, id: sessionId, lastUpdated: new Date().toISOString() }, { merge: true });
      lastSaveTimeRef.current = Date.now();
      pendingDataRef.current = null;
      setSaveStatus("saved");
    } catch(e) {
      setSaveStatus("error");
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  }, [user]);

  const debouncedSave = useCallback((sessionId: string, data: any) => {
    pendingDataRef.current = { ...pendingDataRef.current, ...data };
    
    if (Date.now() - lastSaveTimeRef.current > 30000) {
      // 30 seconds passed, save immediately
      if(saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveToFirestore(sessionId, pendingDataRef.current);
      return;
    }
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus("saving");
    saveTimeoutRef.current = setTimeout(() => {
      saveToFirestore(sessionId, pendingDataRef.current);
    }, 800);
  }, [saveToFirestore]);

  const filteredSessions = sessions.filter(s => s.type === activeModule);

  useEffect(() => {
    if (!user || activeModule === 'settings' || !isInitialFetchDone) return;
    if (filteredSessions.length > 0) {
      if (!currentSessionId || !filteredSessions.find(s => s.id === currentSessionId)) {
        loadSession(filteredSessions[0].id);
      }
    } else {
      createNewSession();
    }
  }, [filteredSessions.length, activeModule, user, isInitialFetchDone]);

  useEffect(() => {
    if (chatScrollRef.current && activeModule === 'chat') {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, activeModule, isLoading]);

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setLoadingProgress(10);
      interval = setInterval(() => {
        setLoadingProgress(prev => (prev >= 90 ? 90 : prev + (Math.random() * 15)));
      }, 500);
    } else {
      setLoadingProgress(100);
      const timer = setTimeout(() => setLoadingProgress(0), 500);
      return () => clearTimeout(timer);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleCopy = (text: string, id: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedStates(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  const updateOutputState = useCallback((newText: string) => {
    setOutputText(newText);
    const newHistory = textHistory.slice(0, historyIndex + 1);
    newHistory.push(newText);
    setTextHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    if(currentSessionId) debouncedSave(currentSessionId, { outputText: newText });
  }, [textHistory, historyIndex, currentSessionId, debouncedSave]);

  const handleInputTextChange = (e: any) => {
    const val = e.target.value;
    setInputText(val);
    if(currentSessionId) debouncedSave(currentSessionId, { inputText: val });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const val = textHistory[newIndex];
      setOutputText(val);
      if(currentSessionId) debouncedSave(currentSessionId, { outputText: val });
    }
  };

  const handleRedo = () => {
    if (historyIndex < textHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const val = textHistory[newIndex];
      setOutputText(val);
      if(currentSessionId) debouncedSave(currentSessionId, { outputText: val });
    }
  };

  const handleExportSession = () => {
    const session = sessions.find(s => s.id === currentSessionId);
    let content = "";
    let filename = "";
    if (activeModule === 'chat') {
      content = chatMessages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n\n');
      filename = `${session?.title || 'Chat'}.txt`;
    } else {
      content = `### Input Context\n\n${inputText}\n\n### Generated Output\n\n${outputText}`;
      filename = `${session?.title || 'Session'}.md`;
    }
    
    // Create download link
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename.replace(/[^a-z0-9]/gi, '_').toLowerCase());
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  const createNewSession = useCallback(async () => {
    if (activeModule === 'settings') return;
    
    const prefix = activeModule === 'creative' ? 'Story' : activeModule === 'nexus' ? 'Log' : activeModule === 'prompt_studio' ? 'Prompt' : 'Chat';
    const newSession = {
      id: Date.now().toString(),
      type: activeModule,
      title: `${prefix} ` + new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}),
      inputText: "",
      outputText: "",
      messages: [],
      history: [],
      lastUpdated: new Date().toISOString()
    };
    
    if (user) {
      const path = `users/${user.uid}/sessions/${newSession.id}`
      try {
        const sessionRef = doc(db, path);
        await setDoc(sessionRef, newSession);
      } catch(e) {
          handleFirestoreError(e, OperationType.CREATE, path);
      }
    }
    
    setCurrentSessionId(newSession.id);
    setInputText("");
    setOutputText("");
    setTextHistory([""]);
    setHistoryIndex(0);
    setChatMessages([]);
    setStudioHistory([]);
    setAudioUrl(null);
    stopAudio();
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, [stopAudio, user, activeModule]);

  const loadSession = useCallback((id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      if (session.type === 'chat') {
        setChatMessages(session.messages || []);
      } else {
        setInputText(session.inputText || "");
        setOutputText(session.outputText || "");
        setTextHistory([session.outputText || ""]);
        setHistoryIndex(0);
        setStudioHistory(session.history || []);
      }
      setAudioUrl(null);
      stopAudio();
      setIsSidebarOpen(false);
    }
  }, [sessions, stopAudio]);

  const addHistoryEntry = useCallback((label: string, customInput?: string, customOutput?: string) => {
    if (!currentSessionId) return;
    const finalInput = customInput !== undefined ? customInput : inputText;
    const finalOutput = customOutput !== undefined ? customOutput : outputText;

    const newItem = {
      id: Date.now().toString(),
      label,
      inputText: finalInput,
      outputText: finalOutput,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    setStudioHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 50);
      debouncedSave(currentSessionId, { history: updated });
      return updated;
    });
  }, [currentSessionId, inputText, outputText, debouncedSave]);

  const handleRevertToHistory = (item: any) => {
    setInputText(item.inputText);
    setOutputText(item.outputText);
    setTextHistory([item.outputText]);
    setHistoryIndex(0);
    if (currentSessionId) {
      debouncedSave(currentSessionId, { 
        inputText: item.inputText, 
        outputText: item.outputText 
      });
    }
  };

  const handleDeleteHistoryItem = (e: any, itemId: string) => {
    e.stopPropagation();
    if (!currentSessionId) return;
    setStudioHistory(prev => {
      const updated = prev.filter(item => item.id !== itemId);
      debouncedSave(currentSessionId, { history: updated });
      return updated;
    });
  };

  const deleteSession = useCallback(async (e: any, id: string) => {
    e.stopPropagation();
    if (user) {
      const path = `users/${user.uid}/sessions/${id}`;
      try {
        const sessionRef = doc(db, path);
        await deleteDoc(sessionRef);
      } catch(e) {
          handleFirestoreError(e, OperationType.DELETE, path);
      }
    }
  }, [user]);

  const toggleMic = useCallback((targetInput = 'editor') => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

    if (!recognitionRef.current) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.interimResults = true;
      recognitionRef.current.continuous = true;

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
        }
        if (finalTranscript) {
           if (targetInput === 'chat') {
               setChatInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript);
           } else {
               setInputText(prev => {
                  const val = prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript;
                  if(currentSessionId) debouncedSave(currentSessionId, { inputText: val });
                  return val;
               });
           }
        }
      };

      recognitionRef.current.onend = () => {
        if (isRecordingRef.current) {
          try { recognitionRef.current.start(); } catch(e) {}
        } else {
          setIsRecording(false);
        }
      };

      recognitionRef.current.onerror = (e: any) => {
        if(e.error !== 'no-speech') {
            isRecordingRef.current = false;
            setIsRecording(false);
            setSaveStatus("error");
        }
      };
    }

    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      recognitionRef.current.stop();
    } else {
      isRecordingRef.current = true;
      setIsRecording(true);
      try { recognitionRef.current.start(); } catch(e) {}
    }
  }, [currentSessionId, debouncedSave]);

  const executeGemini = async (contents: any, manageLoading = true) => {
    if (manageLoading) setIsLoading(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    
    // Server will use default API key if customApiKey is empty
    const customKey = useCustomApi ? customApiKey.trim() : null;
    
    try {
      const response = await fetch(`/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, customApiKey: customKey }),
        signal: abortControllerRef.current.signal
      });
      if(!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
         setSaveStatus("error");
         setTimeout(() => setSaveStatus("saved"), 2000);
      }
      return null;
    } finally {
      if (manageLoading) setIsLoading(false);
    }
  };

  const generateAndSaveTitleIfNeeded = async (sourceText: string) => {
    if (!sourceText.trim() || !currentSessionId) return;
    const session = sessions.find(s => s.id === currentSessionId);
    // Only generate if title is default (starts with prefix + time)
    if (session && /^(Story|Log|Prompt|Chat)\s\d{2}:\d{2}/.test(session.title)) {
      const newTitlePrompt = `Respond ONLY with a 2-3 word title summarizing this text: ${sourceText.substring(0, 150)}`;
      const title = await executeGemini([{ parts: [{ text: newTitlePrompt }]}], false);
      if (title) {
        const cleanTitle = title.replace(/["']/g, '').trim();
        debouncedSave(currentSessionId, { title: cleanTitle });
      }
    }
  };

  const handleAiAction = async (action: string) => {
    if (!inputText.trim()) return;
    
    let prompt = "";
    if (activeModule === 'creative') {
       if (action === 'story_gen') prompt = `Write a creative and emotional story strictly based on this concept/input: "${inputText}". Do not stray from the topic. Return ONLY the story.`;
       else if (action === 'enhance') prompt = `Take the following text/concept and rewrite it to be poetic, vivid, and dramatic for narration: "${inputText}"`;
       else if (action === 'continue') prompt = `Based on this text: "${outputText || inputText}", continue the narrative logically for 3-4 more sentences.`;
       else if (action === 'dialogue') prompt = `Write a dramatic dialogue sequence (2-3 exchanges) that fits perfectly into the scenario described here: "${inputText}". Return ONLY the dialogue.`;
       else if (action === 'script') prompt = `Convert the following story/concept into a professional drama script format (with scene headings and character names): "${inputText}"`;
       else if (action === 'translate') prompt = `Translate the following text into beautifully expressive and accurate English: "${inputText}"`;
       else if (action === 'plot_twist') prompt = `Based on this concept/story: "${inputText}", generate a mind-blowing and unexpected plot twist. Return ONLY the twist.`;
       else if (action === 'world_build') prompt = `Expand on this idea: "${inputText}". Create rich, atmospheric world-building details (setting, rules, lore). Format beautifully in Markdown.`;
    } else if (activeModule === 'nexus') {
       if (action === 'tech_summary') prompt = `Act as a RED_TEAM engineer. Summarize this log or raw data into a highly professional Markdown format with bullet points and bold key terms: "${inputText}"`;
       else if (action === 'summarize') prompt = `Act as an expert systems analyst. Generate a highly concise and structured summary of the following text/log/data. Capture all key points, actionable elements, and critical warnings. Present the output in a clear, beautiful Markdown format using bullet points, bold key terms, and short paragraphs: "${inputText}"`;
       else if (action === 'code_block') prompt = `Extract any code, commands, logic, or technical steps from this text and format them into proper Markdown code blocks. Text: "${inputText}"`;
       else if (action === 'grammar') prompt = `Fix any grammatical errors in this text while keeping the exact technical meaning intact. Return ONLY the corrected text. Text: "${inputText}"`;
       else if (action === 'translate') prompt = `Translate this technical text into highly professional technical English. Return ONLY the English text. Text: "${inputText}"`;
       else if (action === 'enhance') prompt = `Rewrite this text to be highly professional, structured, and technically sound. Text: "${inputText}"`;
       else if (action === 'root_cause') prompt = `Act as a Senior System Administrator. Analyze this technical text/log: "${inputText}" and identify the most likely Root Cause. Format in Markdown with a clear action plan.`;
       else if (action === 'eli5') prompt = `Explain this highly technical text or log as if I am 5 years old (ELI5). Use simple analogies and keep it engaging. Text: "${inputText}"`;
    } else if (activeModule === 'prompt_studio') {
       if (action === 'generate_prompt') {
          prompt = `Analyze the following intent and provide EXACTLY two things:
          1. **Smart Paraphrase**: A clear, refined, and intelligent understanding of the core objective.
          2. **Advanced Framework Prompt**: A highly structured prompt ready to be used by an AI. Incorporate advanced universal reasoning frameworks like Chain-of-Thought (CoT), Mixture of Experts (MoE), Tree of Thoughts (ToT), or Recursive Logic wherever applicable to maximize output quality.
          
          User Intent: "${inputText}"
          
          Format the output in clean Markdown with clear headings.`;
       } else if (action === 'evaluate_prompt') {
          prompt = `Act as a Prompt Engineering Expert. Critique this user intent/prompt: "${inputText}". Identify weaknesses, vagueness, or missing context. Suggest 3 specific ways to make it more robust for an LLM. Format in Markdown.`;
       } else if (action === 'edge_cases') {
          prompt = `Analyze this intent/prompt: "${inputText}". Identify potential edge cases, hallucinations, or loopholes an LLM might fall into when executing it. How can we prevent them? Format in Markdown.`;
       }
    }

    const contents = [{ parts: [{ text: prompt }] }];
    const result = await executeGemini(contents);
    
    if (result) {
       updateOutputState(result);
       generateAndSaveTitleIfNeeded(inputText);
       
       if (activeModule === 'creative') {
          const actionLabels: Record<string, string> = {
            story_gen: 'Generate Story',
            plot_twist: 'Add Plot Twist',
            world_build: 'World Build',
            enhance: 'Enhance Text',
            continue: 'Continue Narrative',
            dialogue: 'Dialogue Generation',
            script: 'Script Conversion',
            translate: 'Translate Expressive'
          };
          const label = actionLabels[action] || 'Creative Action';
          addHistoryEntry(label, inputText, result);
       }
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const newUserMsg = { role: 'user', text: chatInput };
    const updatedMessages = [...chatMessages, newUserMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    if(currentSessionId) debouncedSave(currentSessionId, { messages: updatedMessages });
    setIsLoading(true);

    const contents = updatedMessages.map(m => ({
       role: m.role === 'user' ? 'user' : 'model',
       parts: [{ text: m.text }]
    }));

    const result = await executeGemini(contents, false);
    setIsLoading(false);

    if (result) {
       const finalMessages = [...updatedMessages, { role: 'model', text: result }];
       setChatMessages(finalMessages);
       if(currentSessionId) debouncedSave(currentSessionId, { messages: finalMessages });
       generateAndSaveTitleIfNeeded(newUserMsg.text);
    }
  };

  const generateAudio = async (textToSpeak: string) => {
    if (!textToSpeak.trim()) return;
    stopAudio();
    setIsLoading(true);
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const customKey = useCustomApi ? customApiKey.trim() : null;

    try {
      const voiceConfig = activeModule === 'creative' ? "Kore" : "Puck";
      
      const ttsResponse = await fetch(`/api/generate-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voiceName: voiceConfig,
          customApiKey: customKey
        }),
        signal: abortControllerRef.current.signal
      });

      if (!ttsResponse.ok) throw new Error(`Audio API Failed`);

      const ttsData = await ttsResponse.json();
      const audioBase64 = ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (audioBase64) {
        const binaryString = window.atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        if (workerRef.current) {
            workerRef.current.onmessage = (e) => {
            const wavBuffer = e.data;
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            const newUrl = URL.createObjectURL(blob);
            setAudioUrl(newUrl);
            setTimeout(() => {
                if (audioRef.current) {
                audioRef.current.src = newUrl;
                audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
                }
            }, 100);
            setIsLoading(false);
            };
            workerRef.current.postMessage({ pcm: bytes.buffer, rate: 24000 }, [bytes.buffer]);
        }

      } else {
         throw new Error("No audio data");
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
         setSaveStatus("error");
         setIsLoading(false);
      }
    }
  };

  const renderMarkdown = (text: string) => {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```([\s\S]*?)\n```/g, '<pre class="bg-[var(--bg-subpanel)] p-4 rounded-xl overflow-x-auto text-emerald-400 font-mono text-sm border border-[var(--border-focus)]/50 my-2 shadow-inner"><code>$1</code></pre>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-300 font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-[var(--text-secondary)] italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-[var(--btn-bg)] text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/^#{1}\s+(.*)$/gm, '<h1 class="font-bold text-[var(--text-primary)] mt-4 mb-2 text-2xl">$1</h1>')
      .replace(/^#{2}\s+(.*)$/gm, '<h2 class="font-bold text-[var(--text-primary)] mt-4 mb-2 text-xl">$1</h2>')
      .replace(/^#{3}\s+(.*)$/gm, '<h3 class="font-bold text-[var(--text-primary)] mt-4 mb-2 text-lg">$1</h3>')
      .replace(/^- (.*)$/gm, '<li class="ml-4 list-disc text-[var(--text-primary)] marker:text-indigo-500">$1</li>')
      .replace(/\n/g, '<br/>');
    return { __html: html };
  };

  const handleSaveSettings = () => {
    localStorage.setItem('vibe_custom_api_key', customApiKey);
    localStorage.setItem('vibe_use_custom_api', useCustomApi.toString());
    setSaveStatus("saved");
  };

  if (!user) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[var(--bg-app)] text-[var(--text-primary)]">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-8 shadow-xl max-w-sm w-full text-center">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Welcome to Vibe Pro</h1>
            <p className="text-[var(--text-tertiary)] mb-8">Sign in to sync your generated content and settings seamlessly across devices.</p>
            <button 
                onClick={() => signInWithGoogle().catch(e => console.error(e))}
                className="w-full bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--text-primary)] font-bold py-3 rounded-xl border border-[var(--border-focus)] active:scale-95 transition flex items-center justify-center gap-2"
            >
                <img src="https://www.gstatic.com/mobilesdk/250721_mobilesdk/mono_firebase_dark.svg" alt="Firebase Logo" className="w-5 h-5 opacity-80" />
                Sign in with Google
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-1 z-[60] bg-[var(--bg-app)]">
        <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(168,85,247,0.6)]" style={{ width: `${loadingProgress}%`, opacity: loadingProgress > 0 ? 1 : 0 }} />
      </div>

      {isSidebarOpen && <div className="absolute inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />}
      
      <div className={`absolute md:relative inset-y-0 left-0 z-50 w-72 bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] shadow-2xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
               {activeModule === 'creative' ? <Layout className="text-purple-500"/> : activeModule === 'nexus' ? <Terminal className="text-emerald-500"/> : activeModule === 'prompt_studio' ? <BrainCircuit className="text-cyan-500"/> : activeModule === 'chat' ? <MessageCircle className="text-blue-500"/> : <Settings className="text-[var(--text-tertiary)]"/>}
               Vibe <span className="text-[var(--text-tertiary)] font-light">Pro</span>
            </h2>
            <button onClick={() => setIsSidebarOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] md:hidden"><X size={24}/></button>
          </div>

          <div className="flex flex-col gap-2 mb-6">
             <button onClick={() => { setActiveModule('creative'); setIsSidebarOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition ${activeModule === 'creative' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'hover:bg-[var(--btn-bg)] text-[var(--text-tertiary)]'}`}><Layout size={18}/> Creative Studio</button>
             <button onClick={() => { setActiveModule('nexus'); setIsSidebarOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition ${activeModule === 'nexus' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'hover:bg-[var(--btn-bg)] text-[var(--text-tertiary)]'}`}><Terminal size={18}/> Nexus Log</button>
             <button onClick={() => { setActiveModule('prompt_studio'); setIsSidebarOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition ${activeModule === 'prompt_studio' ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'hover:bg-[var(--btn-bg)] text-[var(--text-tertiary)]'}`}><BrainCircuit size={18}/> Prompt Studio</button>
             <button onClick={() => { setActiveModule('chat'); setIsSidebarOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition ${activeModule === 'chat' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'hover:bg-[var(--btn-bg)] text-[var(--text-tertiary)]'}`}><MessageCircle size={18}/> AI Comms</button>
             <button onClick={() => { setActiveModule('settings'); setIsSidebarOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition ${activeModule === 'settings' ? 'bg-[var(--btn-hover)] text-[var(--text-primary)] border border-[var(--border-focus)]' : 'hover:bg-[var(--btn-bg)] text-[var(--text-tertiary)]'}`}><Settings size={18}/> API Settings</button>
          </div>

          {activeModule !== 'settings' && (
            <>
              <button onClick={createNewSession} className="w-full mb-4 flex items-center justify-center gap-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--text-primary)] py-3 rounded-xl font-semibold border border-[var(--border-focus)] active:scale-95 transition">
                <Plus size={18}/> New Session
              </button>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar border-t border-[var(--border-subtle)] pt-4">
                <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-bold mb-2">Recent Sessions</h3>
                {filteredSessions.map(s => (
                  <div key={s.id} onClick={() => loadSession(s.id)} className={`group relative p-3 rounded-lg cursor-pointer transition-all border ${currentSessionId === s.id ? 'bg-[var(--btn-bg)] border-[var(--border-focus)] shadow-inner' : 'bg-transparent border-transparent hover:bg-[var(--btn-bg)]/50'}`}>
                    <h3 className="font-medium text-sm text-[var(--text-primary)] truncate pr-6">{s.title || "Untitled"}</h3>
                    <div className="flex justify-between mt-1 text-[10px] text-[var(--text-tertiary)] font-mono">
                      <span>{new Date(s.lastUpdated).toLocaleDateString()}</span>
                    </div>
                    <button onClick={(e) => deleteSession(e, s.id)} className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400"><Trash2 size={14}/></button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-auto border-t border-[var(--border-subtle)] pt-4 flex flex-col gap-2">
             <div className="flex items-center gap-2 px-2 pb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--btn-bg)] flex items-center justify-center overflow-hidden">
                   {user?.photoURL ? <img src={user.photoURL} alt="Avatar" /> : <User size={16} className="text-[var(--text-tertiary)]"/>}
                </div>
                <div className="flex-1 truncate">
                   <p className="text-xs font-bold text-[var(--text-primary)] truncate">{user?.displayName || 'User'}</p>
                   <p className="text-[10px] text-[var(--text-tertiary)] truncate">{user?.email}</p>
                </div>
             </div>
             <button onClick={() => logOut()} className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-2 transition text-left px-2">Sign out</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-[100dvh] relative w-full overflow-hidden">
        <div className="h-16 flex-shrink-0 flex items-center justify-between px-4 bg-[var(--bg-panel)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] z-30 w-full">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--btn-bg)] rounded-lg"><Menu size={24}/></button>
            <span className={`font-bold text-lg tracking-wide truncate ${activeModule === 'creative' ? 'text-purple-400' : activeModule === 'nexus' ? 'text-emerald-400' : activeModule === 'prompt_studio' ? 'text-cyan-400' : activeModule === 'chat' ? 'text-blue-400' : 'text-[var(--text-secondary)]'}`}>
              {activeModule === 'creative' ? 'Creative Studio' : activeModule === 'nexus' ? 'Nexus Log' : activeModule === 'prompt_studio' ? 'Prompt Studio' : activeModule === 'chat' ? 'AI Comms' : 'Settings'}
            </span>
          </div>
          <div className="flex items-center gap-4">
             {(activeModule === 'nexus' || activeModule === 'prompt_studio' || activeModule === 'creative') && (
               <div className="flex gap-1 border border-[var(--border-focus)] rounded-lg p-1 bg-[var(--bg-app)]">
                  <button onClick={() => setViewMode('edit')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'edit' ? 'bg-[var(--btn-hover)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}><Code size={16}/></button>
                  <button onClick={() => setViewMode('preview')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'preview' ? 'bg-[var(--btn-hover)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}><Eye size={16}/></button>
               </div>
             )}
             {useCustomApi ? (
               <div className="flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-md text-xs font-bold border border-yellow-500/20">
                 <Key size={12}/> Custom API
               </div>
             ) : (
               <div className="flex items-center gap-1.5 bg-[var(--btn-bg)] text-[var(--text-tertiary)] px-2 py-1 rounded-md text-xs font-medium border border-[var(--border-subtle)]">
                 <Sparkles size={12}/> Default API
               </div>
             )}
             <span className={`text-xs flex items-center gap-1 font-mono ${saveStatus === 'saving' ? 'text-yellow-400' : saveStatus === 'error' ? 'text-red-400' : 'text-emerald-500'}`}>
                {saveStatus === 'saving' ? 'SYNC' : saveStatus === 'error' ? 'ERR' : <CheckCircle2 size={14}/>}
             </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-32 w-full">
          <div className="max-w-4xl mx-auto space-y-4 w-full h-full flex flex-col">
            
            {activeModule === 'settings' && (
               <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-xl max-w-2xl mx-auto w-full mt-10">
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2"><Settings className="text-[var(--text-tertiary)]"/> Environment Settings</h3>
                  <div className="space-y-6">
                     <div className="flex items-center justify-between p-4 bg-[var(--btn-bg)]/50 rounded-xl border border-[var(--border-focus)]/50">
                        <div>
                           <h4 className="text-sm font-bold text-[var(--text-primary)]">Theme Mode</h4>
                           <p className="text-xs text-[var(--text-tertiary)] mt-1">Switch between light and dark UI</p>
                        </div>
                        <button onClick={() => setIsDarkMode(!isDarkMode)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                           {isDarkMode ? <Moon size={24} className="text-indigo-400"/> : <Sun size={24} className="text-amber-500"/>}
                        </button>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-[var(--btn-bg)]/50 rounded-xl border border-[var(--border-focus)]/50">
                        <div>
                           <h4 className="text-sm font-bold text-[var(--text-primary)]">Use Custom API Key</h4>
                           <p className="text-xs text-[var(--text-tertiary)] mt-1">Bypass default environment key</p>
                        </div>
                        <button onClick={() => setUseCustomApi(!useCustomApi)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
                           {useCustomApi ? <ToggleRight size={32} className="text-emerald-500"/> : <ToggleLeft size={32} className="text-[var(--text-tertiary)]"/>}
                        </button>
                     </div>
                     <div className={`transition-opacity ${useCustomApi ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">Gemini API Key</label>
                        <input 
                           type="password"
                           value={customApiKey}
                           onChange={(e) => setCustomApiKey(e.target.value)}
                           placeholder="AIzaSy..."
                           className="w-full bg-[var(--bg-app)] text-[var(--text-primary)] border border-[var(--border-focus)] rounded-xl p-4 focus:outline-none focus:border-blue-500 font-mono"
                        />
                     </div>
                     <button onClick={handleSaveSettings} className="w-full bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] font-bold py-3 rounded-xl transition active:scale-95 flex justify-center items-center gap-2">
                        <Save size={18}/> Save Configuration
                     </button>
                  </div>
               </div>
            )}

            {activeModule === 'chat' && (
               <div className="flex-1 w-full flex flex-col bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-xl">
                  {chatMessages.length > 0 && (
                     <div className="absolute top-4 right-6 z-10">
                        <button onClick={handleExportSession} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-panel)]/80 hover:bg-[var(--btn-hover)] text-[var(--text-secondary)] rounded-lg text-xs font-semibold backdrop-blur-md shadow-sm border border-[var(--border-focus)] transition-all">
                           <Download size={14}/> Export Chat
                        </button>
                     </div>
                  )}
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                     {chatMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-[var(--text-tertiary)] space-y-4">
                           <MessageCircle size={48} className="opacity-20"/>
                           <p>Secure Comm Link Established. Awaiting Input.</p>
                        </div>
                     ) : (
                        chatMessages.map((msg, i) => (
                           <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-[var(--btn-hover)]' : 'bg-blue-600'}`}>
                                 {msg.role === 'user' ? <User size={16} className="text-[var(--text-primary)]"/> : <Sparkles size={16} className="text-[var(--text-primary)]"/>}
                              </div>
                              <div className={`relative max-w-[80%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-[var(--btn-hover)] text-[var(--text-primary)] rounded-tr-none' : 'bg-[var(--bg-app)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-tl-none pr-10'} shadow-sm group`}>
                                 <div dangerouslySetInnerHTML={renderMarkdown(msg.text)} className="text-sm md:text-base whitespace-pre-wrap break-words" />
                                 {msg.role === 'model' && (
                                    <button onClick={() => handleCopy(msg.text, `chat-${i}`)} className="absolute top-2 right-2 p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--btn-bg)] rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                       {copiedStates[`chat-${i}`] ? <CheckCircle2 size={14} className="text-emerald-400"/> : <Copy size={14}/>}
                                    </button>
                                 )}
                              </div>
                           </div>
                        ))
                     )}
                     {isLoading && (
                        <div className="flex gap-3">
                           <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center animate-pulse"><Sparkles size={16} className="text-[var(--text-primary)]"/></div>
                           <div className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
                           </div>
                        </div>
                     )}
                  </div>
                  <div className="p-3 bg-[var(--bg-app)] border-t border-[var(--border-subtle)] flex gap-2">
                     <button onClick={() => toggleMic('chat')} className={`p-3 rounded-xl flex-shrink-0 transition ${isRecording ? 'bg-red-500 text-[var(--text-primary)] animate-pulse' : 'bg-[var(--btn-bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                        {isRecording ? <MicOff size={20}/> : <Mic size={20}/>}
                     </button>
                     <input 
                        type="text" 
                        value={chatInput} 
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter') handleSendChatMessage(); }}
                        placeholder="Transmit message..." 
                        className="flex-1 bg-[var(--bg-app)] border border-[var(--border-focus)] rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 text-[var(--text-primary)]"
                     />
                     <button onClick={handleSendChatMessage} disabled={isLoading || !chatInput.trim()} className="p-3 bg-blue-600 text-[var(--text-primary)] rounded-xl disabled:opacity-50 transition active:scale-95">
                        <Send size={20}/>
                     </button>
                  </div>
               </div>
            )}

            {(activeModule === 'creative' || activeModule === 'nexus' || activeModule === 'prompt_studio') && (
               <div className={activeModule === 'creative' ? "grid grid-cols-1 lg:grid-cols-4 gap-4 w-full items-start" : "space-y-4 w-full"}>
                  <div className={activeModule === 'creative' ? "lg:col-span-3 flex flex-col gap-4" : "space-y-4"}>
               <div className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl shadow-md overflow-hidden flex flex-col relative h-[150px] flex-shrink-0">
                  <div className="bg-[var(--bg-app)] px-4 py-2 border-b border-[var(--border-subtle)] text-xs font-bold tracking-wider text-[var(--text-tertiary)] flex justify-between items-center">
                     <span>Input / Context Area</span>
                     <div className="flex items-center gap-2">
                        {activeModule === 'nexus' && inputText.length > 150 && (
                           <button 
                              onClick={() => handleAiAction('summarize')}
                              disabled={isLoading}
                              className="flex items-center gap-1 bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold transition active:scale-95 cursor-pointer animate-pulse"
                           >
                              <Sparkles size={11} className="text-emerald-400" /> AI Summarize
                           </button>
                        )}
                        <button onClick={() => toggleMic('editor')} className={`p-1.5 rounded-full ${isRecording ? 'text-red-500 animate-pulse' : 'text-[var(--text-tertiary)] hover:text-emerald-400'}`}>
                           {isRecording ? <MicOff size={14}/> : <Mic size={14}/>}
                        </button>
                     </div>
                  </div>
                  <textarea
                     value={inputText}
                     onChange={handleInputTextChange}
                     placeholder={activeModule === 'prompt_studio' ? "আপনার ইনটেন্ট বা কাজের উদ্দেশ্য এখানে বিস্তারিত লিখুন..." : "Enter your base idea, context, or raw data here..."}
                     className="flex-1 w-full bg-transparent text-[var(--text-primary)] p-4 text-sm md:text-base resize-none focus:outline-none"
                  />
               </div>

               <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide w-full flex-shrink-0">
                  <button onClick={handleUndo} disabled={historyIndex === 0} className="flex-shrink-0 flex items-center justify-center p-2 bg-[var(--btn-bg)] rounded-lg text-[var(--text-secondary)] disabled:opacity-30 border border-[var(--border-focus)]"><Undo2 size={16}/></button>
                  <button onClick={handleRedo} disabled={historyIndex === textHistory.length - 1} className="flex-shrink-0 flex items-center justify-center p-2 bg-[var(--btn-bg)] rounded-lg text-[var(--text-secondary)] disabled:opacity-30 border border-[var(--border-focus)]"><Redo2 size={16}/></button>
                  <div className="w-px h-6 bg-[var(--btn-hover)] my-auto mx-1"></div>
                  
                  {activeModule === 'prompt_studio' ? [
                     { id: 'generate_prompt', icon: BrainCircuit, label: '✨ Gen Master Prompt', color: 'cyan' },
                     { id: 'evaluate_prompt', icon: CheckCircle2, label: '✨ Evaluate', color: 'purple' },
                     { id: 'edge_cases', icon: Sparkles, label: '✨ Edge Cases', color: 'orange' }
                  ].map(tool => (
                     <button key={tool.id} onClick={() => handleAiAction(tool.id)} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--bg-panel)] rounded-lg text-sm font-bold border ${toolColors[tool.color]} whitespace-nowrap active:scale-95 transition`}>
                        <tool.icon size={16} /> {tool.label}
                     </button>
                  )) : activeModule === 'creative' ? [
                     { id: 'story_gen', icon: Sparkles, label: '✨ Gen Story', color: 'purple' },
                     { id: 'plot_twist', icon: Wand2, label: '✨ Plot Twist', color: 'pink' },
                     { id: 'world_build', icon: FileText, label: '✨ World Build', color: 'emerald' },
                     { id: 'enhance', icon: Wand2, label: '✨ Enhance', color: 'cyan' },
                     { id: 'continue', icon: FastForward, label: '✨ Continue', color: 'green' },
                     { id: 'dialogue', icon: MessageSquare, label: '✨ Dialogue', color: 'blue' },
                     { id: 'script', icon: Split, label: '✨ Script', color: 'indigo' },
                     { id: 'translate', icon: FileText, label: '✨ Translate', color: 'orange' },
                  ].map(tool => (
                     <button key={tool.id} onClick={() => handleAiAction(tool.id)} className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] rounded-lg text-xs font-medium border ${toolColors[tool.color]} whitespace-nowrap active:scale-95 transition`}>
                        <tool.icon size={14} /> {tool.label}
                     </button>
                  )) : [
                     { id: 'summarize', icon: Sparkles, label: '✨ AI Summarize', color: 'emerald' },
                     { id: 'tech_summary', icon: FileText, label: '✨ Tech Summary', color: 'green' },
                     { id: 'root_cause', icon: Sparkles, label: '✨ Root Cause', color: 'pink' },
                     { id: 'eli5', icon: CheckCircle2, label: '✨ ELI5 Explain', color: 'yellow' },
                     { id: 'code_block', icon: Code, label: '✨ Extract Code', color: 'indigo' },
                     { id: 'enhance', icon: Wand2, label: '✨ Professionalize', color: 'cyan' },
                     { id: 'grammar', icon: CheckCircle2, label: '✨ Fix Grammar', color: 'blue' },
                     { id: 'translate', icon: MessageSquare, label: '✨ Translate', color: 'purple' },
                  ].map(tool => (
                     <button key={tool.id} onClick={() => handleAiAction(tool.id)} className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] rounded-lg text-xs font-medium border ${toolColors[tool.color]} whitespace-nowrap active:scale-95 transition`}>
                        <tool.icon size={14} /> {tool.label}
                     </button>
                  ))}
               </div>

               <div className="relative flex-1 w-full flex flex-col rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-subpanel)] shadow-xl">
                  <div className="bg-[var(--bg-app)] px-4 py-2 border-b border-[var(--border-subtle)] flex justify-between items-center">
                     <span className="text-xs font-bold tracking-wider text-[var(--text-tertiary)]">Generated Output</span>
                     <div className="flex items-center gap-2">
                        <button onClick={handleExportSession} className="flex items-center gap-1.5 px-2 py-1 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--text-secondary)] rounded text-xs font-medium transition-colors border border-[var(--border-focus)]">
                           <Download size={12}/> Export
                        </button>
                        <button onClick={() => handleCopy(outputText, 'output')} className="flex items-center gap-1.5 px-2 py-1 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--text-secondary)] rounded text-xs font-medium transition-colors border border-[var(--border-focus)]">
                           {copiedStates['output'] ? <CheckCircle2 size={12} className="text-emerald-400"/> : <Copy size={12}/>}
                           {copiedStates['output'] ? 'Copied' : 'Copy'}
                        </button>
                     </div>
                  </div>
                  
                  {viewMode === 'edit' ? (
                     <textarea
                        value={outputText}
                        onChange={(e) => updateOutputState(e.target.value)}
                        placeholder="AI generated result will appear here..."
                        className={`flex-1 w-full bg-transparent text-[var(--text-primary)] p-5 text-base md:text-lg leading-relaxed focus:outline-none resize-none placeholder:text-[var(--text-secondary)] ${activeModule === 'nexus' ? 'font-mono' : 'font-sans'}`}
                     />
                  ) : (
                     <div 
                        className="flex-1 w-full bg-[var(--bg-app)] text-[var(--text-primary)] p-6 text-base leading-relaxed overflow-y-auto"
                        dangerouslySetInnerHTML={renderMarkdown(outputText || '*No output generated yet.*')}
                     />
                  )}
               </div>
                  </div>

                  {activeModule === 'creative' && (
                     <div className="lg:col-span-1 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 shadow-md flex flex-col h-[525px] flex-shrink-0">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-subtle)] flex-shrink-0">
                           <div>
                              <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                 <BrainCircuit size={14} className="text-purple-400" />
                                 Snapshots
                              </h4>
                              <p className="text-[10px] text-[var(--text-tertiary)] font-semibold mt-0.5">Non-linear edit points</p>
                           </div>
                           <button 
                              onClick={() => addHistoryEntry('Manual Checkpoint')}
                              disabled={!inputText.trim() && !outputText.trim()}
                              className="px-2 py-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-md border border-purple-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                              title="Save current state as a manual checkpoint"
                           >
                              <Save size={10} />
                              Save
                           </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                           {studioHistory.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-center text-[var(--text-tertiary)] p-2 my-auto">
                                 <Sparkles size={32} className="opacity-25 mb-2 text-purple-400" />
                                 <p className="text-xs font-semibold">No edit snapshots</p>
                                 <p className="text-[10px] opacity-65 mt-1">AI outputs and manual snapshots will appear here as revert checkpoints.</p>
                              </div>
                           ) : (
                              <div className="relative border-l border-[var(--border-subtle)] ml-2.5 pl-4 space-y-4 py-2">
                                 {studioHistory.map((item) => {
                                    const isCurrent = item.inputText === inputText && item.outputText === outputText;
                                    return (
                                       <div 
                                          key={item.id} 
                                          onClick={() => handleRevertToHistory(item)}
                                          className={`group relative cursor-pointer text-left transition-all p-2 rounded-xl border ${
                                             isCurrent 
                                                ? 'bg-purple-500/10 border-purple-500/30 shadow-inner' 
                                                : 'bg-[var(--bg-app)]/40 border-transparent hover:bg-purple-500/5 hover:border-purple-500/20'
                                          }`}
                                       >
                                          <div className={`absolute -left-[21.5px] top-4 w-2.5 h-2.5 rounded-full border-2 transition-all ${
                                             isCurrent 
                                                ? 'bg-purple-500 border-purple-400 ring-4 ring-purple-500/20' 
                                                : 'bg-[var(--bg-panel)] border-[var(--border-subtle)] group-hover:border-purple-400'
                                          }`} />
                                          
                                          <div className="flex justify-between items-start gap-1">
                                             <h5 className="text-xs font-bold text-[var(--text-primary)] truncate pr-4">{item.label}</h5>
                                             <button 
                                                onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                                                className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400 transition-opacity"
                                             >
                                                <X size={12} />
                                             </button>
                                          </div>
                                          <p className="text-[9px] text-[var(--text-tertiary)] font-mono mt-0.5">{item.timestamp}</p>
                                          <div className="mt-1 text-[10px] text-[var(--text-tertiary)] line-clamp-2 italic opacity-85">
                                             {item.outputText ? item.outputText.substring(0, 60) + '...' : item.inputText.substring(0, 60) + '...'}
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           )}
                        </div>
                     </div>
                  )}
               </div>
            )}
          </div>
        </div>

        {activeModule !== 'settings' && activeModule !== 'chat' && (
         <div className="absolute bottom-0 left-0 right-0 bg-[var(--bg-panel)]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] p-4 pb-6 md:pb-4 z-40 w-full">
            {isPlaying && (
               <div className="absolute top-0 left-0 right-0 h-0.5 flex justify-center gap-1 overflow-hidden opacity-40">
                  {[...Array(40)].map((_, i) => (
                  <div key={i} className={`w-1 h-full animate-pulse ${activeModule === 'creative' ? 'bg-purple-500' : 'bg-emerald-500'}`} style={{ animationDuration: `${Math.random() * 0.4 + 0.1}s` }} />
                  ))}
               </div>
            )}
            
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 w-full">
               <button 
                  onClick={() => generateAudio(outputText || inputText)}
                  disabled={isLoading || (!outputText.trim() && !inputText.trim())}
                  className={`flex-1 text-[var(--text-primary)] font-bold h-12 rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50 disabled:grayscale overflow-hidden relative min-w-[120px] ${activeModule === 'creative' ? 'bg-gradient-to-r from-purple-600 to-pink-600' : 'bg-gradient-to-r from-indigo-600 to-emerald-600'}`}
               >
                  {isLoading ? (
                  <div className="flex items-center gap-2 font-mono">
                     <span className="animate-spin text-xl">⚡</span>
                     <span className="text-sm">PROCESSING</span>
                  </div>
                  ) : (
                  <>
                     <Volume2 size={20} className="flex-shrink-0"/>
                     <span className="text-sm tracking-wide">PLAY OUTPUT AUDIO</span>
                  </>
                  )}
               </button>

               {isPlaying && (
                  <button onClick={stopAudio} className="h-12 w-12 flex-shrink-0 flex items-center justify-center bg-red-500/20 text-red-500 rounded-xl border border-red-500/30 active:scale-95 transition">
                  <StopCircle size={24}/>
                  </button>
               )}

               {audioUrl && (
                  <a href={audioUrl} download={`vibe_audio_${Date.now()}.wav`} className={`h-12 w-12 flex-shrink-0 flex items-center justify-center rounded-xl active:scale-95 transition ${activeModule === 'creative' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-600/20 text-emerald-500 border border-emerald-500/30'}`}>
                  <Download size={20}/>
                  </a>
               )}
            </div>
         </div>
        )}

        <audio ref={audioRef} src={audioUrl || undefined} onEnded={() => setIsPlaying(false)} onError={() => setIsPlaying(false)} className="hidden" />
      </div>
    </div>
  );
};

export default App;
