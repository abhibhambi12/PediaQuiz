import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTags, addTag, updateTag, deleteTag } from '@/services/apiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import ConfirmationModal from '@/components/ConfirmationModal';

// FIX: Added React.FC type to ensure correct JSX return typing.
const AdminTagManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: tags, isLoading } = useQuery({
    queryKey: ['allTags'],
    queryFn: async () => (await getTags()).data.tags,
    enabled: !!user?.isAdmin,
  });

  const [newTagName, setNewTagName] = useState('');
  const [editingTag, setEditingTag] = useState<{ old: string; new: string } | null>(
    null
  );
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);

  const mutationOptions = {
    onSuccess: (data: any) => {
      addToast(data.data.message, 'success');
      queryClient.invalidateQueries({ queryKey: ['allTags'] });
    },
    onError: (err: any) => addToast(`Failed: ${err.message}`, 'error'),
  };

  const addTagMutation = useMutation({
    mutationFn: addTag,
    ...mutationOptions,
    onSettled: () => setNewTagName(''),
  });
  const updateTagMutation = useMutation({
    mutationFn: updateTag,
    ...mutationOptions,
    onSettled: () => setEditingTag(null),
  });
  const deleteTagMutation = useMutation({
    mutationFn: (tagName: string) => deleteTag({ tagName }),
    ...mutationOptions,
    onSettled: () => setTagToDelete(null),
  });

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim())
      return addToast('Tag name cannot be empty', 'warning');
    addTagMutation.mutate({ tagName: newTagName.trim() });
  };

  if (isLoading) return <Loader fullScreen message="Loading tags..." />;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Tag Management</h1>
      <form onSubmit={handleAddTag} className="card-base p-6 mb-6 flex gap-3">
        <input
          type="text"
          className="input-field flex-grow"
          placeholder="Enter new tag name"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          disabled={addTagMutation.isPending}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={addTagMutation.isPending}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </form>

      <div className="card-base p-6">
        <ul className="space-y-3">
          {tags?.sort().map((tag: string) => (
            <li
              key={tag}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg"
            >
              {editingTag?.old === tag ? (
                <input
                  type="text"
                  value={editingTag.new}
                  onChange={(e) =>
                    setEditingTag((t) =>
                      t ? { ...t, new: e.target.value } : null
                    )
                  }
                  className="input-field flex-grow mr-2"
                />
              ) : (
                <span>{tag}</span>
              )}
              <div className="flex space-x-2">
                {editingTag?.old === tag ? (
                  <button
                    onClick={() =>
                      updateTagMutation.mutate({
                        oldTagName: editingTag.old,
                        newTagName: editingTag.new.trim(),
                      })
                    }
                    className="btn-success p-2"
                    disabled={updateTagMutation.isPending}
                  >
                    <CheckIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setEditingTag({ old: tag, new: tag })}
                    className="btn-neutral p-2"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setTagToDelete(tag)}
                  className="btn-danger p-2"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmationModal
        isOpen={!!tagToDelete}
        onClose={() => setTagToDelete(null)}
        onConfirm={() => tagToDelete && deleteTagMutation.mutate(tagToDelete)}
        title="Delete Tag"
        message={`This will remove the tag '${tagToDelete}' from all content. Are you sure?`}
        variant="danger"
        isLoading={deleteTagMutation.isPending}
      />
    </div>
  );
};
export default AdminTagManagementPage;