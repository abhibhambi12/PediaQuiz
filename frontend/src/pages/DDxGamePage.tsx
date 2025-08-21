// frontend/pages/DDxGamePage.tsx
// frontend/src/pages/DDxGamePage.tsx
// Frontend implementation for Feature #9: Differential Diagnosis (DDx) Generator
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { evaluateDDx } from '@/services/aiService'; // Import the new callable
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import ReactMarkdown from 'react-markdown'; // For rendering markdown feedback

const DDxGamePage: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [clinicalFindings, setClinicalFindings] = useState('');
  const [userDDx, setUserDDx] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false); // To manage game flow

  const evaluateDDxMutation = useMutation({
    mutationFn: (data: { clinicalFindings: string, userAnswer: string }) => evaluateDDx(data),
    onSuccess: (response) => {
      setAiFeedback(response.data.feedback);
      addToast(response.data.success ? "Great job! See AI feedback." : "Good attempt! Review AI feedback.", response.data.success ? "success" : "warning");
    },
    onError: (error: any) => {
      addToast(`Failed to evaluate DDx: ${error.message}`, "error");
      setAiFeedback(null);
    },
  });

  const handleStartGame = () => {
    // For a real game, you might fetch a new scenario here.
    // For this implementation, the user provides findings.
    setGameStarted(true);
    setAiFeedback(null);
    setUserDDx('');
    // Optionally clear clinical findings too if new scenario is fetched
    // setClinicalFindings(''); 
  };

  const handleSubmitDDx = () => {
    if (!clinicalFindings.trim()) {
      addToast("Please describe the clinical findings first.", "error");
      return;
    }
    if (!userDDx.trim()) {
      addToast("Please provide your differential diagnoses.", "error");
      return;
    }
    evaluateDDxMutation.mutate({
      clinicalFindings: clinicalFindings.trim(),
      userAnswer: userDDx.trim(),
    });
  };

  const handleResetGame = () => {
    setClinicalFindings('');
    setUserDDx('');
    setAiFeedback(null);
    setGameStarted(false);
  };

  if (!user) {
    return <div className="text-center p-10 text-slate-500">Please log in to play the DDx Game.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Differential Diagnosis Game</h1>

      {!gameStarted ? (
        <div className="card-base p-6 text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Test your clinical reasoning by developing differential diagnoses based on patient findings.
          </p>
          <button onClick={handleStartGame} className="btn-primary">Start New Scenario</button>
        </div>
      ) : (
        <div className="card-base p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Current Scenario</h2>
          <div>
            <label htmlFor="clinicalFindings" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Clinical Findings (Input your case here)</label>
            <textarea
              id="clinicalFindings"
              value={clinicalFindings}
              onChange={(e) => setClinicalFindings(e.target.value)}
              placeholder="e.g., A 3-year-old boy presents with a 2-day history of high fever, irritability, and a rash..."
              className="input-field h-32 resize-y"
              disabled={evaluateDDxMutation.isPending}
            ></textarea>
          </div>
          <div>
            <label htmlFor="userDDx" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your Differential Diagnoses (Comma separated or bullet points)</label>
            <textarea
              id="userDDx"
              value={userDDx}
              onChange={(e) => setUserDDx(e.target.value)}
              placeholder="e.g., Strep throat, Kawasaki disease, viral exanthem"
              className="input-field h-24 resize-y"
              disabled={evaluateDDxMutation.isPending || aiFeedback !== null} // Disable input after feedback is received
            ></textarea>
          </div>
          <button
            onClick={handleSubmitDDx}
            disabled={evaluateDDxMutation.isPending || aiFeedback !== null}
            className="btn-primary w-full py-3"
          >
            {evaluateDDxMutation.isPending ? 'Evaluating...' : 'Submit DDx'}
          </button>

          {aiFeedback && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
              <h3 className="text-lg font-bold mb-2">AI Feedback:</h3>
              <ReactMarkdown>{aiFeedback}</ReactMarkdown>
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-6">
            <button onClick={handleResetGame} className="btn-neutral">New Scenario</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DDxGamePage;