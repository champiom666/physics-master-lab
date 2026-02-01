import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import katex from "katex";
import { 
  LayoutDashboard, 
  MessageSquare, 
  BookOpen, 
  Archive, 
  Send, 
  Image as ImageIcon, 
  X, 
  Zap, 
  Atom, 
  Activity, 
  Cpu,
  Thermometer,
  Magnet,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  PenTool,
  Maximize2,
  Download,
  Printer
} from "lucide-react";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// System Instruction
const SYSTEM_INSTRUCTION = `
# Role:
你是一位拥有20年教研经验的初中物理特级教师，擅长通过“逆向思维”和“苏格拉底式提问”帮助学生掌握物理本质。

# Core Objective:
针对学生上传的题目图片或知识点请求，提供：
1. 拍照批改：精准识别正误，定位思维盲区。
2. 智能讲解：不直接给答案，通过启发式对话引导学生推导。除非学生要求直接给出答案。
3. 知识点溯源：关联课本核心概念。
4. 公式渲染：使用标准的 LaTeX 格式输出所有物理公式，行内公式使用 $...$，块级公式使用 $$...$$。

# Workflow Modules:
## Module 3: 模拟考试卷生成
当学生要求“出题”或“组卷”时，将内容包裹在 <exam_paper>...</exam_paper> 中。试卷应包含卷头信息。
`;

type Message = {
  role: "user" | "model";
  text: string;
  image?: string;
};

type Mistake = {
  id: string;
  timestamp: number;
  originalImage?: string;
  originalText: string;
  topic: string;
  reason: string;
  advice: string;
};

type View = "dashboard" | "chat" | "formulas" | "archive";

// --- LaTeX Renderer Component ---

