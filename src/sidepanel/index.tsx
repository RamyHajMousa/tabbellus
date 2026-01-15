import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';

const SidePanel = () => {
    return (
        <div className="h-screen w-full p-4 bg-background text-foreground flex flex-col">
            <h1 className="text-lg font-bold mb-4">Spaces</h1>
            <div className="flex-1 overflow-auto">
                {/* Tab Tree will go here */}
                <p className="text-sm text-muted-foreground">No spaces created yet.</p>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <SidePanel />
    </React.StrictMode>
);
