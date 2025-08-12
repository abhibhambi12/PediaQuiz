// --- CORRECTED FILE: workspaces/frontend/src/pages/AdminReviewPage.tsx ---

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, functions } from '@/firebase';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import type { UserUpload, UploadStatus, Topic, Chapter, AssignmentSuggestion, MCQ, Flashcard, PediaquizTopicType } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useTopics } from '@/hooks/useTopics'; // REFACTORED: Use useTopics
import {
    generateAndStageMarrowMcqs as generateAndStageMarrowMcqsCallable, // Renamed for clarity to avoid conflict with mutation
    generateGeneralContent as generateGeneralContentCallable,       // Renamed for clarity
    autoAssignContent as autoAssignContentCallable // NEW callable
} from '@/services/aiService';
import clsx from 'clsx';
import { useSound } from '@/hooks/useSound';

const normalizeId = (name: string): string => {
    if (typeof name !== 'string') return 'unknown';
    return name.replace(/\s+/g, '_').toLowerCase();
};

const getStatusColor = (status: UploadStatus): string => {
    if (status === 'completed') return 'text-success-500';
    if (status.startsWith('failed') || status === 'error') return 'text-danger-500';
    if (status.startsWith('pending')) return 'text-warning-500 animate-pulse-subtle';
    if (status === 'archived') return 'text-neutral-500';
    return 'text-primary-500 animate-pulse-subtle';
};

