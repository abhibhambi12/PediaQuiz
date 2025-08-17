export const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

export const validatePrompt = (prompt: string): boolean => {
    return prompt.length > 0 && prompt.length <= 1000;
};