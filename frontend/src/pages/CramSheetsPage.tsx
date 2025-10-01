    import React, { useState, useMemo } from 'react';
    import { useMutation } from '@tanstack/react-query';
    import { useAuth } from '@/contexts/AuthContext';
    import { useData } from '@/contexts/DataContext';
    import { generateCramSheet } from '@/services/aiService';
    import Loader from '@/components/Loader';
    import { useToast } from '@/components/Toast';
    import { Topic, Chapter } from '@pediaquiz/types';
    import ReactMarkdown from 'react-markdown';
    
    const CramSheetsPage: React.FC = () => {
        const { user } = useAuth();
        const { appData, isLoadingData } = useData();
        const { addToast } = useToast();
    
        const [sheetTitle, setSheetTitle] = useState('');
        const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
        const [generatedContent, setGeneratedContent] = useState<string | null>(null);
    
        const topics = useMemo(() => appData?.topics || [], [appData]);
    
        const generateMutation = useMutation({
            mutationFn: (data: { chapterIds: string[], title: string }) => generateCramSheet({ userId: user!.uid, ...data }),
            onSuccess: (response) => { 
                setGeneratedContent(response.data.content); 
                addToast("Cram sheet generated!", "success"); 
            },
            onError: (error: any) => addToast(`Failed to generate: ${error.message}`, "error"),
        });
    
        const handleGenerate = () => {
            if (!user) return addToast("You must be logged in.", "error");
            if (!sheetTitle.trim()) return addToast("Please enter a title.", "error");
            if (selectedChapters.size === 0) return addToast("Please select at least one chapter.", "error");
            generateMutation.mutate({ chapterIds: Array.from(selectedChapters), title: sheetTitle.trim() });
        };
    
        if (isLoadingData) return <Loader fullScreen message="Loading content..." />;
    
        if (generatedContent) {
            return (
                <div className="space-y-6 max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold">{sheetTitle}</h1>
                    <div className="card-base p-6 prose dark:prose-invert max-w-none"><ReactMarkdown>{generatedContent}</ReactMarkdown></div>
                    <button onClick={() => { setGeneratedContent(null); setSheetTitle(''); setSelectedChapters(new Set()); }} className="btn-neutral">Generate New Sheet</button>
                </div>
            );
        }
    
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
                <h1 className="text-3xl font-bold">Generate AI Cram Sheet</h1>
                <div className="card-base p-6 space-y-4">
                    <label>Title<input type="text" value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)} placeholder="e.g., Pediatric Cardiology Review" className="input-field mt-1" /></label>
                    <div>
                        <h3 className="font-semibold mb-2">Select Chapters</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto border p-2 rounded-md">
                            {topics.map((topic: Topic) => (
                                <div key={topic.id}>
                                    <h4 className="font-semibold mt-2 text-slate-600 dark:text-slate-400">{topic.name}</h4>
                                    {Array.isArray(topic.chapters) && topic.chapters.map((chapter: Chapter) => (
                                        <label key={chapter.id} className="flex items-center gap-2 p-1 cursor-pointer"><input type="checkbox" checked={selectedChapters.has(chapter.id)} onChange={() => setSelectedChapters(p => {const n = new Set(p); n.has(chapter.id)?n.delete(chapter.id):n.add(chapter.id); return n;})} className="form-checkbox h-4 w-4 rounded text-sky-600"/>{chapter.name}</label>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleGenerate} disabled={generateMutation.isPending} className="btn-primary w-full py-3">{generateMutation.isPending ? 'Generating...' : '✨ Generate Cram Sheet'}</button>
                </div>
            </div>
        );
    };
    export default CramSheetsPage;