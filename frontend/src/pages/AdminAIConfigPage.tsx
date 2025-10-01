    import React, { useState, useEffect } from 'react';
    import { useAuth } from '@/contexts/AuthContext';
    import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
    import { updateAIConfig, getAIConfig } from '@/services/apiService';
    import Loader from '@/components/Loader';
    import { useToast } from '@/components/Toast';
    import type { AIConfig } from '@pediaquiz/types';
    
    // Updated the list of available models to the correct new versions
    const ALLOWED_AI_MODELS = [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash-001",
        "gemini-2.0-flash-lite-001"
    ];
    
    const AdminAIConfigPage: React.FC = () => {
        const { user } = useAuth();
        const { addToast } = useToast();
        const queryClient = useQueryClient();
    
        const { data: aiConfig, isLoading } = useQuery({ queryKey: ['aiConfig'], queryFn: async () => (await getAIConfig()).data, enabled: !!user?.isAdmin });
        const [config, setConfig] = useState<AIConfig | null>(null);
    
        useEffect(() => { if (aiConfig) setConfig(aiConfig); }, [aiConfig]);
    
        const mutation = useMutation({
            mutationFn: (newConfig: AIConfig) => updateAIConfig(newConfig),
            onSuccess: () => { addToast("AI config updated!", "success"); queryClient.invalidateQueries({ queryKey: ['aiConfig'] }); },
            onError: (err: any) => addToast(`Update failed: ${err.message}`, "error"),
        });
    
        const handleSave = (e: React.FormEvent) => {
            e.preventDefault();
            if (config) mutation.mutate(config);
        };
    
        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const { name, value } = e.target;
            setConfig(prev => prev ? { ...prev, [name]: name === 'temperature' || name === 'maxOutputTokens' ? Number(value) : value } : null);
        };
    
        if (isLoading) return <Loader fullScreen message="Loading AI configuration..." />;
        if (!config) return <div className="p-6 text-center">Could not load configuration.</div>;
    
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">AI Configuration</h1>
                <form onSubmit={handleSave} className="card-base p-6 space-y-4">
                    <div><label htmlFor="powerfulModel" className="block text-sm font-medium">Powerful Model</label><select id="powerfulModel" name="powerfulModel" className="input-field mt-1" value={config.powerfulModel} onChange={handleInputChange}>{ALLOWED_AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label htmlFor="quickModel" className="block text-sm font-medium">Quick Model</label><select id="quickModel" name="quickModel" className="input-field mt-1" value={config.quickModel} onChange={handleInputChange}>{ALLOWED_AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label htmlFor="temperature" className="block text-sm font-medium">Temperature (0.0-1.0)</label><input type="number" id="temperature" name="temperature" step="0.1" min="0" max="1" className="input-field mt-1" value={config.temperature} onChange={handleInputChange} /></div>
                    <div><label htmlFor="maxOutputTokens" className="block text-sm font-medium">Max Output Tokens</label><input type="number" id="maxOutputTokens" name="maxOutputTokens" min="1" max="8192" className="input-field mt-1" value={config.maxOutputTokens} onChange={handleInputChange} /></div>
                    <button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Configuration'}</button>
                </form>
            </div>
        );
    };
    export default AdminAIConfigPage;