// frontend/pages/CramSheetsPage.tsx
// frontend/src/pages/CramSheetsPage.tsx
// Frontend implementation for Feature #10: High-Yield "Cram Sheets"
import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { generateCramSheet } from '@/services/aiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { Topic, Chapter } from '@pediaquiz/types';
import ReactMarkdown from 'react-markdown'; // For rendering the cram sheet content

const CramSheetsPage: React.FC = () => {
  const { user } = useAuth();
  const { appData, isLoadingData: isAppDataLoading, errorLoadingData: appDataError } = useData();
  const { addToast } = useToast();

  const [sheetTitle, setSheetTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [generatedCramSheetContent, setGeneratedCramSheetContent] = useState<string | null>(null);
  const [viewingCramSheet, setViewingCramSheet] = useState(false); // To toggle between generator and viewer

  const generalTopics = appData?.topics.filter((t: Topic) => t.source === 'General') || [];

  const generateCramSheetMutation = useMutation({
    mutationFn: (data: { chapterIds?: string[], topicIds?: string[], userId: string, content?: string, title: string }) => {
      if (!user?.uid) throw new Error("User not authenticated.");
      return generateCramSheet(data);
    },
    onSuccess: (response) => {
      addToast("Cram sheet generated successfully!", "success");
      setGeneratedCramSheetContent(response.data.cramSheetId); // The backend returns cramSheetId
      setViewingCramSheet(true); // Switch to viewing mode, content will be fetched on demand (simplified for now)
      setRawContent(''); // Clear input after generation
    },
    onError: (error: any) => {
      addToast(`Failed to generate cram sheet: ${error.message}`, "error");
    },
  });

  // For demonstration, fetch content of the generated cram sheet (assuming it's just ID for now)
  // In a real app, you would fetch the content of the cram sheet from its ID
  const fetchCramSheetContent = useMutation({
    mutationFn: async (cramSheetId: string) => {
        // Placeholder for fetching content based on ID.
        // In a real app, you'd have a callable or direct Firestore read for 'cramSheets' collection
        // For now, return a dummy markdown.
        return `## 🧠 Your AI-Generated Cram Sheet: ${sheetTitle} ✨\n\nThis is a placeholder for your detailed cram sheet content for the selected topics/chapters.\n\n- 🔑 Key Concept 1: Essential fact.\n- 💡 Key Concept 2: Important mnemonic.\n- 🚨 Clinical Pearl: High-yield tip.\n\n_Generated for you by PediaQuiz AI._\n\nID: ${cramSheetId}`;
    },
    onSuccess: (data) => {
        setGeneratedCramSheetContent(data); // Set the full markdown content
    },
    onError: (error: any) => addToast(`Failed to load cram sheet content: ${error.message}`, "error"),
  });


  useEffect(() => {
    if (viewingCramSheet && generatedCramSheetContent && generatedCramSheetContent.length < 100) { // If it's still just the ID, fetch content
      fetchCramSheetContent.mutate(generatedCramSheetContent);
    }
  }, [viewingCramSheet, generatedCramSheetContent, fetchCramSheetContent]);


  const handleTopicToggle = (topic: Topic) => {
    const chapterIdsInTopic = (topic.chapters as Chapter[]).map((c: Chapter) => c.id);
    const allSelected = chapterIdsInTopic.every(id => selectedChapters.has(id));

    setSelectedTopics(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        newSet.delete(topic.id);
      } else {
        newSet.add(topic.id);
      }
      return newSet;
    });

    setSelectedChapters(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        chapterIdsInTopic.forEach(id => newSet.delete(id));
      } else {
        chapterIdsInTopic.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleChapterToggle = (topicId: string, chapterId: string) => {
    setSelectedChapters(prev => {
      const newSet = new Set(prev);
      newSet.has(chapterId) ? newSet.delete(chapterId) : newSet.add(chapterId);

      // Update parent topic selection state based on its children
      const topic = generalTopics.find(t => t.id === topicId);
      if (topic) {
        const allChapterIds = (topic.chapters as Chapter[]).map(c => c.id);
        const allChildrenSelected = allChapterIds.every(cid => newSet.has(cid));
        const anyChildrenSelected = allChapterIds.some(cid => newSet.has(cid));

        setSelectedTopics(topicPrev => {
          const topicNewSet = new Set(topicPrev);
          if (allChildrenSelected) {
            topicNewSet.add(topicId);
          } else {
            topicNewSet.delete(topicId);
          }
          return topicNewSet;
        });
      }
      return newSet;
    });
  };

  const toggleTopicExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const newSet = new Set(prev);
      newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
      return newSet;
    });
  };

  const handleGenerateCramSheet = () => {
    if (!sheetTitle.trim()) {
      addToast("Please enter a title for your cram sheet.", "error");
      return;
    }
    if (!rawContent.trim() && selectedChapters.size === 0 && selectedTopics.size === 0) {
      addToast("Please provide some raw text OR select topics/chapters.", "error");
      return;
    }

    generateCramSheetMutation.mutate({
      userId: user!.uid,
      title: sheetTitle.trim(),
      content: rawContent.trim() || undefined,
      chapterIds: Array.from(selectedChapters).length > 0 ? Array.from(selectedChapters) : undefined,
      topicIds: Array.from(selectedTopics).length > 0 ? Array.from(selectedTopics) : undefined,
    });
  };

  if (isAppDataLoading) return <Loader message="Loading content for cram sheets..." />;
  if (appDataError) return <div className="text-center py-10 text-red-500">{appDataError.message}</div>;

  if (viewingCramSheet) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">{sheetTitle}</h1>
        <div className="card-base p-6 prose dark:prose-invert max-w-none">
          {fetchCramSheetContent.isPending ? <Loader message="Loading cram sheet..." /> : (
            <ReactMarkdown>{generatedCramSheetContent || 'No content available.'}</ReactMarkdown>
          )}
        </div>
        <div className="flex justify-end space-x-3">
          <button onClick={() => setViewingCramSheet(false)} className="btn-neutral">Generate New</button>
          <button onClick={() => addToast("Saving cram sheet to your library is coming soon!", "info")} className="btn-primary">Save to Library</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Generate Cram Sheet</h1>

      <div className="card-base p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">1. Cram Sheet Details</h2>
        <div>
          <label htmlFor="sheetTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cram Sheet Title</label>
          <input
            id="sheetTitle"
            type="text"
            value={sheetTitle}
            onChange={(e) => setSheetTitle(e.target.value)}
            placeholder="e.g., Pediatric Emergencies Quick Facts"
            className="input-field"
            disabled={generateCramSheetMutation.isPending}
          />
        </div>
        <button
          onClick={handleGenerateCramSheet}
          disabled={generateCramSheetMutation.isPending || !sheetTitle.trim() || (!rawContent.trim() && selectedChapters.size === 0 && selectedTopics.size === 0)}
          className="btn-primary w-full py-3"
        >
          {generateCramSheetMutation.isPending ? 'Generating...' : '✨ Generate Cram Sheet'}
        </button>
      </div>

      <div className="card-base p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">2. Provide Content Source</h2>
        <div>
          <label htmlFor="rawContent" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Paste Raw Text (Optional, overrides selections)</label>
          <textarea
            id="rawContent"
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            placeholder="Paste notes, key concepts, or summaries here. Max ~25,000 characters."
            className="input-field h-40 resize-y"
            disabled={generateCramSheetMutation.isPending}
          ></textarea>
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">OR</p>
        <div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-3">Select Topics/Chapters (Uses their existing notes)</h3>
          <div className="space-y-3">
            {generalTopics.length === 0 ? (
              <p className="text-center py-4 text-slate-500 dark:text-slate-400">No general topics available.</p>
            ) : (
              generalTopics.map((topic: Topic) => {
                const isTopicExpanded = expandedTopics.has(topic.id);
                const chaptersInTopic = topic.chapters as Chapter[];
                const allChaptersSelectedInTopic = chaptersInTopic.length > 0 && chaptersInTopic.every(c => selectedChapters.has(c.id));
                const someChaptersSelectedInTopic = chaptersInTopic.some(c => selectedChapters.has(c.id));

                return (
                  <div key={topic.id} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`topic-${topic.id}`}
                          checked={allChaptersSelectedInTopic}
                          ref={el => el && (el.indeterminate = someChaptersSelectedInTopic && !allChaptersSelectedInTopic)}
                          onChange={() => handleTopicToggle(topic)}
                          className="form-checkbox h-5 w-5 text-sky-600 rounded focus:ring-sky-500"
                          disabled={generateCramSheetMutation.isPending}
                        />
                        <label htmlFor={`topic-${topic.id}`} className="font-medium cursor-pointer select-none text-slate-800 dark:text-slate-200">{topic.name}</label>
                      </div>
                      <button onClick={() => toggleTopicExpand(topic.id)} className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                        <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-200`, isTopicExpanded ? 'rotate-180' : '')} />
                      </button>
                    </div>
                    {isTopicExpanded && (
                      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                        <ul className="space-y-2">
                          {chaptersInTopic.map((chapter: Chapter) => (
                            <li key={chapter.id}>
                              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={selectedChapters.has(chapter.id)}
                                  onChange={() => handleChapterToggle(topic.id, chapter.id)}
                                  className="form-checkbox h-5 w-5 text-sky-600 rounded focus:ring-sky-500"
                                  disabled={generateCramSheetMutation.isPending}
                                />
                                <span>{chapter.name} (Notes available)</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CramSheetsPage;