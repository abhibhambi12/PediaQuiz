import React, { useState } from 'react';
import { generateContent } from '../services/aiService';

const GeneratorPage: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [generatedContent, setGeneratedContent] = useState('');

    const handleGenerate = async () => {
        try {
            const content = await generateContent(prompt);
            setGeneratedContent(content);
        } catch (error) {
            console.error('Content generation failed:', error);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Content Generator</h1>
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full p-2 border rounded mb-4"
                rows={4}
                placeholder="Enter your prompt here..."
            />
            <button
                onClick={handleGenerate}
                className="p-2 bg-blue-600 text-white rounded"
            >
                Generate
            </button>
            {generatedContent && (
                <div className="mt-4 p-4 bg-gray-100 rounded">
                    <h2 className="text-lg font-semibold">Generated Content</h2>
                    <p>{generatedContent}</p>
                </div>
            )}
        </div>
    );
};

export default GeneratorPage;