import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { MCQ, Flashcard, ContentStatus } from '@pediaquiz/types';
import {
  searchContent,
  updateContentItem,
  deleteContentItem,
} from '@/services/apiService';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from '@/components/ConfirmationModal';
import ContentEditorModal from '@/components/ContentEditorModal';
import clsx from 'clsx';

// FIX: Added React.FC type to ensure correct JSX return typing.
const AdminContentManagementPage: React.FC = () => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>(
    'all'
  );
  const [editingContent, setEditingContent] = useState<MCQ | Flashcard | null>(
    null
  );
  const [deletingContent, setDeletingContent] = useState<
    MCQ | Flashcard | null
  >(null);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['adminContentSearch', searchTerm, statusFilter],
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      const response = await searchContent({ query: searchTerm, terms: [searchTerm] });
      const allItems: (MCQ | Flashcard)[] = [
        ...(response.data.mcqs || []),
        ...(response.data.flashcards || []),
      ];
      return statusFilter === 'all'
        ? allItems
        : allItems.filter((item) => item.status === statusFilter);
    },
    enabled: searchTerm.trim().length > 0,
  });

  const displayedResults = searchTerm.trim().length > 0 ? searchResults : [];

  const updateMutation = useMutation({
    mutationFn: (vars: { updates: Partial<MCQ | Flashcard> }) => {
      if (!editingContent) throw new Error('No content selected for editing.');
      const collectionName =
        editingContent.type === 'mcq'
          ? editingContent.source?.startsWith('Marrow')
            ? 'MarrowMCQ'
            : 'MasterMCQ'
          : 'Flashcards';
      return updateContentItem({
        id: editingContent.id,
        type: editingContent.type,
        collectionName: collectionName as any,
        updates: vars.updates,
      });
    },
    onSuccess: () => {
      addToast('Content updated!', 'success');
      queryClient.invalidateQueries({ queryKey: ['adminContentSearch'] });
      queryClient.invalidateQueries({ queryKey: ['appData'] });
    },
    onError: (error: any) =>
      addToast(`Update failed: ${error.message}`, 'error'),
    onSettled: () => setEditingContent(null),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deletingContent) throw new Error('No content selected for deletion.');
      const collectionName =
        deletingContent.type === 'mcq'
          ? deletingContent.source?.startsWith('Marrow')
            ? 'MarrowMCQ'
            : 'MasterMCQ'
          : 'Flashcards';
      return deleteContentItem({
        id: deletingContent.id,
        type: deletingContent.type,
        collectionName: collectionName as any,
      });
    },
    onSuccess: () => {
      addToast('Content deleted!', 'success');
      queryClient.invalidateQueries({ queryKey: ['adminContentSearch'] });
      queryClient.invalidateQueries({ queryKey: ['appData'] });
    },
    onError: (error: any) =>
      addToast(`Deletion failed: ${error.message}`, 'error'),
    onSettled: () => setDeletingContent(null),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Content Management</h1>
      <div className="card-base p-6 mb-6 flex flex-wrap gap-4 items-center">
        <input
          type="text"
          placeholder="Search by keyword (min 3 chars)..."
          className="input-field flex-grow"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="input-field w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isSearching && <Loader message="Searching..." />}
      <div className="space-y-4">
        {displayedResults?.map((item) => (
          <div
            key={item.id}
            className="card-base p-4 flex justify-between items-start gap-4"
          >
            <div className="flex-1">
              <p className="font-semibold">
                {item.type === 'mcq' ? item.question : item.front}
              </p>
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  {
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300':
                      item.status === 'approved',
                    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300':
                      item.status === 'pending',
                    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300':
                      item.status === 'rejected',
                    'bg-slate-100 text-slate-800 dark:bg-slate-700/50 dark:text-slate-300':
                      item.status === 'archived',
                  }
                )}
              >
                {item.status}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setEditingContent(item)}
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <PencilIcon className="h-5 w-5 text-sky-500" />
              </button>
              <button
                onClick={() => setDeletingContent(item)}
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <TrashIcon className="h-5 w-5 text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingContent && (
        <ContentEditorModal
          isOpen={!!editingContent}
          onClose={() => setEditingContent(null)}
          onSave={(updates) => updateMutation.mutate({ updates })}
          content={editingContent}
          isLoading={updateMutation.isPending}
        />
      )}
      <ConfirmationModal
        isOpen={!!deletingContent}
        onClose={() => setDeletingContent(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Confirm Deletion"
        message="Are you sure you want to permanently delete this item?"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
export default AdminContentManagementPage;