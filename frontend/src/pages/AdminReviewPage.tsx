// frontend/src/pages/AdminReviewPage.tsx

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, functions } from '@/firebase';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import type { UserUpload, UploadStatus, Topic, Chapter, AssignmentSuggestion } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useData } from '@/contexts/DataContext';

// Helper to normalize topic/chapter IDs - needed for local filtering
const normalizeId = (name: string): string => {
    if (typeof name !== 'string') return 'unknown';
    return name.replace(/\s+/g, '_').toLowerCase();
};

// Marrow Pipeline Callable Functions (Current Frontend Expected)
const extractMarrowContentFn = httpsCallable<{ uploadId: string }, { mcqCount: number, explanationCount: number }>(functions, 'extractMarrowContent');
const generateAndAnalyzeMarrowContentFn = httpsCallable<{ uploadId: string, count: number }, { success: boolean, message?: string }>(functions, 'generateAndAnalyzeMarrowContent');
const approveMarrowContentFn = httpsCallable<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }, { success: boolean, message?: string }>(functions, 'approveMarrowContent');

// General Pipeline Callable Functions (Advanced Batch Processing)
const suggestClassificationFn = httpsCallable< { uploadId: string }, { success: boolean, suggestedTopic?: string, suggestedChapter?: string } >(functions, 'suggestClassification');
const prepareBatchGenerationFn = httpsCallable< { uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }, { success: boolean, totalBatches: number } >(functions, 'prepareBatchGeneration');
const startAutomatedBatchGenerationFn = httpsCallable<{ uploadId: string }, { success: boolean }>(functions, 'startAutomatedBatchGeneration');
const approveContentFn = httpsCallable<{ uploadId: string, assignments: AssignmentSuggestion[] }, { success: boolean }>(functions, 'approveContent');
const autoAssignContentFn = httpsCallable<{ uploadId: string, existingTopics: Topic[], scopeToTopicName?: string }, { success: boolean, suggestions: AssignmentSuggestion[] }>(functions, 'autoAssignContent');


const getStatusColor = (status: UploadStatus): string => {
    if (status === 'completed') return 'text-green-500';
    if (status.startsWith('failed') || status === 'error') return 'text-red-500';
    if (status.startsWith('pending')) return 'text-amber-500 animate-pulse';
    if (status === 'archived') return 'text-slate-500';
    return 'text-sky-500 animate-pulse';
};

