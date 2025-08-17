import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export const generateContent = async (prompt: string): Promise<string> => {
    const generate = httpsCallable(functions, 'generateContent');
    const result = await generate({ prompt });
    return result.data as string;
};

export const sendMessageToAI = async (message: string): Promise<string> => {
    const chat = httpsCallable(functions, 'chatWithAI');
    const result = await chat({ message });
    return result.data as string;
};