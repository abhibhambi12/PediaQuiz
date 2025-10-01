declare module 'react-joyride' {
    import * as React from 'react';

    export const STATUS: {
        READY: string;
        RUNNING: string;
        PAUSED: string;
        FINISHED: string;
        SKIPPED: string;
        ERROR: string;
    };

    export interface Step {
        target: string | HTMLElement;
        content: React.ReactNode;
        placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end' | 'right' | 'right-start' | 'right-end' | 'auto' | 'center';
        disableBeacon?: boolean;
        styles?: object;
        [key: string]: any;
    }

    export interface CallBackProps {
        action: string;
        index: number;
        lifecycle: string;
        size: number;
        status: string;
        type: string;
        [key: string]: any;
    }

    export interface Props {
        steps: Step[];
        run?: boolean;
        continuous?: boolean;
        showProgress?: boolean;
        showSkipButton?: boolean;
        callback?: (data: CallBackProps) => void;
        styles?: object;
        [key: string]: any;
    }

    const Joyride: React.FC<Props>;
    export default Joyride;
}