const UploadCard: React.FC<{ upload: UserUpload, allTopics: Topic[] }> = ({ upload, allTopics }) => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { playSound } = useSound();

    const [marrowNumToGenerate, setMarrowNumToGenerate] = useState(upload.suggestedNewMcqCount || 10);
    const [marrowSelectedTopic, setMarrowSelectedTopic] = useState('');
    const [marrowSelectedChapter, setMarrowSelectedChapter] = useState('');
    const [marrowNewTopicName, setNewTopicName] = useState('');
    const [marrowNewChapterName, setNewChapterName] = useState('');
    const [marrowKeyTopics, setMarrowKeyTopics] = useState<string[]>(upload.suggestedKeyTopics || []);

    // General Pipeline specific state
    const [generalNumToGenerate, setGeneralNumToGenerate] = useState(upload.estimatedMcqCount || 10);
    const [generalFlashcardCount, setGeneralFlashcardCount] = useState(upload.estimatedFlashcardCount || 10);
    const [generalBatchSize, setGeneralBatchSize] = useState(50); // Default batch size
    const [generalApprovedTopic, setGeneralApprovedTopic] = useState(upload.suggestedTopic || '');
    const [generalApprovedChapter, setGeneralApprovedChapter] = useState(upload.suggestedChapter || '');
    const [generalAssignmentSuggestions, setGeneralAssignmentSuggestions] = useState<AssignmentSuggestion[]>(upload.assignmentSuggestions || []);

    React.useEffect(() => {
        setMarrowNumToGenerate(upload.suggestedNewMcqCount || 10);
        setMarrowKeyTopics(upload.suggestedKeyTopics || []);
        
        setGeneralNumToGenerate(upload.estimatedMcqCount || 10);
        setGeneralFlashcardCount(upload.estimatedFlashcardCount || 10);
        setGeneralApprovedTopic(upload.suggestedTopic || '');
        setGeneralApprovedChapter(upload.suggestedChapter || '');
        setGeneralAssignmentSuggestions(upload.assignmentSuggestions || []);
    }, [upload]);


    const isMarrowUpload = upload.fileName.startsWith("MARROW_"); // For Marrow PDFs
    const isSmartMarrowTextUpload = upload.fileName.startsWith("MARROW_TEXT_"); // For pasted Marrow text

    // Filter topics based on the content source
    const filteredTopicsForSelection = useMemo(() => 
        allTopics.filter(t => isMarrowUpload || isSmartMarrowTextUpload ? t.source === 'Marrow' : t.source === 'General'),
    [allTopics, isMarrowUpload, isSmartMarrowTextUpload]);

    const availableChaptersForMarrowTopic = useMemo(() => 
        allTopics.find(t => t.id === marrowSelectedTopic)?.chapters || [], 
    [allTopics, marrowSelectedTopic]);

    const availableChaptersForGeneralTopic = useMemo(() => {
        const topic = allTopics.find(t => t.id === normalizeId(generalApprovedTopic) || t.name === generalApprovedTopic);
        return topic ? topic.chapters : [];
    }, [allTopics, generalApprovedTopic]);

    // Callable Function References
    const extractMarrowContentCallable = httpsCallable<{ uploadId: string }, { mcqCount: number, explanationCount: number }>(functions, 'extractMarrowContent');
    const generateAndAnalyzeMarrowContentCallable = httpsCallable<{ uploadId: string, count: number }, { success: boolean, message?: string }>(functions, 'generateAndAnalyzeMarrowContent');
    const approveMarrowContentCallable = httpsCallable<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }, { success: boolean, message?: string }>(functions, 'approveMarrowContent');
    const suggestClassificationCallable = httpsCallable< { uploadId: string }, { success: boolean, suggestedTopic?: string, suggestedChapter?: string } >(functions, 'suggestClassification');
    const prepareBatchGenerationCallable = httpsCallable< { uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }, { success: boolean, totalBatches: number } >(functions, 'prepareBatchGeneration');
    const startAutomatedBatchGenerationCallable = httpsCallable<{ uploadId: string }, { success: boolean }>(functions, 'startAutomatedBatchGeneration');
    const approveContentCallable = httpsCallable<{ uploadId: string, assignments: AssignmentSuggestion[] }, { success: boolean, message?: string }>(functions, 'approveContent');


    // Mutations
    const extractMarrowMutation = useMutation<HttpsCallableResult<{ mcqCount: number; explanationCount: number; }>, Error, string>({ 
        mutationFn: (id: string) => extractMarrowContentCallable({ uploadId: id }), 
        onSuccess: () => { playSound('notification'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const generateAndAnalyzeMarrowMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string; }>, Error, { uploadId: string; count: number; }>({ 
        mutationFn: (vars) => generateAndAnalyzeMarrowContentCallable(vars), 
        onSuccess: () => { playSound('notification'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const approveMarrowMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string; }>, Error, { uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>({ 
        mutationFn: (vars) => approveMarrowContentCallable(vars), 
        onSuccess: () => { playSound('notification'); addToast("Marrow content approved!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads', 'topics'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const smartMarrowGenerateMutation = useMutation<HttpsCallableResult<{ success: boolean; }>, Error, { uploadId: string; count: number; }>({ 
        mutationFn: (vars) => generateAndStageMarrowMcqsCallable(vars), 
        onSuccess: () => { playSound('notification'); addToast("Marrow content generated and staged!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const suggestClassificationMutation = useMutation<HttpsCallableResult<{ success: boolean; suggestedTopic?: string | undefined; suggestedChapter?: string | undefined; }>, Error, string>({ 
        mutationFn: (id: string) => suggestClassificationCallable({ uploadId: id }), 
        onSuccess: () => { playSound('notification'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const generateGeneralContentMutation = useMutation<HttpsCallableResult<{ success: boolean; }>, Error, { uploadId: string; count: number; }>({ 
        mutationFn: (vars) => generateGeneralContentCallable(vars), 
        onSuccess: () => { playSound('notification'); addToast("General content generation complete!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); }, 
        onError: (error) => { playSound('incorrect'); addToast(`General generation failed: ${error.message}`, 'danger');} 
    });
    const prepareBatchGenerationMutation = useMutation<HttpsCallableResult<{ success: boolean; totalBatches: number; }>, Error, { uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }>({ 
        mutationFn: (vars) => prepareBatchGenerationCallable(vars), 
        onSuccess: () => { playSound('notification'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const startAutomatedBatchGenerationMutation = useMutation<HttpsCallableResult<{ success: boolean; }>, Error, string>({ 
        mutationFn: (id: string) => startAutomatedBatchGenerationCallable({ uploadId: id }), 
        onSuccess: () => { playSound('notification'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });
    const approveContentMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string; }>, Error, { uploadId: string, assignments: AssignmentSuggestion[] }>({ 
        mutationFn: (vars) => approveContentCallable(vars), 
        onSuccess: () => { playSound('notification'); addToast("Content approved successfully!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads', 'topics'] });}, 
        onError: (e: Error) => { playSound('incorrect'); addToast(e.message, 'danger');} 
    });

    const autoAssignContentMutation = useMutation<HttpsCallableResult<{ success: boolean; suggestions: AssignmentSuggestion[] }>, Error, { uploadId: string, existingTopics: PediaquizTopicType[], scopeToTopicName?: string }>({
        mutationFn: (vars) => autoAssignContentCallable(vars),
        onSuccess: (data) => {
            playSound('notification');
            addToast("AI auto-assigned content!", 'success');
            // Update the local state with new assignment suggestions
            setGeneralAssignmentSuggestions(data.data.suggestions);
            // Invalidate pendingUploads to refetch the document with updated status
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`AI auto-assignment failed: ${error.message}`, 'danger');
        },
    });

    const handleAddKeyTopic = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { 
            playSound('buttonClick');
            e.preventDefault(); const newTag = e.currentTarget.value.trim(); if (newTag && !marrowKeyTopics.includes(newTag)) setMarrowKeyTopics(prev => [...prev, newTag]); e.currentTarget.value = ''; 
        }
    };
    const handleRemoveKeyTopic = (tagToRemove: string) => {
        playSound('buttonClick');
        setMarrowKeyTopics(prev => prev.filter(tag => tag !== tagToRemove));
    };

    const handleApproveMarrowContent = () => {
        playSound('buttonClick');
        const finalTopicId = marrowSelectedTopic === 'CREATE_NEW' ? normalizeId(marrowNewTopicName.trim()) : marrowSelectedTopic;
        const finalTopicName = marrowSelectedTopic === 'CREATE_NEW' ? marrowNewTopicName.trim() : allTopics.find(t => t.id === marrowSelectedTopic)?.name || '';
        const finalChapterId = marrowSelectedChapter === 'CREATE_NEW' ? normalizeId(marrowNewChapterName.trim()) : marrowSelectedChapter;
        const finalChapterName = marrowSelectedChapter === 'CREATE_NEW' ? marrowNewChapterName.trim() : availableChaptersForMarrowTopic.find(c => c.id === marrowSelectedChapter)?.name || '';
        
        if (!finalTopicName || !finalChapterName || (marrowSelectedTopic === 'CREATE_NEW' && !marrowNewTopicName.trim()) || (marrowSelectedChapter === 'CREATE_NEW' && !marrowNewChapterName.trim())) { 
            addToast("Topic and Chapter names are required.", "danger"); return; 
        }
        approveMarrowMutation.mutate({ uploadId: upload.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName, keyTopics: marrowKeyTopics });
    };

    const handleFinalApproveAssignments = () => {
        playSound('buttonClick');
        if (generalAssignmentSuggestions.length === 0) { addToast("No assignments to approve.", "warning"); return; }
        approveContentMutation.mutate({ uploadId: upload.id, assignments: generalAssignmentSuggestions });
    };

    const handleAutoAssignGeneralContent = () => {
        playSound('buttonClick');
        if (!allTopics) { addToast("Topic data not available for auto-assignment.", "warning"); return; }
        autoAssignContentMutation.mutate({ uploadId: upload.id, existingTopics: allTopics });
    }

    // Helper for validation logic in UI
    const isMarrowTopicSelectedOrNew = marrowSelectedTopic.trim() !== '';
    const isMarrowChapterSelectedOrNew = marrowSelectedChapter.trim() !== '';
    const isMarrowNewTopicNameValid = marrowSelectedTopic === 'CREATE_NEW' ? marrowNewTopicName.trim() !== '' : true;
    const isMarrowNewChapterNameValid = marrowSelectedChapter === 'CREATE_NEW' ? marrowNewChapterName.trim() !== '' : true;

    const isGeneralTopicSelected = generalApprovedTopic.trim() !== '';
    const isGeneralChapterSelected = generalApprovedChapter.trim() !== '';

    const renderActions = () => {
        // Handle common loading states for mutations
        const isLoadingMutation = extractMarrowMutation.isPending || generateAndAnalyzeMarrowMutation.isPending || 
                                approveMarrowMutation.isPending || smartMarrowGenerateMutation.isPending ||
                                suggestClassificationMutation.isPending || prepareBatchGenerationMutation.isPending ||
                                startAutomatedBatchGenerationMutation.isPending || approveContentMutation.isPending ||
                                generateGeneralContentMutation.isPending || autoAssignContentMutation.isPending; // Include new mutation

        if (isLoadingMutation) return <Loader message="Processing request..." />;


        if (isMarrowUpload || isSmartMarrowTextUpload) { // Common flow for both types of Marrow
            switch (upload.status) {
                case 'processed': // Stage 1 for original Marrow (after OCR)
                    return ( <button onClick={() => {playSound('buttonClick'); extractMarrowMutation.mutate(upload.id)}} disabled={extractMarrowMutation.isPending} className="btn-primary w-full">Stage 1: Extract Marrow Content</button> );
                
                case 'pending_generation_decision': // Stage 2 for original Marrow (after extraction)
                    const extractedMarrowMcqsCount = upload.stagedContent?.extractedMcqs?.length || 0;
                    const orphanMarrowExplanationsCount = upload.stagedContent?.orphanExplanations?.length || 0;
                    return (
                        <div className="space-y-3">
                            <h3 className="font-bold text-lg">Stage 2: Generate New MCQs</h3>
                            <p className="text-sm">Extracted: {extractedMarrowMcqsCount} MCQs, {orphanMarrowExplanationsCount} Explanations.</p>
                            {orphanMarrowExplanationsCount > 0 && (
                                <>
                                    <label className="block text-sm font-medium mb-1">New MCQs from explanations:</label>
                                    <input type="number" value={marrowNumToGenerate} onChange={e => setMarrowNumToGenerate(parseInt(e.target.value, 10))} placeholder="Number of MCQs to generate" min="0" className="input-field w-full" />
                                    <button onClick={() => {playSound('buttonClick'); generateAndAnalyzeMarrowMutation.mutate({ uploadId: upload.id, count: marrowNumToGenerate })}} disabled={generateAndAnalyzeMarrowMutation.isPending || marrowNumToGenerate < 0} className="btn-primary w-full">Generate & Analyze Topics</button>
                                </>
                            )}
                            {(orphanMarrowExplanationsCount === 0 || marrowNumToGenerate === 0) && (extractedMarrowMcqsCount > 0) && (
                                <button onClick={() => {playSound('buttonClick'); generateAndAnalyzeMarrowMutation.mutate({ uploadId: upload.id, count: 0 })}} disabled={generateAndAnalyzeMarrowMutation.isPending} className="btn-neutral w-full mt-2">Skip Generation & Assign</button>
                            )}
                            {extractedMarrowMcqsCount === 0 && orphanMarrowExplanationsCount === 0 && (
                                <p className="text-sm text-neutral-500">No content found after extraction. Check original document or reset.</p>
                            )}
                        </div>
                    );
                
                case 'pending_marrow_generation_approval': // New Stage for Smart Marrow (after text paste or initial OCR of MARROW_TEXT_ files)
                    const smExtractedMcqs = upload.stagedContent?.extractedMcqs || [];
                    const smSuggestedNewCount = upload.suggestedNewMcqCount || 0;
                    return (
                        <div className="space-y-3">
                            <h3 className="font-bold text-lg">Stage 2 (Smart Marrow): Generate New MCQs</h3>
                            <p className="text-sm">Existing: {smExtractedMcqs.length} MCQs. AI suggests {smSuggestedNewCount} new ones.</p>
                            <label className="block text-sm font-medium mb-1">Number of NEW MCQs to generate:</label>
                            <input type="number" value={marrowNumToGenerate} onChange={e => setMarrowNumToGenerate(parseInt(e.target.value, 10))} placeholder="Enter count" min="0" className="input-field w-full" />
                            <button onClick={() => {playSound('buttonClick'); smartMarrowGenerateMutation.mutate({ uploadId: upload.id, count: marrowNumToGenerate })}} disabled={smartMarrowGenerateMutation.isPending || marrowNumToGenerate < 0} className="btn-primary w-full">Generate New Marrow Content</button>
                            {(smExtractedMcqs.length > 0 && marrowNumToGenerate === 0) && (
                                <button onClick={() => {playSound('buttonClick'); smartMarrowGenerateMutation.mutate({ uploadId: upload.id, count: 0 })}} disabled={smartMarrowGenerateMutation.isPending} className="btn-neutral w-full mt-2">Skip Generation & Assign Existing</button>
                            )}
                        </div>
                    );

                case 'pending_assignment': // Stage 3 for Marrow (after generation)
                    const totalMarrowMcqs = (upload.stagedContent?.extractedMcqs?.length || 0) + (upload.stagedContent?.generatedMcqs?.length || 0);
                    const generatedMarrowFlashcards = (upload.stagedContent?.generatedFlashcards?.length || 0); // Key Concepts Flashcards
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Stage 3: Assign & Approve ({totalMarrowMcqs} MCQs, {generatedMarrowFlashcards} Flashcards)</h3>
                            <div> <label className="block text-sm font-medium mb-1">Select Topic</label> <select value={marrowSelectedTopic} onChange={e => setMarrowSelectedTopic(e.target.value)} className="input-field w-full"> <option value="">Select existing...</option> {filteredTopicsForSelection.map(t => <option key={t.id} value={t.id}>{t.name}</option>)} <option value="CREATE_NEW">-- Create New --</option> </select> {marrowSelectedTopic === 'CREATE_NEW' && <input type="text" value={marrowNewTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />} </div>
                            <div> <label className="block text-sm font-medium mb-1">Select Chapter</label> <select value={marrowSelectedChapter} onChange={e => setMarrowSelectedChapter(e.target.value)} className="input-field w-full" disabled={!isMarrowTopicSelectedOrNew}> <option value="">Select existing...</option> {availableChaptersForMarrowTopic.map(c => <option key={c.id} value={c.id}>{c.name}</option>)} <option value="CREATE_NEW">-- Create New --</option> </select> {marrowSelectedChapter === 'CREATE_NEW' && <input type="text" value={marrowNewChapterName} onChange={e => setNewChapterName(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />} </div>
                            <div className="space-y-2"> <label className="block text-sm font-medium mb-1">Key Clinical Topics (Tags)</label> <div className="flex flex-wrap gap-2 p-2 border rounded-md border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700"> {marrowKeyTopics.map(tag => (<span key={tag} className="flex items-center px-2 py-1 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 text-sm">{tag}<button onClick={() => handleRemoveKeyTopic(tag)} className="ml-1 text-primary-500 hover:text-primary-700">×</button></span>))} <input type="text" onKeyDown={handleAddKeyTopic} placeholder="Add new tag (Enter)" className="flex-grow min-w-[100px] bg-transparent outline-none" /> </div> <p className="text-xs text-neutral-500">AI Suggestions: {upload.suggestedKeyTopics?.join(', ') || 'None'}</p> </div>
                            <button onClick={handleApproveMarrowContent} disabled={!isMarrowTopicSelectedOrNew || !isMarrowChapterSelectedOrNew || !isMarrowNewTopicNameValid || !isMarrowNewChapterNameValid} className="btn-success w-full">Approve & Save Content</button>
                        </div>
                    );
                
                // General Pipeline stages
                case 'processed': // General Pipeline's initial stage, needs classification
                    return ( <button onClick={() => {playSound('buttonClick'); suggestClassificationMutation.mutate(upload.id)}} disabled={suggestClassificationMutation.isPending} className="btn-primary w-full">Stage 1: Classify Content (AI)</button> );
                case 'pending_classification': return <Loader message="AI is classifying..." />;
                case 'pending_approval':
                    const generalTotalMcqs = upload.estimatedMcqCount || 0;
                    const generalTotalFlashcards = upload.estimatedFlashcardCount || 0;
                    const currentTopicChapters = allTopics.find(t => normalizeId(t.name) === normalizeId(generalApprovedTopic))?.chapters || [];
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Step 2: Approve Plan ({generalTotalMcqs} MCQs, {generalTotalFlashcards} Flashcards est.)</h3>
                            <div><label className="block text-sm font-medium">Topic</label>
                                <p className="text-sm text-neutral-500">AI Suggestion: {upload.suggestedTopic || 'N/A'}</p>
                                <select value={generalApprovedTopic} onChange={e => setGeneralApprovedTopic(e.target.value)} className="input-field w-full">
                                    <option value="">Select Topic...</option>
                                    {filteredTopicsForSelection.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                    <option value="CREATE_NEW">-- Create New Topic --</option>
                                </select>
                                {generalApprovedTopic === 'CREATE_NEW' && <input type="text" value={generalApprovedTopic} onChange={e => setGeneralApprovedTopic(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />}
                            </div>
                            <div><label className="block text-sm font-medium">Chapter</label>
                                <p className="text-sm text-neutral-500">AI Suggestion: {upload.suggestedChapter || 'N/A'}</p>
                                <select value={generalApprovedChapter} onChange={e => setGeneralApprovedChapter(e.target.value)} className="input-field w-full" disabled={!isGeneralTopicSelected}>
                                    <option value="">Select Chapter...</option>
                                    {currentTopicChapters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    <option value="CREATE_NEW">-- Create New Chapter --</option>
                                </select>
                                {generalApprovedChapter === 'CREATE_NEW' && <input type="text" value={generalApprovedChapter} onChange={e => setGeneralApprovedChapter(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />}
                            </div>
                            <div><label className="block text-sm font-medium">MCQs to Generate</label><input type="number" value={generalNumToGenerate} onChange={e => setGeneralNumToGenerate(parseInt(e.target.value))} className="input-field w-full" /></div>
                            <div><label className="block text-sm font-medium">Flashcards to Generate</label><input type="number" value={generalFlashcardCount} onChange={e => setGeneralFlashcardCount(parseInt(e.target.value))} className="input-field w-full" /></div>
                            <button onClick={() => {playSound('buttonClick'); prepareBatchGenerationMutation.mutate({ uploadId: upload.id, totalMcqCount: generalNumToGenerate, totalFlashcardCount: generalFlashcardCount, batchSize: generalBatchSize, approvedTopic: generalApprovedTopic, approvedChapter: generalApprovedChapter })}} disabled={!isGeneralTopicSelected || !isGeneralChapterSelected || prepareBatchGenerationMutation.isPending} className="btn-primary w-full">Step 3: Prepare for Batch Generation</button>
                        </div>
                    );
                case 'batch_ready':
                    return (
                        <div className="space-y-2">
                            <p className="text-neutral-700 dark:text-neutral-300">Ready to generate {upload.totalBatches} batches.</p>
                            <button onClick={() => {playSound('buttonClick'); startAutomatedBatchGenerationMutation.mutate(upload.id)}} disabled={startAutomatedBatchGenerationMutation.isPending} className="btn-success w-full">Step 4: Start Automated Generation</button>
                        </div>
                    );
                case 'generating_batch':
                    const genProgress = (((upload.completedBatches || 0) / (upload.totalBatches || 1)) * 100).toFixed(0);
                    return (<Loader message={`Generating batch ${ (upload.completedBatches || 0) + 1 } of ${upload.totalBatches || 0}... (${genProgress}%)`} />);
                case 'pending_final_review':
                    const finalReviewData = upload.finalAwaitingReviewData;
                    if (!finalReviewData) return <Loader message="Loading final content..."/>
                    const totalGeneralGenerated = (finalReviewData.mcqs?.length || 0) + (finalReviewData.flashcards?.length || 0);
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Step 5: Review & Approve Assignments ({totalGeneralGenerated} items)</h3>
                            <button 
                                onClick={() => handleAutoAssignGeneralContent()} 
                                disabled={autoAssignContentMutation.isPending} 
                                className="btn-primary w-full mb-3"
                            >
                                {autoAssignContentMutation.isPending ? 'Auto-assigning...' : '🤖 Auto-Assign Content'}
                            </button>
                            <div className="space-y-2 mt-2 max-h-96 overflow-y-auto">
                                {upload.assignmentSuggestions?.map((s, i) => (
                                    <div key={i} className="p-2 card-base">
                                        <p className="font-semibold">{s.topicName} / {s.chapterName} ({s.isNewChapter ? 'NEW' : 'Existing'})</p>
                                        <p className="text-xs text-neutral-500">{s.mcqs?.length || 0} MCQs, {s.flashcards?.length || 0} Flashcards</p>
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleFinalApproveAssignments} disabled={approveContentMutation.isPending || !generalAssignmentSuggestions.length} className="btn-success w-full mt-4">Final Approve & Save</button>
                        </div>
                    );
                default:
                    return <p className="text-neutral-500">Status: {upload.status.replace(/_/g, ' ')}</p>;
            }
        }
    };

    return (
        <div className="card-base p-4 animate-pop-in">
            <h2 className="font-bold truncate text-neutral-800 dark:text-neutral-100">{upload.fileName}</h2>
            <p className="text-sm text-neutral-500">Status: <span className={clsx("font-semibold capitalize", getStatusColor(upload.status))}>{upload.status.replace(/_/g, ' ')}</span></p>
            {upload.createdAt && <p className="text-xs text-neutral-400">Uploaded: {new Date(upload.createdAt).toLocaleString()}</p>}
            {upload.updatedAt && <p className="text-xs text-neutral-400">Last Update: {new Date(upload.updatedAt).toLocaleString()}</p>}
            {upload.error && <p className="text-xs text-danger-600 mt-2">Error: {upload.error}</p>}
            <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                {renderActions()}
            </div>
        </div>
    );
};

const AdminReviewPage: React.FC = () => {
    // REFACTORED: Use useTopics() instead of useData() for topics
    const { data: topics, isLoading: isTopicsLoading, error: topicsError } = useTopics();
    const { data: uploads, isLoading: areUploadsLoading, error: uploadsError } = useQuery<UserUpload[]>({
        queryKey: ['pendingUploads'],
        queryFn: async () => {
            const excludedStatuses: UploadStatus[] = ['completed', 'archived'];
            const q = query(collection(db, 'userUploads'), where('status', 'not-in', excludedStatuses), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            // Convert Firestore Timestamps to Date objects for consistency
            return snapshot.docs.map((doc: QueryDocumentSnapshot) => ({ 
                ...doc.data(), 
                id: doc.id, 
                createdAt: doc.data().createdAt?.toDate(), 
                updatedAt: doc.data().updatedAt?.toDate() 
            } as UserUpload));
        }
    });

    const allTopics = useMemo(() => topics || [], [topics]);
    const isLoading = isTopicsLoading || areUploadsLoading;

    if (isLoading) return <Loader message="Loading review queue..." />;
    if (topicsError || uploadsError) return <div className="text-center text-danger-500">Error: {topicsError?.message || uploadsError?.message}</div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <h1 className="text-3xl font-bold">Content Review Queue</h1>
            {uploads && uploads.length > 0 ? (
                <div className="space-y-4">
                    {uploads.map(upload => <UploadCard key={upload.id} upload={upload} allTopics={allTopics} />)}
                </div>
            ) : (
                <p className="text-center py-8 text-neutral-500">The review queue is empty.</p>
            )}
        </div>
    );
};

export default AdminReviewPage;