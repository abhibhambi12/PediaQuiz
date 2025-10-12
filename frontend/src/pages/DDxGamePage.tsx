import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { evaluateDDx } from '@/services/aiService';
import { useToast } from '@/components/Toast';
import ReactMarkdown from 'react-markdown';

// FIX: Added React.FC type to ensure correct JSX return typing.
const DDxGamePage: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [clinicalFindings, setClinicalFindings] = useState('');
  const [userDDx, setUserDDx] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const evaluateDDxMutation = useMutation({
    mutationFn: (data: { clinicalFindings: string; userAnswer: string }) =>
      evaluateDDx(data),
    onSuccess: (response) => setAiFeedback(response.data.feedback),
    onError: (error: any) =>
      addToast(`Evaluation failed: ${error.message}`, 'error'),
  });

  const handleSubmit = () => {
    if (!clinicalFindings.trim() || !userDDx.trim())
      return addToast('Please provide both findings and your DDx.', 'error');
    evaluateDDxMutation.mutate({ clinicalFindings, userAnswer: userDDx });
  };

  if (!user) return <div className="text-center p-10">Please log in to play.</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Differential Diagnosis Game</h1>
      <div className="card-base p-6 space-y-4">
        <label>
          Clinical Findings
          <textarea
            value={clinicalFindings}
            onChange={(e) => setClinicalFindings(e.target.value)}
            placeholder="e.g., A 3-year-old boy presents with a 2-day history of high fever, irritability, and a rash..."
            className="input-field h-32 mt-1"
          />
        </label>
        <label>
          Your Differential Diagnoses
          <textarea
            value={userDDx}
            onChange={(e) => setUserDDx(e.target.value)}
            placeholder="e.g., Strep throat, Kawasaki disease, viral exanthem"
            className="input-field h-24 mt-1"
            disabled={!!aiFeedback}
          />
        </label>
        <button
          onClick={handleSubmit}
          disabled={evaluateDDxMutation.isPending || !!aiFeedback}
          className="btn-primary w-full"
        >
          {evaluateDDxMutation.isPending ? 'Evaluating...' : 'Submit DDx'}
        </button>
        {aiFeedback && (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg prose dark:prose-invert max-w-none">
            <h3 className="font-bold">AI Feedback:</h3>
            <ReactMarkdown>{aiFeedback}</ReactMarkdown>
          </div>
        )}
        <div className="flex justify-end pt-4">
          <button
            onClick={() => {
              setClinicalFindings('');
              setUserDDx('');
              setAiFeedback(null);
            }}
            className="btn-neutral"
          >
            New Scenario
          </button>
        </div>
      </div>
    </div>
  );
};
export default DDxGamePage;