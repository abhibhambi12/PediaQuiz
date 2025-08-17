// frontend/src/pages/ChatPage.tsx
import React, { useState } from 'react';
import { sendMessageToAI } from '../services/aiService';

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<{ text: string; isUser: boolean }[]>([]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;
    setMessages([...messages, { text: input, isUser: true }]);
    try {
      const response = await sendMessageToAI(input);
      setMessages([...messages, { text: input, isUser: true }, { text: response, isUser: false }]);
    } catch (error) {
      console.error('AI chat error:', error);
    }
    setInput('');
  };

  return (
    <div className="p-6 flex flex-col h-screen">
      <h1 className="text-2xl font-bold mb-4">Chat</h1>
      <div className="flex-1 overflow-y-auto">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 my-2 rounded ${msg.isUser ? 'bg-blue-100 ml-auto' : 'bg-gray-100'}`}
          >
            {msg.text}
          </div>
        ))}
      </div>
      <div className="flex mt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 p-2 border rounded-l"
        />
        <button
          onClick={handleSend}
          className="p-2 bg-blue-600 text-white rounded-r"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPage;