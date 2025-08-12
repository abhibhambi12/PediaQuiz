// FILE: frontend/src/pages/CustomTestBuilder.tsx

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext'; // IMPORTANT: Using useData
import { ChevronDownIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import type { Chapter, Topic, MCQ } from '@pediaquiz/types'; // FIXED: Ensure types are imported
import clsx from 'clsx'; // For conditional styling

const CustomTestBuilder: React.FC = () => {
  const { data: appData, isLoading, error } = useData(); // IMPORTANT: Using useData
  const navigate = useNavigate();

  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [totalQuestions, setTotalQuestions] = useState<number>(20);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const topics = appData?.topics || [];
  const allMcqs = appData?.mcqs || [];

  const selectedMcqCount = useMemo(() => {
    return allMcqs.filter((mcq: MCQ) => selectedChapters.has(mcq.chapterId)).length; // Explicitly typed mcq
  }, [selectedChapters, allMcqs]);

  const handleChapterToggle = (chapterId: string) => {
    setSelectedChapters(prev => {
      const newSet = new Set(prev);
      newSet.has(chapterId) ? newSet.delete(chapterId) : newSet.add(chapterId);
      return newSet;
    });
  };

  const handleTopicToggle = (chaptersInTopic: Chapter[]) => {
    const chapterIds = chaptersInTopic.map((c: Chapter) => c.id); // FIXED: Explicitly typed c
    const allSelected = chaptersInTopic.length > 0 && chapterIds.every(id => selectedChapters.has(id));
    
    setSelectedChapters(prev => {
        const newSet = new Set(prev);
        if (allSelected) {
            chapterIds.forEach(id => newSet.delete(id));
        } else {
            chapterIds.forEach(id => newSet.add(id));
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

  const handleStartTest = () => {
    const chapterIds = Array.from(selectedChapters);
    if (chapterIds.length === 0) {
        alert("Please select at least one chapter.");
        return;
    }
    const availableQuestions = allMcqs.filter((mcq: MCQ) => chapterIds.includes(mcq.chapterId)); // Explicitly typed mcq
    if (availableQuestions.length < totalQuestions) {
        alert(`You requested ${totalQuestions} questions, but only ${availableQuestions.length} are available. Please reduce the question count or select more chapters.`);
        return;
    }
    
    // Pass the necessary data to the MCQSessionPage via location state
    navigate(`/session/custom/exam_${Date.now()}`, { 
      state: {
        selectedChapterIds: chapterIds,
        questionCount: totalQuestions
      }
    });
  };

  if (isLoading) return <Loader message="Loading exam builder..." />;
  if (error) return <div className="text-center py-10 text-red-500">{error.message}</div>;

  const isStartButtonDisabled = selectedChapters.size === 0 || totalQuestions <= 0 || selectedMcqCount < totalQuestions;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Custom Test Builder</h1>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold">1. Configure Test</h2>
        <div>
          <label htmlFor="numQuestions" className="block text-sm font-medium mb-1">
            Number of Questions (Available: {selectedMcqCount})
          </label>
          <input
            type="number"
            id="numQuestions"
            min={1}
            max={selectedMcqCount > 0 ? selectedMcqCount : 1}
            value={totalQuestions}
            onChange={(e) => setTotalQuestions(Math.max(1, Math.min(selectedMcqCount, parseInt(e.target.value, 10) || 0)))} // Added parseInt base
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            disabled={selectedMcqCount === 0}
          />
        </div>
        <button
          onClick={handleStartTest}
          disabled={isStartButtonDisabled}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Custom Test
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <h2 className="text-xl font-bold mb-4">2. Select Content</h2>
        <div className="space-y-3">
          {topics.map((topic: Topic) => { // Explicitly typed topic
            const isTopicExpanded = expandedTopics.has(topic.id);
            const chaptersInTopic = topic.chapters;
            const allInTopicSelected = chaptersInTopic.length > 0 && chaptersInTopic.every((c: Chapter) => selectedChapters.has(c.id)); // Explicitly typed c
            const selectedInTopicCount = chaptersInTopic.filter((c: Chapter) => selectedChapters.has(c.id)).length; // Explicitly typed c
            const isIndeterminate = selectedInTopicCount > 0 && selectedInTopicCount < chaptersInTopic.length;

            return (
              <div key={topic.id} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`topic-${topic.id}`}
                      checked={allInTopicSelected}
                      ref={el => el && (el.indeterminate = isIndeterminate)} // Indeterminate state for checkboxes
                      onChange={() => handleTopicToggle(chaptersInTopic)}
                      className="form-checkbox h-5 w-5 text-sky-600 rounded focus:ring-sky-500"
                    />
                    <label htmlFor={`topic-${topic.id}`} className="font-medium cursor-pointer select-none">{topic.name}</label>
                  </div>
                  <button onClick={() => toggleTopicExpand(topic.id)} className="p-1">
                    <ChevronDownIcon className={clsx(`transition-transform duration-200`, isTopicExpanded ? 'rotate-180' : '')} />
                  </button>
                </div>
                {isTopicExpanded && (
                  <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                    <ul className="space-y-2">
                      {chaptersInTopic.map((chapter: Chapter) => ( // Explicitly typed chapter
                        <li key={chapter.id}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedChapters.has(chapter.id)}
                              onChange={() => handleChapterToggle(chapter.id)}
                              className="form-checkbox h-5 w-5 text-sky-600 rounded focus:ring-sky-500"
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
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomTestBuilder;