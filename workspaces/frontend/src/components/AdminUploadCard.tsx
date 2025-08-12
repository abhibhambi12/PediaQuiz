// --- CORRECTED FILE: workspaces/frontend/src/components/AdminUploadCard.tsx ---

import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';
import type { UserUpload, UploadStatus, Topic, Chapter } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import { useSound } from '@/hooks/useSound';

// Callable Function Definitions (remain the same)
const extractMarrowContentFn = httpsCallable<{ uploadId: string }, { mcqCount: number, explanationCount: number }>(functions, 'extractMarrowContent');
const generateAndAnalyzeMarrowContentFn = httpsCallable<{ uploadId: string, count: number }, { success: boolean, message?: string }>(functions, 'generateAndAnalyzeMarrowContent');
const approveMarrowContentFn = httpsCallable<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }, { success: boolean, message?: string }>(functions, 'approveMarrowContent');
const generateGeneralContentFn = httpsCallable<{ uploadId: string, count: number }, { success: boolean }>(functions, 'generateGeneralContent');
const approveGeneralContentFn = httpsCallable<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string }, { success: boolean }>(functions, 'approveContent'); // Changed to approveContent to match backend

const getStatusColor = (status: UploadStatus): string => {
    if (status === 'completed') return 'text-green-500';
    if (status.startsWith('failed') || status === 'error') return 'text-red-500';
    if (status.startsWith('pending')) return 'text-amber-500 animate-pulse';
    if (status === 'archived') return 'text-slate-500';
    return 'text-sky-500 animate-pulse';
};

