// workspaces/frontend/src/pages/ChatPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { chatWithAssistant } from '@/services/aiService';
import { ChatMessage } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext';

const ChatPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chatMutation = useMutation<
        { response: string }, // Explicit return type for direct data return
        Error, // Error type
        { prompt: string; history: ChatMessage[] } // Variables type
    >({
        mutationFn: (data) => chatWithAssistant(data),
        onSuccess: (response) => { // response is directly { response: string }
            const assistantMessage: ChatMessage = {
                id: (Date.now() + Math.random()).toString(),
                text: response.response,
                sender: 'assistant',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);
        },
        onError: (error: Error) => {
            addToast(`AI chat error: ${error.message}`, 'danger');
            const errorMessage: ChatMessage = {
                id: (Date.now() + Math.random()).toString(),
                text: "Sorry, I encountered an error. Please try again or rephrase your request.",
                sender: 'assistant',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        },
    });

    useEffect(() => { 
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !user || chatMutation.isPending) {
            if (!user) addToast("Please log in to chat with the assistant.", "warning");
            return;
        }

        const userMessage: ChatMessage = { id: Date.now().toString(), text: input, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        
        // Transform current messages into the format expected by the backend
        const historyForAI: { role: 'user' | 'model'; parts: { text: string }[] }[] = messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        chatMutation.mutate({ prompt: userMessage.text, history: historyForAI });
        setInput(''); // Clear input after sending
    };

    return (
        <div className="flex flex-col h-[calc(100vh-160px)] bg-white dark:bg-slate-800 rounded-xl shadow-lg">
            <h1 className="text-2xl font-bold p-4 border-b dark:border-slate-700 text-slate-800 dark:text-slate-200">AI Study Assistant</h1>
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                {messages.length === 0 && !chatMutation.isPending && (
                    <div className="text-center text-slate-500 py-10">
                        Ask me anything about your study materials!
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`p-3 rounded-lg max-w-[80%] prose dark:prose-invert ${msg.sender === 'user' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                    </div>
                ))}
                {chatMutation.isPending && (
                    <div className="flex justify-start">
                        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 animate-pulse w-fit">PediaBot is thinking...</div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t dark:border-slate-700 flex items-center gap-2">
                <input 
                    type="text" 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    placeholder={user ? "Ask your question..." : "Please log in to chat..."} 
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()} 
                    className="input-field flex-grow" 
                    disabled={chatMutation.isPending || !user} 
                />
                <button 
                    onClick={handleSend} 
                    className="px-4 py-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 disabled:opacity-50" 
                    disabled={chatMutation.isPending || !user}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default ChatPage;