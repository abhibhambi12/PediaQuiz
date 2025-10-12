import React, { useState, useEffect, useRef } from 'react';
import { chatWithAssistant } from '@/services/aiService';
import { useAuth } from '@/contexts/AuthContext';
// --- BATCH 7: CRITICAL TYPE FIX ---
// The `ChatMessage` type is now correctly imported from the shared types package,
// resolving the "has no exported member" TypeScript error.
import { ChatMessage } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import ReactMarkdown from 'react-markdown';

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !user) {
      if (!user) addToast('Please log in to chat.', 'error');
      return;
    }

    const newUserMessage: ChatMessage = {
      id: Date.now().toString(),
      text: trimmedInput,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const aiResponse = await chatWithAssistant({
        prompt: trimmedInput,
        history: messages,
      });

      const aiMessage: ChatMessage = {
        id: Date.now().toString() + '_ai',
        text:
          aiResponse.data.response ||
          "I couldn't generate a response. Please try again.",
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, aiMessage]);
    } catch (error: any) {
      addToast(`AI chat error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">AI Study Assistant</h1>
      <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-slate-800 rounded-lg shadow-inner mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex my-3 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`p-3 rounded-lg max-w-lg ${
                msg.sender === 'user'
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <ReactMarkdown className="prose dark:prose-invert prose-p:my-0">
                {msg.text}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
          placeholder="Ask me anything about your studies..."
          className="input-field flex-1"
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="btn-primary ml-2 p-3"
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatPage;