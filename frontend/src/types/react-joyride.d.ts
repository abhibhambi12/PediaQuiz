// frontend/src/types/react-joyride.d.ts
declare module 'react-joyride' {
    import * as React from 'react';

    // Export STATUS directly from the module
    export const STATUS: {
        READY: string;
        WAITING: string;
        RUNNING: string;
        PAUSED: string;
        FINISHED: string;
        SKIPPED: string;
        [key: string]: string; // Allow for other potential statuses
    };

    // Define Step interface for individual tour steps
    export interface Step {
        target: string | HTMLElement; // CSS selector or DOM element
        content: React.ReactNode;
        placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end' | 'right' | 'right-start' | 'right-end' | 'auto' | 'center';
        disableBeacon?: boolean; // If true, the beacon will not be rendered.
        styles?: object; // Custom styles for this step
        disableOverlay?: boolean; // If true, the overlay is not rendered.
        hideCloseButton?: boolean; // If true, the close button is not rendered.
        hideFooter?: boolean; // If true, the footer is not rendered.
        locale?: { // Localization options
            back?: string;
            close?: string;
            last?: string;
            next?: string;
            skip?: string;
        };
        offset?: number; // Offset of the tooltip from the target
        placementBeacon?: 'top' | 'bottom' | 'left' | 'right'; // Placement of the beacon relative to the target
        spotlightPadding?: number; // Padding around the spotlight area
        // Allows for additional custom properties on the step object
        [key: string]: any;
    }

    // Define CallBackProps interface for the callback function argument
    export interface CallBackProps {
        action: string; // The action that caused the callback (e.g., 'next', 'back', 'skip', 'close', 'start', 'stop')
        controlled: boolean; // If the tour is being controlled by the parent component
        index: number; // The current step's index
        lifecycle: string; // The lifecycle state (e.g., 'beacon', 'tooltip', 'complete')
        size: number; // Total number of steps
        status: string; // The current status of the tour (e.g., 'running', 'paused', 'finished', 'skipped')
        type: string; // The type of event (e.g., 'step:after', 'tour:end')
        // Allows for additional custom properties on the callback data
        [key: string]: any;
    }

    // Define main Props interface for the Joyride component
    export interface Props {
        steps: Step[]; // Array of tour steps
        run?: boolean; // If true, the tour starts or resumes.
        continuous?: boolean; // If true, the tour does not stop at the last step.
        showProgress?: boolean; // If true, shows progress (e.g., "1/5") in the tooltip.
        showSkipButton?: boolean; // If true, shows a "Skip" button in the tooltip.
        callback?: (data: CallBackProps) => void; // Callback function for tour events.
        styles?: object; // Global custom styles for the tour.
        disableCloseOnEsc?: boolean; // If true, tour cannot be closed with ESC key.
        disableOverlay?: boolean; // If true, the overlay is not rendered.
        disableOverlayClose?: boolean; // If true, clicking the overlay does not close the tour.
        disableScrollParentFix?: boolean; // If true, disable scroll to parent fix.
        disableScrolling?: boolean; // If true, scrolling is disabled.
        hideBackButton?: boolean; // If true, the "Back" button is hidden.
        locale?: { // Global localization options
            back?: string;
            close?: string;
            last?: string;
            next?: string;
            skip?: string;
        };
        scrollOffset?: number; // Offset for scrolling to the target element.
        spotlightClicks?: boolean; // If true, allow clicks inside the spotlight.
        tooltipComponent?: React.ComponentType<any>; // Custom tooltip component.
        // Allows for additional custom properties on the component props
        [key: string]: any;
    }

    // Declare the default export as a React Functional Component
    const Joyride: React.FC<Props>;
    export default Joyride;
}