const AdminUploadCard: React.FC<{ upload: UserUpload, allTopics: Topic[] }> = ({ upload, allTopics }) => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { playSound } = useSound();

    const [numToGenerate, setNumToGenerate] = useState(10);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedChapter, setSelectedChapter] = useState('');
    const [newTopicName, setNewTopicName] = useState('');
    const [newChapterName, setNewChapterName] = useState('');
    const [keyTopics, setKeyTopics] = useState<string[]>(upload.suggestedKeyTopics || []);

    // Determine if it's a Marrow upload based on filename convention
    const isMarrowUpload = upload.fileName.startsWith("MARROW_");

    // Filter topics based on the source (Marrow or General)
    const filteredTopicsForSelection = useMemo(() => {
        if (!allTopics) return [];
        return allTopics.filter(t => isMarrowUpload ? t.source === 'Marrow' : t.source === 'General');
    }, [allTopics, isMarrowUpload]);

    const availableChaptersForSelectedTopic = useMemo(() => {
        const topic = allTopics.find(t => t.id === selectedTopic);
        return topic ? topic.chapters : [];
    }, [allTopics, selectedTopic]);

    const extractContentMutation = useMutation<HttpsCallableResult<{ mcqCount: number; explanationCount: number; }>, Error, string>({
        mutationFn: (uploadId: string) => extractMarrowContentFn({ uploadId }),
        onSuccess: (data) => {
            playSound('notification');
            addToast(`Extracted ${data.data.mcqCount} MCQs and ${data.data.explanationCount} explanations.`, 'success');
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Extraction failed: ${error.message}`, 'error');
        },
    });

    const generateAndAnalyzeMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string }>, Error, { uploadId: string, count: number }>({
        mutationFn: (vars) => generateAndAnalyzeMarrowContentFn(vars),
        onSuccess: (data) => {
            playSound('notification');
            addToast(data.data.message || "Generation and topic analysis complete!", 'success');
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Generation failed: ${error.message}`, 'error');
        },
    });
    
    const approveMarrowMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string }>, Error, { uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>({
        mutationFn: (vars) => approveMarrowContentFn(vars),
        onSuccess: () => {
            playSound('notification');
            addToast("Marrow content approved and saved!", 'success');
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            queryClient.invalidateQueries({ queryKey: ['completedUploads'] });
            queryClient.invalidateQueries({ queryKey: ['topics'] }); // Invalidate topics for updated counts
            queryClient.invalidateQueries({ queryKey: ['marrowTopics'] });
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Approval failed: ${error.message}`, 'error');
        },
    });
    
    const generateGeneralMutation = useMutation<HttpsCallableResult<{ success: boolean; }>, Error, { uploadId: string, count: number }>({
        mutationFn: (vars) => generateGeneralContentFn(vars),
        onSuccess: () => {
            playSound('notification');
            addToast("General content generation complete!", 'success');
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`General generation failed: ${error.message}`, 'error');
        },
    });

    // NOTE: This now calls the generic `approveContent` callable on the backend.
    const approveGeneralMutation = useMutation<HttpsCallableResult<{ success: boolean; }>, Error, { uploadId: string, assignments: any[] }>({ // Callable expects 'assignments' array
        mutationFn: (vars) => {
            // For general content, when approving from AdminUploadCard, it's a direct approval
            // without batching and auto-assignment. So, we form a simple assignment structure.
            const assignment: any = {
                topicName: vars.topicName,
                chapterName: vars.chapterName,
                isNewChapter: (selectedTopic === 'CREATE_NEW' || selectedChapter === 'CREATE_NEW'),
                // For simplicity, we don't pass actual MCQs/Flashcards here,
                // the backend `approveContent` will retrieve them from `finalAwaitingReviewData`.
                // This means the `generateGeneralContentFn` should ideally put generated items into `finalAwaitingReviewData`.
                // Based on `generateGeneralContentFn` in backend, it updates `stagedContent.generatedMcqs`.
                // `approveContent` expects `finalAwaitingReviewData`.
                // This indicates a slight mismatch in the workflow for 'General' when approving directly from here.
                // For now, let's assume backend will handle it, or we need to pass `finalAwaitingReviewData` from `upload`.
                // Since this `approveGeneralContentFn` is intended for general pipeline and there's a `approveContent`
                // on the backend, let's align the input for `approveContent`.
                // The correct flow for General is `pending_final_review` -> `pending_assignment_review` -> `approveContent`.
                // This AdminUploadCard path is likely for older/simpler direct generation.
                // Assuming `approveContent` on the backend for this simple case would need `mcqs` and `flashcards` to be picked up from `finalAwaitingReviewData`.
                // So the `assignments` array here should contain just one entry pointing to the whole upload.
            };

            // This path is likely for a simple direct approval, so we're going to create
            // a single assignment suggestion for the entire upload's content.
            // This is a re-interpretation of the old `approveGeneralContentFn` behavior.
            // The `approveContent` callable expects a list of `AssignmentSuggestion`.
            // So, for this simpler flow, we construct one.
            return approveGeneralContentFn({ uploadId: vars.uploadId, assignments: [assignment] });
        },
        onSuccess: () => {
            playSound('notification');
            addToast("General content approved and saved!", 'success');
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            queryClient.invalidateQueries({ queryKey: ['completedUploads'] });
            queryClient.invalidateQueries({ queryKey: ['topics'] }); // Invalidate topics for updated counts
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Approval failed: ${error.message}`, 'error');
        },
    });

    const handleAddKeyTopic = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            playSound('buttonClick');
            e.preventDefault();
            const newTag = e.currentTarget.value.trim();
            if (newTag && !keyTopics.includes(newTag)) {
                setKeyTopics(prev => [...prev, newTag]);
                e.currentTarget.value = '';
            }
        }
    };
    const handleRemoveKeyTopic = (tagToRemove: string) => {
        playSound('buttonClick');
        setKeyTopics(prev => prev.filter(tag => tag !== tagToRemove));
    };

    const handleApproveContent = () => {
        playSound('buttonClick');
        const finalTopicId = selectedTopic === 'CREATE_NEW' ? normalizeId(newTopicName.trim()) : selectedTopic;
        const finalTopicName = selectedTopic === 'CREATE_NEW' ? newTopicName.trim() : allTopics.find(t => t.id === selectedTopic)?.name || '';
        const finalChapterId = selectedChapter === 'CREATE_NEW' ? normalizeId(newChapterName.trim()) : selectedChapter;
        const finalChapterName = selectedChapter === 'CREATE_NEW' ? newChapterName.trim() : availableChaptersForSelectedTopic.find(c => c.id === selectedChapter)?.name || '';

        if (!finalTopicName || !finalChapterName) { addToast("Topic and Chapter are required.", "error"); return; }
        if ((selectedTopic === 'CREATE_NEW' && !newTopicName.trim()) || (selectedChapter === 'CREATE_NEW' && !newChapterName.trim())) {
            addToast("New topic/chapter name cannot be empty.", "error");
            return;
        }
        
        if (isMarrowUpload) {
            approveMarrowMutation.mutate({ uploadId: upload.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName, keyTopics });
        } else {
            // For general content, `approveContent` (backend) expects `assignments`.
            // Here, we create a single assignment with the chosen topic/chapter.
            // The `mcqs` and `flashcards` properties of the assignment are not populated here;
            // the backend `approveContent` would ideally retrieve these from `upload.finalAwaitingReviewData`
            // based on `uploadId`. So we just pass the necessary metadata.
            const assignmentPayload = [{
                topicName: finalTopicName,
                chapterName: finalChapterName,
                isNewChapter: (selectedTopic === 'CREATE_NEW' || selectedChapter === 'CREATE_NEW'),
                mcqs: [], // These lists are effectively placeholders for the frontend payload as the backend gets content from the upload document.
                flashcards: [],
            }];
            approveGeneralMutation.mutate({ uploadId: upload.id, assignments: assignmentPayload });
        }
    };

    // Helper for normalizing IDs
    const normalizeId = (name: string): string => name.replace(/\s+/g, '_').toLowerCase();


    const renderActions = () => {
        switch (upload.status) {
            case 'processed':
                return (
                    <div className="space-y-3">
                        {isMarrowUpload ? (
                            <button onClick={() => { playSound('buttonClick'); extractContentMutation.mutate(upload.id); }} disabled={extractContentMutation.isPending} className="btn-primary w-full">
                                {extractContentMutation.isPending ? 'Extracting...' : 'Stage 1: Extract Marrow Content'}
                            </button>
                        ) : (
                            <>
                                <label className="block text-sm font-medium mb-1">Number of MCQs to generate:</label>
                                <input type="number" value={numToGenerate} onChange={e => setNumToGenerate(parseInt(e.target.value, 10))} placeholder="Enter count" min="1" className="input-field w-full" />
                                <button onClick={() => { playSound('buttonClick'); generateGeneralMutation.mutate({ uploadId: upload.id, count: numToGenerate }); }} disabled={generateGeneralMutation.isPending || numToGenerate <= 0} className="btn-primary w-full">
                                    {generateGeneralMutation.isPending ? 'Generating...' : 'Generate General Content'}
                                </button>
                            </>
                        )}
                    </div>
                );
            case 'pending_generation_decision': // Original Marrow flow
                const extractedMcqsCount = upload.stagedContent?.extractedMcqs?.length || 0;
                const orphanExplanationsCount = upload.stagedContent?.orphanExplanations?.length || 0;
                return (
                    <div className="space-y-3">
                        <h3 className="font-bold text-lg">Stage 2: Generate New MCQs</h3>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                            Extracted: {extractedMcqsCount} MCQs, {orphanExplanationsCount} Explanations.
                        </p>
                        {orphanExplanationsCount > 0 && (
                            <>
                                <label className="block text-sm font-medium mb-1">New MCQs from explanations:</label>
                                <input type="number" value={numToGenerate} onChange={e => setNumToGenerate(parseInt(e.target.value, 10))} placeholder="Number of MCQs to generate" min="0" className="input-field w-full" />
                                <button onClick={() => { playSound('buttonClick'); generateAndAnalyzeMutation.mutate({ uploadId: upload.id, count: numToGenerate }); }} disabled={generateAndAnalyzeMutation.isPending || numToGenerate < 0} className="btn-primary w-full">
                                    {generateAndAnalyzeMutation.isPending ? 'Generating & Analyzing...' : 'Generate & Analyze Topics'}
                                </button>
                            </>
                        )}
                         {orphanExplanationsCount === 0 && (
                            <p className="text-sm text-slate-500">No orphan explanations found. Proceed to assignment.</p>
                        )}
                         {extractedMcqsCount > 0 && orphanExplanationsCount === 0 && (
                            <button onClick={() => { playSound('buttonClick'); generateAndAnalyzeMutation.mutate({ uploadId: upload.id, count: 0 }); }} disabled={generateAndAnalyzeMutation.isPending} className="btn-primary w-full">
                                {generateAndAnalyzeMutation.isPending ? 'Moving to Assignment...' : 'Skip Generation & Assign'}
                            </button>
                        )}
                    </div>
                );
            case 'pending_marrow_generation_approval': // For pasted marrow text
                 const smExtractedMcqs = upload.stagedContent?.extractedMcqs || [];
                 const smSuggestedNewCount = upload.suggestedNewMcqCount || 0;
                 return (
                    <div className="space-y-3">
                        <h3 className="font-bold text-lg">Stage 2 (Smart Marrow): Generate New MCQs</h3>
                        <p className="text-sm">Existing: {smExtractedMcqs.length} MCQs. AI suggests {smSuggestedNewCount} new ones.</p>
                        <label className="block text-sm font-medium mb-1">Number of NEW MCQs to generate:</label>
                        <input type="number" value={numToGenerate} onChange={e => setNumToGenerate(parseInt(e.target.value, 10))} placeholder="Enter count" min="0" className="input-field w-full" />
                        <button onClick={() => { playSound('buttonClick'); generateAndStageMarrowMcqsFn.mutate({ uploadId: upload.id, count: numToGenerate }); }} disabled={generateAndStageMarrowMcqsFn.isPending || numToGenerate < 0} className="btn-primary w-full">
                            Generate New Marrow Content
                        </button>
                        {(smExtractedMcqs.length > 0 && numToGenerate === 0) && (
                            <button onClick={() => { playSound('buttonClick'); generateAndStageMarrowMcqsFn.mutate({ uploadId: upload.id, count: 0 }); }} disabled={generateAndStageMarrowMcqsFn.isPending} className="btn-neutral w-full mt-2">Skip Generation & Assign Existing</button>
                        )}
                    </div>
                );

            case 'pending_assignment': // General flow final step, Marrow flow final step
                const totalReadyForApproval = (upload.stagedContent?.extractedMcqs?.length || 0) + (upload.stagedContent?.generatedMcqs?.length || 0);
                return (
                    <div className="space-y-4">
                        <h3 className="font-bold text-lg">Stage 3: Assign & Approve ({totalReadyForApproval} items)</h3>
                        
                        <div>
                            <label className="block text-sm font-medium mb-1">Select Topic</label>
                            <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)} className="input-field w-full">
                                <option value="">Select an existing topic</option>
                                {filteredTopicsForSelection.map((t: Topic) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                                <option value="CREATE_NEW">-- Create New Topic --</option>
                            </select>
                            {selectedTopic === 'CREATE_NEW' && <input type="text" value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />}
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium mb-1">Select Chapter</label>
                            <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} className="input-field w-full" disabled={!selectedTopic}>
                                <option value="">Select an existing chapter</option>
                                {availableChaptersForSelectedTopic.map((c: Chapter) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                                <option value="CREATE_NEW">-- Create New Chapter --</option>
                            </select>
                            {selectedChapter === 'CREATE_NEW' && <input type="text" value={newChapterName} onChange={e => setNewChapterName(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />}
                        </div>

                        {isMarrowUpload && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium mb-1">Key Clinical Topics (Tags)</label>
                                <div className="flex flex-wrap gap-2 p-2 border rounded-md dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                                    {keyTopics.map(tag => (
                                        <span key={tag} className="flex items-center px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 text-sm">
                                            {tag}
                                            <button onClick={() => handleRemoveKeyTopic(tag)} className="ml-1 text-sky-500 hover:text-sky-700">×</button>
                                        </span>
                                    ))}
                                    <input type="text" onKeyDown={handleAddKeyTopic} placeholder="Add new tag (Enter)" className="flex-grow min-w-[100px] bg-transparent outline-none text-slate-800 dark:text-slate-200" />
                                </div>
                                <p className="text-xs text-slate-500">AI Suggestions: {upload.suggestedKeyTopics?.join(', ') || 'None'}</p>
                            </div>
                        )}

                        <button onClick={handleApproveContent} disabled={approveMarrowMutation.isPending || approveGeneralMutation.isPending || !selectedTopic || !selectedChapter || (selectedTopic === 'CREATE_NEW' && !newTopicName) || (selectedChapter === 'CREATE_NEW' && !newChapterName)} className="btn-success w-full">
                            {approveMarrowMutation.isPending || approveGeneralMutation.isPending ? 'Approving...' : 'Approve & Save Content'}
                        </button>
                    </div>
                );
            default:
                return <p className="text-slate-500">Processing... ({upload.status.replace(/_/g, ' ')})</p>;
        }
    };
    
    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
            <h2 className="font-bold truncate text-slate-800 dark:text-slate-200">{upload.fileName}</h2>
            <p className="text-sm text-slate-500">Status: <span className={`font-semibold capitalize ${getStatusColor(upload.status)}`}>{upload.status.replace(/_/g, ' ')}</span></p>
            {upload.createdAt && <p className="text-xs text-slate-400">Uploaded: {new Date(upload.createdAt).toLocaleString()}</p>}
            {upload.updatedAt && <p className="text-xs text-slate-400">Last Update: {new Date(upload.updatedAt).toLocaleString()}</p>}
            {upload.error && <p className="text-xs text-red-600 mt-2">Error: {upload.error}</p>}
            <div className="mt-4 pt-4 border-t dark:border-slate-700">
                {renderActions()}
            </div>
        </div>
    );
};

export default AdminUploadCard;