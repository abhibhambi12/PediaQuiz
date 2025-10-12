// frontend/src/components/ContentEditorModal.tsx
import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { MCQ, Flashcard, Chapter } from '@pediaquiz/types';
import { useData } from '@/contexts/DataContext';
import { normalizeId } from '@/utils/helpers';

interface ContentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedFields: Partial<MCQ | Flashcard>) => void;
  content: MCQ | Flashcard;
  isLoading?: boolean;
}

// FIX: DEFINITIVE FIX - Approach 1: Discriminated Union
// Create a union type for the state. The state can be a partial MCQ *or* a partial Flashcard.
type ContentFields = Partial<MCQ> | Partial<Flashcard>;

const ContentEditorModal: React.FC<ContentEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  content,
  isLoading = false,
}) => {
  const { appData } = useData();

  // Initialize the state with the correct union type and the incoming content prop.
  // This provides a valid initial type and prevents the 'never' inference.
  const [fields, setFields] = useState<ContentFields>(content);

  useEffect(() => {
    // When the modal is opened or the content prop changes, reset the internal state.
    if (isOpen) {
      setFields(content);
    }
  }, [content, isOpen]);

  const topicsForDropdown = useMemo(
    () =>
      appData?.topics.filter(
        (t) =>
          t.source ===
          (content.source?.startsWith('Marrow') ? 'Marrow' : 'General')
      ) || [],
    [appData, content.source]
  );
  const selectedTopicObj = useMemo(
    () =>
      topicsForDropdown.find(
        (t) => normalizeId(t.name) === normalizeId(fields.topicName || '')
      ),
    [topicsForDropdown, fields.topicName]
  );
  const chaptersForDropdown = useMemo(
    () => (selectedTopicObj?.chapters as Chapter[]) || [],
    [selectedTopicObj]
  );

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleOptionChange = (index: number, value: string) => {
    // Type Guard: Ensure we are only acting on an MCQ
    if ('options' in fields) {
      const newOptions = [...(fields.options || [])];
      newOptions[index] = value;
      setFields((prev) => ({ ...prev, options: newOptions }));
    }
  };

  const handleSave = () => {
    const updatedFields: Partial<MCQ | Flashcard> = {};
    // Loop through keys of the state object
    for (const key in fields) {
      // Use `hasOwnProperty` for safety and cast `key` to the correct type
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        const typedKey = key as keyof ContentFields;
        if (
          JSON.stringify(fields[typedKey]) !==
          JSON.stringify(content[typedKey as keyof typeof content])
        ) {
          (updatedFields as any)[typedKey] = fields[typedKey];
        }
      }
    }

    if (typeof (fields as any).tags === 'string') {
        (updatedFields as Partial<MCQ>).tags = (fields as any).tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    } else if (Array.isArray(fields.tags)) {
        updatedFields.tags = fields.tags;
    }

    if (Object.keys(updatedFields).length > 0) onSave(updatedFields);
    else onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-slate-900 dark:text-slate-100"
                >
                  Edit {content.type.toUpperCase()}
                </Dialog.Title>
                <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  {/* FIX: Use the 'type' property as a discriminator for type guarding */}
                  {fields.type === 'mcq' && (
                    <>
                      <label>
                        Question
                        <textarea
                          name="question"
                          value={fields.question || ''}
                          onChange={handleChange}
                          className="input-field mt-1"
                          rows={3}
                        />
                      </label>
                      {(fields.options || []).map((opt: string, idx: number) => (
                        <label key={idx}>
                          Option {String.fromCharCode(65 + idx)}
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              handleOptionChange(idx, e.target.value)
                            }
                            className="input-field mt-1"
                          />
                        </label>
                      ))}
                      <label>
                        Correct Answer (A-D)
                        <input
                          name="answer"
                          value={fields.answer || ''}
                          onChange={handleChange}
                          className="input-field mt-1"
                        />
                      </label>
                      <label>
                        Correct Answer Text
                        <input
                          name="correctAnswer"
                          value={fields.correctAnswer || ''}
                          onChange={handleChange}
                          className="input-field mt-1"
                        />
                      </label>
                      <label>
                        Explanation
                        <textarea
                          name="explanation"
                          value={fields.explanation || ''}
                          onChange={handleChange}
                          className="input-field mt-1"
                          rows={4}
                        />
                      </label>
                    </>
                  )}

                  {fields.type === 'flashcard' && (
                    <>
                      <label>
                        Front
                        <textarea
                          name="front"
                          value={fields.front || ''}
                          onChange={handleChange}
                          className="input-field mt-1"
                          rows={3}
                        />
                      </label>
                      <label>
                        Back
                        <textarea
                          name="back"
                          value={fields.back || ''}
                          onChange={handleChange}
                          className="input-field mt-1"
                          rows={4}
                        />
                      </label>
                    </>
                  )}

                  {/* Common Fields - Safe to access */}
                  <label>
                    Topic
                    <select
                      name="topicName"
                      value={fields.topicName}
                      onChange={handleChange}
                      className="input-field mt-1"
                    >
                      <option value="">Select Topic</option>
                      {topicsForDropdown.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Chapter
                    <select
                      name="chapterName"
                      value={fields.chapterName}
                      onChange={handleChange}
                      className="input-field mt-1"
                    >
                      <option value="">Select Chapter</option>
                      {chaptersForDropdown.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tags (comma-separated)
                    <input
                      name="tags"
                      value={(fields.tags || []).join(', ')}
                      onChange={(e) =>
                        setFields((p) => ({
                          ...p,
                          tags: e.target.value.split(',').map((t) => t.trim()),
                        }))
                      }
                      className="input-field mt-1"
                    />
                  </label>
                  <label>
                    Status
                    <select
                      name="status"
                      value={fields.status}
                      onChange={handleChange}
                      className="input-field mt-1"
                    >
                      {['pending', 'approved', 'rejected', 'archived'].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="btn-neutral"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSave}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
export default ContentEditorModal;