const UploadCard: React.FC<{ upload: UserUpload, allTopics: Topic[] }> = ({ upload, allTopics }) => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // For final approval steps

    // Marrow Pipeline specific state
    const [marrowNumToGenerate, setMarrowNumToGenerate] = useState(10);
    const [marrowSelectedTopic, setMarrowSelectedTopic] = useState('');
    const [marrowSelectedChapter, setMarrowSelectedChapter] = useState('');
    const [marrowNewTopicName, setMarrowNewTopicName] = useState('');
    const [marrowNewChapterName, setMarrowNewChapterName] = useState('');
    const [marrowKeyTopics, setMarrowKeyTopics] = useState<string[]>(upload.suggestedKeyTopics || []);

    // General Pipeline specific state
    const [generalMcqCount, setGeneralMcqCount] = useState(upload.estimatedMcqCount || 10);
    const [generalFlashcardCount, setGeneralFlashcardCount] = useState(upload.estimatedFlashcardCount || 10);
    const [generalBatchSize, setGeneralBatchSize] = useState(50); // Default batch size
    const [generalApprovedTopic, setGeneralApprovedTopic] = useState(upload.suggestedTopic || ''); // For manual approval in General
    const [generalApprovedChapter, setGeneralApprovedChapter] = useState(upload.suggestedChapter || ''); // For manual approval in General
    const [generalAssignmentSuggestions, setGeneralAssignmentSuggestions] = useState<AssignmentSuggestion[]>(upload.assignmentSuggestions || []);

    // Populate general pipeline initial state from upload data when component mounts or upload changes
    React.useEffect(() => {
        setGeneralMcqCount(upload.estimatedMcqCount || 10);
        setGeneralFlashcardCount(upload.estimatedFlashcardCount || 10);
        setGeneralApprovedTopic(upload.suggestedTopic || '');
        setGeneralApprovedChapter(upload.suggestedChapter || '');
        setGeneralAssignmentSuggestions(upload.assignmentSuggestions || []);
    }, [upload]);


    const isMarrowUpload = upload.fileName.startsWith("MARROW_");

    // Memoized lists for dropdowns based on pipeline type
    const filteredTopicsForSelection = useMemo(() => {
        return allTopics.filter(t => isMarrowUpload ? t.source === 'Marrow' : t.source === 'General');
    }, [allTopics, isMarrowUpload]);

    const availableChaptersForMarrowTopic = useMemo(() => {
        const topic = allTopics.find(t => t.id === marrowSelectedTopic);
        return topic ? topic.chapters : [];
    }, [allTopics, marrowSelectedTopic]);

    const availableChaptersForGeneralTopic = useMemo(() => {
        // Find by normalized name, which is often used as ID
        const topic = allTopics.find(t => t.id === normalizeId(generalApprovedTopic) || t.name === generalApprovedTopic);
        return topic ? topic.chapters : [];
    }, [allTopics, generalApprovedTopic]);


    // Marrow Pipeline Mutations (triggered by Marrow UI)
    const extractMarrowMutation = useMutation({
        mutationFn: (uploadId: string) => extractMarrowContentFn({ uploadId }),
        onSuccess: (data) => { addToast(`Extracted ${data.data.mcqCount} MCQs and ${data.data.explanationCount} explanations.`, 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error: Error) => addToast(`Marrow extraction failed: ${error.message}`, 'error'),
    });

    const generateAndAnalyzeMarrowMutation = useMutation({
        mutationFn: (vars: { uploadId: string, count: number }) => generateAndAnalyzeMarrowContentFn(vars),
        onSuccess: (data) => { addToast(data.data.message || "Marrow generation and analysis complete!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error: Error) => addToast(`Marrow generation failed: ${error.message}`, 'error'),
    });

    const approveMarrowMutation = useMutation({
        mutationFn: (vars: { uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }) => approveMarrowContentFn(vars),
        onSuccess: (data) => { addToast(data.data.message || "Marrow content approved!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); queryClient.invalidateQueries({ queryKey: ['appData'] }); },
        onError: (error: Error) => addToast(`Marrow approval failed: ${error.message}`, 'error'),
    });

    // General Pipeline Mutations (triggered by General UI)
    const suggestClassificationMutation = useMutation({
        mutationFn: (uploadId: string) => suggestClassificationFn({ uploadId }),
        onSuccess: (data) => { 
            addToast("Classification suggested successfully!", "success"); 
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            // Update local state based on AI suggestion
            if (data.data.suggestedTopic) setGeneralApprovedTopic(data.data.suggestedTopic);
            if (data.data.suggestedChapter) setGeneralApprovedChapter(data.data.suggestedChapter);
        },
        onError: (error: Error) => addToast(`Classification failed: ${error.message}`, 'error'),
    });

    const prepareBatchGenerationMutation = useMutation({
        mutationFn: (vars: { uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }) => prepareBatchGenerationFn(vars),
        onSuccess: () => { addToast("Batch generation prepared. Ready to start.", "info"); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error: Error) => addToast(`Preparation failed: ${error.message}`, 'error'),
    });

    const startAutomatedBatchGenerationMutation = useMutation({
        mutationFn: (uploadId: string) => startAutomatedBatchGenerationFn({ uploadId }),
        onSuccess: () => { addToast("Automated batch generation started!", "success"); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error: Error) => addToast(`Generation start failed: ${error.message}`, 'error'),
    });

    const autoAssignContentMutation = useMutation({
        mutationFn: (vars: { uploadId: string, existingTopics: Topic[], scopeToTopicName?: string }) => autoAssignContentFn(vars),
        onSuccess: (data) => {
            addToast("AI auto-assignment complete!", "success");
            if (data.data.suggestions) setGeneralAssignmentSuggestions(data.data.suggestions);
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        },
        onError: (error: Error) => addToast(`Auto-assignment failed: ${error.message}`, 'error'),
    });

    const approveContentMutation = useMutation({
        mutationFn: (vars: { uploadId: string, assignments: AssignmentSuggestion[] }) => approveContentFn(vars),
        onSuccess: (data) => { addToast(data.data.message || "Content approved successfully!", "success"); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); queryClient.invalidateQueries({ queryKey: ['appData'] }); },
        onError: (error: Error) => addToast(`General content approval failed: ${error.message}`, 'error'),
    });


    // Marrow Pipeline Handlers
    const handleAddMarrowKeyTopic = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); const newTag = e.currentTarget.value.trim(); if (newTag && !marrowKeyTopics.includes(newTag)) setMarrowKeyTopics(prev => [...prev, newTag]); e.currentTarget.value = ''; }
    };
    const handleRemoveMarrowKeyTopic = (tagToRemove: string) => setMarrowKeyTopics(prev => prev.filter(tag => tag !== tagToRemove));

    const handleApproveMarrowContent = () => {
        const finalTopicId = marrowSelectedTopic === 'CREATE_NEW' ? normalizeId(marrowNewTopicName.trim()) : marrowSelectedTopic;
        const finalTopicName = marrowSelectedTopic === 'CREATE_NEW' ? marrowNewTopicName.trim() : allTopics.find(t => t.id === marrowSelectedTopic)?.name || '';
        const finalChapterId = marrowSelectedChapter === 'CREATE_NEW' ? normalizeId(marrowNewChapterName.trim()) : marrowSelectedChapter;
        const finalChapterName = marrowSelectedChapter === 'CREATE_NEW' ? marrowNewChapterName.trim() : allTopics.find(t => t.id === marrowSelectedTopic)?.chapters.find(c => c.id === marrowSelectedChapter)?.name || '';
        if (!finalTopicName || !finalChapterName) { addToast("Topic and Chapter are required.", "error"); return; }
        approveMarrowMutation.mutate({ uploadId: upload.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName, keyTopics: marrowKeyTopics });
    };

    // General Pipeline Handlers
    const handleApproveGeneralManually = () => {
        const finalTopic = generalApprovedTopic;
        const finalChapter = generalApprovedChapter;
        if (!upload.finalAwaitingReviewData || !finalTopic || !finalChapter) { addToast("Topic and Chapter are required for manual save.", "error"); return; }
        const manualAssignment: AssignmentSuggestion[] = [{
            topicName: finalTopic, chapterName: finalChapter, isNewChapter: !allTopics.some(t => t.id === normalizeId(finalTopic) && t.chapters.some(c => c.id === normalizeId(finalChapter))),
            mcqs: upload.finalAwaitingReviewData.mcqs, flashcards: upload.finalAwaitingReviewData.flashcards,
        }];
        approveContentMutation.mutate({ uploadId: upload.id, assignments: manualAssignment });
    };

    const handleAutoAssignGeneralContent = (scopeToTopicName?: string) => {
        autoAssignContentMutation.mutate({ uploadId: upload.id, existingTopics: allTopics, scopeToTopicName });
    };

    const handleAssignmentChapterChange = (index: number, newChapterName: string) => {
        setGeneralAssignmentSuggestions(currentSuggestions => {
            const newSuggestions = [...currentSuggestions];
            newSuggestions[index].chapterName = newChapterName;
            newSuggestions[index].isNewChapter = !allTopics.some(t => t.id === normalizeId(newSuggestions[index].topicName) && t.chapters.some(c => c.id === normalizeId(newChapterName)));
            return newSuggestions;
        });
    };

    const handleFinalApproveAssignments = () => {
        if (generalAssignmentSuggestions.length === 0) { addToast("No assignments to approve.", "error"); return; }
        approveContentMutation.mutate({ uploadId: upload.id, assignments: generalAssignmentSuggestions });
    };

    // Helper for validation logic in UI
    const isMarrowTopicSelectedOrNew = marrowSelectedTopic.trim() !== '';
    const isMarrowChapterSelectedOrNew = marrowSelectedChapter.trim() !== '';
    const isMarrowNewTopicNameValid = marrowSelectedTopic !== 'CREATE_NEW' || marrowNewTopicName.trim() !== '';
    const isMarrowNewChapterNameValid = marrowSelectedChapter !== 'CREATE_NEW' || marrowNewChapterName.trim() !== '';

    const isGeneralTopicSelected = generalApprovedTopic.trim() !== '';
    const isGeneralChapterSelected = generalApprovedChapter.trim() !== '';


    const renderActions = () => {
        if (isProcessing || isSaving) return <Loader message="Processing request..." />;

        if (isMarrowUpload) {
            switch (upload.status) {
                case 'processed':
                    return ( <button onClick={() => extractMarrowMutation.mutate(upload.id)} disabled={extractMarrowMutation.isPending} className="btn-primary w-full">Stage 1: Extract Marrow Content</button> );
                case 'pending_generation_decision':
                    const extractedMarrowMcqsCount = upload.stagedContent?.extractedMcqs?.length || 0;
                    const orphanMarrowExplanationsCount = upload.stagedContent?.orphanExplanations?.length || 0;
                    return (
                        <div className="space-y-3">
                            <h3 className="font-bold text-lg">Stage 2: Generate New MCQs</h3>
                            <p className="text-sm text-slate-700 dark:text-slate-300">Extracted: {extractedMarrowMcqsCount} MCQs, {orphanMarrowExplanationsCount} Explanations.</p>
                            {orphanMarrowExplanationsCount > 0 && (
                                <>
                                    <label className="block text-sm font-medium mb-1">New MCQs from explanations:</label>
                                    <input type="number" value={marrowNumToGenerate} onChange={e => setMarrowNumToGenerate(parseInt(e.target.value, 10))} placeholder="Number of MCQs to generate" min="0" className="input-field w-full" />
                                    <button onClick={() => generateMarrowMutation.mutate({ uploadId: upload.id, count: marrowNumToGenerate })} disabled={generateMarrowMutation.isPending || marrowNumToGenerate < 0} className="btn-primary w-full">Generate & Analyze Topics</button>
                                </>
                            )}
                            {(orphanMarrowExplanationsCount === 0 || marrowNumToGenerate === 0) && (extractedMarrowMcqsCount > 0) && (
                                <button onClick={() => generateMarrowMutation.mutate({ uploadId: upload.id, count: 0 })} disabled={generateMarrowMutation.isPending} className="btn-primary w-full">Skip Generation & Assign</button>
                            )}
                            {extractedMarrowMcqsCount === 0 && orphanMarrowExplanationsCount === 0 && (
                                <p className="text-sm text-slate-500">No content found after extraction. Check original document or reset.</p>
                            )}
                        </div>
                    );
                case 'pending_assignment':
                    const totalMarrowContentReady = (upload.stagedContent?.extractedMcqs?.length || 0) + (upload.stagedContent?.generatedMcqs?.length || 0);
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Stage 3: Assign & Approve ({totalMarrowContentReady} items)</h3>
                            <div> <label className="block text-sm font-medium mb-1">Select Topic</label> <select value={marrowSelectedTopic} onChange={e => setMarrowSelectedTopic(e.target.value)} className="input-field w-full"> <option value="">Select existing...</option> {filteredTopicsForSelection.map(t => <option key={t.id} value={t.id}>{t.name}</option>)} <option value="CREATE_NEW">-- Create New --</option> </select> {marrowSelectedTopic === 'CREATE_NEW' && <input type="text" value={marrowNewTopicName} onChange={e => setMarrowNewTopicName(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />} </div>
                            <div> <label className="block text-sm font-medium mb-1">Select Chapter</label> <select value={marrowSelectedChapter} onChange={e => setMarrowSelectedChapter(e.target.value)} className="input-field w-full" disabled={!isMarrowTopicSelectedOrNew}> <option value="">Select existing...</option> {availableChaptersForMarrowTopic.map(c => <option key={c.id} value={c.id}>{c.name}</option>)} <option value="CREATE_NEW">-- Create New --</option> </select> {marrowSelectedChapter === 'CREATE_NEW' && <input type="text" value={marrowNewChapterName} onChange={e => setMarrowNewChapterName(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />} </div>
                            <div className="space-y-2"> <label className="block text-sm font-medium mb-1">Key Clinical Topics (Tags)</label> <div className="flex flex-wrap gap-2 p-2 border rounded-md dark:border-slate-600 bg-slate-50 dark:bg-slate-700"> {marrowKeyTopics.map(tag => (<span key={tag} className="flex items-center px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 text-sm">{tag}<button onClick={() => handleRemoveMarrowKeyTopic(tag)} className="ml-1 text-sky-500 hover:text-sky-700">×</button></span>))} <input type="text" onKeyDown={handleAddMarrowKeyTopic} placeholder="Add new tag (Enter)" className="flex-grow min-w-[100px] bg-transparent outline-none text-slate-800 dark:text-slate-200" /> </div> <p className="text-xs text-slate-500">AI Suggestions: {upload.suggestedKeyTopics?.join(', ') || 'None'}</p> </div>
                            <button onClick={handleApproveMarrowContent} disabled={!isMarrowTopicSelectedOrNew || !isMarrowChapterSelectedOrNew || !isMarrowNewTopicNameValid || !isMarrowNewChapterNameValid} className="btn-success w-full">Approve & Save Content</button>
                        </div>
                    );
                default: return <p className="text-slate-500">Status: {upload.status.replace(/_/g, ' ')}</p>;
            }
        } else { // General Pipeline
            switch (upload.status) {
                case 'processed':
                    return (
                        <button onClick={() => suggestClassificationMutation.mutate(upload.id)} disabled={suggestClassificationMutation.isPending} className="btn-primary w-full">Step 1: Suggest Classification</button>
                    );
                case 'pending_classification':
                    return <Loader message="AI is classifying..." />;
                case 'pending_approval':
                    const currentTopicChapters = allTopics.find(t => normalizeId(t.name) === normalizeId(generalApprovedTopic))?.chapters || [];
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold">Step 2: Approve Plan</h3>
                            <div><label className="block text-sm font-medium">Topic</label>
                                <p className="text-sm text-slate-500">AI Suggestion: {upload.suggestedTopic || 'N/A'}</p>
                                <select value={generalApprovedTopic} onChange={e => setGeneralApprovedTopic(e.target.value)} className="input-field w-full">
                                    <option value="">Select Topic...</option>
                                    {filteredTopicsForSelection.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                    <option value="CREATE_NEW">-- Create New Topic --</option>
                                </select>
                                {generalApprovedTopic === 'CREATE_NEW' && <input type="text" value={generalApprovedTopic} onChange={e => setGeneralApprovedTopic(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />}
                            </div>
                            <div><label className="block text-sm font-medium">Chapter</label>
                                <p className="text-sm text-slate-500">AI Suggestion: {upload.suggestedChapter || 'N/A'}</p>
                                <select value={generalApprovedChapter} onChange={e => setGeneralApprovedChapter(e.target.value)} className="input-field w-full" disabled={!isGeneralTopicSelected}>
                                    <option value="">Select Chapter...</option>
                                    {currentTopicChapters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    <option value="CREATE_NEW">-- Create New Chapter --</option>
                                </select>
                                {generalApprovedChapter === 'CREATE_NEW' && <input type="text" value={generalApprovedChapter} onChange={e => setGeneralApprovedChapter(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />}
                            </div>
                            <div><label className="block text-sm font-medium">MCQs to Generate</label><input type="number" value={generalMcqCount} onChange={e => setGeneralMcqCount(parseInt(e.target.value))} className="input-field w-full" /></div>
                            <div><label className="block text-sm font-medium">Flashcards to Generate</label><input type="number" value={generalFlashcardCount} onChange={e => setGeneralFlashcardCount(parseInt(e.target.value))} className="input-field w-full" /></div>
                            <button onClick={() => prepareBatchGenerationMutation.mutate({ uploadId: upload.id, totalMcqCount: generalMcqCount, totalFlashcardCount: generalFlashcardCount, batchSize: generalBatchSize, approvedTopic: generalApprovedTopic, approvedChapter: generalApprovedChapter })} disabled={!isGeneralTopicSelected || !isGeneralChapterSelected || prepareBatchGenerationMutation.isPending} className="btn-primary w-full">Step 3: Prepare for Batch Generation</button>
                        </div>
                    );
                case 'batch_ready':
                    return (
                        <div className="space-y-2">
                            <p>Ready to generate {upload.totalBatches} batches.</p>
                            <button onClick={() => startAutomatedBatchGenerationMutation.mutate(upload.id)} disabled={startAutomatedBatchGenerationMutation.isPending} className="btn-success w-full">Step 4: Start Automated Generation</button>
                        </div>
                    );
                case 'generating_batch':
                    const progress = (((upload.completedBatches || 0) / (upload.totalBatches || 1)) * 100).toFixed(0);
                    return (<Loader message={`Generating batch ${ (upload.completedBatches || 0) + 1 } of ${upload.totalBatches || 0}... (${progress}%)`} />);
                case 'pending_final_review':
                    const finalReviewData = upload.finalAwaitingReviewData;
                    if (!finalReviewData) return <Loader message="Loading final content..."/>
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold">Step 5: Review & Approve Assignments</h3>
                            <div className="space-y-2 mt-2 max-h-96 overflow-y-auto">
                                {generalAssignmentSuggestions.map((s, i) => (
                                    <div key={i} className="p-2 bg-slate-100 dark:bg-slate-700 rounded">
                                        <p className="font-semibold">{s.topicName} / {s.chapterName} ({s.isNewChapter ? 'NEW' : 'Existing'})</p>
                                        <p className="text-xs">{s.mcqs?.length || 0} MCQs, {s.flashcards?.length || 0} Flashcards</p>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => approveContentMutation.mutate({ uploadId: upload.id, assignments: generalAssignmentSuggestions })} disabled={approveContentMutation.isPending} className="btn-success w-full mt-4">Final Approve</button>
                        </div>
                    );
                default:
                    return <p className="text-slate-500">Status: {upload.status.replace(/_/g, ' ')}</p>;
            }
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
            <h2 className="font-bold truncate text-slate-800 dark:text-slate-200">{upload.fileName}</h2>
            <p className="text-sm text-slate-500">Status: <span className={`font-semibold capitalize ${getStatusColor(upload.status)}`}>{upload.status.replace(/_/g, ' ')}</span></p>
            {upload.error && <p className="text-xs text-red-600 mt-2">Error: {upload.error}</p>}
            <div className="mt-4 pt-4 border-t dark:border-slate-700">
                {renderActions()}
            </div>
        </div>
    );
};

const AdminReviewPage: React.FC = () => {
    const { data: appData, isLoading: isAppDataLoading } = useData();
    const { data: uploads, isLoading: areUploadsLoading, error } = useQuery<UserUpload[]>({
        queryKey: ['pendingUploads'],
        queryFn: async () => {
            const excludedStatuses: UploadStatus[] = ['completed', 'archived'];
            const q = query(collection(db, 'userUploads'), where('status', 'not-in', excludedStatuses), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id, createdAt: doc.data().createdAt?.toDate(), updatedAt: doc.data().updatedAt?.toDate() } as UserUpload));
        }
    });

    const allTopics = useMemo(() => appData?.topics || [], [appData]);
    const isLoading = isAppDataLoading || areUploadsLoading;

    if (isLoading) return <Loader message="Loading review queue..." />;
    if (error) return <div className="text-center text-red-500">Error: {error.message}</div>;

    return (
        <div className="space-y-6">
            <style>{`.btn-primary { @apply w-full px-4 py-2 text-sm font-semibold rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50; } .input-field { @apply w-full px-3 py-2 border rounded-md bg-slate-50 dark:bg-slate-700 dark:border-slate-600; } .btn-success { @apply w-full px-4 py-2 text-sm font-semibold rounded-md bg-green-500 text-white hover:bg-green-600 disabled:opacity-50; }`}</style>
            <h1 className="text-3xl font-bold">Content Review Queue</h1>
            {uploads && uploads.length > 0 ? (
                <div className="space-y-4">
                    {uploads.map(upload => <UploadCard key={upload.id} upload={upload} allTopics={allTopics} />)}
                </div>
            ) : (
                <p className="text-center py-8 text-slate-500">The review queue is empty.</p>
            )}
        </div>
    );
};

export default AdminReviewPage;