// frontend/pages/MockExamBuilder.tsx
// frontend/src/pages/MockExamBuilder.tsx
// Frontend implementation for Feature #8: True Mock Exam Mode
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getMockExamQuestions } from '@/services/aiService'; // Import the new callable
import { SessionManager } from '@/services/sessionService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { Topic, Chapter } from '@pediaquiz/types';

const MockExamBuilder: React.FC = () => {
  const { user } = useAuth();
  const { appData, isLoadingData: isAppDataLoading, errorLoadingData: appDataError } = useData();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [examTitle, setExamTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(100); // Default for a mock exam
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const generalTopics = useMemo(() => {
    return appData?.topics.filter((t: Topic) => t.source === 'General') || [];
  }, [appData]);

  const mockExamMutation = useMutation({
    mutationFn: (data: { topicIds?: string[], chapterIds?: string[], questionCount: number }) => {
      if (!user?.uid) throw new Error("User not authenticated.");
      return getMockExamQuestions({ userId: user.uid, ...data });
    },
    onSuccess: async (response) => {
      const mcqIds = response.data.mcqIds;
      if (mcqIds.length === 0) {
        addToast("No questions found for the selected criteria. Please try different options.", "info");
        return;
      }
      // Create a new mock session
      const sessionId = await SessionManager.createSession(user!.uid, 'mock', mcqIds);
      addToast(`Mock exam "${examTitle}" started with ${mcqIds.length} questions!`, "success");
      navigate(`/session/mock/${sessionId}`, { state: { generatedMcqIds: mcqIds } });
    },
    onError: (error: any) => {
      addToast(`Failed to build mock exam: ${error.message}`, "error");
    },
  });

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

  const handleBuildExam = () => {
    if (!examTitle.trim()) {
      addToast("Please enter an exam title.", "error");
      return;
    }
    if (questionCount <= 0) {
      addToast("Question count must be positive.", "error");
      return;
    }
    if (selectedTopics.size === 0 && selectedChapters.size === 0) {
      addToast("Please select at least one topic or chapter.", "error");
      return;
    }

    mockExamMutation.mutate({
      topicIds: Array.from(selectedTopics).length > 0 ? Array.from(selectedTopics) : undefined,
      chapterIds: Array.from(selectedChapters).length > 0 ? Array.from(selectedChapters) : undefined,
      questionCount: questionCount,
    });
  };

  if (isAppDataLoading) return <Loader message="Loading topics for mock exam..." />;
  if (appDataError) return <div className="text-center py-10 text-red-500">{appDataError.message}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Build a Mock Exam</h1>

      <div className="card-base p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">1. Exam Configuration</h2>
        <div>
          <label htmlFor="examTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Exam Title</label>
          <input
            id="examTitle"
            type="text"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="e.g., Pediatric Boards Simulation"
            className="input-field"
            disabled={mockExamMutation.isPending}
          />
        </div>
        <div>
          <label htmlFor="questionCount" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Number of Questions</label>
          <input
            id="questionCount"
            type="number"
            min={1}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="input-field"
            disabled={mockExamMutation.isPending}
          />
        </div>
        <button
          onClick={handleBuildExam}
          disabled={mockExamMutation.isPending || !examTitle.trim() || questionCount <= 0 || (selectedTopics.size === 0 && selectedChapters.size === 0)}
          className="btn-primary w-full py-3"
        >
          {mockExamMutation.isPending ? 'Building Exam...' : 'Build & Start Exam'}
        </button>
      </div>

      <div className="card-base p-6">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-4">2. Select Content Areas</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Select topics or specific chapters to include in your mock exam.</p>
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
                        disabled={mockExamMutation.isPending}
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
                                disabled={mockExamMutation.isPending}
                              />
                              <span>{chapter.name} ({chapter.mcqCount} MCQs)</span>
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
  );
};

export default MockExamBuilder;