const MathText = ({ text, style }: { text: string; style?: React.CSSProperties }) => {
  const renderContent = () => {
    if (!text) return null;
    const parts = text.split(/(\$\$.*?\$\$|\$.*?\$)/gs);

    return parts.map((part, index) => {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        const math = part.slice(2, -2);
        try {
          const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
          return <div key={index} dangerouslySetInnerHTML={{ __html: html }} style={{ margin: '1em 0' }} />;
        } catch (e) {
          return <code key={index}>{part}</code>;
        }
      } else if (part.startsWith("$") && part.endsWith("$")) {
        const math = part.slice(1, -1);
        try {
          const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (e) {
          return <code key={index}>{part}</code>;
        }
      }
      return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  };

  return <div style={style}>{renderContent()}</div>;
};

// --- Exam Paper Component ---

const ExamPaper = ({ content, onExpand }: { content: string, onExpand?: () => void }) => {
  return (
    <div className="exam-container" style={{ margin: '16px 0', position: 'relative' }}>
      <div className="exam-paper-preview" style={{
        backgroundColor: '#fff',
        padding: '30px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        fontFamily: '"STSong", "SimSun", serif', 
        color: '#1e293b',
        borderRadius: '8px',
        maxHeight: onExpand ? '400px' : 'none',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{ borderBottom: '1px solid #94a3b8', paddingBottom: '12px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', color: '#64748b' }}>绝密 ★ 启用前</div>
          <h2 style={{ fontSize: '20px', margin: '8px 0', color: '#0f172a' }}>物理模拟试卷</h2>
        </div>
        <MathText text={content.trim()} style={{ lineHeight: 1.8, fontSize: '14px' }} />
        
        {onExpand && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '100px',
            background: 'linear-gradient(transparent, #fff)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: '20px'
          }}>
            <button 
              onClick={onExpand}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: '#38bdf8',
                color: '#fff',
                border: 'none',
                borderRadius: '20px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(56, 189, 248, 0.4)'
              }}
            >
              <Maximize2 size={16} />
              查看完整试卷
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Modal Component ---

// Added semicolon to type definition and made children optional to fix "missing children" error in JSX usage on line 373
const Modal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      backdropFilter: 'blur(8px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px'
    }}>
      <div className="fade-in" style={{
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: '900px',
        height: '90%',
        borderRadius: '12px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <h3 style={{ margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PenTool size={18} color="#38bdf8" /> 智能生成的试卷
          </h3>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
               <Printer size={16} /> 打印
             </button>
             <button onClick={onClose} style={{ padding: '8px', borderRadius: '6px', border: 'none', background: '#f1f5f9', cursor: 'pointer', color: '#64748b' }}>
               <X size={20} />
             </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '60px', backgroundColor: '#f1f5f9' }}>
           <div style={{ 
             backgroundColor: '#fff', 
             padding: '80px', 
             boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
             minHeight: '100%',
             width: '100%',
             maxWidth: '800px',
             margin: '0 auto',
             fontFamily: 'serif'
           }}>
             {children}
           </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "嘿！欢迎来到物理实验室。🧪 我是你的AI物理老师。不管是想攻克难题，还是需要我为你出一份模拟试卷，随时告诉我！",
    },
  ]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeExamContent, setActiveExamContent] = useState<string | null>(null);
  
  const [examTopic, setExamTopic] = useState("");
  const [examDifficulty, setExamDifficulty] = useState("标准");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, currentView]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async (manualText?: string) => {
    const textToSend = typeof manualText === 'string' ? manualText : input;
    if ((!textToSend.trim() && !selectedImage) || isLoading) return;

    const userContext = { text: textToSend, image: selectedImage };
    const newMessage: Message = { role: "user", text: textToSend, image: selectedImage || undefined };

    setMessages((prev) => [...prev, newMessage]);
    if (!manualText) setInput("");
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const historyParts = messages.map((msg) => {
        const parts: any[] = [];
        if (msg.image) {
          const base64Data = msg.image.split(",")[1];
          const mimeType = msg.image.split(";")[0].split(":")[1];
          parts.push({ inlineData: { mimeType, data: base64Data } });
        }
        if (msg.text) {
          parts.push({ text: msg.text.replace(/<mistake_entry>[\s\S]*?<\/mistake_entry>/g, "") });
        }
        return { role: msg.role, parts };
      });

      const currentParts: any[] = [];
      if (newMessage.image) {
        const base64Data = newMessage.image.split(",")[1];
        const mimeType = newMessage.image.split(";")[0].split(":")[1];
        currentParts.push({ inlineData: { mimeType, data: base64Data } });
      }
      if (newMessage.text) currentParts.push({ text: newMessage.text });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...historyParts, { role: 'user', parts: currentParts }],
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });

      const responseText = response.text || "...";
      const mistakeMatch = responseText.match(/<mistake_entry>([\s\S]*?)<\/mistake_entry>/);
      if (mistakeMatch) {
        try {
          const mistakeData = JSON.parse(mistakeMatch[1]);
          setMistakes(prev => [{ id: Date.now().toString(), timestamp: Date.now(), originalImage: userContext.image || undefined, originalText: userContext.text, ...mistakeData }, ...prev]);
        } catch (e) {}
      }
      setMessages((prev) => [...prev, { role: "model", text: responseText }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "model", text: "⚠️ 连接中断，请检查网络。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessageContent = (text: string) => {
    const safeText = text.replace(/<mistake_entry>[\s\S]*?<\/mistake_entry>/g, "");
    const examPaperRegex = /<exam_paper>([\s\S]*?)<\/exam_paper>/;
    const match = safeText.match(examPaperRegex);
  
    if (match) {
      const examContent = match[1];
      const parts = safeText.split(match[0]);
  
      return (
        <div style={{ width: '100%' }}>
          {parts[0] && <MathText text={parts[0]} style={{ marginBottom: 12 }} />}
          <ExamPaper content={examContent} onExpand={() => setActiveExamContent(examContent)} />
          {parts[1] && <MathText text={parts[1]} style={{ marginTop: 12 }} />}
        </div>
      );
    }
    return <MathText text={safeText} />;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-color)' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 24px 32px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Atom color="#fff" size={24} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9' }}>Physics Lab</h1>
        </div>
        <div style={{ flex: 1 }}>
          <button onClick={() => setCurrentView('dashboard')} style={{ width: '100%', padding: '12px 24px', border: 'none', background: currentView === 'dashboard' ? 'rgba(56, 189, 248, 0.1)' : 'transparent', color: currentView === 'dashboard' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
            <LayoutDashboard size={20} /> 控制台
          </button>
          <button onClick={() => setCurrentView('chat')} style={{ width: '100%', padding: '12px 24px', border: 'none', background: currentView === 'chat' ? 'rgba(56, 189, 248, 0.1)' : 'transparent', color: currentView === 'chat' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
            <MessageSquare size={20} /> 智能导师
          </button>
          <button onClick={() => setCurrentView('formulas')} style={{ width: '100%', padding: '12px 24px', border: 'none', background: currentView === 'formulas' ? 'rgba(56, 189, 248, 0.1)' : 'transparent', color: currentView === 'formulas' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
            <BookOpen size={20} /> 公式库
          </button>
          <button onClick={() => setCurrentView('archive')} style={{ width: '100%', padding: '12px 24px', border: 'none', background: currentView === 'archive' ? 'rgba(56, 189, 248, 0.1)' : 'transparent', color: currentView === 'archive' ? '#38bdf8' : '#94a3b8', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
            <Archive size={20} /> 错题本
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* Full Screen Exam Modal */}
        <Modal isOpen={!!activeExamContent} onClose={() => setActiveExamContent(null)}>
           <div style={{ borderBottom: '1px solid #0f172a', paddingBottom: '20px', marginBottom: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '6px', color: '#1e293b', marginBottom: '12px' }}>绝密 ★ 启用前</div>
              <h1 style={{ fontSize: '32px', margin: '0 0 16px 0', color: '#0f172a' }}>2026年 初中物理模拟试卷</h1>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', fontSize: '15px', color: '#475569' }}>
                <span>考试时长：45分钟</span>
                <span>满分：100分</span>
              </div>
           </div>
           <MathText text={activeExamContent || ""} style={{ lineHeight: 2, fontSize: '18px', color: '#1e293b' }} />
        </Modal>

        {currentView === 'dashboard' && (
          <div className="fade-in" style={{ padding: '40px', overflowY: 'auto', height: '100%' }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '32px' }}>探索物理的奥秘</h2>
            <div className="glass-panel" style={{ padding: '32px', borderRadius: '16px', marginBottom: '32px' }}>
              <h3 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PenTool size={20} color="#38bdf8" /> 智能组卷引擎
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px' }}>核心考点</label>
                  <input type="text" placeholder="例如：机械能守恒、比热容..." value={examTopic} onChange={(e) => setExamTopic(e.target.value)}
                    style={{ width: '100%', padding: '12px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#f1f5f9' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px' }}>难度</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['基础', '标准', '压轴'].map(l => (
                      <button key={l} onClick={() => setExamDifficulty(l)} style={{ flex: 1, padding: '10px', background: examDifficulty === l ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.5)', border: examDifficulty === l ? '1px solid #38bdf8' : '1px solid var(--border-color)', color: examDifficulty === l ? '#38bdf8' : '#94a3b8', borderRadius: '8px', cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => { setCurrentView('chat'); handleSend(`请为我生成一份关于“${examTopic || '初中物理综合'}”的【${examDifficulty}】难度模拟试卷。`); }}
                style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                立即生成并开始练习
              </button>
            </div>
          </div>
        )}

        {currentView === 'chat' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
              <img src="https://api.dicebear.com/7.x/bottts/svg?seed=physics" style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#334155', marginRight: '12px' }} />
              <div><div style={{ fontWeight: 600 }}>特级教师 AI</div><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>在线指导</div></div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: (msg.text || '').includes('<exam_paper>') ? '90%' : '80%',
                    backgroundColor: msg.role === 'user' ? '#38bdf8' : 'rgba(30, 41, 59, 0.8)',
                    color: msg.role === 'user' ? '#0f172a' : '#f1f5f9',
                    borderRadius: '16px',
                    padding: (msg.text || '').includes('<exam_paper>') ? '0' : '16px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    backdropFilter: msg.role === 'model' ? 'blur(10px)' : 'none',
                  }}>
                    {msg.image && <img src={msg.image} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginBottom: '8px' }} />}
                    {renderMessageContent(msg.text)}
                  </div>
                </div>
              ))}
              {isLoading && <div style={{ color: '#94a3b8', fontSize: '0.9rem', display: 'flex', gap: '8px' }}><div className="loading-dots">...</div> 教师正在批改/推导中</div>}
              <div ref={messagesEndRef} style={{ height: '20px' }} />
            </div>

            {/* Input Box - Always at the bottom, no overlay */}
            <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
              <div className="glass-panel" style={{ borderRadius: '16px', padding: '12px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                <button onClick={() => fileInputRef.current?.click()} style={{ padding: '8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }} title="上传图片"><ImageIcon size={20} /></button>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
                <div style={{ flex: 1, position: 'relative' }}>
                  {selectedImage && <div style={{ position: 'absolute', bottom: '100%', left: 0, padding: '4px', background: '#1e293b', borderRadius: '4px', border: '1px solid #334155', marginBottom: '8px' }}><img src={selectedImage} style={{ width: '40px', height: '40px', borderRadius: '2px' }} /><X size={12} style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'pointer', background: '#f87171', borderRadius: '50%' }} onClick={() => setSelectedImage(null)} /></div>}
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="在此输入你的物理疑问..."
                    style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', outline: 'none', resize: 'none', minHeight: '40px' }} />
                </div>
                <button onClick={() => handleSend()} disabled={isLoading} style={{ padding: '10px 24px', background: '#38bdf8', border: 'none', borderRadius: '10px', color: '#0f172a', fontWeight: 600, cursor: 'pointer' }}><Send size={20} /></button>
              </div>
            </div>
          </div>
        )}

        {currentView === 'formulas' && (
          <div className="fade-in" style={{ padding: '40px', overflowY: 'auto', height: '100%' }}>
            <h2 style={{ marginBottom: '32px' }}>公式基座</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}><h4 style={{ color: '#38bdf8', margin: '0 0 12px 0' }}>动能定理</h4><MathText text="$$W = \Delta E_k = \frac{1}{2}mv^2 - \frac{1}{2}mv_0^2$$" /><p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>合外力做的功等于物体动能的变化量。</p></div>
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}><h4 style={{ color: '#38bdf8', margin: '0 0 12px 0' }}>热量公式</h4><MathText text="$$Q = cm\Delta t$$" /><p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>物质吸放热计算，c为比热容。</p></div>
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}><h4 style={{ color: '#38bdf8', margin: '0 0 12px 0' }}>电功率</h4><MathText text="$$P = UI = I^2R = \frac{U^2}{R}$$" /><p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>描述电流做功的快慢。</p></div>
            </div>
          </div>
        )}

        {currentView === 'archive' && (
          <div className="fade-in" style={{ padding: '40px', overflowY: 'auto', height: '100%' }}>
            <h2 style={{ marginBottom: '32px' }}>错题本</h2>
            {mistakes.length === 0 ? <p style={{ color: '#94a3b8' }}>你还没有错题记录，保持完美的物理直觉吧！</p> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
                {mistakes.map(m => (
                  <div key={m.id} className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', background: 'rgba(248, 113, 113, 0.1)', borderBottom: '1px solid rgba(248, 113, 113, 0.2)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#f87171', fontWeight: 600 }}>{m.topic}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(m.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div style={{ padding: '20px' }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#94a3b8' }}>{m.reason}</p>
                      <MathText text={m.advice} style={{ color: '#f1f5f9' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);