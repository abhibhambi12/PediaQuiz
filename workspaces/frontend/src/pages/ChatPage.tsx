// FILE: frontend/src/pages/ChatPage.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { chatWithAssistant } from '@/services/aiService';
import { ChatMessage } from '@pediaquiz/types'; // FIXED: Ensure ChatMessage type is imported
import { useToast } from '@/components/Toast';
import ReactMarkdown from 'react-markdown';

const ChatPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chatMutation = useMutation<HttpsCallableResult<{ response: string }>, Error, { prompt: string; history: ChatMessage[] }>({
        mutationFn: chatWithAssistant,
        onSuccess: (data) => {
            const assistantMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: data.data.response,
                sender: 'assistant',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);
        },
        onError: (error) => {
            addToast(`AI chat error: ${error.message}`, 'error');
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: "Sorry, I encountered an error. Please try again or rephrase your request.",
                sender: 'assistant',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        },
    });

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !user || chatMutation.isPending) return; // user.uid implicitly checked by useAuth() context
        const userMessage: ChatMessage = { id: Date.now().toString(), text: input, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        const currentHistory = [...messages, userMessage];
        setInput('');
        chatMutation.mutate({ prompt: userMessage.text, history: currentHistory });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-160px)] bg-white dark:bg-slate-800 rounded-xl shadow-lg">
            <h1 className="text-2xl font-bold p-4 border-b dark:border-slate-700 text-slate-800 dark:text-slate-200">AI Study Assistant</h1>
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
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
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your question..." onKeyPress={(e) => e.key === 'Enter' && handleSend()} className="input-field flex-grow" disabled={chatMutation.isPending || !user} />
                <button onClick={handleSend} className="px-4 py-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 disabled:opacity-50" disabled={chatMutation.isPending || !user}>Send</button>
            </div>
        </div>
    );
};

export default ChatPage;